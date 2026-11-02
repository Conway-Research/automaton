import {createHash} from 'node:crypto';
import type {Database} from 'better-sqlite3';
import {optimizationTrialRecipe} from './optimization-trials.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function event(db:Database,eventId:string){
 const row=db.prepare('SELECT id,event_type,category,amount_cents,currency,experiment_id,opportunity_id,occurred_at FROM economic_events WHERE id=?').get(eventId) as
  {id:string;event_type:string;category:string|null;amount_cents:number;currency:string;experiment_id:string|null;opportunity_id:string|null;occurred_at:string}|undefined;
 if(!row||row.event_type!=='cost'||row.currency!=='USD'||!Number.isSafeInteger(row.amount_cents)||row.amount_cents<0||
  !row.category||!/^[A-Za-z0-9_-]{1,80}$/.test(row.category)||/inference|token|model/i.test(row.category))throw Error('Explicit non-inference USD cost event required');
 return {row,digest:hash(JSON.stringify(row))};
}
/** Attribution only. Does not create expenses, authorize spending, or authenticate receipts. */
export function bindOptimizationCost(db:Database,input:{trialId:string;eventId:string}){
 if(!input||typeof input.trialId!=='string'||!/^[a-f0-9]{64}$/.test(input.trialId)||typeof input.eventId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.eventId))throw Error('Bounded cost attribution required');
 return db.transaction(()=>{
  optimizationTrialRecipe(db,input.trialId,'baseline');const observed=event(db,input.eventId);
  db.exec(`CREATE TABLE IF NOT EXISTS obolus_optimization_extra_costs(event_id TEXT PRIMARY KEY,trial_id TEXT NOT NULL,event_digest TEXT NOT NULL);
   CREATE TRIGGER IF NOT EXISTS optimization_extra_cost_no_update BEFORE UPDATE ON obolus_optimization_extra_costs BEGIN SELECT RAISE(ABORT,'Cost attribution immutable'); END;
   CREATE TRIGGER IF NOT EXISTS optimization_extra_cost_no_delete BEFORE DELETE ON obolus_optimization_extra_costs BEGIN SELECT RAISE(ABORT,'Cost attribution immutable'); END;`);
  const old=db.prepare('SELECT trial_id,event_digest FROM obolus_optimization_extra_costs WHERE event_id=?').get(input.eventId) as {trial_id:string;event_digest:string}|undefined;
  if(old){if(old.trial_id!==input.trialId||old.event_digest!==observed.digest)throw Error('Cost already attributed or changed');return {duplicate:true};}
  if((db.prepare('SELECT COUNT(*) n FROM obolus_optimization_extra_costs WHERE trial_id=?').get(input.trialId) as {n:number}).n>=100)throw Error('Additional cost attribution limit reached');
  db.prepare('INSERT INTO obolus_optimization_extra_costs VALUES(?,?,?)').run(input.eventId,input.trialId,observed.digest);return {duplicate:false};
 }).immediate();
}
export function optimizationOverhead(db:Database,trialIds:string[]){
 if(trialIds.length<1||trialIds.length>2||new Set(trialIds).size!==trialIds.length)throw Error('Bounded distinct trial chain required');
 return db.transaction(()=>{
  const entries:{eventId:string;trialId:string;digest:string;costCents:number}[]=[];let total=0;
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_optimization_extra_costs'").get())for(const trialId of trialIds){
   const rows=db.prepare('SELECT event_id,event_digest FROM obolus_optimization_extra_costs WHERE trial_id=? ORDER BY event_id LIMIT 101').all(trialId) as {event_id:string;event_digest:string}[];
   if(rows.length>100)throw Error('Additional cost sample exceeds limit');
   for(const row of rows){const current=event(db,row.event_id);if(current.digest!==row.event_digest)throw Error('Attributed optimization cost changed; reconciliation required');
    total+=current.row.amount_cents;if(!Number.isSafeInteger(total))throw Error('Unsafe overhead total');
    entries.push({eventId:row.event_id,trialId,digest:row.event_digest,costCents:current.row.amount_cents});
   }
  }
  return {recordedCostCents:total,eventCount:entries.length,digest:hash(JSON.stringify(entries)),
   source:'attributed_local_economic_events',limitation:'Rechecks immutable attribution and current local cost records. Does not independently authenticate receipts, completeness, attribution accuracy, or absence of duplicate real-world expenses under different event IDs.'};
 })();
}
