import {expect,it} from "vitest";
import {assessMarketingPlan,type MarketingPlan} from "../revenue/marketing.js";
import {createBuiltinTools} from "../agent/tools.js";
import type {ToolContext} from "../types.js";
const plan:MarketingPlan={currency:"CHF",product:"fixture template",audience:"fixture businesses",channel:"authorized product listing",offer:"template download",
  successCriterion:"attributable paid orders",stopCriterion:"stop at cost ceiling or no paid demand",priceCents:1000,deliveryCostCents:100,paymentFeeCents:50,
  refundAllowanceCents:50,taxAllowanceCents:100,acquisitionCostPerSaleCents:200,fixedTestCostCents:500,operatingCostCents:100,availableTestBudgetCents:5000,conservativeSales:2};
it('reports human time without changing price thresholds, costs or net forecasts',()=>{
  const baseline=assessMarketingPlan(plan),result=assessMarketingPlan({...plan,humanInterventionMinutes:600});
  expect(result.personnelCostPolicy).toMatchObject({personnelCostsIncluded:false,imputedHourlyRateCents:0});
  expect(result.humanInterventionMinutes).toBe(600);
  expect(result.forecastNetCents).toBe(baseline.forecastNetCents);
  expect(result.grossOutlayCents).toBe(baseline.grossOutlayCents);
  expect(result.thresholds).toEqual(baseline.thresholds);
  expect(()=>assessMarketingPlan({...plan,humanInterventionMinutes:-1})).toThrow();
});
it.each(['personnelCostCents','employeeCosts','laborCostCents','labourCostCents','hourlyRateCents','salaryCents'])(
  'rejects explicit personnel monetary input %s instead of silently accepting it',key=>{
    expect(()=>assessMarketingPlan({...plan,[key]:3500})).toThrow(/Personnel costs/);
  });
