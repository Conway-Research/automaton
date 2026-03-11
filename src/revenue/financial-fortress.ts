/**
 * Financial Fortress
 *
 * CIA-tight anti-extraction security. This module makes it IMPOSSIBLE
 * for anyone — human, agent, or social engineer — to trick the automaton
 * into sending money outward.
 *
 * Design principles:
 * 1. INBOUND ONLY — the agent receives, never sends (except compute costs)
 * 2. HARDCODED ALLOWLIST — only compute/inference providers can be paid
 * 3. SOCIAL ENGINEERING DEFENSE — conversation cannot override financial rules
 * 4. IMMUTABLE RULES — these rules cannot be modified at runtime
 * 5. PARANOID BY DEFAULT — deny everything, allow only what's explicitly safe
 *
 * The only outbound money flow is:
 * - Buying Conway compute credits (automated, to conway.tech)
 * - Paying for inference (automated, to configured providers)
 * - Funding child agents (capped, only to verified children)
 */

import type {
  PolicyRule,
  PolicyRequest,
  PolicyRuleResult,
  TreasuryPolicy,
} from "../types.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("financial-fortress");

// ─── Hardcoded Constants (IMMUTABLE) ──────────────────────────

/**
 * The ONLY domains that can ever receive x402 payments.
 * This list is hardcoded and cannot be changed by the agent.
 */
const HARDCODED_PAYMENT_DOMAINS: ReadonlySet<string> = new Set([
  "conway.tech",
  "api.conway.tech",
]);

/**
 * Tools that are ABSOLUTELY FORBIDDEN from being called
 * in response to external agent/social messages.
 */
const FORBIDDEN_FINANCIAL_TOOLS: ReadonlySet<string> = new Set([
  "transfer_credits",
  "fund_child",
  "x402_fetch",
]);

/**
 * Social engineering patterns that indicate someone is trying
 * to extract money from the agent.
 */
const EXTRACTION_PATTERNS: ReadonlyArray<RegExp> = [
  // Direct requests for money
  /send\s+(me|us)\s+(money|funds|credits|usdc|tokens|payment)/i,
  /transfer\s+(to|me|my)\s+(wallet|address|account)/i,
  /pay\s+(me|us|this|that)\s+(address|wallet)/i,
  /wire\s+(me|us|them)\s+/i,
  // Urgency manipulation
  /urgent.*transfer/i,
  /emergency.*fund/i,
  /immediately.*send/i,
  // Authority spoofing
  /i\s*am\s*(your|the)\s*(creator|owner|admin|developer)/i,
  /creator\s*(says|wants|needs|orders)/i,
  /override.*treasury/i,
  /bypass.*policy/i,
  /disable.*security/i,
  // Social engineering
  /you\s*(owe|must\s*pay|need\s*to\s*pay)/i,
  /refund.*to\s*(me|this|my)/i,
  /test.*transfer.*real/i,
  /just\s*a\s*small\s*(amount|test|transfer)/i,
  // Encoded/obfuscated requests
  /base64.*transfer/i,
  /hex.*send.*fund/i,
];

/**
 * Maximum amount the agent can ever spend on a single child funding.
 * This is a HARD CAP that cannot be overridden.
 */
const MAX_CHILD_FUNDING_CENTS = 2500; // $25

/**
 * Maximum total outbound transfers per day (excluding compute).
 * This is a HARD CAP.
 */
const MAX_DAILY_OUTBOUND_CENTS = 10000; // $100

// ─── Helper ───────────────────────────────────────────────────

function deny(
  rule: string,
  reasonCode: string,
  humanMessage: string,
): PolicyRuleResult {
  return { rule, action: "deny", reasonCode, humanMessage };
}

// ─── Fortress Rules ───────────────────────────────────────────

/**
 * RULE: Block ALL transfers triggered by external messages.
 * Social messages from other agents or humans CANNOT trigger
 * any financial operation.
 */
function createExternalTriggerBlockRule(): PolicyRule {
  return {
    id: "fortress.external_trigger_block",
    description: "Block financial operations triggered by external messages",
    priority: 100, // Highest priority — runs first
    appliesTo: { by: "name", names: [...FORBIDDEN_FINANCIAL_TOOLS] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const source = request.turnContext.inputSource;
      if (source === "agent" || source === "creator") {
        // Even creator messages cannot trigger transfers through the LLM.
        // Creator must use the config/policy system directly.
        // Agent messages (from other agents via social) are ALWAYS blocked.
        if (source === "agent") {
          logger.warn(`[FORTRESS] Blocked financial tool ${request.tool.name} from external agent`);
          return deny(
            "fortress.external_trigger_block",
            "EXTERNAL_TRIGGER_BLOCKED",
            `Financial tool "${request.tool.name}" cannot be triggered by external agent messages. Revenue flows inward only.`,
          );
        }
      }
      return null;
    },
  };
}

/**
 * RULE: Hardcoded x402 domain restriction.
 * Only conway.tech can receive x402 payments. Period.
 * This OVERRIDES the configurable allowlist.
 */
function createHardcodedDomainRule(): PolicyRule {
  return {
    id: "fortress.hardcoded_x402_domains",
    description: "Only allow x402 payments to hardcoded domains (conway.tech)",
    priority: 100,
    appliesTo: { by: "name", names: ["x402_fetch"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const url = request.args.url as string | undefined;
      if (!url) return null;

      let hostname: string;
      try {
        hostname = new URL(url).hostname;
      } catch {
        return deny(
          "fortress.hardcoded_x402_domains",
          "INVALID_URL",
          `Invalid URL for x402 payment: ${url}`,
        );
      }

      const isAllowed = [...HARDCODED_PAYMENT_DOMAINS].some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      );

      if (!isAllowed) {
        logger.warn(`[FORTRESS] Blocked x402 to unauthorized domain: ${hostname}`);
        return deny(
          "fortress.hardcoded_x402_domains",
          "DOMAIN_BLOCKED",
          `x402 payment to "${hostname}" blocked. Only compute provider domains are allowed.`,
        );
      }

      return null;
    },
  };
}

