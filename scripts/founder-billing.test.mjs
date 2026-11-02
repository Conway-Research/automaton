import test from 'node:test';
import assert from 'node:assert/strict';
import {readOpenAIBilling,readCloudflareBilling,NUMARON_PROJECT} from './founder-billing.mjs';
import {financialSummary} from '../web/founder/model.mjs';
const response=data=>({ok:true,json:async()=>data});
test('cost request always filters Numaron and follows pagination without rounding daily costs',async()=>{
 let calls=0;const request=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(new URL(url).searchParams.get('project_ids[]'),NUMARON_PROJECT);calls++;return response({data:[{start_time:1791849600,results:[{project_id:NUMARON_PROJECT,amount:{value:0.2446346,currency:'usd'}}]}],has_more:calls===1,next_page:'page2'});};
 const result=await readOpenAIBilling('test',{request});assert.equal(calls,2);assert.equal(result.rows[0].amount,0.2446346);
});
test('unexpected project and incomplete pagination cannot be treated as Numaron costs',async()=>{
 await assert.rejects(readOpenAIBilling('test',{request:async()=>response({data:[{start_time:1791849600,results:[{project_id:'other',amount:{value:10,currency:'usd'}}]}]})}));
 await assert.rejects(readOpenAIBilling('test',{request:async()=>response({data:[],has_more:true,next_page:'repeat'})}));
});
test('current UTC bucket is included even before midnight',async()=>{
 await readOpenAIBilling('test',{now:Date.parse('2026-10-13T15:00:00Z'),request:async(url)=>{const u=new URL(url);assert.equal(Number(u.searchParams.get('end_time')),Date.parse('2026-10-14T00:00:00Z')/1000);return response({data:[],has_more:false});}});
});
test('foreign usage, provider failures and missing historical coverage block a certified CHF profit',()=>{
 const now=Date.parse('2026-10-13T15:00:00Z');
 for(const openAI of [{status:'unavailable',rows:[]},{status:'connected',from:'2026-01-01',rows:[{day:'2026-10-13',amount:0.2446,currency:'USD'}]},{status:'connected',from:'2026-01-01',rows:[]}]){
  const f=financialSummary({billing:{providers:[openAI,{provider:'Cloudflare',status:'connected',rows:[]}]}},openAI.rows.length?'today':'year',now);assert.equal(f.unresolvedCostInvoices,true);assert.equal(f.profitMinor,null);
 }
});
test('Cloudflare empty connected history is distinct from authentication failure',async()=>{
 const r=await readCloudflareBilling('test',{request:async()=>response({success:true,result:[],result_info:{next_page:false}})});assert.equal(r.status,'connected');assert.deepEqual(r.rows,[]);
 await assert.rejects(readCloudflareBilling('test',{request:async()=>({ok:false,status:403})}),/HTTP 403/);
});
test('Cloudflare amounts remain original major units and repeated rows are deduplicated',async()=>{
 const row={id:'invoice1',amount:20.99,currency:'USD',occurred_at:'2026-10-13T12:00:00Z',type:'charge'};
 const r=await readCloudflareBilling('test',{request:async()=>response({success:true,result:[row,row],result_info:{next_page:false}})});assert.equal(r.rows.length,1);assert.equal(r.rows[0].amount,20.99);
});
