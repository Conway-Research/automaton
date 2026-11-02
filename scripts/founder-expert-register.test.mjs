import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createRegister,validateRegister,parseContractRequirements,CONTRACT_IDS} from './founder-expert-register.mjs';import {createEvidenceRegistry} from './founder-evidence-registry.mjs';
const markdown=fs.readFileSync('docs/numaron-expert-completeness-contract-20261026.md','utf8');
const fresh=()=>createRegister(markdown,{contractSHA:'a'.repeat(64),source:'docs/contract.md'});
const b={sourceDigest:'1'.repeat(64),modelDigest:'2'.repeat(64),runtimeDigest:'3'.repeat(64)};
const contractSHA='a'.repeat(64),{reader:evidence,writer}=createEvidenceRegistry(),results={executed:true,independent:true,passed:5,total:5,heldOutPassed:2,heldOutTotal:2};
const reportDigest=id=>writer.add('verifier-report',{requirementId:id,accepted:true,verifier:'module',heldOutCases:['h1','h2'],binding:b,contractSHA,results});
const pass=e=>Object.assign(e,{state:'geprüft-bestanden',owner:'module',competenceScope:'Bounded scope',metrics:['m'],trainingCases:['t1'],heldOutCases:['h1','h2'],baseline:'baseline:1',candidate:'candidate:1',binding:b,results:{executed:true,passed:5,total:5,heldOutPassed:2,heldOutTotal:2,evidenceRef:'fake:log',reportDigest:reportDigest(e.id),synthetic:true,independent:true}});
test('all 21 contract requirements start open with unknown cost and no result',()=>{
 const r=fresh();assert.equal(r.entries.length,21);assert.deepEqual(r.entries.map(e=>e.id),[...CONTRACT_IDS]);
 for(const e of r.entries){assert.equal(e.state,'offen');assert.equal(e.results,null);assert.equal(e.costs.status,'unknown');assert.equal(e.humanMinutes,null);}
 const v=validateRegister(r);assert.equal(v.valid,true);assert.equal(v.summary.passed,0);assert.equal(v.summary.overallAccepted,false);
});
test('a removed or renamed contract requirement is refused',()=>{
 assert.throws(()=>parseContractRequirements(markdown.replace('| T07 |','| T99 |')),/changed/);
 const r=fresh();r.entries.pop();assert.equal(validateRegister(r).valid,false);
});
test('a pre-filled pass without execution is rejected and counts as failed',()=>{
 const r=fresh();Object.assign(r.entries[0],{state:'geprüft-bestanden'});const v=validateRegister(r);
 assert.equal(v.valid,false);assert.equal(v.entries[0].effective,'fehlgeschlagen');assert.equal(v.summary.passed,0);
 assert.ok(v.issues.some(i=>i.issue==='results-not-executed-or-not-complete'));
});
for(const [name,change,issue] of [
 ['green training without held-out cases',e=>{e.heldOutCases=[];e.results.heldOutPassed=0;e.results.heldOutTotal=0;},'held-out-cases-missing'],
 ['held-out cases reused from training',e=>{e.heldOutCases=['t1','h2'];},'held-out-overlaps-training'],
 ['one failing check',e=>{e.results.passed=4;},'results-not-executed-or-not-complete'],
 ['a held-out failure',e=>{e.results.heldOutPassed=1;},'held-out-not-all-passed'],
 ['self assessment only',e=>{e.results.independent=false;},'not-independently-checked'],
 ['a missing model binding',e=>{e.binding={...b,modelDigest:null};},'binding-incomplete'],
 ['undeclared synthetic scope',e=>{delete e.results.synthetic;},'synthetic-scope-not-declared']
])test('pass is refused with '+name,()=>{const r=fresh();pass(r.entries[0]);change(r.entries[0]);const v=validateRegister(r);assert.ok(v.issues.some(i=>i.issue===issue));assert.equal(v.entries[0].effective,'fehlgeschlagen');});
test('a complete pass counts, but one pass is no overall acceptance',()=>{const r=fresh();pass(r.entries[0]);const v=validateRegister(r,{evidence});assert.equal(v.valid,true);assert.equal(v.summary.passed,1);assert.equal(v.summary.overallAccepted,false);});
test('a changed source, model or runtime invalidates only affected passes',()=>{
 const r=fresh();pass(r.entries[0]);pass(r.entries[1]);r.entries[1].binding={...b,sourceDigest:'9'.repeat(64)};
 r.entries[1].results.reportDigest=writer.add('verifier-report',{requirementId:r.entries[1].id,accepted:true,verifier:'module',heldOutCases:['h1','h2'],binding:r.entries[1].binding,contractSHA,results});const v=validateRegister(r,{current:{sourceDigest:b.sourceDigest},evidence});assert.equal(v.entries[0].effective,'geprüft-bestanden');assert.equal(v.entries[1].effective,'entwertet');assert.equal(v.summary.passed,1);
});
test('overall acceptance needs all 21 current passes',()=>{const r=fresh();r.entries.forEach(pass);assert.equal(validateRegister(r,{current:b,evidence,contractSHA}).summary.overallAccepted,true);assert.equal(validateRegister(r,{current:{...b,runtimeDigest:'9'.repeat(64)},evidence,contractSHA}).summary.overallAccepted,false);r.entries[20].state='blockiert';assert.equal(validateRegister(r,{current:b,evidence,contractSHA}).summary.overallAccepted,false);});
test('personnel cost is refused and human time stays minutes',()=>{
 const r=fresh();r.entries[0].costs={status:'complete',personnelCost:10};r.entries[1].humanMinutes='2h';r.entries[2].salary=1;
 const issues=validateRegister(r).issues;assert.equal(issues.filter(i=>i.issue==='personnel-cost-forbidden').length,2);assert.ok(issues.some(i=>i.id==='F02'&&i.issue==='human-time-must-be-minutes'));
});
