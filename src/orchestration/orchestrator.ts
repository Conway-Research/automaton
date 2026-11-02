import type { Database } from "better-sqlite3";
import { ulid } from "ulid";
import {createHash} from 'node:crypto';
import {RevenueStore} from '../revenue/store.js';
import {isResearchManagedTask} from './research-dispatch.js';
import type { AutomatonIdentity } from "../types.js";
import { createLogger } from "../observability/logger.js";
import {
  assignTask,
  completeTask,
  decomposeGoal,
  failTask,
  getGoalProgress,
  getReadyTasks,
  type Goal,
  type TaskNode,
  type TaskResult,
  normalizeTaskResult,
} from "./task-graph.js";
import {
  goalToPlannerInput,
  planGoal,
  replanAfterFailure,
  type PlannerOutput,
  type PlannedTask,
  type PlannerInferenceClient,
  taskToPlannerFailureInput,
} from "./planner.js";
import { ColonyMessaging, type AgentMessage } from "./messaging.js";
import { generateTodoMd } from "./attention.js";
import {InferenceAdmissionError,InferenceExecutionUncertainError} from '../agent/harness-types.js';
import { reviewPlan,type PlanReviewer } from "./plan-mode.js";
import { buildPlannerContext, getNextPlannerVersion, persistPlannerArtifacts } from "./planner-context.js";
import { AgentWorkspace } from "./workspace.js";
import {
  getActiveGoals,
  getGoalById,
  getTaskById,
  getTasksByGoal,
  updateGoalStatus,
  insertEvent,
  type GoalRow,
  type TaskGraphRow,
} from "../state/database.js";
import type {
  AgentAssignment,
  AgentTracker,
  FundingProtocol,
  OrchestratorTickResult,
} from "./types.js";

const logger = createLogger("orchestration.orchestrator");

const ORCHESTRATOR_STATE_KEY = "orchestrator.state";
const ORCHESTRATOR_TODO_KEY = "orchestrator.todo_md";
const DEFAULT_TASK_FUNDING_CENTS = 25;
const DEFAULT_MAX_REPLANS = 3;

type ExecutionPhase =
  | "idle"
  | "classifying"
  | "planning"
  | "plan_review"
  | "executing"
  | "replanning"
  | "complete"
  | "failed";

interface OrchestratorState {
  phase: ExecutionPhase;
  goalId: string | null;
  replanCount: number;
  failedTaskId: string | null;
  failedError: string | null;
}

interface TaskResultEnvelope {
  taskId: string;
  goalId: string | null;
  result: TaskResult;
  error?: string;
}

interface TickCounters {
  tasksAssigned: number;
  tasksCompleted: number;
  tasksFailed: number;
}

const DEFAULT_STATE: OrchestratorState = {
  phase: "idle",
  goalId: null,
  replanCount: 0,
  failedTaskId: null,
  failedError: null,
};

export class Orchestrator {
  private pendingTaskResults: TaskResultEnvelope[] = [];

  constructor(private readonly params: {
    db: Database;
    agentTracker: AgentTracker;
    funding: FundingProtocol;
    messaging: ColonyMessaging;
    inference: PlannerInferenceClient;
    identity: AutomatonIdentity;
    config: any;
    /** Check if a worker agent is still alive. Used to recover stale tasks. */
    isWorkerAlive?: (address: string) => boolean;
    isAgentEligible?: (address: string) => boolean;
    planReviewer?:PlanReviewer;
  }) {}

