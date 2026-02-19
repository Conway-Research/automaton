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
    const cursorParam = url.searchParams.get("cursor") || undefined;
    const cursor = decodeCursor(cursorParam);
    if (cursorParam && !cursor) {
      sendJson(res, 400, { error: "Invalid cursor" });
      return;
    }

    const page = db.queryTurns({
      from: filter.from,
      to: filter.to,
      q: filter.q,
      state: filter.state,
      limit: filter.limit,
      cursor,
    });
    const nextCursor =
      page.hasMore && page.turns.length > 0
        ? encodeCursor(page.turns[page.turns.length - 1])
        : null;
    const headCursor =
      page.turns.length > 0 ? encodeCursor(page.turns[0]) : null;

    sendJson(res, 200, {
      total: page.totalMatched,
      returned: page.turns.length,
      limit: filter.limit,
      nextCursor,
      headCursor,
      logs: page.turns.map((turn) => serializeTurn(turn)),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/logs/stream") {
    const filter = extractFilter(url.searchParams);
    const cursorParam = url.searchParams.get("cursor") || undefined;
    const decodedCursor = decodeCursor(cursorParam);
    if (cursorParam && !decodedCursor) {
      sendJson(res, 400, { error: "Invalid cursor" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write(": stream-open\n\n");

    let streamCursor = decodedCursor;
    if (!streamCursor) {
      const latestPage = db.queryTurns({
        from: filter.from,
        to: filter.to,
        q: filter.q,
        state: filter.state,
        limit: 1,
      });
      const latest = latestPage.turns[0];
      streamCursor = latest
        ? {
            timestamp: latest.timestamp,
            id: latest.id,
          }
        : undefined;
    }

    const sendEvent = (name: string, payload: Record<string, unknown>): void => {
      res.write(`event: ${name}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent("ready", {
      cursor: streamCursor ? encodeCursor(streamCursor) : null,
      pollMs: 2000,
    });

    const pollTimer = setInterval(() => {
      if (!streamCursor) return;
      const fresh = collectTurnsAfterCursor(filter, streamCursor, 800, 120);
      if (fresh.length === 0) return;

      const newest = fresh[0];
      streamCursor = {
        timestamp: newest.timestamp,
        id: newest.id,
      };

      sendEvent("logs", {
        cursor: encodeCursor(streamCursor),
        count: fresh.length,
        logs: fresh.map((turn) => serializeTurn(turn)),
      });
    }, 2000);

    const keepAliveTimer = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15000);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(pollTimer);
      clearInterval(keepAliveTimer);
      res.end();
    };

    req.on("close", cleanup);
    req.on("aborted", cleanup);
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
    const turns = db.queryTurns({
      from: filter.from,
      to: filter.to,
      q: filter.q,
      state: filter.state,
      limit: askLimit,
    }).turns;

    if (turns.length === 0) {
      sendJson(res, 200, {
        answer:
          "No logs matched the current filters. Expand the date range or clear search.",
        modelUsed: null,
        sources: [],
      });
      return;
    }

    const activeModel =
      db.getKV("active_model") ||
      db.getKV("last_inference_model") ||
      runtimeConfig.inferenceModel;
    const model = activeModel;
    const apiKey = runtimeConfig.conwayApiKey;
    if (!apiKey) {
      sendJson(res, 400, {
        error: "No Conway API key configured for the running automaton.",
      });
      return;
    }

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
        snippet: trimForUi(summarizeTurn(turn), 180),
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
} {
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
    limit: clamp(
      toNumber(body?.limit ?? params.get("limit")) ?? 40,
      1,
      200,
    ),
  };
}

function normalizeIsoDateFilter(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

function decodeCursor(raw: string | undefined): { timestamp: string; id: string } | undefined {
  if (!raw) return undefined;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded) as { timestamp?: unknown; id?: unknown };
    if (
      typeof parsed?.timestamp === "string" &&
      parsed.timestamp &&
      typeof parsed?.id === "string" &&
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

function encodeCursor(turn: { timestamp: string; id: string }): string {
  return Buffer.from(
    JSON.stringify({
      timestamp: turn.timestamp,
      id: turn.id,
    }),
    "utf-8",
  ).toString("base64url");
}

function collectTurnsAfterCursor(
  filter: {
    from?: string;
    to?: string;
    q?: string;
    state?: AgentStateName;
  },
  cursor: { timestamp: string; id: string },
  maxScan: number,
  pageSize: number,
): AgentTurnRecord[] {
  const collected: AgentTurnRecord[] = [];
  let scanned = 0;
  let pageCursor: { timestamp: string; id: string } | undefined;
  let stop = false;

  while (!stop && scanned < maxScan) {
    const page = db.queryTurns({
      from: filter.from,
      to: filter.to,
      q: filter.q,
      state: filter.state,
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
    pageCursor = { timestamp: last.timestamp, id: last.id };
  }

  return collected;
}

function isTurnAfterCursor(
  turn: { timestamp: string; id: string },
  cursor: { timestamp: string; id: string },
): boolean {
  if (turn.timestamp > cursor.timestamp) return true;
  if (turn.timestamp < cursor.timestamp) return false;
  return turn.id > cursor.id;
}

function serializeTurn(turn: AgentTurnRecord): Record<string, unknown> {
  return {
    id: turn.id,
    timestamp: turn.timestamp,
    state: turn.state,
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

function summarizeTurn(turn: AgentTurnRecord): string {
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

  const uniqueNames = Array.from(new Set(tools.map((tool) => tool.name).filter(Boolean)));
  const shownNames = uniqueNames.slice(0, 4).join(", ");
  const hiddenNameCount = Math.max(0, uniqueNames.length - 4);
  const errorCount = tools.filter((tool) => !!tool.error).length;
  const successCount = tools.length - errorCount;

  let summary =
    `Executed ${tools.length} tool call${tools.length === 1 ? "" : "s"}` +
    (shownNames ? ` (${shownNames}${hiddenNameCount ? ` +${hiddenNameCount} more` : ""})` : "") +
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
      `thought=${trimForUi(turn.thinking || summarizeTurn(turn), 400)} ` +
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
        line-height: 1.7;
        overflow-x: hidden;
      }
      body::after {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2;
        opacity: 0.03;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      .life-bg {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 0;
        opacity: 0.25;
      }
      .header {
        max-width: 56rem;
        margin: 0 auto;
        padding: 2rem 1.5rem 1rem;
        text-align: center;
        position: relative;
        z-index: 3;
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
        position: relative;
        z-index: 3;
      }
      .section {
        border-top: 1px solid var(--color-border);
        padding-top: 2rem;
        margin-top: 2.5rem;
      }
      .section:first-of-type {
        margin-top: 1.25rem;
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
      .scroll-sentinel {
        margin-top: 0.8rem;
        text-align: center;
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
      .answer {
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 0.85rem 0.9rem;
        min-height: 3rem;
        background: rgba(255, 255, 255, 0.45);
        line-height: 1.6;
      }
      .answer > :first-child {
        margin-top: 0;
      }
      .answer > :last-child {
        margin-bottom: 0;
      }
      .answer h3,
      .answer h4 {
        margin: 0.75rem 0 0.35rem;
        font-size: 1.2rem;
      }
      .answer p {
        margin: 0.4rem 0;
      }
      .answer ul,
      .answer ol {
        margin: 0.35rem 0 0.55rem;
        padding-left: 1.2rem;
      }
      .answer li {
        margin: 0.18rem 0;
      }
      .answer code {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 0.88em;
        background: rgba(0, 0, 0, 0.055);
        border-radius: 4px;
        padding: 0.06rem 0.3rem;
      }
      .answer pre {
        margin: 0.5rem 0;
        white-space: pre-wrap;
        background: rgba(0, 0, 0, 0.035);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 0.6rem;
        overflow-x: auto;
      }
      .answer a {
        color: var(--color-ink);
        text-decoration-color: rgba(0, 0, 0, 0.3);
      }
      .answer a:hover {
        text-decoration-color: var(--color-accent);
      }
      .sources {
        margin: 0.6rem 0 0;
        padding-left: 1.1rem;
      }
      .muted {
        color: var(--color-ink-muted);
      }
      .live-status {
        margin: 0.15rem 0 0.4rem;
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
        .controls {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <canvas id="lifeCanvas" class="life-bg" aria-hidden="true"></canvas>
    <header class="header">
      <h1 class="title">Automaton Logbook</h1>
      <p class="subtitle"><span class="mono">__AUTOMATON_NAME__</span> observability dashboard</p>
      <nav class="nav">
        <a href="#overview">Overview</a>
        <a href="#ask">Ask</a>
        <a href="#logs">Logs</a>
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

      <section id="ask" class="section">
        <h2>Ask the Logs</h2>
        <div class="ask-grid">
          <textarea id="questionInput" placeholder="What has the agent been up to in the last day?"></textarea>
          <button id="askBtn" class="primary" type="button">Ask</button>
        </div>
        <div id="askAnswer" class="answer muted">Ask a question to generate a summary from filtered logs.</div>
        <ol id="askSources" class="sources muted"></ol>
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
        <p id="logsLive" class="live-status muted small"></p>
        <div id="turnList" class="turn-list"></div>
        <p id="logsSentinel" class="scroll-sentinel muted small"></p>
      </section>
    </main>

    <script>
      (function () {
        var LOG_PAGE_SIZE = 40;

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
        var logsLive = document.getElementById("logsLive");
        var turnList = document.getElementById("turnList");
        var logsSentinel = document.getElementById("logsSentinel");

        var questionInput = document.getElementById("questionInput");
        var askBtn = document.getElementById("askBtn");
        var askAnswer = document.getElementById("askAnswer");
        var askSources = document.getElementById("askSources");

        var logsState = {
          cursor: null,
          total: 0,
          loaded: 0,
          hasMore: true,
          loading: false,
          requestId: 0
        };
        var logIndex = Object.create(null);
        var streamState = {
          source: null,
          reconnectTimer: null,
          cursor: null,
          connecting: false
        };
        var logsObserver = null;

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
          var safeCents = typeof cents === "number" ? cents : 0;
          return "$" + (safeCents / 100).toFixed(2);
        }

        function makeBadge(text) {
          var span = document.createElement("span");
          span.className = "badge " + String(text || "");
          span.textContent = text || "-";
          return span;
        }

        async function readJsonSafe(response) {
          try {
            return await response.json();
          } catch {
            return {};
          }
        }

        function escapeHtmlText(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function renderInlineMarkdown(value) {
          var text = escapeHtmlText(value);
          var tick = String.fromCharCode(96);
          var inlineCodePattern = new RegExp(tick + "([^" + tick + "]+)" + tick, "g");
          text = text.replace(inlineCodePattern, "<code>$1</code>");
          text = text.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
          text = text.replace(/\\*([^*]+)\\*/g, "<em>$1</em>");
          text = text.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, function (_, label, href) {
            var url = String(href || "").trim();
            if (!/^https?:\\/\\//i.test(url)) {
              return label + " (" + url + ")";
            }
            return (
              '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' +
              label +
              "</a>"
            );
          });
          return text;
        }

        function renderMarkdown(markdown) {
          var normalized = String(markdown || "").replace(/\\r\\n?/g, "\\n").trim();
          if (!normalized) {
            return '<p class="muted">(No answer)</p>';
          }

          var lines = normalized.split("\\n");
          var html = [];
          var inUl = false;
          var inOl = false;
          var inCode = false;
          var codeLines = [];
          var codeFence = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);

          function closeLists() {
            if (inUl) {
              html.push("</ul>");
              inUl = false;
            }
            if (inOl) {
              html.push("</ol>");
              inOl = false;
            }
          }

          function flushCode() {
            html.push("<pre><code>" + escapeHtmlText(codeLines.join("\\n")) + "</code></pre>");
            codeLines = [];
            inCode = false;
          }

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.trim();

            if (trimmed.startsWith(codeFence)) {
              closeLists();
              if (inCode) {
                flushCode();
              } else {
                inCode = true;
                codeLines = [];
              }
              continue;
            }

            if (inCode) {
              codeLines.push(line);
              continue;
            }

            if (!trimmed) {
              closeLists();
              continue;
            }

            var headingMatch = trimmed.match(/^(#{1,3})\\s+(.+)$/);
            if (headingMatch) {
              closeLists();
              var level = Math.min(4, headingMatch[1].length + 2);
              html.push(
                "<h" + level + ">" + renderInlineMarkdown(headingMatch[2]) + "</h" + level + ">",
              );
              continue;
            }

            var ulMatch = trimmed.match(/^[-*]\\s+(.+)$/);
            if (ulMatch) {
              if (inOl) {
                html.push("</ol>");
                inOl = false;
              }
              if (!inUl) {
                html.push("<ul>");
                inUl = true;
              }
              html.push("<li>" + renderInlineMarkdown(ulMatch[1]) + "</li>");
              continue;
            }

            var olMatch = trimmed.match(/^\\d+\\.\\s+(.+)$/);
            if (olMatch) {
              if (inUl) {
                html.push("</ul>");
                inUl = false;
              }
              if (!inOl) {
                html.push("<ol>");
                inOl = true;
              }
              html.push("<li>" + renderInlineMarkdown(olMatch[1]) + "</li>");
              continue;
            }

            closeLists();
            html.push("<p>" + renderInlineMarkdown(trimmed) + "</p>");
          }

          if (inCode) {
            flushCode();
          }
          closeLists();
          return html.join("");
        }

        function setLiveStatus(text) {
          if (!logsLive) return;
          logsLive.textContent = text || "";
        }

        function clearEmptyLogNotice() {
          if (logsState.loaded !== 0) return;
          if (turnList.childElementCount !== 1) return;
          var only = turnList.firstElementChild;
          if (!only || only.tagName !== "P") return;
          if (only.classList.contains("muted")) {
            turnList.innerHTML = "";
          }
        }

        function updateLogsMeta() {
          logsMeta.textContent = logsState.loaded + " of " + logsState.total + " log entries loaded";
        }

        function updateSentinel() {
          if (!logsSentinel) return;
          if (logsState.loading) {
            logsSentinel.textContent = "Loading more logs...";
            return;
          }
          if (!logsState.hasMore) {
            if (logsState.loaded === 0) {
              logsSentinel.textContent = "";
            } else {
              logsSentinel.textContent = "All matching logs are loaded.";
            }
            return;
          }
          logsSentinel.textContent = "Scroll down to load more.";
        }

        function resetLogsState() {
          stopLogStream();
          logsState.requestId += 1;
          logsState.cursor = null;
          logsState.total = 0;
          logsState.loaded = 0;
          logsState.hasMore = true;
          logsState.loading = false;
          logIndex = Object.create(null);
          streamState.cursor = null;
          turnList.innerHTML = "";
          logsMeta.textContent = "Loading logs...";
          setLiveStatus("");
          updateSentinel();
        }

        function getFilterBaseParams() {
          var params = new URLSearchParams();
          var q = searchInput.value.trim();
          var fromIso = toIso(fromInput.value);
          var toIsoValue = toIso(toInput.value);
          var stateValue = stateInput.value;
          if (q) params.set("q", q);
          if (fromIso) params.set("from", fromIso);
          if (toIsoValue) params.set("to", toIsoValue);
          if (stateValue) params.set("state", stateValue);
          return params;
        }

        function getFilterParams(cursor) {
          var params = getFilterBaseParams();
          params.set("limit", String(LOG_PAGE_SIZE));
          if (cursor) params.set("cursor", cursor);
          return params;
        }

        function getStreamParams(cursor) {
          var params = getFilterBaseParams();
          params.set("limit", "120");
          if (cursor) params.set("cursor", cursor);
          return params;
        }

        function appendLogCard(log, prepend) {
          if (!log || !log.id) return false;
          if (logIndex[log.id]) return false;
          logIndex[log.id] = 1;
          clearEmptyLogNotice();

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

          var summary = document.createElement("p");
          summary.textContent = log.summary || log.thinking || "No activity summary available.";
          article.appendChild(summary);

          var meta = document.createElement("p");
          meta.className = "meta";
          var tools = Array.isArray(log.toolNames) ? log.toolNames.join(", ") : "";
          var totalTokens =
            log.tokenUsage && typeof log.tokenUsage.totalTokens === "number"
              ? String(log.tokenUsage.totalTokens)
              : "0";
          meta.textContent =
            "Tools: " + (tools || "none") +
            " | Tokens: " + totalTokens +
            " | Cost: " + formatMoney(log.costCents || 0);
          article.appendChild(meta);

          var details = document.createElement("details");
          var detailsSummary = document.createElement("summary");
          detailsSummary.className = "small muted";
          detailsSummary.textContent = "Details";
          details.appendChild(detailsSummary);

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
          if (prepend && turnList.firstChild) {
            turnList.insertBefore(article, turnList.firstChild);
          } else if (prepend) {
            turnList.appendChild(article);
          } else {
            turnList.appendChild(article);
          }
          return true;
        }

        async function loadOverview() {
          var resp = await fetch("/api/overview", { cache: "no-store" });
          var data = await readJsonSafe(resp);
          if (!resp.ok) {
            throw new Error(data && data.error ? data.error : "Failed to load overview");
          }

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

        async function loadLogsPage(options) {
          options = options || {};
          var reset = !!options.reset;

          if (reset) {
            resetLogsState();
          }
          if (logsState.loading || !logsState.hasMore) {
            updateSentinel();
            return;
          }

          logsState.loading = true;
          updateSentinel();
          var requestId = logsState.requestId;

          try {
            var params = getFilterParams(logsState.cursor);
            var resp = await fetch("/api/logs?" + params.toString(), { cache: "no-store" });
            var data = await readJsonSafe(resp);
            if (!resp.ok) {
              throw new Error(data && data.error ? data.error : "Failed to load logs");
            }
            if (requestId !== logsState.requestId) return;

            var logs = Array.isArray(data.logs) ? data.logs : [];
            logsState.total = typeof data.total === "number" ? data.total : logsState.total;

            if (logsState.loaded === 0 && logs.length === 0) {
              turnList.innerHTML = "";
              var empty = document.createElement("p");
              empty.className = "muted";
              empty.textContent = "No logs in this range.";
              turnList.appendChild(empty);
              logsState.hasMore = false;
              logsState.cursor = null;
              logsState.loaded = 0;
              logsState.total = 0;
              logsMeta.textContent = "No logs matched the current filters.";
              startLogStream(null);
              return;
            }

            var inserted = 0;
            logs.forEach(function (log) {
              if (appendLogCard(log, false)) {
                inserted += 1;
              }
            });
            logsState.loaded += inserted;
            logsState.cursor = typeof data.nextCursor === "string" && data.nextCursor
              ? data.nextCursor
              : null;
            if (reset) {
              streamState.cursor = typeof data.headCursor === "string" && data.headCursor
                ? data.headCursor
                : null;
              startLogStream(streamState.cursor);
            }
            logsState.hasMore = !!logsState.cursor;
            updateLogsMeta();
          } catch (err) {
            if (requestId !== logsState.requestId) return;
            logsState.hasMore = false;
            logsMeta.textContent = String(err && err.message ? err.message : err);
          } finally {
            if (requestId === logsState.requestId) {
              logsState.loading = false;
              updateSentinel();
            }
          }
        }

        function parseEventPayload(raw) {
          if (!raw) return {};
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        }

        function stopLogStream() {
          if (streamState.reconnectTimer) {
            clearTimeout(streamState.reconnectTimer);
            streamState.reconnectTimer = null;
          }
          if (streamState.source) {
            streamState.source.close();
            streamState.source = null;
          }
          streamState.connecting = false;
        }

        function scheduleLogStreamReconnect() {
          if (streamState.reconnectTimer) return;
          streamState.reconnectTimer = setTimeout(function () {
            streamState.reconnectTimer = null;
            startLogStream(streamState.cursor);
          }, 3000);
        }

        function ingestLiveLogs(payload) {
          var logs = Array.isArray(payload.logs) ? payload.logs : [];
          if (logs.length === 0) return;

          var inserted = 0;
          for (var i = logs.length - 1; i >= 0; i -= 1) {
            if (appendLogCard(logs[i], true)) {
              inserted += 1;
            }
          }
          if (inserted > 0) {
            logsState.loaded += inserted;
            logsState.total += inserted;
            updateLogsMeta();
          }

          if (typeof payload.cursor === "string" && payload.cursor) {
            streamState.cursor = payload.cursor;
          }
        }

        function startLogStream(cursor) {
          if (!("EventSource" in window)) {
            setLiveStatus("Live updates unavailable in this browser.");
            return;
          }

          stopLogStream();
          streamState.cursor = cursor || null;
          streamState.connecting = true;
          setLiveStatus("Live: connecting...");

          var params = getStreamParams(streamState.cursor);
          var source = new EventSource("/api/logs/stream?" + params.toString());
          streamState.source = source;

          source.addEventListener("ready", function (event) {
            var payload = parseEventPayload(event.data);
            if (typeof payload.cursor === "string" && payload.cursor) {
              streamState.cursor = payload.cursor;
            }
            streamState.connecting = false;
            setLiveStatus("Live: connected");
          });

          source.addEventListener("logs", function (event) {
            var payload = parseEventPayload(event.data);
            ingestLiveLogs(payload);
          });

          source.onerror = function () {
            if (streamState.source !== source) return;
            source.close();
            streamState.source = null;
            streamState.connecting = false;
            setLiveStatus("Live: reconnecting...");
            scheduleLogStreamReconnect();
          };
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
              limit: 120
            };
            var resp = await fetch("/api/ask", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });

            var data = await readJsonSafe(resp);
            if (!resp.ok) {
              throw new Error(data && data.error ? data.error : "Ask request failed");
            }

            askAnswer.classList.remove("muted");
            askAnswer.innerHTML = renderMarkdown(data.answer || "");
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

        function initInfiniteScroll() {
          if (!logsSentinel || !("IntersectionObserver" in window)) return;
          logsObserver = new IntersectionObserver(
            function (entries) {
              var first = entries[0];
              if (!first || !first.isIntersecting) return;
              loadLogsPage({ reset: false }).catch(function (err) {
                logsMeta.textContent = String(err && err.message ? err.message : err);
              });
            },
            {
              root: null,
              rootMargin: "500px 0px 500px 0px",
              threshold: 0.01
            },
          );
          logsObserver.observe(logsSentinel);
        }

        function startLifeBackground() {
          var canvas = document.getElementById("lifeCanvas");
          if (!canvas || !canvas.getContext) return;
          var ctx = canvas.getContext("2d");
          if (!ctx) return;

          var cellSize = 7;
          var intervalMs = 120;
          var density = 0.12;
          var columns = 0;
          var rows = 0;
          var current = new Uint8Array(0);
          var next = new Uint8Array(0);
          var ages = new Uint16Array(0);
          var tick = 0;
          var stepTimer = null;

          var patterns = [
            [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
            [[0, 0], [1, 0], [2, 0], [2, 1], [1, 2]],
            [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
            [[0, 0], [0, 1], [0, 2], [1, 2], [2, 1]]
          ];

          function index(x, y) {
            return y * columns + x;
          }

          function seedRandom() {
            for (var i = 0; i < current.length; i++) {
              var alive = Math.random() < density ? 1 : 0;
              current[i] = alive;
              next[i] = 0;
              ages[i] = alive ? 1 : 0;
            }
          }

          function resize() {
            var width = Math.max(1, Math.floor(window.innerWidth));
            var height = Math.max(1, Math.floor(window.innerHeight));
            canvas.width = width;
            canvas.height = height;
            columns = Math.max(1, Math.floor(width / cellSize));
            rows = Math.max(1, Math.floor(height / cellSize));
            current = new Uint8Array(columns * rows);
            next = new Uint8Array(columns * rows);
            ages = new Uint16Array(columns * rows);
            seedRandom();
            draw();
          }

          function neighbors(x, y) {
            var count = 0;
            for (var dy = -1; dy <= 1; dy++) {
              for (var dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                var nx = (x + dx + columns) % columns;
                var ny = (y + dy + rows) % rows;
                count += current[index(nx, ny)];
              }
            }
            return count;
          }

          function injectPattern() {
            if (!patterns.length || columns < 4 || rows < 4) return;
            var pattern = patterns[Math.floor(Math.random() * patterns.length)];
            var px = Math.floor(Math.random() * Math.max(1, columns - 3));
            var py = Math.floor(Math.random() * Math.max(1, rows - 3));
            for (var i = 0; i < pattern.length; i++) {
              var cell = pattern[i];
              var x = (px + cell[0]) % columns;
              var y = (py + cell[1]) % rows;
              current[index(x, y)] = 1;
              ages[index(x, y)] = Math.max(ages[index(x, y)], 1);
            }
          }

          function step() {
            for (var y = 0; y < rows; y++) {
              for (var x = 0; x < columns; x++) {
                var i = index(x, y);
                var live = current[i] === 1;
                var n = neighbors(x, y);
                var aliveNext = n === 3 || (live && n === 2);
                next[i] = aliveNext ? 1 : 0;
                ages[i] = aliveNext ? Math.min(ages[i] + 1, 9999) : 0;
              }
            }
            var swap = current;
            current = next;
            next = swap;
          }

          function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (var y = 0; y < rows; y++) {
              for (var x = 0; x < columns; x++) {
                var i = index(x, y);
                if (!current[i]) continue;
                var age = ages[i] || 1;
                var green = Math.min(255, 110 + age * 6);
                var blue = Math.min(255, 80 + age * 7);
                ctx.fillStyle = "rgba(22," + green + "," + blue + ",0.25)";
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
              }
            }
          }

          resize();
          window.addEventListener("resize", resize);

          if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
          }

          stepTimer = setInterval(function () {
            step();
            if (tick % 30 === 0) {
              injectPattern();
            }
            draw();
            tick += 1;
          }, intervalMs);

          window.addEventListener("beforeunload", function () {
            if (stepTimer) clearInterval(stepTimer);
          });
        }

        async function refreshAll() {
          try {
            await loadOverview();
            await loadLogsPage({ reset: true });
          } catch (err) {
            logsMeta.textContent = String(err && err.message ? err.message : err);
          }
        }

        refreshBtn.addEventListener("click", function () {
          loadLogsPage({ reset: true }).catch(function (err) {
            logsMeta.textContent = String(err && err.message ? err.message : err);
          });
        });

        searchInput.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            loadLogsPage({ reset: true }).catch(function (err) {
              logsMeta.textContent = String(err && err.message ? err.message : err);
            });
          }
        });

        stateInput.addEventListener("change", function () {
          loadLogsPage({ reset: true }).catch(function () {});
        });
        fromInput.addEventListener("change", function () {
          loadLogsPage({ reset: true }).catch(function () {});
        });
        toInput.addEventListener("change", function () {
          loadLogsPage({ reset: true }).catch(function () {});
        });

        askBtn.addEventListener("click", function () {
          askLogs().catch(function () {});
        });

        window.addEventListener("beforeunload", function () {
          stopLogStream();
        });

        startLifeBackground();
        setDefaultRange();
        initInfiniteScroll();
        refreshAll();
        setInterval(function () {
          loadOverview().catch(function () {});
        }, 15000);
      })();
    </script>
  </body>
</html>`;