it('rejects personnel cost categories and keeps non-personnel support costs',()=>{
  expect(()=>assessMarketingPlan({...plan,additionalCosts:[{category:'personnel',basis:'fixed',cents:3500}] as unknown as MarketingPlan['additionalCosts']})).toThrow();
  expect(assessMarketingPlan({...plan,additionalCosts:[{category:'support',basis:'fixed',cents:100}]}).forecastNetCents).toBe(300);
});
it('stresses price, volume and costs jointly while exposing forecast bottlenecks rather than claiming evidence',()=>{
 const report=assessMarketingPlan(plan);
 expect(report.stress.scenarios).toMatchObject([{id:'half_sales',netCents:-100},{id:'joint_downside',netCents:-420}]);
 expect(report.costDrivers[0]).toEqual({category:'fixed_test',costCents:500});
 expect(assessMarketingPlan({...plan,availableTestBudgetCents:1}).bottleneck).toBe('available_test_capital');
 expect(assessMarketingPlan(plan,[{id:'unchanged',priceBps:10000,salesBps:10000,variableCostBps:10000,fixedCostBps:10000}]).stress.worstNetCents).toBe(report.forecastNetCents);
 expect(()=>assessMarketingPlan(plan,[{id:'bad',priceBps:-1,salesBps:0,variableCostBps:0,fixedCostBps:0}])).toThrow();
});
it("includes operating, acquisition, payment, delivery, refund and tax allowances",()=>{
  expect(assessMarketingPlan(plan)).toMatchObject({decision:"candidate_for_bounded_validation",contributionPerSaleCents:500,forecastNetCents:400,grossOutlayCents:1600,breakEvenSales:2});
});
it("rejects forecast-funded marketing even when eventual net profit is positive",()=>{
  expect(assessMarketingPlan({...plan,availableTestBudgetCents:1500})).toMatchObject({decision:"redesign_or_stop",forecastNetCents:400,blockers:expect.arrayContaining([expect.stringContaining("Gross test outlay")])});
});
it("does not scale a losing offer or assume repeat purchases",()=>{
  expect(assessMarketingPlan({...plan,acquisitionCostPerSaleCents:800})).toMatchObject({decision:"redesign_or_stop",breakEvenSales:null});
  expect(assessMarketingPlan({...plan,conservativeSales:0}).decision).toBe("redesign_or_stop");
});
it("rejects omitted allowances and incomplete stop criteria",()=>{
  expect(()=>assessMarketingPlan({...plan,taxAllowanceCents:undefined!})).toThrow();
  expect(()=>assessMarketingPlan({...plan,stopCriterion:""})).toThrow();
});
it("exposes the assessment to the agent without requiring external execution",async()=>{
  const tool=createBuiltinTools("fixture").find(t=>t.name==="revenue_assess_marketing")!;
  const result=JSON.parse(await tool.execute({plan},{} as ToolContext));
  expect(result.currency).toBe("CHF");
  expect(result.evidence).toContain("forecasts");
  expect(result.execution).toContain("neither reserves funds nor publishes");
  expect(result.thresholds.minimumPriceForPositiveNetCents).toBe(801);
});
it('distinguishes exact break-even from the first positive integer-cent result',()=>{
  const thresholds=assessMarketingPlan(plan).thresholds;
  expect(thresholds).toMatchObject({minimumPriceForPositiveNetCents:801,maximumAcquisitionCostForPositiveNetCents:399,minimumSalesForPositiveNet:2});
  expect(assessMarketingPlan({...plan,priceCents:800}).forecastNetCents).toBe(0);
  expect(assessMarketingPlan({...plan,priceCents:801}).forecastNetCents).toBe(2);
  expect(assessMarketingPlan({...plan,acquisitionCostPerSaleCents:400}).forecastNetCents).toBe(0);
  expect(assessMarketingPlan({...plan,acquisitionCostPerSaleCents:399}).forecastNetCents).toBe(2);
});
it('does not invent a finite price or acquisition threshold without sales',()=>{
  expect(assessMarketingPlan({...plan,conservativeSales:0}).thresholds).toMatchObject({minimumPriceForPositiveNetCents:null,maximumAcquisitionCostForPositiveNetCents:null});
  expect(assessMarketingPlan({...plan,priceCents:100}).thresholds).toMatchObject({maximumAcquisitionCostForPositiveNetCents:null,minimumSalesForPositiveNet:null});
});
it('matches sensitivity to recomputed forecasts without changing authorization',()=>{
  const baseline=assessMarketingPlan(plan);
  expect(assessMarketingPlan({...plan,priceCents:1001}).forecastNetCents-baseline.forecastNetCents).toBe(baseline.thresholds.netChangePerOneCentPriceIncrease);
  expect(assessMarketingPlan({...plan,deliveryCostCents:99}).forecastNetCents-baseline.forecastNetCents).toBe(baseline.thresholds.netChangePerOneCentUnitCostReduction);
  expect(assessMarketingPlan({...plan,operatingCostCents:99}).forecastNetCents-baseline.forecastNetCents).toBe(baseline.thresholds.netChangePerOneCentFixedCostReduction);
  expect(assessMarketingPlan({...plan,priceCents:801,availableTestBudgetCents:0}).decision).toBe('redesign_or_stop');
});
it('attributes support, fulfillment and failure allowances to net economics and cash need',()=>{
 const result=assessMarketingPlan({...plan,additionalCosts:[{category:'support',basis:'per_sale',cents:150},{category:'fulfillment',basis:'per_sale',cents:50},{category:'failure',basis:'fixed',cents:100}]});
 expect(result).toMatchObject({forecastNetCents:-100,grossOutlayCents:2100,decision:'redesign_or_stop',costTruth:{state:'ESTIMATED'}});
 expect(result.costDrivers).toContainEqual({category:'support:per_sale',costCents:300});
 expect(result.stress.worstNetCents).toBeLessThan(-100);
});
it('unknown costs cannot obtain admission through a high conditional net forecast',()=>{
 const result=assessMarketingPlan({...plan,priceCents:100000,additionalCosts:[{category:'support',basis:'per_sale',cents:null}]});
 expect(result).toMatchObject({decision:'redesign_or_stop',costTruth:{state:'UNKNOWN',completeNetForecast:false,unknownCosts:['support:per_sale']}});
 expect(result.blockers).toContain('Unknown attributable costs require estimation before bounded validation');
});
it('rejects negative or duplicate cost dimensions rather than silently double accounting',()=>{
 const cost={category:'research' as const,basis:'fixed' as const,cents:1};
 expect(()=>assessMarketingPlan({...plan,additionalCosts:[cost,cost]})).toThrow();
 expect(()=>assessMarketingPlan({...plan,additionalCosts:[{...cost,cents:-1}]})).toThrow();
});
