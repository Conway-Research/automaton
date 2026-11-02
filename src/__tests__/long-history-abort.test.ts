import {it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';import {createHash} from 'node:crypto';
import {openHistoryRunner} from '../revenue/long-history/runner.js';import {openHistoryStore} from '../revenue/long-history/store.js';import {sourceCatalogue} from '../revenue/long-history/sources.js';
const raw=Buffer.from('fixture'),sha256=createHash('sha256').update(raw).digest('hex'),series={kind:'macro' as const,rows:[{date:Date.UTC(2020,0,31),annualRatePercent:1}],field:'fixture',currency:'USD',limitations:['fixture']};
const source=sourceCatalogue().find(s=>s.id==='fed-h15')!,jobId=createHash('sha256').update('import|'+source.id+'|'+source.reviewedAt+'|2026-10-19').digest('hex');
function fixture(){const directory=mkdtempSync(join(tmpdir(),'history-abort-fix-'));return {directory,store:openHistoryStore(directory)};}
function clean(directory:string){if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe cleanup');rmSync(directory,{recursive:true,force:true});}
it('renews its own expired lease after a delayed event-loop checkpoint without increasing its TTL or stealing another owner',async()=>{
 const {directory,store}=fixture();let now=Date.UTC(2026,9,19);const runner=openHistoryRunner({store,clock:()=>now,normalize:()=>series,download:async()=>{now+=16000;return {bytes:raw,sha256,url:source.urls[0]};}});
 try{runner.control('resume');const result=await runner.tick({sourceId:source.id,importOnly:true});expect(store.snapshot().counts.datasets).toBe(1);expect(result).toMatchObject({status:'checked'});expect(store.getJob(jobId)?.status).toBe('completed');}finally{await runner.close();store.close();clean(directory);}
});
it('refuses output if another owner acquired the expired lease, and returns a failure instead of checked',async()=>{
 const {directory,store}=fixture();let now=Date.UTC(2026,9,19);const runner=openHistoryRunner({store,clock:()=>now,normalize:()=>series,download:async()=>{now+=16000;expect(store.acquireLease('other-owner',now)).toBe(true);return {bytes:raw,sha256,url:source.urls[0]};}});
 try{runner.control('resume');expect(await runner.tick({sourceId:source.id})).toMatchObject({status:'failed'});expect(store.snapshot().counts.datasets).toBe(0);expect(()=>store.assertLease('other-owner',now)).not.toThrow();expect(store.getJob(jobId)?.status).not.toBe('running');}finally{await runner.close();store.close();clean(directory);}
});
it('keeps a pending download alive when a delayed heartbeat still owns its lease',async()=>{
 vi.useFakeTimers();const {directory,store}=fixture();let now=Date.UTC(2026,9,19),release!:(value:any)=>void,requestSignal!:AbortSignal;
 const runner=openHistoryRunner({store,clock:()=>now,normalize:()=>series,download:async(_source,options)=>{requestSignal=options.signal!;return new Promise(resolve=>release=resolve);}});
 try{runner.control('resume');const pending=runner.tick({sourceId:source.id,importOnly:true});now+=16000;await vi.advanceTimersByTimeAsync(1001);expect(requestSignal.aborted).toBe(false);release({bytes:raw,sha256,url:source.urls[0]});expect(await pending).toMatchObject({status:'checked'});expect(store.getJob(jobId)?.status).toBe('completed');}
 finally{await runner.close();store.close();clean(directory);vi.useRealTimers();}
});
it('closes an aborted import and returns cancelled without fabricating reports; a later granted tick can recover',async()=>{
 const {directory,store}=fixture(),parent=new AbortController();let first=true;const runner=openHistoryRunner({store,clock:()=>Date.UTC(2026,9,19),normalize:()=>series,externalScheduling:true,download:async()=>{if(first){first=false;parent.abort();throw Error('fixture cancellation');}return {bytes:raw,sha256,url:source.urls[0]};}});
 try{runner.control('resume');expect(await runner.tick({sourceId:source.id,controllerGrant:true,signal:parent.signal,assertActive:()=>{}})).toMatchObject({status:'cancelled'});expect(store.getJob(jobId)?.status).toBe('cancelled');expect(store.snapshot().counts.reports).toBe(0);const next=await runner.tick({sourceId:source.id,controllerGrant:true,signal:new AbortController().signal,assertActive:()=>{},importOnly:true});expect(next).toMatchObject({status:'checked'});expect(store.getJob(jobId)?.status).toBe('completed');}finally{await runner.close();store.close();clean(directory);}
});
it('reconciles orphaned running jobs only after owning the exclusive lease',async()=>{
 const {directory,store}=fixture();store.saveJob({id:'orphan-research',status:'running',detail:{datasetId:'old-fixture'}});const runner=openHistoryRunner({store,clock:()=>Date.UTC(2026,9,19),normalize:()=>series,download:async()=>({bytes:raw,sha256,url:source.urls[0]})});
 try{runner.control('resume');await runner.tick({sourceId:source.id,importOnly:true});expect(store.getJob('orphan-research')).toMatchObject({status:'cancelled',detail:{reasonCode:'worker-interrupted'}});}finally{await runner.close();store.close();clean(directory);}
});
it('bounds transient source retries to three existing scheduler ticks and never reports their failures as checked',async()=>{
 const {directory,store}=fixture();let calls=0;const runner=openHistoryRunner({store,clock:()=>Date.UTC(2026,9,19),download:async()=>{calls++;throw Object.assign(Error('Source request timed out'),{code:'source_timeout'});}});
 try{runner.control('resume');for(let i=0;i<4;i++)expect(await runner.tick({sourceId:source.id})).toMatchObject({status:'failed'});expect(calls).toBe(3);expect(store.getJob(jobId)?.status).toBe('failed');expect(store.getJob(jobId)?.detail?.attempt).toBe(3);}finally{await runner.close();store.close();clean(directory);}
});
