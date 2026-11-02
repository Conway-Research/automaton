/**
 * Local Agent Worker
 *
 * Runs inference-driven task execution in-process as an async background task.
 * Each worker executes through a harness chosen by role via HarnessRegistry.
 */

import path from "node:path";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";
import type { HarnessContext, WorkerInferenceClient } from "../agent/harness-types.js";
import { buildWisdomFromGoal, createBudgetFromTask } from "../agent/harness-types.js";
import { HarnessRegistry } from "../agent/harness-registry.js";
import { RevenueStore } from "../revenue/store.js";
import {researchDispatchAllowsInference} from './research-dispatch.js';
import {InferenceAdmissionError} from '../agent/harness-types.js';
import { completeTask, failTask } from "./task-graph.js";
import type { TaskNode } from "./task-graph.js";
import { AgentWorkspace } from "./workspace.js";
import type {
  AutomatonConfig,
  AutomatonIdentity,
  AutomatonTool,
  ConwayClient,
  InputSource,
  SpendTrackerInterface,
  ToolContext,
} from "../types.js";
import type { Database } from "better-sqlite3";
import type { PolicyEngine } from "../agent/policy-engine.js";

const logger = createLogger("orchestration.local-worker");
const DEFAULT_ALLOWED_EDIT_ROOT = process.cwd();

interface LocalWorkerConfig {
  db: Database;
  inference: WorkerInferenceClient;
  conway: ConwayClient;
  maxTurns?: number;
  harnessRegistry: HarnessRegistry;
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  allowedEditRoot?: string;
  tools?: AutomatonTool[];
  toolContext?: ToolContext;
  policyEngine?: PolicyEngine;
  spendTracker?: SpendTrackerInterface;
  inputSource?: InputSource;
  getSurvivalTier?: () => import("../types.js").SurvivalTier;
}

export class LocalWorkerPool {
  private activeWorkers = new Map<string, { promise: Promise<void>; abortController: AbortController }>();
  private activeTasks = new Set<string>();

  constructor(private readonly config: LocalWorkerConfig) {}

  spawn(task: TaskNode): { address: string; name: string; sandboxId: string } {
    const limit=this.config.config.maxChildren??3;
    if(!Number.isSafeInteger(limit)||limit<0||this.activeWorkers.size>=limit)
      throw new InferenceAdmissionError('Local worker concurrency limit reached or invalid');
    if(this.activeTasks.has(task.id))throw new InferenceAdmissionError('Task already has an active local worker');
    this.activeTasks.add(task.id);
    const workerId = `local-worker-${ulid()}`;
    const workerName = `worker-${task.agentRole ?? "generalist"}-${workerId.slice(-6)}`;
    const address = `local://${workerId}`;
    const abortController = new AbortController();

    const workerPromise = this.runWorker(workerId, task, abortController.signal)
      .catch((error) => {
        logger.error("Local worker crashed", error instanceof Error ? error : new Error(String(error)), {
          workerId,
          taskId: task.id,
        });
        try {
          failTask(
            this.config.db,
            task.id,
            `Worker crashed: ${error instanceof Error ? error.message : String(error)}`,
            true,
          );
        } catch {
          // Task may already be in a terminal state.
        }
      })
      .finally(() => {
        this.activeWorkers.delete(workerId);
        this.activeTasks.delete(task.id);
      });

    this.activeWorkers.set(workerId, { promise: workerPromise, abortController });
    return { address, name: workerName, sandboxId: workerId };
  }

  getActiveCount(): number {
    return this.activeWorkers.size;
  }

  hasWorker(addressOrId: string): boolean {
    const id = addressOrId.replace("local://", "");
    return this.activeWorkers.has(id);
  }

  async shutdown(): Promise<void> {
    for (const [, worker] of this.activeWorkers) {
      worker.abortController.abort();
    }
    await Promise.allSettled([...this.activeWorkers.values()].map((worker) => worker.promise));
    this.activeWorkers.clear();
  }

