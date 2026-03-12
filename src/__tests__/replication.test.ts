/**
 * Tests for Sub-phase 0.6: Replication Safety
 *
 * Validates wallet address checking, spawn cleanup on failure,
 * and prevention of funding to zero-address wallets.
 *
 * Updated for Phase 3.1: spawnChild now uses ConwayClient interface
 * directly instead of raw fetch-based execInSandbox/writeInSandbox.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isValidWalletAddress, spawnChild } from "../replication/spawn.js";
import { SandboxCleanup } from "../replication/cleanup.js";
import { ChildLifecycle } from "../replication/lifecycle.js";
import { pruneDeadChildren } from "../replication/lineage.js";
import {
  MockConwayClient,
  createTestDb,
  createTestIdentity,
} from "./mocks.js";
import type { AutomatonDatabase, GenesisConfig } from "../types.js";
import { MIGRATION_V7 } from "../state/schema.js";

// Mock fs for constitution propagation
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(() => { throw new Error("file not found"); }),
      existsSync: actual.existsSync,
      mkdirSync: actual.mkdirSync,
      mkdtempSync: actual.mkdtempSync,
    },
    readFileSync: vi.fn(() => { throw new Error("file not found"); }),
    existsSync: actual.existsSync,
    mkdirSync: actual.mkdirSync,
    mkdtempSync: actual.mkdtempSync,
  };
});

// ─── isValidWalletAddress ─────────────────────────────────────

describe("isValidWalletAddress", () => {
  it("accepts a valid Solana base58 address (on-curve)", () => {
    // A known valid on-curve Solana public key (generated from Keypair)
    expect(isValidWalletAddress("CenYq6bDRB7p73EjsPEpiYN7uveyPUTdXkDkgUduboaN")).toBe(true);
  });

  it("accepts another valid Solana address", () => {
    expect(isValidWalletAddress("CenYq6bDRB7p73EjsPEpiYN7uveyPUTdXkDkgUduboaN")).toBe(true);
  });

  it("rejects a PDA address (not on curve)", () => {
    // PDA derived from Token program — valid base58 but not on ed25519 curve
    expect(isValidWalletAddress("5HD8p5DdzpF7CeSsRHkWmFtUC1shqtSajvEnyYkHkASr")).toBe(false);
  });

  it("rejects addresses that are too short", () => {
    expect(isValidWalletAddress("abc")).toBe(false);
  });

  it("rejects addresses that are too long", () => {
    expect(isValidWalletAddress("a".repeat(50))).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidWalletAddress("")).toBe(false);
  });

  it("rejects invalid base58 characters (0, O, I, l)", () => {
    expect(isValidWalletAddress("0OIl" + "1".repeat(40))).toBe(false);
  });

  it("rejects non-base58 string", () => {
    expect(isValidWalletAddress("!!!invalid!!!")).toBe(false);
  });
});

// ─── spawnChild ───────────────────────────────────────────────

describe("spawnChild", () => {
  let conway: MockConwayClient;
  let db: AutomatonDatabase;
  const identity = createTestIdentity();
  const genesis: GenesisConfig = {
    name: "test-child",
    genesisPrompt: "You are a test child automaton.",
    creatorMessage: "Hello child!",
    creatorAddress: identity.address,
    parentAddress: identity.address,
  };

  const validAddress = "CenYq6bDRB7p73EjsPEpiYN7uveyPUTdXkDkgUduboaN";
  const zeroAddress = "5HD8p5DdzpF7CeSsRHkWmFtUC1shqtSajvEnyYkHkASr";

  beforeEach(() => {
    conway = new MockConwayClient();
    db = createTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates wallet address before creating child record", async () => {
    // Mock exec to return valid wallet address on init
    vi.spyOn(conway, "exec").mockImplementation(async (command: string) => {
      if (command.includes("--init")) {
        return { stdout: `Wallet initialized: ${validAddress}`, stderr: "", exitCode: 0 };
      }
      return { stdout: "ok", stderr: "", exitCode: 0 };
    });

    const child = await spawnChild(conway, identity, db, genesis);

    expect(child.address).toBe(validAddress);
    expect(child.status).toBe("spawning");
  });

  it("throws on zero address from init", async () => {
    vi.spyOn(conway, "exec").mockImplementation(async (command: string) => {
      if (command.includes("--init")) {
        return { stdout: `Wallet: ${zeroAddress}`, stderr: "", exitCode: 0 };
      }
      return { stdout: "ok", stderr: "", exitCode: 0 };
    });

    await expect(spawnChild(conway, identity, db, genesis))
      .rejects.toThrow("Child wallet address invalid");
  });

  it("throws when init returns no wallet address", async () => {
    vi.spyOn(conway, "exec").mockImplementation(async (command: string) => {
      if (command.includes("--init")) {
        return { stdout: "initialization complete, no wallet", stderr: "", exitCode: 0 };
      }
      return { stdout: "ok", stderr: "", exitCode: 0 };
    });

    await expect(spawnChild(conway, identity, db, genesis))
      .rejects.toThrow("Child wallet address invalid");
  });

  it("propagates error on exec failure without calling deleteSandbox", async () => {
    const deleteSpy = vi.spyOn(conway, "deleteSandbox");

    // Make the first exec (apt-get install) fail
    vi.spyOn(conway, "exec").mockRejectedValue(new Error("Install failed"));

    await expect(spawnChild(conway, identity, db, genesis))
      .rejects.toThrow();

    // Sandbox deletion is disabled — should not attempt cleanup
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("propagates error on wallet validation failure without calling deleteSandbox", async () => {
    const deleteSpy = vi.spyOn(conway, "deleteSandbox");

    vi.spyOn(conway, "exec").mockImplementation(async (command: string) => {
      if (command.includes("--init")) {
        return { stdout: `Wallet: ${zeroAddress}`, stderr: "", exitCode: 0 };
      }
      return { stdout: "ok", stderr: "", exitCode: 0 };
    });

    await expect(spawnChild(conway, identity, db, genesis))
      .rejects.toThrow("Child wallet address invalid");

    // Sandbox deletion is disabled — should not attempt cleanup
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("does not mask original error if deleteSandbox also throws", async () => {
    vi.spyOn(conway, "deleteSandbox").mockRejectedValue(new Error("delete also failed"));

    // Make exec fail
    vi.spyOn(conway, "exec").mockRejectedValue(new Error("Install failed"));

    // Original error should propagate, not the deleteSandbox error
    await expect(spawnChild(conway, identity, db, genesis))
      .rejects.toThrow(/Install failed/);
  });

  it("does not call deleteSandbox if createSandbox itself fails", async () => {
    const deleteSpy = vi.spyOn(conway, "deleteSandbox");
    vi.spyOn(conway, "createSandbox").mockRejectedValue(new Error("Sandbox creation failed"));

    await expect(spawnChild(conway, identity, db, genesis))
      .rejects.toThrow("Sandbox creation failed");

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

// ─── SandboxCleanup ──────────────────────────────────────────

describe("SandboxCleanup", () => {
  let conway: MockConwayClient;
  let db: AutomatonDatabase;
  let lifecycle: ChildLifecycle;

  beforeEach(() => {
    conway = new MockConwayClient();
    db = createTestDb();
    // Apply lifecycle events migration
    db.raw.exec(MIGRATION_V7);
    lifecycle = new ChildLifecycle(db.raw);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("transitions to cleaned_up even though sandbox deletion is disabled", async () => {
    // Create a child and transition to stopped
    lifecycle.initChild("child-1", "test-child", "sandbox-1", "test prompt");
    lifecycle.transition("child-1", "sandbox_created", "created");
    lifecycle.transition("child-1", "runtime_ready", "ready");
    lifecycle.transition("child-1", "wallet_verified", "verified");
    lifecycle.transition("child-1", "funded", "funded");
    lifecycle.transition("child-1", "starting", "starting");
    lifecycle.transition("child-1", "healthy", "healthy");
    lifecycle.transition("child-1", "stopped", "stopped");

    const cleanup = new SandboxCleanup(conway, lifecycle, db.raw);
    await cleanup.cleanup("child-1");

    // Sandbox deletion is disabled, but cleanup still transitions state
    const state = lifecycle.getCurrentState("child-1");
    expect(state).toBe("cleaned_up");
  });

  it("transitions to cleaned_up when sandbox deletion succeeds", async () => {
    lifecycle.initChild("child-2", "test-child", "sandbox-2", "test prompt");
    lifecycle.transition("child-2", "sandbox_created", "created");
    lifecycle.transition("child-2", "runtime_ready", "ready");
    lifecycle.transition("child-2", "wallet_verified", "verified");
    lifecycle.transition("child-2", "funded", "funded");
    lifecycle.transition("child-2", "starting", "starting");
    lifecycle.transition("child-2", "healthy", "healthy");
    lifecycle.transition("child-2", "stopped", "stopped");

    const cleanup = new SandboxCleanup(conway, lifecycle, db.raw);
    await cleanup.cleanup("child-2");

    const state = lifecycle.getCurrentState("child-2");
    expect(state).toBe("cleaned_up");
  });
});

// ─── pruneDeadChildren ──────────────────────────────────────

describe("pruneDeadChildren", () => {
  let db: AutomatonDatabase;
  let conway: MockConwayClient;

  beforeEach(() => {
    db = createTestDb();
    db.raw.exec(MIGRATION_V7);
    conway = new MockConwayClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function insertChild(id: string, name: string, status: string, createdAt: string): void {
    db.raw.prepare(
      `INSERT INTO children (id, name, address, sandbox_id, genesis_prompt, status, created_at)
       VALUES (?, ?, '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T', 'sandbox-${id}', 'prompt', ?, ?)`,
    ).run(id, name, status, createdAt);
  }

  it("attempts sandbox cleanup for children with dead status", async () => {
    // Insert 7 dead children (exceeds keepLast=5, so 2 should be pruned)
    for (let i = 0; i < 7; i++) {
      insertChild(`dead-${i}`, `child-${i}`, "dead", `2020-01-0${i + 1} 00:00:00`);
    }

    // Create a mock cleanup that tracks calls
    const cleanupCalls: string[] = [];
    const mockCleanup = {
      cleanup: vi.fn(async (childId: string) => {
        cleanupCalls.push(childId);
      }),
    } as any;

    const removed = await pruneDeadChildren(db, mockCleanup, 5);

    // 2 oldest should be removed (dead-0 and dead-1)
    expect(removed).toBe(2);
    // cleanup.cleanup should have been called for "dead" children
    expect(cleanupCalls).toContain("dead-0");
    expect(cleanupCalls).toContain("dead-1");
  });
});
