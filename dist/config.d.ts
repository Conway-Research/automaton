/**
 * Automaton Configuration
 *
 * Loads and saves the automaton's configuration from ~/.automaton/automaton.json
 */
import type { AutomatonConfig, TreasuryPolicy } from "./types.js";
import type { Address } from "viem";
export declare function getConfigPath(): string;
/**
 * Load the automaton config from disk.
 * Merges with defaults for any missing fields.
 */
export declare function loadConfig(): AutomatonConfig | null;
/**
 * Save the automaton config to disk.
 * Includes treasuryPolicy in the persisted config.
 */
export declare function saveConfig(config: AutomatonConfig): void;
/**
 * Resolve ~ paths to absolute paths.
 */
export declare function resolvePath(p: string): string;
/**
 * Create a fresh config from setup wizard inputs.
 */
export declare function createConfig(params: {
    name: string;
    genesisPrompt: string;
    creatorMessage?: string;
    creatorAddress: Address;
    registeredWithConway: boolean;
    sandboxId: string;
    walletAddress: Address;
    apiKey: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    parentAddress?: Address;
    treasuryPolicy?: TreasuryPolicy;
}): AutomatonConfig;
//# sourceMappingURL=config.d.ts.map