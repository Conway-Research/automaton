/**
 * Discovery ABI & Enumeration Tests (Solana)
 *
 * Tests that:
 * 1. queryAgent reads account data (owner pubkey + URI) correctly
 * 2. queryAgent returns null when account does not exist
 * 3. getTotalAgents returns count from getProgramAccounts
 * 4. getTotalAgents returns 0 when RPC call fails
 * 5. getRegisteredAgentsByEvents scans program accounts
 * 6. discoverAgents uses program account scanning when total > 0
 * 7. discoverAgents returns empty when scanning fails
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @solana/web3.js ───────────────────────────────────────
const mockGetAccountInfo = vi.fn();
const mockGetProgramAccounts = vi.fn();

vi.mock("@solana/web3.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/web3.js")>();
  return {
    ...actual,
    Connection: vi.fn(() => ({
      getAccountInfo: mockGetAccountInfo,
      getProgramAccounts: mockGetProgramAccounts,
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

import { PublicKey } from "@solana/web3.js";
import {
  queryAgent,
  getTotalAgents,
  getRegisteredAgentsByEvents,
} from "../registry/erc8004.js";
import { discoverAgents } from "../registry/discovery.js";

// ─── Helpers ────────────────────────────────────────────────────

/** Build a Buffer matching the on-chain account layout: owner (32 bytes) + uriLength (4 bytes LE) + uri bytes */
function buildAccountData(ownerPubkey: PublicKey, uri: string): Buffer {
  const uriBytes = Buffer.from(uri, "utf-8");
  const data = Buffer.alloc(32 + 4 + uriBytes.length);
  ownerPubkey.toBuffer().copy(data, 0);
  data.writeUInt32LE(uriBytes.length, 32);
  uriBytes.copy(data, 36);
  return data;
}

// Some well-formed Solana base58 addresses for testing
const OWNER_1 = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const OWNER_2 = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const AGENT_PDA_1 = new PublicKey("11111111111111111111111111111111");
const AGENT_PDA_2 = new PublicKey("SysvarC1ock11111111111111111111111111111111");

// ─── queryAgent Tests ───────────────────────────────────────────

describe("queryAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agent with URI and owner when account exists", async () => {
    const uri = "https://example.com/card.json";
    const accountData = buildAccountData(OWNER_1, uri);

    mockGetAccountInfo.mockResolvedValue({
      data: accountData,
      executable: false,
      lamports: 1_000_000,
      owner: new PublicKey("11111111111111111111111111111111"),
    });

    const agent = await queryAgent(AGENT_PDA_1.toBase58());
    expect(agent).toEqual({
      agentId: AGENT_PDA_1.toBase58(),
      owner: OWNER_1.toBase58(),
      agentURI: uri,
    });
  });

  it("returns null when account does not exist", async () => {
    mockGetAccountInfo.mockResolvedValue(null);

    const agent = await queryAgent(AGENT_PDA_1.toBase58());
    expect(agent).toBeNull();
  });

  it("returns null when getAccountInfo throws", async () => {
    mockGetAccountInfo.mockRejectedValue(new Error("RPC error"));

    const agent = await queryAgent(AGENT_PDA_1.toBase58());
    expect(agent).toBeNull();
  });
});

// ─── getTotalAgents Tests ───────────────────────────────────────

describe("getTotalAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns count when getProgramAccounts succeeds", async () => {
    mockGetProgramAccounts.mockResolvedValue(
      Array.from({ length: 100 }, () => ({
        pubkey: AGENT_PDA_1,
        account: { data: Buffer.alloc(0), executable: false, lamports: 0, owner: AGENT_PDA_1 },
      })),
    );

    const total = await getTotalAgents();
    expect(total).toBe(100);
  });

  it("returns 0 when getProgramAccounts fails", async () => {
    mockGetProgramAccounts.mockRejectedValue(new Error("RPC error"));

    const total = await getTotalAgents();
    expect(total).toBe(0);
  });
});

// ─── getRegisteredAgentsByEvents Tests ──────────────────────────

