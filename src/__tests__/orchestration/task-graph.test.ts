import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assignTask,
  completeTask,
  createGoal,
  decomposeGoal,
  detectCycles,
  failTask,
  getGoalProgress,
  getReadyTasks,
  pruneCompletedGoals,
  type TaskNode,
  type TaskResult,
} from "../../orchestration/task-graph.js";
import {
  getGoalById,
  getTaskById,
  getTasksByGoal,
  insertGoal,
  insertTask,
} from "../../state/database.js";
import { createInMemoryDb } from "./test-db.js";

type DecomposeTaskInput = Omit<TaskNode, "id" | "metadata">;

const SUCCESS_RESULT: TaskResult = {
  success: true,
  output: "ok",
  artifacts: ["artifact.txt"],
  costCents: 123,
  duration: 42,
};

function makeTask(
  goalId: string,
  title: string,
  overrides: Partial<DecomposeTaskInput> = {},
): DecomposeTaskInput {
  return {
    parentId: null,
    goalId,
    title,
    description: `${title} description`,
    status: "pending",
    assignedTo: null,
    agentRole: "generalist",
    priority: 50,
    dependencies: [],
    result: null,
    ...overrides,
  };
}

describe("orchestration/task-graph", () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("createGoal", () => {
    it("creates and persists a goal", () => {
      const goal = createGoal(db, "Launch API", "Ship API to production", "fast path");

      const stored = getGoalById(db, goal.id);
      expect(stored).toBeDefined();
      expect(stored?.title).toBe("Launch API");
      expect(stored?.description).toBe("Ship API to production");
      expect(stored?.strategy).toBe("fast path");
      expect(stored?.status).toBe("active");
      expect(goal.rootTasks).toEqual([]);
    });

    it("trims title and description", () => {
      const goal = createGoal(db, "  Build Thing  ", "  With details  ");
      const stored = getGoalById(db, goal.id);
      expect(stored?.title).toBe("Build Thing");
      expect(stored?.description).toBe("With details");
    });

    it.each([
      ["", "desc", "Goal title cannot be empty"],
      ["   ", "desc", "Goal title cannot be empty"],
      ["title", "", "Goal description cannot be empty"],
      ["title", "   ", "Goal description cannot be empty"],
    ])("rejects invalid inputs", (title, description, message) => {
      expect(() => createGoal(db, title, description)).toThrow(message);
    });
  });

  describe("decomposeGoal", () => {
    it("inserts tasks with dependencies resolved by title", () => {
      const goal = createGoal(db, "Goal", "Desc");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "task-a"),
        makeTask(goal.id, "task-b", { dependencies: ["task-a"] }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      expect(tasks).toHaveLength(2);

      const a = tasks.find((task) => task.title === "task-a");
      const b = tasks.find((task) => task.title === "task-b");

      expect(a?.dependencies).toEqual([]);
      expect(b?.dependencies).toEqual([a?.id]);
      expect(b?.status).toBe("blocked");
    });

    it("supports empty task list", () => {
      const goal = createGoal(db, "Goal", "Desc");
      decomposeGoal(db, goal.id, []);
      expect(getTasksByGoal(db, goal.id)).toHaveLength(0);
    });

    it("resolves parentId references", () => {
      const goal = createGoal(db, "Goal", "Desc");
      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "parent"),
        makeTask(goal.id, "child", { parentId: "parent" }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const parent = tasks.find((task) => task.title === "parent");
      const child = tasks.find((task) => task.title === "child");

      expect(child?.parentId).toBe(parent?.id ?? null);
    });

    it("deduplicates repeated dependencies", () => {
      const goal = createGoal(db, "Goal", "Desc");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "a"),
        makeTask(goal.id, "b", { dependencies: ["a", "a"] }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const a = tasks.find((task) => task.title === "a");
      const b = tasks.find((task) => task.title === "b");

      expect(b?.dependencies).toEqual([a?.id]);
    });

    it("keeps assigned status even when dependencies are unmet", () => {
      const goal = createGoal(db, "Goal", "Desc");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "a"),
        makeTask(goal.id, "b", {
          status: "assigned",
          assignedTo: "0xagent",
          dependencies: ["a"],
        }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const b = tasks.find((task) => task.title === "b");
      expect(b?.status).toBe("assigned");
      expect(b?.assignedTo).toBe("0xagent");
    });

    it("starts pending when dependency is already completed", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const done = insertTask(db, {
        goalId: goal.id,
        title: "done",
        description: "done",
        status: "completed",
      });

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "new", { dependencies: [done] }),
      ]);

      const task = getTasksByGoal(db, goal.id).find((row) => row.title === "new");
      expect(task?.status).toBe("pending");
    });

    it("rejects unknown goal", () => {
      expect(() => decomposeGoal(db, "missing-goal", [makeTask("missing-goal", "t")])).toThrow(
        "Goal not found: missing-goal",
      );
    });

    it.each([
      { title: "", description: "desc", msg: "Task title cannot be empty" },
      { title: "  ", description: "desc", msg: "Task title cannot be empty" },
    ])("rejects empty task title", ({ title, description, msg }) => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() => decomposeGoal(db, goal.id, [makeTask(goal.id, title, { description })])).toThrow(msg);
    });

    it("rejects empty task description", () => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() =>
        decomposeGoal(db, goal.id, [makeTask(goal.id, "t1", { description: "   " })])
      ).toThrow("Task description cannot be empty for: t1");
    });

    it("rejects goalId mismatch", () => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() =>
        decomposeGoal(db, goal.id, [makeTask("another-goal", "t1")])
      ).toThrow(`Task goal mismatch for 't1'. Expected ${goal.id}, got another-goal`);
    });

    it.each([
      -1,
      101,
      1.2,
    ])("rejects invalid priority %s", (priority) => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() =>
        decomposeGoal(db, goal.id, [makeTask(goal.id, "t1", { priority })])
      ).toThrow("Task priority must be an integer in [0,100] for 't1'");
    });

    it("rejects parent self-reference via cycle detection", () => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() =>
        decomposeGoal(db, goal.id, [makeTask(goal.id, "self-parent", { parentId: "task-1" })])
      ).toThrow("Task graph contains a cycle; decomposition must be a DAG");
    });

    it("rejects dependency self-reference via cycle detection", () => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() =>
        decomposeGoal(db, goal.id, [makeTask(goal.id, "self-dep", { dependencies: ["0"] })])
      ).toThrow("Task graph contains a cycle; decomposition must be a DAG");
    });

    it("rejects orphan dependency", () => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() =>
        decomposeGoal(db, goal.id, [makeTask(goal.id, "orphan", { dependencies: ["missing-task"] })])
      ).toThrow(/Dependency task missing-task not found/);
    });

    it("rejects parent outside goal", () => {
      const goalA = createGoal(db, "Goal A", "Desc");
      const goalB = createGoal(db, "Goal B", "Desc");
      const foreignParent = insertTask(db, {
        goalId: goalA.id,
        title: "parent",
        description: "parent",
      });

      expect(() =>
        decomposeGoal(db, goalB.id, [makeTask(goalB.id, "child", { parentId: foreignParent })])
      ).toThrow(/outside goal/);
    });

    it("rejects dependency outside goal", () => {
      const goalA = createGoal(db, "Goal A", "Desc");
      const goalB = createGoal(db, "Goal B", "Desc");
      const foreignDep = insertTask(db, {
        goalId: goalA.id,
        title: "dep",
        description: "dep",
        status: "completed",
      });

      expect(() =>
        decomposeGoal(db, goalB.id, [makeTask(goalB.id, "task", { dependencies: [foreignDep] })])
      ).toThrow(/outside goal/);
    });

    it("rejects circular dependencies", () => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() =>
        decomposeGoal(db, goal.id, [
          makeTask(goal.id, "a", { dependencies: ["b"] }),
          makeTask(goal.id, "b", { dependencies: ["a"] }),
        ])
      ).toThrow("Task graph contains a cycle; decomposition must be a DAG");
    });

    it("rejects parent cycles", () => {
      const goal = createGoal(db, "Goal", "Desc");
      expect(() =>
        decomposeGoal(db, goal.id, [
          makeTask(goal.id, "a", { parentId: "b" }),
          makeTask(goal.id, "b", { parentId: "a" }),
        ])
      ).toThrow("Task graph contains a cycle; decomposition must be a DAG");
    });

    it("accepts a non-cyclic complex graph", () => {
      const goal = createGoal(db, "Goal", "Desc");
      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "fetch"),
        makeTask(goal.id, "plan", { dependencies: ["fetch"] }),
        makeTask(goal.id, "build", { dependencies: ["plan"] }),
        makeTask(goal.id, "test", { dependencies: ["build"], parentId: "build" }),
      ]);

      expect(getTasksByGoal(db, goal.id)).toHaveLength(4);
    });
  });

  describe("getReadyTasks", () => {
    it("returns only tasks whose dependencies are completed", () => {
      const goal = createGoal(db, "Goal", "Desc");
      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "a"),
        makeTask(goal.id, "b", { dependencies: ["a"] }),
      ]);

      const initiallyReady = getReadyTasks(db).map((task) => task.title);
      expect(initiallyReady).toContain("a");
      expect(initiallyReady).not.toContain("b");

      const a = getTasksByGoal(db, goal.id).find((task) => task.title === "a");
      if (!a) throw new Error("missing task a");
      completeTask(db, a.id, SUCCESS_RESULT);

      const readyAfter = getReadyTasks(db).map((task) => task.title);
      expect(readyAfter).toContain("b");
    });

    it("excludes non-pending tasks", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const pending = insertTask(db, { goalId: goal.id, title: "pending", description: "d", status: "pending" });
      insertTask(db, { goalId: goal.id, title: "assigned", description: "d", status: "assigned" });
      insertTask(db, { goalId: goal.id, title: "running", description: "d", status: "running" });
      insertTask(db, { goalId: goal.id, title: "completed", description: "d", status: "completed" });
      insertTask(db, { goalId: goal.id, title: "failed", description: "d", status: "failed" });
      insertTask(db, { goalId: goal.id, title: "blocked", description: "d", status: "blocked" });

      const readyIds = getReadyTasks(db).map((task) => task.id);
      expect(readyIds).toContain(pending);
      expect(readyIds).toHaveLength(1);
    });

    it("orders ready tasks by priority descending", () => {
      const goal = createGoal(db, "Goal", "Desc");
      insertTask(db, { goalId: goal.id, title: "low", description: "d", priority: 10 });
      insertTask(db, { goalId: goal.id, title: "high", description: "d", priority: 90 });
      insertTask(db, { goalId: goal.id, title: "mid", description: "d", priority: 50 });

      const readyTitles = getReadyTasks(db)
        .filter((task) => task.goalId === goal.id)
        .map((task) => task.title);

      expect(readyTitles.slice(0, 3)).toEqual(["high", "mid", "low"]);
    });
  });

  describe("assignTask", () => {
    it("updates status to assigned", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, { goalId: goal.id, title: "task", description: "desc" });

      assignTask(db, taskId, "0xabc");

      const task = getTaskById(db, taskId);
      expect(task?.status).toBe("assigned");
      expect(task?.assignedTo).toBe("0xabc");
    });

    it("trims agent address", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, { goalId: goal.id, title: "task", description: "desc" });
      assignTask(db, taskId, "   0xtrim   ");
      expect(getTaskById(db, taskId)?.assignedTo).toBe("0xtrim");
    });

    it("rejects empty agent address", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, { goalId: goal.id, title: "task", description: "desc" });
      expect(() => assignTask(db, taskId, "   ")).toThrow("agentAddress cannot be empty");
    });

    it("rejects non-pending tasks", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, { goalId: goal.id, title: "task", description: "desc", status: "blocked" });
      expect(() => assignTask(db, taskId, "0xagent")).toThrow(/is not assignable/);
    });

    it("rejects unknown task", () => {
      expect(() => assignTask(db, "missing", "0xagent")).toThrow("Task not found: missing");
    });
  });

  describe("completeTask", () => {
    it("marks task completed and writes result", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "task",
        description: "desc",
        status: "running",
      });

      completeTask(db, taskId, SUCCESS_RESULT);

      const task = getTaskById(db, taskId);
      expect(task?.status).toBe("completed");
      expect(task?.actualCostCents).toBe(123);
      expect(task?.result).toEqual(SUCCESS_RESULT);
      expect(task?.startedAt).toBeTruthy();
      expect(task?.completedAt).toBeTruthy();
    });

    it("unblocks dependents when a dependency completes", () => {
      const goal = createGoal(db, "Goal", "Desc");
      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "a"),
        makeTask(goal.id, "b", { dependencies: ["a"] }),
      ]);

      const a = getTasksByGoal(db, goal.id).find((task) => task.title === "a");
      const bBefore = getTasksByGoal(db, goal.id).find((task) => task.title === "b");
      expect(bBefore?.status).toBe("blocked");

      if (!a) throw new Error("missing task a");
      completeTask(db, a.id, SUCCESS_RESULT);

      const bAfter = getTasksByGoal(db, goal.id).find((task) => task.title === "b");
      expect(bAfter?.status).toBe("pending");
    });

    it("refreshes goal status to completed when all tasks complete", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const a = insertTask(db, { goalId: goal.id, title: "a", description: "d" });
      const b = insertTask(db, { goalId: goal.id, title: "b", description: "d" });

      completeTask(db, a, SUCCESS_RESULT);
      completeTask(db, b, SUCCESS_RESULT);

      expect(getGoalById(db, goal.id)?.status).toBe("completed");
      expect(getGoalById(db, goal.id)?.completedAt).toBeTruthy();
    });

    it("throws for unknown task", () => {
      expect(() => completeTask(db, "missing", SUCCESS_RESULT)).toThrow("Task not found: missing");
    });

    it("throws for terminal tasks", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "done",
        description: "desc",
        status: "completed",
      });

      expect(() => completeTask(db, taskId, SUCCESS_RESULT)).toThrow(/already in terminal status/);
    });
  });

  describe("failTask", () => {
    it("retries when retry budget remains and deps are satisfied", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "retry-me",
        description: "desc",
        status: "running",
        maxRetries: 2,
        retryCount: 0,
      });

      failTask(db, taskId, "boom", true);

      const task = getTaskById(db, taskId);
      expect(task?.status).toBe("pending");
      expect(task?.retryCount).toBe(1);
      expect(task?.assignedTo).toBeNull();
      expect(task?.completedAt).toBeNull();
      expect(task?.result).toMatchObject({ success: false, output: "boom" });
    });

    it("moves to blocked on retry when dependencies are not satisfied", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const depId = insertTask(db, {
        goalId: goal.id,
        title: "dep",
        description: "dep",
        status: "pending",
      });

      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "retry-blocked",
        description: "desc",
        status: "running",
        dependencies: [depId],
        maxRetries: 2,
        retryCount: 0,
      });

      failTask(db, taskId, "failed", true);
      expect(getTaskById(db, taskId)?.status).toBe("blocked");
    });

    it("clears started/completed timestamps on retry", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "retry",
        description: "desc",
        status: "running",
        maxRetries: 3,
        retryCount: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:10:00.000Z",
        assignedTo: "0xagent",
      });

      failTask(db, taskId, "oops", true);
      const task = getTaskById(db, taskId);
      expect(task?.startedAt).toBeNull();
      expect(task?.completedAt).toBeNull();
      expect(task?.assignedTo).toBeNull();
    });

    it("marks failed when shouldRetry is false", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "no-retry",
        description: "desc",
        status: "running",
      });

      failTask(db, taskId, "fatal", false);

      const task = getTaskById(db, taskId);
      expect(task?.status).toBe("failed");
      expect(task?.result).toMatchObject({ success: false, output: "fatal" });
    });

    it("marks failed when retries are exhausted", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "exhausted",
        description: "desc",
        status: "running",
        maxRetries: 1,
        retryCount: 1,
      });

      failTask(db, taskId, "fatal", true);
      expect(getTaskById(db, taskId)?.status).toBe("failed");
    });

    it("blocks dependent tasks on permanent failure", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const failed = insertTask(db, {
        goalId: goal.id,
        title: "upstream",
        description: "desc",
        status: "running",
      });
      const downstream = insertTask(db, {
        goalId: goal.id,
        title: "downstream",
        description: "desc",
        status: "pending",
        dependencies: [failed],
      });

      failTask(db, failed, "fatal", false);

      expect(getTaskById(db, failed)?.status).toBe("failed");
      expect(getTaskById(db, downstream)?.status).toBe("blocked");
    });

    it("marks goal failed on permanent task failure", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "task",
        description: "desc",
        status: "running",
      });

      failTask(db, taskId, "fatal", false);
      expect(getGoalById(db, goal.id)?.status).toBe("failed");
    });

    it("throws for unknown task", () => {
      expect(() => failTask(db, "missing", "err", true)).toThrow("Task not found: missing");
    });

    it("throws for terminal task", () => {
      const goal = createGoal(db, "Goal", "Desc");
      const taskId = insertTask(db, {
        goalId: goal.id,
        title: "done",
        description: "desc",
        status: "completed",
      });

      expect(() => failTask(db, taskId, "err", true)).toThrow(/already in terminal status/);
    });
  });

  describe("getGoalProgress", () => {
    it("returns accurate status counts", () => {
      const goal = createGoal(db, "Goal", "Desc");
      insertTask(db, { goalId: goal.id, title: "pending", description: "d", status: "pending" });
      insertTask(db, { goalId: goal.id, title: "completed", description: "d", status: "completed" });
      insertTask(db, { goalId: goal.id, title: "failed", description: "d", status: "failed" });
      insertTask(db, { goalId: goal.id, title: "blocked", description: "d", status: "blocked" });
      insertTask(db, { goalId: goal.id, title: "assigned", description: "d", status: "assigned" });
      insertTask(db, { goalId: goal.id, title: "running", description: "d", status: "running" });

      expect(getGoalProgress(db, goal.id)).toEqual({
        total: 6,
        completed: 1,
        failed: 1,
        blocked: 1,
        running: 2,
      });
    });

    it("returns zeros for unknown goal", () => {
      expect(getGoalProgress(db, "missing")).toEqual({
        total: 0,
        completed: 0,
        failed: 0,
        blocked: 0,
        running: 0,
      });
    });
  });

  describe("pruneCompletedGoals", () => {
    it("removes completed goals older than threshold", () => {
      const oldGoalId = insertGoal(db, {
        title: "old",
        description: "old",
        status: "completed",
        completedAt: "2025-01-01T00:00:00.000Z",
      });

      const newGoalId = insertGoal(db, {
        title: "new",
        description: "new",
        status: "completed",
        completedAt: "2026-12-31T00:00:00.000Z",
      });

      const activeGoalId = insertGoal(db, {
        title: "active",
        description: "active",
        status: "active",
      });

      const oldTask = insertTask(db, { goalId: oldGoalId, title: "old-task", description: "desc" });
      insertTask(db, { goalId: newGoalId, title: "new-task", description: "desc" });
      insertTask(db, { goalId: activeGoalId, title: "active-task", description: "desc" });

      pruneCompletedGoals(db, "2026-01-01T00:00:00.000Z");

      expect(getGoalById(db, oldGoalId)).toBeUndefined();
      expect(getTaskById(db, oldTask)).toBeUndefined();
      expect(getGoalById(db, newGoalId)).toBeDefined();
      expect(getGoalById(db, activeGoalId)).toBeDefined();
    });

    it("does not remove recent completed goals", () => {
      const goalId = insertGoal(db, {
        title: "recent",
        description: "desc",
        status: "completed",
        completedAt: "2026-06-01T00:00:00.000Z",
      });
      pruneCompletedGoals(db, "2026-01-01T00:00:00.000Z");
      expect(getGoalById(db, goalId)).toBeDefined();
    });
  });

  describe("detectCycles", () => {
    it("returns false for empty graph", () => {
      expect(detectCycles([])).toBe(false);
    });

    it("returns false for linear graph", () => {
      expect(detectCycles([
        { id: "a", dependencies: [] },
        { id: "b", dependencies: ["a"] },
        { id: "c", dependencies: ["b"] },
      ])).toBe(false);
    });

    it("detects simple dependency cycle", () => {
      expect(detectCycles([
        { id: "a", dependencies: ["b"] },
        { id: "b", dependencies: ["a"] },
      ])).toBe(true);
    });

    it("detects self-dependency cycle", () => {
      expect(detectCycles([
        { id: "a", dependencies: ["a"] },
      ])).toBe(true);
    });

    it("detects parent cycle", () => {
      expect(detectCycles([
        { id: "a", parentId: "b", dependencies: [] },
        { id: "b", parentId: "a", dependencies: [] },
      ])).toBe(true);
    });

    it("supports alias references by title/index/task-number", () => {
      expect(detectCycles([
        { title: "first", dependencies: ["task-2"] },
        { title: "second", dependencies: ["first"] },
      ])).toBe(true);
    });

    it("ignores references to unknown nodes", () => {
      expect(detectCycles([
        { id: "a", dependencies: ["missing"] },
        { id: "b", dependencies: ["a"] },
      ])).toBe(false);
    });
  });
});
