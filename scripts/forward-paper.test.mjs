import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paperStep} from './forward-paper.mjs';
const rules={scale:1000000,stepAtoms:10,minAtoms:10,maxAtoms:1000000000,minNotionalCents:500};
const protocol={endsAt:200000,rules,friction:{feeBps:10,slippageBps:5}};
const bars=[{time:1,open:10000,high:10100,low:9900,close:10000}];
test('gap exit uses observed bid and prevents reentry on same bar',()=>{
 const old={equity:10000,closed:0,lastBar:0,position:{entry:10000,stop:9900,target:10200,atoms:1000000,entered:1000}};
 const out=paperStep(old,{},bars,{bid:9700,ask:9710,askQty:10},protocol,2000);
 assert.equal(out.action,'paper-exit');assert.ok(out.state.equity<9700);
 assert.equal(out.state.position,null);assert.equal(old.closed,0);
 const next=paperStep(out.state,{},bars,{bid:10000,ask:10010,askQty:10},protocol,3000);
 assert.equal(next.action,'abstain');assert.equal(next.reason,'no new completed bar');
});
test('expired phase and exhausted capital never initiate a position',()=>{
 const s={equity:10000,closed:0,lastBar:null,position:null};
 assert.equal(paperStep(s,{},bars,{},protocol,200001).reason,'phase ended');
 assert.equal(paperStep({...s,equity:0},{},bars,{},protocol,1000).reason,'insufficient virtual capital');
});
