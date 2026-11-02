import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {inspectResearchIntegrity} from '../revenue/research-integrity.js';
import {livePreflight} from '../v1/live-preflight.js';
import {suggestEconomicSources} from '../revenue/research-source-suggestions.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {ResearchStore} from '../revenue/research.js';
import {recordEconomicCitation,economicCitationSummary,reviewEconomicContradiction,type EconomicCitation} from '../revenue/research-assumptions.js';
import {main} from '../v1/cli.js';
import {planResearchExperiment,handoffResearchCandidate} from '../revenue/research-handoff.js';
import {researchAdmissionBlock} from '../revenue/research-admission.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {createBuiltinTools} from '../agent/tools.js';import type {ToolContext} from '../types.js';
import type {MarketingPlan} from '../revenue/marketing.js';

let dir:string,db:ReturnType<typeof createDatabase>,research:ResearchStore;
const quote='We cannot pay the proposed price for this service';
const citation:EconomicCitation={field:'price',evidenceId:'e1',quote,interpretation:'This report challenges the assumed price; identity and payment remain unverified',direction:'contradicts'};
const plan:MarketingPlan={currency:'USD',product:'Pilot',audience:'Workflow operators',channel:'Permission-based listing',offer:'Deliver one report',
  successCriterion:'One attributable paid pilot',stopCriterion:'Stop at seven days without a paid pilot',priceCents:10000,deliveryCostCents:100,
  paymentFeeCents:100,refundAllowanceCents:100,taxAllowanceCents:100,acquisitionCostPerSaleCents:100,fixedTestCostCents:100,
  operatingCostCents:100,availableTestBudgetCents:1000,conservativeSales:1};
beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-economic-evidence-'));db=createDatabase(path.join(dir,'test.db'));research=new ResearchStore(db.raw);
  research.import({opportunities:[{id:'o',title:'Workflow pilot',hypothesis:'A payer might buy a workflow service',sector:'b2b-services',forecast:{revenueCents:10000,costCents:1000,probability:0.8,days:7,validationBudgetCents:500}}],
    evidence:['e1','e2'].map((id,i)=>({id,opportunityId:'o',sourceUrl:`https://source${i}.example/request`,observedAt:new Date(Date.now()-60000).toISOString(),kind:'request',excerpt:i?'We need this service but have not validated payment':quote,provenance:'reported',reviewedBy:null}))});
  for(const e of research.evidence())research.review(e.id,'fixture','accept','Fixture source review only');
});
afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});

it('suggests literal economic source passages without rewriting negation or granting authority',()=>{
  const before=db.raw.serialize(),brief=research.economicBrief('o');
  expect(brief.sourceSuggestions.suggestions).toContainEqual(expect.objectContaining({field:'price',evidenceId:'e1',quote,stance:'unassessed',untrusted:true}));
  expect(brief.sourceSuggestions).toMatchObject({registeredCitations:0,executionAuthorized:false});
  expect(brief.economicEvidence.missingFields).toContain('price');
  expect(db.raw.serialize()).toEqual(before);
  research.review('e1','fixture','reject','Not applicable');
  expect(research.economicBrief('o').sourceSuggestions.suggestions.some(s=>s.evidenceId==='e1')).toBe(false);
});
it('bounds and deduplicates hints while excluding stale, future and synthetic sources',()=>{
  const base=research.evidence('o')[0],now=Date.now();
  const inputs=[...Array.from({length:14},(_,i)=>({...base,id:`s-${i}`,excerpt:`The price is ${i}.50 CHF per month, excluding tax.`})),
    {...base,id:'duplicate',excerpt:'The price is 0.50 CHF per month, excluding tax.'}];
  const result=suggestEconomicSources(inputs,['price'],now);
  expect(result.suggestions).toHaveLength(12);expect(result.truncated).toBe(true);
  expect(result.suggestions[0].quote).toContain('0.50 CHF');
  expect(suggestEconomicSources([
    {...base,observedAt:new Date(now-91*86400000).toISOString()},
    {...base,observedAt:new Date(now+1000).toISOString()},
    {...base,provenance:'synthetic'},
  ],['price'],now).suggestions).toEqual([]);
});

