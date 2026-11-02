import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='artifacts/trading-three-stage-20261011';
const read=n=>JSON.parse(fs.readFileSync(`${dir}/${n}`));
const sha=x=>createHash('sha256').update(x).digest('hex');
const paper=read('paper-summary.json');let previous='';
const records=fs.readFileSync(`${dir}/paper-journal.jsonl`,'utf8').trim().split('\n').map(line=>{const item=JSON.parse(line);assert.equal(item.record.previousHash,previous);assert.equal(item.sha256,sha(JSON.stringify(item.record)));previous=item.sha256;return item.record;});
assert.equal(previous,paper.finalJournalHash);assert.ok(paper.ended-paper.started>=300000);
const selections=records.filter(r=>r.type==='selection');assert.equal(selections.length,3);
for(const r of records.filter(r=>r.type==='decision')){assert.ok(r.before<=r.after);assert.ok(r.after<=Date.parse(r.recordedAt));const selected=selections.find(s=>s.symbol===r.symbol);assert.ok(selected.trainingEnd+900000<=r.before);assert.ok(Date.parse(selected.recordedAt)<=r.before);}
const actions=Object.fromEntries(['paper-entry','paper-exit','hold','abstain'].map(action=>[action,records.filter(r=>r.action===action).length]));
const files=fs.readdirSync(dir).filter(n=>!n.endsWith('.mjs')).map(name=>({name,sha256:sha(fs.readFileSync(`${dir}/${name}`))}));
const result={completedAt:new Date().toISOString(),status:'bounded-three-stage-research-complete',liveAuthorized:false,profitabilityProven:false,fractionalComparisons:78,matchedPriorSelectionComparisons:78,verification:read('verification.json'),exitFixtures:read('replay-tests.json'),existingRegressionTests:57,eventCases:7,eventAssessment:'Synthetic deterministic rule diagnostic only; outcomes withheld from decision routine, not an independently blinded expert assessment.',paper:{durationMs:paper.ended-paper.started,actions,errors:records.filter(r=>r.type==='data-error').length,accounts:paper.accounts,hashChainVerified:true},limitations:['Historical sample reused; no independent profitability validation','Fractional training changes eligibility; matched prior selections separately reported','Hypothetical fees and lot rules; no broker execution, queue or partial-fill verification','Fresh observation started between 15-minute boundaries; delayed quote entry is an operational variant, not exact historical open execution','Five-minute sample does not establish profitability or HFT capability; open position marks are not realized profit','No real-news event replay or calibrated event probability has been established'],files};
fs.writeFileSync(`${dir}/completion.json`,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({paper:result.paper,completedAt:result.completedAt}));