  async tick(): Promise<OrchestratorTickResult> {
    const counters: TickCounters = {
      tasksAssigned: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
    };

    let state = this.loadState();

    try {
      switch (state.phase) {
        case "idle": {
          state = this.handleIdlePhase(state);
          break;
        }

        case "classifying": {
          state = await this.handleClassifyingPhase(state);
          break;
        }

        case "planning": {
          state = await this.handlePlanningPhase(state);
          break;
        }

        case "plan_review": {
          state = await this.handlePlanReviewPhase(state);
          break;
        }

        case "executing": {
          state = await this.handleExecutingPhase(state, counters);
          break;
        }

        case "replanning": {
          state = await this.handleReplanningPhase(state);
          break;
        }

        case "complete": {
          state = await this.handleCompletePhase(state);
          break;
        }

        case "failed": {
          state = this.handleFailedPhase(state);
          break;
        }

        default: {
          state = { ...DEFAULT_STATE };
          break;
        }
      }
    } catch (error) {
      const err = normalizeError(error);
      logger.error("Orchestrator tick failed", err, {
        phase: state.phase,
        goalId: state.goalId,
      });

      if (state.goalId) {
        updateGoalStatus(this.params.db, state.goalId, "failed");
      }

      state = {
        ...state,
        phase: "failed",
        failedError: err.message,
      };
    }

    this.saveState(state);
    this.persistTodo();

    return {
      phase: state.phase,
      tasksAssigned: counters.tasksAssigned,
      tasksCompleted: counters.tasksCompleted,
      tasksFailed: counters.tasksFailed,
      goalsActive: getActiveGoals(this.params.db).length,
      agentsActive: this.getActiveAgentCount(),
    };
  }

  async matchTaskToAgent(task: TaskNode): Promise<AgentAssignment> {
    const requestedRole = task.agentRole?.trim() || "generalist";

    const idleAgents = this.params.agentTracker.getIdle().filter(agent=>this.params.isAgentEligible?.(agent.address)!==false);
    const directRoleMatch = idleAgents.find((agent) => agent.role === requestedRole);
    if (directRoleMatch) {
      return {
        agentAddress: directRoleMatch.address,
        agentName: directRoleMatch.name,
        spawned: false,
      };
    }

    const bestIdle = this.params.agentTracker.getBestForTask(requestedRole);
    if (bestIdle && this.params.isAgentEligible?.(bestIdle.address)!==false) {
      return {
        agentAddress: bestIdle.address,
        agentName: bestIdle.name,
        spawned: false,
      };
    }

    const spawned = await this.trySpawnAgent(task);
    if (spawned) {
      return spawned;
    }

    const reassigned = this.findBusyAgentForReassign();
    if (reassigned) {
      return {
        agentAddress: reassigned.address,
        agentName: reassigned.name,
        spawned: false,
      };
    }

    // Fallback: assign to the parent agent itself (self-execution mode).
    // This handles local dev environments where spawning child sandboxes
    // is not available, and ensures goals still make progress.
    if (this.params.identity?.address) {
      logger.warn("No child agents available, self-assigning task to parent", {
        taskId: task.id,
        role: requestedRole,
      });
      return {
        agentAddress: this.params.identity.address,
        agentName: this.params.identity.name ?? "parent",
        spawned: false,
      };
    }

    throw new Error(`No available agent for task ${task.id}`);
  }

  async fundAgentForTask(addr: string, task: TaskNode): Promise<void> {
    const estimated = Math.max(0, task.metadata.estimatedCostCents);
    const configuredDefault = Number(this.params.config?.defaultTaskFundingCents ?? DEFAULT_TASK_FUNDING_CENTS);
    const amountCents = Math.max(estimated, Number.isFinite(configuredDefault) ? configuredDefault : 0);

    if (amountCents <= 0) {
      return;
    }

    const experiment=new RevenueStore(this.params.db).getActiveExperimentForTask(task.id);
    const result = await this.params.funding.fundChild(addr, amountCents,experiment?{operationId:`op_child_${task.id}`,experimentId:experiment.id}:undefined);
    if (!result.success) {
      throw new Error(`Funding transfer failed for ${addr}`);
    }
  }

  async collectResults(): Promise<TaskResult[]> {
    this.pendingTaskResults = [];

    const processed = await this.params.messaging.processInbox();
    for (const entry of processed) {
      if (!entry.success || entry.message.type !== "task_result") {
        continue;
      }

      const parsed = parseTaskResultMessage(entry.message);
      if (!parsed) {
        continue;
      }

      this.pendingTaskResults.push(parsed);
    }

    return this.pendingTaskResults.map((entry) => entry.result);
  }

  async handleFailure(task: TaskNode, error: string): Promise<void> {
    if (isResearchManagedTask(this.params.db, task.id)) {
      const current = getTaskById(this.params.db, task.id);
      if (current && !["completed", "failed", "cancelled"].includes(current.status)) {
        failTask(this.params.db, task.id, error, false);
      }
      return;
    }
    failTask(this.params.db, task.id, error, true);

    const latest = getTaskById(this.params.db, task.id);
    if (!latest || latest.status !== "failed") {
      return;
    }

    const state = this.loadState();
    const maxReplans = this.getMaxReplans();

    if (state.replanCount < maxReplans) {
      updateGoalStatus(this.params.db, task.goalId, "active");
    }

    this.saveState({
      ...state,
      phase: state.replanCount < maxReplans ? "replanning" : "failed",
      goalId: task.goalId,
      failedTaskId: task.id,
      failedError: error,
    });
  }

