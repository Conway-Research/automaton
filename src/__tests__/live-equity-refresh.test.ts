import {it,expect,vi} from 'vitest';
import Database from 'better-sqlite3';
import {LiveDailyLossMonitor,type AccountEquityObservation} from '../revenue/live-daily-loss.js';
const policy={venue:'fixture',account:'account1',currency:'USD',startsAt:1000,endsAt:86401000,
 openingEquityCents:10000,maximumLossCents:200,maximumAgeMs:1000};
const observation={venue:'fixture',account:'account1',currency:'USD',observedAt:1100,equityAfterFeesCents:10000,netExternalFlowCents:0};
function setup(){const db=new Database(':memory:');const monitor=new LiveDailyLossMonitor(db,()=>1200);
 monitor.configure(policy);monitor.observe(observation);return {db,monitor};}
function deferred(){let resolve!:(o:AccountEquityObservation)=>void;let reject!:(e:Error)=>void;
 const promise=new Promise<AccountEquityObservation>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
it('blocks during refresh and after failure, including a new monitor and direct observation',async()=>{
 const {db,monitor}=setup();const request=deferred();
 try{const result=monitor.refresh({readAccountEquity:()=>request.promise});
 expect(()=>monitor.assertCanIncreaseRisk(1)).toThrow('unresolved');
 const rejected=expect(result).rejects.toThrow('provider offline');request.reject(Error('provider offline'));await rejected;
 monitor.observe({...observation,observedAt:1200});
 expect(()=>new LiveDailyLossMonitor(db,()=>1200).assertCanIncreaseRisk(1)).toThrow('unresolved');
 await monitor.refresh({readAccountEquity:async(scope,signal)=>{
 expect(scope).toEqual(policy);expect(Object.isFrozen(scope)).toBe(true);expect(signal.aborted).toBe(false);
 return {...observation,observedAt:1200};}});
 monitor.assertCanIncreaseRisk(1);
 }finally{db.close();}
});
it('does not permit a late older response to overwrite a newer valuation',async()=>{
 const {db,monitor}=setup();const old=deferred();
 try{const earlier=monitor.refresh({readAccountEquity:()=>old.promise});
 await monitor.refresh({readAccountEquity:async()=>({...observation,observedAt:1200,equityAfterFeesCents:9900})});
 const rejected=expect(earlier).rejects.toThrow('superseded');old.resolve({...observation,observedAt:1200});await rejected;
 expect(()=>monitor.assertCanIncreaseRisk(100)).toThrow('headroom');monitor.assertCanIncreaseRisk(99);
 }finally{db.close();}
});
it('does not clear a newer failed refresh with an older successful response',async()=>{
 const {db,monitor}=setup();const old=deferred();
 try{const earlier=monitor.refresh({readAccountEquity:()=>old.promise});
 await expect(monitor.refresh({readAccountEquity:async()=>{throw Error('offline');}})).rejects.toThrow('offline');
 const rejected=expect(earlier).rejects.toThrow('superseded');old.resolve(observation);await rejected;
 expect(()=>monitor.assertCanIncreaseRisk(1)).toThrow('unresolved');
 }finally{db.close();}
});
it.each([{account:'wrong'},{currency:'CHF'},{observedAt:1201},{observedAt:0},{equityAfterFeesCents:NaN}])(
 'keeps the last evidence but blocks admission after invalid provider evidence %j',async patch=>{
 const {db,monitor}=setup();
 try{const before=db.prepare('SELECT observation FROM obolus_daily_loss').get();
 await expect(monitor.refresh({readAccountEquity:async()=>({...observation,...patch})})).rejects.toThrow();
 expect(db.prepare('SELECT observation FROM obolus_daily_loss').get()).toEqual(before);
 expect(()=>monitor.assertCanIncreaseRisk(1)).toThrow('unresolved');
 }finally{db.close();}
});
it('aborts on timeout and never consumes a response arriving afterwards',async()=>{
 vi.useFakeTimers();const {db,monitor}=setup();const request=deferred();let signal:AbortSignal|undefined;
 try{const result=monitor.refresh({readAccountEquity:async(_scope,s)=>{signal=s;return request.promise;}});
 const rejected=expect(result).rejects.toThrow('timeout');await vi.advanceTimersByTimeAsync(15000);await rejected;
 expect(signal?.aborted).toBe(true);request.resolve({...observation,observedAt:1200});await Promise.resolve();
 expect(()=>monitor.assertCanIncreaseRisk(1)).toThrow('unresolved');
 expect(db.prepare('SELECT COUNT(*) n FROM obolus_daily_loss_audit').get()).toEqual({n:1});
 }finally{db.close();vi.useRealTimers();}
});
it('preserves a loss stop after a successful refresh and recovery',async()=>{
 const {db,monitor}=setup();
 try{await monitor.refresh({readAccountEquity:async()=>({...observation,equityAfterFeesCents:9800,observedAt:1150})});
 await monitor.refresh({readAccountEquity:async()=>({...observation,observedAt:1200})});
 expect(()=>monitor.assertCanIncreaseRisk(0)).toThrow('blocked');
 }finally{db.close();}
});
it('blocks rollover after a synchronous reader failure and retains the old window',async()=>{
 const {db,monitor}=setup();
 try{await expect(monitor.refresh({readAccountEquity:()=>{throw Error('reader failed');}})).rejects.toThrow('reader failed');
 const boundary=new LiveDailyLossMonitor(db,()=>policy.endsAt);
 expect(()=>boundary.rollover({...observation,observedAt:policy.endsAt},`ROLLOVER ${policy.endsAt}`)).toThrow('unresolved');
 const stored=db.prepare('SELECT policy FROM obolus_daily_loss').get() as {policy:string};
 expect(JSON.parse(stored.policy)).toEqual(policy);
 }finally{db.close();}
});
