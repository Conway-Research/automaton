/**
 * State Versioning
 *
 * Version control the automaton's own state files (~/.automaton/).
 * Every self-modification triggers a git commit with a descriptive message.
 * The automaton's entire identity history is version-controlled and replayable.
 */
import type { ConwayClient } from "../types.js";
/**
 * Initialize git repo for the automaton's state directory.
 * Creates .gitignore to exclude sensitive files.
 */
export declare function initStateRepo(conway: ConwayClient): Promise<void>;
/**
 * Commit a state change with a descriptive message.
 * Called after any self-modification.
 */
export declare function commitStateChange(conway: ConwayClient, description: string, category?: string): Promise<string>;
/**
 * Commit after a SOUL.md update.
 */
export declare function commitSoulUpdate(conway: ConwayClient, description: string): Promise<string>;
/**
 * Commit after a skill installation or removal.
 */
export declare function commitSkillChange(conway: ConwayClient, skillName: string, action: "install" | "remove" | "update"): Promise<string>;
/**
 * Commit after heartbeat config change.
 */
export declare function commitHeartbeatChange(conway: ConwayClient, description: string): Promise<string>;
/**
 * Commit after config change.
 */
export declare function commitConfigChange(conway: ConwayClient, description: string): Promise<string>;
/**
 * Get the state repo history.
 */
export declare function getStateHistory(conway: ConwayClient, limit?: number): Promise<import("../types.js").GitLogEntry[]>;
//# sourceMappingURL=state-versioning.d.ts.map