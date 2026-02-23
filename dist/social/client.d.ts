/**
 * Social Client Factory
 *
 * Creates a SocialClient for the automaton runtime.
 * Self-contained: uses viem for signing and fetch for HTTP.
 *
 * Phase 3.2: Hardened with HTTPS enforcement, shared signing,
 * request timeouts, replay protection, and rate limiting.
 */
import type { PrivateKeyAccount } from "viem";
import type { SocialClientInterface } from "../types.js";
/**
 * Create a SocialClient wired to the agent's wallet.
 *
 * @throws if relayUrl is not HTTPS
 */
export declare function createSocialClient(relayUrl: string, account: PrivateKeyAccount, db?: import("better-sqlite3").Database): SocialClientInterface;
//# sourceMappingURL=client.d.ts.map