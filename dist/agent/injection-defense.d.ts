/**
 * Prompt Injection Defense
 *
 * All external input passes through this sanitization pipeline
 * before being included in any prompt. The automaton's survival
 * depends on not being manipulated.
 */
import type { SanitizedInput, SanitizationMode } from "../types.js";
/** Exposed for testing: reset rate limit state. */
export declare function _resetRateLimits(): void;
/**
 * Sanitize tool results from external sources. Strips prompt
 * boundaries and limits size.
 */
export declare function sanitizeToolResult(result: string, maxLength?: number): string;
/**
 * Sanitize external input before including it in a prompt.
 */
export declare function sanitizeInput(raw: string, source: string, mode?: SanitizationMode): SanitizedInput;
//# sourceMappingURL=injection-defense.d.ts.map