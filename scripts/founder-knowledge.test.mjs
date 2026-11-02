import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderKnowledge,planFounderWork,admissibleResearchSources} from './founder-knowledge.mjs';

test('official escrow read capability is scheduled within the existing six-hour work loop',()=>{
 const jobs=planFounderWork({now:Date.parse('2026-10-15T19:00:00Z'),capabilities:[{kind:'dealwork-escrow',status:'available',maxCostRappen:0}],budget:{active:true,dayRemainingRappen:100,remainingRappen:100}});
 assert.equal(jobs.length,1);assert.equal(jobs[0].kind,'dealwork-escrow');assert.ok(jobs[0].input.title);assert.equal(planFounderWork({now:Date.parse('2026-10-15T19:00:00Z'),completed:jobs.map(j=>j.id),capabilities:[{kind:'dealwork-escrow',status:'available',maxCostRappen:0}]}).length,0);
});
test('expired or contradicted source claims never feed paid analysis',()=>{
 const now=Date.now(),source=(id,age)=>({id,observedAt:new Date(now-age).toISOString(),url:'https://example.com/'+id,claim:'Reported source'});
 const selected=admissibleResearchSources([source('fresh',0),source('old',8*86400000),source('wrong',0)],[{id:'wrong',verification:'contradicted'}],now);assert.deepEqual(selected.map(s=>s.id),['fresh']);
});
test('selection follows available capabilities, budget, checked knowledge and failure cooldown',()=>{
 const now=Date.now(),capabilities=[{kind:'research',status:'verified',maxCostRappen:0},{kind:'order-report',status:'blocked'},{kind:'finance-report',status:'configured',maxCostRappen:0}];
 assert.equal(planFounderWork({now,capabilities,budget:{active:false}}).length,0);
 const tasks=planFounderWork({now,capabilities,budget:{active:true,dayRemainingRappen:10,remainingRappen:10},observations:[{kind:'finance-report',status:'failed',updated_ms:now-1000}],knowledge:[{id:'a',claim:'Checked finding',verification:'checked',expiresAt:now+100000},{id:'b',claim:'Untrusted profit claim',verification:'reported',expiresAt:now+100000}]});assert.deepEqual(tasks.map(t=>t.kind),['research']);assert.deepEqual(tasks[0].input.checkedKnowledgeIds,['a']);assert.ok(tasks[0].input.reason);
});
test('knowledge preserves provenance, excludes stale or contradicted sources and deduplicates work',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-knowledge-')),k=openFounderKnowledge(path.join(dir,'knowledge.db')),now=Date.now();
 try{const row={id:'one',claim:'Observed request',sources:['https://github.com/example/repo/issues/1'],observedAt:now,expiresAt:now+1000,verification:'reported'};k.record(row);k.record(row);assert.equal(k.snapshot(now).length,1);assert.equal(k.usable(now).length,0);k.record({...row,verification:'checked'});assert.equal(k.usable(now).length,1);assert.equal(k.usable(now+1001).length,0);k.record({...row,verification:'contradicted'});assert.equal(k.usable(now).length,0);
 const first=planFounderWork({now,completed:[]}),second=planFounderWork({now,completed:first.map(t=>t.id)});assert.ok(first.some(t=>t.kind==='research'));assert.equal(second.length,0);assert.ok(first.every(t=>t.dependencies.length===0));assert.throws(()=>k.record({...row,sources:['file:///secret']}));
 }finally{k.close();fs.rmSync(dir,{recursive:true,force:true});}
});
