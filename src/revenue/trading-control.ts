import type { Database } from "better-sqlite3";
import { createHash } from "node:crypto";
import { LiveOrderGateway, type LiveOrderAdapter, type LiveOrderIntent } from "./live-orders.js";
import { assertNoKnownSecrets } from "../observability/redaction.js";
import { PaperPortfolio, type PaperPortfolioLimits } from "./paper-portfolio.js";
import type { PaperPlan, Bar } from "./paper-trading.js";
import {reconcileClosedOrder,activeLiveOrderPredicate,liveSettlementBlocked,type LiveSettlementAdapter} from './live-settlement.js';

export type TradingMode = "DISABLED" | "PAPER" | "LIVE-MANUAL" | "LIVE-AUTONOMOUS";
export type OrderState = "accepted" | "rejected" | "partial" | "filled" | "cancelled" | "closed";
export interface TradeDecision {
  intent: LiveOrderIntent;
  thesis: string;
  invalidation: string;
  exitRule: string;
  targetsUsdCents: number[];
}
export interface OrderObservation {
  clientOrderId: string;
  venueOrderId: string;
  state: OrderState;
  filledQuantity: number;
  positionQuantity: number;
  observedAt: number;
}
export interface ExitQuote {
  symbol: string;
  bidUsdCents: number;
  askUsdCents: number;
  observedAt: number;
}

/** Read-only planning against a consistent persisted snapshot. A price trigger
 * is not an executable order: venue precision, fees, cancellation finality and
 * reduce-only enforcement must be established by a future execution adapter. */
export function planPositionExit(db: Database, id: string, quote: ExitQuote, now = Date.now()) {
  if (!validId(id) || !quote || Object.keys(quote).some(key => !["symbol","bidUsdCents","askUsdCents","observedAt"].includes(key)) ||
      ![quote.bidUsdCents,quote.askUsdCents,quote.observedAt,now].every(Number.isSafeInteger) ||
      quote.bidUsdCents <= 0 || quote.askUsdCents < quote.bidUsdCents || quote.observedAt < 0 || quote.observedAt > now) throw new Error("Invalid exit quote");
  return db.transaction(() => {
    const stored = db.prepare("SELECT decision FROM obolus_trading_decisions WHERE id=?").get(id) as {decision:string}|undefined;
    const observed = db.prepare("SELECT observation FROM obolus_trading_observations WHERE id=?").get(id) as {observation:string}|undefined;
    const configured = db.prepare("SELECT policy FROM obolus_live_order_control WHERE id=1").get() as {policy:string}|undefined;
    if (!stored || !observed || !configured) throw new Error("Exit planning requires reconciled order and explicit policy");
    const decision = JSON.parse(stored.decision) as TradeDecision;
    const position = JSON.parse(observed.observation) as OrderObservation;
    const policy = JSON.parse(configured.policy);
    if (!decision.intent || decision.intent.clientOrderId !== id || quote.symbol !== decision.intent.symbol ||
        !Number.isSafeInteger(policy.maxQuoteAgeMs) || policy.maxQuoteAgeMs <= 0 ||
        now - quote.observedAt > policy.maxQuoteAgeMs ||
        !Number.isSafeInteger(position.observedAt) || position.observedAt > now || now - position.observedAt > policy.maxQuoteAgeMs ||
        position.clientOrderId !== id || !Object.hasOwn(transitions, position.state) ||
        !Number.isFinite(position.positionQuantity) || position.positionQuantity < 0 ||
        !Number.isFinite(position.filledQuantity) || position.filledQuantity < position.positionQuantity ||
        ["accepted","rejected"].includes(position.state) && position.filledQuantity !== 0 ||
        ["partial","filled"].includes(position.state) && position.filledQuantity <= 0 ||
        position.state === "closed" && position.positionQuantity !== 0 ||
        !Number.isSafeInteger(decision.intent.limitPriceUsdCents) ||
        !Number.isSafeInteger(decision.intent.stopPriceUsdCents) || decision.intent.stopPriceUsdCents <= 0 ||
        decision.intent.stopPriceUsdCents >= decision.intent.limitPriceUsdCents ||
        !Array.isArray(decision.targetsUsdCents) || !decision.targetsUsdCents.length || decision.targetsUsdCents.length > 20 ||
        decision.targetsUsdCents.some(target => !Number.isSafeInteger(target) || target <= decision.intent.limitPriceUsdCents)) throw new Error("Fresh consistent position and exit contract required");
    const reason = quote.bidUsdCents <= decision.intent.stopPriceUsdCents ? "stop" :
      quote.bidUsdCents >= Math.min(...decision.targetsUsdCents) ? "target" : "not_triggered";
    const action = position.positionQuantity === 0 ? "no_position" : reason === "not_triggered" ? "hold" :
      ["accepted","partial"].includes(position.state) ? "cancel_entry_then_close" : "close_position";
    return {clientOrderId:id,symbol:quote.symbol,action,reason,quantity:position.positionQuantity,
      referenceBidUsdCents:quote.bidUsdCents,positionObservedAt:position.observedAt,quoteObservedAt:quote.observedAt,
      executionAuthorized:false,limitation:"Plan only. Cancellation finality, reduce-only execution, fee admission and actual fills require an authenticated venue adapter."};
  })();
}
/** Trusted adapter boundary. Neither credentials nor raw broker errors are persisted.
 * readOrder must reconcile fills AND current position, not just acknowledgement.
 * No method here is permitted to create an order while reconciling. */
