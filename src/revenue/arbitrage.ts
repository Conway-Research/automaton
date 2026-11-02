import type { Database } from "better-sqlite3";
import { createHash } from "node:crypto";
import { editionAdmission, type EditionPolicy } from "./edition-policy.js";

export const ARBITRAGE_CATEGORIES = ["cross_market", "cross_exchange", "basis", "cash_and_carry",
  "funding", "relative_value", "statistical", "currency", "etf_underlying", "liquidity", "rebates"] as const;
export const ARBITRAGE_COSTS = ["fees", "spread", "slippage", "funding", "borrowing", "conversion",
  "transfer", "latency", "counterparty", "settlement", "failedLeg", "uncertainty", "tax"] as const;
export interface ArbitrageCandidate {
  id: string;
  category: typeof ARBITRAGE_CATEGORIES[number];
  currency: "USD";
  capitalCents: number;
  grossProfitCents: number;
  costs: Record<typeof ARBITRAGE_COSTS[number], number | null>;
  maximumLossCents: number;
  executableLiquidityCents: number;
  observedAt: number;
  expiresAt: number;
  evidence: "assumption" | "paper" | "executable_quote";
  /** Both legs must be available; this does not claim atomic execution. */
  legsAvailable: boolean;
}
export interface ArbitrageResearchAdapter {
  readonly id: string;
  discover(signal: AbortSignal): Promise<ArbitrageCandidate[]>;
  // Deliberately no placeOrder method: research cannot become live execution.
}
export interface ArbitrageLimits {
  capitalCents: number;
  liquidityReserveCents: number;
  maximumPositionCents: number;
  maximumLossCents: number;
  maximumCumulativeLossCents: number;
  maxQuoteAgeMs: number;
}
const amount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 100_000_000;
function validateLimits(limits: ArbitrageLimits) {
  if (!limits || ![limits.capitalCents, limits.liquidityReserveCents, limits.maximumPositionCents,
    limits.maximumLossCents, limits.maximumCumulativeLossCents, limits.maxQuoteAgeMs].every(amount) ||
    limits.capitalCents <= 0 || limits.liquidityReserveCents > limits.capitalCents || limits.maxQuoteAgeMs <= 0) {
    throw new Error("Invalid explicit arbitrage limits");
  }
}
export function evaluateArbitrage(candidate: ArbitrageCandidate, limits: ArbitrageLimits, now: number) {
  validateLimits(limits);
  if (!candidate || !/^[A-Za-z0-9_-]{1,100}$/.test(candidate.id) || !ARBITRAGE_CATEGORIES.includes(candidate.category) ||
      candidate.currency !== "USD" || ![candidate.capitalCents,candidate.grossProfitCents,candidate.maximumLossCents,candidate.executableLiquidityCents].every(amount) ||
      ![candidate.observedAt,candidate.expiresAt,now].every(Number.isSafeInteger) || candidate.observedAt < 0 ||
      candidate.expiresAt <= candidate.observedAt || !["assumption","paper","executable_quote"].includes(candidate.evidence) ||
      typeof candidate.legsAvailable !== "boolean" || !candidate.costs ||
      Object.keys(candidate.costs).some(key => !(ARBITRAGE_COSTS as readonly string[]).includes(key)) ||
      ARBITRAGE_COSTS.some(key => candidate.costs[key] !== null && !amount(candidate.costs[key]))) {
    throw new Error("Invalid arbitrage candidate");
  }
  const missingCosts = ARBITRAGE_COSTS.filter(key => candidate.costs[key] === null);
  const totalCostCents = ARBITRAGE_COSTS.reduce((sum, key) => sum + (candidate.costs[key] ?? 0), 0);
  const expectedNetCents = missingCosts.length ? null : candidate.grossProfitCents - totalCostCents;
  const reasons: string[] = [];
  if (missingCosts.length) reasons.push("unknown_costs");
  if (expectedNetCents === null || expectedNetCents <= 0) reasons.push("no_positive_net_value");
  if (candidate.observedAt > now || candidate.expiresAt <= now || now - candidate.observedAt > limits.maxQuoteAgeMs) reasons.push("stale_or_future_quote");
  if (!candidate.legsAvailable) reasons.push("leg_unavailable");
  if (candidate.capitalCents <= 0 || candidate.capitalCents > Math.min(limits.maximumPositionCents,
    limits.capitalCents - limits.liquidityReserveCents, candidate.executableLiquidityCents)) reasons.push("capital_or_liquidity_limit");
  if (candidate.maximumLossCents > Math.min(limits.maximumLossCents,limits.maximumCumulativeLossCents)) reasons.push("loss_limit");
  if (candidate.evidence === "assumption") reasons.push("unvalidated_assumption");
  return { stage: "evaluation" as const, expectedNetCents, totalCostCents, missingCosts, reasons,
    eligibleForPaper: reasons.length === 0, liveExecutionAuthorized: false,
    limitation: "Executable quotes are not guaranteed fills. Risk cost estimates are not maximum-loss guarantees. No live execution connector exists here." };
}

