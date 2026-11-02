import test from 'node:test';import assert from 'node:assert/strict';import {sourceRepairTask,resumableLegacySourceRepair} from './founder-source-repair.mjs';
test('only the once-failed legacy free source repair with matching settled receipt can resume',()=>{
 const t={kind:'exa-research',status:'failed',attempts:1,input:{sourceRepair:{}},diagnostic:{code:'local_read_failed'},run_id:'old'},r={actualCostRappen:0,evidenceRef:'local:old'};
 assert.equal(resumableLegacySourceRepair(t,r),true);assert.equal(resumableLegacySourceRepair({...t,attempts:2},r),false);assert.equal(resumableLegacySourceRepair(t,{...r,actualCostRappen:null}),false);assert.equal(resumableLegacySourceRepair(t,{...r,evidenceRef:'other'}),false);
});
test('wrong sources create one bounded search under the original budget with public repository provenance',()=>{
 const job={id:'deep',rootTaskId:'root',kind:'firecrawl-research',status:'queued',input:{researchGoal:'owner/target: Prüfen'},dependencies:['wrong']};
 const history=[{id:'wrong',status:'done'},{id:'evidence',status:'done'}];const results={wrong:{sources:[{url:'https://github.com/other/repo'}]},evidence:{sources:[{url:'https://github.com/owner/target/pull/1'}]}};
 const r=sourceRepairTask(job,history,id=>results[id]);assert.equal(r.rootTaskId,'root');assert.equal(r.kind,'exa-research');assert.deepEqual(r.dependencies,['evidence']);assert.equal(r.input.researchGoal,job.input.researchGoal);assert.equal(r.input.sourceRepair.originalTaskId,'deep');
 assert.equal(sourceRepairTask(job,[...history,{id:r.id}],id=>results[id]),null);
 assert.equal(sourceRepairTask({...job,input:{...job.input,sourceRepair:r.input.sourceRepair}},history,id=>results[id]),null);
 assert.equal(sourceRepairTask(job,history,id=>({...results[id],privacy:'private'})),null);
 assert.equal(sourceRepairTask({...job,dependencies:['evidence']},history,id=>results[id]),null);
});
