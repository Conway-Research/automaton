import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulid } from "ulid";
import { Orchestrator } from "../../orchestration/orchestrator.js";
import type { AgentTracker, FundingProtocol } from "../../orchestration/types.js";
import type { MessageTransport } from "../../orchestration/messaging.js";
import { ColonyMessaging } from "../../orchestration/messaging.js";
import type { AutomatonDatabase } from "../../types.js";
import { createInMemoryDb } from "./test-db.js";
import {InferenceAdmissionError,InferenceExecutionUncertainError} from '../../agent/harness-types.js';
import type {PlanReviewer} from '../../orchestration/plan-mode.js';
import {buildPlannerContext} from '../../orchestration/planner-context.js';
import {buildPlannerPrompt} from '../../orchestration/planner.js';

// ─── Fixtures ───────────────────────────────────────────────────

const IDENTITY = {
  name: "test",
  address: "0x1234" as any,
  account: {} as any,
  creatorAddress: "0x0000" as any,
  sandboxId: "sb-1",
  apiKey: "key",
  createdAt: "2026-01-01T00:00:00Z",
};

function makeAgentTracker(overrides: Partial<AgentTracker> = {}): AgentTracker {
  return {
    getIdle: vi.fn().mockReturnValue([]),
    getBestForTask: vi.fn().mockReturnValue(null),
    updateStatus: vi.fn(),
    register: vi.fn(),
    ...overrides,
  };
}

function makeFunding(overrides: Partial<FundingProtocol> = {}): FundingProtocol {
  return {
    fundChild: vi.fn().mockResolvedValue({ success: true }),
    recallCredits: vi.fn().mockResolvedValue({ success: true, amountCents: 0 }),
    getBalance: vi.fn().mockResolvedValue(1000),
    ...overrides,
  };
}

function makeInference(chatResult: Record<string, unknown> = {}) {
  return {
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({ estimatedSteps: 2, reason: "simple", stepOutline: [], ...chatResult }),
      usage: { inputTokens: 10, outputTokens: 10 },
    }),
  };
}

function makeMessaging(_raw: BetterSqlite3.Database): {
  messaging: ColonyMessaging;
  transport: MessageTransport;
  automataDb: AutomatonDatabase;
} {
  const transport: MessageTransport = {
    deliver: vi.fn().mockResolvedValue(undefined),
    getRecipients: vi.fn().mockReturnValue([]),
  };

  const automataDb = {
    raw: _raw,
    getIdentity: (key: string) => (key === "address" ? "0x1234" : undefined),
    getChildren: () => [],
    getUnprocessedInboxMessages: (_limit: number) => [],
    markInboxMessageProcessed: (_id: string) => {},
  } as unknown as AutomatonDatabase;

  const messaging = new ColonyMessaging(transport, automataDb);
  return { messaging, transport, automataDb };
}

function makeOrchestrator(
  db: BetterSqlite3.Database,
  overrides: {
    agentTracker?: AgentTracker;
    funding?: FundingProtocol;
    inference?: ReturnType<typeof makeInference>;
    config?: any;
    messaging?: ColonyMessaging;
    isWorkerAlive?: (address:string)=>boolean;
    planReviewer?:PlanReviewer;
  } = {},
): Orchestrator {
  const { messaging } = makeMessaging(db);
  return new Orchestrator({
    db,
    agentTracker: overrides.agentTracker ?? makeAgentTracker(),
    funding: overrides.funding ?? makeFunding(),
    messaging: overrides.messaging ?? messaging,
    inference: overrides.inference ?? (makeInference() as any),
    identity: IDENTITY,
    config: overrides.config ?? {},
    isWorkerAlive: overrides.isWorkerAlive,
    planReviewer:overrides.planReviewer,
  });
}

function setOrchestratorState(db: BetterSqlite3.Database, state: Record<string, unknown>): void {
  db.prepare(
    "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
  ).run("orchestrator.state", JSON.stringify(state));
}

function insertGoal(db: BetterSqlite3.Database, overrides: {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
} = {}): string {
  const id = overrides.id ?? ulid();
  db.prepare(
    "INSERT INTO goals (id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    id,
    overrides.title ?? "Test Goal",
    overrides.description ?? "A test goal",
    overrides.status ?? "active",
    new Date().toISOString(),
  );
  return id;
}

