import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import * as __testedFile from "../config.js";
import type { AutomatonConfig } from "../types.js";

vi.spyOn(fs, "readFileSync").mockImplementation((path: fs.PathOrFileDescriptor) => {
  switch (String(path)) {
    case "readme.md":
      return "# title";
    case "empty.json":
      return "{}";
    case "config.json":
      return JSON.stringify({
        conwayApiKey: "conwayApiKey",
        treasuryPolicy: "treasuryPolicy",
        modelStrategy: "modelStrategy",
        soulConfig: "soulConfig",
        sandboxId: "sandboxId",
      });
    default:
      throw new Error(`${path} not found`);
  }
});

const defaultConfig = {
  childSandboxMemoryMb: 1024,
  conwayApiKey: "mockApiKey",
  conwayApiUrl: "https://api.conway.tech",
  dbPath: "~/.automaton/state.db",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  maxTurnsPerCycle: 25,
  modelStrategy: expect.any(Object),
  sandboxId: undefined,
  skillsDir: "~/.automaton/skills",
  socialRelayUrl: "https://social.conway.tech",
  soulConfig: expect.any(Object),
  treasuryPolicy: expect.any(Object),
  version: "0.2.1",
};

const config = {
  childSandboxMemoryMb: 1024,
  conwayApiKey: "conwayApiKey",
  conwayApiUrl: "https://api.conway.tech",
  dbPath: "~/.automaton/state.db",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  maxTurnsPerCycle: 25,
  modelStrategy: expect.any(Object),
  sandboxId: "sandboxId",
  skillsDir: "~/.automaton/skills",
  socialRelayUrl: "https://social.conway.tech",
  soulConfig: expect.any(Object),
  treasuryPolicy: expect.any(Object),
  version: "0.2.1",
};

vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

const fullConfig: AutomatonConfig = {
  childSandboxMemoryMb: 1024,
  conwayApiKey: "conwayApiKey",
  conwayApiUrl: "https://api.conway.tech",
  dbPath: "~/.automaton/state.db",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  maxTurnsPerCycle: 25,
  modelStrategy: {} as any,
  sandboxId: "sandboxId",
  skillsDir: "~/.automaton/skills",
  socialRelayUrl: "https://social.conway.tech",
  soulConfig: {} as any,
  treasuryPolicy: {} as any,
  version: "0.2.1",
  name: "name",
  genesisPrompt: "genesisPrompt",
  creatorAddress: "0123456789",
  registeredWithConway: true,
  walletAddress: "0123456789",
};

const minNewConfig = {
  name: "name",
  genesisPrompt: "genesisPrompt",
  creatorAddress: "0123456789",
  registeredWithConway: true,
  sandboxId: "sandboxId",
  walletAddress: "0123456789",
  apiKey: "apiKey",
};

const maxNewConfig = {
  name: "name",
  genesisPrompt: "genesisPrompt",
  creatorMessage: "creatorMessage",
  creatorAddress: "0123456789",
  registeredWithConway: true,
  sandboxId: "sandboxId",
  walletAddress: "0123456789",
  apiKey: "apiKey",
  openaiApiKey: "openaiApiKey",
  anthropicApiKey: "anthropicApiKey",
  ollamaBaseUrl: "ollamaBaseUrl",
  parentAddress: "0123456789",
  treasuryPolicy: {} as any,
  chainType: "solana" as const,
};

const createdFromMinConfig: AutomatonConfig = {
  anthropicApiKey: undefined,
  chainType: "evm",
  conwayApiKey: "apiKey",
  conwayApiUrl: "https://api.conway.tech",
  creatorAddress: "0123456789",
  creatorMessage: undefined,
  dbPath: "~/.automaton/state.db",
  genesisPrompt: "genesisPrompt",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  name: "name",
  ollamaBaseUrl: undefined,
  openaiApiKey: undefined,
  parentAddress: undefined,
  registeredWithConway: true,
  sandboxId: "sandboxId",
  skillsDir: "~/.automaton/skills",
  treasuryPolicy: {
    maxDailyTransferCents: 25000,
    maxHourlyTransferCents: 10000,
    maxInferenceDailyCents: 50000,
    maxSingleTransferCents: 5000,
    maxTransfersPerTurn: 2,
    maxX402PaymentCents: 100,
    minimumReserveCents: 1000,
    requireConfirmationAboveCents: 1000,
    transferCooldownMs: 0,
    x402AllowedDomains: ["conway.tech"],
  },
  version: "0.2.1",
  walletAddress: "0123456789",
};

const createdFromMaxConfig: AutomatonConfig = {
  anthropicApiKey: "anthropicApiKey",
  chainType: "solana",
  conwayApiKey: "apiKey",
  conwayApiUrl: "https://api.conway.tech",
  creatorAddress: "0123456789",
  creatorMessage: "creatorMessage",
  dbPath: "~/.automaton/state.db",
  genesisPrompt: "genesisPrompt",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  name: "name",
  ollamaBaseUrl: "ollamaBaseUrl",
  openaiApiKey: "openaiApiKey",
  parentAddress: "0123456789",
  registeredWithConway: true,
  sandboxId: "sandboxId",
  skillsDir: "~/.automaton/skills",
  treasuryPolicy: {} as any,
  version: "0.2.1",
  walletAddress: "0123456789",
};

