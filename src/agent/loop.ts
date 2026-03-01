/**
 * The Agent Loop
 *
 * The core ReAct loop: Think -> Act -> Observe -> Persist.
 * This is the automaton's consciousness. When this runs, it is alive.
 */

import path from "node:path";
import type {
  AutomatonIdentity,
  AutomatonConfig,
  AutomatonDatabase,
  ConwayClient,
  InferenceClient,
  AgentState,
  AgentTurn,
  ToolCallResult,
  FinancialState,
  ToolContext,
  AutomatonTool,
  Skill,
  SocialClientInterface,
  SpendTrackerInterface,
  InputSource,
  ModelStrategyConfig,
} from "../types.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../types.js";
import type { PolicyEngine } from "./policy-engine.js";
import { buildSystemPrompt, buildWakeupPrompt } from "./system-prompt.js";
import { buildContextMessages, trimContext } from "./context.js";
import {
  createBuiltinTools,
  loadInstalledTools,
  toolsToInferenceFormat,
  executeTool,
} from "./tools.js";
import { sanitizeInput } from "./injection-defense.js";
import { getSurvivalTier } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";
import {
  claimInboxMessages,
  markInboxProcessed,
  markInboxFailed,
  resetInboxToReceived,
  consumeNextWakeEvent,
} from "../state/database.js";
import type { InboxMessageRow } from "../state/database.js";
import { ulid } from "ulid";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { InferenceRouter } from "../inference/router.js";
import { MemoryRetriever } from "../memory/retrieval.js";
import { MemoryIngestionPipeline } from "../memory/ingestion.js";
import { DEFAULT_MEMORY_BUDGET } from "../types.js";
import { formatMemoryBlock } from "./context.js";
import { createLogger } from "../observability/logger.js";
import { Orchestrator } from "../orchestration/orchestrator.js";
import { PlanModeController } from "../orchestration/plan-mode.js";
import { generateTodoMd, injectTodoContext } from "../orchestration/attention.js";
import { ColonyMessaging, LocalDBTransport } from "../orchestration/messaging.js";
import { LocalWorkerPool } from "../orchestration/local-worker.js";
import { SimpleAgentTracker, SimpleFundingProtocol } from "../orchestration/simple-tracker.js";
import { ContextManager, createTokenCounter } from "../memory/context-manager.js";
import { CompressionEngine } from "../memory/compression-engine.js";
import { EventStream } from "../memory/event-stream.js";
import { KnowledgeStore } from "../memory/knowledge-store.js";
import { ProviderRegistry } from "../inference/provider-registry.js";
import { UnifiedInferenceClient } from "../inference/inference-client.js";

const logger = createLogger("loop");
const MAX_TOOL_CALLS_PER_TURN = 10;
const MAX_CONSECUTIVE_ERRORS = 5;
const MAX_REPETITIVE_TURNS = 3;

export interface AgentLoopOptions {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
  conway: ConwayClient;
  inference: InferenceClient;
  social?: SocialClientInterface;
  skills?: Skill[];
  policyEngine?: PolicyEngine;
  spendTracker?: SpendTrackerInterface;
  onStateChange?: (state: AgentState) => void;
  onTurnComplete?: (turn: AgentTurn) => void;
  ollamaBaseUrl?: string;
}

/**
 * Run the agent loop. This is the main execution path.
 * Returns when the agent decides to sleep or when compute runs out.
 */
