import {describe,it,expect} from 'vitest';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';

describe('trading curriculum retrieval boundary',()=>{
  it('is reachable without credentials, network or a database and does not grant expertise or authority',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_research_series')!;
    const result=JSON.parse(await tool.execute({action:'knowledge'},{} as ToolContext));
    const k=result.expertise;
    expect(result.researchUpdate).toMatchObject({liveAuthorized:false,status:'research-only',comparison:{baseReports:78,positiveAcrossAllCostScenarios:0,untouchedHoldout:false}});
    expect(k).toMatchObject({liveAuthorized:false,modelRetrained:false,expertiseProven:false,profitabilityProven:false});
    const ids=new Set(k.sources.map((s:{id:string})=>s.id));
    expect(ids.size).toBe(k.sources.length);
    expect(k.modules.length).toBeGreaterThanOrEqual(12);
    for(const m of k.modules){
      expect(m.sourceIds.every((id:string)=>ids.has(id))).toBe(true);
      expect(m.assessment.length).toBeGreaterThan(40);
      expect(m.status).toBe('knowledge-added-assessment-pending');
    }
    for(const formula of k.formulas){
      expect(formula.sourceIds.every((id:string)=>ids.has(id))).toBe(true);
      expect(formula.limits.length).toBeGreaterThan(40);
    }
    expect(k.assessmentTemplate.status).toBe('not-administered');
    expect(k.workedExamples.every((e:{kind:string})=>e.kind==='synthetic-worked-example')).toBe(true);
    const originalAnswer=k.workedExamples[0].answer;
    k.workedExamples[0].answer='corrupt';
    k.assessmentTemplate.status='passed';
    k.modules[0].status='expert';k.sources.length=0;
    const again=JSON.parse(await tool.execute({action:'knowledge'},{} as ToolContext));
    expect(again.expertise.modules[0].status).toBe('knowledge-added-assessment-pending');
    expect(again.expertise.sources.length).toBeGreaterThan(0);
    expect(again.expertise.workedExamples[0].answer).toBe(originalAnswer);
    expect(again.expertise.assessmentTemplate.status).toBe('not-administered');
    expect(again.liveAuthorized).toBe(false);
  });
});
