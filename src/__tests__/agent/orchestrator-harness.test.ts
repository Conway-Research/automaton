import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrchestratorHarness } from "../../agent/harnesses/orchestrator-harness.js";
import type { HarnessContext, WorkerInferenceClient } from "../../agent/harness-types.js";
import type { PlannerOutput } from "../../orchestration/planner.js";
import type { TaskNode, TaskResult } from "../../orchestration/task-graph.js";
import { AgentWorkspace } from "../../orchestration/workspace.js";
import { getTaskById, getTasksByGoal } from "../../state/database.js";
import { createInMemoryDb } from "../orchestration/test-db.js";
import { createTestConfig, createTestIdentity, MockConwayClient } from "../mocks.js";

class PlannerAwareInference implements WorkerInferenceClient {
  private plannerIndex = 0;
  private workerIndex = 0;

  constructor(
    private readonly plannerOutputs: PlannerOutput[],
    private readonly workerResponses: Array<{ content: string; toolCalls?: Array<{ id: string; type?: "function"; function: { name: string; arguments: string } }> }>,
  ) {}

  async chat(params: Parameters<WorkerInferenceClient["chat"]>[0]): ReturnType<WorkerInferenceClient["chat"]> {
    const systemPrompt = params.messages[0]?.content ?? "";
    if (systemPrompt.includes("# Planner Agent") || params.responseFormat?.type === "json_object") {
      const plan = this.plannerOutputs[this.plannerIndex++] ?? this.plannerOutputs[this.plannerOutputs.length - 1];
      return { content: JSON.stringify(plan) };
    }

    const response = this.workerResponses[this.workerIndex++] ?? { content: "Done." };
    return {
      content: response.content,
      toolCalls: response.toolCalls?.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: toolCall.function,
      })),
    };
  }
}

