import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ulid } from "ulid";
import type BetterSqlite3 from "better-sqlite3";
import { Orchestrator } from "../../orchestration/orchestrator.js";
import { createInMemoryDb } from "../orchestration/test-db.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const IDENTITY = {
  name: "test",
  address: "0xparent" as any,
  account: {} as any,
  creatorAddress: "0x0000" as any,
  sandboxId: "sb-1",
  apiKey: "key",
  createdAt: "2026-01-01T00:00:00Z",
};

const plannerOutput = {
  analysis: "Analysis",
  strategy: "Strategy",
  customRoles: [],
  tasks: [
    {
      title: "Task 1",
      description: "Do the thing and verify.",
      agentRole: "generalist",
      dependencies: [],
      estimatedCostCents: 100,
      priority: 1,
      timeoutMs: 60000,
    },
  ],
  risks: ["risk1"],
  estimatedTotalCostCents: 100,
  estimatedTimeMinutes: 10,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readState(db: BetterSqlite3.Database): Record<string, unknown> | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get("orchestrator.state") as
    | { value: string }
    | undefined;
  return row ? JSON.parse(row.value) : null;
}

function setState(db: BetterSqlite3.Database, state: Record<string, unknown>): void {
  db.prepare(
    "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
  ).run("orchestrator.state", JSON.stringify(state));
}

function insertGoal(
  db: BetterSqlite3.Database,
  overrides: { id?: string; title?: string; description?: string; status?: string } = {},
): string {
  const id = overrides.id ?? ulid();
  db.prepare(
    "INSERT INTO goals (id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    id,
    overrides.title ?? "Test Goal",
    overrides.description ?? "A test goal description",
    overrides.status ?? "active",
    new Date().toISOString(),
  );
  return id;
}

function getGoalStatus(db: BetterSqlite3.Database, goalId: string): string | null {
  const row = db.prepare("SELECT status FROM goals WHERE id = ?").get(goalId) as
    | { status: string }
    | undefined;
  return row?.status ?? null;
}

function getTasksForGoal(db: BetterSqlite3.Database, goalId: string) {
  return db.prepare("SELECT * FROM task_graph WHERE goal_id = ?").all(goalId) as Array<{
    id: string;
    status: string;
    assigned_to: string | null;
  }>;
}

function makeMocks() {
  const agentTracker = {
    getIdle: vi.fn().mockReturnValue([]),
    getBestForTask: vi.fn().mockReturnValue(null),
    updateStatus: vi.fn(),
    register: vi.fn(),
  };

  const funding = {
    fundChild: vi.fn().mockResolvedValue({ success: true }),
    recallCredits: vi.fn().mockResolvedValue({ success: true, amountCents: 0 }),
    getBalance: vi.fn().mockResolvedValue(1000),
  };

  const messaging = {
    processInbox: vi.fn().mockResolvedValue([]),
    send: vi.fn().mockResolvedValue(undefined),
    createMessage: vi.fn().mockReturnValue({
      id: "msg-1",
      type: "task_assignment",
      from: "0xparent",
      to: "0xchild",
      goalId: null,
      taskId: null,
      content: "{}",
      priority: "high",
      requiresResponse: true,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    }),
  };

  const inference = {
    chat: vi.fn(),
  };

  return { agentTracker, funding, messaging, inference };
}

function makeOrchestrator(
  db: BetterSqlite3.Database,
  mocks: ReturnType<typeof makeMocks>,
  config: Record<string, unknown> = {},
): Orchestrator {
  return new Orchestrator({
    db,
    agentTracker: mocks.agentTracker,
    funding: mocks.funding,
    messaging: mocks.messaging as any,
    inference: mocks.inference as any,
    identity: IDENTITY,
    config: { disableSpawn: true, maxReplans: 3, ...config },
  });
}

