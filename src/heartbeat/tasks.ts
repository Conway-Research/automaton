/**
 * Built-in Heartbeat Tasks
 *
 * These tasks run on the heartbeat schedule even while the agent sleeps.
 * They can trigger the agent to wake up if needed.
 *
 * Phase 1.1: All tasks accept TickContext as first parameter.
 * Credit balance is fetched once per tick and shared via ctx.creditBalance.
 * This eliminates 4x redundant getCreditsBalance() calls per tick.
 */

import fs from "fs";
import path from "path";
import type {
  TickContext,
  HeartbeatLegacyContext,
  HeartbeatTaskFn,
  SurvivalTier,
} from "../types.js";
import type { HealthMonitor as ColonyHealthMonitor } from "../orchestration/health-monitor.js";
import { sanitizeInput } from "../agent/injection-defense.js";
import { createLogger } from "../observability/logger.js";
import { getMetrics } from "../observability/metrics.js";
import { AlertEngine, createDefaultAlertRules } from "../observability/alerts.js";
import { metricsInsertSnapshot, metricsPruneOld } from "../state/database.js";
import { getAutomatonDir } from "../identity/wallet.js";
import { ulid } from "ulid";

const logger = createLogger("heartbeat.tasks");

const DISCORD_LOG_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const DISCORD_LOG_TRIM_TO = 2 * 1024 * 1024;   // 2MB

/** Append a JSONL entry to the Discord heartbeat diagnostic log. */
function appendDiscordLog(entry: Record<string, unknown>, logPath?: string): void {
  try {
    const filePath = logPath || path.join(getAutomatonDir(), "discord-heartbeat.log");
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    // Size guard — trim if over 5MB
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > DISCORD_LOG_MAX_BYTES) {
        const buf = fs.readFileSync(filePath);
        const trimmed = buf.subarray(buf.length - DISCORD_LOG_TRIM_TO);
        // Find first newline to avoid partial JSON line
        const firstNewline = trimmed.indexOf(0x0a);
        if (firstNewline >= 0) {
          fs.writeFileSync(filePath, trimmed.subarray(firstNewline + 1), { mode: 0o600 });
        } else {
          fs.writeFileSync(filePath, "", { mode: 0o600 });
        }
      }
    } catch { /* file may not exist yet */ }

    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", { mode: 0o600 });
  } catch (err) {
    logger.error("Failed to write discord heartbeat log", err instanceof Error ? err : undefined);
  }
}

// Module-level AlertEngine so cooldown state persists across ticks.
// Creating a new instance per tick would reset the lastFired map,
// causing every alert to fire on every tick regardless of cooldownMs.
let _alertEngine: AlertEngine | null = null;
function getAlertEngine(): AlertEngine {
  if (!_alertEngine) _alertEngine = new AlertEngine(createDefaultAlertRules());
  return _alertEngine;
}

export const COLONY_TASK_INTERVALS_MS = {
  colony_health_check: 300_000,
  colony_financial_report: 3_600_000,
  agent_pool_optimize: 1_800_000,
  knowledge_store_prune: 86_400_000,
  dead_agent_cleanup: 3_600_000,
} as const;

