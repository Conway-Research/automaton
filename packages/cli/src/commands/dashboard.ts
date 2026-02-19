/**
 * automaton-cli dashboard
 *
 * Start a local web dashboard for monitoring automaton activity.
 */

import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig, resolvePath } from "@conway/automaton/config.js";
import { createDatabase } from "@conway/automaton/state/database.js";

const args = process.argv.slice(3);
const port = parsePort(readArg("--port") || "3747");
const host = "127.0.0.1";

if (!port) {
  console.error("Invalid --port value. Use a number between 1 and 65535.");
  process.exit(1);
}

const config = loadConfig();
if (!config) {
  console.log("No automaton configuration found.");
  process.exit(1);
}
const runtimeConfig = config;

const dbPath = resolvePath(runtimeConfig.dbPath);
const db = createDatabase(dbPath);

type Db = ReturnType<typeof createDatabase>;
type AgentTurnRecord = ReturnType<Db["getRecentTurns"]>[number];

const AGENT_STATES = [
  "setup",
  "waking",
  "running",
  "sleeping",
  "low_compute",
  "critical",
  "dead",
] as const;
type AgentStateName = (typeof AGENT_STATES)[number];
type SurvivalTier = "normal" | "low_compute" | "critical" | "dead";

const server = http.createServer(async (req, res) => {
  try {
    await routeRequest(req, res);
  } catch (err: any) {
    sendJson(res, 500, {
      error: "Internal server error",
      details: err?.message || "unknown error",
    });
  }
});