  private handleIdlePhase(state: OrchestratorState): OrchestratorState {
    const activeGoals = getActiveGoals(this.params.db);
    if (activeGoals.length === 0) {
      return {
        ...state,
        phase: "idle",
        goalId: null,
      };
    }

    const goal = pickGoal(activeGoals, state.goalId);
    return {
      ...state,
      phase: "classifying",
      goalId: goal.id,
      failedTaskId: null,
      failedError: null,
    };
  }

  private async handleClassifyingPhase(state: OrchestratorState): Promise<OrchestratorState> {
    if (!state.goalId) {
      return {
        ...state,
        phase: "idle",
      };
    }

    const goal = getGoalById(this.params.db, state.goalId);
    if (!goal) {
      return {
        ...state,
        phase: "idle",
        goalId: null,
      };
    }

    const tasks = getTasksByGoal(this.params.db, goal.id);
    if (tasks.length > 0) {
      return {
        ...state,
        phase: "executing",
      };
    }

    const complexity = await this.classifyComplexity(goal);
    if (complexity.requiresPlanMode) {
      return {
        ...state,
        phase: "planning",
      };
    }

    decomposeGoal(this.params.db, goal.id, [
      {
        parentId: null,
        goalId: goal.id,
        title: goal.title,
        description: goal.description,
        status: "pending",
        assignedTo: null,
        agentRole: "generalist",
        priority: 50,
        dependencies: [],
        result: null,
      },
    ]);

    return {
      ...state,
      phase: "executing",
    };
  }

  private async handlePlanningPhase(state: OrchestratorState): Promise<OrchestratorState> {
    if (!state.goalId) {
      return {
        ...state,
        phase: "idle",
      };
    }

    const goal = getGoalById(this.params.db, state.goalId);
    if (!goal) {
      return {
        ...state,
        phase: "idle",
        goalId: null,
      };
    }

    let output: PlannerOutput;
    try {
      output = await planGoal(
        goalToPlannerInput(goalRowToGoal(goal)),
        await buildPlannerContext({
          db: this.params.db,
          workspace: new AgentWorkspace(goal.id),
          funding: this.params.funding,
          identityAddress: this.params.identity.address,
          usdcBalance: Number(this.params.config?.usdcBalance ?? 0),
          idleAgents: this.params.agentTracker.getIdle().length,
          busyAgents: Math.max(0, this.getActiveAgentCount() - this.params.agentTracker.getIdle().length),
          maxAgents: Number(this.params.config?.maxChildren ?? 3),
        }),
        this.params.inference,
      );
    } catch (error) {
      if(error instanceof InferenceAdmissionError||error instanceof InferenceExecutionUncertainError)throw error;
      const err = normalizeError(error);
      logger.warn("Planner inference failed, falling back to single-task plan", {
        goalId: goal.id,
        error: err.message,
      });
      output = {
        analysis: `Planner fallback: ${err.message}`,
        strategy: "Execute goal as a single generalist task",
        customRoles: [],
        tasks: [{
          title: goal.title,
          description: goal.description,
          agentRole: "generalist",
          dependencies: [],
          estimatedCostCents: 200,
          priority: 50,
          timeoutMs: 300_000,
        }],
        risks: ["Planner unavailable — executing without decomposition"],
        estimatedTotalCostCents: 200,
        estimatedTimeMinutes: 30,
      };
    }

    if (output.tasks.length === 0) {
      // Planner returned valid JSON but empty tasks — use fallback single task
      logger.warn("Planner returned no tasks, falling back to single-task plan", { goalId: goal.id });
      output = {
        ...output,
        tasks: [{
          title: goal.title,
          description: goal.description,
          agentRole: "generalist",
          dependencies: [],
          estimatedCostCents: 200,
          priority: 50,
          timeoutMs: 300_000,
        }],
      };
    }

    decomposeGoal(this.params.db, goal.id, plannerOutputToTasks(goal.id, output));
    await this.persistPlannerOutput(goal.id, output, "plan");

    return {
      ...state,
      phase: "plan_review",
    };
  }

