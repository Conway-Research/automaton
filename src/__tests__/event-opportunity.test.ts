import {it,expect} from 'vitest';
import {eventOpportunityAudit,eventOpportunityCurriculum} from '../revenue/event-opportunity.js';
import {createBuiltinTools} from '../agent/tools.js';import type {ToolContext} from '../types.js';
const fixture=()=>({eventId:'one-off',sourceUrl:'https://example.org/release',invalidation:'Correction or expiry',exitRule:'Time exit with stress budget',probabilityBasis:'Hypothetical teaching range, not estimated',
 decisionMs:1000,publishedMs:800,receivedMs:850,processedMs:900,expiresMs:1500,quoteMs:990,maxQuoteAgeMs:100,executionLatencyMs:20,
 gainIfRight:20,lossIfWrong:5,roundTripCost:1,stressedRoundTripCost:2,probabilityLow:0.6,probabilityHigh:0.7,stressLoss:8,lossBudget:12,
 sourceChecked:true,publicInformation:true,conflictingEvidence:false,halted:false,depthSufficient:true,exitAvailable:true});
it('permits paper review of a unique event without claiming verification or execution authority',()=>{
 const x=fixture(),before=structuredClone(x),r=eventOpportunityAudit(x);
 expect(r).toMatchObject({disposition:'paper-review-only',inputsVerified:false,liveAuthorized:false,profitabilityProven:false});
 expect(r.stressedExpectedLow).toBeCloseTo(6.8);expect(r.breakEvenProbability).toBeCloseTo(0.24);expect(x).toEqual(before);
});
it.each([
 [{sourceChecked:false},'Source'],[{publicInformation:false},'Source'],[{conflictingEvidence:true},'Source'],
 [{processedMs:1001},'Information'],[{receivedMs:799},'Information'],[{expiresMs:1020},'expires'],
 [{quoteMs:901},'stale'],[{quoteMs:1001},'stale'],[{halted:true},'Executable'],[{depthSufficient:false},'Executable'],
 [{exitAvailable:false},'Executable'],[{lossBudget:9},'budget'],[{probabilityLow:0.1},'lower-bound']
 ])('rejects promotion for a decisive blocker %j',(patch,reason)=>{
 const r=eventOpportunityAudit({...fixture(),...patch});expect(r.disposition).toBe('do-not-promote');expect(r.reasons.join(' ')).toContain(reason);
});
it('reproduces the uncertainty teaching case without using the optimistic endpoint',()=>{
 const e=eventOpportunityCurriculum().workedExample;
 const r=eventOpportunityAudit({...fixture(),gainIfRight:e.gain,lossIfWrong:e.loss,roundTripCost:e.cost,probabilityLow:e.probabilityRange[0],probabilityHigh:e.probabilityRange[1],stressLoss:e.stressLoss,stressedRoundTripCost:e.stressCost,lossBudget:20});
 expect(r.expectedLow).toBeCloseTo(e.expectedRange[0]);expect(r.expectedHigh).toBeCloseTo(e.expectedRange[1]);
 expect(r.stressedExpectedLow).toBeCloseTo(e.stressedLowerExpected);expect(r.disposition).toBe('do-not-promote');
});
it.each([{probabilityLow:NaN},{probabilityHigh:2},{probabilityLow:0.8},{roundTripCost:3},{stressLoss:4},{halted:'false'},{exitRule:''},{sourceUrl:'http://example.org'},{decisionMs:Infinity}])('rejects malformed inputs %j',patch=>{
 expect(()=>eventOpportunityAudit({...fixture(),...patch})).toThrow();
});
it('exposes curriculum and diagnostic through the agent without credentials or state',async()=>{
 const tools=createBuiltinTools('test');
 const knowledge=JSON.parse(await tools.find(t=>t.name==='paper_research_series')!.execute({action:'knowledge'},{} as ToolContext));
 expect(knowledge.eventOpportunities.modules).toHaveLength(8);expect(knowledge.eventOpportunities.assessment.status).toBe('not-administered');
 const result=JSON.parse(await tools.find(t=>t.name==='paper_event_opportunity_audit')!.execute({input:fixture()},{} as ToolContext));
 expect(result.liveAuthorized).toBe(false);expect(result.disposition).toBe('paper-review-only');
});
