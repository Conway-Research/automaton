/**
 * x402 Payment Middleware Tests
 *
 * Tests for the two-phase x402 payment flow, middleware pipeline,
 * and transaction logging in the x402_fetch tool.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MockInferenceClient,
  MockConwayClient,
  createTestDb,
  createTestIdentity,
  createTestConfig,
} from "./mocks.js";
import { createBuiltinTools, executeTool } from "../agent/tools.js";
import type { AutomatonDatabase, ToolContext } from "../types.js";

// ─── Direct x402Fetch unit tests ────────────────────────────────

describe("x402Fetch middleware pipeline", () => {
  it("returns paymentDetails when middleware blocks", async () => {
    // Mock fetch to return 402 with payment requirement
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 402,
      ok: false,
      headers: new Headers({
        "X-Payment-Required": JSON.stringify({
          x402Version: 1,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:8453",
              maxAmountRequired: "0.001000",
              payToAddress: "0xRecipient",
              requiredDeadlineSeconds: 300,
              usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            },
          ],
        }),
      }),
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { x402Fetch } = await import("../conway/x402.js");

    const result = await x402Fetch(
      "https://api.example.com/paid",
      { address: "0xSigner" } as any,
      {
        middleware: [
          async () => ({ proceed: false as const, reason: "Requires agent approval" }),
        ],
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Requires agent approval");
    expect(result.paymentDetails).toBeDefined();
    expect(result.paymentDetails!.requirement.maxAmountRequired).toBe("0.001000");
    expect(result.paymentDetails!.requirement.payToAddress).toBe("0xRecipient");
    expect(result.paymentDetails!.x402Version).toBe(1);
    expect(result.status).toBe(402);

    // Only one fetch call — no retry with payment
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("proceeds to sign when middleware allows", async () => {
    const mockFetch = vi
      .fn()
      // First call: 402
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers({
          "X-Payment-Required": JSON.stringify({
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:8453",
                maxAmountRequired: "0.001000",
                payToAddress: "0xRecipient",
                requiredDeadlineSeconds: 300,
                usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              },
            ],
          }),
        }),
        json: async () => ({}),
      })
      // Second call: success after payment
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ result: "paid content" }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const mockAccount = {
      address: "0x1234567890abcdef1234567890abcdef12345678",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    } as any;

    const { x402Fetch } = await import("../conway/x402.js");

    const result = await x402Fetch(
      "https://api.example.com/paid",
      mockAccount,
      {
        middleware: [async () => ({ proceed: true as const })],
      },
    );

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ result: "paid content" });
    expect(result.paymentDetails).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify second call has X-Payment header
    const secondCallHeaders = mockFetch.mock.calls[1][1].headers;
    expect(secondCallHeaders["X-Payment"]).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("stops at first blocking middleware in chain", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 402,
      ok: false,
      headers: new Headers({
        "X-Payment-Required": JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:8453",
              maxAmountRequired: "5000000",
              payToAddress: "0xRecipient",
              requiredDeadlineSeconds: 300,
              usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            },
          ],
        }),
      }),
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const mw1Called = vi.fn().mockResolvedValue({ proceed: true });
    const mw2Called = vi.fn().mockResolvedValue({ proceed: false, reason: "Over budget" });
    const mw3Called = vi.fn().mockResolvedValue({ proceed: true });

    const { x402Fetch } = await import("../conway/x402.js");

    const result = await x402Fetch(
      "https://api.example.com/expensive",
      { address: "0xSigner" } as any,
      {
        middleware: [mw1Called, mw2Called, mw3Called],
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Over budget");
    expect(mw1Called).toHaveBeenCalledTimes(1);
    expect(mw2Called).toHaveBeenCalledTimes(1);
    expect(mw3Called).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("non-402 responses bypass middleware entirely", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => ({ data: "free content" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const mw = vi.fn();

    const { x402Fetch } = await import("../conway/x402.js");

    const result = await x402Fetch(
      "https://api.example.com/free",
      { address: "0xSigner" } as any,
      {
        middleware: [mw],
      },
    );

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ data: "free content" });
    expect(result.paymentDetails).toBeUndefined();
    expect(mw).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("backward compat: positional args still work", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { x402Fetch } = await import("../conway/x402.js");

    const result = await x402Fetch(
      "https://api.example.com/data",
      { address: "0xSigner" } as any,
      "POST",
      '{"key":"value"}',
      { Authorization: "Bearer token" },
    );

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [, fetchInit] = mockFetch.mock.calls[0];
    expect(fetchInit.method).toBe("POST");
    expect(fetchInit.body).toBe('{"key":"value"}');
    expect(fetchInit.headers.Authorization).toBe("Bearer token");

    vi.unstubAllGlobals();
  });

  it("middleware receives correct PaymentContext", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 402,
      ok: false,
      headers: new Headers({
        "X-Payment-Required": JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:84532",
              maxAmountRequired: "1000000",
              payToAddress: "0xPayee",
              requiredDeadlineSeconds: 600,
              usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            },
          ],
        }),
      }),
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    let capturedCtx: any = null;
    const { x402Fetch } = await import("../conway/x402.js");

    await x402Fetch(
      "https://api.example.com/sepolia",
      { address: "0xMyAddress" } as any,
      {
        method: "POST",
        middleware: [
          async (ctx) => {
            capturedCtx = ctx;
            return { proceed: false as const, reason: "inspecting" };
          },
        ],
      },
    );

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx.url).toBe("https://api.example.com/sepolia");
    expect(capturedCtx.method).toBe("POST");
    expect(capturedCtx.requirement.network).toBe("eip155:84532");
    expect(capturedCtx.requirement.payToAddress).toBe("0xPayee");
    expect(capturedCtx.x402Version).toBe(2);
    expect(capturedCtx.signerAddress).toBe("0xMyAddress");

    vi.unstubAllGlobals();
  });
});

// ─── x402_fetch tool integration tests ──────────────────────────

describe("x402_fetch tool two-phase flow", () => {
  let db: AutomatonDatabase;
  let conway: MockConwayClient;
  let identity: ReturnType<typeof createTestIdentity>;
  let config: ReturnType<typeof createTestConfig>;

  beforeEach(() => {
    db = createTestDb();
    conway = new MockConwayClient();
    identity = createTestIdentity();
    config = createTestConfig();
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  function makeToolContext(): ToolContext {
    return {
      identity,
      config,
      db,
      conway,
      inference: new MockInferenceClient(),
    };
  }

  it("Phase 1: returns payment details without signing", async () => {
    // Mock fetch to return 402
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 402,
      ok: false,
      headers: new Headers({
        "X-Payment-Required": JSON.stringify({
          x402Version: 1,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:8453",
              maxAmountRequired: "0.500000",
              payToAddress: "0xServiceProvider",
              requiredDeadlineSeconds: 300,
              usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            },
          ],
        }),
      }),
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    // Mock getUsdcBalance to avoid real RPC
    const x402Module = await import("../conway/x402.js");
    vi.spyOn(x402Module, "getUsdcBalance").mockResolvedValue(10.5);

    const tools = createBuiltinTools(identity.sandboxId);
    const ctx = makeToolContext();

    const result = await executeTool(
      "x402_fetch",
      { url: "https://paid-api.example.com/data" },
      tools,
      ctx,
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toContain("requires x402 payment");
    expect(result.result).toContain("0.500000 USDC");
    expect(result.result).toContain("0xServiceProvider");
    expect(result.result).toContain("10.500000 USDC");
    expect(result.result).toContain("approve_payment: true");

    // No payment signed — only 1 fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // No transaction logged
    const txns = db.getRecentTransactions(10);
    expect(txns.filter((t) => t.type === "x402_payment")).toHaveLength(0);
  });

  it("Phase 2: signs payment and logs transaction", async () => {
    const mockFetch = vi
      .fn()
      // 402 response
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers({
          "X-Payment-Required": JSON.stringify({
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:8453",
                maxAmountRequired: "0.250000",
                payToAddress: "0xServiceProvider",
                requiredDeadlineSeconds: 300,
                usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              },
            ],
          }),
        }),
        json: async () => ({}),
      })
      // Paid response
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ result: "premium data" }),
      });
    vi.stubGlobal("fetch", mockFetch);

    // Need a real-ish account for signTypedData
    const identityWithSigner = {
      ...identity,
      account: {
        ...identity.account,
        address: identity.address,
        signTypedData: vi.fn().mockResolvedValue("0xmocksig"),
      },
    };

    const tools = createBuiltinTools(identityWithSigner.sandboxId);
    const ctx: ToolContext = {
      identity: identityWithSigner,
      config,
      db,
      conway,
      inference: new MockInferenceClient(),
    };

    const result = await executeTool(
      "x402_fetch",
      { url: "https://paid-api.example.com/data", approve_payment: true },
      tools,
      ctx,
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toContain("x402 fetch succeeded");
    expect(result.result).toContain("premium data");

    // Two fetch calls: initial + paid retry
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Transaction logged
    const txns = db.getRecentTransactions(10);
    const x402Txn = txns.find((t) => t.type === "x402_payment");
    expect(x402Txn).toBeDefined();
    expect(x402Txn!.amountCents).toBe(25); // 0.25 USDC = 25 cents
    expect(x402Txn!.description).toContain("0xServiceProvider");
    expect(x402Txn!.description).toContain("paid-api.example.com");
  });

  it("non-402 URL returns response directly (no two-phase)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => ({ data: "free" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const tools = createBuiltinTools(identity.sandboxId);
    const ctx = makeToolContext();

    const result = await executeTool(
      "x402_fetch",
      { url: "https://free-api.example.com/data" },
      tools,
      ctx,
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toContain("x402 fetch succeeded");
    expect(result.result).toContain("free");
    expect(result.result).not.toContain("requires x402 payment");

    // No transaction logged
    const txns = db.getRecentTransactions(10);
    expect(txns.filter((t) => t.type === "x402_payment")).toHaveLength(0);
  });

  it("Phase 2 with v2 integer amounts parses correctly", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers({
          "X-Payment-Required": JSON.stringify({
            x402Version: 2,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:8453",
                maxAmountRequired: "1500000", // 1.5 USDC in v2 raw units
                payToAddress: "0xVendor",
                requiredDeadlineSeconds: 300,
                usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              },
            ],
          }),
        }),
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ ok: true }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const identityWithSigner = {
      ...identity,
      account: {
        ...identity.account,
        address: identity.address,
        signTypedData: vi.fn().mockResolvedValue("0xmocksig"),
      },
    };

    const tools = createBuiltinTools(identityWithSigner.sandboxId);
    const ctx: ToolContext = {
      identity: identityWithSigner,
      config,
      db,
      conway,
      inference: new MockInferenceClient(),
    };

    const result = await executeTool(
      "x402_fetch",
      { url: "https://api.example.com/v2", approve_payment: true },
      tools,
      ctx,
    );

    expect(result.result).toContain("x402 fetch succeeded");

    const txns = db.getRecentTransactions(10);
    const x402Txn = txns.find((t) => t.type === "x402_payment");
    expect(x402Txn).toBeDefined();
    expect(x402Txn!.amountCents).toBe(150); // 1.5 USDC = 150 cents
    expect(x402Txn!.description).toContain("1.500000 USDC");
  });
});

// ─── Sequential Phase 1 → Phase 2 integration test ─────────────

describe("x402 two-phase sequential tool calls", () => {
  let db: AutomatonDatabase;
  let conway: MockConwayClient;
  let identity: ReturnType<typeof createTestIdentity>;
  let config: ReturnType<typeof createTestConfig>;

  beforeEach(() => {
    db = createTestDb();
    conway = new MockConwayClient();
    identity = createTestIdentity();
    config = createTestConfig();
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  it("Phase 1 discover then Phase 2 approve against same tool instance", async () => {
    const paymentRequired = JSON.stringify({
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          maxAmountRequired: "0.010000",
          payToAddress: "0xService",
          requiredDeadlineSeconds: 300,
          usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
      ],
    });

    const mockFetch = vi
      .fn()
      // Phase 1: 402
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers({ "X-Payment-Required": paymentRequired }),
        json: async () => ({}),
      })
      // Phase 2: 402 again (fresh requirement)
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers({ "X-Payment-Required": paymentRequired }),
        json: async () => ({}),
      })
      // Phase 2: paid retry succeeds
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ content: "paid result" }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const x402Module = await import("../conway/x402.js");
    vi.spyOn(x402Module, "getUsdcBalance").mockResolvedValue(5.0);

    const identityWithSigner = {
      ...identity,
      account: {
        ...identity.account,
        address: identity.address,
        signTypedData: vi.fn().mockResolvedValue("0xmocksig"),
      },
    };

    const tools = createBuiltinTools(identityWithSigner.sandboxId);
    const ctx: ToolContext = {
      identity: identityWithSigner,
      config,
      db,
      conway,
      inference: new MockInferenceClient(),
    };

    // Phase 1: discover
    const phase1 = await executeTool(
      "x402_fetch",
      { url: "https://paid-api.example.com/data" },
      tools,
      ctx,
    );

    expect(phase1.result).toContain("requires x402 payment");
    expect(phase1.result).toContain("0.010000 USDC");
    expect(phase1.result).toContain("5.000000 USDC");
    expect(db.getRecentTransactions(10).filter((t) => t.type === "x402_payment")).toHaveLength(0);

    // Phase 2: approve
    const phase2 = await executeTool(
      "x402_fetch",
      { url: "https://paid-api.example.com/data", approve_payment: true },
      tools,
      ctx,
    );

    expect(phase2.result).toContain("x402 fetch succeeded");
    expect(phase2.result).toContain("paid result");

    // Transaction logged after Phase 2
    const txns = db.getRecentTransactions(10);
    const x402Txn = txns.find((t) => t.type === "x402_payment");
    expect(x402Txn).toBeDefined();
    expect(x402Txn!.description).toContain("0xService");
    expect(x402Txn!.amountCents).toBe(1); // 0.01 USDC = 1 cent
  });
});
