import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {monitorResultObservations} from './founder-monitor-handoff.mjs';
import {openMonitorCoordination,openMonitorState,runMonitorRound} from './numaron-monitor.mjs';
import {openOrderRestoration} from './founder-order-restoration.mjs';

test('actual GitHub monitor search URL survives handoff without granting work or payment',()=>{
 const url='https://github.com/owner/project/issues/1';
 const observations=monitorResultObservations({sourceId:'github-discovery',data:{items:[{url,title:'Bounty',updatedAt:'2026-10-18T00:00:00Z'}]}});
 assert.equal(observations.length,1);assert.equal(observations[0].externalId,url);
 assert.equal(observations[0].data.assignmentConfirmed,false);assert.equal(observations[0].data.paymentConfirmed,false);
});

for(const checkpoint of [false,true])test('observed GitHub page is handed over before later interruption; checkpoint='+checkpoint,async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'handoff-round-'));
 const coordination=openMonitorCoordination(path.join(directory,'control.db'),{inspect:()=>({state:'alive',birth:'fake'})});
 const state=openMonitorState(path.join(directory,'state.db'));let on=true;
 try{
  coordination.setOwner('local','isolated-fake');const lease=coordination.acquire({owner:'local',pid:1,birth:'fake'});
  const data={items:[{url:'https://github.com/owner/project/issues/1',title:'Task'}]};
  const result=await runMonitorRound({directory,coordination,lease,state,assertActive(){if(!on)throw Error('OFF');},sources:[{id:'github-discovery',run:async ctx=>{if(checkpoint){ctx.checkpoint({data,cursor:2});on=false;throw Error('interrupted');}return {data,cursor:2};}},{id:'later',run:async()=>{on=false;throw Error('interrupted');}}]});
  assert.equal(result.status,'interrupted');assert.equal(state.get('github-discovery').cursor,2);
  const handoffs=fs.readdirSync(path.join(directory,'handoffs')).map(name=>JSON.parse(fs.readFileSync(path.join(directory,'handoffs',name))));
  assert.equal(handoffs.flatMap(x=>x.observations).length,1);
  const options={base:directory,directory:path.join(directory,'restoration'),handoffDirectory:path.join(directory,'handoffs'),isEnabled:()=>on,workPackages:{rows:[{id:'github-core',label:'GitHub',inventoryKind:'core'}]}};
  let engine=openOrderRestoration(options);
  try{engine.tick();assert.equal(engine.status().observations,0);on=true;engine.tick();assert.equal(engine.status().observations,1);assert.equal(engine.status().orders,0);engine.close();engine=openOrderRestoration(options);engine.tick();assert.equal(engine.status().observations,1);assert.equal(engine.status().orders,0);}finally{engine.close();}
 }finally{state.close();coordination.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('failed handoff publication never advances successful source cursor',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'handoff-failure-'));
 const coordination=openMonitorCoordination(path.join(directory,'control.db'),{inspect:()=>({state:'alive',birth:'fake'})}),state=openMonitorState(path.join(directory,'state.db'));
 try{coordination.setOwner('local','isolated-fake');const lease=coordination.acquire({owner:'local',pid:1,birth:'fake'});fs.writeFileSync(path.join(directory,'handoffs'),'blocked-directory');await runMonitorRound({directory,coordination,lease,state,assertActive(){},sources:[{id:'github-discovery',run:async()=>({data:{items:[{url:'https://github.com/owner/project/issues/1'}]},cursor:2})}]});assert.equal(state.get('github-discovery').cursor,null);assert.equal(state.get('github-discovery').status,'source-unavailable');}finally{state.close();coordination.close();fs.rmSync(directory,{recursive:true,force:true});}
});
