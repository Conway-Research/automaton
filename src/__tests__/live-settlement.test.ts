import {fixtureSecurityReview} from './fixtures/security-review.js';
import {liveOrderActionScope} from '../revenue/live-orders.js';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {initializeCapitalBudget,checkCapitalBudget} from '../revenue/capital-budget.js';
import {LiveOrderGateway,type LiveOrderIntent,type VenueSubmission} from '../revenue/live-orders.js';
import {registerLiveSettlementAccount,reconcileClosedOrder,reviewClosedSettlementRecovery,type ClosedOrderSettlement} from '../revenue/live-settlement.js';
import {economicState} from '../revenue/economic-state.js';
import {isProtectedFile} from '../self-mod/code.js';
import {TradingControlPlane,inspectTradingControl} from '../revenue/trading-control.js';
import {registerProfitabilityPolicy,registerStrategyEconomics} from '../revenue/profitability.js';
let dir:string,db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>,gateway:LiveOrderGateway,order:LiveOrderIntent;
beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-settlement-'));db=createDatabase(path.join(dir,'test.db'));other=createDatabase(path.join(dir,'test.db'));
  initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:3000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  gateway=new LiveOrderGateway(db.raw);gateway.configure({edition:{edition:'founder',commercialFeatures:[],permissions:['live_trading'],emergencyStop:false},enabled:true,venueId:'mock',strategies:['test'],designatedTradingCapitalUsdCents:5000,maximumOrderUsdCents:1100,maximumExposureUsdCents:1100,maximumOpenRiskUsdCents:100,maximumOrders:2,maxQuoteAgeMs:10000});
  fixtureSecurityReview(db.raw,liveOrderActionScope(JSON.parse((db.raw.prepare('SELECT policy FROM obolus_live_order_control').get() as {policy:string}).policy)),Date.now());
  order={clientOrderId:'order',strategyId:'test',symbol:'SIM/USD',side:'buy',notionalUsdCents:1000,maximumFeesUsdCents:5,plannedLossUsdCents:25,limitPriceUsdCents:10000,stopPriceUsdCents:9800,quoteObservedAt:Date.now(),expiresAt:Date.now()+60000};
  registerLiveSettlementAccount(db.raw,'mock','account');
});
afterEach(()=>{db.close();other.close();fs.rmSync(dir,{recursive:true});});
const submit=()=>({venueId:'mock',supportsClientOrderId:true as const,submitOnce:vi.fn(async()=>({status:'accepted' as const,venueOrderId:'venue_order'}))});
function receipt():ClosedOrderSettlement{return {clientOrderId:'order',venueOrderId:'venue_order',accountRef:'account',transactionRef:'transaction',currency:'USD',orderFinal:true,positionQuantity:0,liabilitiesFinal:true,debitUsdCents:1002,creditUsdCents:997,retainedUsdCents:0,observedAt:Date.now(),evidenceDigest:'a'.repeat(64)};}
const adapter=(s:ClosedOrderSettlement)=>({venueId:'mock',accountRef:'account',readClosedSettlement:vi.fn(async()=>s)});
it('atomically replaces a full hold with actual capital loss once across connections and survives reopening',async()=>{
  await gateway.submit(order,submit());expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(995);
  const source=adapter(receipt()),results=await Promise.all([reconcileClosedOrder(db.raw,'order',source),reconcileClosedOrder(other.raw,'order',source)]);
  expect(results.filter(r=>!r.duplicate)).toHaveLength(1);
  expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(1995);
  expect(economicState(other.raw).liveOrderExposure).toMatchObject({unresolvedOrders:0,reservedUsdCents:0});
  expect(inspectTradingControl(other.raw)).toMatchObject({settledOrders:1,settlementBlocked:false,orders:[{status:'accepted',count:1,reservedUsdCents:0}]});
  expect(db.raw.prepare("SELECT COUNT(*) n,SUM(amount_cents) cost FROM economic_events WHERE category='settled-capital-loss'").get()).toEqual({n:1,cost:5});
  const reopened=createDatabase(path.join(dir,'test.db'));try{expect(checkCapitalBudget(reopened.raw,0).remainingChfCents).toBe(1995);}finally{reopened.close();}
  expect(()=>db.raw.exec('DELETE FROM obolus_live_order_settlements')).toThrow('immutable');
  expect(isProtectedFile('src/revenue/live-settlement.ts')).toBe(true);
});
it('never credits gains as new CHF capital or reuses an external settlement for another order',async()=>{
  await gateway.submit(order,submit());const s={...receipt(),creditUsdCents:1102};
  expect(await reconcileClosedOrder(db.raw,'order',adapter(s))).toMatchObject({capitalGainCreditedCents:0,uncreditedNetGainUsdCents:100});
  expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(2000);
  await gateway.submit({...order,clientOrderId:'second'},submit());
  await expect(reconcileClosedOrder(db.raw,'second',adapter({...s,clientOrderId:'second'}))).rejects.toThrow();
  expect(checkCapitalBudget(other.raw,0).allowed).toBe(false);
  expect(inspectTradingControl(other.raw).settlementBlocked).toBe(true);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_live_order_settlements').get()).toEqual({n:1});
});
it('attributes reconciled capital depletion to the bound opportunity and detects changed strategy attribution',async()=>{
  await gateway.submit(order,submit());
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('business','fixture','validating')");
  registerProfitabilityPolicy(db.raw,{opportunityId:'business',minimumSamples:3,minimumNetCents:-100,maximumNetCents:100,maximumCumulativeLossCents:100,
    maximumDrawdownCents:100,maximumEvidenceAgeMs:60000,capacityCents:1100,maximumScaleCents:1100,maximumValidationCents:1100,forecastSuccessMeansPositiveNet:true,comparisonBasis:'cohort',reviewedBy:'fixture'});
  registerStrategyEconomics(db.raw,'test','business');
  await reconcileClosedOrder(db.raw,'order',adapter(receipt()));
  expect(db.raw.prepare("SELECT opportunity_id,amount_cents FROM economic_events WHERE category='settled-capital-loss'").get()).toEqual({opportunity_id:'business',amount_cents:5});
  db.raw.exec("UPDATE economic_events SET metadata_json=json_set(metadata_json,'$.strategyId','changed') WHERE category='settled-capital-loss'");
  expect(()=>inspectTradingControl(other.raw)).toThrow('attribution mismatch');
});
it.each(['position','currency','liabilities','stale','account'] as const)('retains liabilities and blocks capital on incomplete %s proof',async failure=>{
  await gateway.submit(order,submit());const valid=receipt(),s={...valid};
  if(failure==='position')s.positionQuantity=1 as 0;
  if(failure==='currency')s.currency='CHF' as 'USD';
  if(failure==='liabilities')s.liabilitiesFinal=false as true;
  if(failure==='stale')s.observedAt-=300001;
  if(failure==='account')s.accountRef='wrong';
  await expect(reconcileClosedOrder(db.raw,'order',adapter(s))).rejects.toThrow('halted');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_live_order_settlements').get()).toEqual({n:0});
  expect(checkCapitalBudget(other.raw,0).allowed).toBe(false);
  await reviewClosedSettlementRecovery(db.raw,'order',adapter(valid),'fixture');
  expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(1995);
  await expect(gateway.submit({...order,clientOrderId:'new'},submit())).rejects.toThrow('disabled');
});
it('records unexpected losses but requires reviewed recovery instead of hiding a risk breach',async()=>{
  await gateway.submit(order,submit());const source=adapter({...receipt(),creditUsdCents:900});
  expect(await reconcileClosedOrder(db.raw,'order',source)).toMatchObject({riskBreach:true,capitalLossUsdCents:102});
  expect(checkCapitalBudget(other.raw,0).allowed).toBe(false);
  await reviewClosedSettlementRecovery(db.raw,'order',source,'fixture');
  expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(1898);
});
it('blocks conflicting late submission acknowledgements after authenticated settlement',async()=>{
  let resolve!:(value:VenueSubmission)=>void;
  const pending=gateway.submit(order,{venueId:'mock',supportsClientOrderId:true,submitOnce:()=>new Promise(r=>{resolve=r;})});
  await reconcileClosedOrder(db.raw,'order',adapter(receipt()));
  resolve({status:'accepted',venueOrderId:'wrong_venue_order'});
  expect(await pending).toEqual({status:'unknown'});
  expect(checkCapitalBudget(other.raw,0).allowed).toBe(false);
});
it('connects the actual control-plane reconciliation path before releasing capital',async()=>{
  await gateway.submit(order,submit());const control=new TradingControlPlane(db.raw);
  const s=receipt();
  const source={...submit(),...adapter(s),readiness:async()=>({authenticated:true,portfolioConsistent:true,observedAt:Date.now()}),
    readOrder:async()=>({clientOrderId:'order',venueOrderId:'venue_order',state:'closed' as const,filledQuantity:0.1,positionQuantity:0,observedAt:s.observedAt})};
  await control.settleClosedOrder('order',source);
  expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(1995);
  expect(source.submitOnce).not.toHaveBeenCalled();
  db.raw.prepare("UPDATE economic_events SET amount_cents=0 WHERE category='settled-capital-loss'").run();
  expect(()=>checkCapitalBudget(other.raw,0)).toThrow('accounting mismatch');
});
it('excludes only verified settled submissions from the control-plane uncertainty gate',async()=>{
  let complete!:(value:VenueSubmission)=>void;
  const pending=gateway.submit(order,{venueId:'mock',supportsClientOrderId:true,submitOnce:()=>new Promise(resolve=>{complete=resolve;})});
  const control=new TradingControlPlane(other.raw);control.activate('LIVE-AUTONOMOUS','ACTIVATE LIVE-AUTONOMOUS');
  const settled=receipt();
  const source={...submit(),readiness:vi.fn(async()=>({authenticated:true,portfolioConsistent:true,observedAt:Date.now()})),
    readOrder:async()=>({clientOrderId:'order',venueOrderId:'venue_order',state:'closed' as const,filledQuantity:0.1,positionQuantity:0,observedAt:settled.observedAt})};
  const decision={thesis:'Fixture',invalidation:'Fixture invalidated',exitRule:'Stop',targetsUsdCents:[11000],intent:{...order,clientOrderId:'next'}};
  await expect(control.submit(decision,source)).rejects.toThrow('Unresolved order');
  expect(source.readiness).not.toHaveBeenCalled();
  await control.settleClosedOrder('order',{...source,...adapter(settled)});
  expect(db.raw.prepare('SELECT status FROM obolus_live_order_holds WHERE client_id=?').get('order')).toEqual({status:'pending'});
  await expect(control.submit(decision,source)).resolves.toMatchObject({status:'accepted'});
  expect(source.submitOnce).toHaveBeenCalledTimes(1);
  complete({status:'accepted',venueOrderId:'venue_order'});await pending;
});
