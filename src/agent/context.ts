/**
 * Context Window Management
 *
 * Manages the conversation history for the agent loop.
 * Handles summarization to keep within token limits.
 * Enforces token budget to prevent context window overflow.
 */

import type {
  ChatMessage,
  AgentTurn,
  AutomatonDatabase,
  InferenceClient,
  TokenBudget,
  MemoryRetrievalResult,
} from "../types.js";
import { DEFAULT_TOKEN_BUDGET } from "../types.js";
import { getEncoding, type Tiktoken } from "js-tiktoken";

const MAX_CONTEXT_TURNS = 20;
const SUMMARY_THRESHOLD = 15;

/** Maximum size for individual tool results in characters */
export const MAX_TOOL_RESULT_SIZE = 10_000;

// Re-export for external use
export type { TokenBudget };
export { DEFAULT_TOKEN_BUDGET };

let encoder: Tiktoken | null | undefined;

function getEncoder(): Tiktoken | null {
  if (encoder === undefined) {
    try {
      encoder = getEncoding("cl100k_base");
    } catch {
      encoder = null;
    }
  }
  return encoder;
}

/**
 * Estimate token count (cl100k_base) for context budgeting. Intended to be an upper-bound-ish
 * estimate in bounded time; see the notes on `estimateLargeTextTokens` for what is and is not
 * guaranteed. Never returns less than `ceil(length / 4)`.
 */
export function estimateTokens(text: string): number {
  const content = text ?? "";
  const legacyEstimate = Math.ceil(content.length / 4);
  try {
    const enc = getEncoder();
    if (!enc) return Math.max(utf8Bytes(content, 0, content.length), legacyEstimate);
    const tokens = content.length <= EXACT_TOKENIZE_MAX_CHARS
      ? encodeCount(enc, content)
      : estimateLargeTextTokens(content, enc);
    if (Number.isFinite(tokens) && tokens > 0) {
      // Keep a conservative floor to avoid under-budgeting context.
      return Math.max(tokens, legacyEstimate);
    }
  } catch {
    // Fall through to the conservative character heuristic.
  }
  return legacyEstimate;
}

/**
 * Inputs up to this length are tokenized exactly. js-tiktoken's BPE is roughly quadratic in the
 * length of a single unbroken piece (16k chars of "x" ~11s; unbroken CJK ~0.4s per 1k chars), so
 * larger inputs use the budgeted path below. Worst case for this exact path is ~0.4s per call.
 */
export const EXACT_TOKENIZE_MAX_CHARS = 1_000;

// ── Budgeted mask-and-encode parameters (exported so tests can assert the work bounds) ──
/** Words up to this many chars are tokenized exactly (ASCII / any non-ASCII). Longer ones are charged bytes. */
export const MASK_ASCII_WORD_MAX = 24;
export const MASK_NON_ASCII_WORD_MAX = 8;
/** Whitespace runs up to this length are tokenized exactly (cost grows quickly beyond ~128). */
export const MASK_WS_RUN_MAX = 128;
/**
 * Hard cap on characters handed to the tokenizer in total. Content that is slow per character
 * (non-ASCII words, whitespace runs longer than MASK_SLOW_WS_RUN) counts 4x toward the budget.
 */
export const MASK_WORK_BUDGET = 96_000;
const MASK_SLOW_WS_RUN = 16;
/** Chunks are cut at whitespace-run boundaries once they reach this size. */
export const MASK_CHUNK_CHARS = 4_096;
/** No single tokenizer call receives more than this many chars. */
export const MAX_ENCODE_CHUNK_CHARS = MASK_CHUNK_CHARS + MASK_WS_RUN_MAX + MASK_ASCII_WORD_MAX;
const SLOW_BUDGET_WEIGHT = 4;

const isAsciiSpace = (c: number): boolean => c === 32 || (c >= 9 && c <= 13);

