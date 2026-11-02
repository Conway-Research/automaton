import {expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {compareOptimization,type OptimizationComparison} from '../revenue/optimization-comparison.js';
import {main} from '../v1/cli.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';
function fixture():OptimizationComparison{return {mode:'simulation',datasetDigest:'a'.repeat(64),criteriaDigest:'b'.repeat(64),baseline:'baseline',candidate:'compact-context',
 minimumQuality:90,maximumQualityDrop:0,minimumSavingsPercent:10,maximumLatencyRatio:1.2,
 cases:[0,1,2].map(i=>({id:`case-${i}`,inputDigest:String(i).repeat(64),baseline:{costCents:10,latencyMs:100,qualityScore:95,safetyPassed:true,completed:true},
 candidate:{costCents:7,latencyMs:90,qualityScore:95,safetyPassed:true,completed:true}}))};}
it('reports matched cost savings without granting adoption or claiming profit',()=>{
 expect(compareOptimization(fixture())).toMatchObject({mode:'simulation',caseCount:3,savingsCents:9,savingsPercent:30,decision:'candidate_for_replication',adoptionAuthorized:false,profitabilityProven:false});
});
it('exposes the comparison to the coordinator without a provider or database',async()=>{
 const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_compare_optimization')!;
 expect(JSON.parse(await tool.execute({comparison:fixture()},{} as ToolContext))).toMatchObject({decision:'candidate_for_replication',adoptionAuthorized:false});
});
it('does not hide a single quality regression behind an improved average',()=>{
 const data=fixture();data.cases[0].candidate.qualityScore=90;data.cases[1].candidate.qualityScore=100;
 expect(compareOptimization(data)).toMatchObject({decision:'reject_candidate',qualityLosses:1,blockers:expect.arrayContaining(['paired_quality_regression'])});
});
it.each(['safetyPassed','completed'] as const)('rejects cheap but invalid candidate %s',key=>{
 const data=fixture();data.cases[0].candidate[key]=false;
 expect(compareOptimization(data).decision).toBe('reject_candidate');
});
it('cannot reward unusable baseline or slower outliers',()=>{
 const data=fixture();data.cases[0].baseline.qualityScore=10;data.cases[1].candidate.latencyMs=500;
 expect(compareOptimization(data).blockers).toEqual(expect.arrayContaining(['baseline_quality_below_floor','paired_latency_regression']));
});
it('rejects duplicate evidence, invalid numbers, undersized samples and unsafe totals',()=>{
 for(const mutation of [
  (d:OptimizationComparison)=>{d.cases[1].inputDigest=d.cases[0].inputDigest;},
  (d:OptimizationComparison)=>{d.cases[0].candidate.costCents=-1;},
  (d:OptimizationComparison)=>{d.cases.pop();},
  (d:OptimizationComparison)=>{for(const c of d.cases)c.baseline.costCents=Number.MAX_SAFE_INTEGER;},
 ]){const data=fixture();mutation(data);expect(()=>compareOptimization(data)).toThrow();}
});
it('uses order-independent identity and changes it when criteria or results change',()=>{
 const data=fixture(),first=compareOptimization(data);data.cases.reverse();expect(compareOptimization(data).comparisonId).toBe(first.comparisonId);
 data.maximumQualityDrop=1;expect(compareOptimization(data).comparisonId).not.toBe(first.comparisonId);
});
it('does not turn a zero-cost baseline or recorded label into proof of improvement',()=>{
 const data=fixture();data.mode='recorded';for(const c of data.cases){c.baseline.costCents=0;c.candidate.costCents=0;}
 expect(compareOptimization(data)).toMatchObject({savingsPercent:null,decision:'reject_candidate',adoptionAuthorized:false});
 expect(compareOptimization(data).limitation).toContain('not independent verification');
});
it('runs the actual offline CLI and preserves an existing report',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-compare-')),input=path.join(dir,'input.json'),output=path.join(dir,'report.json');
 fs.writeFileSync(input,JSON.stringify(fixture()));const stdout=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
 try{
  const args=['optimization-compare','--input',input,'--output',output];await main(args);
  const first=fs.readFileSync(output,'utf8');expect(JSON.parse(first).decision).toBe('candidate_for_replication');
  await expect(main(args)).rejects.toThrow();expect(fs.readFileSync(output,'utf8')).toBe(first);
  await expect(main(['optimization-compare','--input',input,'--apply'])).rejects.toThrow('no policy');
 }finally{stdout.mockRestore();fs.rmSync(dir,{recursive:true,force:true});}
});