  private async runWorker(workerId: string, task: TaskNode, signal: AbortSignal): Promise<void> {
    const harness = this.config.harnessRegistry.createForRole(task.agentRole);
    const workspace = new AgentWorkspace(task.goalId);
    const allowedEditRoot = path.resolve(this.config.allowedEditRoot ?? DEFAULT_ALLOWED_EDIT_ROOT);
    const workerIdentity = createWorkerIdentity(this.config.identity, workerId, task.agentRole);
    const context: HarnessContext = {
      workspaceRoot: workspace.basePath,
      allowedEditRoot,
      workspace,
      identity: workerIdentity,
      config: this.config.config,
      db: this.config.db,
      conway: this.config.conway,
      inference: {
        chat: async (params) => {
          if(!researchDispatchAllowsInference(this.config.db,task.id))throw new InferenceAdmissionError('Research dispatch paused or stopped');
          const revenueStore = new RevenueStore(this.config.db);
          const activeRevenueExperiment = revenueStore.getActiveExperimentForTask(task.id, true);
          const response = await this.config.inference.chat({
            ...params,
            survivalTier: this.config.getSurvivalTier?.(),
            experimentId: activeRevenueExperiment?.id,
            costAttribution:{taskId:task.id,goalId:task.goalId,agentId:workerId,...(activeRevenueExperiment?.opportunityId?{opportunityId:activeRevenueExperiment.opportunityId}:{})},
          });
          // Accounting has settled, but late output must not initiate tools after a stop.
          if(signal.aborted||!researchDispatchAllowsInference(this.config.db,task.id))throw new InferenceAdmissionError('Research dispatch interrupted; late output discarded');
          return response;
        },
      },
      budget: createBudgetFromTask(task),
      wisdom: buildWisdomFromGoal(this.config.db, task.goalId, workspace),
      abortSignal: signal,
      assertExecutionAllowed: () => {
        if(signal.aborted||!researchDispatchAllowsInference(this.config.db,task.id))throw new InferenceAdmissionError('Research dispatch interrupted at tool boundary');
      },
      goalId: task.goalId,
      toolCatalog: this.config.tools,
      toolContext: this.config.toolContext
        ? {
            ...this.config.toolContext,
            identity: workerIdentity,
            allowedReadRoot: allowedEditRoot,
          }
        : undefined,
      policyEngine: this.config.policyEngine,
      spendTracker: this.config.spendTracker,
      inputSource: this.config.inputSource,
    };

    if (this.config.maxTurns) {
      context.budget.maxTurns = this.config.maxTurns;
    }
    if (harness.id === "orchestrator" && !this.config.maxTurns) {
      context.budget.maxTurns = Math.max(context.budget.maxTurns, 50);
    }

    logger.info(
      `[WORKER ${workerId}] Starting task "${task.title}" (${task.id}), role: ${task.agentRole ?? "generalist"}, harness: ${harness.id}`,
    );

    try {
      await harness.initialize(task, context);
      const result = await harness.execute();

      if (result.success) {
        completeTask(this.config.db, task.id, result);
        this.config.db.prepare("UPDATE children SET status = ?, last_checked = datetime('now') WHERE sandbox_id = ?").run("stopped", workerId);
        logger.info("Local worker completed task", {
          workerId,
          taskId: task.id,
          title: task.title,
          duration: result.duration,
          harness: harness.id,
        });
      } else {
        failTask(this.config.db, task.id, result.output || "Task reported failure", true);
        this.config.db.prepare("UPDATE children SET status = ?, last_checked = datetime('now') WHERE sandbox_id = ?").run("failed", workerId);
        logger.warn("Local worker reported task failure", {
          workerId,
          taskId: task.id,
          title: task.title,
          harness: harness.id,
          output: result.output.slice(0, 200),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[WORKER ${workerId}] Harness execution failed: ${message}`);
      failTask(this.config.db, task.id, message, true);
      this.config.db.prepare("UPDATE children SET status = ?, last_checked = datetime('now') WHERE sandbox_id = ?").run("failed", workerId);
    }
  }
}

function createWorkerIdentity(
  parentIdentity: AutomatonIdentity,
  workerId: string,
  role: string | null,
): AutomatonIdentity {
  return {
    ...parentIdentity,
    name: `worker-${role ?? "generalist"}-${workerId.slice(-6)}`,
    address: `local://${workerId}`,
    sandboxId: workerId,
  };
}
