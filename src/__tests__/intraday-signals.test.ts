import {describe,it,expect} from 'vitest';
import {intradaySignal,type SessionSignal,type FlowSignal} from '../revenue/intraday-signals.js';
import {advancedPaper} from '../revenue/advanced-paper.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';
const session=():SessionSignal=>({strategy:'opening-range-breakout',sessionOpen:0,sessionClose:600000,now:180000,
  barMs:60000,openingWindowMs:120000,closingWindowMs:60000,thresholdBps:10,
  bars:[{start:0,end:60000,open:100,high:102,low:99,close:101},
    {start:60000,end:120000,open:101,high:103,low:100,close:102},
    {start:120000,end:180000,open:102,high:105,low:102,close:104}]});
const flow=():FlowSignal=>({strategy:'order-flow-imbalance',now:110,maxAgeMs:10,latencyMs:5,maxHoldingMs:1000,threshold:0.1,
  quotes:[{sequence:1,at:100,bid:100,ask:102,bidSize:10,askSize:10},
    {sequence:2,at:110,bid:100,ask:102,bidSize:20,askSize:5}]});
describe('causal intraday signal models',()=>{
  it('computes quote OFI and explicit post-signal arrival time',()=>{
    expect(intradaySignal(flow())).toMatchObject({direction:'long',rawImbalance:15,earliestEntryAt:115,exitBy:1115,liveAuthorized:false});
  });
  it('handles bid down and ask up without mistaking price moves for size changes',()=>{
    const i=flow();i.quotes[1]={sequence:2,at:110,bid:99,ask:103,bidSize:50,askSize:50};
    expect(intradaySignal(i)).toMatchObject({rawImbalance:0,direction:'none'});
  });
  it('reports negative flow without authorizing a short',()=>{
    const i=flow();i.quotes[1].bidSize=1;i.quotes[1].askSize=20;
    expect(intradaySignal(i)).toMatchObject({direction:'short',liveAuthorized:false,status:'HOLD_UNVALIDATED'});
  });
  it.each(['future','stale','gap','duplicate','reordered-time','crossed','zero-size','unknown-threshold','negative-latency','overflow'])('rejects flow %s',kind=>{
    const i=flow();
    if(kind==='future')i.quotes[1].at=111;
    if(kind==='stale')i.now=121;
    if(kind==='gap')i.quotes[1].sequence=3;
    if(kind==='duplicate')i.quotes[1].sequence=1;
    if(kind==='reordered-time')i.quotes[1].at=99;
    if(kind==='crossed')i.quotes[1].bid=103;
    if(kind==='zero-size')i.quotes[1].bidSize=0;
    if(kind==='unknown-threshold')i.threshold=NaN;
    if(kind==='negative-latency')i.latencyMs=-1;
    if(kind==='overflow'){i.now=Number.MAX_SAFE_INTEGER;i.quotes[1].at=i.now;}
    expect(()=>intradaySignal(i)).toThrow();
  });
  it('fixes opening range before breakout, with no later-day data',()=>{
    expect(intradaySignal(session())).toMatchObject({direction:'long',rangeHigh:103,rangeLow:99,rangeEnd:120000,exitBy:600000});
    const i=session();i.bars=i.bars.slice(0,2);i.now=120000;
    expect(intradaySignal(i).direction).toBe('none');
  });
  it('waits for completed opening range',()=>{
    const i=session();i.bars=i.bars.slice(0,1);i.now=60000;
    expect(intradaySignal(i)).toMatchObject({direction:'none',reason:'opening-range-incomplete'});
  });
  it('detects downside breakout without granting borrow',()=>{
    const i=session();i.bars[2]={start:120000,end:180000,open:102,high:102,low:97,close:98};
    expect(intradaySignal(i)).toMatchObject({direction:'short',liveAuthorized:false});
  });
  it.each(['future','gap','duplicate','stale','after-close','invalid-OHLC','overlap-window','fractional-window','missing-open'])('rejects session %s',kind=>{
    const i=session();
    if(kind==='future')i.now=179999;
    if(kind==='gap')i.bars[1].start++;
    if(kind==='duplicate')i.bars[1]=i.bars[0];
    if(kind==='stale')i.now=240000;
    if(kind==='after-close')i.now=i.sessionClose;
    if(kind==='invalid-OHLC')i.bars[0].low=104;
    if(kind==='overlap-window')i.openingWindowMs=540000;
    if(kind==='fractional-window')i.openingWindowMs=120001;
    if(kind==='missing-open')i.bars.shift();
    expect(()=>intradaySignal(i)).toThrow();
  });
  it('uses early-session feature at fixed close-window entry, unaffected by later prices',()=>{
    const i=session();i.strategy='market-close-momentum';i.now=540000;
    for(let n=3;n<9;n++)i.bars.push({start:n*60000,end:(n+1)*60000,open:90,high:110,low:80,close:90});
    const first=intradaySignal(i);
    expect(first).toMatchObject({direction:'long',featureEndsAt:120000,entryAt:540000,exitBy:600000});
    i.bars[8].close=109;expect(intradaySignal(i)).toEqual(first);
    i.now++;expect(()=>intradaySignal(i)).toThrow(/exact/);
  });
  it('exercises actual agent path for all three models without database/provider',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='advanced_paper_research')!;
    const close=session();close.strategy='market-close-momentum';close.sessionClose=240000;
    for(const input of [flow(),session(),close]){
      const request={mode:'paper' as const,kind:'intraday-signal' as const,input};
      const before=JSON.stringify(request);
      expect(JSON.parse(await tool.execute({request},{} as ToolContext))).toEqual(advancedPaper(request));
      expect(JSON.stringify(request)).toBe(before);
      expect(()=>advancedPaper({...request,mode:'live' as 'paper'})).toThrow();
    }
  });
});
