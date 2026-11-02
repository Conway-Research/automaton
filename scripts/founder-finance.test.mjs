import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileFounderFinance} from './founder-finance.mjs';
import {readStripeTransactions} from './stripe-account-check.mjs';
import {createFounderFinanceAdapter} from './founder-finance.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('pause during Stripe account verification prevents every subsequent request',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stripe-stop-')),file=path.join(dir,'key.json');fs.writeFileSync(file,JSON.stringify({secretKey:'rk_live_test',accountId:'acct_test'}));let calls=0;const abort=new AbortController();
 try{await assert.rejects(()=>readStripeTransactions(file,{signal:abort.signal,request:async()=>{calls++;abort.abort();return Response.json({id:'acct_test',object:'account'});}}));assert.equal(calls,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('valid incomplete finance reports remain reviewable with explicit partial coverage',async()=>{
 const a=createFounderFinanceAdapter({read:async()=>({transactions:[],coverage:{complete:false,from:1,to:2}})});const r=await a.execute({signal:new AbortController().signal,assertActive(){}});assert.equal(r.status,'partial');assert.equal(a.verify(r),true);assert.equal(r.coverage.complete,false);
});
test('Stripe pagination is bounded and partial pages never certify complete coverage',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stripe-')),file=path.join(dir,'credential.json');fs.writeFileSync(file,JSON.stringify({secretKey:'rk_live_test',accountId:'acct_test'}));let pages=0;
 const request=async(url,options)=>{assert.equal(options.method,'GET');assert.ok(url.startsWith('https://api.stripe.com/v1/'));if(url.endsWith('/account'))return Response.json({id:'acct_test',object:'account'});if(url.endsWith('/balance'))return Response.json({object:'balance',livemode:true,available:[],pending:[]});pages++;if(pages===2)assert.ok(url.includes('starting_after=txn_1'));return Response.json({object:'list',has_more:pages===1,data:[{id:`txn_${pages}`,type:'charge',amount:10,fee:0,net:10,currency:'chf',created:100}]});};
 try{const r=await readStripeTransactions(file,{request,now:200000});assert.equal(r.coverage.complete,true);assert.equal(r.transactions.length,2);pages=0;const p=await readStripeTransactions(file,{request,now:200000,maxPages:1});assert.equal(p.coverage.complete,false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('finance deduplicates exact rows and separates refunds, fees, payouts and currencies',()=>{
 const tx=(id,type,amount,fee=0,currency='chf')=>({id,type,amount,fee,net:amount-fee,currency,created:123});const charge=tx('txn_1','charge',1000,30);
 const r=reconcileFounderFinance({transactions:[charge,charge,tx('txn_2','refund',-200),tx('txn_3','payout',-500),tx('txn_4','charge',500,10,'usd')],coverage:{complete:true,from:1,to:200}});
 assert.equal(r.currencies.chf.receiptsMinor,1000);assert.equal(r.currencies.chf.refundsMinor,200);assert.equal(r.currencies.chf.feesMinor,30);assert.equal(r.currencies.chf.payoutsMinor,500);assert.equal(r.currencies.usd.receiptsMinor,500);assert.equal(r.confirmedBankReceipt,false);
 assert.throws(()=>reconcileFounderFinance({transactions:[charge,{...charge,amount:2000}],coverage:{complete:true}}));
 assert.equal(reconcileFounderFinance({transactions:[charge],coverage:{complete:false}}).status,'partial');
 assert.equal(reconcileFounderFinance({transactions:[],coverage:{complete:false}}).status,'partial');
});

test('finance report retains deduplicated dated bookings for dashboard periods',()=>{
 const tx={id:'txn_dashboard',type:'charge',amount:500,fee:20,net:480,currency:'chf',created:123};
 const r=reconcileFounderFinance({transactions:[tx,tx],coverage:{complete:true,from:1,to:200}});
 assert.deepEqual(r.transactions,[tx]);
});