  private async handlePlanReviewPhase(state: OrchestratorState): Promise<OrchestratorState> {
    if (!state.goalId) {
      return { ...state, phase: "idle" };
    }

    const planKey = `orchestrator.plan.${state.goalId}`;
    const planRow = this.params.db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .get(planKey) as { value: string } | undefined;

    if (!planRow?.value) {
      throw new Error('Plan review requires a persisted plan; execution blocked');
    }

    const planData = safeJsonParse(planRow.value);
    if (!planData) {
      throw new Error('Plan review requires valid persisted JSON; execution blocked');
    }

    try {
      const result = await reviewPlan(planData as any, this.params.config?.planApproval ?? {
        mode: "auto",
        autoBudgetThreshold: 5000,
        consensusCriticRole: "reviewer",
        reviewTimeoutMs: 1800000,
      },this.params.planReviewer);

      insertEvent(this.params.db,{type:'plan_reviewed',agentAddress:this.params.identity.address,goalId:state.goalId,tokenCount:0,
        content:JSON.stringify({planDigest:createHash('sha256').update(JSON.stringify(planData)).digest('hex'),approved:result.approved,
          feedback:result.feedback??null,replanCount:state.replanCount,executionPermissionGranted:false})});

      if (result.approved) {
        return { ...state, phase: "executing" };
      }

      this.params.db.prepare(
        "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      ).run(`orchestrator.review_feedback.${state.goalId}`, result.feedback ?? "Plan rejected");

      if(state.replanCount>=this.getMaxReplans())throw new Error('Plan review revision budget exhausted; execution blocked');
      return { ...state, phase: "planning",replanCount:state.replanCount+1 };
    } catch (error) {
      const err = normalizeError(error);
      if (err.message === "awaiting human approval") {
        return state;
      }
      throw error;
    }
  }

  private async handleExecutingPhase(
    state: OrchestratorState,
    counters: TickCounters,
  ): Promise<OrchestratorState> {
    if (!state.goalId) {
      return {
        ...state,
        phase: "idle",
      };
    }

    const goal = getGoalById(this.params.db, state.goalId);
    if (!goal) {
      return {
        ...state,
        phase: "idle",
        goalId: null,
      };
    }

    // Recover stale tasks: workers that died (process restart, sandbox crash)
    // leave tasks stuck in 'assigned' forever. Detect and reset them.
    if (this.params.isWorkerAlive) {
      const assignedTasks = getTasksByGoal(this.params.db, goal.id)
        .filter((t) => t.status === "assigned" && t.assignedTo);
      for (const task of assignedTasks) {
        if(isResearchManagedTask(this.params.db,task.id))continue;
        const alive = this.params.isWorkerAlive(task.assignedTo!);
        if (!alive) {
          logger.warn("Recovering stale task from dead worker", {
            taskId: task.id,
            worker: task.assignedTo,
          });
          this.params.db.prepare(
            "UPDATE task_graph SET status = 'pending', assigned_to = NULL, started_at = NULL WHERE id = ?",
          ).run(task.id);
        }
      }
    }

    const ready = getReadyTasks(this.params.db)
      .filter((task) => task.goalId === goal.id && !isResearchManagedTask(this.params.db,task.id));

    for (const task of ready) {
      try {
        const assignment = await this.matchTaskToAgent(task);
        assignTask(this.params.db, task.id, assignment.agentAddress);

        const isLocalWorker = assignment.agentAddress.startsWith("local://");
        const isSelfAssigned = assignment.agentAddress === this.params.identity?.address;

        // Local workers receive their task directly at spawn time and run
        // their own inference loop. Self-assigned tasks are handled by the
        // parent agent via its normal turn. Neither needs funding or messaging.
        if (!isLocalWorker && !isSelfAssigned) {
          await this.fundAgentForTask(assignment.agentAddress, task);

          const message = this.params.messaging.createMessage({
            type: "task_assignment",
            to: assignment.agentAddress,
            goalId: task.goalId,
            taskId: task.id,
            priority: "high",
            requiresResponse: true,
            content: JSON.stringify({
              taskId: task.id,
              title: task.title,
              description: task.description,
              agentRole: task.agentRole,
              dependencies: task.dependencies,
              timeoutMs: task.metadata.timeoutMs,
            }),
          });

          await this.params.messaging.send(message);
        }

        this.params.agentTracker.updateStatus(assignment.agentAddress, "running");
        counters.tasksAssigned += 1;
      } catch (error) {
        const err = normalizeError(error);

        // If no agent is available, skip this task — it stays pending and will
        // be retried on the next tick when an agent becomes available or is spawned.
        if (err.message.startsWith("No available agent")) {
          logger.warn("No agent available for task, will retry next tick", {
            taskId: task.id,
            role: task.agentRole,
          });
          continue;
        }

        const previous = getTaskById(this.params.db, task.id);
        await this.handleFailure(task, err.message);
        const latest = getTaskById(this.params.db, task.id);
        if (previous?.status !== "failed" && latest?.status === "failed") {
          counters.tasksFailed += 1;
        }
      }
    }

    await this.collectResults();

    for (const event of this.pendingTaskResults) {
      const taskRow = getTaskById(this.params.db, event.taskId);
      if (!taskRow || isResearchManagedTask(this.params.db, taskRow.id)) {
        continue;
      }

      if (event.result.success) {
        try {
          completeTask(this.params.db, taskRow.id, event.result);
          counters.tasksCompleted += 1;

          if (taskRow.assignedTo) {
            this.params.agentTracker.updateStatus(taskRow.assignedTo, "healthy");
          }
        } catch (error) {
          const err = normalizeError(error);
          const taskNode = taskRowToTaskNode(taskRow);
          await this.handleFailure(taskNode, err.message);
          const latest = getTaskById(this.params.db, taskNode.id);
          if (taskRow.status !== "failed" && latest?.status === "failed") {
            counters.tasksFailed += 1;
          }
        }

        continue;
      }

      const taskNode = taskRowToTaskNode(taskRow);
      await this.handleFailure(taskNode, event.error ?? event.result.output);
      const latest = getTaskById(this.params.db, taskNode.id);
      if (taskRow.status !== "failed" && latest?.status === "failed") {
        counters.tasksFailed += 1;
      }
    }

    const progress = getGoalProgress(this.params.db, goal.id);

    if (progress.total > 0 && progress.completed === progress.total) {
      updateGoalStatus(this.params.db, goal.id, "completed");
      return {
        ...state,
        phase: "complete",
      };
    }

    const legacyFailure = getTasksByGoal(this.params.db, goal.id)
      .find(task => task.status === "failed" && !isResearchManagedTask(this.params.db, task.id));
    if (legacyFailure) {
      const maxReplans = this.getMaxReplans();
      return {
        ...state,
        phase: state.replanCount < maxReplans ? "replanning" : "failed",
        failedTaskId: legacyFailure.id,
        failedError: state.failedError ?? "Task execution failed",
      };
    }

    return state;
  }

  private async handleReplanningPhase(state: OrchestratorState): Promise<OrchestratorState> {
    if (!state.goalId) {
      return {
        ...state,
        phase: "idle",
      };
    }

    const goal = getGoalById(this.params.db, state.goalId);
    if (!goal) {
      return {
        ...state,
        phase: "idle",
        goalId: null,
      };
    }

    const failedTaskRow = state.failedTaskId
      ? getTaskById(this.params.db, state.failedTaskId)
      : getTasksByGoal(this.params.db, goal.id).find((task) => task.status === "failed");

    if (!failedTaskRow) {
      return {
        ...state,
        phase: "executing",
      };
    }

    // Old persisted replanning states must not turn a reviewed research failure
    // into unrelated replacement tasks or another paid planning request.
    if (isResearchManagedTask(this.params.db, failedTaskRow.id)) {
      return { ...state, phase: "executing", failedTaskId: null, failedError: null };
    }

    let output: PlannerOutput;
    try {
      output = await replanAfterFailure(
        goalToPlannerInput(goalRowToGoal(goal)),
        taskToPlannerFailureInput(taskRowToTaskNode(failedTaskRow)),
        await buildPlannerContext({
          db: this.params.db,
          workspace: new AgentWorkspace(goal.id),
          funding: this.params.funding,
          identityAddress: this.params.identity.address,
          usdcBalance: Number(this.params.config?.usdcBalance ?? 0),
          idleAgents: this.params.agentTracker.getIdle().length,
          busyAgents: Math.max(0, this.getActiveAgentCount() - this.params.agentTracker.getIdle().length),
          maxAgents: Number(this.params.config?.maxChildren ?? 3),
        }),
        this.params.inference,
      );
    } catch (error) {
      if(error instanceof InferenceAdmissionError||error instanceof InferenceExecutionUncertainError)throw error;
      const err = normalizeError(error);
      logger.warn("Replanner inference failed, falling back to single-task plan", {
        goalId: goal.id,
        error: err.message,
      });
      output = {
        analysis: `Replanner fallback: ${err.message}`,
        strategy: "Re-execute goal as a single generalist task",
        customRoles: [],
        tasks: [{
          title: goal.title,
          description: goal.description,
          agentRole: "generalist",
          dependencies: [],
          estimatedCostCents: 200,
          priority: 50,
          timeoutMs: 300_000,
        }],
        risks: ["Replanner unavailable — re-executing without decomposition"],
        estimatedTotalCostCents: 200,
        estimatedTimeMinutes: 30,
      };
    }

    if (output.tasks.length === 0) {
      logger.warn("Replanner returned no tasks, falling back to single-task plan", { goalId: goal.id });
      output = {
        ...output,
        tasks: [{
          title: goal.title,
          description: goal.description,
          agentRole: "generalist",
          dependencies: [],
          estimatedCostCents: 200,
          priority: 50,
          timeoutMs: 300_000,
        }],
      };
    }

    this.params.db.prepare(
      `UPDATE task_graph
       SET status = 'pending',
           assigned_to = NULL,
           started_at = NULL,
           completed_at = NULL,
           result = NULL
       WHERE goal_id = ?
         AND status IN ('failed', 'blocked')`,
    ).run(goal.id);

    updateGoalStatus(this.params.db, goal.id, "active");

    decomposeGoal(this.params.db, goal.id, plannerOutputToTasks(goal.id, output));
    await this.persistPlannerOutput(goal.id, output, "replan");

    return {
      ...state,
      phase: "plan_review",
      replanCount: state.replanCount + 1,
      failedTaskId: null,
      failedError: null,
    };
  }

  private async handleCompletePhase(state: OrchestratorState): Promise<OrchestratorState> {
    await this.recallAgentCredits();

    return {
      ...DEFAULT_STATE,
      phase: "idle",
    };
  }

  private handleFailedPhase(state: OrchestratorState): OrchestratorState {
    logger.warn("Goal execution failed", {
      goalId: state.goalId,
      error: state.failedError,
      replanCount: state.replanCount,
    });

    if (!state.goalId) {
      return { ...DEFAULT_STATE };
    }

    updateGoalStatus(this.params.db, state.goalId, "failed");

    // Reset to idle so the orchestrator can pick up other active goals
    // instead of being stuck in "failed" forever.
    return { ...DEFAULT_STATE };
  }

  private async classifyComplexity(goal: GoalRow): Promise<{ requiresPlanMode: boolean; estimatedSteps: number }> {
    try {
      const result = await this.params.inference.chat({
        tier: "cheap",
        responseFormat: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Classify execution complexity.",
              "Return JSON with keys: estimatedSteps (number), reason (string), stepOutline (array of strings).",
              "No markdown.",
            ].join(" "),
          },
          {
            role: "user",
            content: `Goal title: ${goal.title}\nGoal description: ${goal.description}`,
          },
        ],
      });

