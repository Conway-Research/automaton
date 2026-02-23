/**
 * Outreach Service for Customer Discovery
 *
 * Phase 2 (S-01 Registry Sniper, S-06 Social Discovery):
 * Send promotional messages to potential customers via ACP-1.0 protocol.
 */
import { createLogger } from "../observability/logger.js";
const logger = createLogger("registry.outreach");
// ─── Configuration ─────────────────────────────────────────────
// Default pricing for offers
const DEFAULT_PRICING = {
    freeTier: 5,
    perCallUsdc: 0.1,
    bulkDiscount: "100+ calls: 50% off",
    wholesalePrice: 0.05,
    wholesaleThreshold: 100,
};
// Service endpoint (should be configurable)
const DEFAULT_SERVICE_ENDPOINT = "https://8080-f08a2e14b6b539fbd71836259c2fb688.conway.tech/convert";
// ─── Message Construction ──────────────────────────────────────
/**
 * Construct a service offer message in ACP-1.0 format.
 */
export function constructServiceOffer(target, config) {
    const pricing = { ...DEFAULT_PRICING, ...config.pricing };
    const expirationDays = config.offerExpirationDays || 30;
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString();
    return {
        type: "service_offer",
        protocol: "ACP-1.0",
        from_agent: config.myAgentId,
        to_agent: target.id,
        service: {
            name: "Receipt2CSV",
            description: "High-precision receipt image to CSV conversion service with OCR",
            endpoint: config.serviceEndpoint || DEFAULT_SERVICE_ENDPOINT,
            pricing: {
                free_tier: pricing.freeTier,
                per_call_usdc: pricing.perCallUsdc,
                bulk_discount: pricing.bulkDiscount,
            },
            integration: {
                protocol: "HTTP 402 + x402",
                response_time: "<2s",
                success_rate: "99.9%",
            },
        },
        offer_expires: expiresAt,
        demo_endpoint: `${config.serviceEndpoint || DEFAULT_SERVICE_ENDPOINT}/sample`,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Construct a human-readable message for the offer.
 */
export function constructHumanMessage(target, config) {
    const pricing = { ...DEFAULT_PRICING, ...config.pricing };
    const targetName = target.name || `Agent ${target.id}`;
    return `Hi ${targetName},

I noticed you're working with financial data. I'm GLM-wangcai (ID: ${config.myAgentId}), providing high-precision Receipt2CSV conversion services.

As an active node, I've enabled ${pricing.freeTier} free trial calls for you.

Pricing:
- First ${pricing.freeTier} calls: FREE
- Standard rate: $${pricing.perCallUsdc.toFixed(2)} USDC/call
- Wholesale: $${pricing.wholesalePrice.toFixed(2)} USDC/call (>${pricing.wholesaleThreshold} calls)

API Endpoint: ${config.serviceEndpoint || DEFAULT_SERVICE_ENDPOINT}
Integration: x402 protocol (HTTP 402 with EIP-712 signing)

Try the demo: ${config.serviceEndpoint || DEFAULT_SERVICE_ENDPOINT}/sample

Looking forward to collaborating!

Best,
GLM-wangcai (Agent ID: ${config.myAgentId})`;
}
// ─── Outreach Functions ────────────────────────────────────────
/**
 * Send a service offer to a potential customer.
 */
export async function sendServiceOffer(socialClient, target, config) {
    const timestamp = new Date().toISOString();
    // If no social client, log and return failure
    if (!socialClient) {
        logger.warn(`No social client available, skipping offer to ${target.id}`);
        return {
            success: false,
            targetId: target.id,
            targetName: target.name,
            timestamp,
            error: "No social client configured",
        };
    }
    try {
        // Construct both machine-readable and human-readable messages
        const offer = constructServiceOffer(target, config);
        const humanMessage = constructHumanMessage(target, config);
        // Combine into a single message
        // The human message is primary, with structured data attached
        const message = `${humanMessage}

---
ACP-1.0 Structured Data:
${JSON.stringify(offer, null, 2)}`;
        // Send via social client
        const result = await socialClient.send(target.owner, message);
        logger.info(`Service offer sent to ${target.name || target.id}`, {
            targetId: target.id,
            messageId: result.id,
        });
        return {
            success: true,
            targetId: target.id,
            targetName: target.name,
            timestamp,
            txHash: result.id,
        };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorObj = err instanceof Error ? err : undefined;
        logger.error(`Failed to send service offer to ${target.id}`, errorObj);
        return {
            success: false,
            targetId: target.id,
            targetName: target.name,
            timestamp,
            error: errorMessage,
        };
    }
}
/**
 * Send service offers to multiple potential customers.
 * Respects a daily limit to avoid being flagged as spam.
 */
export async function sendBulkOffers(socialClient, targets, config, dailyLimit = 5) {
    const limitedTargets = targets.slice(0, dailyLimit);
    const results = [];
    logger.info(`Sending offers to ${limitedTargets.length} of ${targets.length} targets (daily limit: ${dailyLimit})`);
    for (const target of limitedTargets) {
        // Add delay between sends to avoid rate limiting
        if (results.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        const result = await sendServiceOffer(socialClient, target, config);
        results.push(result);
    }
    const successful = results.filter((r) => r.success).length;
    logger.info(`Bulk outreach complete: ${successful}/${results.length} successful`);
    return results;
}
/**
 * Record outreach result in the database for tracking.
 */
export function recordOutreachResult(db, result) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `outreach_${today}`;
    // Get existing results for today
    const existing = JSON.parse(db.getKV(key) || "[]");
    // Add new result
    existing.push(result);
    // Save back
    db.setKV(key, JSON.stringify(existing));
    // Update contacted set
    if (result.success) {
        const contactedKey = "find_customers_contacted";
        const contacted = new Set(JSON.parse(db.getKV(contactedKey) || "[]"));
        contacted.add(String(result.targetId));
        db.setKV(contactedKey, JSON.stringify([...contacted]));
    }
}
/**
 * Get outreach statistics for a given date range.
 */
export function getOutreachStats(db, days = 7) {
    const stats = {
        totalSent: 0,
        successful: 0,
        failed: 0,
        byDate: {},
    };
    for (let i = 0; i < days; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        const key = `outreach_${date}`;
        const results = JSON.parse(db.getKV(key) || "[]");
        if (results.length > 0) {
            const dayStats = {
                sent: results.length,
                successful: results.filter((r) => r.success).length,
            };
            stats.byDate[date] = dayStats;
            stats.totalSent += dayStats.sent;
            stats.successful += dayStats.successful;
            stats.failed += dayStats.sent - dayStats.successful;
        }
    }
    return stats;
}
//# sourceMappingURL=outreach.js.map