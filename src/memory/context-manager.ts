/**
 * Context Window Manager
 *
 * Model-aware context assembly with token-budget enforcement.
 */

import { getEncoding, type Tiktoken } from "js-tiktoken";
import type { ChatMessage } from "../types.js";

const MAX_TOKEN_CACHE_SIZE = 10_000;
const DEFAULT_RESERVE_TOKENS = 4_096;
const COMPRESSION_HEADROOM_RATIO = 0.1;
const MAX_EVENT_CONTENT_CHARS = 220;
const MAX_TOOL_RESULT_CHARS = 10_000;

export interface ContextBudget {
  totalTokens: number;
  reserveTokens: number;
  systemPromptTokens: number;
  todoTokens: number;
  memoryTokens: number;
  eventTokens: number;
  turnTokens: number;
  compressionHeadroom: number;
}

export interface TokenCounter {
  countTokens(text: string, model?: string): number;
  cache: Map<string, number>;
  countBatch(texts: string[]): number[];
}

export interface ContextUtilization {
  totalTokens: number;
  usedTokens: number;
  utilizationPercent: number;
  turnsInContext: number;
  compressedTurns: number;
  compressionRatio: number;
  headroomTokens: number;
  recommendation: "ok" | "compress" | "emergency";
}

export interface AssembledContext {
  messages: ChatMessage[];
  utilization: ContextUtilization;
  budget: ContextBudget;
}

export interface ContextAssemblyParams {
  systemPrompt: string;
  todoMd?: string;
  recentTurns: any[];
  taskSpec?: string;
  memories?: string;
  events?: any[];
  modelContextWindow: number;
  reserveTokens?: number;
}

export type EventType =
  | "user_input"
  | "plan_created"
  | "plan_updated"
  | "task_assigned"
  | "task_completed"
  | "task_failed"
  | "action"
  | "observation"
  | "inference"
  | "financial"
  | "agent_spawned"
  | "agent_died"
  | "knowledge"
  | "market_signal"
  | "revenue"
  | "error"
  | "reflection";

export interface StreamEvent {
  id: string;
  type: EventType | string;
  agentAddress: string;
  goalId: string | null;
  taskId: string | null;
  content: string;
  tokenCount: number;
  compactedTo: string | null;
  createdAt: string;
}

export interface CompactedEventReference {
  id: string;
  type: string;
  createdAt: string;
  goalId: string | null;
  taskId: string | null;
  reference: string;
  originalTokens: number;
  compactedTokens: number;
}

export interface CompactedContext {
  events: CompactedEventReference[];
  originalTokens: number;
  compactedTokens: number;
  compressionRatio: number;
}

interface RenderedBundle {
  messages: ChatMessage[];
  tokens: number;
}

interface RenderedTurn extends RenderedBundle {
  turnIndex: number;
}

function enforceLruLimit(cache: Map<string, number>): void {
  if (cache.size <= MAX_TOKEN_CACHE_SIZE) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) {
    cache.delete(oldestKey);
  }
}

function formatCacheKey(text: string, model?: string): string {
  return `${model ?? "default"}::${text}`;
}

export function createTokenCounter(): TokenCounter {
  const cache = new Map<string, number>();
  let encoder: Tiktoken | null = null;

  try {
    encoder = getEncoding("cl100k_base");
  } catch {
    encoder = null;
  }

  const countTokens = (text: string, model?: string): number => {
    const normalizedText = text ?? "";
    const key = formatCacheKey(normalizedText, model);

    const cached = cache.get(key);
    if (cached !== undefined) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }

    let count: number;
    if (encoder) {
      try {
        count = encoder.encode(normalizedText).length;
      } catch {
        count = Math.ceil(normalizedText.length / 3.5);
      }
    } else {
      count = Math.ceil(normalizedText.length / 3.5);
    }

    cache.set(key, count);
    enforceLruLimit(cache);
    return count;
  };

  const countBatch = (texts: string[]): number[] =>
    texts.map((text) => countTokens(text));

  return {
    countTokens,
    cache,
    countBatch,
  };
}

