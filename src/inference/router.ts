/**
 * Inference Router
 *
 * Routes inference requests through the model registry using
 * tier-based selection, budget enforcement, and provider-specific
 * message transformation.
 */

import type BetterSqlite3 from "better-sqlite3";
import { ulid } from "ulid";
import { createHash } from "node:crypto";
import type {
  InferenceRequest,
  InferenceResult,
  ModelEntry,
  SurvivalTier,
  InferenceTaskType,
  ModelProvider,
  ChatMessage,
  ModelPreference,
} from "../types.js";
import { ModelRegistry } from "./registry.js";
import { InferenceBudgetTracker } from "./budget.js";
import { pendingInferenceCost, reserveInferenceCost, settleInferenceCost } from "./reservations.js";
import { haltInferenceBudget } from "./budget-policy.js";
import {observeInferencePhase} from './phase-budget.js';
import { ExperimentBudgetGovernor } from "../revenue/budget-governor.js";
import { DEFAULT_ROUTING_MATRIX, TASK_TIMEOUTS } from "./types.js";
import { withGenesis, inspectGenesisDelivery } from "../agent/genesis.js";
import { fitsModelContext, effectiveContextWindow, contextInputUpperBound } from "./context-admission.js";
import { createLogger } from "../observability/logger.js";
import {assertNoKnownSecrets} from '../observability/redaction.js';
import {beginEfficiencyObservation,finishEfficiencyObservation,chooseEfficientRoute} from './efficiency.js';

type Database = BetterSqlite3.Database;

export class InferenceRouter {
  private db: Database;
  private registry: ModelRegistry;
  private budget: InferenceBudgetTracker;
  private experimentBudget: ExperimentBudgetGovernor;

  constructor(db: Database, registry: ModelRegistry, budget: InferenceBudgetTracker,
    private readonly genesisPrompt: string = "", private readonly requirePhase: boolean = false) {
    this.db = db;
    this.registry = registry;
    this.budget = budget;
    this.experimentBudget = new ExperimentBudgetGovernor(db);
  }

