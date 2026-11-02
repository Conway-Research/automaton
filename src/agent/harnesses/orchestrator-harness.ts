import path from "node:path";
import type { TaskGraphRow } from "../../state/database.js";
import { getTaskById, getTasksByGoal } from "../../state/database.js";
import { loadPlan } from "../../orchestration/plan-mode.js";
import {
  createPlannerFailureFromVerification,
  createPlannerGoalFromTask,
  planGoal,
  replanAfterFailure,
  taskToPlannerFailureInput,
  type PlannerOutput,
} from "../../orchestration/planner.js";
import {
  buildPlannerContext,
  getCurrentPlannerVersion,
  persistPlannerArtifacts,
} from "../../orchestration/planner-context.js";
import type { TaskNode, TaskResult } from "../../orchestration/task-graph.js";
import {
  decomposeGoal,
  normalizeTaskResult,
} from "../../orchestration/task-graph.js";
import { BaseHarness } from "./base-harness.js";
import type { HarnessTool } from "../harness-types.js";

const MAX_FIX_CYCLES = 3;

export class OrchestratorHarness extends BaseHarness {
  readonly id = "orchestrator";
  readonly description = "Orchestrator agent for task decomposition, delegation, verification, and fix coordination.";

  private delegatedTaskIds: string[] = [];
  private currentPlan: PlannerOutput | null = null;
  private planVersion = 0;
  private plannerMode: "plan" | "replan" = "plan";
  private plannerError: string | null = null;
  private planTaskIdByIndex = new Map<number, string>();

  override async initialize(task: TaskNode, context: Parameters<BaseHarness["initialize"]>[1]): Promise<void> {
    await super.initialize(task, context);
    this.refreshDelegatedTaskState();
    this.planVersion = getCurrentPlannerVersion(this.getPlanWorkspacePath());

    try {
      if (this.shouldRefreshPlanOnInitialize()) {
        await this.refreshPlanInternal({});
      } else if (this.planVersion > 0) {
        this.currentPlan = await loadPlan(path.join(this.getPlanWorkspacePath(), "plan.json"));
        this.planTaskIdByIndex = buildPlanTaskIndexMap(this.currentPlan, this.getManagedTasks());
      }
    } catch (error) {
      this.plannerError = error instanceof Error ? error.message : String(error);
    }

    this.messages = [
      { role: "system", content: this.buildEffectiveSystemPrompt() },
      { role: "user", content: this.buildTaskPrompt() },
    ];
  }

  buildSystemPrompt(): string {
    return `You are an orchestrator agent responsible for decomposing complex tasks
into smaller sub-tasks, delegating them, and verifying the results.

## Your Pipeline

You follow a strict planner-backed plan → execute → verify → fix cycle:

1. **PLAN**: Call refresh_plan to load the current planner output. Then delegate the
   planned work using delegate_task with plan_task_index whenever possible.
2. **EXECUTE**: After delegating, use check_task_status to monitor sub-task progress.
   Wait for delegated work to finish before concluding.
3. **VERIFY**: Once sub-tasks complete, use read_task_output and verify_result to
   validate results against the planned success criteria.
4. **FIX**: If a sub-task fails or verification fails, call refresh_plan again to
   request a planner-backed fix/replan, then delegate the new work.

## Rules

1. NEVER execute code yourself. You are a coordinator, not an executor.
2. Prefer delegate_task(plan_task_index=...) over rewriting planned tasks manually.
3. Do not delegate the same planned task twice; if a task already exists, reuse it.
4. Always verify completed sub-tasks before reporting completion.
5. If all sub-tasks succeed, call task_done with a consolidated summary.
6. If fix cycles are exhausted, call task_done with the best partial result and the blocker.
7. Do NOT create circular dependencies between sub-tasks.

## Anti-Loop Rules

- Do NOT repeatedly check_task_status for the same task without new information.
- If a sub-task is still running, move on to another sub-task or wait.
- If planner output exists, follow it instead of inventing an unrelated decomposition.
- If you have nothing left to delegate or verify, call task_done.`;
  }