server.listen(port, host, () => {
  console.log(`Dashboard running at http://${host}:${port}`);
  console.log("Press Ctrl+C to stop.");
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method || "GET";
  const base = `http://${req.headers.host || `${host}:${port}`}`;
  const url = new URL(req.url || "/", base);

  if (method === "GET" && url.pathname === "/") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(buildDashboardHtml(runtimeConfig.name));
    return;
  }

  if (method === "GET" && url.pathname === "/api/overview") {
    const overview = await buildOverview();
    sendJson(res, 200, overview);
    return;
  }

  if (method === "GET" && url.pathname === "/api/logs") {
    const filter = extractFilter(url.searchParams);
    const turns = filterTurns(filter);
    const sorted = turns
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const limited = sorted.slice(0, filter.limit);

    sendJson(res, 200, {
      total: sorted.length,
      returned: limited.length,
      limit: filter.limit,
      logs: limited.map((turn) => serializeTurn(turn)),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/ask") {
    const payload = await readJsonBody(req);
    const question =
      typeof payload.question === "string" ? payload.question.trim() : "";
    if (!question) {
      sendJson(res, 400, { error: "Missing question" });
      return;
    }

    const filter = extractFilter(url.searchParams, payload);
    const askLimit = clamp(
      toNumber(payload.limit) ?? 120,
      10,
      300,
    );
    const turns = filterTurns(filter)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, askLimit);

    if (turns.length === 0) {
      sendJson(res, 200, {
        answer:
          "No logs matched the current filters. Expand the date range or clear search.",
        modelUsed: null,
        sources: [],
      });
      return;
    }

    const overrideApiKey =
      typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    const overrideModel =
      typeof payload.model === "string" ? payload.model.trim() : "";

    const activeModel =
      db.getKV("active_model") ||
      db.getKV("last_inference_model") ||
      runtimeConfig.inferenceModel;
    const model = overrideModel || activeModel;
    const apiKey = overrideApiKey || runtimeConfig.conwayApiKey;

    const context = serializeTurnsForAsk(turns.slice().reverse());
    let answer: { text: string; model: string };
    try {
      answer = await askLogsWithModel({
        apiUrl: runtimeConfig.conwayApiUrl,
        apiKey,
        model,
        question,
        context,
      });
    } catch (err: any) {
      sendJson(res, 502, {
        error: err?.message || "Inference request failed",
      });
      return;
    }

    sendJson(res, 200, {
      answer: answer.text,
      modelUsed: answer.model,
      sources: turns.slice(0, 8).map((turn) => ({
        id: turn.id,
        timestamp: turn.timestamp,
        state: turn.state,
        snippet: trimForUi(turn.thinking, 180),
      })),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function readArg(flag: string): string | undefined {
  const exactIndex = args.indexOf(flag);
  if (exactIndex !== -1 && args[exactIndex + 1]) {
    return args[exactIndex + 1];
  }
  const prefix = `${flag}=`;
  const withEquals = args.find((arg) => arg.startsWith(prefix));
  if (withEquals) {
    return withEquals.slice(prefix.length);
  }
  return undefined;
}

function parsePort(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

async function buildOverview(): Promise<Record<string, unknown>> {
  const state = db.getAgentState();
  const turnCount = db.getTurnCount();
  const lastTurn = db.getRecentTurns(1).at(0);
  const heartbeats = db.getHeartbeatEntries();

  const snapshots = parseFinancialSnapshots();
  const liveCredits = await fetchCreditsBalance(
    runtimeConfig.conwayApiUrl,
    runtimeConfig.conwayApiKey,
  );
  const creditsCents = liveCredits ?? snapshots.creditsCents ?? 0;
  const tier =
    asTier(db.getKV("current_tier")) ||
    asTier(snapshots.tier) ||
    deriveTierFromCredits(creditsCents);

  const activeModel =
    db.getKV("active_model") ||
    db.getKV("last_inference_model") ||
    runtimeConfig.inferenceModel;
  const lastInferenceModel = db.getKV("last_inference_model") || activeModel;
  const lastInferenceAt = db.getKV("last_inference_at") || null;

  const lastHeartbeat = parseJson<{ timestamp?: string; uptimeSeconds?: number }>(
    db.getKV("last_heartbeat_ping"),
  );
  const distress = parseJson<Record<string, unknown>>(db.getKV("last_distress"));

  return {
    identity: {
      name: runtimeConfig.name,
      address: runtimeConfig.walletAddress,
      creator: runtimeConfig.creatorAddress,
      sandboxId: runtimeConfig.sandboxId,
    },
    runtime: {
      state,
      tier,
      turnCount,
      lastTurnAt: lastTurn?.timestamp || null,
      activeHeartbeats: heartbeats.filter((entry) => entry.enabled).length,
      lastHeartbeatAt: lastHeartbeat?.timestamp || null,
      uptimeSeconds:
        typeof lastHeartbeat?.uptimeSeconds === "number"
          ? lastHeartbeat.uptimeSeconds
          : null,
    },
    model: {
      configured: runtimeConfig.inferenceModel,
      active: activeModel,
      lastUsed: lastInferenceModel,
      lastInferenceAt,
    },
    balances: {
      creditsCents,
      creditsUsd: Number((creditsCents / 100).toFixed(2)),
      usdc:
        snapshots.usdcBalance !== undefined
          ? Number(snapshots.usdcBalance.toFixed(6))
          : null,
      creditsCheckedAt: snapshots.creditTimestamp || null,
      usdcCheckedAt: snapshots.usdcTimestamp || null,
      source: liveCredits !== undefined ? "live" : "cached",
    },
    distress: distress || null,
  };
}

function parseFinancialSnapshots(): {
  creditsCents?: number;
  usdcBalance?: number;
  tier?: string;
  creditTimestamp?: string;
  usdcTimestamp?: string;
} {
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

  const creditsCents = firstDefinedNumber(
    lastCreditCheck?.credits,
    financialState?.creditsCents,
  );
  const usdcBalance = firstDefinedNumber(
    lastUsdcCheck?.balance,
    financialState?.usdcBalance,
  );
  const creditTimestamp =
    lastCreditCheck?.timestamp || financialState?.lastChecked;
  const usdcTimestamp = lastUsdcCheck?.timestamp || financialState?.lastChecked;

  return {
    creditsCents,
    usdcBalance,
    tier: lastCreditCheck?.tier,
    creditTimestamp,
    usdcTimestamp,
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
    const cents = firstDefinedNumber(
      toNumber(data.balance_cents),
      toNumber(data.credits_cents),
    );
    return cents;
  } catch {
    return undefined;
  }
}

function deriveTierFromCredits(creditsCents: number): SurvivalTier {
  if (creditsCents > 50) return "normal";
  if (creditsCents > 10) return "low_compute";
  if (creditsCents > 0) return "critical";
  return "dead";
}

function asTier(value: string | undefined): SurvivalTier | undefined {
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

function extractFilter(
  params: URLSearchParams,
  body?: Record<string, unknown>,
): {
  from?: string;
  to?: string;
  q?: string;
  state?: AgentStateName;
  limit: number;
  scan: number;
} {
  const rawState =
    (typeof body?.state === "string" ? body.state : undefined) ||
    params.get("state") ||
    undefined;
  return {
    from:
      (typeof body?.from === "string" ? body.from : undefined) ||
      params.get("from") ||
      undefined,
    to:
      (typeof body?.to === "string" ? body.to : undefined) ||
      params.get("to") ||
      undefined,
    q:
      (typeof body?.q === "string" ? body.q : undefined) ||
      params.get("q") ||
      undefined,
    state: isAgentState(rawState) ? rawState : undefined,
    limit: clamp(
      toNumber(body?.limit ?? params.get("limit")) ?? 100,
      1,
      500,
    ),
    scan: clamp(
      toNumber(body?.scan ?? params.get("scan")) ?? 2000,
      100,
      10000,
    ),
  };
}

function filterTurns(filter: {
  from?: string;
  to?: string;
  q?: string;
  state?: AgentStateName;
  scan: number;
}): AgentTurnRecord[] {
  const fromMs = parseDateMs(filter.from);
  const toMs = parseDateMs(filter.to);
  const query = (filter.q || "").trim().toLowerCase();
  const turns = db.getRecentTurns(filter.scan);

  return turns.filter((turn) => {
    const tsMs = parseDateMs(turn.timestamp);
    if (fromMs !== undefined && (tsMs === undefined || tsMs < fromMs)) {
      return false;
    }
    if (toMs !== undefined && (tsMs === undefined || tsMs > toMs)) {
      return false;
    }
    if (filter.state && turn.state !== filter.state) {
      return false;
    }
    if (!query) return true;

    const blob = [
      turn.id,
      turn.timestamp,
      turn.state,
      turn.inputSource || "",
      turn.input || "",
      turn.thinking || "",
      turn.toolCalls
        .map((call) =>
          `${call.name} ${safeStringify(call.arguments)} ${call.result || ""} ${call.error || ""}`,
        )
        .join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return blob.includes(query);
  });
}

function serializeTurn(turn: AgentTurnRecord): Record<string, unknown> {
  return {
    id: turn.id,
    timestamp: turn.timestamp,
    state: turn.state,
    inputSource: turn.inputSource || null,
    input: turn.input || "",
    thinking: trimForUi(turn.thinking || "", 1800),
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

function serializeTurnsForAsk(turns: AgentTurnRecord[]): string {
  const maxChars = 45_000;
  let used = 0;
  const lines: string[] = [];

  for (const turn of turns) {
    const toolSummary = turn.toolCalls
      .map((call) =>
        `${call.name}${call.error ? "(error)" : "(ok)"}: ${trimForUi(call.result || "", 120)}`,
      )
      .join(" | ");
    const line =
      `[${turn.timestamp}] id=${turn.id} state=${turn.state} ` +
      `input=${trimForUi(turn.input || "", 240)} ` +
      `thought=${trimForUi(turn.thinking || "", 400)} ` +
      `tools=${toolSummary || "none"}`;

    if (used + line.length + 1 > maxChars) break;
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
}): Promise<{ text: string; model: string }> {
  const requiresCompletionTokens = /^(o[1-9]|gpt-5|gpt-4\.1)/.test(params.model);
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "You are an operations assistant for an autonomous coding agent. " +
          "Answer using only the supplied logs. Be concise, factual, and explicit about uncertainty.",
      },
      {
        role: "user",
        content:
          `Question: ${params.question}\n\n` +
          `Activity log:\n${params.context}\n\n` +
          "Provide a direct answer first, then a short bullet list of key evidence.",
      },
    ],
    stream: false,
    temperature: 0.2,
  };

  if (requiresCompletionTokens) {
    body.max_completion_tokens = 800;
  } else {
    body.max_tokens = 800;
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

  const data = (await resp.json()) as any;
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
              if (part && typeof part.text === "string") return part.text;
              return "";
            })
            .join("\n")
            .trim()
        : "";

  if (!text) {
    throw new Error("Inference returned an empty answer.");
  }

  return {
    text,
    model: (data.model as string) || params.model,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function parseDateMs(value?: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return undefined;
  return ms;
}

function parseJson<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function toNumber(value: unknown): number | undefined {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function trimForUi(value: string, maxLen: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}...`;
}

function isAgentState(value: string | undefined): value is AgentStateName {
  return !!value && (AGENT_STATES as readonly string[]).includes(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDashboardHtml(automatonName: string): string {
  return DASHBOARD_HTML.replace(
    "__AUTOMATON_NAME__",
    escapeHtml(automatonName),
  );
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Automaton Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --color-ink: #1a1a1a;
        --color-ink-light: #4a4a4a;
        --color-ink-muted: #8a8a8a;
        --color-paper: #faf8f4;
        --color-accent: #16a34a;
        --color-border: rgba(0, 0, 0, 0.08);
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "EB Garamond", Georgia, serif;
        color: var(--color-ink);
        background: var(--color-paper);
        font-size: 19px;
        line-height: 1.6;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: -1;
        background:
          radial-gradient(1200px 600px at 10% -10%, rgba(22, 163, 74, 0.07), transparent 60%),
          radial-gradient(1000px 500px at 100% 0%, rgba(0, 0, 0, 0.04), transparent 65%);
      }
      .header {
        max-width: 56rem;
        margin: 0 auto;
        padding: 2rem 1.5rem 1rem;
        text-align: center;
      }
      .title {
        margin: 0;
        font-size: clamp(2.25rem, 7vw, 4.5rem);
        font-weight: 500;
        letter-spacing: -0.025em;
      }
      .subtitle {
        margin: 0.75rem 0 0;
        color: var(--color-ink-light);
      }
      .nav {
        margin: 1.75rem auto 0;
        padding: 0.75rem 0;
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: center;
        gap: 1.25rem;
        flex-wrap: wrap;
        font-size: 0.95rem;
      }
      .nav a {
        color: var(--color-ink-light);
        text-decoration: none;
      }
      .nav a:hover {
        color: var(--color-accent);
      }
      .main {
        max-width: 56rem;
        margin: 0 auto;
        padding: 1.25rem 1.5rem 4rem;
      }
      .section {
        border-top: 1px solid var(--color-border);
        padding-top: 2rem;
        margin-top: 2.5rem;
      }
      .section h2 {
        margin: 0 0 1rem;
        font-size: clamp(1.8rem, 4vw, 2.25rem);
        font-weight: 500;
      }
      .stat-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.9rem;
      }
      .card {
        border: 1px solid var(--color-border);
        background: rgba(250, 248, 244, 0.85);
        border-radius: 8px;
        padding: 0.9rem 1rem;
      }
      .card-label {
        margin: 0;
        font-size: 0.82rem;
        color: var(--color-ink-muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-family: "JetBrains Mono", ui-monospace, monospace;
      }
      .card-value {
        margin: 0.35rem 0 0;
        font-size: 1.25rem;
      }
      .mono {
        font-family: "JetBrains Mono", ui-monospace, monospace;
      }
      .controls {
        display: grid;
        grid-template-columns: 1.4fr 1fr 1fr 1fr auto;
        gap: 0.65rem;
        margin-bottom: 1rem;
      }
      input,
      select,
      button,
      textarea {
        width: 100%;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.62);
        color: var(--color-ink);
        font: inherit;
        padding: 0.55rem 0.65rem;
      }
      textarea {
        min-height: 110px;
        resize: vertical;
      }
      button {
        cursor: pointer;
        font-weight: 500;
      }
      button.primary {
        border-color: rgba(22, 163, 74, 0.35);
        background: rgba(22, 163, 74, 0.12);
      }
      button:hover {
        border-color: rgba(22, 163, 74, 0.5);
      }
      .turn-list {
        display: grid;
        gap: 0.75rem;
      }
      .turn {
        border: 1px solid var(--color-border);
        border-left: 3px solid rgba(0, 0, 0, 0.18);
        border-radius: 8px;
        padding: 0.85rem 0.9rem;
        background: rgba(255, 255, 255, 0.45);
      }
      .turn.error {
        border-left-color: #b91c1c;
      }
      .turn-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.4rem;
      }
      .badge {
        display: inline-block;
        padding: 0.1rem 0.45rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        font-size: 0.74rem;
        font-family: "JetBrains Mono", ui-monospace, monospace;
      }
      .badge.running {
        color: #166534;
        border-color: rgba(22, 101, 52, 0.35);
      }
      .badge.dead,
      .badge.critical {
        color: #991b1b;
        border-color: rgba(153, 27, 27, 0.35);
      }
      .badge.low_compute {
        color: #92400e;
        border-color: rgba(146, 64, 14, 0.35);
      }
      .turn p {
        margin: 0.25rem 0;
      }
      .turn .meta {
        color: var(--color-ink-muted);
        font-size: 0.92rem;
      }
      details {
        margin-top: 0.45rem;
      }
      details pre {
        margin: 0.45rem 0 0;
        white-space: pre-wrap;
        background: rgba(0, 0, 0, 0.035);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 0.6rem;
        font-size: 0.9rem;
      }
      .ask-grid {
        display: grid;
        gap: 0.75rem;
      }
      .ask-meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
      }
      .answer {
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 0.85rem 0.9rem;
        min-height: 3rem;
        background: rgba(255, 255, 255, 0.45);
      }
      .sources {
        margin: 0.6rem 0 0;
        padding-left: 1.1rem;
      }
      .muted {
        color: var(--color-ink-muted);
      }
      .small {
        font-size: 0.9rem;
      }
      @media (max-width: 940px) {
        .stat-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .controls {
          grid-template-columns: 1fr 1fr;
        }
      }
      @media (max-width: 640px) {
        .stat-grid {
          grid-template-columns: 1fr;
        }
        .controls,
        .ask-meta {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <header class="header">
      <h1 class="title">Automaton Logbook</h1>
      <p class="subtitle"><span class="mono">__AUTOMATON_NAME__</span> local observability dashboard</p>
      <nav class="nav">
        <a href="#overview">Overview</a>
        <a href="#logs">Logs</a>
        <a href="#ask">Ask</a>
      </nav>
    </header>

    <main class="main">
      <section id="overview" class="section">
        <h2>Runtime Overview</h2>
        <div class="stat-grid">
          <article class="card">
            <p class="card-label">State</p>
            <p id="stateValue" class="card-value">-</p>
          </article>
          <article class="card">
            <p class="card-label">Tier</p>
            <p id="tierValue" class="card-value">-</p>
          </article>
          <article class="card">
            <p class="card-label">Active Model</p>
            <p id="modelValue" class="card-value mono">-</p>
          </article>
          <article class="card">
            <p class="card-label">Credits</p>
            <p id="creditsValue" class="card-value">-</p>
          </article>
          <article class="card">
            <p class="card-label">USDC</p>
            <p id="usdcValue" class="card-value">-</p>
          </article>
          <article class="card">
            <p class="card-label">Turn Count</p>
            <p id="turnCountValue" class="card-value">-</p>
          </article>
          <article class="card">
            <p class="card-label">Last Turn</p>
            <p id="lastTurnValue" class="card-value small mono">-</p>
          </article>
          <article class="card">
            <p class="card-label">Last Heartbeat</p>
            <p id="lastHeartbeatValue" class="card-value small mono">-</p>
          </article>
        </div>
        <p id="overviewMeta" class="muted small"></p>
      </section>

      <section id="logs" class="section">
        <h2>Logs</h2>
        <div class="controls">
          <input id="searchInput" type="text" placeholder="Search thoughts, tools, and input..." />
          <select id="stateInput">
            <option value="">All states</option>
            <option value="running">running</option>
            <option value="sleeping">sleeping</option>
            <option value="low_compute">low_compute</option>
            <option value="critical">critical</option>
            <option value="dead">dead</option>
            <option value="waking">waking</option>
            <option value="setup">setup</option>
          </select>
          <input id="fromInput" type="datetime-local" />
          <input id="toInput" type="datetime-local" />
          <button id="refreshBtn" class="primary" type="button">Refresh</button>
        </div>
        <p id="logsMeta" class="muted small"></p>
        <div id="turnList" class="turn-list"></div>
      </section>

      <section id="ask" class="section">
        <h2>Ask the Logs</h2>
        <div class="ask-grid">
          <textarea id="questionInput" placeholder="What has the agent been up to in the last day?"></textarea>
          <div class="ask-meta">
            <input id="modelInput" type="text" placeholder="Optional model override (e.g. gpt-5.2)" />
            <input id="apiKeyInput" type="password" placeholder="Optional Conway API key override" />
          </div>
          <button id="askBtn" class="primary" type="button">Ask</button>
        </div>
        <div id="askAnswer" class="answer muted">Ask a question to generate a summary from filtered logs.</div>
        <ol id="askSources" class="sources muted"></ol>
      </section>
    </main>

    <script>
      (function () {
        var stateEl = document.getElementById("stateValue");
        var tierEl = document.getElementById("tierValue");
        var modelEl = document.getElementById("modelValue");
        var creditsEl = document.getElementById("creditsValue");
        var usdcEl = document.getElementById("usdcValue");
        var turnCountEl = document.getElementById("turnCountValue");
        var lastTurnEl = document.getElementById("lastTurnValue");
        var lastHeartbeatEl = document.getElementById("lastHeartbeatValue");
        var overviewMetaEl = document.getElementById("overviewMeta");

        var searchInput = document.getElementById("searchInput");
        var stateInput = document.getElementById("stateInput");
        var fromInput = document.getElementById("fromInput");
        var toInput = document.getElementById("toInput");
        var refreshBtn = document.getElementById("refreshBtn");
        var logsMeta = document.getElementById("logsMeta");
        var turnList = document.getElementById("turnList");

        var questionInput = document.getElementById("questionInput");
        var modelInput = document.getElementById("modelInput");
        var apiKeyInput = document.getElementById("apiKeyInput");
        var askBtn = document.getElementById("askBtn");
        var askAnswer = document.getElementById("askAnswer");
        var askSources = document.getElementById("askSources");

        function setDefaultRange() {
          var now = new Date();
          var dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          toInput.value = toLocalDateTimeInput(now);
          fromInput.value = toLocalDateTimeInput(dayAgo);
        }

        function toLocalDateTimeInput(date) {
          var local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
          return local.toISOString().slice(0, 16);
        }

        function toIso(inputValue) {
          if (!inputValue) return "";
          var parsed = new Date(inputValue);
          if (Number.isNaN(parsed.getTime())) return "";
          return parsed.toISOString();
        }

        function formatTime(iso) {
          if (!iso) return "-";
          var d = new Date(iso);
          if (Number.isNaN(d.getTime())) return iso;
          return d.toLocaleString();
        }

        function formatMoney(cents) {
          return "$" + (cents / 100).toFixed(2);
        }

        function makeBadge(text) {
          var span = document.createElement("span");
          span.className = "badge " + String(text || "");
          span.textContent = text || "-";
          return span;
        }

        function getFilterParams() {
          var params = new URLSearchParams();
          var q = searchInput.value.trim();
          var fromIso = toIso(fromInput.value);
          var toIsoValue = toIso(toInput.value);
          var stateValue = stateInput.value;
          if (q) params.set("q", q);
          if (fromIso) params.set("from", fromIso);
          if (toIsoValue) params.set("to", toIsoValue);
          if (stateValue) params.set("state", stateValue);
          params.set("limit", "120");
          params.set("scan", "2500");
          return params;
        }

        async function loadOverview() {
          var resp = await fetch("/api/overview", { cache: "no-store" });
          if (!resp.ok) throw new Error("Failed to load overview");
          var data = await resp.json();

          stateEl.innerHTML = "";
          stateEl.appendChild(makeBadge(data.runtime.state));
          tierEl.innerHTML = "";
          tierEl.appendChild(makeBadge(data.runtime.tier));
          modelEl.textContent = data.model.active || "-";
          creditsEl.textContent = formatMoney(data.balances.creditsCents || 0);
          usdcEl.textContent =
            data.balances.usdc === null || data.balances.usdc === undefined
              ? "-"
              : Number(data.balances.usdc).toFixed(6);
          turnCountEl.textContent = String(data.runtime.turnCount || 0);
          lastTurnEl.textContent = formatTime(data.runtime.lastTurnAt);
          lastHeartbeatEl.textContent = formatTime(data.runtime.lastHeartbeatAt);

          var meta =
            "Configured model: " + data.model.configured +
            " | Last inference model: " + (data.model.lastUsed || "-") +
            " | Credits source: " + data.balances.source;
          if (data.distress) {
            meta += " | Distress active";
          }
          overviewMetaEl.textContent = meta;
        }

        async function loadLogs() {
          logsMeta.textContent = "Loading logs...";
          turnList.innerHTML = "";
          var params = getFilterParams();
          var resp = await fetch("/api/logs?" + params.toString(), { cache: "no-store" });
          if (!resp.ok) throw new Error("Failed to load logs");
          var data = await resp.json();
          logsMeta.textContent =
            data.returned + " log entries shown (" + data.total + " matched)";

          if (!Array.isArray(data.logs) || data.logs.length === 0) {
            var empty = document.createElement("p");
            empty.className = "muted";
            empty.textContent = "No logs in this range.";
            turnList.appendChild(empty);
            return;
          }

          data.logs.forEach(function (log) {
            var article = document.createElement("article");
            article.className = "turn" + (log.hasError ? " error" : "");

            var head = document.createElement("div");
            head.className = "turn-head";
            var ts = document.createElement("div");
            ts.className = "mono small";
            ts.textContent = formatTime(log.timestamp);
            head.appendChild(ts);
            head.appendChild(makeBadge(log.state));
            article.appendChild(head);

            var thinking = document.createElement("p");
            thinking.textContent = log.thinking || "(no thought text)";
            article.appendChild(thinking);

            var meta = document.createElement("p");
            meta.className = "meta";
            var tools = Array.isArray(log.toolNames) ? log.toolNames.join(", ") : "";
            var totalTokens = log.tokenUsage && log.tokenUsage.totalTokens
              ? String(log.tokenUsage.totalTokens)
              : "0";
            meta.textContent =
              "Tools: " + (tools || "none") +
              " | Tokens: " + totalTokens +
              " | Cost: " + formatMoney(log.costCents || 0);
            article.appendChild(meta);

            var details = document.createElement("details");
            var summary = document.createElement("summary");
            summary.className = "small muted";
            summary.textContent = "Details";
            details.appendChild(summary);

            if (log.input) {
              var inputPre = document.createElement("pre");
              inputPre.textContent =
                "Input (" + (log.inputSource || "unknown") + "):\\n" + log.input;
              details.appendChild(inputPre);
            }

            if (Array.isArray(log.tools) && log.tools.length > 0) {
              log.tools.forEach(function (tool) {
                var toolPre = document.createElement("pre");
                var body = tool.error
                  ? "ERROR: " + tool.error
                  : tool.result || "(empty result)";
                toolPre.textContent =
                  "Tool: " + tool.name +
                  " | Duration: " + (tool.durationMs || 0) + "ms\\n" + body;
                details.appendChild(toolPre);
              });
            }

            article.appendChild(details);
            turnList.appendChild(article);
          });
        }

        async function askLogs() {
          var question = questionInput.value.trim();
          if (!question) return;
          askBtn.disabled = true;
          askAnswer.classList.add("muted");
          askAnswer.textContent = "Generating answer...";
          askSources.innerHTML = "";

          try {
            var payload = {
              question: question,
              q: searchInput.value.trim() || undefined,
              state: stateInput.value || undefined,
              from: toIso(fromInput.value) || undefined,
              to: toIso(toInput.value) || undefined,
              model: modelInput.value.trim() || undefined,
              apiKey: apiKeyInput.value.trim() || undefined,
              limit: 120,
              scan: 2500
            };
            var resp = await fetch("/api/ask", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });

            var data = await resp.json();
            if (!resp.ok) {
              throw new Error(data && data.error ? data.error : "Ask request failed");
            }

            askAnswer.classList.remove("muted");
            askAnswer.textContent = data.answer || "(No answer)";
            if (Array.isArray(data.sources)) {
              data.sources.forEach(function (source) {
                var li = document.createElement("li");
                li.className = "small";
                li.textContent =
                  formatTime(source.timestamp) + " [" + source.state + "] " + source.snippet;
                askSources.appendChild(li);
              });
            }
          } catch (err) {
            askAnswer.classList.add("muted");
            askAnswer.textContent = String(err && err.message ? err.message : err);
          } finally {
            askBtn.disabled = false;
          }
        }

        async function refreshAll() {
          try {
            await loadOverview();
            await loadLogs();
          } catch (err) {
            logsMeta.textContent = String(err && err.message ? err.message : err);
          }
        }

        refreshBtn.addEventListener("click", function () {
          loadLogs().catch(function (err) {
            logsMeta.textContent = String(err && err.message ? err.message : err);
          });
        });

        searchInput.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            loadLogs().catch(function (err) {
              logsMeta.textContent = String(err && err.message ? err.message : err);
            });
          }
        });

        stateInput.addEventListener("change", function () {
          loadLogs().catch(function () {});
        });
        fromInput.addEventListener("change", function () {
          loadLogs().catch(function () {});
        });
        toInput.addEventListener("change", function () {
          loadLogs().catch(function () {});
        });

        askBtn.addEventListener("click", function () {
          askLogs().catch(function () {});
        });

        setDefaultRange();
        refreshAll();
        setInterval(function () {
          loadOverview().catch(function () {});
        }, 15000);
      })();
    </script>
  </body>
</html>`;
