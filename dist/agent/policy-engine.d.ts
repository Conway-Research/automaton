/**
 * Policy Engine
 *
 * Centralized policy evaluation for all tool calls.
 * Every executeTool() call passes through this engine before execution.
 */
import type Database from "better-sqlite3";
import type { PolicyRule, PolicyRequest, PolicyDecision, AuthorityLevel, InputSource } from "../types.js";
export declare class PolicyEngine {
    private db;
    private rules;
    constructor(db: Database.Database, rules: PolicyRule[]);
    /**
     * Evaluate a tool call request against all applicable policy rules.
     * Returns a PolicyDecision with the overall action.
     */
    evaluate(request: PolicyRequest): PolicyDecision;
    /**
     * Log a policy decision to the database.
     */
    logDecision(decision: PolicyDecision, turnId?: string): void;
    /**
     * Derive authority level from input source.
     */
    static deriveAuthorityLevel(inputSource: InputSource | undefined): AuthorityLevel;
    /**
     * Check if a rule applies to the given request's tool.
     */
    private ruleApplies;
}
//# sourceMappingURL=policy-engine.d.ts.map