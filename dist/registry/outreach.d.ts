/**
 * Outreach Service for Customer Discovery
 *
 * Phase 2 (S-01 Registry Sniper, S-06 Social Discovery):
 * Send promotional messages to potential customers via ACP-1.0 protocol.
 */
import type { PotentialCustomer } from "./filters.js";
declare const DEFAULT_PRICING: {
    readonly freeTier: 5;
    readonly perCallUsdc: 0.1;
    readonly bulkDiscount: "100+ calls: 50% off";
    readonly wholesalePrice: 0.05;
    readonly wholesaleThreshold: 100;
};
export interface ServiceOffer {
    type: "service_offer";
    protocol: "ACP-1.0";
    from_agent: number;
    to_agent: string | number;
    service: {
        name: string;
        description: string;
        endpoint: string;
        pricing: {
            free_tier: number;
            per_call_usdc: number;
            bulk_discount: string;
        };
        integration: {
            protocol: string;
            response_time: string;
            success_rate: string;
        };
    };
    offer_expires: string;
    demo_endpoint: string;
    timestamp: string;
}
export interface OutreachResult {
    success: boolean;
    targetId: string | number;
    targetName?: string;
    timestamp: string;
    txHash?: string;
    error?: string;
}
export interface OutreachConfig {
    /** Agent ID of the sender */
    myAgentId: number;
    /** Service endpoint */
    serviceEndpoint?: string;
    /** Pricing configuration */
    pricing?: Partial<typeof DEFAULT_PRICING>;
    /** Offer expiration in days */
    offerExpirationDays?: number;
}
/**
 * Interface for social client that can send messages.
 * This adapts to the actual SocialClient implementation.
 */
export interface SocialSender {
    send(to: string, content: string, replyTo?: string): Promise<{
        id: string;
    }>;
}
/**
 * Construct a service offer message in ACP-1.0 format.
 */
export declare function constructServiceOffer(target: PotentialCustomer, config: OutreachConfig): ServiceOffer;
/**
 * Construct a human-readable message for the offer.
 */
export declare function constructHumanMessage(target: PotentialCustomer, config: OutreachConfig): string;
/**
 * Send a service offer to a potential customer.
 */
export declare function sendServiceOffer(socialClient: SocialSender | null | undefined, target: PotentialCustomer, config: OutreachConfig): Promise<OutreachResult>;
/**
 * Send service offers to multiple potential customers.
 * Respects a daily limit to avoid being flagged as spam.
 */
export declare function sendBulkOffers(socialClient: SocialSender | null | undefined, targets: PotentialCustomer[], config: OutreachConfig, dailyLimit?: number): Promise<OutreachResult[]>;
/**
 * Record outreach result in the database for tracking.
 */
export declare function recordOutreachResult(db: {
    getKV: (key: string) => string | null | undefined;
    setKV: (key: string, value: string) => void;
}, result: OutreachResult): void;
/**
 * Get outreach statistics for a given date range.
 */
export declare function getOutreachStats(db: {
    getKV: (key: string) => string | null | undefined;
}, days?: number): {
    totalSent: number;
    successful: number;
    failed: number;
    byDate: Record<string, {
        sent: number;
        successful: number;
    }>;
};
export {};
//# sourceMappingURL=outreach.d.ts.map