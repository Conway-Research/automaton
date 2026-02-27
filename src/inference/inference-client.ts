import OpenAI from "openai";
import type { ChatMessage } from "../types.js";
import {
  ProviderRegistry,
  type ModelTier,
  type ModelConfig,
  type ResolvedModel,
} from "./provider-registry.js";

const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_DISABLE_MS = 5 * 60_000;

export interface UnifiedInferenceResult {
  content: string;
  toolCalls?: unknown[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: {
    inputCostCredits: number;
    outputCostCredits: number;
    totalCostCredits: number;
  };
  metadata: {
    providerId: string;
    modelId: string;
    tier: ModelTier;
    latencyMs: number;
    retries: number;
    failedProviders: string[];
  };
}

interface SharedChatParams {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  toolChoice?: "auto" | "none" | "required" | Record<string, unknown>;
  responseFormat?: { type: "json_object" | "text" };
  stream?: boolean;
}

interface UnifiedChatParams extends SharedChatParams {
  tier: ModelTier;
}

interface UnifiedChatDirectParams extends SharedChatParams {
  providerId: string;
  modelId: string;
}

interface CircuitBreakerState {
  failures: number;
  disabledUntil: number;
}

interface AttemptResult {
  result: UnifiedInferenceResult;
  retries: number;
}

class ProviderAttemptError extends Error {
  readonly providerId: string;
  readonly retries: number;
  readonly retryable: boolean;
  readonly originalError: unknown;

  constructor(params: {
    providerId: string;
    retries: number;
    retryable: boolean;
    originalError: unknown;
  }) {
    const message =
      params.originalError instanceof Error
        ? params.originalError.message
        : String(params.originalError);
    super(message);

    this.providerId = params.providerId;
    this.retries = params.retries;
    this.retryable = params.retryable;
    this.originalError = params.originalError;
  }
}

export class UnifiedInferenceClient {
  private readonly registry: ProviderRegistry;
  private readonly circuitBreaker = new Map<string, CircuitBreakerState>();

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  async chat(params: UnifiedChatParams): Promise<UnifiedInferenceResult> {
    const survivalMode = this.isSurvivalMode();
    const candidates = this.registry.resolveCandidates(params.tier, survivalMode);
    if (candidates.length === 0) {
      throw new Error(`No providers available for tier '${params.tier}'`);
    }

    const failedProviders: string[] = [];
    let totalRetries = 0;

    for (const resolved of candidates) {
      if (this.isProviderCircuitOpen(resolved.provider.id)) {
        failedProviders.push(resolved.provider.id);
        continue;
      }

      try {
        const attempt = await this.executeWithRetries(resolved, params, params.tier);
        this.markProviderSuccess(resolved.provider.id);

        return {
          ...attempt.result,
          metadata: {
            ...attempt.result.metadata,
            retries: totalRetries + attempt.retries,
            failedProviders,
          },
        };
      } catch (error) {
        if (!(error instanceof ProviderAttemptError)) {
          throw error;
        }

        totalRetries += error.retries;
        failedProviders.push(resolved.provider.id);
        this.markProviderFailure(resolved.provider.id);

        if (error.retryable) {
          continue;
        }

        throw this.unwrapError(error.originalError);
      }
    }

    throw new Error(
      `All providers failed for tier '${params.tier}'. Failed providers: ${failedProviders.join(", ")}`,
    );
  }

  async chatDirect(params: UnifiedChatDirectParams): Promise<UnifiedInferenceResult> {
    if (this.isProviderCircuitOpen(params.providerId)) {
      throw new Error(`Provider '${params.providerId}' circuit is open`);
    }

    const resolved = this.registry.getModel(params.providerId, params.modelId);

    try {
      const attempt = await this.executeWithRetries(resolved, params, resolved.model.tier);
      this.markProviderSuccess(params.providerId);

      return {
        ...attempt.result,
        metadata: {
          ...attempt.result.metadata,
          retries: attempt.retries,
          failedProviders: [],
        },
      };
    } catch (error) {
      if (!(error instanceof ProviderAttemptError)) {
        throw error;
      }

      this.markProviderFailure(params.providerId);
      throw this.unwrapError(error.originalError);
    }
  }

