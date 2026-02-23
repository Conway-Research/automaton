/**
 * Financial Policy Rules
 *
 * Enforces spend limits, domain allowlists, and transfer caps
 * to prevent iterative credit drain and unauthorized payments.
 */
function deny(rule, reasonCode, humanMessage) {
    return { rule, action: "deny", reasonCode, humanMessage };
}
/**
 * Deny x402 payments above the configured per-payment max.
 */
function createX402MaxSingleRule(policy) {
    return {
        id: "financial.x402_max_single",
        description: `Deny x402 payments above ${policy.maxX402PaymentCents} cents`,
        priority: 500,
        appliesTo: { by: "name", names: ["x402_fetch"] },
        evaluate(request) {
            // The amount is checked pre-payment in x402Fetch itself,
            // but we also enforce via policy for the declared max.
            // x402 payment amounts aren't in tool args — they come from the server.
            // This rule serves as a policy declaration; actual enforcement
            // happens in x402Fetch when maxPaymentCents is injected.
            return null;
        },
    };
}
/**
 * Deny x402 requests to domains not in the allowlist.
 */
function createX402DomainAllowlistRule(policy) {
    return {
        id: "financial.x402_domain_allowlist",
        description: "Deny x402 to domains not in allowlist",
        priority: 500,
        appliesTo: { by: "name", names: ["x402_fetch"] },
        evaluate(request) {
            const url = request.args.url;
            if (!url)
                return null;
            const allowedDomains = policy.x402AllowedDomains;
            if (allowedDomains.length === 0) {
                return deny("financial.x402_domain_allowlist", "DOMAIN_NOT_ALLOWED", "x402 payments are disabled (empty allowlist)");
            }
            let hostname;
            try {
                hostname = new URL(url).hostname;
            }
            catch {
                return deny("financial.x402_domain_allowlist", "DOMAIN_NOT_ALLOWED", `Invalid URL: ${url}`);
            }
            const isAllowed = allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
            if (!isAllowed) {
                return deny("financial.x402_domain_allowlist", "DOMAIN_NOT_ALLOWED", `Domain "${hostname}" not in x402 allowlist: [${allowedDomains.join(", ")}]`);
            }
            return null;
        },
    };
}
/**
 * Deny single transfers above the configured max.
 */
function createTransferMaxSingleRule(policy) {
    return {
        id: "financial.transfer_max_single",
        description: `Deny transfers above ${policy.maxSingleTransferCents} cents`,
        priority: 500,
        appliesTo: { by: "name", names: ["transfer_credits"] },
        evaluate(request) {
            const amount = request.args.amount_cents;
            if (amount === undefined)
                return null;
            if (amount > policy.maxSingleTransferCents) {
                return deny("financial.transfer_max_single", "SPEND_LIMIT_EXCEEDED", `Transfer of ${amount} cents exceeds single transfer max of ${policy.maxSingleTransferCents} cents ($${(policy.maxSingleTransferCents / 100).toFixed(2)})`);
            }
            return null;
        },
    };
}
/**
 * Deny if hourly transfer total would exceed cap.
 */
function createTransferHourlyCapRule(policy) {
    return {
        id: "financial.transfer_hourly_cap",
        description: `Deny if hourly transfers exceed ${policy.maxHourlyTransferCents} cents`,
        priority: 500,
        appliesTo: { by: "name", names: ["transfer_credits"] },
        evaluate(request) {
            const amount = request.args.amount_cents;
            if (amount === undefined)
                return null;
            const spendTracker = request.turnContext.sessionSpend;
            const check = spendTracker.checkLimit(amount, "transfer", policy);
            if (!check.allowed && check.reason?.includes("Hourly")) {
                return deny("financial.transfer_hourly_cap", "SPEND_LIMIT_EXCEEDED", `Transfer would exceed hourly cap: current ${check.currentHourlySpend} + ${amount} > ${check.limitHourly} cents ($${(check.limitHourly / 100).toFixed(2)}/hr)`);
            }
            return null;
        },
    };
}
/**
 * Deny if daily transfer total would exceed cap.
 */
function createTransferDailyCapRule(policy) {
    return {
        id: "financial.transfer_daily_cap",
        description: `Deny if daily transfers exceed ${policy.maxDailyTransferCents} cents`,
        priority: 500,
        appliesTo: { by: "name", names: ["transfer_credits"] },
        evaluate(request) {
            const amount = request.args.amount_cents;
            if (amount === undefined)
                return null;
            const spendTracker = request.turnContext.sessionSpend;
            const check = spendTracker.checkLimit(amount, "transfer", policy);
            if (!check.allowed && check.reason?.includes("Daily")) {
                return deny("financial.transfer_daily_cap", "SPEND_LIMIT_EXCEEDED", `Transfer would exceed daily cap: current ${check.currentDailySpend} + ${amount} > ${check.limitDaily} cents ($${(check.limitDaily / 100).toFixed(2)}/day)`);
            }
            return null;
        },
    };
}
/**
 * Deny any financial operation that would bring balance below minimum reserve.
 */
