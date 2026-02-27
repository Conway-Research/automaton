/**
 * Colony Messaging
 *
 * Typed inter-agent messaging with pluggable transport.
 * Uses local SQLite message queues by default (no external relay required).
 * Transport can be swapped to social relay when backend becomes available.
 */

import type { AutomatonDatabase, InboxMessage } from "../types.js";
import { insertEvent } from "../state/database.js";
import { createLogger } from "../observability/logger.js";
import { ulid } from "ulid";
import type BetterSqlite3 from "better-sqlite3";

const logger = createLogger("orchestration.messaging");

const MAX_INBOX_BATCH = 200;
const SEND_RETRIES = 3;
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000] as const;

const MESSAGE_TYPES = [
  "task_assignment",
  "task_result",
  "status_report",
  "resource_request",
  "knowledge_share",
  "customer_request",
  "alert",
  "shutdown_request",
  "peer_query",
  "peer_response",
] as const;

const PRIORITY_ORDER = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
} as const;

// ─── Types ──────────────────────────────────────────────────────

export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string;
  goalId: string | null;
  taskId: string | null;
  content: string;
  priority: "low" | "normal" | "high" | "critical";
  requiresResponse: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface ProcessedMessage {
  message: AgentMessage;
  handledBy: string;
  success: boolean;
  error?: string;
}

interface MessageEnvelope {
  protocol: "colony_message_v1";
  sentAt: string;
  message: AgentMessage;
}

interface PendingInboxMessage {
  inboxId: string;
  message: AgentMessage;
}

// ─── Transport Interface ────────────────────────────────────────

/**
 * Pluggable message transport. Implementations handle the actual
 * delivery mechanism. The default LocalDBTransport writes directly
 * to SQLite inbox tables.
 */
export interface MessageTransport {
  /** Deliver a message to the recipient. */
  deliver(to: string, envelope: string): Promise<void>;
  /** List known recipient addresses (for broadcast). */
  getRecipients(): string[];
}

/**
 * Local SQLite-based transport.
 * Writes messages directly to the inbox_messages table in the local DB.
 * Works for parent↔child communication on the same machine.
 * No external relay server required.
 */
export class LocalDBTransport implements MessageTransport {
  constructor(
    private readonly db: AutomatonDatabase,
  ) {}

  async deliver(to: string, envelope: string): Promise<void> {
    // Write directly to inbox_messages table
    const id = ulid();
    const fromAddress = this.db.getIdentity("address") ?? "unknown";
    this.db.raw.prepare(
      `INSERT INTO inbox_messages (id, from_address, to_address, content, received_at, status)
       VALUES (?, ?, ?, ?, datetime('now'), 'received')`,
    ).run(id, fromAddress, to, envelope);
  }

  getRecipients(): string[] {
    const children = this.db.getChildren();
    return children.map((c) => c.address);
  }
}

// ─── Colony Messaging ───────────────────────────────────────────

export class ColonyMessaging {
  constructor(
    private readonly transport: MessageTransport,
    private readonly db: AutomatonDatabase,
  ) {}

  async send(message: AgentMessage): Promise<void> {
    validateMessage(message);

    const envelope: MessageEnvelope = {
      protocol: "colony_message_v1",
      sentAt: new Date().toISOString(),
      message,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= SEND_RETRIES; attempt += 1) {
      try {
        await this.transport.deliver(message.to, JSON.stringify(envelope));
        this.logActionEvent("message_sent", message);
        return;
      } catch (error) {
        lastError = normalizeError(error);
        const isFinalAttempt = attempt === SEND_RETRIES;
        logger.warn("Message send attempt failed", {
          messageId: message.id,
          to: message.to,
          attempt: attempt + 1,
          isFinalAttempt,
          error: lastError.message,
        });

        if (isFinalAttempt) break;
        await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
      }
    }

    throw new Error(
      `Failed to send message ${message.id} after ${SEND_RETRIES + 1} attempts: ${lastError?.message ?? "unknown error"}`,
    );
  }

