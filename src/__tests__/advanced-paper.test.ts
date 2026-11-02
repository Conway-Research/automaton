import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {advancedPaper,depthFill,optionExpiry,marginPath,multiLegPaper,type ResearchBook,type DepthOrder,type OptionScenario,type MarginScenario,type MultiLegScenario} from '../revenue/advanced-paper.js';
import {createBuiltinTools} from '../agent/tools.js';import {main} from '../v1/cli.js';import type {ToolContext} from '../types.js';
const book=(venue='A',offset=0):ResearchBook=>({venue,symbol:'SIM',currency:'USD',lotId:'0.001-unit',observedAt:1000,
  bids:[{priceMicros:990000+offset,lots:10},{priceMicros:980000+offset,lots:20}],asks:[{priceMicros:1000000+offset,lots:10},{priceMicros:1010000+offset,lots:20}]});
const order=(side:'buy'|'sell'='buy'):DepthOrder=>({side,lots:20,limitMicros:side==='buy'?1020000:970000,tif:'IOC',feeBps:10,maxNotionalCents:10000});
const options=():OptionScenario=>({underlying:'SIM',currency:'USD',style:'european',settlement:'cash',expiry:100,at:100,terminalCents:13000,capitalCents:50000,maxLossCents:50000,feePerContractCents:10,
  legs:[{kind:'call',side:'long',strikeCents:10000,premiumCents:500,contracts:1,multiplier:100},{kind:'call',side:'short',strikeCents:11000,premiumCents:200,contracts:1,multiplier:100}]});
const margin=():MarginScenario=>({side:'short',entryCents:10000,stopCents:10300,lots:10,collateralCents:50000,equityCents:1000000,maxLossCents:10000,maxLeverageBps:30000,maintenanceBps:1000,liquidationFeeBps:200,
  friction:{feeBps:10,slippageBps:10},borrowLocated:true,path:[{time:1,markCents:9500,executionCents:9500,borrowCents:100,fundingCents:50}]});
