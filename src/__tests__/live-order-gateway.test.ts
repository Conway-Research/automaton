import {fixtureSecurityReview} from './fixtures/security-review.js';
import {liveOrderActionScope} from '../revenue/live-orders.js';
import {revokeActionReview} from '../security/action-gate.js';
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createDatabase} from "../state/database.js";
import {LiveOrderGateway,type LiveOrderPolicy,type LiveOrderIntent,type VenueSubmission} from "../revenue/live-orders.js";
import {initializeCapitalBudget,checkCapitalBudget} from "../revenue/capital-budget.js";
import {registerProfitabilityPolicy,registerStrategyEconomics} from '../revenue/profitability.js';
import {LiveDailyLossMonitor} from '../revenue/live-daily-loss.js';
import {registerLiveSettlementAccount} from '../revenue/live-settlement.js';
let dir:string,db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>;
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"obolus-live-mock-"));db=createDatabase(path.join(dir,"test.db"));other=createDatabase(path.join(dir,"test.db"));
  fixtureSecurityReview(db.raw,liveOrderActionScope(policy),1000);
  initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:3000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+100000});});
afterEach(()=>{db.close();other.close();fs.rmSync(dir,{recursive:true});});
const policy:LiveOrderPolicy={edition:{edition:"founder",commercialFeatures:[],permissions:["live_trading"],emergencyStop:false},enabled:true,
  venueId:"mock-venue",strategies:["validated"],designatedTradingCapitalUsdCents:5000,maximumOrderUsdCents:1100,
  maximumExposureUsdCents:1100,maximumOpenRiskUsdCents:100,maximumOrders:2,maxQuoteAgeMs:1000};
const order:LiveOrderIntent={clientOrderId:"order-1",strategyId:"validated",symbol:"BTC/USD",side:"buy",notionalUsdCents:1000,
  maximumFeesUsdCents:5,plannedLossUsdCents:25,limitPriceUsdCents:10000,stopPriceUsdCents:9800,quoteObservedAt:1000,expiresAt:2000};
