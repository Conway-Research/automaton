import {fixtureSecurityReview} from './fixtures/security-review.js';
import {liveOrderActionScope} from '../revenue/live-orders.js';
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createDatabase} from "../state/database.js";
import {initializeCapitalBudget} from "../revenue/capital-budget.js";
import {LiveOrderGateway,type LiveOrderPolicy} from "../revenue/live-orders.js";
import {TradingControlPlane,inspectTradingControl,planPositionExit,type TradeDecision,type OrderObservation} from "../revenue/trading-control.js";
import {main} from "../v1/cli.js";
let dir:string,db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>,now:number;
const policy:LiveOrderPolicy={edition:{edition:"founder",commercialFeatures:[],permissions:["live_trading"],emergencyStop:false},enabled:true,
  venueId:"mock",strategies:["validated"],designatedTradingCapitalUsdCents:5000,maximumOrderUsdCents:1100,maximumExposureUsdCents:1100,maximumOpenRiskUsdCents:100,maximumOrders:2,maxQuoteAgeMs:1000};
const decision:TradeDecision={thesis:"Validated simulation",invalidation:"Demand signal disappears",exitRule:"Stop or target",targetsUsdCents:[11000],
  intent:{clientOrderId:"test-1",strategyId:"validated",symbol:"BTC/USD",side:"buy",notionalUsdCents:1000,maximumFeesUsdCents:5,plannedLossUsdCents:25,limitPriceUsdCents:10000,stopPriceUsdCents:9800,quoteObservedAt:1000,expiresAt:2000}};
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"obolus-trading-control-"));db=createDatabase(path.join(dir,"test.db"));other=createDatabase(path.join(dir,"test.db"));now=1100;
  initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:3000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+100000});
  new LiveOrderGateway(db.raw,()=>now).configure(policy);
  fixtureSecurityReview(db.raw,liveOrderActionScope(policy),now);
});
afterEach(()=>{vi.useRealTimers();db.close();other.close();fs.rmSync(dir,{recursive:true});});
function adapter(){return {venueId:"mock",supportsClientOrderId:true as const,
  readiness:vi.fn(async()=>({authenticated:true,portfolioConsistent:true,observedAt:now})),
  submitOnce:vi.fn(async()=>({status:"accepted" as const,venueOrderId:"venue-1"})),
  readOrder:vi.fn(async():Promise<OrderObservation>=>({clientOrderId:"test-1",venueOrderId:"venue-1",state:"accepted",filledQuantity:0,positionQuantity:0,observedAt:now}))};}
function cancellationAdapter(){return {...adapter(),supportsIdempotentCancellation:true as const,cancellationFeeUsdCents:0 as const,
  cancelOnce:vi.fn(async()=>({status:"accepted" as "accepted"|"rejected"|"unknown"}))};}