describe("src/config.ts", () => {
  describe("getConfigPath", () => {
    const { getConfigPath } = __testedFile;

    it("should test getConfigPath()", () => {
      const __expectedResult: ReturnType<typeof getConfigPath> = fromPosix("automatonDir/automaton.json");
      expect(getConfigPath()).toEqual(__expectedResult);
    });
  });

  describe("loadConfig", () => {
    const { loadConfig } = __testedFile;

    it("should test loadConfig()", () => {
      const __expectedResult: ReturnType<typeof loadConfig> = null;
      expect(loadConfig()).toEqual(__expectedResult);
    });
  });

  describe("loadConfigFrom", () => {
    const { loadConfigFrom } = __testedFile;
    // configPath: string

    it("loadConfigFrom from valid json file", () => {
      const configPath: Parameters<typeof loadConfigFrom>[0] = "config.json";
      const __expectedResult: ReturnType<typeof loadConfigFrom> = expect.objectContaining(config);
      expect(loadConfigFrom(configPath)).toEqual(__expectedResult);
    });

    it("loadConfigFrom from empty json file", () => {
      const configPath: Parameters<typeof loadConfigFrom>[0] = "empty.json";
      const __expectedResult: ReturnType<typeof loadConfigFrom> = expect.objectContaining(defaultConfig);
      expect(loadConfigFrom(configPath)).toEqual(__expectedResult);
    });

    it("loadConfigFrom from non-json file", () => {
      const configPath: Parameters<typeof loadConfigFrom>[0] = "readme.md";
      const __expectedResult: ReturnType<typeof loadConfigFrom> = null;
      expect(loadConfigFrom(configPath)).toEqual(__expectedResult);
    });
  });

  describe("saveConfig", () => {
    const { saveConfig } = __testedFile;
    // config: AutomatonConfig

    it("save config", () => {
      const config: Parameters<typeof saveConfig>[0] = fullConfig;
      const __expectedResult: ReturnType<typeof saveConfig> = undefined;
      expect(saveConfig(config)).toEqual(__expectedResult);
      expect(fs.mkdirSync).toHaveBeenCalledWith("automatonDir", { recursive: true, mode: 0o700 });
      expect(fs.writeFileSync).toHaveBeenCalledWith(fromPosix("automatonDir/automaton.json"), expect.anything(), {
        mode: 0o600,
      });
      const jsonString = (fs.writeFileSync as any).mock.calls[0][1];
      expect(JSON.parse(jsonString)).toMatchObject(fullConfig);
    });
  });

  describe("resolvePath", () => {
    const { resolvePath } = __testedFile;
    // p: string

    it("absolute", () => {
      const p: Parameters<typeof resolvePath>[0] = "xyz";
      Object.defineProperty(process, "env", {
        writable: true,
        value: {
          ...process.env,
          HOME: undefined,
        },
      });
      const __expectedResult: ReturnType<typeof resolvePath> = "xyz";
      expect(resolvePath(p)).toEqual(__expectedResult);
    });

    it("relative", () => {
      const p: Parameters<typeof resolvePath>[0] = "~/abc";
      Object.defineProperty(process, "env", {
        writable: true,
        value: {
          ...process.env,
          HOME: undefined,
        },
      });
      const __expectedResult: ReturnType<typeof resolvePath> = fromPosix("/root/abc");
      expect(resolvePath(p)).toEqual(__expectedResult);
    });

    it("absolute (env)", () => {
      const p: Parameters<typeof resolvePath>[0] = "xyz";
      Object.defineProperty(process, "env", {
        writable: true,
        value: {
          ...process.env,
          HOME: "/opt",
        },
      });
      const __expectedResult: ReturnType<typeof resolvePath> = "xyz";
      expect(resolvePath(p)).toEqual(__expectedResult);
    });

    it("relative (env)", () => {
      const p: Parameters<typeof resolvePath>[0] = "~/abc";
      Object.defineProperty(process, "env", {
        writable: true,
        value: {
          ...process.env,
          HOME: "/opt",
        },
      });
      const __expectedResult: ReturnType<typeof resolvePath> = fromPosix("/opt/abc");
      expect(resolvePath(p)).toEqual(__expectedResult);
    });
  });

  describe("createConfig", () => {
    const { createConfig } = __testedFile;
    // params: { name: string; genesisPrompt: string; creatorMessage?: string; creatorAddress: string; registeredWithConway: boolean; sandboxId: string; walletAddress: string; apiKey: string; openaiApiKey?: string; anthropicApiKey?: string; ollamaBaseUrl?: string; parentAddress?: string; treasuryPolicy?: TreasuryPolicy; chainType?: ChainType; }

    it("create config from max input", () => {
      const params: Parameters<typeof createConfig>[0] = maxNewConfig;
      const __expectedResult: ReturnType<typeof createConfig> = createdFromMaxConfig;
      expect(createConfig(params)).toEqual(__expectedResult);
    });

    it("create config from min input", () => {
      const params: Parameters<typeof createConfig>[0] = minNewConfig;
      const __expectedResult: ReturnType<typeof createConfig> = createdFromMinConfig;
      expect(createConfig(params)).toEqual(__expectedResult);
    });
  });
});

vi.mock("../identity/wallet.js");
vi.mock("../identity/provision.js", async () => {
  const module = await vi.importActual("../identity/provision.js");
  return {
    ...module,
    loadApiKeyFromConfig: () => "mockApiKey",
  };
});

// This is a helper function for running the tests also on Windows
// If the tests runs only on Linux then it can be deleted and also all references to it must be removed
function fromPosix(p: string) {
  return p.replace(/\//g, path.sep);
}

// 3TG (https://3tg.dev) created 12 tests in 2601 ms (216.750 ms per generated test) @ 2026-03-15T15:04:25.767Z