it('blocks new reservations before provider I/O when the configured daily headroom is insufficient',async()=>{
 const gateway=new LiveOrderGateway(db.raw,()=>1100);gateway.configure(policy);
 registerLiveSettlementAccount(db.raw,'mock-venue','fixture');
 const monitor=new LiveDailyLossMonitor(other.raw,()=>1100);
 monitor.configure({venue:'mock-venue',account:'fixture',currency:'USD',startsAt:1000,endsAt:86401000,
  openingEquityCents:5000,maximumLossCents:100,maximumAgeMs:1000});
 monitor.observe({venue:'mock-venue',account:'fixture',currency:'USD',observedAt:1100,equityAfterFeesCents:4920,netExternalFlowCents:0});
 const submitOnce=vi.fn();
 await expect(gateway.submit(order,{venueId:'mock-venue',supportsClientOrderId:true,submitOnce})).rejects.toThrow('headroom');
 expect(submitOnce).not.toHaveBeenCalled();
 expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_live_order_holds').get()).toEqual({n:0});
});
it.each([undefined,'different-account'])('rejects absent or mismatched daily risk account binding: %s',async account=>{
 const gateway=new LiveOrderGateway(db.raw,()=>1100);gateway.configure(policy);
 if(account)registerLiveSettlementAccount(db.raw,'mock-venue',account);
 const monitor=new LiveDailyLossMonitor(db.raw,()=>1100);
 monitor.configure({venue:'mock-venue',account:'fixture',currency:'USD',startsAt:1000,endsAt:86401000,
  openingEquityCents:5000,maximumLossCents:100,maximumAgeMs:1000});
 monitor.observe({venue:'mock-venue',account:'fixture',currency:'USD',observedAt:1100,equityAfterFeesCents:5000,netExternalFlowCents:0});
 const submitOnce=vi.fn();
 await expect(gateway.submit(order,{venueId:'mock-venue',supportsClientOrderId:true,submitOnce})).rejects.toThrow(/account/);
 expect(submitOnce).not.toHaveBeenCalled();
 expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_live_order_holds').get()).toEqual({n:0});
});
it('security: revoked compliance evidence blocks new orders across connections before reservation or provider I/O',async()=>{
 const gateway=new LiveOrderGateway(db.raw,()=>1100);gateway.configure(policy);
 revokeActionReview(other.raw,liveOrderActionScope(policy));
 const submitOnce=vi.fn();
 await expect(gateway.submit(order,{venueId:'mock-venue',supportsClientOrderId:true,submitOnce})).rejects.toThrow('REVIEW_REVOKED');
 expect(submitOnce).not.toHaveBeenCalled();
 expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_live_order_holds').get()).toEqual({n:0});
});
it('enforces the shared economic lifecycle before order reservation and rejects strategy renaming',async()=>{
  const gateway=new LiveOrderGateway(db.raw,()=>1100);gateway.configure(policy);
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('econ','fixture','validating')");
  registerProfitabilityPolicy(db.raw,{opportunityId:'econ',minimumSamples:3,minimumNetCents:-1000,maximumNetCents:1000,maximumCumulativeLossCents:100,maximumDrawdownCents:100,
    maximumEvidenceAgeMs:60000,capacityCents:1100,maximumScaleCents:1100,maximumValidationCents:1100,forecastSuccessMeansPositiveNet:true,comparisonBasis:'cohort',reviewedBy:'fixture'});
  const submitOnce=vi.fn(async()=>({status:'accepted' as const,venueOrderId:'mock'})),adapter={venueId:'mock-venue',supportsClientOrderId:true as const,submitOnce};
  await expect(gateway.submit(order,adapter)).rejects.toThrow('attribution');
  registerStrategyEconomics(db.raw,'validated','econ');
  await expect(new LiveOrderGateway(other.raw,()=>1100).submit(order,adapter)).rejects.toThrow('HYPOTHESIS');
  await expect(gateway.submit({...order,strategyId:'renamed'},adapter)).rejects.toThrow('attribution');
  expect(submitOnce).not.toHaveBeenCalled();
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_live_order_holds').get()).toEqual({n:0});
});
it("reserves across two connections before I/O and never resubmits an in-flight order",async()=>{
  const first=new LiveOrderGateway(db.raw,()=>1100),second=new LiveOrderGateway(other.raw,()=>1100);first.configure(policy);
  let complete!:(result:VenueSubmission)=>void;
  const submitOnce=vi.fn(()=>new Promise<VenueSubmission>(resolve=>{complete=resolve;}));
  const adapter={venueId:"mock-venue",supportsClientOrderId:true as const,submitOnce};
  const pending=first.submit(order,adapter);
  expect(checkCapitalBudget(other.raw,1000).allowed).toBe(false);
  expect(await second.submit(order,adapter)).toEqual({status:"unknown"});
  await expect(second.submit({...order,clientOrderId:"order-2"},adapter)).rejects.toThrow("exposure");
  complete({status:"accepted",venueOrderId:"venue-1"});expect((await pending).status).toBe("accepted");
  expect(await new LiveOrderGateway(other.raw,()=>1100).submit(order,adapter)).toEqual({status:"accepted",venueOrderId:"venue-1"});
  expect(submitOnce).toHaveBeenCalledTimes(1);
});
it("keeps uncertain costs after provider errors and never logs private provider errors",async()=>{
  const gateway=new LiveOrderGateway(db.raw,()=>1100);gateway.configure(policy);
  const submitOnce=vi.fn(async()=>{throw new Error("SECRET_PROVIDER_PAYLOAD");});
  const adapter={venueId:"mock-venue",supportsClientOrderId:true as const,submitOnce};
  expect(await gateway.submit(order,adapter)).toEqual({status:"unknown"});
  expect(await new LiveOrderGateway(other.raw,()=>1100).submit(order,adapter)).toEqual({status:"unknown"});
  expect(submitOnce).toHaveBeenCalledTimes(1);
  expect(checkCapitalBudget(other.raw,1000).allowed).toBe(false);
  expect(JSON.stringify(db.raw.prepare("SELECT * FROM obolus_live_order_holds").all())).not.toContain("SECRET_PROVIDER_PAYLOAD");
});
it("defaults disabled and enforces risk, expiry, explicit venue and emergency stop before provider calls",async()=>{
  const gateway=new LiveOrderGateway(db.raw,()=>1100),submitOnce=vi.fn();
  const adapter={venueId:"mock-venue",supportsClientOrderId:true as const,submitOnce};
  await expect(gateway.submit(order,adapter)).rejects.toThrow("disabled");gateway.configure(policy);
  // Even an untyped caller cannot override host time with a third argument.
  await expect((new LiveOrderGateway(other.raw) as any).submit(order,adapter,1100)).rejects.toThrow("risk");
  await expect(gateway.submit({...order,plannedLossUsdCents:101},adapter)).rejects.toThrow("risk");
  await expect(gateway.submit({...order,privateKey:"unwanted"} as LiveOrderIntent,adapter)).rejects.toThrow("Invalid funded");
  await expect(gateway.submit({...order,plannedLossUsdCents:1},adapter)).rejects.toThrow("risk");
  await expect(gateway.submit({...order,expiresAt:1050},adapter)).rejects.toThrow("risk");
  await expect(gateway.submit(order,{...adapter,venueId:"other"})).rejects.toThrow("venue");
  gateway.emergencyStop();await expect(gateway.submit(order,adapter)).rejects.toThrow("disabled");
  expect(submitOnce).not.toHaveBeenCalled();
});
it("does not return arbitrary fields from an accepted provider response",async()=>{
  const gateway=new LiveOrderGateway(db.raw,()=>1100);gateway.configure(policy);
  const response={status:"accepted" as const,venueOrderId:"venue-1",debug:"PRIVATE_PROVIDER_CONTEXT"};
  expect(await gateway.submit(order,{venueId:"mock-venue",supportsClientOrderId:true,submitOnce:async()=>response})).toEqual({status:"accepted",venueOrderId:"venue-1"});
  expect(JSON.stringify(db.raw.prepare("SELECT * FROM obolus_live_order_holds").all())).not.toContain("PRIVATE_PROVIDER_CONTEXT");
});
it.each([null,"invalid/venue", "x".repeat(101)])("fails closed on a corrupted persisted acceptance without resubmission: %s",async venueOrderId=>{
  const gateway=new LiveOrderGateway(db.raw,()=>1100);gateway.configure(policy);
  const submitOnce=vi.fn(async()=>({status:"accepted" as const,venueOrderId:"venue-1"}));
  const adapter={venueId:"mock-venue",supportsClientOrderId:true as const,submitOnce};
  await gateway.submit(order,adapter);
  other.raw.prepare("UPDATE obolus_live_order_holds SET venue_order_id=? WHERE client_id=?").run(venueOrderId,order.clientOrderId);
  const restarted=new LiveOrderGateway(other.raw,()=>1100);
  expect(await restarted.submit(order,adapter)).toEqual({status:"unknown"});
  expect(submitOnce).toHaveBeenCalledTimes(1);expect(checkCapitalBudget(other.raw,1000).allowed).toBe(false);
  expect(other.raw.prepare("SELECT usd_cents,status FROM obolus_live_order_holds").get()).toEqual({usd_cents:1005,status:"accepted"});
  await expect(gateway.submit({...order,clientOrderId:"new-order"},adapter)).rejects.toThrow("disabled");
});
