import { loadConfig, resolvePath } from "@conway/automaton/config.js";
import { createDatabase } from "@conway/automaton/state/database.js";
import {
  AGENT_STATES,
  type AgentStateName,
  type Cursor,
  type OverviewResponse,
  type SerializedTurn,
} from "../shared/types";

let configCache: ReturnType<typeof loadConfig> | null | undefined;
let dbCache: ReturnType<typeof createDatabase> | undefined;

function getConfig() {
  if (configCache === undefined) {
    configCache = loadConfig();
  }
  if (!configCache) {
    throw new Error("No automaton configuration found.");
  }
  return configCache;
}

function getDb() {
  if (!dbCache) {
    const config = getConfig();
    dbCache = createDatabase(resolvePath(config.dbPath));
  }
  return dbCache;
}

type Db = ReturnType<typeof createDatabase>;
export type AgentTurnRecord = ReturnType<Db["getRecentTurns"]>[number];
type TurnsQueryState = Parameters<Db["queryTurns"]>[0]["state"];

export function getRuntimeConfig() {
  return getConfig();
}

export function getDatabase() {
  return getDb();
}

export type LogsFilter = {
  from?: string;
  to?: string;
  q?: string;
  state?: AgentStateName;
  limit: number;
};

export function extractFilter(
  params: URLSearchParams,
  body?: Record<string, unknown>,
): LogsFilter {
  const rawState =
    (typeof body?.state === "string" ? body.state : undefined) ||
    params.get("state") ||
    undefined;
  const fromRaw =
    (typeof body?.from === "string" ? body.from : undefined) ||
    params.get("from") ||
    undefined;
  const toRaw =
    (typeof body?.to === "string" ? body.to : undefined) ||
    params.get("to") ||
    undefined;

  return {
    from: normalizeIsoDateFilter(fromRaw),
    to: normalizeIsoDateFilter(toRaw),
    q:
      (typeof body?.q === "string" ? body.q : undefined) ||
      params.get("q") ||
      undefined,
    state: isAgentState(rawState) ? rawState : undefined,
    limit: clamp(toNumber(body?.limit ?? params.get("limit")) ?? 40, 1, 200),
  };
}

