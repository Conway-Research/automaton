import {describe,it,expect} from 'vitest';
import {strategyCatalogue,strategySignal,researchStrategies} from '../revenue/strategy-research.js';
import {parseHistoricalDailyCsv} from '../revenue/historical-bars.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';
const bars=(prices:number[])=>prices.map((close,i)=>({time:i+1,open:close,high:close,low:close,close}));
describe('bounded multi-family research',()=>{
  it.each([
    ['momentum',[10000,10010,10020,10030,10100,10200]],
    ['mean-reversion',[10200,10100,10030,10020,10010,10000]],
    ['channel-breakout',[10000,10010,10020,10030,10100,10200]],
    ['moving-average-trend',[10000,10010,10020,10030,10100,10200]],
    ['rsi-recovery',[11000,10800,10500,10200,10000,10010]],
    ['bollinger-reversion',[10000,10000,10000,10000,10000,9000]],
  ] as const)('tests %s using past-only signals', (family,prices)=>{
    const v={...strategyCatalogue().find(x=>x.family===family)!,lookback:6};
    const signal=strategySignal(v,'SIM');
    expect(signal(bars([...prices]),10000)).toMatchObject({riskFraction:0.01,entryCents:10000});
    expect(signal(bars([10000,10000,10000,10000,10000,10000]),10000)).toBeNull();
    expect(signal(bars([10000]),10000)).toBeNull();
  });
  it('compares all families without letting future prices change earlier selection',()=>{
    const input={provenance:'synthetic' as const,symbol:'SIM',bars:bars(Array.from({length:180},(_,i)=>10000+i*100)),variants:strategyCatalogue(),trainSize:60,testSize:30,equityCents:1000000,friction:{feeBps:10,slippageBps:10},minTrainingTrades:1,maxTrainingClosedDrawdownFraction:0.1};
    const first=researchStrategies(input);const changed=structuredClone(input);
    changed.bars=changed.bars.map((b,i)=>i<60?b:{...b,open:5000,high:5000,low:5000,close:5000});
    expect(researchStrategies(changed).selections[0]).toEqual(first.selections[0]);
    expect(first.selections[0].candidates).toHaveLength(12);
    expect(new Set(strategyCatalogue().map(v=>v.family)).size).toBe(6);
  });
  it('offers the catalogue without any database or provider dependency',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_research_series')!;
    expect(JSON.parse(await tool.execute({action:'catalogue'},{} as ToolContext))).toMatchObject({variants:strategyCatalogue(),liveAuthorized:false});
  });
});
describe('strict local daily historical import',()=>{
  const start=Date.UTC(2025,0,1),day=86400000;
  const row=(time:number,micro=false)=>[micro?time*1000:time,'100.00000000','101.00000000','99.00000000','100.50000000','10',micro?(time+day)*1000-1:time+day-1,'1000','20','5','500','0'].join(',');
  it('normalizes milliseconds and microseconds exactly with auditable limitations',()=>{
    const result=parseHistoricalDailyCsv(row(start)+'\n'+row(start+day,true),start,start+2*day);
    expect(result.bars.map(b=>b.time)).toEqual([start,start+day]);
    expect(result.bars[0].close).toBe(10050);
    expect(result.quality).toMatchObject({rows:2,independentlyVerifiedPrices:false,liveAuthorized:false});
  });
  it.each(['gap','duplicate','subcent','ohlc','volume','columns'])('fails closed on %s',kind=>{
    let csv=row(start)+'\n'+row(start+day);
    if(kind==='gap')csv=row(start);
    if(kind==='duplicate')csv=row(start)+'\n'+row(start);
    if(kind==='subcent')csv=csv.replace('100.50000000','100.50100000');
    if(kind==='ohlc')csv=csv.replace('101.00000000','90.00000000');
    if(kind==='volume')csv=csv.replace(',10,',',0,');
    if(kind==='columns')csv+=',extra';
    expect(()=>parseHistoricalDailyCsv(csv,start,start+2*day)).toThrow();
  });
});
