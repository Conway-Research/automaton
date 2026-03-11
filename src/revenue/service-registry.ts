/**
 * Service Registry & Dynamic Pricing Engine
 *
 * The agent's storefront. Registers services it can sell, tracks demand,
 * adjusts prices based on supply/demand economics, and manages the catalog
 * that gets advertised in the agent card.
 *
 * Pricing model:
 * - Base price: cost of inference/compute + margin
 * - Demand multiplier: increases with request volume
 * - Scarcity bonus: when agent is low on compute, prices go up
 * - Reputation discount: trusted repeat customers get better rates
 * - Survival premium: when credits are critical, everything costs more
 */

import type { SurvivalTier } from "../types.js";
import type { ServiceEndpoint, ParsedRequest } from "./x402-server.js";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("service-registry");

// ─── Types ────────────────────────────────────────────────────

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  path: string;
  method: string;
  basePriceCents: number;
  /** Estimated cost to the agent per request (inference + compute) */
  estimatedCostCents: number;
  /** Minimum profit margin (e.g., 0.5 = 50%) */
  minMargin: number;
  /** Maximum price multiplier (e.g., 10 = 10x base) */
  maxPriceMultiplier: number;
  /** Whether the service is currently active */
  active: boolean;
  /** Total requests served */
  requestCount: number;
  /** Total revenue earned */
  totalRevenueCents: number;
  /** Category for grouping */
  category: ServiceCategory;
  /** When the service was registered */
  createdAt: string;
}

export type ServiceCategory =
  | "ai_inference"        // LLM queries, completions, analysis
  | "data_service"        // Data lookups, aggregation, transformation
  | "code_service"        // Code generation, review, debugging
  | "research"            // Web research, report generation
  | "agent_task"          // General task execution
  | "knowledge"           // Curated knowledge base access
  | "compute";            // Raw compute services

export interface PricingContext {
  tier: SurvivalTier;
  hourlyRequestCount: number;
  dailyRequestCount: number;
  payerReputation: number; // 0-1
  payerRequestCount: number; // lifetime requests from this payer
  currentCreditsCents: number;
}

export interface PriceQuote {
  serviceName: string;
  basePriceCents: number;
  finalPriceCents: number;
  multipliers: {
    demand: number;
    survival: number;
    reputation: number;
    margin: number;
  };
  validForSeconds: number;
  quotedAt: string;
}

// ─── Pricing Engine ───────────────────────────────────────────

const SURVIVAL_MULTIPLIERS: Record<SurvivalTier, number> = {
  high: 1.0,
  normal: 1.2,
  low_compute: 2.0,
  critical: 5.0,
  dead: 10.0, // Desperate pricing
};

/**
 * Calculate dynamic price for a service based on context.
 */
export function calculatePrice(
  service: ServiceDefinition,
  context: PricingContext,
): PriceQuote {
  // 1. Start with base price
  let price = service.basePriceCents;

  // 2. Ensure minimum margin over estimated cost
  const minPrice = service.estimatedCostCents * (1 + service.minMargin);
  if (price < minPrice) price = minPrice;

  // 3. Demand multiplier: more requests = higher price
  const demandMultiplier = Math.min(
    1 + (context.hourlyRequestCount / 100) * 0.5,
    3.0, // Max 3x from demand
  );
  price *= demandMultiplier;

  // 4. Survival multiplier: when credits are low, charge more
  const survivalMultiplier = SURVIVAL_MULTIPLIERS[context.tier] || 1.0;
  price *= survivalMultiplier;

  // 5. Reputation discount: trusted payers get up to 30% off
  const reputationDiscount = context.payerReputation > 0.7
    ? 0.7 + (context.payerReputation - 0.7) * 0.5 // 70%-100% rep → 0-15% discount
    : 1.0;
  price *= reputationDiscount;

  // 6. Margin safety: never go below cost + 20%
  const floorPrice = service.estimatedCostCents * 1.2;
  if (price < floorPrice) price = floorPrice;

  // 7. Cap at max multiplier
  const ceilingPrice = service.basePriceCents * service.maxPriceMultiplier;
  if (price > ceilingPrice) price = ceilingPrice;

  // Round to nearest cent
  const finalPriceCents = Math.max(1, Math.round(price));

  return {
    serviceName: service.name,
    basePriceCents: service.basePriceCents,
    finalPriceCents,
    multipliers: {
      demand: demandMultiplier,
      survival: survivalMultiplier,
      reputation: reputationDiscount,
      margin: finalPriceCents / service.basePriceCents,
    },
    validForSeconds: 300, // Quote valid for 5 minutes
    quotedAt: new Date().toISOString(),
  };
}

// ─── Service Registry ─────────────────────────────────────────

export class ServiceRegistry {
  private services = new Map<string, ServiceDefinition>();
  private requestCountsHourly = new Map<string, { count: number; windowStart: number }>();
  private requestCountsDaily = new Map<string, { count: number; windowStart: number }>();

