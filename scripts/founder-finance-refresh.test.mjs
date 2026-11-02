import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startFounderDashboard} from './founder-dashboard.mjs';

test('finance refresh is authenticated and independent from stalled trading and usage readers',async()=>{
 let handler,unrelatedReads=0,financeReads=0,fail=false,now=Date.now();
 const clock=mock.method(Date,'now',()=>now);
 const server={once(){return this},listen(_p,_h,ready){ready()},address(){return {port:51439}},close(done){done()},closeIdleConnections(){}};
 const patch=mock.method(http,'createServer',fn=>{handler=fn;return server});
 const report={status:'reconciled-provider',observedAt:'2026-10-15T11:40:00Z',transactions:[],coverage:{complete:true}};
 const ui=await startFounderDashboard({readFinance:async()=>{financeReads++;if(fail)throw Error('provider unavailable');return report},readTrading:()=>{unrelatedReads++;return new Promise(()=>{})},readUsage:()=>{unrelatedReads++;return new Promise(()=>{})},tradingEngine:{snapshot(){throw Error('must not read trading study')}},ledger:{snapshot:r=>({reportStatus:r?.status,entries:[]})},costImport:{snapshot:()=>({invoices:[{reason:'excluded'}]})},billing:{snapshot:()=>({providers:[]})}});
 async function call(url,headers={},data){let status,body,cookie;
 const req={method:data===undefined?'GET':'POST',url,headers:{host:'127.0.0.1:51439',...headers},async *[Symbol.asyncIterator](){if(data!==undefined)yield Buffer.from(JSON.stringify(data))}};
 await handler(req,{setHeader(k,v){if(k==='Set-Cookie')cookie=v.split(';')[0]},writeHead(s){status=s},end(b){body=JSON.parse(b)}});return {status,body,cookie};}
 try{
  assert.equal((await call('/api/finance/snapshot')).status,401);
  const auth=await call('/api/session',{origin:ui.url,'content-type':'application/json'},{token:new URL(ui.loginUrl).hash.slice(1)});
  const headers={cookie:auth.cookie};
  const result=await call('/api/finance/snapshot',headers);
  assert.equal(result.status,200);assert.deepEqual(result.body.financeReport,report);
  assert.equal(result.body.financeLedger.reportStatus,'reconciled-provider');
  assert.equal(result.body.costImport.invoices[0].reason,'excluded');
  assert.equal(result.body.financeStatus.reportAvailable,true);
  assert.equal(unrelatedReads,0);assert.equal(financeReads,1);
  assert.equal((await call('/api/finance/snapshot',{...headers,'sec-fetch-site':'cross-site'})).status,403);
  await call('/api/finance/snapshot',headers);assert.equal(financeReads,1,'cached within five minutes');
  fail=true;now+=300001;
  const stale=await call('/api/finance/snapshot',headers);
  assert.equal(stale.status,200);assert.equal(stale.body.financeStatus.reportAvailable,false);
  assert.deepEqual(stale.body.financeReport,report,'retain evidence on provider failure');
  assert.equal(stale.body.financeStatus.reportCheckedAt,result.body.financeStatus.reportCheckedAt,'failed attempt must not advance success timestamp');
 }finally{await ui.close();patch.mock.restore();clock.mock.restore()}
});
