import {describe, it, expect} from 'vitest';
import {executionAudit} from '../revenue/execution-audit.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';

const order = () => ({kind:'execution',side:'buy',quoteCurrency:'USD',quantity:10,
  decisionPrice:100,receiptMid:100,deadlineMark:100.2,fees:0.04,
  fills:[{id:'a',quantity:4,price:100.1,laterMid:100.2}]});
function execution(x:unknown) {
  const r=executionAudit(x);
  if(r.kind!=='execution') throw Error('wrong result');
  return r;
}
describe('educational execution diagnostics',()=>{
  it('separates opportunity cost from cash on a partial fill',()=>{
    const r=execution(order());
    expect(r.filled).toBe(4);expect(r.unfilled).toBe(6);
    expect(r.executedCost).toBeCloseTo(0.4,10);
    expect(r.opportunityCost).toBeCloseTo(1.2,10);
    expect(r.shortfall).toBeCloseTo(1.64,10);
    expect(r.cashFlow).toBeCloseTo(-400.44,10);
  });
  it('weights fills by quantity and preserves spread decomposition',()=>{
    const r=execution({...order(),fills:[{id:'a',quantity:1,price:100.01,laterMid:100.04},{id:'b',quantity:9,price:100.03,laterMid:100.04}]});
    expect(r.effectiveSpread).toBeCloseTo(0.056,10);
    expect(r.realizedSpread).toBeCloseTo(-0.024,10);
    expect(r.midpointMovement).toBeCloseTo(0.08,10);
    expect(r.effectiveSpread!).toBeCloseTo(r.realizedSpread!+r.midpointMovement!,10);
  });
  it('uses the sell sign for cost, markout and received cash',()=>{
    const r=execution({...order(),side:'sell',deadlineMark:99.8,fills:[{id:'a',quantity:4,price:99.9,laterMid:99.8}]});
    expect(r.shortfall).toBeCloseTo(1.64,10);
    expect(r.cashFlow).toBeCloseTo(399.56,10);
    expect(r.effectiveSpread).toBeCloseTo(0.2,10);
    expect(r.realizedSpread).toBeCloseTo(-0.2,10);
  });
  it('keeps an entirely unfilled order rather than inventing fills or zero spread',()=>{
    const r=execution({...order(),fills:[],fees:0});
    expect(r.shortfall).toBeCloseTo(2,10);expect(r.cashFlow).toBe(0);
    expect(r.averageFillPrice).toBeNull();expect(r.effectiveSpread).toBeNull();
  });
  it('does not mutate input or retain state between calls',()=>{
    const x=order(),copy=structuredClone(x);const r=execution(x);r.perFill.length=0;
    expect(x).toEqual(copy);expect(execution(x).perFill).toHaveLength(1);
  });
  it.each([undefined,null,'0',NaN,Infinity,-1])('rejects missing or invalid fees %s',fees=>{
    expect(()=>execution({...order(),fees})).toThrow();
  });
  it('rejects duplicated executions, overfills, unknown side and unknown mode',()=>{
    const x=order();
    expect(()=>execution({...x,fills:[...x.fills,...x.fills]})).toThrow('Duplicate');
    expect(()=>execution({...x,quantity:3})).toThrow('exceeds');
    expect(()=>execution({...x,side:'short'})).toThrow();
    expect(()=>executionAudit({kind:'live'})).toThrow();
    expect(()=>execution({...x,fills:Array(1001).fill(x.fills[0])})).toThrow();
  });
  it('handles ordinary decimal quantity accumulation without accepting material overfills',()=>{
    const x={...order(),quantity:0.3,fills:[{id:'a',quantity:0.1,price:100,laterMid:100},{id:'b',quantity:0.2,price:100,laterMid:100}]};
    expect(execution(x).unfilled).toBe(0);
    expect(()=>execution({...x,quantity:0.299999})).toThrow();
  });
  it('detects information received before a decision but processed after it',()=>{
    const r=executionAudit({kind:'availability',decisionMs:90,events:[{id:'e',eventMs:0,receivedMs:80,processedMs:91}]});
    expect(r).toMatchObject({result:'FUTURE_INFORMATION_DETECTED',findings:[{id:'e',available:false,latenessMs:1}]});
  });
  it('allows the exact availability boundary but rejects impossible clocks and empty evidence',()=>{
    expect(executionAudit({kind:'availability',decisionMs:90,events:[{id:'e',eventMs:0,receivedMs:80,processedMs:90}]})).toMatchObject({result:'AVAILABLE_UNDER_SUPPLIED_CLOCKS',inputsVerified:false});
    expect(()=>executionAudit({kind:'availability',decisionMs:90,events:[]})).toThrow();
    expect(()=>executionAudit({kind:'availability',decisionMs:90,events:[{id:'e',eventMs:81,receivedMs:80,processedMs:90}]})).toThrow();
  });
  it('is reachable through the real agent tool with no credentials or database',async()=>{
    const tool=createBuiltinTools('test').find(t=>t.name==='paper_execution_audit')!;
    const r=JSON.parse(await tool.execute({input:order()},{} as ToolContext));
    expect(r).toMatchObject({liveAuthorized:false,profitabilityProven:false,expertiseProven:false,inputsVerified:false});
    expect(r.shortfall).toBeCloseTo(1.64,10);
  });
});