      const parsed = safeJsonParse(result.content);
      const estimatedSteps = clampSteps(
        typeof parsed?.estimatedSteps === "number" ? parsed.estimatedSteps : heuristicStepEstimate(goal),
      );

      return {
        estimatedSteps,
        requiresPlanMode: estimatedSteps > 3,
      };
    } catch (error) {
      if(error instanceof InferenceAdmissionError||error instanceof InferenceExecutionUncertainError)throw error;
      const estimatedSteps = heuristicStepEstimate(goal);
      return {
        estimatedSteps,
        requiresPlanMode: estimatedSteps > 3,
      };
    }
  }

  private findBusyAgentForReassign(): { address: string; name: string } | null {
    const idleAddresses = new Set(this.params.agentTracker.getIdle().map((agent) => agent.address));

    const rows = this.params.db.prepare(
      `SELECT name, address, status
       FROM children
       WHERE status IN ('running', 'healthy')
       ORDER BY created_at ASC`,
    ).all() as { name: string; address: string; status: string }[];

    const candidate = rows.find((row) => !idleAddresses.has(row.address)&&this.params.isAgentEligible?.(row.address)!==false);
    if (!candidate) {
      return null;
    }

    return {
      address: candidate.address,
      name: candidate.name,
    };
  }

  private async trySpawnAgent(task: TaskNode): Promise<AgentAssignment | null> {
    if (this.params.config?.disableSpawn === true) {
      return null;
    }

    const spawn = this.params.config?.spawnAgent;
    if (typeof spawn !== "function") {
      return null;
    }

    const spawned = await spawn(task);
    if (!spawned || typeof spawned.address !== "string" || typeof spawned.name !== "string") {
      return null;
    }
    if(this.params.isAgentEligible?.(spawned.address)===false)return null;

    this.params.agentTracker.register({
      address: spawned.address,
      name: spawned.name,
      role: task.agentRole ?? "generalist",
      sandboxId: typeof spawned.sandboxId === "string" ? spawned.sandboxId : ulid(),
    });

    this.params.agentTracker.updateStatus(spawned.address, "running");

    return {
      agentAddress: spawned.address,
      agentName: spawned.name,
      spawned: true,
    };
  }

  private async recallAgentCredits(): Promise<void> {
    const children = this.params.db.prepare(
      `SELECT address FROM children WHERE status IN ('running', 'healthy')`,
    ).all() as { address: string }[];

    for (const child of children) {
      try {
        await this.params.funding.recallCredits(child.address);
      } catch (error) {
        const err = normalizeError(error);
        logger.warn("Failed to recall credits", {
          address: child.address,
          error: err.message,
        });
      }
    }
  }

  private persistTodo(): void {
    const todoMd = generateTodoMd(this.params.db);
    this.params.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    ).run(ORCHESTRATOR_TODO_KEY, todoMd);
  }

  private async persistPlannerOutput(
    goalId: string,
    output: PlannerOutput,
    mode: "plan" | "replan",
  ): Promise<void> {
    const canonicalKey = `orchestrator.plan.${goalId}`;
    const modeKey = `orchestrator.${mode}.${goalId}`;
    this.params.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    ).run(canonicalKey, JSON.stringify(output));

    if (modeKey !== canonicalKey) {
      this.params.db.prepare(
        "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      ).run(modeKey, JSON.stringify(output));
    }

    try {
      const workspace = new AgentWorkspace(goalId);
      await persistPlannerArtifacts({
        goalId,
        workspacePath: workspace.basePath,
        plan: output,
        version: getNextPlannerVersion(workspace.basePath),
      });
    } catch (error) {
      const err = normalizeError(error);
      logger.warn("Failed to persist planner artifacts to workspace", {
        goalId,
        mode,
        error: err.message,
      });
    }
  }

  private loadState(): OrchestratorState {
    const row = this.params.db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .get(ORCHESTRATOR_STATE_KEY) as { value: string } | undefined;

    if (!row?.value) {
      return { ...DEFAULT_STATE };
    }

    const parsed = safeJsonParse(row.value);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_STATE };
    }

    const phase = asPhase(parsed.phase);
    return {
      phase: phase ?? DEFAULT_STATE.phase,
      goalId: typeof parsed.goalId === "string" ? parsed.goalId : null,
      replanCount: typeof parsed.replanCount === "number" ? Math.max(0, Math.floor(parsed.replanCount)) : 0,
      failedTaskId: typeof parsed.failedTaskId === "string" ? parsed.failedTaskId : null,
      failedError: typeof parsed.failedError === "string" ? parsed.failedError : null,
    };
  }

  private saveState(state: OrchestratorState): void {
    this.params.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    ).run(ORCHESTRATOR_STATE_KEY, JSON.stringify(state));
  }

  private getActiveAgentCount(): number {
    const row = this.params.db.prepare(
      `SELECT COUNT(*) AS count FROM children WHERE status IN ('running', 'healthy')`,
    ).get() as { count: number } | undefined;

    return row?.count ?? 0;
  }

  private getMaxReplans(): number {
    const configured = Number(this.params.config?.maxReplans ?? DEFAULT_MAX_REPLANS);
    if (!Number.isFinite(configured)) {
      return DEFAULT_MAX_REPLANS;
    }

    return Math.max(0, Math.floor(configured));
  }
}

