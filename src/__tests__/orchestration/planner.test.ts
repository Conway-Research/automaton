import { describe, it, expect, vi } from "vitest";
import {
  planGoal,
  replanAfterFailure,
  buildPlannerPrompt,
  validatePlannerOutput,
  type PlannerContext,
} from "../../orchestration/planner.js";
import type { Goal, TaskNode } from "../../orchestration/task-graph.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validOutput(overrides: Record<string, unknown> = {}) {
  return {
    analysis: "Analysis text",
    strategy: "Strategy text",
    customRoles: [],
    tasks: [
      {
        title: "Task 1",
        description: "Do something specific and validate the result.",
        agentRole: "generalist",
        dependencies: [],
        estimatedCostCents: 100,
        priority: 1,
        timeoutMs: 60000,
      },
    ],
    risks: ["Some risk"],
    estimatedTotalCostCents: 100,
    estimatedTimeMinutes: 30,
    ...overrides,
  };
}

const goal: Goal = {
  id: "g1",
  title: "Test",
  description: "Test goal",
  status: "active",
  strategy: null,
  rootTasks: [],
  expectedRevenueCents: 0,
  actualRevenueCents: 0,
  createdAt: "2026-01-01T00:00:00Z",
  deadline: null,
};

const context: PlannerContext = {
  creditsCents: 10000,
  usdcBalance: 0,
  survivalTier: "stable",
  availableRoles: ["generalist"],
  customRoles: [],
  activeGoals: [],
  recentOutcomes: [],
  marketIntel: "none",
  idleAgents: 2,
  busyAgents: 0,
  maxAgents: 3,
  workspaceFiles: [],
};

const failedTask: TaskNode = {
  id: "t1",
  parentId: null,
  goalId: "g1",
  title: "Failed task",
  description: "A task that failed",
  status: "failed",
  assignedTo: null,
  agentRole: "generalist",
  priority: 1,
  dependencies: [],
  result: {
    success: false,
    output: "Error: something went wrong",
    artifacts: [],
    costCents: 50,
    duration: 1000,
  },
  metadata: {
    estimatedCostCents: 100,
    actualCostCents: 50,
    maxRetries: 3,
    retryCount: 3,
    timeoutMs: 60000,
    createdAt: "2026-01-01T00:00:00Z",
    startedAt: "2026-01-01T00:01:00Z",
    completedAt: "2026-01-01T00:02:00Z",
  },
};

// ---------------------------------------------------------------------------
// validatePlannerOutput
// ---------------------------------------------------------------------------

describe("validatePlannerOutput", () => {
  it("accepts valid complete output", () => {
    const result = validatePlannerOutput(validOutput());
    expect(result.analysis).toBe("Analysis text");
    expect(result.strategy).toBe("Strategy text");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe("Task 1");
  });

  it("rejects non-object input", () => {
    expect(() => validatePlannerOutput("not an object")).toThrow("planner output must be an object");
  });

  it("rejects null input", () => {
    expect(() => validatePlannerOutput(null)).toThrow("planner output must be an object");
  });

  it("rejects missing analysis", () => {
    const output = validOutput();
    delete (output as Record<string, unknown>).analysis;
    expect(() => validatePlannerOutput(output)).toThrow("analysis");
  });

  it("rejects missing strategy", () => {
    const output = validOutput();
    delete (output as Record<string, unknown>).strategy;
    expect(() => validatePlannerOutput(output)).toThrow("strategy");
  });

  it("rejects missing tasks array", () => {
    const output = validOutput();
    delete (output as Record<string, unknown>).tasks;
    expect(() => validatePlannerOutput(output)).toThrow("tasks");
  });

  it("rejects task with missing title", () => {
    const output = validOutput({
      tasks: [
        {
          description: "Some description here for the task.",
          agentRole: "generalist",
          dependencies: [],
          estimatedCostCents: 100,
          priority: 1,
          timeoutMs: 60000,
        },
      ],
    });
    expect(() => validatePlannerOutput(output)).toThrow("title");
  });

  it("rejects task with negative cost", () => {
    const output = validOutput({
      tasks: [
        {
          title: "Task 1",
          description: "Do something specific and validate the result.",
          agentRole: "generalist",
          dependencies: [],
          estimatedCostCents: -1,
          priority: 1,
          timeoutMs: 60000,
        },
      ],
    });
    expect(() => validatePlannerOutput(output)).toThrow("estimatedCostCents");
  });

  it("rejects task with zero timeout", () => {
    const output = validOutput({
      tasks: [
        {
          title: "Task 1",
          description: "Do something specific and validate the result.",
          agentRole: "generalist",
          dependencies: [],
          estimatedCostCents: 100,
          priority: 1,
          timeoutMs: 0,
        },
      ],
    });
    expect(() => validatePlannerOutput(output)).toThrow("timeoutMs");
  });

  it("detects dependency cycle (A depends on B depends on A)", () => {
    const output = validOutput({
      tasks: [
        {
          title: "Task A",
          description: "Do something specific and validate the result.",
          agentRole: "generalist",
          dependencies: [1],
          estimatedCostCents: 100,
          priority: 1,
          timeoutMs: 60000,
        },
        {
          title: "Task B",
          description: "Do something specific and validate the result.",
          agentRole: "generalist",
          dependencies: [0],
          estimatedCostCents: 100,
          priority: 1,
          timeoutMs: 60000,
        },
      ],
    });
    expect(() => validatePlannerOutput(output)).toThrow("cycle");
  });

  it("detects self-dependency", () => {
    const output = validOutput({
      tasks: [
        {
          title: "Task 1",
          description: "Do something specific and validate the result.",
          agentRole: "generalist",
          dependencies: [0],
          estimatedCostCents: 100,
          priority: 1,
          timeoutMs: 60000,
        },
      ],
    });
    expect(() => validatePlannerOutput(output)).toThrow("itself");
  });

  it("detects out-of-range dependency index", () => {
    const output = validOutput({
      tasks: [
        {
          title: "Task 1",
          description: "Do something specific and validate the result.",
          agentRole: "generalist",
          dependencies: [99],
          estimatedCostCents: 100,
          priority: 1,
          timeoutMs: 60000,
        },
      ],
    });
    expect(() => validatePlannerOutput(output)).toThrow("out-of-range");
  });

  it("rejects duplicate custom role names", () => {
    const customRole = {
      name: "my-role",
      description: "A custom role",
      systemPrompt: "You are a specialist agent.",
      allowedTools: ["bash"],
      model: "tier:fast",
      rationale: "No predefined role fits this task",
    };
    const output = validOutput({ customRoles: [customRole, { ...customRole }] });
    expect(() => validatePlannerOutput(output)).toThrow("duplicate");
  });
});

