import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {ResearchStore} from '../revenue/research.js';
import {RevenueStore} from '../revenue/store.js';
import {ECONOMIC_FIELDS,recordEconomicCitation} from '../revenue/research-assumptions.js';
import {prepareValidationPilot} from '../revenue/validation-pilot.js';
import {researchAdmissionBlock} from '../revenue/research-admission.js';
import {previewExperimentOutcome} from '../revenue/outcome.js';
import {main} from '../v1/cli.js';
let dir:string,file:string,db:ReturnType<typeof createDatabase>,research:ResearchStore;
const quote='Fixture evidence supporting the scoped pilot assumptions';
const input={researchId:'o',mode:'test' as const,reviewedBy:'fixture-operator'};
beforeEach(()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-pilot-'));file=path.join(dir,'test.db');db=createDatabase(file);research=new ResearchStore(db.raw);
 research.import({opportunities:[{id:'o',title:'Fixture pilot',sector:'b2b-services',hypothesis:'A buyer may pay for a report',
 forecast:{revenueCents:10000,costCents:500,validationBudgetCents:100,probability:0.8,days:7},
 economics:{currency:'USD',product:'Report',audience:'Operators',channel:'Permitted listing',offer:'One scoped report',successCriterion:'Delivered paid pilot',stopCriterion:'Seven days or approved budget',
 priceCents:10000,deliveryCostCents:100,paymentFeeCents:100,refundAllowanceCents:100,taxAllowanceCents:100,acquisitionCostPerSaleCents:100,fixedTestCostCents:100,operatingCostCents:0,availableTestBudgetCents:1000,conservativeSales:1}}],
 evidence:[0,1].map(i=>({id:`e${i}`,opportunityId:'o',sourceUrl:`https://source${i}.example/request`,observedAt:new Date(Date.now()-1000).toISOString(),kind:'request',excerpt:i?'Separate fixture request for a pilot':quote,provenance:'reported',reviewedBy:null}))});
 for(const e of research.evidence())research.review(e.id,'fixture','accept','Fixture only');
 for(const field of ECONOMIC_FIELDS)recordEconomicCitation(db.raw,'o',{field,evidenceId:'e0',quote,interpretation:'Fixture assumption, not proof',direction:'supports'});
});
afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
it('atomically binds a zero-funded planned experiment and immutable test demand criteria',()=>{
 const result=prepareValidationPilot(db.raw,input,true);expect(result).toMatchObject({applied:true,duplicate:false,executionAuthorized:false,capitalCreditedCents:0});
 const id=result.experimentId!;
 expect(new RevenueStore(db.raw).getExperiment(id)).toMatchObject({status:'planned',maxBudgetCents:0,maxInferenceCostCents:0,taskId:null});
 expect(previewExperimentOutcome(db.raw,id)).toMatchObject({decision:'review_required',contract:{mode:'test',minimumQualifiedCustomers:3,minimumPaidOrders:1},scalingAuthorized:false});
 expect(()=>db.raw.exec('DELETE FROM obolus_outcome_contracts')).toThrow('immutable');
 expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
});
it('is idempotent across two connections and restarts without creating another experiment',()=>{
 const first=prepareValidationPilot(db.raw,input,true),other=createDatabase(file);
 try{expect(prepareValidationPilot(other.raw,input,true)).toMatchObject({duplicate:true,experimentId:first.experimentId});}finally{other.close();}
 db.close();db=createDatabase(file);
 expect(prepareValidationPilot(db.raw,input,true)).toMatchObject({duplicate:true,experimentId:first.experimentId});
 expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:1});
});
it('rolls back the experiment and handoff when contract persistence fails',()=>{
 db.raw.exec("CREATE TABLE obolus_outcome_contracts(experiment_id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TRIGGER fixture_contract_failure BEFORE INSERT ON obolus_outcome_contracts BEGIN SELECT RAISE(ABORT,'fixture persistence error'); END");
 expect(()=>prepareValidationPilot(db.raw,input,true)).toThrow('fixture persistence error');
 expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
 expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_opportunities').get()).toEqual({n:0});
});
it('does not overwrite contract mode or reviewer on replay',()=>{
 const first=prepareValidationPilot(db.raw,input,true);
 expect(()=>prepareValidationPilot(db.raw,{...input,mode:'live'},true)).toThrow('immutable');
 expect(()=>prepareValidationPilot(db.raw,{...input,reviewedBy:'different'},true)).toThrow('immutable');
 expect(previewExperimentOutcome(db.raw,first.experimentId!)?.contract.mode).toBe('test');
});
it('requires explicit revision after new economic evidence and preserves the old contract',()=>{
 const first=prepareValidationPilot(db.raw,input,true);
 recordEconomicCitation(db.raw,'o',{field:'price',evidenceId:'e1',quote:'Separate fixture request',interpretation:'New supportive fixture',direction:'supports'});
 expect(researchAdmissionBlock(db.raw,first.experimentId!)).toContain('Economic evidence changed');
 expect(()=>prepareValidationPilot(db.raw,input,true)).toThrow('revision required');
 const next=prepareValidationPilot(db.raw,{...input,revisionReason:'Review new source'},true);
 expect(next.experimentId).not.toBe(first.experimentId);
 expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_outcome_contracts').get()).toEqual({n:2});
 expect(researchAdmissionBlock(db.raw,next.experimentId!)).toBeUndefined();
});
it('refuses stale or contradictory evidence instead of preparing execution',()=>{
 recordEconomicCitation(db.raw,'o',{field:'price',evidenceId:'e0',quote,interpretation:'Counterexample fixture',direction:'contradicts'});
 expect(()=>prepareValidationPilot(db.raw,input,true)).toThrow('eligible pilot');
 expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
});
it('CLI preview is read-only, requires explicit mode, and applies without any provider',async()=>{
 const out=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
 try{
  const before=db.raw.prepare('SELECT name FROM sqlite_master ORDER BY name').all();
  const args=['research-pilot','--database',file,'--research-id','o','--reviewer','fixture-operator','--mode','test'];
  await main(args);
  expect(db.raw.prepare('SELECT name FROM sqlite_master ORDER BY name').all()).toEqual(before);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
  await main([...args,'--apply']);expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:1});
  await expect(main(args.slice(0,-2))).rejects.toThrow('mode');
 }finally{out.mockRestore();}
});
