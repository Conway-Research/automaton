import type {Database} from 'better-sqlite3';
import {activeLiveOrderPredicate,liveSettlementBlocked} from './live-settlement.js';

/** Trusted integration only. Equity must include every position marked in the
 * account currency and all fees. External flows exclude trading PnL and fees.
 * This store does not authenticate the provider or calculate market marks.
 * Explicit fixed windows avoid silent day rollover or stop resets. */
export interface DailyLossPolicy {
  venue: string; account: string; currency: string;
  startsAt: number; endsAt: number; openingEquityCents: number;
  maximumLossCents: number; maximumAgeMs: number;
}
export interface AccountEquityObservation {
  venue: string; account: string; currency: string;
  observedAt: number; equityAfterFeesCents: number; netExternalFlowCents: number;
}
/** Installed read-only provider integration, never agent-supplied. Implementers
 * must authenticate the account and include all positions, fees and flows.
 * This interface itself is not proof of authentication or complete valuation. */
export interface AccountEquityReader {
  readAccountEquity(scope:Readonly<DailyLossPolicy>,signal:AbortSignal):Promise<AccountEquityObservation>;
}
const money = (n:number) => Number.isSafeInteger(n) && Math.abs(n) <= 1_000_000_000;
const time = (n:number) => Number.isSafeInteger(n) && n >= 0;
const id = (s:string) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(s);
function validate(p:DailyLossPolicy) {
  if (!p || ![p.venue,p.account,p.currency].every(id) || !time(p.startsAt) || !time(p.endsAt) ||
    p.endsAt-p.startsAt !== 86_400_000 || !money(p.openingEquityCents) || p.openingEquityCents<=0 ||
    !money(p.maximumLossCents) || p.maximumLossCents<=0 || p.maximumLossCents>p.openingEquityCents ||
    !time(p.maximumAgeMs) || p.maximumAgeMs<1 || p.maximumAgeMs>60_000) throw Error('Invalid daily loss policy');
}
export class LiveDailyLossMonitor {
  constructor(private readonly db:Database, private readonly clock:()=>number=Date.now) {}
  /** Creates a separate risk ledger; never activates trading or alters budgets. */
  configure(policy:DailyLossPolicy):void {
    validate(policy);
    const payload=JSON.stringify(policy);
    this.db.transaction(()=>{
      this.db.exec(`CREATE TABLE IF NOT EXISTS obolus_daily_loss (
        id INTEGER PRIMARY KEY CHECK(id=1),policy TEXT NOT NULL,observation TEXT,
        halted INTEGER NOT NULL DEFAULT 0 CHECK(halted IN (0,1)));
        CREATE TABLE IF NOT EXISTS obolus_daily_loss_audit (
        seq INTEGER PRIMARY KEY,at INTEGER NOT NULL,observation TEXT NOT NULL,loss_cents INTEGER NOT NULL);`);
      const prior=this.db.prepare('SELECT policy FROM obolus_daily_loss WHERE id=1').get() as {policy:string}|undefined;
      if(prior && prior.policy!==payload) throw Error('Daily loss policy immutable; reviewed rollover required');
      this.db.prepare('INSERT OR IGNORE INTO obolus_daily_loss(id,policy) VALUES(1,?)').run(payload);
    }).immediate();
  }
  private row() {
    const row=this.db.prepare('SELECT policy,observation,halted FROM obolus_daily_loss WHERE id=1').get() as
      {policy:string;observation:string|null;halted:number}|undefined;
    if(!row || ![0,1].includes(row.halted)) throw Error('Daily loss monitor unavailable');
    const policy=JSON.parse(row.policy) as DailyLossPolicy;validate(policy);
    return {...row,policy};
  }
  private refreshBlocked():boolean {
    if(!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_equity_refresh'").get())return false;
    const row=this.db.prepare('SELECT blocked FROM obolus_equity_refresh WHERE id=1').get() as {blocked:number}|undefined;
    return !row || row.blocked!==0;
  }
  /** Invalidate admission before I/O, including when old evidence is still fresh.
   * Failure remains blocked across process restarts. A newer refresh supersedes
   * an older request; a late response can never clear its block or overwrite it.
   * No orders, activation, credentials or limit changes are performed here. */
  async refresh(reader:AccountEquityReader):Promise<void> {
    const start=this.db.transaction(()=>{
      const policy=this.row().policy;
      this.db.exec(`CREATE TABLE IF NOT EXISTS obolus_equity_refresh (
        id INTEGER PRIMARY KEY CHECK(id=1),generation INTEGER NOT NULL,blocked INTEGER NOT NULL CHECK(blocked IN (0,1)));
        INSERT OR IGNORE INTO obolus_equity_refresh VALUES(1,0,1);`);
      const old=this.db.prepare('SELECT generation FROM obolus_equity_refresh WHERE id=1').get() as {generation:number};
      if(!Number.isSafeInteger(old.generation)||old.generation<0||old.generation>=Number.MAX_SAFE_INTEGER)throw Error('Invalid equity refresh generation');
      const generation=old.generation+1;
      this.db.prepare('UPDATE obolus_equity_refresh SET generation=?,blocked=1 WHERE id=1').run(generation);
      return {policy,generation};
    }).immediate();
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{
        controller.abort();reject(Error('Account equity refresh timeout'));
      },15_000);});
      const raw=await Promise.race([Promise.resolve().then(()=>reader.readAccountEquity(Object.freeze({...start.policy}),controller.signal)),timeout]);
      this.db.transaction(()=>{
        const row=this.db.prepare('SELECT generation FROM obolus_equity_refresh WHERE id=1').get() as {generation:number}|undefined;
        if(row?.generation!==start.generation || JSON.stringify(this.row().policy)!==JSON.stringify(start.policy))
          throw Error('Account equity refresh superseded');
        this.observe(raw);
        this.db.prepare('UPDATE obolus_equity_refresh SET blocked=0 WHERE id=1').run();
      }).immediate();
    } finally {if(timer)clearTimeout(timer);controller.abort();}
  }
  /** Trusted operator integration only; not an agent tool or an automatic
   * scheduler. The closing observation uses the OLD window's cumulative flows.
   * Exact boundary valuation is required; missed boundaries need reconciliation.
   * No stop is cleared and no risk limit/account/currency can change here. */
  rollover(input:AccountEquityObservation, confirmation:string):void {
    const closing=structuredClone(input),now=this.clock();
    this.db.transaction(()=>{
      const r=this.row(),p=r.policy;
      if(this.refreshBlocked())throw Error('Account equity refresh unresolved');
      if(confirmation!==`ROLLOVER ${p.endsAt}` || !closing || !time(now) ||
        closing.venue!==p.venue || closing.account!==p.account || closing.currency!==p.currency ||
        closing.observedAt!==p.endsAt || now<p.endsAt || now-p.endsAt>p.maximumAgeMs ||
        !money(closing.equityAfterFeesCents) || closing.equityAfterFeesCents<=0 ||
        !money(closing.netExternalFlowCents)) throw Error('Reviewed boundary valuation required');
      const exists=(name:string)=>!!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
      if(liveSettlementBlocked(this.db) || exists('obolus_live_order_holds') &&
        this.db.prepare(`SELECT 1 FROM obolus_live_order_holds WHERE ${activeLiveOrderPredicate(this.db)} LIMIT 1`).get())
        throw Error('Unreconciled orders block daily rollover');
      if(!r.observation) throw Error('Previous daily evidence required');
      const previous=JSON.parse(r.observation) as AccountEquityObservation;
      if(!previous || previous.venue!==p.venue || previous.account!==p.account || previous.currency!==p.currency ||
        !time(previous.observedAt) || previous.observedAt<p.startsAt || previous.observedAt>=p.endsAt ||
        !money(previous.equityAfterFeesCents) || previous.equityAfterFeesCents<0 || !money(previous.netExternalFlowCents))
        throw Error('Invalid previous daily evidence');
      const finalLoss=p.openingEquityCents+closing.netExternalFlowCents-closing.equityAfterFeesCents;
      const priorLoss=p.openingEquityCents+previous.netExternalFlowCents-previous.equityAfterFeesCents;
      const next={...p,startsAt:p.endsAt,endsAt:p.endsAt+86_400_000,openingEquityCents:closing.equityAfterFeesCents};
      validate(next);
      this.db.exec(`CREATE TABLE IF NOT EXISTS obolus_daily_loss_windows (
        starts_at INTEGER PRIMARY KEY,policy TEXT NOT NULL,closing TEXT NOT NULL,loss_cents INTEGER NOT NULL,halted INTEGER NOT NULL);
        CREATE TRIGGER IF NOT EXISTS daily_loss_windows_no_update BEFORE UPDATE ON obolus_daily_loss_windows
        BEGIN SELECT RAISE(ABORT,'Daily history immutable'); END;
        CREATE TRIGGER IF NOT EXISTS daily_loss_windows_no_delete BEFORE DELETE ON obolus_daily_loss_windows
        BEGIN SELECT RAISE(ABORT,'Daily history immutable'); END;`);
      const halted=Number(Boolean(r.halted)||finalLoss>=p.maximumLossCents||priorLoss>=p.maximumLossCents);
      this.db.prepare('INSERT INTO obolus_daily_loss_windows VALUES(?,?,?,?,?)')
        .run(p.startsAt,JSON.stringify(p),JSON.stringify(closing),finalLoss,halted);
      this.db.prepare('UPDATE obolus_daily_loss SET policy=?,observation=?,halted=? WHERE id=1')
        .run(JSON.stringify(next),JSON.stringify({...closing,netExternalFlowCents:0}),halted);
    }).immediate();
  }
  observe(input:AccountEquityObservation):void {
    const observation=structuredClone(input),now=this.clock();
    this.db.transaction(()=>{
      const r=this.row(),p=r.policy;
      if(!observation || !time(now) || !time(observation.observedAt) ||
        observation.venue!==p.venue || observation.account!==p.account || observation.currency!==p.currency ||
        !money(observation.equityAfterFeesCents) || observation.equityAfterFeesCents<0 ||
        !money(observation.netExternalFlowCents) || observation.observedAt<p.startsAt ||
        observation.observedAt>=p.endsAt || observation.observedAt>now ||
        now-observation.observedAt>p.maximumAgeMs || now>=p.endsAt) throw Error('Invalid or stale account equity observation');
      const payload=JSON.stringify(observation);
      if(r.observation) {
        const previous=JSON.parse(r.observation) as AccountEquityObservation;
        if(!previous || previous.venue!==p.venue || previous.account!==p.account || previous.currency!==p.currency ||
          !time(previous.observedAt) || previous.observedAt<p.startsAt || previous.observedAt>=p.endsAt ||
          !money(previous.equityAfterFeesCents) || previous.equityAfterFeesCents<0 || !money(previous.netExternalFlowCents) ||
          !r.halted && p.openingEquityCents+previous.netExternalFlowCents-previous.equityAfterFeesCents>=p.maximumLossCents)
          throw Error('Invalid persisted account equity; reconciliation required');
        if(observation.observedAt<previous.observedAt ||
          observation.observedAt===previous.observedAt && payload!==r.observation) throw Error('Regressive or conflicting account equity');
        if(payload===r.observation)return;
      }
      const loss=p.openingEquityCents+observation.netExternalFlowCents-observation.equityAfterFeesCents;
      this.db.prepare('UPDATE obolus_daily_loss SET observation=?,halted=CASE WHEN halted=1 OR ? THEN 1 ELSE 0 END WHERE id=1')
        .run(payload,Number(loss>=p.maximumLossCents));
      this.db.prepare('INSERT INTO obolus_daily_loss_audit(at,observation,loss_cents) VALUES(?,?,?)').run(now,payload,loss);
    }).immediate();
  }
  /** Admission-only. Additional risk must include all pending order risk, fees
   * and the proposed order. It is not an atomic order reservation by itself. */
  assertCanIncreaseRisk(additionalRiskCents:number, expected?:{venue:string;account:string;currency:string}):void {
    this.db.transaction(()=>{
      const r=this.row(),p=r.policy,now=this.clock();
      if(this.refreshBlocked())throw Error('Account equity refresh unresolved');
      if(expected && (expected.venue!==p.venue || expected.account!==p.account || expected.currency!==p.currency))
        throw Error('Daily loss venue, account or currency mismatch');
      if(!time(now) || !money(additionalRiskCents) || additionalRiskCents<0 || r.halted ||
        !r.observation || now<p.startsAt || now>=p.endsAt) throw Error('Daily loss admission blocked');
      const o=JSON.parse(r.observation) as AccountEquityObservation;
      if(!o || o.venue!==p.venue || o.account!==p.account || o.currency!==p.currency ||
        !time(o.observedAt) || o.observedAt<p.startsAt || o.observedAt>=p.endsAt ||
        !money(o.equityAfterFeesCents) || o.equityAfterFeesCents<0 || !money(o.netExternalFlowCents))
        throw Error('Invalid persisted account equity');
      if(o.observedAt>now || now-o.observedAt>p.maximumAgeMs) throw Error('Fresh account equity required');
      const loss=Math.max(0,p.openingEquityCents+o.netExternalFlowCents-o.equityAfterFeesCents);
      if(loss+additionalRiskCents>=p.maximumLossCents) throw Error('Daily loss headroom exhausted');
    })();
  }
}