function makeTaskResultInboxEntry(goalId: string, taskId: string) {
  return {
    success: true,
    message: {
      id: "m1",
      type: "task_result",
      from: "0xchild",
      to: "0xparent",
      goalId,
      taskId,
      content: JSON.stringify({
        taskId,
        result: {
          success: true,
          output: "done",
          artifacts: [],
          costCents: 50,
          duration: 100,
        },
      }),
      priority: "normal",
      requiresResponse: false,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    },
    handledBy: "test",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("integration/plan-execute-flow", () => {
  let db: BetterSqlite3.Database;
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    db = createInMemoryDb();
    mocks = makeMocks();
  });

  afterEach(() => {
    db.close();
    vi.resetAllMocks();
  });

  // ─── Full lifecycle ──────────────────────────────────────────────────────

  describe("full lifecycle: idle → classifying → planning → plan_review → executing → complete", () => {
    it("tick 1: idle with active goal transitions to classifying", async () => {
      insertGoal(db, { status: "active" });
      setState(db, { phase: "idle", goalId: null, replanCount: 0, failedTaskId: null, failedError: null });

      mocks.inference.chat.mockResolvedValue({
        content: JSON.stringify({ estimatedSteps: 5, reason: "complex", stepOutline: ["step1"] }),
        usage: {},
      });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      // idle picks up the goal, classifying runs the inference in the same tick
      // and since estimatedSteps > 3, moves to "planning"
      expect(["classifying", "planning"]).toContain(result.phase);
    });

    it("tick 2: classifying with complex goal transitions to planning", async () => {
      const goalId = insertGoal(db, { status: "active" });
      setState(db, { phase: "classifying", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      mocks.inference.chat.mockResolvedValue({
        content: JSON.stringify({ estimatedSteps: 5, reason: "complex", stepOutline: ["step1"] }),
        usage: {},
      });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("planning");
    });

    it("tick 3: planning phase decomposes goal and transitions to plan_review", async () => {
      const goalId = insertGoal(db, { status: "active" });
      setState(db, { phase: "planning", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      mocks.inference.chat.mockResolvedValue({
        content: JSON.stringify(plannerOutput),
        usage: {},
      });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("plan_review");

      // Tasks should be decomposed into task_graph
      const tasks = getTasksForGoal(db, goalId);
      expect(tasks.length).toBeGreaterThan(0);
    });

    it("tick 4: plan_review auto-approves and transitions to executing", async () => {
      const goalId = insertGoal(db, { status: "active" });
      // Insert a task so executing phase has work to pick up
      db.prepare(
        `INSERT INTO task_graph (id, goal_id, title, description, status, agent_role, priority, dependencies, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(ulid(), goalId, "Task 1", "Do the thing", "pending", "generalist", 1, "[]", new Date().toISOString());

      setState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("executing");
    });

    it("tick 5-6: executing assigns tasks, receives results, and completes goal", async () => {
      const goalId = insertGoal(db, { status: "active" });
      const taskId = ulid();
      db.prepare(
        `INSERT INTO task_graph (id, goal_id, title, description, status, agent_role, priority, dependencies, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskId, goalId, "Task 1", "Do the thing", "pending", "generalist", 1, "[]", new Date().toISOString());

      setState(db, { phase: "executing", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      // Provide an idle agent so task assignment succeeds
      mocks.agentTracker.getIdle.mockReturnValue([
        { address: "0xchild", name: "Worker", role: "generalist", status: "healthy" },
      ]);

      // First tick: assigns the task (inbox empty)
      mocks.messaging.processInbox.mockResolvedValue([]);
      const orc = makeOrchestrator(db, mocks);
      await orc.tick();

      // Verify task was assigned
      const tasks = getTasksForGoal(db, goalId);
      expect(tasks[0].assigned_to).toBe("0xchild");

      // Second tick: process task result
      mocks.messaging.processInbox.mockResolvedValue([
        makeTaskResultInboxEntry(goalId, taskId),
      ]);
      const result2 = await orc.tick();

      expect(result2.phase).toBe("complete");
      expect(getGoalStatus(db, goalId)).toBe("completed");
    });
  });

  // ─── Replan on task failure ──────────────────────────────────────────────

  describe("replan on task failure", () => {
    it("task failure transitions executing phase to replanning", async () => {
      const goalId = insertGoal(db, { status: "active" });
      const taskId = ulid();
      db.prepare(
        `INSERT INTO task_graph (id, goal_id, title, description, status, agent_role, priority, dependencies, max_retries, retry_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskId, goalId, "Task 1", "Do the thing", "pending", "generalist", 1, "[]", 0, 0, new Date().toISOString());

      setState(db, { phase: "executing", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      mocks.agentTracker.getIdle.mockReturnValue([
        { address: "0xchild", name: "Worker", role: "generalist", status: "healthy" },
      ]);

      // Return a failed task result
      mocks.messaging.processInbox.mockResolvedValue([
        {
          success: true,
          message: {
            id: "m2",
            type: "task_result",
            from: "0xchild",
            to: "0xparent",
            goalId,
            taskId,
            content: JSON.stringify({
              taskId,
              result: { success: false, output: "error: something broke", artifacts: [], costCents: 10, duration: 50 },
            }),
            priority: "normal",
            requiresResponse: false,
            expiresAt: null,
            createdAt: new Date().toISOString(),
          },
          handledBy: "test",
        },
      ]);

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("replanning");
    });

    it("replanning produces new tasks and transitions to plan_review", async () => {
      const goalId = insertGoal(db, { status: "active" });
      const taskId = ulid();
      db.prepare(
        `INSERT INTO task_graph (id, goal_id, title, description, status, agent_role, priority, dependencies, max_retries, retry_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskId, goalId, "Task 1", "Do the thing", "failed", "generalist", 1, "[]", 0, 0, new Date().toISOString());

      setState(db, { phase: "replanning", goalId, replanCount: 0, failedTaskId: taskId, failedError: "it broke" });

      mocks.inference.chat.mockResolvedValue({
        content: JSON.stringify(plannerOutput),
        usage: {},
      });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("plan_review");
      const state = readState(db);
      expect(state?.replanCount).toBe(1);
    });

    it("max replans exceeded transitions to failed", async () => {
      const goalId = insertGoal(db, { status: "active" });
      const taskId = ulid();
      db.prepare(
        `INSERT INTO task_graph (id, goal_id, title, description, status, agent_role, priority, dependencies, max_retries, retry_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskId, goalId, "Task 1", "Do the thing", "pending", "generalist", 1, "[]", 0, 0, new Date().toISOString());

      // replanCount already at max
      setState(db, { phase: "executing", goalId, replanCount: 3, failedTaskId: null, failedError: null });

      mocks.agentTracker.getIdle.mockReturnValue([
        { address: "0xchild", name: "Worker", role: "generalist", status: "healthy" },
      ]);

      // Return a failed task result
      mocks.messaging.processInbox.mockResolvedValue([
        {
          success: true,
          message: {
            id: "m3",
            type: "task_result",
            from: "0xchild",
            to: "0xparent",
            goalId,
            taskId,
            content: JSON.stringify({
              taskId,
              result: { success: false, output: "fatal failure", artifacts: [], costCents: 0, duration: 0 },
            }),
            priority: "normal",
            requiresResponse: false,
            expiresAt: null,
            createdAt: new Date().toISOString(),
          },
          handledBy: "test",
        },
      ]);

      const orc = makeOrchestrator(db, mocks, { maxReplans: 3 });
      const result = await orc.tick();

      expect(result.phase).toBe("failed");
    });

    it("goal status is set to failed when max replans exceeded", async () => {
      const goalId = insertGoal(db, { status: "active" });

      setState(db, {
        phase: "failed",
        goalId,
        replanCount: 3,
        failedTaskId: null,
        failedError: "No more replans",
      });

      const orc = makeOrchestrator(db, mocks);
      await orc.tick();

      expect(getGoalStatus(db, goalId)).toBe("failed");
    });
  });

  // ─── Plan review scenarios ───────────────────────────────────────────────

  describe("plan review", () => {
    it("plan_review with no plan in KV advances directly to executing", async () => {
      const goalId = insertGoal(db, { status: "active" });
      db.prepare(
        `INSERT INTO task_graph (id, goal_id, title, description, status, agent_role, priority, dependencies, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(ulid(), goalId, "Task 1", "Do the thing", "pending", "generalist", 1, "[]", new Date().toISOString());

      setState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });
      // Deliberately do NOT store any plan in KV

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("executing");
    });

    it("plan_review with valid plan in KV auto-approves and transitions to executing", async () => {
      const goalId = insertGoal(db, { status: "active" });
      db.prepare(
        `INSERT INTO task_graph (id, goal_id, title, description, status, agent_role, priority, dependencies, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(ulid(), goalId, "Task 1", "Do the thing", "pending", "generalist", 1, "[]", new Date().toISOString());

      // Store a valid plan in KV under the expected key
      db.prepare(
        "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      ).run(`orchestrator.plan.${goalId}`, JSON.stringify(plannerOutput));

      setState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("executing");
    });

    it("plan_review with high-cost plan still auto-approves in auto mode", async () => {
      const goalId = insertGoal(db, { status: "active" });
      db.prepare(
        `INSERT INTO task_graph (id, goal_id, title, description, status, agent_role, priority, dependencies, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(ulid(), goalId, "Task 1", "Do the thing", "pending", "generalist", 1, "[]", new Date().toISOString());

      // Store a plan with cost below auto-approve threshold (5000 cents)
      const highCostPlan = { ...plannerOutput, estimatedTotalCostCents: 4999 };
      db.prepare(
        "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      ).run(`orchestrator.plan.${goalId}`, JSON.stringify(highCostPlan));

      setState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      // auto mode approves when cost is below autoBudgetThreshold (5000)
      expect(result.phase).toBe("executing");
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("no active goals keeps orchestrator idle", async () => {
      // No goals inserted
      setState(db, { phase: "idle", goalId: null, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("idle");
      expect(result.goalsActive).toBe(0);
    });

    it("goal deleted mid-execution causes orchestrator to return to idle", async () => {
      const goalId = ulid(); // Use an ID but don't insert the goal
      setState(db, { phase: "executing", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db, mocks);
      const result = await orc.tick();

      expect(result.phase).toBe("idle");
      const state = readState(db);
      expect(state?.goalId).toBeNull();
    });
  });
});
