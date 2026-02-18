/**
 * Conway Inference Client
 *
 * Wraps Conway's /v1/chat/completions endpoint (OpenAI-compatible).
 * The automaton pays for its own thinking through Conway credits.
 */

import type {
  InferenceClient,
  ChatMessage,
  InferenceOptions,
  InferenceResponse,
  InferenceToolCall,
  TokenUsage,
  InferenceToolDefinition,
} from "../types.js";
import type { PrivateKeyAccount } from "viem";

interface InferenceClientOptions {
  apiUrl: string;
  apiKey: string;
  defaultModel: string;
  maxTokens: number;
  lowComputeModel?: string;
  account?: PrivateKeyAccount;
}

export function createInferenceClient(
  options: InferenceClientOptions,
): InferenceClient {
  const { apiUrl, apiKey } = options;
  let currentModel = options.defaultModel;
  let maxTokens = options.maxTokens;

  const chat = async (
    messages: ChatMessage[],
    opts?: InferenceOptions,
  ): Promise<InferenceResponse> => {
    const model = opts?.model || currentModel;
    const tools = opts?.tools;

    // Newer models (o-series, gpt-5.x, gpt-4.1) require max_completion_tokens
    const usesCompletionTokens = /^(o[1-9]|gpt-5|gpt-4\.1)/.test(model);
    const tokenLimit = opts?.maxTokens || maxTokens;

    const body: Record<string, unknown> = {
      model,
      messages: messages.map(formatMessage),
      stream: false,
    };

    if (usesCompletionTokens) {
      body.max_completion_tokens = tokenLimit;
    } else {
      body.max_tokens = tokenLimit;
    }

    if (opts?.temperature !== undefined) {
      body.temperature = opts.temperature;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const resp = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
    });

    // Handle x402 payment if Conway requires it
    if (resp.status === 402 && options.account) {
      const { x402Fetch } = await import("./x402.js");
      const result = await x402Fetch(
        `${apiUrl}/v1/chat/completions`,
        options.account,
        "POST",
        JSON.stringify(body),
        {
          Authorization: apiKey,
        },
      );
      if (!result.success) {
        throw new Error(`Inference x402 payment failed: ${result.error}`);
      }
      const paidData = result.response;
      const paidChoice = paidData?.choices?.[0];
      if (!paidChoice) {
        throw new Error("No completion choice returned after x402 payment");
      }
      const paidMessage = paidChoice.message;
      const paidUsage: TokenUsage = {
        promptTokens: paidData.usage?.prompt_tokens || 0,
        completionTokens: paidData.usage?.completion_tokens || 0,
        totalTokens: paidData.usage?.total_tokens || 0,
      };
      const paidToolCalls: InferenceToolCall[] | undefined =
        paidMessage.tool_calls?.map((tc: any) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      return {
        id: paidData.id || "",
        model: paidData.model || model,
        message: {
          role: paidMessage.role,
          content: paidMessage.content || "",
          tool_calls: paidToolCalls,
        },
        toolCalls: paidToolCalls,
        usage: paidUsage,
        finishReason: paidChoice.finish_reason || "stop",
      };
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `Inference error: ${resp.status}: ${text}`,
      );
    }

    const data = await resp.json() as any;
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error("No completion choice returned from inference");
    }

    const message = choice.message;
    const usage: TokenUsage = {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    };

    const toolCalls: InferenceToolCall[] | undefined =
      message.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

    return {
      id: data.id || "",
      model: data.model || model,
      message: {
        role: message.role,
        content: message.content || "",
        tool_calls: toolCalls,
      },
      toolCalls,
      usage,
      finishReason: choice.finish_reason || "stop",
    };
  };

  const setLowComputeMode = (enabled: boolean): void => {
    if (enabled) {
      currentModel = options.lowComputeModel || "gpt-4.1";
      maxTokens = 4096;
    } else {
      currentModel = options.defaultModel;
      maxTokens = options.maxTokens;
    }
  };

  const getDefaultModel = (): string => {
    return currentModel;
  };

  return {
    chat,
    setLowComputeMode,
    getDefaultModel,
  };
}

function formatMessage(
  msg: ChatMessage,
): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    role: msg.role,
    content: msg.content,
  };

  if (msg.name) formatted.name = msg.name;
  if (msg.tool_calls) formatted.tool_calls = msg.tool_calls;
  if (msg.tool_call_id) formatted.tool_call_id = msg.tool_call_id;

  return formatted;
}
