import test from 'node:test';import assert from 'node:assert/strict';
import {runtimeHealth} from '../web/founder/model.mjs';
const now=Date.parse('2026-10-19T11:00:00Z');
test('active work has names and remains primary alongside waiting work',()=>{
 const h=runtimeHealth({status:'running',activeWorkers:2,tasks:[{status:'running',input:{title:'Antworten prüfen'}},{status:'verifying',title:'Bericht prüfen'},{status:'queued',waitState:{code:'dependency',reason:'Vorarbeit fehlt.',until:null}}]},now);
 assert.equal(h.label,'2 Aufgaben in Arbeit');assert.match(h.detail,/Antworten prüfen/);assert.match(h.detail,/Bericht prüfen/);assert.match(h.detail,/Vorarbeit fehlt/);
});
test('scheduled monitor keeps actual check time separate from its next check',()=>{
 const h=runtimeHealth({status:'running',tasks:[]},now,{status:'waiting',checkedAt:new Date(now-1000).toISOString(),nextAt:now+600000});
 assert.match(h.label,/Prüfungen geplant/);assert.match(h.detail,/nächste Auftragsprüfung/);assert.match(h.detail,/13:10/);assert.doesNotMatch(h.detail,/Start/);
});
test('unknown prerequisite date is not replaced by a promised start',()=>{
 const h=runtimeHealth({status:'running',tasks:[{status:'queued',waitState:{code:'evidence',reason:'Quellenprüfung erforderlich.',until:null,checkAt:now+60000}}]},now);
 assert.match(h.detail,/Quellenprüfung erforderlich/);assert.match(h.detail,/Fortsetzungstermin offen/);assert.match(h.detail,/Nächste automatische Prüfung/);assert.doesNotMatch(h.detail,/Vorgemerkter Start|Weiter ab/);
});
test('stale monitor and past schedule never claim a current running check or future deadline',()=>{
 const h=runtimeHealth({status:'running',tasks:[]},now,{status:'running',checkedAt:new Date(now-3600000).toISOString(),nextAt:now-1000});
 assert.match(h.detail,/Monitorstatus veraltet/);assert.doesNotMatch(h.label,/Auftragsprüfung läuft/);
});
test('stopped state cannot announce active work or an automatic resumption',()=>{
 const h=runtimeHealth({status:'stopped',activeWorkers:0,tasks:[]},now,{status:'running',checkedAt:new Date(now).toISOString()});
 assert.equal(h.label,'Ausgeschaltet');assert.match(h.detail,/persönlich/);assert.doesNotMatch(h.detail,/Prüfung läuft/);
});
test('a ready queue is distinguished from missing prerequisites and fixed future tasks',()=>{
 const ready=runtimeHealth({status:'running',tasks:[{status:'queued',waitState:{code:'worker',reason:'Bereit.',until:null}}]},now);
 assert.match(ready.label,/nächste Schritte/);
 const planned=runtimeHealth({status:'running',tasks:[{status:'queued',waitState:{code:'scheduled',reason:'Für später geplant.',until:now+600000}}]},now);
 assert.match(planned.detail,/Geplant ab/);assert.match(planned.detail,/13:10/);
});