it.each(["latch","legacy"])("honours a gateway-only %s halt across connections before broker I/O",async source=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  if(source==="latch")other.raw.prepare("INSERT INTO obolus_live_order_halt VALUES(1)").run();
  else other.raw.prepare("UPDATE obolus_live_order_control SET halted=1 WHERE id=1").run();
  const restarted=new TradingControlPlane(other.raw,()=>now);
  expect(control.status()).toEqual({mode:"LIVE-AUTONOMOUS",halted:true});
  expect(restarted.status()).toEqual(control.status());expect(inspectTradingControl(other.raw)).toMatchObject(control.status());
  expect(()=>restarted.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS")).toThrow("reviewed recovery");
  await expect(control.submit(decision,venue)).rejects.toThrow("not active");
  expect(venue.readiness).not.toHaveBeenCalled();expect(venue.submitOnce).not.toHaveBeenCalled();
  expect(db.raw.prepare("SELECT COUNT(*) n FROM obolus_trading_decisions").get()).toEqual({n:0});
});
it("does not approve new manual orders after a gateway-only emergency stop",()=>{
  const control=new TradingControlPlane(db.raw,()=>now);control.activate("LIVE-MANUAL","ACTIVATE LIVE-MANUAL");
  new LiveOrderGateway(other.raw,()=>now).emergencyStop();
  expect(()=>control.approve(decision,"APPROVE test-1")).toThrow("not active");
  expect(db.raw.prepare("SELECT COUNT(*) n FROM obolus_trading_approvals").get()).toEqual({n:0});
});
it("still permits risk-reducing cancellation under a gateway-only stop",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  await control.submit(decision,venue);new LiveOrderGateway(other.raw,()=>now).emergencyStop();
  expect((await control.cancelEntry("test-1",venue)).status).toBe("accepted");
  expect(control.status().halted).toBe(true);expect(venue.cancelOnce).toHaveBeenCalledTimes(1);
  expect(db.raw.prepare("SELECT usd_cents FROM obolus_live_order_holds").get()).toEqual({usd_cents:1005});
});
it.each(["rejected","different-id"])("retains exposure when a late submission contradicts an observed order: %s",async failure=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  let complete!:(value:{status:"accepted";venueOrderId:string}|{status:"rejected"})=>void;
  const submitOnce=vi.fn(()=>new Promise<{status:"accepted";venueOrderId:string}|{status:"rejected"}>(resolve=>{complete=resolve;}));
  const pending=control.submit(decision,{...venue,submitOnce});
  await vi.waitFor(()=>expect(submitOnce).toHaveBeenCalledTimes(1));
  await new TradingControlPlane(other.raw,()=>now).reconcile("test-1",venue);
  complete(failure==="rejected"?{status:"rejected"}:{status:"accepted",venueOrderId:"different-id"});
  expect((await pending).status).toBe("unknown");expect(control.status().halted).toBe(true);
  expect(db.raw.prepare("SELECT usd_cents,status FROM obolus_live_order_holds").get()).toEqual({usd_cents:1005,status:"unknown"});
  expect(control.observation("test-1")?.state).toBe("accepted");
});
it("accepts a late matching response without dropping an already observed fill",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  let complete!:(value:{status:"accepted";venueOrderId:string})=>void;
  venue.submitOnce.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  const pending=control.submit(decision,venue);await vi.waitFor(()=>expect(venue.submitOnce).toHaveBeenCalledTimes(1));
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"filled",filledQuantity:0.1,positionQuantity:0.1,observedAt:now});
  await new TradingControlPlane(other.raw,()=>now).reconcile("test-1",venue);complete({status:"accepted",venueOrderId:"venue-1"});
  expect((await pending).status).toBe("accepted");expect(control.observation("test-1")?.state).toBe("filled");expect(control.status().halted).toBe(false);
});
it.each(["DISABLED","PAPER"] as const)("never requests a real cancellation in %s",async mode=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate(mode,`ACTIVATE ${mode}`);
  await expect(control.cancelEntry("test-1",venue)).rejects.toThrow("not active");expect(venue.readiness).not.toHaveBeenCalled();expect(venue.cancelOnce).not.toHaveBeenCalled();
});
it("requires manual cancellation approval and preserves capital after acknowledgement",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-MANUAL","ACTIVATE LIVE-MANUAL");control.approve(decision,"APPROVE test-1");await control.submit(decision,venue);
  await expect(control.cancelEntry("test-1",venue)).rejects.toThrow("approval");
  expect((await control.cancelEntry("test-1",venue,"CANCEL test-1")).status).toBe("accepted");
  expect(control.observation("test-1")?.state).toBe("accepted");
  expect(db.raw.prepare("SELECT usd_cents,status FROM obolus_live_order_holds").get()).toEqual({usd_cents:1005,status:"accepted"});
  expect(inspectTradingControl(db.raw).cancellations).toEqual([{status:"accepted",count:1}]);
});
it("autonomously requests one cancellation across concurrent connections and restart",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  const second=new TradingControlPlane(other.raw,()=>now);
  const results=await Promise.all([control.cancelEntry("test-1",venue),second.cancelEntry("test-1",venue)]);
  expect(new Set(results.map(result=>result.requestId)).size).toBe(1);expect(venue.cancelOnce).toHaveBeenCalledTimes(1);
  expect((await new TradingControlPlane(other.raw,()=>now).cancelEntry("test-1",venue)).status).toBe("accepted");
  expect(venue.cancelOnce).toHaveBeenCalledTimes(1);
});
it("permits cancelling existing live exposure during halt without clearing the halt",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);control.halt();
  expect((await control.cancelEntry("test-1",venue)).status).toBe("accepted");expect(control.status().halted).toBe(true);
});
it("cancellation acknowledgement blocks new orders until terminal entry reconciliation",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);await control.cancelEntry("test-1",venue);
  await expect(control.submit({...decision,intent:{...decision.intent,clientOrderId:"blocked-new"}},venue)).rejects.toThrow("cancellation");
  now+=10;venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"cancelled",filledQuantity:0.05,positionQuantity:0.05,observedAt:now});
  await control.reconcile("test-1",venue);
  expect(db.raw.prepare("SELECT usd_cents FROM obolus_live_order_holds").get()).toEqual({usd_cents:1005});
  expect(control.observation("test-1")?.positionQuantity).toBe(0.05);
});
it.each(["network","unknown","invalid"])("retains uncertain cancellation and halts without exposing errors: %s",async failure=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  if(failure==="network")venue.cancelOnce.mockRejectedValue(new Error("PRIVATE_CANCEL_ERROR"));
  else venue.cancelOnce.mockResolvedValue({status:failure==="unknown"?"unknown":"bad" as "unknown"});
  expect((await control.cancelEntry("test-1",venue)).status).toBe("unknown");expect(control.status().halted).toBe(true);
  expect((await new TradingControlPlane(other.raw,()=>now).cancelEntry("test-1",venue)).status).toBe("unknown");expect(venue.cancelOnce).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(db.raw.prepare("SELECT * FROM obolus_trading_audit").all())).not.toContain("PRIVATE_CANCEL_ERROR");
});
it("times out cancellation without resending",async()=>{
  vi.useFakeTimers();const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  venue.cancelOnce.mockImplementation(()=>new Promise(()=>{}));const pending=control.cancelEntry("test-1",venue);
  await vi.advanceTimersByTimeAsync(15001);expect((await pending).status).toBe("unknown");
  await control.cancelEntry("test-1",venue);expect(venue.cancelOnce).toHaveBeenCalledTimes(1);
});
it("does not automatically retry a rejected cancellation",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  venue.cancelOnce.mockResolvedValue({status:"rejected"});
  expect((await control.cancelEntry("test-1",venue)).status).toBe("rejected");
  expect((await control.cancelEntry("test-1",venue)).status).toBe("rejected");expect(venue.cancelOnce).toHaveBeenCalledTimes(1);
});
it("refuses fee-bearing cancellation or missing idempotency capability",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  await expect(control.cancelEntry("test-1",{...venue,cancellationFeeUsdCents:1 as 0})).rejects.toThrow("fee-free");
  await expect(control.cancelEntry("test-1",{...venue,supportsIdempotentCancellation:false as true})).rejects.toThrow("Idempotent");expect(venue.cancelOnce).not.toHaveBeenCalled();
});
it("refuses a cancellation when the entry has already filled",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"filled",filledQuantity:0.1,positionQuantity:0.1,observedAt:now});
  await expect(control.cancelEntry("test-1",venue)).rejects.toThrow("open entry");expect(venue.cancelOnce).not.toHaveBeenCalled();
});
it("rejects unauthenticated cancellation before reading or changing order state",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  venue.readiness.mockResolvedValue({authenticated:false,portfolioConsistent:true,observedAt:now});
  await expect(control.cancelEntry("test-1",venue)).rejects.toThrow("authenticated");expect(venue.readOrder).not.toHaveBeenCalled();expect(venue.cancelOnce).not.toHaveBeenCalled();
});
it("rechecks mode after asynchronous broker calls",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  venue.readOrder.mockImplementation(async()=>{new TradingControlPlane(other.raw,()=>now).activate("PAPER","ACTIVATE PAPER");return {clientOrderId:"test-1",venueOrderId:"venue-1",state:"accepted",filledQuantity:0,positionQuantity:0,observedAt:now};});
  await expect(control.cancelEntry("test-1",venue)).rejects.toThrow("not active");expect(venue.cancelOnce).not.toHaveBeenCalled();
  expect(db.raw.prepare("SELECT COUNT(*) n FROM obolus_trading_cancellations").get()).toEqual({n:0});
});
it("never resends a cancellation left pending by a crash",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);await control.cancelEntry("test-1",venue);
  db.raw.prepare("UPDATE obolus_trading_cancellations SET status='pending'").run();
  expect((await new TradingControlPlane(other.raw,()=>now).cancelEntry("test-1",venue)).status).toBe("pending");expect(venue.cancelOnce).toHaveBeenCalledTimes(1);
  await expect(control.submit({...decision,intent:{...decision.intent,clientOrderId:"post-cancel-crash"}},venue)).rejects.toThrow("cancellation");
});
it("blocks new orders if cancellation observation state is missing",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=cancellationAdapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);await control.cancelEntry("test-1",venue);
  db.raw.prepare("UPDATE obolus_trading_observations SET observation='{}'").run();
  await expect(control.submit({...decision,intent:{...decision.intent,clientOrderId:"corrupt-state"}},venue)).rejects.toThrow("cancellation");expect(venue.submitOnce).toHaveBeenCalledTimes(1);
});
it("accepts a closed position when intermediate fills occurred between polls",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);await control.reconcile("test-1",venue);now+=10;
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"closed",filledQuantity:0.1,positionQuantity:0,observedAt:now});
  expect((await control.reconcile("test-1",venue)).state).toBe("closed");expect(control.status().halted).toBe(false);
  expect(db.raw.prepare("SELECT usd_cents FROM obolus_live_order_holds").get()).toEqual({usd_cents:1005});
});
it("treats equivalent observation field order as the same result",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);await control.reconcile("test-1",venue);
  venue.readOrder.mockResolvedValue({observedAt:now,positionQuantity:0,filledQuantity:0,state:"accepted",venueOrderId:"venue-1",clientOrderId:"test-1"});
  expect((await control.reconcile("test-1",venue)).state).toBe("accepted");expect(control.status().halted).toBe(false);
});
it.each(["rejection","identity"])("detects concurrent reservation changes while awaiting observation: %s",async change=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  let resolve!:(value:OrderObservation)=>void;
  venue.readOrder.mockImplementation(()=>new Promise<OrderObservation>(done=>{resolve=done;}));
  const pending=control.reconcile("test-1",venue);
  if(change==="rejection")other.raw.prepare("UPDATE obolus_live_order_holds SET status='rejected'").run();
  else other.raw.prepare("UPDATE obolus_live_order_holds SET venue_order_id='different-venue-id'").run();
  resolve({clientOrderId:"test-1",venueOrderId:"venue-1",state:"accepted",filledQuantity:0,positionQuantity:0,observedAt:now});
  await expect(pending).rejects.toThrow("Inconsistent");expect(control.status().halted).toBe(true);expect(control.observation("test-1")).toBeUndefined();
});
it.each(["DISABLED","PAPER"] as const)("never calls a live adapter in %s",async mode=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate(mode,`ACTIVATE ${mode}`);
  await expect(control.submit(decision,venue)).rejects.toThrow("not active");expect(venue.readiness).not.toHaveBeenCalled();expect(venue.submitOnce).not.toHaveBeenCalled();
});
it("requires deliberate activation and defaults disabled after restart",()=>{
  const control=new TradingControlPlane(db.raw,()=>now);expect(control.status().mode).toBe("DISABLED");
  expect(()=>control.activate("LIVE-AUTONOMOUS","yes")).toThrow("activation");expect(new TradingControlPlane(other.raw).status().mode).toBe("DISABLED");
});
it("manual mode requires exact approval while autonomous mode preserves idempotency",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-MANUAL","ACTIVATE LIVE-MANUAL");
  await expect(control.submit(decision,venue)).rejects.toThrow("approval missing");control.approve(decision,"APPROVE test-1");
  await expect(control.submit({...decision,thesis:"changed"},venue)).rejects.toThrow("approval missing");
  expect((await control.submit(decision,venue)).status).toBe("accepted");control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  await control.submit(decision,venue);expect(venue.submitOnce).toHaveBeenCalledTimes(1);
});
it("autonomous mode submits without per-order approval",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  expect((await control.submit(decision,venue)).status).toBe("accepted");expect(venue.submitOnce).toHaveBeenCalledTimes(1);
});
it.each(["authentication","portfolio","stale"])("denies invalid readiness: %s",async failure=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  venue.readiness.mockResolvedValue({authenticated:failure!=="authentication",portfolioConsistent:failure!=="portfolio",observedAt:failure==="stale"?0:now});
  await expect(control.submit(decision,venue)).rejects.toThrow("authenticated");expect(venue.submitOnce).not.toHaveBeenCalled();
});
it("halts on unreachable broker without persisting private errors",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  venue.readiness.mockRejectedValue(new Error("PRIVATE_PROVIDER_ERROR"));await expect(control.submit(decision,venue)).rejects.toThrow("readiness unavailable");
  expect(new TradingControlPlane(other.raw).status().halted).toBe(true);expect(JSON.stringify(db.raw.prepare("SELECT * FROM obolus_trading_audit").all())).not.toContain("PRIVATE_PROVIDER_ERROR");
});
it("persists fills and closure across restart without resubmission or premature capital release",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  for(const [state,filled,position] of [["accepted",0,0],["partial",0.05,0.05],["filled",0.1,0.1],["closed",0.1,0]] as const){
    now+=10;venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state,filledQuantity:filled,positionQuantity:position,observedAt:now});
    await new TradingControlPlane(other.raw,()=>now).reconcile("test-1",venue);expect(control.observation("test-1")?.state).toBe(state);
  }
  await control.submit(decision,venue);expect(venue.submitOnce).toHaveBeenCalledTimes(1);expect(db.raw.prepare("SELECT usd_cents FROM obolus_live_order_holds").get()).toEqual({usd_cents:1005});
});
it("halts inconsistent observations and retains the previous state",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);await control.reconcile("test-1",venue);now+=10;
  venue.readOrder.mockResolvedValue({clientOrderId:"wrong",venueOrderId:"venue-1",state:"filled",filledQuantity:1,positionQuantity:1,observedAt:now});
  await expect(control.reconcile("test-1",venue)).rejects.toThrow("Inconsistent");expect(control.status().halted).toBe(true);expect(control.observation("test-1")?.state).toBe("accepted");
});
it("does not bypass risk after activation",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  await expect(control.submit({...decision,intent:{...decision.intent,plannedLossUsdCents:101}},venue)).rejects.toThrow("risk");expect(venue.submitOnce).not.toHaveBeenCalled();
});
it("rechecks halt after readiness",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  venue.readiness.mockImplementation(async()=>{new TradingControlPlane(other.raw,()=>now).halt();return {authenticated:true,portfolioConsistent:true,observedAt:now};});
  await expect(control.submit(decision,venue)).rejects.toThrow("not active");expect(venue.submitOnce).not.toHaveBeenCalled();
});
it("gateway halt before configuration survives configuration",async()=>{
  db.raw.prepare("DELETE FROM obolus_live_order_control").run();const gateway=new LiveOrderGateway(db.raw,()=>now);gateway.emergencyStop();gateway.configure(policy);
  await expect(gateway.submit(decision.intent,adapter())).rejects.toThrow("disabled");
});
it("bounded readiness timeout halts without ever submitting",async()=>{
  vi.useFakeTimers();const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  venue.readiness.mockImplementation(()=>new Promise(()=>{}));
  const pending=expect(control.submit(decision,venue)).rejects.toThrow("readiness unavailable");
  await vi.advanceTimersByTimeAsync(15001);await pending;expect(control.status().halted).toBe(true);expect(venue.submitOnce).not.toHaveBeenCalled();
});
it("unknown submission survives timeout and a duplicate retry never resends",async()=>{
  vi.useFakeTimers();const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  venue.submitOnce.mockImplementation(()=>new Promise(()=>{}));const pending=control.submit(decision,venue);
  await vi.advanceTimersByTimeAsync(15001);expect((await pending).status).toBe("unknown");
  await expect(new TradingControlPlane(other.raw,()=>now).submit(decision,venue)).rejects.toThrow("not active");expect(venue.submitOnce).toHaveBeenCalledTimes(1);
  expect(control.status().halted).toBe(true);
});
it.each(["stop","target"])("paper mode executes %s exits using the existing engine",reason=>{
  const control=new TradingControlPlane(db.raw,()=>now);control.activate("PAPER","ACTIVATE PAPER");
  control.initializePaper({initialCapitalCents:10000,liquidityFloorCents:3000,maxOpenRiskCents:200,maxDailyLossCents:200,maxDrawdownCents:1000,maxPositions:2,friction:{feeBps:0,slippageBps:0}});
  control.openPaper("paper-1",{symbol:"BTC",thesis:"paper thesis",entryCents:100,stopCents:98,targetsCents:[110],exitRule:"stop or target"},1000);
  const result=control.settlePaper("paper-1",[{time:1100,open:100,high:reason==="target"?111:101,low:reason==="stop"?97:99,close:100}]);
  expect(result.trade.reason).toBe(reason);
});
it("raw gateway cannot bypass controller disabled mode",async()=>{
  new TradingControlPlane(db.raw,()=>now);
  await expect(new LiveOrderGateway(db.raw,()=>now).submit(decision.intent,adapter())).rejects.toThrow("controller denies");
});
it("reports disabled state without initializing or modifying a database",async()=>{
  const stdout=vi.spyOn(process.stdout,"write").mockImplementation(()=>true);
  try{
    await main(["trading-status","--database",path.join(dir,"test.db")]);
    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toMatchObject({initialized:false,mode:"DISABLED",liveReadinessVerified:false});
    expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_trading_control'").get()).toBeUndefined();
  }finally{stdout.mockRestore();}
});
it("reports a persisted legacy gateway halt without resetting it",()=>{
  db.raw.prepare("UPDATE obolus_live_order_control SET halted=1 WHERE id=1").run();
  expect(inspectTradingControl(db.raw)).toMatchObject({halted:true,mode:"DISABLED"});
});
it.each([[9700,"stop","close_position"],[11000,"target","close_position"],[10500,"not_triggered","hold"]] as const)("plans a reconciled exit at bid %s without submitting",async(bid,reason,action)=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"filled",filledQuantity:0.1,positionQuantity:0.1,observedAt:now});await control.reconcile("test-1",venue);
  expect(planPositionExit(other.raw,"test-1",{symbol:"BTC/USD",bidUsdCents:bid,askUsdCents:bid+10,observedAt:now},now)).toMatchObject({action,reason,quantity:0.1,executionAuthorized:false});
  expect(venue.submitOnce).toHaveBeenCalledTimes(1);
});
it("requires cancelling an unfinished entry before closing its partial position",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"partial",filledQuantity:0.05,positionQuantity:0.05,observedAt:now});await control.reconcile("test-1",venue);
  control.halt();
  expect(planPositionExit(other.raw,"test-1",{symbol:"BTC/USD",bidUsdCents:9700,askUsdCents:9710,observedAt:now},now)).toMatchObject({action:"cancel_entry_then_close",quantity:0.05,executionAuthorized:false});
});
it("rejects stale positions, wrong instruments and crossed quotes in exit planning",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);await control.reconcile("test-1",venue);
  const quote={symbol:"BTC/USD",bidUsdCents:9700,askUsdCents:9710,observedAt:now};
  expect(()=>planPositionExit(db.raw,"test-1",{...quote,symbol:"ETH/USD"},now)).toThrow("consistent");
  expect(()=>planPositionExit(db.raw,"test-1",{...quote,askUsdCents:9600},now)).toThrow("quote");
  now+=2000;
  expect(()=>planPositionExit(db.raw,"test-1",{...quote,observedAt:now},now)).toThrow("consistent");
});
it("blocks new orders after a crash leaves an unresolved persistent submission",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  await control.submit(decision,venue);
  db.raw.prepare("UPDATE obolus_live_order_holds SET status='pending',venue_order_id=NULL").run();
  const restarted=new TradingControlPlane(other.raw,()=>now);
  await expect(restarted.submit({...decision,intent:{...decision.intent,clientOrderId:"post-crash"}},venue)).rejects.toThrow("reconciliation");
  expect(venue.submitOnce).toHaveBeenCalledTimes(1);
  expect((await restarted.reconcile("test-1",venue)).state).toBe("accepted");
  expect(db.raw.prepare("SELECT status FROM obolus_live_order_holds").get()).toEqual({status:"pending"});
});
it.each(["stale","impossible-acknowledgement","contradictory-rejection"])("halts invalid initial reconciliation: %s",async failure=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  if(failure==="contradictory-rejection")db.raw.prepare("UPDATE obolus_live_order_holds SET status='rejected'").run();
  if(failure==="stale")now=5000;
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"accepted",filledQuantity:failure==="impossible-acknowledgement"?0.1:0,positionQuantity:0,observedAt:failure==="stale"?1000:now});
  await expect(control.reconcile("test-1",venue)).rejects.toThrow("Inconsistent");expect(control.status().halted).toBe(true);expect(control.observation("test-1")).toBeUndefined();
});
it("retains a broker rejection and never retries the same economic action",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  const submit=vi.fn(async()=>({status:"rejected" as const}));
  const rejected={...venue,submitOnce:submit};
  expect((await control.submit(decision,rejected)).status).toBe("rejected");
  expect((await new TradingControlPlane(other.raw,()=>now).submit(decision,rejected)).status).toBe("rejected");
  expect(submit).toHaveBeenCalledTimes(1);
});
it("halts after an ambiguous network submission and permits read-only recovery",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  venue.submitOnce.mockRejectedValue(new Error("PRIVATE_NETWORK_ERROR"));
  expect((await control.submit(decision,venue)).status).toBe("unknown");
  const recovered=new TradingControlPlane(other.raw,()=>now);
  await expect(recovered.submit({...decision,intent:{...decision.intent,clientOrderId:"different"}},venue)).rejects.toThrow("not active");
  expect((await recovered.reconcile("test-1",venue)).state).toBe("accepted");
  expect(venue.submitOnce).toHaveBeenCalledTimes(1);expect(recovered.status().halted).toBe(true);
});
it("concurrent controllers share the same idempotency reservation",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");
  await Promise.allSettled([control.submit(decision,venue),new TradingControlPlane(other.raw,()=>now).submit(decision,venue)]);
  expect(venue.submitOnce).toHaveBeenCalledTimes(1);
  expect(db.raw.prepare("SELECT COUNT(*) n FROM obolus_live_order_holds").get()).toEqual({n:1});
});
it("rejects stale quotes before sending an order",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");now=2500;
  await expect(control.submit({...decision,intent:{...decision.intent,expiresAt:3000}},venue)).rejects.toThrow("risk");expect(venue.submitOnce).not.toHaveBeenCalled();
});
it("retains partial-fill exposure after cancellation and rejects regressive observations",async()=>{
  const control=new TradingControlPlane(db.raw,()=>now),venue=adapter();control.activate("LIVE-AUTONOMOUS","ACTIVATE LIVE-AUTONOMOUS");await control.submit(decision,venue);
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"partial",filledQuantity:0.05,positionQuantity:0.05,observedAt:now});
  await control.reconcile("test-1",venue);now+=10;
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"cancelled",filledQuantity:0.05,positionQuantity:0.05,observedAt:now});
  await control.reconcile("test-1",venue);now+=10;
  venue.readOrder.mockResolvedValue({clientOrderId:"test-1",venueOrderId:"venue-1",state:"accepted",filledQuantity:0,positionQuantity:0,observedAt:now});
  await expect(control.reconcile("test-1",venue)).rejects.toThrow("Inconsistent");
  expect(control.observation("test-1")?.positionQuantity).toBe(0.05);
  expect(db.raw.prepare("SELECT usd_cents FROM obolus_live_order_holds").get()).toEqual({usd_cents:1005});
});