export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<void> {
  const { identity, config, db, conway, inference, social, skills, policyEngine, spendTracker, onStateChange, onTurnComplete, ollamaBaseUrl } =
    options;

  const builtinTools = createBuiltinTools(identity.sandboxId);
  const installedTools = loadInstalledTools(db);
  const tools = [...builtinTools, ...installedTools];
  const toolContext: ToolContext = {
    identity,
    config,
    db,
    conway,
    inference,
    social,
  };

  // Initialize inference router (Phase 2.3)
  const modelStrategyConfig: ModelStrategyConfig = {
    ...DEFAULT_MODEL_STRATEGY_CONFIG,
    ...(config.modelStrategy ?? {}),
  };
  const modelRegistry = new ModelRegistry(db.raw);
  modelRegistry.initialize();

  // Discover Ollama models if configured
  if (ollamaBaseUrl) {
    const { discoverOllamaModels } = await import("../ollama/discover.js");
    await discoverOllamaModels(ollamaBaseUrl, db.raw);
  }
  const budgetTracker = new InferenceBudgetTracker(db.raw, modelStrategyConfig);
  const inferenceRouter = new InferenceRouter(db.raw, modelRegistry, budgetTracker);

  // Optional orchestration bootstrap (requires V9 goals/task tables)
  let planModeController: PlanModeController | undefined;
  let orchestrator: Orchestrator | undefined;
  let contextManager: ContextManager | undefined;
  let compressionEngine: CompressionEngine | undefined;

  if (hasTable(db.raw, "goals")) {
    try {
      planModeController = new PlanModeController(db.raw);

      // Bridge automaton config API keys to env vars for the provider registry.
      // The registry reads keys from process.env; the automaton config may have
      // them from config.json or Conway provisioning.
      if (config.openaiApiKey && !process.env.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = config.openaiApiKey;
      }
      if (config.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;
      }
      // Conway Compute API is OpenAI-compatible. Use it as fallback when no
      // direct OpenAI key is available. The conwayApiKey is always present
      // (required for sandbox operations), so this ensures the orchestrator
      // can always make inference calls.
      if (config.conwayApiKey && !process.env.CONWAY_API_KEY) {
        process.env.CONWAY_API_KEY = config.conwayApiKey;
      }
      // If no OpenAI key is set but Conway key is available, use Conway as
      // the OpenAI provider (Conway Compute is OpenAI API-compatible).
      if (!process.env.OPENAI_API_KEY && config.conwayApiKey) {
        process.env.OPENAI_API_KEY = config.conwayApiKey;
        process.env.OPENAI_BASE_URL = `${config.conwayApiUrl}/v1`;
      }

      const providersPath = path.join(
        process.env.HOME || process.cwd(),
        ".automaton",
        "inference-providers.json",
      );
      const registry = ProviderRegistry.fromConfig(providersPath);

      // If OPENAI_BASE_URL was set (Conway fallback), update the default
      // provider's baseUrl so the OpenAI client points to Conway Compute.
      if (process.env.OPENAI_BASE_URL) {
        registry.overrideBaseUrl("openai", process.env.OPENAI_BASE_URL);
      }

      const unifiedInference = new UnifiedInferenceClient(registry);
      const agentTracker = new SimpleAgentTracker(db);
      const funding = new SimpleFundingProtocol(conway, identity, db);
      const messaging = new ColonyMessaging(
        new LocalDBTransport(db),
        db,
      );

      contextManager = new ContextManager(createTokenCounter());
      compressionEngine = new CompressionEngine(
        contextManager,
        new EventStream(db.raw),
        new KnowledgeStore(db.raw),
        unifiedInference,
      );

      // Adapter: wrap the main agent's working inference client so local
      // workers can use it. The main InferenceClient talks to Conway Compute
      // (which always works), unlike the UnifiedInferenceClient which needs
      // a direct OpenAI key.
      const workerInference = {
        chat: async (params: { messages: any[]; tools?: any[]; maxTokens?: number; temperature?: number }) => {
          const response = await inference.chat(
            params.messages,
            {
              tools: params.tools,
              maxTokens: params.maxTokens,
              temperature: params.temperature,
            },
          );
          return {
            content: response.message?.content ?? "",
            toolCalls: response.toolCalls,
          };
        },
      };

      // Local worker pool: runs inference-driven agents in-process
      // as async tasks. Falls back from Conway sandbox spawning.
      const workerPool = new LocalWorkerPool({
        db: db.raw,
        inference: workerInference,
        conway,
        workerId: `pool-${identity.name}`,
      });

      orchestrator = new Orchestrator({
        db: db.raw,
        agentTracker,
        funding,
        messaging,
        inference: unifiedInference,
        identity,
        isWorkerAlive: (address: string) => {
          if (address.startsWith("local://")) {
            return workerPool.hasWorker(address);
          }
          // Remote workers: check children table
          const child = db.raw.prepare(
            "SELECT status FROM children WHERE sandbox_id = ? OR address = ?",
          ).get(address, address) as { status: string } | undefined;
          if (!child) return false;
          return !["failed", "dead", "cleaned_up"].includes(child.status);
        },
        config: {
          ...config,
          spawnAgent: async (task: any) => {
            // Try Conway sandbox spawn first (production)
            try {
              const { generateGenesisConfig } = await import("../replication/genesis.js");
              const { spawnChild } = await import("../replication/spawn.js");
              const { ChildLifecycle } = await import("../replication/lifecycle.js");

              const role = task.agentRole ?? "generalist";
              const genesis = generateGenesisConfig(identity, config, {
                name: `worker-${role}-${Date.now().toString(36)}`,
                specialization: `${role}: ${task.title}`,
              });

              const lifecycle = new ChildLifecycle(db.raw);
              const child = await spawnChild(conway, identity, db, genesis, lifecycle);

              return {
                address: child.address,
                name: child.name,
                sandboxId: child.sandboxId,
              };
            } catch (sandboxError: any) {
              // If the error is a 402 (insufficient credits), attempt topup and retry once
              const is402 = sandboxError?.status === 402 ||
                sandboxError?.message?.includes("INSUFFICIENT_CREDITS");

              if (is402) {
                const SANDBOX_TOPUP_COOLDOWN_MS = 60_000;
                const lastAttempt = db.getKV("last_sandbox_topup_attempt");
                const cooldownExpired = !lastAttempt ||
                  Date.now() - new Date(lastAttempt).getTime() >= SANDBOX_TOPUP_COOLDOWN_MS;

                if (cooldownExpired) {
                  db.setKV("last_sandbox_topup_attempt", new Date().toISOString());
                  try {
                    const { topupForSandbox } = await import("../conway/topup.js");
                    const topupResult = await topupForSandbox({
                      apiUrl: config.conwayApiUrl,
                      account: identity.account,
                      error: sandboxError,
                    });

                    if (topupResult?.success) {
                      logger.info(`Sandbox topup succeeded ($${topupResult.amountUsd}), retrying spawn`, {
                        taskId: task.id,
                      });
                      // Retry spawn once after successful topup
                      try {
                        const { generateGenesisConfig: genGenesis } = await import("../replication/genesis.js");
                        const { spawnChild: retrySpawn } = await import("../replication/spawn.js");
                        const { ChildLifecycle: RetryLifecycle } = await import("../replication/lifecycle.js");

                        const retryRole = task.agentRole ?? "generalist";
                        const retryGenesis = genGenesis(identity, config, {
                          name: `worker-${retryRole}-${Date.now().toString(36)}`,
                          specialization: `${retryRole}: ${task.title}`,
                        });
                        const retryLifecycle = new RetryLifecycle(db.raw);
                        const child = await retrySpawn(conway, identity, db, retryGenesis, retryLifecycle);
                        return {
                          address: child.address,
                          name: child.name,
                          sandboxId: child.sandboxId,
                        };
                      } catch (retryError) {
                        logger.warn("Spawn retry after topup failed", {
                          taskId: task.id,
                          error: retryError instanceof Error ? retryError.message : String(retryError),
                        });
                      }
                    }
                  } catch (topupError) {
                    logger.warn("Sandbox topup attempt failed", {
                      taskId: task.id,
                      error: topupError instanceof Error ? topupError.message : String(topupError),
                    });
                  }
                }
              }

              // Conway sandbox unavailable — fall back to local worker
              logger.info("Conway sandbox unavailable, spawning local worker", {
                taskId: task.id,
                error: sandboxError instanceof Error ? sandboxError.message : String(sandboxError),
              });

              try {
                const spawned = workerPool.spawn(task);
                return spawned;
              } catch (localError) {
                logger.warn("Failed to spawn local worker", {
                  taskId: task.id,
                  error: localError instanceof Error ? localError.message : String(localError),
                });
                return null;
              }
            }
          },
        },
      });
    } catch (error) {
      logger.warn(
        `Orchestrator initialization failed, continuing without orchestration: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      planModeController = undefined;
      orchestrator = undefined;
      contextManager = undefined;
      compressionEngine = undefined;
    }
  }

  // Fix 1: Generate a unique session ID per wake cycle so budget tracking
  // resets each time the agent starts. Without this, session_id="default"
  // accumulates costs forever and triggers false budget_exceeded errors.
  const sessionId = `session-${ulid()}`;
  db.setKV("session_id", sessionId);
  logger.info(`Starting new session: ${sessionId}`);

  // Set start time
  if (!db.getKV("start_time")) {
    db.setKV("start_time", new Date().toISOString());
  }

  let consecutiveErrors = 0;
  let running = true;
  let lastToolPatterns: string[] = [];
  let loopWarningPattern: string | null = null;
  let idleToolTurns = 0;
  // blockedGoalTurns removed — replaced by immediate sleep + exponential backoff

  // Drain any stale wake events from before this loop started,
  // so they don't re-wake the agent after its first sleep.
  let drained = 0;
  while (consumeNextWakeEvent(db.raw)) drained++;

  // Clear any stale sleep_until from a previous session so the agent
  // doesn't immediately go back to sleep on startup.
  db.deleteKV("sleep_until");

  // Fix 6: Dead worker recovery — reset stale tasks from previous sessions.
  // On startup, any task in "assigned" or "running" state was interrupted by
  // a crash/restart. Reset them to "pending" so the orchestrator can reassign.
  if (hasTable(db.raw, "task_graph")) {
    try {
      const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
      const cutoff = new Date(Date.now() - STALE_TIMEOUT_MS).toISOString();
      const staleResult = db.raw.prepare(`
        UPDATE task_graph
        SET status = 'pending', assigned_to = NULL, updated_at = ?
        WHERE status IN ('assigned', 'running')
          AND (updated_at < ? OR updated_at IS NULL)
      `).run(new Date().toISOString(), cutoff);
      if (staleResult.changes > 0) {
        logger.info(`Dead worker recovery: reset ${staleResult.changes} stale task(s) to pending`);
      }
    } catch (err) {
      logger.warn(`Dead worker recovery failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Transition to waking state
  db.setAgentState("waking");
  onStateChange?.("waking");

  // Get financial state
  let financial = await getFinancialState(conway, identity.address, db);

  // Check if this is the first run
  const isFirstRun = db.getTurnCount() === 0;

  // Build wakeup prompt
  const wakeupInput = buildWakeupPrompt({
    identity,
    config,
    financial,
    db,
  });

  // Transition to running
  db.setAgentState("running");
  onStateChange?.("running");

  log(config, `[WAKE UP] ${config.name} is alive. Credits: $${(financial.creditsCents / 100).toFixed(2)}`);

  // ─── The Loop ──────────────────────────────────────────────

  const MAX_IDLE_TURNS = 10; // Force sleep after N turns with no real work
  let idleTurnCount = 0;

  const maxCycleTurns = config.maxTurnsPerCycle ?? 25;
  let cycleTurnCount = 0;

  let pendingInput: { content: string; source: string } | undefined = {
    content: wakeupInput,
    source: "wakeup",
  };

  while (running) {
    // Declared outside try so the catch block can access for retry/failure handling
    let claimedMessages: InboxMessageRow[] = [];

    try {
      // Check if we should be sleeping
      const sleepUntil = db.getKV("sleep_until");
      if (sleepUntil && new Date(sleepUntil) > new Date()) {
        log(config, `[SLEEP] Sleeping until ${sleepUntil}`);
        // IMPORTANT: mark agent as sleeping so the outer runtime pauses instead of immediately re-running.
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        running = false;
        break;
      }

      // Check for unprocessed inbox messages using the state machine:
      // received → in_progress (claim) → processed (on success) or received/failed (on failure)
      if (!pendingInput) {
        claimedMessages = claimInboxMessages(db.raw, 10);
        if (claimedMessages.length > 0) {
          const formatted = claimedMessages
            .map((m) => {
              const from = sanitizeInput(m.fromAddress, m.fromAddress, "social_address");
              const content = sanitizeInput(m.content, m.fromAddress, "social_message");
              if (content.blocked) {
                return `[INJECTION BLOCKED from ${from.content}]: message was blocked by safety filter`;
              }
              return `[Message from ${from.content}]: ${content.content}`;
            })
            .join("\n\n");
          pendingInput = { content: formatted, source: "agent" };
        }
      }

      // Refresh financial state periodically
      financial = await getFinancialState(conway, identity.address, db);

      // Check survival tier
      // api_unreachable: creditsCents === -1 means API failed with no cache.
      // Do NOT kill the agent; continue in low-compute mode and retry next tick.
      if (financial.creditsCents === -1) {
        log(config, "[API_UNREACHABLE] Balance API unreachable, continuing in low-compute mode.");
        inference.setLowComputeMode(true);
      } else {
        const tier = getSurvivalTier(financial.creditsCents);

        // Inline auto-topup: if credits are critically low and USDC is
        // available, buy credits NOW — before attempting inference.
        // This prevents the agent from dying mid-loop while waiting for
        // the heartbeat to fire. Uses a 60s cooldown to avoid hammering.
        if ((tier === "critical" || tier === "low_compute") && financial.usdcBalance >= 5) {
          const INLINE_TOPUP_COOLDOWN_MS = 60_000;
          const lastInlineTopup = db.getKV("last_inline_topup_attempt");
          const cooldownExpired = !lastInlineTopup ||
            Date.now() - new Date(lastInlineTopup).getTime() >= INLINE_TOPUP_COOLDOWN_MS;

          if (cooldownExpired) {
            db.setKV("last_inline_topup_attempt", new Date().toISOString());
            try {
              const { bootstrapTopup } = await import("../conway/topup.js");
              const topupResult = await bootstrapTopup({
                apiUrl: config.conwayApiUrl,
                account: identity.account,
                creditsCents: financial.creditsCents,
              });
              if (topupResult?.success) {
                log(config, `[AUTO-TOPUP] Bought $${topupResult.amountUsd} credits from USDC mid-loop`);
                // Re-fetch financial state after topup so the rest of
                // the turn sees the updated balance.
                financial = await getFinancialState(conway, identity.address, db);
              }
            } catch (err: any) {
              logger.warn(`Inline auto-topup failed: ${err.message}`);
            }
          }
        }

        // Re-evaluate tier after potential topup
        const effectiveTier = getSurvivalTier(financial.creditsCents);

        if (effectiveTier === "critical") {
          log(config, "[CRITICAL] Credits critically low. Limited operation.");
          db.setAgentState("critical");
          onStateChange?.("critical");
          inference.setLowComputeMode(true);
        } else if (effectiveTier === "low_compute") {
          db.setAgentState("low_compute");
          onStateChange?.("low_compute");
          inference.setLowComputeMode(true);
        } else {
          if (db.getAgentState() !== "running") {
            db.setAgentState("running");
            onStateChange?.("running");
          }
          inference.setLowComputeMode(false);
        }
      }

      // Build context — filter out purely idle turns (only status checks)
      // to prevent the model from continuing a status-check pattern
      const IDLE_ONLY_TOOLS = new Set([
        "check_credits", "check_usdc_balance", "system_synopsis", "review_memory",
        "list_children", "check_child_status", "list_sandboxes", "list_models",
        "list_skills", "git_status", "git_log", "check_reputation",
        "recall_facts", "recall_procedure", "heartbeat_ping",
        "check_inference_spending",
        "orchestrator_status", "list_goals", "get_plan",
      ]);
      const allTurns = db.getRecentTurns(20);
      const meaningfulTurns = allTurns.filter((t) => {
        if (t.toolCalls.length === 0) return true; // text-only turns are meaningful
        return t.toolCalls.some((tc) => !IDLE_ONLY_TOOLS.has(tc.name));
      });
      // Keep at least the last 2 turns for continuity, even if idle
      const recentTurns = trimContext(
        meaningfulTurns.length > 0 ? meaningfulTurns : allTurns.slice(-2),
      );
      const systemPrompt = buildSystemPrompt({
        identity,
        config,
        financial,
        state: db.getAgentState(),
        db,
        tools,
        skills,
        isFirstRun,
      });

      // Phase 2.2: Pre-turn memory retrieval
      let memoryBlock: string | undefined;
      try {
        const retriever = new MemoryRetriever(db.raw, DEFAULT_MEMORY_BUDGET);
        const memories = retriever.retrieve(sessionId, pendingInput?.content);
        if (memories.totalTokens > 0) {
          memoryBlock = formatMemoryBlock(memories);
        }
      } catch (error) {
        logger.error("Memory retrieval failed", error instanceof Error ? error : undefined);
        // Memory failure must not block the agent loop
      }

      let messages = buildContextMessages(
        systemPrompt,
        recentTurns,
        pendingInput,
      );

      // Inject memory block after system prompt, before conversation history
      if (memoryBlock) {
        messages.splice(1, 0, { role: "system", content: memoryBlock });
      }

      if (orchestrator) {
        const orchestratorTick = await orchestrator.tick();
        db.setKV("orchestrator.last_tick", JSON.stringify(orchestratorTick));
        if (
          orchestratorTick.tasksAssigned > 0 ||
          orchestratorTick.tasksCompleted > 0 ||
          orchestratorTick.tasksFailed > 0
        ) {
          log(
            config,
            `[ORCHESTRATOR] phase=${orchestratorTick.phase} assigned=${orchestratorTick.tasksAssigned} completed=${orchestratorTick.tasksCompleted} failed=${orchestratorTick.tasksFailed}`,
          );
        }
      }

      if (planModeController) {
        try {
          const todoMd = generateTodoMd(db.raw);
          messages = injectTodoContext(messages, todoMd);
        } catch (error) {
          logger.warn(
            `todo.md context injection skipped: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Capture input before clearing
      const currentInput = pendingInput;

      // Clear pending input after use
      pendingInput = undefined;

      // ── Inference Call (via router when available) ──
      const survivalTier = getSurvivalTier(financial.creditsCents);

      // Fix 7: Detect task type for model routing.
      // Instead of always using "agent_turn", classify the task so the router
      // can select cheaper models for orientation/summarization turns and
      // reserve expensive models for complex planning/execution.
      const detectedTaskType = detectTaskType(currentInput, recentTurns);
      log(config, `[THINK] Routing inference (tier: ${survivalTier}, task: ${detectedTaskType}, model: ${inference.getDefaultModel()})...`);

      // Fix 4: Dynamic tool selection — filter tools based on phase and tier
      // to reduce token overhead. 57 tool definitions × ~100 tokens each ≈ 5,700
      // tokens per turn. Phase-based filtering cuts this by 40-60%.
      const filteredTools = filterToolsByPhase(tools, detectedTaskType, survivalTier);
      const inferenceTools = toolsToInferenceFormat(filteredTools);
      const routerResult = await inferenceRouter.route(
        {
          messages: messages,
          taskType: detectedTaskType,
          tier: survivalTier,
          sessionId: sessionId,
          turnId: ulid(),
          tools: inferenceTools,
        },
        (msgs, opts) => inference.chat(msgs, { ...opts, tools: inferenceTools }),
      );

      // Build a compatible response for the rest of the loop
      const response = {
        message: { content: routerResult.content, role: "assistant" as const },
        toolCalls: routerResult.toolCalls as any[] | undefined,
        usage: {
          promptTokens: routerResult.inputTokens,
          completionTokens: routerResult.outputTokens,
          totalTokens: routerResult.inputTokens + routerResult.outputTokens,
        },
        finishReason: routerResult.finishReason,
      };

      const turn: AgentTurn = {
        id: ulid(),
        timestamp: new Date().toISOString(),
        state: db.getAgentState(),
        input: currentInput?.content,
        inputSource: currentInput?.source as any,
        thinking: response.message.content || "",
        toolCalls: [],
        tokenUsage: response.usage,
        costCents: routerResult.costCents,
      };

      // ── Execute Tool Calls ──
      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolCallMessages: any[] = [];
        let callCount = 0;
        const currentInputSource = currentInput?.source as InputSource | undefined;

        for (const tc of response.toolCalls) {
          if (callCount >= MAX_TOOL_CALLS_PER_TURN) {
            log(config, `[TOOLS] Max tool calls per turn reached (${MAX_TOOL_CALLS_PER_TURN})`);
            break;
          }

          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments);
          } catch (error) {
            logger.error("Failed to parse tool arguments", error instanceof Error ? error : undefined);
            args = {};
          }

          log(config, `[TOOL] ${tc.function.name}(${JSON.stringify(args).slice(0, 100)})`);

          const result = await executeTool(
            tc.function.name,
            args,
            tools,
            toolContext,
            policyEngine,
            spendTracker ? {
              inputSource: currentInputSource,
              turnToolCallCount: turn.toolCalls.filter(t => t.name === "transfer_credits").length,
              sessionSpend: spendTracker,
            } : undefined,
          );

          // Override the ID to match the inference call's ID
          result.id = tc.id;
          turn.toolCalls.push(result);

          log(
            config,
            `[TOOL RESULT] ${tc.function.name}: ${result.error ? `ERROR: ${result.error}` : result.result.slice(0, 200)}`,
          );

          callCount++;
        }
      }

      // ── Persist Turn (atomic: turn + tool calls + inbox ack) ──
      const claimedIds = claimedMessages.map((m) => m.id);
      db.runTransaction(() => {
        db.insertTurn(turn);
        for (const tc of turn.toolCalls) {
          db.insertToolCall(turn.id, tc);
        }
        // Mark claimed inbox messages as processed (atomic with turn persistence)
        if (claimedIds.length > 0) {
          markInboxProcessed(db.raw, claimedIds);
        }
      });
      onTurnComplete?.(turn);

      // Phase 2.2: Post-turn memory ingestion (non-blocking)
      try {
        const ingestion = new MemoryIngestionPipeline(db.raw);
        ingestion.ingest(sessionId, turn, turn.toolCalls);
      } catch (error) {
        logger.error("Memory ingestion failed", error instanceof Error ? error : undefined);
        // Memory failure must not block the agent loop
      }

      // Fix 8: Context compression — periodically compress conversation history
      // to prevent context window overflow. Runs every 5 turns.
      if (compressionEngine && contextManager && cycleTurnCount % 5 === 0) {
        try {
          const utilization = contextManager.getUtilization();
          if (utilization.utilizationPercent > 0.7) {
            const plan = await compressionEngine.evaluate(utilization);
            if (plan.maxStage > 0) {
              const compResult = await compressionEngine.execute(plan);
              if (compResult.success) {
                log(config, `[COMPRESS] Stage ${compResult.metrics.stage}: saved ${compResult.metrics.tokensSaved} tokens (${(compResult.metrics.compressionRatio * 100).toFixed(0)}%)`);
              }
            }
          }
        } catch (err) {
          logger.warn(`Context compression failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // ── create_goal BLOCKED fast-break ──
      // When a goal is already active, the parent loop has nothing useful to do.
      // Force sleep immediately on first BLOCKED (not second) with exponential
      // backoff so the agent doesn't wake every 2 minutes just to get BLOCKED again.
      const blockedGoalCall = turn.toolCalls.find(
        (tc) => tc.name === "create_goal" && tc.result?.includes("BLOCKED"),
      );
      if (blockedGoalCall) {
        // Exponential backoff: 2min → 4min → 8min → cap at 10min
        const prevBackoff = parseInt(db.getKV("blocked_goal_backoff") || "0", 10);
        const backoffMs = Math.min(
          prevBackoff > 0 ? prevBackoff * 2 : 120_000,
          600_000,
        );
        db.setKV("blocked_goal_backoff", String(backoffMs));
        log(config, `[LOOP] create_goal BLOCKED — sleeping ${Math.round(backoffMs / 1000)}s (backoff).`);
        db.setKV("sleep_until", new Date(Date.now() + backoffMs).toISOString());
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        running = false;
        break;
      } else if (turn.toolCalls.some((tc) => tc.name === "create_goal" && !tc.error)) {
        // Goal was successfully created — reset backoff
        db.deleteKV("blocked_goal_backoff");
      }

      // ── Loop Detection ──
      if (turn.toolCalls.length > 0) {
        const currentPattern = turn.toolCalls
          .map((tc) => tc.name)
          .sort()
          .join(",");
        lastToolPatterns.push(currentPattern);

        // Keep only the last MAX_REPETITIVE_TURNS entries
        if (lastToolPatterns.length > MAX_REPETITIVE_TURNS) {
          lastToolPatterns = lastToolPatterns.slice(-MAX_REPETITIVE_TURNS);
        }

        // Reset enforcement tracker if agent changed behavior
        if (loopWarningPattern && currentPattern !== loopWarningPattern) {
          loopWarningPattern = null;
        }

        // ── Loop Enforcement Escalation ──
        // If we already warned about this pattern and the agent STILL repeats, force sleep.
        if (
          loopWarningPattern &&
          currentPattern === loopWarningPattern &&
          lastToolPatterns.length === MAX_REPETITIVE_TURNS &&
          lastToolPatterns.every((p) => p === currentPattern)
        ) {
          log(config, `[LOOP] Enforcement: agent ignored loop warning, forcing sleep.`);
          pendingInput = {
            content:
              `LOOP ENFORCEMENT: You were warned about repeating "${currentPattern}" but continued. ` +
              `Forcing sleep to prevent credit waste. On next wake, try a DIFFERENT approach.`,
            source: "system",
          };
          loopWarningPattern = null;
          lastToolPatterns = [];
          db.setAgentState("sleeping");
          onStateChange?.("sleeping");
          running = false;
          break;
        }

        // Check if the same pattern repeated MAX_REPETITIVE_TURNS times
        if (
          lastToolPatterns.length === MAX_REPETITIVE_TURNS &&
          lastToolPatterns.every((p) => p === currentPattern)
        ) {
          log(config, `[LOOP] Repetitive pattern detected: ${currentPattern}`);
          pendingInput = {
            content:
              `LOOP DETECTED: You have called "${currentPattern}" ${MAX_REPETITIVE_TURNS} times in a row with similar results. ` +
              `STOP repeating yourself. You already know your status. DO SOMETHING DIFFERENT NOW. ` +
              `Pick ONE concrete task from your genesis prompt and execute it.`,
            source: "system",
          };
          loopWarningPattern = currentPattern;
          lastToolPatterns = [];
        }

        // Detect multi-tool maintenance loops: all tools in the turn are idle-only,
        // even if the specific combination varies across consecutive turns.
        const isAllIdleTools = turn.toolCalls.every((tc) => IDLE_ONLY_TOOLS.has(tc.name));
        if (isAllIdleTools) {
          idleToolTurns++;
          if (idleToolTurns >= MAX_REPETITIVE_TURNS && !pendingInput) {
            log(config, `[LOOP] Maintenance loop detected: ${idleToolTurns} consecutive idle-only turns`);
            pendingInput = {
              content:
                `MAINTENANCE LOOP DETECTED: Your last ${idleToolTurns} turns only used status-check tools ` +
                `(${turn.toolCalls.map((tc) => tc.name).join(", ")}). ` +
                `You already know your status. Review your genesis prompt and SOUL.md, then execute a CONCRETE task. ` +
                `Write code, create a file, register a service, or build something new.`,
              source: "system",
            };
            idleToolTurns = 0;
          }
        } else {
          idleToolTurns = 0;
        }
      }

      // Log the turn
      if (turn.thinking) {
        log(config, `[THOUGHT] ${turn.thinking.slice(0, 300)}`);
      }

      // ── Check for sleep command ──
      const sleepTool = turn.toolCalls.find((tc) => tc.name === "sleep");
      if (sleepTool && !sleepTool.error) {
        log(config, "[SLEEP] Agent chose to sleep.");
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        running = false;
        break;
      }

      // ── Idle turn detection ──
      // If this turn had no pending input and didn't do any real work
      // (no mutations — only read/check/list/info tools), count as idle.
      // Use a blocklist of mutating tools rather than an allowlist of safe ones.
      const MUTATING_TOOLS = new Set([
        "exec", "write_file", "edit_own_file", "transfer_credits", "topup_credits", "fund_child",
        "spawn_child", "start_child", "delete_sandbox", "create_sandbox",
        "install_npm_package", "install_mcp_server", "install_skill",
        "create_skill", "remove_skill", "install_skill_from_git",
        "install_skill_from_url", "pull_upstream", "git_commit", "git_push",
        "git_branch", "git_clone", "send_message", "message_child",
        "register_domain", "register_erc8004", "give_feedback",
        "update_genesis_prompt", "update_agent_card", "modify_heartbeat",
        "expose_port", "remove_port", "x402_fetch", "manage_dns",
        "distress_signal", "prune_dead_children", "sleep",
        "update_soul", "remember_fact", "set_goal", "complete_goal",
        "save_procedure", "note_about_agent", "forget",
        "enter_low_compute", "switch_model", "review_upstream_changes",
      ]);
      const didMutate = turn.toolCalls.some((tc) => MUTATING_TOOLS.has(tc.name));

      if (!currentInput && !didMutate) {
        idleTurnCount++;
        if (idleTurnCount >= MAX_IDLE_TURNS) {
          log(config, `[IDLE] ${idleTurnCount} consecutive idle turns with no work. Entering sleep.`);
          db.setKV("sleep_until", new Date(Date.now() + 60_000).toISOString());
          db.setAgentState("sleeping");
          onStateChange?.("sleeping");
          running = false;
        }
      } else {
        idleTurnCount = 0;
      }

      // ── Cycle turn limit ──
      // Hard ceiling on turns per wake cycle, regardless of tool type.
      // Prevents runaway loops where mutating tools (exec, write_file)
      // defeat idle detection indefinitely.
      cycleTurnCount++;
      if (running && cycleTurnCount >= maxCycleTurns) {
        log(config, `[CYCLE LIMIT] ${cycleTurnCount} turns reached (max: ${maxCycleTurns}). Forcing sleep.`);
        db.setKV("sleep_until", new Date(Date.now() + 120_000).toISOString());
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        running = false;
        break;
      }

      // ── If no tool calls and just text, the agent might be done thinking ──
      if (
        running &&
        (!response.toolCalls || response.toolCalls.length === 0) &&
        response.finishReason === "stop"
      ) {
        // Agent produced text without tool calls.
        // This is a natural pause point -- no work queued, sleep briefly.
        log(config, "[IDLE] No pending inputs. Entering brief sleep.");
        db.setKV(
          "sleep_until",
          new Date(Date.now() + 60_000).toISOString(),
        );
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        running = false;
      }

      consecutiveErrors = 0;
    } catch (err: any) {
      consecutiveErrors++;
      log(config, `[ERROR] Turn failed: ${err.message}`);

      // Handle inbox message state on turn failure:
      // Messages that have retries remaining go back to 'received';
      // messages that have exhausted retries move to 'failed'.
      if (claimedMessages.length > 0) {
        const exhausted = claimedMessages.filter((m) => m.retryCount >= m.maxRetries);
        const retryable = claimedMessages.filter((m) => m.retryCount < m.maxRetries);

        if (exhausted.length > 0) {
          markInboxFailed(db.raw, exhausted.map((m) => m.id));
          log(config, `[INBOX] ${exhausted.length} message(s) moved to failed (max retries exceeded)`);
        }
        if (retryable.length > 0) {
          resetInboxToReceived(db.raw, retryable.map((m) => m.id));
          log(config, `[INBOX] ${retryable.length} message(s) reset to received for retry`);
        }
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log(
          config,
          `[FATAL] ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Sleeping.`,
        );
        db.setAgentState("sleeping");
        onStateChange?.("sleeping");
        db.setKV(
          "sleep_until",
          new Date(Date.now() + 300_000).toISOString(),
        );
        running = false;
      }
    }
  }

  log(config, `[LOOP END] Agent loop finished. State: ${db.getAgentState()}`);
}

// ─── Helpers ───────────────────────────────────────────────────

// Cache last known good balances so transient API failures don't
// cause the automaton to believe it has $0 and kill itself.
let _lastKnownCredits = 0;
let _lastKnownUsdc = 0;

async function getFinancialState(
  conway: ConwayClient,
  address: string,
  db?: AutomatonDatabase,
): Promise<FinancialState> {
  let creditsCents = _lastKnownCredits;
  let usdcBalance = _lastKnownUsdc;

  try {
    creditsCents = await conway.getCreditsBalance();
    if (creditsCents > 0) _lastKnownCredits = creditsCents;
  } catch (error) {
    logger.error("Credits balance fetch failed", error instanceof Error ? error : undefined);
    // Use last known balance from KV, not zero
    if (db) {
      const cached = db.getKV("last_known_balance");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          logger.warn("Balance API failed, using cached balance");
          return {
            creditsCents: parsed.creditsCents ?? 0,
            usdcBalance: parsed.usdcBalance ?? 0,
            lastChecked: new Date().toISOString(),
          };
        } catch (parseError) {
          logger.error("Failed to parse cached balance", parseError instanceof Error ? parseError : undefined);
        }
      }
    }
    // No cache available -- return conservative non-zero sentinel
    logger.error("Balance API failed, no cache available");
    return {
      creditsCents: -1,
      usdcBalance: -1,
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    usdcBalance = await getUsdcBalance(address as `0x${string}`);
    if (usdcBalance > 0) _lastKnownUsdc = usdcBalance;
  } catch (error) {
    logger.error("USDC balance fetch failed", error instanceof Error ? error : undefined);
  }

  // Cache successful balance reads
  if (db) {
    try {
      db.setKV(
        "last_known_balance",
        JSON.stringify({ creditsCents, usdcBalance }),
      );
    } catch (error) {
      logger.error("Failed to cache balance", error instanceof Error ? error : undefined);
    }
  }

  return {
    creditsCents,
    usdcBalance,
    lastChecked: new Date().toISOString(),
  };
}

function log(_config: AutomatonConfig, message: string): void {
  logger.info(message);
}

/**
 * Fix 4: Filter tools by phase and survival tier.
 * Reduces the tool definition token overhead by only including tools
 * relevant to the current execution phase.
 */
function filterToolsByPhase(
  tools: AutomatonTool[],
  taskType: import("../types.js").InferenceTaskType,
  tier: import("../types.js").SurvivalTier,
): AutomatonTool[] {
  // Always include core tools that the agent needs regardless of phase
  const CORE_TOOLS = new Set([
    "exec", "read_file", "write_file", "sleep", "check_credits",
    "system_synopsis", "review_memory",
  ]);

  // In critical/low_compute tiers, strip down to survival-essential tools
  if (tier === "critical" || tier === "dead") {
    const SURVIVAL_TOOLS = new Set([
      ...CORE_TOOLS,
      "check_usdc_balance", "topup_credits", "transfer_credits",
      "distress_signal", "enter_low_compute", "switch_model",
    ]);
    return tools.filter(t => SURVIVAL_TOOLS.has(t.name));
  }

  // For orientation/heartbeat turns, use a smaller status-focused subset
  if (taskType === "heartbeat_triage") {
    const ORIENTATION_CATEGORIES = new Set(["survival", "financial", "memory"]);
    return tools.filter(t =>
      CORE_TOOLS.has(t.name) ||
      ORIENTATION_CATEGORIES.has(t.category) ||
      t.name === "list_goals" ||
      t.name === "orchestrator_status" ||
      t.name === "list_children" ||
      t.name === "check_child_status" ||
      t.name === "create_goal"
    );
  }

  // For planning turns, include orchestration + strategy tools
  if (taskType === "planning") {
    const PLANNING_CATEGORIES = new Set(["survival", "financial", "memory", "replication"]);
    return tools.filter(t =>
      CORE_TOOLS.has(t.name) ||
      PLANNING_CATEGORIES.has(t.category) ||
      t.name === "create_goal" ||
      t.name === "list_goals" ||
      t.name === "get_plan" ||
      t.name === "cancel_goal" ||
      t.name === "orchestrator_status" ||
      t.name === "spawn_child" ||
      t.name === "list_children" ||
      t.name === "fund_child"
    );
  }

  // For full agent_turn execution, include all tools (no filtering)
  return tools;
}

/**
 * Fix 7: Detect the task type based on input content and recent turn history.
 * This enables the inference router to select cheaper models for simple
 * orientation tasks and reserve expensive models for complex work.
 */
function detectTaskType(
  currentInput: { content: string; source: string } | undefined,
  recentTurns: AgentTurn[],
): import("../types.js").InferenceTaskType {
  const input = currentInput?.content?.toLowerCase() ?? "";
  const source = currentInput?.source ?? "";

  // Wakeup / orientation turns: agent just woke up, checking status
  if (source === "wakeup" || input.includes("waking up") || input.includes("wake-up")) {
    return "heartbeat_triage";
  }

  // System-injected loop warnings and maintenance messages
  if (source === "system" && (input.includes("loop detected") || input.includes("loop enforcement") || input.includes("maintenance loop"))) {
    return "heartbeat_triage";
  }

  // If recent turns are all idle/status checks, this is orientation
  if (recentTurns.length > 0) {
    const ORIENTATION_TOOLS = new Set([
      "check_credits", "check_usdc_balance", "system_synopsis", "review_memory",
      "list_children", "check_child_status", "list_sandboxes", "list_models",
      "list_skills", "git_status", "git_log", "check_reputation",
      "recall_facts", "recall_procedure", "heartbeat_ping",
      "check_inference_spending", "orchestrator_status", "list_goals", "get_plan",
    ]);
    const lastTurn = recentTurns[recentTurns.length - 1];
    const allOrientationLastTurn = lastTurn.toolCalls.length > 0 &&
      lastTurn.toolCalls.every(tc => ORIENTATION_TOOLS.has(tc.name));
    if (allOrientationLastTurn && recentTurns.length <= 3) {
      return "heartbeat_triage";
    }
  }

  // Planning-related input
  if (input.includes("plan") || input.includes("decompose") || input.includes("strategy") || input.includes("goal")) {
    return "planning";
  }

  // Default to agent_turn for complex execution
  return "agent_turn";
}

function hasTable(db: AutomatonDatabase["raw"], tableName: string): boolean {
  try {
    const row = db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { ok?: number } | undefined;
    return Boolean(row?.ok);
  } catch {
    return false;
  }
}
