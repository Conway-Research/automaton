import {it,expect} from 'vitest';
import {normalizeEcbReference,evaluateReferenceTrial,referenceVariants} from '../revenue/long-history/reference.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {openHistoryStore} from '../revenue/long-history/store.js';
import {openHistoryRunner} from '../revenue/long-history/runner.js';
import {researchWorker} from '../revenue/long-history/worker-client.js';
const xml=(rows:string)=>Buffer.from(`<gesmes:Envelope xmlns:gesmes="x"><Cube>${rows}</Cube></gesmes:Envelope>`);
it('reads actual USD-per-EUR reference observations, sorts descending publication and never invents OHLC',()=>{
 const s=normalizeEcbReference(xml(`<Cube time='2020-01-03'><Cube currency='USD' rate='1.1234'/></Cube><Cube time='2020-01-02'><Cube currency='CHF' rate='1.1'/><Cube currency='USD' rate='1.12'/></Cube>`));
 expect(s.rows.map(x=>x.rate)).toEqual([1.12,1.1234]);expect(s.kind).toBe('reference-rates');expect(s).not.toHaveProperty('bars');
});
it('fails closed on duplicate dates, impossible dates, duplicate USD values, missing/invalid rates and XML entities',()=>{
 for(const body of ["<Cube time='2020-02-30'><Cube currency='USD' rate='1'/></Cube>","<Cube time='2020-01-01'><Cube currency='USD' rate='0'/></Cube>","<Cube time='2020-01-01'><Cube currency='CHF' rate='1'/></Cube>","<Cube time='2020-01-01'><Cube currency='USD' rate='1'/><Cube currency='USD' rate='2'/></Cube>","<Cube time='2020-01-01'><Cube currency='USD' rate='1'/></Cube>".repeat(2)])expect(()=>normalizeEcbReference(xml(body))).toThrow();
 expect(()=>normalizeEcbReference(Buffer.from('<!DOCTYPE x><Cube/>'))).toThrow();
});
const series=()=>({kind:'reference-rates' as const,rows:Array.from({length:650},(_,i)=>({date:Date.UTC(2020,0,1)+i*86400000,rate:1+i*.0001+Math.sin(i/7)*.01})),symbol:'EURUSD',currency:'USD' as const,limitations:['synthetic test fixture']});
it('keeps future observations out of an evaluation, uses lagged signals and never grants trading permission',()=>{
 const s=series(),registration={id:'test',datasetId:'fixture',start:s.rows[0].date,end:s.rows[299].date,seed:42,variantIds:referenceVariants()};
 const a=evaluateReferenceTrial(s,registration,'reference-trend-10');
 const b=evaluateReferenceTrial({...s,rows:s.rows.map((r,i)=>i>299?{...r,rate:99}:r)},registration,'reference-trend-10');
 expect(a).toEqual(b);expect(a.metrics.signalLagObservations).toBe(2);expect(a.kind).toBe('reference-simulation');expect(a.liveAuthorized).toBe(false);expect(a.decision).not.toBe('für Paper-Vorwärtstest geeignet');expect(a.metrics.stressNetPnlCents).toBeLessThanOrEqual(Number(a.metrics.netPnlCents));
 expect(()=>evaluateReferenceTrial(s,registration,'momentum-10')).toThrow();
});
it('runs all registered variants and phases through the real bounded worker with fake downloads and a temporary database',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'numaron-reference-')),store=openHistoryStore(directory);
 const bytes=xml(series().rows.map(row=>`<Cube time='${new Date(row.date).toISOString().slice(0,10)}'><Cube currency='USD' rate='${row.rate}'/></Cube>`).reverse().join(''));
 let downloads=0;const runner=openHistoryRunner({store,download:async source=>{expect(source.id).toBe('ecb-eurusd-reference');downloads++;return {bytes,url:source.urls[0],sha256:createHash('sha256').update(bytes).digest('hex')};}});
 try{
  runner.control('resume');await runner.tick({sourceId:'ecb-eurusd-reference'});
  const reports=store.listReports(50);expect(reports).toHaveLength(12);expect(reports.every(r=>r.kind==='reference-simulation'&&r.liveAuthorized===false&&r.costStatus==='model')).toBe(true);
  expect(new Set(reports.map(r=>r.metrics.phase))).toEqual(new Set(['development','validation','final']));expect(reports.every(r=>Number(r.metrics.periodObservations)>=100&&r.metrics.signalLagObservations===2)).toBe(true);
  expect(store.snapshot().counts.trials).toBe(4);expect(store.snapshot().counts.phaseOutcomes).toBe(12);expect(downloads).toBe(1);
  await runner.tick({sourceId:'ecb-eurusd-reference'});expect(downloads).toBe(1);expect(store.listReports(50)).toHaveLength(12);
  expect(runner.sources().find(s=>s.id==='jst')?.status).toBe('restricted');expect(runner.sources().find(s=>s.id==='french-daily')?.status).toBe('pending');
 }finally{await runner.close();store.close();expect(resolve(directory).startsWith(resolve(tmpdir())+sep)).toBe(true);rmSync(directory,{recursive:true,force:true});}
},30000);
it('the reference worker honours an already aborted request without running calculations',async()=>{
 const abort=new AbortController();abort.abort();await expect(researchWorker({kind:'reference'},abort.signal)).rejects.toThrow(/abgebrochen/);
});
