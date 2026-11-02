import {it,expect} from 'vitest';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {openHistoryStore} from '../revenue/long-history/store.js';import {sourceCatalogue} from '../revenue/long-history/sources.js';import {openHistoryRunner} from '../revenue/long-history/runner.js';
const series={kind:'macro' as const,rows:[{date:Date.UTC(1946,9,31),annualRatePercent:1},{date:Date.UTC(2026,8,30),annualRatePercent:4}],field:'fixture',currency:'USD',limitations:['fixture']};
const raw=Buffer.from('fixture'),sha256=createHash('sha256').update(raw).digest('hex');
it('clears expired-round diagnostics on a fresh start without resetting a paused round',async()=>{
 const d=mkdtempSync(join(tmpdir(),'history-fresh-round-')),s=openHistoryStore(d);let now=Date.UTC(2026,9,18);
 const r=openHistoryRunner({store:s,clock:()=>now,download:async()=>{throw Error('fixture only');}});
 try{r.control('resume');r.control('pause');now+=6*60*60*1000;r.control('resume');await r.tick();expect(r.snapshot().blockers.join(' ')).toMatch(/Zeitbudget/);
 r.control('stop');r.control('resume');expect(r.snapshot().blockers.join(' ')).not.toMatch(/Zeitbudget/);expect(r.snapshot().status).toBe('running');
 }finally{await r.close();s.close();rmSync(d,{recursive:true,force:true});}
});
it('persists pause/stop and deduplicates work across reopen',async()=>{
 const d=mkdtempSync(join(tmpdir(),'history-runner-'));let s=openHistoryStore(d);for(const source of sourceCatalogue())s.registerSource(source);let calls=0;
 let r=openHistoryRunner({store:s,download:async()=>{calls++;return {bytes:raw,sha256,url:'https://www.federalreserve.gov/fixture'};},normalize:()=>series,knowledge:{version:14}});
 try{expect(r.snapshot().status).toBe('paused');r.control('resume');await Promise.all([r.tick({sourceId:'fed-h15'}),r.tick({sourceId:'fed-h15'})]);expect(calls).toBe(1);expect(s.snapshot().counts.datasets).toBe(1);expect(s.snapshot().counts.reports).toBeGreaterThan(0);r.control('pause');expect(r.snapshot().status).toBe('paused');await r.close();s.close();
  s=openHistoryStore(d);r=openHistoryRunner({store:s,download:async()=>{calls++;return {bytes:raw,sha256,url:'https://www.federalreserve.gov/fixture'};},normalize:()=>series});expect(r.snapshot().status).toBe('paused');r.control('resume');await r.tick({sourceId:'fed-h15'});expect(calls).toBe(1);r.control('stop');expect(r.snapshot().status).toBe('stopped');expect(()=>r.control('trade')).toThrow();
 }finally{await r.close();s.close();rmSync(d,{recursive:true,force:true});}
});
it('rejects a second worker and discards output that arrives after stop',async()=>{
 const d=mkdtempSync(join(tmpdir(),'history-runner-'));const s=openHistoryStore(d);for(const source of sourceCatalogue())s.registerSource(source);let release!:(x:any)=>void;
 const a=openHistoryRunner({store:s,download:()=>new Promise(resolve=>release=resolve),normalize:()=>series}),b=openHistoryRunner({store:s,download:async()=>{throw Error('second worker');},normalize:()=>series});
 try{a.control('resume');const pending=a.tick();await new Promise(resolve=>setTimeout(resolve,10));await b.tick();expect(s.snapshot().counts.datasets).toBe(0);a.control('stop');release({bytes:raw,sha256,url:'https://www.federalreserve.gov/fixture'});await pending;expect(s.snapshot().counts.datasets).toBe(0);expect(a.snapshot().status).toBe('stopped');}
 finally{await a.close();await b.close();s.close();rmSync(d,{recursive:true,force:true});}
});
it('keeps the six-hour round budget across pause and resume',async()=>{
 const d=mkdtempSync(join(tmpdir(),'history-runner-')),s=openHistoryStore(d);let now=Date.UTC(2026,9,14),calls=0;const r=openHistoryRunner({store:s,clock:()=>now,download:async()=>{calls++;throw Error('unexpected');}});
 try{r.control('resume');r.control('pause');now+=6*60*60*1000;r.control('resume');await r.tick();expect(calls).toBe(0);expect(r.snapshot().blockers.join(' ')).toMatch(/Zeitbudget/);}finally{await r.close();s.close();rmSync(d,{recursive:true,force:true});}
});
it('preserves phase outcomes and marks a resumed final claim as already known',async()=>{
 const d=mkdtempSync(join(tmpdir(),'history-restart-')),s=openHistoryStore(d),start=Date.UTC(2020,0,1);
 const cash={kind:'cash-ohlc' as const,bars:Array.from({length:600},(_,i)=>({time:start+i*86400000,open:10000,high:10100,low:9900,close:10000})),symbol:'FIXTURE',currency:'USD' as const,productEvidence:'test only',adjustmentEvidence:'test only',limitations:['fixture']};
 s.registerSource({id:'cash-fixture',label:'test',kind:'cash-ohlc',urls:['https://example.com/data'],allowedHosts:['example.com'],licenseStatus:'allowed',licenseEvidence:'fixture',reviewedAt:'2026-10-14'});
 let calls=0,interrupt=true;let r:any;const evaluate=async(data:any)=>{
  if(data.kind==='family')return data.reports;
  calls++;if(interrupt&&calls===3){r.control('stop');throw Error('test interrupted');}
  return {id:createHash('sha256').update(data.variantId+'|'+data.registration.start).digest('hex'),runId:data.registration.id,datasetId:data.registration.datasetId,kind:'cash-paper',nativeCurrency:'USD',costStatus:'model',metrics:{variantId:data.variantId,netPnlCents:-1,stressNetPnlCents:-2,trades:1,maximumDrawdownUpperBoundFraction:.01},limitations:['fixture'],decision:'verworfen',evidenceHashes:[],liveAuthorized:false};
 };
 r=openHistoryRunner({store:s,download:async()=>({bytes:raw,sha256,url:'https://example.com/data'}),normalize:()=>cash,evaluate});
 try{r.control('resume');await r.tick({sourceId:'cash-fixture'});expect(s.snapshot().counts.phaseOutcomes).toBeGreaterThanOrEqual(2);interrupt=false;r.control('resume');await r.tick({sourceId:'cash-fixture'});const finals=s.listReports(50).filter(x=>x.metrics.phase==='final');expect(finals.some(x=>x.metrics.contaminated===true)).toBe(true);expect(calls).toBe(37);}
 finally{await r.close();s.close();rmSync(d,{recursive:true,force:true});}
});
it('keeps a successful import completed when downstream research has no usable date window',async()=>{
 const d=mkdtempSync(join(tmpdir(),'history-import-')),s=openHistoryStore(d);
 const future={...series,rows:[{date:Date.UTC(2030,0,31),annualRatePercent:1}]};const r=openHistoryRunner({store:s,download:async()=>({bytes:raw,sha256,url:'https://www.federalreserve.gov/fixture'}),normalize:()=>future});
 try{r.control('resume');await r.tick({sourceId:'fed-h15'});expect(s.snapshot().counts.datasets).toBe(1);expect(s.snapshot().counts.failedJobs).toBe(0);expect(r.snapshot().blockers.join(' ')).toMatch(/Zeitraum/);}finally{await r.close();s.close();rmSync(d,{recursive:true,force:true});}
});

it('externally scheduled history requires a real grant, respects parent abort and never starts its own loop',async()=>{const d=mkdtempSync(join(tmpdir(),'history-external-')),s=openHistoryStore(d);let calls=0,allowed=true;const r=openHistoryRunner({store:s,externalScheduling:true,download:async()=>{calls++;allowed=false;return {bytes:raw,sha256,url:'https://www.federalreserve.gov/fixture'};},normalize:()=>series});try{r.control('resume');r.start();await r.tick();expect(calls).toBe(0);await r.tick({controllerGrant:true});expect(calls).toBe(0);await r.tick({controllerGrant:true,signal:new AbortController().signal,assertActive:()=>{if(!allowed)throw Error('parent gate closed');}});expect(calls).toBe(1);expect(s.snapshot().counts.datasets).toBe(0);}finally{await r.close();s.close();rmSync(d,{recursive:true,force:true});}});
