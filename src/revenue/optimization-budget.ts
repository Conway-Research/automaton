import type {Database} from 'better-sqlite3';
import {createHash} from 'node:crypto';
/** A second, trial-local ceiling; never substitutes for shared router/capital reservations. */
export function reserveOptimizationBudget(db:Database,trialId:string,sessionId:string,estimateCents:number){
 if(!db.inTransaction)throw Error('Optimization reservation requires an enclosing write transaction');
 if(!Number.isSafeInteger(estimateCents)||estimateCents<0)throw Error('Invalid optimization reservation');
 const row=db.prepare('SELECT payload,digest FROM obolus_optimization_trials WHERE id=?').get(trialId) as {payload:string;digest:string}|undefined;
 if(!row||row.digest!==trialId||createHash('sha256').update(row.payload).digest('hex')!==trialId)throw Error('Intact optimization manifest required');
 const manifest=JSON.parse(row.payload),ceiling=manifest.maxInferenceCostCents;
 if(!Number.isSafeInteger(ceiling)||ceiling<1||ceiling>1000000)throw Error('Preregister a trial cost ceiling before automatic collection');
 db.exec(`CREATE TABLE IF NOT EXISTS obolus_optimization_budget_holds(session_id TEXT PRIMARY KEY,trial_id TEXT NOT NULL,reserved_cents INTEGER NOT NULL,actual_cents INTEGER);
  CREATE TRIGGER IF NOT EXISTS optimization_hold_no_delete BEFORE DELETE ON obolus_optimization_budget_holds BEGIN SELECT RAISE(ABORT,'Optimization hold immutable'); END;
  CREATE TRIGGER IF NOT EXISTS optimization_hold_binding BEFORE UPDATE ON obolus_optimization_budget_holds WHEN NEW.session_id!=OLD.session_id OR NEW.trial_id!=OLD.trial_id OR NEW.reserved_cents!=OLD.reserved_cents OR OLD.actual_cents IS NOT NULL BEGIN SELECT RAISE(ABORT,'Optimization hold immutable'); END;`);
 for(const item of manifest.cases)for(const side of ['baseline','candidate']){
  const session='opt-'+createHash('sha256').update(JSON.stringify([trialId,item.id,side])).digest('hex').slice(0,40);
  if(!db.prepare('SELECT 1 FROM obolus_optimization_budget_holds WHERE session_id=? AND trial_id=?').get(session,trialId)&&
   (db.prepare('SELECT 1 FROM inference_costs WHERE session_id=? LIMIT 1').get(session)||db.prepare('SELECT 1 FROM inference_reservations WHERE session_id=? LIMIT 1').get(session)))
    throw Error('Unreserved trial accounting requires reconciliation');
 }
 const holds=db.prepare('SELECT session_id,reserved_cents,actual_cents FROM obolus_optimization_budget_holds WHERE trial_id=? LIMIT 201').all(trialId) as {session_id:string;reserved_cents:number;actual_cents:number|null}[];
 if(holds.length>=200)throw Error('Optimization hold limit reached');
 let committed=0;
 for(const hold of holds){
  if(!Number.isSafeInteger(hold.reserved_cents)||hold.reserved_cents<0)throw Error('Invalid optimization accounting');
  const observed=db.prepare('SELECT cost_cents FROM inference_costs WHERE session_id=? LIMIT 2').all(hold.session_id) as {cost_cents:number}[];
  if(observed.length>1||observed.some(c=>!Number.isSafeInteger(c.cost_cents)||c.cost_cents<0))throw Error('Optimization accounting requires reconciliation');
  const notExecuted=hold.actual_cents===0&&!!db.prepare("SELECT 1 FROM obolus_optimization_attempts WHERE session_id=? AND status='not_executed' AND result_digest IS NULL").get(hold.session_id);
  if(notExecuted){
   if(observed.length||db.prepare('SELECT 1 FROM inference_reservations WHERE session_id=? LIMIT 1').get(hold.session_id))throw Error('Non-execution evidence conflicts with accounting');
  }else if(hold.actual_cents!==null&&(observed.length!==1||observed[0].cost_cents!==hold.actual_cents||
   db.prepare("SELECT 1 FROM inference_reservations WHERE session_id=? AND status='pending'").get(hold.session_id)))throw Error('Settled optimization accounting changed');
  const cost=hold.actual_cents??Math.max(hold.reserved_cents,observed[0]?.cost_cents??0);
  if(!Number.isSafeInteger(cost)||cost<0)throw Error('Invalid optimization accounting');committed+=cost;
  if(!Number.isSafeInteger(committed))throw Error('Invalid optimization accounting');
 }
 if(committed+estimateCents>ceiling)throw Error('Optimization trial cost ceiling exceeded');
 db.prepare('INSERT INTO obolus_optimization_budget_holds(session_id,trial_id,reserved_cents) VALUES(?,?,?)').run(sessionId,trialId,estimateCents);
}
/** Trusted runner only: its closed provider boundary must prove no invocation occurred.
 * Empty accounting by itself is insufficient evidence, especially after a crash. */
export function releaseUnexecutedOptimizationBudget(db:Database,sessionId:string){
 if(!db.inTransaction)throw Error('Non-execution release requires an enclosing write transaction');
 if(db.prepare('SELECT 1 FROM inference_costs WHERE session_id=? LIMIT 1').get(sessionId)||
  db.prepare('SELECT 1 FROM inference_reservations WHERE session_id=? LIMIT 1').get(sessionId))throw Error('Non-execution conflicts with inference evidence');
 const attempt=db.prepare("UPDATE obolus_optimization_attempts SET status='not_executed' WHERE session_id=? AND status='claimed' AND result_digest IS NULL").run(sessionId);
 if(attempt.changes!==1)throw Error('Unambiguous active claim required');
 const hold=db.prepare('UPDATE obolus_optimization_budget_holds SET actual_cents=0 WHERE session_id=? AND actual_cents IS NULL').run(sessionId);
 if(hold.changes!==1)throw Error('Unsettled optimization hold required');
}
/** Caller must settle in the same IMMEDIATE transaction as the result receipt. */
export function settleOptimizationBudget(db:Database,sessionId:string){
 if(!db.inTransaction)throw Error('Optimization settlement requires an enclosing write transaction');
 if(db.prepare("SELECT 1 FROM inference_reservations WHERE session_id=? AND status='pending'").get(sessionId))throw Error('Optimization cost unresolved');
 const rows=db.prepare('SELECT cost_cents FROM inference_costs WHERE session_id=? LIMIT 2').all(sessionId) as {cost_cents:number}[];
 if(rows.length!==1||!Number.isSafeInteger(rows[0].cost_cents)||rows[0].cost_cents<0)throw Error('Exact settled optimization cost required');
 const changed=db.prepare('UPDATE obolus_optimization_budget_holds SET actual_cents=? WHERE session_id=? AND actual_cents IS NULL').run(rows[0].cost_cents,sessionId);
 if(changed.changes!==1)throw Error('Optimization reservation absent or already settled');
}
