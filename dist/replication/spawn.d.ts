/**
 * Spawn
 *
 * Spawn child automatons in new Conway sandboxes.
 * Uses the lifecycle state machine for tracked transitions.
 * Cleans up sandbox on ANY failure after creation.
 */
import type { ConwayClient, AutomatonIdentity, AutomatonDatabase, GenesisConfig, ChildAutomaton } from "../types.js";
import type { ChildLifecycle } from "./lifecycle.js";
/**
 * Validate that an address is a well-formed, non-zero Ethereum wallet address.
 */
export declare function isValidWalletAddress(address: string): boolean;
/**
 * Spawn a child automaton in a new Conway sandbox using lifecycle state machine.
 */
export declare function spawnChild(conway: ConwayClient, identity: AutomatonIdentity, db: AutomatonDatabase, genesis: GenesisConfig, lifecycle?: ChildLifecycle): Promise<ChildAutomaton>;
//# sourceMappingURL=spawn.d.ts.map