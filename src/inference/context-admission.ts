/** Conservative byte-token accounting avoids a heuristic accepting a prompt
 * that cannot fit. Includes tools and message framing; provider-specific hidden
 * framing remains the adapter's responsibility. No content is silently dropped.
 * Byte accounting deliberately overestimates English BPE and works without an
 * expensive tokenizer pass over untrusted/repetitive input. */
export function contextInputUpperBound(messages: unknown[], tools?: unknown[]): number {
  const serialized = JSON.stringify({ messages, tools: tools ?? [] });
  return Buffer.byteLength(serialized, "utf8") + 256 + messages.length * 32;
}

export function fitsModelContext(messages: unknown[], tools: unknown[] | undefined,
  contextWindow: number, outputTokens: number): boolean {
  return contextInputUpperBound(messages, tools) + outputTokens <= contextWindow;
}

/** Documented provider ceilings override stale, overly generous registry data.
 * Smaller configured limits remain binding. Verified 2026-09-30:
 * developers.openai.com/api/docs/models/gpt-5-mini and /gpt-5.2.
 * Does not change model selection, pricing or monetary reservation policy. */
export function effectiveContextWindow(modelId: string, configured: number): number {
  const documented = /^(gpt-5-mini(?:-2025-08-07)?|gpt-5\.2(?:-2025-12-11)?)$/.test(modelId)
    ? 400_000 : configured;
  return Math.min(configured, documented);
}
