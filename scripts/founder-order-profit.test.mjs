import test from 'node:test';
import assert from 'node:assert/strict';
import {combinedIncomeCHF,combinedProfitCHF} from '../web/founder/finance-refresh.mjs';
const now=Date.parse('2026-10-16T21:33:00Z'),quote={rateCHF:'0.823993',quotedAt:'2026-10-16T21:32:47Z',fetchedAt:'2026-10-16T21:32:54Z'};
test('confirmed USDC valuation minus recorded costs produces the total profit',()=>{
 const income=combinedIncomeCHF(0,'36765000',quote,now);
 const profit=combinedProfitCHF({reconciled:false,calculatedProfitMinor:-12,profitStatus:'provisional'},income);
 assert.equal(income.totalMinor,3029);assert.equal(profit.profitMinor,3017);assert.equal(profit.status,'provisional');
});
test('CHF income/refunds/fees/costs already in base profit are not counted twice',()=>{
 const income=combinedIncomeCHF(10000,'36765000',quote,now);
 const profit=combinedProfitCHF({reconciled:false,calculatedProfitMinor:7500,profitStatus:'partial'},income);
 assert.equal(profit.profitMinor,10529);assert.equal(profit.status,'partial');
});
test('unknown costs or missing valuation never yield a numeric total profit',()=>{
 assert.equal(combinedProfitCHF({reconciled:false,calculatedProfitMinor:null},combinedIncomeCHF(0,'36765000',quote,now)).profitMinor,null);
 assert.equal(combinedProfitCHF({reconciled:false,calculatedProfitMinor:-12},combinedIncomeCHF(0,'36765000',null,now)).profitMinor,null);
});
test('market valuation keeps a reconciled CHF ledger profit provisional',()=>{
 const p=combinedProfitCHF({reconciled:true,profitMinor:100,profitStatus:'reconciled'},combinedIncomeCHF(200,'36765000',quote,now));
 assert.equal(p.profitMinor,3129);assert.equal(p.status,'provisional');
});
test('stale rate marks profit partial; zero USDC preserves existing reconciled result',()=>{
 const f={reconciled:true,profitMinor:100,profitStatus:'reconciled'};
 assert.equal(combinedProfitCHF(f,combinedIncomeCHF(200,'36765000',quote,now+1900000)).status,'partial');
 assert.deepEqual(combinedProfitCHF(f,combinedIncomeCHF(200,'0',null,now)),{profitMinor:100,status:'reconciled'});
});