export interface ReconciledOrderAdapter extends LiveOrderAdapter {
  readiness(): Promise<{ authenticated: boolean; portfolioConsistent: boolean; observedAt: number }>;
  readOrder(clientOrderId: string): Promise<OrderObservation>;
}
export type CancellationStatus = "pending" | "accepted" | "rejected" | "unknown";
/** Cancel existing entry only: never cancel/replace or create a new position.
 * Venue conformance must prove zero cancellation fees and request-id deduplication.
 * An acknowledgement is not cancellation finality; readOrder must confirm that. */
export interface CancellableOrderAdapter extends ReconciledOrderAdapter {
  readonly supportsIdempotentCancellation: true;
  readonly cancellationFeeUsdCents: 0;
  cancelOnce(request: Readonly<{requestId:string;clientOrderId:string;venueOrderId:string}>, signal:AbortSignal): Promise<{status:Exclude<CancellationStatus,"pending">}>;
}
const modes: TradingMode[] = ["DISABLED", "PAPER", "LIVE-MANUAL", "LIVE-AUTONOMOUS"];
const transitions: Record<OrderState, OrderState[]> = {
  accepted: ["accepted", "partial", "filled", "cancelled", "rejected", "closed"],
  partial: ["partial", "filled", "cancelled", "closed"],
  filled: ["filled", "closed"], cancelled: ["cancelled", "closed"], rejected: ["rejected"], closed: ["closed"],
};
const hash = (decision: TradeDecision) => createHash("sha256").update(JSON.stringify(decision)).digest("hex");
const validId = (value: string) => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const sameObservation = (a:OrderObservation,b:OrderObservation) =>
  (["clientOrderId","venueOrderId","state","filledQuantity","positionQuantity","observedAt"] as const).every(key=>a[key]===b[key]);
/** Both persisted gateway stop formats remain authoritative after restart.
 * Reading status must never create a gateway or reset either stop. */