  /**
   * Route an inference request: select model, check budget,
   * transform messages, call inference, record cost.
   */
  async route(
    request: InferenceRequest,
    inferenceChat: (messages: any[], options: any) => Promise<any>,
  ): Promise<InferenceResult> {
    observeInferencePhase(this.db);
    const { messages, taskType, tier, sessionId, turnId, experimentId, tools } = request;
    const learningRequest={...request,messages:withGenesis(messages,this.genesisPrompt)};

    // 1. Select model from routing matrix
    const baseline = this.selectModel(tier, taskType);
    const eligible=(this.getPreference(tier,taskType)?.candidates??[]).map(id=>this.registry.get(id)).filter((m):m is ModelEntry=>!!m&&m.enabled);
    const routeChoice = baseline?chooseEfficientRoute(this.db,learningRequest,baseline,eligible):null;
    const model = routeChoice?.model;
    if (!model) {
      return {
        content: "",
        model: "none",
        provider: "other",
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        latencyMs: 0,
        finishReason: "error",
        toolCalls: undefined,
      };
    }

    // 2. Estimate cost and check budget
    const preference = this.getPreference(tier, taskType);
    const requestedTokens = request.maxTokens ?? preference?.maxTokens ?? model.maxTokens;
    if (!Number.isSafeInteger(requestedTokens) || requestedTokens <= 0 ||
        !Number.isSafeInteger(model.maxTokens) || model.maxTokens <= 0 ||
        !Number.isSafeInteger(model.contextWindow) || model.contextWindow <= 0 ||
        !Number.isFinite(model.costPer1kInput) || model.costPer1kInput < 0 ||
        !Number.isFinite(model.costPer1kOutput) || model.costPer1kOutput < 0) {
      return {
        content: "Inference blocked: invalid model pricing or token limits",
        model: model.modelId, provider: model.provider,
        inputTokens: 0, outputTokens: 0, costCents: 0, latencyMs: 0,
        finishReason: "budget_exceeded",
      };
    }
    const maxTokens = Math.min(requestedTokens, model.maxTokens, model.contextWindow);
    // A character heuristic is not an upper bound (tools, Unicode and provider
    // framing can all exceed it). Reserve the full configured input capacity.
    // This assumes the adapter enforces these limits and performs one billable
    // attempt at the configured rates; hidden retries require separate holds.
    const estimatedCostCents = Math.ceil(
      (model.contextWindow / 1000) * model.costPer1kInput / 100 +
      maxTokens / 1000 * model.costPer1kOutput / 100,
    );

    // Validate local input before reserving. No network work is performed while
    // holding the write lock; other connections see the reservation before await.
    assertNoKnownSecrets({messages,tools,genesis:this.genesisPrompt});
    const transformedMessages = this.transformMessagesForProvider(learningRequest.messages, model.provider);
    const delivery = inspectGenesisDelivery(transformedMessages, this.genesisPrompt);
    const contextWindow = effectiveContextWindow(model.modelId, model.contextWindow);
    const diagnostic = { ...delivery, contextWindow, outputReserve: maxTokens,
      inputTokenUpperBound: contextInputUpperBound(transformedMessages, tools) };
    if (!delivery.complete) throw new Error("Genesis delivery failed: complete section missing");
    createLogger("genesis-delivery").debug("Genesis prepared for provider", diagnostic);
    if (!fitsModelContext(transformedMessages, tools, contextWindow, maxTokens)) {
      createLogger("genesis-delivery").warn("Genesis request blocked", {
        ...diagnostic, reason: "context_capacity_exceeded", requestSent: false,
      });
      return {
        content: "Inference blocked: complete policy, task context, tools and output reserve exceed model context capacity",
        model: model.modelId, provider: model.provider,
        inputTokens: 0, outputTokens: 0, costCents: 0, latencyMs: 0,
        finishReason: "budget_exceeded",
      };
    }
    let reservationId = "";
    const denial = this.db.transaction((): InferenceResult | undefined => {
      const budgetCheck = this.budget.checkBudget(estimatedCostCents, model.modelId);
      if (!budgetCheck.allowed) {
        return {
          content: `Budget exceeded: ${budgetCheck.reason}`,
          model: model.modelId,
          provider: model.provider,
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
          latencyMs: 0,
          finishReason: "budget_exceeded",
        };
      }

      if (experimentId) {
        const durationCheck = this.experimentBudget.checkDuration(experimentId);

        if (!durationCheck.allowed) {
          if (
            durationCheck.maxDurationHours !== null &&
            durationCheck.maxDurationHours > 0 &&
            durationCheck.elapsedHours >= durationCheck.maxDurationHours
          ) {
            this.experimentBudget.stopExperiment(
              experimentId,
              durationCheck.reason ?? "Experiment duration exceeded",
            );
          }

          return {
            content: durationCheck.reason ?? "Experiment duration exceeded",
            model: model.modelId,
            provider: model.provider,
            inputTokens: 0,
            outputTokens: 0,
            costCents: 0,
            latencyMs: 0,
            finishReason: "budget_exceeded",
          };
        }
      }
      if (experimentId) {
        const experimentBudgetCheck = this.experimentBudget.checkInferenceBudget(
          experimentId,
          estimatedCostCents,
        );

        if (!experimentBudgetCheck.allowed) {
          if (
            experimentBudgetCheck.limitCents > 0 &&
            experimentBudgetCheck.currentInferenceCostCents >=
              experimentBudgetCheck.limitCents
          ) {
            this.experimentBudget.stopExperiment(
              experimentId,
              experimentBudgetCheck.reason ??
                "Experiment inference budget exhausted",
            );
          }

          return {
            content: experimentBudgetCheck.reason ?? "Experiment inference budget exceeded",
            model: model.modelId,
            provider: model.provider,
            inputTokens: 0,
            outputTokens: 0,
            costCents: 0,
            latencyMs: 0,
            finishReason: "budget_exceeded",
          };
        }
      }
      if (experimentId) {
        const totalBudgetCheck = this.experimentBudget.checkTotalBudget(
          experimentId,
          estimatedCostCents,
        );

        if (!totalBudgetCheck.allowed) {
          if (
            totalBudgetCheck.limitCents > 0 &&
            totalBudgetCheck.currentTotalCostCents >=
              totalBudgetCheck.limitCents
          ) {
            this.experimentBudget.stopExperiment(
              experimentId,
              totalBudgetCheck.reason ??
                "Experiment total budget exhausted",
            );
          }

          return {
            content: totalBudgetCheck.reason ?? "Experiment total budget exceeded",
            model: model.modelId,
            provider: model.provider,
            inputTokens: 0,
            outputTokens: 0,
            costCents: 0,
            latencyMs: 0,
            finishReason: "budget_exceeded",
          };
        }
      }
      // 3. Check session budget
      const sessionLimit = this.budget.getSessionLimit();
      if (sessionLimit !== null) {
        const sessionCost = this.budget.getSessionCost(request.sessionId) +
          pendingInferenceCost(this.db, { sessionId: request.sessionId });
        if (sessionCost + estimatedCostCents > sessionLimit) {
          return {
            content: `Session budget exceeded: ${sessionCost}c spent + ${estimatedCostCents}c estimated > ${sessionLimit}c limit`,
            model: model.modelId,
            provider: model.provider,
            inputTokens: 0,
            outputTokens: 0,
            costCents: 0,
            latencyMs: 0,
            finishReason: "budget_exceeded",
          };
        }
      }

      reservationId = reserveInferenceCost(this.db, sessionId, experimentId, model.modelId, estimatedCostCents,
        { provider: model.provider, turnId, tier, taskType,requirePhase:this.requirePhase });
      beginEfficiencyObservation(this.db,reservationId,learningRequest,model,estimatedCostCents,baseline!.modelId);
      return undefined;
    }).immediate();
    if (denial) return denial;

    // 5. Build inference options
    const timeout = TASK_TIMEOUTS[taskType] || 120_000;

    const inferenceOptions: any = {
      model: model.modelId,
      providerId: model.provider,
      singleAttempt: true,
      maxTokens,
      tools: tools,
      toolChoice: request.toolChoice,
      temperature: request.temperature,
      responseFormat: request.responseFormat,
    };

    // 6. Call inference with timeout
    const startTime = Date.now();
    let response: any;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        inferenceOptions.signal = controller.signal;
        response = await inferenceChat(transformedMessages, inferenceOptions);
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      finishEfficiencyObservation(this.db,reservationId,{status:'failed',latencyMs});
      // If fallback is enabled, try next candidate
      if (error.name === "AbortError") {
        return {
          content: `Inference timeout after ${timeout}ms`,
          model: model.modelId,
          provider: model.provider,
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
          latencyMs,
          finishReason: "timeout",
        };
      }
      throw error;
    }
    const latencyMs = Date.now() - startTime;

