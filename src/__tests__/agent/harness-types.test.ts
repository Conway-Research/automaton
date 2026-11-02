import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildWisdomFromGoal, createBudgetFromTask, emptyWisdom } from "../../agent/harness-types.js";
import type { TaskNode } from "../../orchestration/task-graph.js";
import { AgentWorkspace } from "../../orchestration/workspace.js";
import { createInMemoryDb } from "../orchestration/test-db.js";

describe("agent/harness-types", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function createTask(overrides: Partial<TaskNode> = {}): TaskNode {
    return {
      id: "task-1",
      parentId: null,
      goalId: "goal-1",
      title: "Task",
      description: "Description",
      status: "pending",
      assignedTo: null,
      agentRole: "generalist",
      priority: 50,
      dependencies: [],
      result: null,
      metadata: {
        estimatedCostCents: 25,
        actualCostCents: 0,
        maxRetries: 0,
        retryCount: 0,
        timeoutMs: 120_000,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      },
      ...overrides,
    };
  }

  it("creates a budget from task defaults", () => {
    const budget = createBudgetFromTask(createTask());
    expect(budget.maxTurns).toBe(25);
    expect(budget.maxCostCents).toBe(50);
    expect(budget.timeoutMs).toBe(120_000);
    expect(budget.turnsUsed).toBe(0);
  });

  it("returns a stable empty wisdom object", () => {
    expect(emptyWisdom()).toEqual({ conventions: [], successes: [], failures: [], gotchas: [] });
  });

  it("builds wisdom from completed/failed goal tasks and workspace decisions", () => {
    const db = createInMemoryDb();
    tempDir = mkdtempSync(path.join(os.tmpdir(), "harness-wisdom-"));
    const workspace = new AgentWorkspace("goal-1", path.join(tempDir, "workspace"));

    db.prepare(
      "INSERT INTO goals (id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("goal-1", "Goal", "Goal description", "active", new Date().toISOString());

    db.prepare(
      `INSERT INTO task_graph (
        id, goal_id, title, description, status, priority, dependencies, result, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "task-completed",
      "goal-1",
      "Completed",
      "Completed task",
      "completed",
      50,
      JSON.stringify([]),
      JSON.stringify({ success: true, output: "Use tabs not spaces.", artifacts: [], costCents: 0, duration: 1 }),
      new Date().toISOString(),
    );

    db.prepare(
      `INSERT INTO task_graph (
        id, goal_id, title, description, status, priority, dependencies, result, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "task-failed",
      "goal-1",
      "Failed",
      "Failed task",
      "failed",
      50,
      JSON.stringify([]),
      JSON.stringify({ success: false, output: "Avoid retrying this endpoint.", artifacts: [], costCents: 0, duration: 1 }),
      new Date().toISOString(),
    );

    workspace.logDecision("Convention", "Prefer named exports", "executor");
    workspace.logDecision("Gotcha", "API rate limits after 10 requests", "executor");

    const wisdom = buildWisdomFromGoal(db, "goal-1", workspace);
    expect(wisdom.successes[0]).toContain("Use tabs not spaces");
    expect(wisdom.successes[0]).toContain('Unverified internal completion');
    expect(wisdom.successes[0]).toContain('not independent quality or economic evidence');
    expect(wisdom.failures[0]).toContain("Avoid retrying this endpoint");
    expect(wisdom.conventions.some((entry) => entry.includes("Convention"))).toBe(true);
    expect(wisdom.gotchas.some((entry) => entry.includes("Gotcha"))).toBe(true);

    db.close();
  });
});
