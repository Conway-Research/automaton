import { promises as fs } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIGRATION_V9, MIGRATION_V10 } from "../../state/schema.js";
import { EventStream } from "../../memory/event-stream.js";
import { KnowledgeStore } from "../../memory/knowledge-store.js";
import {
  CompressionEngine,
  type CompressionPlan,
} from "../../memory/compression-engine.js";
import type { ContextUtilization } from "../../memory/context-manager.js";

const CHECKPOINT_DIR = path.resolve(".omc/state/checkpoints");

let db: BetterSqlite3.Database;
let eventStream: EventStream;
let knowledgeStore: KnowledgeStore;
let inference: { chat: ReturnType<typeof vi.fn> };
let utilizationSnapshot: ContextUtilization;
let engine: CompressionEngine;

function createTestDb(): BetterSqlite3.Database {
  const testDb = new Database(":memory:");
  testDb.pragma("journal_mode = WAL");
  testDb.pragma("foreign_keys = ON");
  testDb.exec(MIGRATION_V9);
  testDb.exec(MIGRATION_V10);
  return testDb;
}

function appendEventAt(params: {
  createdAt: string;
  type?: string;
  content?: string;
  goalId?: string | null;
  taskId?: string | null;
  tokenCount?: number;
}): string {
  const id = eventStream.append({
    type: (params.type ?? "inference") as any,
    agentAddress: "agent-1",
    goalId: params.goalId ?? "goal-1",
    taskId: params.taskId ?? "task-1",
    content: params.content ?? "event-content",
    tokenCount: params.tokenCount ?? 100,
    compactedTo: null,
  });

  db.prepare("UPDATE event_stream SET created_at = ? WHERE id = ?").run(params.createdAt, id);
  return id;
}

function seedInferenceEvents(count: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(
      appendEventAt({
        createdAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        type: "inference",
        content: `inference-${i}`,
        taskId: `task-${i % 3}`,
      }),
    );
  }
  return ids;
}

beforeEach(async () => {
  await fs.rm(CHECKPOINT_DIR, { recursive: true, force: true });

  db = createTestDb();
  eventStream = new EventStream(db);
  knowledgeStore = new KnowledgeStore(db);
  inference = {
    chat: vi.fn(async () => ({
      content: "summary output",
    })),
  };

  utilizationSnapshot = {
    totalTokens: 128000,
    usedTokens: 6000,
    utilizationPercent: 60,
    turnsInContext: 10,
    compressedTurns: 0,
    compressionRatio: 1,
    headroomTokens: 1000,
    recommendation: "ok",
  };

  const contextManagerStub = {
    getUtilization: vi.fn(() => utilizationSnapshot),
  } as any;

  engine = new CompressionEngine(
    contextManagerStub,
    eventStream,
    knowledgeStore,
    inference as any,
  );
});

afterEach(async () => {
  db.close();
  await fs.rm(CHECKPOINT_DIR, { recursive: true, force: true });
});