  override buildTaskPrompt(): string {
    const sections = [super.buildTaskPrompt()];
    const managedTasks = this.getManagedTasks();

    sections.push("", "## Planner State");
    if (this.currentPlan) {
      sections.push(
        `Current planner mode: ${this.plannerMode}`,
        `Current planner version: v${this.planVersion}`,
        formatPlanSummary(this.currentPlan),
      );
    } else if (this.plannerError) {
      sections.push(`Planner unavailable: ${this.plannerError}`);
    } else {
      sections.push("No plan is currently loaded. Call refresh_plan first.");
    }

    sections.push("", "## Existing Delegated Sub-Tasks");
    if (managedTasks.length === 0) {
      sections.push("No delegated sub-tasks exist yet.");
    } else {
      sections.push(...managedTasks.map((task) => formatManagedTask(task)));
    }

    sections.push(
      "",
      "## Operating Instructions",
      "- Start with refresh_plan if you need the latest planner output.",
      "- Use delegate_task(plan_task_index=...) to materialize planned tasks in order.",
      "- Use dependency task IDs returned by delegate_task for any manual follow-up tasks.",
      "- Verify completed work before declaring success.",
      "- If a delegated task fails or verification fails, call refresh_plan again to get a planner-backed fix plan.",
    );

    return sections.join("\n");
  }