export class ContextManager {
  private lastUtilization: ContextUtilization = {
    totalTokens: 0,
    usedTokens: 0,
    utilizationPercent: 0,
    turnsInContext: 0,
    compressedTurns: 0,
    compressionRatio: 1,
    headroomTokens: 0,
    recommendation: "ok",
  };

  constructor(private readonly tokenCounter: TokenCounter) {}

  assembleContext(params: ContextAssemblyParams): AssembledContext {
    const totalTokens = Math.max(0, Math.floor(params.modelContextWindow));
    const reserveTokens = Math.max(
      0,
      Math.floor(params.reserveTokens ?? DEFAULT_RESERVE_TOKENS),
    );
    const promptCapacity = Math.max(0, totalTokens - reserveTokens);
    const compressionHeadroom = Math.max(
      0,
      Math.floor(totalTokens * COMPRESSION_HEADROOM_RATIO),
    );

    const messages: ChatMessage[] = [];
    const recentTurnMessages: ChatMessage[] = [];
    const olderTurnMessages: ChatMessage[] = [];
    const eventMessages: ChatMessage[] = [];
    let usedTokens = 0;

    const systemPromptMessage: ChatMessage = {
      role: "system",
      content: params.systemPrompt,
    };
    const systemPromptTokens = this.countMessagesTokens([systemPromptMessage]);
    messages.push(systemPromptMessage);
    usedTokens += systemPromptTokens;

    let todoTokens = 0;
    if (params.todoMd && params.todoMd.trim().length > 0) {
      const todoMessage: ChatMessage = {
        role: "system",
        content: `## todo.md attention\n${params.todoMd.trim()}`,
      };
      todoTokens = this.countMessagesTokens([todoMessage]);
      messages.push(todoMessage);
      usedTokens += todoTokens;
    }

    const renderedTurns = (params.recentTurns ?? []).map((turn, index) =>
      this.renderTurn(turn, index),
    );
    const recentTurns = renderedTurns.slice(-3);
    const olderTurns = renderedTurns.slice(0, -3);

    let includedTurnCount = 0;
    let turnTokens = 0;

    for (const recentTurn of recentTurns) {
      recentTurnMessages.push(...recentTurn.messages);
      usedTokens += recentTurn.tokens;
      turnTokens += recentTurn.tokens;
      includedTurnCount += 1;
    }

    let memoryTokens = 0;

    if (params.taskSpec && params.taskSpec.trim().length > 0) {
      const taskMessage: ChatMessage = {
        role: "system",
        content: `## Current task specification\n${params.taskSpec.trim()}`,
      };
      const taskTokens = this.countMessagesTokens([taskMessage]);
      if (usedTokens + taskTokens <= promptCapacity) {
        messages.push(taskMessage);
        usedTokens += taskTokens;
      }
    }

    if (params.memories && params.memories.trim().length > 0) {
      const memoryMessage: ChatMessage = {
        role: "system",
        content: `## Retrieved memories\n${params.memories.trim()}`,
      };
      const candidateTokens = this.countMessagesTokens([memoryMessage]);
      if (usedTokens + candidateTokens <= promptCapacity) {
        messages.push(memoryMessage);
        usedTokens += candidateTokens;
        memoryTokens += candidateTokens;
      }
    }

    const selectedOlderTurns: RenderedTurn[] = [];
    for (let i = olderTurns.length - 1; i >= 0; i--) {
      const turn = olderTurns[i];
      if (usedTokens + turn.tokens > promptCapacity) break;
      selectedOlderTurns.push(turn);
      usedTokens += turn.tokens;
      turnTokens += turn.tokens;
      includedTurnCount += 1;
    }
    selectedOlderTurns.sort((a, b) => a.turnIndex - b.turnIndex);
    for (const selectedTurn of selectedOlderTurns) {
      olderTurnMessages.push(...selectedTurn.messages);
    }

    const renderedEvents = (params.events ?? []).map((event) =>
      this.renderEvent(event),
    );
    const selectedEvents: RenderedBundle[] = [];
    for (let i = renderedEvents.length - 1; i >= 0; i--) {
      const eventBundle = renderedEvents[i];
      if (usedTokens + eventBundle.tokens > promptCapacity) break;
      selectedEvents.push(eventBundle);
      usedTokens += eventBundle.tokens;
    }
    selectedEvents.reverse();

    let eventTokens = 0;
    for (const selectedEvent of selectedEvents) {
      eventMessages.push(...selectedEvent.messages);
      eventTokens += selectedEvent.tokens;
    }

    messages.push(...olderTurnMessages);
    messages.push(...recentTurnMessages);
    messages.push(...eventMessages);

    const totalTurns = renderedTurns.length;
    const compressedTurns = Math.max(0, totalTurns - includedTurnCount);
    const compressionRatio = totalTurns > 0
      ? Number((includedTurnCount / totalTurns).toFixed(3))
      : 1;

    const compressionTrigger = Math.max(0, promptCapacity - compressionHeadroom);
    const recommendation = usedTokens > promptCapacity
      ? "emergency"
      : usedTokens >= compressionTrigger
        ? "compress"
        : "ok";

    const utilization: ContextUtilization = {
      totalTokens,
      usedTokens,
      utilizationPercent: promptCapacity > 0
        ? Number(Math.min(100, (usedTokens / promptCapacity) * 100).toFixed(2))
        : usedTokens > 0 ? 100 : 0,
      turnsInContext: includedTurnCount,
      compressedTurns,
      compressionRatio,
      headroomTokens: Math.max(0, compressionTrigger - usedTokens),
      recommendation,
    };

    const budget: ContextBudget = {
      totalTokens,
      reserveTokens,
      systemPromptTokens,
      todoTokens,
      memoryTokens,
      eventTokens,
      turnTokens,
      compressionHeadroom,
    };

    this.lastUtilization = utilization;
    return { messages, utilization, budget };
  }

