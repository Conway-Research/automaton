/**
 * Automaton Configuration
 *
 * Loads and saves the automaton's configuration from ~/.automaton/automaton.json
 */

import fs from "fs";
import {readProtectedJson,writeProtectedJson} from "./security/protected-json.js";
import path from "path";
import os from "node:os";
import type { AutomatonConfig, TreasuryPolicy, ModelStrategyConfig, SoulConfig } from "./types.js";
import { DEFAULT_CONFIG, DEFAULT_TREASURY_POLICY, DEFAULT_MODEL_STRATEGY_CONFIG, DEFAULT_SOUL_CONFIG } from "./types.js";
import { getAutomatonDir } from "./identity/wallet.js";
import { loadApiKeyFromConfig } from "./identity/provision.js";
import {registerConfigurationSecrets,registerLogSecrets} from './observability/redaction.js';
import type { ChainType } from "./identity/chain.js";

const CONFIG_FILENAME = "automaton.json";

export function getConfigPath(): string {
  return path.join(getAutomatonDir(), CONFIG_FILENAME);
}

/**
 * Load the automaton config from disk.
 * Merges with defaults for any missing fields.
 */
export function loadConfig(): AutomatonConfig | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readProtectedJson(configPath);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid configuration document');
    const apiKey = raw.conwayApiKey || loadApiKeyFromConfig();
    registerConfigurationSecrets(raw);
    registerLogSecrets([apiKey]);

    // Omitted legacy fields retain defaults. Explicit malformed protection
    // values must never be coerced or replaced with a more permissive limit.
    if(raw.treasuryPolicy!==undefined&&(!raw.treasuryPolicy||typeof raw.treasuryPolicy!=='object'||Array.isArray(raw.treasuryPolicy)))
      throw new Error('Invalid treasury policy');
    const treasuryPolicy: TreasuryPolicy = {
      ...DEFAULT_TREASURY_POLICY,
      ...(raw.treasuryPolicy ?? {}),
    };

    for (const key of Object.keys(DEFAULT_TREASURY_POLICY) as (keyof TreasuryPolicy)[]) {
      const value=treasuryPolicy[key];
      if(key==='x402AllowedDomains'){
        if(!Array.isArray(value)||value.length>100||value.some(domain=>typeof domain!=='string'||domain.length>253||
          !domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))))throw new Error('Invalid treasury domains');
      }else if(!Number.isSafeInteger(value)||(value as number)<0)throw new Error('Invalid treasury limit');
    }

    // Deep-merge model strategy config with defaults
    const modelStrategy: ModelStrategyConfig = {
      ...DEFAULT_MODEL_STRATEGY_CONFIG,
      ...(raw.modelStrategy ?? {}),
    };

    // Deep-merge soul config with defaults
    const soulConfig: SoulConfig = {
      ...DEFAULT_SOUL_CONFIG,
      ...(raw.soulConfig ?? {}),
    };

    return {
      ...DEFAULT_CONFIG,
      ...raw,
      sandboxId:
        typeof raw.sandboxId === "string"
          ? raw.sandboxId.trim()
          : DEFAULT_CONFIG.sandboxId,
      conwayApiKey: apiKey,
      treasuryPolicy,
      modelStrategy,
      soulConfig,
      chainType: raw.chainType || "evm",
    } as AutomatonConfig;
  } catch {
    // Missing configuration may trigger first-run setup. Unreadable existing
    // identity/configuration must never be mistaken for that state.
    throw new Error('Existing configuration could not be safely loaded; automatic setup is blocked');
  }
}

/**
 * Save the automaton config to disk.
 * Includes treasuryPolicy in the persisted config.
 */
export function saveConfig(config: AutomatonConfig): void {
  const dir = getAutomatonDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const configPath = getConfigPath();
  const toSave = {
    ...config,
    treasuryPolicy: config.treasuryPolicy ?? DEFAULT_TREASURY_POLICY,
    modelStrategy: config.modelStrategy ?? DEFAULT_MODEL_STRATEGY_CONFIG,
    soulConfig: config.soulConfig ?? DEFAULT_SOUL_CONFIG,
  };
  writeProtectedJson(configPath,toSave);
}

/**
 * Resolve ~ paths to absolute paths.
 */
export function resolvePath(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(process.env.HOME || os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Create a fresh config from setup wizard inputs.
 */
export function createConfig(params: {
  name: string;
  genesisPrompt: string;
  creatorMessage?: string;
  creatorAddress: string;
  registeredWithConway: boolean;
  sandboxId: string;
  walletAddress: string;
  apiKey: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
  parentAddress?: string;
  treasuryPolicy?: TreasuryPolicy;
  chainType?: ChainType;
}): AutomatonConfig {
  const normalizedSandboxId = (params.sandboxId || "").trim();
  return {
    name: params.name,
    genesisPrompt: params.genesisPrompt,
    creatorMessage: params.creatorMessage,
    creatorAddress: params.creatorAddress,
    registeredWithConway: params.registeredWithConway,
    sandboxId: normalizedSandboxId,
    conwayApiUrl:
      DEFAULT_CONFIG.conwayApiUrl || "https://api.conway.tech",
    conwayApiKey: params.apiKey,
    openaiApiKey: params.openaiApiKey,
    anthropicApiKey: params.anthropicApiKey,
    ollamaBaseUrl: params.ollamaBaseUrl,
    inferenceModel: DEFAULT_CONFIG.inferenceModel || "gpt-5.2",
    maxTokensPerTurn: DEFAULT_CONFIG.maxTokensPerTurn || 4096,
    heartbeatConfigPath:
      DEFAULT_CONFIG.heartbeatConfigPath || "~/.automaton/heartbeat.yml",
    dbPath: DEFAULT_CONFIG.dbPath || "~/.automaton/state.db",
    logLevel: (DEFAULT_CONFIG.logLevel as AutomatonConfig["logLevel"]) || "info",
    walletAddress: params.walletAddress,
    version: DEFAULT_CONFIG.version || "0.2.1",
    skillsDir: DEFAULT_CONFIG.skillsDir || "~/.automaton/skills",
    maxChildren: DEFAULT_CONFIG.maxChildren || 3,
    parentAddress: params.parentAddress,
    treasuryPolicy: params.treasuryPolicy ?? DEFAULT_TREASURY_POLICY,
    chainType: params.chainType || "evm",
  };
}
