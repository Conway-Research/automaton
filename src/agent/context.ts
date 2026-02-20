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

const MAX_CONTEXT_TURNS = 20;
const SUMMARY_THRESHOLD = 15;

/** Maximum size for individual tool results in characters */
export const MAX_TOOL_RESULT_SIZE = 10_000;

// Re-export for external use
export type { TokenBudget };
export { DEFAULT_TOKEN_BUDGET };

/**
 * Estimate token count from text length.
 * Conservative estimate: ~4 characters per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
