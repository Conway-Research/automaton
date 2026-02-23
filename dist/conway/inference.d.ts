/**
 * Conway Inference Client
 *
 * Wraps Conway's /v1/chat/completions endpoint (OpenAI-compatible).
 * The automaton pays for its own thinking through Conway credits.
 */
import type { InferenceClient } from "../types.js";
interface InferenceClientOptions {
    apiUrl: string;
    apiKey: string;
    defaultModel: string;
    maxTokens: number;
    lowComputeModel?: string;
    openaiApiKey?: string;
    openaiApiBaseUrl?: string;
    anthropicApiKey?: string;
}
export declare function createInferenceClient(options: InferenceClientOptions): InferenceClient;
export {};
//# sourceMappingURL=inference.d.ts.map