function gatewayHalted(db: Database): boolean {
  const exists = (name:string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return exists("obolus_live_order_halt") && !!db.prepare("SELECT 1 FROM obolus_live_order_halt WHERE id=1").get() ||
    exists("obolus_live_order_control") && !!db.prepare("SELECT 1 FROM obolus_live_order_control WHERE id=1 AND halted<>0").get();
}
/** Read-only operator view: never creates tables, exposes broker payloads or
 * infers execution permission from the presence of an account. */
export function inspectTradingControl(db: Database) {
  const exists = (name: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const control = exists("obolus_trading_control")
    ? db.prepare("SELECT mode,halted FROM obolus_trading_control WHERE id=1").get() as {mode:TradingMode;halted:number}|undefined
    : undefined;
  if (exists("obolus_trading_control") && (!control || !modes.includes(control.mode) || ![0,1].includes(control.halted))) throw new Error("Invalid trading control state");
  return {
    initialized: !!control, mode: control?.mode ?? "DISABLED", halted: control?.halted === 1 || gatewayHalted(db),
    orders: exists("obolus_live_order_holds") ? db.prepare(`SELECT status,COUNT(*) count,SUM(CASE WHEN ${activeLiveOrderPredicate(db)} THEN usd_cents ELSE 0 END) reservedUsdCents FROM obolus_live_order_holds GROUP BY status`).all() : [],
    settlementBlocked: liveSettlementBlocked(db),
    settledOrders: exists('obolus_live_order_settlements') ? (db.prepare('SELECT COUNT(*) count FROM obolus_live_order_settlements').get() as {count:number}).count : 0,
    observations: exists("obolus_trading_observations") ? (db.prepare("SELECT COUNT(*) count FROM obolus_trading_observations").get() as {count:number}).count : 0,
    cancellations: exists("obolus_trading_cancellations") ? db.prepare("SELECT status,COUNT(*) count FROM obolus_trading_cancellations GROUP BY status").all() : [],
    liveReadinessVerified: false,
  };
}
async function boundedRead<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Broker read timed out")), 15000);
  })]); } finally { if (timer) clearTimeout(timer); }
}

/** Founder-only integration API; intentionally not an agent tool. Live mode is
 * opt-in and never inferred from credentials or provider availability. The low
 * level gateway remains responsible for every existing capital/risk invariant. */
