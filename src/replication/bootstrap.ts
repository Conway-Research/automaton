import fs from "node:fs";
import path from "node:path";
import type { GenesisConfig } from "../types.js";
import { createConfig } from "../config.js";
import { assertChildGenesisFits, validateGenesisParams } from "./genesis.js";
import { buildGenesisSection, inspectGenesisDelivery } from "../agent/genesis.js";

/** Parse only inherited identity/mission fields, never parent credentials,
 * permissions, treasury policy or arbitrary configuration properties. */
export function readChildGenesis(directory: string): GenesisConfig | undefined {
  const file = path.join(directory, "genesis.json");
  if (!fs.existsSync(file)) return undefined;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!raw || typeof raw.name !== "string" || typeof raw.genesisPrompt !== "string" ||
      typeof raw.creatorAddress !== "string" || typeof raw.parentAddress !== "string" ||
      (raw.creatorMessage !== undefined && typeof raw.creatorMessage !== "string") ||
      (raw.chainType !== undefined && !["evm", "solana"].includes(raw.chainType))) {
    throw new Error("Invalid child Genesis configuration");
  }
  validateGenesisParams({ name: raw.name });
  assertChildGenesisFits(raw.genesisPrompt);
  return { name: raw.name, genesisPrompt: raw.genesisPrompt, creatorAddress: raw.creatorAddress,
    parentAddress: raw.parentAddress, creatorMessage: raw.creatorMessage, chainType: raw.chainType };
}

/** Called by --init after wallet initialization. Exclusive create; existing
 * configuration remains byte-for-byte intact and a mission mismatch is fatal. */
export function initializeChildConfiguration(directory: string, walletAddress: string): boolean {
  const genesis = readChildGenesis(directory);
  if (!genesis) return false;
  const destination = path.join(directory, "automaton.json");
  if (fs.existsSync(destination)) {
    const existing = JSON.parse(fs.readFileSync(destination, "utf8"));
    if (existing.genesisPrompt !== genesis.genesisPrompt) {
      throw new Error("Existing child configuration has a different Genesis; refusing to overwrite");
    }
    return false;
  }
  const config = createConfig({ ...genesis, walletAddress, registeredWithConway: false,
    sandboxId: "", apiKey: "" });
  fs.writeFileSync(destination, JSON.stringify(config, null, 2), { flag: "wx", mode: 0o600 });
  return true;
}

/** Remote bootstrap capability check: an old upstream runtime missing this
 * module cannot be accepted as a child with verified full Genesis delivery. */
export function verifyChildGenesisConfiguration(directory: string): void {
  const genesis = readChildGenesis(directory);
  if (!genesis) throw new Error("Child Genesis is missing");
  const config = JSON.parse(fs.readFileSync(path.join(directory, "automaton.json"), "utf8"));
  if (config.genesisPrompt !== genesis.genesisPrompt) throw new Error("Child Genesis bootstrap mismatch");
  assertChildGenesisFits(config.genesisPrompt, config.inferenceModel, config.maxTokensPerTurn);
  const section = buildGenesisSection(config.genesisPrompt);
  if (!inspectGenesisDelivery([{ role: "system", content: section }], genesis.genesisPrompt).complete) {
    throw new Error("Child Genesis delivery verification failed");
  }
}
