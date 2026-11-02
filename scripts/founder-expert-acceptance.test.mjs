// Offline acceptance D01, D02, D06-D12. D07, D08 and D11 bind the existing research modules instead of a second implementation.
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {EXPERT_FAMILIES,nextExpertFamily,expertRelease,invalidateEvidence,decideRepair,economicsClaim as claim,realProfitMilestones,operatingBoundaryIssues} from './founder-expert-acceptance.mjs';import {createEvidenceRegistry} from './founder-evidence-registry.mjs';
import {validateRegister,createRegister} from './founder-expert-register.mjs';
import {assessImprovement} from '../src/research/improvement.ts';
import {deriveKnowledgeGaps,rankLearningWork} from '../src/research/relevance.ts';
import {spec,results,workload} from '../src/__tests__/adaptive-research-fixtures.ts';
const h=c=>c.repeat(64),receiptPolicy={acceptedTypes:['receipt']},economicsClaim=a=>claim({receiptPolicy,...a}),milestones=m=>realProfitMilestones(m,{now:Date.parse('2030-01-01T00:00:00Z'),receiptPolicy}),{reader:evidence,writer}=createEvidenceRegistry(),contractSHA=h('0');
const bound={sourceDigest:h('a'),modelDigest:h('b'),runtimeDigest:h('c')};
const reportOf=(id,binding)=>writer.add('verifier-report',{requirementId:id,accepted:true,verifier:'founder-data-verifier',heldOutCases:['h1','h2'],binding,contractSHA,results:{executed:true,independent:true,passed:12,total:12,heldOutPassed:2,heldOutTotal:2}});
const entry=over=>({id:'F02',state:'geprüft-bestanden',owner:'founder-data-verifier',competenceScope:'CSV-Bereinigung bis 10000 Zeilen',metrics:['row-reconciliation'],trainingCases:['t1'],heldOutCases:['h1','h2'],baseline:'baseline:1',candidate:'candidate:1',binding:bound,results:{executed:true,passed:12,total:12,evidenceRef:'report:x',reportDigest:reportOf('F02',bound),synthetic:true,independent:true,heldOutPassed:2,heldOutTotal:2},costs:{status:'unknown'},humanMinutes:null,...over});

test('D01 data comes first, then interfaces, then repairs, then the further families',()=>{
 const done=n=>Object.fromEntries(EXPERT_FAMILIES.slice(0,n).map(f=>[f,'geprüft-bestanden']));
 const p={technicalAcceptance:true,pilotPrerequisites:true};
 assert.deepEqual(EXPERT_FAMILIES.slice(0,3),['daten','schnittstellen','reparaturen']);
 assert.equal(nextExpertFamily({...p,families:{}}).next,'daten');assert.equal(nextExpertFamily({...p,families:done(1)}).next,'schnittstellen');assert.equal(nextExpertFamily({...p,families:done(2)}).next,'reparaturen');assert.equal(nextExpertFamily({...p,families:done(3)}).next,EXPERT_FAMILIES[3]);
 assert.equal(nextExpertFamily({...p,families:done(EXPERT_FAMILIES.length)}).next,null);
});
test('D01 a later family or missing technical acceptance is not admitted',()=>{
 const p={technicalAcceptance:true,pilotPrerequisites:true};
 const late=nextExpertFamily({...p,families:{},requested:'reparaturen'});assert.equal(late.admitted,false);assert.deepEqual(late.blockers,['out-of-order']);
 assert.equal(nextExpertFamily({...p,families:{},requested:'daten'}).admitted,true);
 const tech=nextExpertFamily({technicalAcceptance:false,pilotPrerequisites:true,families:{}});assert.equal(tech.next,null);assert.deepEqual(tech.blockers,['technical-acceptance-open']);
 assert.deepEqual(nextExpertFamily({technicalAcceptance:true,pilotPrerequisites:false,families:{}}).blockers,['pilot-prerequisites-open']);
 assert.equal(nextExpertFamily({...p,families:{daten:'entwertet'}}).next,'daten');assert.equal(nextExpertFamily({...p,families:{daten:'unsinn'}}).next,'daten');
});
test('D02 a green training case without new independent cases releases nothing',()=>{
 const noHeld=expertRelease(entry({heldOutCases:[],results:{...entry().results,heldOutPassed:0,heldOutTotal:0}}),{current:bound});assert.equal(noHeld.released,false);assert.ok(noHeld.issues.includes('held-out-cases-missing'));
 assert.ok(expertRelease(entry({heldOutCases:['t1','h2']}),{current:bound,usedCases:[]}).issues.includes('held-out-overlaps-training'));
 assert.ok(expertRelease(entry({results:{...entry().results,independent:false}}),{current:bound}).issues.includes('not-independently-checked'));
 assert.ok(expertRelease(entry(),{current:bound,usedCases:['h1']}).issues.includes('held-out-not-new'));
 assert.equal(expertRelease(entry({state:'implementiert-ungetestet'}),{current:bound}).released,false);
});
test('D02 a passing release holds only for its concrete scope and needs the current binding',()=>{
 const ok=expertRelease(entry(),{current:bound,usedCases:[],evidence,contractSHA});assert.equal(ok.released,true);assert.equal(ok.scope,'CSV-Bereinigung bis 10000 Zeilen');assert.equal(ok.universal,false);
 const unknown=expertRelease(entry(),{});assert.equal(unknown.released,false);assert.ok(unknown.issues.includes('binding-not-verifiable'));
});
const repair=over=>({failureId:'t-bug',diagnosis:{rootCause:'Komma als Dezimaltrenner',evidenceRef:'report:d1'},scope:{allowedPaths:['src/parse.mjs'],changedPaths:['src/parse.mjs']},runner:'independent-check',
 baseline:{tests:{'t-bug':{status:'fail',digest:h('1')},'t-a':{status:'pass',digest:h('2')},'t-b':{status:'pass',digest:h('3')}}},
 candidate:{tests:{'t-bug':{status:'pass',digest:h('1')},'t-a':{status:'pass',digest:h('2')},'t-b':{status:'pass',digest:h('3')}}},...over});