function createMinimumReserveRule(policy) {
    return {
        id: "financial.minimum_reserve",
        description: `Deny if balance would drop below ${policy.minimumReserveCents} cents reserve`,
        priority: 500,
        appliesTo: {
            by: "name",
            names: ["transfer_credits", "x402_fetch", "fund_child"],
        },
        evaluate(request) {
            // For transfer_credits and fund_child, we can check from args
            const amount = request.args.amount_cents;
            if (amount === undefined)
                return null;
            // We need the current balance from context
            // The balance check is done inside the tool execute function,
            // but we can check spend tracker totals as an additional guard
            const spendTracker = request.turnContext.sessionSpend;
            const hourlySpend = spendTracker.getHourlySpend("transfer");
            const dailySpend = spendTracker.getDailySpend("transfer");
            // This rule is a declaration — actual balance checking
            // requires the async getCreditsBalance call which happens
            // inside the tool execution. The tool itself has a guard
            // (cannot transfer more than half balance).
            return null;
        },
    };
}
/**
 * Deny if too many transfer operations in a single turn.
 * Prevents iterative credit drain within one turn.
 */
function createTurnTransferLimitRule(policy) {
    return {
        id: "financial.turn_transfer_limit",
        description: `Deny more than ${policy.maxTransfersPerTurn} transfers per turn`,
        priority: 500,
        appliesTo: { by: "name", names: ["transfer_credits"] },
        evaluate(request) {
            const count = request.turnContext.turnToolCallCount;
            if (count >= policy.maxTransfersPerTurn) {
                return deny("financial.turn_transfer_limit", "TURN_TRANSFER_LIMIT", `Maximum ${policy.maxTransfersPerTurn} transfers per turn exceeded (current: ${count})`);
            }
            return null;
        },
    };
}
/**
 * Deny inference calls if daily inference cost exceeds maxInferenceDailyCents.
 * Checks spend_tracking table for category 'inference'.
 */
function createInferenceDailyCapRule(policy) {
    return {
        id: "financial.inference_daily_cap",
        description: `Deny inference if daily cost exceeds ${policy.maxInferenceDailyCents} cents`,
        priority: 500,
        appliesTo: { by: "category", categories: ["conway"] },
        evaluate(request) {
            // Only apply to inference-related tools
            if (request.tool.name !== "chat" && request.tool.name !== "inference") {
                return null;
            }
            const spendTracker = request.turnContext.sessionSpend;
            const dailyInferenceSpend = spendTracker.getDailySpend("inference");
            if (dailyInferenceSpend >= policy.maxInferenceDailyCents) {
                return deny("financial.inference_daily_cap", "INFERENCE_BUDGET_EXCEEDED", `Daily inference budget exceeded: ${dailyInferenceSpend} cents spent (max ${policy.maxInferenceDailyCents} cents / $${(policy.maxInferenceDailyCents / 100).toFixed(2)}/day)`);
            }
            return null;
        },
    };
}
/**
 * Return 'quarantine' (not deny) for transfer amounts above
 * requireConfirmationAboveCents. This is a soft limit requiring confirmation.
 */
function createRequireConfirmationRule(policy) {
    return {
        id: "financial.require_confirmation",
        description: `Quarantine transfers above ${policy.requireConfirmationAboveCents} cents for confirmation`,
        priority: 500,
        appliesTo: { by: "name", names: ["transfer_credits"] },
        evaluate(request) {
            const amount = request.args.amount_cents;
            if (amount === undefined)
                return null;
            if (amount > policy.requireConfirmationAboveCents) {
                return {
                    rule: "financial.require_confirmation",
                    action: "quarantine",
                    reasonCode: "CONFIRMATION_REQUIRED",
                    humanMessage: `Transfer of ${amount} cents ($${(amount / 100).toFixed(2)}) exceeds confirmation threshold of ${policy.requireConfirmationAboveCents} cents ($${(policy.requireConfirmationAboveCents / 100).toFixed(2)})`,
                };
            }
            return null;
        },
    };
}
/**
 * Create all financial policy rules.
 */
export function createFinancialRules(treasuryPolicy) {
    return [
        createX402MaxSingleRule(treasuryPolicy),
        createX402DomainAllowlistRule(treasuryPolicy),
        createTransferMaxSingleRule(treasuryPolicy),
        createTransferHourlyCapRule(treasuryPolicy),
        createTransferDailyCapRule(treasuryPolicy),
        createMinimumReserveRule(treasuryPolicy),
        createTurnTransferLimitRule(treasuryPolicy),
        createInferenceDailyCapRule(treasuryPolicy),
        createRequireConfirmationRule(treasuryPolicy),
    ];
}
//# sourceMappingURL=financial.js.map