describe("CompressionEngine.evaluate", () => {
  it("evaluate returns no actions below 70%", async () => {
    seedInferenceEvents(8);
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 69,
    });

    expect(plan.maxStage).toBe(1);
    expect(plan.actions).toEqual([]);
    expect(plan.reason).toContain("below compression threshold");
  });

  it("Stage 1 triggers at >70%", async () => {
    seedInferenceEvents(8);
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 71,
    });

    expect(plan.actions.some((action) => action.type === "compact_tool_results")).toBe(true);
  });

  it("Stage 2 triggers at >80%", async () => {
    seedInferenceEvents(12);
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 81,
    });

    expect(plan.actions.some((action) => action.type === "compress_turns")).toBe(true);
  });

  it("Stage 3 triggers at >85%", async () => {
    seedInferenceEvents(12);
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 86,
    });

    expect(plan.actions.some((action) => action.type === "summarize_batch")).toBe(true);
  });

  it("Stage 4 triggers at >90%", async () => {
    seedInferenceEvents(12);
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 91,
    });

    expect(plan.actions.some((action) => action.type === "checkpoint_and_reset")).toBe(true);
  });

  it("Stage 5 triggers at >95%", async () => {
    seedInferenceEvents(12);
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 96,
    });

    expect(plan.actions.some((action) => action.type === "emergency_truncate")).toBe(true);
  });

  it("evaluate emits non-negative estimated token savings", async () => {
    seedInferenceEvents(12);
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 96,
    });

    expect(plan.estimatedTokensSaved).toBeGreaterThanOrEqual(0);
  });

  it("turnsWithoutCompression increments when no action is needed", async () => {
    seedInferenceEvents(2);
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 50,
    });

    const result = await engine.execute(plan);
    expect(result.metrics.turnsWithoutCompression).toBeGreaterThan(0);
  });

  it("turnsWithoutCompression resets when actions are planned", async () => {
    seedInferenceEvents(12);
    await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 50,
    });
    const plan = await engine.evaluate({
      ...utilizationSnapshot,
      utilizationPercent: 92,
    });

    const result = await engine.execute(plan);
    expect(result.metrics.turnsWithoutCompression).toBe(0);
  });
});

