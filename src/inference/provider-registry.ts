import fs from "node:fs";
import OpenAI from "openai";

export type ModelTier = "reasoning" | "fast" | "cheap";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  models: ModelConfig[];
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  priority: number;
  enabled: boolean;
}

export interface ModelConfig {
  id: string;
  tier: ModelTier;
  contextWindow: number;
  maxOutputTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

export interface ResolvedModel {
  provider: ProviderConfig;
  model: ModelConfig;
  client: OpenAI;
}

interface TierDefault {
  preferredProvider: string;
  fallbackOrder: string[];
}

interface ProviderDisablement {
  reason: string;
  disabledUntil: number;
}

interface ProviderConfigFile {
  providers?: unknown;
  tierDefaults?: Partial<Record<ModelTier, Partial<TierDefault>>>;
  globalRateLimits?: {
    emergencyStopCredits?: number;
  };
}

const DEFAULT_EMERGENCY_STOP_CREDITS = 100;

const DEFAULT_TIER_DEFAULTS: Record<ModelTier, TierDefault> = {
  reasoning: {
    preferredProvider: "openai",
    fallbackOrder: ["groq", "together"],
  },
  fast: {
    preferredProvider: "groq",
    fallbackOrder: ["openai", "together", "local"],
  },
  cheap: {
    preferredProvider: "groq",
    fallbackOrder: ["together", "local", "openai"],
  },
};

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnvVar: "OPENAI_API_KEY",
    models: [
      {
        id: "gpt-4.1",
        tier: "reasoning",
        contextWindow: 128000,
        maxOutputTokens: 32768,
        costPerInputToken: 2.0,
        costPerOutputToken: 8.0,
        supportsTools: true,
        supportsVision: true,
        supportsStreaming: true,
      },
      {
        id: "gpt-4.1-mini",
        tier: "fast",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        costPerInputToken: 0.4,
        costPerOutputToken: 1.6,
        supportsTools: true,
        supportsVision: true,
        supportsStreaming: true,
      },
      {
        id: "gpt-4.1-nano",
        tier: "cheap",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        costPerInputToken: 0.1,
        costPerOutputToken: 0.4,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
    ],
    maxRequestsPerMinute: 500,
    maxTokensPerMinute: 2_000_000,
    priority: 1,
    enabled: true,
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnvVar: "GROQ_API_KEY",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        tier: "reasoning",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        costPerInputToken: 0.2,
        costPerOutputToken: 0.2,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
      {
        id: "llama-3.3-70b-versatile",
        tier: "fast",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        costPerInputToken: 0.2,
        costPerOutputToken: 0.2,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
      {
        id: "llama-3.1-8b-instant",
        tier: "cheap",
        contextWindow: 131072,
        maxOutputTokens: 4096,
        costPerInputToken: 0.05,
        costPerOutputToken: 0.08,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
    ],
    maxRequestsPerMinute: 14400,
    maxTokensPerMinute: 500000,
    priority: 2,
    enabled: true,
  },
  {
    id: "together",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    apiKeyEnvVar: "TOGETHER_API_KEY",
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        tier: "reasoning",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        costPerInputToken: 0.25,
        costPerOutputToken: 0.5,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        tier: "fast",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        costPerInputToken: 0.25,
        costPerOutputToken: 0.5,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
      {
        id: "meta-llama/Llama-3.1-8B-Instruct-Turbo",
        tier: "cheap",
        contextWindow: 131072,
        maxOutputTokens: 4096,
        costPerInputToken: 0.08,
        costPerOutputToken: 0.1,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
    ],
    maxRequestsPerMinute: 600,
    maxTokensPerMinute: 1_000_000,
    priority: 3,
    enabled: false,
  },
  {
    id: "local",
    name: "Local (Ollama/vLLM)",
    baseUrl: "http://localhost:11434/v1",
    apiKeyEnvVar: "LOCAL_API_KEY",
    models: [
      {
        id: "llama3.3:70b",
        tier: "fast",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        costPerInputToken: 0,
        costPerOutputToken: 0,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
      {
        id: "llama3.1:8b",
        tier: "cheap",
        contextWindow: 131072,
        maxOutputTokens: 4096,
        costPerInputToken: 0,
        costPerOutputToken: 0,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
    ],
    maxRequestsPerMinute: 100,
    maxTokensPerMinute: 200000,
    priority: 10,
    enabled: false,
  },
];

export class ProviderRegistry {
  private readonly providers: ProviderConfig[];
  private readonly tierDefaults: Record<ModelTier, TierDefault>;
  private readonly disablements = new Map<string, ProviderDisablement>();
  private readonly emergencyStopCredits: number;

  constructor(
    providers: ProviderConfig[],
    tierDefaults: Record<ModelTier, TierDefault> = DEFAULT_TIER_DEFAULTS,
    emergencyStopCredits = DEFAULT_EMERGENCY_STOP_CREDITS,
  ) {
    this.providers = providers
      .map((provider) => deepCloneProvider(provider))
      .sort((a, b) => a.priority - b.priority);
    this.tierDefaults = {
      reasoning: normalizeTierDefault(tierDefaults.reasoning, DEFAULT_TIER_DEFAULTS.reasoning),
      fast: normalizeTierDefault(tierDefaults.fast, DEFAULT_TIER_DEFAULTS.fast),
      cheap: normalizeTierDefault(tierDefaults.cheap, DEFAULT_TIER_DEFAULTS.cheap),
    };
    this.emergencyStopCredits = emergencyStopCredits;
  }

  overrideBaseUrl(providerId: string, baseUrl: string): void {
    const provider = this.providers.find((p) => p.id === providerId);
    if (provider) {
      provider.baseUrl = baseUrl;
    }
  }

  static fromConfig(configPath: string): ProviderRegistry {
    let providers = DEFAULT_PROVIDERS.map((provider) => deepCloneProvider(provider));
    let tierDefaults = DEFAULT_TIER_DEFAULTS;
    let emergencyStopCredits = DEFAULT_EMERGENCY_STOP_CREDITS;

    if (!fs.existsSync(configPath)) {
      return new ProviderRegistry(providers, tierDefaults, emergencyStopCredits);
    }

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as ProviderConfigFile;
      const configuredProviders = normalizeProviders(raw.providers);
      if (configuredProviders.length > 0) {
        providers = configuredProviders;
      }

      if (raw.tierDefaults && typeof raw.tierDefaults === "object") {
        tierDefaults = {
          reasoning: normalizeTierDefault(raw.tierDefaults.reasoning, DEFAULT_TIER_DEFAULTS.reasoning),
          fast: normalizeTierDefault(raw.tierDefaults.fast, DEFAULT_TIER_DEFAULTS.fast),
          cheap: normalizeTierDefault(raw.tierDefaults.cheap, DEFAULT_TIER_DEFAULTS.cheap),
        };
      }

      const configuredEmergencyStop = raw.globalRateLimits?.emergencyStopCredits;
      if (typeof configuredEmergencyStop === "number" && configuredEmergencyStop > 0) {
        emergencyStopCredits = configuredEmergencyStop;
      }
    } catch {
      // Keep defaults if config is invalid.
    }

    return new ProviderRegistry(providers, tierDefaults, emergencyStopCredits);
  }

  resolveModel(tier: ModelTier, survivalMode = false): ResolvedModel {
    const candidates = this.resolveCandidates(tier, survivalMode);
    if (candidates.length === 0) {
      throw new Error(`No provider/model available for tier '${tier}'`);
    }
    return candidates[0];
  }

  resolveCandidates(tier: ModelTier, survivalMode = false): ResolvedModel[] {
    this.assertEmergencyPolicy();

    const effectiveTier = this.applySurvivalTier(tier, survivalMode);
    const orderedProviders = this.getProviderOrderForTier(effectiveTier);
    const results: ResolvedModel[] = [];

    for (const provider of orderedProviders) {
      if (!this.isProviderActive(provider)) {
        continue;
      }

      const model = provider.models.find((candidate) => candidate.tier === effectiveTier);
      if (!model) {
        continue;
      }

      results.push(this.buildResolvedModel(provider, model));
    }

    if (results.length > 0) {
      return results;
    }

    if (effectiveTier !== tier) {
      for (const provider of this.getProviderOrderForTier(tier)) {
        if (!this.isProviderActive(provider)) {
          continue;
        }

        const model = provider.models.find((candidate) => candidate.tier === tier);
        if (!model) {
          continue;
        }

        results.push(this.buildResolvedModel(provider, model));
      }
    }

    return results;
  }

  getModel(providerId: string, modelId: string): ResolvedModel {
    const provider = this.providers.find((candidate) => candidate.id === providerId);
    if (!provider) {
      throw new Error(`Unknown provider '${providerId}'`);
    }

    if (!this.isProviderActive(provider)) {
      throw new Error(`Provider '${providerId}' is disabled`);
    }

    const model = provider.models.find((candidate) => candidate.id === modelId);
    if (!model) {
      throw new Error(`Unknown model '${modelId}' on provider '${providerId}'`);
    }

    return this.buildResolvedModel(provider, model);
  }

  getProviders(): ProviderConfig[] {
    return this.providers
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((provider) => ({
        ...deepCloneProvider(provider),
        enabled: this.isProviderActive(provider),
      }));
  }

  disableProvider(id: string, reason: string, durationMs: number): void {
    const provider = this.providers.find((candidate) => candidate.id === id);
    if (!provider) {
      return;
    }

    this.disablements.set(id, {
      reason,
      disabledUntil: Date.now() + Math.max(0, durationMs),
    });
  }

  enableProvider(id: string): void {
    this.disablements.delete(id);
  }

  private getProviderOrderForTier(tier: ModelTier): ProviderConfig[] {
    const preferred = this.tierDefaults[tier];
    const orderedIds = [
      preferred.preferredProvider,
      ...preferred.fallbackOrder,
      ...this.providers
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((provider) => provider.id),
    ];

    const seen = new Set<string>();
    const orderedProviders: ProviderConfig[] = [];

    for (const id of orderedIds) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);

      const provider = this.providers.find((candidate) => candidate.id === id);
      if (!provider) {
        continue;
      }

      orderedProviders.push(provider);
    }

    return orderedProviders;
  }

