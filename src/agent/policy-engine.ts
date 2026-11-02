/**
 * Policy Engine
 *
 * Centralized policy evaluation for all tool calls.
 * Every executeTool() call passes through this engine before execution.
 */

import { createHash } from "crypto";
import { ulid } from "ulid";
import type Database from "better-sqlite3";
import type {
  PolicyRule,
  PolicyRequest,
  PolicyRuleResult,
  PolicyDecision,
  PolicyAction,
  AuthorityLevel,
  InputSource,
} from "../types.js";
import { insertPolicyDecision } from "../state/database.js";
import type { PolicyDecisionRow } from "../state/database.js";

export class PolicyEngine {
  private db: Database.Database;
  private rules: PolicyRule[];

  constructor(db: Database.Database, rules: PolicyRule[]) {
    this.db = db;
    this.rules = rules.slice().sort((a, b) => a.priority - b.priority);
  }

  /**
   * Evaluate a tool call request against all applicable policy rules.
   * Returns a PolicyDecision with the overall action.
   */
  evaluate(request: PolicyRequest): PolicyDecision {
    const startTime = Date.now();
    const applicableRules = this.rules.filter((rule) =>
      this.ruleApplies(rule, request),
    );

    const rulesEvaluated: string[] = [];
    const rulesTriggered: string[] = [];
    let overallAction: PolicyAction = "allow";
    let reasonCode = "ALLOWED";
    let humanMessage = "All policy checks passed";

    for (const rule of applicableRules) {
      rulesEvaluated.push(rule.id);
      const result = rule.evaluate(request);

      if (result === null) {
        continue;
      }

      rulesTriggered.push(result.rule);

      if (result.action === "deny") {
        overallAction = "deny";
        reasonCode = result.reasonCode;
        humanMessage = result.humanMessage;
        break; // First deny wins
      }

      if (result.action === "quarantine" && overallAction === "allow") {
        overallAction = "quarantine";
        reasonCode = result.reasonCode;
        humanMessage = result.humanMessage;
      }
    }

    const argsHash = createHash("sha256")
      .update(JSON.stringify(request.args))
      .digest("hex");

    const authorityLevel = PolicyEngine.deriveAuthorityLevel(
      request.turnContext.inputSource,
    );

    const decision: PolicyDecision = {
      action: overallAction,
      reasonCode,
      humanMessage,
      riskLevel: request.tool.riskLevel,
      authorityLevel,
      toolName: request.tool.name,
      argsHash,
      rulesEvaluated,
      rulesTriggered,
      timestamp: new Date().toISOString(),
    };

    return decision;
  }

  /**
   * Log a policy decision to the database.
   */
  logDecision(decision: PolicyDecision, turnId?: string): void {
    const row: PolicyDecisionRow = {
      id: ulid(),
      turnId: turnId ?? null,
      toolName: decision.toolName,
      toolArgsHash: decision.argsHash,
      riskLevel: decision.riskLevel,
      decision: decision.action,
      rulesEvaluated: JSON.stringify(decision.rulesEvaluated),
      rulesTriggered: JSON.stringify(decision.rulesTriggered),
      reason: `${decision.reasonCode}: ${decision.humanMessage}`,
      latencyMs: 0,
    };

    // Authorization without a durable audit record is incomplete. Never expose
    // driver errors here: they can contain SQL parameters or sensitive paths.
    try {
      insertPolicyDecision(this.db, row);
    } catch {
      throw new Error("Policy audit unavailable; execution blocked");
    }
  }

  /**
   * Derive authority level from input source.
   */
  static deriveAuthorityLevel(
    inputSource: InputSource | undefined,
  ): AuthorityLevel {
    if (inputSource === undefined || inputSource === "heartbeat") {
      return "external";
    }
    if (inputSource === "creator" || inputSource === "agent") {
      return "agent";
    }
    if (inputSource === "system" || inputSource === "wakeup") {
      return "system";
    }
    return "external";
  }

  /**
   * Check if a rule applies to the given request's tool.
   */
  private ruleApplies(rule: PolicyRule, request: PolicyRequest): boolean {
    const selector = rule.appliesTo;

    switch (selector.by) {
      case "all":
        return true;
      case "name":
        return selector.names.includes(request.tool.name);
      case "category":
        return selector.categories.includes(request.tool.category);
      case "risk":
        return selector.levels.includes(request.tool.riskLevel);
      default:
        return false;
    }
  }
}