  getToolDefs(): HarnessTool[] {
    return [
      {
        name: "refresh_plan",
        description: "Generate or refresh the planner-backed task decomposition. Automatically replans around failed or unverifiable sub-tasks.",
        parameters: {
          type: "object",
          properties: {
            failed_task_id: {
              type: "string",
              description: "Optional failed sub-task ID to replan around. If omitted, the first failed managed sub-task is used.",
            },
            failure_note: {
              type: "string",
              description: "Optional extra failure or verification context to feed into replanning.",
            },
          },
          required: [],
        },
        execute: async (args) => {
          try {
            const failedTaskId = typeof args.failed_task_id === "string" ? args.failed_task_id : undefined;
            const failureNote = typeof args.failure_note === "string" ? args.failure_note : undefined;
            const result = await this.refreshPlanInternal({ failedTaskId, failureNote });
            return [
              `Planner refreshed in ${result.mode} mode (v${result.version}).`,
              formatPlanSummary(result.plan),
            ].join("\n\n");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.plannerError = message;
            return `Failed to refresh plan: ${message}`;
          }
        },
      },
      {
        name: "delegate_task",
        description: "Create a sub-task and add it to the task graph for execution by a worker agent.",
        parameters: {
          type: "object",
          properties: {
            plan_task_index: {
              type: "number",
              description: "Index of the task in the current planner output. Preferred when a planner-backed plan is available.",
            },
            title: { type: "string", description: "Short, descriptive title for the sub-task" },
            description: { type: "string", description: "Detailed description including success criteria" },
            role: {
              type: "string",
              description: "Agent role: executor (coding), researcher (info gathering), tester (verification), generalist (other)",
            },
            priority: { type: "number", description: "Priority 0-100 (default: 50)" },
            depends_on: {
              type: "array",
              items: { type: "string" },
              description: "Array of task IDs this sub-task depends on (default: [])",
            },
          },
          required: [],
        },
        execute: async (args) => {
          try {
            const plannedIndex = typeof args.plan_task_index === "number"
              ? Math.floor(args.plan_task_index)
              : null;

            const plannedTask = plannedIndex !== null && this.currentPlan
              ? this.currentPlan.tasks[plannedIndex]
              : null;

            if (plannedIndex !== null && !plannedTask) {
              return `No planner task found at index ${plannedIndex}. Call refresh_plan first.`;
            }

            const title = plannedTask?.title ?? asNonEmptyString(args.title, "title");
            const description = plannedTask?.description ?? asNonEmptyString(args.description, "description");
            const role = plannedTask?.agentRole ?? asNonEmptyString(args.role, "role");
            const priority = plannedTask
              ? clampPriority(plannedTask.priority)
              : clampPriority(typeof args.priority === "number" ? args.priority : 50);

            const existing = this.findManagedTaskBySignature(title, role, description);
            if (existing) {
              this.trackDelegatedTask(existing.id, plannedIndex);
              return `Sub-task already exists: "${existing.title}" (ID: ${existing.id}, status: ${existing.status})`;
            }

            const dependsOn = plannedTask
              ? this.resolvePlannedDependencies(plannedTask.dependencies)
              : Array.isArray(args.depends_on)
                ? (args.depends_on as string[])
                : [];

            if (plannedTask && plannedTask.dependencies.length > 0 && dependsOn.length !== plannedTask.dependencies.length) {
              const missingIndexes = plannedTask.dependencies
                .filter((dependencyIndex) => !this.planTaskIdByIndex.has(dependencyIndex));
              return `Cannot delegate planner task ${plannedIndex} yet. Delegate dependency task indexes first: ${missingIndexes.join(", ")}`;
            }

            const beforeIds = new Set(getTasksByGoal(this.context.db, this.context.goalId).map((task) => task.id));
            decomposeGoal(this.context.db, this.context.goalId, [
              {
                parentId: this.task.id,
                goalId: this.context.goalId,
                title,
                description,
                status: "pending",
                assignedTo: null,
                agentRole: role,
                priority,
                dependencies: dependsOn,
                result: null,
              },
            ]);

            const createdTask = getTasksByGoal(this.context.db, this.context.goalId).find((task) =>
              !beforeIds.has(task.id)
              && task.parentId === this.task.id
              && task.title === title
              && task.agentRole === role,
            );

            const taskId = createdTask?.id ?? "unknown";
            this.trackDelegatedTask(taskId, plannedIndex);

            return [
              `Sub-task created: "${title}"`,
              `ID: ${taskId}`,
              `Role: ${role}`,
              `Priority: ${priority}`,
              `Depends on: ${dependsOn.length > 0 ? dependsOn.join(", ") : "none"}`,
            ].join("\n");
          } catch (error) {
            return `Failed to create sub-task: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },
      {
        name: "check_task_status",
        description: "Check the current status of a delegated sub-task.",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "The task ID to check" },
          },
          required: ["task_id"],
        },
        execute: async (args) => {
          const taskId = args.task_id as string;
          const task = getTaskById(this.context.db, taskId);
          if (!task || task.goalId !== this.context.goalId) return `Task not found: ${taskId}`;
          const lines = [
            `Status: ${task.status}`,
            `Title: ${task.title}`,
            `Assigned to: ${task.assignedTo ?? "unassigned"}`,
          ];
          const result = normalizeTaskResult(task.result) as TaskResult | null;
          if (result) {
            lines.push(`Success: ${result.success}`);
            lines.push(`Output: ${result.output.slice(0, 500)}`);
            if (result.artifacts.length > 0) {
              lines.push(`Artifacts: ${result.artifacts.join(", ")}`);
            }
          }
          return lines.join("\n");
        },
      },
      {
        name: "read_task_output",
        description: "Read the full output and artifacts of a completed task.",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "The task ID to read output from" },
          },
          required: ["task_id"],
        },
        execute: async (args) => {
          const taskId = args.task_id as string;
          const task = getTaskById(this.context.db, taskId);
          if (!task || task.goalId !== this.context.goalId) return `Task not found: ${taskId}`;
          if (task.status !== "completed" && task.status !== "failed") {
            return `Task ${taskId} is not yet complete (status: ${task.status})`;
          }
          const result = normalizeTaskResult(task.result);
          if (!result) return `Task ${taskId} has no result data`;
          return JSON.stringify(result, null, 2);
        },
      },
      {
        name: "verify_result",
        description: "Screen a completed task's text for criterion terms. This is a heuristic only, not external verification of correctness, demand or payment.",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "The task ID to verify" },
            criteria: { type: "string", description: "The success criteria to check against" },
          },
          required: ["task_id", "criteria"],
        },
        execute: async (args) => {
          const taskId = args.task_id as string;
          const criteria = args.criteria as string;
          if (typeof criteria !== "string" || !criteria.trim()) return "Invalid verification criteria: supply substantive criteria";
          const task = getTaskById(this.context.db, taskId);
          if (!task || task.goalId !== this.context.goalId) return `Task not found: ${taskId}`;
          if (task.status !== "completed") return `Task ${taskId} is not completed (status: ${task.status})`;
          const result = normalizeTaskResult(task.result);
          if (!result) return `Task ${taskId} has no result data`;

          const criteriaTerms = criteria.toLowerCase().split(/\s+/u).filter((term) => term.length > 3);
          const outputLower = result.output.toLowerCase();
          const matched = criteriaTerms.filter((term) => outputLower.includes(term));
          if (!criteriaTerms.length) return "Invalid verification criteria: no substantive terms to check";
          const matchRatio = matched.length / criteriaTerms.length;

          if (matchRatio >= 0.5) {
            return `HEURISTIC MATCH ONLY: ${Math.round(matchRatio * 100)}% criterion terms occur in the reported output. This does not verify correctness, customer demand or payment; inspect independent evidence. Output preview: ${result.output.slice(0, 300)}`;
          }

          const taskNode = taskRowToTaskNode(task);
          let replanNote = "";
          if (this.planVersion < MAX_FIX_CYCLES + 1) {
            try {
              const note = `Verification failed (${Math.round(matchRatio * 100)}% term match). Missing terms: ${criteriaTerms.filter((term) => !outputLower.includes(term)).join(", ")}`;
              const refreshed = await this.refreshPlanInternal({
                verificationFailureTask: createPlannerFailureFromVerification({
                  task: taskNode,
                  output: result.output,
                  note,
                }),
                failureNote: note,
              });
              replanNote = ` Planner-backed replan prepared (v${refreshed.version}); inspect it with refresh_plan before delegating fixes.`;
            } catch (error) {
              this.plannerError = error instanceof Error ? error.message : String(error);
            }
          }

          return `VERIFICATION FAILED: Task output may not meet criteria (${Math.round(matchRatio * 100)}% term match). Missing terms: ${criteriaTerms.filter((term) => !outputLower.includes(term)).join(", ")}. Output preview: ${result.output.slice(0, 300)}.${replanNote}`;
        },
      },
      {
        name: "task_done",
        description: "Signal that orchestration is complete. Provide a consolidated summary of all sub-task results.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Consolidated summary of all sub-task results" },
            success: { type: "boolean", description: "Whether the overall task was completed successfully" },
          },
          required: ["summary"],
        },
        execute: async (args) => {
          const summary = args.summary as string;
          const success = args.success !== false;
          if (success) {
            const unresolved = this.getManagedTasks().filter(task =>
              task.status !== "completed" || normalizeTaskResult(task.result)?.success !== true);
            if (unresolved.length) {
              throw new Error(`Cannot report orchestration success: ${unresolved.length} delegated task(s) are unfinished or unsuccessful. Inspect results, continue bounded work or report failure.`);
            }
          }
          return `TASK_COMPLETE:${success ? "SUCCESS" : "FAILURE"}:${summary}`;
        },
      },
    ];
  }

  private async refreshPlanInternal(params: {
    failedTaskId?: string;
    failureNote?: string;
    verificationFailureTask?: ReturnType<typeof createPlannerFailureFromVerification>;
  }): Promise<{ mode: "plan" | "replan"; version: number; plan: PlannerOutput }> {
    this.refreshDelegatedTaskState();

    const plannerContext = await buildPlannerContext({
      db: this.context.db,
      workspace: this.context.workspace,
      usdcBalance: Number((this.context.config as { usdcBalance?: number } | undefined)?.usdcBalance ?? 0),
      availableRoles: ["executor", "researcher", "tester", "generalist", "orchestrator", "critic"],
      idleAgents: 0,
      busyAgents: Math.max(1, this.getManagedTasks().filter((task) => task.status === "assigned" || task.status === "running").length),
      maxAgents: Math.max(1, Number(this.context.config?.maxChildren ?? this.getManagedTasks().length ?? 1)),
    });

    const explicitFailedTask = params.failedTaskId
      ? getTaskById(this.context.db, params.failedTaskId)
      : undefined;
    const failedManagedTask = explicitFailedTask && explicitFailedTask.parentId === this.task.id
      ? explicitFailedTask
      : this.getManagedTasks().find((task) => task.status === "failed");

    const planningGoal = createPlannerGoalFromTask(this.task);
    const failureInput = params.verificationFailureTask
      ?? (failedManagedTask ? taskToPlannerFailureInput(taskRowToTaskNode(failedManagedTask)) : undefined);

    if (failureInput && this.getFixCycleCount() >= MAX_FIX_CYCLES) {
      throw new Error(`Maximum fix cycles (${MAX_FIX_CYCLES}) reached for this orchestrator task`);
    }

    const plan = failureInput
      ? await replanAfterFailure(planningGoal, failureInput, plannerContext, this.context.inference)
      : await planGoal(planningGoal, plannerContext, this.context.inference);

    const persisted = await persistPlannerArtifacts({
      goalId: this.context.goalId,
      workspacePath: this.getPlanWorkspacePath(),
      plan,
      version: this.planVersion > 0 ? this.planVersion + 1 : undefined,
    });

    const decision = failureInput
      ? `Replanned around ${failureInput.title}`
      : `Planned ${plan.tasks.length} sub-task${plan.tasks.length === 1 ? "" : "s"}`;
    this.context.workspace.logDecision(
      decision,
      params.failureNote ?? plan.strategy,
      this.task.agentRole ?? "orchestrator",
    );

    this.currentPlan = plan;
    this.planVersion = persisted.version;
    this.plannerMode = failureInput ? "replan" : "plan";
    this.plannerError = null;
    this.planTaskIdByIndex = buildPlanTaskIndexMap(plan, this.getManagedTasks());

    return {
      mode: this.plannerMode,
      version: this.planVersion,
      plan,
    };
  }

  private shouldRefreshPlanOnInitialize(): boolean {
    if (this.getManagedTasks().some((task) => task.status === "failed")) {
      return true;
    }

    return this.getManagedTasks().length === 0;
  }

  private refreshDelegatedTaskState(): void {
    const managedTasks = this.getManagedTasks();
    this.delegatedTaskIds = managedTasks.map((task) => task.id);
    this.planTaskIdByIndex = new Map(
      [...this.planTaskIdByIndex.entries()].filter(([, taskId]) =>
        managedTasks.some((task) => task.id === taskId && !isTerminalTaskStatus(task.status))),
    );
  }

  private getManagedTasks(): TaskGraphRow[] {
    return getTasksByGoal(this.context.db, this.context.goalId)
      .filter((task) => task.parentId === this.task.id);
  }

  private getFixCycleCount(): number {
    return Math.max(0, this.planVersion - 1);
  }

  private getPlanWorkspacePath(): string {
    return path.join(this.context.workspace.basePath, "subplans", this.task.id);
  }

  private findManagedTaskBySignature(title: string, role: string, description: string): TaskGraphRow | undefined {
    const normalizedTitle = normalizeText(title);
    const normalizedRole = normalizeText(role);
    const normalizedDescription = normalizeText(description);

    return this.getManagedTasks().find((task) =>
      !isTerminalTaskStatus(task.status)
      && normalizeText(task.title) === normalizedTitle
      && normalizeText(task.agentRole ?? "") === normalizedRole
      && normalizeText(task.description) === normalizedDescription
    );
  }

  private resolvePlannedDependencies(dependencies: number[]): string[] {
    return dependencies
      .map((index) => this.planTaskIdByIndex.get(index))
      .filter((value): value is string => typeof value === "string");
  }

  private trackDelegatedTask(taskId: string, plannedIndex: number | null): void {
    if (taskId === "unknown") {
      return;
    }

    if (!this.delegatedTaskIds.includes(taskId)) {
      this.delegatedTaskIds.push(taskId);
    }

    if (plannedIndex !== null) {
      this.planTaskIdByIndex.set(plannedIndex, taskId);
    }
  }
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

function formatPlanSummary(plan: PlannerOutput): string {
  const lines = [
    `Strategy: ${plan.strategy}`,
    `Analysis: ${plan.analysis}`,
    `Estimated cost: ${plan.estimatedTotalCostCents} cents`,
    `Estimated time: ${plan.estimatedTimeMinutes} minutes`,
    `Risks: ${plan.risks.length > 0 ? plan.risks.join("; ") : "none"}`,
    "",
    "Planned tasks:",
  ];

  plan.tasks.forEach((task, index) => {
    lines.push(
      `${index}. ${task.title} [role=${task.agentRole}, priority=${task.priority}, deps=${task.dependencies.length > 0 ? task.dependencies.join(", ") : "none"}]`,
      `   ${task.description}`,
    );
  });

  return lines.join("\n");
}

function formatManagedTask(task: TaskGraphRow): string {
  const result = normalizeTaskResult(task.result);
  const outcome = result
    ? ` success=${result.success} output=${truncate(result.output, 160)}`
    : "";
  return `- ${task.id}: ${task.title} [status=${task.status}, role=${task.agentRole ?? "generalist"}]${outcome}`;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function clampPriority(value: number): number {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function isTerminalTaskStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function buildPlanTaskIndexMap(
  plan: PlannerOutput,
  managedTasks: TaskGraphRow[],
): Map<number, string> {
  const remainingTasks = managedTasks.filter((task) => !isTerminalTaskStatus(task.status));
  const mapping = new Map<number, string>();

  plan.tasks.forEach((plannedTask, index) => {
    const matchIndex = remainingTasks.findIndex((task) =>
      normalizeText(task.title) === normalizeText(plannedTask.title)
      && normalizeText(task.agentRole ?? "") === normalizeText(plannedTask.agentRole)
      && normalizeText(task.description) === normalizeText(plannedTask.description),
    );

    if (matchIndex === -1) {
      return;
    }

    const [match] = remainingTasks.splice(matchIndex, 1);
    mapping.set(index, match.id);
  });

  return mapping;
}
