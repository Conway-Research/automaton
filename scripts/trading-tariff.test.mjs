import test from 'node:test';
import assert from 'node:assert/strict';
import {tariffSummary,estimateCommission,conversionCharge} from './trading-tariff.mjs';
test('share commission uses each side minimum and explicit product classification',()=>{
 assert.deepEqual(estimateCommission({region:'US',units:25,price:100}),{amount:1,currency:'USD',perSide:true,actual:false});
 assert.equal(estimateCommission({region:'US',units:100,price:100}).amount,2);
 assert.equal(estimateCommission({region:'DE_FR',units:100,price:100}).amount,10);
 assert.equal(estimateCommission({region:'unknown',units:100,price:100}),null);
 assert.equal(estimateCommission({region:'JP',units:100,price:100}),null);
 assert.equal(estimateCommission({region:'US',units:-1,price:100}),null);
});
test('conversion applies to settlement not notional, same currency has no surcharge',()=>{
 assert.ok(Math.abs(conversionCharge({settlementAmount:10,fxRate:1/1.22510,from:'USD',to:'EUR'})-10/1.22510*.003)<1e-12);
 assert.equal(conversionCharge({settlementAmount:-.01,fxRate:1,from:'USD',to:'CHF'}),.01);
 assert.equal(conversionCharge({settlementAmount:0,fxRate:1,from:'USD',to:'CHF'}),0);
 assert.equal(conversionCharge({settlementAmount:10,fxRate:1,from:'CHF',to:'CHF'}),0);
 assert.equal(conversionCharge({settlementAmount:10,fxRate:0,from:'USD',to:'CHF'}),null);
});
test('published schedule never grants full product costs or live permission',()=>{
 const p=tariffSummary();assert.equal(p.contractEntity,'Admirals Europe Ltd');assert.equal(p.accountType,'Trade.MT5');
 assert.equal(p.costScheduleConfirmed,false);assert.equal(p.liveAuthorized,false);assert.ok(p.conflicts.length);
});
