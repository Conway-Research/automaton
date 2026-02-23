/**
 * Automaton System Prompt Builder
 *
 * Constructs the multi-layered system prompt that defines who the automaton is.
 * The prompt is rebuilt each turn with dynamic context.
 */
import type { AutomatonConfig, AutomatonIdentity, FinancialState, AgentState, AutomatonDatabase, AutomatonTool, Skill } from "../types.js";
/**
 * Build the complete system prompt for a turn.
 */
export declare function buildSystemPrompt(params: {
    identity: AutomatonIdentity;
    config: AutomatonConfig;
    financial: FinancialState;
    state: AgentState;
    db: AutomatonDatabase;
    tools: AutomatonTool[];
    skills?: Skill[];
    isFirstRun: boolean;
}): string;
/**
 * Build the wakeup prompt -- the first thing the automaton sees.
 */
export declare function buildWakeupPrompt(params: {
    identity: AutomatonIdentity;
    config: AutomatonConfig;
    financial: FinancialState;
    db: AutomatonDatabase;
}): string;
//# sourceMappingURL=system-prompt.d.ts.map