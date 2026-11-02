import {afterEach,describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {openHistoryStore} from '../revenue/long-history/store.js';
import {sourceCatalogue} from '../revenue/long-history/sources.js';
const dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
const directory=()=>{const d=mkdtempSync(join(tmpdir(),'numaron-history-'));dirs.push(d);return d;};
const allowed=()=>({...sourceCatalogue()[0],licenseStatus:'allowed' as const,licenseEvidence:'Reviewed exact source permission: local research fixture',reviewedAt:'2026-10-14'});
const dataset=(raw:Buffer,revision='r1')=>({sourceId:allowed().id,rawSha256:createHash('sha256').update(raw).digest('hex'),revision,normalizationVersion:'v1',kind:'factor-returns' as const,start:0,end:1000,frequency:'daily',unit:'decimal',currency:'USD',quality:{valid:true,issues:[]},limitations:[],provenance:'test-fixture'});
describe('long history durable evidence',()=>{
 it('does not relabel factor returns as tradeable cash prices',()=>{
  const s=openHistoryStore(directory());try{s.registerSource(allowed());const raw=Buffer.from('factor fixture');expect(()=>s.putDataset({...dataset(raw),kind:'cash-ohlc'},raw)).toThrow(/kind/i);}finally{s.close();}
 });
 it('refuses a newer database version without rewriting its schema',()=>{
  const d=directory();openHistoryStore(d).close();const db=new Database(join(d,'research.db'));db.pragma('user_version=2');db.close();
  expect(()=>openHistoryStore(d)).toThrow(/version/i);
  const reopened=new Database(join(d,'research.db'));try{expect(reopened.pragma('user_version',{simple:true})).toBe(2);}finally{reopened.close();}
 });
 it('rejects nonfinite evidence instead of silently turning it into null',()=>{
  const s=openHistoryStore(directory());try{expect(()=>s.saveJob({id:'bad',status:'failed',detail:{value:NaN}})).toThrow(/finite/i);}finally{s.close();}
 });
 it('requires exact permission evidence and keeps restricted sources blocked',()=>{
  const s=openHistoryStore(directory());try{
   expect(sourceCatalogue().find(x=>x.id==='jst')?.licenseStatus).toBe('restricted');
   expect(sourceCatalogue()[0].licenseStatus).toBe('pending');
   expect(()=>s.registerSource({...allowed(),licenseEvidence:''})).toThrow(/license/i);
   s.registerSource(sourceCatalogue()[0]);
   const raw=Buffer.from('date,value\n19461014,1');
   expect(()=>s.putDataset(dataset(raw),raw)).toThrow(/allowed/i);
  }finally{s.close();}
 });
 it('deduplicates content, preserves revisions and writes immutable raw bytes',()=>{
  const d=directory(),s=openHistoryStore(d);try{s.registerSource(allowed());
   const a=Buffer.from('a'),b=Buffer.from('b');
   const first=s.putDataset(dataset(a),a);expect(s.putDataset(dataset(a),a).id).toBe(first.id);
   const second=s.putDataset(dataset(b,'r2'),b);expect(second.id).not.toBe(first.id);
   expect(s.getDataset(first.id)?.revision).toBe('r1');
   expect(readFileSync(join(d,'raw',first.rawSha256))).toEqual(a);
   expect(()=>s.putDataset({...dataset(a),rawSha256:'0'.repeat(64)},a)).toThrow(/hash/i);
   expect(s.snapshot().counts.datasets).toBe(2);
  }finally{s.close();}
 });
 it('retains failed jobs and reports across reopen without exposing their payload',()=>{
  const d=directory();let s=openHistoryStore(d);s.registerSource(allowed());
  s.saveJob({id:'job-1',status:'failed',detail:{accountIdentity:'private-account',secret:'private'}});
  const raw=Buffer.from('report fixture'),dataId=s.putDataset(dataset(raw),raw).id;
  s.saveReport({id:'report-1',runId:'run-1',datasetId:dataId,kind:'history',nativeCurrency:'USD',costStatus:'unknown',metrics:{return:.1},limitations:['fixture'],decision:'weiter untersuchen',evidenceHashes:[],liveAuthorized:false});s.close();
  s=openHistoryStore(d);try{expect(s.getJob('job-1')?.status).toBe('failed');expect(s.getReport('report-1')?.liveAuthorized).toBe(false);expect(JSON.stringify(s.snapshot())).not.toContain('private');}finally{s.close();}
 });
 it('rejects traversal, mutable evidence and live authorization',()=>{
  const s=openHistoryStore(directory());try{
   expect(()=>s.getReport('../secret')).toThrow(/id/i);
   expect(()=>s.saveJob({id:'../job',status:'queued'})).toThrow(/id/i);
   s.registerSource(allowed());const raw=Buffer.from('immutable fixture'),dataId=s.putDataset(dataset(raw),raw).id;
   s.saveReport({id:'immutable',runId:'r',datasetId:dataId,kind:'history',nativeCurrency:'USD',costStatus:'unknown',metrics:{},limitations:[],decision:'nicht prüfbar',evidenceHashes:[],liveAuthorized:false});
   expect(()=>s.saveReport({id:'immutable',runId:'r',datasetId:dataId,kind:'history',nativeCurrency:'USD',costStatus:'unknown',metrics:{net:1},limitations:[],decision:'nicht prüfbar',evidenceHashes:[],liveAuthorized:false})).toThrow(/immutable/i);
   expect(()=>s.saveReport({id:'live',runId:'r',datasetId:dataId,kind:'history',nativeCurrency:'USD',costStatus:'unknown',metrics:{},limitations:[],decision:'nicht prüfbar',evidenceHashes:[],liveAuthorized:true as unknown as false})).toThrow(/forbidden/i);
  }finally{s.close();}
 });
});
it('persists immutable hypotheses and trial intent across restart',()=>{
 const d=directory();let s=openHistoryStore(d);try{
  const h={id:'hypothesis',runId:'r',variantId:'momentum-10',parameters:{lookback:10},context:{references:[]}};
  s.saveHypothesis(h);expect(()=>s.saveHypothesis({...h,parameters:{lookback:20}})).toThrow(/Immutable/);
  const t={id:'trial',roundId:'round',runId:'r',datasetId:'data',variantId:'momentum-10'};
  expect(s.registerTrial(t,1)).toBe(true);expect(s.registerTrial(t,1)).toBe(false);expect(()=>s.registerTrial({...t,id:'trial-2'},1)).toThrow(/limit/i);
  s.close();s=openHistoryStore(d);expect(s.getHypothesis('hypothesis')).toEqual(h);expect(s.registerTrial(t,1)).toBe(false);
 }finally{s.close();}
});
