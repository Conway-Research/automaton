import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import Database from 'better-sqlite3';
import {observePairedResearch} from './paired-demo-research.mjs';
const start=1800000000000;
function market(now){const end=Math.floor(now/300000)*300-300,b=Array.from({length:100},(_,i)=>({time:end-(99-i)*300,open:100,high:101,low:99,close:100}));b.at(-1).close=102;b.at(-1).high=103;return {readOnly:true,executionEnabled:false,accountBinding:{demo:true,tradeMode:0},account:{identity:'123',server:'fixture',mode:0,currency:'EUR',observedAt:now},scan:{cryptoUniverse:[{symbol:'TEST'}]},instruments:[{symbol:'TEST',capability:true,bid:102,ask:102.5,quoteAt:now,closedBars:b,volumeMin:.01,costTerms:{path:'Cryptocurrencies\\TEST',contractSize:1,observedAt:now}}],watchQuotes:[]};}
test('OFF has no database side effects; wrong binding is rejected',()=>{assert.equal(observePairedResearch({file:'unused',market:{},now:start,powerAllowed:false}).status,'off');assert.throws(()=>observePairedResearch({file:'unused',market:market(start),now:start,powerAllowed:true,expectedBinding:{login:456,server:'fixture'}}));});
test('new61 cohort excludes only irrelevant old bars and preserves a separate frozen policy',()=>{const dir=mkdtempSync(join(tmpdir(),'paired61-')),file=join(dir,'study.db'),binding={login:123,server:'fixture'};try{
 const run=(m,now,cohort='61')=>observePairedResearch({file,market:m,now,powerAllowed:true,expectedBinding:binding,cohort});run(market(start),start);
 const now=start+600000,m=market(now);m.instruments[0].closedBars[0].time-=300;
 const result=run(m,now);assert.equal(result.cohortPolicy.historyBars,61);assert.equal(result.variants.find(x=>x.id==='baseline').open,1);
 assert.throws(()=>run(m,now,'legacy'),/policy changed/);
 const badFile=join(dir,'bad.db');observePairedResearch({file:badFile,market:market(start),now:start,powerAllowed:true,expectedBinding:binding,cohort:'61'});
 const bad=market(now);bad.instruments[0].closedBars[90].time-=60;
 const rejected=observePairedResearch({file:badFile,market:bad,now,powerAllowed:true,expectedBinding:binding,cohort:'61'});assert.equal(rejected.variants.find(x=>x.id==='baseline').open,0);
 }finally{rmSync(dir,{recursive:true,force:true});}});
test('same future signal creates paired baseline/spread/trend rows, deduplicates and persists frozen cohort',()=>{const dir=mkdtempSync(join(tmpdir(),'paired-demo-')),file=join(dir,'study.db'),binding={login:123,server:'fixture'};try{
 const run=(m,now)=>observePairedResearch({file,market:m,now,powerAllowed:true,expectedBinding:binding});run(market(start),start);
 const now=start+600000;const one=run(market(now),now);run(market(now),now);
 assert.equal(one.startedAt,start);assert.equal(one.executionEnabled,false);assert.equal(one.profitabilityProven,false);
 const db=new Database(file,{readonly:true});const rows=db.prepare('SELECT profile,status,payload FROM strategy_opt_records').all();assert.equal(rows.length,5);
 assert.equal(rows.find(x=>x.profile==='baseline').status,'open');assert.equal(rows.find(x=>x.profile==='spread').status,'filtered');assert.ok(rows.find(x=>x.profile==='trend'));
 assert.equal(new Set(rows.map(x=>JSON.parse(x.payload).signalId)).size,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM paired_observations').get().n,3);db.close();
 const changed=market(now);changed.account.identity='456';assert.throws(()=>observePairedResearch({file,market:changed,now,powerAllowed:true,expectedBinding:{login:456,server:'fixture'}}),/cohort binding changed/);
 const unchanged=new Database(file,{readonly:true});assert.equal(unchanged.prepare('SELECT COUNT(*) n FROM paired_observations').get().n,3);assert.equal(unchanged.prepare('SELECT COUNT(*) n FROM strategy_opt_records').get().n,5);unchanged.close();
 }finally{rmSync(dir,{recursive:true,force:true});}});
