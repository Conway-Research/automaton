import { createHash } from "node:crypto";
import type { Database } from "better-sqlite3";
import { sizePaperPosition, simulatePaperExit, validateBars, validateFriction, type PaperPlan, type PaperPosition, type PaperTrade, type Bar, type Friction } from "./paper-trading.js";

export interface PaperPortfolioLimits {
  currency?: "USD" | "CHF" | "EUR";
  capitalAllocation?: { totalCents: number; operatingCents: number; reserveCents: number; tradingCents: number };
  initialCapitalCents: number;
  liquidityFloorCents: number;
  maxOpenRiskCents: number;
  maxDailyLossCents: number;
  maxDrawdownCents: number;
  maxPositions: number;
  friction: Friction;
}
type Control = { limits: string; cash_cents: number; closed_equity_cents: number; peak_cents: number; clock: number; halted: number; halt_reason: string | null };
type PositionRow = { id: string; input_digest: string; position: string; opened_at: number; status: string; trade: string | null; settlement_digest: string | null; closed_at: number | null; loss_cents: number };
export interface PaperObservation { id: string; bar: Bar }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cents = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 100_000_000;
function time(value: number) { if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) throw new Error("Invalid paper timestamp"); }

/** One persistent paper account per database. No broker, network, leverage or real ledger. */
export class PaperPortfolio {
  constructor(private readonly db: Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS paper_portfolio_control(
      id INTEGER PRIMARY KEY CHECK(id=1),limits TEXT NOT NULL,cash_cents INTEGER NOT NULL,
      closed_equity_cents INTEGER NOT NULL,peak_cents INTEGER NOT NULL,clock INTEGER NOT NULL DEFAULT 0,
      halted INTEGER NOT NULL DEFAULT 0,halt_reason TEXT);
      CREATE TABLE IF NOT EXISTS paper_portfolio_positions(
      id TEXT PRIMARY KEY,input_digest TEXT NOT NULL,position TEXT NOT NULL,opened_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','closed')),trade TEXT,settlement_digest TEXT,closed_at INTEGER,loss_cents INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS paper_portfolio_audit(id INTEGER PRIMARY KEY,action TEXT NOT NULL,detail TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT(datetime('now')));
      CREATE TABLE IF NOT EXISTS paper_portfolio_marks(id TEXT PRIMARY KEY,at INTEGER NOT NULL,pnl_cents INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS paper_portfolio_valuation(id INTEGER PRIMARY KEY CHECK(id=1),peak_cents INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS paper_portfolio_frames(at INTEGER PRIMARY KEY,digest TEXT NOT NULL,report TEXT NOT NULL);`);
  }
  private control(): Control {
    const row=this.db.prepare("SELECT * FROM paper_portfolio_control WHERE id=1").get() as Control|undefined;
    if(!row) throw new Error("Initialize explicit paper portfolio limits first");return row;
  }
  private audit(action:string,detail:unknown) {this.db.prepare("INSERT INTO paper_portfolio_audit(action,detail) VALUES(?,?)").run(action,JSON.stringify(detail));}
  initialize(input:PaperPortfolioLimits) {
    validateFriction(input?.friction);
    if(input.currency !== undefined && !["USD","CHF","EUR"].includes(input.currency)) throw new Error("Unsupported paper currency");
    const allocation=input.capitalAllocation;
    if(allocation && (!input.currency || ![allocation.totalCents,allocation.operatingCents,allocation.reserveCents,allocation.tradingCents].every(cents) ||
      allocation.totalCents !== allocation.operatingCents+allocation.reserveCents+allocation.tradingCents || allocation.tradingCents !== input.initialCapitalCents)) {
      throw new Error("Invalid capital allocation: explicit currency and exact funded trading allocation required");
    }
    if(!input || ![input.initialCapitalCents,input.liquidityFloorCents,input.maxOpenRiskCents,input.maxDailyLossCents,input.maxDrawdownCents].every(cents) ||
      input.initialCapitalCents<=0 || [input.liquidityFloorCents,input.maxOpenRiskCents,input.maxDailyLossCents,input.maxDrawdownCents].some(n=>n>input.initialCapitalCents) ||
      !Number.isInteger(input.maxPositions) || input.maxPositions<1 || input.maxPositions>20 || !input.friction ||
      ![input.friction.feeBps,input.friction.slippageBps].every(n=>Number.isFinite(n)&&n>=0&&n<10000)) throw new Error("Invalid paper portfolio limits");
    const limits:PaperPortfolioLimits={...(input.currency === undefined ? {} : {currency:input.currency}),
      ...(allocation ? {capitalAllocation:{totalCents:allocation.totalCents,operatingCents:allocation.operatingCents,reserveCents:allocation.reserveCents,tradingCents:allocation.tradingCents}} : {}),
      initialCapitalCents:input.initialCapitalCents,liquidityFloorCents:input.liquidityFloorCents,
      maxOpenRiskCents:input.maxOpenRiskCents,maxDailyLossCents:input.maxDailyLossCents,maxDrawdownCents:input.maxDrawdownCents,
      maxPositions:input.maxPositions,friction:{feeBps:input.friction.feeBps,slippageBps:input.friction.slippageBps,
        ...(input.friction.minimumFeeCents === undefined ? {} : {minimumFeeCents:input.friction.minimumFeeCents})}};
    this.db.transaction(()=>{
      const previous=this.db.prepare("SELECT limits FROM paper_portfolio_control WHERE id=1").get() as {limits:string}|undefined;
      if(previous) {if(previous.limits!==JSON.stringify(limits)) throw new Error("Paper limits are immutable; cannot reset an existing account");return;}
      this.db.prepare("INSERT INTO paper_portfolio_control(id,limits,cash_cents,closed_equity_cents,peak_cents) VALUES(1,?,?,?,?)").run(JSON.stringify(limits),limits.initialCapitalCents,limits.initialCapitalCents,limits.initialCapitalCents);
      this.audit("initialize",limits);
    }).immediate();
  }
  open(id:string,plan:PaperPlan,at:number) {
    time(at);
    if(typeof id!=="string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || !plan || typeof plan.symbol!=="string" || !/^[A-Za-z0-9._-]{1,30}$/.test(plan.symbol) ||
      typeof plan.thesis!=="string" || plan.thesis.length>2000 || typeof plan.exitRule!=="string" || plan.exitRule.length>2000 ||
      !Array.isArray(plan.targetsCents) || plan.targetsCents.length>20 || plan.targetsCents.some(p=>!cents(p)) || !cents(plan.entryCents)) throw new Error("Invalid paper order");
    const normalized:PaperPlan={...(plan.currency === undefined ? {} : {currency:plan.currency}),symbol:plan.symbol.toUpperCase(),thesis:plan.thesis,entryCents:plan.entryCents,stopCents:plan.stopCents,
      targetsCents:[...plan.targetsCents],exitRule:plan.exitRule,riskFraction:plan.riskFraction??0.01};
    const digest=hash([normalized,at]);
    return this.db.transaction(()=>{
      const previous=this.db.prepare("SELECT * FROM paper_portfolio_positions WHERE id=?").get(id) as PositionRow|undefined;
      if(previous) {if(previous.input_digest!==digest) throw new Error("Conflicting paper order ID");return {id,duplicate:true,position:JSON.parse(previous.position) as PaperPosition};}
      const control=this.control(),limits=JSON.parse(control.limits) as PaperPortfolioLimits;
      if((plan.currency ?? "USD") !== (limits.currency ?? "USD")) throw new Error("Paper order currency mismatch; no implicit FX conversion");
      if(control.halted) throw new Error("Paper portfolio halted");
      if(at<control.clock) throw new Error("Paper clock cannot move backwards");
      if((this.db.prepare("SELECT COUNT(*) n FROM paper_portfolio_positions").get() as {n:number}).n>=1000) throw new Error("Paper account capacity reached");
      const open=(this.db.prepare("SELECT position FROM paper_portfolio_positions WHERE status='open'").all() as {position:string}[]).map(r=>JSON.parse(r.position) as PaperPosition);
      if(open.length>=limits.maxPositions) throw new Error("Maximum simultaneous paper positions reached");
      if(open.some(p=>p.plan.symbol===normalized.symbol)) throw new Error("One open paper position per symbol; no averaging down");
      const risk=open.reduce((sum,p)=>sum+p.plannedLossCents,0);
      const entryFees=open.reduce((sum,p)=>sum+p.entryFeeCents,0);
      const marks=this.db.prepare("SELECT p.id,p.opened_at,m.at,m.pnl_cents FROM paper_portfolio_positions p LEFT JOIN paper_portfolio_marks m ON m.id=p.id WHERE p.status='open'").all() as {id:string;opened_at:number;at:number|null;pnl_cents:number|null}[];
      if(marks.some(m=>(m.at??m.opened_at)!==at)) throw new Error("Fresh synchronized paper observations required before new exposure");
      const markedEquity=control.closed_equity_cents+marks.reduce((sum,m)=>sum+(m.pnl_cents??0),0);
      const position=sizePaperPosition(normalized,Math.min(control.closed_equity_cents-entryFees,markedEquity),Math.max(0,control.cash_cents-limits.liquidityFloorCents),limits.friction);
      const dayStart=Math.floor(at/86400000)*86400000;
      const losses=(this.db.prepare("SELECT COALESCE(SUM(loss_cents),0) n FROM paper_portfolio_positions WHERE status='closed' AND closed_at>=? AND closed_at<?").get(dayStart,dayStart+86400000) as {n:number}).n;
      if(risk+position.plannedLossCents>limits.maxOpenRiskCents) throw new Error("Aggregate planned paper risk exceeded");
      if(losses+risk+position.plannedLossCents>limits.maxDailyLossCents) throw new Error("Daily paper loss allowance exhausted");
      const markPeak=(this.db.prepare("SELECT peak_cents FROM paper_portfolio_valuation WHERE id=1").get() as {peak_cents:number}|undefined)?.peak_cents??control.peak_cents;
      if(Math.max(control.peak_cents,markPeak)-control.closed_equity_cents+risk+position.plannedLossCents>limits.maxDrawdownCents) throw new Error("Paper drawdown allowance exhausted");
      this.db.prepare("INSERT INTO paper_portfolio_positions(id,input_digest,position,opened_at,status) VALUES(?,?,?,?,'open')").run(id,digest,JSON.stringify(position),at);
      this.db.prepare("UPDATE paper_portfolio_control SET cash_cents=cash_cents-?,clock=? WHERE id=1").run(position.committedCents,at);
      this.audit("open",{id,at,plannedLossCents:position.plannedLossCents});
      return {id,duplicate:false,position};
    }).immediate();
  }
  settle(id:string,bars:Bar[]) {
    if(!Array.isArray(bars)||!bars.length||bars.length>5000) throw new Error("Invalid paper settlement window");
    validateBars(bars);bars.forEach(b=>time(b.time));
    if(bars.some(b=>b.high>100_000_000)) throw new Error("Paper price bound exceeded");
    const digest=hash(bars.map(b=>[b.time,b.open,b.high,b.low,b.close]));
    return this.db.transaction(()=>{
      const row=this.db.prepare("SELECT * FROM paper_portfolio_positions WHERE id=?").get(id) as PositionRow|undefined;
      if(!row) throw new Error("Unknown paper position");
      if(row.status==='closed') {if(row.settlement_digest!==digest) throw new Error("Conflicting paper settlement");return {id,duplicate:true,trade:JSON.parse(row.trade!) as PaperTrade};}
      if(bars[0].time<=row.opened_at) throw new Error("Settlement bars must follow paper entry time");
      const mark=this.db.prepare("SELECT at FROM paper_portfolio_marks WHERE id=?").get(id) as {at:number}|undefined;
      if(mark && bars[0].time<=mark.at) throw new Error("Settlement cannot rewrite observed paper history");
      const control=this.control(),limits=JSON.parse(control.limits) as PaperPortfolioLimits;
      const trade=simulatePaperExit(JSON.parse(row.position),bars,limits.friction);
      if(trade.exitTime<control.clock) throw new Error("Paper settlement cannot backdate account history");
      const markedPeak=(this.db.prepare("SELECT peak_cents FROM paper_portfolio_valuation WHERE id=1").get() as {peak_cents:number}|undefined)?.peak_cents??control.peak_cents;
      const equity=control.closed_equity_cents+trade.netPnlCents,peak=Math.max(control.peak_cents,markedPeak,equity);
      const cash=control.cash_cents+trade.committedCents+trade.netPnlCents;
      if(!Number.isSafeInteger(equity)||!Number.isSafeInteger(cash)||equity<0||cash<0) throw new Error("Paper account arithmetic limit exceeded");
      this.db.prepare("UPDATE paper_portfolio_positions SET status='closed',trade=?,settlement_digest=?,closed_at=?,loss_cents=? WHERE id=?").run(JSON.stringify(trade),digest,trade.exitTime,Math.max(0,-trade.netPnlCents),id);
      const dayStart=Math.floor(trade.exitTime/86400000)*86400000;
      const losses=(this.db.prepare("SELECT COALESCE(SUM(loss_cents),0) n FROM paper_portfolio_positions WHERE closed_at>=? AND closed_at<?").get(dayStart,dayStart+86400000) as {n:number}).n;
      const reason=peak-equity>=limits.maxDrawdownCents?"Paper drawdown limit reached":losses>=limits.maxDailyLossCents?"Paper daily loss limit reached":null;
      this.db.prepare("UPDATE paper_portfolio_control SET cash_cents=?,closed_equity_cents=?,peak_cents=?,clock=?,halted=?,halt_reason=? WHERE id=1").run(cash,equity,peak,trade.exitTime,control.halted||Number(reason!==null),control.halt_reason??reason);
      this.audit("settle",{id,netPnlCents:trade.netPnlCents,haltReason:reason});
      return {id,duplicate:false,trade};
    }).immediate();
  }
  observe(at:number,quotes:PaperObservation[]) {
    time(at);
    if(!Array.isArray(quotes)||quotes.length>20||new Set(quotes.map(q=>q.id)).size!==quotes.length) throw new Error("Invalid paper observation batch");
    for(const q of quotes) {
      validateBars([q.bar]);
      if(q.bar.time!==at||q.bar.high>100_000_000) throw new Error("Observations must share one bounded paper timestamp");
    }
    const digest=hash([...quotes].sort((a,b)=>a.id.localeCompare(b.id)).map(q=>[q.id,q.bar.time,q.bar.open,q.bar.high,q.bar.low,q.bar.close]));
    return this.db.transaction(()=>{
      const previous=this.db.prepare("SELECT digest,report FROM paper_portfolio_frames WHERE at=?").get(at) as {digest:string;report:string}|undefined;
      if(previous) {if(previous.digest!==digest) throw new Error("Conflicting observation replay");return {duplicate:true,report:JSON.parse(previous.report)};}
      const control=this.control(),limits=JSON.parse(control.limits) as PaperPortfolioLimits;
      if(at<=control.clock) throw new Error("Observation must advance paper clock");
      if((this.db.prepare("SELECT COUNT(*) n FROM paper_portfolio_frames").get() as {n:number}).n>=10000) throw new Error("Paper observation capacity reached");
      const positions=this.db.prepare("SELECT * FROM paper_portfolio_positions WHERE status='open' ORDER BY id").all() as PositionRow[];
      if(positions.length!==quotes.length||positions.some(p=>!quotes.some(q=>q.id===p.id))) throw new Error("Observe every open position exactly once");
      let cash=control.cash_cents,closedEquity=control.closed_equity_cents,unrealized=0,openLoss=0;
      const closedIds:string[]=[];
      for(const row of positions) {
        const bar=quotes.find(q=>q.id===row.id)!.bar;
        const trade=simulatePaperExit(JSON.parse(row.position),[bar],limits.friction);
        if(trade.reason==='window_end') {
          unrealized+=trade.netPnlCents;openLoss+=Math.max(0,-trade.netPnlCents);
          this.db.prepare("INSERT INTO paper_portfolio_marks(id,at,pnl_cents) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,pnl_cents=excluded.pnl_cents").run(row.id,at,trade.netPnlCents);
        } else {
          const settlementDigest=hash([[bar.time,bar.open,bar.high,bar.low,bar.close]]);
          this.db.prepare("UPDATE paper_portfolio_positions SET status='closed',trade=?,settlement_digest=?,closed_at=?,loss_cents=? WHERE id=?").run(JSON.stringify(trade),settlementDigest,at,Math.max(0,-trade.netPnlCents),row.id);
          cash+=trade.committedCents+trade.netPnlCents;closedEquity+=trade.netPnlCents;closedIds.push(row.id);
        }
      }
      const equity=closedEquity+unrealized;
      if(![cash,closedEquity,equity].every(n=>Number.isSafeInteger(n)&&n>=0)) throw new Error("Invalid paper valuation arithmetic");
      const previousPeak=(this.db.prepare("SELECT peak_cents FROM paper_portfolio_valuation WHERE id=1").get() as {peak_cents:number}|undefined)?.peak_cents??control.peak_cents;
      const peak=Math.max(previousPeak,control.peak_cents,equity);
      const dayStart=Math.floor(at/86400000)*86400000;
      const realizedLoss=(this.db.prepare("SELECT COALESCE(SUM(loss_cents),0) n FROM paper_portfolio_positions WHERE closed_at>=? AND closed_at<?").get(dayStart,dayStart+86400000) as {n:number}).n;
      const reason=peak-equity>=limits.maxDrawdownCents?"Marked paper drawdown limit reached":realizedLoss+openLoss>=limits.maxDailyLossCents?"Marked paper daily loss limit reached":null;
      const halted=control.halted||Number(reason!==null);
      this.db.prepare("UPDATE paper_portfolio_control SET cash_cents=?,closed_equity_cents=?,peak_cents=?,clock=?,halted=?,halt_reason=? WHERE id=1").run(cash,closedEquity,Math.max(control.peak_cents,closedEquity),at,halted,control.halt_reason??reason);
      this.db.prepare("INSERT INTO paper_portfolio_valuation(id,peak_cents) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET peak_cents=excluded.peak_cents").run(peak);
      const report={at,closedIds,markedEquityCents:equity,openLossCents:openLoss,markedPeakCents:peak,halted};
      this.db.prepare("INSERT INTO paper_portfolio_frames(at,digest,report) VALUES(?,?,?)").run(at,digest,JSON.stringify(report));
      this.audit("observe",report);return {duplicate:false,report};
    }).immediate();
  }
  halt(reason:string) {
    if(typeof reason!=="string"||!reason.trim()||reason.length>500) throw new Error("Paper halt needs a reason");
    this.db.transaction(()=>{this.control();this.db.prepare("UPDATE paper_portfolio_control SET halted=1,halt_reason=COALESCE(halt_reason,?) WHERE id=1").run(reason);this.audit("halt",{reason});}).immediate();
  }
  snapshot() {
    return this.db.transaction(()=>{
      const control=this.control();
      const positions=this.db.prepare("SELECT id,position,opened_at,status,trade,closed_at FROM paper_portfolio_positions ORDER BY opened_at,id").all() as Pick<PositionRow,"id"|"position"|"opened_at"|"status"|"trade"|"closed_at">[];
      const open=positions.filter(p=>p.status==='open').map(p=>JSON.parse(p.position) as PaperPosition);
      const marks=this.db.prepare("SELECT m.id,m.at,m.pnl_cents FROM paper_portfolio_marks m JOIN paper_portfolio_positions p ON p.id=m.id WHERE p.status='open'").all() as {id:string;at:number;pnl_cents:number}[];
      return {mode:"paper-portfolio",...control,currency:(JSON.parse(control.limits) as PaperPortfolioLimits).currency ?? "USD",limits:JSON.parse(control.limits),positions,
        openPositions:open.length,plannedOpenRiskCents:open.reduce((sum,p)=>sum+p.plannedLossCents,0),
        marks,markedEquityCents:marks.length===open.length?control.closed_equity_cents+marks.reduce((sum,m)=>sum+m.pnl_cents,0):null,
        marksCurrent:marks.length===open.length&&marks.every(m=>m.at===control.clock),
        limitations:"Marks use supplied OHLC closes and simulated liquidation costs in the account currency, not verified live quotes or intrabar account extrema. Planned limits can be exceeded by gaps. Cash-only single-currency simulation; no FX conversion, broker, real revenue or live authority. Operating/reserve allocations are planning envelopes, not an inference spending ledger. Times are simulated UTC milliseconds."};
    })();
  }
}