  private buildResolvedModel(provider: ProviderConfig, model: ModelConfig): ResolvedModel {
    const apiKey = this.resolveApiKey(provider);
    const client = new OpenAI({
      apiKey,
      baseURL: provider.baseUrl,
    });

    return {
      provider: deepCloneProvider(provider),
      model: { ...model },
      client,
    };
  }

  private resolveApiKey(provider: ProviderConfig): string {
    const configured = process.env[provider.apiKeyEnvVar];
    if (typeof configured === "string" && configured.length > 0) {
      return configured;
    }

    if (provider.id === "local") {
      return "local";
    }

    return `missing-${provider.apiKeyEnvVar.toLowerCase()}`;
  }

  private isProviderActive(provider: ProviderConfig): boolean {
    if (!provider.enabled) {
      return false;
    }

    const disabled = this.disablements.get(provider.id);
    if (!disabled) {
      return true;
    }

    if (disabled.disabledUntil <= Date.now()) {
      this.disablements.delete(provider.id);
      return true;
    }

    return false;
  }

  private applySurvivalTier(tier: ModelTier, survivalMode: boolean): ModelTier {
    if (!survivalMode) {
      return tier;
    }

    if (tier === "reasoning") {
      return "fast";
    }

    if (tier === "fast") {
      return "cheap";
    }

    return tier;
  }

