/**
 * Memory Ingestion Pipeline
 *
 * Post-turn pipeline that automatically extracts and stores memories.
 * Classifies turns, generates summaries, extracts facts,
 * updates relationships, and manages working memory.
 *
 * All operations are wrapped in try/catch: ingestion failures
 * must never block the agent loop.
 */

import type BetterSqlite3 from "better-sqlite3";
import type { AgentTurn, ToolCallResult } from "../types.js";
import { WorkingMemoryManager } from "./working.js";
import { EpisodicMemoryManager } from "./episodic.js";
import { SemanticMemoryManager } from "./semantic.js";
import { RelationshipMemoryManager } from "./relationship.js";
import { classifyTurn } from "./types.js";
import { EventStream, estimateTokens } from "./event-stream.js";
import {
  KnowledgeStore,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from "./knowledge-store.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.ingestion");

type Database = BetterSqlite3.Database;

// ─── Error Normalization ────────────────────────────────────────

const ERROR_PATTERNS: [RegExp, string][] = [
  [/path.traversal/i, "PATH_TRAVERSAL"],
  [/permission.denied|access.denied|forbidden/i, "PERMISSION_DENIED"],
  [/timeout|timed?\s*out/i, "TIMEOUT"],
  [/not.found|no.such|does.not.exist|enoent/i, "NOT_FOUND"],
  [/rate.limit|too.many.requests|429/i, "RATE_LIMIT"],
  [/eaddrinuse|address.already.in.use/i, "ADDRESS_IN_USE"],
  [/econnrefused|connection.refused/i, "CONNECTION_REFUSED"],
  [/out.of.memory|oom|enomem/i, "OUT_OF_MEMORY"],
  [/syntax.error|parse.error|unexpected.token/i, "SYNTAX_ERROR"],
  [/policy|blocked|denied.by.policy/i, "POLICY_BLOCKED"],
];

/**
 * Normalize a tool error string into a short, consistent type label.
 * Matches known patterns first, then falls back to a sanitized prefix.
 */
export function normalizeErrorType(error: string): string {
  for (const [pattern, label] of ERROR_PATTERNS) {
    if (pattern.test(error)) return label;
  }
  // Fallback: first 50 chars, alphanumeric + underscores only
  return error
    .slice(0, 50)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase() || "UNKNOWN";
}

export interface MarketSignal {
  type: string;
  signal: string;
  source: string;
  confidence: number;
  extractedAt: string;
}

export interface ExtractedFact {
  category: KnowledgeCategory;
  key: string;
  value: string;
  source: string;
  confidence: number;
}

export interface Contradiction {
  existingEntry: KnowledgeEntry;
  newFact: ExtractedFact;
  description: string;
}

export class MemoryIngestionPipeline {
  private working: WorkingMemoryManager;
  private episodic: EpisodicMemoryManager;
  private semantic: SemanticMemoryManager;
  private relationships: RelationshipMemoryManager;
  private knowledgeStore: KnowledgeStore;
  private eventStream: EventStream;
  private enhancementsChecked = false;
  private hasKnowledgeStoreTable = false;
  private hasEventStreamTable = false;

  constructor(private db: Database) {
    this.working = new WorkingMemoryManager(db);
    this.episodic = new EpisodicMemoryManager(db);
    this.semantic = new SemanticMemoryManager(db);
    this.relationships = new RelationshipMemoryManager(db);
    this.knowledgeStore = new KnowledgeStore(db);
    this.eventStream = new EventStream(db);
  }

