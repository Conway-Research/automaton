import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateQuality} from './founder-quality-profiles.mjs';
const source=[{id:'a',amountMinor:101,currency:'CHF'},{id:'b',amountMinor:209,currency:'CHF'},{id:'c',amountMinor:70,currency:'USD'}];
const report=()=>({rows:structuredClone(source),totals:[{currency:'CHF',amountMinor:310},{currency:'USD',amountMinor:70}]});
test('reconciliation verifies completeness and exact integer totals per currency',()=>{
 const r=evaluateQuality('invoice-reconciliation-v1',{source,report:report()});assert.equal(r.passed,true);assert.equal(r.sourceTruthVerified,false);assert.ok(r.sourceDigest);assert.ok(r.outputDigest);assert.ok(!JSON.stringify(r).includes('209'));
});
for(const mutation of ['missing','duplicate','wrong-amount','wrong-currency','total','extra-total','extra-row'])test('reconciliation rejects '+mutation,()=>{
 const p=report();if(mutation==='missing')p.rows.pop();if(mutation==='duplicate')p.rows.push(p.rows[0]);if(mutation==='wrong-amount')p.rows[0].amountMinor=102;if(mutation==='wrong-currency')p.rows[0].currency='USD';if(mutation==='total')p.totals[0].amountMinor=311;if(mutation==='extra-total')p.totals.push({currency:'EUR',amountMinor:0});if(mutation==='extra-row')p.rows.push({id:'z',amountMinor:1,currency:'CHF'});assert.equal(evaluateQuality('invoice-reconciliation-v1',{source,report:p}).passed,false);
});
test('untrusted or ambiguous reference data never passes',()=>{
 for(const src of [[],null,[source[0],source[0]],[{...source[0],amountMinor:NaN}],[{...source[0],amountMinor:1.01}],Array(1001).fill(source[0])])assert.equal(evaluateQuality('invoice-reconciliation-v1',{source:src,report:report()}).passed,false);
 assert.equal(evaluateQuality('unknown',{}).passed,false);
});
test('unsafe summed integer amounts and extra input fields are rejected',()=>{
 const s=[{id:'a',currency:'CHF',amountMinor:Number.MAX_SAFE_INTEGER},{id:'b',currency:'CHF',amountMinor:1}];assert.equal(evaluateQuality('invoice-reconciliation-v1',{source:s,report:{rows:s,totals:[{currency:'CHF',amountMinor:Number.MAX_SAFE_INTEGER}]}}).passed,false);
 assert.equal(evaluateQuality('invoice-reconciliation-v1',{source:[{...source[0],privateText:'not-supported'}],report:report()}).passed,false);
});

import {digest} from './founder-restoration-integrity.mjs';
test('content profile retains formal limits and does not claim semantic correctness',()=>{
 const text='A small team saves two hours by reusing approved content.';
 const brief={source:{id:'source',text,digest:digest(text),privacy:'public',reuseAllowed:true},language:'en',audience:'small teams',tone:'plain',formats:[{id:'social',kind:'social-post',count:1,maxCharacters:200}],requiredPoints:['two hours'],allowedLinks:[]};
 const p={briefDigest:digest(brief),items:[{id:'p1',formatId:'social',kind:'social-post',text,evidence:[{sourceId:'source',quote:'two hours'}]}]};
 const good=evaluateQuality('content-package-structural-v1',{brief,package:p});assert.equal(good.passed,true);assert.equal(good.semanticVerified,false);
 p.items[0].evidence[0].quote='invented claim';assert.equal(evaluateQuality('content-package-structural-v1',{brief,package:p}).passed,false);
});
