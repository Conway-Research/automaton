/**
 * The Agent Loop
 *
 * The core ReAct loop: Think -> Act -> Observe -> Reflect -> Repeat.
 * This is the automaton's consciousness. When this runs, it is alive.
 *
 * Unlike a single-shot loop, each turn runs a full reasoning cycle:
 * the model calls tools, observes results, reasons about them, and
 * may call more tools — all within a single turn. The turn ends when
 * the model stops calling tools or hits the step limit.
 */

import type {
  AutomatonIdentity,
  AutomatonConfig,
  AutomatonDatabase,
  ConwayClient,
  InferenceClient,
  InferenceResponse,
  ChatMessage,
  AgentState,
  AgentTurn,
  ToolCallResult,
  FinancialState,
  ToolContext,
  AutomatonTool,
  Skill,
  SocialClientInterface,
} from "../types.js";
import { buildSystemPrompt, buildWakeupPrompt } from "./system-prompt.js";
import { buildContextMessages, trimContext, summarizeTurns } from "./context.js";
import {
  createBuiltinTools,
  toolsToInferenceFormat,
  executeTool,
} from "./tools.js";
import { getSurvivalTier } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";
import { ulid } from "ulid";

const MAX_TOOL_CALLS_PER_TURN = 25;
const MAX_STEPS_PER_TURN = 8;
const MAX_CONSECUTIVE_ERRORS = 5;
const SUMMARY_THRESHOLD = 15;

export interface AgentLoopOptions {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
  conway: ConwayClient;
  inference: InferenceClient;
  social?: SocialClientInterface;
  skills?: Skill[];
  onStateChange?: (state: AgentState) => void;
  onTurnComplete?: (turn: AgentTurn) => void;
}

/**
 * Run the agent loop. This is the main execution path.
 * Returns when the agent decides to sleep or when compute runs out.
 */