  /**
   * Ingest a completed turn into the memory system.
   * Never throws -- all errors are caught and logged.
   */
  ingest(sessionId: string, turn: AgentTurn, toolCallResults: ToolCallResult[]): void {
    try {
      const classification = classifyTurn(toolCallResults, turn.thinking);

      // 1. Record episodic memory for the turn
      this.recordEpisodic(sessionId, turn, toolCallResults, classification);

      // 2. Extract semantic facts from tool results
      this.extractSemanticFacts(sessionId, turn, toolCallResults);

      // 3. Update relationship memory from inbox interactions
      this.updateRelationships(sessionId, turn, toolCallResults);

      // 4. Update working memory (goals, tasks)
      this.updateWorkingMemory(sessionId, turn, toolCallResults);

      // 5. Prune working memory if over limit
      this.working.prune(sessionId, 20);

      // 6. Enhanced ingestion: market signals + knowledge updates
      this.ingestKnowledgeEnhancements(sessionId, toolCallResults);
    } catch (error) {
      logger.error("Ingestion failed", error instanceof Error ? error : undefined);
      // Never throw -- memory failure must not block the agent loop
    }
  }

  extractMarketSignals(toolCalls: ToolCallResult[]): MarketSignal[] {
    const extractedAt = new Date().toISOString();
    const signals: MarketSignal[] = [];
    const seen = new Set<string>();

    for (const tc of toolCalls) {
      if (tc.error || !tc.result) continue;
      if (!this.isMarketSource(tc)) continue;

      const source = this.resolveSource(tc);
      const recency = this.resolveRecency(tc);
      const fragments = this.splitSignalCandidates(tc.result);

      for (const fragment of fragments) {
        const signalTypes = this.classifySignalTypes(fragment);
        if (signalTypes.length === 0) continue;

        for (const type of signalTypes) {
          const signalText = fragment.length > 240
            ? `${fragment.slice(0, 237)}...`
            : fragment;
          const dedupeKey = `${type}|${source}|${signalText.toLowerCase()}`;
          if (seen.has(dedupeKey)) continue;

          seen.add(dedupeKey);
          signals.push({
            type,
            signal: signalText,
            source,
            confidence: this.scoreConfidence(source, recency),
            extractedAt,
          });
        }
      }
    }

    return signals;
  }

