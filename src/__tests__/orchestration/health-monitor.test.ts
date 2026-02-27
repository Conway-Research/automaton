import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HealthMonitor,
  type AgentHealthStatus,
  type HealthReport,
} from "../../orchestration/health-monitor.js";
import { createInMemoryDb } from "./test-db.js";

// ---------------------------------------------------------------------------
// Mock AutomatonDatabase
// ---------------------------------------------------------------------------

function createMockAutomatonDb(db: BetterSqlite3.Database) {
  return {
    raw: db,
    getChildren: () => {
      return db
        .prepare(
          `SELECT
             id,
             name,
             address,
             sandbox_id        AS sandboxId,
             genesis_prompt    AS genesisPrompt,
             creator_message   AS creatorMessage,
             funded_amount_cents AS fundedAmountCents,
             status,
             created_at        AS createdAt,
             last_checked      AS lastChecked
           FROM children`,
        )
        .all();
    },
    getUnprocessedInboxMessages: () => [],
    markInboxMessageProcessed: vi.fn(),
    getIdentity: () => "0xparent",
    updateChildStatus: (id: string, status: string) => {
      db.prepare("UPDATE children SET status = ? WHERE id = ?").run(status, id);
    },
  } as any;
}

// ---------------------------------------------------------------------------
// Mock AgentTracker, FundingProtocol, ColonyMessaging
// ---------------------------------------------------------------------------

function createMockTracker(
  idle: { address: string; name: string; role: string; status: string }[] = [],
  best: { address: string; name: string } | null = null,
) {
  return {
    getIdle: vi.fn().mockReturnValue(idle),
    getBestForTask: vi.fn().mockReturnValue(best),
    updateStatus: vi.fn(),
    register: vi.fn(),
  };
}

function createMockFunding(balance = 100, fundSuccess = true) {
  return {
    getBalance: vi.fn().mockResolvedValue(balance),
    fundChild: vi.fn().mockResolvedValue({ success: fundSuccess }),
    recallCredits: vi.fn().mockResolvedValue({ success: true, amountCents: 0 }),
  };
}

