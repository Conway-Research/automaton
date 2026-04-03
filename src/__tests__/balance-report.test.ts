/**
 * Balance Report Tests
 *
 * Tests for the child agent balance reporting protocol:
 * - status_report messages with credit_balance are stored in KV
 * - SimpleFundingProtocol.getBalance() prefers reported balance over funded_amount_cents
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SimpleFundingProtocol } from "../orchestration/simple-tracker.js";
import { createTestDb, createTestIdentity, MockConwayClient } from "./mocks.js";
import type { AutomatonDatabase } from "../types.js";

describe("SimpleFundingProtocol.getBalance with balance reports", () => {
  let db: AutomatonDatabase;
  let conway: MockConwayClient;
  let protocol: SimpleFundingProtocol;
  const childAddress = "0xchild1234";

  beforeEach(() => {
    db = createTestDb();
    conway = new MockConwayClient();
    const identity = createTestIdentity();
    protocol = new SimpleFundingProtocol(conway, identity, db);

    // Register a child with funded_amount_cents
    db.raw.prepare(
      `INSERT INTO children (id, name, address, sandbox_id, genesis_prompt, funded_amount_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("child-1", "test-child", childAddress, "sbx-1", "test", 500, "running", new Date().toISOString());
  });

  it("returns funded_amount_cents when no balance report exists", async () => {
    const balance = await protocol.getBalance(childAddress);
    expect(balance).toBe(500);
  });

  it("returns reported balance when a recent report exists", async () => {
    // Simulate a balance report from the child agent
    const key = `agent.reported_balance.${childAddress}`;
    db.raw.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    ).run(key, JSON.stringify({
      creditsCents: 320,
      reportedAt: new Date().toISOString(),
    }));

    const balance = await protocol.getBalance(childAddress);
    expect(balance).toBe(320);
  });

  it("falls back to funded_amount_cents when report is stale", async () => {
    const key = `agent.reported_balance.${childAddress}`;
    // Report from 15 minutes ago (stale, > 10 min)
    const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    db.raw.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    ).run(key, JSON.stringify({
      creditsCents: 100,
      reportedAt: staleTime,
    }));

    const balance = await protocol.getBalance(childAddress);
    expect(balance).toBe(500); // Falls back to funded_amount_cents
  });

  it("falls back to funded_amount_cents when report is malformed", async () => {
    const key = `agent.reported_balance.${childAddress}`;
    db.raw.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    ).run(key, "not valid json");

    const balance = await protocol.getBalance(childAddress);
    expect(balance).toBe(500);
  });

  it("returns 0 for unknown child with no report", async () => {
    const balance = await protocol.getBalance("0xunknown");
    expect(balance).toBe(0);
  });
});