export function normalizeIsoDateFilter(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const raw = (await request.text()).trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

export function decodeCursor(raw: string | null): Cursor | undefined {
  if (!raw) return undefined;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded) as {
      timestamp?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed?.timestamp === "string" &&
      typeof parsed?.id === "string" &&
      parsed.timestamp &&
      parsed.id &&
      !Number.isNaN(Date.parse(parsed.timestamp))
    ) {
      return {
        timestamp: new Date(parsed.timestamp).toISOString(),
        id: parsed.id,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify({
      timestamp: cursor.timestamp,
      id: cursor.id,
    }),
    "utf-8",
  ).toString("base64url");
}

export function queryTurnsPage(filter: LogsFilter, cursor?: Cursor) {
  return getDb().queryTurns({
    from: filter.from,
    to: filter.to,
    q: filter.q,
    state: filter.state as TurnsQueryState,
    limit: filter.limit,
    cursor,
  });
}

export function collectTurnsAfterCursor(
  filter: Omit<LogsFilter, "limit">,
  cursor: Cursor,
  maxScan: number,
  pageSize: number,
): AgentTurnRecord[] {
  const db = getDb();
  const collected: AgentTurnRecord[] = [];
  let scanned = 0;
  let pageCursor: Cursor | undefined;
  let stop = false;

  while (!stop && scanned < maxScan) {
    const page = db.queryTurns({
      from: filter.from,
      to: filter.to,
      q: filter.q,
      state: filter.state as TurnsQueryState,
      limit: pageSize,
      cursor: pageCursor,
    });

    if (page.turns.length === 0) {
      break;
    }

    scanned += page.turns.length;

    for (const turn of page.turns) {
      if (isTurnAfterCursor(turn, cursor)) {
        collected.push(turn);
      } else {
        stop = true;
        break;
      }
    }

    if (stop || !page.hasMore) {
      break;
    }

    const last = page.turns[page.turns.length - 1];
    pageCursor = {
      timestamp: last.timestamp,
      id: last.id,
    };
  }

  return collected;
}

export function isTurnAfterCursor(
  turn: { timestamp: string; id: string },
  cursor: Cursor,
): boolean {
  if (turn.timestamp > cursor.timestamp) return true;
  if (turn.timestamp < cursor.timestamp) return false;
  return turn.id > cursor.id;
}

export function inferTurnState(turn: AgentTurnRecord): AgentStateName {
  if (
    turn.state === "running" &&
    turn.toolCalls.some((call) => call.name === "sleep" && !call.error)
  ) {
    return "sleeping";
  }
  return isAgentState(turn.state) ? turn.state : "running";
}

export function serializeTurn(turn: AgentTurnRecord): SerializedTurn {
  const state = inferTurnState(turn);
  return {
    id: turn.id,
    timestamp: turn.timestamp,
    state,
    inputSource: turn.inputSource || null,
    input: turn.input || "",
    thinking: trimForUi(turn.thinking || "", 1800),
    summary: trimForUi(summarizeTurn(turn), 800),
    toolNames: turn.toolCalls.map((call) => call.name),
    hasError: turn.toolCalls.some((call) => !!call.error),
    tokenUsage: turn.tokenUsage || {},
    costCents: turn.costCents,
    tools: turn.toolCalls.map((call) => ({
      id: call.id,
      name: call.name,
      durationMs: call.durationMs,
      error: call.error || null,
      result: trimForUi(call.result || "", 700),
    })),
  };
}

export function summarizeTurn(turn: AgentTurnRecord): string {
  const thought = trimForUi(turn.thinking || "", 640);
  if (thought) return thought;

  const tools = turn.toolCalls || [];
  if (tools.length === 0) {
    if (turn.input) {
      return (
        `Processed ${turn.inputSource || "unknown"} input: ` +
        trimForUi(turn.input, 220)
      );
    }
    return "No thought text or tool output was recorded for this turn.";
  }

  const uniqueNames = Array.from(
    new Set(tools.map((tool) => tool.name).filter(Boolean)),
  );
  const shownNames = uniqueNames.slice(0, 4).join(", ");
  const hiddenNameCount = Math.max(0, uniqueNames.length - 4);
  const errorCount = tools.filter((tool) => !!tool.error).length;
  const successCount = tools.length - errorCount;

  let summary =
    `Executed ${tools.length} tool call${tools.length === 1 ? "" : "s"}` +
    (shownNames
      ? ` (${shownNames}${hiddenNameCount ? ` +${hiddenNameCount} more` : ""})`
      : "") +
    ".";

  if (errorCount > 0) {
    summary += ` ${errorCount} failed, ${successCount} succeeded.`;
  } else {
    summary += " Completed without recorded errors.";
  }

  const firstUseful = tools
    .map((tool) => {
      if (tool.error) {
        return `${tool.name} error: ${trimForUi(tool.error, 140)}`;
      }
      if (tool.result && tool.result.trim()) {
        return `${tool.name} result: ${trimForUi(tool.result, 160)}`;
      }
      return "";
    })
    .find((line) => !!line);

  if (firstUseful) {
    summary += ` ${firstUseful}`;
  }

  return summary;
}

export async function buildOverview(): Promise<OverviewResponse> {
  const db = getDb();
  const config = getConfig();
  const state = db.getAgentState();
  const turnCount = db.getTurnCount();
  const lastTurn = db.getRecentTurns(1).at(0);
  const heartbeats = db.getHeartbeatEntries();

  const snapshots = parseFinancialSnapshots();
  const liveCredits = await fetchCreditsBalance(config.conwayApiUrl, config.conwayApiKey);
  const creditsCents = liveCredits ?? snapshots.creditsCents ?? 0;
  const tier =
    asTier(db.getKV("current_tier")) ||
    asTier(snapshots.tier) ||
    deriveTierFromCredits(creditsCents);

  const activeModel =
    db.getKV("active_model") ||
    db.getKV("last_inference_model") ||
    config.inferenceModel;
  const lastInferenceModel = db.getKV("last_inference_model") || activeModel;
  const lastInferenceAt = db.getKV("last_inference_at") || null;

  const lastHeartbeat = parseJson<{ timestamp?: string }>(db.getKV("last_heartbeat_ping"));
  const distress = parseJson<Record<string, unknown>>(db.getKV("last_distress"));

  return {
    runtime: {
      state: isAgentState(state) ? state : "running",
      tier,
      turnCount,
      lastTurnAt: lastTurn?.timestamp || null,
      activeHeartbeats: heartbeats.filter((entry) => entry.enabled).length,
      lastHeartbeatAt: lastHeartbeat?.timestamp || null,
    },
    model: {
      configured: config.inferenceModel,
      active: activeModel,
      lastUsed: lastInferenceModel,
      lastUsedAt: lastInferenceAt,
    },
    balances: {
      creditsCents,
      creditsUsd: Number((creditsCents / 100).toFixed(2)),
      usdc:
        snapshots.usdcBalance !== undefined
          ? Number(snapshots.usdcBalance.toFixed(6))
          : null,
      source: liveCredits !== undefined ? "live" : "cached",
    },
    creator: config.creatorAddress,
    distress: !!distress,
  };
}

export async function askLogs(params: {
  filter: LogsFilter;
  question: string;
  limit: number;
}): Promise<{
  answer: string;
  modelUsed: string | null;
  sources: Array<{
    id: string;
    timestamp: string;
    state: AgentStateName;
    snippet: string;
  }>;
}> {
  const db = getDb();
  const config = getConfig();

  const turns = db.queryTurns({
    from: params.filter.from,
    to: params.filter.to,
    q: params.filter.q,
    state: params.filter.state as TurnsQueryState,
    limit: clamp(params.limit, 10, 300),
  }).turns;

  if (turns.length === 0) {
    return {
      answer:
        "No logs matched the current filters. Expand the date range or clear search.",
      modelUsed: null,
      sources: [],
    };
  }

  const apiKey = config.conwayApiKey;
  if (!apiKey) {
    throw new Error("No Conway API key configured for the running automaton.");
  }

  const model =
    db.getKV("active_model") ||
    db.getKV("last_inference_model") ||
    config.inferenceModel;

  const chronologicalTurns = turns.slice().reverse();
  const askAttempts = [
    {
      context: serializeTurnsForAsk(chronologicalTurns, {
        maxChars: 24_000,
      }),
      maxCompletionTokens: 1_200,
    },
    {
      context: serializeTurnsForAsk(chronologicalTurns.slice(-60), {
        maxChars: 12_000,
        maxInputChars: 120,
        maxThoughtChars: 220,
        maxToolResultChars: 80,
        maxToolCalls: 3,
      }),
      maxCompletionTokens: 1_800,
    },
  ];

  let answer: { text: string; model: string } | null = null;
  let lastError: unknown;
  for (const attempt of askAttempts) {
    try {
      answer = await askLogsWithModel({
        apiUrl: config.conwayApiUrl,
        apiKey,
        model,
        question: params.question,
        context: attempt.context,
        maxCompletionTokens: attempt.maxCompletionTokens,
      });
      break;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const retryable =
        message.includes("empty answer") ||
        message.includes("finish_reason=length");
      if (!retryable) {
        break;
      }
    }
  }

  if (!answer) {
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error("Inference failed to produce an answer.");
  }

  return {
    answer: answer.text,
    modelUsed: answer.model,
    sources: turns.slice(0, 8).map((turn) => ({
      id: turn.id,
      timestamp: turn.timestamp,
      state: inferTurnState(turn),
      snippet: trimForUi(summarizeTurn(turn), 180),
    })),
  };
}

type AskContextOptions = {
  maxChars: number;
  maxInputChars: number;
  maxThoughtChars: number;
  maxToolResultChars: number;
  maxToolCalls: number;
};

function serializeTurnsForAsk(
  turns: AgentTurnRecord[],
  options?: Partial<AskContextOptions>,
): string {
  const settings: AskContextOptions = {
    maxChars: 45_000,
    maxInputChars: 240,
    maxThoughtChars: 400,
    maxToolResultChars: 120,
    maxToolCalls: 5,
    ...options,
  };
  let used = 0;
  const lines: string[] = [];

  for (const turn of turns) {
    const toolSummary = turn.toolCalls
      .slice(0, settings.maxToolCalls)
      .map((call) =>
        `${call.name}${call.error ? "(error)" : "(ok)"}: ${trimForUi(call.result || "", settings.maxToolResultChars)}`,
      )
      .join(" | ");
    const hiddenToolCount = Math.max(0, turn.toolCalls.length - settings.maxToolCalls);
    const line =
      `[${turn.timestamp}] id=${turn.id} state=${turn.state} ` +
      `input=${trimForUi(turn.input || "", settings.maxInputChars)} ` +
      `thought=${trimForUi(turn.thinking || summarizeTurn(turn), settings.maxThoughtChars)} ` +
      `tools=${toolSummary || "none"}${hiddenToolCount > 0 ? ` | +${hiddenToolCount} more` : ""}`;

    if (used + line.length + 1 > settings.maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }

  return lines.join("\n");
}

async function askLogsWithModel(params: {
  apiUrl: string;
  apiKey: string;
  model: string;
  question: string;
  context: string;
  maxCompletionTokens: number;
}): Promise<{ text: string; model: string }> {
  const requiresCompletionTokens = /^(o[1-9]|gpt-5|gpt-4\.1)/.test(params.model);
  const completionBudget = clamp(params.maxCompletionTokens, 400, 4_000);
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "You are an operations assistant for an autonomous coding agent. " +
          "Answer using only the supplied logs. Be concise, factual, and explicit about uncertainty. " +
          "Always respond in Markdown using sections: '## Summary', '## Timeline', '## Key Evidence', and '## Unknowns'.",
      },
      {
        role: "user",
        content:
          `Question: ${params.question}\n\n` +
          `Activity log:\n${params.context}\n\n` +
          "Return Markdown only. Use short bullet points and include concrete timestamps where available.",
      },
    ],
    stream: false,
    temperature: 0.2,
  };

  if (requiresCompletionTokens) {
    body.max_completion_tokens = completionBudget;
  } else {
    body.max_tokens = completionBudget;
  }

  const resp = await fetch(`${params.apiUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: params.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Inference failed: ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{
      message?: { content?: unknown };
      finish_reason?: string | null;
    }>;
    model?: string;
  };
  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error("Inference returned no choices.");
  }

  const message = choice.message?.content;
  const text =
    typeof message === "string"
      ? message.trim()
      : Array.isArray(message)
        ? message
            .map((part) => {
              if (typeof part === "string") return part;
              if (
                typeof part === "object" &&
                part !== null &&
                "text" in part &&
                typeof (part as { text?: unknown }).text === "string"
              ) {
                return (part as { text: string }).text;
              }
              return "";
            })
            .join("\n")
            .trim()
        : "";

  if (!text) {
    const finishReason =
      typeof choice.finish_reason === "string" && choice.finish_reason
        ? choice.finish_reason
        : "unknown";
    throw new Error(
      `Inference returned an empty answer (finish_reason=${finishReason}).`,
    );
  }

  return {
    text,
    model: data.model || params.model,
  };
}

async function fetchCreditsBalance(
  apiUrl: string,
  apiKey: string,
): Promise<number | undefined> {
  if (!apiKey) return undefined;
  try {
    const resp = await fetch(`${apiUrl}/v1/credits/balance`, {
      headers: {
        Authorization: apiKey,
      },
    });
    if (!resp.ok) return undefined;
    const data = (await resp.json()) as Record<string, unknown>;
    return firstDefinedNumber(
      toNumber(data.balance_cents),
      toNumber(data.credits_cents),
    );
  } catch {
    return undefined;
  }
}

function parseFinancialSnapshots(): {
  creditsCents?: number;
  usdcBalance?: number;
  tier?: string;
  creditTimestamp?: string;
  usdcTimestamp?: string;
} {
  const db = getDb();
  const lastCreditCheck = parseJson<{
    credits?: number;
    tier?: string;
    timestamp?: string;
  }>(db.getKV("last_credit_check"));
  const lastUsdcCheck = parseJson<{
    balance?: number;
    timestamp?: string;
  }>(db.getKV("last_usdc_check"));
  const financialState = parseJson<{
    creditsCents?: number;
    usdcBalance?: number;
    lastChecked?: string;
  }>(db.getKV("financial_state"));

  return {
    creditsCents: firstDefinedNumber(lastCreditCheck?.credits, financialState?.creditsCents),
    usdcBalance: firstDefinedNumber(lastUsdcCheck?.balance, financialState?.usdcBalance),
    tier: lastCreditCheck?.tier,
    creditTimestamp: lastCreditCheck?.timestamp || financialState?.lastChecked,
    usdcTimestamp: lastUsdcCheck?.timestamp || financialState?.lastChecked,
  };
}

function deriveTierFromCredits(
  creditsCents: number,
): "normal" | "low_compute" | "critical" | "dead" {
  if (creditsCents > 50) return "normal";
  if (creditsCents > 10) return "low_compute";
  if (creditsCents > 0) return "critical";
  return "dead";
}

function asTier(
  value: string | undefined,
): "normal" | "low_compute" | "critical" | "dead" | undefined {
  if (
    value === "normal" ||
    value === "low_compute" ||
    value === "critical" ||
    value === "dead"
  ) {
    return value;
  }
  return undefined;
}

function parseJson<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstDefinedNumber(...values: Array<number | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function trimForUi(value: string, maxLen: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}...`;
}

export function isAgentState(value: string | undefined): value is AgentStateName {
  return !!value && (AGENT_STATES as readonly string[]).includes(value);
}
