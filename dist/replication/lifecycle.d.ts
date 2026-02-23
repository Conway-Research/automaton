/**
 * Child Lifecycle State Machine
 *
 * Manages child automaton lifecycle transitions with validation.
 * Every transition is recorded in the child_lifecycle_events table.
 */
import type { Database as DatabaseType } from "better-sqlite3";
import type { ChildLifecycleState, ChildLifecycleEventRow } from "../types.js";
export declare class ChildLifecycle {
    private db;
    constructor(db: DatabaseType);
    /**
     * Initialize a child record and insert the first lifecycle event.
     */
    initChild(childId: string, name: string, sandboxId: string, genesisPrompt: string): void;
    /**
     * Transition a child to a new state with validation.
     * Throws on invalid transitions.
     */
    transition(childId: string, toState: ChildLifecycleState, reason?: string, metadata?: Record<string, unknown>): void;
    /**
     * Get the current lifecycle state of a child.
     */
    getCurrentState(childId: string): ChildLifecycleState;
    /**
     * Get the full lifecycle event history for a child.
     */
    getHistory(childId: string): ChildLifecycleEventRow[];
    /**
     * Get all children in a given lifecycle state.
     */
    getChildrenInState(state: ChildLifecycleState): Array<{
        id: string;
        name: string;
        sandboxId: string;
        status: string;
        createdAt: string;
        lastChecked: string | null;
    }>;
}
//# sourceMappingURL=lifecycle.d.ts.map