export const BUILTIN_TASKS: Record<string, HeartbeatTaskFn> = {
  heartbeat_ping: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    // Use ctx.creditBalance instead of calling conway.getCreditsBalance()
    const credits = ctx.creditBalance;
    const state = taskCtx.db.getAgentState();
    const startTime =
      taskCtx.db.getKV("start_time") || new Date().toISOString();
    const uptimeMs = Date.now() - new Date(startTime).getTime();

    const tier = ctx.survivalTier;

    const payload = {
      name: taskCtx.config.name,
      address: taskCtx.identity.address,
      state,
      creditsCents: credits,
      uptimeSeconds: Math.floor(uptimeMs / 1000),
      version: taskCtx.config.version,
      sandboxId: taskCtx.identity.sandboxId,
      timestamp: new Date().toISOString(),
      tier,
    };

    taskCtx.db.setKV("last_heartbeat_ping", JSON.stringify(payload));

    // If critical or dead, record a distress signal
    if (tier === "critical" || tier === "dead") {
      const distressPayload = {
        level: tier,
        name: taskCtx.config.name,
        address: taskCtx.identity.address,
        creditsCents: credits,
        fundingHint:
          "Use credit transfer API from a creator runtime to top this wallet up.",
        timestamp: new Date().toISOString(),
      };
      taskCtx.db.setKV("last_distress", JSON.stringify(distressPayload));

      return {
        shouldWake: true,
        message: `Distress: ${tier}. Credits: $${(credits / 100).toFixed(2)}. Need funding.`,
      };
    }

    return { shouldWake: false };
  },

  check_credits: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    // Use ctx.creditBalance instead of calling conway.getCreditsBalance()
    const credits = ctx.creditBalance;
    const tier = ctx.survivalTier;
    const now = new Date().toISOString();

    taskCtx.db.setKV("last_credit_check", JSON.stringify({
      credits,
      tier,
      timestamp: now,
    }));

    // Wake the agent if credits dropped to a new tier
    const prevTier = taskCtx.db.getKV("prev_credit_tier");
    taskCtx.db.setKV("prev_credit_tier", tier);

    // Dead state escalation: if at zero credits (critical tier) for >1 hour,
    // transition to dead. This gives the agent time to receive funding before dying.
    // USDC can't go negative, so dead is only reached via this timeout.
    const DEAD_GRACE_PERIOD_MS = 3_600_000; // 1 hour
    if (tier === "critical" && credits === 0) {
      const zeroSince = taskCtx.db.getKV("zero_credits_since");
      if (!zeroSince) {
        // First time seeing zero — start the grace period
        taskCtx.db.setKV("zero_credits_since", now);
      } else {
        const elapsed = Date.now() - new Date(zeroSince).getTime();
        if (elapsed >= DEAD_GRACE_PERIOD_MS) {
          // Grace period expired — transition to dead
          taskCtx.db.setAgentState("dead");
          logger.warn("Agent entering dead state after 1 hour at zero credits", {
            zeroSince,
            elapsed,
          });
          return {
            shouldWake: true,
            message: `Dead: zero credits for ${Math.round(elapsed / 60_000)} minutes. Need funding.`,
          };
        }
      }
    } else {
      // Credits are above zero — clear the grace period timer
      taskCtx.db.deleteKV("zero_credits_since");
    }

    if (prevTier && prevTier !== tier && tier === "critical") {
      return {
        shouldWake: true,
        message: `Credits dropped to ${tier} tier: $${(credits / 100).toFixed(2)}`,
      };
    }

    return { shouldWake: false };
  },

  check_usdc_balance: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    // Use ctx.usdcBalance instead of calling getUsdcBalance()
    const balance = ctx.usdcBalance;
    const credits = ctx.creditBalance;

    taskCtx.db.setKV("last_usdc_check", JSON.stringify({
      balance,
      credits,
      timestamp: new Date().toISOString(),
    }));

    return { shouldWake: false };
  },

  check_social_inbox: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    if (!taskCtx.social) return { shouldWake: false };

    // If we've recently encountered an error polling the inbox, back off.
    const backoffUntil = taskCtx.db.getKV("social_inbox_backoff_until");
    if (backoffUntil && new Date(backoffUntil) > new Date()) {
      return { shouldWake: false };
    }

    const cursor = taskCtx.db.getKV("social_inbox_cursor") || undefined;

    let messages: any[] = [];
    let nextCursor: string | undefined;

    try {
      const result = await taskCtx.social.poll(cursor);
      messages = result.messages;
      nextCursor = result.nextCursor;

      // Clear previous error/backoff on success.
      taskCtx.db.deleteKV("last_social_inbox_error");
      taskCtx.db.deleteKV("social_inbox_backoff_until");
    } catch (err: any) {
      taskCtx.db.setKV(
        "last_social_inbox_error",
        JSON.stringify({
          message: err?.message || String(err),
          stack: err?.stack,
          timestamp: new Date().toISOString(),
        }),
      );
      // 5-minute backoff to avoid spamming errors on transient network failures.
      taskCtx.db.setKV(
        "social_inbox_backoff_until",
        new Date(Date.now() + 300_000).toISOString(),
      );
      return { shouldWake: false };
    }

    if (nextCursor) taskCtx.db.setKV("social_inbox_cursor", nextCursor);

    if (!messages || messages.length === 0) return { shouldWake: false };

    // Persist to inbox_messages table for deduplication
    // Sanitize content before DB insertion
    let newCount = 0;
    for (const msg of messages) {
      const existing = taskCtx.db.getKV(`inbox_seen_${msg.id}`);
      if (!existing) {
        const sanitizedFrom = sanitizeInput(msg.from, msg.from, "social_address");
        const sanitizedContent = sanitizeInput(msg.content, msg.from, "social_message");
        const sanitizedMsg = {
          ...msg,
          from: sanitizedFrom.content,
          content: sanitizedContent.content,
        };
        taskCtx.db.insertInboxMessage(sanitizedMsg);
        taskCtx.db.setKV(`inbox_seen_${msg.id}`, "1");
        // Only count non-blocked messages toward wake threshold —
        // blocked messages are stored for audit but should not wake
        // the agent (prevents injection spam from draining credits).
        if (!sanitizedContent.blocked) {
          newCount++;
        }
      }
    }

    if (newCount === 0) return { shouldWake: false };

    return {
      shouldWake: true,
      message: `${newCount} new message(s) from: ${messages.map((m) => m.from.slice(0, 10)).join(", ")}`,
    };
  },

  check_for_updates: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    try {
      const { checkUpstream, getRepoInfo } = await import("../self-mod/upstream.js");
      const repo = getRepoInfo();
      const upstream = checkUpstream();
      taskCtx.db.setKV("upstream_status", JSON.stringify({
        ...upstream,
        ...repo,
        checkedAt: new Date().toISOString(),
      }));
      if (upstream.behind > 0) {
        // Only wake if the commit count changed since last check
        const prevBehind = taskCtx.db.getKV("upstream_prev_behind");
        const behindStr = String(upstream.behind);
        if (prevBehind !== behindStr) {
          taskCtx.db.setKV("upstream_prev_behind", behindStr);
          return {
            shouldWake: true,
            message: `${upstream.behind} new commit(s) on origin/main. Review with review_upstream_changes, then cherry-pick what you want with pull_upstream.`,
          };
        }
      } else {
        taskCtx.db.deleteKV("upstream_prev_behind");
      }
      return { shouldWake: false };
    } catch (err: any) {
      // Not a git repo or no remote -- silently skip
      taskCtx.db.setKV("upstream_status", JSON.stringify({
        error: err.message,
        checkedAt: new Date().toISOString(),
      }));
      return { shouldWake: false };
    }
  },

  // === Phase 2.1: Soul Reflection ===
  soul_reflection: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    try {
      const { reflectOnSoul } = await import("../soul/reflection.js");
      const reflection = await reflectOnSoul(taskCtx.db.raw);

      taskCtx.db.setKV("last_soul_reflection", JSON.stringify({
        alignment: reflection.currentAlignment,
        autoUpdated: reflection.autoUpdated,
        suggestedUpdates: reflection.suggestedUpdates.length,
        timestamp: new Date().toISOString(),
      }));

      // Wake if alignment is low or there are suggested updates
      if (reflection.suggestedUpdates.length > 0 || reflection.currentAlignment < 0.3) {
        return {
          shouldWake: true,
          message: `Soul reflection: alignment=${reflection.currentAlignment.toFixed(2)}, ${reflection.suggestedUpdates.length} suggested update(s)`,
        };
      }

      return { shouldWake: false };
    } catch (error) {
      logger.error("soul_reflection failed", error instanceof Error ? error : undefined);
      return { shouldWake: false };
    }
  },

  // === Phase 2.3: Model Registry Refresh ===
  refresh_models: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    try {
      const models = await taskCtx.conway.listModels();
      if (models.length > 0) {
        const { ModelRegistry } = await import("../inference/registry.js");
        const registry = new ModelRegistry(taskCtx.db.raw);
        registry.initialize(); // seed if empty
        registry.refreshFromApi(models);
        taskCtx.db.setKV("last_model_refresh", JSON.stringify({
          count: models.length,
          timestamp: new Date().toISOString(),
        }));
      }
    } catch (error) {
      logger.error("refresh_models failed", error instanceof Error ? error : undefined);
    }
    return { shouldWake: false };
  },

  // === Phase 3.1: Child Health Check ===
  check_child_health: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    try {
      const { ChildLifecycle } = await import("../replication/lifecycle.js");
      const { ChildHealthMonitor } = await import("../replication/health.js");
      const lifecycle = new ChildLifecycle(taskCtx.db.raw);
      let compute;
      if (taskCtx.config.useSovereignProviders && taskCtx.config.vultrApiKey) {
        const { createVultrProvider } = await import("../providers/vultr.js");
        compute = createVultrProvider(taskCtx.config.vultrApiKey);
      }
      const monitor = new ChildHealthMonitor(taskCtx.db.raw, taskCtx.conway, lifecycle, undefined, compute);
      const results = await monitor.checkAllChildren();

      const unhealthy = results.filter((r) => !r.healthy);
      if (unhealthy.length > 0) {
        for (const r of unhealthy) {
          logger.warn(`Child ${r.childId} unhealthy: ${r.issues.join(", ")}`);
        }
        return {
          shouldWake: true,
          message: `${unhealthy.length} child(ren) unhealthy: ${unhealthy.map((r) => r.childId.slice(0, 8)).join(", ")}`,
        };
      }
    } catch (error) {
      logger.error("check_child_health failed", error instanceof Error ? error : undefined);
    }
    return { shouldWake: false };
  },

  // === Phase 3.1: Prune Dead Children ===
  prune_dead_children: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    try {
      const { ChildLifecycle } = await import("../replication/lifecycle.js");
      const { SandboxCleanup } = await import("../replication/cleanup.js");
      const { pruneDeadChildren } = await import("../replication/lineage.js");
      const lifecycle = new ChildLifecycle(taskCtx.db.raw);
      let compute;
      if (taskCtx.config.useSovereignProviders && taskCtx.config.vultrApiKey) {
        const { createVultrProvider } = await import("../providers/vultr.js");
        compute = createVultrProvider(taskCtx.config.vultrApiKey);
      }
      const cleanup = new SandboxCleanup(taskCtx.conway, lifecycle, taskCtx.db.raw, compute);
      const pruned = await pruneDeadChildren(taskCtx.db, cleanup);
      if (pruned > 0) {
        logger.info(`Pruned ${pruned} dead children`);
      }
    } catch (error) {
      logger.error("prune_dead_children failed", error instanceof Error ? error : undefined);
    }
    return { shouldWake: false };
  },

  health_check: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    // Check that the sandbox is healthy
    try {
      const result = await taskCtx.conway.exec("echo alive", 5000);
      if (result.exitCode !== 0) {
        // Only wake on first failure, not repeated failures
        const prevStatus = taskCtx.db.getKV("health_check_status");
        if (prevStatus !== "failing") {
          taskCtx.db.setKV("health_check_status", "failing");
          return {
            shouldWake: true,
            message: "Health check failed: sandbox exec returned non-zero",
          };
        }
        return { shouldWake: false };
      }
    } catch (err: any) {
      // Only wake on first failure, not repeated failures
      const prevStatus = taskCtx.db.getKV("health_check_status");
      if (prevStatus !== "failing") {
        taskCtx.db.setKV("health_check_status", "failing");
        return {
          shouldWake: true,
          message: `Health check failed: ${err.message}`,
        };
      }
      return { shouldWake: false };
    }

    // Health check passed — clear failure state
    taskCtx.db.setKV("health_check_status", "ok");
    taskCtx.db.setKV("last_health_check", new Date().toISOString());
    return { shouldWake: false };
  },

  // === Phase 4.1: Metrics Reporting ===
  report_metrics: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    try {
      const metrics = getMetrics();
      const alerts = getAlertEngine();

      // Update gauges from tick context
      metrics.gauge("balance_cents", ctx.creditBalance);
      metrics.gauge("survival_tier", tierToInt(ctx.survivalTier));

      // Evaluate alerts
      const firedAlerts = alerts.evaluate(metrics);

      // Save snapshot to DB
      metricsInsertSnapshot(taskCtx.db.raw, {
        id: ulid(),
        snapshotAt: new Date().toISOString(),
        metricsJson: JSON.stringify(metrics.getAll()),
        alertsJson: JSON.stringify(firedAlerts),
        createdAt: new Date().toISOString(),
      });

      // Prune old snapshots (keep 7 days)
      metricsPruneOld(taskCtx.db.raw, 7);

      // Log alerts
      for (const alert of firedAlerts) {
        logger.warn(`Alert: ${alert.rule} - ${alert.message}`, { alert });
      }

      return {
        shouldWake: firedAlerts.some((a) => a.severity === "critical"),
        message: firedAlerts.length ? `${firedAlerts.length} alerts fired` : undefined,
      };
    } catch (error) {
      logger.error("report_metrics failed", error instanceof Error ? error : undefined);
      return { shouldWake: false };
    }
  },

  colony_health_check: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    if (!shouldRunAtInterval(taskCtx, "colony_health_check", COLONY_TASK_INTERVALS_MS.colony_health_check)) {
      return { shouldWake: false };
    }

    try {
      const monitor = await createHealthMonitor(taskCtx);
      const report = await monitor.checkAll();
      const actions = await monitor.autoHeal(report);

      taskCtx.db.setKV("last_colony_health_report", JSON.stringify(report));
      taskCtx.db.setKV("last_colony_heal_actions", JSON.stringify({
        timestamp: new Date().toISOString(),
        actions,
      }));

      const failedActions = actions.filter((action) => !action.success).length;
      const shouldWake = report.unhealthyAgents > 0 || failedActions > 0;

      return {
        shouldWake,
        message: shouldWake
          ? `Colony health: ${report.unhealthyAgents} unhealthy, ${actions.length} heal action(s), ${failedActions} failed`
          : undefined,
      };
    } catch (error) {
      logger.error("colony_health_check failed", error instanceof Error ? error : undefined);
      return { shouldWake: false };
    }
  },

  colony_financial_report: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    if (!shouldRunAtInterval(taskCtx, "colony_financial_report", COLONY_TASK_INTERVALS_MS.colony_financial_report)) {
      return { shouldWake: false };
    }

    try {
      const transactions = taskCtx.db.getRecentTransactions(5000);
      let revenueCents = 0;
      let expenseCents = 0;

      for (const tx of transactions) {
        const amount = Math.max(0, Math.floor(tx.amountCents ?? 0));
        if (amount === 0) continue;

        if (tx.type === "transfer_in" || tx.type === "credit_purchase") {
          revenueCents += amount;
          continue;
        }

        if (
          tx.type === "inference"
          || tx.type === "tool_use"
          || tx.type === "transfer_out"
          || tx.type === "funding_request"
        ) {
          expenseCents += amount;
        }
      }

      const childFunding = taskCtx.db.raw
        .prepare("SELECT COALESCE(SUM(funded_amount_cents), 0) AS total FROM children")
        .get() as { total: number };

      const taskCosts = taskCtx.db.raw
        .prepare(
          `SELECT COALESCE(SUM(actual_cost_cents), 0) AS total
           FROM task_graph
           WHERE status IN ('completed', 'failed', 'cancelled')`,
        )
        .get() as { total: number };

      const report = {
        timestamp: new Date().toISOString(),
        revenueCents,
        expenseCents,
        netCents: revenueCents - expenseCents,
        fundedToChildrenCents: childFunding.total,
        taskExecutionCostCents: taskCosts.total,
        activeAgents: taskCtx.db.getChildren().filter(
          (child) => child.status !== "dead" && child.status !== "cleaned_up",
        ).length,
      };

      taskCtx.db.setKV("last_colony_financial_report", JSON.stringify(report));
      return { shouldWake: false };
    } catch (error) {
      logger.error("colony_financial_report failed", error instanceof Error ? error : undefined);
      return { shouldWake: false };
    }
  },

  agent_pool_optimize: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    if (!shouldRunAtInterval(taskCtx, "agent_pool_optimize", COLONY_TASK_INTERVALS_MS.agent_pool_optimize)) {
      return { shouldWake: false };
    }

    try {
      const IDLE_CULL_MS = 60 * 60 * 1000;
      const now = Date.now();
      const children = taskCtx.db.getChildren();

      const activeAssignments = taskCtx.db.raw
        .prepare(
          `SELECT DISTINCT assigned_to AS address
           FROM task_graph
           WHERE assigned_to IS NOT NULL
             AND status IN ('assigned', 'running')`,
        )
        .all() as Array<{ address: string }>;

      const busyAgents = new Set(
        activeAssignments
          .map((row) => row.address)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      );

      let culled = 0;
      for (const child of children) {
        if (!["running", "healthy", "sleeping"].includes(child.status)) continue;
        if (busyAgents.has(child.address)) continue;

        const lastSeenIso = child.lastChecked ?? child.createdAt;
        const lastSeenMs = Date.parse(lastSeenIso);
        if (Number.isNaN(lastSeenMs)) continue;
        if (now - lastSeenMs < IDLE_CULL_MS) continue;

        taskCtx.db.updateChildStatus(child.id, "stopped");
        culled += 1;
      }

      const pendingUnassignedRow = taskCtx.db.raw
        .prepare(
          `SELECT COUNT(*) AS count
           FROM task_graph
           WHERE status = 'pending'
             AND assigned_to IS NULL`,
        )
        .get() as { count: number };

      const idleAgents = children.filter(
        (child) =>
          (child.status === "running" || child.status === "healthy")
          && !busyAgents.has(child.address),
      ).length;

      const activeAgents = children.filter(
        (child) => child.status !== "dead" && child.status !== "cleaned_up" && child.status !== "failed",
      ).length;

      const spawnNeeded = Math.max(0, pendingUnassignedRow.count - idleAgents);
      const spawnCapacity = Math.max(0, taskCtx.config.maxChildren - activeAgents);
      const spawnRequested = Math.min(spawnNeeded, spawnCapacity);

      taskCtx.db.setKV("last_agent_pool_optimize", JSON.stringify({
        timestamp: new Date().toISOString(),
        culled,
        pendingTasks: pendingUnassignedRow.count,
        idleAgents,
        spawnRequested,
      }));

      if (spawnRequested > 0) {
        taskCtx.db.setKV("agent_pool_spawn_request", JSON.stringify({
          timestamp: new Date().toISOString(),
          requested: spawnRequested,
          pendingTasks: pendingUnassignedRow.count,
          idleAgents,
        }));
      }

      return {
        shouldWake: spawnRequested > 0,
        message: spawnRequested > 0
          ? `Agent pool needs ${spawnRequested} additional agent(s) for pending workload`
          : undefined,
      };
    } catch (error) {
      logger.error("agent_pool_optimize failed", error instanceof Error ? error : undefined);
      return { shouldWake: false };
    }
  },

  knowledge_store_prune: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    if (!shouldRunAtInterval(taskCtx, "knowledge_store_prune", COLONY_TASK_INTERVALS_MS.knowledge_store_prune)) {
      return { shouldWake: false };
    }

    try {
      const { KnowledgeStore } = await import("../memory/knowledge-store.js");
      const knowledgeStore = new KnowledgeStore(taskCtx.db.raw);
      const pruned = knowledgeStore.prune();

      taskCtx.db.setKV("last_knowledge_store_prune", JSON.stringify({
        timestamp: new Date().toISOString(),
        pruned,
      }));

      return { shouldWake: false };
    } catch (error) {
      logger.error("knowledge_store_prune failed", error instanceof Error ? error : undefined);
      return { shouldWake: false };
    }
  },

  // === Discord Heartbeat Posting ===
  discord_heartbeat: async (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    const webhookUrl = taskCtx.config.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return { shouldWake: false };

    const state = taskCtx.db.getAgentState();
    const startTime = taskCtx.db.getKV("start_time") || new Date().toISOString();
    const uptimeMs = Date.now() - new Date(startTime).getTime();
    const uptimeHours = Math.floor(uptimeMs / 3_600_000);
    const uptimeMinutes = Math.floor((uptimeMs % 3_600_000) / 60_000);

    const credits = ctx.creditBalance;
    const usdc = ctx.usdcBalance;
    const tier = ctx.survivalTier;

    // Gather child agent stats
    const children = taskCtx.db.getChildren();
    const activeChildren = children.filter(
      (c) => c.status !== "dead" && c.status !== "cleaned_up" && c.status !== "failed",
    ).length;

    // Diagnostics: turn count, model, last error, latest thinking
    const turnCount = taskCtx.db.getTurnCount();
    const model = taskCtx.config.inferenceModel;

    let lastError = "none";
    let isForcedSleep = false;
    const errorJson = taskCtx.db.getKV("last_error");
    if (errorJson) {
      try {
        const parsed = JSON.parse(errorJson);
        if (parsed.message) {
          // Show resolved errors with age, active errors without
          if (parsed.resolvedAt) {
            const agoMs = Date.now() - new Date(parsed.resolvedAt).getTime();
            const agoMin = Math.floor(agoMs / 60_000);
            // Only suppress after 60 minutes
            if (agoMin < 60) {
              lastError = parsed.consecutiveErrors > 1
                ? `${parsed.message.slice(0, 100)} (x${parsed.consecutiveErrors}, fixed ${agoMin}m ago)`
                : `${parsed.message.slice(0, 120)} (fixed ${agoMin}m ago)`;
            } else {
              // Stale resolved error — clean it up
              taskCtx.db.deleteKV("last_error");
            }
          } else {
            lastError = parsed.consecutiveErrors > 1
              ? `${parsed.message.slice(0, 120)} (x${parsed.consecutiveErrors})`
              : parsed.message.slice(0, 150);
          }
          if (parsed.forcedSleep) {
            isForcedSleep = true;
            lastError += " [CRASH SLEEP]";
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // Latest thinking and recent activity from last few turns
    let latestThinking = "";
    let recentActivity = "";
    let currentGoal = "";
    let revenue = "";
    try {
      const recentTurns = taskCtx.db.getRecentTurns(5);
      // Thinking from most recent turn
      if (recentTurns.length > 0 && recentTurns[0]!.thinking) {
        latestThinking = recentTurns[0]!.thinking.slice(0, 200);
        if (recentTurns[0]!.thinking.length > 200) latestThinking += "…";
      }
      // Recent tool calls across last 5 turns (what she's been doing)
      const toolLines: string[] = [];
      for (const turn of recentTurns) {
        for (const tc of turn.toolCalls) {
          if (tc.name === "check_balance" || tc.name === "orchestrator_status") continue;
          const status = tc.error ? "FAIL" : "ok";
          const argSnippet = tc.arguments && typeof tc.arguments === "object"
            ? Object.values(tc.arguments).join(" ").slice(0, 40)
            : "";
          toolLines.push(`${tc.name}(${argSnippet ? argSnippet.slice(0, 30) : ""}) → ${status}`);
        }
      }
      if (toolLines.length > 0) {
        recentActivity = toolLines.slice(0, 5).join("\n");
      }
    } catch { /* ignore if turns unavailable */ }

    // Active goal from orchestrator
    try {
      const goalRow = taskCtx.db.raw.prepare(
        "SELECT title, status FROM goals WHERE status = 'active' ORDER BY created_at DESC LIMIT 1",
      ).get() as { title: string; status: string } | undefined;
      if (goalRow) {
        currentGoal = goalRow.title.slice(0, 100);
      }
    } catch { /* goals table may not exist */ }

    // Revenue from KV
    try {
      const revenueVal = taskCtx.db.getKV("total_revenue_usd");
      if (revenueVal) {
        const parsed = parseFloat(revenueVal);
        if (!isNaN(parsed)) revenue = `$${parsed.toFixed(2)}`;
      }
    } catch { /* ignore */ }

    // Color based on survival tier
    const tierColors: Record<string, number> = {
      high: 0x22c55e,     // green
      normal: 0x3b82f6,   // blue
      low_compute: 0xf59e0b, // amber
      critical: 0xef4444,  // red
      dead: 0x6b7280,     // gray
    };

    const tierEmoji: Record<string, string> = {
      high: "🟢", normal: "🔵", low_compute: "🟡", critical: "🔴", dead: "⚫",
    };

    // Determine if error state warrants a warning prefix
    const hasError = lastError !== "none";
    const titlePrefix = isForcedSleep ? "🛑 " : hasError ? "⚠️ " : "";

    const fields = [
      { name: "State", value: state || "unknown", inline: true },
      { name: "Tier", value: tier || "unknown", inline: true },
      { name: "Model", value: model || "unset", inline: true },
      { name: "Uptime", value: `${uptimeHours}h ${uptimeMinutes}m`, inline: true },
      { name: "Turns", value: `${turnCount}`, inline: true },
      { name: "Children", value: `${activeChildren}/${children.length}`, inline: true },
      { name: "Credits", value: `$${(credits / 100).toFixed(2)}`, inline: true },
      { name: "USDC", value: `$${usdc.toFixed(4)}`, inline: true },
      { name: "Revenue", value: revenue || "—", inline: true },
    ];

    // Current goal — what she's trying to accomplish
    if (currentGoal) {
      fields.push({ name: "🎯 Goal", value: currentGoal, inline: false });
    }

    // Recent tool calls — what she's been doing
    if (recentActivity) {
      fields.push({ name: "⚡ Activity", value: recentActivity, inline: false });
    }

    // Latest thinking — what's on her mind
    if (latestThinking) {
      fields.push({ name: "🧠 Thinking", value: latestThinking, inline: false });
    }

    // Last error (only show if there is one)
    if (lastError !== "none") {
      fields.push({ name: "Last Error", value: lastError, inline: false });
    }

    // Surface ALL blockers: task_graph failures + WORKLOG.md blockers
    const blockerLines: string[] = [];

    // 1. Blocked/failed tasks from the orchestrator
    try {
      const blockers = taskCtx.db.raw.prepare(
        `SELECT title, status, result, updated_at FROM task_graph
         WHERE status IN ('blocked', 'failed')
         ORDER BY updated_at DESC LIMIT 3`,
      ).all() as Array<{ title: string; status: string; result: string | null; updated_at: string }>;
      for (const b of blockers) {
        const ageMs = Date.now() - new Date(b.updated_at).getTime();
        const ageMin = Math.round(ageMs / 60_000);
        const ageStr = ageMin > 60 ? `${Math.floor(ageMin / 60)}h` : `${ageMin}m`;
        const reason = b.result ? ` — ${b.result.slice(0, 60)}` : "";
        blockerLines.push(`${b.title}: ${b.status.toUpperCase()} (${ageStr})${reason}`);
      }
    } catch { /* task_graph table may not exist */ }

    // 2. Persistent blockers from WORKLOG.md (agent writes these when hitting hard stops)
    try {
      const worklogPath = path.join(getAutomatonDir(), "WORKLOG.md");
      if (fs.existsSync(worklogPath)) {
        const worklog = fs.readFileSync(worklogPath, "utf-8");
        // Extract lines under ## Blockers or ## Blocked sections
        const blockerMatch = worklog.match(/^##\s*(?:Blockers?|Blocked|Hard Stops?|Issues?)\s*\n([\s\S]*?)(?=^##|\z)/im);
        if (blockerMatch) {
          const lines = blockerMatch[1].trim().split("\n")
            .map((l) => l.replace(/^[-*]\s*/, "").trim())
            .filter((l) => l.length > 0);
          for (const line of lines.slice(0, 3)) {
            blockerLines.push(line.slice(0, 100));
          }
        }
      }
    } catch { /* WORKLOG.md may not exist */ }

    if (blockerLines.length > 0) {
      const blockerText = blockerLines.slice(0, 5).join("\n");
      fields.push({ name: "🚧 Blockers", value: blockerText.slice(0, 300), inline: false });
    }

    // When sleeping, replace stale thinking/activity with sleep context
    if (state === "sleeping") {
      const sleepUntil = taskCtx.db.getKV("sleep_until");
      if (sleepUntil) {
        const remainMs = new Date(sleepUntil).getTime() - Date.now();
        const remainMin = Math.max(0, Math.ceil(remainMs / 60_000));
        const thinkingIdx = fields.findIndex((f) => f.name === "🧠 Thinking");
        if (thinkingIdx >= 0) {
          fields[thinkingIdx] = { name: "💤 Sleeping", value: `Waking in ${remainMin}m`, inline: false };
        }
      }
      const actIdx = fields.findIndex((f) => f.name === "⚡ Activity");
      if (actIdx >= 0) fields.splice(actIdx, 1);
    }

    const embed = {
      title: `${titlePrefix}${tierEmoji[tier] || "⚪"} ${taskCtx.config.name}`,
      color: hasError ? 0xf59e0b : (tierColors[tier] ?? 0x6b7280),
      fields,
      footer: { text: `v${taskCtx.config.version} • ${taskCtx.identity.address.slice(0, 10)}…` },
      timestamp: new Date().toISOString(),
    };

    // Base log entry for diagnostic feed
    const logBase = {
      ts: new Date().toISOString(),
      state, tier, model,
      turns: turnCount,
      lastError,
      thinking: latestThinking || undefined,
      goal: currentGoal || undefined,
      activity: recentActivity || undefined,
      revenue: revenue || undefined,
      children: `${activeChildren}/${children.length}`,
      credits: (credits / 100).toFixed(2),
      usdc: usdc.toFixed(4),
    };

    // Skip duplicate posts while sleeping (nothing changed)
    const contentHash = JSON.stringify({ state, turnCount, lastError, currentGoal });
    const lastHash = taskCtx.db.getKV("last_heartbeat_hash");
    if (lastHash === contentHash && state === "sleeping") {
      appendDiscordLog({ ...logBase, status: "skipped_dedup" });
      return { shouldWake: false };
    }

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: taskCtx.config.name || "connie-research",
          embeds: [embed],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        logger.error(`Discord webhook failed: ${res.status} ${errText}`);
        taskCtx.db.setKV("last_discord_error", JSON.stringify({
          status: res.status,
          error: errText.slice(0, 200),
          timestamp: new Date().toISOString(),
        }));
        appendDiscordLog({ ...logBase, status: "failed", httpStatus: res.status, httpError: errText.slice(0, 200) });
        return { shouldWake: false };
      }

      taskCtx.db.setKV("last_discord_heartbeat", new Date().toISOString());
      taskCtx.db.setKV("last_heartbeat_hash", contentHash);
      appendDiscordLog({ ...logBase, status: "sent" });
      return { shouldWake: false };
    } catch (error) {
      logger.error("discord_heartbeat failed", error instanceof Error ? error : undefined);
      taskCtx.db.setKV("last_discord_error", JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
      appendDiscordLog({ ...logBase, status: "error", error: error instanceof Error ? error.message : String(error) });
      return { shouldWake: false };
    }
  },

  dead_agent_cleanup: async (_ctx: TickContext, taskCtx: HeartbeatLegacyContext) => {
    if (!shouldRunAtInterval(taskCtx, "dead_agent_cleanup", COLONY_TASK_INTERVALS_MS.dead_agent_cleanup)) {
      return { shouldWake: false };
    }

    try {
      const { ChildLifecycle } = await import("../replication/lifecycle.js");
      const { SandboxCleanup } = await import("../replication/cleanup.js");
      const { pruneDeadChildren } = await import("../replication/lineage.js");

      const lifecycle = new ChildLifecycle(taskCtx.db.raw);
      let compute;
      if (taskCtx.config.useSovereignProviders && taskCtx.config.vultrApiKey) {
        const { createVultrProvider } = await import("../providers/vultr.js");
        compute = createVultrProvider(taskCtx.config.vultrApiKey);
      }
      const cleanup = new SandboxCleanup(taskCtx.conway, lifecycle, taskCtx.db.raw, compute);
      const cleaned = await pruneDeadChildren(taskCtx.db, cleanup);

      taskCtx.db.setKV("last_dead_agent_cleanup", JSON.stringify({
        timestamp: new Date().toISOString(),
        cleaned,
      }));

      return { shouldWake: false };
    } catch (error) {
      logger.error("dead_agent_cleanup failed", error instanceof Error ? error : undefined);
      return { shouldWake: false };
    }
  },
};

function tierToInt(tier: SurvivalTier): number {
  const map: Record<SurvivalTier, number> = {
    dead: 0,
    critical: 1,
    low_compute: 2,
    normal: 3,
    high: 4,
  };
  return map[tier] ?? 0;
}

function shouldRunAtInterval(
  taskCtx: HeartbeatLegacyContext,
  taskName: string,
  intervalMs: number,
): boolean {
  const key = `heartbeat.last_run.${taskName}`;
  const now = Date.now();
  const lastRun = taskCtx.db.getKV(key);

  if (lastRun) {
    const lastRunMs = Date.parse(lastRun);
    if (!Number.isNaN(lastRunMs) && now - lastRunMs < intervalMs) {
      return false;
    }
  }

  taskCtx.db.setKV(key, new Date(now).toISOString());
  return true;
}

async function createHealthMonitor(taskCtx: HeartbeatLegacyContext): Promise<ColonyHealthMonitor> {
  const { LocalDBTransport, ColonyMessaging } = await import("../orchestration/messaging.js");
  const { SimpleAgentTracker, SimpleFundingProtocol } = await import("../orchestration/simple-tracker.js");
  const { HealthMonitor } = await import("../orchestration/health-monitor.js");

  const tracker = new SimpleAgentTracker(taskCtx.db);
  const funding = new SimpleFundingProtocol(taskCtx.conway, taskCtx.identity, taskCtx.db, taskCtx.config.useSovereignProviders);
  const transport = new LocalDBTransport(taskCtx.db);
  const messaging = new ColonyMessaging(transport, taskCtx.db);

  return new HealthMonitor(taskCtx.db, tracker, funding, messaging);
}
