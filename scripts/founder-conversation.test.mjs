import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderController} from './founder-controller.mjs';import {openFounderBudget} from './founder-budget.mjs';
import {speakable,utterance,assignment,openConversationLog} from './founder-conversation.mjs';
import Database from 'better-sqlite3';

test('spoken words never carry secrets, contact data or full links',()=>{
 const said=speakable('Mail an jane.doe@example.org, Schlüssel sk-abcdef1234567890 und ghp_abcdefghijkl1234, token=geheim123, Tel +41 79 123 45 67, IBAN CH93 0076 2011 6238 5295 7, siehe https://example.com/private/path?x=1');
 for(const leak of ['jane.doe','sk-abcdef','ghp_abc','geheim123','79 123','6238','/private/path'])assert.ok(!said.includes(leak),leak);
 assert.match(said,/example\.com/);
 assert.equal(speakable('Bericht vom 2026-11-03 fertig'),'Bericht vom 2026-11-03 fertig');
 assert.equal(speakable('x'.repeat(400)).length,280);
 assert.equal(speakable(null),'');
});

test('a worker reports only what its result really says',()=>{
 assert.equal(utterance({summary:'Drei Ausschreibungen passen.'}),'Drei Ausschreibungen passen.');
 assert.equal(utterance({sources:[1,2,3]}),'3 Quellen geprüft und abgelegt.');
 assert.equal(utterance({costReceipt:{}}),'Ergebnis geprüft und abgelegt.');
 assert.equal(assignment({title:'Quellen lesen',question:'Was gilt für Lieferfristen?'}),'Quellen lesen – Was gilt für Lieferfristen?');
});

test('the journal stays bounded',()=>{
 const db=new Database(':memory:'),log=openConversationLog(db,{limit:5});
 for(let i=0;i<9;i++)log.record({taskId:'t'+i,from:'controller',to:'exa-research',act:'assign',text:'Auftrag '+i});
 assert.equal(log.record({taskId:'x',from:'controller',to:'exa-research',act:'gossip',text:'erfunden'}),false);
 const rows=log.recent(50);assert.equal(rows.length,5);assert.equal(rows[0].text,'Auftrag 8');db.close();
});

test('the controller records assignments, handovers, reports and blockers of real work',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'conversation-')),file=path.join(dir,'controller.db');
 const budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'isolated-conversation'});
 const adapters={
  'exa-research':{maxCostRappen:0,execute:async()=>({summary:'Zwei passende Quellen gefunden.',costReceipt:{actualCostRappen:0,evidenceRef:'fixture'}}),verify:()=>true},
  'private-draft':{maxCostRappen:0,execute:async({dependencies})=>({text:'Entwurf aus '+dependencies.length+' Vorarbeit.',costReceipt:{actualCostRappen:0,evidenceRef:'fixture'}}),verify:()=>true},
  'private-analysis':{maxCostRappen:0,execute:async()=>{throw Error('kaputt');},verify:()=>true},
 };
 const c=openFounderController({file,budget,adapters});
 try{
  c.enqueue({id:'read',rootTaskId:'read',kind:'exa-research',input:{title:'Quellen lesen'},dependencies:[],resources:[]});
  c.enqueue({id:'draft',rootTaskId:'read',kind:'private-draft',input:{title:'Entwurf bauen'},dependencies:['read'],resources:[]});
  c.enqueue({id:'check',rootTaskId:'check',kind:'private-analysis',input:{title:'Zahlen prüfen'},dependencies:[],resources:[]});
  c.control('start');await c.tick();await c.tick();
  const said=c.snapshot().conversations;
  const find=(act,taskId)=>said.find(r=>r.act===act&&r.taskId===taskId);
  assert.equal(find('assign','read').text,'Quellen lesen');assert.equal(find('assign','read').from,'controller');
  assert.equal(find('report','read').text,'Zwei passende Quellen gefunden.');
  const handover=find('handover','draft');assert.equal(handover.from,'exa-research');assert.equal(handover.to,'private-draft');assert.equal(handover.text,'Zwei passende Quellen gefunden.');
  assert.equal(find('report','draft').text,'Entwurf aus 1 Vorarbeit.');
  assert.match(find('fail','check').text,/fehlgeschlagen/);
  assert.ok(said.every(r=>Number.isSafeInteger(r.seq)&&Number.isSafeInteger(r.at)));
 }finally{await c.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});