  getUtilization(): ContextUtilization {
    return this.lastUtilization;
  }

  compact(events: StreamEvent[]): CompactedContext {
    const compactedEvents: CompactedEventReference[] = events.map((event) => {
      const compactReference = this.buildEventReference(event);
      const compactedTokens = this.tokenCounter.countTokens(compactReference);
      const originalTokens = event.tokenCount > 0
        ? event.tokenCount
        : this.tokenCounter.countTokens(event.content ?? "");

      return {
        id: event.id,
        type: String(event.type),
        createdAt: event.createdAt,
        goalId: event.goalId ?? null,
        taskId: event.taskId ?? null,
        reference: compactReference,
        originalTokens,
        compactedTokens,
      };
    });

    const originalTokens = compactedEvents.reduce(
      (sum, entry) => sum + entry.originalTokens,
      0,
    );
    const compactedTokens = compactedEvents.reduce(
      (sum, entry) => sum + entry.compactedTokens,
      0,
    );

    return {
      events: compactedEvents,
      originalTokens,
      compactedTokens,
      compressionRatio: originalTokens > 0
        ? Number((compactedTokens / originalTokens).toFixed(3))
        : 1,
    };
  }

  private renderTurn(turn: any, turnIndex: number): RenderedTurn {
    const messages: ChatMessage[] = [];

    if (this.looksLikeChatMessage(turn)) {
      messages.push(turn);
    } else {
      if (typeof turn?.input === "string" && turn.input.length > 0) {
        const source = typeof turn.inputSource === "string"
          ? turn.inputSource
          : "system";
        messages.push({
          role: "user",
          content: `[${source}] ${turn.input}`,
        });
      }

      if (typeof turn?.thinking === "string" && turn.thinking.length > 0) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: turn.thinking,
        };

        if (Array.isArray(turn.toolCalls) && turn.toolCalls.length > 0) {
          assistantMessage.tool_calls = turn.toolCalls
            .filter((toolCall: any) => toolCall && typeof toolCall.id === "string")
            .map((toolCall: any) => ({
              id: toolCall.id,
              type: "function" as const,
              function: {
                name: String(toolCall.name ?? "unknown_tool"),
                arguments: JSON.stringify(toolCall.arguments ?? {}),
              },
            }));
        }

        messages.push(assistantMessage);
      }

