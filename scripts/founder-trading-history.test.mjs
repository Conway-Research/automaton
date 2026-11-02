import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import Database from 'better-sqlite3';
import {readTradingHistory} from './founder-trading-history.mjs';
import {startFounderDashboard} from './founder-dashboard.mjs';
test('history endpoint needs authentication and never queries providers',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-history-api-'));const forbidden=()=>{throw Error('Provider must not be called');};const ui=await startFounderDashboard({historyRoot:root,loginFile:path.join(root,'login.json'),readTrading:forbidden,readCoinbase:forbidden,readStripe:forbidden,readUsage:forbidden});try{assert.equal((await fetch(ui.url+'/api/trading/history')).status,401);const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});const Cookie=login.headers.get('set-cookie').split(';')[0];const result=await fetch(ui.url+'/api/trading/history',{headers:{Cookie}});assert.equal(result.status,200);assert.equal((await result.json()).tradingHistory.live.status,'not-connected');}finally{await ui.close();fs.rmSync(root,{recursive:true,force:true});}});
test('history is demo-bound, preserves unknown outcomes and does not manufacture live history',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-trades-'));try{
 const d=path.join(root,'artifacts/founder-integration-20261012');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'mt5-demo-profile.json'),JSON.stringify({login:123,server:'fake'}));
 const db=new Database(path.join(d,'demo-execution-20261017.db.orders.db'));db.exec('CREATE TABLE intents(payload TEXT,status TEXT,result TEXT)');
 const base={symbol:'BCHUSD',account:'123',server:'fake',signalId:'one',side:'SELL',entry:100,stop:104,target:92,lots:1,observedAt:1000};
 db.prepare('INSERT INTO intents VALUES(?,?,?)').run(JSON.stringify(base),'closed',JSON.stringify({finalityVerified:true,realizedDemoProfit:8,currency:'EUR'}));db.prepare('INSERT INTO intents VALUES(?,?,?)').run(JSON.stringify({...base,signalId:'foreign',account:'999'}),'closed','{}');db.close();
 const x=readTradingHistory(root);assert.equal(x.demo.trades.length,1);assert.equal(x.demo.trades[0].profit,8);assert.equal(x.live.status,'not-connected');assert.equal(x.live.trades,null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