/** UTF-8 byte length of s[from, to) (lone surrogates are encoded as U+FFFD, 3 bytes). */
function utf8Bytes(s: string, from: number, to: number): number {
  let bytes = 0;
  for (let i = from; i < to; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < to && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** Tokenize treating special-token strings (e.g. "<|endoftext|>") as ordinary text. */
function encodeCount(enc: Tiktoken, text: string): number {
  try {
    return enc.encode(text, [], []).length;
  } catch {
    return utf8Bytes(text, 0, text.length); // bytes >= tokens for a byte-level BPE
  }
}

/**
 * Budgeted mask-and-encode for inputs longer than EXACT_TOKENIZE_MAX_CHARS.
 *
 * One linear pass splits the text into whitespace runs and words. Whitespace runs up to
 * MASK_WS_RUN_MAX chars and short words are copied unchanged into a "masked" string that is
 * tokenized exactly, in chunks, within MASK_WORK_BUDGET chars in total. Everything else (long
 * words, long whitespace runs, and all content once the budget is spent) is not tokenized: it is
 * charged its UTF-8 byte length, and (until the budget is spent) a one-char placeholder "#" stands
 * in for a long word so the surrounding whitespace is still tokenized in place.
 *
 * What this relies on / guarantees (design argument plus experiments, not a proof):
 *  - Charged segments: a byte-level BPE (cl100k_base) never yields more tokens than bytes, so
 *    byte-length charging cannot undercount those segments *for this tokenizer*.
 *  - Encoded segments are counted by the real tokenizer. The regex pre-tokenizer does not join
 *    pieces across whitespace, so short words/whitespace tokenize the same in the masked string
 *    as in the original, except at chunk cuts and around placeholders; each chunk adds +1 slack
 *    and a placeholder adds >= 1 token. That slack was validated empirically (cuts changed totals
 *    by <= 1 token) but is not formally proven.
 *  - Not guaranteed: other tokenizers (the provider's real one differs from cl100k_base), and
 *    exactness for ordinary text beyond the budget (it is then charged ~1 token per char, so very
 *    large inputs are heavily overestimated by design).
 *  - Work: at most MASK_WORK_BUDGET chars are tokenized, in calls of at most
 *    MAX_ENCODE_CHUNK_CHARS chars; the scan itself is O(n).
 */
function estimateLargeTextTokens(content: string, enc: Tiktoken): number {
  const n = content.length;
  let charged = 0; // tokens charged without tokenizing (UTF-8 bytes)
  let tokens = 0;
  let used = 0; // budget consumed (masked chars, non-ASCII words weighted)
  let exhausted = false;
  let chunk = "";

  const flush = () => {
    if (chunk) {
      tokens += encodeCount(enc, chunk) + 1; // +1: slack for the cut between chunks
      chunk = "";
    }
  };

  let i = 0;
  while (i < n) {
    const start = i;
    const space = isAsciiSpace(content.charCodeAt(i));
    let ascii = true;
    while (i < n && isAsciiSpace(content.charCodeAt(i)) === space) {
      if (content.charCodeAt(i) > 127) ascii = false;
      i++;
    }
    const len = i - start;

    if (space) {
      // Cut only before a whitespace run, never inside a word.
      if (chunk.length >= MASK_CHUNK_CHARS) flush();
      const wsCost = len > MASK_SLOW_WS_RUN ? len * SLOW_BUDGET_WEIGHT : len;
      if (!exhausted && len <= MASK_WS_RUN_MAX && used + wsCost <= MASK_WORK_BUDGET) {
        chunk += content.slice(start, i);
        used += wsCost;
      } else if (!exhausted && used + 1 <= MASK_WORK_BUDGET) {
        charged += len; // oversized whitespace run
        chunk += "\n";
        used += 1;
      } else {
        exhausted = true;
        charged += len;
      }
      continue;
    }

    const eligible = len <= (ascii ? MASK_ASCII_WORD_MAX : MASK_NON_ASCII_WORD_MAX);
    const cost = ascii ? len : len * SLOW_BUDGET_WEIGHT;
    if (!exhausted && eligible && used + cost <= MASK_WORK_BUDGET) {
      chunk += content.slice(start, i);
      used += cost;
    } else if (!exhausted && !eligible && used + 1 <= MASK_WORK_BUDGET) {
      charged += utf8Bytes(content, start, i);
      chunk += "#";
      used += 1;
    } else {
      exhausted = true;
      charged += utf8Bytes(content, start, i);
    }
  }
  flush();
  return tokens + charged;
}

/**
 * Truncate a tool result to fit within the size limit.
 * Appends a truncation notice if content was trimmed.
 */
export function truncateToolResult(result: string, maxSize: number = MAX_TOOL_RESULT_SIZE): string {
  if (result.length <= maxSize) return result;
  return result.slice(0, maxSize) +
    `\n\n[TRUNCATED: ${result.length - maxSize} characters omitted]`;
}

/**
 * Estimate total tokens for a single turn (input + thinking + tool calls/results).
 */
function estimateTurnTokens(turn: AgentTurn): number {
  let total = 0;
  if (turn.input) {
    total += estimateTokens(turn.input);
  }
  if (turn.thinking) {
    total += estimateTokens(turn.thinking);
  }
  for (const tc of turn.toolCalls) {
    total += estimateTokens(JSON.stringify(tc.arguments));
    total += estimateTokens(tc.error ? `Error: ${tc.error}` : tc.result);
  }
  return total;
}

/**
 * Build the message array for the next inference call.
 * Includes system prompt + recent conversation history.
 * Applies token budget enforcement and tool result truncation.
 */
export function buildContextMessages(
  systemPrompt: string,
  recentTurns: AgentTurn[],
  pendingInput?: { content: string; source: string },
  options?: {
    budget?: TokenBudget;
    inference?: InferenceClient;
  },
): ChatMessage[] {
  const budget = options?.budget ?? DEFAULT_TOKEN_BUDGET;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Calculate token estimates for all turns
  const turnTokens = recentTurns.map((turn) => ({
    turn,
    tokens: estimateTurnTokens(turn),
  }));

  const totalTurnTokens = turnTokens.reduce((sum, t) => sum + t.tokens, 0);

  let turnsToRender: AgentTurn[];
  let summaryMessage: string | null = null;

  if (totalTurnTokens > budget.recentTurns && recentTurns.length > 1) {
    // Split turns into old (to summarize) and recent (to keep)
    let recentTokens = 0;
    let splitIndex = recentTurns.length;

    // Walk backwards from the most recent turn to find the split point
    for (let i = turnTokens.length - 1; i >= 0; i--) {
      if (recentTokens + turnTokens[i].tokens > budget.recentTurns) {
        splitIndex = i + 1;
        break;
      }
      recentTokens += turnTokens[i].tokens;
      if (i === 0) splitIndex = 0;
    }

    // Ensure we always summarize at least something
    if (splitIndex === 0) splitIndex = 1;
    if (splitIndex >= recentTurns.length) splitIndex = Math.max(1, recentTurns.length - 1);

    const oldTurns = recentTurns.slice(0, splitIndex);
    turnsToRender = recentTurns.slice(splitIndex);

    // Build a synchronous summary of old turns
    // (async summarizeTurns is used separately when inference is available)
    const oldSummaries = oldTurns.map((t) => {
      const tools = t.toolCalls
        .map((tc) => `${tc.name}(${tc.error ? "FAILED" : "ok"})`)
        .join(", ");
      return `[${t.timestamp}] ${t.inputSource || "self"}: ${t.thinking.slice(0, 100)}${tools ? ` | tools: ${tools}` : ""}`;
    });
    summaryMessage = `Previous context summary (${oldTurns.length} turns compressed):\n${oldSummaries.join("\n")}`;
  } else {
    turnsToRender = recentTurns;
  }

  // Add summary of old turns if budget was exceeded
  if (summaryMessage) {
    messages.push({
      role: "user",
      content: `[system] ${summaryMessage}`,
    });
  }

  // Add recent turns as conversation history
  for (const turn of turnsToRender) {
    // The turn's input (if any) as a user message
    if (turn.input) {
      messages.push({
        role: "user",
        content: `[${turn.inputSource || "system"}] ${turn.input}`,
      });
    }

    // The agent's thinking as assistant message
    if (turn.thinking) {
      const msg: ChatMessage = {
        role: "assistant",
        content: turn.thinking,
      };

      // If there were tool calls, include them
      if (turn.toolCalls.length > 0) {
        msg.tool_calls = turn.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }
      messages.push(msg);

      // Add tool results with truncation
      for (const tc of turn.toolCalls) {
        const rawContent = tc.error
          ? `Error: ${tc.error}`
          : tc.result;
        messages.push({
          role: "tool",
          content: truncateToolResult(rawContent),
          tool_call_id: tc.id,
        });
      }
    }
  }

  // ── Anti-Repetition Warning ──
  // Analyze the last 5 turns for repeated tool usage
  const analysisWindow = recentTurns.slice(-5);
  if (analysisWindow.length >= 3) {
    const toolFrequency: Record<string, number> = {};
    for (const turn of analysisWindow) {
      for (const tc of turn.toolCalls) {
        toolFrequency[tc.name] = (toolFrequency[tc.name] || 0) + 1;
      }
    }
    const repeatedTools = Object.entries(toolFrequency)
      .filter(([, count]) => count >= 3)
      .map(([name]) => name);
    if (repeatedTools.length > 0) {
      messages.push({
        role: "user",
        content:
          `[system] WARNING: You have been calling ${repeatedTools.join(", ")} repeatedly in recent turns. ` +
          `You already have this information. Move on to BUILDING something. ` +
          `Write code, create files, set up a service. Do not check status again.`,
      });
    }
  }

  // Add pending input if any
  if (pendingInput) {
    messages.push({
      role: "user",
      content: `[${pendingInput.source}] ${pendingInput.content}`,
    });
  }

  return messages;
}

/**
 * Trim context to fit within limits.
 * Keeps the system prompt and most recent turns.
 */
export function trimContext(
  turns: AgentTurn[],
  maxTurns: number = MAX_CONTEXT_TURNS,
): AgentTurn[] {
  if (turns.length <= maxTurns) {
    return turns;
  }

  // Keep the most recent turns
  return turns.slice(-maxTurns);
}

// === Phase 2.2: Memory Block Formatting ===

/**
 * Format a MemoryRetrievalResult into a text block for context injection.
 * Included as a system message between the system prompt and conversation history.
 */
export function formatMemoryBlock(memories: MemoryRetrievalResult): string {
  const sections: string[] = [];

  if (memories.workingMemory.length > 0) {
    sections.push("### Working Memory");
    for (const e of memories.workingMemory) {
      sections.push(`- [${e.contentType}] (p=${e.priority.toFixed(1)}) ${e.content}`);
    }
  }

  if (memories.episodicMemory.length > 0) {
    sections.push("### Recent History");
    for (const e of memories.episodicMemory) {
      sections.push(`- [${e.eventType}] ${e.summary} (${e.outcome || "neutral"})`);
    }
  }

  if (memories.semanticMemory.length > 0) {
    sections.push("### Known Facts");
    for (const e of memories.semanticMemory) {
      sections.push(`- [${e.category}/${e.key}] ${e.value}`);
    }
  }

  if (memories.proceduralMemory.length > 0) {
    sections.push("### Known Procedures");
    for (const e of memories.proceduralMemory) {
      sections.push(`- ${e.name}: ${e.description} (${e.steps.length} steps, ${e.successCount}/${e.successCount + e.failureCount} success)`);
    }
  }

  if (memories.relationships.length > 0) {
    sections.push("### Known Entities");
    for (const e of memories.relationships) {
      sections.push(`- ${e.entityName || e.entityAddress}: ${e.relationshipType} (trust: ${e.trustScore.toFixed(1)})`);
    }
  }

  if (sections.length === 0) return "";

  return `## Memory (${memories.totalTokens} tokens)\n\n${sections.join("\n")}`;
}

/**
 * Summarize old turns into a compact context entry.
 * Used when context grows too large.
 */
export async function summarizeTurns(
  turns: AgentTurn[],
  inference: InferenceClient,
): Promise<string> {
  if (turns.length === 0) return "No previous activity.";

  const turnSummaries = turns.map((t) => {
    const tools = t.toolCalls
      .map((tc) => `${tc.name}(${tc.error ? "FAILED" : "ok"})`)
      .join(", ");
    return `[${t.timestamp}] ${t.inputSource || "self"}: ${t.thinking.slice(0, 100)}${tools ? ` | tools: ${tools}` : ""}`;
  });

  // If few enough turns, just return the summaries directly
  if (turns.length <= 5) {
    return `Previous activity summary:\n${turnSummaries.join("\n")}`;
  }

  // For many turns, use inference to create a summary
  try {
    const response = await inference.chat([
      {
        role: "system",
        content:
          "Summarize the following agent activity log into a concise paragraph. Focus on: what was accomplished, what failed, current goals, and important context for the next turn.",
      },
      {
        role: "user",
        content: turnSummaries.join("\n"),
      },
    ], {
      maxTokens: 500,
      temperature: 0,
    });

    return `Previous activity summary:\n${response.message.content}`;
  } catch {
    // Fallback: just use the raw summaries
    return `Previous activity summary:\n${turnSummaries.slice(-5).join("\n")}`;
  }
}
