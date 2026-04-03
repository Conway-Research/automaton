/**
 * Orchestrator Deadlock Recovery Tests
 *
 * Tests for the deadlock detection and stale worker recovery
 * improvements addressing issues #266 and #259.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { ColonyMessaging } from "../orchestration/messaging.js";
import { insertGoal, insertTask } from "../state/database.js";
import { createTestDb, createTestIdentity, MockInferenceClient } from "./mocks.js";
import type { AutomatonDatabase } from "../types.js";
import type { AgentTracker, FundingProtocol } from "../orchestration/types.js";
import { UnifiedInferenceClient } from "../inference/inference-client.js";

function createMockAgentTracker(): AgentTracker & { statuses: Record<string, string> } {
  const statuses: Record<string, string> = {};
  return {
    statuses,
    getIdle() {
      return Object.entries(statuses)
        .filter(([, s]) => s === "idle")
        .map(([addr]) => ({ address: addr, name: addr, role: "generalist", status: "idle" }));
    },
    getBestForTask() {
      return null;
    },
    updateStatus(address: string, status: string) {
      statuses[address] = status;
    },
    register(agent: { address: string; name: string; role: string; sandboxId: string }) {
      statuses[agent.address] = "idle";
    },
  };
}

function createMockFunding(): FundingProtocol {
  return {
    async fundChild() { return { success: true }; },
    async recallCredits() { return { success: true, amountCents: 0 }; },
    async getBalance() { return 0; },
  };
}

function setupOrchestrator(
  db: AutomatonDatabase,
  opts: {
    isWorkerAlive?: (addr: string) => boolean;
    agentTracker?: AgentTracker;
  } = {},
) {
  const identity = createTestIdentity();
  const agentTracker = opts.agentTracker ?? createMockAgentTracker();
  const messaging = new ColonyMessaging(db.raw, identity.address);
  const inference = new UnifiedInferenceClient(new MockInferenceClient(), "normal");

  return new Orchestrator({
    db: db.raw,
    agentTracker,
    funding: createMockFunding(),
    messaging,
    inference,
    identity,
    config: {},
    isWorkerAlive: opts.isWorkerAlive,
  });
}

describe("Orchestrator deadlock recovery", () => {
  let db: AutomatonDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  it("marks dead workers as dead in agent tracker during recovery", async () => {
    const tracker = createMockAgentTracker();
    tracker.statuses["local://worker-1"] = "running";

    const orchestrator = setupOrchestrator(db, {
      agentTracker: tracker,
      isWorkerAlive: (addr) => addr !== "local://worker-1" ? true : false,
    });

    // Create a goal with a task assigned to dead worker
    const goalId = insertGoal(db.raw, {
      title: "Test goal",
      description: "Test",
      status: "active",
    });
    insertTask(db.raw, {
      goalId,
      title: "Test task",
      description: "Test",
      status: "assigned",
      assignedTo: "local://worker-1",
    });

    // Set orchestrator state to executing
    db.raw.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    ).run("orchestrator.state", JSON.stringify({
      phase: "executing",
      goalId,
      replanCount: 0,
      failedTaskId: null,
      failedError: null,
    }));

    await orchestrator.tick();

    // The dead worker should be marked as dead
    expect(tracker.statuses["local://worker-1"]).toBe("dead");
  });

  it("fails task after exceeding max stale recovery attempts", async () => {
    const orchestrator = setupOrchestrator(db, {
      isWorkerAlive: () => false, // worker is always dead
    });

    const goalId = insertGoal(db.raw, {
      title: "Test goal",
      description: "Test",
      status: "active",
    });
    const taskId = insertTask(db.raw, {
      goalId,
      title: "Doomed task",
      description: "This task will keep failing",
      status: "assigned",
      assignedTo: "local://dead-worker",
    });

    // Pre-set recovery count to max (3) so next recovery exceeds limit
    db.raw.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    ).run(`orchestrator.stale_recovery.${taskId}`, "3");

    db.raw.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    ).run("orchestrator.state", JSON.stringify({
      phase: "executing",
      goalId,
      replanCount: 0,
      failedTaskId: null,
      failedError: null,
    }));

    const result = await orchestrator.tick();

    // Task should now be failed, not pending
    const task = db.raw.prepare("SELECT status FROM task_graph WHERE id = ?").get(taskId) as { status: string };
    expect(task.status).toBe("failed");
    expect(result.tasksFailed).toBeGreaterThanOrEqual(1);
  });

  it("increments recovery count on each stale recovery", async () => {
    const tracker = createMockAgentTracker();
    const orchestrator = setupOrchestrator(db, {
      agentTracker: tracker,
      isWorkerAlive: () => false,
    });

    const goalId = insertGoal(db.raw, {
      title: "Test goal",
      description: "Test",
      status: "active",
    });
    const taskId = insertTask(db.raw, {
      goalId,
      title: "Recovering task",
      description: "Test",
      status: "assigned",
      assignedTo: "local://worker-1",
    });

    db.raw.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    ).run("orchestrator.state", JSON.stringify({
      phase: "executing",
      goalId,
      replanCount: 0,
      failedTaskId: null,
      failedError: null,
    }));

    await orchestrator.tick();

    // Check recovery count incremented
    const row = db.raw.prepare(
      "SELECT value FROM kv WHERE key = ?",
    ).get(`orchestrator.stale_recovery.${taskId}`) as { value: string } | undefined;
    expect(row?.value).toBe("1");
  });
});
