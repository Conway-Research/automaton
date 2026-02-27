import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ColonyMessaging,
  LocalDBTransport,
  type AgentMessage,
  type MessageTransport,
  type MessageType,
} from "../../orchestration/messaging.js";
import type { AutomatonDatabase, ChildAutomaton, InboxMessage } from "../../types.js";
import { createInMemoryDb } from "./test-db.js";

function createTestDb(options?: { address?: string; recipients?: string[] }): {
  raw: BetterSqlite3.Database;
  db: AutomatonDatabase;
} {
  const raw = createInMemoryDb();

  raw.exec("ALTER TABLE inbox_messages ADD COLUMN to_address TEXT;");
  raw.exec("ALTER TABLE inbox_messages ADD COLUMN raw_content TEXT;");
  raw.exec("ALTER TABLE inbox_messages ADD COLUMN status TEXT DEFAULT 'received';");
  raw.exec("ALTER TABLE inbox_messages ADD COLUMN retry_count INTEGER DEFAULT 0;");
  raw.exec("ALTER TABLE inbox_messages ADD COLUMN max_retries INTEGER DEFAULT 3;");

  const address = options?.address ?? "0xself";
  const recipients = options?.recipients ?? [];

  const getUnprocessedInboxMessages = (limit: number): InboxMessage[] => {
    const rows = raw.prepare(
      "SELECT * FROM inbox_messages WHERE processed_at IS NULL ORDER BY received_at ASC LIMIT ?",
    ).all(limit) as Array<{
      id: string;
      from_address: string;
      to_address: string | null;
      content: string;
      received_at: string;
      reply_to: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      from: row.from_address,
      to: row.to_address ?? "",
      content: row.content,
      signedAt: row.received_at,
      createdAt: row.received_at,
      replyTo: row.reply_to ?? undefined,
    }));
  };

  const children: ChildAutomaton[] = recipients.map((entry, index) => ({
    id: `child-${index}`,
    name: `Child ${index}`,
    address: entry as `0x${string}`,
    sandboxId: `sandbox-${index}`,
    genesisPrompt: "test",
    creatorMessage: "test",
    fundedAmountCents: 0,
    status: "running",
    createdAt: new Date().toISOString(),
  }));

  const db = {
    raw,
    getIdentity: (key: string) => (key === "address" ? address : undefined),
    getChildren: () => children,
    getUnprocessedInboxMessages,
    markInboxMessageProcessed: (id: string) => {
      raw.prepare("UPDATE inbox_messages SET processed_at = datetime('now') WHERE id = ?").run(id);
    },
  } as unknown as AutomatonDatabase;

  return { raw, db };
}

