import test from 'node:test';
import assert from 'node:assert/strict';
import {taskWaitText} from '../web/founder/model.mjs';
import {explainTaskWait} from './founder-task-wait.mjs';
import {planFounderWork} from './founder-knowledge.mjs';
test('periodic planning does not pile another generic research on pending work',()=>{
 const planned=planFounderWork({now:Date.now(),observations:[{id:'old',kind:'research',status:'queued',updated_ms:1}],capabilities:[{kind:'research',status:'available',maxCostRappen:0}]});
 assert.equal(planned.length,0);
});
test('scheduler explanation keeps dependency and research review distinct',()=>{
 const task={status:'queued',input:{}};
 assert.equal(explainTaskWait(task,{waitState:{reason:'review'}},[{id:'prior',status:'failed'}]).code,'dependency');
 assert.equal(explainTaskWait(task,{waitState:{reason:'review'}},[]).reason,'review');
 assert.equal(explainTaskWait({...task,input:{notBefore:5000}},{},[],1000).until,5000);
});
test('a review condition is not presented as a promised restart time',()=>{
 assert.match(taskWaitText({kind:'research',waitState:{reason:'Quellenprüfung erforderlich.',until:null,checkAt:2000}},1000),/Quellenprüfung erforderlich/);
 assert.doesNotMatch(taskWaitText({kind:'research',waitState:{reason:'Quellenprüfung erforderlich.',until:null,checkAt:2000}},1000),/Geplant ab/);
});
test('dependency name and actual planned time remain visible',()=>{
 assert.match(taskWaitText({waitState:{reason:'Wartet auf Vorarbeit: Recherche A.',until:200000}},1000),/Recherche A/);
 assert.match(taskWaitText({waitState:{reason:'Abrufpause.',until:200000}},1000),/1970/);
});
