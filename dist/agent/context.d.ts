/**
 * Context Window Management
 *
 * Manages the conversation history for the agent loop.
 * Handles summarization to keep within token limits.
 * Enforces token budget to prevent context window overflow.
 */
import type { ChatMessage, AgentTurn, InferenceClient, TokenBudget, MemoryRetrievalResult } from "../types.js";
import { DEFAULT_TOKEN_BUDGET } from "../types.js";
/** Maximum size for individual tool results in characters */
export declare const MAX_TOOL_RESULT_SIZE = 10000;
export type { TokenBudget };
export { DEFAULT_TOKEN_BUDGET };
/**
 * Estimate token count from text length.
 * Conservative estimate: ~4 characters per token for English text.
 */
export declare function estimateTokens(text: string): number;
/**
 * Truncate a tool result to fit within the size limit.
 * Appends a truncation notice if content was trimmed.
 */
export declare function truncateToolResult(result: string, maxSize?: number): string;
/**
 * Build the message array for the next inference call.
 * Includes system prompt + recent conversation history.
 * Applies token budget enforcement and tool result truncation.
 */
export declare function buildContextMessages(systemPrompt: string, recentTurns: AgentTurn[], pendingInput?: {
    content: string;
    source: string;
}, options?: {
    budget?: TokenBudget;
    inference?: InferenceClient;
}): ChatMessage[];
/**
 * Trim context to fit within limits.
 * Keeps the system prompt and most recent turns.
 */
export declare function trimContext(turns: AgentTurn[], maxTurns?: number): AgentTurn[];
/**
 * Format a MemoryRetrievalResult into a text block for context injection.
 * Included as a system message between the system prompt and conversation history.
 */
export declare function formatMemoryBlock(memories: MemoryRetrievalResult): string;
/**
 * Summarize old turns into a compact context entry.
 * Used when context grows too large.
 */
export declare function summarizeTurns(turns: AgentTurn[], inference: InferenceClient): Promise<string>;
//# sourceMappingURL=context.d.ts.map