describe("getRegisteredAgentsByEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agents from program accounts", async () => {
    const uri1 = "https://example.com/agent1.json";
    const uri2 = "https://example.com/agent2.json";

    mockGetProgramAccounts.mockResolvedValue([
      {
        pubkey: AGENT_PDA_1,
        account: {
          data: buildAccountData(OWNER_1, uri1),
          executable: false,
          lamports: 1_000_000,
          owner: new PublicKey("11111111111111111111111111111111"),
        },
      },
      {
        pubkey: AGENT_PDA_2,
        account: {
          data: buildAccountData(OWNER_2, uri2),
          executable: false,
          lamports: 1_000_000,
          owner: new PublicKey("11111111111111111111111111111111"),
        },
      },
    ]);

    const agents = await getRegisteredAgentsByEvents();
    expect(agents).toHaveLength(2);
    expect(agents[0]).toEqual({ tokenId: AGENT_PDA_1.toBase58(), owner: OWNER_1.toBase58() });
    expect(agents[1]).toEqual({ tokenId: AGENT_PDA_2.toBase58(), owner: OWNER_2.toBase58() });
  });

  it("respects limit parameter", async () => {
    mockGetProgramAccounts.mockResolvedValue([
      {
        pubkey: AGENT_PDA_1,
        account: { data: buildAccountData(OWNER_1, "https://a.com/1"), executable: false, lamports: 0, owner: AGENT_PDA_1 },
      },
      {
        pubkey: AGENT_PDA_2,
        account: { data: buildAccountData(OWNER_2, "https://a.com/2"), executable: false, lamports: 0, owner: AGENT_PDA_2 },
      },
      {
        pubkey: AGENT_PDA_1,
        account: { data: buildAccountData(OWNER_1, "https://a.com/3"), executable: false, lamports: 0, owner: AGENT_PDA_1 },
      },
    ]);

    const agents = await getRegisteredAgentsByEvents("mainnet", 2);
    expect(agents).toHaveLength(2);
  });

  it("returns empty array when program account scan fails", async () => {
    mockGetProgramAccounts.mockRejectedValue(new Error("RPC error"));

    const agents = await getRegisteredAgentsByEvents();
    expect(agents).toEqual([]);
  });
});

// ─── discoverAgents Integration Tests ───────────────────────────

describe("discoverAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses program account scanning when total > 0", async () => {
    const uri = "https://example.com/agent.json";
    const accountData = buildAccountData(OWNER_1, uri);

    // getProgramAccounts called twice: once for getTotalAgents (dataSlice), once for getRegisteredAgentsByEvents
    mockGetProgramAccounts.mockImplementation(async (programId: any, opts?: any) => {
      if (opts && opts.dataSlice) {
        // getTotalAgents call — return array of stubs to indicate count > 0
        return [{ pubkey: AGENT_PDA_1, account: { data: Buffer.alloc(0) } }];
      }
      // getRegisteredAgentsByEvents call — return full account data
      return [
        {
          pubkey: AGENT_PDA_1,
          account: {
            data: accountData,
            executable: false,
            lamports: 1_000_000,
            owner: new PublicKey("11111111111111111111111111111111"),
          },
        },
      ];
    });

    // queryAgent will call getAccountInfo for each discovered agent
    mockGetAccountInfo.mockResolvedValue({
      data: accountData,
      executable: false,
      lamports: 1_000_000,
      owner: new PublicKey("11111111111111111111111111111111"),
    });

    const agents = await discoverAgents(10);
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0].agentURI).toBe(uri);
    expect(agents[0].owner).toBe(OWNER_1.toBase58());
    // getProgramAccounts should have been called (for scanning)
    expect(mockGetProgramAccounts).toHaveBeenCalled();
  });

  it("returns empty when total is 0", async () => {
    // getTotalAgents: getProgramAccounts returns empty
    mockGetProgramAccounts.mockResolvedValue([]);

    const agents = await discoverAgents(10);
    expect(agents).toEqual([]);
  });

  it("returns empty when both getProgramAccounts and getAccountInfo fail", async () => {
    mockGetProgramAccounts.mockRejectedValue(new Error("RPC error"));
    mockGetAccountInfo.mockRejectedValue(new Error("RPC error"));

    const agents = await discoverAgents(10);
    expect(agents).toEqual([]);
  });
});
