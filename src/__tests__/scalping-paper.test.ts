import {describe,it,expect} from 'vitest';
import {advancedPaper,scalpingRoundTrip,type ScalpingScenario} from '../revenue/advanced-paper.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';
const scenario=():ScalpingScenario=>({
  entryBook:{venue:'SIM',symbol:'SIM',currency:'USD',lotId:'0.001',observedAt:1010,bids:[{priceMicros:990000,lots:20}],asks:[{priceMicros:1000000,lots:20}]},
  exitBook:{venue:'SIM',symbol:'SIM',currency:'USD',lotId:'0.001',observedAt:2010,bids:[{priceMicros:1010000,lots:20}],asks:[{priceMicros:1020000,lots:20}]},
  entryOrder:{side:'buy',lots:10,limitMicros:1000000,tif:'FOK',feeBps:10,maxNotionalCents:2000},
  exitOrder:{side:'sell',lots:10,limitMicros:980000,tif:'IOC',feeBps:10,maxNotionalCents:2000},
  signalAt:1000,entryAt:1010,exitAt:2010,latencyMs:10,maxAgeMs:10,maxHoldingMs:2000,cashCents:2000,otherCostsCents:2,
});
describe('bounded taker scalping research',()=>{
  it('reconciles spread, conservative fees and other cash costs',()=>{
    const r=scalpingRoundTrip(scenario());
    expect(r).toMatchObject({status:'closed',paperNetCents:5,feesCents:3,inventoryLots:0,liveAuthorized:false});
  });
  it('exposes negative economics when price advantage is consumed by fees',()=>{
    const i=scenario();i.entryOrder.feeBps=100;i.exitOrder.feeBps=100;
    expect(scalpingRoundTrip(i).paperNetCents).toBe(-13);
  });
  it('does not book partial-exit inventory as settled profit',()=>{
    const i=scenario();i.exitBook.bids[0].lots=4;
    expect(scalpingRoundTrip(i)).toMatchObject({status:'unresolved-exposure',inventoryLots:6,paperNetCents:null});
  });
  it('does not fabricate exit fills after cancelled entry',()=>{
    const i=scenario();i.entryBook.asks[0].lots=4;
    expect(scalpingRoundTrip(i)).toMatchObject({status:'entry-cancelled',inventoryLots:0,exit:null,paperNetCents:-2});
  });
  it.each(['stale','future','latency','holding','venue','lot','cash','unknown-cost','short','maker','unequal-size','reversed-time'])('rejects %s',kind=>{
    const i=scenario();
    if(kind==='stale')i.entryAt=1030;
    if(kind==='future')i.exitBook.observedAt=2011;
    if(kind==='latency')i.latencyMs=11;
    if(kind==='holding')i.maxHoldingMs=999;
    if(kind==='venue')i.exitBook.venue='OTHER';
    if(kind==='lot')i.exitBook.lotId='OTHER';
    if(kind==='cash')i.cashCents=1000;
    if(kind==='unknown-cost')i.otherCostsCents=NaN;
    if(kind==='short')i.entryOrder.side='sell';
    if(kind==='maker')i.entryOrder.tif='GTC' as 'FOK';
    if(kind==='unequal-size')i.exitOrder.lots=11;
    if(kind==='reversed-time')i.exitAt=1000;
    expect(()=>scalpingRoundTrip(i)).toThrow();
  });
  it('validates stale exit even for cancelled entry',()=>{
    const i=scenario();i.entryBook.asks[0].lots=1;i.exitAt=2030;
    expect(()=>scalpingRoundTrip(i)).toThrow();
  });
  it('uses the actual agent request path with no database or provider',async()=>{
    const request={mode:'paper' as const,kind:'scalping' as const,input:scenario()};
    const before=JSON.stringify(request);
    const tool=createBuiltinTools('test').find(t=>t.name==='advanced_paper_research')!;
    expect(JSON.parse(await tool.execute({request},{} as ToolContext))).toEqual(advancedPaper(request));
    expect(JSON.stringify(request)).toBe(before);
    expect(()=>advancedPaper({...request,mode:'live' as 'paper'})).toThrow();
  });
});