  private assertEmergencyPolicy(): void {
    const rawCredits = process.env.AUTOMATON_CREDITS_BALANCE;
    if (!rawCredits) {
      return;
    }

    const credits = Number(rawCredits);
    if (!Number.isFinite(credits) || credits >= this.emergencyStopCredits) {
      return;
    }

    const taskType = (process.env.AUTOMATON_INFERENCE_TASK_TYPE || "").toLowerCase();
    const plannerCall = taskType.includes("planner") || taskType.includes("planning");

    if (!plannerCall) {
      throw new Error(
        `Emergency stop active (${credits} credits < ${this.emergencyStopCredits}); only planner calls are allowed`,
      );
    }
  }
}

function normalizeProviders(input: unknown): ProviderConfig[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const defaultsById = new Map(DEFAULT_PROVIDERS.map((provider) => [provider.id, provider]));
  const normalized: ProviderConfig[] = [];

  for (const rawProvider of input) {
    if (!rawProvider || typeof rawProvider !== "object") {
      continue;
    }

    const candidate = rawProvider as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id : null;
    if (!id) {
      continue;
    }

    const fallback = defaultsById.get(id);
    const models = normalizeModels(candidate.models, fallback?.models ?? []);
    if (models.length === 0) {
      continue;
    }

    normalized.push({
      id,
      name: stringOr(candidate.name, fallback?.name ?? id),
      baseUrl: stringOr(candidate.baseUrl, fallback?.baseUrl ?? "https://api.openai.com/v1"),
      apiKeyEnvVar: stringOr(candidate.apiKeyEnvVar, fallback?.apiKeyEnvVar ?? "OPENAI_API_KEY"),
      models,
      maxRequestsPerMinute: numberOr(candidate.maxRequestsPerMinute, fallback?.maxRequestsPerMinute ?? 600),
      maxTokensPerMinute: numberOr(candidate.maxTokensPerMinute, fallback?.maxTokensPerMinute ?? 200000),
      priority: numberOr(candidate.priority, fallback?.priority ?? 100),
      enabled: booleanOr(candidate.enabled, fallback?.enabled ?? true),
    });
  }

  return normalized.sort((a, b) => a.priority - b.priority);
}

