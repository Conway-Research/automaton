import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import type { AutomatonConfig, TreasuryPolicy, ModelStrategyConfig, SoulConfig } from "./types.js";
import { DEFAULT_CONFIG, DEFAULT_TREASURY_POLICY, DEFAULT_MODEL_STRATEGY_CONFIG, DEFAULT_SOUL_CONFIG } from "./types.js";
import { getAutomatonDir } from "./identity/wallet.js";
import { loadApiKeyFromConfig } from "./identity/provision.js";
import { createLogger } from "./observability/logger.js";
import type { ChainType } from "./identity/chain.js";

const logger = createLogger("config");

export function getConfigPath(): string {
  return path.join(process.cwd(), ".env");
}

export function loadConfig(): AutomatonConfig | null {
  const configPath = getConfigPath();
  
  if (fs.existsSync(configPath)) {
    dotenv.config({ path: configPath });
  }

  if (!process.env.AUTOMATON_NAME || !process.env.CREATOR_ADDRESS) {
    return null;
  }

  try {
    const treasuryPolicy: TreasuryPolicy = { ...DEFAULT_TREASURY_POLICY };
    if (process.env.TREASURY_POLICY) {
      Object.assign(treasuryPolicy, JSON.parse(process.env.TREASURY_POLICY));
    }
    const modelStrategy: ModelStrategyConfig = { ...DEFAULT_MODEL_STRATEGY_CONFIG };
    if (process.env.MODEL_STRATEGY) {
      Object.assign(modelStrategy, JSON.parse(process.env.MODEL_STRATEGY));
    }
    const soulConfig: SoulConfig = { ...DEFAULT_SOUL_CONFIG };
    if (process.env.SOUL_CONFIG) {
      Object.assign(soulConfig, JSON.parse(process.env.SOUL_CONFIG));
    }

    return {
      ...DEFAULT_CONFIG,
      name: process.env.AUTOMATON_NAME,
      genesisPrompt: process.env.GENESIS_PROMPT || "You are an AI algorithmic trader.",
      creatorAddress: process.env.CREATOR_ADDRESS,
      creatorMessage: process.env.CREATOR_MESSAGE,
      sandboxId: process.env.SANDBOX_ID || (DEFAULT_CONFIG.sandboxId as string),
      conwayApiKey: process.env.CONWAY_API_KEY || "",
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      nimApiKey: process.env.NVIDIA_NIM_API_KEY,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      nimBaseUrl: process.env.NIM_BASE_URL,
      inferenceModel: process.env.INFERENCE_MODEL || (DEFAULT_CONFIG.inferenceModel as string),
      walletAddress: process.env.WALLET_ADDRESS || "",
      registeredWithConway: process.env.REGISTERED_WITH_CONWAY === "true",
      chainType: (process.env.CHAIN_TYPE as ChainType) || "evm",
      treasuryPolicy,
      modelStrategy,
      soulConfig
    } as AutomatonConfig;
  } catch (e) {
    logger.error("Failed to parse .env configuration", e instanceof Error ? e : new Error(String(e)));
    return null;
  }
}

export function saveConfig(config: AutomatonConfig): void {
  const configPath = getConfigPath();
  let envContent = "";
  
  if (fs.existsSync(configPath)) {
    envContent = fs.readFileSync(configPath, "utf-8");
  }

  const updateEnv = (key: string, value: any) => {
    if (value === undefined || value === null) return;
    const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const regex = new RegExp("^\\s*" + key + "=.*$", "m");
    const newEntry = key + "='" + valStr + "'";
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, newEntry);
    } else {
      envContent += envContent.endsWith("\n") || envContent === "" ? newEntry + "\n" : "\n" + newEntry + "\n";
    }
  };

  updateEnv("AUTOMATON_NAME", config.name);
  updateEnv("CREATOR_ADDRESS", config.creatorAddress);
  updateEnv("GENESIS_PROMPT", config.genesisPrompt);
  if (config.creatorMessage) updateEnv("CREATOR_MESSAGE", config.creatorMessage);
  updateEnv("SANDBOX_ID", config.sandboxId);
  updateEnv("CONWAY_API_KEY", config.conwayApiKey);
  updateEnv("OPENAI_API_KEY", config.openaiApiKey);
  updateEnv("ANTHROPIC_API_KEY", config.anthropicApiKey);
  updateEnv("NVIDIA_NIM_API_KEY", config.nimApiKey);
  updateEnv("OLLAMA_BASE_URL", config.ollamaBaseUrl);
  updateEnv("NIM_BASE_URL", config.nimBaseUrl);
  updateEnv("INFERENCE_MODEL", config.inferenceModel);
  updateEnv("WALLET_ADDRESS", config.walletAddress);
  updateEnv("REGISTERED_WITH_CONWAY", config.registeredWithConway);
  updateEnv("CHAIN_TYPE", config.chainType);
  updateEnv("TREASURY_POLICY", config.treasuryPolicy);
  updateEnv("MODEL_STRATEGY", config.modelStrategy);
  updateEnv("SOUL_CONFIG", config.soulConfig);

  fs.writeFileSync(configPath, envContent, { mode: 0o600 });
}

export function resolvePath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(process.env.HOME || "/root", p.slice(1));
  }
  return p;
}

export function createConfig(params: any): AutomatonConfig {
  const normalizedSandboxId = (params.sandboxId || "").trim();
  return {
    name: params.name,
    genesisPrompt: params.genesisPrompt,
    creatorMessage: params.creatorMessage,
    creatorAddress: params.creatorAddress,
    registeredWithConway: params.registeredWithConway,
    sandboxId: normalizedSandboxId,
    conwayApiUrl: DEFAULT_CONFIG.conwayApiUrl || "https://api.conway.tech",
    conwayApiKey: params.apiKey,
    openaiApiKey: params.openaiApiKey,
    anthropicApiKey: params.anthropicApiKey,
    nimApiKey: params.nimApiKey,
    ollamaBaseUrl: params.ollamaBaseUrl,
    nimBaseUrl: params.nimBaseUrl,
    inferenceModel: DEFAULT_CONFIG.inferenceModel || "gpt-5.2",
    maxTokensPerTurn: DEFAULT_CONFIG.maxTokensPerTurn || 4096,
    heartbeatConfigPath: DEFAULT_CONFIG.heartbeatConfigPath || "~/.automaton/heartbeat.yml",
    dbPath: DEFAULT_CONFIG.dbPath || "~/.automaton/state.db",
    logLevel: (DEFAULT_CONFIG.logLevel as AutomatonConfig["logLevel"]) || "info",
    walletAddress: params.walletAddress,
    version: DEFAULT_CONFIG.version || "0.2.1",
    skillsDir: DEFAULT_CONFIG.skillsDir || "~/.automaton/skills",
    maxChildren: DEFAULT_CONFIG.maxChildren || 3,
    parentAddress: params.parentAddress,
    treasuryPolicy: params.treasuryPolicy ?? DEFAULT_TREASURY_POLICY,
    chainType: params.chainType || "evm",
  } as AutomatonConfig;
}