it('reports expired research plans in preflight while leaving historical evidence and zero budgets intact',()=>{
  const {experimentId}=planResearchExperiment(db.raw,'o');
  const inspect=()=>livePreflight({agentFile:path.join(dir,'test.db')},{});
  expect(inspect().checks).toContainEqual(expect.objectContaining({id:'research_plan_admission',status:'pass'}));
  const before=db.raw.serialize(),now=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(now+91*86400000);
  try{
    const report=inspect();
    expect(report.checks).toContainEqual(expect.objectContaining({id:'research_plan_admission',status:'blocked',detail:expect.stringContaining('1 planned/running')}));
    expect(report.checks).toContainEqual(expect.objectContaining({id:'research_integrity',status:'pass'}));
    expect(researchAdmissionBlock(db.raw,experimentId)).toContain('expired');
    expect(db.raw.serialize()).toEqual(before);
    expect(db.raw.prepare('SELECT max_budget_cents,max_inference_cost_cents FROM revenue_experiments WHERE id=?').get(experimentId)).toEqual({max_budget_cents:0,max_inference_cost_cents:0});
  }finally{clock.mockRestore();}
});

it('diagnoses broken evidence without source disclosure or ledger changes through the read-only CLI',async()=>{
  expect(inspectResearchIntegrity(db.raw)).toMatchObject({valid:true,complete:true,checked:2});
  db.raw.prepare("UPDATE research_evidence SET payload='private-sensitive-evidence' WHERE id='e1'").run();
  const before=db.raw.prepare('SELECT * FROM research_evidence').all(),output=path.join(dir,'integrity.json');
  const write=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
  try{await main(['research-integrity','--database',path.join(dir,'test.db'),'--output',output]);}finally{write.mockRestore();}
  const report=fs.readFileSync(output,'utf8');
  expect(JSON.parse(report)).toMatchObject({valid:false,complete:true,checked:2,issues:[{code:'digest_mismatch'}]});
  expect(report).not.toContain('private-sensitive');expect(report).not.toContain('https://');
  expect(db.raw.prepare('SELECT * FROM research_evidence').all()).toEqual(before);
  await expect(main(['research-integrity','--database',path.join(dir,'test.db'),'--apply'])).rejects.toThrow('read-only');
  const preflightOutput=path.join(dir,'preflight.json'),stdout=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
  try{await main(['live-preflight','--database',path.join(dir,'test.db'),'--research-db',path.join(dir,'test.db'),'--output',preflightOutput]);}finally{stdout.mockRestore();}
  expect(JSON.parse(fs.readFileSync(preflightOutput,'utf8')).checks).toContainEqual(expect.objectContaining({id:'separate_research_integrity',status:'blocked'}));
  expect(db.raw.prepare('SELECT * FROM research_evidence').all()).toEqual(before);
});
it('reports bounded diagnostic capacity and oversized records without a partial pass',()=>{
  db.raw.prepare("UPDATE research_evidence SET payload=? WHERE id='e1'").run('x'.repeat(262145));
  expect(inspectResearchIntegrity(db.raw)).toMatchObject({valid:false,issues:[{code:'payload_size_or_type'}]});
  const insert=db.raw.prepare('INSERT INTO research_evidence(id,opportunity_id,payload,digest) VALUES(?,?,?,?)');
  db.raw.transaction(()=>{for(let i=0;i<999;i++)insert.run(`capacity-${i}`,'o','{}','invalid');})();
  expect(inspectResearchIntegrity(db.raw)).toMatchObject({valid:false,complete:false,checked:1000,reason:'inspection_capacity'});
});