function normalizeModels(input: unknown, fallbackModels: ModelConfig[]): ModelConfig[] {
  if (!Array.isArray(input)) {
    return fallbackModels.map((model) => ({ ...model }));
  }

  const models: ModelConfig[] = [];

  for (const rawModel of input) {
    if (!rawModel || typeof rawModel !== "object") {
      continue;
    }

    const candidate = rawModel as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id : null;
    if (!id) {
      continue;
    }

    const fallbackById = fallbackModels.find((model) => model.id === id);
    const tier = normalizeTier(candidate.tier, fallbackById?.tier);
    const fallback =
      fallbackModels.find((model) => model.id === id && model.tier === tier) ||
      fallbackModels.find((model) => model.id === id) ||
      fallbackById;

    models.push({
      id,
      tier,
      contextWindow: numberOr(candidate.contextWindow, fallback?.contextWindow ?? 128000),
      maxOutputTokens: numberOr(candidate.maxOutputTokens, fallback?.maxOutputTokens ?? 8192),
      costPerInputToken: numberOr(candidate.costPerInputToken, fallback?.costPerInputToken ?? 0),
      costPerOutputToken: numberOr(candidate.costPerOutputToken, fallback?.costPerOutputToken ?? 0),
      supportsTools: booleanOr(candidate.supportsTools, fallback?.supportsTools ?? true),
      supportsVision: booleanOr(candidate.supportsVision, fallback?.supportsVision ?? false),
      supportsStreaming: booleanOr(candidate.supportsStreaming, fallback?.supportsStreaming ?? true),
    });
  }

  return models;
}

function normalizeTier(input: unknown, fallback: ModelTier | undefined): ModelTier {
  if (input === "reasoning" || input === "fast" || input === "cheap") {
    return input;
  }

  if (fallback) {
    return fallback;
  }

  return "fast";
}

function normalizeTierDefault(input: Partial<TierDefault> | undefined, fallback: TierDefault): TierDefault {
  const preferredProvider =
    typeof input?.preferredProvider === "string" && input.preferredProvider.length > 0
      ? input.preferredProvider
      : fallback.preferredProvider;

  const fallbackOrder = Array.isArray(input?.fallbackOrder)
    ? input.fallbackOrder.filter((id): id is string => typeof id === "string")
    : fallback.fallbackOrder;

  return {
    preferredProvider,
    fallbackOrder: fallbackOrder.filter((id) => id !== preferredProvider),
  };
}

function deepCloneProvider(provider: ProviderConfig): ProviderConfig {
  return {
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