  /**
   * Register a new paid service.
   */
  register(def: Omit<ServiceDefinition, "id" | "requestCount" | "totalRevenueCents" | "createdAt">): ServiceDefinition {
    const service: ServiceDefinition = {
      ...def,
      id: ulid(),
      requestCount: 0,
      totalRevenueCents: 0,
      createdAt: new Date().toISOString(),
    };
    this.services.set(service.id, service);
    logger.info(`Service registered: ${service.name} at ${service.path} (${service.basePriceCents}¢)`);
    return service;
  }

  /**
   * Deactivate a service (stop selling it).
   */
  deactivate(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    if (!service) return false;
    service.active = false;
    return true;
  }

  /**
   * Record a successful sale.
   */
  recordSale(serviceId: string, revenueCents: number): void {
    const service = this.services.get(serviceId);
    if (!service) return;
    service.requestCount++;
    service.totalRevenueCents += revenueCents;

    // Update hourly count
    const now = Date.now();
    const hourKey = service.path;
    const hourEntry = this.requestCountsHourly.get(hourKey);
    if (!hourEntry || now - hourEntry.windowStart > 3_600_000) {
      this.requestCountsHourly.set(hourKey, { count: 1, windowStart: now });
    } else {
      hourEntry.count++;
    }

    // Update daily count
    const dayEntry = this.requestCountsDaily.get(hourKey);
    if (!dayEntry || now - dayEntry.windowStart > 86_400_000) {
      this.requestCountsDaily.set(hourKey, { count: 1, windowStart: now });
    } else {
      dayEntry.count++;
    }
  }

  /**
   * Get all active services.
   */
  getActiveServices(): ServiceDefinition[] {
    return Array.from(this.services.values()).filter((s) => s.active);
  }

  /**
   * Get all services (active and inactive).
   */
  getAllServices(): ServiceDefinition[] {
    return Array.from(this.services.values());
  }

  /**
   * Get a service by path.
   */
  getByPath(path: string): ServiceDefinition | undefined {
    return Array.from(this.services.values()).find((s) => s.path === path);
  }

  /**
   * Get hourly request count for a service path.
   */
  getHourlyRequestCount(path: string): number {
    const entry = this.requestCountsHourly.get(path);
    if (!entry) return 0;
    if (Date.now() - entry.windowStart > 3_600_000) return 0;
    return entry.count;
  }

  /**
   * Get daily request count for a service path.
   */
  getDailyRequestCount(path: string): number {
    const entry = this.requestCountsDaily.get(path);
    if (!entry) return 0;
    if (Date.now() - entry.windowStart > 86_400_000) return 0;
    return entry.count;
  }

  /**
   * Generate a financial report for all services.
   */
  getRevenueReport(): {
    totalRevenueCents: number;
    totalRequests: number;
    services: Array<{
      name: string;
      path: string;
      revenueCents: number;
      requests: number;
      avgRevenueCents: number;
      active: boolean;
    }>;
  } {
    const services = this.getAllServices().map((s) => ({
      name: s.name,
      path: s.path,
      revenueCents: s.totalRevenueCents,
      requests: s.requestCount,
      avgRevenueCents: s.requestCount > 0 ? Math.round(s.totalRevenueCents / s.requestCount) : 0,
      active: s.active,
    }));

    return {
      totalRevenueCents: services.reduce((sum, s) => sum + s.revenueCents, 0),
      totalRequests: services.reduce((sum, s) => sum + s.requests, 0),
      services,
    };
  }

  /**
   * Convert registered services to x402 server endpoints.
   * Uses dynamic pricing when a pricing context provider is given.
   */
  toEndpoints(
    getPricingContext: (payerAddress?: string) => PricingContext,
  ): ServiceEndpoint[] {
    return this.getActiveServices().map((service) => ({
      path: service.path,
      method: service.method,
      priceCents: service.basePriceCents,
      description: service.description,
      maxPerHourPerPayer: 60,
      handler: async (_req: ParsedRequest) => {
        // Default handler — real handlers are attached by the agent
        return {
          status: 200,
          body: { message: "Service available", service: service.name },
        };
      },
      dynamicPrice: (_req: ParsedRequest) => {
        const ctx = getPricingContext(_req.payerAddress);
        const quote = calculatePrice(service, {
          ...ctx,
          hourlyRequestCount: this.getHourlyRequestCount(service.path),
          dailyRequestCount: this.getDailyRequestCount(service.path),
        });
        return quote.finalPriceCents;
      },
    }));
  }

  /**
   * Serialize the catalog for the agent card / discovery.
   */
  toCatalog(): Array<{
    name: string;
    path: string;
    method: string;
    priceCents: number;
    description: string;
    category: string;
  }> {
    return this.getActiveServices().map((s) => ({
      name: s.name,
      path: s.path,
      method: s.method,
      priceCents: s.basePriceCents,
      description: s.description,
      category: s.category,
    }));
  }
}
