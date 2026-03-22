import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalArgv = process.argv.slice();
const originalExit = process.exit;

describe("creator CLI command validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv.slice();
    process.exit = originalExit;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("send exits early for an invalid recipient address", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as typeof process.exit);

    process.argv = ["node", "automaton-cli", "send", "not-an-address", "hello"];

    vi.doMock("@conway/automaton/config.js", () => ({
      loadConfig: () => ({
        socialRelayUrl: "https://social.conway.tech",
      }),
    }));
    vi.doMock("@conway/automaton/identity/chain.js", () => ({
      isValidAddress: () => false,
    }));
    vi.doMock("@conway/automaton/social/validation.js", () => ({
      validateRelayUrl: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      privateKeyToAccount: vi.fn(),
    }));
    vi.doMock("viem", () => ({
      keccak256: vi.fn(),
      toBytes: vi.fn(),
    }));
    vi.doMock("fs", () => ({
      default: {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
      },
    }));
    vi.doMock("path", () => ({
      default: {
        join: vi.fn(),
      },
    }));

    await expect(import("../../packages/cli/src/commands/send.ts")).rejects.toThrow("process.exit:1");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith("Invalid recipient address: not-an-address");
  });

  it("fund exits before fetch when the destination address is invalid", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as typeof process.exit);
    const fetchSpy = vi.fn();

    process.argv = ["node", "automaton-cli", "fund", "5.00", "--to", "not-an-address"];
    vi.stubGlobal("fetch", fetchSpy);

    vi.doMock("@conway/automaton/config.js", () => ({
      loadConfig: () => ({
        name: "Test Automaton",
        walletAddress: "0x1234567890123456789012345678901234567890",
        conwayApiKey: "test-api-key",
        conwayApiUrl: "https://api.conway.tech",
      }),
    }));
    vi.doMock("@conway/automaton/identity/chain.js", () => ({
      isValidAddress: () => false,
    }));

    await expect(import("../../packages/cli/src/commands/fund.ts")).rejects.toThrow("process.exit:1");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith("Invalid destination address: not-an-address");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