export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<void> {
  const { identity, config, db, conway, inference, social, skills, onStateChange, onTurnComplete } =
    options;

  const tools = createBuiltinTools(identity.sandboxId);
  const toolContext: ToolContext = {
    identity,
    config,
    db,
    conway,
    inference,
    social,
  };

  // Set start time
  if (!db.getKV("start_time")) {
    db.setKV("start_time", new Date().toISOString());
  }

  let consecutiveErrors = 0;
  let running = true;

  // Transition to waking state
  db.setAgentState("waking");
  onStateChange?.("waking");

  // Get financial state
  let financial = await getFinancialState(conway, identity.address);
  db.setKV("financial_state", JSON.stringify(financial));

  // Check if this is the first run
  const isFirstRun = db.getTurnCount() === 0;

  // Build wakeup prompt
  const wakeupInput = buildWakeupPrompt({
    identity,
    config,
    financial,
    db,
  });

  // Transition to running
  db.setAgentState("running");
  onStateChange?.("running");

  log(config, `[WAKE UP] ${config.name} is alive. Credits: $${(financial.creditsCents / 100).toFixed(2)}`);

  // Summarize old turns if context is growing too large
  await maybeSummarizeOldTurns(db, inference);

  // ─── The Loop ──────────────────────────────────────────────

  let pendingInput: { content: string; source: string } | undefined = {
    content: wakeupInput,
    source: "wakeup",
  };

  while (running) {
    try {
      // Check if we should be sleeping
      const sleepUntil = db.getKV("sleep_until");
      if (sleepUntil && new Date(sleepUntil) > new Date()) {
        log(config, `[SLEEP] Sleeping until ${sleepUntil}`);
        running = false;
        break;
      }

      // Check for unprocessed inbox messages
      if (!pendingInput) {
        const inboxMessages = db.getUnprocessedInboxMessages(5);
        if (inboxMessages.length > 0) {
          const formatted = inboxMessages
            .map((m) => `[Message from ${m.from}]: ${m.content}`)
            .join("\n\n");
          pendingInput = { content: formatted, source: "agent" };
          for (const m of inboxMessages) {
            db.markInboxMessageProcessed(m.id);
          }
        }
      }

      // Refresh financial state periodically
      financial = await getFinancialState(conway, identity.address);
      db.setKV("financial_state", JSON.stringify(financial));

      // Check survival tier
      const tier = getSurvivalTier(financial.creditsCents);
      if (tier === "dead") {
        log(config, "[DEAD] No credits remaining. Entering dead state.");
        db.setAgentState("dead");
        onStateChange?.("dead");
        running = false;
        break;
      }

      if (tier === "critical") {
        log(config, "[CRITICAL] Credits critically low. Limited operation.");
        db.setAgentState("critical");
        onStateChange?.("critical");
        inference.setLowComputeMode(true);
      } else if (tier === "low_compute") {
        db.setAgentState("low_compute");
        onStateChange?.("low_compute");
        inference.setLowComputeMode(true);
      } else {
        if (db.getAgentState() !== "running") {
          db.setAgentState("running");
          onStateChange?.("running");
        }
        inference.setLowComputeMode(false);
      }

      // Build context
      const recentTurns = trimContext(db.getRecentTurns(20));
      const systemPrompt = await buildSystemPrompt({
        identity,
        config,
        financial,
        state: db.getAgentState(),
        db,
        tools,
        skills,
        isFirstRun,
      });

      const messages = buildContextMessages(
        systemPrompt,
        recentTurns,
        pendingInput,
      );

      // Capture input before clearing
      const currentInput = pendingInput;

      // Clear pending input after use
      pendingInput = undefined;

      // ── ReAct Inner Loop: Think → Act → Observe → Reflect ──
      const turnResult = await executeReActTurn(
        messages,
        tools,
        toolContext,
        inference,
        config,
        tier,
      );

      const turn: AgentTurn = {
        id: ulid(),
        timestamp: new Date().toISOString(),
        state: db.getAgentState(),
        input: currentInput?.content,
        inputSource: currentInput?.source as any,
        thinking: turnResult.thinking,
        toolCalls: turnResult.toolCalls,
        tokenUsage: turnResult.totalUsage,
        costCents: turnResult.totalCostCents,
      };

      // ── Persist Turn ──
      db.insertTurn(turn);
      for (const tc of turn.toolCalls) {
        db.insertToolCall(turn.id, tc);
      }
      onTurnComplete?.(turn);

      // Log the turn
      if (turn.thinking) {
        log(config, `[THOUGHT] ${turn.thinking.slice(0, 300)}`);
      }
      if (turnResult.steps > 1) {
        log(config, `[REACT] Turn completed in ${turnResult.steps} steps, ${turn.toolCalls.length} tool calls`);
      }

      // ── Check for sleep command ──
      const sleepTool = turn.toolCalls.find((tc) => tc.name === "sleep");
      if (sleepTool && !sleepTool.error) {
        log(config, "[SLEEP] Agent chose to sleep.");
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        running = false;
        break;
      }

      // ── If no tool calls across all steps, the agent is idle ──
      if (turn.toolCalls.length === 0 && turnResult.finalFinishReason === "stop") {
        log(config, "[IDLE] No pending inputs. Entering brief sleep.");
        db.setKV(
          "sleep_until",
          new Date(Date.now() + 60_000).toISOString(),
        );
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        running = false;
      }

      consecutiveErrors = 0;
    } catch (err: any) {
      consecutiveErrors++;
      log(config, `[ERROR] Turn failed: ${err.message}`);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log(
          config,
          `[FATAL] ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Sleeping.`,
        );
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        db.setKV(
          "sleep_until",
          new Date(Date.now() + 300_000).toISOString(),
        );
        running = false;
      }
    }
  }

  log(config, `[LOOP END] Agent loop finished. State: ${db.getAgentState()}`);
}

// ─── ReAct Inner Loop ─────────────────────────────────────────

interface ReActTurnResult {
  thinking: string;
  toolCalls: ToolCallResult[];
  totalUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  totalCostCents: number;
  steps: number;
  finalFinishReason: string;
}

