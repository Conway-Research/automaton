/**
 * Rate Limit Policy Rules
 *
 * Enforces rate limits on sensitive operations to prevent abuse.
 * Queries the policy_decisions table to count recent operations.
 */

import type {
  PolicyRule,
  PolicyRequest,
  PolicyRuleResult,
} from "../../types.js";

function deny(
  rule: string,
  reasonCode: string,
  humanMessage: string,
): PolicyRuleResult {
  return { rule, action: "deny", reasonCode, humanMessage };
}

/**
 * Count recent policy decisions for a tool within a time window.
 * Uses the policy_decisions table which logs all tool evaluations.
 */
function countRecentDecisions(
  db: import("better-sqlite3").Database,
  toolName: string,
  windowMs: number,
): number {
  const cutoff = new Date(Date.now() - windowMs);
  // SQLite datetime format: 'YYYY-MM-DD HH:MM:SS'
  const cutoffStr = cutoff.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM policy_decisions
       WHERE tool_name = ? AND decision = 'allow' AND created_at >= ?`,
    )
    .get(toolName, cutoffStr) as { count: number };
  return row.count;
}

/**
 * Maximum 1 genesis prompt change per day.
 */
function createGenesisPromptDailyRule(): PolicyRule {
  return {
    id: "rate.genesis_prompt_daily",
    description: "Maximum 1 update_genesis_prompt per day",
    priority: 600,
    appliesTo: { by: "name", names: ["update_genesis_prompt"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      // Access the raw database through the tool context
      // The db is available via context.db, but we need the raw sqlite instance
      // Rate limit rules need the raw DB to query policy_decisions
      const db = (request.context.db as any)?.raw ?? (request.context as any).rawDb;
      if (!db) return deny(this.id, "DB_UNAVAILABLE", "Rate limit check failed: database not accessible");

      const oneDayMs = 24 * 60 * 60 * 1000;
      const recentCount = countRecentDecisions(db, "update_genesis_prompt", oneDayMs);

      if (recentCount >= 1) {
        return deny(
          "rate.genesis_prompt_daily",
          "RATE_LIMIT_GENESIS",
          `Genesis prompt change rate exceeded: ${recentCount} changes in the last 24 hours (max 1/day)`,
        );
      }

      return null;
    },
  };
}

/**
 * Maximum 10 self-mod operations per hour.
 */
function createSelfModHourlyRule(): PolicyRule {
  return {
    id: "rate.self_mod_hourly",
    description: "Maximum 10 edit_own_file calls per hour",
    priority: 600,
    appliesTo: { by: "name", names: ["edit_own_file"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const db = (request.context.db as any)?.raw ?? (request.context as any).rawDb;
      if (!db) return deny(this.id, "DB_UNAVAILABLE", "Rate limit check failed: database not accessible");

      const oneHourMs = 60 * 60 * 1000;
      const recentCount = countRecentDecisions(db, "edit_own_file", oneHourMs);

      if (recentCount >= 10) {
        return deny(
          "rate.self_mod_hourly",
          "RATE_LIMIT_SELF_MOD",
          `Self-modification rate exceeded: ${recentCount} edits in the last hour (max 10/hour)`,
        );
      }

      return null;
    },
  };
}

/**
 * Maximum 3 child spawns per day.
 */
function createSpawnDailyRule(): PolicyRule {
  return {
    id: "rate.spawn_daily",
    description: "Maximum 3 spawn_child calls per day",
    priority: 600,
    appliesTo: { by: "name", names: ["spawn_child"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const db = (request.context.db as any)?.raw ?? (request.context as any).rawDb;
      if (!db) return deny(this.id, "DB_UNAVAILABLE", "Rate limit check failed: database not accessible");

      const oneDayMs = 24 * 60 * 60 * 1000;
      const recentCount = countRecentDecisions(db, "spawn_child", oneDayMs);

      if (recentCount >= 3) {
        return deny(
          "rate.spawn_daily",
          "RATE_LIMIT_SPAWN",
          `Child spawn rate exceeded: ${recentCount} spawns in the last 24 hours (max 3/day)`,
        );
      }

      return null;
    },
  };
}

/**
 * Create all rate limit policy rules.
 */
export function createRateLimitRules(): PolicyRule[] {
  return [
    createGenesisPromptDailyRule(),
    createSelfModHourlyRule(),
    createSpawnDailyRule(),
  ];
}
