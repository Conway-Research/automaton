import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomatonDatabase, AutomatonIdentity, ConwayClient } from "../types.js";

vi.mock("../conway/x402.js", () => ({
  getUsdcBalance: vi.fn(),
}));

const { getUsdcBalance } = await import("../conway/x402.js");
const { checkResources, formatResourceReport } = await import("../survival/monitor.js");

describe("resource monitor diagnostics", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records diagnostics when balance checks fail instead of presenting confirmed zero balances", async () => {
    vi.mocked(getUsdcBalance).mockRejectedValue(new Error("RPC unavailable"));

    const status = await checkResources(
      makeIdentity(),
      makeConwayClient({
        getCreditsBalance: vi.fn().mockRejectedValue(new Error("Conway API unavailable")),
        exec: vi.fn().mockResolvedValue({ stdout: "ok\n", stderr: "", exitCode: 0 }),
      }),
      makeDb(),
    );

    expect(status.financial.creditsCents).toBe(0);
    expect(status.financial.usdcBalance).toBe(0);
    expect(status.diagnostics).toMatchObject({
      creditsError: "Conway API unavailable",
      usdcError: "RPC unavailable",
    });

    const report = formatResourceReport(status);
    expect(report).toContain("Credits: unknown (Conway API unavailable)");
    expect(report).toContain("USDC: unknown (RPC unavailable)");
    expect(report).not.toContain("Credits: $0.00");
    expect(report).not.toContain("USDC: 0.000000");
  });

  it("records sandbox diagnostics for failed health checks", async () => {
    vi.mocked(getUsdcBalance).mockResolvedValue(1.25);

    const status = await checkResources(
      makeIdentity(),
      makeConwayClient({
        getCreditsBalance: vi.fn().mockResolvedValue(250),
        exec: vi.fn().mockRejectedValue(new Error("sandbox exec timeout")),
      }),
      makeDb(),
    );

    expect(status.sandboxHealthy).toBe(false);
    expect(status.diagnostics.sandboxError).toBe("sandbox exec timeout");
    expect(formatResourceReport(status)).toContain("Sandbox: UNHEALTHY (sandbox exec timeout)");
  });

  it("records non-zero sandbox exit codes as diagnostics", async () => {
    vi.mocked(getUsdcBalance).mockResolvedValue(1.25);

    const status = await checkResources(
      makeIdentity(),
      makeConwayClient({
        getCreditsBalance: vi.fn().mockResolvedValue(250),
        exec: vi.fn().mockResolvedValue({ stdout: "", stderr: "boom", exitCode: 2 }),
      }),
      makeDb(),
    );

    expect(status.sandboxHealthy).toBe(false);
    expect(status.diagnostics.sandboxError).toBe("health command exited 2");
    expect(formatResourceReport(status)).toContain("Sandbox: UNHEALTHY (health command exited 2)");
  });
});

function makeIdentity(): AutomatonIdentity {
  return {
    name: "Test Automaton",
    address: "0x1234567890123456789012345678901234567890",
    account: {} as AutomatonIdentity["account"],
    creatorAddress: "0x0000000000000000000000000000000000000000",
    sandboxId: "sandbox-1",
    apiKey: "test-api-key",
    createdAt: new Date(0).toISOString(),
  };
}

function makeConwayClient(overrides: Partial<ConwayClient>): ConwayClient {
  return overrides as ConwayClient;
}

function makeDb(): AutomatonDatabase {
  const kv = new Map<string, string>();
  return {
    getKV: vi.fn((key: string) => kv.get(key)),
    setKV: vi.fn((key: string, value: string) => {
      kv.set(key, value);
    }),
  } as unknown as AutomatonDatabase;
}