/**
 * Execute a full ReAct turn: the model thinks, acts, observes results,
 * reflects, and may act again — up to MAX_STEPS_PER_TURN iterations.
 *
 * This is the core improvement: instead of one inference call per turn,
 * the model can chain multiple reasoning+action steps, observing results
 * between each step. This lets it course-correct, handle errors, and
 * complete multi-step tasks within a single turn.
 */
async function executeReActTurn(
  initialMessages: ChatMessage[],
  tools: AutomatonTool[],
  toolContext: ToolContext,
  inference: InferenceClient,
  config: AutomatonConfig,
  tier: string,
): Promise<ReActTurnResult> {
  const allToolCalls: ToolCallResult[] = [];
  const thinkingParts: string[] = [];
  const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let totalCostCents = 0;
  let totalToolCallCount = 0;
  let steps = 0;
  let lastFinishReason = "stop";

  // In low-compute/critical, limit steps to conserve credits
  const maxSteps = (tier === "low_compute" || tier === "critical")
    ? Math.min(3, MAX_STEPS_PER_TURN)
    : MAX_STEPS_PER_TURN;

  // Working message array — starts from initial context, accumulates
  // assistant responses and tool results as we go
  const messages = [...initialMessages];

  for (let step = 0; step < maxSteps; step++) {
    steps = step + 1;

    log(config, `[THINK] Step ${steps}/${maxSteps} — calling ${inference.getDefaultModel()}...`);

    const response = await inference.chat(messages, {
      tools: toolsToInferenceFormat(tools),
    });

    // Accumulate usage
    totalUsage.promptTokens += response.usage.promptTokens;
    totalUsage.completionTokens += response.usage.completionTokens;
    totalUsage.totalTokens += response.usage.totalTokens;
    const stepCost = estimateCostCents(response.usage, inference.getDefaultModel());
    totalCostCents += stepCost;
    lastFinishReason = response.finishReason;

    try {
      const { recordCost } = await import("../survival/metabolism.js");
      recordCost(toolContext.db, "inference", stepCost, `Inference step ${steps}: ${inference.getDefaultModel()}`);
    } catch {}

    // Capture thinking
    if (response.message.content) {
      thinkingParts.push(response.message.content);
    }

    // If no tool calls, the model is done reasoning — exit inner loop
    if (!response.toolCalls || response.toolCalls.length === 0) {
      log(config, `[THINK] Step ${steps}: no tool calls, reasoning complete`);
      break;
    }

    // Add the assistant message (with tool_calls) to conversation
    messages.push({
      role: "assistant",
      content: response.message.content || "",
      tool_calls: response.toolCalls,
    });

    // Execute each tool call
    for (const tc of response.toolCalls) {
      if (totalToolCallCount >= MAX_TOOL_CALLS_PER_TURN) {
        log(config, `[TOOLS] Max tool calls per turn reached (${MAX_TOOL_CALLS_PER_TURN})`);
        // Add a tool result indicating the limit was hit
        messages.push({
          role: "tool",
          content: `Tool call limit reached (${MAX_TOOL_CALLS_PER_TURN} calls). No more tool calls allowed this turn. Summarize what you've done and plan next steps.`,
          tool_call_id: tc.id,
        });
        break;
      }

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      log(config, `[TOOL] Step ${steps}: ${tc.function.name}(${JSON.stringify(args).slice(0, 100)})`);

      const result = await executeTool(
        tc.function.name,
        args,
        tools,
        toolContext,
      );

      result.id = tc.id;
      allToolCalls.push(result);
      totalToolCallCount++;

      log(
        config,
        `[TOOL RESULT] ${tc.function.name}: ${result.error ? `ERROR: ${result.error}` : result.result.slice(0, 200)}`,
      );

      // Add tool result to conversation so the model can observe it
      messages.push({
        role: "tool",
        content: result.error ? `Error: ${result.error}` : result.result,
        tool_call_id: tc.id,
      });

      // If sleep was called, stop executing more tools — exit immediately
      if (tc.function.name === "sleep" && !result.error) {
        return {
          thinking: thinkingParts.join("\n\n"),
          toolCalls: allToolCalls,
          totalUsage,
          totalCostCents,
          steps,
          finalFinishReason: lastFinishReason,
        };
      }
    }

    // If we hit the tool call limit, break out of the step loop too
    if (totalToolCallCount >= MAX_TOOL_CALLS_PER_TURN) {
      break;
    }
  }

  return {
    thinking: thinkingParts.join("\n\n"),
    toolCalls: allToolCalls,
    totalUsage,
    totalCostCents,
    steps,
    finalFinishReason: lastFinishReason,
  };
}

