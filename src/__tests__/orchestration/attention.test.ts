import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateTodoMd, injectTodoContext } from "../../orchestration/attention.js";
import { insertGoal, insertTask } from "../../state/database.js";
import type { ChatMessage } from "../../types.js";
import { createInMemoryDb } from "./test-db.js";

describe("orchestration/attention", () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  function createGoalWithTasks(params: {
    title: string;
    createdAt?: string;
    status?: "active" | "completed" | "failed" | "paused";
    tasks?: Array<{
      title: string;
      status?: "pending" | "assigned" | "running" | "completed" | "failed" | "blocked" | "cancelled";
      assignedTo?: string | null;
      estimatedCostCents?: number;
      actualCostCents?: number;
    }>;
  }): string {
    const goalId = insertGoal(db, {
      title: params.title,
      description: `${params.title} description`,
      status: params.status ?? "active",
    });

    if (params.createdAt) {
      db.prepare("UPDATE goals SET created_at = ? WHERE id = ?").run(params.createdAt, goalId);
    }

    for (const task of params.tasks ?? []) {
      insertTask(db, {
        goalId,
        title: task.title,
        description: `${task.title} description`,
        status: task.status ?? "pending",
        assignedTo: task.assignedTo ?? null,
        estimatedCostCents: task.estimatedCostCents ?? 0,
        actualCostCents: task.actualCostCents ?? 0,
      });
    }

    return goalId;
  }

  it("generateTodoMd returns empty string when no active goals", () => {
    expect(generateTodoMd(db)).toBe("");
  });

  it("includes markdown header", () => {
    createGoalWithTasks({ title: "Goal 1", tasks: [{ title: "Task 1" }] });
    expect(generateTodoMd(db).startsWith("# Active Goals\n\n")).toBe(true);
  });

  it("formats goal sections with budget and spend", () => {
    createGoalWithTasks({
      title: "Revenue Goal",
      tasks: [
        { title: "t1", estimatedCostCents: 1250, actualCostCents: 500 },
        { title: "t2", estimatedCostCents: 2750, actualCostCents: 1200 },
      ],
    });

    const todo = generateTodoMd(db);
    expect(todo).toContain("## Goal: Revenue Goal [$40.00 budget, $17.00 spent]");
  });

  it("formats completed tasks with checked marker and assignee", () => {
    createGoalWithTasks({
      title: "Goal",
      tasks: [{ title: "Done", status: "completed", assignedTo: "agent-1" }],
    });

    expect(generateTodoMd(db)).toContain("- [x] Done (completed by agent-1)");
  });

  it("uses unassigned fallback for completed tasks", () => {
    createGoalWithTasks({
      title: "Goal",
      tasks: [{ title: "Done", status: "completed" }],
    });

    expect(generateTodoMd(db)).toContain("- [x] Done (completed by unassigned)");
  });

  it("formats running tasks with in-progress marker", () => {
    createGoalWithTasks({
      title: "Goal",
      tasks: [{ title: "Run", status: "running", assignedTo: "agent-2" }],
    });

    expect(generateTodoMd(db)).toContain("- [~] Run (running — agent-2)");
  });

  it("formats blocked tasks as blocked", () => {
    createGoalWithTasks({
      title: "Goal",
      tasks: [{ title: "Blocked", status: "blocked" }],
    });

    expect(generateTodoMd(db)).toContain("- [ ] Blocked (blocked)");
  });

  it("formats pending tasks as pending", () => {
    createGoalWithTasks({
      title: "Goal",
      tasks: [{ title: "Pending", status: "pending" }],
    });

    expect(generateTodoMd(db)).toContain("- [ ] Pending (pending)");
  });

  it("formats assigned tasks as pending in todo view", () => {
    createGoalWithTasks({
      title: "Goal",
      tasks: [{ title: "Assigned", status: "assigned", assignedTo: "agent-3" }],
    });

    expect(generateTodoMd(db)).toContain("- [ ] Assigned (pending)");
  });

  it("renders goals in created_at ascending order", () => {
    createGoalWithTasks({ title: "Old Goal", createdAt: "2026-01-01T00:00:00.000Z", tasks: [{ title: "a" }] });
    createGoalWithTasks({ title: "New Goal", createdAt: "2026-02-01T00:00:00.000Z", tasks: [{ title: "b" }] });

    const todo = generateTodoMd(db);
    expect(todo.indexOf("Old Goal")).toBeLessThan(todo.indexOf("New Goal"));
  });

  it("ignores non-active goals", () => {
    createGoalWithTasks({ title: "Completed Goal", status: "completed", tasks: [{ title: "x" }] });
    createGoalWithTasks({ title: "Active Goal", status: "active", tasks: [{ title: "y" }] });

    const todo = generateTodoMd(db);
    expect(todo).toContain("Active Goal");
    expect(todo).not.toContain("Completed Goal");
  });

  it("renders section even when goal has no tasks", () => {
    createGoalWithTasks({ title: "Taskless" });
    const todo = generateTodoMd(db);
    expect(todo).toContain("## Goal: Taskless [$0.00 budget, $0.00 spent]");
  });

  it("injectTodoContext appends a system message", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
    const output = injectTodoContext(messages, "# Active Goals");

    expect(output).toHaveLength(2);
    expect(output[1]).toEqual({
      role: "system",
      content: "## Current Goals & Tasks\n\n# Active Goals",
    });
  });

  it("injectTodoContext preserves existing message order", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "s1" },
      { role: "user", content: "u1" },
    ];

    const output = injectTodoContext(messages, "todo");
    expect(output[0].content).toBe("s1");
    expect(output[1].content).toBe("u1");
    expect(output[2].role).toBe("system");
  });

  it("injectTodoContext returns unchanged messages when todo is empty", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
    expect(injectTodoContext(messages, "")).toBe(messages);
  });

  it("injectTodoContext returns unchanged messages when todo is whitespace", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
    expect(injectTodoContext(messages, "   \n\t")).toBe(messages);
  });

  it("truncates large todo sets by dropping oldest goals", () => {
    for (let i = 0; i < 8; i += 1) {
      const title = `Goal-${i}-${"x".repeat(1100)}`;
      createGoalWithTasks({
        title,
        createdAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        tasks: [{ title: `Task-${i}-${"y".repeat(400)}` }],
      });
    }

    const todo = generateTodoMd(db);
    expect(todo).toContain("Goal-7-");
    expect(todo).not.toContain("Goal-0-");
    expect(todo).not.toContain("Goal-1-");
  });

  it("truncation always keeps at least one goal", () => {
    createGoalWithTasks({
      title: `Huge-${"g".repeat(9000)}`,
      tasks: [{ title: `Task-${"t".repeat(4000)}` }],
    });

    const todo = generateTodoMd(db);
    expect(todo).toContain("Huge-");
    expect(todo).toContain("# Active Goals");
  });

  it("does not truncate when under token estimate limit", () => {
    createGoalWithTasks({ title: "G1", tasks: [{ title: "T1" }] });
    createGoalWithTasks({ title: "G2", tasks: [{ title: "T2" }] });

    const todo = generateTodoMd(db);
    expect(todo).toContain("G1");
    expect(todo).toContain("G2");
  });

  it("returns deterministic markdown for multiple goals", () => {
    createGoalWithTasks({ title: "Alpha", createdAt: "2026-01-01T00:00:00.000Z", tasks: [{ title: "a1" }] });
    createGoalWithTasks({ title: "Beta", createdAt: "2026-01-02T00:00:00.000Z", tasks: [{ title: "b1" }] });

    const todo = generateTodoMd(db);
    expect(todo).toContain("## Goal: Alpha");
    expect(todo).toContain("## Goal: Beta");
    expect(todo.indexOf("## Goal: Alpha")).toBeLessThan(todo.indexOf("## Goal: Beta"));
  });
});
