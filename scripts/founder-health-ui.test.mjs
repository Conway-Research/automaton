import test from 'node:test';import assert from 'node:assert/strict';
import {runtimeHealth,capabilityStatus,taskWaitText,codeCapability} from '../web/founder/model.mjs';
test('code capabilities distinguish bounded pipeline, free execution and a recurring protection check',()=>{
 const a={codeOrders:{isolated:false,isolation:{code:'verified'}},capabilities:[]};
 assert.match(codeCapability({kind:'order-prepare',status:'blocked',reason:'Offline-Isolation erfolgreich geprüft.'},a).reason,/Schutzprüfung läuft/);
 assert.match(codeCapability({kind:'code-execution',status:'blocked'},a).reason,/Private JavaScript-Tests/);
 assert.equal(codeCapability({kind:'code-execution',status:'blocked',reason:'Numaron ist OFF'},a).reason,'Numaron ist OFF');
 assert.equal(codeCapability({kind:'order-code',status:'blocked',reason:'GitHub-Zugang fehlt'},a).reason,'GitHub-Zugang fehlt');
});
test('enabled idle controller distinguishes scheduled tasks, failures and capability blocks',()=>{
 const now=Date.now(),a={status:'running',activeWorkers:0,taskCounts:{failed:28,blocked:4,queued:8},tasks:[{status:'queued',nextEligibleAt:now+86400000}],capabilities:[{status:'blocked'}]};
 const health=runtimeHealth(a,now);assert.equal(health.label,'Eingeschaltet · nächste Prüfungen geplant');assert.equal(health.failed,28);assert.equal(health.blocked,4);assert.equal(health.capabilityGaps,1);assert.equal(health.nextAt,now+86400000);assert.match(taskWaitText(a.tasks[0],now),/Geplant ab/);
 assert.equal(runtimeHealth({...a,activeWorkers:1},now).label,'1 Aufgabe in Arbeit');assert.equal(runtimeHealth({...a,status:'stopped'},now).label,'Ausgeschaltet');
});
test('historical success cannot mask a newer failed capability run or a blocked adapter',()=>{
 assert.match(capabilityStatus({status:'verified',lastSuccessAt:10,lastOutcome:{status:'failed',at:20}}),/Letzter Lauf fehlgeschlagen/);
 assert.match(capabilityStatus({status:'blocked',lastSuccessAt:10}),/Gesperrt/);
 assert.match(capabilityStatus({status:'verified',lastSuccessAt:20,lastOutcome:{status:'done',at:20}}),/Letzter Lauf erfolgreich/);
});
