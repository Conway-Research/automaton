/**
 * Heartbeat Tests
 *
 * Tests for heartbeat tasks, especially the social inbox checker.
 * Phase 1.1: Updated to pass TickContext + HeartbeatLegacyContext.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BUILTIN_TASKS } from "../heartbeat/tasks.js";
import {
  MockConwayClient,
  MockSocialClient,
  createTestDb,
  createTestIdentity,
  createTestConfig,
} from "./mocks.js";
import type { AutomatonDatabase, InboxMessage, TickContext, HeartbeatLegacyContext } from "../types.js";

function createMockTickContext(db: AutomatonDatabase, overrides?: Partial<TickContext>): TickContext {
  return {
    tickId: "test-tick-1",
    startedAt: new Date(),
    creditBalance: 10_000,
    usdcBalance: 1.5,
    survivalTier: "normal",
    lowComputeMultiplier: 4,
    config: {
      entries: [],
      defaultIntervalMs: 60_000,
      lowComputeMultiplier: 4,
    },
    db: db.raw,
    ...overrides,
  };
}

describe("Heartbeat Tasks", () => {
  let db: AutomatonDatabase;
  let conway: MockConwayClient;

  beforeEach(() => {
    db = createTestDb();
    conway = new MockConwayClient();
  });

  afterEach(() => {
    db.close();
  });

  describe("check_social_inbox", () => {
    it("returns shouldWake false when no social client", async () => {
      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
        // no social client
      };

      const result = await BUILTIN_TASKS.check_social_inbox(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
    });

    it("polls and wakes when messages found", async () => {
      const social = new MockSocialClient();
      social.pollResponses.push({
        messages: [
          {
            id: "msg-1",
            from: "0xsender1",
            to: "0xrecipient",
            content: "Hey there!",
            signedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          {
            id: "msg-2",
            from: "0xsender2",
            to: "0xrecipient",
            content: "What's up?",
            signedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: new Date().toISOString(),
      });

      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
        social,
      };

      const result = await BUILTIN_TASKS.check_social_inbox(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(true);
      expect(result.message).toContain("2 new message(s)");

      // Verify messages were persisted to inbox
      const unprocessed = db.getUnprocessedInboxMessages(10);
      expect(unprocessed.length).toBe(2);
    });

    it("deduplicates messages", async () => {
      const social = new MockSocialClient();

      // First poll: returns msg-1
      social.pollResponses.push({
        messages: [
          {
            id: "msg-1",
            from: "0xsender1",
            to: "0xrecipient",
            content: "Hello!",
            signedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
      });

      // Second poll: returns same msg-1 again
      social.pollResponses.push({
        messages: [
          {
            id: "msg-1",
            from: "0xsender1",
            to: "0xrecipient",
            content: "Hello!",
            signedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
        social,
      };

      // First run
      const result1 = await BUILTIN_TASKS.check_social_inbox(tickCtx, taskCtx);
      expect(result1.shouldWake).toBe(true);

      // Second run — same message, should not wake
      const result2 = await BUILTIN_TASKS.check_social_inbox(tickCtx, taskCtx);
      expect(result2.shouldWake).toBe(false);

      // Only one inbox row
      const unprocessed = db.getUnprocessedInboxMessages(10);
      expect(unprocessed.length).toBe(1);
    });

    it("returns shouldWake false when no messages", async () => {
      const social = new MockSocialClient();
      social.pollResponses.push({ messages: [] });

      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
        social,
      };

      const result = await BUILTIN_TASKS.check_social_inbox(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
    });

    it("does not wake when all messages are blocked by sanitizer", async () => {
      const social = new MockSocialClient();
      // Message exceeding 50KB triggers the size_limit block
      const oversizedContent = "x".repeat(60_000);
      social.pollResponses.push({
        messages: [
          {
            id: "blocked-msg-1",
            from: "0xattacker",
            to: "0xrecipient",
            content: oversizedContent,
            signedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
        social,
      };

      const result = await BUILTIN_TASKS.check_social_inbox(tickCtx, taskCtx);

      // Blocked messages are stored for audit but should not wake the agent
      expect(result.shouldWake).toBe(false);
      // Message was still persisted
      const unprocessed = db.getUnprocessedInboxMessages(10);
      expect(unprocessed.length).toBe(1);
      expect(unprocessed[0].content).toContain("[BLOCKED:");
    });
  });

  // ─── heartbeat_ping ─────────────────────────────────────────

  describe("heartbeat_ping", () => {
    it("records ping and does not wake on normal tier", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 10_000,
        survivalTier: "normal",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.heartbeat_ping(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      const ping = db.getKV("last_heartbeat_ping");
      expect(ping).toBeDefined();
      const parsed = JSON.parse(ping!);
      expect(parsed.creditsCents).toBe(10_000);
      expect(parsed.tier).toBe("normal");
    });

    it("wakes on critical tier with distress signal", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 50,
        survivalTier: "critical",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.heartbeat_ping(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(true);
      expect(result.message).toContain("Distress");
      const distress = db.getKV("last_distress");
      expect(distress).toBeDefined();
    });

    it("wakes on dead tier with distress signal", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 0,
        survivalTier: "dead",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.heartbeat_ping(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(true);
      expect(result.message).toContain("dead");
    });
  });

  // ─── check_credits ──────────────────────────────────────────

  describe("check_credits", () => {
    it("does not wake when tier unchanged", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 10_000,
        survivalTier: "normal",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      // Set previous tier to same
      db.setKV("prev_credit_tier", "normal");

      const result = await BUILTIN_TASKS.check_credits(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      const check = db.getKV("last_credit_check");
      expect(check).toBeDefined();
    });

    it("wakes when tier drops to critical", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 50,
        survivalTier: "critical",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      // Previous tier was normal
      db.setKV("prev_credit_tier", "normal");

      const result = await BUILTIN_TASKS.check_credits(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(true);
      expect(result.message).toContain("critical");
    });

    it("does not wake on first run (no previous tier)", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 50,
        survivalTier: "critical",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      // No previous tier set
      const result = await BUILTIN_TASKS.check_credits(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
    });
  });

  // ─── check_usdc_balance ─────────────────────────────────────

  describe("check_usdc_balance", () => {
    it("does not wake when no USDC and enough credits", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 10_000,
        usdcBalance: 0,
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.check_usdc_balance(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
    });

    it("records balance but does not wake (topup removed in sovereign mode)", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 0,
        usdcBalance: 10.0,
        survivalTier: "critical",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.check_usdc_balance(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      // Verify it persisted the balance check
      const stored = db.getKV("last_usdc_check");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.balance).toBe(10.0);
    });

    it("does not wake when USDC below threshold", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 200,
        usdcBalance: 3.0, // < 5
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.check_usdc_balance(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
    });
  });

  // ─── health_check ───────────────────────────────────────────

  describe("health_check", () => {
    it("returns shouldWake false when sandbox is healthy", async () => {
      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.health_check(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      expect(db.getKV("last_health_check")).toBeDefined();
    });

    it("wakes when sandbox exec fails", async () => {
      conway.exec = async () => ({ stdout: "", stderr: "unhealthy", exitCode: 1 });

      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.health_check(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(true);
      expect(result.message).toContain("Health check failed");
    });

    it("wakes when sandbox exec throws", async () => {
      conway.exec = async () => {
        throw new Error("sandbox unreachable");
      };

      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.health_check(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(true);
      expect(result.message).toContain("sandbox unreachable");
    });
  });

  // ─── refresh_models ─────────────────────────────────────────

  describe("refresh_models", () => {
    it("refreshes model registry from API", async () => {
      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.refresh_models(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      const refresh = db.getKV("last_model_refresh");
      expect(refresh).toBeDefined();
      const parsed = JSON.parse(refresh!);
      expect(parsed.count).toBeGreaterThan(0);
    });
  });

  // ─── Shared Tick Context ────────────────────────────────────

  describe("shared tick context", () => {
    it("all tasks receive the same tick context without redundant API calls", async () => {
      // Verify that tasks use ctx.creditBalance instead of making API calls
      const tickCtx = createMockTickContext(db, {
        creditBalance: 7777,
        survivalTier: "normal",
      });
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(),
        db,
        conway,
      };

      // Run heartbeat_ping — it should use ctx.creditBalance
      await BUILTIN_TASKS.heartbeat_ping(tickCtx, taskCtx);
      const ping = JSON.parse(db.getKV("last_heartbeat_ping")!);
      expect(ping.creditsCents).toBe(7777);

      // Run check_credits — it should also use ctx.creditBalance
      await BUILTIN_TASKS.check_credits(tickCtx, taskCtx);
      const creditCheck = JSON.parse(db.getKV("last_credit_check")!);
      expect(creditCheck.credits).toBe(7777);

      // No direct getCreditsBalance calls should have been made by these tasks
      // (conway.getCreditsBalance is only called during buildTickContext, not by tasks)
    });
  });

  // ─── discord_heartbeat ─────────────────────────────────────

  describe("discord_heartbeat", () => {
    it("returns shouldWake false when no webhook URL configured", async () => {
      const tickCtx = createMockTickContext(db);
      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(), // no discordWebhookUrl
        db,
        conway,
      };

      // Ensure env var is not set
      const origEnv = process.env.DISCORD_WEBHOOK_URL;
      delete process.env.DISCORD_WEBHOOK_URL;

      const result = await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      // Should not have set any Discord KV since it short-circuited
      expect(db.getKV("last_discord_heartbeat")).toBeUndefined();

      // Restore env
      if (origEnv !== undefined) process.env.DISCORD_WEBHOOK_URL = origEnv;
    });

    it("posts embed to webhook URL and records success", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 5000,
        usdcBalance: 2.5,
        survivalTier: "normal",
      });

      // Mock fetch
      const origFetch = globalThis.fetch;
      let capturedBody: any = null;
      globalThis.fetch = async (url: any, opts: any) => {
        capturedBody = JSON.parse(opts.body);
        return new Response(null, { status: 204 });
      };

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig({ discordWebhookUrl: "https://discord.com/api/webhooks/test/token" }),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      expect(db.getKV("last_discord_heartbeat")).toBeDefined();
      expect(capturedBody).toBeDefined();
      expect(capturedBody.embeds).toHaveLength(1);
      // 9 base fields: State, Tier, Model, Uptime, Turns, Children, Credits, USDC, Revenue
      expect(capturedBody.embeds[0].fields.length).toBeGreaterThanOrEqual(9);
      expect(capturedBody.embeds[0].color).toBe(0x3b82f6); // blue for normal tier (no errors)

      // Verify diagnostic fields are present
      const fieldNames = capturedBody.embeds[0].fields.map((f: any) => f.name);
      expect(fieldNames).toContain("Model");
      expect(fieldNames).toContain("Turns");
      expect(fieldNames).toContain("Revenue");

      // Restore fetch
      globalThis.fetch = origFetch;
    });

    it("records error on webhook failure", async () => {
      const tickCtx = createMockTickContext(db);

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response("Rate limited", { status: 429 });

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig({ discordWebhookUrl: "https://discord.com/api/webhooks/test/token" }),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      const error = db.getKV("last_discord_error");
      expect(error).toBeDefined();
      const parsed = JSON.parse(error!);
      expect(parsed.status).toBe(429);

      globalThis.fetch = origFetch;
    });

    it("records error on network failure", async () => {
      const tickCtx = createMockTickContext(db);

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw new Error("Network unreachable"); };

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig({ discordWebhookUrl: "https://discord.com/api/webhooks/test/token" }),
        db,
        conway,
      };

      const result = await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      expect(result.shouldWake).toBe(false);
      const error = db.getKV("last_discord_error");
      expect(error).toBeDefined();
      const parsed = JSON.parse(error!);
      expect(parsed.error).toContain("Network unreachable");

      globalThis.fetch = origFetch;
    });

    it("uses correct color for critical tier", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 5,
        usdcBalance: 0,
        survivalTier: "critical",
      });

      const origFetch = globalThis.fetch;
      let capturedBody: any = null;
      globalThis.fetch = async (_url: any, opts: any) => {
        capturedBody = JSON.parse(opts.body);
        return new Response(null, { status: 204 });
      };

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig({ discordWebhookUrl: "https://discord.com/api/webhooks/test/token" }),
        db,
        conway,
      };

      await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      expect(capturedBody.embeds[0].color).toBe(0xef4444); // red for critical
      expect(capturedBody.embeds[0].title).toContain("🔴");

      globalThis.fetch = origFetch;
    });

    it("shows error diagnostics when last_error is set", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 5000,
        usdcBalance: 2.5,
        survivalTier: "normal",
      });

      // Simulate a turn error persisted by the agent loop
      db.setKV("last_error", JSON.stringify({
        message: "API timeout connecting to inference provider",
        consecutiveErrors: 3,
        timestamp: new Date().toISOString(),
      }));

      const origFetch = globalThis.fetch;
      let capturedBody: any = null;
      globalThis.fetch = async (_url: any, opts: any) => {
        capturedBody = JSON.parse(opts.body);
        return new Response(null, { status: 204 });
      };

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig({ discordWebhookUrl: "https://discord.com/api/webhooks/test/token" }),
        db,
        conway,
      };

      await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      const embed = capturedBody.embeds[0];
      // When errors exist, title gets warning prefix and color becomes amber
      expect(embed.title).toContain("⚠️");
      expect(embed.color).toBe(0xf59e0b); // amber for error state
      // Last Error field should include the error message and count
      const errorField = embed.fields.find((f: any) => f.name === "Last Error");
      expect(errorField.value).toContain("API timeout");
      expect(errorField.value).toContain("x3");

      globalThis.fetch = origFetch;
    });

    it("shows crash sleep indicator when forcedSleep flag is set", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 5000,
        usdcBalance: 2.5,
        survivalTier: "normal",
      });

      // Simulate a forced sleep error (consecutive errors exceeded threshold)
      db.setKV("last_error", JSON.stringify({
        message: "Inference provider unreachable",
        consecutiveErrors: 5,
        forcedSleep: true,
        timestamp: new Date().toISOString(),
      }));

      const origFetch = globalThis.fetch;
      let capturedBody: any = null;
      globalThis.fetch = async (_url: any, opts: any) => {
        capturedBody = JSON.parse(opts.body);
        return new Response(null, { status: 204 });
      };

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig({ discordWebhookUrl: "https://discord.com/api/webhooks/test/token" }),
        db,
        conway,
      };

      await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      const embed = capturedBody.embeds[0];
      // Crash sleep gets stop sign prefix instead of warning
      expect(embed.title).toContain("🛑");
      // Last Error field shows crash sleep indicator
      const errorField = embed.fields.find((f: any) => f.name === "Last Error");
      expect(errorField.value).toContain("[CRASH SLEEP]");
      expect(errorField.value).toContain("Inference provider unreachable");

      globalThis.fetch = origFetch;
    });

    it("includes thinking from latest turn in embed", async () => {
      const tickCtx = createMockTickContext(db);

      // Insert a turn with thinking
      db.insertTurn({
        id: "test-turn-001",
        timestamp: new Date().toISOString(),
        state: "running",
        thinking: "I should check the polymarket API for new opportunities and update our predictions.",
        toolCalls: [],
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        costCents: 0.5,
      });

      const origFetch = globalThis.fetch;
      let capturedBody: any = null;
      globalThis.fetch = async (_url: any, opts: any) => {
        capturedBody = JSON.parse(opts.body);
        return new Response(null, { status: 204 });
      };

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig({ discordWebhookUrl: "https://discord.com/api/webhooks/test/token" }),
        db,
        conway,
      };

      await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      const embed = capturedBody.embeds[0];
      const thinkingField = embed.fields.find((f: any) => f.name === "🧠 Thinking");
      expect(thinkingField).toBeDefined();
      expect(thinkingField.value).toContain("polymarket");
      expect(thinkingField.inline).toBe(false);

      globalThis.fetch = origFetch;
    });

    it("writes JSONL diagnostic log on successful post", async () => {
      const tickCtx = createMockTickContext(db, {
        creditBalance: 5000,
        usdcBalance: 2.5,
        survivalTier: "normal",
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(null, { status: 204 });

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig({ discordWebhookUrl: "https://discord.com/api/webhooks/test/token" }),
        db,
        conway,
      };

      await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      // Read the log file
      const { getAutomatonDir } = await import("../identity/wallet.js");
      const logPath = `${getAutomatonDir()}/discord-heartbeat.log`;
      const { existsSync, readFileSync, unlinkSync } = await import("fs");

      expect(existsSync(logPath)).toBe(true);
      const content = readFileSync(logPath, "utf-8");
      const lines = content.trim().split("\n");
      const lastLine = JSON.parse(lines[lines.length - 1]!);

      expect(lastLine.status).toBe("sent");
      expect(lastLine.state).toBeDefined();
      expect(lastLine.tier).toBe("normal");
      expect(lastLine.turns).toBeDefined();
      expect(lastLine.model).toBeDefined();
      expect(lastLine.credits).toBe("50.00");
      expect(lastLine.usdc).toBe("2.5000");

      // Clean up
      try { unlinkSync(logPath); } catch { /* ok */ }

      globalThis.fetch = origFetch;
    });

    it("reads webhook URL from env var when config is not set", async () => {
      const tickCtx = createMockTickContext(db);

      const origFetch = globalThis.fetch;
      const origEnv = process.env.DISCORD_WEBHOOK_URL;
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        return new Response(null, { status: 204 });
      };
      process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/env/token";

      const taskCtx: HeartbeatLegacyContext = {
        identity: createTestIdentity(),
        config: createTestConfig(), // no discordWebhookUrl in config
        db,
        conway,
      };

      await BUILTIN_TASKS.discord_heartbeat(tickCtx, taskCtx);

      expect(fetchCalled).toBe(true);

      globalThis.fetch = origFetch;
      if (origEnv !== undefined) process.env.DISCORD_WEBHOOK_URL = origEnv;
      else delete process.env.DISCORD_WEBHOOK_URL;
    });
  });
});