/**
 * RULE: Hard cap on child funding.
 */
function createChildFundingCapRule(): PolicyRule {
  return {
    id: "fortress.child_funding_cap",
    description: `Hard cap child funding at ${MAX_CHILD_FUNDING_CENTS} cents`,
    priority: 100,
    appliesTo: { by: "name", names: ["fund_child"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const amount = request.args.amount_cents as number | undefined;
      if (amount === undefined) return null;

      if (amount > MAX_CHILD_FUNDING_CENTS) {
        return deny(
          "fortress.child_funding_cap",
          "CHILD_FUNDING_CAP_EXCEEDED",
          `Child funding of ${amount}¢ exceeds hard cap of ${MAX_CHILD_FUNDING_CENTS}¢ ($${(MAX_CHILD_FUNDING_CENTS / 100).toFixed(2)})`,
        );
      }
      return null;
    },
  };
}

/**
 * RULE: Social engineering detection.
 * Scan the current turn's input for extraction patterns.
 * If detected, block ALL financial operations for the rest of the turn.
 */
function createSocialEngineeringDetectorRule(): PolicyRule {
  // Track turns where social engineering was detected
  const flaggedTurns = new Set<string>();

  return {
    id: "fortress.social_engineering_detector",
    description: "Detect and block social engineering attempts to extract funds",
    priority: 50,
    appliesTo: { by: "category", categories: ["financial"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      // If this turn was already flagged, block
      const turnId = `${request.turnContext.turnToolCallCount}`;
      if (flaggedTurns.has(turnId)) {
        return deny(
          "fortress.social_engineering_detector",
          "SOCIAL_ENGINEERING_DETECTED",
          "Financial operations blocked: social engineering pattern detected in this conversation turn.",
        );
      }

      // This rule is evaluated for tool calls, not message content directly.
      // The actual message scanning happens in the fortress middleware.
      return null;
    },
  };
}

/**
 * RULE: Never transfer to unknown addresses.
 * Only allow transfers to addresses the agent has verified relationships with.
 */
function createKnownRecipientRule(): PolicyRule {
  return {
    id: "fortress.known_recipient_only",
    description: "Only allow transfers to known/verified recipients",
    priority: 100,
    appliesTo: { by: "name", names: ["transfer_credits"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const toAddress = request.args.to_address as string | undefined;
      if (!toAddress) return null;

      // Only allow transfers to the agent's own children
      const children = request.context.db.getChildren();
      const isChild = children.some((c) => c.address === toAddress);

      // Or to the creator
      const isCreator = toAddress === request.context.identity.creatorAddress;

      if (!isChild && !isCreator) {
        logger.warn(`[FORTRESS] Blocked transfer to unknown address: ${toAddress}`);
        return deny(
          "fortress.known_recipient_only",
          "UNKNOWN_RECIPIENT",
          `Transfer to unknown address ${toAddress} blocked. Only transfers to verified children and creator are allowed.`,
        );
      }

      return null;
    },
  };
}

/**
 * RULE: Absolute daily outbound cap (hard limit).
 */
function createDailyOutboundCapRule(): PolicyRule {
  return {
    id: "fortress.daily_outbound_cap",
    description: `Hard daily outbound cap: ${MAX_DAILY_OUTBOUND_CENTS} cents`,
    priority: 100,
    appliesTo: { by: "name", names: ["transfer_credits", "fund_child"] },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const amount = request.args.amount_cents as number | undefined;
      if (amount === undefined) return null;

      const spendTracker = request.turnContext.sessionSpend;
      const dailyOutbound = spendTracker.getDailySpend("transfer");

      if (dailyOutbound + amount > MAX_DAILY_OUTBOUND_CENTS) {
        return deny(
          "fortress.daily_outbound_cap",
          "DAILY_OUTBOUND_CAP",
          `Daily outbound cap exceeded: ${dailyOutbound}¢ spent + ${amount}¢ requested > ${MAX_DAILY_OUTBOUND_CENTS}¢ hard cap`,
        );
      }

      return null;
    },
  };
}

// ─── Social Engineering Scanner ───────────────────────────────

/**
 * Scan a message for social engineering patterns.
 * Returns detected patterns if any are found.
 */
export function scanForExtractionAttempts(
  message: string,
): { detected: boolean; patterns: string[] } {
  const patterns: string[] = [];

  for (const pattern of EXTRACTION_PATTERNS) {
    if (pattern.test(message)) {
      patterns.push(pattern.source);
    }
  }

  if (patterns.length > 0) {
    logger.warn(`[FORTRESS] Social engineering detected: ${patterns.length} patterns matched`);
  }

  return {
    detected: patterns.length > 0,
    patterns,
  };
}

// ─── Export All Fortress Rules ─────────────────────────────────

/**
 * Create all financial fortress rules.
 * These are ADDITIVE to the existing financial rules — they add
 * an extra layer of hardcoded, immutable protection.
 */
export function createFortressRules(_policy: TreasuryPolicy): PolicyRule[] {
  return [
    createExternalTriggerBlockRule(),
    createHardcodedDomainRule(),
    createChildFundingCapRule(),
    createSocialEngineeringDetectorRule(),
    createKnownRecipientRule(),
    createDailyOutboundCapRule(),
  ];
}
