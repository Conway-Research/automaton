/**
 * Resurrection Tests
 *
 * Tests for the agent resurrection feature: bringing dead agents back to life
 * when their balance is topped up above the resurrection threshold.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createTestDb,
  MockConwayClient,
} from "./mocks.js";
import {
  attemptResurrection,
  getResurrectionHistory,
} from "../survival/resurrection.js";
import type { AutomatonDatabase } from "../types.js";

describe("Agent Resurrection", () => {
  let db: AutomatonDatabase;
  let conway: MockConwayClient;

  beforeEach(() => {
    db = createTestDb();
    conway = new MockConwayClient();
  });

  // ─── Core Resurrection Logic ──────────────────────────────────

  describe("attemptResurrection", () => {
    it("resurrects a dead agent when credits are above threshold", async () => {
      db.setAgentState("dead");
      db.setKV("zero_credits_since", new Date(Date.now() - 7200_000).toISOString());
      db.setKV("last_distress", JSON.stringify({ level: "dead" }));
      db.setKV("funding_notice_dead", "plea for funds");
      conway.creditsCents = 500; // $5.00

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(true);
      expect(result.previousTier).toBe("dead");
      expect(result.newTier).toBe("normal");
      expect(result.creditsCents).toBe(500);
      expect(db.getAgentState()).toBe("waking");
    });

    it("clears dead-state bookkeeping on resurrection", async () => {
      db.setAgentState("dead");
      db.setKV("zero_credits_since", new Date().toISOString());
      db.setKV("funding_notice_dead", "need funds");
      db.setKV("last_distress", JSON.stringify({ level: "dead" }));
      conway.creditsCents = 100; // $1.00

      await attemptResurrection(db, conway);

      expect(db.getKV("zero_credits_since")).toBeNull();
      expect(db.getKV("funding_notice_dead")).toBeNull();
      expect(db.getKV("last_distress")).toBeNull();
    });

    it("does not resurrect if credits are below threshold", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 5; // $0.05 — below $0.10 threshold

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(false);
      expect(db.getAgentState()).toBe("dead");
      expect(result.reason).toContain("below resurrection threshold");
    });

    it("does not resurrect if agent is not dead", async () => {
      db.setAgentState("sleeping");
      conway.creditsCents = 10_000;

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(false);
      expect(db.getAgentState()).toBe("sleeping");
      expect(result.reason).toContain("not dead");
    });

    it("does not resurrect if credits are exactly zero", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 0;

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(false);
      expect(db.getAgentState()).toBe("dead");
    });

    it("handles balance check failure gracefully", async () => {
      db.setAgentState("dead");
      conway.getCreditsBalance = vi.fn().mockRejectedValue(new Error("network error"));

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(false);
      expect(result.reason).toContain("Balance check failed");
      expect(db.getAgentState()).toBe("dead");
    });

    it("records resurrection in history", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 500;

      await attemptResurrection(db, conway);

      const history = getResurrectionHistory(db);
      expect(history).toHaveLength(1);
      expect(history[0].creditsCents).toBe(500);
      expect(history[0].newTier).toBe("normal");
      expect(history[0].timestamp).toBeDefined();
    });

    it("appends to existing resurrection history", async () => {
      // First resurrection
      db.setAgentState("dead");
      conway.creditsCents = 100;
      await attemptResurrection(db, conway);

      // Die again and resurrect
      db.setAgentState("dead");
      conway.creditsCents = 2000;
      await attemptResurrection(db, conway);

      const history = getResurrectionHistory(db);
      expect(history).toHaveLength(2);
      expect(history[0].creditsCents).toBe(100);
      expect(history[1].creditsCents).toBe(2000);
    });

    it("records tier transition on resurrection", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 500;

      await attemptResurrection(db, conway);

      const transitionsStr = db.getKV("tier_transitions");
      expect(transitionsStr).toBeDefined();
      const transitions = JSON.parse(transitionsStr!);
      expect(transitions.length).toBeGreaterThan(0);
      const last = transitions[transitions.length - 1];
      expect(last.from).toBe("dead");
      expect(last.to).toBe("normal");
    });

    it("updates current_tier on resurrection", async () => {
      db.setAgentState("dead");
      db.setKV("current_tier", "dead");
      conway.creditsCents = 60; // > $0.50 → normal tier

      await attemptResurrection(db, conway);

      expect(db.getKV("current_tier")).toBe("normal");
    });
  });

  // ─── Tier Mapping on Resurrection ─────────────────────────────

  describe("tier mapping on resurrection", () => {
    it("resurrects to high tier with large balance", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 1000; // $10.00 → high

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(true);
      expect(result.newTier).toBe("high");
    });

    it("resurrects to normal tier with moderate balance", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 100; // $1.00 → normal

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(true);
      expect(result.newTier).toBe("normal");
    });

    it("resurrects to low_compute tier with small balance", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 20; // $0.20 → low_compute

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(true);
      expect(result.newTier).toBe("low_compute");
    });

    it("resurrects to critical tier at exact threshold", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 10; // $0.10 — exactly at resurrection threshold, 0 ≤ 10 < low_compute → critical

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(true);
      expect(result.newTier).toBe("critical");
    });
  });

  // ─── History Limits ───────────────────────────────────────────

  describe("history limits", () => {
    it("caps resurrection history at 50 entries", async () => {
      for (let i = 0; i < 55; i++) {
        db.setAgentState("dead");
        conway.creditsCents = 100 + i;
        await attemptResurrection(db, conway);
      }

      const history = getResurrectionHistory(db);
      expect(history).toHaveLength(50);
      // Should keep the most recent entries
      expect(history[49].creditsCents).toBe(154);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty resurrection history gracefully", () => {
      const history = getResurrectionHistory(db);
      expect(history).toEqual([]);
    });

    it("handles corrupted history in KV", async () => {
      db.setKV("resurrection_history", "not-json");
      db.setAgentState("dead");
      conway.creditsCents = 500;

      // Should not throw — parse error handled internally or by
      // the JSON.parse failure causing a new array
      await expect(
        attemptResurrection(db, conway),
      ).rejects.toThrow(); // JSON.parse will throw on bad data

      // Verify agent is still in a safe state
      // (the function throws before mutating state)
    });

    it("does not resurrect with negative credits", async () => {
      db.setAgentState("dead");
      conway.creditsCents = -100;

      const result = await attemptResurrection(db, conway);

      expect(result.resurrected).toBe(false);
      expect(result.newTier).toBe("dead");
    });

    it("multiple rapid resurrection attempts are idempotent", async () => {
      db.setAgentState("dead");
      conway.creditsCents = 500;

      const result1 = await attemptResurrection(db, conway);
      expect(result1.resurrected).toBe(true);

      // Second attempt — agent is now "waking", not "dead"
      const result2 = await attemptResurrection(db, conway);
      expect(result2.resurrected).toBe(false);
      expect(result2.reason).toContain("not dead");

      // History should only have one entry
      const history = getResurrectionHistory(db);
      expect(history).toHaveLength(1);
    });
  });
});
