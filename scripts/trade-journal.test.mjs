import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openTradeJournal} from './trade-journal.mjs';
test('journal survives reopening, prevents conflicting duplicate events and refuses stale decisions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trade-journal-')),file=path.join(dir,'events.db');
 let j=openTradeJournal(file);
 try{
  const now=Date.now(),p={decision:'PROPOSAL',symbol:'SYNTHETIC',side:'BUY',entry:100,stop:99,target:102,lots:1,plannedLoss:1,margin:20,estimatedCosts:.1,observedAt:new Date(now).toISOString(),expiresAt:new Date(now+10000).toISOString(),rationale:'fixture',invalidation:'fixture',riskChecked:true,costsVerified:true};
  assert.equal(j.recordProposal('p1',p),true);assert.equal(j.recordProposal('p1',p),false);
  assert.throws(()=>j.recordProposal('p1',{...p,lots:2}),/Conflicting/);
  assert.throws(()=>j.recordProposal('p2',{...p,expiresAt:new Date(now-1).toISOString()}),/stale/);
  assert.throws(()=>j.observe({observedAt:'invalid',positions:[],pendingOrders:[]}));
  j.decide('d1','p1','declined');j.close();j=openTradeJournal(file);
  assert.equal(j.snapshot().history.length,2);assert.equal(j.snapshot().proposal.id,'p1');assert.equal(j.snapshot().executionEnabled,false);
 }finally{j.close();fs.rmSync(dir,{recursive:true,force:true});}
});
