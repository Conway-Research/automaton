import test from 'node:test';import assert from 'node:assert/strict';
import {validatePlan,createFounderPlanner} from './founder-planner.mjs';
const capabilities=[{kind:'private-analysis',status:'available',maxCostRappen:50},{kind:'research',status:'available',maxCostRappen:0},{kind:'external-communication',status:'blocked',maxCostRappen:0}];
const candidate={kind:'private-analysis',evidenceIds:['s1'],expectedBenefit:'Validate the concrete opportunity before spending further.',uncertainty:'Demand is only reported',maxCostRappen:50,title:'Evaluate reported demand',nextReviewAt:'2026-10-14T00:00:00Z'};
// Before the price policy expiry; founder-policy-renewal.test.mjs covers the expiry itself.
const fixedNow=()=>Date.parse('2026-10-20T00:00:00Z');
test('planner admits bounded capabilities and rejects invented evidence, permissions, costs and duplicate work',()=>{
 const base={capabilities,evidence:[{id:'s1'}],budget:{active:true,dayRemainingRappen:100,remainingRappen:100},now:Date.parse('2026-10-13T00:00:00Z')};
 assert.equal(validatePlan({...base,candidates:[candidate,candidate]}).accepted.length,1);
 for(const c of [{...candidate,kind:'external-communication'},{...candidate,evidenceIds:['invented']},{...candidate,maxCostRappen:1},{...candidate,nextReviewAt:'bad'}])assert.equal(validatePlan({...base,candidates:[c]}).accepted.length,0);
 assert.equal(validatePlan({...base,budget:{...base.budget,remainingRappen:49},candidates:[candidate]}).accepted.length,0);
});
test('planner receives full Genesis and does not forward private evidence to model',async()=>{
 let body;const mission={directive:'Mission complete '.repeat(2100)+'END_GENESIS'};const a=createFounderPlanner({now:fixedNow,mission,apiKey:'sk-test-private',request:async(u,o)=>{body=JSON.parse(o.body);return Response.json({id:'resp_plan',status:'completed',usage:{input_tokens:10000,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify({summary:'A concrete evidence-based planning decision.',sourceIds:['s1'],nextStep:'Validate the opportunity before further work.',limitations:['Unconfirmed demand'],candidates:[candidate]})}]}]});}});
 const r=await a.execute({task:{input:{title:'Choose next useful work'}},dependencies:[{sources:[{id:'s1',url:'https://example.org',claim:'Public demand'}]},{privacy:'private',sources:[{id:'secret',claim:'PRIVATE_MAIL'}]}],signal:new AbortController().signal,assertActive(){},grant:{reservationId:'r',maxCostRappen:50}});
 assert.ok(body.instructions.includes('END_GENESIS'));assert.equal(body.input.includes('PRIVATE_MAIL'),false);assert.equal(a.verify(r),true);
});
