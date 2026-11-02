import {it,expect} from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {LiveDailyLossMonitor,type DailyLossPolicy} from '../revenue/live-daily-loss.js';
const policy:DailyLossPolicy={venue:'fixture',account:'account1',currency:'USD',startsAt:1000,endsAt:86401000,
  openingEquityCents:10000,maximumLossCents:200,maximumAgeMs:1000};
const observation={venue:'fixture',account:'account1',currency:'USD',observedAt:1100,equityAfterFeesCents:10000,netExternalFlowCents:0};
it.each([null,{}, {...observation,account:'other'}, {...observation,equityAfterFeesCents:null},
 {...observation,observedAt:999}, {...observation,netExternalFlowCents:null},
 {...observation,equityAfterFeesCents:9800}])('does not conceal corrupt prior evidence with a fresh observation: %j', prior=>{
 const db=new Database(':memory:');const m=new LiveDailyLossMonitor(db,()=>1200);
 try{m.configure(policy);m.observe(observation);
 db.prepare('UPDATE obolus_daily_loss SET observation=?').run(JSON.stringify(prior));
 const before=db.serialize();
 expect(()=>m.observe({...observation,observedAt:1200,equityAfterFeesCents:11000})).toThrow('reconciliation required');
 expect(db.serialize()).toEqual(before);
 }finally{db.close();}
});
it('rolls one reviewed boundary forward, archives old flows and never repeats the transition',()=>{
 const db=new Database(':memory:');let now=1100;const m=new LiveDailyLossMonitor(db,()=>now);
 try{m.configure(policy);m.observe(observation);now=policy.endsAt;
 const close={...observation,observedAt:now,equityAfterFeesCents:10900,netExternalFlowCents:1000};
 m.rollover(close,`ROLLOVER ${now}`);m.assertCanIncreaseRisk(199);
 const history=db.prepare('SELECT loss_cents,halted FROM obolus_daily_loss_windows').get();
 expect(history).toEqual({loss_cents:100,halted:0});
 expect(()=>m.rollover(close,`ROLLOVER ${now}`)).toThrow();
 expect(()=>db.exec('DELETE FROM obolus_daily_loss_windows')).toThrow('immutable');
 expect(()=>m.assertCanIncreaseRisk(200)).toThrow('headroom');
 }finally{db.close();}
});
it.each([9800,11000])('rollover preserves an earlier stop even after recovery to %s',equity=>{
 const db=new Database(':memory:');let now=1100;const m=new LiveDailyLossMonitor(db,()=>now);
 try{m.configure(policy);m.observe({...observation,equityAfterFeesCents:9800});now=policy.endsAt;
 m.rollover({...observation,observedAt:now,equityAfterFeesCents:equity},`ROLLOVER ${now}`);
 expect(()=>m.assertCanIncreaseRisk(0)).toThrow('blocked');
 }finally{db.close();}
});
it('captures a breach first observed at closing and rejects pending orders and late boundary evidence',()=>{
 const db=new Database(':memory:');let now=1100;const m=new LiveDailyLossMonitor(db,()=>now);
 try{m.configure(policy);m.observe(observation);now=policy.endsAt;
 const close={...observation,observedAt:now,equityAfterFeesCents:9800};
 db.exec("CREATE TABLE obolus_live_order_holds(status TEXT); INSERT INTO obolus_live_order_holds VALUES('unknown')");
 expect(()=>m.rollover(close,`ROLLOVER ${now}`)).toThrow('Unreconciled');
 db.exec('DELETE FROM obolus_live_order_holds');
 now+=1001;expect(()=>m.rollover(close,`ROLLOVER ${policy.endsAt}`)).toThrow('boundary');
 now=policy.endsAt;m.rollover(close,`ROLLOVER ${now}`);
 expect(()=>m.assertCanIncreaseRisk(0)).toThrow('blocked');
 }finally{db.close();}
});
it('rejects clock rollback and corrupted persisted equity without changing stored evidence',()=>{
 const db=new Database(':memory:');let now=1100;const m=new LiveDailyLossMonitor(db,()=>now);
 try{m.configure(policy);m.observe(observation);now=1099;
 expect(()=>m.assertCanIncreaseRisk(1)).toThrow('Fresh');
 now=1100;
 db.prepare('UPDATE obolus_daily_loss SET observation=?').run(JSON.stringify({...observation,equityAfterFeesCents:null}));
 const before=db.serialize();expect(()=>m.assertCanIncreaseRisk(1)).toThrow('Invalid persisted');
 expect(db.serialize()).toEqual(before);
 }finally{db.close();}
});
it('accounts for deposits, withdrawals and marked losses without treating deposits as profit',()=>{
 const db=new Database(':memory:');let now=1100;const m=new LiveDailyLossMonitor(db,()=>now);
 try{m.configure(policy);expect(()=>m.assertCanIncreaseRisk(1)).toThrow();
 m.observe({...observation,equityAfterFeesCents:10900,netExternalFlowCents:1000});
 m.assertCanIncreaseRisk(99);expect(()=>m.assertCanIncreaseRisk(100)).toThrow('headroom');
 now=1200;m.observe({...observation,observedAt:1200,equityAfterFeesCents:9400,netExternalFlowCents:-500});
 m.assertCanIncreaseRisk(99);expect(()=>m.assertCanIncreaseRisk(100)).toThrow('headroom');
 }finally{db.close();}
});
it('persists threshold breach across reopening, gains and repeated configuration; never rolls over automatically',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-loss-')),file=path.join(dir,'fixture.db');let db=new Database(file);
 try{const first=new LiveDailyLossMonitor(db,()=>1100);first.configure(policy);first.observe({...observation,equityAfterFeesCents:9800});db.close();db=new Database(file);
 const restored=new LiveDailyLossMonitor(db,()=>1200);restored.configure(policy);restored.observe({...observation,observedAt:1200,equityAfterFeesCents:11000});
 expect(()=>restored.assertCanIncreaseRisk(0)).toThrow('blocked');
 expect(()=>restored.configure({...policy,startsAt:86401000,endsAt:172801000})).toThrow('immutable');
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('rejects cross-account, stale, future and conflicting evidence and expires at the exact window boundary',()=>{
 const db=new Database(':memory:');let now=1100;const m=new LiveDailyLossMonitor(db,()=>now);
 try{m.configure(policy);
 for(const patch of [{account:'other'},{currency:'CHF'},{observedAt:1101},{equityAfterFeesCents:NaN},{netExternalFlowCents:Infinity}])expect(()=>m.observe({...observation,...patch})).toThrow();
 m.observe(observation);m.observe(observation);
 expect(()=>m.assertCanIncreaseRisk(1,{venue:'other',account:'account1',currency:'USD'})).toThrow('mismatch');
 expect(()=>m.assertCanIncreaseRisk(1,{venue:'fixture',account:'account1',currency:'CHF'})).toThrow('mismatch');
 expect(()=>m.assertCanIncreaseRisk(1,{venue:'fixture',account:'other',currency:'USD'})).toThrow('mismatch');
 expect(db.prepare('SELECT COUNT(*) n FROM obolus_daily_loss_audit').get()).toEqual({n:1});
 expect(()=>m.observe({...observation,equityAfterFeesCents:9999})).toThrow('conflicting');
 now=2101;expect(()=>m.assertCanIncreaseRisk(1)).toThrow('Fresh');
 now=policy.endsAt;expect(()=>m.assertCanIncreaseRisk(1)).toThrow('blocked');
 }finally{db.close();}
});
