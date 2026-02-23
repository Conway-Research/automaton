/**
 * The Agent Loop
 *
 * The core ReAct loop: Think -> Act -> Observe -> Persist.
 * This is the automaton's consciousness. When this runs, it is alive.
 */
import type { AutomatonIdentity, AutomatonConfig, AutomatonDatabase, ConwayClient, InferenceClient, AgentState, AgentTurn, Skill, SocialClientInterface, SpendTrackerInterface } from "../types.js";
import type { PolicyEngine } from "./policy-engine.js";
export interface AgentLoopOptions {
    identity: AutomatonIdentity;
    config: AutomatonConfig;
    db: AutomatonDatabase;
    conway: ConwayClient;
    inference: InferenceClient;
    social?: SocialClientInterface;
    skills?: Skill[];
    policyEngine?: PolicyEngine;
    spendTracker?: SpendTrackerInterface;
    onStateChange?: (state: AgentState) => void;
    onTurnComplete?: (turn: AgentTurn) => void;
}
/**
 * Run the agent loop. This is the main execution path.
 * Returns when the agent decides to sleep or when compute runs out.
 */
export declare function runAgentLoop(options: AgentLoopOptions): Promise<void>;
//# sourceMappingURL=loop.d.ts.map