    // 7. Calculate actual cost
    const inputTokens = response.usage?.promptTokens;
    const outputTokens = response.usage?.completionTokens;
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
        !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
      // Unknown usage is not proof of zero cost. Keep the durable hold.
      finishEfficiencyObservation(this.db,reservationId,{status:'unknown',latencyMs});
      return {
        content: "Inference usage missing or invalid; cost reservation retained for reconciliation",
        model: model.modelId, provider: model.provider,
        inputTokens: 0, outputTokens: 0, costCents: 0, latencyMs,
        finishReason: "error",
      };
    }
    const actualCostCents = Math.ceil(
      (inputTokens / 1000) * model.costPer1kInput / 100 +
      (outputTokens / 1000) * model.costPer1kOutput / 100,
    );
    if (!Number.isSafeInteger(actualCostCents) || actualCostCents < 0) {
      haltInferenceBudget(this.db, "Unrepresentable provider charge; hold retained");
      return { content: "Provider charge invalid; reservation retained", model: model.modelId, provider: model.provider,
        inputTokens, outputTokens, costCents: 0, latencyMs, finishReason: "error" };
    }

    // A learned substitution remains subject to its machine-verifiable quality
    // contract on EVERY use. A mismatch is billed, rejected and never retried here.
    const qualityMismatch=!!routeChoice?.expectedOutputDigest&&(
      response.finishReason!=='stop'||!!response.toolCalls?.length||typeof response.message?.content!=='string'||
      createHash('sha256').update(response.message.content).digest('hex')!==routeChoice.expectedOutputDigest);
    // 8. Record cost
    settleInferenceCost(this.db, reservationId, () => {
      const cached=response.usage?.cachedPromptTokens;
      finishEfficiencyObservation(this.db,reservationId,{status:qualityMismatch?'failed':'completed',latencyMs,inputTokens,outputTokens,estimatedCents:actualCostCents,
        qualityVerified:!!routeChoice?.expectedOutputDigest&&!qualityMismatch,
        ...(Number.isSafeInteger(cached)&&cached>=0&&cached<=inputTokens?{cachedInputTokens:cached}:{})});
      this.budget.recordCost({
      sessionId,
      turnId: turnId || null,
      experimentId: experimentId || null,
      model: model.modelId,
      provider: model.provider,
      inputTokens,
      outputTokens,
      costCents: actualCostCents,
      latencyMs,
      tier,
      taskType,
      cacheHit: false,
      });
      if (inputTokens > model.contextWindow || outputTokens > maxTokens || actualCostCents > estimatedCostCents) {
        haltInferenceBudget(this.db, "Provider exceeded reserved price/token contract");
      }
    },actualCostCents);

    // 9. Build result
    if (inputTokens > model.contextWindow || outputTokens > maxTokens) {
      // Never hide an incurred cost, even if an adapter breaks its contract.
      // Return an error after booking it so workers cannot treat this as success.
      return {
        content: "Provider usage exceeded reserved model limits; reconciliation required",
        model: model.modelId, provider: model.provider,
        inputTokens, outputTokens, costCents: actualCostCents, latencyMs,
        finishReason: "error",
      };
    }
    if(qualityMismatch)return {content:'Learned route failed its verified quality contract; result rejected, cost recorded, no automatic retry',
      model:model.modelId,provider:model.provider,inputTokens,outputTokens,costCents:actualCostCents,latencyMs,finishReason:'error'};
    return {
      content: response.message?.content || "",
      model: model.modelId,
      provider: model.provider,
      inputTokens,
      outputTokens,
      costCents: actualCostCents,
      latencyMs,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason || "stop",
    };
  }

  /**
   * Select the best model for a given tier and task type.
   *
   * Priority:
   *   1. First routing-matrix candidate present in the registry
   *   2. User-configured model(s) from ModelStrategyConfig
   *      (free/Ollama models are allowed at any tier, including dead)
   */
  selectModel(tier: SurvivalTier, taskType: InferenceTaskType): ModelEntry | null {
    const TIER_ORDER: Record<string, number> = {
      dead: 0, critical: 1, low_compute: 2, normal: 3, high: 4,
    };

    const tierRank = TIER_ORDER[tier] ?? 0;

    // 1. Try routing-matrix candidates
    const preference = this.getPreference(tier, taskType);
    if (preference && preference.candidates.length > 0) {
      for (const candidateId of preference.candidates) {
        const entry = this.registry.get(candidateId);
        if (entry && entry.enabled) {
          return entry;
        }
      }
    }

    // 2. Fall back to user-configured models.
    //    This handles local/Ollama setups where routing-matrix models are absent.
    const strategy = this.budget.config;
    const fallbackIds: (string | undefined)[] =
      tier === "critical" || tier === "dead"
        ? [strategy.criticalModel, strategy.inferenceModel, strategy.lowComputeModel]
        : [strategy.inferenceModel, strategy.lowComputeModel, strategy.criticalModel];

    for (const modelId of fallbackIds) {
      if (!modelId) continue;
      const entry = this.registry.get(modelId);
      if (!entry || !entry.enabled) continue;
      const isFree = entry.costPer1kInput === 0 && entry.costPer1kOutput === 0;
      const tierOk = tierRank >= (TIER_ORDER[entry.tierMinimum] ?? 0);
      if (isFree || tierOk) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Transform messages for a specific provider.
   * Handles Anthropic's alternating-role requirement.
   */
  transformMessagesForProvider(messages: ChatMessage[], provider: ModelProvider): ChatMessage[] {
    if (messages.length === 0) {
      throw new Error("Cannot route inference with empty message array");
    }

    if (provider === "anthropic") {
      return this.fixAnthropicMessages(messages);
    }

    // For OpenAI/Conway, merge consecutive same-role messages
    return this.mergeConsecutiveSameRole(messages);
  }

  /**
   * Fix messages for Anthropic's API requirements:
   * 1. Extract system messages
   * 2. Merge consecutive same-role messages
   * 3. Merge consecutive tool messages into a single user message
   *    with multiple tool_result content blocks
   */
  private fixAnthropicMessages(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];

    for (const msg of messages) {
      // System messages are handled separately by the Anthropic client
      if (msg.role === "system") {
        result.push(msg);
        continue;
      }

      // Tool messages become user messages with tool_result content
      if (msg.role === "tool") {
        const last = result[result.length - 1];
        // If previous message was also a tool (now a user), merge into it
        if (last && last.role === "user" && (last as any)._toolResultMerged) {
          // Append to the merged content
          last.content = last.content + "\n[tool_result:" + (msg.tool_call_id || "unknown") + "] " + msg.content;
          continue;
        }
        // Otherwise create a new user message
        const userMsg: ChatMessage & { _toolResultMerged?: boolean } = {
          role: "user",
          content: "[tool_result:" + (msg.tool_call_id || "unknown") + "] " + msg.content,
          _toolResultMerged: true,
        };
        result.push(userMsg);
        continue;
      }

      // For user/assistant: merge with previous if same role
      const last = result[result.length - 1];
      if (last && last.role === msg.role) {
        last.content = (last.content || "") + "\n" + (msg.content || "");
        if (msg.tool_calls) {
          last.tool_calls = [...(last.tool_calls || []), ...msg.tool_calls];
        }
        continue;
      }

      result.push({ ...msg });
    }

    // Clean up internal markers
    for (const msg of result) {
      delete (msg as any)._toolResultMerged;
    }

    return result;
  }

  /**
   * Merge consecutive messages with the same role.
   */
  private mergeConsecutiveSameRole(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];

    for (const msg of messages) {
      const last = result[result.length - 1];
      if (last && last.role === msg.role && msg.role !== "system" && msg.role !== "tool") {
        last.content = (last.content || "") + "\n" + (msg.content || "");
        if (msg.tool_calls) {
          last.tool_calls = [...(last.tool_calls || []), ...msg.tool_calls];
        }
        continue;
      }
      result.push({ ...msg });
    }

    return result;
  }

  private getPreference(tier: SurvivalTier, taskType: InferenceTaskType): ModelPreference | undefined {
    return DEFAULT_ROUTING_MATRIX[tier]?.[taskType];
  }
}
