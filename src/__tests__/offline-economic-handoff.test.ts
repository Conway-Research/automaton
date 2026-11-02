import {afterEach, beforeEach, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {ResearchStore, type ResearchOpportunity} from '../revenue/research.js';
import {assessMarketingPlan, type MarketingPlan} from '../revenue/marketing.js';
import {ProfitLedger} from '../revenue/profit-ledger.js';
import {assessCustomerAnalysis, CUSTOMER_FIELDS, type CustomerAnalysis} from '../revenue/customer-analysis.js';
import {marketDecisionReport} from '../revenue/market-decision.js';
import {registerProductQuality, assessProductQuality, assertProductQuality} from '../commerce/product-quality.js';

// Fixed offline data. Even records labelled "reported" below are synthetic test
// fixtures, used solely to exercise the real research/review boundaries.
const now = Date.parse('2026-10-02T00:00:00Z');
let directory: string, db: ReturnType<typeof createDatabase>, research: ResearchStore;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'obolus-economic-handoff-'));
  db = createDatabase(path.join(directory, 'fixture.db'));
  research = new ResearchStore(db.raw);
});
afterEach(() => { db.close(); fs.rmSync(directory, {recursive:true, force:true}); });
function plan(product: string): MarketingPlan {
  return {currency:'USD', product, audience:'Fixture operators', channel:'Fixture channel', offer:'Bounded offline artifact',
    successCriterion:'Independently reconciled customer outcome', stopCriterion:'Stop at budget or invalidated hypothesis',
    priceCents:1000, deliveryCostCents:100, paymentFeeCents:30, refundAllowanceCents:50, taxAllowanceCents:20,
    acquisitionCostPerSaleCents:100, fixedTestCostCents:100, operatingCostCents:50, availableTestBudgetCents:1000,
    conservativeSales:2, additionalCosts:[{category:'support',basis:'per_sale',cents:50}]};
}
function seed(id: string, sector: ResearchOpportunity['sector'] = 'software') {
  const economics = plan(id), cost = assessMarketingPlan(economics);
  research.import({opportunities:[{id, title:`Fixture ${id}`, sector, hypothesis:'Synthetic bounded product hypothesis', economics,
    forecast:{revenueCents:2000,costCents:cost.grossOutlayCents-100,validationBudgetCents:100,probability:0.8,days:2}}],
    evidence:['a','b'].map((suffix, index) => ({id:`${id}-${suffix}`,opportunityId:id,sourceUrl:`https://${suffix}.example.test/problem`,
      observedAt:new Date(now).toISOString(),kind:'request' as const,excerpt:`Fixture problem ${index}. No willingness to pay measured.`,
      provenance:'reported' as const,reviewedBy:null}))});
  const evidence = research.evidence(id);
  const analysis: CustomerAnalysis = {version:1,claims:CUSTOMER_FIELDS.map(field => ({field, statement:'Fixture problem 0.',
    method:'Fixture quotation',confidence:1,citations:[{evidenceId:evidence[0].id,evidenceDigest:evidence[0].digest,
      quote:'Fixture problem 0.',direction:'supports'}]})), alternatives:evidence.map((e,i) => ({name:`Fixture alternative ${i}`,
      kind:'direct',currency:'USD',priceCents:1000,periodDays:30,units:1,scope:'bounded fixture',evidenceId:e.id,evidenceDigest:e.digest}))};
  return {economics,analysis,evidence};
}

