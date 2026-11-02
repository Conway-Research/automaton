import {it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {livePreflight,preflightNextSteps} from '../v1/live-preflight.js';
import {createDatabase} from '../state/database.js';
it.each([null,[],{includeTrading:'false'},{includeSupport:1}])('rejects ambiguous capability selection before inspection: %j',value=>{
 expect(()=>livePreflight(value as unknown as Parameters<typeof livePreflight>[0],{})).toThrow('Invalid preflight');
});
it('explains every emitted non-passing gate without granting authority',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-readiness-plan-')),file=path.join(dir,'fixture.db'),db=createDatabase(file);
 try{
  const before=db.raw.serialize();
  for(const operatingScope of ['personal','commerce'] as const){
   const report=livePreflight({agentFile:file,commerceFile:file,researchFile:file,operatingScope,includeTrading:true,includeSupport:true},{});
   expect(report).toMatchObject({liveReady:false,productionAccepted:false,startsAgent:false});
   expect(report.nextSteps.map(s=>s.gate)).toEqual(report.checks.filter(c=>c.status!=='pass').map(c=>c.id));
   for(const step of report.nextSteps){expect(step.evidenceRequired).not.toContain('Unrecognised');expect(step.grantsAuthority).toBe(false);expect(step.automaticallyResolvable).toBe(false);}
  }
  expect(db.raw.serialize()).toEqual(before);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('unknown and malformed states never disappear from the action list',()=>{
 const r=preflightNextSteps([{id:'new-root-gate',status:'unknown'},{id:'ok',status:'pass'}]);
 expect(r).toHaveLength(1);expect(r[0]).toMatchObject({category:'external_verification',grantsAuthority:false});
});
it('personal preflight has no artificial commercial or trading requirements',()=>{
 const report=livePreflight({},{});
 expect(report.checks.some(c=>/stripe|webhook|live_trading|support_/.test(c.id))).toBe(false);
 expect(report.nextSteps.find(c=>c.gate==='agent_database')?.category).toBe('local_reconciliation');
});