  private async executeWithRetries(
    resolved: ResolvedModel,
    params: SharedChatParams,
    requestedTier: ModelTier,
  ): Promise<AttemptResult> {
    let retries = 0;

    while (true) {
      try {
        const result = await this.executeSingleRequest(
          resolved.client,
          resolved.provider.id,
          resolved.model,
          requestedTier,
          params,
        );
        return { result, retries };
      } catch (error) {
        const retryable = this.isRetryableError(error);
        if (!retryable) {
          throw new ProviderAttemptError({
            providerId: resolved.provider.id,
            retries,
            retryable: false,
            originalError: error,
          });
        }

        if (retries >= RETRY_BACKOFF_MS.length) {
          throw new ProviderAttemptError({
            providerId: resolved.provider.id,
            retries,
            retryable: true,
            originalError: error,
          });
        }

        const delayMs = RETRY_BACKOFF_MS[retries];
        retries += 1;
        await sleep(delayMs);
      }
    }
  }

  private async executeSingleRequest(
    client: OpenAI,
    providerId: string,
    model: ModelConfig,
    requestedTier: ModelTier,
    params: SharedChatParams,
  ): Promise<UnifiedInferenceResult> {
    const startedAt = Date.now();
    const payload = this.buildChatCompletionRequest(model.id, params);
    if (params.stream) {
      const stream = await client.chat.completions.create({
        ...payload,
        stream: true,
      } as any);
      const streamed = await this.consumeStreamResponse(stream as any);
      return this.buildUnifiedResult({
        providerId,
        model,
        requestedTier,
        latencyMs: Date.now() - startedAt,
        content: streamed.content,
        toolCalls: streamed.toolCalls,
        usage: streamed.usage,
      });
    }

    const completion = await client.chat.completions.create({
      ...payload,
      stream: false,
    } as any);

    const choice = (completion as any).choices?.[0];
    if (!choice?.message) {
      throw new Error(`No completion choice returned from provider '${providerId}'`);
    }

    return this.buildUnifiedResult({
      providerId,
      model,
      requestedTier,
      latencyMs: Date.now() - startedAt,
      content: extractText(choice.message.content),
      toolCalls: normalizeToolCalls(choice.message.tool_calls),
      usage: {
        inputTokens: (completion as any).usage?.prompt_tokens ?? 0,
        outputTokens: (completion as any).usage?.completion_tokens ?? 0,
        totalTokens: (completion as any).usage?.total_tokens ?? 0,
      },
    });
  }

