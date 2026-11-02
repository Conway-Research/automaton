import test from 'node:test';
import assert from 'node:assert/strict';
import { startFounderDashboard } from './founder-dashboard.mjs';

test('MT5 telemetry requires session and failed refresh clears prior success',async()=>{
 let calls=0,cbCalls=0;
 const ui=await startFounderDashboard({readCoinbase:async()=>{cbCalls++;if(cbCalls>1)throw Error('Coinbase unavailable');return {executionEnabled:false,accountCount:26,balances:[]};},readTrading:async()=>{
  calls++;if(calls>1)throw Error('terminal disconnected');
  return {executionEnabled:false,account:{currency:'EUR'}};
 }});
 try{
  const denied=await fetch(ui.url+'/api/snapshot');
  assert.equal(denied.status,401);assert.equal(calls,0);assert.equal(cbCalls,0);
  const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const read=async()=> (await fetch(ui.url+'/api/snapshot',{headers:{Cookie:cookie}})).json();
  const first=await read();assert.equal(first.trading.status,'connected');assert.equal(first.trading.executionEnabled,false);assert.equal(first.coinbase.accountCount,26);
  const second=await read();assert.equal(second.trading.status,'unavailable');assert.equal(second.trading.account,undefined);
  assert.equal(second.liveReady,false);assert.equal(second.coinbase.status,'unavailable');assert.equal(second.coinbase.accountCount,undefined);
 }finally{await ui.close();}
});