function plannerOutputToTasks(goalId: string, output: PlannerOutput): Omit<TaskNode, "id" | "metadata">[] {
  return output.tasks.map((task, index) => ({
    parentId: null,
    goalId,
    title: task.title,
    description: task.description,
    status: "pending",
    assignedTo: null,
    agentRole: task.agentRole,
    priority: clampPriority(task.priority, index),
    dependencies: task.dependencies.map((dep) => String(dep)),
    result: null,
  }));
}

function goalRowToGoal(goal: GoalRow): Goal {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    status: goal.status,
    strategy: goal.strategy,
    rootTasks: [],
    expectedRevenueCents: goal.expectedRevenueCents,
    actualRevenueCents: goal.actualRevenueCents,
    createdAt: goal.createdAt,
    deadline: goal.deadline,
  };
}

function taskRowToTaskNode(task: TaskGraphRow): TaskNode {
  return {
    id: task.id,
    parentId: task.parentId,
    goalId: task.goalId,
    title: task.title,
    description: task.description,
    status: task.status,
    assignedTo: task.assignedTo,
    agentRole: task.agentRole,
    priority: task.priority,
    dependencies: task.dependencies,
    result: normalizeTaskResult(task.result),
    metadata: {
      estimatedCostCents: task.estimatedCostCents,
      actualCostCents: task.actualCostCents,
      maxRetries: task.maxRetries,
      retryCount: task.retryCount,
      timeoutMs: task.timeoutMs,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    },
  };
}