      if (Array.isArray(turn?.toolCalls)) {
        for (const toolCall of turn.toolCalls) {
          if (!toolCall || typeof toolCall.id !== "string") continue;

          const rawResult = typeof toolCall.error === "string"
            ? `Error: ${toolCall.error}`
            : String(toolCall.result ?? "");
          const content = rawResult.length > MAX_TOOL_RESULT_CHARS
            ? `${rawResult.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n[TRUNCATED: ${rawResult.length - MAX_TOOL_RESULT_CHARS} characters omitted]`
            : rawResult;

          messages.push({
            role: "tool",
            content,
            tool_call_id: toolCall.id,
          });
        }
      }
    }

    if (messages.length === 0) {
      messages.push({
        role: "user",
        content: `[turn] ${this.sanitizeText(JSON.stringify(turn ?? {}), MAX_EVENT_CONTENT_CHARS)}`,
      });
    }

    return {
      turnIndex,
      messages,
      tokens: this.countMessagesTokens(messages),
    };
  }

  private renderEvent(event: any): RenderedBundle {
    const streamEvent = this.normalizeStreamEvent(event);
    const message: ChatMessage = {
      role: "user",
      content: `[event] ${this.buildEventReference(streamEvent)}`,
    };

    return {
      messages: [message],
      tokens: this.countMessagesTokens([message]),
    };
  }

  private normalizeStreamEvent(event: any): StreamEvent {
    const id = typeof event?.id === "string" ? event.id : "unknown";
    const type = typeof event?.type === "string" ? event.type : "observation";
    const createdAt = typeof event?.createdAt === "string"
      ? event.createdAt
      : new Date(0).toISOString();
    const content = typeof event?.content === "string"
      ? event.content
      : JSON.stringify(event?.content ?? {});

    return {
      id,
      type,
      agentAddress: typeof event?.agentAddress === "string" ? event.agentAddress : "unknown",
      goalId: typeof event?.goalId === "string" ? event.goalId : null,
      taskId: typeof event?.taskId === "string" ? event.taskId : null,
      content,
      tokenCount: typeof event?.tokenCount === "number" ? event.tokenCount : 0,
      compactedTo: typeof event?.compactedTo === "string" ? event.compactedTo : null,
      createdAt,
    };
  }

  private buildEventReference(event: StreamEvent): string {
    const compactContent = this.sanitizeText(event.content, MAX_EVENT_CONTENT_CHARS);
    return [
      `id=${event.id}`,
      `type=${event.type}`,
      `createdAt=${event.createdAt}`,
      `goal=${event.goalId ?? "-"}`,
      `task=${event.taskId ?? "-"}`,
      `content=${compactContent}`,
    ].join(" | ");
  }

  private sanitizeText(value: string, maxChars: number): string {
    const compact = value.replace(/\s+/g, " ").trim();
    if (compact.length <= maxChars) return compact;
    return `${compact.slice(0, maxChars)}...`;
  }

  private looksLikeChatMessage(value: any): value is ChatMessage {
    if (!value || typeof value !== "object") return false;
    if (typeof value.content !== "string") return false;
    if (typeof value.role !== "string") return false;
    return (
      value.role === "system" ||
      value.role === "user" ||
      value.role === "assistant" ||
      value.role === "tool"
    );
  }

  private countMessagesTokens(messages: ChatMessage[]): number {
    const payloads = messages.map((message) => this.serializeMessage(message));
    return this.tokenCounter
      .countBatch(payloads)
      .reduce((sum, count) => sum + count, 0);
  }

  private serializeMessage(message: ChatMessage): string {
    const toolCalls = message.tool_calls
      ? JSON.stringify(message.tool_calls)
      : "";
    const toolCallId = message.tool_call_id ?? "";
    const name = message.name ?? "";
    return `${message.role}\n${name}\n${toolCallId}\n${message.content}\n${toolCalls}`;
  }
}
