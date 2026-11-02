import test from 'node:test';import assert from 'node:assert/strict';import {openFounderTrading} from './founder-trading.mjs';
test('startup is readonly and missing evidence blocks live activation',async()=>{let reads=0;const e=openFounderTrading({file:':memory:',read:async()=>{reads++;return {account:{equity:100,currency:'EUR',observedAt:Date.now()},instruments:[],positions:[],orders:[]}}});await e.cycle();assert.equal(reads,1);assert.equal(e.snapshot().executionEnabled,false);assert.equal(e.snapshot().limits.total,.15);assert.throws(()=>e.control({action:'start-live'}),/nicht/);e.control({action:'stop'});assert.equal(e.snapshot().status,'halted');await e.close();});

test('live readiness requires every independent integration and a fresh account',async()=>{const e=openFounderTrading({file:':memory:',read:async()=>null,executionConfig:{ready:true}});await e.cycle();assert.equal(e.snapshot().liveReady,false);assert.throws(()=>e.control({action:'start-live'}));await e.close();});

test('read failure after activation latches trading off instead of silently resuming',async()=>{let fail=false;const e=openFounderTrading({file:':memory:',read:async()=>{if(fail)throw Error('disconnected');return {account:{identity:'account',currency:'EUR',equity:100,observedAt:Date.now()},instruments:[],positions:[],orders:[]};},executionConfig:{attest:()=>true,adapter:{submitOnce:async()=>({status:'rejected'}),reconcileIntent:async()=>null,manageProtection:async()=>[],cancelOwnEntries:async()=>[]},validation:{verify:()=>true},strategy:{id:'v1'},sizing:async()=>null,day:async()=>null,openPortfolioRisk:async()=>[]}});await e.cycle();e.control({action:'start-live'});fail=true;await e.cycle();assert.equal(e.snapshot().status,'halted');assert.equal(e.snapshot().executionEnabled,false);await e.close();});

test('research polls with headroom inside the unchanged 15 second gap window',async()=>{let interval;const saved=global.setInterval;global.setInterval=(fn,ms)=>{interval=ms;return saved(fn,ms);};const e=openFounderTrading({file:':memory:',read:async()=>null});try{e.start();assert.equal(interval,5000);}finally{global.setInterval=saved;await e.close();}});

test('reads saved historical application notes during the current market cycle',async()=>{
 const now=Date.UTC(2026,9,14,12),end=now/1000-300;let calls=0;
 const e=openFounderTrading({file:':memory:',clock:()=>now,historyLessons:()=>{calls++;return [{id:'saved-macro',application:{horizon:'macro',use:'Finanzierung prüfen'}}];},read:async()=>({account:{identity:'fixture',server:'test',equity:100,currency:'EUR',observedAt:now},positions:[],orders:[],instruments:[{symbol:'EURUSD',bid:103.25,ask:103.26,quoteAt:now,closedBars:Array.from({length:65},(_,i)=>({time:end-(64-i)*300,open:100+i*.05,high:100.2+i*.05,low:99.8+i*.05,close:100+i*.05}))}]})});
 try{await e.cycle();assert.equal(calls,1);assert.deepEqual(e.snapshot().marketContext.samples[0].learnedReferences,['saved-macro']);assert.equal(e.snapshot().executionEnabled,false);assert.equal(e.snapshot().marketContext.samples[0].trend,'up');}finally{await e.close();}
});

test('shared research admission reserves every existing symbol and never silently truncates watches',async()=>{
 const mod=await import('./founder-trading.mjs');assert.equal(typeof mod.planResearchCapture,'function');
 const existing=Array.from({length:79},(_,i)=>'OLD'+i), rows=Array.from({length:50},(_,i)=>({symbol:'NEW'+i}));
 const p=mod.planResearchCapture(existing,rows);assert.equal(p.watch.length,79);assert.equal(p.instruments.length,1);assert.equal(p.admissionLimited,true);
 assert.throws(()=>mod.planResearchCapture(Array.from({length:101},(_,i)=>'S'+i),[]),/capacity/i);
 const old={symbol:'OLD3'};assert.ok(mod.planResearchCapture(existing,[old,...rows]).instruments.includes(old));
});

test('restart reserves persisted observations before admitting a new universe page',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{openForwardObservation}=await import('./trading-forward.mjs');
 const dir=mkdtempSync(join(tmpdir(),'capture-restart-')),file=join(dir,'test.db'),start=Date.UTC(2026,9,15,12),now=start+300000,end=now/1000-300;
 const old=Array.from({length:80},(_,i)=>({symbol:'OLD'+i,bid:100,ask:101,quoteAt:now}));const o=openForwardObservation(file);o.observe({account:{identity:'a',server:'b'},instruments:old},old.map(r=>({symbol:r.symbol,signalId:r.symbol,strategyVersion:'v',side:'BUY',entry:101,stop:90,target:120,observedAt:now,expiresAt:now+15000})),now);o.close();
 const reads=[];let current=start;const engine=openFounderTrading({file,clock:()=>current,read:async request=>{reads.push(request.watch);return {account:{identity:'a',server:'b',observedAt:current},positions:[],orders:[],watchQuotes:[],instruments:[{symbol:'NEW',capability:true,bid:105,ask:105.01,quoteAt:current,closedBars:Array.from({length:65},(_,i)=>({time:end-(64-i)*300,open:100,high:i===64?104:101,low:99,close:i===64?103:100}))}]};}});
 try{current=now;await engine.cycle();await engine.cycle();assert.equal(reads.length,2);assert.equal(reads[1].length,80);assert.ok(reads[1].every(x=>x.startsWith('OLD')));assert.equal(engine.snapshot().capture.admissionLimited,true);}finally{await engine.close();rmSync(dir,{recursive:true,force:true});}
});

test('power off prevents market reads and discards an in-flight observation after stop',async()=>{
 let on=false,reads=0,finish;
 const e=openFounderTrading({file:':memory:',researchControl:()=>on,read:()=>{reads++;return new Promise(r=>finish=r)}});
 try{await e.cycle();assert.equal(reads,0);on=true;const pending=e.cycle();await new Promise(r=>setImmediate(r));on=false;e.suspend();finish({account:{equity:100,currency:'CHF',observedAt:Date.now()},instruments:[],positions:[],orders:[]});await pending;assert.equal(e.snapshot().dataFresh,false);assert.equal(e.snapshot().executionEnabled,false);await e.cycle();assert.equal(reads,1)}finally{await e.close()}
});
