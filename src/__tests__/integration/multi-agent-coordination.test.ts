import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assignTask,
  completeTask,
  createGoal,
  decomposeGoal,
  failTask,
  getGoalProgress,
  getReadyTasks,
  type TaskNode,
  type TaskResult,
} from "../../orchestration/task-graph.js";
import { getGoalById, getTaskById, getTasksByGoal } from "../../state/database.js";
import { createInMemoryDb } from "../orchestration/test-db.js";

const SUCCESS_RESULT: TaskResult = {
  success: true,
  output: "ok",
  artifacts: [],
  costCents: 10,
  duration: 100,
};

type DecomposeInput = Omit<TaskNode, "id" | "metadata">;

function makeTask(goalId: string, title: string, overrides: Partial<DecomposeInput> = {}): DecomposeInput {
  return {
    parentId: null,
    goalId,
    title,
    description: `${title} desc`,
    status: "pending",
    assignedTo: null,
    agentRole: "generalist",
    priority: 50,
    dependencies: [],
    result: null,
    ...overrides,
  };
}

describe("integration/multi-agent-coordination", () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Parent assigns tasks to multiple children
  // ---------------------------------------------------------------------------

  describe("parent assigns tasks to multiple children", () => {
    it("decomposes goal into 3 parallel tasks that are all pending", () => {
      const goal = createGoal(db, "Multi-agent goal", "Run 3 tasks in parallel");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task Alpha"),
        makeTask(goal.id, "Task Beta"),
        makeTask(goal.id, "Task Gamma"),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      expect(tasks).toHaveLength(3);
      for (const task of tasks) {
        expect(task.status).toBe("pending");
        expect(task.dependencies).toEqual([]);
      }
    });

    it("all 3 parallel tasks appear in getReadyTasks", () => {
      const goal = createGoal(db, "Parallel goal", "All tasks ready immediately");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task Alpha"),
        makeTask(goal.id, "Task Beta"),
        makeTask(goal.id, "Task Gamma"),
      ]);

      const readyTitles = getReadyTasks(db)
        .filter((t) => t.goalId === goal.id)
        .map((t) => t.title);

      expect(readyTitles).toContain("Task Alpha");
      expect(readyTitles).toContain("Task Beta");
      expect(readyTitles).toContain("Task Gamma");
    });

    it("assigning each task to a different agent sets status to assigned", () => {
      const goal = createGoal(db, "Assignment goal", "Each task gets its own agent");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task Alpha"),
        makeTask(goal.id, "Task Beta"),
        makeTask(goal.id, "Task Gamma"),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const agents = ["0xagent1", "0xagent2", "0xagent3"];

      for (let i = 0; i < tasks.length; i++) {
        assignTask(db, tasks[i].id, agents[i]);
      }

      const updated = getTasksByGoal(db, goal.id);
      const assignedAgents = updated.map((t) => t.assignedTo).sort();
      expect(assignedAgents).toEqual(["0xagent1", "0xagent2", "0xagent3"].sort());
      for (const task of updated) {
        expect(task.status).toBe("assigned");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Task results collected via messaging
  // ---------------------------------------------------------------------------

  describe("task results collected via messaging", () => {
    it("completing each assigned task writes the result to that task", () => {
      const goal = createGoal(db, "Result collection goal", "Collect results from 3 agents");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task Alpha"),
        makeTask(goal.id, "Task Beta"),
        makeTask(goal.id, "Task Gamma"),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      for (const task of tasks) {
        completeTask(db, task.id, SUCCESS_RESULT);
      }

      const completed = getTasksByGoal(db, goal.id);
      for (const task of completed) {
        expect(task.status).toBe("completed");
        expect(task.result).toMatchObject({ success: true, output: "ok" });
      }
    });

    it("goal status becomes completed after all tasks complete", () => {
      const goal = createGoal(db, "Completion goal", "Goal finishes when all tasks done");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task Alpha"),
        makeTask(goal.id, "Task Beta"),
        makeTask(goal.id, "Task Gamma"),
      ]);

      const tasks = getTasksByGoal(db, goal.id);

      // Goal should still be active while tasks are in progress
      expect(getGoalById(db, goal.id)?.status).toBe("active");

      for (const task of tasks) {
        completeTask(db, task.id, SUCCESS_RESULT);
      }

      expect(getGoalById(db, goal.id)?.status).toBe("completed");
    });

    it("getGoalProgress shows total=3 completed=3 after all tasks finish", () => {
      const goal = createGoal(db, "Progress goal", "Track progress across 3 tasks");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task Alpha"),
        makeTask(goal.id, "Task Beta"),
        makeTask(goal.id, "Task Gamma"),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      for (const task of tasks) {
        completeTask(db, task.id, SUCCESS_RESULT);
      }

      const progress = getGoalProgress(db, goal.id);
      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(3);
      expect(progress.failed).toBe(0);
      expect(progress.blocked).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Dependency chain: A → B → C
  // ---------------------------------------------------------------------------

  describe("dependency chain: A completes → B unblocks → B assigned", () => {
    it("initially only Task A is pending; B and C are blocked", () => {
      const goal = createGoal(db, "Chain goal", "Linear dependency chain");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task A"),
        makeTask(goal.id, "Task B", { dependencies: ["Task A"] }),
        makeTask(goal.id, "Task C", { dependencies: ["Task B"] }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const taskA = tasks.find((t) => t.title === "Task A")!;
      const taskB = tasks.find((t) => t.title === "Task B")!;
      const taskC = tasks.find((t) => t.title === "Task C")!;

      expect(taskA.status).toBe("pending");
      expect(taskB.status).toBe("blocked");
      expect(taskC.status).toBe("blocked");
    });

    it("completing Task A unblocks Task B (B becomes pending)", () => {
      const goal = createGoal(db, "Chain goal", "Linear dependency chain");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task A"),
        makeTask(goal.id, "Task B", { dependencies: ["Task A"] }),
        makeTask(goal.id, "Task C", { dependencies: ["Task B"] }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const taskA = tasks.find((t) => t.title === "Task A")!;

      completeTask(db, taskA.id, SUCCESS_RESULT);

      const afterA = getTasksByGoal(db, goal.id);
      const taskB = afterA.find((t) => t.title === "Task B")!;
      const taskC = afterA.find((t) => t.title === "Task C")!;

      expect(taskB.status).toBe("pending");
      expect(taskC.status).toBe("blocked");
    });

    it("completing Task B unblocks Task C (C becomes pending)", () => {
      const goal = createGoal(db, "Chain goal", "Linear dependency chain");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task A"),
        makeTask(goal.id, "Task B", { dependencies: ["Task A"] }),
        makeTask(goal.id, "Task C", { dependencies: ["Task B"] }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const taskA = tasks.find((t) => t.title === "Task A")!;
      completeTask(db, taskA.id, SUCCESS_RESULT);

      const afterA = getTasksByGoal(db, goal.id);
      const taskB = afterA.find((t) => t.title === "Task B")!;
      completeTask(db, taskB.id, SUCCESS_RESULT);

      const afterB = getTasksByGoal(db, goal.id);
      const taskC = afterB.find((t) => t.title === "Task C")!;
      expect(taskC.status).toBe("pending");
    });

    it("completing Task C marks the goal as completed", () => {
      const goal = createGoal(db, "Chain goal", "Linear dependency chain");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task A"),
        makeTask(goal.id, "Task B", { dependencies: ["Task A"] }),
        makeTask(goal.id, "Task C", { dependencies: ["Task B"] }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const taskA = tasks.find((t) => t.title === "Task A")!;
      completeTask(db, taskA.id, SUCCESS_RESULT);

      const afterA = getTasksByGoal(db, goal.id);
      const taskB = afterA.find((t) => t.title === "Task B")!;
      completeTask(db, taskB.id, SUCCESS_RESULT);

      const afterB = getTasksByGoal(db, goal.id);
      const taskC = afterB.find((t) => t.title === "Task C")!;
      completeTask(db, taskC.id, SUCCESS_RESULT);

      expect(getGoalById(db, goal.id)?.status).toBe("completed");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Failure propagation
  // ---------------------------------------------------------------------------

  describe("failure propagation", () => {
    it("failing Task A permanently keeps Task B blocked", () => {
      const goal = createGoal(db, "Failure goal", "Propagate failure downstream");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task A"),
        makeTask(goal.id, "Task B", { dependencies: ["Task A"] }),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const taskA = tasks.find((t) => t.title === "Task A")!;

      failTask(db, taskA.id, "fatal error", false);

      const taskB = getTasksByGoal(db, goal.id).find((t) => t.title === "Task B")!;
      expect(getTaskById(db, taskA.id)?.status).toBe("failed");
      expect(taskB.status).toBe("blocked");
    });

    it("failing a task with retries remaining resets it back to pending", () => {
      const goal = createGoal(db, "Retry goal", "Task retries on transient failure");

      decomposeGoal(db, goal.id, [
        makeTask(goal.id, "Task A"),
        makeTask(goal.id, "Task B"),
      ]);

      const tasks = getTasksByGoal(db, goal.id);
      const taskB = tasks.find((t) => t.title === "Task B")!;

      // Give the task retry budget by updating directly via db before failing
      db.prepare(
        "UPDATE task_graph SET max_retries = 2, retry_count = 0, status = 'running' WHERE id = ?",
      ).run(taskB.id);

      failTask(db, taskB.id, "transient error", true);

      const retried = getTaskById(db, taskB.id);
      expect(retried?.status).toBe("pending");
      expect(retried?.retryCount).toBe(1);
      expect(retried?.assignedTo).toBeNull();
    });
  });
});
