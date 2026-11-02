import {it,expect} from 'vitest';
import {sizeFractionalPaper} from '../revenue/fractional-paper-sizing.js';
import {fractionalPaperQuote} from '../revenue/paper-trading.js';
const lots={scale:1000000,stepAtoms:10,minAtoms:10,maxAtoms:1000000,minNotionalCents:500};
const f={feeBps:10,slippageBps:5};
it('sizes a sub-unit expensive asset within cash and conservative stop risk',()=>{
 const q=sizeFractionalPaper(10000000,9900000,10000,100,lots,f)!;
 expect(q).not.toBeNull();expect(q.atoms).toBeLessThan(lots.scale);
 expect(q.committedCents).toBeLessThanOrEqual(10000);expect(q.conservativeLossCents).toBeLessThanOrEqual(100);
 expect(-q.netPnlCents).toBeLessThanOrEqual(q.conservativeLossCents);expect(q.executionAuthorized).toBe(false);
});
it('declines unaffordable minimums and excessive minimum fees',()=>{
 expect(sizeFractionalPaper(10000000,9900000,400,10,lots,f)).toBeNull();
 expect(sizeFractionalPaper(10000000,9900000,10000,100,lots,{...f,minimumFeeCents:60})).toBeNull();
});
it('bounds rounding losses across varied prices, lot sizes and fees',()=>{
 for(const entry of [123,1999,10000000])for(const stepAtoms of [1,7,100])for(const feeBps of [0,10,75]){
  const r={...lots,stepAtoms,minNotionalCents:1},cost={feeBps,slippageBps:3};
  const q=sizeFractionalPaper(entry,Math.floor(entry*0.98),10000,100,r,cost);
  if(!q)continue;
  expect(q.atoms%stepAtoms).toBe(0);expect(q.committedCents).toBeLessThanOrEqual(10000);
  expect(-q.netPnlCents).toBeLessThanOrEqual(q.conservativeLossCents);expect(q.conservativeLossCents).toBeLessThanOrEqual(100);
  const actual=fractionalPaperQuote(entry,Math.floor(entry*0.98),q.atoms,r,cost);
  expect(actual.netPnlCents).toBe(q.netPnlCents);
 }
});
it.each([NaN,Infinity,-1,0,1.5])('rejects invalid budget %s',budget=>{
 expect(()=>sizeFractionalPaper(1000,990,10000,budget,lots,f)).toThrow();
});
