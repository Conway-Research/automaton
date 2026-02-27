import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { openAiCtor } = vi.hoisted(() => {
  const ctor = vi.fn().mockImplementation(function MockOpenAI(this: any, options: unknown) {
    this.options = options;
    this.chat = {
      completions: {
        create: vi.fn(),
      },
    };
  });

  return {
    openAiCtor: ctor,
  };
});

vi.mock("openai", () => ({
  default: openAiCtor,
}));

import {
  ProviderRegistry,
  type ModelTier,
  type ProviderConfig,
} from "../../inference/provider-registry.js";

const ORIGINAL_ENV = { ...process.env };

function makeTempConfigFile(payload: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-registry-test-"));
  const filePath = path.join(dir, "providers.json");
  fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
  return filePath;
}

function makeMissingPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-registry-missing-"));
  return path.join(dir, "does-not-exist.json");
}

function createRegistryFromDefaults(): ProviderRegistry {
  return ProviderRegistry.fromConfig(makeMissingPath());
}

function providerIdsForTier(registry: ProviderRegistry, tier: ModelTier, survivalMode = false): string[] {
  return registry.resolveCandidates(tier, survivalMode).map((entry) => entry.provider.id);
}

describe("ProviderRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.AUTOMATON_CREDITS_BALANCE;
    delete process.env.AUTOMATON_INFERENCE_TASK_TYPE;
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("fromConfig loads defaults when file is missing", () => {
    const registry = ProviderRegistry.fromConfig(makeMissingPath());

    const providers = registry.getProviders();
    expect(providers.length).toBe(4);
    expect(providers.map((provider) => provider.id)).toEqual([
      "openai",
      "groq",
      "together",
      "local",
    ]);
    expect(providers.find((provider) => provider.id === "openai")?.enabled).toBe(true);
    expect(providers.find((provider) => provider.id === "together")?.enabled).toBe(false);
  });

  it("fromConfig keeps defaults when JSON is invalid", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-registry-invalid-"));
    const filePath = path.join(dir, "invalid.json");
    fs.writeFileSync(filePath, "{ not json", "utf8");

    const registry = ProviderRegistry.fromConfig(filePath);
    expect(registry.getProviders().length).toBe(4);
    expect(registry.resolveModel("reasoning").provider.id).toBe("openai");
  });

  it("fromConfig applies provider overrides", () => {
    const filePath = makeTempConfigFile({
      providers: [
        {
          id: "openai",
          name: "OpenAI Custom",
          baseUrl: "https://api.custom/v1",
          apiKeyEnvVar: "OPENAI_API_KEY",
          enabled: true,
          priority: 4,
          models: [
            {
              id: "gpt-x",
              tier: "reasoning",
              contextWindow: 200000,
              maxOutputTokens: 2000,
              costPerInputToken: 1,
              costPerOutputToken: 2,
              supportsTools: true,
              supportsVision: true,
              supportsStreaming: true,
            },
          ],
        },
      ],
    });

    const registry = ProviderRegistry.fromConfig(filePath);
    const providers = registry.getProviders();

    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("OpenAI Custom");
    expect(registry.resolveModel("reasoning").model.id).toBe("gpt-x");
  });

  it("fromConfig applies custom tier defaults", () => {
    const filePath = makeTempConfigFile({
      tierDefaults: {
        fast: {
          preferredProvider: "openai",
          fallbackOrder: ["groq"],
        },
      },
    });

    const registry = ProviderRegistry.fromConfig(filePath);
    expect(registry.resolveModel("fast").provider.id).toBe("openai");
  });

  it("fromConfig ignores invalid providers payload", () => {
    const filePath = makeTempConfigFile({
      providers: {
        broken: true,
      },
    });

    const registry = ProviderRegistry.fromConfig(filePath);
    expect(registry.getProviders().length).toBe(4);
  });

  it("fromConfig uses emergencyStopCredits from config", () => {
    const filePath = makeTempConfigFile({
      globalRateLimits: {
        emergencyStopCredits: 9999,
      },
    });

    process.env.AUTOMATON_CREDITS_BALANCE = "500";
    process.env.AUTOMATON_INFERENCE_TASK_TYPE = "agent_turn";

    const registry = ProviderRegistry.fromConfig(filePath);
    expect(() => registry.resolveModel("reasoning")).toThrow(/Emergency stop active/);
  });

  it("resolveModel returns reasoning model from default tier", () => {
    const registry = createRegistryFromDefaults();
    const resolved = registry.resolveModel("reasoning");

    expect(resolved.provider.id).toBe("openai");
    expect(resolved.model.id).toBe("gpt-4.1");
  });

  it("resolveModel returns fast model from default tier", () => {
    const registry = createRegistryFromDefaults();
    const resolved = registry.resolveModel("fast");

    expect(resolved.provider.id).toBe("groq");
    expect(resolved.model.tier).toBe("fast");
  });

  it("resolveModel returns cheap model from default tier", () => {
    const registry = createRegistryFromDefaults();
    const resolved = registry.resolveModel("cheap");

    expect(resolved.provider.id).toBe("groq");
    expect(resolved.model.id).toBe("llama-3.1-8b-instant");
  });

  it("resolveCandidates returns fallback order for reasoning tier", () => {
    const registry = createRegistryFromDefaults();
    expect(providerIdsForTier(registry, "reasoning")).toEqual(["openai", "groq"]);
  });

  it("resolveCandidates skips providers disabled in config", () => {
    const registry = createRegistryFromDefaults();
    const fastCandidates = providerIdsForTier(registry, "fast");

    expect(fastCandidates).not.toContain("together");
    expect(fastCandidates).not.toContain("local");
  });

  it("resolveModel in survival mode downgrades reasoning to fast", () => {
    const registry = createRegistryFromDefaults();
    const resolved = registry.resolveModel("reasoning", true);

    expect(resolved.model.tier).toBe("fast");
    expect(resolved.provider.id).toBe("groq");
  });

  it("resolveModel in survival mode downgrades fast to cheap", () => {
    const registry = createRegistryFromDefaults();
    const resolved = registry.resolveModel("fast", true);

    expect(resolved.model.tier).toBe("cheap");
    expect(resolved.model.id).toBe("llama-3.1-8b-instant");
  });

  it("resolveModel in survival mode keeps cheap as cheap", () => {
    const registry = createRegistryFromDefaults();
    const resolved = registry.resolveModel("cheap", true);

    expect(resolved.model.tier).toBe("cheap");
  });

  it("survival mode falls back to original tier when downgraded tier has no model", () => {
    const filePath = makeTempConfigFile({
      providers: [
        {
          id: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKeyEnvVar: "OPENAI_API_KEY",
          priority: 1,
          enabled: true,
          models: [
            {
              id: "reason-only",
              tier: "reasoning",
              contextWindow: 128000,
              maxOutputTokens: 8192,
              costPerInputToken: 1,
              costPerOutputToken: 1,
              supportsTools: true,
              supportsVision: false,
              supportsStreaming: true,
            },
          ],
        },
      ],
    });

    const registry = ProviderRegistry.fromConfig(filePath);
    const resolved = registry.resolveModel("reasoning", true);

    expect(resolved.model.id).toBe("reason-only");
    expect(resolved.model.tier).toBe("reasoning");
  });

  it("disableProvider and enableProvider toggle provider availability", () => {
    const registry = createRegistryFromDefaults();

    registry.disableProvider("openai", "manual", 60_000);
    expect(providerIdsForTier(registry, "reasoning")).toEqual(["groq"]);

    registry.enableProvider("openai");
    expect(providerIdsForTier(registry, "reasoning")).toEqual(["openai", "groq"]);
  });

  it("disableProvider ignores unknown provider IDs", () => {
    const registry = createRegistryFromDefaults();
    expect(() => registry.disableProvider("unknown", "noop", 10_000)).not.toThrow();
  });

  it("disableProvider with duration 0 expires immediately", () => {
    const registry = createRegistryFromDefaults();

    registry.disableProvider("openai", "temporary", 0);
    expect(providerIdsForTier(registry, "reasoning")).toContain("openai");
  });

  it("temporary disablement expires after duration", () => {
    vi.useFakeTimers();

    const registry = createRegistryFromDefaults();
    registry.disableProvider("openai", "maintenance", 5_000);

    expect(providerIdsForTier(registry, "reasoning")).toEqual(["groq"]);

    vi.advanceTimersByTime(5_001);
    expect(providerIdsForTier(registry, "reasoning")).toEqual(["openai", "groq"]);

    vi.useRealTimers();
  });

  it("getProviders returns providers sorted by priority", () => {
    const registry = createRegistryFromDefaults();

    const providers = registry.getProviders();
    const priorities = providers.map((provider) => provider.priority);

    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it("getProviders reflects runtime disablement state", () => {
    const registry = createRegistryFromDefaults();
    registry.disableProvider("groq", "circuit-breaker", 60_000);

    const groq = registry.getProviders().find((provider) => provider.id === "groq");
    expect(groq?.enabled).toBe(false);
  });

  it("getProviders returns deep-cloned provider objects", () => {
    const registry = createRegistryFromDefaults();
    const providers = registry.getProviders();

    providers[0].models[0].id = "mutated";

    const fresh = registry.getProviders();
    expect(fresh[0].models[0].id).not.toBe("mutated");
  });

  it("getModel returns requested provider/model", () => {
    const registry = createRegistryFromDefaults();
    const resolved = registry.getModel("openai", "gpt-4.1-mini");

    expect(resolved.provider.id).toBe("openai");
    expect(resolved.model.id).toBe("gpt-4.1-mini");
  });

  it("getModel throws for unknown provider", () => {
    const registry = createRegistryFromDefaults();
    expect(() => registry.getModel("unknown", "model")).toThrow(/Unknown provider/);
  });

  it("getModel throws for unknown model on known provider", () => {
    const registry = createRegistryFromDefaults();
    expect(() => registry.getModel("openai", "missing-model")).toThrow(/Unknown model/);
  });

  it("getModel throws when provider is disabled", () => {
    const registry = createRegistryFromDefaults();
    registry.disableProvider("openai", "circuit-breaker", 60_000);

    expect(() => registry.getModel("openai", "gpt-4.1")).toThrow(/disabled/);
  });

  it("emergency policy blocks non-planner calls below threshold", () => {
    const registry = createRegistryFromDefaults();
    process.env.AUTOMATON_CREDITS_BALANCE = "50";
    process.env.AUTOMATON_INFERENCE_TASK_TYPE = "agent_turn";

    expect(() => registry.resolveModel("reasoning")).toThrow(/Emergency stop active/);
  });

  it("emergency policy allows planner calls below threshold", () => {
    const registry = createRegistryFromDefaults();
    process.env.AUTOMATON_CREDITS_BALANCE = "50";
    process.env.AUTOMATON_INFERENCE_TASK_TYPE = "planner_step";

    expect(() => registry.resolveModel("reasoning")).not.toThrow();
  });

  it("emergency policy does nothing when credits env var is missing", () => {
    const registry = createRegistryFromDefaults();
    delete process.env.AUTOMATON_CREDITS_BALANCE;

    expect(() => registry.resolveModel("reasoning")).not.toThrow();
  });

  it("resolveModel throws when no provider has a model for the tier", () => {
    const providers: ProviderConfig[] = [
      {
        id: "only-fast",
        name: "Only Fast",
        baseUrl: "https://example.com/v1",
        apiKeyEnvVar: "ONLY_FAST_KEY",
        models: [
          {
            id: "fast-model",
            tier: "fast",
            contextWindow: 10000,
            maxOutputTokens: 1024,
            costPerInputToken: 0,
            costPerOutputToken: 0,
            supportsTools: false,
            supportsVision: false,
            supportsStreaming: false,
          },
        ],
        maxRequestsPerMinute: 100,
        maxTokensPerMinute: 100000,
        priority: 1,
        enabled: true,
      },
    ];

    const registry = new ProviderRegistry(providers);
    expect(() => registry.resolveModel("reasoning")).toThrow(/No provider\/model/);
  });

  it("creates OpenAI clients when resolving models", () => {
    const registry = createRegistryFromDefaults();
    registry.resolveModel("reasoning");
    registry.resolveModel("fast");

    expect(openAiCtor).toHaveBeenCalledTimes(4);
  });
});