function createMockMessaging() {
  return {
    createMessage: vi.fn().mockReturnValue({
      id: "m1",
      type: "shutdown_request",
      from: "0xparent",
      to: "",
      goalId: null,
      taskId: null,
      content: "",
      priority: "high",
      requiresResponse: false,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    }),
    send: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function insertChild(
  db: BetterSqlite3.Database,
  opts: {
    id: string;
    name: string;
    address: string;
    status: string;
    lastChecked?: string | null;
  },
) {
  db.prepare(
    `INSERT INTO children
       (id, name, address, sandbox_id, genesis_prompt, funded_amount_cents, status, created_at, last_checked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.id,
    opts.name,
    opts.address,
    "sb-1",
    "test",
    0,
    opts.status,
    new Date().toISOString(),
    opts.lastChecked ?? null,
  );
}

function insertGoal(db: BetterSqlite3.Database, id: string) {
  db.prepare(
    `INSERT INTO goals (id, title, description, status, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, "Test Goal", "Test goal description", "active", new Date().toISOString());
}

function insertTask(
  db: BetterSqlite3.Database,
  opts: {
    id: string;
    goalId: string;
    assignedTo: string;
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
    timeoutMs?: number;
    retryCount?: number;
    maxRetries?: number;
    createdAt?: string;
  },
) {
  const createdAt = opts.createdAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO task_graph
       (id, goal_id, title, description, status, assigned_to, started_at, completed_at,
        timeout_ms, retry_count, max_retries, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.id,
    opts.goalId,
    `Task ${opts.id}`,
    "Description",
    opts.status,
    opts.assignedTo,
    opts.startedAt ?? null,
    opts.completedAt ?? null,
    opts.timeoutMs ?? 300000,
    opts.retryCount ?? 0,
    opts.maxRetries ?? 3,
    createdAt,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("orchestration/health-monitor", () => {
  let db: BetterSqlite3.Database;
  let mockDb: ReturnType<typeof createMockAutomatonDb>;
  let mockTracker: ReturnType<typeof createMockTracker>;
  let mockFunding: ReturnType<typeof createMockFunding>;
  let mockMessaging: ReturnType<typeof createMockMessaging>;
  let monitor: HealthMonitor;

  beforeEach(() => {
    db = createInMemoryDb();
    mockDb = createMockAutomatonDb(db);
    mockTracker = createMockTracker();
    mockFunding = createMockFunding();
    mockMessaging = createMockMessaging();
    monitor = new HealthMonitor(mockDb, mockTracker, mockFunding, mockMessaging);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // checkAll
  // -------------------------------------------------------------------------

  describe("checkAll", () => {
    it("returns empty report when no children", async () => {
      const report = await monitor.checkAll();

      expect(report.totalAgents).toBe(0);
      expect(report.healthyAgents).toBe(0);
      expect(report.unhealthyAgents).toBe(0);
      expect(report.deadAgents).toBe(0);
      expect(report.agents).toEqual([]);
      expect(report.timestamp).toBeTruthy();
    });

    it("reports healthy agent with recent heartbeat", async () => {
      const recentHb = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
      insertChild(db, {
        id: "c1",
        name: "Agent1",
        address: "0xchild1",
        status: "running",
        lastChecked: recentHb,
      });

      const report = await monitor.checkAll();

      expect(report.totalAgents).toBe(1);
      expect(report.healthyAgents).toBe(1);
      expect(report.unhealthyAgents).toBe(0);

      const agent = report.agents[0];
      expect(agent.healthy).toBe(true);
      expect(agent.issues).toEqual([]);
      expect(agent.address).toBe("0xchild1");
    });

    it("reports unhealthy when status is 'dead'", async () => {
      insertChild(db, {
        id: "c1",
        name: "DeadAgent",
        address: "0xdead",
        status: "dead",
        lastChecked: new Date(Date.now() - 60_000).toISOString(),
      });

      const report = await monitor.checkAll();

      const agent = report.agents[0];
      expect(agent.healthy).toBe(false);
      expect(agent.issues).toContain("process_crashed");
    });

    it("reports unhealthy when status is 'failed'", async () => {
      insertChild(db, {
        id: "c1",
        name: "FailedAgent",
        address: "0xfailed",
        status: "failed",
        lastChecked: new Date(Date.now() - 60_000).toISOString(),
      });

      const report = await monitor.checkAll();

      expect(report.agents[0].healthy).toBe(false);
      expect(report.agents[0].issues).toContain("process_crashed");
    });

    it("reports unhealthy when status is 'stopped'", async () => {
      insertChild(db, {
        id: "c1",
        name: "StoppedAgent",
        address: "0xstopped",
        status: "stopped",
        lastChecked: new Date(Date.now() - 60_000).toISOString(),
      });

      const report = await monitor.checkAll();

      expect(report.agents[0].healthy).toBe(false);
      expect(report.agents[0].issues).toContain("process_crashed");
    });

    it("handles agent with 'unknown' status as crashed", async () => {
      insertChild(db, {
        id: "c1",
        name: "UnknownAgent",
        address: "0xunknown",
        status: "unknown",
        lastChecked: new Date(Date.now() - 60_000).toISOString(),
      });

      const report = await monitor.checkAll();

      expect(report.agents[0].healthy).toBe(false);
      expect(report.agents[0].issues).toContain("process_crashed");
    });

    it("handles agent with no heartbeat (no last_checked, no events)", async () => {
      insertChild(db, {
        id: "c1",
        name: "NoHB",
        address: "0xnohb",
        status: "running",
        lastChecked: null,
      });

      const report = await monitor.checkAll();

      const agent = report.agents[0];
      expect(agent.healthy).toBe(false);
      expect(agent.issues).toContain("heartbeat_missing");
      expect(agent.lastHeartbeat).toBeNull();
    });

    it("detects stuck task when running duration exceeds timeout + grace", async () => {
      const recentHb = new Date(Date.now() - 60_000).toISOString();
      insertChild(db, {
        id: "c1",
        name: "StuckAgent",
        address: "0xstuck",
        status: "running",
        lastChecked: recentHb,
      });

      insertGoal(db, "g1");
      // isTaskStuck uses Math.max(timeoutMs, HEARTBEAT_STALE_MS=900000) + TASK_STUCK_GRACE_MS=120000
      // so threshold = max(300000, 900000) + 120000 = 1020000ms; use 1100000ms to be safely over
      const oldStart = new Date(Date.now() - 1_100_000).toISOString();
      insertTask(db, {
        id: "t1",
        goalId: "g1",
        assignedTo: "0xstuck",
        status: "running",
        startedAt: oldStart,
        timeoutMs: 300000,
      });

      const report = await monitor.checkAll();

      const agent = report.agents[0];
      expect(agent.healthy).toBe(false);
      expect(agent.issues).toContain("stuck_on_task");
      expect(agent.currentTaskId).toBe("t1");
    });

    it("detects out_of_credits when balance < 10 cents", async () => {
      mockFunding.getBalance.mockResolvedValue(5); // below MIN_INFERENCE_CREDITS_CENTS = 10
      const recentHb = new Date(Date.now() - 60_000).toISOString();
      insertChild(db, {
        id: "c1",
        name: "BrokeAgent",
        address: "0xbroke",
        status: "running",
        lastChecked: recentHb,
      });

      const report = await monitor.checkAll();

      const agent = report.agents[0];
      expect(agent.healthy).toBe(false);
      expect(agent.issues).toContain("out_of_credits");
      expect(agent.creditBalance).toBe(5);
    });

    it("detects error_loop when error rate >= 60% with >= 3 samples", async () => {
      const recentHb = new Date(Date.now() - 60_000).toISOString();
      insertChild(db, {
        id: "c1",
        name: "ErrorLoopAgent",
        address: "0xerrorloop",
        status: "running",
        lastChecked: recentHb,
      });

      insertGoal(db, "g1");
      // 3 failed, 2 completed = 60% error rate, 5 samples
      for (let i = 0; i < 5; i++) {
        insertTask(db, {
          id: `t${i}`,
          goalId: "g1",
          assignedTo: "0xerrorloop",
          status: i < 3 ? "failed" : "completed",
          completedAt: new Date().toISOString(),
        });
      }

      const report = await monitor.checkAll();

      const agent = report.agents[0];
      expect(agent.healthy).toBe(false);
      expect(agent.issues).toContain("error_loop");
      expect(agent.errorRate).toBeGreaterThanOrEqual(0.6);
    });

    it("reports deadAgents count correctly", async () => {
      const recentHb = new Date(Date.now() - 60_000).toISOString();
      insertChild(db, { id: "c1", name: "A1", address: "0xa1", status: "running", lastChecked: recentHb });
      insertChild(db, { id: "c2", name: "A2", address: "0xa2", status: "dead", lastChecked: recentHb });
      insertChild(db, { id: "c3", name: "A3", address: "0xa3", status: "failed", lastChecked: recentHb });
      insertChild(db, { id: "c4", name: "A4", address: "0xa4", status: "stopped", lastChecked: recentHb });

      const report = await monitor.checkAll();

      // dead, failed, stopped all count as dead statuses
      expect(report.deadAgents).toBe(3);
      expect(report.totalAgents).toBe(4);
    });

    it("handles multiple agents with mixed health", async () => {
      mockFunding.getBalance
        .mockResolvedValueOnce(100) // healthy agent
        .mockResolvedValueOnce(0); // out of credits

      const recentHb = new Date(Date.now() - 60_000).toISOString();
      insertChild(db, { id: "c1", name: "Healthy", address: "0xhealthy", status: "running", lastChecked: recentHb });
      insertChild(db, { id: "c2", name: "Broke", address: "0xbroke2", status: "running", lastChecked: recentHb });

      const report = await monitor.checkAll();

      expect(report.totalAgents).toBe(2);
      expect(report.healthyAgents).toBe(1);
      expect(report.unhealthyAgents).toBe(1);

      const healthy = report.agents.find((a) => a.address === "0xhealthy");
      const broke = report.agents.find((a) => a.address === "0xbroke2");
      expect(healthy?.healthy).toBe(true);
      expect(broke?.healthy).toBe(false);
      expect(broke?.issues).toContain("out_of_credits");
    });
  });

  // -------------------------------------------------------------------------
  // autoHeal
  // -------------------------------------------------------------------------

  describe("autoHeal", () => {
    it("returns empty array for empty report", async () => {
      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 0,
        healthyAgents: 0,
        unhealthyAgents: 0,
        deadAgents: 0,
        agents: [],
      };

      const actions = await monitor.autoHeal(report);
      expect(actions).toEqual([]);
    });

    it("skips healthy agents", async () => {
      const healthyAgent: AgentHealthStatus = {
        address: "0xhealthy",
        name: "Healthy",
        status: "running",
        healthy: true,
        lastHeartbeat: new Date().toISOString(),
        currentTaskId: null,
        creditBalance: 100,
        errorRate: 0,
        issues: [],
      };

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 1,
        healthyAgents: 1,
        unhealthyAgents: 0,
        deadAgents: 0,
        agents: [healthyAgent],
      };

      const actions = await monitor.autoHeal(report);
      expect(actions).toEqual([]);
      expect(mockFunding.fundChild).not.toHaveBeenCalled();
      expect(mockMessaging.send).not.toHaveBeenCalled();
    });

    it("funds agent when out_of_credits", async () => {
      const agent: AgentHealthStatus = {
        address: "0xbroke",
        name: "Broke",
        status: "running",
        healthy: false,
        lastHeartbeat: new Date().toISOString(),
        currentTaskId: null,
        creditBalance: 5,
        errorRate: 0,
        issues: ["out_of_credits"],
      };

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 1,
        healthyAgents: 0,
        unhealthyAgents: 1,
        deadAgents: 0,
        agents: [agent],
      };

      const actions = await monitor.autoHeal(report);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("fund");
      expect(actions[0].agentAddress).toBe("0xbroke");
      expect(actions[0].success).toBe(true);
      expect(mockFunding.fundChild).toHaveBeenCalledWith("0xbroke", expect.any(Number));
    });

    it("restarts agent when process_crashed", async () => {
      const agent: AgentHealthStatus = {
        address: "0xcrashed",
        name: "Crashed",
        status: "dead",
        healthy: false,
        lastHeartbeat: null,
        currentTaskId: null,
        creditBalance: 100,
        errorRate: 0,
        issues: ["process_crashed"],
      };

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 1,
        healthyAgents: 0,
        unhealthyAgents: 1,
        deadAgents: 1,
        agents: [agent],
      };

      const actions = await monitor.autoHeal(report);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("restart");
      expect(actions[0].agentAddress).toBe("0xcrashed");
      expect(actions[0].success).toBe(true);
      expect(mockMessaging.send).toHaveBeenCalled();
      expect(mockTracker.updateStatus).toHaveBeenCalledWith("0xcrashed", "starting");
    });

    it("reassigns task when stuck_on_task detected", async () => {
      insertGoal(db, "g1");
      insertTask(db, {
        id: "t1",
        goalId: "g1",
        assignedTo: "0xstuck",
        status: "running",
        startedAt: new Date(Date.now() - 1_100_000).toISOString(),
        timeoutMs: 300000,
        retryCount: 0,
        maxRetries: 3,
      });

      const agent: AgentHealthStatus = {
        address: "0xstuck",
        name: "Stuck",
        status: "running",
        healthy: false,
        lastHeartbeat: new Date().toISOString(),
        currentTaskId: "t1",
        creditBalance: 100,
        errorRate: 0,
        issues: ["stuck_on_task"],
      };

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 1,
        healthyAgents: 0,
        unhealthyAgents: 1,
        deadAgents: 0,
        agents: [agent],
      };

      const actions = await monitor.autoHeal(report);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("reassign");
      expect(actions[0].agentAddress).toBe("0xstuck");
      expect(actions[0].success).toBe(true);
    });

    it("stops agent when error_loop detected", async () => {
      const agent: AgentHealthStatus = {
        address: "0xerrorloop",
        name: "ErrorLoop",
        status: "running",
        healthy: false,
        lastHeartbeat: new Date().toISOString(),
        currentTaskId: null,
        creditBalance: 100,
        errorRate: 0.8,
        issues: ["error_loop"],
      };

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 1,
        healthyAgents: 0,
        unhealthyAgents: 1,
        deadAgents: 0,
        agents: [agent],
      };

      const actions = await monitor.autoHeal(report);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("stop");
      expect(actions[0].agentAddress).toBe("0xerrorloop");
      expect(mockMessaging.send).toHaveBeenCalled();
      expect(mockTracker.updateStatus).toHaveBeenCalledWith("0xerrorloop", "stopped");
    });

    it("handles funding failure gracefully", async () => {
      mockFunding.fundChild.mockResolvedValue({ success: false });

      const agent: AgentHealthStatus = {
        address: "0xbroke",
        name: "Broke",
        status: "running",
        healthy: false,
        lastHeartbeat: new Date().toISOString(),
        currentTaskId: null,
        creditBalance: 0,
        errorRate: 0,
        issues: ["out_of_credits"],
      };

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 1,
        healthyAgents: 0,
        unhealthyAgents: 1,
        deadAgents: 0,
        agents: [agent],
      };

      const actions = await monitor.autoHeal(report);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("fund");
      expect(actions[0].success).toBe(false);
    });

    it("reassign resets task to pending when no replacement available", async () => {
      mockTracker.getIdle.mockReturnValue([]);
      mockTracker.getBestForTask.mockReturnValue(null);

      insertGoal(db, "g1");
      insertTask(db, {
        id: "t1",
        goalId: "g1",
        assignedTo: "0xstuck",
        status: "running",
        startedAt: new Date(Date.now() - 1_100_000).toISOString(),
        timeoutMs: 300000,
        retryCount: 0,
        maxRetries: 3,
      });

      const agent: AgentHealthStatus = {
        address: "0xstuck",
        name: "Stuck",
        status: "running",
        healthy: false,
        lastHeartbeat: new Date().toISOString(),
        currentTaskId: "t1",
        creditBalance: 100,
        errorRate: 0,
        issues: ["stuck_on_task"],
      };

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 1,
        healthyAgents: 0,
        unhealthyAgents: 1,
        deadAgents: 0,
        agents: [agent],
      };

      const actions = await monitor.autoHeal(report);

      expect(actions[0].type).toBe("reassign");
      expect(actions[0].success).toBe(true);
      expect(actions[0].reason).toContain("pending");

      // Verify task was reset to pending in the DB
      const task = db.prepare("SELECT status, assigned_to FROM task_graph WHERE id = 't1'").get() as {
        status: string;
        assigned_to: string | null;
      };
      expect(task.status).toBe("pending");
      expect(task.assigned_to).toBeNull();
    });

    it("reassign fails task when max retries exceeded", async () => {
      insertGoal(db, "g1");
      insertTask(db, {
        id: "t1",
        goalId: "g1",
        assignedTo: "0xstuck",
        status: "running",
        startedAt: new Date(Date.now() - 1_100_000).toISOString(),
        timeoutMs: 300000,
        retryCount: 3, // already at max
        maxRetries: 3,
      });

      const agent: AgentHealthStatus = {
        address: "0xstuck",
        name: "Stuck",
        status: "running",
        healthy: false,
        lastHeartbeat: new Date().toISOString(),
        currentTaskId: "t1",
        creditBalance: 100,
        errorRate: 0,
        issues: ["stuck_on_task"],
      };

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 1,
        healthyAgents: 0,
        unhealthyAgents: 1,
        deadAgents: 0,
        agents: [agent],
      };

      const actions = await monitor.autoHeal(report);

      expect(actions[0].type).toBe("reassign");
      expect(actions[0].success).toBe(false);
      expect(actions[0].reason).toContain("max retries");

      // Verify task was marked failed
      const task = db.prepare("SELECT status FROM task_graph WHERE id = 't1'").get() as { status: string };
      expect(task.status).toBe("failed");
    });

    it("returns multiple actions for multiple unhealthy agents", async () => {
      insertGoal(db, "g1");
      insertTask(db, {
        id: "t1",
        goalId: "g1",
        assignedTo: "0xstuck",
        status: "running",
        startedAt: new Date(Date.now() - 1_100_000).toISOString(),
        timeoutMs: 300000,
        retryCount: 0,
        maxRetries: 3,
      });

      const agents: AgentHealthStatus[] = [
        {
          address: "0xbroke",
          name: "Broke",
          status: "running",
          healthy: false,
          lastHeartbeat: new Date().toISOString(),
          currentTaskId: null,
          creditBalance: 0,
          errorRate: 0,
          issues: ["out_of_credits"],
        },
        {
          address: "0xstuck",
          name: "Stuck",
          status: "running",
          healthy: false,
          lastHeartbeat: new Date().toISOString(),
          currentTaskId: "t1",
          creditBalance: 100,
          errorRate: 0,
          issues: ["stuck_on_task"],
        },
      ];

      const report: HealthReport = {
        timestamp: new Date().toISOString(),
        totalAgents: 2,
        healthyAgents: 0,
        unhealthyAgents: 2,
        deadAgents: 0,
        agents,
      };

      const actions = await monitor.autoHeal(report);

      expect(actions).toHaveLength(2);
      expect(actions.map((a) => a.type).sort()).toEqual(["fund", "reassign"]);
    });
  });
});
