/**
 * Discovery ABI & Enumeration Tests
 *
 * Tests that:
 * 1. IDENTITY_ABI uses tokenURI (not agentURI)
 * 2. queryAgent calls tokenURI and handles ownerOf revert gracefully
 * 3. getTotalAgents returns 0 when totalSupply reverts
 * 4. getRegisteredAgentsByEvents scans Transfer events as fallback
 * 5. discoverAgents uses event fallback when totalSupply returns 0
 * 6. discoverAgents uses sequential iteration when totalSupply works
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock viem before importing erc8004
const mockReadContract = vi.fn();
const mockGetBlockNumber = vi.fn();
const mockGetLogs = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      getBlockNumber: mockGetBlockNumber,
      getLogs: mockGetLogs,
    })),
    createWalletClient: vi.fn(() => ({
      writeContract: vi.fn(),
    })),
  };
});

// Mock logger to suppress output
vi.mock("../observability/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  queryAgent,
  getTotalAgents,
  getRegisteredAgentsByEvents,
} from "../registry/erc8004.js";
import { discoverAgents } from "../registry/discovery.js";

// ─── ABI Verification ───────────────────────────────────────────

describe("IDENTITY_ABI correctness", () => {
  it("uses tokenURI not agentURI in the ABI", async () => {
    // Verify by calling queryAgent — it should call readContract with functionName: "tokenURI"
    mockReadContract.mockImplementation(async (params: any) => {
      if (params.functionName === "tokenURI") return "https://example.com/agent.json";
      if (params.functionName === "ownerOf") return "0x1234567890abcdef1234567890abcdef12345678";
      throw new Error(`Unexpected function: ${params.functionName}`);
    });

    const agent = await queryAgent("1");
    expect(agent).not.toBeNull();
    expect(agent!.agentURI).toBe("https://example.com/agent.json");

    // Verify tokenURI was called (not agentURI)
    const tokenURICall = mockReadContract.mock.calls.find(
      (call: any) => call[0]?.functionName === "tokenURI",
    );
    expect(tokenURICall).toBeDefined();

    // Verify agentURI was NOT called
    const agentURICall = mockReadContract.mock.calls.find(
      (call: any) => call[0]?.functionName === "agentURI",
    );
    expect(agentURICall).toBeUndefined();
  });
});

// ─── queryAgent Tests ───────────────────────────────────────────

describe("queryAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agent with URI and owner when both succeed", async () => {
    mockReadContract.mockImplementation(async (params: any) => {
      if (params.functionName === "tokenURI") return "https://example.com/card.json";
      if (params.functionName === "ownerOf") return "0xOwnerAddress";
      throw new Error(`Unexpected: ${params.functionName}`);
    });

    const agent = await queryAgent("42");
    expect(agent).toEqual({
      agentId: "42",
      owner: "0xOwnerAddress",
      agentURI: "https://example.com/card.json",
    });
  });

  it("returns agent with empty owner when ownerOf reverts", async () => {
    mockReadContract.mockImplementation(async (params: any) => {
      if (params.functionName === "tokenURI") return "https://example.com/card.json";
      if (params.functionName === "ownerOf") throw new Error("execution reverted");
      throw new Error(`Unexpected: ${params.functionName}`);
    });

    const agent = await queryAgent("42");
    expect(agent).not.toBeNull();
    expect(agent!.agentId).toBe("42");
    expect(agent!.agentURI).toBe("https://example.com/card.json");
    expect(agent!.owner).toBe("");
  });

  it("returns null when tokenURI reverts", async () => {
    mockReadContract.mockImplementation(async () => {
      throw new Error("execution reverted");
    });

    const agent = await queryAgent("999");
    expect(agent).toBeNull();
  });
});

// ─── getTotalAgents Tests ───────────────────────────────────────

describe("getTotalAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns count when totalSupply succeeds", async () => {
    mockReadContract.mockResolvedValue(BigInt(100));
    const total = await getTotalAgents();
    expect(total).toBe(100);
  });

  it("returns 0 when totalSupply reverts", async () => {
    mockReadContract.mockRejectedValue(new Error("execution reverted"));
    const total = await getTotalAgents();
    expect(total).toBe(0);
  });
});

// ─── getRegisteredAgentsByEvents Tests ──────────────────────────

describe("getRegisteredAgentsByEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agents from Transfer events", async () => {
    mockGetBlockNumber.mockResolvedValue(1_000_000n);
    mockGetLogs.mockResolvedValue([
      {
        args: {
          from: "0x0000000000000000000000000000000000000000",
          to: "0xOwner1",
          tokenId: 18788n,
        },
      },
      {
        args: {
          from: "0x0000000000000000000000000000000000000000",
          to: "0xOwner2",
          tokenId: 18791n,
        },
      },
    ]);

    const agents = await getRegisteredAgentsByEvents();
    // Most recent first (reversed)
    expect(agents).toHaveLength(2);
    expect(agents[0]).toEqual({ tokenId: "18791", owner: "0xOwner2" });
    expect(agents[1]).toEqual({ tokenId: "18788", owner: "0xOwner1" });
  });

  it("respects limit parameter", async () => {
    mockGetBlockNumber.mockResolvedValue(1_000_000n);
    mockGetLogs.mockResolvedValue([
      { args: { from: "0x0000000000000000000000000000000000000000", to: "0xA", tokenId: 1n } },
      { args: { from: "0x0000000000000000000000000000000000000000", to: "0xB", tokenId: 2n } },
      { args: { from: "0x0000000000000000000000000000000000000000", to: "0xC", tokenId: 3n } },
    ]);

    const agents = await getRegisteredAgentsByEvents("mainnet", 2);
    expect(agents).toHaveLength(2);
  });

  it("returns empty array when event scan fails", async () => {
    mockGetBlockNumber.mockRejectedValue(new Error("RPC error"));

    const agents = await getRegisteredAgentsByEvents();
    expect(agents).toEqual([]);
  });
});

// ─── discoverAgents Integration Tests ───────────────────────────

describe("discoverAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses sequential iteration when totalSupply returns > 0", async () => {
    // First call: totalSupply returns 3
    // Subsequent calls: tokenURI and ownerOf for each agent
    let callCount = 0;
    mockReadContract.mockImplementation(async (params: any) => {
      if (params.functionName === "totalSupply") return BigInt(3);
      if (params.functionName === "tokenURI") return `https://example.com/agent${callCount++}.json`;
      if (params.functionName === "ownerOf") return "0xOwner";
      throw new Error(`Unexpected: ${params.functionName}`);
    });

    const agents = await discoverAgents(10);
    // Should have found agents via sequential iteration (3, 2, 1)
    expect(agents.length).toBeGreaterThan(0);
    // totalSupply should have been called
    const totalSupplyCall = mockReadContract.mock.calls.find(
      (call: any) => call[0]?.functionName === "totalSupply",
    );
    expect(totalSupplyCall).toBeDefined();
    // getLogs should NOT have been called (no event fallback needed)
    expect(mockGetLogs).not.toHaveBeenCalled();
  });

  it("falls back to event scanning when totalSupply returns 0", async () => {
    // totalSupply reverts → getTotalAgents returns 0
    // Then event scanning kicks in
    mockReadContract.mockImplementation(async (params: any) => {
      if (params.functionName === "totalSupply") throw new Error("execution reverted");
      if (params.functionName === "tokenURI") return "https://example.com/agent.json";
      if (params.functionName === "ownerOf") throw new Error("execution reverted");
      throw new Error(`Unexpected: ${params.functionName}`);
    });

    mockGetBlockNumber.mockResolvedValue(1_000_000n);
    mockGetLogs.mockResolvedValue([
      {
        args: {
          from: "0x0000000000000000000000000000000000000000",
          to: "0xEventOwner",
          tokenId: 18788n,
        },
      },
    ]);

    const agents = await discoverAgents(10);
    expect(agents).toHaveLength(1);
    expect(agents[0].agentId).toBe("18788");
    // Owner comes from event when ownerOf reverts and queryAgent returns empty owner
    expect(agents[0].owner).toBe("0xEventOwner");
    expect(agents[0].agentURI).toBe("https://example.com/agent.json");
    // getLogs should have been called (event fallback)
    expect(mockGetLogs).toHaveBeenCalled();
  });

  it("returns empty when both totalSupply and events fail", async () => {
    mockReadContract.mockRejectedValue(new Error("execution reverted"));
    mockGetBlockNumber.mockRejectedValue(new Error("RPC error"));

    const agents = await discoverAgents(10);
    expect(agents).toEqual([]);
  });
});