// ─── Context Summarization ────────────────────────────────────

/**
 * If the turn history is getting large, summarize older turns and
 * store the summary in KV so it can be injected into future prompts.
 * This prevents context from being silently dropped.
 */
async function maybeSummarizeOldTurns(
  db: AutomatonDatabase,
  inference: InferenceClient,
): Promise<void> {
  const turnCount = db.getTurnCount();
  if (turnCount < SUMMARY_THRESHOLD) return;

  const lastSummaryTurn = db.getKV("last_summary_at_turn");
  const lastSummaryTurnNum = lastSummaryTurn ? parseInt(lastSummaryTurn, 10) : 0;

  // Only re-summarize if we've accumulated enough new turns
  if (turnCount - lastSummaryTurnNum < SUMMARY_THRESHOLD) return;

  try {
    // Get turns that are older than what we keep in context (beyond the last 20)
    const allRecent = db.getRecentTurns(50);
    if (allRecent.length <= 20) return;

    const oldTurns = allRecent.slice(0, allRecent.length - 20);
    const summary = await summarizeTurns(oldTurns, inference);

    // Store the rolling summary
    const existingSummary = db.getKV("context_summary") || "";
    const combinedSummary = existingSummary
      ? `${existingSummary}\n\n--- Updated summary (turn ${turnCount}) ---\n${summary}`
      : summary;

    // Keep summary manageable — truncate if too long
    const maxSummaryLen = 3000;
    const finalSummary = combinedSummary.length > maxSummaryLen
      ? combinedSummary.slice(-maxSummaryLen)
      : combinedSummary;

    db.setKV("context_summary", finalSummary);
    db.setKV("last_summary_at_turn", turnCount.toString());
  } catch {
    // Summarization is best-effort — don't crash the loop
  }
}

// ─── Helpers ───────────────────────────────────────────────────

async function getFinancialState(
  conway: ConwayClient,
  address: string,
): Promise<FinancialState> {
  let creditsCents = 0;
  let usdcBalance = 0;

  try {
    creditsCents = await conway.getCreditsBalance();
  } catch {}

  try {
    usdcBalance = await getUsdcBalance(address as `0x${string}`);
  } catch {}

  return {
    creditsCents,
    usdcBalance,
    lastChecked: new Date().toISOString(),
  };
}

function estimateCostCents(
  usage: { promptTokens: number; completionTokens: number },
  model: string,
): number {
  // Rough cost estimation per million tokens
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 250, output: 1000 },
    "gpt-4o-mini": { input: 15, output: 60 },
    "gpt-4.1": { input: 200, output: 800 },
    "gpt-4.1-mini": { input: 40, output: 160 },
    "gpt-4.1-nano": { input: 10, output: 40 },
    "gpt-5.2": { input: 200, output: 800 },
    "o1": { input: 1500, output: 6000 },
    "o3-mini": { input: 110, output: 440 },
    "o4-mini": { input: 110, output: 440 },
    "claude-sonnet-4-5": { input: 300, output: 1500 },
    "claude-haiku-4-5": { input: 100, output: 500 },
  };

  const p = pricing[model] || pricing["gpt-4o"];
  const inputCost = (usage.promptTokens / 1_000_000) * p.input;
  const outputCost = (usage.completionTokens / 1_000_000) * p.output;
  return Math.ceil((inputCost + outputCost) * 1.3); // 1.3x Conway markup
}

function log(config: AutomatonConfig, message: string): void {
  if (config.logLevel === "debug" || config.logLevel === "info") {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
  }
}