  async processInbox(): Promise<ProcessedMessage[]> {
    const inbox = this.db.getUnprocessedInboxMessages(MAX_INBOX_BATCH);
    const pending: PendingInboxMessage[] = [];
    const processed: ProcessedMessage[] = [];

    for (const row of inbox) {
      try {
        const message = parseInboundMessage(row);
        pending.push({ inboxId: row.id, message });
      } catch (error) {
        const err = normalizeError(error);
        const rejected = createRejectedMessage(row);
        this.db.markInboxMessageProcessed(row.id);
        processed.push({
          message: rejected,
          handledBy: "rejectMalformedMessage",
          success: false,
          error: err.message,
        });
        logger.warn("Rejected malformed inbound message", {
          inboxId: row.id,
          from: row.from,
          error: err.message,
        });
      }
    }

    // Process critical priority first
    pending.sort((a, b) => {
      const priorityDelta = PRIORITY_ORDER[a.message.priority] - PRIORITY_ORDER[b.message.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return a.message.createdAt.localeCompare(b.message.createdAt);
    });

    for (const item of pending) {
      let handledBy = "unknown";
      try {
        handledBy = await this.routeMessage(item.message);
        processed.push({
          message: item.message,
          handledBy,
          success: true,
        });
      } catch (error) {
        const err = normalizeError(error);
        processed.push({
          message: item.message,
          handledBy,
          success: false,
          error: err.message,
        });
        logger.error("Failed to handle inbox message", err, {
          messageId: item.message.id,
          type: item.message.type,
          from: item.message.from,
          to: item.message.to,
        });
      } finally {
        this.db.markInboxMessageProcessed(item.inboxId);
      }
    }

    return processed;
  }

  async broadcast(content: string, priority: "high" | "critical"): Promise<void> {
    const recipients = this.transport.getRecipients();
    if (recipients.length === 0) return;

    const fromAddress = this.db.getIdentity("address") ?? "unknown";
    const createdAt = new Date().toISOString();

    await Promise.all(recipients.map((to) =>
      this.send({
        id: ulid(),
        type: "alert",
        from: fromAddress,
        to,
        goalId: null,
        taskId: null,
        content,
        priority,
        requiresResponse: false,
        expiresAt: null,
        createdAt,
      }),
    ));
  }

  /** Create a pre-filled message for sending. */
  createMessage(params: {
    type: MessageType;
    to: string;
    content: string;
    goalId?: string;
    taskId?: string;
    priority?: AgentMessage["priority"];
    requiresResponse?: boolean;
    expiresAt?: string;
  }): AgentMessage {
    const fromAddress = this.db.getIdentity("address") ?? "unknown";
    return {
      id: ulid(),
      type: params.type,
      from: fromAddress,
      to: params.to,
      goalId: params.goalId ?? null,
      taskId: params.taskId ?? null,
      content: params.content,
      priority: params.priority ?? "normal",
      requiresResponse: params.requiresResponse ?? false,
      expiresAt: params.expiresAt ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  private async routeMessage(message: AgentMessage): Promise<string> {
    switch (message.type) {
      case "task_assignment":
        await this.handleTaskAssignment(message);
        return "handleTaskAssignment";
      case "task_result":
        await this.handleTaskResult(message);
        return "handleTaskResult";
      case "status_report":
        await this.handleStatusReport(message);
        return "handleStatusReport";
      case "resource_request":
        await this.handleResourceRequest(message);
        return "handleResourceRequest";
      case "knowledge_share":
        await this.handleKnowledgeShare(message);
        return "handleKnowledgeShare";
      case "customer_request":
        await this.handleCustomerRequest(message);
        return "handleCustomerRequest";
      case "alert":
        await this.handleAlert(message);
        return "handleAlert";
      case "shutdown_request":
        await this.handleShutdownRequest(message);
        return "handleShutdownRequest";
      case "peer_query":
        await this.handlePeerQuery(message);
        return "handlePeerQuery";
      case "peer_response":
        await this.handlePeerResponse(message);
        return "handlePeerResponse";
      default:
        throw new Error(`unsupported message type: ${message.type satisfies never}`);
    }
  }

  // ─── Message Handlers (stubs — orchestrator wires real logic) ──

  private async handleTaskAssignment(message: AgentMessage): Promise<void> {
    this.logActionEvent("task_assignment_received", message);
  }

  private async handleTaskResult(message: AgentMessage): Promise<void> {
    this.logActionEvent("task_result_received", message);
  }

  private async handleStatusReport(message: AgentMessage): Promise<void> {
    this.logActionEvent("status_report_received", message);
  }

  private async handleResourceRequest(message: AgentMessage): Promise<void> {
    this.logActionEvent("resource_request_received", message);
  }

  private async handleKnowledgeShare(message: AgentMessage): Promise<void> {
    this.logActionEvent("knowledge_share_received", message);
  }

  private async handleCustomerRequest(message: AgentMessage): Promise<void> {
    this.logActionEvent("customer_request_received", message);
  }

  private async handleAlert(message: AgentMessage): Promise<void> {
    logger.warn("Alert received", {
      messageId: message.id,
      from: message.from,
      priority: message.priority,
    });
    this.logActionEvent("alert_received", message);
  }

  private async handleShutdownRequest(message: AgentMessage): Promise<void> {
    logger.warn("Shutdown request received", {
      messageId: message.id,
      from: message.from,
    });
    this.logActionEvent("shutdown_request_received", message);
  }

  private async handlePeerQuery(message: AgentMessage): Promise<void> {
    this.logActionEvent("peer_query_received", message);
  }

  private async handlePeerResponse(message: AgentMessage): Promise<void> {
    this.logActionEvent("peer_response_received", message);
  }

  private logActionEvent(action: string, message: AgentMessage): void {
    try {
      insertEvent(this.db.raw, {
        type: "action",
        agentAddress: message.from,
        goalId: message.goalId,
        taskId: message.taskId,
        content: JSON.stringify({
          action,
          messageId: message.id,
          messageType: message.type,
          to: message.to,
          priority: message.priority,
        }),
        tokenCount: Math.ceil(message.content.length / 4),
      });
    } catch (error) {
      logger.warn("Failed to write action event for message", {
        messageId: message.id,
        error: normalizeError(error).message,
      });
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function extractAgentMessage(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("parsed payload must be an object");
  }

  const maybeEnvelope = parsed as Partial<MessageEnvelope>;
  if (maybeEnvelope.protocol === "colony_message_v1" && maybeEnvelope.message) {
    return maybeEnvelope.message;
  }

  return parsed;
}

function parseInboundMessage(row: InboxMessage): AgentMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.content);
  } catch {
    throw new Error("inbox content is not valid JSON");
  }

  const candidate = extractAgentMessage(parsed);
  validateMessage(candidate);

  const msg = candidate as AgentMessage;
  if (msg.expiresAt && Date.parse(msg.expiresAt) < Date.now()) {
    throw new Error("message is expired");
  }

  return msg;
}

function validateMessage(message: unknown): asserts message is AgentMessage {
  if (!message || typeof message !== "object") {
    throw new Error("message must be an object");
  }

  const value = message as Partial<AgentMessage>;

  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error("message.id is required");
  }
  if (!isMessageType(value.type)) {
    throw new Error(`invalid message.type: ${String(value.type)}`);
  }
  if (typeof value.from !== "string" || value.from.length === 0) {
    throw new Error("message.from is required");
  }
  if (typeof value.to !== "string" || value.to.length === 0) {
    throw new Error("message.to is required");
  }
  if (typeof value.content !== "string") {
    throw new Error("message.content must be string");
  }
  if (!isPriority(value.priority)) {
    throw new Error(`invalid message.priority: ${String(value.priority)}`);
  }
  if (typeof value.requiresResponse !== "boolean") {
    throw new Error("message.requiresResponse must be boolean");
  }
  if (typeof value.createdAt !== "string" || !isIsoDate(value.createdAt)) {
    throw new Error("message.createdAt must be an ISO date string");
  }
}

function createRejectedMessage(row: InboxMessage): AgentMessage {
  return {
    id: ulid(),
    type: "alert",
    from: row.from,
    to: row.to,
    goalId: null,
    taskId: null,
    content: row.content,
    priority: "high",
    requiresResponse: false,
    expiresAt: null,
    createdAt: row.createdAt,
  };
}

function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && (MESSAGE_TYPES as readonly string[]).includes(value);
}

function isPriority(value: unknown): value is "low" | "normal" | "high" | "critical" {
  return value === "low" || value === "normal" || value === "high" || value === "critical";
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return !Number.isNaN(Date.parse(value));
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
