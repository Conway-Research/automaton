/**
 * Revenue Module
 *
 * The complete revenue engine for Zentience.
 * Turns the automaton from a wallet with a drain into a self-sustaining
 * economic entity.
 */

export { createX402Server, verifyPayment } from "./x402-server.js";
export type {
  ServiceEndpoint,
  ParsedRequest,
  ServiceResponse,
  PaymentProof,
  VerifiedPayment,
  RevenueRecord,
  X402ServerConfig,
} from "./x402-server.js";

export { ServiceRegistry, calculatePrice } from "./service-registry.js";
export type {
  ServiceDefinition,
  ServiceCategory,
  PricingContext,
  PriceQuote,
} from "./service-registry.js";

export { RevenueLedger } from "./revenue-ledger.js";
export type {
  RevenueEntry,
  RevenueSource,
  ExpenseEntry,
  ExpenseCategory,
  ProfitLoss,
  FinancialHealth,
} from "./revenue-ledger.js";

export { BountyBoard } from "./bounty-board.js";
export type {
  Bounty,
  BountyStatus,
  BountyEvaluation,
} from "./bounty-board.js";

export { createFortressRules, scanForExtractionAttempts } from "./financial-fortress.js";
