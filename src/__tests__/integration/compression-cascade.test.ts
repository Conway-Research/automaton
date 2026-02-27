/**
 * Integration tests for CompressionEngine compression cascade.
 *
 * Uses mock dependencies rather than a real SQLite database.
 * The node:fs module is mocked so Stage 4 checkpoint writes do not
 * touch the filesystem.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompressionEngine,
  type CompressionPlan,
} from "../../memory/compression-engine.js";
import type { ContextUtilization } from "../../memory/context-manager.js";

// ---------------------------------------------------------------------------
// Mock node:fs so Stage 4 checkpoint writes are no-ops
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue("{}"),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(id: string, type = "inference") {
  return {
    id,
    type,
    agentAddress: "0xagent",
    goalId: null,
    taskId: null,
    content: "test content",
    tokenCount: 500,
    compactedTo: null,
    createdAt: new Date().toISOString(),
  };
}

/** Build a ContextUtilization snapshot with a given utilizationPercent. */
function makeUtilization(utilizationPercent: number): ContextUtilization {
  return {
    totalTokens: 128000,
    usedTokens: 50000,
    utilizationPercent,
    turnsInContext: 10,
    compressedTurns: 0,
    compressionRatio: 1,
    headroomTokens: 78000,
    recommendation: utilizationPercent >= 90
      ? "emergency"
      : utilizationPercent >= 80
        ? "compress"
        : "ok",
  };
}

/** 10 inference events used as the default getTurnEvents() return value. */
const TEN_INFERENCE_EVENTS = Array.from({ length: 10 }, (_, i) =>
  makeEvent(`e${i}`)
);

// ---------------------------------------------------------------------------
// Mock factories — re-created before each test
// ---------------------------------------------------------------------------

let mockContextManager: any;
let mockEventStream: any;
let mockKnowledgeStore: any;
let mockInference: any;
let engine: CompressionEngine;

beforeEach(() => {
  vi.clearAllMocks();

  mockContextManager = {
    getUtilization: vi.fn().mockReturnValue(makeUtilization(39)),
  } as any;

  mockEventStream = {
    getByType: vi.fn().mockReturnValue([]),
    compact: vi.fn().mockReturnValue({ compactedCount: 5, tokensSaved: 1000, strategy: "reference" }),
    append: vi.fn(),
    prune: vi.fn().mockReturnValue(10),
  } as any;

  mockKnowledgeStore = {
    add: vi.fn(),
    getByCategory: vi.fn().mockReturnValue([]),
  } as any;

  mockInference = {
    chat: vi.fn().mockResolvedValue({ content: "Summary of events" }),
  } as any;

  engine = new CompressionEngine(
    mockContextManager,
    mockEventStream,
    mockKnowledgeStore,
    mockInference,
  );

  // Default: getByType("inference") returns 10 events so evaluate/execute
  // have turn events to work with.
  mockEventStream.getByType.mockImplementation((type: string) => {
    if (type === "inference") return TEN_INFERENCE_EVENTS;
    return [];
  });
});

// ---------------------------------------------------------------------------
// Utilization triggers
// ---------------------------------------------------------------------------

describe("evaluate – utilization thresholds", () => {
  it("below 70% produces an empty actions array", async () => {
    const plan = await engine.evaluate(makeUtilization(65));

    expect(plan.actions).toEqual([]);
    expect(plan.reason).toContain("below compression threshold");
  });

  it("71% triggers Stage 1 only (compact_tool_results)", async () => {
    const plan = await engine.evaluate(makeUtilization(71));

    const types = plan.actions.map((a) => a.type);
    expect(types).toContain("compact_tool_results");
    expect(types).not.toContain("compress_turns");
    expect(types).not.toContain("summarize_batch");
    expect(types).not.toContain("checkpoint_and_reset");
  });

  it("81% triggers Stage 1 and Stage 2 (compact + compress_turns)", async () => {
    const plan = await engine.evaluate(makeUtilization(81));

    const types = plan.actions.map((a) => a.type);
    expect(types).toContain("compact_tool_results");
    expect(types).toContain("compress_turns");
    expect(types).not.toContain("summarize_batch");
    expect(types).not.toContain("checkpoint_and_reset");
  });

  it("86% triggers Stages 1-3 (adds summarize_batch)", async () => {
    const plan = await engine.evaluate(makeUtilization(86));

    const types = plan.actions.map((a) => a.type);
    expect(types).toContain("compact_tool_results");
    expect(types).toContain("compress_turns");
    expect(types).toContain("summarize_batch");
    expect(types).not.toContain("checkpoint_and_reset");
  });

  it("91% triggers Stages 1-4 (adds checkpoint_and_reset)", async () => {
    const plan = await engine.evaluate(makeUtilization(91));

    const types = plan.actions.map((a) => a.type);
    expect(types).toContain("compact_tool_results");
    expect(types).toContain("compress_turns");
    expect(types).toContain("summarize_batch");
    expect(types).toContain("checkpoint_and_reset");
  });
});

// ---------------------------------------------------------------------------
// Execute – stage behaviour
// ---------------------------------------------------------------------------

