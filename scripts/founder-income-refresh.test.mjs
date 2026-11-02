import test from 'node:test';
import assert from 'node:assert/strict';
import {createIncomeRefresh} from './founder-income-refresh.mjs';
test('OFF never reads; ON refresh is independent, single-flight and throttled',async()=>{
 let on=false,at=1000,reads=0,published=0,release;
 const tick=createIncomeRefresh({isOn:()=>on,now:()=>at,readQuote:async()=>{reads++;await new Promise(r=>release=r);return {status:'current'};},saveQuote:()=>{},publish:()=>published++});
 await tick();assert.equal(reads,0);on=true;const p=tick();await tick();assert.equal(reads,1);release();await p;assert.equal(published,1);await tick();assert.equal(reads,1);at+=600000;const q=tick();release();await q;assert.equal(reads,2);
});
test('OFF during fetch discards quote; errors retain existing data and allow bounded retry',async()=>{
 let on=true,at=1,saved=0,reads=0;
 const tick=createIncomeRefresh({isOn:()=>on,now:()=>at,readQuote:async()=>{reads++;if(reads===1)throw Error('offline');on=false;return {status:'current'};},saveQuote:()=>saved++,publish:()=>saved++});
 await tick();await tick();assert.equal(reads,1);at+=60000;await tick();assert.equal(reads,2);assert.equal(saved,0);
});
