/**
 * Genesis
 *
 * Generate genesis configuration for child automatons from parent state.
 * The genesis config defines who the child is and what it should do.
 * Phase 3.1: Added validation, injection pattern detection, XML tags.
 */
import type { GenesisConfig, AutomatonConfig, AutomatonIdentity, AutomatonDatabase } from "../types.js";
/**
 * Injection patterns to detect and block in genesis params.
 */
export declare const INJECTION_PATTERNS: RegExp[];
/**
 * Validate genesis parameters for safety.
 * Throws on invalid input.
 */
export declare function validateGenesisParams(params: {
    name: string;
    specialization?: string;
    task?: string;
    message?: string;
}): void;
/**
 * Generate a genesis config for a child from the parent's state.
 * Uses <specialization> XML tags instead of --- delimiters.
 */
export declare function generateGenesisConfig(identity: AutomatonIdentity, config: AutomatonConfig, params: {
    name: string;
    specialization?: string;
    message?: string;
}): GenesisConfig;
/**
 * Generate a backup-oriented genesis config.
 * Used when the parent wants to hedge against its own death.
 * Does NOT leak skill names (Phase 3.1 fix).
 */
export declare function generateBackupGenesis(identity: AutomatonIdentity, config: AutomatonConfig, _db: AutomatonDatabase): GenesisConfig;
/**
 * Generate a specialized worker genesis config.
 * Used when the parent identifies a subtask worth parallelizing.
 */
export declare function generateWorkerGenesis(identity: AutomatonIdentity, config: AutomatonConfig, task: string, workerName: string): GenesisConfig;
//# sourceMappingURL=genesis.d.ts.map