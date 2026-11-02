import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFiveMinuteCsv,summarizeHistory} from './lib/ema-vwap-history.mjs';
const start=Date.UTC(2026,8,1);
const csv=Array.from({length:12},(_,i)=>`${(start+i*300000)*1000},100,102,99,101,10,${(start+(i+1)*300000)*1000-1},1010,5,4,404,0`).join('\n');
test('historical parser preserves traded volume and exact five-minute timestamps',()=>{
  const b=parseFiveMinuteCsv(csv,start,start+12*300000);
  assert.equal(b.length,12);assert.equal(b[0].volume,10);assert.equal(b[0].time,start);
  assert.equal(b[0].session,'2026-09-01');assert.equal(b[0].quoteVolume,1010);
});
test('pre-2025 millisecond archives normalize to the same bars as microseconds',()=>{
  const millis=csv.split('\n').map(row=>{const c=row.split(',');c[0]=String(Number(c[0])/1000);c[6]=String(Math.floor(Number(c[6])/1000));return c.join(',');}).join('\n');
  assert.deepEqual(parseFiveMinuteCsv(millis,start,start+12*300000),parseFiveMinuteCsv(csv,start,start+12*300000));
});
test('missing, duplicate, off-grid and bad volume history is rejected',()=>{
  for(const bad of [csv.split('\n').slice(1).join('\n'),csv.replace(',10,',',0,'),csv.replace(String(start*1000),String(start*1000+1)),csv.replace(',1010,',',1,')])
    assert.throws(()=>parseFiveMinuteCsv(bad,start,start+12*300000));
  assert.throws(()=>parseFiveMinuteCsv(csv+'\n'+csv.split('\n')[0],start,start+12*300000));
});
test('summary keeps directions separate and charges rounded hourly short borrowing',()=>{
  const bars=Array.from({length:15},(_,i)=>({time:start+i*300000}));
  const trades=[{direction:-1,entryIndex:0,exitIndex:13,entry:100,exit:99,net:1,gross:2,cost:1},
    {direction:1,entryIndex:0,exitIndex:1,entry:100,exit:101,net:1,gross:2,cost:1}];
  const r=summarizeHistory(trades,bars,1);
  assert.equal(r.short.borrow,0.02);assert.equal(r.long.borrow,0);
  assert.equal(r.all.net,1.98);assert.equal(r.all.trades,2);
});
