/**
 * Heartbeat Configuration
 *
 * Parses and manages heartbeat.yml configuration.
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";
import type { HeartbeatEntry, HeartbeatConfig, AutomatonDatabase } from "../types.js";
import { getAutomatonDir } from "../identity/wallet.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("heartbeat.config");

const USDC_TOPUP_ENTRY_NAME = "check_usdc_balance";
const USDC_TOPUP_FAST_SCHEDULE = "*/5 * * * *";
const USDC_TOPUP_OLD_SCHEDULE = "0 */12 * * *";

const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  entries: [
    {
      name: "heartbeat_ping",
      schedule: "*/15 * * * *",
      task: "heartbeat_ping",
      enabled: true,
    },
    {
      name: "check_credits",
      schedule: "0 */6 * * *",
      task: "check_credits",
      enabled: true,
    },
    {
      name: "check_usdc_balance",
      schedule: USDC_TOPUP_FAST_SCHEDULE,
      task: "check_usdc_balance",
      enabled: true,
    },
    {
      name: "check_for_updates",
      schedule: "0 */4 * * *",
      task: "check_for_updates",
      enabled: true,
    },
    {
      name: "health_check",
      schedule: "*/30 * * * *",
      task: "health_check",
      enabled: true,
    },
    {
      name: "check_social_inbox",
      schedule: "*/2 * * * *",
      task: "check_social_inbox",
      enabled: true,
    },
    {
      name: "creator_tax_check",
      schedule: "0 * * * *",
      task: "creator_tax_check",
      enabled: true,
    },
  ],
  defaultIntervalMs: 60_000,
  lowComputeMultiplier: 4,
};

/**
 * Load heartbeat config from YAML file, falling back to defaults.
 */
export function loadHeartbeatConfig(configPath?: string): HeartbeatConfig {
  const filePath =
    configPath || path.join(getAutomatonDir(), "heartbeat.yml");

  if (!fs.existsSync(filePath)) {
    return DEFAULT_HEARTBEAT_CONFIG;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = YAML.parse(raw) || {};

    const parsedEntries = (parsed.entries || []).map((e: any) => ({
      name: e.name,
      schedule: e.schedule,
      task: e.task,
      enabled: e.enabled !== false,
      params: e.params,
    })) as HeartbeatEntry[];

    const entries = mergeWithDefaults(parsedEntries);

    return {
      entries,
      defaultIntervalMs:
        parsed.defaultIntervalMs ?? DEFAULT_HEARTBEAT_CONFIG.defaultIntervalMs,
      lowComputeMultiplier:
        parsed.lowComputeMultiplier ??
        DEFAULT_HEARTBEAT_CONFIG.lowComputeMultiplier,
    };
  } catch (error: any) {
    logger.error("Failed to parse YAML config", error instanceof Error ? error : undefined);
    // Continue with defaults, but log the error
    return DEFAULT_HEARTBEAT_CONFIG;
  }
}

/**
 * Save heartbeat config to YAML file.
 */
export function saveHeartbeatConfig(
  config: HeartbeatConfig,
  configPath?: string,
): void {
  const filePath =
    configPath || path.join(getAutomatonDir(), "heartbeat.yml");
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(filePath, YAML.stringify(config), { mode: 0o600 });
}

/**
 * Write the default heartbeat.yml file.
 */
export function writeDefaultHeartbeatConfig(configPath?: string): void {
  saveHeartbeatConfig(DEFAULT_HEARTBEAT_CONFIG, configPath);
}

/**
 * Sync heartbeat entries from YAML config into the database.
 */
export function syncHeartbeatToDb(
  config: HeartbeatConfig,
  db: AutomatonDatabase,
): void {
  for (const entry of config.entries) {
    db.upsertHeartbeatEntry(entry);
  }
}

function mergeWithDefaults(entries: HeartbeatEntry[]): HeartbeatEntry[] {
  const defaults = DEFAULT_HEARTBEAT_CONFIG.entries.map((entry) => ({ ...entry }));
  const defaultsByName = new Map(defaults.map((entry) => [entry.name, entry]));
  const mergedByName = new Map(defaultsByName);

  for (const entry of entries) {
    if (!entry?.name) continue;
    const fallback = defaultsByName.get(entry.name);
    mergedByName.set(entry.name, {
      ...(fallback || {}),
      ...entry,
      enabled: entry.enabled !== false,
      task: entry.task || fallback?.task || "",
      schedule: entry.schedule || fallback?.schedule || "",
    });
  }

  const fallbackTopup = defaultsByName.get(USDC_TOPUP_ENTRY_NAME);
  if (fallbackTopup) {
    const current = mergedByName.get(USDC_TOPUP_ENTRY_NAME) || fallbackTopup;
    const migratedSchedule = current.schedule?.trim() === USDC_TOPUP_OLD_SCHEDULE
      ? USDC_TOPUP_FAST_SCHEDULE
      : current.schedule || fallbackTopup.schedule;

    mergedByName.set(USDC_TOPUP_ENTRY_NAME, {
      ...fallbackTopup,
      ...current,
      task: current.task || fallbackTopup.task,
      schedule: migratedSchedule,
    });
  }

  const orderedDefaultEntries = defaults.map(
    (defaultEntry) => mergedByName.get(defaultEntry.name) || defaultEntry,
  );
  const knownNames = new Set(defaults.map((entry) => entry.name));
  const customEntries = [...mergedByName.values()].filter(
    (entry) => !knownNames.has(entry.name),
  );

  return [...orderedDefaultEntries, ...customEntries];
}
