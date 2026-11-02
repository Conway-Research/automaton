import type { Database } from "better-sqlite3";
import { promises as fs } from "node:fs";
import path from "node:path";
import {createHash} from 'node:crypto';
import { UnifiedInferenceClient } from "../inference/inference-client.js";
import type { PlannerOutput } from "./planner.js";
import { validatePlannerOutput } from "./planner.js";

const PLAN_MODE_STATE_KEY = "plan_mode.state";
const DEFAULT_REPLANS_REMAINING = 3;
const DEFAULT_AUTO_BUDGET_THRESHOLD = 5_000;
const DEFAULT_CONSENSUS_CRITIC_ROLE = "reviewer";
const DEFAULT_REVIEW_TIMEOUT_MS = 30 * 60_000;

export type ExecutionPhase =
  | "idle"
  | "classifying"
  | "planning"
  | "plan_review"
  | "executing"
  | "replanning"
  | "complete"
  | "failed";

export interface ExecutionState {
  phase: ExecutionPhase;
  goalId: string;
  planId: string | null;
  planVersion: number;
  planFilePath: string | null;
  spawnedAgentIds: string[];
  replansRemaining: number;
  phaseEnteredAt: string;
}

export type PlanApprovalMode = "auto" | "supervised" | "consensus";

export interface PlanApprovalConfig {
  mode: PlanApprovalMode;
  autoBudgetThreshold: number;
  consensusCriticRole: string;
  reviewTimeoutMs: number;
}
export interface PlanReviewer {
  /** Installed independent review boundary. Must use existing resource gates;
   * this callback does not grant permission for a paid model/tool invocation. */
  review(input:{plan:PlannerOutput;planDigest:string;role:string;signal:AbortSignal}):Promise<{
    planDigest:string;approved:boolean;blockers:('missing_costs'|'demand_unverified'|'execution_risk'|'data_quality'|'selection_bias'|'security_risk')[];
  }>;
}

export type ReplanTrigger =
  | { type: "task_failure"; taskId: string; error: string }
  | { type: "budget_breach"; actualCents: number; estimatedCents: number }
  | { type: "requirement_change"; newInput: string; conflictScore: number }
  | { type: "environment_change"; resource: string; error: string }
  | { type: "opportunity"; suggestion: string; agentAddress: string };

const TRANSITIONS: Record<ExecutionPhase, ReadonlySet<ExecutionPhase>> = {
  idle: new Set(["classifying"]),
  classifying: new Set(["planning", "executing"]),
  planning: new Set(["plan_review"]),
  plan_review: new Set(["executing", "planning"]),
  executing: new Set(["replanning", "complete"]),
  replanning: new Set(["plan_review", "failed"]),
  complete: new Set([]),
  failed: new Set([]),
};

export class PlanModeController {
  constructor(private readonly db: Database) {}

  transition(from: ExecutionPhase, to: ExecutionPhase, reason: string): void {
    const state = this.getState();
    if (state.phase !== from) {
      throw new Error(
        `Invalid transition precondition: state is '${state.phase}', expected '${from}' (reason: ${reason})`,
      );
    }

    const valid = to === "failed" ? true : TRANSITIONS[from]?.has(to) ?? false;
    if (!valid) {
      throw new Error(`Invalid transition '${from}' -> '${to}' (reason: ${reason})`);
    }

    const next: Partial<ExecutionState> = {
      phase: to,
      phaseEnteredAt: nowIso(),
    };

    if (from === "executing" && to === "replanning") {
      next.replansRemaining = Math.max(0, state.replansRemaining - 1);
      next.planVersion = Math.max(0, state.planVersion + 1);
    }

    this.setState(next);
  }

  canSpawnAgents(): boolean {
    const state = this.getState();
    return state.phase === "executing" && state.planId !== null;
  }

  getState(): ExecutionState {
    const row = this.db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .get(PLAN_MODE_STATE_KEY) as { value: string } | undefined;
    const fallback = defaultExecutionState();

    if (!row?.value) {
      return fallback;
    }

    const parsed = safeJsonParse(row.value);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    return sanitizeExecutionState(parsed, fallback);
  }

  setState(state: Partial<ExecutionState>): void {
    const current = this.getState();
    const merged: Record<string, unknown> = {
      ...current,
      ...state,
    };

    if (state.phase && state.phase !== current.phase && state.phaseEnteredAt === undefined) {
      merged.phaseEnteredAt = nowIso();
    }

    const next = sanitizeExecutionState(merged, current);
    this.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    ).run(PLAN_MODE_STATE_KEY, JSON.stringify(next));
  }
}