describe("execute – stage behaviour", () => {
  it("Stage 1 calls eventStream.compact with 'reference' strategy", async () => {
    // Provide events whose IDs match the turnIds so resolveBoundary succeeds.
    const events = Array.from({ length: 6 }, (_, i) => makeEvent(`t${i}`));
    mockEventStream.getByType.mockImplementation((type: string) =>
      type === "inference" ? events : []
    );

    const plan: CompressionPlan = {
      maxStage: 1,
      actions: [{ type: "compact_tool_results", turnIds: events.slice(0, 3).map((e) => e.id) }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);

    expect(result.success).toBe(true);
    expect(mockEventStream.compact).toHaveBeenCalledWith(
      expect.any(String),
      "reference",
    );
  });

  it("Stage 3 calls inference.chat for batch summaries", async () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent(`s${i}`, "inference")
    );
    mockEventStream.getByType.mockImplementation((type: string) =>
      type === "inference" ? events : []
    );

    const plan: CompressionPlan = {
      maxStage: 3,
      actions: [
        { type: "compact_tool_results", turnIds: [] },
        { type: "compress_turns", turnIds: [] },
        { type: "summarize_batch", turnIds: events.slice(0, 5).map((e) => e.id), maxTokens: 220 },
      ],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);

    expect(result.success).toBe(true);
    expect(mockInference.chat).toHaveBeenCalled();
    expect(mockEventStream.append).toHaveBeenCalled();
  });

  it("Stage 4 creates checkpoint via eventStream.compact and eventStream.append", async () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent(`c${i}`, "inference")
    );
    mockEventStream.getByType.mockImplementation((type: string) =>
      type === "inference" ? events : []
    );

    const checkpointId = "01JINTEGRATION0000000000000";
    const plan: CompressionPlan = {
      maxStage: 4,
      actions: [
        { type: "compact_tool_results", turnIds: [] },
        { type: "compress_turns", turnIds: [] },
        { type: "summarize_batch", turnIds: [], maxTokens: 220 },
        { type: "checkpoint_and_reset", checkpointId },
      ],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);

    expect(result.success).toBe(true);
    // compact is called for the reset boundary
    expect(mockEventStream.compact).toHaveBeenCalledWith(
      expect.any(String),
      "summarize",
    );
    // append is called at least once for the checkpoint reflection
    const appendCalls = mockEventStream.append.mock.calls as Array<[any]>;
    const checkpointReflection = appendCalls.find(([arg]) => {
      try {
        return JSON.parse(arg.content).kind === "compression_checkpoint_created";
      } catch {
        return false;
      }
    });
    expect(checkpointReflection).toBeDefined();
  });

  it("metrics include compressionRatio, tokensSaved, and latencyMs", async () => {
    const events = Array.from({ length: 6 }, (_, i) => makeEvent(`m${i}`));
    mockEventStream.getByType.mockImplementation((type: string) =>
      type === "inference" ? events : []
    );

    mockContextManager.getUtilization.mockReturnValue(makeUtilization(75));

    const plan: CompressionPlan = {
      maxStage: 1,
      actions: [{ type: "compact_tool_results", turnIds: events.slice(0, 4).map((e) => e.id) }],
      estimatedTokensSaved: 200,
      reason: "test",
    };

    const result = await engine.execute(plan);

    expect(typeof result.metrics.compressionRatio).toBe("number");
    expect(result.metrics.compressionRatio).toBeGreaterThanOrEqual(0);
    expect(typeof result.metrics.tokensSaved).toBe("number");
    expect(result.metrics.tokensSaved).toBeGreaterThanOrEqual(0);
    expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Stage 3 failure falls through to Stage 4
// ---------------------------------------------------------------------------

describe("execute – Stage 3 failure fallthrough", () => {
  it("Stage 3 inference failure falls through to Stage 4 checkpoint", async () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent(`f${i}`, "inference")
    );
    mockEventStream.getByType.mockImplementation((type: string) =>
      type === "inference" ? events : []
    );

    // First call (stage 3 summarize_batch) throws; second call (stage 4
    // summarizeForCheckpoint) succeeds.
    mockInference.chat
      .mockRejectedValueOnce(new Error("stage3 inference unavailable"))
      .mockResolvedValue({ content: "checkpoint summary" });

    const plan: CompressionPlan = {
      maxStage: 3,
      actions: [
        { type: "compact_tool_results", turnIds: [] },
        { type: "compress_turns", turnIds: [] },
        {
          type: "summarize_batch",
          turnIds: events.slice(0, 5).map((e) => e.id),
          maxTokens: 220,
        },
      ],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const result = await engine.execute(plan);

    // Engine should still succeed (stage 4 ran as fallback)
    expect(result.success).toBe(true);
    expect(result.metrics.stage).toBe(4);

    // The error should have been logged via eventStream.append
    const appendCalls = mockEventStream.append.mock.calls as Array<[any]>;
    const errorAppend = appendCalls.find(([arg]) => {
      try {
        const parsed = JSON.parse(arg.content);
        return parsed.stage === 3;
      } catch {
        return false;
      }
    });
    expect(errorAppend).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Metrics accumulation
// ---------------------------------------------------------------------------

describe("metrics accumulation", () => {
  it("peakUtilizationPercent tracks the highest seen utilization", async () => {
    await engine.evaluate(makeUtilization(55));
    await engine.evaluate(makeUtilization(78));
    const thirdPlan = await engine.evaluate(makeUtilization(62));

    // After evaluate with 78%, peak should be 78
    const result = await engine.execute(thirdPlan);
    expect(result.metrics.peakUtilizationPercent).toBe(78);
  });

  it("compressedTurnCount increments after each execute with actions", async () => {
    const plan: CompressionPlan = {
      maxStage: 1,
      actions: [{ type: "compact_tool_results", turnIds: [] }],
      estimatedTokensSaved: 0,
      reason: "test",
    };

    const first = await engine.execute(plan);
    expect(first.metrics.compressedTurnCount).toBe(1);

    const second = await engine.execute(plan);
    expect(second.metrics.compressedTurnCount).toBe(2);
  });
});
