import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openFounderController} from './founder-controller.mjs';
import {FOUNDER_LIMITS} from './founder-budget.mjs';

test('approved ten worker default admits ten distinct jobs and leaves the eleventh queued',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-ten-workers-'));let release;
 const gate=new Promise(resolve=>{release=resolve;});let calls=0;
 const budget={snapshot:()=>({active:true,remainingRappen:15000,dayRemainingRappen:2000,taskRappen:250,entries:[],entriesComplete:true}),reserve:()=>({}),settle(){}};
 const c=openFounderController({file:path.join(dir,'controller.db'),budget,adapters:{read:{maxCostRappen:0,execute:async()=>{calls++;await gate;return {};},verify:()=>true}}});
 try{
  assert.equal(FOUNDER_LIMITS.maxWorkers,10);
  assert.deepEqual([FOUNDER_LIMITS.periodRappen,FOUNDER_LIMITS.dailyRappen,FOUNDER_LIMITS.taskRappen],[15000,2000,250]);
  for(let i=0;i<11;i++)c.enqueue({id:`job-${i}`,rootTaskId:`job-${i}`,kind:'read',input:{},dependencies:[],resources:[]});
  c.control('start');const tick=c.tick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.snapshot().maxWorkers,10);assert.equal(calls,10);assert.equal(c.snapshot().taskCounts.queued,1);
  await c.tick();assert.equal(calls,10);
  release();await tick;await c.tick();assert.equal(calls,11);assert.equal(c.snapshot().taskCounts.done,11);
 }finally{release();await c.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('limits above ten remain rejected',()=>{
 assert.throws(()=>openFounderController({maxWorkers:11}),/Worker limit invalid/);
});
