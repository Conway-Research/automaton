import fs from "node:fs";
import path from "node:path";
import { deliveryReviewLessons } from "../security/action-gate.js";
import { codingBenchmarkLessons } from "./coding-benchmark.js";
import type { TaskNode, TaskResult } from "../orchestration/task-graph.js";
import { normalizeTaskResult } from "../orchestration/task-graph.js";
import type {
  AutomatonTool,
  AutomatonConfig,
  AutomatonIdentity,
  ChatMessage,
  ConwayClient,
  InferenceToolCall,
  InputSource,
  SpendTrackerInterface,
  ToolContext,
} from "../types.js";
import type { AgentWorkspace } from "../orchestration/workspace.js";
import { getTasksByGoal } from "../state/database.js";
import type { PolicyEngine } from "./policy-engine.js";

/** Admission was denied before provider execution; retry requires an external state change. */
export class InferenceAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InferenceAdmissionError";
  }
}

/** A provider was invoked but completion/accounting is uncertain; reconcile before retry. */
export class InferenceExecutionUncertainError extends Error {
  constructor(message:string){super(message);this.name='InferenceExecutionUncertainError';}
}

export interface AgentHarness {
  readonly id: string;
  readonly description: string;
  initialize(task: TaskNode, context: HarnessContext): Promise<void>;
  execute(): Promise<TaskResult>;
  getToolDefs(): HarnessTool[];
  buildSystemPrompt(): string;
  buildTaskPrompt(): string;
}

export interface HarnessTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface HarnessContext {
  workspaceRoot: string;
  allowedEditRoot: string;
  workspace: AgentWorkspace;
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: import("better-sqlite3").Database;
  conway: ConwayClient;
  inference: WorkerInferenceClient;
  budget: IterationBudget;
  wisdom: AccumulatedWisdom;
  abortSignal: AbortSignal;
  /** Recheck shared execution controls at tool boundaries; never grants tool permission. */
  assertExecutionAllowed?: () => void;
  goalId: string;
  toolCatalog?: AutomatonTool[];
  toolContext?: ToolContext;
  policyEngine?: PolicyEngine;
  spendTracker?: SpendTrackerInterface;
  inputSource?: InputSource;
}

export interface WorkerInferenceClient {
  chat(params: {
    costAttribution?: import('../types.js').InferenceRequest['costAttribution'];
    tier?: string;
    survivalTier?: import("../types.js").SurvivalTier;
    experimentId?: string;
    messages: ChatMessage[];
    tools?: Array<{
      type: "function";
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }>;
    toolChoice?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: { type: string };
  }): Promise<{
    content: string;
    toolCalls?: InferenceToolCall[];
  }>;
}

export interface IterationBudget {
  maxTurns: number;
  maxCostCents: number;
  timeoutMs: number;
  turnsUsed: number;
  costUsedCents: number;
  startedAt: number;
}

export interface AccumulatedWisdom {
  conventions: string[];
  successes: string[];
  failures: string[];
  gotchas: string[];
}

export function createBudgetFromTask(task: TaskNode): IterationBudget {
  return {
    maxTurns: 25,
    maxCostCents: Math.max(task.metadata.estimatedCostCents * 2, 50),
    timeoutMs: task.metadata.timeoutMs || 300_000,
    turnsUsed: 0,
    costUsedCents: 0,
    startedAt: 0,
  };
}

export function emptyWisdom(): AccumulatedWisdom {
  return { conventions: [], successes: [], failures: [], gotchas: [] };
}

export function buildWisdomFromGoal(
  db: import("better-sqlite3").Database,
  goalId: string,
  workspace: AgentWorkspace,
): AccumulatedWisdom {
  const wisdom = emptyWisdom();
  wisdom.gotchas.push(...codingBenchmarkLessons(db), ...deliveryReviewLessons(db));
  const tasks = getTasksByGoal(db, goalId);

  for (const task of tasks) {
    const result = normalizeTaskResult(task.result);
    if (!result?.output) {
      continue;
    }

    const summary = result.output.slice(0, 200);
    if (task.status === "completed") {
      wisdom.successes.push(`Unverified internal completion; not independent quality or economic evidence: ${summary}`);
    } else if (task.status === "failed") {
      wisdom.failures.push(summary);
    }
  }

  try {
    const decisionsPath = path.join(workspace.basePath, "context", "decisions.md");
    if (!fs.existsSync(decisionsPath)) {
      return wisdom;
    }

    const content = fs.readFileSync(decisionsPath, "utf8");
    const entries = content.split(/^### /m).filter(Boolean);
    for (const entry of entries.slice(-10)) {
      const normalized = entry.trim().slice(0, 200);
      const lower = normalized.toLowerCase();
      if (lower.includes("convention") || lower.includes("standard")) {
        wisdom.conventions.push(normalized);
      } else if (lower.includes("gotcha") || lower.includes("warning")) {
        wisdom.gotchas.push(normalized);
      }
    }
  } catch {
    // decisions.md may not exist yet; ignore.
  }

  return wisdom;
}