it.each([false,true])('rejects corrupt evidence during candidate handoff, existing=%s',existing=>{
  if(existing)handoffResearchCandidate(db.raw,'o');
  const opportunities=db.raw.prepare('SELECT * FROM revenue_opportunities').all();
  const before=db.raw.prepare("SELECT payload,digest FROM research_evidence WHERE id='e1'").get() as {payload:string;digest:string};
  const other=createDatabase(path.join(dir,'test.db'));
  try{
    const wrongId=JSON.stringify({...JSON.parse(before.payload),id:'other-evidence'});
    const wrongParent=JSON.stringify({...JSON.parse(before.payload),opportunityId:'other-opportunity'});
    for(const [payload,digest] of [
      ['private-corrupt-evidence',before.digest],
      ['not-json',createHash('sha256').update('not-json').digest('hex')],
      [wrongId,createHash('sha256').update(wrongId).digest('hex')],
      [wrongParent,createHash('sha256').update(wrongParent).digest('hex')],
    ]){
      db.raw.prepare("UPDATE research_evidence SET payload=?,digest=? WHERE id='e1'").run(payload,digest);
      expect(()=>handoffResearchCandidate(other.raw,'o')).toThrow('Research evidence integrity mismatch');
      const reader=new ResearchStore(other.raw);
      expect(()=>reader.evidence('o')).toThrow('Research evidence integrity mismatch');
      expect(()=>reader.evidence()).toThrow('Research evidence integrity mismatch');
      expect(reader.evidence('unrelated')).toEqual([]);
      expect(db.raw.prepare('SELECT * FROM revenue_opportunities').all()).toEqual(opportunities);
    }
    db.raw.prepare("UPDATE research_evidence SET payload=?,digest=? WHERE id='e1'").run(before.payload,before.digest);
    expect(handoffResearchCandidate(other.raw,'o').duplicate).toBe(existing);
    expect(new ResearchStore(other.raw).evidence('o')).toHaveLength(2);
  }finally{other.close();}
});