export async function classifyComplexity(
  params: {
    taskDescription: string;
    agentRole: string;
    availableTools: string[];
  },
  inference: UnifiedInferenceClient,
): Promise<{
  requiresPlanMode: boolean;
  estimatedSteps: number;
  reason: string;
  stepOutline: string[];
}> {
  const description = params.taskDescription.trim();
  const fallbackSteps = estimateStepsHeuristic(description, params.availableTools);

  try {
    const result = await inference.chat({
      tier: "cheap",
      maxTokens: 220,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Classify task complexity for an autonomous agent.",
            "Return strict JSON: estimatedSteps (number), reason (string), stepOutline (string[]).",
            "Estimate concrete action steps, not thoughts.",
            "No markdown.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Agent role: ${params.agentRole || "generalist"}`,
            `Available tools: ${formatTools(params.availableTools)}`,
            `Task: ${description || "empty task description"}`,
          ].join("\n"),
        },
      ],
    });

    const parsed = safeJsonParse(result.content);
    const estimatedSteps = clampSteps(
      typeof parsed?.estimatedSteps === "number"
        ? parsed.estimatedSteps
        : fallbackSteps,
    );
    const stepOutline = normalizeStepOutline(parsed?.stepOutline, description, estimatedSteps);
    const reason =
      typeof parsed?.reason === "string" && parsed.reason.trim().length > 0
        ? parsed.reason.trim()
        : `Estimated ${estimatedSteps} steps from task complexity.`;

    return {
      requiresPlanMode: estimatedSteps > 3,
      estimatedSteps,
      reason,
      stepOutline,
    };
  } catch (error) {
    const estimatedSteps = fallbackSteps;
    return {
      requiresPlanMode: estimatedSteps > 3,
      estimatedSteps,
      reason: `Classifier fallback: ${toErrorMessage(error)}`,
      stepOutline: heuristicStepOutline(description, estimatedSteps),
    };
  }
}

export async function persistPlan(params: {
  goalId: string;
  version: number;
  plan: PlannerOutput;
  workspacePath: string;
}): Promise<{ jsonPath: string; mdPath: string }> {
  const workspaceRoot = path.resolve(params.workspacePath);
  const version = Math.max(1, Math.floor(params.version));
  const validatedPlan = validatePlannerOutput(params.plan);

  await fs.mkdir(workspaceRoot, { recursive: true });

  const jsonPath = path.join(workspaceRoot, "plan.json");
  const mdPath = path.join(workspaceRoot, "plan.md");

  if (await fileExists(jsonPath)) {
    const archiveVersion = Math.max(1, version - 1);
    const archivePath = path.join(workspaceRoot, `plan-v${archiveVersion}.json`);
    await fs.copyFile(jsonPath, archivePath);
  }

  await fs.writeFile(jsonPath, `${JSON.stringify(validatedPlan, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, renderPlanMarkdown(params.goalId, version, validatedPlan), "utf8");

  return { jsonPath, mdPath };
}

export async function loadPlan(planFilePath: string): Promise<PlannerOutput> {
  const raw = await fs.readFile(planFilePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid plan JSON at '${planFilePath}': ${toErrorMessage(error)}`);
  }
  return validatePlannerOutput(parsed);
}