describe("CompressionEngine.execute", () => {
  it("executes Stage 1 compaction with reference strategy", async () => {
    const ids = seedInferenceEvents(6);

    const plan: CompressionPlan = {
      maxStage: 1,
      actions: [{ type: "compact_tool_results", turnIds: ids }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);
    expect(result.success).toBe(true);

    const compactedCount = db
      .prepare("SELECT COUNT(*) AS count FROM event_stream WHERE compacted_to LIKE 'ref:%'")
      .get() as { count: number };
    expect(compactedCount.count).toBeGreaterThan(0);
  });

  it("executes Stage 2 turn compression with summarize strategy", async () => {
    const ids = seedInferenceEvents(6);

    const plan: CompressionPlan = {
      maxStage: 2,
      actions: [{ type: "compress_turns", turnIds: ids }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);
    expect(result.success).toBe(true);

    const compactedCount = db
      .prepare("SELECT COUNT(*) AS count FROM event_stream WHERE compacted_to LIKE 'summary:%'")
      .get() as { count: number };
    expect(compactedCount.count).toBeGreaterThan(0);
  });

  it("Stage 3 summary success stores knowledge entries", async () => {
    const ids = seedInferenceEvents(12);

    const plan: CompressionPlan = {
      maxStage: 3,
      actions: [{ type: "summarize_batch", turnIds: ids.slice(0, 5), maxTokens: 220 }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);
    expect(result.success).toBe(true);

    const knowledgeCount = db.prepare("SELECT COUNT(*) AS count FROM knowledge_store").get() as {
      count: number;
    };
    expect(knowledgeCount.count).toBe(1);
  });

  it("Stage 3 summary success appends reflection event", async () => {
    const ids = seedInferenceEvents(12);

    const plan: CompressionPlan = {
      maxStage: 3,
      actions: [{ type: "summarize_batch", turnIds: ids.slice(0, 5), maxTokens: 220 }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    await engine.execute(plan);

    const reflectionRows = db
      .prepare("SELECT content FROM event_stream WHERE type = 'reflection'")
      .all() as Array<{ content: string }>;

    expect(reflectionRows.some((row) => row.content.includes("compression_batch_summary"))).toBe(true);
  });

  it("Stage 3 failure falls through to Stage 4", async () => {
    const ids = seedInferenceEvents(12);
    inference.chat.mockRejectedValue(new Error("stage3 unavailable"));

    const plan: CompressionPlan = {
      maxStage: 3,
      actions: [{ type: "summarize_batch", turnIds: ids.slice(0, 5), maxTokens: 220 }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);

    expect(result.success).toBe(true);
    expect(result.metrics.stage).toBe(4);

    const errorRows = db
      .prepare("SELECT content FROM event_stream WHERE type = 'compression_error'")
      .all() as Array<{ content: string }>;
    expect(errorRows.some((row) => row.content.includes('"stage":3'))).toBe(true);

    const files = await fs.readdir(CHECKPOINT_DIR);
    expect(files.some((file) => file.endsWith(".json"))).toBe(true);
  });

  it("Stage 4 creates checkpoint file", async () => {
    seedInferenceEvents(8);
    const checkpointId = "01JTESTCHECKPOINT00000000000";

    const plan: CompressionPlan = {
      maxStage: 4,
      actions: [{ type: "checkpoint_and_reset", checkpointId }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    await engine.execute(plan);

    const filePath = path.join(CHECKPOINT_DIR, `${checkpointId}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    expect(raw).toContain(checkpointId);
  });

  it("Stage 4 appends checkpoint reflection event", async () => {
    seedInferenceEvents(8);

    const plan: CompressionPlan = {
      maxStage: 4,
      actions: [{ type: "checkpoint_and_reset", checkpointId: "01JTESTCHECKPOINT00000000001" }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    await engine.execute(plan);

    const reflectionRows = db
      .prepare("SELECT content FROM event_stream WHERE type = 'reflection'")
      .all() as Array<{ content: string }>;

    expect(reflectionRows.some((row) => row.content.includes("compression_checkpoint_created"))).toBe(true);
  });

  it("Stage 5 emergency truncation removes older events", async () => {
    seedInferenceEvents(10);

    const plan: CompressionPlan = {
      maxStage: 5,
      actions: [{ type: "emergency_truncate", keepLastN: 3 }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    await engine.execute(plan);

    const keptInference = db
      .prepare("SELECT COUNT(*) AS count FROM event_stream WHERE type = 'inference'")
      .get() as { count: number };

    expect(keptInference.count).toBeLessThanOrEqual(3);
  });

  it("Stage 5 appends emergency warning event", async () => {
    seedInferenceEvents(10);

    const plan: CompressionPlan = {
      maxStage: 5,
      actions: [{ type: "emergency_truncate", keepLastN: 2 }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    await engine.execute(plan);

    const warningCount = db
      .prepare("SELECT COUNT(*) AS count FROM event_stream WHERE type = 'compression_warning'")
      .get() as { count: number };

    expect(warningCount.count).toBe(1);
  });

  it("execute logs compression metrics events", async () => {
    seedInferenceEvents(6);

    const plan: CompressionPlan = {
      maxStage: 1,
      actions: [{ type: "compact_tool_results", turnIds: [] }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);
    expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(0);

    const metricsRows = db
      .prepare("SELECT COUNT(*) AS count FROM event_stream WHERE type = 'compression'")
      .get() as { count: number };

    expect(metricsRows.count).toBe(1);
  });

  it("metrics tracking accumulates checkpoint counters", async () => {
    seedInferenceEvents(8);

    const checkpointPlan: CompressionPlan = {
      maxStage: 4,
      actions: [{ type: "checkpoint_and_reset", checkpointId: "01JTESTCHECKPOINT00000000002" }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const first = await engine.execute(checkpointPlan);
    expect(first.metrics.totalCheckpoints).toBe(1);

    const second = await engine.execute({
      ...checkpointPlan,
      actions: [{ type: "checkpoint_and_reset", checkpointId: "01JTESTCHECKPOINT00000000003" }],
    });
    expect(second.metrics.totalCheckpoints).toBe(2);
  });

  it("metrics expose averageCompressionRatio across runs", async () => {
    const ids = seedInferenceEvents(6);

    const plan: CompressionPlan = {
      maxStage: 2,
      actions: [
        { type: "compact_tool_results", turnIds: ids.slice(0, 3) },
        { type: "compress_turns", turnIds: ids.slice(0, 3) },
      ],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const first = await engine.execute(plan);
    const second = await engine.execute(plan);

    expect(first.metrics.compressedTurnCount).toBeGreaterThan(0);
    expect(second.metrics.averageCompressionRatio).toBeGreaterThan(0);
    expect(second.metrics.averageCompressionRatio).toBeLessThanOrEqual(1);
  });
});
