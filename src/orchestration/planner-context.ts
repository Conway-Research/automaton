import fs from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { persistPlan } from "./plan-mode.js";
import type { PlannerContext, PlannerOutput } from "./planner.js";
import type { FundingProtocol } from "./types.js";
import type { AgentWorkspace } from "./workspace.js";
import { getActiveGoals } from "../state/database.js";
import {redactLogText} from '../observability/redaction.js';
import {efficiencySnapshot,efficiencyContext} from '../inference/efficiency.js';

export interface PlannerContextOptions {
  db: Database;
  workspace?: Pick<AgentWorkspace, "basePath" | "listOutputs">;
  funding?: Pick<FundingProtocol, "getBalance">;
  identityAddress?: string;
  creditsCents?: number;
  usdcBalance?: number;
  availableRoles?: string[];
  customRoles?: string[];
  marketIntel?: string;
  idleAgents?: number;
  busyAgents?: number;
  maxAgents?: number;
}

export const DEFAULT_PLANNER_AVAILABLE_ROLES = [
  "generalist",
  "executor",
  "researcher",
  "tester",
  "debugger",
  "architect",
  "analyst",
  "writer",
  "orchestrator",
  "planner",
  "critic",
] as const;

export async function buildPlannerContext(options: PlannerContextOptions): Promise<PlannerContext> {
  const cachedBalance = readCachedBalance(options.db);
  const creditsCents = await resolveCreditsCents(options, cachedBalance?.creditsCents);
  const usdcBalance = resolveUsdcBalance(options, cachedBalance?.usdcBalance);

  return {
    creditsCents,
    usdcBalance,
    survivalTier: toSurvivalTier(creditsCents),
    availableRoles: normalizeStringList(options.availableRoles, [...DEFAULT_PLANNER_AVAILABLE_ROLES]),
    customRoles: normalizeStringList(options.customRoles, []),
    activeGoals: getActiveGoals(options.db).map((goal) => ({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
    })),
    recentOutcomes: loadRecentOutcomes(options.db),
    costLearning: efficiencyContext(efficiencySnapshot(options.db,50)),
    reviewFeedback:options.db.prepare("SELECT key,value FROM kv WHERE key LIKE 'orchestrator.review_feedback.%' ORDER BY updated_at DESC,key LIMIT 5").all().map(row=>{
      const item=row as {key:string;value:string};
      return {goalId:item.key.slice('orchestrator.review_feedback.'.length),feedback:redactLogText(item.value).slice(0,2000)};
    }),
    marketIntel: normalizeLabel(options.marketIntel, "none"),
    idleAgents: clampCount(options.idleAgents),
    busyAgents: clampCount(options.busyAgents),
    maxAgents: Math.max(1, clampCount(options.maxAgents, 1)),
    workspaceFiles: listWorkspaceFiles(options.workspace),
  };
}

export async function persistPlannerArtifacts(params: {
  goalId: string;
  workspacePath: string;
  plan: PlannerOutput;
  version?: number;
}): Promise<{ jsonPath: string; mdPath: string; version: number }> {
  const version = params.version ?? getNextPlannerVersion(params.workspacePath);
  const persisted = await persistPlan({
    goalId: params.goalId,
    version,
    plan: params.plan,
    workspacePath: params.workspacePath,
  });

  return {
    ...persisted,
    version,
  };
}

export function getCurrentPlannerVersion(workspacePath: string): number {
  const root = path.resolve(workspacePath);
  if (!fs.existsSync(root)) {
    return 0;
  }

  let highestArchivedVersion = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const match = /^plan-v(\d+)\.json$/u.exec(entry.name);
    if (!match) {
      continue;
    }

    highestArchivedVersion = Math.max(highestArchivedVersion, Number.parseInt(match[1], 10));
  }

  return fs.existsSync(path.join(root, "plan.json"))
    ? Math.max(1, highestArchivedVersion + 1)
    : 0;
}

export function getNextPlannerVersion(workspacePath: string): number {
  const current = getCurrentPlannerVersion(workspacePath);
  return current > 0 ? current + 1 : 1;
}

function loadRecentOutcomes(db: Database): Array<{
  type: string;
  goalId: string | null;
  taskId: string | null;
  content: string;
  createdAt: string;
}> {
  try {
    return db.prepare(
      `SELECT type, goal_id AS goalId, task_id AS taskId, content, created_at AS createdAt
       FROM event_stream
       WHERE type IN ('task_completed', 'task_failed')
       ORDER BY created_at DESC
       LIMIT 20`,
    ).all() as Array<{
      type: string;
      goalId: string | null;
      taskId: string | null;
      content: string;
      createdAt: string;
    }>;
  } catch {
    return [];
  }
}

function readCachedBalance(db: Database): { creditsCents?: number; usdcBalance?: number } | null {
  try {
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get("last_known_balance") as
      | { value: string }
      | undefined;

    if (!row?.value) {
      return null;
    }

    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    return {
      creditsCents: typeof parsed.creditsCents === "number" && Number.isFinite(parsed.creditsCents)
        ? Math.max(0, Math.floor(parsed.creditsCents))
        : undefined,
      usdcBalance: typeof parsed.usdcBalance === "number" && Number.isFinite(parsed.usdcBalance)
        ? parsed.usdcBalance
        : undefined,
    };
  } catch {
    return null;
  }
}

async function resolveCreditsCents(
  options: PlannerContextOptions,
  cachedCreditsCents?: number,
): Promise<number> {
  if (typeof options.creditsCents === "number" && Number.isFinite(options.creditsCents)) {
    return Math.max(0, Math.floor(options.creditsCents));
  }

  if (options.funding && options.identityAddress) {
    try {
      const balance = await options.funding.getBalance(options.identityAddress);
      if (Number.isFinite(balance)) {
        return Math.max(0, Math.floor(balance));
      }
    } catch {
      // Fall back to cached or default balances.
    }
  }

  return Math.max(0, Math.floor(cachedCreditsCents ?? 0));
}

function resolveUsdcBalance(options: PlannerContextOptions, cachedUsdcBalance?: number): number {
  if (typeof options.usdcBalance === "number" && Number.isFinite(options.usdcBalance)) {
    return options.usdcBalance;
  }

  return typeof cachedUsdcBalance === "number" && Number.isFinite(cachedUsdcBalance)
    ? cachedUsdcBalance
    : 0;
}

function toSurvivalTier(creditsCents: number): string {
  if (creditsCents <= 0) {
    return "critical";
  }
  if (creditsCents < 100) {
    return "low";
  }
  if (creditsCents < 5_000) {
    return "stable";
  }
  return "comfortable";
}

function listWorkspaceFiles(workspace?: Pick<AgentWorkspace, "basePath" | "listOutputs">): string[] {
  if (!workspace) {
    return [];
  }

  try {
    return workspace.listOutputs()
      .map((file) => path.relative(workspace.basePath, file.path).split(path.sep).join("/"))
      .filter((filePath) => filePath.length > 0);
  } catch {
    return [];
  }
}

function normalizeStringList(values: string[] | undefined, fallback: string[]): string[] {
  const normalized = (values ?? fallback)
    .map((value) => normalizeLabel(value, ""))
    .filter((value) => value.length > 0);

  return normalized.length > 0 ? [...new Set(normalized)] : fallback;
}

function normalizeLabel(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > 0 ? normalized : fallback;
}

function clampCount(value: number | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}
