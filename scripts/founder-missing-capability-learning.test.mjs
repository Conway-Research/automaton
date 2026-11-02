import test from 'node:test';import assert from 'node:assert/strict';
import {buildLearningInputs} from '../src/research/curriculum.ts';
import {deriveKnowledgeGaps,rankLearningWork} from '../src/research/relevance.ts';
const base={missionDigest:'fixture',now:1000,knowledge:[],researchCapability:'adaptive-learning',capabilities:[{kind:'adaptive-learning',status:'available'},{kind:'known-reader',status:'blocked'}],tasks:[{id:'unknown-task',kind:'new-format',status:'blocked',updated_ms:900}]};
const missing=i=>i.observations.filter(o=>o.topicId?.startsWith('missing-capability-'));
test('unregistered capability becomes a bounded learning observation through the existing authorized channel',()=>{
 const i=buildLearningInputs(base),rows=missing(i);assert.equal(rows.length,1);assert.equal(rows[0].capability,'adaptive-learning');assert.match(rows[0].application,/isoliert/i);
 const gap=deriveKnowledgeGaps(rows,i.goals),c={now:1000,powerEnabled:true,controllerRunning:true,budgetActive:true,budgetRemainingRappen:100,dayRemainingRappen:100,rootRemainingRappen:100,availableSlots:1,policyDigest:'policy',limitsDigest:'limits',goalId:i.goals[0].id,goalVersion:1,permissions:['adaptive-learning']};
 assert.equal(rankLearningWork(gap,c)[0].eligible,true);assert.equal(rankLearningWork(gap,{...c,powerEnabled:false})[0].eligible,false);assert.equal(rankLearningWork(gap,{...c,permissions:[]})[0].eligible,false);
 assert.equal(i.observations.some(o=>o.topicId==='failure-new-format'),false);
});
test('known blocked access, completed tasks and missing inventory are not inferred to be missing skills',()=>{
 assert.equal(missing(buildLearningInputs({...base,tasks:[{id:'known',kind:'known-reader',status:'blocked'}]})).length,0);
 assert.equal(missing(buildLearningInputs({...base,tasks:[{id:'done',kind:'new-format',status:'done'}]})).length,0);
 assert.equal(missing(buildLearningInputs({...base,capabilities:undefined})).length,0);
});
test('duplicate failures coalesce and private task content is not copied into a learning prompt',()=>{
 const tasks=Array.from({length:30},(_,n)=>({id:'task-'+n,kind:'new-format',status:'failed',updated_ms:900,input:{title:'PRIVATE-CUSTOMER-SECRET'}}));const rows=missing(buildLearningInputs({...base,tasks}));assert.equal(rows.length,1);assert.ok(rows[0].evidenceIds.length<=8);assert.equal(JSON.stringify(rows).includes('PRIVATE-CUSTOMER-SECRET'),false);
});
