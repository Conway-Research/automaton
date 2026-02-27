/**
 * Dynamic Context Compression Engine
 *
 * Progressive 5-stage compression cascade for long-running conversations.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import type { ContextManager, ContextUtilization } from "./context-manager.js";
import { EventStream, estimateTokens, type EventType, type StreamEvent } from "./event-stream.js";
import { KnowledgeStore } from "./knowledge-store.js";
import { UnifiedInferenceClient } from "../inference/inference-client.js";

const STAGE_1_THRESHOLD = 70;
const STAGE_2_THRESHOLD = 80;
const STAGE_3_THRESHOLD = 85;
const STAGE_4_THRESHOLD = 90;
const STAGE_5_THRESHOLD = 95;

const STAGE_3_BATCH_SIZE = 5;
const STAGE_3_DEFAULT_MAX_TOKENS = 220;
const STAGE_4_SUMMARY_MAX_TOKENS = 1500;
const STAGE_4_KEEP_LAST_TURNS = 5;
const STAGE_5_KEEP_LAST_TURNS = 3;
const CHECKPOINT_DIR = path.resolve(".omc/state/checkpoints");

const COMPRESSION_EVENT_TYPES: EventType[] = [
  "user_input",
  "plan_created",
  "plan_updated",
  "task_assigned",
  "task_completed",
  "task_failed",
  "action",
  "observation",
  "inference",
  "financial",
  "agent_spawned",
  "agent_died",
  "knowledge",
  "market_signal",
  "revenue",
  "error",
  "reflection",
];

export interface CompressionPlan {
  maxStage: 1 | 2 | 3 | 4 | 5;
  actions: CompressionAction[];
  estimatedTokensSaved: number;
  reason: string;
}

export type CompressionAction =
  | { type: "compact_tool_results"; turnIds: string[] }
  | { type: "compress_turns"; turnIds: string[] }
  | { type: "summarize_batch"; turnIds: string[]; maxTokens: number }
  | { type: "checkpoint_and_reset"; checkpointId: string }
  | { type: "emergency_truncate"; keepLastN: number };

export interface ConversationCheckpoint {
  id: string;
  agentAddress: string;
  summary: string;
  summaryTokens: number;
  activeGoalIds: string[];
  activeTaskIds: string[];
  keyDecisions: string[];
  financialState: any;
  turnCount: number;
  tokensSaved: number;
  createdAt: string;
  filePath: string;
}

export interface CompressionMetrics {
  turnNumber: number;
  preCompressionTokens: number;
  postCompressionTokens: number;
  compressionRatio: number;
  stage: number;
  tokensSaved: number;
  latencyMs: number;
  totalCheckpoints: number;
  totalEmergencyTruncations: number;
  compressedTurnCount: number;
  averageCompressionRatio: number;
  peakUtilizationPercent: number;
  turnsWithoutCompression: number;
}

export interface CompressionResult {
  plan: CompressionPlan;
  metrics: CompressionMetrics;
  success: boolean;
}

export class CompressionEngine {
  private totalCheckpoints = 0;
  private totalEmergencyTruncations = 0;
  private compressedTurnCount = 0;
  private compressionRatioSum = 0;
  private peakUtilizationPercent = 0;
  private turnsWithoutCompression = 0;

  constructor(
    private readonly contextManager: ContextManager,
    private readonly eventStream: EventStream,
    private readonly knowledgeStore: KnowledgeStore,
    private readonly inference: UnifiedInferenceClient,
  ) {}

  async evaluate(utilization: ContextUtilization): Promise<CompressionPlan> {
    this.peakUtilizationPercent = Math.max(
      this.peakUtilizationPercent,
      utilization.utilizationPercent,
    );

    const maxStage = resolveStage(utilization.utilizationPercent);
    const turnEvents = this.getTurnEvents();
    const turnIds = turnEvents.map((event) => event.id);
    const olderThan5Ids = turnIds.slice(
      0,
      Math.max(0, turnIds.length - STAGE_4_KEEP_LAST_TURNS),
    );
    const olderThan10Ids = turnIds.slice(0, Math.max(0, turnIds.length - 10));

    const actions: CompressionAction[] = [];

    if (utilization.utilizationPercent > STAGE_1_THRESHOLD) {
      actions.push({
        type: "compact_tool_results",
        turnIds: olderThan5Ids,
      });
    }

    if (utilization.utilizationPercent > STAGE_2_THRESHOLD) {
      actions.push({
        type: "compress_turns",
        turnIds: olderThan10Ids,
      });
    }

    if (utilization.utilizationPercent > STAGE_3_THRESHOLD) {
      const sourceIds = olderThan10Ids.length > 0 ? olderThan10Ids : olderThan5Ids;
      for (let i = 0; i < sourceIds.length; i += STAGE_3_BATCH_SIZE) {
        const batch = sourceIds.slice(i, i + STAGE_3_BATCH_SIZE);
        if (batch.length === 0) continue;
        actions.push({
          type: "summarize_batch",
          turnIds: batch,
          maxTokens: STAGE_3_DEFAULT_MAX_TOKENS,
        });
      }
    }

    if (utilization.utilizationPercent > STAGE_4_THRESHOLD) {
      actions.push({
        type: "checkpoint_and_reset",
        checkpointId: ulid(),
      });
    }

    if (utilization.utilizationPercent > STAGE_5_THRESHOLD) {
      actions.push({
        type: "emergency_truncate",
        keepLastN: STAGE_5_KEEP_LAST_TURNS,
      });
    }

    const estimatedTokensSaved = this.estimateSavings(
      actions,
      turnEvents,
      utilization.usedTokens,
    );

    if (actions.length === 0) {
      this.turnsWithoutCompression += 1;
    } else {
      this.turnsWithoutCompression = 0;
    }

    return {
      maxStage,
      actions,
      estimatedTokensSaved,
      reason: actions.length === 0
        ? `Utilization ${utilization.utilizationPercent}% is below compression threshold (${STAGE_1_THRESHOLD}%).`
        : `Utilization ${utilization.utilizationPercent}% triggered compression stage ${maxStage}.`,
    };
  }

  async execute(plan: CompressionPlan): Promise<CompressionResult> {
    const startedAt = Date.now();
    const preCompressionTokens = this.contextManager.getUtilization().usedTokens;

    let totalSaved = 0;
    let highestStage = 0;
    let success = true;
    let forceStage4 = false;

    for (let stage = 1; stage <= plan.maxStage || (forceStage4 && stage <= 4); stage++) {
      highestStage = Math.max(highestStage, stage);
      try {
        if (stage === 1) {
          const actions = plan.actions.filter(
            (action): action is Extract<CompressionAction, { type: "compact_tool_results" }> =>
              action.type === "compact_tool_results",
          );
          for (const action of actions) {
            totalSaved += this.compactPrefixByTurnIds(action.turnIds, "reference");
          }
          continue;
        }

        if (stage === 2) {
          const actions = plan.actions.filter(
            (action): action is Extract<CompressionAction, { type: "compress_turns" }> =>
              action.type === "compress_turns",
          );
          for (const action of actions) {
            totalSaved += this.compactPrefixByTurnIds(action.turnIds, "summarize");
          }
          continue;
        }

        if (stage === 3) {
          const actions = plan.actions.filter(
            (action): action is Extract<CompressionAction, { type: "summarize_batch" }> =>
              action.type === "summarize_batch",
          );
          if (actions.length > 0) {
            totalSaved += await this.runStage3BatchSummaries(actions);
          }
          continue;
        }

        if (stage === 4) {
          const actions = plan.actions.filter(
            (action): action is Extract<CompressionAction, { type: "checkpoint_and_reset" }> =>
              action.type === "checkpoint_and_reset",
          );
          const checkpointId = actions[0]?.checkpointId ?? ulid();
          totalSaved += await this.runStage4CheckpointAndReset(checkpointId);
          forceStage4 = false;
          continue;
        }

        if (stage === 5) {
          const action = plan.actions.find(
            (candidate): candidate is Extract<CompressionAction, { type: "emergency_truncate" }> =>
              candidate.type === "emergency_truncate",
          );
          totalSaved += await this.runStage5EmergencyTruncation(
            action?.keepLastN ?? STAGE_5_KEEP_LAST_TURNS,
          );
        }
      } catch (error) {
        await this.logCompressionError(stage, error);
        if (stage === 3) {
          forceStage4 = true;
          continue;
        }
        success = false;
      }
    }

    const postCompressionTokens = Math.max(0, preCompressionTokens - totalSaved);
    const compressionRatio = preCompressionTokens > 0
      ? Number((postCompressionTokens / preCompressionTokens).toFixed(3))
      : 1;

    if (plan.actions.length > 0) {
      this.compressedTurnCount += 1;
      this.compressionRatioSum += compressionRatio;
    }

    const metrics: CompressionMetrics = {
      turnNumber: this.getTurnEvents().length,
      preCompressionTokens,
      postCompressionTokens,
      compressionRatio,
      stage: highestStage,
      tokensSaved: totalSaved,
      latencyMs: Date.now() - startedAt,
      totalCheckpoints: this.totalCheckpoints,
      totalEmergencyTruncations: this.totalEmergencyTruncations,
      compressedTurnCount: this.compressedTurnCount,
      averageCompressionRatio: this.compressedTurnCount > 0
        ? Number((this.compressionRatioSum / this.compressedTurnCount).toFixed(3))
        : 1,
      peakUtilizationPercent: this.peakUtilizationPercent,
      turnsWithoutCompression: this.turnsWithoutCompression,
    };

    await this.logCompressionMetrics(metrics);

    return {
      plan,
      metrics,
      success,
    };
  }

  private compactPrefixByTurnIds(
    turnIds: string[],
    strategy: "reference" | "summarize",
  ): number {
    if (turnIds.length === 0) return 0;

    const turnEvents = this.getTurnEvents();
    const boundary = this.resolveBoundary(turnEvents, new Set(turnIds));
    if (!boundary) return 0;

    return this.eventStream.compact(boundary, strategy).tokensSaved;
  }

  private async runStage3BatchSummaries(
    actions: Array<Extract<CompressionAction, { type: "summarize_batch" }>>,
  ): Promise<number> {
    const index = this.buildEventIndex(this.getAllCompressionEvents());
    let tokensSaved = 0;

    for (const action of actions) {
      const batchEvents = action.turnIds
        .map((id) => index.get(id))
        .filter((event): event is StreamEvent => Boolean(event));

      if (batchEvents.length === 0) continue;

      const rawTokens = batchEvents.reduce(
        (sum, event) => sum + normalizeTokenCount(event),
        0,
      );
      const summary = await this.summarizeBatch(batchEvents, action.maxTokens);
      const summaryTokens = estimateTokens(summary);

      this.knowledgeStore.add({
        category: "operational",
        key: `compression_batch_${batchEvents[0].id}_${batchEvents[batchEvents.length - 1].id}`,
        content: summary,
        source: this.pickAgentAddress(batchEvents),
        confidence: 0.65,
        lastVerified: new Date().toISOString(),
        tokenCount: summaryTokens,
        expiresAt: null,
      });

      this.eventStream.append({
        type: "reflection",
        agentAddress: this.pickAgentAddress(batchEvents),
        goalId: batchEvents[0].goalId,
        taskId: batchEvents[0].taskId,
        content: JSON.stringify({
          kind: "compression_batch_summary",
          turnIds: action.turnIds,
          summary,
        }),
        tokenCount: summaryTokens,
        compactedTo: null,
      });

      tokensSaved += Math.max(0, rawTokens - summaryTokens);
    }

    return tokensSaved;
  }

  private async summarizeBatch(events: StreamEvent[], maxTokens: number): Promise<string> {
    const payload = events
      .map((event) =>
        `[${event.createdAt}] (${event.type}) goal=${event.goalId ?? "-"} task=${event.taskId ?? "-"} ${normalizeContent(event.content)}`,
      )
      .join("\n");

    const response = await this.inference.chat({
      tier: "cheap",
      maxTokens: Math.max(64, maxTokens),
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Summarize conversation events. Preserve agent IDs, financial amounts, task outcomes, and key decisions. Omit repetitive reasoning details.",
        },
        {
          role: "user",
          content: payload,
        },
      ],
    });

    return response.content.trim();
  }

  private async runStage4CheckpointAndReset(checkpointId: string): Promise<number> {
    const allEvents = this.getAllCompressionEvents();
    const turnEvents = this.getTurnEvents();
    const retainedTurnWindow = this.selectRetainedTurnWindow(
      turnEvents,
      STAGE_4_KEEP_LAST_TURNS,
    );

    const resetBoundary = retainedTurnWindow[0]?.createdAt;
    const eventsBeforeBoundary = resetBoundary
      ? allEvents.filter((event) => event.createdAt < resetBoundary)
      : allEvents;

    let summary: string;
    try {
      summary = await this.summarizeForCheckpoint(
        eventsBeforeBoundary,
        STAGE_4_SUMMARY_MAX_TOKENS,
      );
    } catch {
      summary = buildHeuristicSummary(eventsBeforeBoundary);
    }

    const active = this.collectActiveTasksAndGoals(allEvents);
    const keyDecisions = this.extractKeyDecisions(eventsBeforeBoundary);
    const financialState = this.extractFinancialState(allEvents);
    const agentAddress = this.pickAgentAddress(allEvents);

    let tokensSaved = 0;
    if (resetBoundary) {
      tokensSaved += this.eventStream.compact(resetBoundary, "summarize").tokensSaved;
    }

    await this.rehydrateActiveTasks(active.activeTaskIds, allEvents, agentAddress);

    await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
    const filePath = path.join(CHECKPOINT_DIR, `${checkpointId}.json`);
    const checkpoint: ConversationCheckpoint = {
      id: checkpointId,
      agentAddress,
      summary,
      summaryTokens: estimateTokens(summary),
      activeGoalIds: active.activeGoalIds,
      activeTaskIds: active.activeTaskIds,
      keyDecisions,
      financialState,
      turnCount: turnEvents.length,
      tokensSaved,
      createdAt: new Date().toISOString(),
      filePath,
    };

    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          checkpoint,
          retainedTurnIds: retainedTurnWindow.map((event) => event.id),
        },
        null,
        2,
      ),
      "utf8",
    );

    this.totalCheckpoints += 1;

    this.eventStream.append({
      type: "reflection",
      agentAddress,
      goalId: null,
      taskId: null,
      content: JSON.stringify({
        kind: "compression_checkpoint_created",
        checkpointId,
        activeTaskIds: checkpoint.activeTaskIds,
      }),
      tokenCount: estimateTokens(summary),
      compactedTo: null,
    });

    return tokensSaved;
  }

  private async summarizeForCheckpoint(events: StreamEvent[], maxTokens: number): Promise<string> {
    if (events.length === 0) {
      return "No historical events available prior to checkpoint.";
    }

    const clippedPayload = events
      .slice(-120)
      .map((event) =>
        `[${event.createdAt}] (${event.type}) goal=${event.goalId ?? "-"} task=${event.taskId ?? "-"} ${normalizeContent(event.content)}`,
      )
      .join("\n");

    const response = await this.inference.chat({
      tier: "cheap",
      maxTokens,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Produce a checkpoint summary of the conversation. Preserve active goals/tasks, financial values, decisions, and outcomes. Be concise and actionable.",
        },
        {
          role: "user",
          content: clippedPayload,
        },
      ],
    });

    return response.content.trim();
  }

  private async rehydrateActiveTasks(
    activeTaskIds: string[],
    events: StreamEvent[],
    agentAddress: string,
  ): Promise<void> {
    for (const taskId of activeTaskIds) {
      const specEvent = [...events]
        .reverse()
        .find((event) => event.taskId === taskId && event.type === "task_assigned");
      if (!specEvent) continue;

      const specContent = normalizeContent(specEvent.content, 8_000);
      if (!specContent) continue;

      this.knowledgeStore.add({
        category: "operational",
        key: `active_task_spec_${taskId}`,
        content: specContent,
        source: agentAddress,
        confidence: 0.85,
        lastVerified: new Date().toISOString(),
        tokenCount: estimateTokens(specContent),
        expiresAt: null,
      });
    }
  }

  private async runStage5EmergencyTruncation(keepLastN: number): Promise<number> {
    const allEvents = this.getAllCompressionEvents();
    const turnEvents = this.getTurnEvents();
    const retainedTurnWindow = this.selectRetainedTurnWindow(
      turnEvents,
      Math.max(1, keepLastN),
    );
    const boundary = retainedTurnWindow[0]?.createdAt;
    if (!boundary) return 0;

    const removedTokens = allEvents
      .filter((event) => event.createdAt < boundary)
      .reduce((sum, event) => sum + normalizeTokenCount(event), 0);
    const removedEvents = this.eventStream.prune(boundary);

    this.totalEmergencyTruncations += 1;
    this.eventStream.append({
      type: "compression_warning" as unknown as EventType,
      agentAddress: this.pickAgentAddress(allEvents),
      goalId: null,
      taskId: null,
      content: JSON.stringify({
        kind: "emergency_truncate",
        keepLastN,
        removedEvents,
      }),
      tokenCount: estimateTokens(String(removedEvents)),
      compactedTo: null,
    });

    return removedTokens;
  }

  private async logCompressionError(stage: number, error: unknown): Promise<void> {
    const details = error instanceof Error ? error.message : String(error);
    this.eventStream.append({
      type: "compression_error" as unknown as EventType,
      agentAddress: this.pickAgentAddress(this.getAllCompressionEvents()),
      goalId: null,
      taskId: null,
      content: JSON.stringify({
        stage,
        error: details,
      }),
      tokenCount: estimateTokens(details),
      compactedTo: null,
    });
  }

  private async logCompressionMetrics(metrics: CompressionMetrics): Promise<void> {
    this.eventStream.append({
      type: "compression" as unknown as EventType,
      agentAddress: this.pickAgentAddress(this.getAllCompressionEvents()),
      goalId: null,
      taskId: null,
      content: JSON.stringify(metrics),
      tokenCount: estimateTokens(JSON.stringify(metrics)),
      compactedTo: null,
    });
  }

  private estimateSavings(
    actions: CompressionAction[],
    turnEvents: StreamEvent[],
    usedTokens: number,
  ): number {
    const tokenById = this.buildEventIndex(turnEvents);
    let estimated = 0;

    for (const action of actions) {
      if (action.type === "compact_tool_results") {
        estimated += Math.floor(this.sumActionTokens(action.turnIds, tokenById) * 0.35);
        continue;
      }

      if (action.type === "compress_turns") {
        estimated += Math.floor(this.sumActionTokens(action.turnIds, tokenById) * 0.45);
        continue;
      }

      if (action.type === "summarize_batch") {
        const raw = this.sumActionTokens(action.turnIds, tokenById);
        estimated += Math.max(0, raw - action.maxTokens);
        continue;
      }

      if (action.type === "checkpoint_and_reset") {
        estimated += Math.floor(usedTokens * 0.55);
        continue;
      }

      if (action.type === "emergency_truncate") {
        estimated += Math.floor(usedTokens * 0.75);
      }
    }

    return Math.max(0, estimated);
  }

  private sumActionTokens(
    turnIds: string[],
    index: Map<string, StreamEvent>,
  ): number {
    let total = 0;
    for (const id of turnIds) {
      const event = index.get(id);
      total += event ? normalizeTokenCount(event) : 220;
    }
    return total;
  }

  private resolveBoundary(events: StreamEvent[], selectedIds: Set<string>): string | null {
    if (events.length === 0 || selectedIds.size === 0) return null;
    const ordered = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const firstUnselectedIndex = ordered.findIndex((event) => !selectedIds.has(event.id));
    if (firstUnselectedIndex === -1) {
      return plusOneMs(ordered[ordered.length - 1].createdAt);
    }
    if (firstUnselectedIndex === 0) return null;
    return ordered[firstUnselectedIndex].createdAt;
  }

  private collectActiveTasksAndGoals(events: StreamEvent[]): {
    activeTaskIds: string[];
    activeGoalIds: string[];
  } {
    const activeTasks = new Map<string, string | null>();

    for (const event of events) {
      if (!event.taskId) continue;
      if (event.type === "task_assigned") {
        activeTasks.set(event.taskId, event.goalId ?? null);
      }
      if (event.type === "task_completed" || event.type === "task_failed") {
        activeTasks.delete(event.taskId);
      }
    }

    const activeTaskIds = [...activeTasks.keys()];
    const activeGoalIds = [...new Set(
      [...activeTasks.values()]
        .filter((goalId): goalId is string => Boolean(goalId)),
    )];

    return {
      activeTaskIds,
      activeGoalIds,
    };
  }

  private extractKeyDecisions(events: StreamEvent[]): string[] {
    return events
      .filter((event) =>
        event.type === "plan_updated" ||
        event.type === "action" ||
        event.type === "reflection" ||
        event.type === "inference",
      )
      .map((event) => normalizeContent(event.content, 180))
      .filter((line) => /decision|decide|chose|selected|approved/i.test(line))
      .slice(-10);
  }

  private extractFinancialState(events: StreamEvent[]): any {
    const latestFinancialEvents = events
      .filter((event) => event.type === "financial" || event.type === "revenue")
      .slice(-10)
      .map((event) => ({
        id: event.id,
        type: event.type,
        createdAt: event.createdAt,
        content: normalizeContent(event.content, 300),
      }));

    const knownFinancialFacts = this.knowledgeStore
      .getByCategory("financial")
      .slice(-5)
      .map((entry) => ({
        id: entry.id,
        key: entry.key,
        confidence: entry.confidence,
        content: normalizeContent(entry.content, 300),
      }));

    return {
      latestFinancialEvents,
      knownFinancialFacts,
    };
  }

  private selectRetainedTurnWindow(turnEvents: StreamEvent[], keepN: number): StreamEvent[] {
    if (turnEvents.length <= keepN) return [...turnEvents];

    const ordered = [...turnEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let startIndex = Math.max(0, ordered.length - keepN);

    const ranges = this.buildToolPairRanges(ordered);
    for (const range of ranges) {
      if (range.start < startIndex && startIndex <= range.end) {
        startIndex = range.start;
      }
    }

    return ordered.slice(startIndex);
  }

  private buildToolPairRanges(events: StreamEvent[]): Array<{ start: number; end: number }> {
    const positions = new Map<string, { start: number; end: number }>();

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const ids = extractToolCallIds(event.content);
      for (const id of ids) {
        const existing = positions.get(id);
        if (existing) {
          existing.end = index;
        } else {
          positions.set(id, { start: index, end: index });
        }
      }
    }

    return [...positions.values()].filter((range) => range.start !== range.end);
  }

  private getTurnEvents(): StreamEvent[] {
    const inferenceEvents = this.eventStream.getByType("inference");
    if (inferenceEvents.length > 0) return inferenceEvents;

    const actionEvents = this.eventStream.getByType("action");
    const observationEvents = this.eventStream.getByType("observation");
    return dedupeEvents([...actionEvents, ...observationEvents]);
  }

  private getAllCompressionEvents(): StreamEvent[] {
    const events = COMPRESSION_EVENT_TYPES.flatMap((type) =>
      this.eventStream.getByType(type),
    );
    return dedupeEvents(events);
  }

  private buildEventIndex(events: StreamEvent[]): Map<string, StreamEvent> {
    const index = new Map<string, StreamEvent>();
    for (const event of events) {
      index.set(event.id, event);
    }
    return index;
  }

  private pickAgentAddress(events: StreamEvent[]): string {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const value = events[index]?.agentAddress;
      if (value && value.trim().length > 0) return value;
    }
    return "compression-engine";
  }
}

function resolveStage(utilizationPercent: number): 1 | 2 | 3 | 4 | 5 {
  if (utilizationPercent > STAGE_5_THRESHOLD) return 5;
  if (utilizationPercent > STAGE_4_THRESHOLD) return 4;
  if (utilizationPercent > STAGE_3_THRESHOLD) return 3;
  if (utilizationPercent > STAGE_2_THRESHOLD) return 2;
  if (utilizationPercent > STAGE_1_THRESHOLD) return 1;
  return 1;
}

function normalizeTokenCount(event: StreamEvent): number {
  return event.tokenCount > 0 ? event.tokenCount : estimateTokens(event.content ?? "");
}

function normalizeContent(content: string, maxChars: number = 800): string {
  const compact = (content ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}...`;
}

function plusOneMs(iso: string): string {
  const millis = Date.parse(iso);
  if (Number.isNaN(millis)) {
    return new Date(Date.now() + 1).toISOString();
  }
  return new Date(millis + 1).toISOString();
}

function dedupeEvents(events: StreamEvent[]): StreamEvent[] {
  const map = new Map<string, StreamEvent>();
  for (const event of events) {
    map.set(event.id, event);
  }
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function extractToolCallIds(content: string): string[] {
  const ids: string[] = [];
  const pattern = /tool(?:_|\s)?call(?:_|\s)?id["'\s:=]+([A-Za-z0-9_-]+)/gi;
  let match = pattern.exec(content);
  while (match) {
    if (match[1]) ids.push(match[1]);
    match = pattern.exec(content);
  }
  return [...new Set(ids)];
}

function buildHeuristicSummary(events: StreamEvent[]): string {
  if (events.length === 0) return "No historical events available prior to checkpoint.";

  const recent = events.slice(-12);
  const lines = recent.map((event) => {
    const snippet = normalizeContent(event.content, 140);
    return `- [${event.type}] ${snippet}`;
  });

  return [
    "Checkpoint summary (heuristic fallback):",
    `Processed events: ${events.length}`,
    ...lines,
  ].join("\n");
}
