import {afterEach,beforeEach,expect,it} from 'vitest';
import {createDatabase} from '../state/database.js';
import {ResearchStore} from '../revenue/research.js';
import {ECONOMIC_FIELDS,recordEconomicCitation} from '../revenue/research-assumptions.js';
import {designValidation,informationValue} from '../revenue/validation-design.js';
import type {MarketingPlan} from '../revenue/marketing.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';

let db:ReturnType<typeof createDatabase>,research:ResearchStore;
const plan:MarketingPlan={currency:'USD',product:'Pilot',audience:'Operators',channel:'Approved listing',offer:'One scoped report',
 successCriterion:'Paid delivered pilot with reconciled positive net proceeds',stopCriterion:'Stop at seven days or approved ceiling',priceCents:10000,
 deliveryCostCents:100,paymentFeeCents:100,refundAllowanceCents:100,taxAllowanceCents:100,acquisitionCostPerSaleCents:900,
 fixedTestCostCents:100,operatingCostCents:100,availableTestBudgetCents:2000,conservativeSales:1};
const quote='Fixture source passage for an economic assumption; not verified demand';
beforeEach(()=>{
 db=createDatabase(':memory:');research=new ResearchStore(db.raw);
 research.import({opportunities:[{id:'o',title:'Pilot',sector:'b2b-services',hypothesis:'Operators may buy a report',forecastState:'unknown',
 forecast:{revenueCents:0,costCents:0,probability:0,days:7,validationBudgetCents:0}}],evidence:[{id:'e',opportunityId:'o',sourceUrl:'https://source.example/request',
 observedAt:new Date(Date.now()-1000).toISOString(),kind:'request',excerpt:quote,provenance:'reported',reviewedBy:null}]});
});
afterEach(()=>db.close());
const input={decision:'validate' as const,reason:'Fixture criteria',economics:plan,missingFields:[] as typeof ECONOMIC_FIELDS[number][],evidenceBlock:null,contradictoryFields:[],days:7};
it('rejects research costing its perfect-information upper bound and never treats a positive bound as permission',async()=>{
 const model={probabilities:[0.5,0.5],actions:[{id:'test',netCents:[100,-100]}],researchCostCents:50};
 expect(informationValue(model)).toMatchObject({informationValueUpperBoundCents:50,decision:'do_not_buy_information',maximumResearchCostForPositiveUpperBoundCents:49,executionAuthorized:false});
 expect(informationValue({...model,researchCostCents:49}).decision).toBe('estimate_actual_information_value_first');
 expect(informationValue({...model,actions:[{id:'test',netCents:[100,50]}]}).informationValueUpperBoundCents).toBe(0);
 expect(()=>informationValue({...model,probabilities:[0.4,0.4]})).toThrow();
 const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_information_value')!;
 expect(JSON.parse(await tool.execute({model},{} as ToolContext)).decision).toBe('do_not_buy_information');
});
it('starts an unknown opportunity with payer evidence and preserves all authorizations',()=>{
 const before=db.raw.prepare('SELECT name FROM sqlite_master ORDER BY name').all();
 expect(research.economicBrief('o').validation).toMatchObject({stage:'research',target:'payer',executionAuthorized:false,maxAuthorizedSpendCents:0,outcomeContractProposal:null});
 expect(db.raw.prepare('SELECT name FROM sqlite_master ORDER BY name').all()).toEqual(before);
 expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
});
it('prioritizes unresolved counterevidence over new tests and stops rejected economics',()=>{
 recordEconomicCitation(db.raw,'o',{field:'price',evidenceId:'e',quote,interpretation:'Fixture contradiction',direction:'contradicts'});
 expect(research.economicBrief('o').validation).toMatchObject({stage:'review',target:'price',outcomeContractProposal:null});
 expect(designValidation({...input,decision:'reject',missingFields:['payer']})).toMatchObject({stage:'stop',outcomeContractProposal:null});
});
it('prioritizes payer and offer before expensive unsupported acquisition assumptions',()=>{
 expect(designValidation({...input,missingFields:['acquisitionCost','offer','payer']})).toMatchObject({stage:'research',target:'payer'});
 expect(designValidation({...input,missingFields:['acquisitionCost','offer']})).toMatchObject({stage:'research',target:'offer'});
 expect(designValidation({...input,missingFields:['deliveryCost','acquisitionCost','probability']})).toMatchObject({stage:'research',target:'acquisitionCost'});
});
it('does not treat complete citations as authority or conflate paid orders with settled profit',()=>{
 const proposal=designValidation(input);
 expect(proposal).toMatchObject({stage:'pilot-design',success:plan.successCriterion,failure:plan.stopCriterion,executionAuthorized:false,maxAuthorizedSpendCents:0,
 outcomeContractProposal:{minimumQualifiedCustomers:3,minimumPaidOrders:1,requiresPreregistration:true,modeMustBeSelected:true}});
 expect('limitations' in proposal&&proposal.limitations).toContain('settled net profit');
 expect(designValidation({...input,decision:'hold'})).toMatchObject({stage:'review',outcomeContractProposal:null});
});
it('uses deterministic cost ordering and caps the proposed review horizon',()=>{
 const one=designValidation({...input,days:3650,missingFields:['taxAllowance','deliveryCost']});
 const two=designValidation({...input,days:3650,missingFields:['deliveryCost','taxAllowance']});
 expect(one).toEqual(two);expect(one.deadlineHours).toBe(168);
});
it('keeps superseded economics in review instead of suggesting new research work',()=>{
 research.reviseEconomics('o',plan,0.8,7,'Complete fixture estimates');
 expect(research.economicBrief('o').validation).toMatchObject({stage:'review',reason:expect.stringContaining('superseded')});
});
it('reaches the actual agent economics tool without registering contracts or touching budgets',async()=>{
 const revised=research.reviseEconomics('o',plan,0.8,7,'Complete fixture estimates');
 const evidence=research.evidence(revised.id)[0];
 for(const field of ['payer','offer','channel','price'] as const)recordEconomicCitation(db.raw,revised.id,{field,evidenceId:evidence.id,quote,interpretation:'Fixture interpretation only',direction:'supports'});
 const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_research_economics')!;
 const result=JSON.parse(await tool.execute({action:'brief',opportunity_id:revised.id},{db} as unknown as ToolContext));
 expect(result.validation).toMatchObject({stage:'research',target:'acquisitionCost',maxAuthorizedSpendCents:0});
 expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_outcome_contracts'").get()).toBeUndefined();
 expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
});