export async function reviewPlan(
  plan: PlannerOutput,
  config: PlanApprovalConfig,
  reviewer?:PlanReviewer,
): Promise<{ approved: boolean; feedback?: string }> {
  if(!config||!['auto','supervised','consensus'].includes(config.mode)||!Number.isSafeInteger(config.autoBudgetThreshold)||config.autoBudgetThreshold<0||
    !Number.isSafeInteger(config.reviewTimeoutMs)||config.reviewTimeoutMs<1||config.reviewTimeoutMs>1800000)
    return {approved:false,feedback:'Invalid review configuration; no approval inferred'};
  let checked:PlannerOutput;
  try{checked=validatePlannerOutput(plan);}catch{return {approved:false,feedback:'Invalid plan; reconcile its structure before execution'};}
  const cost=checked.tasks.reduce((sum,task)=>sum+task.estimatedCostCents,0);
  if(!checked.tasks.length||!Number.isSafeInteger(cost)||!Number.isSafeInteger(checked.estimatedTotalCostCents)||
    checked.tasks.some(t=>!Number.isSafeInteger(t.estimatedCostCents))||cost>checked.estimatedTotalCostCents)
    return {approved:false,feedback:'Plan cost must cover every task with nonnegative integer cents'};
  const normalized = normalizeApprovalConfig(config);

  switch (normalized.mode) {
    case "auto": {
      if (checked.estimatedTotalCostCents > normalized.autoBudgetThreshold) {
        return {
          approved: false,
          feedback: `Plan exceeds automatic review threshold (${checked.estimatedTotalCostCents} > ${normalized.autoBudgetThreshold}); reduce scope or obtain an explicit policy decision.`,
        };
      }
      return { approved: true };
    }

    case "supervised": {
      throw new Error("awaiting human approval");
    }

    case "consensus": {
      if(!reviewer)return {approved:false,feedback:'Independent consensus reviewer unavailable; no approval inferred'};
      const digest=(p:PlannerOutput)=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
      const copy=structuredClone(checked),planDigest=digest(copy),controller=new AbortController();
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{
        const result=await Promise.race([reviewer.review({plan:copy,planDigest,role:normalized.consensusCriticRole,signal:controller.signal}),
          new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Review timeout'));},normalized.reviewTimeoutMs);})]);
        const allowed=['missing_costs','demand_unverified','execution_risk','data_quality','selection_bias','security_risk'];
        if(!result||result.planDigest!==planDigest||digest(copy)!==planDigest||typeof result.approved!=='boolean'||!Array.isArray(result.blockers)||result.blockers.length>20||
          result.blockers.some(b=>!allowed.includes(b)))return {approved:false,feedback:'Invalid or mismatched consensus review'};
        return {approved:result.approved&&result.blockers.length===0,feedback:result.blockers.length?`Consensus blockers: ${[...new Set(result.blockers)].join(', ')}`:'Independent plan review completed; economic evidence and execution gates remain mandatory'};
      }catch{return {approved:false,feedback:'Consensus review unavailable or timed out; no approval inferred'};}
      finally{if(timer)clearTimeout(timer);}
    }

    default: {
      return { approved: false, feedback: "Unsupported review mode." };
    }
  }
}

export function shouldReplan(state: ExecutionState, trigger: ReplanTrigger): boolean {
  if (state.replansRemaining <= 0) {
    return false;
  }

  switch (trigger.type) {
    case "task_failure":
      return trigger.taskId.trim().length > 0 && trigger.error.trim().length > 0;

    case "budget_breach":
      if (trigger.estimatedCents <= 0) {
        return trigger.actualCents > 0;
      }
      return trigger.actualCents > trigger.estimatedCents * 1.5;

    case "requirement_change":
      return trigger.conflictScore >= 0.55;

    case "environment_change":
      return trigger.resource.trim().length > 0 && trigger.error.trim().length > 0;

    case "opportunity":
      return state.replansRemaining > 1 && trigger.suggestion.trim().length >= 24;

    default:
      return false;
  }
}

function defaultExecutionState(): ExecutionState {
  return {
    phase: "idle",
    goalId: "",
    planId: null,
    planVersion: 0,
    planFilePath: null,
    spawnedAgentIds: [],
    replansRemaining: DEFAULT_REPLANS_REMAINING,
    phaseEnteredAt: nowIso(),
  };
}

function sanitizeExecutionState(value: unknown, fallback: ExecutionState): ExecutionState {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  const phase = asExecutionPhase(record.phase) ?? fallback.phase;
  const goalId = typeof record.goalId === "string" ? record.goalId : fallback.goalId;
  const planId = typeof record.planId === "string" ? record.planId : null;
  const planVersion = toNonNegativeInteger(record.planVersion, fallback.planVersion);
  const planFilePath = typeof record.planFilePath === "string" ? record.planFilePath : null;
  const spawnedAgentIds = Array.isArray(record.spawnedAgentIds)
    ? record.spawnedAgentIds.filter((entry): entry is string => typeof entry === "string")
    : fallback.spawnedAgentIds;
  const replansRemaining = toNonNegativeInteger(record.replansRemaining, fallback.replansRemaining);

  const enteredAt =
    typeof record.phaseEnteredAt === "string" && record.phaseEnteredAt.trim().length > 0
      ? record.phaseEnteredAt
      : fallback.phaseEnteredAt;

  return {
    phase,
    goalId,
    planId,
    planVersion,
    planFilePath,
    spawnedAgentIds,
    replansRemaining,
    phaseEnteredAt: enteredAt,
  };
}

function asExecutionPhase(value: unknown): ExecutionPhase | null {
  if (
    value === "idle" ||
    value === "classifying" ||
    value === "planning" ||
    value === "plan_review" ||
    value === "executing" ||
    value === "replanning" ||
    value === "complete" ||
    value === "failed"
  ) {
    return value;
  }
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeJsonParse(value: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function normalizeStepOutline(value: unknown, description: string, estimatedSteps: number): string[] {
  if (Array.isArray(value)) {
    const items = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (items.length > 0) {
      return items.slice(0, Math.max(estimatedSteps, 1));
    }
  }
  return heuristicStepOutline(description, estimatedSteps);
}

function heuristicStepOutline(description: string, estimatedSteps: number): string[] {
  const tokens = description
    .split(/[.;\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (tokens.length > 0) {
    return tokens.slice(0, Math.max(estimatedSteps, 1));
  }
  return ["Interpret task", "Execute task"];
}

function estimateStepsHeuristic(taskDescription: string, availableTools: string[]): number {
  const text = taskDescription.toLowerCase();
  let score = 1;

  if (text.length > 120) {
    score += 1;
  }
  if (text.length > 320) {
    score += 1;
  }
  if (/\b(and|then|after|before|while|plus|also)\b/.test(text)) {
    score += 1;
  }
  if (/\b(integrate|deploy|migrate|refactor|investigate|research|test|validate)\b/.test(text)) {
    score += 1;
  }
  if (availableTools.length >= 3) {
    score += 1;
  }

  return clampSteps(score);
}

function clampSteps(steps: number): number {
  if (!Number.isFinite(steps)) {
    return 1;
  }
  return Math.min(12, Math.max(1, Math.round(steps)));
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeApprovalConfig(config: PlanApprovalConfig): PlanApprovalConfig {
  const mode: PlanApprovalMode =
    config.mode === "auto" || config.mode === "supervised" || config.mode === "consensus"
      ? config.mode
      : "auto";

  return {
    mode,
    autoBudgetThreshold: Number.isFinite(config.autoBudgetThreshold)
      ? Math.max(0, Math.floor(config.autoBudgetThreshold))
      : DEFAULT_AUTO_BUDGET_THRESHOLD,
    consensusCriticRole:
      typeof config.consensusCriticRole === "string" && config.consensusCriticRole.trim().length > 0
        ? config.consensusCriticRole.trim()
        : DEFAULT_CONSENSUS_CRITIC_ROLE,
    reviewTimeoutMs: Number.isFinite(config.reviewTimeoutMs)
      ? Math.max(1, Math.floor(config.reviewTimeoutMs))
      : DEFAULT_REVIEW_TIMEOUT_MS,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatTools(tools: string[]): string {
  const normalized = tools.map((tool) => tool.trim()).filter((tool) => tool.length > 0);
  return normalized.length > 0 ? normalized.join(", ") : "none";
}

function renderPlanMarkdown(goalId: string, version: number, plan: PlannerOutput): string {
  const lines: string[] = [];
  lines.push(`# Plan: ${goalId} (v${version})`);
  lines.push(`Status: DRAFT | Estimated Cost: ${plan.estimatedTotalCostCents} cents | Estimated Time: ${plan.estimatedTimeMinutes} min`);
  lines.push("");
  lines.push("## Strategy");
  lines.push(plan.strategy.trim().length > 0 ? plan.strategy.trim() : "No strategy provided.");
  lines.push("");
  lines.push("## Analysis");
  lines.push(plan.analysis.trim().length > 0 ? plan.analysis.trim() : "No analysis provided.");
  lines.push("");
  lines.push("## Tasks");

  if (plan.tasks.length === 0) {
    lines.push("1. (No tasks)");
  } else {
    for (let index = 0; index < plan.tasks.length; index += 1) {
      const task = plan.tasks[index];
      lines.push(
        `${index + 1}. [ ] ${task.title} — role: ${task.agentRole}, deps: ${task.dependencies.join(",") || "none"}, cost: ${task.estimatedCostCents}c, timeout: ${task.timeoutMs}ms`,
      );
      lines.push(`   ${task.description}`);
    }
  }

  lines.push("");
  lines.push("## Risks");
  if (plan.risks.length === 0) {
    lines.push("- none");
  } else {
    for (const risk of plan.risks) {
      lines.push(`- ${risk}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