export class TradingControlPlane {
  constructor(private readonly db: Database, private readonly clock: () => number = Date.now) {
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_trading_control(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL,halted INTEGER NOT NULL);
      INSERT OR IGNORE INTO obolus_trading_control VALUES(1,'DISABLED',0);
      CREATE TABLE IF NOT EXISTS obolus_trading_approvals(id TEXT PRIMARY KEY,digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS obolus_trading_decisions(id TEXT PRIMARY KEY,digest TEXT NOT NULL,decision TEXT NOT NULL,mode TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS obolus_trading_observations(id TEXT PRIMARY KEY,observation TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS obolus_trading_cancellations(id TEXT PRIMARY KEY,request_id TEXT NOT NULL,venue_id TEXT NOT NULL,venue_order_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected','unknown')));
      CREATE TABLE IF NOT EXISTS obolus_trading_audit(seq INTEGER PRIMARY KEY,event TEXT NOT NULL,at INTEGER NOT NULL);`);
  }
  private audit(event: string) { this.db.prepare("INSERT INTO obolus_trading_audit(event,at) VALUES(?,?)").run(event, this.clock()); }
  status(): { mode: TradingMode; halted: boolean } {
    const row = this.db.prepare("SELECT mode,halted FROM obolus_trading_control WHERE id=1").get() as { mode: TradingMode; halted: number } | undefined;
    if (!row || !modes.includes(row.mode) || ![0, 1].includes(row.halted)) throw new Error("Invalid trading control state");
    return { mode: row.mode, halted: row.halted === 1 || gatewayHalted(this.db) };
  }
  activate(mode: TradingMode, confirmation: string): void {
    if (!modes.includes(mode) || confirmation !== `ACTIVATE ${mode}`) throw new Error("Explicit trading-mode activation required");
    this.db.transaction(() => {
      if (this.status().halted) throw new Error("Trading halted; reviewed recovery required");
      this.db.prepare("UPDATE obolus_trading_control SET mode=? WHERE id=1").run(mode);
      this.audit(`mode:${mode}`);
    }).immediate();
  }
  halt(): void {
    this.db.transaction(() => {
      this.db.prepare("UPDATE obolus_trading_control SET halted=1 WHERE id=1").run();
      this.audit("halt");
    }).immediate();
    // Persistent gateway stop also prevents an already admitted controller call
    // from passing the gateway's final check after an asynchronous readiness read.
    new LiveOrderGateway(this.db, this.clock).emergencyStop();
  }
  private validate(decision: TradeDecision): void {
    if (!decision || !decision.intent || !validId(decision.intent.clientOrderId) ||
      ![decision.thesis, decision.invalidation, decision.exitRule].every(text => typeof text === "string" && text.trim().length > 0 && text.length <= 4000) ||
      !Array.isArray(decision.targetsUsdCents) || !decision.targetsUsdCents.length ||
      decision.targetsUsdCents.length > 20 || decision.targetsUsdCents.some(value => !Number.isSafeInteger(value) || value <= decision.intent.limitPriceUsdCents)) {
      throw new Error("Trade requires thesis, invalidation, targets and exit rule");
    }
    assertNoKnownSecrets(decision);
  }
  approve(decision: TradeDecision, confirmation: string): void {
    this.validate(decision);
    if (confirmation !== `APPROVE ${decision.intent.clientOrderId}`) throw new Error("Explicit order approval required");
    this.db.transaction(() => {
      const status = this.status();
      if (status.halted || status.mode !== "LIVE-MANUAL") throw new Error("Manual trading is not active");
      const previous = this.db.prepare("SELECT digest FROM obolus_trading_approvals WHERE id=?").get(decision.intent.clientOrderId) as {digest:string}|undefined;
      if (previous && previous.digest !== hash(decision)) throw new Error("Conflicting order approval");
      this.db.prepare("INSERT OR IGNORE INTO obolus_trading_approvals VALUES(?,?)").run(decision.intent.clientOrderId, hash(decision));
      this.audit("order-approved");
    }).immediate();
  }
  private admit(mode: TradingMode): void {
    const state = this.status();
    if (state.halted || state.mode !== mode || !mode.startsWith("LIVE-")) throw new Error("Live trading is not active");
  }
  private paper(): PaperPortfolio {
    const state = this.status();
    if (state.halted || state.mode !== "PAPER") throw new Error("Paper trading is not active");
    return new PaperPortfolio(this.db);
  }
  initializePaper(limits: PaperPortfolioLimits): void { this.paper().initialize(limits); }
  openPaper(id: string, plan: PaperPlan, at: number) { return this.paper().open(id, plan, at); }
  settlePaper(id: string, bars: Bar[]) { return this.paper().settle(id, bars); }
  async submit(decision: TradeDecision, adapter: ReconciledOrderAdapter) {
    this.validate(decision);
    const snapshot = structuredClone(decision), mode = this.status().mode;
    this.admit(mode);
    this.assertNoUncertainSubmission(snapshot.intent.clientOrderId);
    let ready;
    try { ready = await boundedRead(adapter.readiness()); } catch { this.halt(); throw new Error("Broker readiness unavailable; trading halted"); }
    const now = this.clock();
    // Quote lifetime is already an explicit order parameter, not a new risk value.
    if (!ready || ready.authenticated !== true || ready.portfolioConsistent !== true ||
        !Number.isSafeInteger(ready.observedAt) || ready.observedAt > now || ready.observedAt < snapshot.intent.quoteObservedAt || now >= snapshot.intent.expiresAt) {
      throw new Error("Fresh authenticated broker and consistent portfolio required");
    }
    this.db.transaction(() => {
      this.admit(mode);
      this.assertNoUncertainSubmission(snapshot.intent.clientOrderId);
      const digest = hash(snapshot);
      if (mode === "LIVE-MANUAL") {
        const approval = this.db.prepare("SELECT digest FROM obolus_trading_approvals WHERE id=?").get(snapshot.intent.clientOrderId) as {digest:string}|undefined;
        if (approval?.digest !== digest) throw new Error("Per-order approval missing");
      }
      const old = this.db.prepare("SELECT digest FROM obolus_trading_decisions WHERE id=?").get(snapshot.intent.clientOrderId) as {digest:string}|undefined;
      if (old && old.digest !== digest) throw new Error("Conflicting trade decision");
      this.db.prepare("INSERT OR IGNORE INTO obolus_trading_decisions VALUES(?,?,?,?,?)")
        .run(snapshot.intent.clientOrderId, digest, JSON.stringify(snapshot), mode, now);
    }).immediate();
    // No await between final admission and entering the gateway's atomic reservation.
    this.admit(mode);
    const result = await new LiveOrderGateway(this.db, this.clock).submit(snapshot.intent, adapter);
    this.audit(`submission:${result.status}`);
    if (result.status === "unknown") this.halt();
    return result;
  }
  private assertNoUncertainSubmission(id: string): void {
    const exists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_live_order_holds'").get();
    if (exists && this.db.prepare(`SELECT 1 FROM obolus_live_order_holds WHERE status IN ('pending','unknown') AND client_id<>? AND (${activeLiveOrderPredicate(this.db)}) LIMIT 1`).get(id)) {
      throw new Error("Unresolved order submission requires reconciliation before new orders");
    }
  }
  /** Risk-reducing operation may cancel an existing entry during a LIVE halt.
   * DISABLED/PAPER never contact a live adapter. This does not clear any halt,
   * release money, close a filled position or acknowledge final cancellation. */
  async cancelEntry(id: string, adapter: CancellableOrderAdapter, confirmation?: string): Promise<{status:CancellationStatus;requestId:string}> {
    if (!validId(id) || adapter.supportsIdempotentCancellation !== true || adapter.cancellationFeeUsdCents !== 0) throw new Error("Idempotent fee-free cancellation adapter required");
    assertNoKnownSecrets(id);
    const mode = this.status().mode;
    const admission = () => {
      if (!mode.startsWith("LIVE-") || this.status().mode !== mode) throw new Error("Live cancellation is not active");
      if (mode === "LIVE-MANUAL" && confirmation !== `CANCEL ${id}`) throw new Error("Explicit manual cancellation approval required");
      const row = this.db.prepare("SELECT policy FROM obolus_live_order_control WHERE id=1").get() as {policy:string}|undefined;
      if (!row || JSON.parse(row.policy).venueId !== adapter.venueId) throw new Error("Unconfigured cancellation venue");
    };
    admission();
    const prior = () => this.db.prepare("SELECT status,request_id FROM obolus_trading_cancellations WHERE id=?").get(id) as {status:CancellationStatus;request_id:string}|undefined;
    const previous = prior();
    if (previous) return {status:previous.status,requestId:previous.request_id};
    let ready;
    try { ready = await boundedRead(adapter.readiness()); } catch { this.halt(); throw new Error("Cancellation readiness unavailable; trading halted"); }
    const policyRow = this.db.prepare("SELECT policy FROM obolus_live_order_control WHERE id=1").get() as {policy:string};
    const maxAge = JSON.parse(policyRow.policy).maxQuoteAgeMs;
    if (!ready || ready.authenticated !== true || ready.portfolioConsistent !== true ||
        !Number.isSafeInteger(maxAge) || maxAge<=0 ||
        !Number.isSafeInteger(ready.observedAt) || ready.observedAt > this.clock() || this.clock()-ready.observedAt > maxAge) throw new Error("Fresh authenticated cancellation readiness required");
    const observation = await this.reconcile(id,adapter);
    const requestId = `cancel_${createHash("sha256").update(JSON.stringify([adapter.venueId,id,observation.venueOrderId])).digest("hex")}`;
    const existing = this.db.transaction(() => {
      admission();
      const old = prior();if (old) return old;
      const latest = this.observation(id);
      if (!latest || !sameObservation(latest,observation) || !["accepted","partial"].includes(latest.state) ||
          this.clock()-latest.observedAt>maxAge || this.clock()-ready.observedAt>maxAge) throw new Error("Cancellation requires a current open entry");
      this.db.prepare("INSERT INTO obolus_trading_cancellations VALUES(?,?,?,?, 'pending')").run(id,requestId,adapter.venueId,observation.venueOrderId);
      this.audit(`cancellation:${id}:pending`);
      return undefined;
    }).immediate();
    if (existing) return {status:existing.status,requestId:existing.request_id};
    const request = Object.freeze({requestId,clientOrderId:id,venueOrderId:observation.venueOrderId});
    const abort = new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    let status:Exclude<CancellationStatus,"pending"> = "unknown";
    try {
      admission();
      const result = await Promise.race([adapter.cancelOnce(request,abort.signal),new Promise<{status:"unknown"}>(resolve=>{
        timer=setTimeout(()=>{abort.abort();resolve({status:"unknown"});},15000);
      })]);
      if (result && ["accepted","rejected","unknown"].includes(result.status)) status=result.status;
    } catch { status="unknown"; } finally { if(timer)clearTimeout(timer); }
    this.db.transaction(()=>{
      this.db.prepare("UPDATE obolus_trading_cancellations SET status=? WHERE id=? AND status='pending'").run(status,id);
      this.audit(`cancellation:${id}:${status}`);
    }).immediate();
    if (status === "unknown") this.halt();
    return {status,requestId};
  }
  async settleClosedOrder(id:string,adapter:ReconciledOrderAdapter&LiveSettlementAdapter){
    await this.reconcile(id,adapter);
    return reconcileClosedOrder(this.db,id,adapter);
  }
  async reconcile(id: string, adapter: ReconciledOrderAdapter): Promise<OrderObservation> {
    const hold = this.db.prepare("SELECT venue_order_id,intent,status FROM obolus_live_order_holds WHERE client_id=?").get(id) as {venue_order_id:string|null;intent:string;status:string}|undefined;
    if (!hold || !validId(id)) throw new Error("Unknown order");
    const control = this.db.prepare("SELECT policy FROM obolus_live_order_control WHERE id=1").get() as {policy:string}|undefined;
    const policy = control ? JSON.parse(control.policy) : undefined;
    if (!policy || policy.venueId !== adapter.venueId || !Number.isSafeInteger(policy.maxQuoteAgeMs) || policy.maxQuoteAgeMs <= 0) throw new Error("Unconfigured reconciliation venue");
    let observation: OrderObservation;
    try { observation = await boundedRead(adapter.readOrder(id)); } catch { this.halt(); throw new Error("Order reconciliation unavailable; trading halted"); }
    try {
      const allowed = ["clientOrderId", "venueOrderId", "state", "filledQuantity", "positionQuantity", "observedAt"];
      if (!observation || Object.keys(observation).some(key => !allowed.includes(key)) ||
          observation.clientOrderId !== id || !validId(observation.venueOrderId) ||
          (hold.venue_order_id && hold.venue_order_id !== observation.venueOrderId) ||
          !Object.hasOwn(transitions, observation.state) ||
          ![observation.filledQuantity, observation.positionQuantity].every(n => Number.isFinite(n) && n >= 0) ||
          observation.positionQuantity > observation.filledQuantity ||
          observation.state === "accepted" && observation.filledQuantity !== 0 ||
          hold.status === "rejected" && observation.state !== "rejected" ||
          ["partial", "filled"].includes(observation.state) && observation.filledQuantity <= 0 ||
          !Number.isSafeInteger(observation.observedAt) || observation.observedAt > this.clock() ||
          this.clock() - observation.observedAt > policy.maxQuoteAgeMs ||
          observation.observedAt < JSON.parse(hold.intent).quoteObservedAt ||
          observation.state === "closed" && observation.positionQuantity !== 0 ||
          observation.state === "rejected" && observation.filledQuantity !== 0) throw new Error("Invalid broker observation");
      const result = structuredClone(observation);
      this.db.transaction(() => {
        // Provider reads are asynchronous. Revalidate the reservation at commit,
        // since the in-flight submission may have completed in another worker.
        const current = this.db.prepare("SELECT status,venue_order_id,intent FROM obolus_live_order_holds WHERE client_id=?").get(id) as {status:string;venue_order_id:string|null;intent:string}|undefined;
        if (!current || current.intent!==hold.intent || current.status==="rejected" && result.state!=="rejected" ||
            current.venue_order_id && current.venue_order_id!==result.venueOrderId) throw new Error("Order changed during reconciliation");
        const old = this.observation(id);
        if (old && (result.venueOrderId !== old.venueOrderId || result.observedAt < old.observedAt ||
            result.observedAt === old.observedAt && !sameObservation(result,old) ||
            result.filledQuantity < old.filledQuantity || !transitions[old.state].includes(result.state))) throw new Error("Inconsistent order lifecycle");
        this.db.prepare("INSERT INTO obolus_trading_observations VALUES(?,?) ON CONFLICT(id) DO UPDATE SET observation=excluded.observation")
          .run(id, JSON.stringify(result));
        this.audit(`reconciled:${result.state}`);
      }).immediate();
      // Deliberately retain monetary holds. Releasing capital requires venue fee,
      // settlement and cash evidence, not just an order/position status.
      return result;
    } catch { this.halt(); throw new Error("Inconsistent order reconciliation; trading halted"); }
  }
  observation(id: string): OrderObservation | undefined {
    const row = this.db.prepare("SELECT observation FROM obolus_trading_observations WHERE id=?").get(id) as {observation:string}|undefined;
    return row ? JSON.parse(row.observation) : undefined;
  }
}