it('revalidates evidence at the research-to-design handoff and never converts quotations into paid demand', () => {
  const {economics,analysis,evidence} = seed('workflow');
  expect(research.rank(now)[0].decision).toBe('hold');
  for (const e of evidence) research.review(e.id,'fixture-reviewer','accept','Offline fixture only');
  expect(research.rank(now)[0].decision).toBe('validate');
  const report = marketDecisionReport(db.raw,'workflow',analysis,economics,now);
  expect(report).toMatchObject({executionAuthorized:false,scalingAuthorized:false,profitabilityProven:false,totalScore:null});
  expect(report.gates.every(g => !g.passed)).toBe(true);
  expect(report.unknown).toContain('purchaseIntent');
  expect(assessCustomerAnalysis(db.raw,'workflow',analysis,now).demandProven).toBe(false);
  const stale = marketDecisionReport(db.raw,'workflow',analysis,economics,now+91*86400000);
  expect(stale.unknown).toContain('willingnessToPay');
  expect(research.rank(now+91*86400000)[0].decision).toBe('hold');
  analysis.marketClaims = [{...analysis.claims[0],field:'alternativeWeakness',
    citations:[{...analysis.claims[0].citations[0],direction:'contradicts'}]}];
  expect(marketDecisionReport(db.raw,'workflow',analysis,economics,now).recommendation).toBe('pause_and_resolve');
  research.review(evidence[0].id,'fixture-reviewer','reject','Contradictory fixture');
  expect(research.rank(now)[0].decision).toBe('hold');
});

it('keeps product quality, costs and paper results version-scoped through restart and duplicate delivery', () => {
  seed('workflow'); seed('csv','data-products');
  db.raw.exec("CREATE TABLE commerce_stripe_config(id INTEGER,mode TEXT);INSERT INTO commerce_stripe_config VALUES(1,'test')");
  for (const productId of ['workflow','csv']) registerProductQuality(db.raw,{productId,format:'text',purpose:'Fixture instructions',
    audience:'Fixture operators',minBytes:5,maxBytes:1000,requiredText:['Install'],forbiddenText:['guaranteed profit'],requiredJsonKeys:[]});
  const asset = {filename:'guide.txt',content:Buffer.from('Install locally.')};
  expect(assessProductQuality(db.raw,'workflow',asset.filename,Buffer.from('Install TODO')).passed).toBe(false);
  expect(assessProductQuality(db.raw,'workflow',asset.filename,asset.content).passed).toBe(true);
  assertProductQuality(db.raw,'workflow',asset);
  expect(() => assertProductQuality(db.raw,'csv',asset)).toThrow();
  expect(() => assertProductQuality(db.raw,'workflow',{...asset,content:Buffer.from('Install changed.')})).toThrow();
  const ledger = new ProfitLedger(db.raw);
  const common = {mode:'paper' as const,opportunityId:null,experimentId:null,strategyId:null,businessId:null,occurredAt:new Date(now).toISOString()};
  const receipt = {...common,id:'workflow-receipt',productId:'workflow',kind:'revenue' as const,amountCents:1000,category:'other' as const};
  ledger.record(receipt); ledger.record(receipt);
  ledger.record({...common,id:'workflow-cost',productId:'workflow',kind:'expense',amountCents:1200,category:'experiment'});
  ledger.record({...common,id:'csv-cost',productId:'csv',kind:'expense',amountCents:100,category:'experiment'});
  expect(() => ledger.record({...receipt,productId:'csv'})).toThrow();
  db.close(); db = createDatabase(path.join(directory,'fixture.db')); research = new ResearchStore(db.raw);
  const resumed = new ProfitLedger(db.raw); resumed.record(receipt);
  const totals = resumed.aggregate({dimension:'productId'});
  expect(totals.groups.workflow.paper).toEqual({revenueCents:1000,expensesCents:1200,netProfitCents:-200});
  expect(totals.groups.csv.paper.netProfitCents).toBe(-100);
  expect(totals.groups.workflow.realized.netProfitCents).toBe(0);
  expect(totals.verification).toBe('accounting_declarations_not_external_authentication');
  expect(research.rank(now).every(r => r.decision==='hold')).toBe(true);
});

it.each(['support','capital','unknown'] as const)('blocks a positive-looking offer with %s constraints without granting spend', kind => {
  const {economics,analysis} = seed('offer');
  if (kind==='support') economics.additionalCosts = [{category:'support',basis:'per_sale',cents:1000}];
  if (kind==='capital') economics.availableTestBudgetCents = 1;
  if (kind==='unknown') economics.additionalCosts = [{category:'support',basis:'per_sale',cents:null}];
  const result = marketDecisionReport(db.raw,'offer',analysis,economics,now);
  expect(result.recommendation).toBe('redesign_or_stop');
  expect(result.nextTest.authorizedSpendCents).toBe(0);
  expect(result.executionAuthorized).toBe(false);
});