it('keeps source quotes and interpretation separate and never upgrades a report to verified demand',()=>{
  recordEconomicCitation(db.raw,'o',citation);
  expect(research.economicBrief('o')).toMatchObject({decision:'hold',economicEvidence:{contradictoryFields:['price'],verified:false,
    citations:[{quote,interpretation:citation.interpretation,current:true,verified:false}]}});
  expect(()=>planResearchExperiment(db.raw,'o')).toThrow('reviewed demand');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
});
it('does not create tables while inspecting an older research workspace',()=>{
  const before=db.raw.prepare("SELECT name FROM sqlite_master ORDER BY name").all();
  expect(economicCitationSummary(db.raw,'o')).toMatchObject({citationCount:0,previewTruncated:false,verified:false,block:null});
  expect(db.raw.prepare("SELECT name FROM sqlite_master ORDER BY name").all()).toEqual(before);
});
it.each([{quote:'A fabricated price quote absent from the source'},{evidenceId:'missing'},{field:'secret'},{quote:'short'},{direction:'verified'}])('rejects unsupported citation %#',change=>{
  expect(()=>recordEconomicCitation(db.raw,'o',{...citation,...change} as EconomicCitation)).toThrow();
  expect(economicCitationSummary(db.raw,'o').citations).toHaveLength(0);
});
it('rejects citations from another opportunity even when the quote is exact',()=>{
  expect(()=>recordEconomicCitation(db.raw,'other',citation)).toThrow('missing');
});
it.each(['2000-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z'])('rejects stale or future source %s',date=>{
  research.import({opportunities:[],evidence:[{id:'dated',opportunityId:'o',sourceUrl:'https://source3.example/request',observedAt:date,kind:'request',excerpt:quote,provenance:'reported',reviewedBy:null}]});
  expect(()=>recordEconomicCitation(db.raw,'o',{...citation,evidenceId:'dated'})).toThrow('Fresh');
});
it('persists contradictions across connections and prevents new spending without erasing the experiment',()=>{
  const {experimentId}=planResearchExperiment(db.raw,'o');
  db.raw.exec("UPDATE revenue_opportunities SET status='validating'; UPDATE revenue_experiments SET status='running',started_at=datetime('now'),max_budget_cents=100,max_inference_cost_cents=50");
  const other=createDatabase(path.join(dir,'test.db'));
  try{
    const governor=new ExperimentBudgetGovernor(other.raw);expect(governor.checkInferenceBudget(experimentId,1).allowed).toBe(true);
    const result=recordEconomicCitation(db.raw,'o',citation);
    expect(recordEconomicCitation(other.raw,'o',citation)).toEqual({...result,duplicate:true});
    expect(researchAdmissionBlock(other.raw,experimentId)).toContain('Contradictory');
    expect(governor.checkInferenceBudget(experimentId,1).allowed).toBe(false);expect(governor.checkTotalBudget(experimentId,1).allowed).toBe(false);
    expect(other.raw.prepare('SELECT status,max_budget_cents FROM revenue_experiments WHERE id=?').get(experimentId)).toEqual({status:'running',max_budget_cents:100});
    expect(()=>other.raw.exec('DELETE FROM research_economic_citations')).toThrow('immutable');
  }finally{other.close();}
  db.close();db=createDatabase(path.join(dir,'test.db'));research=new ResearchStore(db.raw);
  expect(research.rank()[0].decision).toBe('hold');
});
it('requires explicit revision after new supportive interpretation instead of silently changing the execution basis',()=>{
  const {experimentId}=planResearchExperiment(db.raw,'o');
  recordEconomicCitation(db.raw,'o',{...citation,evidenceId:'e2',quote:'We need this service',direction:'supports'});
  expect(researchAdmissionBlock(db.raw,experimentId)).toContain('Economic evidence changed');
  expect(()=>planResearchExperiment(db.raw,'o')).toThrow('revision required');
  const revised=planResearchExperiment(db.raw,'o','Review the new cited assumption');
  expect(researchAdmissionBlock(db.raw,revised.experimentId)).toBeUndefined();
  expect(researchAdmissionBlock(db.raw,experimentId)).toContain('superseded');
});
it('treats expired or tampered cited evidence as a blocker while remaining read-only',()=>{
  recordEconomicCitation(db.raw,'o',{...citation,direction:'supports'});
  expect(economicCitationSummary(db.raw,'o',Date.now()+91*86400000).block).toContain('expired');
  db.raw.prepare("UPDATE research_evidence SET payload='{}' WHERE id='e1'").run();
  expect(economicCitationSummary(db.raw,'o').block).toContain('invalid');
});
it('bounds citations across connections and allows idempotent reuse at capacity',()=>{
  const other=createDatabase(path.join(dir,'test.db'));
  try{
    for(let i=0;i<56;i++)recordEconomicCitation(i%2?other.raw:db.raw,'o',{...citation,interpretation:`Distinct fixture interpretation ${i}`});
    expect(recordEconomicCitation(other.raw,'o',{...citation,interpretation:'Distinct fixture interpretation 0'}).duplicate).toBe(true);
    expect(()=>recordEconomicCitation(other.raw,'o',citation)).toThrow('limit');
    expect(economicCitationSummary(other.raw,'o')).toMatchObject({citationCount:56,previewTruncated:true});
    expect(economicCitationSummary(other.raw,'o').citations).toHaveLength(6);
  }finally{other.close();}
});
it('provides citations to the coordinating agent without external calls or spending',async()=>{
  const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_research_economics')!;
  const result=JSON.parse(await tool.execute({action:'cite',opportunity_id:'o',citation},{db} as unknown as ToolContext));
  expect(result).toMatchObject({verified:false,duplicate:false});
  expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
});
it('retains a contradiction through economic revisions and restart without carrying forward supporting claims',()=>{
  recordEconomicCitation(db.raw,'o',{...citation,evidenceId:'e2',quote:'We need this service',field:'payer',direction:'supports'});
  recordEconomicCitation(db.raw,'o',citation);
  const a=research.reviseEconomics('o',plan,0.8,7,'Changed assumptions fixture');
  const b=research.reviseEconomics(a.id,{...plan,priceCents:9000},0.8,7,'Lower price fixture');
  for(const e of research.evidence(b.id))research.review(e.id,'fixture','accept','Fixture review');
  expect(research.economicBrief(b.id)).toMatchObject({decision:'hold',economicEvidence:{contradictoryFields:['price'],missingFields:expect.arrayContaining(['payer']),
    citations:expect.arrayContaining([expect.objectContaining({inherited:true,researchId:'o',direction:'contradicts'})])}});
  expect(()=>planResearchExperiment(db.raw,b.id)).toThrow('reviewed demand');
  db.close();db=createDatabase(path.join(dir,'test.db'));research=new ResearchStore(db.raw);
  expect(research.economicBrief(b.id).economicEvidence.block).toContain('Contradictory');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
});
it('invalidates a descendant experiment when late contradictory evidence arrives on an ancestor',()=>{
  const revision=research.reviseEconomics('o',plan,0.8,7,'Fixture assumptions');
  for(const e of research.evidence(revision.id))research.review(e.id,'fixture','accept','Fixture review');
  const {experimentId}=planResearchExperiment(db.raw,revision.id);
  expect(researchAdmissionBlock(db.raw,experimentId)).toBeUndefined();
  const other=createDatabase(path.join(dir,'test.db'));
  try{
    recordEconomicCitation(other.raw,'o',citation);
    expect(researchAdmissionBlock(db.raw,experimentId)).toContain('Contradictory');
    expect(new ResearchStore(other.raw).rank().find(o=>o.id===revision.id)).toMatchObject({decision:'hold',score:0});
  }finally{other.close();}
});
it('includes ancestor evidence changes in the identity of a proposed revision',()=>{
  const old=research.reviseEconomics('o',plan,0.8,7,'Same proposal');
  recordEconomicCitation(db.raw,'o',citation);
  const changed=research.reviseEconomics('o',plan,0.8,7,'Same proposal');
  expect(changed.id).not.toBe(old.id);expect(changed.brief.decision).toBe('hold');
});
it('checks inherited contradictions outside the bounded display preview',()=>{
  const parent=research.reviseEconomics('o',plan,0.8,7,'Fixture');
  const evidenceId=research.evidence(parent.id).find(e=>e.excerpt.includes('need this service'))!.id;
  for(let i=0;i<7;i++)recordEconomicCitation(db.raw,parent.id,{field:'payer',direction:'supports',evidenceId,quote:'We need this service',interpretation:`Fixture ${i}`});
  recordEconomicCitation(db.raw,'o',citation);
  const summary=economicCitationSummary(db.raw,parent.id);
  expect(summary).toMatchObject({citationCount:8,previewTruncated:true,contradictoryFields:['price']});
  expect(summary.citations.every(c=>'inherited' in c&&!c.inherited)).toBe(true);
  expect(summary.block).toContain('Contradictory');
});
it('fails closed on a corrupted version cycle instead of traversing indefinitely',()=>{
  const a=research.reviseEconomics('o',plan,0.8,7,'Fixture');
  db.raw.exec('DROP TRIGGER research_economic_revision_no_update');
  db.raw.prepare('UPDATE research_economic_revisions SET previous_id=id WHERE id=?').run(a.id);
  expect(economicCitationSummary(db.raw,a.id).block).toContain('invalid');
});
it('does not rank or hand off a research opportunity with a broken source digest',()=>{
  db.raw.prepare("UPDATE research_opportunities SET payload=json_set(payload,'$.forecast.revenueCents',99999999) WHERE id='o'").run();
  expect(()=>research.rank()).toThrow('integrity');
  expect(()=>handoffResearchCandidate(db.raw,'o')).toThrow('integrity');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_opportunities').get()).toEqual({n:0});
});

