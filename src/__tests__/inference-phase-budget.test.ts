import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {initializeInferencePhase,inferencePhaseSnapshot} from '../inference/phase-budget.js';
import {InferenceRouter} from '../inference/router.js';
import {ModelRegistry} from '../inference/registry.js';
import {InferenceBudgetTracker} from '../inference/budget.js';
import {DEFAULT_MODEL_STRATEGY_CONFIG} from '../inference/types.js';
import {settleInferenceCost} from '../inference/reservations.js';
import {reconcileInferenceCost} from '../inference/reconciliation.js';
import {createHash} from 'node:crypto';
import type {InferenceRequest} from '../types.js';
let dir:string,a:ReturnType<typeof createDatabase>,b:ReturnType<typeof createDatabase>,start:number;
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-phase-'));a=createDatabase(path.join(dir,'test.db'));b=createDatabase(path.join(dir,'test.db'));start=Date.now();});
afterEach(()=>{vi.restoreAllMocks();a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});});
const request:InferenceRequest={messages:[{role:'user',content:'mock research'}],tier:'low_compute',taskType:'agent_turn',sessionId:'s',maxTokens:100};
const response={message:{content:'mock'},usage:{promptTokens:1,completionTokens:1}};
function router(db=a){const registry=new ModelRegistry(db.raw);registry.initialize();registry.upsert({...registry.get('gpt-5-mini')!,costPer1kInput:0,costPer1kOutput:1000});return new InferenceRouter(db.raw,registry,new InferenceBudgetTracker(db.raw,DEFAULT_MODEL_STRATEGY_CONFIG));}
function init(limit=1){initializeInferencePhase(a.raw,{startsAt:start,endsAt:start+14*86400000,limitCents:limit});}
it('two routers share one phase hold; a conflicting call never reaches its provider',async()=>{
 init();let finish!:(v:typeof response)=>void;const provider=vi.fn(()=>new Promise<typeof response>(resolve=>{finish=resolve;}));
 const first=router().route(request,provider);
 const blocked=vi.fn(async()=>response);
 await expect(router(b).route({...request,sessionId:'other'},blocked)).rejects.toThrow('phase total');
 expect(blocked).not.toHaveBeenCalled();expect(inferencePhaseSnapshot(b.raw)?.pendingCents).toBe(1);
 finish(response);await first;
 expect(inferencePhaseSnapshot(b.raw)).toMatchObject({spentCents:1,pendingCents:0});
});
it('phase usage survives restarts, session changes and daily rollover',async()=>{
 init();await router().route(request,async()=>response);
 a.close();a=createDatabase(path.join(dir,'test.db'));
 vi.spyOn(Date,'now').mockReturnValue(start+2*86400000);
 await expect(router().route({...request,sessionId:'new'},async()=>response)).rejects.toThrow('phase total');
 expect(()=>initializeInferencePhase(a.raw,{startsAt:start,endsAt:start+86400000,limitCents:100})).toThrow('already');
});
it('lost response retains hold; manual reconciliation charges exactly once after expiry',async()=>{
 init();await expect(router().route(request,async()=>{throw Error('lost');})).rejects.toThrow('lost');
 const row=a.raw.prepare('SELECT id,model FROM inference_reservations').get() as {id:string;model:string};
 expect(()=>settleInferenceCost(a.raw,row.id,()=>{})).toThrow('actual phase cost');
 vi.spyOn(Date,'now').mockReturnValue(start+15*86400000);
 await expect(router().route(request,async()=>response)).rejects.toThrow('phase inactive');
 const source=Buffer.from('offline mock receipt'),e={reservationId:row.id,receiptId:'mock',model:row.model,provider:'openai',costCents:1,inputTokens:1,outputTokens:1,currency:'USD' as const,sourceSha256:createHash('sha256').update(source).digest('hex'),operator:'test',attested:true as const};
 reconcileInferenceCost(a.raw,e,source);expect(reconcileInferenceCost(a.raw,e,source).duplicate).toBe(true);
 expect(inferencePhaseSnapshot(a.raw)).toMatchObject({spentCents:1,pendingCents:0,halted:1});
});
it('provider overrun is recorded without clipping and blocks further requests',async()=>{
 init();await router().route(request,async()=>({...response,usage:{promptTokens:1,completionTokens:200}}));
 expect(inferencePhaseSnapshot(a.raw)).toMatchObject({spentCents:2,pendingCents:0,halted:1});
 const provider=vi.fn(async()=>response);await router(b).route(request,provider);expect(provider).not.toHaveBeenCalled();
});
it('expiry remains closed after restart and clock rollback',async()=>{
 init();const clock=vi.spyOn(Date,'now').mockReturnValue(start+14*86400000);
 await expect(router().route(request,async()=>response)).rejects.toThrow('phase inactive');
 a.close();a=createDatabase(path.join(dir,'test.db'));clock.mockReturnValue(start+1000);
 await expect(router().route(request,async()=>response)).rejects.toThrow('clock rollback');
});
it('zero cap and missing half of phase schema fail before provider',async()=>{
 init(0);const provider=vi.fn(async()=>response);
 await expect(router().route(request,provider)).rejects.toThrow('phase total');
 a.raw.exec('DROP TABLE inference_phase_charges');
 await expect(router().route(request,provider)).rejects.toThrow('Incomplete');expect(provider).not.toHaveBeenCalled();
});
it('audit failure rolls back charge and preserves reservation',async()=>{
 init();a.raw.exec("CREATE TRIGGER fail_phase_audit BEFORE INSERT ON inference_budget_audit WHEN NEW.action='phase_settle' BEGIN SELECT RAISE(ABORT,'mock audit failure'); END;");
 await expect(router().route(request,async()=>response)).rejects.toThrow('mock audit');
 expect(inferencePhaseSnapshot(a.raw)).toMatchObject({spentCents:0,pendingCents:1});
 expect(a.raw.prepare('SELECT COUNT(*) n FROM inference_costs').get()).toEqual({n:0});
});
it('refuses retroactive phase initialization over previous activity',async()=>{
 await router().route(request,async()=>response);expect(()=>init()).toThrow('Fresh');
 expect(inferencePhaseSnapshot(a.raw)).toBeNull();
});
it('detects a reduced reservation instead of reopening phase headroom',async()=>{
 init();await expect(router().route(request,async()=>{throw Error('lost');})).rejects.toThrow();
 a.raw.prepare('UPDATE inference_reservations SET reserved_cents=0').run();
 const provider=vi.fn(async()=>response);
 await expect(router(b).route(request,provider)).rejects.toThrow('Invalid inference phase accounting');
 expect(provider).not.toHaveBeenCalled();
});
it('retains phase spending even if ordinary cost history is pruned',async()=>{
 init();await router().route(request,async()=>response);
 a.raw.exec('DELETE FROM inference_costs');
 await expect(router(b).route(request,async()=>response)).rejects.toThrow('phase total');
 expect(inferencePhaseSnapshot(b.raw)?.spentCents).toBe(1);
});
it('blocks before phase start and prevents policy or settled-charge rewrites',async()=>{
 initializeInferencePhase(a.raw,{startsAt:start+86400000,endsAt:start+2*86400000,limitCents:1});
 await expect(router().route(request,async()=>response)).rejects.toThrow('clock rollback');
 expect(()=>a.raw.exec('UPDATE inference_phase_budget SET limit_cents=999')).toThrow('Immutable');
 vi.spyOn(Date,'now').mockReturnValue(start+86400000);
 await router().route(request,async()=>response);
 expect(()=>a.raw.exec('UPDATE inference_phase_charges SET actual_cents=0')).toThrow('immutable');
});
