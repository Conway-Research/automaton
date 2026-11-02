import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readStripeAccount} from './stripe-account-check.mjs';
test('account binding, live mode and read-only requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'stripe-probe-')),file=join(dir,'key.json');
 try{
  await writeFile(file,JSON.stringify({secretKey:'rk_live_fixture',accountId:'acct_expected'}));
  let calls=0;
  await assert.rejects(readStripeAccount(file,async()=>{calls++;return Response.json({object:'account',id:'acct_wrong'});}),/mismatch/);
  assert.equal(calls,1);
  const request=async(url,options)=>{
   assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
   return Response.json(url.endsWith('/account')?{object:'account',id:'acct_expected',charges_enabled:false,payouts_enabled:false}:{object:'balance',livemode:true,available:[{currency:'chf',amount:0}],pending:[]});
  };
  const data=await readStripeAccount(file,request);assert.equal(data.authenticated,true);assert.equal(data.executionEnabled,false);assert.equal(data.chargesEnabled,false);
  assert.equal(JSON.stringify(data).includes('rk_live_'),false);
  await assert.rejects(readStripeAccount(file,async(url)=>url.endsWith('/account')?request(url,{method:'GET',redirect:'error'}):Response.json({object:'balance',livemode:false})),/mode mismatch/);
  await assert.rejects(readStripeAccount(file,async()=>{throw Error('private provider details');}),/^Error: Stripe read unavailable$/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
