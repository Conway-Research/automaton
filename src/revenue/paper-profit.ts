import type {Database} from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {RevenueStore} from './store.js';
import {COST_CATEGORIES} from './profit-ledger.js';
import {registerProfitSource,reconcileProfit,type ProfitStatement} from './profit-reconciliation.js';
import type {PaperTrade} from './paper-trading.js';
import {assertNoKnownSecrets} from '../observability/redaction.js';
const sources={portfolio:'internal-paper-portfolio-v1',arbitrage:'internal-paper-arbitrage-v1'};
const id=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
const hash=(s:unknown)=>createHash('sha256').update(JSON.stringify(s)).digest('hex');

/** Preregister uncreated paper positions, not past winners. Binds each position
 * once globally in this workspace. No account, broker, network or live mode. */
export function bindPaperProfit(db:Database,experimentId:string,positionIds:string[],comparisonBasis:string,kind:'portfolio'|'arbitrage'='portfolio'){
  if(!['portfolio','arbitrage'].includes(kind)||!id(experimentId)||!id(comparisonBasis)||!Array.isArray(positionIds)||!positionIds.length||positionIds.length>100||
    !positionIds.every(id)||new Set(positionIds).size!==positionIds.length)throw new Error('Invalid paper profit binding');
  assertNoKnownSecrets({experimentId,positionIds,comparisonBasis});
  return db.transaction(()=>{
    const store=new RevenueStore(db),e=store.getExperiment(experimentId),baseline=store.getExperimentBaseline(experimentId);
    if(!e?.startedAt||!baseline)throw new Error('Start the experiment and freeze its forecast before binding paper positions');
    const payload=JSON.stringify({positionIds:[...positionIds].sort(),comparisonBasis,startedAt:e.startedAt,baselineDigest:hash(baseline),...(kind==='arbitrage'?{kind}:{})});
    registerProfitSource(db,sources[kind],'paper');
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_paper_profit_bindings(experiment_id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS obolus_paper_profit_positions(position_id TEXT PRIMARY KEY,experiment_id TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS paper_profit_binding_no_update BEFORE UPDATE ON obolus_paper_profit_bindings BEGIN SELECT RAISE(ABORT,'Paper attribution immutable'); END;
      CREATE TRIGGER IF NOT EXISTS paper_profit_binding_no_delete BEFORE DELETE ON obolus_paper_profit_bindings BEGIN SELECT RAISE(ABORT,'Paper attribution immutable'); END;
      CREATE TRIGGER IF NOT EXISTS paper_profit_position_no_update BEFORE UPDATE ON obolus_paper_profit_positions BEGIN SELECT RAISE(ABORT,'Paper attribution immutable'); END;
      CREATE TRIGGER IF NOT EXISTS paper_profit_position_no_delete BEFORE DELETE ON obolus_paper_profit_positions BEGIN SELECT RAISE(ABORT,'Paper attribution immutable'); END;`);
    const old=db.prepare('SELECT payload FROM obolus_paper_profit_bindings WHERE experiment_id=?').get(experimentId) as {payload:string}|undefined;
    if(old){if(old.payload!==payload)throw new Error('Conflicting paper profit binding');return {duplicate:true};}
    if(e.status!=='running')throw new Error('Bind paper positions during the running experiment before any positions are created');
    const positionTable=kind==='portfolio'?'paper_portfolio_positions':'obolus_arbitrage_paper';
    const positionsExist=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(positionTable);
    for(const positionId of positionIds){
      if(positionsExist&&db.prepare(`SELECT 1 FROM ${positionTable} WHERE id=?`).get(positionId))throw new Error('Preregister before paper position creation');
      db.prepare('INSERT INTO obolus_paper_profit_positions VALUES(?,?)').run(kind==='arbitrage'?`arbitrage:${positionId}`:positionId,experimentId);
    }
    db.prepare('INSERT INTO obolus_paper_profit_bindings VALUES(?,?)').run(experimentId,payload);
    return {duplicate:false};
  }).immediate();
}

/** The only automatically installed settlement adapter is hardwired PAPER.
 * Sale proceeds minus purchase basis and both fees reproduce the simulator's
 * net P/L. Slippage is embedded in fills and must not be deducted twice. Known
 * experiment costs are additional; unknown real costs never become live proof. */
export async function reconcilePaperProfit(db:Database,experimentId:string){
  const original=db.prepare('SELECT payload FROM obolus_paper_profit_bindings WHERE experiment_id=?').get(experimentId) as {payload:string}|undefined;
  if(!original)throw new Error('Paper profit binding required');
  const kind:unknown=JSON.parse(original.payload).kind??'portfolio';
  if(kind!=='portfolio'&&kind!=='arbitrage')throw new Error('Unknown paper accounting kind');
  return reconcileProfit(db,experimentId,{sourceId:sources[kind],readVerifiedStatement:async()=>db.transaction(()=>{
    const row=db.prepare('SELECT payload FROM obolus_paper_profit_bindings WHERE experiment_id=?').get(experimentId) as {payload:string}|undefined;
    if(!row)throw new Error('Paper profit binding required');
    const binding=JSON.parse(row.payload) as {positionIds:string[];comparisonBasis:string;startedAt:string;baselineDigest:string};
    const store=new RevenueStore(db),e=store.getExperiment(experimentId)!;
    if(binding.startedAt!==e.startedAt||binding.baselineDigest!==hash(store.getExperimentBaseline(experimentId)))throw new Error('Paper forecast attribution changed');
    if(row.payload!==original.payload)throw new Error('Paper binding changed during reconciliation');
    if(kind==='portfolio'){
      const control=db.prepare('SELECT limits FROM paper_portfolio_control WHERE id=1').get() as {limits:string}|undefined;
      if(!control||(JSON.parse(control.limits).currency??'USD')!=='USD')throw new Error('Explicit USD paper scope required');
    }
    let revenue=0,purchaseAndFees=0;const evidence:unknown[]=[];
    for(const positionId of binding.positionIds){
      if(kind==='arbitrage'){
        const p=db.prepare('SELECT actual_net_cents,expected_net_cents,report FROM obolus_arbitrage_paper WHERE id=?').get(positionId) as {actual_net_cents:number;expected_net_cents:number;report:string}|undefined;
        const report=p?JSON.parse(p.report):null,s=report?.settlement;
        if(!p||report.mode!=='paper'||report.candidateId!==positionId||report.realizedProfitCents!==0||report.liveExecutionAuthorized!==false||
          !s||s.currency!=='USD'||![s.recordedAt,s.grossProfitCents,s.costsCents,s.failedLegLossCents].every(n=>Number.isSafeInteger(n)&&n>=0)||
          s.recordedAt<Date.parse(e.startedAt!)||s.recordedAt>Date.parse(e.completedAt!)||
          report.expectedNetCents!==p.expected_net_cents||report.paperProfitCents!==p.actual_net_cents||
          s.grossProfitCents-s.costsCents-s.failedLegLossCents!==p.actual_net_cents)throw new Error('Complete consistent preregistered arbitrage paper settlement required');
        revenue+=s.grossProfitCents;purchaseAndFees+=s.costsCents+s.failedLegLossCents;evidence.push({positionId,report});
        continue;
      }
      const p=db.prepare('SELECT status,trade FROM paper_portfolio_positions WHERE id=?').get(positionId) as {status:string;trade:string|null}|undefined;
      if(p?.status!=='closed'||!p.trade)throw new Error('Paper position not closed');
      const trade=JSON.parse(p.trade) as PaperTrade;
      if(trade.mode!=='paper'||![trade.units,trade.entryFillCents,trade.exitFillCents,trade.entryFeeCents,trade.exitFeeCents].every(n=>Number.isSafeInteger(n)&&n>=0)||
        trade.units<1||trade.netPnlCents!==(trade.exitFillCents-trade.entryFillCents)*trade.units-trade.entryFeeCents-trade.exitFeeCents)
        throw new Error('Inconsistent paper fill accounting');
      revenue+=trade.exitFillCents*trade.units;
      purchaseAndFees+=trade.entryFillCents*trade.units+trade.entryFeeCents+trade.exitFeeCents;evidence.push({positionId,trade});
    }
    const costs=Object.fromEntries(COST_CATEGORIES.map(key=>[key,0])) as ProfitStatement['costs'];
    costs.trading=purchaseAndFees;costs.other=store.getForecastVsActual(experimentId)!.actualCostCents;
    return {statementId:`paper_${hash(experimentId)}`,experimentId,mode:'paper' as const,currency:'USD' as const,
      sampleUnitId:hash(kind==='portfolio'?binding.positionIds:[kind,binding.positionIds]),comparisonBasis:binding.comparisonBasis,
      periodStart:Date.parse(e.startedAt!),periodEnd:Date.parse(e.completedAt!),observedAt:Date.now(),
      revenueCents:revenue,costs,cashSettled:true as const,liabilitiesComplete:true as const,evidenceDigest:hash(evidence)};
  })()});
}
