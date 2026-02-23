/**
 * Automaton SIWE Provisioning
 *
 * Uses the automaton's wallet to authenticate via Sign-In With Ethereum (SIWE)
 * and create an API key for Conway API access.
 * Adapted from conway-mcp/src/cli/provision.ts
 */
import type { ProvisionResult } from "../types.js";
/**
 * Load API key from ~/.automaton/config.json if it exists.
 */
export declare function loadApiKeyFromConfig(): string | null;
/**
 * Run the full SIWE provisioning flow:
 * 1. Load wallet
 * 2. Get nonce from Conway API
 * 3. Sign SIWE message
 * 4. Verify signature -> get JWT
 * 5. Create API key
 * 6. Save to config.json
 */
export declare function provision(apiUrl?: string): Promise<ProvisionResult>;
/**
 * Register the automaton's creator as its parent with Conway.
 * This allows the creator to see automaton logs and inference calls.
 */
export declare function registerParent(creatorAddress: string, apiUrl?: string): Promise<void>;
//# sourceMappingURL=provision.d.ts.map