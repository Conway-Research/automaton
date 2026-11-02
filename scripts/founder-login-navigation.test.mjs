import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startFounderDashboard} from './founder-dashboard.mjs';

test('external document navigation may load login shell, while data and foreign origins remain blocked',async()=>{
 let handler;
 const server={once(){return this},listen(_port,_host,ready){ready()},address(){return {port:51439}},close(done){done()},closeIdleConnections(){}};
 const patch=mock.method(http,'createServer',fn=>{handler=fn;return server});
 const ui=await startFounderDashboard({readUsage:async()=>({})});
 async function request(url,extra={},data){
  let status,body;
  const req={method:data===undefined?'GET':'POST',url,headers:{host:'127.0.0.1:51439',...extra},async *[Symbol.asyncIterator](){if(data!==undefined)yield Buffer.from(JSON.stringify(data))}};
  const res={setHeader(){},writeHead(s){status=s},end(b){body=b}};
  await handler(req,res);return {status,body};
 }
 try{
  const nav={'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document','sec-fetch-user':'?1'};
  assert.equal((await request('/',nav)).status,200);
  assert.equal((await request('/api/snapshot',nav)).status,403);
  assert.equal((await request('/',{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await request('/',{...nav,host:'evil.example'})).status,403);
  assert.equal((await request('/',{...nav,origin:'https://evil.example'})).status,403);
  assert.equal((await request('/api/snapshot')).status,401);
  const headers={origin:ui.url,'content-type':'application/json','sec-fetch-site':'same-origin'};
  assert.equal((await request('/api/session',headers,{token:'incorrect'})).status,403);
  assert.equal((await request('/api/session',headers,{token:new URL(ui.loginUrl).hash.slice(1)})).status,200);
  assert.equal((await request('/api/session',headers,{token:new URL(ui.loginUrl).hash.slice(1)})).status,403);
  assert.equal((await request('/api/snapshot')).status,401);
 }finally{await ui.close();patch.mock.restore()}
});