function insertTask(db: BetterSqlite3.Database, overrides: {
  id?: string;
  goalId: string;
  title?: string;
  description?: string;
  status?: string;
  assignedTo?: string | null;
  agentRole?: string;
  priority?: number;
  dependencies?: string[];
}): string {
  const id = overrides.id ?? ulid();
  db.prepare(
    `INSERT INTO task_graph
     (id, goal_id, title, description, status, assigned_to, agent_role, priority, dependencies, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    overrides.goalId,
    overrides.title ?? "Test Task",
    overrides.description ?? "A test task",
    overrides.status ?? "pending",
    overrides.assignedTo ?? null,
    overrides.agentRole ?? "generalist",
    overrides.priority ?? 50,
    JSON.stringify(overrides.dependencies ?? []),
    new Date().toISOString(),
  );
  return id;
}

function getOrchestratorState(db: BetterSqlite3.Database): Record<string, unknown> | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = 'orchestrator.state'").get() as
    | { value: string }
    | undefined;
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe("orchestration/Orchestrator", () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  // ─── tick() phase transitions ────────────────────────────────
  it.each(['classifying','planning','replanning'])('does not turn denied or uncertain %s into an executable fallback',async phase=>{
    for(const ErrorType of [InferenceAdmissionError,InferenceExecutionUncertainError]){
      const goalId=insertGoal(db),failedTaskId=phase==='replanning'?insertTask(db,{goalId,status:'failed'}):null;
      setOrchestratorState(db,{phase,goalId,replanCount:0,failedTaskId,failedError:failedTaskId?'Fixture failure':null});
      const inference=makeInference();inference.chat.mockRejectedValue(new ErrorType('Fixture admission or unresolved provider'));
      const funding=makeFunding(),tracker=makeAgentTracker();
      const before=(db.prepare('SELECT COUNT(*) n FROM task_graph').get() as {n:number}).n;
      const result=await makeOrchestrator(db,{inference,funding,agentTracker:tracker}).tick();
      expect(result.phase).toBe('failed');
      expect(inference.chat).toHaveBeenCalledOnce();
      expect((db.prepare('SELECT COUNT(*) n FROM task_graph').get() as {n:number}).n).toBe(before);
      expect(funding.fundChild).not.toHaveBeenCalled();
      expect(tracker.getBestForTask).not.toHaveBeenCalled();
      expect(db.prepare('SELECT status FROM goals WHERE id=?').get(goalId)).toEqual({status:'failed'});
    }
  });
  it('does not reset or reassign research claims through the legacy scheduler',async()=>{
    const goalId=insertGoal(db);
    const assigned=insertTask(db,{goalId,status:'assigned',assignedTo:'local://dead'});
    const pending=insertTask(db,{goalId,status:'pending'});
    db.exec('CREATE TABLE obolus_dispatched_tasks(task_id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO obolus_dispatched_tasks VALUES(?)').run(assigned);
    db.prepare('INSERT INTO obolus_dispatched_tasks VALUES(?)').run(pending);
    setOrchestratorState(db,{phase:'executing',goalId,replanCount:0,failedTaskId:null,failedError:null});
    const tracker=makeAgentTracker();
    const orchestrator=makeOrchestrator(db,{agentTracker:tracker,isWorkerAlive:()=>false});
    await orchestrator.tick();
    expect(db.prepare('SELECT status,assigned_to FROM task_graph WHERE id=?').get(assigned)).toEqual({status:'assigned',assigned_to:'local://dead'});
    expect(db.prepare('SELECT status FROM task_graph WHERE id=?').get(pending)).toEqual({status:'pending'});
    expect(tracker.getBestForTask).not.toHaveBeenCalled();
  });

  it.each(['executing','replanning'])('does not replan research failures from persisted phase %s',async(phase)=>{
    const goalId=insertGoal(db);
    const taskId=insertTask(db,{goalId,status:'failed'});
    db.exec('CREATE TABLE obolus_dispatched_tasks(task_id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO obolus_dispatched_tasks VALUES(?)').run(taskId);
    setOrchestratorState(db,{phase,goalId,replanCount:0,failedTaskId:taskId,failedError:'Uncertain execution'});
    const inference=makeInference();
    const result=await makeOrchestrator(db,{inference}).tick();
    expect(result.phase).toBe('executing');
    expect(inference.chat).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) n FROM task_graph').get()).toEqual({n:1});
    expect(db.prepare('SELECT status FROM task_graph WHERE id=?').get(taskId)).toEqual({status:'failed'});
  });

  describe("tick() phase transitions", () => {
    it("idle with no goals stays idle", async () => {
      const orc = makeOrchestrator(db);
      const result = await orc.tick();
      expect(result.phase).toBe("idle");
      expect(result.goalsActive).toBe(0);
    });

    it("idle with active goal transitions to classifying", async () => {
      insertGoal(db, { status: "active" });
      // Force inference to return low step count so classifying resolves cleanly
      const inference = makeInference({ estimatedSteps: 2 });
      const orc = makeOrchestrator(db, { inference: inference as any });
      const result = await orc.tick();
      // After classifying (simple goal) -> executing phase saved; result shows executing
      expect(["classifying", "executing"]).toContain(result.phase);
    });

    it("classifying with simple goal (<=3 steps) transitions to executing", async () => {
      const goalId = insertGoal(db, { title: "Short", description: "Brief" });
      setOrchestratorState(db, { phase: "classifying", goalId, replanCount: 0, failedTaskId: null, failedError: null });
      const inference = makeInference({ estimatedSteps: 2 });
      const orc = makeOrchestrator(db, { inference: inference as any });
      const result = await orc.tick();
      expect(result.phase).toBe("executing");
    });

    it("classifying with complex goal (>3 steps) transitions to planning", async () => {
      const goalId = insertGoal(db, { title: "Complex Goal", description: "Needs multiple coordinated steps" });
      setOrchestratorState(db, { phase: "classifying", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      // classifyComplexity returns high step count → classifying saves "planning" phase
      const inference = makeInference({ estimatedSteps: 5 });

      const orc = makeOrchestrator(db, { inference: inference as any });
      const result = await orc.tick();
      // One tick: classifying detects >3 steps → transitions to planning
      expect(result.phase).toBe("planning");
    });

    it("planning phase calls inference and transitions to plan_review", async () => {
      const goalId = insertGoal(db, { title: "Complex Goal", description: "Needs multiple coordinated steps" });
      setOrchestratorState(db, { phase: "planning", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      // planGoal calls inference.chat once
      const inference = {
        chat: vi.fn().mockResolvedValueOnce({
          content: JSON.stringify({
            analysis: "Analysis text",
            strategy: "Strategy text",
            customRoles: [],
            tasks: [
              {
                title: "Task One",
                description: "Do the first thing",
                agentRole: "generalist",
                dependencies: [],
                estimatedCostCents: 50,
                priority: 50,
                timeoutMs: 60000,
              },
            ],
            risks: [],
            estimatedTotalCostCents: 50,
            estimatedTimeMinutes: 10,
          }),
          usage: {},
        }),
      };

      const orc = makeOrchestrator(db, { inference: inference as any });
      const result = await orc.tick();
      expect(result.phase).toBe("plan_review");
    });

    it("plan_review with plan in KV auto-approves (auto mode) and transitions to executing", async () => {
      const goalId = insertGoal(db);
      insertTask(db, { goalId, title: "task-one", description: "Do something" });
      setOrchestratorState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      // Store a valid plan in KV under the plan key
      const plan = {
        analysis: "Analysis",
        strategy: "Strategy",
        customRoles: [],
        tasks: [{ title: "Task One", description: "Desc", agentRole: "generalist", dependencies: [], estimatedCostCents: 50, priority: 50, timeoutMs: 60000 }],
        risks: [],
        estimatedTotalCostCents: 50,
        estimatedTimeMinutes: 10,
      };
      db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(
        `orchestrator.plan.${goalId}`,
        JSON.stringify(plan),
      );

      const orc = makeOrchestrator(db);
      const result = await orc.tick();
      expect(result.phase).toBe("executing");
    });

    it("plan_review with no plan in KV fails closed", async () => {
      const goalId = insertGoal(db);
      insertTask(db, { goalId, title: "existing-task", description: "Do something" });
      setOrchestratorState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });
      // Missing review evidence cannot authorize the existing task graph.

      const orc = makeOrchestrator(db);
      const result = await orc.tick();
      expect(result.phase).toBe("failed");
    });

    it("complete phase resets to idle", async () => {
      const goalId = insertGoal(db, { status: "completed" });
      setOrchestratorState(db, { phase: "complete", goalId, replanCount: 0, failedTaskId: null, failedError: null });
      const funding = makeFunding();
      const orc = makeOrchestrator(db, { funding });
      const result = await orc.tick();
      expect(result.phase).toBe("idle");
    });

    it("failed phase resets to idle after logging", async () => {
      const goalId = insertGoal(db, { status: "active" });
      setOrchestratorState(db, {
        phase: "failed",
        goalId,
        replanCount: 3,
        failedTaskId: null,
        failedError: "Something went wrong",
      });
      const orc = makeOrchestrator(db);
      const result = await orc.tick();
      // handleFailedPhase marks the goal as failed and resets to idle
      // so the orchestrator can pick up other active goals.
      expect(result.phase).toBe("idle");
    });
  });

  // ─── matchTaskToAgent ────────────────────────────────────────

  describe("matchTaskToAgent", () => {
    function makeTask(goalId: string, overrides: Partial<{ agentRole: string; id: string }> = {}) {
      return {
        id: overrides.id ?? ulid(),
        parentId: null,
        goalId,
        title: "Task",
        description: "desc",
        status: "pending" as const,
        assignedTo: null,
        agentRole: overrides.agentRole ?? "generalist",
        priority: 50,
        dependencies: [],
        result: null,
        metadata: {
          estimatedCostCents: 10,
          actualCostCents: 0,
          maxRetries: 3,
          retryCount: 0,
          timeoutMs: 60000,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
        },
      };
    }

    it("returns idle agent with matching role", async () => {
      const goalId = insertGoal(db);
      const agentTracker = makeAgentTracker({
        getIdle: vi.fn().mockReturnValue([
          { address: "0xspecialist", name: "Specialist", role: "researcher", status: "healthy" },
          { address: "0xgeneralist", name: "Generalist", role: "generalist", status: "healthy" },
        ]),
      });
      const orc = makeOrchestrator(db, { agentTracker });
      const result = await orc.matchTaskToAgent(makeTask(goalId, { agentRole: "researcher" }));
      expect(result.agentAddress).toBe("0xspecialist");
      expect(result.spawned).toBe(false);
    });

    it("returns best idle agent when no exact role match", async () => {
      const goalId = insertGoal(db);
      const agentTracker = makeAgentTracker({
        getIdle: vi.fn().mockReturnValue([]),
        getBestForTask: vi.fn().mockReturnValue({ address: "0xbest", name: "Best" }),
      });
      const orc = makeOrchestrator(db, { agentTracker });
      const result = await orc.matchTaskToAgent(makeTask(goalId));
      expect(result.agentAddress).toBe("0xbest");
      expect(result.spawned).toBe(false);
    });

    it("calls spawnAgent from config when no idle agents", async () => {
      const goalId = insertGoal(db);
      const agentTracker = makeAgentTracker({
        getIdle: vi.fn().mockReturnValue([]),
        getBestForTask: vi.fn().mockReturnValue(null),
      });
      const spawnAgent = vi.fn().mockResolvedValue({ address: "0xspawned", name: "Spawned", sandboxId: "sb-2" });
      const orc = makeOrchestrator(db, {
        agentTracker,
        config: { spawnAgent },
      });
      const result = await orc.matchTaskToAgent(makeTask(goalId));
      expect(result.agentAddress).toBe("0xspawned");
      expect(result.spawned).toBe(true);
      expect(spawnAgent).toHaveBeenCalledTimes(1);
      expect(agentTracker.register).toHaveBeenCalled();
    });

    it("falls back to busy agent when spawn is disabled", async () => {
      const goalId = insertGoal(db);
      // Insert a running child into the DB
      db.prepare(
        "INSERT INTO children (id, name, address, sandbox_id, genesis_prompt, creator_message, funded_amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(ulid(), "BusyAgent", "0xbusy", "sb-3", "prompt", "msg", 0, "running", new Date().toISOString());

      const agentTracker = makeAgentTracker({
        getIdle: vi.fn().mockReturnValue([]),
        getBestForTask: vi.fn().mockReturnValue(null),
      });
      const orc = makeOrchestrator(db, {
        agentTracker,
        config: { disableSpawn: true },
      });
      const result = await orc.matchTaskToAgent(makeTask(goalId));
      expect(result.agentAddress).toBe("0xbusy");
      expect(result.spawned).toBe(false);
    });

    it("self-assigns to parent when no child agent is available", async () => {
      const goalId = insertGoal(db);
      const agentTracker = makeAgentTracker({
        getIdle: vi.fn().mockReturnValue([]),
        getBestForTask: vi.fn().mockReturnValue(null),
      });
      const orc = makeOrchestrator(db, {
        agentTracker,
        config: { disableSpawn: true },
      });
      // When no child agents are available, matchTaskToAgent falls back to
      // self-assigning the task to the parent identity.
      const result = await orc.matchTaskToAgent(makeTask(goalId));
      expect(result.agentAddress).toBe(IDENTITY.address);
      expect(result.agentName).toBe(IDENTITY.name);
      expect(result.spawned).toBe(false);
    });
  });

  // ─── fundAgentForTask ────────────────────────────────────────

  describe("fundAgentForTask", () => {
    function makeTaskWithCost(goalId: string, estimatedCostCents: number) {
      return {
        id: ulid(),
        parentId: null,
        goalId,
        title: "Task",
        description: "desc",
        status: "pending" as const,
        assignedTo: null,
        agentRole: "generalist",
        priority: 50,
        dependencies: [],
        result: null,
        metadata: {
          estimatedCostCents,
          actualCostCents: 0,
          maxRetries: 3,
          retryCount: 0,
          timeoutMs: 60000,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
        },
      };
    }

    it("calls funding.fundChild with at least the default amount", async () => {
      const goalId = insertGoal(db);
      const funding = makeFunding();
      const orc = makeOrchestrator(db, { funding, config: { defaultTaskFundingCents: 25 } });
      await orc.fundAgentForTask("0xagent", makeTaskWithCost(goalId, 0));
      expect(funding.fundChild).toHaveBeenCalledWith("0xagent", 25,undefined);
    });

    it("skips funding when estimated amount and default are both 0", async () => {
      const goalId = insertGoal(db);
      const funding = makeFunding();
      const orc = makeOrchestrator(db, { funding, config: { defaultTaskFundingCents: 0 } });
      await orc.fundAgentForTask("0xagent", makeTaskWithCost(goalId, 0));
      expect(funding.fundChild).not.toHaveBeenCalled();
    });

    it("throws when fundChild reports failure", async () => {
      const goalId = insertGoal(db);
      const funding = makeFunding({
        fundChild: vi.fn().mockResolvedValue({ success: false }),
      });
      const orc = makeOrchestrator(db, { funding, config: { defaultTaskFundingCents: 25 } });
      await expect(orc.fundAgentForTask("0xagent", makeTaskWithCost(goalId, 25))).rejects.toThrow(
        "Funding transfer failed for 0xagent",
      );
    });
  });

  // ─── collectResults ──────────────────────────────────────────

  describe("collectResults", () => {
    it("processes task_result messages from inbox", async () => {
      const goalId = insertGoal(db);
      const taskId = insertTask(db, { goalId });
      const content = JSON.stringify({ taskId, success: true, output: "done", artifacts: [], costCents: 5, duration: 100 });
      const messaging = buildMessagingWithResults(db, [{ type: "task_result", content }]);
      const orc = makeOrchestrator(db, { messaging });
      const results = await orc.collectResults();
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].output).toBe("done");
    });

    it("ignores non-task_result messages", async () => {
      const messaging = buildMessagingWithResults(db, [
        { type: "alert", content: JSON.stringify({ message: "just an alert" }) },
      ]);
      const orc = makeOrchestrator(db, { messaging });
      const results = await orc.collectResults();
      expect(results).toHaveLength(0);
    });

    it("returns empty array when inbox is empty", async () => {
      const messaging = buildMessagingWithResults(db, []);
      const orc = makeOrchestrator(db, { messaging });
      const results = await orc.collectResults();
      expect(results).toHaveLength(0);
    });

    function buildMessagingWithResults(
      _raw: BetterSqlite3.Database,
      messages: Array<{ type: string; content: string }>,
    ) {
      const processedMessages = messages.map((msg) => ({
        message: {
          id: ulid(),
          type: msg.type,
          from: "0xagent",
          to: "0x1234",
          goalId: null,
          taskId: null,
          content: msg.content,
          priority: "normal" as const,
          requiresResponse: false,
          expiresAt: null,
          createdAt: new Date().toISOString(),
        },
        handledBy: "handleTaskResult",
        success: true,
      }));

      return {
        processInbox: vi.fn().mockResolvedValue(processedMessages),
        createMessage: vi.fn().mockReturnValue({}),
        send: vi.fn().mockResolvedValue(undefined),
      } as unknown as ColonyMessaging;
    }
  });

  // ─── handleFailure ───────────────────────────────────────────

  describe("handleFailure", () => {
    function makeTaskNode(goalId: string, taskId: string) {
      return {
        id: taskId,
        parentId: null,
        goalId,
        title: "Failing Task",
        description: "This task fails",
        status: "running" as const,
        assignedTo: "0xagent",
        agentRole: "generalist",
        priority: 50,
        dependencies: [],
        result: null,
        metadata: {
          estimatedCostCents: 10,
          actualCostCents: 0,
          maxRetries: 0,
          retryCount: 0,
          timeoutMs: 60000,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
        },
      };
    }

    it('does not retry a research failure even with a legacy retry allowance',async()=>{
      const goalId=insertGoal(db),taskId=insertTask(db,{goalId,status:'running'});
      db.exec('CREATE TABLE obolus_dispatched_tasks(task_id TEXT PRIMARY KEY)');
      db.prepare('INSERT INTO obolus_dispatched_tasks VALUES(?)').run(taskId);
      db.prepare('UPDATE task_graph SET max_retries=3 WHERE id=?').run(taskId);
      setOrchestratorState(db,{phase:'executing',goalId,replanCount:0,failedTaskId:null,failedError:null});
      const orc=makeOrchestrator(db);
      await orc.handleFailure(makeTaskNode(goalId,taskId),'Ambiguous execution');
      await orc.handleFailure(makeTaskNode(goalId,taskId),'Repeated event');
      expect(db.prepare('SELECT status,retry_count FROM task_graph WHERE id=?').get(taskId)).toEqual({status:'failed',retry_count:0});
      expect(getOrchestratorState(db)?.phase).toBe('executing');
    });

    it("transitions to replanning when task permanently fails and replanCount < maxReplans", async () => {
      const goalId = insertGoal(db, { status: "active" });
      // max_retries=0 so failTask marks it permanently failed (no retry budget)
      const taskId = insertTask(db, { goalId, status: "running" });
      db.prepare("UPDATE task_graph SET max_retries = 0, retry_count = 0 WHERE id = ?").run(taskId);
      setOrchestratorState(db, { phase: "executing", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db, { config: { maxReplans: 3 } });
      await orc.handleFailure(makeTaskNode(goalId, taskId), "some error");

      const state = getOrchestratorState(db);
      expect(state?.phase).toBe("replanning");
      expect(state?.failedTaskId).toBe(taskId);
      expect(state?.failedError).toBe("some error");
    });

    it("transitions to failed when replanCount >= maxReplans", async () => {
      const goalId = insertGoal(db, { status: "active" });
      // max_retries=0 so failTask marks it permanently failed (no retry budget)
      const taskId = insertTask(db, { goalId, status: "running" });
      db.prepare("UPDATE task_graph SET max_retries = 0, retry_count = 0 WHERE id = ?").run(taskId);
      setOrchestratorState(db, { phase: "executing", goalId, replanCount: 3, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db, { config: { maxReplans: 3 } });
      await orc.handleFailure(makeTaskNode(goalId, taskId), "fatal");

      const state = getOrchestratorState(db);
      expect(state?.phase).toBe("failed");
    });

    it("retries task when retry budget allows (maxRetries > retryCount)", async () => {
      const goalId = insertGoal(db, { status: "active" });
      const taskId = insertTask(db, { goalId, status: "running" });
      // Insert with retries available
      db.prepare("UPDATE task_graph SET max_retries = 3, retry_count = 0 WHERE id = ?").run(taskId);
      setOrchestratorState(db, { phase: "executing", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db, { config: { maxReplans: 3 } });
      await orc.handleFailure(makeTaskNode(goalId, taskId), "transient");

      // Task should have been retried (status pending or blocked, not necessarily failed)
      const taskRow = db.prepare("SELECT status FROM task_graph WHERE id = ?").get(taskId) as
        | { status: string }
        | undefined;
      expect(["pending", "blocked"]).toContain(taskRow?.status);
    });
  });

  // ─── handlePlanReviewPhase ───────────────────────────────────

  describe("handlePlanReviewPhase (via tick)", () => {
    function storePlan(db: BetterSqlite3.Database, goalId: string, planOverrides: Record<string, unknown> = {}): void {
      const plan = {
        analysis: "Analysis",
        strategy: "Strategy",
        customRoles: [],
        tasks: [
          {
            title: "Task One",
            description: "Do something",
            agentRole: "generalist",
            dependencies: [],
            estimatedCostCents: 100,
            priority: 50,
            timeoutMs: 60000,
          },
        ],
        risks: [],
        estimatedTotalCostCents: 100,
        estimatedTimeMinutes: 5,
        ...planOverrides,
      };
      db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(
        `orchestrator.plan.${goalId}`,
        JSON.stringify(plan),
      );
    }

    it("approved plan transitions from plan_review to executing", async () => {
      const goalId = insertGoal(db);
      insertTask(db, { goalId, title: "t1", description: "desc" });
      storePlan(db, goalId, { estimatedTotalCostCents: 100 }); // under auto threshold
      setOrchestratorState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db);
      const result = await orc.tick();
      expect(result.phase).toBe("executing");
    });

    it("missing persisted plan blocks execution", async () => {
      const goalId = insertGoal(db);
      insertTask(db, { goalId, title: "t1", description: "desc" });
      // No plan in KV: no approval is inferred.
      setOrchestratorState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      const orc = makeOrchestrator(db);
      const result = await orc.tick();
      expect(result.phase).toBe("failed");
    });

    it("over-threshold plans require bounded revision rather than automatic approval", async () => {
      const goalId = insertGoal(db);
      insertTask(db, { goalId, title: "t1", description: "desc" });
      storePlan(db, goalId);
      setOrchestratorState(db, { phase: "plan_review", goalId, replanCount: 0, failedTaskId: null, failedError: null });

      storePlan(db, goalId, { estimatedTotalCostCents: 9999 });
      const orc = makeOrchestrator(db);
      const result = await orc.tick();
      expect(result.phase).toBe("planning");
      expect(getOrchestratorState(db)?.replanCount).toBe(1);
      const context=await buildPlannerContext({db});
      expect(context.reviewFeedback).toEqual([{goalId,feedback:expect.stringContaining('exceeds automatic review threshold')}]);
      expect(buildPlannerPrompt(context)).toContain('exceeds automatic review threshold');
      setOrchestratorState(db,{phase:'plan_review',goalId,replanCount:3,failedTaskId:null,failedError:null});
      expect((await orc.tick()).phase).toBe('failed');
    });
    it('respects configured supervised review and invokes an installed consensus reviewer only when selected',async()=>{
      const goalId=insertGoal(db);storePlan(db,goalId);
      const state={phase:'plan_review',goalId,replanCount:0,failedTaskId:null,failedError:null};
      setOrchestratorState(db,state);
      const planApproval={mode:'supervised',autoBudgetThreshold:5000,consensusCriticRole:'critic',reviewTimeoutMs:1000};
      const review=vi.fn(async({planDigest}:{planDigest:string})=>({planDigest,approved:true,blockers:[]}));
      expect((await makeOrchestrator(db,{config:{planApproval},planReviewer:{review}}).tick()).phase).toBe('plan_review');
      expect(review).not.toHaveBeenCalled();
      expect((await makeOrchestrator(db,{config:{planApproval:{...planApproval,mode:'consensus'}},planReviewer:{review}}).tick()).phase).toBe('executing');
      expect(review).toHaveBeenCalledTimes(1);
      const recorded=db.prepare("SELECT content FROM event_stream WHERE type='plan_reviewed' AND goal_id=?").get(goalId) as {content:string};
      expect(JSON.parse(recorded.content)).toMatchObject({approved:true,planDigest:expect.stringMatching(/^[a-f0-9]{64}$/),executionPermissionGranted:false});
    });
  });
});