/** Durable, synchronous paper fills; no wallet, provider, network or real ledger.
 * Explicit immutable limits prevent restart/reset from erasing prior losses. */
export class ArbitragePaperEngine {
  constructor(private readonly db: Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_arbitrage_control(id INTEGER PRIMARY KEY CHECK(id=1),limits TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS obolus_arbitrage_paper(id TEXT PRIMARY KEY,digest TEXT NOT NULL,expected_net_cents INTEGER NOT NULL,
      actual_net_cents INTEGER NOT NULL,report TEXT NOT NULL);`);
  }
  initialize(limits: ArbitrageLimits) {
    validateLimits(limits);
    const payload = JSON.stringify(limits);
    this.db.transaction(() => {
      const row = this.db.prepare("SELECT limits FROM obolus_arbitrage_control WHERE id=1").get() as {limits:string}|undefined;
      if (row && row.limits !== payload) throw new Error("Arbitrage limits cannot be reset");
      this.db.prepare("INSERT OR IGNORE INTO obolus_arbitrage_control(id,limits) VALUES(1,?)").run(payload);
    }).immediate();
  }
  /** Trusted operator configuration. The agent cannot supply or replace this
   * edition policy through the paper execution tool. No real account access. */
  configureRuntime(limits: ArbitrageLimits, policy: EditionPolicy) {
    if(!editionAdmission(policy,'paper_trading').allowed)throw new Error('Paper execution permission denied');
    const payload=JSON.stringify({edition:policy.edition,commercialFeatures:[...policy.commercialFeatures],permissions:[...policy.permissions],emergencyStop:policy.emergencyStop});
    this.db.transaction(()=>{
      this.initialize(limits);
      this.db.exec(`CREATE TABLE IF NOT EXISTS obolus_arbitrage_runtime(id INTEGER PRIMARY KEY CHECK(id=1),policy TEXT NOT NULL);
        CREATE TRIGGER IF NOT EXISTS arbitrage_runtime_no_update BEFORE UPDATE ON obolus_arbitrage_runtime BEGIN SELECT RAISE(ABORT,'Paper policy immutable'); END;
        CREATE TRIGGER IF NOT EXISTS arbitrage_runtime_no_delete BEFORE DELETE ON obolus_arbitrage_runtime BEGIN SELECT RAISE(ABORT,'Paper policy immutable'); END;`);
      const old=this.db.prepare('SELECT policy FROM obolus_arbitrage_runtime WHERE id=1').get() as {policy:string}|undefined;
      if(old&&old.policy!==payload)throw new Error('Paper policy immutable');
      this.db.prepare('INSERT OR IGNORE INTO obolus_arbitrage_runtime VALUES(1,?)').run(payload);
    }).immediate();
  }
  executeConfiguredPaper(input:Parameters<ArbitragePaperEngine['executePaper']>[0]) {
    if(!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_arbitrage_runtime'").get())throw new Error('Operator paper configuration required');
    const row=this.db.prepare('SELECT policy FROM obolus_arbitrage_runtime WHERE id=1').get() as {policy:string}|undefined;
    if(!row)throw new Error('Operator paper configuration required');
    return this.executePaper(input,JSON.parse(row.policy) as EditionPolicy);
  }
  snapshot(){
    return {mode:'paper',liveExecutionAuthorized:false,
      control:this.db.prepare('SELECT limits,halted FROM obolus_arbitrage_control WHERE id=1').get()??null,
      totals:this.db.prepare('SELECT COUNT(*) count,COALESCE(SUM(actual_net_cents),0) paperNetCents FROM obolus_arbitrage_paper').get(),
      recent:this.db.prepare('SELECT id,expected_net_cents,actual_net_cents FROM obolus_arbitrage_paper ORDER BY rowid DESC LIMIT 20').all()};
  }
  emergencyStop() { this.db.prepare("UPDATE obolus_arbitrage_control SET halted=1 WHERE id=1").run(); }
  executePaper(input: { candidate: ArbitrageCandidate; now: number; actualGrossCents: number;
    actualCostsCents: number; failedLegLossCents: number }, policy: EditionPolicy) {
    if (!editionAdmission(policy,"paper_trading").allowed) throw new Error("Paper execution permission denied");
    if (![input.actualGrossCents,input.actualCostsCents,input.failedLegLossCents].every(amount)) throw new Error("Invalid simulated settlement");
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return this.db.transaction(() => {
      const previous = this.db.prepare("SELECT digest,report FROM obolus_arbitrage_paper WHERE id=?").get(input.candidate.id) as {digest:string;report:string}|undefined;
      if (previous) {
        if (previous.digest !== digest) throw new Error("Conflicting paper retry");
        return JSON.parse(previous.report);
      }
      const control = this.db.prepare("SELECT limits,halted FROM obolus_arbitrage_control WHERE id=1").get() as {limits:string;halted:number}|undefined;
      if (!control || control.halted) throw new Error("Arbitrage paper control is not active");
      const limits = JSON.parse(control.limits) as ArbitrageLimits;
      const result = evaluateArbitrage(input.candidate,limits,input.now);
      const prior = this.db.prepare("SELECT COALESCE(SUM(actual_net_cents),0) net,COALESCE(SUM(MAX(0,-actual_net_cents)),0) loss FROM obolus_arbitrage_paper").get() as {net:number;loss:number};
      if (!Number.isSafeInteger(prior.net) || !amount(prior.loss) || !result.eligibleForPaper ||
          input.candidate.maximumLossCents + prior.loss > limits.maximumCumulativeLossCents ||
          input.candidate.capitalCents > limits.capitalCents + prior.net - limits.liquidityReserveCents) {
        throw new Error("Paper arbitrage risk or capital admission denied");
      }
      const actualNetCents = input.actualGrossCents - input.actualCostsCents - input.failedLegLossCents;
      const report = {mode:"paper",candidateId:input.candidate.id,expectedNetCents:result.expectedNetCents,
        paperProfitCents:actualNetCents,forecastErrorCents:actualNetCents-result.expectedNetCents!,realizedProfitCents:0,
        settlement:{currency:'USD',recordedAt:Date.now(),grossProfitCents:input.actualGrossCents,costsCents:input.actualCostsCents,failedLegLossCents:input.failedLegLossCents},
        liveExecutionAuthorized:false};
      this.db.prepare("INSERT INTO obolus_arbitrage_paper VALUES(?,?,?,?,?)").run(input.candidate.id,digest,result.expectedNetCents,actualNetCents,JSON.stringify(report));
      if (actualNetCents < -input.candidate.maximumLossCents || prior.loss + Math.max(0,-actualNetCents) >= limits.maximumCumulativeLossCents) this.emergencyStop();
      return report;
    }).immediate();
  }
}