const arb=():MultiLegScenario=>({buyBook:book('A'),sellBook:book('B',100000),buyOrder:{...order(),tif:'FOK'},sellOrder:{...order('sell'),tif:'FOK'},now:1000,maxAgeMs:100,cashCents:5000,prefundedSellLots:20,otherCostsCents:5,buyAvailable:true,sellAvailable:true});
describe('depth-aware paper fills',()=>{
  it('walks depth with fees and rounds cash conservatively',()=>{const r=depthFill(book(),order(),1000,100);expect(r).toMatchObject({filledLots:20,grossCents:2010,feeCents:3,cashDeltaCents:-2013});expect(r.fills).toHaveLength(2);});
  it('distinguishes IOC partial from FOK zero-fill',()=>{
    const o={...order(),lots:40};expect(depthFill(book(),o,1000,100).filledLots).toBe(30);
    expect(depthFill(book(),{...o,tif:'FOK'},1000,100)).toMatchObject({filledLots:0,feeCents:0,cashDeltaCents:0});
  });
  it.each(['stale','future','crossed','unsorted','negative','excessive','notional','unknown-tif'])('rejects %s',kind=>{
    const b=book(),o=order();let now=1000;
    if(kind==='stale')now=1101;if(kind==='future')now=999;if(kind==='crossed')b.bids[0].priceMicros=1000000;
    if(kind==='unsorted')b.asks.reverse();if(kind==='negative')o.lots=-1;if(kind==='excessive')o.lots=1000001;if(kind==='notional')o.maxNotionalCents=1;if(kind==='unknown-tif')o.tif='GTC' as 'IOC';
    expect(()=>depthFill(b,o,now,100)).toThrow();
  });
});
describe('bounded option combinations',()=>{
  it('settles a debit call spread and computes maximum loss at breakpoints',()=>{expect(optionExpiry(options())).toMatchObject({paperNetCents:69980,maximumLossCents:30020,liveAuthorized:false});});
  it('settles cash-secured put exposure and rejects insufficient collateral',()=>{
    const i=options();i.legs=[{kind:'put',side:'short',strikeCents:100,premiumCents:10,contracts:1,multiplier:1}];i.terminalCents=0;i.feePerContractCents=1;
    expect(optionExpiry(i)).toMatchObject({maximumLossCents:91,paperNetCents:-91});expect(()=>optionExpiry({...i,capitalCents:90})).toThrow('collateral');
  });
  it.each(['unbounded','american','physical','pre-expiry','unknown-cost','overflow'])('rejects %s',kind=>{
    const i=options();if(kind==='unbounded')i.legs=i.legs.slice(1);if(kind==='american')i.style='american' as 'european';if(kind==='physical')i.settlement='physical' as 'cash';
    if(kind==='pre-expiry')i.at=99;if(kind==='unknown-cost')i.feePerContractCents=NaN;if(kind==='overflow'){i.legs[0].premiumCents=1e12;i.legs[0].contracts=1000;i.legs[0].multiplier=1000;}
    expect(()=>optionExpiry(i)).toThrow();
  });
});
describe('short and leveraged linear scenarios',()=>{
  it('accounts for adverse fills, fees, borrow and funding',()=>{const r=marginPath(margin());expect(r.feesCents).toBe(196);expect(r.paperNetCents).toBe(4800-100-96-150);expect(r.carryCents).toBe(150);expect(r.liveAuthorized).toBe(false);});
  it('preserves gap deficits instead of clipping losses to collateral',()=>{
    const i=margin();i.path[0]={time:1,markCents:20000,executionCents:21000,borrowCents:100,fundingCents:50};
    const r=marginPath(i);expect(r.reason).toBe('liquidation');expect(r.endingCollateralCents).toBeLessThan(0);expect(r.riskLimitBreached).toBe(true);
  });
  it('stops at the first trigger without accruing future carry or seeing later fills',()=>{
    const i=margin();i.path=[{time:1,markCents:10400,executionCents:10500,borrowCents:1,fundingCents:2},{time:2,markCents:10000,executionCents:10000,borrowCents:999,fundingCents:999}];
    expect(marginPath(i)).toMatchObject({reason:'stop',at:1,carryCents:3});
  });
  it.each(['borrow','leverage','capital','risk','stop','carry','time','liquidation-before-stop'])('rejects %s',kind=>{
    const i=margin();if(kind==='borrow')i.borrowLocated=false;if(kind==='leverage')i.maxLeverageBps=10000;if(kind==='capital')i.collateralCents=i.equityCents+1;
    if(kind==='risk')i.maxLossCents=i.equityCents;if(kind==='stop')i.stopCents=9000;if(kind==='carry')i.path[0].fundingCents=NaN;
    if(kind==='time')i.path.push({...i.path[0]});if(kind==='liquidation-before-stop'){i.maintenanceBps=6000;}
    expect(()=>marginPath(i)).toThrow();
  });
  it('supports long leveraged exposure with the same hard scenario constraints',()=>{const i=margin();i.side='long';i.stopCents=9700;i.borrowLocated=false;i.path[0].markCents=11000;i.path[0].executionCents=11000;expect(marginPath(i).paperNetCents).toBeGreaterThan(0);});
});
describe('multi-leg execution scenarios',()=>{
  it('settles prefunded legs and subtracts all supplied cash costs',()=>{const r=multiLegPaper(arb());expect(r).toMatchObject({status:'settled',inventoryDeltaLots:0,paperNetCents:2170-3-2010-3-5,expectedNetCents:149,liveAuthorized:false});});
  it('never calls unresolved inventory profit and models partial unwind',()=>{
    const i=arb();i.sellAvailable=false;expect(multiLegPaper(i)).toMatchObject({status:'unresolved-exposure',paperNetCents:null,inventoryDeltaLots:20});
    i.unwindBook=book('A');i.unwindBook.bids=i.unwindBook.bids.slice(0,1);i.unwindLimitMicros=970000;
    expect(multiLegPaper(i)).toMatchObject({paperNetCents:null,inventoryDeltaLots:10});
  });
  it('records the loss of a failed-leg full unwind',()=>{const i=arb();i.sellAvailable=false;i.unwindBook=book('A');i.unwindLimitMicros=970000;const r=multiLegPaper(i);expect(r.inventoryDeltaLots).toBe(0);expect(r.paperNetCents).toBeLessThan(0);});
  it.each(['prefund','cash','cost','currency','lot','stale','unwind-cash'])('fails closed for %s',kind=>{
    const i=arb();if(kind==='prefund')i.prefundedSellLots=0;if(kind==='cash')i.cashCents=1;if(kind==='cost')i.otherCostsCents=9999;
    if(kind==='currency')i.sellBook.currency='EUR';if(kind==='lot')i.sellBook.lotId='different';if(kind==='stale')i.now=9999;
    if(kind==='unwind-cash'){i.buyAvailable=false;i.unwindBook=book('B',9000000);i.unwindLimitMicros=11000000;i.buyOrder.maxNotionalCents=100000;}
    expect(()=>multiLegPaper(i)).toThrow();
  });
});
describe('integration and authority boundary',()=>{
  it('accepts modern epoch milliseconds without confusing them with monetary bounds',()=>{
    const now=Date.UTC(2026,9,9),b={...book(),observedAt:now};expect(depthFill(b,order(),now,100).filledLots).toBe(20);
    expect(optionExpiry({...options(),at:now,expiry:now}).paperNetCents).toBe(69980);
    const m=margin();m.path[0].time=now;expect(marginPath(m).at).toBe(now);
  });
  it('rejects live or unknown modes regardless of otherwise valid inputs',()=>{expect(()=>advancedPaper({mode:'live',kind:'options',input:options()} as never)).toThrow('paper');});
  it('makes identical pure requests reproducible, without persistence or paid providers',async()=>{
    const request={mode:'paper' as const,kind:'options' as const,input:options()},before=JSON.stringify(request);
    const tool=createBuiltinTools('test').find(t=>t.name==='advanced_paper_research')!;
    const result=advancedPaper(request);expect(await tool.execute({request},{} as ToolContext)).toBe(JSON.stringify(result));
    expect(advancedPaper(request)).toEqual(result);expect(JSON.stringify(request)).toBe(before);
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-advanced-')),input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
    const stdout=vi.spyOn(process.stdout,'write').mockReturnValue(true);
    try{fs.writeFileSync(input,JSON.stringify(request));await main(['advanced-paper','--input',input,'--output',output]);expect(JSON.parse(fs.readFileSync(output,'utf8'))).toEqual(result);}finally{stdout.mockRestore();fs.rmSync(dir,{recursive:true,force:true});}
  });
});
