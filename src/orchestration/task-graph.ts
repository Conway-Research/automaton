import type { Database } from "better-sqlite3";
import { ulid } from "ulid";
import {
  getGoalById,
  getReadyTasks as getReadyTaskRows,
  getTaskById,
  insertGoal,
  insertTask,
  updateGoalStatus,
  updateTaskStatus,
  withTransaction,
} from "../state/database.js";
import type { GoalRow, TaskGraphRow } from "../state/database.js";

export type TaskStatus =
  | "pending"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export type GoalStatus = "active" | "completed" | "failed" | "paused";

export interface TaskResult {
  success: boolean;
  output: string;
  artifacts: string[];
  costCents: number;
  duration: number;
}

export interface TaskNode {
  id: string;
  parentId: string | null;
  goalId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedTo: string | null;
  agentRole: string | null;
  priority: number;
  dependencies: string[];
  result: TaskResult | null;
  metadata: {
    estimatedCostCents: number;
    actualCostCents: number;
    maxRetries: number;
    retryCount: number;
    timeoutMs: number;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  strategy: string | null;
  rootTasks: string[];
  expectedRevenueCents: number;
  actualRevenueCents: number;
  createdAt: string;
  deadline: string | null;
}

type DecomposeTaskInput = Omit<TaskNode, "id" | "metadata">;

type CycleTask = {
  id?: string;
  title?: string;
  parentId?: string | null;
  dependencies: string[];
};

const TERMINAL_TASK_STATUSES = new Set<TaskStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export function createGoal(
  db: Database,
  title: string,
  description: string,
  strategy?: string,
): Goal {
  const normalizedTitle = title.trim();
  const normalizedDescription = description.trim();

  if (!normalizedTitle) {
    throw new Error("Goal title cannot be empty");
  }

  if (!normalizedDescription) {
    throw new Error("Goal description cannot be empty");
  }

  const id = insertGoal(db, {
    title: normalizedTitle,
    description: normalizedDescription,
    strategy: strategy ?? null,
  });

  const row = getGoalById(db, id);
  if (!row) {
    throw new Error(`Failed to load goal after insertion: ${id}`);
  }

  return goalRowToGoal(row, []);
}

export function decomposeGoal(
  db: Database,
  goalId: string,
  tasks: Omit<TaskNode, "id" | "metadata">[],
): void {
  if (!getGoalById(db, goalId)) {
    throw new Error(`Goal not found: ${goalId}`);
  }

  if (tasks.length === 0) {
    return;
  }

  const titleCounts = new Map<string, number>();
  for (const task of tasks) {
    const normalizedTitle = task.title.trim();
    if (!normalizedTitle) {
      throw new Error("Task title cannot be empty");
    }

    if (!task.description.trim()) {
      throw new Error(`Task description cannot be empty for: ${task.title}`);
    }

    if (task.goalId !== goalId) {
      throw new Error(`Task goal mismatch for '${task.title}'. Expected ${goalId}, got ${task.goalId}`);
    }

    if (!Number.isInteger(task.priority) || task.priority < 0 || task.priority > 100) {
      throw new Error(`Task priority must be an integer in [0,100] for '${task.title}'`);
    }

    titleCounts.set(task.title, (titleCounts.get(task.title) ?? 0) + 1);
  }

  const plannedTasks = tasks.map((task, index) => ({
    localId: ulid(),
    index,
    task,
  }));

  const referenceMap = buildLocalReferenceMap(plannedTasks, titleCounts);
  const cycleTasks: CycleTask[] = plannedTasks.map(({ localId, task }) => ({
    id: localId,
    parentId: resolveReference(task.parentId, referenceMap),
    dependencies: task.dependencies.map((dep) => resolveReference(dep, referenceMap) ?? dep),
  }));

  if (detectCycles(cycleTasks)) {
    throw new Error("Task graph contains a cycle; decomposition must be a DAG");
  }

  withTransaction(db, () => {
    const localToPersisted = new Map<string, string>();
    const deferredUpdates: {
      taskId: string;
      requestedStatus: TaskStatus;
      parentRef: string | null;
      dependencyRefs: string[];
    }[] = [];

    for (const planned of plannedTasks) {
      const parentRef = resolveReference(planned.task.parentId, referenceMap);
      const dependencyRefs = uniqueStrings(
        planned.task.dependencies.map((dep) => resolveReference(dep, referenceMap) ?? dep),
      ).filter((dep) => dep !== planned.localId);

      const taskId = insertTask(db, {
        parentId: parentRef,
        goalId,
        title: planned.task.title,
        description: planned.task.description,
        status: planned.task.status,
        assignedTo: planned.task.assignedTo,
        agentRole: planned.task.agentRole,
        priority: planned.task.priority,
        dependencies: dependencyRefs,
        result: planned.task.result,
      });

      localToPersisted.set(planned.localId, taskId);
      deferredUpdates.push({
        taskId,
        requestedStatus: planned.task.status,
        parentRef,
        dependencyRefs,
      });
    }

    const updateStmt = db.prepare(
      "UPDATE task_graph SET parent_id = ?, dependencies = ?, status = ? WHERE id = ?",
    );

    for (const update of deferredUpdates) {
      const resolvedParentId = update.parentRef
        ? (localToPersisted.get(update.parentRef) ?? update.parentRef)
        : null;
      const resolvedDependencies = uniqueStrings(
        update.dependencyRefs.map((dep) => localToPersisted.get(dep) ?? dep),
      );

      validateParentReference(db, goalId, update.taskId, resolvedParentId);
      validateDependencyReferences(db, goalId, update.taskId, resolvedDependencies);

      const initialStatus = resolveInitialTaskStatus(db, update.requestedStatus, resolvedDependencies);
      updateStmt.run(
        resolvedParentId,
        JSON.stringify(resolvedDependencies),
        initialStatus,
        update.taskId,
      );
    }

    unblockReadyBlockedTasks(db);
    refreshGoalStatus(db, goalId);
  });
}

export function getReadyTasks(db: Database): TaskNode[] {
  return getReadyTaskRows(db).map(taskRowToTaskNode);
}

export function assignTask(db: Database, taskId: string, agentAddress: string): void {
  const normalizedAddress = agentAddress.trim();
  if (!normalizedAddress) {
    throw new Error("agentAddress cannot be empty");
  }

  withTransaction(db, () => {
    const task = getTaskById(db, taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== "pending") {
      throw new Error(`Task ${taskId} is not assignable from status '${task.status}'`);
    }

    updateTaskStatus(db, taskId, "assigned");
    db.prepare("UPDATE task_graph SET assigned_to = ? WHERE id = ?").run(normalizedAddress, taskId);
  });
}

export function completeTask(db: Database, taskId: string, result: TaskResult): void {
  withTransaction(db, () => {
    const task = getTaskById(db, taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (TERMINAL_TASK_STATUSES.has(task.status)) {
      throw new Error(`Task ${taskId} is already in terminal status '${task.status}'`);
    }

    updateTaskStatus(db, taskId, "completed");
    db.prepare(
      "UPDATE task_graph SET result = ?, actual_cost_cents = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
    ).run(JSON.stringify(result), result.costCents, new Date().toISOString(), taskId);

    unblockReadyBlockedTasks(db);
    refreshGoalStatus(db, task.goalId);
  });
}

export function failTask(db: Database, taskId: string, error: string, shouldRetry: boolean): void {
  withTransaction(db, () => {
    const task = getTaskById(db, taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (TERMINAL_TASK_STATUSES.has(task.status)) {
      throw new Error(`Task ${taskId} is already in terminal status '${task.status}'`);
    }

    const failureResult: TaskResult = {
      success: false,
      output: error,
      artifacts: [],
      costCents: task.actualCostCents,
      duration: 0,
    };

    const canRetry = shouldRetry && task.retryCount < task.maxRetries;
    if (canRetry) {
      const nextStatus: TaskStatus = areDependenciesSatisfied(db, task.dependencies)
        ? "pending"
        : "blocked";

      db.prepare(
        `UPDATE task_graph
         SET status = ?, retry_count = ?, assigned_to = NULL, started_at = NULL, completed_at = NULL, result = ?
         WHERE id = ?`,
      ).run(nextStatus, task.retryCount + 1, JSON.stringify(failureResult), taskId);

      return;
    }

    updateTaskStatus(db, taskId, "failed");
    db.prepare(
      "UPDATE task_graph SET result = ?, assigned_to = NULL WHERE id = ?",
    ).run(JSON.stringify(failureResult), taskId);

    blockDependentsForFailedTask(db, taskId);
    refreshGoalStatus(db, task.goalId);
  });
}

export function getGoalProgress(
  db: Database,
  goalId: string,
): { total: number; completed: number; failed: number; blocked: number; running: number } {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
         SUM(CASE WHEN status IN ('assigned', 'running') THEN 1 ELSE 0 END) AS running
       FROM task_graph
       WHERE goal_id = ?`,
    )
    .get(goalId) as
    | {
        total: number;
        completed: number | null;
        failed: number | null;
        blocked: number | null;
        running: number | null;
      }
    | undefined;

  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    failed: row?.failed ?? 0,
    blocked: row?.blocked ?? 0,
    running: row?.running ?? 0,
  };
}

export function pruneCompletedGoals(db: Database, olderThan: string): void {
  withTransaction(db, () => {
    db.prepare(
      `DELETE FROM task_graph
       WHERE goal_id IN (
         SELECT id
         FROM goals
         WHERE status = 'completed'
           AND completed_at IS NOT NULL
           AND completed_at < ?
       )`,
    ).run(olderThan);

    db.prepare(
      `DELETE FROM goals
       WHERE status = 'completed'
         AND completed_at IS NOT NULL
         AND completed_at < ?`,
    ).run(olderThan);
  });
}

export function detectCycles(tasks: CycleTask[]): boolean {
  if (tasks.length === 0) {
    return false;
  }

  const nodes = tasks.map((task, index) => ({
    id: task.id && task.id.length > 0 ? task.id : `local-${index}-${ulid()}`,
    title: task.title,
    parentId: task.parentId ?? null,
    dependencies: task.dependencies,
    index,
  }));

  const titleCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.title) {
      titleCounts.set(node.title, (titleCounts.get(node.title) ?? 0) + 1);
    }
  }

  const aliasMap = new Map<string, string>();
  for (const node of nodes) {
    aliasMap.set(node.id, node.id);
    aliasMap.set(String(node.index), node.id);
    aliasMap.set(`#${node.index}`, node.id);
    aliasMap.set(`task-${node.index + 1}`, node.id);

    if (node.title && titleCounts.get(node.title) === 1) {
      aliasMap.set(node.title, node.id);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    const edges = new Set<string>();
    const refs = [...node.dependencies, ...(node.parentId ? [node.parentId] : [])];

    for (const ref of refs) {
      const resolved = aliasMap.get(ref);
      if (resolved) {
        edges.add(resolved);
      }
    }

    adjacency.set(node.id, edges);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);

    const neighbors = adjacency.get(nodeId);
    if (neighbors) {
      for (const dep of neighbors) {
        if (dfs(dep)) {
          return true;
        }
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  for (const node of nodes) {
    if (dfs(node.id)) {
      return true;
    }
  }

  return false;
}

function taskRowToTaskNode(row: TaskGraphRow): TaskNode {
  return {
    id: row.id,
    parentId: row.parentId,
    goalId: row.goalId,
    title: row.title,
    description: row.description,
    status: row.status,
    assignedTo: row.assignedTo,
    agentRole: row.agentRole,
    priority: row.priority,
    dependencies: row.dependencies,
    result: normalizeTaskResult(row.result),
    metadata: {
      estimatedCostCents: row.estimatedCostCents,
      actualCostCents: row.actualCostCents,
      maxRetries: row.maxRetries,
      retryCount: row.retryCount,
      timeoutMs: row.timeoutMs,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    },
  };
}

function goalRowToGoal(row: GoalRow, rootTasks: string[]): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    strategy: row.strategy,
    rootTasks,
    expectedRevenueCents: row.expectedRevenueCents,
    actualRevenueCents: row.actualRevenueCents,
    createdAt: row.createdAt,
    deadline: row.deadline,
  };
}

export function normalizeTaskResult(value: unknown): TaskResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TaskResult>;
  if (typeof candidate.success !== "boolean" || typeof candidate.output !== "string") {
    return null;
  }

  return {
    success: candidate.success,
    output: candidate.output,
    artifacts: Array.isArray(candidate.artifacts)
      ? candidate.artifacts.filter((entry): entry is string => typeof entry === "string")
      : [],
    costCents: typeof candidate.costCents === "number" ? candidate.costCents : 0,
    duration: typeof candidate.duration === "number" ? candidate.duration : 0,
  };
}

function resolveInitialTaskStatus(
  db: Database,
  requestedStatus: TaskStatus,
  dependencies: string[],
): TaskStatus {
  if (TERMINAL_TASK_STATUSES.has(requestedStatus)) {
    return requestedStatus;
  }

  if (requestedStatus === "assigned" || requestedStatus === "running") {
    return requestedStatus;
  }

  const depsSatisfied = areDependenciesSatisfied(db, dependencies);
  if (!depsSatisfied) {
    return "blocked";
  }

  return "pending";
}

function areDependenciesSatisfied(db: Database, dependencies: string[]): boolean {
  for (const dependencyId of dependencies) {
    const task = getTaskById(db, dependencyId);
    if (!task || task.status !== "completed") {
      return false;
    }
  }

  return true;
}

function validateParentReference(
  db: Database,
  goalId: string,
  taskId: string,
  parentId: string | null,
): void {
  if (!parentId) {
    return;
  }

  if (parentId === taskId) {
    throw new Error(`Task ${taskId} cannot be its own parent`);
  }

  const parentTask = getTaskById(db, parentId);
  if (!parentTask) {
    throw new Error(`Parent task ${parentId} not found for task ${taskId}`);
  }

  if (parentTask.goalId !== goalId) {
    throw new Error(`Parent task ${parentId} is outside goal ${goalId}`);
  }
}

function validateDependencyReferences(
  db: Database,
  goalId: string,
  taskId: string,
  dependencies: string[],
): void {
  for (const dependencyId of dependencies) {
    if (dependencyId === taskId) {
      throw new Error(`Task ${taskId} cannot depend on itself`);
    }

    const dependencyTask = getTaskById(db, dependencyId);
    if (!dependencyTask) {
      throw new Error(`Dependency task ${dependencyId} not found for task ${taskId}`);
    }

    if (dependencyTask.goalId !== goalId) {
      throw new Error(`Dependency task ${dependencyId} is outside goal ${goalId}`);
    }
  }
}

function blockDependentsForFailedTask(db: Database, failedTaskId: string): void {
  db.prepare(
    `UPDATE task_graph
     SET status = 'blocked', assigned_to = NULL
     WHERE status IN ('pending', 'assigned', 'running')
       AND EXISTS (
         SELECT 1
         FROM json_each(COALESCE(NULLIF(task_graph.dependencies, ''), '[]')) dep
         WHERE dep.value = ?
       )`,
  ).run(failedTaskId);
}

function unblockReadyBlockedTasks(db: Database): void {
  db.prepare(
    `UPDATE task_graph
     SET status = 'pending'
     WHERE status = 'blocked'
       AND NOT EXISTS (
         SELECT 1
         FROM json_each(COALESCE(NULLIF(task_graph.dependencies, ''), '[]')) dep
         LEFT JOIN task_graph d ON d.id = dep.value
         WHERE d.status IS NULL OR d.status != 'completed'
       )`,
  ).run();
}

function refreshGoalStatus(db: Database, goalId: string): void {
  const goal = getGoalById(db, goalId);
  if (!goal || goal.status === "paused") {
    return;
  }

  const progress = getGoalProgress(db, goalId);

  if (progress.total === 0) {
    updateGoalStatus(db, goalId, "active");
    return;
  }

  if (progress.failed > 0) {
    updateGoalStatus(db, goalId, "failed");
    return;
  }

  if (progress.completed === progress.total) {
    updateGoalStatus(db, goalId, "completed");
    return;
  }

  if (goal.status !== "active") {
    updateGoalStatus(db, goalId, "active");
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }

  return output;
}

function buildLocalReferenceMap(
  plannedTasks: { localId: string; index: number; task: DecomposeTaskInput }[],
  titleCounts: Map<string, number>,
): Map<string, string> {
  const map = new Map<string, string>();

  for (const planned of plannedTasks) {
    map.set(planned.localId, planned.localId);
    map.set(String(planned.index), planned.localId);
    map.set(`#${planned.index}`, planned.localId);
    map.set(`task-${planned.index + 1}`, planned.localId);

    if ((titleCounts.get(planned.task.title) ?? 0) === 1) {
      map.set(planned.task.title, planned.localId);
    }
  }

  return map;
}

function resolveReference(reference: string | null | undefined, map: Map<string, string>): string | null {
  if (!reference) {
    return null;
  }

  return map.get(reference) ?? reference;
}
