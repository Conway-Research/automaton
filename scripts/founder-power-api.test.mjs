import test,{mock} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {startFounderDashboard} from './founder-dashboard.mjs';
test('power control works independently and requires authentication and CSRF; off suppresses account readers',async()=>{
 let handler,enabled=false,revision=0,reads=0;const contexts=[];const server={once(){return this},listen(_p,_h,f){f()},address:()=>({port:51439}),close:f=>f(),closeIdleConnections(){}};
 const patch=mock.method(http,'createServer',f=>{handler=f;return server});
 const power={isOn:()=>enabled,snapshot:()=>({enabled,revision}),control(x,context){contexts.push(context);enabled=x.enabled;revision++;return this.snapshot()}};
 const slow=async()=>{reads++;throw Error('must not read while off')};
 const ui=await startFounderDashboard({power,readFinance:slow,readTrading:slow,readStripe:slow,readCoinbase:slow,readUsage:slow});
 async function call(url,headers={},data){let status,body,cookie;const req={method:data===undefined?'GET':'POST',url,headers:{host:'127.0.0.1:51439',...headers},async *[Symbol.asyncIterator](){if(data!==undefined)yield Buffer.from(JSON.stringify(data))}};await handler(req,{setHeader(k,v){if(k==='Set-Cookie')cookie=v.split(';')[0]},writeHead(s){status=s},end(b){body=JSON.parse(b)}});return {status,body,cookie}}
 try{
 assert.equal((await call('/api/power')).status,401);
 const auth=await call('/api/session',{origin:ui.url,'content-type':'application/json'},{token:new URL(ui.loginUrl).hash.slice(1)}),headers={cookie:auth.cookie,origin:ui.url,'content-type':'application/json'};
 const state=await call('/api/power',headers);assert.equal(state.status,200);assert.equal(state.body.power.enabled,false);
 assert.equal((await call('/api/power',headers,{enabled:true,revision:0})).status,403);assert.equal(enabled,false);
 await call('/api/finance/snapshot',headers);await call('/api/snapshot',headers);assert.equal(reads,0);
 assert.equal((await call('/api/power',{...headers,'x-obolus-csrf':state.body.csrf},{enabled:true,revision:0})).status,403);assert.equal(enabled,false);
 const on=await call('/api/power',{...headers,'x-obolus-csrf':state.body.csrf},{enabled:true,revision:0,intent:'founder-start-confirmed'});assert.equal(on.status,200);assert.equal(enabled,true);
 assert.equal(contexts[0].route,'/api/power');assert.match(contexts[0].sessionId,/^[a-f0-9]{32}$/);assert.equal(auth.cookie.includes(contexts[0].sessionId),false);assert.equal(JSON.stringify(on.body).includes(contexts[0].sessionId),false);
 const off=await call('/api/power',{...headers,'x-obolus-csrf':state.body.csrf},{enabled:false,revision:0});assert.equal(off.status,200);assert.equal(enabled,false);
 assert.equal(contexts[1].sessionId,contexts[0].sessionId);
 }finally{await ui.close();patch.mock.restore()}
});