function insertInbox(raw: BetterSqlite3.Database, params: {
  id: string;
  from: string;
  to?: string;
  content: string;
  receivedAt?: string;
}): void {
  raw.prepare(
    `INSERT INTO inbox_messages
     (id, from_address, to_address, content, received_at, status, retry_count, max_retries)
     VALUES (?, ?, ?, ?, ?, 'received', 0, 3)`,
  ).run(
    params.id,
    params.from,
    params.to ?? "0xself",
    params.content,
    params.receivedAt ?? new Date().toISOString(),
  );
}

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: overrides.id ?? "msg-1",
    type: overrides.type ?? "alert",
    from: overrides.from ?? "0xsender",
    to: overrides.to ?? "0xreceiver",
    goalId: overrides.goalId ?? null,
    taskId: overrides.taskId ?? null,
    content: overrides.content ?? "payload",
    priority: overrides.priority ?? "normal",
    requiresResponse: overrides.requiresResponse ?? false,
    expiresAt: overrides.expiresAt ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("orchestration/messaging", () => {
  let raw: BetterSqlite3.Database;

  afterEach(() => {
    vi.useRealTimers();
    if (raw && raw.open) {
      raw.close();
    }
  });

  describe("LocalDBTransport", () => {
    it("deliver writes to inbox_messages", async () => {
      const ctx = createTestDb({ address: "0xorigin" });
      raw = ctx.raw;
      const transport = new LocalDBTransport(ctx.db);

      await transport.deliver("0xtarget", "{\"hello\":\"world\"}");

      const row = raw.prepare(
        "SELECT from_address, to_address, content, status FROM inbox_messages LIMIT 1",
      ).get() as { from_address: string; to_address: string; content: string; status: string } | undefined;

      expect(row).toBeDefined();
      expect(row?.from_address).toBe("0xorigin");
      expect(row?.to_address).toBe("0xtarget");
      expect(row?.content).toBe('{"hello":"world"}');
      expect(row?.status).toBe("received");
    });

    it("getRecipients returns known child addresses", () => {
      const ctx = createTestDb({ recipients: ["0x1", "0x2"] });
      raw = ctx.raw;
      const transport = new LocalDBTransport(ctx.db);

      expect(transport.getRecipients()).toEqual(["0x1", "0x2"]);
    });
  });

  describe("ColonyMessaging.send", () => {
    it("sends successfully on first attempt", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const transport: MessageTransport = {
        deliver: vi.fn().mockResolvedValue(undefined),
        getRecipients: () => [],
      };

      const messaging = new ColonyMessaging(transport, ctx.db);
      await messaging.send(makeMessage());

      expect(transport.deliver).toHaveBeenCalledTimes(1);
      const events = raw.prepare("SELECT * FROM event_stream WHERE type = 'action'").all() as any[];
      expect(events).toHaveLength(1);
      expect(events[0].content).toContain("message_sent");
    });

    it("retries on transient transport failure", async () => {
      vi.useFakeTimers();
      const ctx = createTestDb();
      raw = ctx.raw;

      const transport: MessageTransport = {
        deliver: vi
          .fn<() => Promise<void>>()
          .mockRejectedValueOnce(new Error("first"))
          .mockRejectedValueOnce(new Error("second"))
          .mockResolvedValueOnce(undefined),
        getRecipients: () => [],
      };

      const messaging = new ColonyMessaging(transport, ctx.db);
      const promise = messaging.send(makeMessage({ id: "msg-retry" }));

      await vi.runAllTimersAsync();
      await promise;

      expect(transport.deliver).toHaveBeenCalledTimes(3);
    });

    it("throws after retries are exhausted", async () => {
      vi.useFakeTimers();
      const ctx = createTestDb();
      raw = ctx.raw;

      const transport: MessageTransport = {
        deliver: vi.fn().mockRejectedValue(new Error("always fails")),
        getRecipients: () => [],
      };

      const messaging = new ColonyMessaging(transport, ctx.db);
      const promise = messaging.send(makeMessage({ id: "msg-fail" }));
      const rejection = expect(promise).rejects.toThrow(
        "Failed to send message msg-fail after 4 attempts",
      );

      await vi.runAllTimersAsync();
      await rejection;
      expect(transport.deliver).toHaveBeenCalledTimes(4);
    });

    it("rejects malformed outbound message", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;

      const transport: MessageTransport = {
        deliver: vi.fn().mockResolvedValue(undefined),
        getRecipients: () => [],
      };

      const messaging = new ColonyMessaging(transport, ctx.db);

      await expect(messaging.send({ ...makeMessage(), id: "" })).rejects.toThrow("message.id is required");
      expect(transport.deliver).not.toHaveBeenCalled();
    });
  });

  describe("ColonyMessaging.processInbox", () => {
    it.each<[MessageType, string]>([
      ["task_assignment", "handleTaskAssignment"],
      ["task_result", "handleTaskResult"],
      ["status_report", "handleStatusReport"],
      ["resource_request", "handleResourceRequest"],
      ["knowledge_share", "handleKnowledgeShare"],
      ["customer_request", "handleCustomerRequest"],
      ["alert", "handleAlert"],
      ["shutdown_request", "handleShutdownRequest"],
      ["peer_query", "handlePeerQuery"],
      ["peer_response", "handlePeerResponse"],
    ])("routes %s messages", async (type, handler) => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      insertInbox(raw, {
        id: `inbox-${type}`,
        from: "0xfrom",
        content: JSON.stringify(makeMessage({ id: `m-${type}`, type })),
      });

      const processed = await messaging.processInbox();
      expect(processed).toHaveLength(1);
      expect(processed[0].success).toBe(true);
      expect(processed[0].handledBy).toBe(handler);
    });

    it("parses envelope payloads", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      const message = makeMessage({ id: "enveloped", type: "alert", priority: "high" });
      insertInbox(raw, {
        id: "inbox-envelope",
        from: "0xfrom",
        content: JSON.stringify({
          protocol: "colony_message_v1",
          sentAt: "2026-01-01T00:00:00.000Z",
          message,
        }),
      });

      const processed = await messaging.processInbox();
      expect(processed[0].message.id).toBe("enveloped");
      expect(processed[0].success).toBe(true);
    });

    it("orders processing by priority (critical first)", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      insertInbox(raw, {
        id: "inbox-low",
        from: "0xfrom",
        content: JSON.stringify(makeMessage({ id: "low", priority: "low", createdAt: "2026-01-01T00:00:00.000Z" })),
      });
      insertInbox(raw, {
        id: "inbox-critical",
        from: "0xfrom",
        content: JSON.stringify(makeMessage({ id: "critical", priority: "critical", createdAt: "2026-01-01T01:00:00.000Z" })),
      });

      const processed = await messaging.processInbox();
      expect(processed.map((entry) => entry.message.id)).toEqual(["critical", "low"]);
    });

    it("uses createdAt as tiebreaker for same priority", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      insertInbox(raw, {
        id: "inbox-late",
        from: "0xfrom",
        content: JSON.stringify(makeMessage({ id: "late", priority: "high", createdAt: "2026-01-01T02:00:00.000Z" })),
      });
      insertInbox(raw, {
        id: "inbox-early",
        from: "0xfrom",
        content: JSON.stringify(makeMessage({ id: "early", priority: "high", createdAt: "2026-01-01T01:00:00.000Z" })),
      });

      const processed = await messaging.processInbox();
      expect(processed.map((entry) => entry.message.id)).toEqual(["early", "late"]);
    });

    it("rejects malformed JSON", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      insertInbox(raw, { id: "bad-json", from: "0xfrom", content: "{not-json}" });
      const processed = await messaging.processInbox();

      expect(processed).toHaveLength(1);
      expect(processed[0].success).toBe(false);
      expect(processed[0].handledBy).toBe("rejectMalformedMessage");
      expect(processed[0].error).toContain("valid JSON");
    });

    it("rejects invalid message shapes", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      insertInbox(raw, {
        id: "bad-shape",
        from: "0xfrom",
        content: JSON.stringify({ id: "x", type: "alert", from: "a", to: "b", content: "x", priority: "urgent" }),
      });

      const processed = await messaging.processInbox();
      expect(processed[0].success).toBe(false);
      expect(processed[0].error).toContain("invalid message.priority");
    });

    it("rejects expired messages", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      insertInbox(raw, {
        id: "expired",
        from: "0xfrom",
        content: JSON.stringify(makeMessage({
          id: "expired-msg",
          expiresAt: "2000-01-01T00:00:00.000Z",
        })),
      });

      const processed = await messaging.processInbox();
      expect(processed[0].success).toBe(false);
      expect(processed[0].error).toContain("expired");
    });

    it("marks inbox rows processed even when malformed", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      insertInbox(raw, { id: "m1", from: "0xfrom", content: "not-json" });
      await messaging.processInbox();

      const row = raw.prepare("SELECT processed_at FROM inbox_messages WHERE id = 'm1'").get() as {
        processed_at: string | null;
      };

      expect(row.processed_at).not.toBeNull();
    });

    it("records handler failure and continues", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      (messaging as any).handleAlert = vi.fn().mockRejectedValue(new Error("handler broke"));

      insertInbox(raw, {
        id: "m-alert",
        from: "0xfrom",
        content: JSON.stringify(makeMessage({ id: "msg-alert", type: "alert" })),
      });

      const processed = await messaging.processInbox();
      expect(processed[0].success).toBe(false);
      expect(processed[0].error).toContain("handler broke");

      const row = raw.prepare("SELECT processed_at FROM inbox_messages WHERE id = 'm-alert'").get() as {
        processed_at: string | null;
      };
      expect(row.processed_at).not.toBeNull();
    });
  });

  describe("broadcast and message construction", () => {
    it("broadcast sends to all recipients", async () => {
      const ctx = createTestDb({ recipients: ["0xa", "0xb", "0xc"], address: "0xself" });
      raw = ctx.raw;

      const transport: MessageTransport = {
        deliver: vi.fn().mockResolvedValue(undefined),
        getRecipients: () => ["0xa", "0xb", "0xc"],
      };

      const messaging = new ColonyMessaging(transport, ctx.db);
      await messaging.broadcast("critical notice", "critical");

      expect(transport.deliver).toHaveBeenCalledTimes(3);
      const envelopes = (transport.deliver as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => JSON.parse(call[1]) as { message: AgentMessage });

      expect(envelopes.map((entry) => entry.message.to).sort()).toEqual(["0xa", "0xb", "0xc"]);
      expect(envelopes.every((entry) => entry.message.type === "alert")).toBe(true);
      expect(envelopes.every((entry) => entry.message.priority === "critical")).toBe(true);
    });

    it("broadcast is a no-op when there are no recipients", async () => {
      const ctx = createTestDb();
      raw = ctx.raw;
      const transport: MessageTransport = {
        deliver: vi.fn().mockResolvedValue(undefined),
        getRecipients: () => [],
      };

      const messaging = new ColonyMessaging(transport, ctx.db);
      await messaging.broadcast("notice", "high");
      expect(transport.deliver).not.toHaveBeenCalled();
    });

    it("createMessage fills defaults", () => {
      const ctx = createTestDb({ address: "0xcreator" });
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      const msg = messaging.createMessage({
        type: "peer_query",
        to: "0xtarget",
        content: "question",
      });

      expect(msg.from).toBe("0xcreator");
      expect(msg.goalId).toBeNull();
      expect(msg.taskId).toBeNull();
      expect(msg.priority).toBe("normal");
      expect(msg.requiresResponse).toBe(false);
      expect(msg.expiresAt).toBeNull();
    });

    it("createMessage respects explicit overrides", () => {
      const ctx = createTestDb({ address: "0xcreator" });
      raw = ctx.raw;
      const messaging = new ColonyMessaging({ deliver: vi.fn(), getRecipients: () => [] }, ctx.db);

      const msg = messaging.createMessage({
        type: "resource_request",
        to: "0xtarget",
        content: "need resource",
        goalId: "goal-1",
        taskId: "task-1",
        priority: "high",
        requiresResponse: true,
        expiresAt: "2026-12-31T00:00:00.000Z",
      });

      expect(msg.goalId).toBe("goal-1");
      expect(msg.taskId).toBe("task-1");
      expect(msg.priority).toBe("high");
      expect(msg.requiresResponse).toBe(true);
      expect(msg.expiresAt).toBe("2026-12-31T00:00:00.000Z");
    });
  });
});
