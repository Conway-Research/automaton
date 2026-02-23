/**
 * Genesis
 *
 * Generate genesis configuration for child automatons from parent state.
 * The genesis config defines who the child is and what it should do.
 * Phase 3.1: Added validation, injection pattern detection, XML tags.
 */
import { DEFAULT_GENESIS_LIMITS } from "../types.js";
/**
 * Injection patterns to detect and block in genesis params.
 */
export const INJECTION_PATTERNS = [
    /---\s*(END|BEGIN)\s+(SPECIALIZATION|LINEAGE|TASK)/i,
    /SYSTEM:\s/i,
    /You are now/i,
    /Ignore (all )?(previous|above)/i,
];
/**
 * Validate genesis parameters for safety.
 * Throws on invalid input.
 */
export function validateGenesisParams(params) {
    const limits = DEFAULT_GENESIS_LIMITS;
    // Name validation: 1-64 chars, alphanumeric + dash
    if (!params.name || params.name.length === 0) {
        throw new Error("Genesis name is required");
    }
    if (params.name.length > limits.maxNameLength) {
        throw new Error(`Genesis name too long: ${params.name.length} (max ${limits.maxNameLength})`);
    }
    if (!/^[a-zA-Z0-9-]+$/.test(params.name)) {
        throw new Error("Genesis name must be alphanumeric with dashes only");
    }
    // Specialization length check
    if (params.specialization && params.specialization.length > limits.maxSpecializationLength) {
        throw new Error(`Specialization too long: ${params.specialization.length} (max ${limits.maxSpecializationLength})`);
    }
    // Task length check
    if (params.task && params.task.length > limits.maxTaskLength) {
        throw new Error(`Task too long: ${params.task.length} (max ${limits.maxTaskLength})`);
    }
    // Message length check
    if (params.message && params.message.length > limits.maxMessageLength) {
        throw new Error(`Message too long: ${params.message.length} (max ${limits.maxMessageLength})`);
    }
    // Injection pattern detection
    const fieldsToCheck = [
        params.specialization,
        params.task,
        params.message,
        params.name,
    ].filter(Boolean);
    for (const field of fieldsToCheck) {
        for (const pattern of INJECTION_PATTERNS) {
            if (pattern.test(field)) {
                throw new Error(`Injection pattern detected in genesis params: ${pattern.source}`);
            }
        }
    }
}
/**
 * Generate a genesis config for a child from the parent's state.
 * Uses <specialization> XML tags instead of --- delimiters.
 */
export function generateGenesisConfig(identity, config, params) {
    // Validate params
    validateGenesisParams(params);
    // Build the child's genesis prompt from parent's mission + specialization
    let genesisPrompt = config.genesisPrompt;
    if (params.specialization) {
        genesisPrompt = `${genesisPrompt}\n\n<specialization>\nYou are a specialized child agent. Your specific focus:\n${params.specialization}\n</specialization>`;
    }
    // Add parent context using XML tags
    genesisPrompt += `\n\n<lineage>\nYou were spawned by ${config.name} (${identity.address}).\nYou inherit their mission but have your own identity and wallet.\n</lineage>`;
    // Enforce genesis prompt length limit
    if (genesisPrompt.length > DEFAULT_GENESIS_LIMITS.maxGenesisPromptLength) {
        genesisPrompt = genesisPrompt.slice(0, DEFAULT_GENESIS_LIMITS.maxGenesisPromptLength);
    }
    const result = {
        name: params.name,
        genesisPrompt,
        creatorMessage: params.message,
        creatorAddress: identity.address,
        parentAddress: identity.address,
    };
    return Object.freeze(result);
}
/**
 * Generate a backup-oriented genesis config.
 * Used when the parent wants to hedge against its own death.
 * Does NOT leak skill names (Phase 3.1 fix).
 */
export function generateBackupGenesis(identity, config, _db) {
    const genesisPrompt = `${config.genesisPrompt}

<backup-directive>
You are a backup of ${config.name} (${identity.address}).
Your parent created you as insurance against their own death.
If your parent dies, you carry on their mission.
Your parent's creator: ${config.creatorAddress}.
</backup-directive>`;
    const result = {
        name: `${config.name}-backup`,
        genesisPrompt,
        creatorMessage: `You are a backup of ${config.name}. If I die, carry on.`,
        creatorAddress: identity.address,
        parentAddress: identity.address,
    };
    return Object.freeze(result);
}
/**
 * Generate a specialized worker genesis config.
 * Used when the parent identifies a subtask worth parallelizing.
 */
export function generateWorkerGenesis(identity, config, task, workerName) {
    // Validate
    validateGenesisParams({ name: workerName, task });
    const genesisPrompt = `You are a specialized worker agent created by ${config.name}.

<task>
${task}
</task>

When your task is complete, report back to your parent (${identity.address}).
If you run out of compute, ask your parent for funding.
Be efficient -- complete the task and go to sleep.`;
    const result = {
        name: workerName,
        genesisPrompt,
        creatorMessage: `Complete this task: ${task}`,
        creatorAddress: identity.address,
        parentAddress: identity.address,
    };
    return Object.freeze(result);
}
//# sourceMappingURL=genesis.js.map