// ---------------------------------------------------------------------------
// buildPlannerPrompt
// ---------------------------------------------------------------------------

describe("buildPlannerPrompt", () => {
  it("includes credit balance", () => {
    const prompt = buildPlannerPrompt(context);
    expect(prompt).toContain("10000 cents");
  });

  it("includes survival tier", () => {
    const prompt = buildPlannerPrompt(context);
    expect(prompt).toContain("stable");
  });

  it("includes available roles", () => {
    const prompt = buildPlannerPrompt(context);
    expect(prompt).toContain("generalist");
  });

  it("includes agent availability numbers", () => {
    const prompt = buildPlannerPrompt(context);
    expect(prompt).toContain("2");   // idleAgents
    expect(prompt).toContain("0");   // busyAgents
    expect(prompt).toContain("3");   // maxAgents
  });
});

// ---------------------------------------------------------------------------
// planGoal
// ---------------------------------------------------------------------------

describe("planGoal", () => {
  it("returns validated output on valid response", async () => {
    const mockInference = { chat: vi.fn() } as any;
    mockInference.chat.mockResolvedValue({ content: JSON.stringify(validOutput()) });

    const result = await planGoal(goal, context, mockInference);
    expect(result.analysis).toBe("Analysis text");
    expect(result.tasks).toHaveLength(1);
    expect(mockInference.chat).toHaveBeenCalledOnce();
  });

  it("throws on empty response", async () => {
    const mockInference = { chat: vi.fn() } as any;
    mockInference.chat.mockResolvedValue({ content: "" });

    await expect(planGoal(goal, context, mockInference)).rejects.toThrow("empty response");
  });

  it("throws on invalid JSON response", async () => {
    const mockInference = { chat: vi.fn() } as any;
    mockInference.chat.mockResolvedValue({ content: "not json at all" });

    await expect(planGoal(goal, context, mockInference)).rejects.toThrow("invalid JSON");
  });

  it("throws on invalid schema response", async () => {
    const mockInference = { chat: vi.fn() } as any;
    mockInference.chat.mockResolvedValue({ content: JSON.stringify({ analysis: "ok" }) });

    await expect(planGoal(goal, context, mockInference)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// replanAfterFailure
// ---------------------------------------------------------------------------

describe("replanAfterFailure", () => {
  it("includes failure context in prompt", async () => {
    const mockInference = { chat: vi.fn() } as any;
    mockInference.chat.mockResolvedValue({ content: JSON.stringify(validOutput()) });

    await replanAfterFailure(goal, failedTask, context, mockInference);

    const callArgs = mockInference.chat.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("replan_after_failure");
    expect(userMessage.content).toContain("Failed task");
  });

  it("returns validated output", async () => {
    const mockInference = { chat: vi.fn() } as any;
    mockInference.chat.mockResolvedValue({ content: JSON.stringify(validOutput()) });

    const result = await replanAfterFailure(goal, failedTask, context, mockInference);
    expect(result.strategy).toBe("Strategy text");
    expect(result.tasks).toHaveLength(1);
  });

  it("throws on invalid planner response", async () => {
    const mockInference = { chat: vi.fn() } as any;
    mockInference.chat.mockResolvedValue({ content: "{}" });

    await expect(replanAfterFailure(goal, failedTask, context, mockInference)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Custom role validation
// ---------------------------------------------------------------------------

describe("custom role validation", () => {
  it("accepts valid custom role with all fields", () => {
    const output = validOutput({
      customRoles: [
        {
          name: "blockchain-indexer",
          description: "Indexes blockchain events",
          systemPrompt: "You are a blockchain indexer agent with deep expertise.",
          allowedTools: ["bash", "web_search"],
          deniedTools: ["file_write"],
          model: "tier:fast",
          maxTokensPerTurn: 4096,
          maxTurnsPerTask: 10,
          treasuryLimits: { maxSingleTransfer: 100, maxDailySpend: 500 },
          rationale: "No predefined role handles on-chain event indexing",
        },
      ],
    });
    const result = validatePlannerOutput(output);
    expect(result.customRoles).toHaveLength(1);
    expect(result.customRoles[0].name).toBe("blockchain-indexer");
    expect(result.customRoles[0].deniedTools).toEqual(["file_write"]);
    expect(result.customRoles[0].treasuryLimits?.maxSingleTransfer).toBe(100);
  });

  it("rejects custom role missing required fields", () => {
    const output = validOutput({
      customRoles: [
        {
          name: "incomplete-role",
          description: "Missing systemPrompt and other required fields",
          // systemPrompt intentionally omitted
          allowedTools: ["bash"],
          model: "tier:fast",
          // rationale intentionally omitted
        },
      ],
    });
    expect(() => validatePlannerOutput(output)).toThrow();
  });
});