  private buildChatCompletionRequest(modelId: string, params: SharedChatParams): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: modelId,
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.name ? { name: message.name } : {}),
        ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
      })),
    };

    if (params.temperature !== undefined) {
      payload.temperature = params.temperature;
    }

    if (params.maxTokens !== undefined) {
      payload.max_tokens = params.maxTokens;
    }

    if (params.tools && params.tools.length > 0) {
      payload.tools = params.tools;
    }

    if (params.toolChoice !== undefined) {
      payload.tool_choice = params.toolChoice;
    }

    if (params.responseFormat !== undefined) {
      payload.response_format = params.responseFormat;
    }

    return payload;
  }

  private async consumeStreamResponse(stream: AsyncIterable<any>): Promise<{
    content: string;
    toolCalls?: unknown[];
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  }> {
    let content = "";
    let usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    const toolCallsByIndex = new Map<number, any>();

    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta;

      if (typeof delta?.content === "string") {
        content += delta.content;
      }

      if (Array.isArray(delta?.tool_calls)) {
        for (const rawCall of delta.tool_calls) {
          const index = typeof rawCall?.index === "number" ? rawCall.index : toolCallsByIndex.size;
          const existing = toolCallsByIndex.get(index) ?? {
            id: rawCall?.id ?? `tool-${index}`,
            type: "function",
            function: { name: "", arguments: "" },
          };

          if (typeof rawCall?.id === "string") {
            existing.id = rawCall.id;
          }
          if (typeof rawCall?.type === "string") {
            existing.type = rawCall.type;
          }
          if (typeof rawCall?.function?.name === "string") {
            existing.function.name = `${existing.function.name || ""}${rawCall.function.name}`;
          }
          if (typeof rawCall?.function?.arguments === "string") {
            existing.function.arguments = `${existing.function.arguments || ""}${rawCall.function.arguments}`;
          }

          toolCallsByIndex.set(index, existing);
        }
      }

      if (chunk?.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? usage.inputTokens,
          outputTokens: chunk.usage.completion_tokens ?? usage.outputTokens,
          totalTokens: chunk.usage.total_tokens ?? usage.totalTokens,
        };
      }
    }

    return {
      content,
      toolCalls: normalizeToolCalls(Array.from(toolCallsByIndex.values())),
      usage,
    };
  }

  private buildUnifiedResult(params: {
    providerId: string;
    model: ModelConfig;
    requestedTier: ModelTier;
    latencyMs: number;
    content: string;
    toolCalls?: unknown[];
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  }): UnifiedInferenceResult {
    const inputCostCredits = (params.usage.inputTokens / 1000) * params.model.costPerInputToken;
    const outputCostCredits = (params.usage.outputTokens / 1000) * params.model.costPerOutputToken;
    const totalCostCredits = inputCostCredits + outputCostCredits;

    return {
      content: params.content,
      toolCalls: params.toolCalls,
      usage: params.usage,
      cost: {
        inputCostCredits,
        outputCostCredits,
        totalCostCredits,
      },
      metadata: {
        providerId: params.providerId,
        modelId: params.model.id,
        tier: params.requestedTier,
        latencyMs: params.latencyMs,
        retries: 0,
        failedProviders: [],
      },
    };
  }

  private isRetryableError(error: unknown): boolean {
    const status = getStatusCode(error);
    return status !== undefined && RETRYABLE_STATUS_CODES.has(status);
  }

  private isProviderCircuitOpen(providerId: string): boolean {
    const state = this.circuitBreaker.get(providerId);
    if (!state) {
      return false;
    }

    if (state.disabledUntil > Date.now()) {
      return true;
    }

    if (state.disabledUntil > 0) {
      this.circuitBreaker.set(providerId, {
        failures: 0,
        disabledUntil: 0,
      });
      this.registry.enableProvider(providerId);
    }

    return false;
  }

  private markProviderFailure(providerId: string): void {
    const state = this.circuitBreaker.get(providerId) ?? {
      failures: 0,
      disabledUntil: 0,
    };

    state.failures += 1;

    if (state.failures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      state.disabledUntil = Date.now() + CIRCUIT_BREAKER_DISABLE_MS;
      this.registry.disableProvider(
        providerId,
        "circuit-breaker: too many consecutive inference failures",
        CIRCUIT_BREAKER_DISABLE_MS,
      );
    }

    this.circuitBreaker.set(providerId, state);
  }

  private markProviderSuccess(providerId: string): void {
    this.circuitBreaker.set(providerId, {
      failures: 0,
      disabledUntil: 0,
    });
    this.registry.enableProvider(providerId);
  }

  private unwrapError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }

  private isSurvivalMode(): boolean {
    const rawCredits = process.env.AUTOMATON_CREDITS_BALANCE;
    if (!rawCredits) {
      return false;
    }

    const credits = Number(rawCredits);
    return Number.isFinite(credits) && credits >= 100 && credits < 1000;
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          (part as { type?: unknown }).type === "text" &&
          "text" in part
        ) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }

        return "";
      })
      .join("");
  }

  return "";
}

function normalizeToolCalls(toolCalls: unknown): unknown[] | undefined {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls;
}

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
    cause?: { status?: unknown };
    message?: unknown;
  };

  if (typeof candidate.status === "number") {
    return candidate.status;
  }

  if (typeof candidate.response?.status === "number") {
    return candidate.response.status;
  }

  if (typeof candidate.cause?.status === "number") {
    return candidate.cause.status;
  }

  if (typeof candidate.message === "string") {
    const match = candidate.message.match(/\b(429|500|503)\b/);
    if (match) {
      return Number(match[1]);
    }
  }

  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