function resolutionFixture(late=false){
  const first=late?undefined:recordEconomicCitation(db.raw,'o',citation);
  const revised=research.reviseEconomics('o',{...plan,priceCents:9000},0.8,7,'Reduced pilot scope and price');
  for(const e of research.evidence(revised.id))research.review(e.id,'fixture','accept','Review copied source');
  const experiment=late?planResearchExperiment(db.raw,revised.id):undefined;
  const original=first??recordEconomicCitation(db.raw,'o',citation);
  const quote='The reduced pilot scope and price fit our procurement budget';
  research.import({opportunities:[],evidence:[{id:'new-evidence',opportunityId:revised.id,sourceUrl:'https://new-source.example/pilot',observedAt:new Date(Date.now()-1000).toISOString(),kind:'request',excerpt:quote,provenance:'reported',reviewedBy:null}]});
  research.review('new-evidence','fixture','accept','Check newly reported source');
  return {input:{researchId:revised.id,citationId:original.id,evidenceId:'new-evidence',quote,reviewer:'operator-fixture',reason:'Reduced scope addresses the original price objection; payment still unproven'},experiment};
}
it('resolves only a revised hypothesis, persists across connections, and preserves immutable evidence without funding',()=>{
  const {input}=resolutionFixture();
  const before=db.raw.prepare('SELECT name FROM sqlite_master ORDER BY name').all();
  expect(reviewEconomicContradiction(db.raw,input)).toMatchObject({applied:false,grantsSpending:false});
  expect(db.raw.prepare('SELECT name FROM sqlite_master ORDER BY name').all()).toEqual(before);
  expect(economicCitationSummary(db.raw,input.researchId).block).toContain('Contradictory');
  const applied=reviewEconomicContradiction(db.raw,input,true);
  const other=createDatabase(path.join(dir,'test.db'));
  try{
    expect(reviewEconomicContradiction(other.raw,input,true)).toEqual(applied);
    expect(economicCitationSummary(other.raw,input.researchId)).toMatchObject({block:null,resolvedCount:1,verified:false});
    expect(economicCitationSummary(other.raw,'o').block).toContain('Contradictory');
    expect(()=>other.raw.exec('DELETE FROM research_economic_resolutions')).toThrow('immutable');
    const {experimentId}=planResearchExperiment(other.raw,input.researchId);
    expect(other.raw.prepare('SELECT max_budget_cents,max_inference_cost_cents FROM revenue_experiments WHERE id=?').get(experimentId)).toEqual({max_budget_cents:0,max_inference_cost_cents:0});
  }finally{other.close();}
  db.close();db=createDatabase(path.join(dir,'test.db'));research=new ResearchStore(db.raw);
  expect(economicCitationSummary(db.raw,input.researchId).resolvedCount).toBe(1);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM research_economic_citations').get()).toEqual({n:1});
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
});
it('reblocks on withdrawn source reviews and requires fresh explicit review after reacceptance',()=>{
  const {input}=resolutionFixture();reviewEconomicContradiction(db.raw,input,true);
  const {experimentId}=planResearchExperiment(db.raw,input.researchId);
  research.review(input.evidenceId,'fixture','reject','Withdraw source review');
  expect(researchAdmissionBlock(db.raw,experimentId)).toContain('Contradictory');
  research.review(input.evidenceId,'fixture','accept','Recheck source');
  expect(economicCitationSummary(db.raw,input.researchId).block).toContain('Contradictory');
  reviewEconomicContradiction(db.raw,input,true);
  expect(researchAdmissionBlock(db.raw,experimentId)).toContain('Economic evidence changed');
});
it('cannot silently resume a funded plan after contradiction resolution',()=>{
  const {input,experiment}=resolutionFixture(true);
  db.raw.prepare('UPDATE revenue_experiments SET max_budget_cents=100 WHERE id=?').run(experiment!.experimentId);
  reviewEconomicContradiction(db.raw,input,true);
  expect(researchAdmissionBlock(db.raw,experiment!.experimentId)).toContain('Economic evidence changed');
  expect(()=>planResearchExperiment(db.raw,input.researchId,'Updated review')).toThrow();
});
it('requires an explicit unfunded plan revision and does not inherit acceptance into another economic version',()=>{
  const {input,experiment}=resolutionFixture(true);reviewEconomicContradiction(db.raw,input,true);
  expect(researchAdmissionBlock(db.raw,experiment!.experimentId)).toContain('Economic evidence changed');
  const next=planResearchExperiment(db.raw,input.researchId,'Reviewed revised economics and newer source');
  expect(researchAdmissionBlock(db.raw,next.experimentId)).toBeUndefined();
  const child=research.reviseEconomics(input.researchId,{...plan,priceCents:8000},0.8,7,'Another scope');
  expect(economicCitationSummary(db.raw,child.id)).toMatchObject({resolvedCount:0,contradictoryFields:['price']});
});
it.each(['quote','owner','unreviewed','copied','support','tampered'])('rejects invalid resolution: %s',change=>{
  const {input}=resolutionFixture();
  if(change==='quote')input.quote='Fabricated new payment confirmation';
  if(change==='owner')input.evidenceId='e2';
  if(change==='unreviewed')research.review(input.evidenceId,'fixture','reject','Source not accepted');
  if(change==='copied')input.evidenceId=research.evidence(input.researchId).find(e=>e.excerpt===quote)!.id;
  if(change==='support')input.citationId=recordEconomicCitation(db.raw,'o',{...citation,direction:'supports'}).id;
  if(change==='tampered')db.raw.prepare("UPDATE research_opportunities SET payload='{}' WHERE id=?").run(input.researchId);
  expect(()=>reviewEconomicContradiction(db.raw,input,true)).toThrow();
  expect(economicCitationSummary(db.raw,input.researchId).resolvedCount).toBe(0);
});
it('expires acceptance and never clears a second unresolved contradiction on the same field',()=>{
  const {input}=resolutionFixture();reviewEconomicContradiction(db.raw,input,true);
  expect(economicCitationSummary(db.raw,input.researchId,Date.now()+91*86400000).block).toContain('expired');
  recordEconomicCitation(db.raw,'o',{...citation,interpretation:'Second independently recorded concern'});
  expect(economicCitationSummary(db.raw,input.researchId)).toMatchObject({resolvedCount:1,contradictoryFields:['price']});
});
it('offers a bounded operator CLI preview and explicit local apply without printing source content',async()=>{
  const {input}=resolutionFixture(),file=path.join(dir,'review.json');fs.writeFileSync(file,JSON.stringify(input));
  const output=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
  try{
    const args=['research-resolve-contradiction','--database',path.join(dir,'test.db'),'--input',file];
    await main(args);expect(economicCitationSummary(db.raw,input.researchId).resolvedCount).toBe(0);
    await main([...args,'--apply']);expect(economicCitationSummary(db.raw,input.researchId).resolvedCount).toBe(1);
    expect(output.mock.calls.map(c=>c[0]).join('')).not.toContain(input.quote);
    await expect(main(['research-resolve-contradiction','--database',path.join(dir,'missing.db'),'--input',file,'--apply'])).rejects.toThrow();
    expect(fs.existsSync(path.join(dir,'missing.db'))).toBe(false);
  }finally{output.mockRestore();}
});
it('can reassess an old intact contradiction using fresh evidence, but never fabricates freshness',()=>{
  const {input}=resolutionFixture();
  vi.useFakeTimers();vi.setSystemTime(Date.now()+91*86400000);
  try{
    const freshQuote='A newly scoped pilot is now affordable for our procurement team';
    research.import({opportunities:[],evidence:[{id:'later-source',opportunityId:input.researchId,sourceUrl:'https://later.example/request',observedAt:new Date(Date.now()-1000).toISOString(),kind:'request',excerpt:freshQuote,provenance:'reported',reviewedBy:null}]});
    research.review('later-source','fixture','accept','Review fresh source after old evidence expired');
    reviewEconomicContradiction(db.raw,{...input,evidenceId:'later-source',quote:freshQuote},true);
    expect(economicCitationSummary(db.raw,input.researchId)).toMatchObject({block:null,resolvedCount:1});
    // Old demand reviews still expire separately; resolving the objection grants no validated demand.
    expect(research.rank().find(r=>r.id===input.researchId)?.decision).toBe('hold');
  }finally{vi.useRealTimers();}
});