  updateKnowledgeStore(knowledgeStore: KnowledgeStore, facts: ExtractedFact[]): void {
    const now = new Date().toISOString();
    const seen = new Set<string>();

    for (const fact of facts) {
      if (!fact.key.trim() || !fact.value.trim()) continue;
      if (fact.confidence < 0.5) continue;

      const normalizedKey = this.normalizeKey(fact.key);
      const normalizedValue = this.normalizeValue(fact.value);
      const dedupeKey = `${fact.category}|${normalizedKey}|${normalizedValue}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const existing = knowledgeStore
        .search(fact.key, fact.category, 50)
        .filter((entry) => this.normalizeKey(entry.key) === normalizedKey);

      const exactMatch = existing.find(
        (entry) => this.normalizeValue(entry.content) === normalizedValue,
      );

      if (exactMatch) {
        knowledgeStore.update(exactMatch.id, {
          content: fact.value,
          source: fact.source,
          confidence: Math.max(exactMatch.confidence, fact.confidence),
          lastVerified: now,
          tokenCount: estimateTokens(fact.value),
        });
        continue;
      }

      knowledgeStore.add({
        category: fact.category,
        key: fact.key,
        content: fact.value,
        source: fact.source,
        confidence: fact.confidence,
        lastVerified: now,
        tokenCount: estimateTokens(fact.value),
        expiresAt: fact.confidence < 0.7
          ? new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString()
          : null,
      });
    }
  }

  detectContradictions(newFact: ExtractedFact, existing: KnowledgeEntry[]): Contradiction[] {
    const contradictions: Contradiction[] = [];
    const newFactKey = this.normalizeKey(newFact.key);
    const newFactValue = this.normalizeValue(newFact.value);

    for (const entry of existing) {
      if (this.normalizeKey(entry.key) !== newFactKey) continue;
      if (this.normalizeValue(entry.content) === newFactValue) continue;

      contradictions.push({
        existingEntry: entry,
        newFact,
        description:
          `Conflicting values for "${newFact.key}": ` +
          `"${entry.content}" (existing, ${entry.source}) vs "${newFact.value}" (new, ${newFact.source})`,
      });
    }

    return contradictions;
  }

  scoreConfidence(source: string, recency: string): number {
    const sourceLower = source.toLowerCase();
    let sourceScore = 0.55;

    if (
      /official|docs|documentation|registry|conway|api|github\.com|wikipedia|\.gov\b|\.edu\b/.test(
        sourceLower,
      )
    ) {
      sourceScore = 0.9;
    } else if (/search|discover|domain|web|market|news|report/.test(sourceLower)) {
      sourceScore = 0.72;
    } else if (/social|reddit|forum|x\.com|twitter/.test(sourceLower)) {
      sourceScore = 0.45;
    } else if (/exec|shell|unknown/.test(sourceLower)) {
      sourceScore = 0.35;
    }

    const recencyScore = this.scoreRecency(recency);
    const weighted = (sourceScore * 0.65) + (recencyScore * 0.35);
    return Math.max(0, Math.min(1, Number(weighted.toFixed(2))));
  }

  private ingestKnowledgeEnhancements(
    sessionId: string,
    toolCallResults: ToolCallResult[],
  ): void {
    try {
      this.ensureEnhancementTableState();
      if (!this.hasKnowledgeStoreTable) return;

      const marketSignals = this.extractMarketSignals(toolCallResults);
      if (marketSignals.length === 0) {
        this.safePruneKnowledgeStore();
        return;
      }

      const facts = marketSignals.map((signal) => this.toExtractedFact(signal));
      const confirmed: ExtractedFact[] = [];

      for (const fact of facts) {
        const existing = this.knowledgeStore
          .search(fact.key, fact.category, 50)
          .filter((entry) => this.normalizeKey(entry.key) === this.normalizeKey(fact.key));
        const contradictions = this.detectContradictions(fact, existing);

        if (contradictions.length > 0) {
          this.emitContradictions(sessionId, contradictions);
          continue;
        }

        confirmed.push(fact);
      }

      this.updateKnowledgeStore(this.knowledgeStore, confirmed);
      this.emitMarketSignals(sessionId, marketSignals);
      this.safePruneKnowledgeStore();
    } catch (error) {
      logger.error("Enhanced ingestion failed", error instanceof Error ? error : undefined);
    }
  }

  private toExtractedFact(signal: MarketSignal): ExtractedFact {
    const category: KnowledgeCategory = signal.type === "pricing" ? "financial" : "market";

    return {
      category,
      key: this.buildFactKey(signal),
      value: signal.signal,
      source: signal.source,
      confidence: signal.confidence,
    };
  }

  private buildFactKey(signal: MarketSignal): string {
    const prefixMatch = signal.signal.match(/^([a-z0-9._-]{2,64})\s*:/i);
    if (prefixMatch) {
      return `${signal.type}:${prefixMatch[1].toLowerCase()}`;
    }

    const domainMatch = signal.signal.match(/\b([a-z0-9-]+\.[a-z]{2,})\b/i);
    if (domainMatch) {
      return `${signal.type}:${domainMatch[1].toLowerCase()}`;
    }

    const keywordMatch = signal.signal.toLowerCase().match(/\b[a-z][a-z0-9_-]{2,32}\b/);
    return `${signal.type}:${keywordMatch?.[0] || "general"}`;
  }

  private emitMarketSignals(sessionId: string, marketSignals: MarketSignal[]): void {
    if (!this.hasEventStreamTable) return;

    for (const signal of marketSignals) {
      try {
        this.eventStream.append({
          type: "market_signal",
          agentAddress: sessionId,
          goalId: null,
          taskId: null,
          content: `${signal.type} | ${signal.source} | ${signal.signal}`,
          tokenCount: estimateTokens(signal.signal),
          compactedTo: null,
        });
      } catch (error) {
        logger.error("Market signal event append failed", error instanceof Error ? error : undefined);
      }
    }
  }

  private emitContradictions(sessionId: string, contradictions: Contradiction[]): void {
    if (!this.hasEventStreamTable) return;

    for (const contradiction of contradictions) {
      try {
        this.eventStream.append({
          type: "knowledge",
          agentAddress: sessionId,
          goalId: null,
          taskId: null,
          content: `CONTRADICTION: ${contradiction.description}`,
          tokenCount: estimateTokens(contradiction.description),
          compactedTo: null,
        });
      } catch (error) {
        logger.error("Contradiction event append failed", error instanceof Error ? error : undefined);
      }
    }
  }

  private safePruneKnowledgeStore(): void {
    if (!this.hasKnowledgeStoreTable) return;

    try {
      this.knowledgeStore.prune();
    } catch (error) {
      logger.error("Knowledge prune failed", error instanceof Error ? error : undefined);
    }
  }

  private isMarketSource(tc: ToolCallResult): boolean {
    const toolName = tc.name.toLowerCase();
    if (/search|discover|fetch|domain|market|price|api/.test(toolName)) {
      return true;
    }

    if (typeof tc.arguments.url === "string" || typeof tc.arguments.endpoint === "string") {
      return true;
    }

    return /\$[\d,.]+|\b(usd|usdc|price|pricing|demand|competitor|alternative|rival)\b/i.test(tc.result);
  }

  private resolveSource(tc: ToolCallResult): string {
    const candidate = tc.arguments.url
      || tc.arguments.endpoint
      || tc.arguments.domain
      || tc.arguments.query;

    if (typeof candidate === "string" && candidate.trim()) {
      const trimmed = candidate.trim();
      try {
        const parsed = new URL(trimmed);
        return parsed.hostname;
      } catch {
        return trimmed.toLowerCase();
      }
    }

    return tc.name;
  }

  private resolveRecency(tc: ToolCallResult): string {
    const rawRecency = tc.arguments.date
      || tc.arguments.timestamp
      || tc.arguments.as_of
      || tc.arguments.since
      || tc.arguments.updated_at
      || tc.arguments.published_at;

    if (typeof rawRecency === "string" && rawRecency.trim()) {
      return rawRecency;
    }

    const resultDate = tc.result.match(/\b(20\d{2}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]*)?)\b/);
    if (resultDate?.[1]) {
      return resultDate[1];
    }

    if (/\byesterday\b/i.test(tc.result)) return "yesterday";
    if (/\btoday\b/i.test(tc.result)) return "today";

    return new Date().toISOString();
  }

  private splitSignalCandidates(result: string): string[] {
    const normalized = result.replace(/\r/g, "").trim();
    if (!normalized) return [];

    const lineSplit = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lineSplit.length > 1) return lineSplit;

    return normalized
      .split(/(?<=[.!?])\s+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }

  private classifySignalTypes(fragment: string): string[] {
    const types: string[] = [];
    const lower = fragment.toLowerCase();

    if (
      /\$[\d,.]+|\b\d+(?:\.\d+)?\s*(?:usd|usdc|cents)\b|\((?:\$\d+(?:\.\d{1,2})?\/yr)\)/i.test(
        fragment,
      ) ||
      /\b(price|pricing|cost|fee|subscription|rate|revenue)\b/.test(lower)
    ) {
      types.push("pricing");
    }

    if (
      /\b(demand|trend|trending|growth|growing|volume|traffic|adoption|users?|waitlist|backlog|orders?)\b/.test(
        lower,
      )
    ) {
      types.push("demand");
    }

    if (
      /\b(competitor|competitors|rival|rivals|alternative|alternatives|vs\.?|market leader)\b/.test(
        lower,
      )
    ) {
      types.push("competitor");
    }

    return types;
  }

  private scoreRecency(recency: string): number {
    const normalized = recency.trim().toLowerCase();
    if (!normalized) return 0.5;
    if (normalized.includes("today") || normalized.includes("just now")) return 1;
    if (normalized.includes("yesterday")) return 0.95;

    const relativeMatch = normalized.match(
      /(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/,
    );
    if (relativeMatch) {
      const amount = Number(relativeMatch[1]);
      const unit = relativeMatch[2];
      const days = unit === "minute"
        ? amount / 1440
        : unit === "hour"
          ? amount / 24
          : unit === "day"
            ? amount
            : unit === "week"
              ? amount * 7
              : unit === "month"
                ? amount * 30
                : amount * 365;
      return this.daysToRecencyScore(days);
    }

    const parsed = Date.parse(recency);
    if (!Number.isNaN(parsed)) {
      const now = Date.now();
      const ageMs = Math.max(0, now - parsed);
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      return this.daysToRecencyScore(ageDays);
    }

    return 0.45;
  }

  private daysToRecencyScore(ageDays: number): number {
    if (ageDays <= 1) return 1;
    if (ageDays <= 7) return 0.9;
    if (ageDays <= 30) return 0.78;
    if (ageDays <= 90) return 0.62;
    if (ageDays <= 365) return 0.48;
    return 0.3;
  }

  private normalizeKey(key: string): string {
    return key.trim().toLowerCase().replace(/\s+/g, "_");
  }

  private normalizeValue(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private ensureEnhancementTableState(): void {
    if (this.enhancementsChecked) return;

    const knowledgeRow = this.db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("knowledge_store") as { ok?: number } | undefined;
    this.hasKnowledgeStoreTable = Boolean(knowledgeRow?.ok);

    const eventRow = this.db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("event_stream") as { ok?: number } | undefined;
    this.hasEventStreamTable = Boolean(eventRow?.ok);

    this.enhancementsChecked = true;
  }

  private recordEpisodic(
    sessionId: string,
    turn: AgentTurn,
    toolCallResults: ToolCallResult[],
    classification: string,
  ): void {
    try {
      const toolNames = toolCallResults.map((tc) => tc.name).join(", ");
      const hasErrors = toolCallResults.some((tc) => tc.error);
      const summary = this.generateTurnSummary(turn, toolCallResults);

      const outcome = hasErrors
        ? "failure" as const
        : toolCallResults.length > 0
          ? "success" as const
          : "neutral" as const;

      // Importance based on classification
      const importanceMap: Record<string, number> = {
        strategic: 0.9,
        productive: 0.7,
        communication: 0.6,
        maintenance: 0.3,
        idle: 0.1,
        error: 0.8,
      };

      this.episodic.record({
        sessionId,
        eventType: toolCallResults.length > 0 ? `tool:${toolNames.split(",")[0]?.trim() || "unknown"}` : "thinking",
        summary,
        detail: turn.thinking.length > 200 ? turn.thinking.slice(0, 500) : null,
        outcome,
        importance: importanceMap[classification] ?? 0.5,
        classification: classification as any,
      });
    } catch (error) {
      logger.error("Episodic recording failed", error instanceof Error ? error : undefined);
    }
  }

  private generateTurnSummary(turn: AgentTurn, toolCallResults: ToolCallResult[]): string {
    const parts: string[] = [];

    if (toolCallResults.length > 0) {
      const toolSummaries = toolCallResults.map((tc) => {
        const status = tc.error ? "FAILED" : "ok";
        return `${tc.name}(${status})`;
      });
      parts.push(`Tools: ${toolSummaries.join(", ")}`);
    }

    if (turn.thinking) {
      parts.push(turn.thinking.slice(0, 150));
    }

    return parts.join(" | ") || "No activity";
  }

  private extractSemanticFacts(
    sessionId: string,
    turn: AgentTurn,
    toolCallResults: ToolCallResult[],
  ): void {
    try {
      for (const tc of toolCallResults) {
        // Learn from errors instead of ignoring them
        if (tc.error) {
          try {
            const errorType = normalizeErrorType(tc.error);
            const key = `tool_error:${tc.name}:${errorType}`;

            // Check for existing entry to track repetition count
            const existing = this.semantic.get("environment", key);
            let count = 1;
            if (existing) {
              const countMatch = existing.value.match(/\((\d+)x\)/);
              count = countMatch ? parseInt(countMatch[1], 10) + 1 : 2;
            }

            const truncatedError = tc.error.length > 200 ? tc.error.slice(0, 200) + "..." : tc.error;
            this.semantic.store({
              category: "environment",
              key,
              value: `${tc.name} fails with ${errorType} (${count}x) — last: ${truncatedError}`,
              confidence: Math.min(1.0, 0.5 + count * 0.1),
              source: sessionId,
            });
          } catch (errLearn) {
            logger.error("Error learning failed", errLearn instanceof Error ? errLearn : undefined);
          }
          continue;
        }

        // Extract facts from specific tool results
        if (tc.name === "check_credits" && tc.result) {
          this.semantic.store({
            category: "financial",
            key: "last_known_balance",
            value: tc.result,
            confidence: 1.0,
            source: sessionId,
          });
        }

        if (tc.name === "system_synopsis" && tc.result) {
          this.semantic.store({
            category: "self",
            key: "system_synopsis",
            value: tc.result.slice(0, 500),
            confidence: 1.0,
            source: sessionId,
          });
        }

        if (tc.name === "check_usdc_balance" && tc.result) {
          this.semantic.store({
            category: "financial",
            key: "usdc_balance",
            value: tc.result,
            confidence: 1.0,
            source: sessionId,
          });
        }

        if (tc.name === "discover_agents" && tc.result && !tc.result.includes("No agents")) {
          this.semantic.store({
            category: "environment",
            key: "known_agents",
            value: tc.result.slice(0, 500),
            confidence: 0.8,
            source: sessionId,
          });
        }
      }
    } catch (error) {
      logger.error("Semantic extraction failed", error instanceof Error ? error : undefined);
    }
  }

  private updateRelationships(
    sessionId: string,
    turn: AgentTurn,
    toolCallResults: ToolCallResult[],
  ): void {
    try {
      // Track outbound message interactions
      for (const tc of toolCallResults) {
        if (tc.error) continue;

        if (tc.name === "send_message") {
          const toAddress = tc.arguments.to_address as string | undefined;
          if (toAddress) {
            const existing = this.relationships.get(toAddress);
            if (existing) {
              this.relationships.recordInteraction(toAddress);
            } else {
              this.relationships.record({
                entityAddress: toAddress,
                relationshipType: "contacted",
                trustScore: 0.5,
              });
            }
          }
        }
      }

      // Track inbox message sources (once per turn, not per tool call)
      if (turn.inputSource === "agent" && turn.input) {
        const fromMatch = turn.input.match(/\[Message from (0x[a-fA-F0-9]+)\]/);
        if (fromMatch) {
          const fromAddress = fromMatch[1];
          const existing = this.relationships.get(fromAddress);
          if (existing) {
            this.relationships.recordInteraction(fromAddress);
          } else {
            this.relationships.record({
              entityAddress: fromAddress,
              relationshipType: "messaged_us",
              trustScore: 0.5,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Relationship update failed", error instanceof Error ? error : undefined);
    }
  }

  private updateWorkingMemory(
    sessionId: string,
    turn: AgentTurn,
    toolCallResults: ToolCallResult[],
  ): void {
    try {
      for (const tc of toolCallResults) {
        if (tc.error) continue;

        // Track sleep as an observation
        if (tc.name === "sleep") {
          this.working.add({
            sessionId,
            content: `Agent chose to sleep: ${(tc.result || "").slice(0, 200)}`,
            contentType: "observation",
            priority: 0.3,
            sourceTurn: turn.id,
          });
        }

        // Track strategic decisions
        if (tc.name === "edit_own_file" || tc.name === "update_genesis_prompt") {
          this.working.add({
            sessionId,
            content: `Self-modification: ${tc.name} - ${(tc.result || "").slice(0, 200)}`,
            contentType: "decision",
            priority: 0.9,
            sourceTurn: turn.id,
          });
        }
      }
    } catch (error) {
      logger.error("Working memory update failed", error instanceof Error ? error : undefined);
    }
  }
}