describe("agent/OrchestratorHarness", () => {
  let db: ReturnType<typeof createInMemoryDb>;
  let workspaceRoot: string;

  beforeEach(() => {
    db = createInMemoryDb();
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-harness-"));
    db.prepare(
      "INSERT INTO goals (id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("goal-1", "Goal", "Goal description", "active", new Date().toISOString());
  });

  afterEach(() => {
    db.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function makeTask(): TaskNode {
    return {
      id: "orchestrator-task-1",
      parentId: null,
      goalId: "goal-1",
      title: "Coordinate implementation",
      description: "Plan, delegate, verify, and fix the work.",
      status: "assigned",
      assignedTo: "local://worker-orchestrator",
      agentRole: "orchestrator",
      priority: 50,
      dependencies: [],
      result: null,
      metadata: {
        estimatedCostCents: 50,
        actualCostCents: 0,
        maxRetries: 0,
        retryCount: 0,
        timeoutMs: 30_000,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      },
    };
  }

  function persistTask(task: TaskNode): void {
    db.prepare(
      `INSERT INTO task_graph (
        id, parent_id, goal_id, title, description, status, assigned_to, agent_role, priority, dependencies, result, max_retries, retry_count, timeout_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      task.id,
      task.parentId,
      task.goalId,
      task.title,
      task.description,
      task.status,
      task.assignedTo,
      task.agentRole,
      task.priority,
      JSON.stringify(task.dependencies),
      task.result ? JSON.stringify(task.result) : null,
      task.metadata.maxRetries,
      task.metadata.retryCount,
      task.metadata.timeoutMs,
      task.metadata.createdAt,
    );
  }

  function makeContext(inference: WorkerInferenceClient): HarnessContext {
    const workspace = new AgentWorkspace("goal-1", path.join(workspaceRoot, "workspace"));
    return {
      workspaceRoot: workspace.basePath,
      allowedEditRoot: workspaceRoot,
      workspace,
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway: new MockConwayClient(),
      inference,
      budget: {
        maxTurns: 50,
        maxCostCents: 500,
        timeoutMs: 30_000,
        turnsUsed: 0,
        costUsedCents: 0,
        startedAt: 0,
      },
      wisdom: { conventions: [], successes: [], failures: [], gotchas: [] },
      abortSignal: new AbortController().signal,
      goalId: "goal-1",
    };
  }

  it("creates planner artifacts on initialize and enforces planner dependency ordering", async () => {
    const initialPlan: PlannerOutput = {
      analysis: "Two-step plan",
      strategy: "Implement then verify",
      customRoles: [],
      tasks: [
        {
          title: "Implement feature",
          description: "Write the feature implementation.",
          agentRole: "executor",
          dependencies: [],
          estimatedCostCents: 100,
          priority: 60,
          timeoutMs: 60_000,
        },
        {
          title: "Verify feature",
          description: "Verify the implementation result.",
          agentRole: "tester",
          dependencies: [0],
          estimatedCostCents: 50,
          priority: 55,
          timeoutMs: 45_000,
        },
      ],
      risks: ["None"],
      estimatedTotalCostCents: 150,
      estimatedTimeMinutes: 20,
    };

    class InspectableOrchestrator extends OrchestratorHarness { promptMessages(){return this.messages;} }
    const harness = new InspectableOrchestrator();
    const task = makeTask();
    persistTask(task);
    await harness.initialize(task, makeContext(new PlannerAwareInference([initialPlan], [])));
    expect(harness.promptMessages()[0].content).toContain('every assigned activity and future domain');
    expect(harness.promptMessages()[0].content).toContain('Quality applies to every task');
    expect(harness.promptMessages()[1].content).toContain('assess_task_specific_gap');

    const planDir = path.join(workspaceRoot, "workspace", "subplans", "orchestrator-task-1");
    expect(fs.existsSync(path.join(planDir, "plan.json"))).toBe(true);
    expect(fs.existsSync(path.join(planDir, "plan.md"))).toBe(true);

    const delegateTool = harness.getToolDefs().find((tool) => tool.name === "delegate_task");
    expect(delegateTool).toBeDefined();

    const blocked = await delegateTool!.execute({ plan_task_index: 1 });
    expect(blocked).toContain("Delegate dependency task indexes first: 0");

    const first = await delegateTool!.execute({ plan_task_index: 0 });
    expect(first).toContain("Sub-task created");
    expect(first).toContain("Role: executor");

    const second = await delegateTool!.execute({ plan_task_index: 1 });
    expect(second).toContain("Sub-task created");
    expect(second).toContain("Role: tester");

    const tasks = getTasksByGoal(db, "goal-1").filter((task) => task.parentId === "orchestrator-task-1");
    expect(tasks).toHaveLength(2);
    const implementTask = tasks.find((task) => task.title === "Implement feature");
    const verifyTask = tasks.find((task) => task.title === "Verify feature");
    expect(implementTask).toBeDefined();
    expect(verifyTask?.dependencies).toEqual([implementTask?.id]);
    const done = harness.getToolDefs().find(tool => tool.name === "task_done")!;
    await expect(done.execute({summary:"Finished",success:true})).rejects.toThrow("unfinished or unsuccessful");
    await expect(done.execute({summary:"Blocked",success:false})).resolves.toContain("TASK_COMPLETE:FAILURE");
    const result = {success:true,output:"Fixture completed",artifacts:[],costCents:0,duration:1};
    db.prepare("UPDATE task_graph SET status='completed',result=? WHERE parent_id=?").run(JSON.stringify(result),task.id);
    await expect(done.execute({summary:"Finished",success:true})).resolves.toContain("TASK_COMPLETE:SUCCESS");
    const verify = harness.getToolDefs().find(tool => tool.name === "verify_result")!;
    await expect(verify.execute({task_id:implementTask!.id,criteria:""})).resolves.toContain("Invalid verification criteria");
    await expect(verify.execute({task_id:implementTask!.id,criteria:"Fixture completed"})).resolves.toContain("HEURISTIC MATCH ONLY");
    db.prepare("UPDATE task_graph SET result=? WHERE id=?").run(JSON.stringify({...result,success:false}),implementTask!.id);
    await expect(done.execute({summary:"Finished",success:true})).rejects.toThrow("unfinished or unsuccessful");
  });

  it("replans after verification failure and updates persisted planner artifacts", async () => {
    const initialPlan: PlannerOutput = {
      analysis: "Initial plan",
      strategy: "Start with implementation",
      customRoles: [],
      tasks: [
        {
          title: "Implement feature",
          description: "Create the first draft.",
          agentRole: "executor",
          dependencies: [],
          estimatedCostCents: 100,
          priority: 60,
          timeoutMs: 60_000,
        },
      ],
      risks: ["Verification might fail"],
      estimatedTotalCostCents: 100,
      estimatedTimeMinutes: 15,
    };

    const replan: PlannerOutput = {
      analysis: "Verification failed; add a fix task",
      strategy: "Patch the implementation before re-running verification",
      customRoles: [],
      tasks: [
        {
          title: "Patch implementation",
          description: "Apply the fix that the verifier requested.",
          agentRole: "executor",
          dependencies: [],
          estimatedCostCents: 80,
          priority: 65,
          timeoutMs: 60_000,
        },
      ],
      risks: ["Fix may need another review"],
      estimatedTotalCostCents: 80,
      estimatedTimeMinutes: 10,
    };

    const harness = new OrchestratorHarness();
    const task = makeTask();
    persistTask(task);
    await harness.initialize(task, makeContext(new PlannerAwareInference([initialPlan, replan], [])));

    const delegateTool = harness.getToolDefs().find((tool) => tool.name === "delegate_task");
    const verifyTool = harness.getToolDefs().find((tool) => tool.name === "verify_result");
    expect(delegateTool).toBeDefined();
    expect(verifyTool).toBeDefined();

    await delegateTool!.execute({ plan_task_index: 0 });

    const delegated = getTasksByGoal(db, "goal-1").find((task) => task.parentId === "orchestrator-task-1" && task.title === "Implement feature");
    expect(delegated).toBeDefined();

    db.prepare(
      "UPDATE task_graph SET status = 'completed', result = ?, completed_at = ? WHERE id = ?",
    ).run(
      JSON.stringify({ success: true, output: "Implemented but missing tests.", artifacts: [], costCents: 0, duration: 1 }),
      new Date().toISOString(),
      delegated!.id,
    );

    const verification = await verifyTool!.execute({
      task_id: delegated!.id,
      criteria: "must include tests and validation",
    });
    expect(verification).toContain("VERIFICATION FAILED");
    expect(verification).toContain("Planner-backed replan prepared");

    const planFile = path.join(workspaceRoot, "workspace", "subplans", "orchestrator-task-1", "plan.json");
    const persisted = JSON.parse(fs.readFileSync(planFile, "utf8")) as PlannerOutput;
    expect(persisted.tasks[0].title).toBe("Patch implementation");
  });

  it("does not reuse a failed child task when a replan repeats the same planned signature", async () => {
    const initialPlan: PlannerOutput = {
      analysis: "Initial plan",
      strategy: "Implement feature once",
      customRoles: [],
      tasks: [
        {
          title: "Implement feature",
          description: "Create the first draft.",
          agentRole: "executor",
          dependencies: [],
          estimatedCostCents: 100,
          priority: 60,
          timeoutMs: 60_000,
        },
      ],
      risks: ["Verification may fail"],
      estimatedTotalCostCents: 100,
      estimatedTimeMinutes: 15,
    };

    const replanWithSameSignature: PlannerOutput = {
      ...initialPlan,
      analysis: "Retry the same implementation with fixes",
      strategy: "Re-run the same task after failure",
    };

    const harness = new OrchestratorHarness();
    const task = makeTask();
    persistTask(task);
    await harness.initialize(task, makeContext(new PlannerAwareInference([initialPlan, replanWithSameSignature], [])));

    const delegateTool = harness.getToolDefs().find((tool) => tool.name === "delegate_task");
    const verifyTool = harness.getToolDefs().find((tool) => tool.name === "verify_result");
    expect(delegateTool).toBeDefined();
    expect(verifyTool).toBeDefined();

    await delegateTool!.execute({ plan_task_index: 0 });
    const firstDelegated = getTasksByGoal(db, "goal-1").find((entry) => entry.parentId === "orchestrator-task-1" && entry.title === "Implement feature");
    expect(firstDelegated).toBeDefined();

    db.prepare(
      "UPDATE task_graph SET status = 'completed', result = ?, completed_at = ? WHERE id = ?",
    ).run(
      JSON.stringify({ success: true, output: "Implemented but still failing validation.", artifacts: [], costCents: 0, duration: 1 }),
      new Date().toISOString(),
      firstDelegated!.id,
    );

    const verification = await verifyTool!.execute({
      task_id: firstDelegated!.id,
      criteria: "must include validation and tests",
    });
    expect(verification).toContain("Planner-backed replan prepared");

    const secondDelegation = await delegateTool!.execute({ plan_task_index: 0 });
    expect(secondDelegation).toContain("Sub-task created");

    const delegatedTasks = getTasksByGoal(db, "goal-1").filter((entry) => entry.parentId === "orchestrator-task-1" && entry.title === "Implement feature");
    expect(delegatedTasks).toHaveLength(2);
    expect(new Set(delegatedTasks.map((entry) => entry.id)).size).toBe(2);
  });

  it("rebuilds dependency index mappings on replan so new dependent tasks bind to new prerequisite tasks", async () => {
    const initialPlan: PlannerOutput = {
      analysis: "Initial two-step plan",
      strategy: "Implement then verify",
      customRoles: [],
      tasks: [
        {
          title: "Implement feature",
          description: "Create the first draft.",
          agentRole: "executor",
          dependencies: [],
          estimatedCostCents: 100,
          priority: 60,
          timeoutMs: 60_000,
        },
        {
          title: "Verify feature",
          description: "Verify the implementation result.",
          agentRole: "tester",
          dependencies: [0],
          estimatedCostCents: 50,
          priority: 55,
          timeoutMs: 45_000,
        },
      ],
      risks: ["Verification may fail"],
      estimatedTotalCostCents: 150,
      estimatedTimeMinutes: 20,
    };

    const replanWithSameDependencies: PlannerOutput = {
      ...initialPlan,
      analysis: "Retry the same implementation/verification pair",
      strategy: "Run the same dependency graph again after failure",
    };

    const harness = new OrchestratorHarness();
    const task = makeTask();
    persistTask(task);
    await harness.initialize(task, makeContext(new PlannerAwareInference([initialPlan, replanWithSameDependencies], [])));

    const delegateTool = harness.getToolDefs().find((tool) => tool.name === "delegate_task");
    const verifyTool = harness.getToolDefs().find((tool) => tool.name === "verify_result");
    expect(delegateTool).toBeDefined();
    expect(verifyTool).toBeDefined();

    await delegateTool!.execute({ plan_task_index: 0 });
    await delegateTool!.execute({ plan_task_index: 1 });

    const initialChildren = getTasksByGoal(db, "goal-1").filter((entry) => entry.parentId === "orchestrator-task-1");
    const initialImplement = initialChildren.find((entry) => entry.title === "Implement feature");
    const initialVerify = initialChildren.find((entry) => entry.title === "Verify feature");
    expect(initialImplement).toBeDefined();
    expect(initialVerify?.dependencies).toEqual([initialImplement?.id]);

    db.prepare(
      "UPDATE task_graph SET status = 'completed', result = ?, completed_at = ? WHERE id = ?",
    ).run(
      JSON.stringify({ success: true, output: "Initial implementation complete.", artifacts: [], costCents: 0, duration: 1 }),
      new Date().toISOString(),
      initialImplement!.id,
    );

    db.prepare(
      "UPDATE task_graph SET status = 'completed', result = ?, completed_at = ? WHERE id = ?",
    ).run(
      JSON.stringify({ success: true, output: "Verification still missing required assertions.", artifacts: [], costCents: 0, duration: 1 }),
      new Date().toISOString(),
      initialVerify!.id,
    );

    const verification = await verifyTool!.execute({
      task_id: initialVerify!.id,
      criteria: "must include stronger assertions and validation",
    });
    expect(verification).toContain("Planner-backed replan prepared");

    await delegateTool!.execute({ plan_task_index: 0 });
    await delegateTool!.execute({ plan_task_index: 1 });

    const allImplementTasks = getTasksByGoal(db, "goal-1").filter((entry) => entry.parentId === "orchestrator-task-1" && entry.title === "Implement feature");
    const allVerifyTasks = getTasksByGoal(db, "goal-1").filter((entry) => entry.parentId === "orchestrator-task-1" && entry.title === "Verify feature");
    expect(allImplementTasks).toHaveLength(2);
    expect(allVerifyTasks).toHaveLength(2);

    const newImplement = allImplementTasks.find((entry) => entry.id !== initialImplement!.id);
    const newVerify = allVerifyTasks.find((entry) => entry.id !== initialVerify!.id);
    expect(newImplement).toBeDefined();
    expect(newVerify?.dependencies).toEqual([newImplement?.id]);
    expect(newVerify?.dependencies).not.toEqual([initialImplement!.id]);
  });
});
