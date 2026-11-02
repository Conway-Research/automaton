import { ulid } from "ulid";
import type { UnifiedInferenceClient } from "../inference/inference-client.js";
import type { InferenceRouter } from "../inference/router.js";
import type { InferenceToolCall } from "../types.js";
import type { WorkerInferenceClient } from "./harness-types.js";
import { InferenceAdmissionError,InferenceExecutionUncertainError } from "./harness-types.js";

export function createWorkerInferenceBridge(
  router: InferenceRouter,
  inference: Pick<UnifiedInferenceClient, "chatDirect">,
  sessionId: string,
): WorkerInferenceClient {
  return {
    chat: async (params) => {
      const responseFormat = normalizeResponseFormat(params.responseFormat);
      const toolChoice = normalizeToolChoice(params.toolChoice);

      let providerAttempted=false;
      const result = await router.route(
        {
          messages: params.messages,
          taskType: "agent_turn",
          tier: params.survivalTier ?? "low_compute",
          sessionId,
          turnId: ulid(),
          experimentId: params.experimentId,
          costAttribution: params.costAttribution,
          maxTokens: params.maxTokens,
          tools: params.tools,
          toolChoice,
          temperature: params.temperature,
          responseFormat,
        },
        async (messages, options) => {
          providerAttempted=true;
          const direct = await inference.chatDirect({
            providerId: options.providerId,
            modelId: options.model,
            messages,
            tools: options.tools,
            toolChoice: options.toolChoice,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
            responseFormat: options.responseFormat,
            signal: options.signal,
            singleAttempt: true,
          });

          return {
            message: { content: direct.content },
            toolCalls: direct.toolCalls,
            usage: {
              promptTokens: direct.usage.inputTokens,
              completionTokens: direct.usage.outputTokens,
              cachedPromptTokens: direct.usage.cachedInputTokens,
            },
            finishReason: "stop",
          };
        },
      ).catch(error=>{
        if(providerAttempted)throw new InferenceExecutionUncertainError(error instanceof Error?error.message:'Provider execution uncertain');
        // Malformed persisted policy and other pre-provider failures are also
        // admission failures, never permission for a planner fallback.
        throw new InferenceAdmissionError(error instanceof Error?error.message:'Inference admission failed');
      });

      if (result.finishReason === "budget_exceeded") {
        throw new InferenceAdmissionError(result.content || "Inference admission denied");
      }
      if (["timeout", "error"].includes(result.finishReason)) {
        if(providerAttempted)throw new InferenceExecutionUncertainError(result.content || 'Provider execution uncertain');
        // A denied call is not a successful textual task result.
        throw new Error(result.content || `Inference failed: ${result.finishReason}`);
      }

      return {
        content: result.content,
        toolCalls: result.toolCalls as InferenceToolCall[] | undefined,
      };
    },
  };
}

function normalizeResponseFormat(
  responseFormat: { type: string } | undefined,
): { type: "json_object" | "text" } | undefined {
  if (!responseFormat) {
    return undefined;
  }

  return responseFormat.type === "json_object"
    ? { type: "json_object" }
    : { type: "text" };
}

function normalizeToolChoice(
  toolChoice: string | undefined,
): "auto" | "none" | "required" | undefined {
  return toolChoice === "auto" ||
    toolChoice === "none" ||
    toolChoice === "required"
    ? toolChoice
    : undefined;
}