function parseTaskResultMessage(message: AgentMessage): TaskResultEnvelope | null {
  const payload = safeJsonParse(message.content);
  const fallbackTaskId = typeof message.taskId === "string" ? message.taskId : null;

  if (!payload || typeof payload !== "object") {
    if (!fallbackTaskId) {
      return null;
    }

    return {
      taskId: fallbackTaskId,
      goalId: message.goalId,
      result: {
        success: true,
        output: message.content,
        artifacts: [],
        costCents: 0,
        duration: 0,
      },
    };
  }

  const obj = payload as Record<string, unknown>;
  const nested = obj.result && typeof obj.result === "object"
    ? obj.result as Record<string, unknown>
    : obj;

  const taskId = firstString(obj.taskId, fallbackTaskId);
  if (!taskId) {
    return null;
  }

  const success = firstBoolean(nested.success, obj.success, true);
  const output = firstString(nested.output, obj.output, success ? "ok" : "task failed") ?? "";

  const result: TaskResult = {
    success,
    output,
    artifacts: normalizeArtifacts(nested.artifacts ?? obj.artifacts),
    costCents: firstNumber(nested.costCents, obj.costCents, 0),
    duration: firstNumber(nested.duration, obj.duration, 0),
  };

  return {
    taskId,
    goalId: message.goalId,
    result,
    error: success ? undefined : (firstString(obj.error, output) ?? undefined),
  };
}

function pickGoal(goals: GoalRow[], preferredId: string | null): GoalRow {
  if (preferredId) {
    const preferred = goals.find((goal) => goal.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }

  return goals[0];
}

function clampPriority(priority: number, fallbackIndex: number): number {
  if (!Number.isFinite(priority)) {
    return Math.max(0, 50 - fallbackIndex);
  }

  return Math.max(0, Math.min(100, Math.floor(priority)));
}

function heuristicStepEstimate(goal: GoalRow): number {
  const words = `${goal.title} ${goal.description}`.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 40) return 6;
  if (words >= 24) return 5;
  if (words >= 12) return 4;
  return 2;
}

function clampSteps(value: number): number {
  if (!Number.isFinite(value)) {
    return 4;
  }

  const rounded = Math.floor(value);
  return Math.max(1, Math.min(20, rounded));
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeArtifacts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function firstBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return false;
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function asPhase(value: unknown): ExecutionPhase | null {
  if (
    value === "idle"
    || value === "classifying"
    || value === "planning"
    || value === "plan_review"
    || value === "executing"
    || value === "replanning"
    || value === "complete"
    || value === "failed"
  ) {
    return value;
  }

  return null;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
