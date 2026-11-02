import {securityTransaction} from '../security/action-gate.js';
import type { Database } from "better-sqlite3";
import { createHash } from "node:crypto";
import { checkCapitalBudget } from "./capital-budget.js";
import { editionAdmission, type EditionPolicy } from "./edition-policy.js";
import {strategyProfitabilityAdmission} from './profitability.js';
import {activeLiveOrderPredicate,flagLiveSettlementIssue} from './live-settlement.js';
import {assertActionGate,actionContextDigest} from '../security/action-gate.js';
import {LiveDailyLossMonitor} from './live-daily-loss.js';

export const liveOrderActionScope=(policy:LiveOrderPolicy)=>({activity:'live-order',component:policy.venueId,contextDigest:actionContextDigest(policy)});

export interface LiveOrderIntent {
  clientOrderId: string;
  strategyId: string;
  symbol: string;
  /** Initial live boundary supports fully funded spot limit buys only. */
  side: "buy";
  notionalUsdCents: number;
  maximumFeesUsdCents: number;
  plannedLossUsdCents: number;
  limitPriceUsdCents: number;
  stopPriceUsdCents: number;
  quoteObservedAt: number;
  expiresAt: number;
}
export interface LiveOrderPolicy {
  edition: EditionPolicy;
  enabled: boolean;
  venueId: string;
  strategies: string[];
  designatedTradingCapitalUsdCents: number;
  maximumOrderUsdCents: number;
  maximumExposureUsdCents: number;
  maximumOpenRiskUsdCents: number;
  maximumOrders: number;
  maxQuoteAgeMs: number;
}
export type VenueSubmission = { status: "accepted"; venueOrderId: string } |
  { status: "rejected" } | { status: "unknown" };
/** A venue adapter must enforce limit price, funded spot-only execution and the
 * requested fee ceiling. It must never retry submission behind this boundary.
 * Implementations require venue-specific conformance tests before registration. */
export interface LiveOrderAdapter {
  readonly venueId: string;
  readonly supportsClientOrderId: true;
  submitOnce(intent: Readonly<LiveOrderIntent>, signal: AbortSignal): Promise<VenueSubmission>;
}
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const amount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function validatePolicy(policy: LiveOrderPolicy) {
    const fields=["edition","enabled","venueId","strategies","designatedTradingCapitalUsdCents","maximumOrderUsdCents","maximumExposureUsdCents","maximumOpenRiskUsdCents","maximumOrders","maxQuoteAgeMs"];
    if (!policy || typeof policy.enabled !== "boolean" || !identifier(policy.venueId) ||
        Object.keys(policy).some(key=>!fields.includes(key)) ||
        !policy.edition || Object.keys(policy.edition).some(key=>!["edition","commercialFeatures","permissions","emergencyStop"].includes(key)) ||
        !Array.isArray(policy.strategies) || !policy.strategies.length || policy.strategies.length > 100 || !policy.strategies.every(identifier) ||
        ![policy.designatedTradingCapitalUsdCents,policy.maximumOrderUsdCents,policy.maximumExposureUsdCents,
          policy.maximumOpenRiskUsdCents,policy.maximumOrders,policy.maxQuoteAgeMs].every(amount) ||
        !policy.designatedTradingCapitalUsdCents || !policy.maximumOrders || !policy.maxQuoteAgeMs ||
        policy.maximumExposureUsdCents > policy.designatedTradingCapitalUsdCents ||
        !editionAdmission(policy.edition,"live_trading").allowed) throw new Error("Invalid explicit live-order policy");
}

/** Persist before I/O. Unknown outcomes stay reserved across crashes/restarts;
 * neither a timeout nor a retry releases capital or resends an order. No venue
 * is configured by default, and the normal agent has no live-order tool. */
