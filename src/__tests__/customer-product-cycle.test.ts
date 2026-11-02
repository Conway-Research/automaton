import {expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createDatabase} from '../state/database.js';
import {ResearchStore} from '../revenue/research.js';
import {assessMarketingPlan} from '../revenue/marketing.js';
import {ProfitLedger} from '../revenue/profit-ledger.js';
import {registerProductQuality,assessProductQuality,assertProductQuality} from '../commerce/product-quality.js';
import {DigitalDelivery} from '../commerce/delivery.js';
import {assessRevenuePath,revenuePathRequirements,type RevenuePathAssessment} from '../revenue/revenue-paths.js';

it('composes research, exact-version independent technical checks, marketing costs and paper profit without treating the cycle as a real sale',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-customer-cycle-'));
 const agent=createDatabase(path.join(dir,'agent.db')),commerce=new Database(path.join(dir,'commerce.db'));
 try{
  const research=new ResearchStore(agent.raw);
  const now=Date.now();
  const profile:RevenuePathAssessment={path:'public-report',region:'CH',sourceUrl:'https://example.test/synthetic',retrievedAt:now,provenance:'synthetic',
   demand:['Synthetic problem only'],counterEvidence:['No real buyer'],prerequisites:['Synthetic original text'],deliveryEvidence:['Offline benchmark only'],
   conditions:revenuePathRequirements('public-report').map(requirement=>({requirement,sourceUrl:'https://example.test/fixture-rights',digest:'a'.repeat(64),observedAt:now,expiresAt:now+60000,state:'supported'})),
   forecast:{currency:'USD',receiptsCents:100,directCashCents:170,feesCents:0,refundsCents:0,openCosts:[],probability:0.5,estimateSource:'Synthetic fixture',uncertainty:'high'},
   entryFeeCents:0,effortMinutes:12,nextSafeCheck:'Offline technical benchmark only',blockers:[],activityClass:'research'};
  research.import({opportunities:[{id:'fixture',title:'Fixture problem',sector:'digital-products',hypothesis:'Fixture users may need a guide',
   forecast:{revenueCents:1000,costCents:100,probability:0.5,days:1,validationBudgetCents:50},revenuePath:profile}],
   evidence:[{id:'synthetic',opportunityId:'fixture',sourceUrl:'https://example.test/problem',observedAt:new Date().toISOString(),
    kind:'payment_claim',excerpt:'Synthetic customer says they would buy',provenance:'synthetic',reviewedBy:null}]});
  const brief=research.economicBrief('fixture');
  expect(brief.customerAnalysis.demandProven).toBe(false);expect(brief.test.executionAuthorized).toBe(false);
  expect(brief.decision).toBe('hold');
  expect(brief.revenuePath).toMatchObject({status:'HOLD',externalExecutionAllowed:false,effortMinutes:12,realizedCashNetCents:null});
  expect(brief.revenuePath!.blockers).toContain('SYNTHETIC_NOT_DEMAND');
  for(const condition of profile.conditions){
   const unknown={...profile,conditions:profile.conditions.map(c=>c===condition?{...c,state:'unknown' as const}:c)};
   expect(assessRevenuePath(agent.raw,unknown,now).blockers).toContain(`UNREVIEWED:${condition.requirement}`);
  }
  expect(assessRevenuePath(agent.raw,{...profile,forecast:{...profile.forecast,directCashCents:null}},now).blockers).toContain('ECONOMICS_UNKNOWN');
  expect(assessRevenuePath(agent.raw,profile,now+60001).blockers).toContain(`UNREVIEWED:${profile.conditions[0].requirement}`);
  // Market admission remains HOLD. The following is a separately authorized,
  // neutral synthetic quality/delivery benchmark, not fulfillment of that lead.
  commerce.exec("CREATE TABLE commerce_stripe_config(id INTEGER,mode TEXT);INSERT INTO commerce_stripe_config VALUES(1,'test')");
  registerProductQuality(commerce,{productId:'guide-v1',format:'text',purpose:'Fixture instructions',audience:'Fixture users',minBytes:5,maxBytes:1000,
   requiredText:['Install'],forbiddenText:['guaranteed profit'],requiredJsonKeys:[]});
  const failed=assessProductQuality(commerce,'guide-v1','guide.txt',Buffer.from('Install TODO'));
  expect(failed.passed).toBe(false);
  const asset={filename:'guide.txt',content:Buffer.from('Install locally.')};
  expect(assessProductQuality(commerce,'guide-v1',asset.filename,asset.content).passed).toBe(true);
  assertProductQuality(commerce,'guide-v1',asset);
  // Exercise the real local delivery catalogue, not a mock publication API.
  const delivery=new DigitalDelivery(commerce);
  const registered=delivery.register('guide-v1',asset.filename,asset.content);
  expect(delivery.register('guide-v1',asset.filename,asset.content)).toEqual(registered);
  const stored=commerce.prepare('SELECT content FROM commerce_assets WHERE product_id=?').get('guide-v1') as {content:Buffer};
  expect(stored.content).toEqual(asset.content);
  expect(()=>assertProductQuality(commerce,'guide-v1',{...asset,content:Buffer.from('Install changed instructions.')})).toThrow();
  const marketing=assessMarketingPlan({currency:'USD',product:'guide-v1',audience:'Fixture users',channel:'Fixture channel',offer:'Guide',
   successCriterion:'Authenticated paid demand',stopCriterion:'Stop without paid demand',priceCents:100,deliveryCostCents:10,paymentFeeCents:10,
   refundAllowanceCents:10,taxAllowanceCents:10,acquisitionCostPerSaleCents:10,fixedTestCostCents:10,operatingCostCents:10,availableTestBudgetCents:1000,conservativeSales:1,
   additionalCosts:[{category:'support',basis:'per_sale',cents:100}]});
  expect(marketing.decision).toBe('redesign_or_stop');expect(marketing.campaign.releaseAuthorized).toBe(false);
  const ledger=new ProfitLedger(agent.raw);
  const common={mode:'paper' as const,opportunityId:null,experimentId:null,strategyId:null,businessId:null,productId:'guide-v1',occurredAt:new Date().toISOString()};
  ledger.record({...common,id:'fixture-revenue',kind:'revenue',amountCents:100,category:'other'});
  ledger.record({...common,id:'fixture-cost',kind:'expense',amountCents:170,category:'other'});
  ledger.record({...common,id:'fixture-cost',kind:'expense',amountCents:170,category:'other'});
  expect(()=>ledger.record({...common,id:'fixture-cost',kind:'expense',amountCents:171,category:'other'})).toThrow();
  const totals=JSON.stringify(ledger.aggregate({dimension:'productId'}));
  expect(totals).toContain('"netProfitCents":-70');
  expect(ledger.aggregate({dimension:'productId'}).groups['guide-v1'].realized).toEqual({revenueCents:0,expensesCents:0,netProfitCents:0});
  expect(research.rank()[0].decision).toBe('hold');
  const second=new Database(path.join(dir,'agent.db'),{readonly:true});
  try{expect(new ProfitLedger(second).aggregate({dimension:'productId'})).toEqual(ledger.aggregate({dimension:'productId'}));}
  finally{second.close();}
 }finally{commerce.close();agent.close();fs.rmSync(dir,{recursive:true,force:true});}
});
