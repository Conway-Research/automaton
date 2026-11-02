import test from 'node:test';import assert from 'node:assert/strict';import {startFounderDashboard} from './founder-dashboard.mjs';
test('history API uses session and CSRF without initiating work on GET',async()=>{
 let controls=0;const history={snapshot:()=>({status:'paused',counts:{datasets:1,reports:2}}),control:action=>{if(!['pause','resume','stop'].includes(action))throw Error('unknown action');controls++;return {status:action};},report:id=>({id,liveAuthorized:false,costStatus:'unknown'}),lessons:()=>[]};
 const ui=await startFounderDashboard({longHistory:history,store:{snapshot:()=>({fixture:true})},readUsage:async()=>({status:'fixture'})});
 try{assert.equal((await fetch(ui.url+'/api/long-history/lessons')).status,401);
  const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:ui.loginUrl.split('#')[1]})});const cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf;
  const headers={Cookie:cookie,Origin:ui.url,'Content-Type':'application/json'};
  const snapshot=await (await fetch(ui.url+'/api/snapshot',{headers})).json();assert.equal(snapshot.longHistory.counts.datasets,1);assert.equal(controls,0);assert.equal(snapshot.financeLedger,undefined);
  const report=await (await fetch(ui.url+'/api/long-history/reports/test-report',{headers})).json();assert.equal(report.liveAuthorized,false);
  assert.equal((await fetch(ui.url+'/api/long-history/control',{method:'POST',headers,body:'{"action":"resume"}'})).status,403);
  assert.equal((await fetch(ui.url+'/api/long-history/control',{method:'POST',headers:{...headers,'X-Obolus-CSRF':csrf},body:'{"action":"resume"}'})).status,200);assert.equal(controls,1);
  assert.notEqual((await fetch(ui.url+'/api/long-history/control',{method:'POST',headers:{...headers,'X-Obolus-CSRF':csrf},body:'{"action":"trade"}'})).status,200);
 }finally{await ui.close();}
});
test('fast research snapshot includes current context without slow account readers',async()=>{
 let reads=0;const context={version:'fixture',comparison:{enrolled:0},liveAuthorized:false};const ui=await startFounderDashboard({longHistory:{snapshot:()=>({status:'running'})},tradingEngine:{contextSnapshot:()=>context,snapshot:()=>({})},readTrading:async()=>{reads++;throw Error('slow reader must not run');},readUsage:async()=>({})});
 try{const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:ui.loginUrl.split('#')[1]})});const cookie=login.headers.get('set-cookie').split(';')[0];const result=await (await fetch(ui.url+'/api/long-history/snapshot',{headers:{Cookie:cookie}})).json();assert.deepEqual(result.marketContext,context);assert.equal(reads,0);}finally{await ui.close();}
});