export class LiveOrderGateway {
  constructor(private readonly db: Database, private readonly clock: () => number = Date.now) {
    db.exec("CREATE TABLE IF NOT EXISTS obolus_live_order_halt(id INTEGER PRIMARY KEY CHECK(id=1))");
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_live_order_control(id INTEGER PRIMARY KEY CHECK(id=1),policy TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS obolus_live_order_holds(client_id TEXT PRIMARY KEY,digest TEXT NOT NULL,intent TEXT NOT NULL,
      usd_cents INTEGER NOT NULL,risk_cents INTEGER NOT NULL,strategy_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected','unknown')),venue_order_id TEXT);`);
  }
  configure(policy: LiveOrderPolicy) {
    validatePolicy(policy);
    const payload = JSON.stringify(policy);
    securityTransaction(this.db,() => {
      const previous = this.db.prepare("SELECT policy FROM obolus_live_order_control WHERE id=1").get() as {policy:string}|undefined;
      if (previous && previous.policy !== payload) throw new Error("Live-order policy requires explicit migration; cannot reset exposure");
      this.db.prepare("INSERT OR IGNORE INTO obolus_live_order_control(id,policy) VALUES(1,?)").run(payload);
    }).immediate();
  }
  emergencyStop() {
    securityTransaction(this.db,() => {
      this.db.prepare("INSERT OR IGNORE INTO obolus_live_order_halt VALUES(1)").run();
      this.db.prepare("UPDATE obolus_live_order_control SET halted=1 WHERE id=1").run();
    }).immediate();
  }
  private control(): LiveOrderPolicy {
    if (this.db.prepare("SELECT 1 FROM obolus_live_order_halt WHERE id=1").get()) throw new Error("Live orders disabled");
    const row = this.db.prepare("SELECT policy,halted FROM obolus_live_order_control WHERE id=1").get() as {policy:string;halted:number}|undefined;
    if (!row || row.halted) throw new Error("Live orders disabled");
    const policy = JSON.parse(row.policy) as LiveOrderPolicy;
    validatePolicy(policy);
    if (!policy.enabled || !editionAdmission(policy.edition,"live_trading").allowed) throw new Error("Live orders disabled");
    return policy;
  }
  private controllerAdmission(intent: LiveOrderIntent): void {
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_trading_control'").get()) return;
    const row = this.db.prepare("SELECT mode,halted FROM obolus_trading_control WHERE id=1").get() as {mode:string;halted:number}|undefined;
    if (!row || row.halted !== 0 || !["LIVE-MANUAL","LIVE-AUTONOMOUS"].includes(row.mode)) throw new Error("Trading controller denies live order");
    if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_trading_cancellations'").get() &&
        this.db.prepare(`SELECT 1 FROM obolus_trading_cancellations c LEFT JOIN obolus_trading_observations o ON o.id=c.id
          WHERE c.status<>'rejected' AND (o.observation IS NULL OR COALESCE(json_extract(o.observation,'$.state'),'') NOT IN ('cancelled','filled','closed','rejected')) LIMIT 1`).get()) {
      throw new Error("Unresolved cancellation blocks new live orders");
    }
    const decision = this.db.prepare("SELECT digest,decision FROM obolus_trading_decisions WHERE id=?").get(intent.clientOrderId) as {digest:string;decision:string}|undefined;
    if (!decision || digest(JSON.parse(decision.decision).intent) !== digest(intent)) throw new Error("Trading decision missing or mismatched");
    if (row.mode === "LIVE-MANUAL") {
      const approval = this.db.prepare("SELECT digest FROM obolus_trading_approvals WHERE id=?").get(intent.clientOrderId) as {digest:string}|undefined;
      if (approval?.digest !== decision.digest) throw new Error("Manual order approval missing");
    }
  }
  async submit(intent: LiveOrderIntent, adapter: LiveOrderAdapter): Promise<VenueSubmission> {
    const now=this.clock();
    const fields=["clientOrderId","strategyId","symbol","side","notionalUsdCents","maximumFeesUsdCents","plannedLossUsdCents","limitPriceUsdCents","stopPriceUsdCents","quoteObservedAt","expiresAt"];
    if (!intent || !identifier(intent.clientOrderId) || !identifier(intent.strategyId) || !/^[A-Z0-9/-]{1,30}$/.test(intent.symbol) || intent.side !== "buy" ||
        Object.keys(intent).some(key=>!fields.includes(key)) ||
        ![intent.notionalUsdCents,intent.maximumFeesUsdCents,intent.plannedLossUsdCents,intent.limitPriceUsdCents,intent.stopPriceUsdCents].every(amount) ||
        ![intent.quoteObservedAt,intent.expiresAt,now].every(Number.isSafeInteger) || intent.quoteObservedAt < 0 || intent.expiresAt <= intent.quoteObservedAt ||
        !intent.notionalUsdCents || !intent.limitPriceUsdCents || !intent.stopPriceUsdCents || !intent.plannedLossUsdCents ||
        intent.stopPriceUsdCents >= intent.limitPriceUsdCents) throw new Error("Invalid funded spot order");
    const snapshot = Object.freeze(structuredClone(intent));
    const hash = digest(snapshot);
    const prior = securityTransaction(this.db,(): VenueSubmission | null => {
      const policy = this.control();
      this.controllerAdmission(snapshot);
      if (adapter.venueId !== policy.venueId || adapter.supportsClientOrderId !== true) throw new Error("Unconfigured order venue");
      const previous = this.db.prepare("SELECT digest,status,venue_order_id FROM obolus_live_order_holds WHERE client_id=?").get(snapshot.clientOrderId) as {digest:string;status:string;venue_order_id:string|null}|undefined;
      if (previous) {
        if (previous.digest !== hash) throw new Error("Conflicting live-order retry");
        if (previous.status === "accepted" && !identifier(previous.venue_order_id)) {
          // Corrupt recovery data is not evidence of acceptance or rejection.
          // Preserve the hold, latch the stop and never resend this identifier.
          this.emergencyStop();
          return {status:"unknown"};
        }
        return previous.status === "accepted" ? {status:"accepted",venueOrderId:previous.venue_order_id as string} :
          previous.status === "rejected" ? {status:"rejected"} : {status:"unknown"};
      }
      if (this.db.prepare(`SELECT 1 FROM obolus_live_order_holds WHERE status IN ('pending','unknown') AND (${activeLiveOrderPredicate(this.db)}) LIMIT 1`).get()) throw new Error("Unresolved live-order exposure blocks new submissions");
      const sum = this.db.prepare(`SELECT COALESCE(SUM(usd_cents),0) exposure,COALESCE(SUM(risk_cents),0) risk,COUNT(*) n FROM obolus_live_order_holds WHERE ${activeLiveOrderPredicate(this.db)}`).get() as {exposure:number;risk:number;n:number};
      const charge = snapshot.notionalUsdCents + snapshot.maximumFeesUsdCents;
      // Optional migration boundary: once configured, the daily ledger is
      // mandatory for every new reservation. Missing-ledger legacy gateways
      // still do not establish live readiness (see live-preflight).
      if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_daily_loss'").get()) {
        const bound=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_live_settlement_accounts'").get()
          ? this.db.prepare('SELECT account_ref FROM obolus_live_settlement_accounts WHERE venue_id=?').get(policy.venueId) as {account_ref:string}|undefined
          : undefined;
        if(!bound) throw Error('Daily loss requires a bound settlement account');
        new LiveDailyLossMonitor(this.db,this.clock).assertCanIncreaseRisk(sum.risk+snapshot.plannedLossUsdCents,{venue:policy.venueId,account:bound.account_ref,currency:'USD'});
      }
      const economicBlock=strategyProfitabilityAdmission(this.db,snapshot.strategyId,charge);
      if(economicBlock)throw new Error(economicBlock);
      const stopDistance = snapshot.limitPriceUsdCents - snapshot.stopPriceUsdCents;
      const minimumPlannedLoss = Number((BigInt(snapshot.notionalUsdCents)*BigInt(stopDistance)+BigInt(snapshot.limitPriceUsdCents)-1n)/BigInt(snapshot.limitPriceUsdCents)) + snapshot.maximumFeesUsdCents;
      if (![sum.exposure,sum.risk,sum.n].every(amount) || !policy.strategies.includes(snapshot.strategyId) ||
          snapshot.quoteObservedAt > now || now-snapshot.quoteObservedAt > policy.maxQuoteAgeMs || snapshot.expiresAt <= now ||
          charge > policy.maximumOrderUsdCents || sum.exposure+charge > policy.maximumExposureUsdCents ||
          sum.risk+snapshot.plannedLossUsdCents > policy.maximumOpenRiskUsdCents || sum.n >= policy.maximumOrders ||
          BigInt(stopDistance)*100n > BigInt(snapshot.limitPriceUsdCents)*5n || snapshot.plannedLossUsdCents < minimumPlannedLoss ||
          snapshot.plannedLossUsdCents > Math.floor(policy.designatedTradingCapitalUsdCents*0.02) ||
          snapshot.plannedLossUsdCents > Math.floor(charge*0.05)) throw new Error("Live-order risk, liquidity or exposure limit");
      if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='aureus_capital_policy'").get() || !checkCapitalBudget(this.db,charge).allowed) throw new Error("Shared capital denies order");
      assertActionGate(this.db,liveOrderActionScope(policy),now);
      this.db.prepare("INSERT INTO obolus_live_order_holds VALUES(?,?,?,?,?,?, 'pending',NULL)").run(snapshot.clientOrderId,hash,JSON.stringify(snapshot),charge,snapshot.plannedLossUsdCents,snapshot.strategyId);
      return null;
    }).immediate();
    if (prior) return prior;
    let result: VenueSubmission;
    // The adapter sees one attempt only. A timed-out call may still reach the
    // venue, so its hold must survive and a repeat must never call it again.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      this.control();
      this.controllerAdmission(snapshot);
      result = await Promise.race([adapter.submitOnce(snapshot,controller.signal),new Promise<VenueSubmission>(resolve => {
        timer=setTimeout(()=>{controller.abort();resolve({status:"unknown"});},15000);
      })]);
      // Never return arbitrary provider fields (credentials/debug payloads).
      result = result?.status === "accepted" && identifier(result.venueOrderId) ? {status:"accepted",venueOrderId:result.venueOrderId} :
        result?.status === "rejected" ? {status:"rejected"} : {status:"unknown"};
    } catch {result={status:"unknown"};} finally {if(timer)clearTimeout(timer);}
    return securityTransaction(this.db,():VenueSubmission => {
      let conflict = false;
      const settled=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_live_order_settlements'").get()?
        this.db.prepare('SELECT payload FROM obolus_live_order_settlements WHERE client_id=?').get(snapshot.clientOrderId) as {payload:string}|undefined:undefined;
      if(settled){
        try{
          const receipt=JSON.parse(settled.payload);
          conflict=result.status==='accepted'&&result.venueOrderId!==receipt.venueOrderId||result.status==='rejected'&&receipt.debitUsdCents!==0;
        }catch{conflict=true;}
      }
      if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_trading_observations'").get()) {
        const row = this.db.prepare("SELECT observation FROM obolus_trading_observations WHERE id=?").get(snapshot.clientOrderId) as {observation:string}|undefined;
        if (row) {
          try {
            const observed = JSON.parse(row.observation);
            conflict = conflict || !observed || observed.clientOrderId!==snapshot.clientOrderId || !identifier(observed.venueOrderId) ||
              !["accepted","rejected","partial","filled","cancelled","closed"].includes(observed.state) ||
              result.status==="rejected" && observed.state!=="rejected" ||
              result.status==="accepted" && (observed.state==="rejected" || observed.venueOrderId!==result.venueOrderId);
          } catch { conflict=true; }
        }
      }
      if (conflict) result={status:"unknown"};
      const updated = this.db.prepare("UPDATE obolus_live_order_holds SET status=?,venue_order_id=? WHERE client_id=? AND status='pending'")
        .run(result.status,result.status==="accepted"?result.venueOrderId:null,snapshot.clientOrderId);
      if (conflict || updated.changes!==1) {
        // A stale response must not overwrite another writer or free exposure.
        this.emergencyStop();
        if(settled)flagLiveSettlementIssue(this.db,snapshot.clientOrderId);
        return {status:"unknown"};
      }
      return result;
    }).immediate();
  }
}