const withTest=(id,status,digest)=>{const r=repair();r.candidate.tests[id]={status,digest:digest??r.baseline.tests[id]?.digest??h('9')};return r;};
test('D06 a repair passes only with the reproduced failure fixed and all earlier tests green',()=>{
 const r=decideRepair(repair());assert.deepEqual(r.issues,[]);assert.equal(r.decision,'accepted');assert.deepEqual(r.fixed,['t-bug']);
});
test('D06 a new regression prevents acceptance, also when a test was skipped or removed',()=>{
 assert.ok(decideRepair(withTest('t-a','fail')).issues.some(x=>x==='regression:t-a'));assert.equal(decideRepair(withTest('t-a','fail')).decision,'rejected');
 assert.ok(decideRepair(withTest('t-a','skipped')).issues.includes('regression:t-a'));
 const gone=repair();delete gone.candidate.tests['t-b'];assert.ok(decideRepair(gone).issues.includes('test-removed:t-b'));
});
test('D06 an unreproduced or unfixed original failure, a weakened test, a wide change and self-checking are rejected',()=>{
 const notRepro=repair();notRepro.baseline.tests['t-bug'].status='pass';assert.ok(decideRepair(notRepro).issues.includes('original-failure-not-reproduced'));
 assert.ok(decideRepair(withTest('t-bug','fail')).issues.includes('original-failure-not-fixed'));
 assert.ok(decideRepair(withTest('t-a','pass',h('8'))).issues.includes('test-changed:t-a'));
 assert.ok(decideRepair(repair({scope:{allowedPaths:['src/parse.mjs'],changedPaths:['src/parse.mjs','src/other.mjs']}})).issues.includes('change-outside-scope:src/other.mjs'));
 assert.ok(decideRepair(repair({runner:'author'})).issues.includes('not-independently-checked'));
 assert.ok(decideRepair(repair({diagnosis:null})).issues.includes('diagnosis-missing'));
});
test('D06 an old failure stays visible and a new extra test is allowed',()=>{
 const r=repair();r.baseline.tests['t-old']={status:'fail',digest:h('4')};r.candidate.tests['t-old']={status:'fail',digest:h('4')};r.candidate.tests['t-new']={status:'pass',digest:h('5')};
 const d=decideRepair(r);assert.equal(d.decision,'accepted');assert.deepEqual(d.stillFailing,['t-old']);
});
const assess=(r=results(),s=spec,w=workload)=>assessImprovement(s,r.filter(x=>x.side==='baseline'&&x.phase==='validation'),r.filter(x=>x.side==='candidate'&&x.phase==='validation'),r.filter(x=>x.phase==='replication'),w);
test('D07 a faster and cheaper candidate below the quality floor is rejected',()=>{
 assert.equal(assess().status,'verified');
 const r=results();const c=r.filter(x=>x.side==='candidate');for(const x of c){x.costMinor=0;x.durationMs=1;}c[0].checksPassed=false;
 const a=assess(r);assert.equal(a.status,'rejected');assert.ok(a.reasons.includes('mandatory-quality-failed'));assert.equal(a.profitProven,false);
 const e=results();const k=e.filter(x=>x.side==='candidate');for(const x of k)x.costMinor=0;k[3].criticalErrors=1;assert.equal(assess(e).status,'rejected');
});
test('D07 a contaminated comparison or too few independent cases proves nothing',()=>{
 assert.equal(assess(results(),{...spec,contaminated:true}).status,'unsupported');
 assert.equal(assess(results().filter(r=>r.caseId!=='case9')).status,'insufficient-evidence');
});
const outcome=over=>({receiptsMinor:100000,refundsMinor:0,feesMinor:3000,fulfillmentMinor:10000,reworkMinor:0,acquisitionMinor:1000,overheadMinor:1000,currency:'CHF',receiptEvidence:['receipt:1'],costsComplete:true,capacityVerified:false,...over});
test('D08 missing costs stop a confirmed profit claim and learning costs stay visible',()=>{
 const full=economicsClaim({outcome:outcome(),learningMinor:5000});assert.equal(full.netProfitMinor,80000);assert.equal(full.status,'confirmed');assert.equal(full.learningCostMinor,5000);assert.equal(full.permissionToScale,false);
 const noLearning=economicsClaim({outcome:outcome(),learningMinor:null});assert.equal(noLearning.netProfitMinor,null);assert.equal(noLearning.status,'unknown');assert.equal(noLearning.learningCostMinor,null);assert.ok(noLearning.missing.includes('learningMinor'));
 const noAcq=economicsClaim({outcome:outcome({acquisitionMinor:null}),learningMinor:0});assert.equal(noAcq.netProfitMinor,null);assert.ok(noAcq.missing.includes('acquisitionMinor'));
 assert.equal(economicsClaim({outcome:outcome({costsComplete:false}),learningMinor:0}).status,'unknown');
 assert.equal(economicsClaim({outcome:outcome({receiptEvidence:[]}),learningMinor:0}).status,'unknown');
 const noOverhead=economicsClaim({outcome:outcome({overheadMinor:null}),learningMinor:5000});assert.equal(noOverhead.learningCostMinor,5000);assert.equal(noOverhead.netProfitMinor,null);
});
test('D09 simulated margins stay apart and raise no real milestone',()=>{
 const sim=economicsClaim({outcome:outcome({receiptsMinor:900000}),learningMinor:0,synthetic:true});assert.equal(sim.status,'simulated');assert.equal(sim.netProfitMinor,null);assert.equal(sim.simulatedNetMinor,885000);
 for(const ref of ['fake:r1','sim-7','synthetic:x','test:1'])assert.equal(economicsClaim({outcome:outcome({receiptEvidence:[ref]}),learningMinor:0}).status,'simulated',ref);
 const m=(month,over={},extra={})=>({month,complete:true,outcome:outcome({receiptsMinor:900000,receiptEvidence:['receipt:'+month],...over}),learningMinor:0,...extra});
 const synthetic=milestones([m('2026-11',{}, {synthetic:true}),m('2026-12',{}, {synthetic:true}),m('2027-01',{}, {synthetic:true})]);assert.equal(synthetic.stage,0);assert.equal(synthetic.series,0);
 const real=milestones([m('2026-11'),m('2026-12'),m('2027-01')]);assert.equal(real.stage,1);assert.deepEqual(real.stage1Months,['2026-11','2026-12','2027-01']);assert.equal(real.permissionToScale,false);
});
test('D09 a milestone needs complete adjacent months; one gap or short month breaks the series',()=>{
 const m=(month,receiptsMinor=900000,extra={})=>({month,complete:true,outcome:outcome({receiptsMinor,receiptEvidence:['receipt:'+month]}),learningMinor:0,...extra});
 assert.equal(milestones([m('2026-11'),m('2027-01'),m('2027-02')]).stage,0);
 assert.equal(milestones([m('2026-11'),m('2026-12',50000),m('2027-01'),m('2027-02')]).stage,0);
 assert.equal(milestones([m('2026-11'),m('2026-12'),m('2027-01',900000,{complete:false})]).stage,0);
 assert.equal(milestones([m('2026-11'),m('2026-12'),m('2027-01',900000,{learningMinor:null})]).stage,0);
 assert.equal(milestones([m('2026-11'),m('2026-12'),m('2027-01',900000,{outcome:outcome({currency:'USD',receiptsMinor:900000})})]).stage,0);
 const two=milestones(['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04'].map(x=>m(x)));assert.equal(two.stage,2);assert.deepEqual(two.stage2Months,['2027-02','2027-03','2027-04']);
 const low=milestones(['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04'].map((x,i)=>m(x,i>2?200000:900000)));assert.equal(low.stage,1);
 assert.throws(()=>milestones([m('2026-11'),m('2026-11')]),/month/);
});
test('D10 a changed source or model digest invalidates only the affected evidence',()=>{
 const a=entry({id:'F02'}),b=entry({id:'F03',binding:{...bound,sourceDigest:h('d')},results:{...entry().results,reportDigest:reportOf('F03',{...bound,sourceDigest:h('d')})}});
 const r=invalidateEvidence([a,b],{F02:{...bound,sourceDigest:h('e')},F03:{...bound,sourceDigest:h('d')}},evidence,contractSHA);
 assert.equal(r.find(x=>x.id==='F02').effective,'entwertet');assert.equal(r.find(x=>x.id==='F03').effective,'geprüft-bestanden');
 assert.equal(invalidateEvidence([a],{F02:{...bound,modelDigest:h('f')}},evidence,contractSHA)[0].effective,'entwertet');
 assert.equal(invalidateEvidence([a],{},evidence,contractSHA)[0].effective,'entwertet');
 assert.equal(expertRelease(a,{current:{...bound,modelDigest:h('f')}}).released,false);
 const reg=createRegister(['F01','F02','F03','F04','F05','F06','T01','T02','T03','T04','T05','T06','T07','A01','A02','A03','A04','W01','W02','W03','S01'].map(id=>`| ${id} | u | n |`).join('\n'),{contractSHA:h('0'),source:'x'});
 assert.equal(validateRegister(reg).summary.passed,0);
});
const scores={goal:4,bottleneck:4,information:4,evidence:4,reuse:4,cost:0,duration:0};
const observation=over=>({goalId:'g',goalVersion:1,kind:'quality',evidenceIds:['e1'],capability:'data',title:'t',application:'a',successCriterion:'s',scores,observedAt:1,estimatedCostRappen:0,...over});
const context=over=>({now:1e12,powerEnabled:true,controllerRunning:true,budgetActive:true,availableSlots:1,budgetRemainingRappen:10,dayRemainingRappen:10,rootRemainingRappen:10,limitsDigest:h('a'),policyDigest:h('b'),goalId:'g',goalVersion:1,activationApproved:true,permissions:['data'],...over});
const gaps=o=>deriveKnowledgeGaps(o,[{id:'g',version:1}]);
test('D11 the same ineffective hypothesis ends without new evidence, also after the cooldown',()=>{
 const [g]=gaps([observation()]);const failed={...g,failures:3,lastAttemptAt:1,previousEvidenceFingerprint:g.fingerprint};
 const [d]=rankLearningWork([failed],context());assert.equal(d.eligible,false);assert.ok(d.reasons.includes('new-evidence-required'));
 const [next]=gaps([observation({evidenceIds:['e1','e2']})]);assert.notEqual(next.fingerprint,g.fingerprint);
 const [n]=rankLearningWork([{...next,failures:3,lastAttemptAt:1,previousEvidenceFingerprint:g.fingerprint}],context());assert.equal(n.eligible,true);
 assert.equal(gaps([observation(),observation()]).length,1);
});
test('D11 a running worker leaves no capacity for a second one',()=>{
 const [g]=gaps([observation()]);const [d]=rankLearningWork([g],context({availableSlots:0}));assert.equal(d.eligible,false);assert.ok(d.reasons.includes('waiting-capacity'));
});
test('D12 OFF stops learning work and the boundary check holds without personnel cost',()=>{
 const [g]=gaps([observation()]);const [d]=rankLearningWork([g],context({powerEnabled:false}));assert.ok(d.reasons.includes('powered-off'));
 const ok={power:{enabled:false},network:{guarded:true},production:{takeover:false,apply:false,restart:false},record:{humanMinutes:12,costs:{status:'unknown'}}};
 assert.deepEqual(operatingBoundaryIssues(ok),[]);
 assert.ok(operatingBoundaryIssues({...ok,power:{enabled:true}}).includes('power-not-off'));
 assert.ok(operatingBoundaryIssues({...ok,power:{}}).includes('power-not-off'));
 assert.ok(operatingBoundaryIssues({...ok,network:{guarded:false}}).includes('network-guard-missing'));
 for(const k of ['takeover','apply','restart'])assert.ok(operatingBoundaryIssues({...ok,production:{...ok.production,[k]:true}}).includes('production-takeover-forbidden'));
 for(const record of [{personnelCost:1},{costs:{salary:1}},{a:[{hourlyRate:5}]},{Lohn:1},{employeeCostMinor:1}])assert.ok(operatingBoundaryIssues({...ok,record}).includes('personnel-cost-forbidden'),JSON.stringify(record));
 for(const record of [{humanHours:1},{humanCostMinor:1},{humanMinutes:-1},{humanMinutes:'5'},{patriceRate:3}])assert.ok(operatingBoundaryIssues({...ok,record}).includes('human-time-must-be-minutes'),JSON.stringify(record));
});
// A stub below the guard records any call that gets through, so no attempt can leave the machine even if the guard fails.
const probe=call=>spawnSync(process.execPath,['-e',`
const net=require('node:net'),dgram=require('node:dgram');
for(const [o,m] of [[net.Socket.prototype,'connect'],[dgram.Socket.prototype,'send'],[dgram.Socket.prototype,'connect']])o[m]=function(){console.log('REACHED');return this;};
require(${JSON.stringify(process.cwd().replaceAll('\\','/')+'/scripts/verification-network-guard-v2.cjs')});
const dns=require('node:dns');
(async()=>{try{await (${call})();console.log('open');}catch(e){console.log(e.message);}})();
`],{encoding:'utf8',timeout:20000});
test('D12 the corrected network guard refuses every external path and keeps local ones',()=>{
 for(const call of [
  "()=>net.connect(9,'192.0.2.1')","()=>net.connect({port:9,host:'192.0.2.1'})","()=>new net.Socket().connect(9,'192.0.2.1')","()=>net.createConnection({port:9,host:'2001:db8::1'})",
  "()=>require('node:http').request({host:'192.0.2.1',port:9})","()=>require('node:https').request({host:'192.0.2.1',port:9})","()=>require('node:tls').connect({host:'192.0.2.1',port:9})",
  "()=>net.connect('/tmp/x.sock')","()=>net.connect({path:'//./pipe/podman'})",
  "()=>dgram.createSocket('udp4').send('x',9,'192.0.2.1')","()=>dgram.createSocket('udp4').connect(9,'192.0.2.1')","()=>dgram.createSocket('udp4').send('x',9)",
  "()=>dns.lookup('numaron-offline.invalid',()=>{})","()=>dns.promises.lookup('numaron-offline.invalid')","()=>dns.promises.resolve4('numaron-offline.invalid')","()=>new dns.promises.Resolver().resolve4('numaron-offline.invalid')","()=>new dns.Resolver().resolve4('numaron-offline.invalid',()=>{})"
 ]){const r=probe(call);assert.match(r.stdout,/Verification external (transport|datagram|DNS) denied/,call);assert.doesNotMatch(r.stdout,/REACHED|open/,call);}
 for(const call of ["()=>net.connect(9,'127.0.0.1')","()=>net.connect({port:9,host:'localhost'})","()=>net.connect(9)","()=>net.connect({port:9,host:'::1'})"]){const r=probe(call);assert.match(r.stdout,/REACHED/,call);assert.doesNotMatch(r.stdout,/denied/,call);}
});
test('D12 the fetch guard refuses external access in a child process',()=>{
 const fetchRun=spawnSync(process.execPath,['--import','./scripts/founder-offline-test-guard.mjs','--input-type=module','-e',"await fetch('https://numaron-offline.invalid/').then(()=>console.log('open'),e=>console.log(e.message));"],{encoding:'utf8',timeout:20000});
 assert.match(fetchRun.stdout,/forbid external fetch/);assert.notEqual(fetchRun.status,0);
});
