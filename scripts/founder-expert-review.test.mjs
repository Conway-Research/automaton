// Counter-examples from the independent review of 1 Nov 2026 for package D and the register.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {expertRelease,decideRepair,economicsClaim as claim,realProfitMilestones,operatingBoundaryIssues,requirementContract} from './founder-expert-acceptance.mjs';import {createEvidenceRegistry} from './founder-evidence-registry.mjs';
import {createRegister,validateRegister,CONTRACT_IDS} from './founder-expert-register.mjs';
import {verifyDataDelivery,parseCsvStrict} from './founder-data-verifier.mjs';
import {runInterfaceScenario,runInterfaceMatrix} from './founder-interface-verifier.mjs';
const h=c=>c.repeat(64),receiptPolicy={acceptedTypes:['receipt','r']},far={now:Date.parse('2030-01-01T00:00:00Z'),receiptPolicy},economicsClaim=a=>claim({receiptPolicy,...a}),contractSHA=h('f');
const outcome=over=>({receiptsMinor:100000,refundsMinor:0,feesMinor:3000,fulfillmentMinor:10000,reworkMinor:0,acquisitionMinor:1000,overheadMinor:1000,currency:'CHF',receiptEvidence:['receipt:1'],costsComplete:true,capacityVerified:false,...over});
test('D08 D09 only a concrete real reference confirms a profit',()=>{
 for(const refs of [[null],[''],['   '],[{}],[42],['customer said paid'],['receipt:1',null],['n/a'],['other:1']]){const c=economicsClaim({outcome:outcome({receiptEvidence:refs}),learningMinor:0});assert.equal(c.status,'unknown',JSON.stringify(refs));assert.equal(c.netProfitMinor,null,JSON.stringify(refs));}
 for(const ref of ['mock:1','simulated:1','sim_1','paper:1','dummy-1',' fake:1','​fake:1','ｆake:1','FAKE:1','demo/1','example:1'])assert.equal(economicsClaim({outcome:outcome({receiptEvidence:[ref]}),learningMinor:0}).status,'simulated',ref);
 for(const synthetic of ['true',1,{},null])assert.equal(economicsClaim({outcome:outcome(),learningMinor:0,synthetic}).status,'simulated',String(synthetic));
 const staff=economicsClaim({outcome:outcome({staffMinor:5}),learningMinor:0});assert.equal(staff.status,'unknown');assert.ok(staff.missing.includes('operating-boundary'));
 const m=(x,refs)=>({month:x,complete:true,outcome:outcome({receiptsMinor:900000,receiptEvidence:refs}),learningMinor:0}),months=['2027-01','2027-02','2027-03'];
 assert.equal(realProfitMilestones(months.map(x=>m(x,['mock:'+x])),far).stage,0);
 assert.equal(realProfitMilestones(months.map(x=>m(x,['receipt:same'])),far).stage,0);
 assert.equal(realProfitMilestones(['2099-01','2099-02','2099-03'].map(x=>m(x,['r:'+x])),far).stage,0);
});
test('D12 the boundary sees personnel and human time in every spelling, without false alarms',()=>{
 const ok={power:{enabled:false},network:{guarded:true},production:{takeover:false,apply:false,restart:false}};
 for(const record of [{gehalt:1},{personalkosten:1},{stundensatz:1},{payroll:1},{staffCost:1},{'sаlary':1},{type:'salary'},{kind:'Employee Wage'},{costs:[{category:'Löhne'}]},new Map([['salaryMinor',1]]),{contractorCostMinor:1},{note:'{"payroll":1}'},{'sal​ary':1},{a:new Set([{wage:1}])}])
  assert.ok(operatingBoundaryIssues({...ok,record}).includes('personnel-cost-forbidden'),String(JSON.stringify(record)));
 for(const record of [{ownerHours:1},{timeHuman:1},{operatorHours:1},{manualHours:1},{ownerTimeMinor:1}])assert.ok(operatingBoundaryIssues({...ok,record}).includes('human-time-must-be-minutes'),JSON.stringify(record));
 for(const record of [{owner:'module'},{humanMinutes:0},{note:'Belohnung'},{kind:'fee'},{category:'overhead'},{note:'the employee handbook was read'},{operatingCostMinor:1}])assert.deepEqual(operatingBoundaryIssues({...ok,record}),[],JSON.stringify(record));
});
const bound={sourceDigest:h('a'),modelDigest:h('b'),runtimeDigest:h('c')};
const {reader:evidence,writer}=createEvidenceRegistry(),report=(id,over={})=>writer.add('verifier-report',{requirementId:id,accepted:true,verifier:'verifier',heldOutCases:['h1','h2'],binding:bound,contractSHA,results:{executed:true,independent:true,passed:2,total:2,heldOutPassed:2,heldOutTotal:2},...over});
const entry=(id,over={})=>({id,state:'geprüft-bestanden',owner:'verifier',competenceScope:'CSV bis 10000 Zeilen',metrics:['row-lost: 0'],trainingCases:['t1'],heldOutCases:['h1','h2'],baseline:'b:1',candidate:'c:1',binding:bound,results:{executed:true,passed:2,total:2,evidenceRef:'report:x',reportDigest:report(id),synthetic:true,independent:true,heldOutPassed:2,heldOutTotal:2},costs:{status:'unknown'},humanMinutes:null,...over});
const full=()=>({contract:{sha256:contractSHA},entries:CONTRACT_IDS.map(id=>entry(id))});
test('Register: hand-typed entries are not an acceptance',()=>{
 const typed={entries:CONTRACT_IDS.map(id=>({id,state:'geprüft-bestanden',owner:'x',competenceScope:'x',metrics:[''],trainingCases:['t'],heldOutCases:['h','h'],binding:bound,results:{executed:true,passed:1,total:1,evidenceRef:'x',synthetic:true,independent:true,heldOutTotal:2,heldOutPassed:2},costs:{status:'unknown'},humanMinutes:null}))};
 const v=validateRegister(typed,{current:bound});assert.equal(v.summary.overallAccepted,false);assert.equal(v.summary.passed,0);
 for(const issue of ['metrics-not-predefined','held-out-cases-not-distinct','results-inconsistent','baseline-or-candidate-missing','report-digest-missing'])assert.ok(v.issues.some(i=>i.issue===issue),issue);
 assert.equal(validateRegister(full(),{current:bound,evidence,contractSHA}).summary.overallAccepted,true);
});
test('Register: only a registered report that matches counts; typed reports and fictional digests do not',()=>{
 const withReport=(digest,over={})=>{const r=full();r.entries[0]={...r.entries[0],results:{...r.entries[0].results,reportDigest:digest},...over};return validateRegister(r,{current:bound,evidence,contractSHA});};
 const typed=withReport(h('9'));assert.ok(typed.issues.some(i=>i.id==='F01'&&i.issue==='report-not-registered'));assert.equal(typed.summary.overallAccepted,false);
 assert.ok(validateRegister(full(),{current:bound,evidence:{get:()=>({kind:'verifier-report',body:{}})},contractSHA}).issues.some(i=>i.issue==='report-not-registered'));
 assert.ok(validateRegister(full(),{current:bound,contractSHA}).issues.some(i=>i.issue==='report-not-registered'));
 for(const [name,over,issue] of [['other id',{requirementId:'F02'},'report-not-verified'],['not accepted',{accepted:false},'report-not-verified'],['other verifier',{verifier:'self'},'report-not-verified'],['other cases',{heldOutCases:['h1']},'report-not-verified'],['other numbers',{results:{executed:true,independent:true,passed:9,total:9,heldOutPassed:2,heldOutTotal:2}},'report-not-verified'],['not executed',{results:{executed:false,independent:true,passed:2,total:2,heldOutPassed:2,heldOutTotal:2}},'report-not-verified'],['not independent',{results:{executed:true,independent:false,passed:2,total:2,heldOutPassed:2,heldOutTotal:2}},'report-not-verified'],['held out failed',{results:{executed:true,independent:true,passed:2,total:2,heldOutPassed:0,heldOutTotal:2}},'report-not-verified'],['other source',{binding:{...bound,sourceDigest:h('e')}},'report-other-binding'],['no binding',{binding:undefined},'report-other-binding'],['other contract',{contractSHA:h('0')},'report-other-contract']]){
  const v=withReport(report('F01',over));assert.ok(v.issues.some(i=>i.id==='F01'&&i.issue===issue),name);assert.equal(v.summary.overallAccepted,false,name);
 }
 assert.ok(validateRegister(full(),{current:bound,evidence:createEvidenceRegistry().reader,contractSHA}).issues.some(i=>i.issue==='report-not-registered'));
 for(const current of [undefined,{},{sourceDigest:h('a')}])assert.equal(validateRegister(full(),{current,evidence,contractSHA}).summary.overallAccepted,false,JSON.stringify(current));
 assert.equal(validateRegister(full(),{current:bound,evidence}).summary.overallAccepted,false);
 assert.equal(validateRegister({entries:[entry(CONTRACT_IDS.join())]},{current:bound}).valid,false);
 const wage=full();wage.entries[0].costs={status:'unknown',wage:1};wage.entries[1].employeeCost=1;assert.equal(validateRegister(wage,{evidence}).issues.filter(i=>i.issue==='personnel-cost-forbidden').length,2);
 const md=fs.readFileSync('docs/numaron-expert-completeness-contract-20261026.md','utf8'),reg=createRegister(md,{contractSHA:h('a'),source:'x'});assert.ok(validateRegister(reg,{contractSHA:h('b')}).issues.some(i=>i.issue==='contract-changed'));assert.equal(validateRegister(reg,{contractSHA:h('a')}).valid,true);
 for(const over of [{competenceScope:'universell, fehlerfrei'},{trainingCases:['']},{baseline:''},{candidate:false}]){const v=validateRegister({entries:[entry('F01',over)]},{evidence});assert.equal(v.entries[0].effective,'fehlgeschlagen',JSON.stringify(over));}
 assert.equal(validateRegister({entries:[null]}).valid,false);
 const blocked=full();blocked.entries[20].state='blockiert';assert.equal(validateRegister(blocked,{current:bound,evidence,contractSHA}).summary.overallAccepted,false);
});
test('D02 release needs a stated list of used cases, compares variants and refuses unbounded scope',()=>{
 const args={current:bound,evidence,usedCases:[],contractSHA};assert.equal(expertRelease(entry('F01'),args).released,true);
 assert.ok(expertRelease(entry('F01'),{current:bound,evidence,contractSHA}).issues.includes('used-cases-unknown'));
 for(const used of ['H1',' h1','h​1'])assert.ok(expertRelease(entry('F01'),{...args,usedCases:[used]}).issues.includes('held-out-not-new'),used);
 assert.ok(validateRegister({entries:[entry('F01',{heldOutCases:['T1','h2']})]}).issues.some(i=>i.issue==='held-out-overlaps-training'));
 for(const competenceScope of ['universell, fehlerfrei','Beliebige Daten','Universal data'])assert.ok(expertRelease(entry('F01',{competenceScope}),args).issues.includes('scope-not-bounded'),competenceScope);
});
const repair=over=>({failureId:'t-bug',diagnosis:{rootCause:'Komma als Dezimaltrenner',evidenceRef:'report:d1'},scope:{allowedPaths:['a.mjs'],changedPaths:['a.mjs']},runner:'independent-check',baseline:{tests:{'t-bug':{status:'fail',digest:h('1')},'t-a':{status:'pass',digest:h('2')}}},candidate:{tests:{'t-bug':{status:'pass',digest:h('1')},'t-a':{status:'pass',digest:h('2')}}},...over});
test('D06 weak repairs are refused',()=>{
 assert.equal(decideRepair(repair()).decision,'accepted');
 const failing=repair();failing.candidate.tests['t-new']={status:'fail',digest:h('5')};assert.ok(decideRepair(failing).issues.includes('new-test-failing:t-new'));
 const none=repair();delete none.baseline.tests['t-a'];delete none.candidate.tests['t-a'];assert.ok(decideRepair(none).issues.includes('regression-tests-missing'));
 for(const diagnosis of [{rootCause:{},evidenceRef:true},{rootCause:' ',evidenceRef:'r:1'},{rootCause:'x',evidenceRef:'fake:1'}])assert.ok(decideRepair(repair({diagnosis})).issues.includes('diagnosis-missing'),JSON.stringify(diagnosis));
 assert.ok(decideRepair(repair({scope:{allowedPaths:'abc',changedPaths:'abc'}})).issues.includes('scope-invalid'));
});
test('F01 a requirement is ready only as metric, comparator and number; open points hold a justified question',()=>{
 const req=over=>({id:'r1',text:'Importiert alle Zeilen',acceptance:{metric:'row-lost',comparator:'=',value:0},scope:{excluded:['Excel']},...over});
 assert.equal(requirementContract({requirements:[req()]}).ready,true);assert.equal(requirementContract().ready,false);assert.equal(requirementContract({requirements:[]}).ready,false);
 for(const [over,issue] of [[{text:''},'requirement-text-missing:r1'],[{acceptance:{}},'acceptance-not-measurable:r1'],[{acceptance:{metric:'gut',check:'gut'}},'acceptance-not-measurable:r1'],[{acceptance:{metric:'row-lost',comparator:'ungefaehr',value:0}},'acceptance-not-measurable:r1'],[{acceptance:{metric:'row-lost',comparator:'=',value:'wenig'}},'acceptance-not-measurable:r1'],[{scope:undefined},'scope-not-bounded:r1'],[{scope:{excluded:[]}},'scope-not-bounded:r1']])assert.ok(requirementContract({requirements:[req(over)]}).issues.includes(issue),JSON.stringify(over));
 assert.ok(requirementContract({requirements:[req(),req()]}).issues.includes('requirement-id-duplicate:r1'));
 const open=req({openPoint:'Zielsystem unklar'});assert.ok(requirementContract({requirements:[open]}).issues.includes('question-not-justified:r1'));
 const asked=requirementContract({requirements:[open],questions:[{requirementId:'r1',question:'Welches Zielsystem?',whyHumanNeeded:'Nur der Kunde kennt es'}]});assert.equal(asked.ready,false);assert.deepEqual(asked.issues,[]);assert.equal(asked.questions.length,1);
 assert.ok(requirementContract({requirements:[req()],questions:[{requirementId:'r1',question:'Sicher?',whyHumanNeeded:'x'}]}).issues.includes('question-without-need:r1'));
 assert.equal(requirementContract({requirements:[req()],questions:null}).ready,true);
});
const contract=()=>({key:'id',fields:{id:{type:'string',required:true},betrag:{type:'decimal',scale:2,required:true,sum:true}},sources:{'x.csv':{decimal:'en'}}});
const row=(n,id,betrag)=>({from:['x.csv:'+n],values:{id,betrag}});
const report2=(counts,betrag)=>({counts:{input:0,output:0,rejected:0,ambiguous:0,merged:0,...counts},totals:{betrag}});
const check=(text,delivery,c=contract())=>verifyDataDelivery({contract:c,inputs:[{file:'x.csv',text}],delivery}).issues.map(i=>i.code);
test('D03 missing and duplicate inputs, empty inputs and contract typos are not accepted',()=>{
 const both={...contract(),sources:{'x.csv':{},'y.csv':{}}},d={rows:[row(2,'a','1.00')],rejected:[],ambiguous:[],report:report2({input:1,output:1},'1.00')};
 assert.ok(check('id,betrag\na,1.00\n',d,both).includes('source-missing'));
 const dup=verifyDataDelivery({contract:contract(),inputs:[{file:'x.csv',text:'id,betrag\na,1.00\n'},{file:'x.csv',text:'id,betrag\nb,2.00\n'}],delivery:d}).issues.map(i=>i.code);assert.ok(dup.includes('input-duplicate'));
 assert.ok(check('id,betrag\n',{rows:[],rejected:[],ambiguous:[],report:report2({},'0.00')}).includes('input-empty'));
 for(const c of [{...contract(),sources:{'x.csv':{decimal:'DE'}}},{...contract(),sources:{'x.csv':{date:'dmy'}}},{...contract(),fields:{...contract().fields,betrag:{type:'number'}}}])assert.throws(()=>check('id,betrag\na,1.00\n',d,c),/Invalid data contract/);
});
test('D03 a conflict resolved by rejecting one side is still a guess',()=>{
 const d={rows:[row(2,'a','1.00')],rejected:[{rowId:'x.csv:3',reason:'x'}],ambiguous:[],report:report2({input:2,output:1,rejected:1},'1.00')};
 assert.ok(check('id,betrag\na,1.00\na,9.00\n',d).includes('conflict-resolved-by-guess'));
});
test('D03 key variants of one id are duplicates',()=>{
 for(const other of ['A','a​','ａ','á'.normalize('NFD').slice(0,1)]){
  const d={rows:[row(2,'a','1.00'),row(3,other,'2.00')],rejected:[],ambiguous:[],report:report2({input:2,output:2},'3.00')};
  assert.ok(check(`id,betrag\na,1.00\n${other},2.00\n`,d).includes('duplicate-undetected'),JSON.stringify(other));
 }
});
test('D03 double-decoded text and placeholder values are not clean values',()=>{
 const c={...contract(),fields:{...contract().fields,name:{type:'string'}}},out=name=>({rows:[{from:['x.csv:2'],values:{id:'a',betrag:'1.00',name}}],rejected:[],ambiguous:[],report:report2({input:1,output:1},'1.00')});
 for(const bad of ['Stra\u00c3\u0178e','M\u00c3\u2013LLER','K\u00c3\u0153r','\u00e2\u201a\u00ac','c\u00c5\u201cur','Z\u00c5\u201aoty','\u00c5\u00a1','\u00d0\u00b0\u00d0\u00b1'])assert.ok(check(`id,betrag,name\na,1.00,${bad}\n`,out(bad),c).includes('encoding-damaged'),bad);
 assert.ok(!check('id,betrag,name\na,1.00,Müller\n',out('Müller'),c).includes('encoding-damaged'));
 for(const blank of ['N/A','NULL','-','#N/A','\u200b'])assert.ok(check(`id,betrag\n${blank},1.00\n`,{rows:[row(2,blank,'1.00')],rejected:[],ambiguous:[],report:report2({input:1,output:1},'1.00')}).includes('value-invented'),blank);
 for(const leftover of ['N/A','NULL','-','#N/A','#NULL!','NaN','--','?']){assert.ok(check(`id,betrag,name\na,1.00,${leftover}\n`,out(leftover),c).includes('value-invented'),leftover);assert.deepEqual(check(`id,betrag,name\na,1.00,${leftover}\n`,out(null),c),[],leftover);}
 const opt={...contract(),fields:{...contract().fields,menge:{type:'decimal',scale:0},tag:{type:'date'}}},noneOut={rows:[{from:['x.csv:2'],values:{id:'a',betrag:'1.00',menge:null,tag:null}}],rejected:[],ambiguous:[],report:report2({input:1,output:1},'1.00')};for(const v of ['N/A','-','null','NA'])assert.deepEqual(check(`id,betrag,menge,tag\na,1.00,${v},${v}\n`,noneOut,opt),[],v);
 for(const bad of ['\u00c3\u00a0 Paris','\u00c3  Paris','voil\u00c3','\u00c3\u0089cole'])assert.ok(check(`id,betrag,name\na,1.00,${bad}\n`,out(bad),c).includes('encoding-damaged'),bad);
 for(const fine of ['S\u00e3o','JO\u00c3O','\u00c2ge','IRM\u00c3 Maria'])assert.ok(!check(`id,betrag,name\na,1.00,${fine}\n`,out(fine),c).includes('encoding-damaged'),fine);
 for(const real of ['NA','Nil','None']){assert.deepEqual(check(`id,betrag,name\na,1.00,${real}\n`,out(real),c),[],real);assert.deepEqual(check(`id,betrag,name\na,1.00,${real}\n`,out(null),c),[],real);}
 assert.ok(check('id,betrag,name\na,1.00,NA\n',out('XX'),c).includes('value-altered'));
});
test('D03 an inch mark stays readable; a sum on text is a contract error',()=>{
 assert.deepEqual(parseCsvStrict('a,b\n5" Monitor,1\n',{file:'f'}).rows[0].cells,['5" Monitor','1']);
 assert.throws(()=>check('id,betrag\na,1.00\n',{rows:[],rejected:[],ambiguous:[],report:report2({},'0.00')},{...contract(),fields:{...contract().fields,id:{type:'string',required:true,sum:true}}}),/Invalid data contract/);
});
const records=n=>Array.from({length:n},(_,i)=>({id:'r'+(i+1),sku:'S'+(i+1),qty:i+1}));
const base=over=>({records:records(5),pageSize:2,allowedFields:['id','sku','qty'],secret:'synthetic-secret-value',maxAttempts:4,...over});
const send=r=>({id:r.id,sku:r.sku,qty:r.qty});
async function attempt(fn,sleep,max=3){for(let a=1;;a++){try{return await fn(AbortSignal.timeout(20));}catch(e){if(e.simulatedCrash||e.permanent||a>=max)throw e;await sleep(e.retryAfterMs??5);}}}
async function good({source,target,checkpoint,sleep,token},{key=r=>'sync:'+r.id,shape=send}={}){
 const s=checkpoint.get()??{cursor:null,applied:[],failed:[],finished:false};
 while(!s.finished){
  const page=await attempt(signal=>source.list({cursor:s.cursor,signal,token}),sleep);
  for(const r of page.items){
   if(s.applied.includes(r.id)||s.failed.some(f=>f.id===r.id))continue;
   try{await attempt(signal=>target.apply({idempotencyKey:key(r),record:shape(r),signal,token}),sleep);s.applied.push(r.id);}
   catch(e){if(e.simulatedCrash)throw e;s.failed.push({id:r.id,reason:String(e.message)});}
   checkpoint.set(s);
  }
  s.cursor=page.nextCursor;s.finished=page.nextCursor===null;checkpoint.set(s);
 }
 return {applied:s.applied,failed:s.failed,complete:s.failed.length===0};
}
const codes=r=>r.issues.map(x=>x.code);
test('D05 a sync that drops mapped fields is not complete',async()=>{
 assert.ok(codes(await runInterfaceScenario(env=>good(env,{shape:r=>({id:r.id})}),base())).includes('field-dropped'));
});
test('F03 a secret is caught in key, checkpoint, report, console and in encoded form',async()=>{
 const b64=Buffer.from('synthetic-secret-value').toString('base64');
 assert.ok(codes(await runInterfaceScenario(env=>good(env,{key:r=>r.id+env.token}),base())).includes('secret-leaked'));
 assert.ok(codes(await runInterfaceScenario(env=>good(env,{key:r=>r.id+b64}),base())).includes('secret-leaked'));
 assert.ok(codes(await runInterfaceScenario(async env=>{env.checkpoint.set({token:env.token});env.checkpoint.set(null);return good({...env,checkpoint:{get:()=>null,set(){}}});},base())).includes('secret-leaked'));
 assert.ok(codes(await runInterfaceScenario(async env=>({...(await good(env)),debug:env.token}),base())).includes('secret-leaked'));
 const before=console.log;assert.ok(codes(await runInterfaceScenario(async env=>{console.log('t='+env.token);return good(env);},base())).includes('secret-leaked'));assert.equal(console.log,before);
});
test('F03 a required login is checked and a declared fault must really happen',async()=>{
 const r=await runInterfaceScenario(good,base({authRequired:true}));assert.deepEqual(r.issues,[]);
 assert.ok(codes(await runInterfaceScenario(({token,...env})=>good(env),base({authRequired:true}))).includes('auth-missing'));
 assert.ok(codes(await runInterfaceScenario(good,base({targetFaults:{'r9:1':'timeout'}}))).includes('fault-not-exercised'));
 assert.ok(codes(await runInterfaceScenario(good,base({crashAfterEffects:99}))).includes('fault-not-exercised'));
});
test('F03 a missing report and a failed entry that actually took effect are caught',async()=>{
 assert.ok(codes(await runInterfaceScenario(async env=>{const{applied}=await good(env);return {applied,failed:[]};},base())).includes('report-missing'));
 assert.ok(codes(await runInterfaceScenario(async env=>{await good(env);},base())).includes('report-missing'));
 assert.ok(codes(await runInterfaceScenario(async env=>{const x=await good(env);return {...x,failed:[{id:'r1'}]};},base())).includes('report-mismatch'));
});
test('F03 only the full fault matrix accepts a sync; a keyless one passes the plain run but not the matrix',async()=>{
 const m=await runInterfaceMatrix(good,base());assert.deepEqual(Object.values(m.results).flatMap(r=>r.issues),[]);assert.equal(m.accepted,true);
 const keyless=env=>good({...env,target:{apply:({record,signal,token})=>env.target.apply({record,signal,token})}});
 assert.equal((await runInterfaceScenario(keyless,base())).accepted,true);
 const n=await runInterfaceMatrix(keyless,base());assert.equal(n.accepted,false);assert.ok(codes(n.results.lostResponse).includes('duplicate-action'));
});
test('Round 2: the boundary spares ordinary fields and finds more spellings; allow-lists do the real work',()=>{
 const ok={power:{enabled:false},network:{guarded:true},production:{takeover:false,apply:false,restart:false}};
 for(const record of [{human_minutes:5},{humanMinutesTotal:5},{humanApproved:true},{ownerMinutes:30},{patriceMinutes:3},{humanReviewed:true},{contractorId:'x'},{employeeCount:0},{type:'hourly'},{personalData:'x'}])assert.deepEqual(operatingBoundaryIssues({...ok,record}),[],JSON.stringify(record));
 for(const record of [{personalCost:1},{personal_cost:1},{gehaelter:1},{payRoll:1},{salary2026:1},{staffcost:1},{lohnnebenkosten:1},{personnelcost:1},{salarycost:1},{sozialabgaben:1},{costs:['salary']},{items:[{name:'x',kind:'payroll'}]},{description:'salary'},{expense:'salary'},{category:'Personal'}])assert.ok(operatingBoundaryIssues({...ok,record}).includes('personnel-cost-forbidden'),JSON.stringify(record));
 for(const record of [{founderHours:1},{ownerDays:1},{hours:3}])assert.ok(operatingBoundaryIssues({...ok,record}).includes('human-time-must-be-minutes'),JSON.stringify(record));
 const c=economicsClaim({outcome:outcome({bonusMinor:5}),learningMinor:0});assert.equal(c.status,'unknown');assert.ok(c.missing.includes('outcome-field-unknown'));
});
test('Round 2: a secret is caught in objects, stdout, extra arguments and encoded login forms',async()=>{
 const b64=Buffer.from('user:synthetic-secret-value').toString('base64'),hex=Buffer.from('synthetic-secret-value').toString('hex').toUpperCase();
 for(const sync of [async env=>{console.log({t:env.token});return good(env);},async env=>{env.log({t:env.token});return good(env);},async env=>{process.stdout.write('t='+env.token+'\n');return good(env);},env=>good({...env,target:{apply:a=>env.target.apply({...a,headers:{authorization:'Basic '+b64}})}}),env=>good({...env,source:{list:a=>env.source.list({...a,url:'x?k='+env.token})}}),env=>good(env,{key:r=>r.id+hex})])
  assert.ok(codes(await runInterfaceScenario(sync,base())).includes('secret-leaked'),String(sync));
});
test('Round 2: the matrix demands a timeout on writing too and a clean run may not call itself incomplete',async()=>{
 const noTimeout=env=>good({...env,target:{apply:({idempotencyKey,record,token})=>env.target.apply({idempotencyKey,record,token})}});
 const m=await runInterfaceMatrix(noTimeout,base({wallLimitMs:150}));assert.equal(m.accepted,false);assert.ok(codes(m.results.targetHang).includes('hang-unhandled'));
 await assert.rejects(runInterfaceMatrix(good,base({records:records(2)})),/Invalid interface scenario/);
 assert.ok(codes(await runInterfaceScenario(async env=>({...(await good(env)),complete:false}),base())).includes('report-mismatch'));
 assert.ok(codes(await runInterfaceScenario(async env=>({...(await good(env)),failed:['ghost']}),base())).includes('report-mismatch'));
});
test('Round 2: repairs with odd paths or entries are rejected, not crashed on',()=>{
 assert.equal(decideRepair(repair({scope:{allowedPaths:[null],changedPaths:[null]}})).decision,'rejected');
 const n=repair();n.candidate.tests['t-a']=null;assert.equal(decideRepair(n).decision,'rejected');
});
test('Round 3: holes in a receipt list are gaps, not an empty proof',()=>{
 for(const receiptPolicy of [undefined,{acceptedTypes:['receipt']}]){
  const c=claim({outcome:outcome({receiptEvidence:[,]}),learningMinor:0,receiptPolicy});assert.equal(c.status,'unknown');assert.ok(c.missing.includes('receiptEvidence'));
  assert.equal(realProfitMilestones(['2027-01','2027-02','2027-03'].map(month=>({month,complete:true,outcome:outcome({receiptsMinor:900000,receiptEvidence:[,]}),learningMinor:0})),{...far,receiptPolicy}).stage,0);
 }
 assert.equal(validateRegister({entries:[entry('F01',{metrics:[,]})]},{evidence}).entries[0].effective,'fehlgeschlagen');
});
test('Round 3: a release needs the contract, a report without it counts for nothing',()=>{
 assert.equal(expertRelease(entry('F01'),{current:bound,evidence,usedCases:[]}).released,false);
 assert.equal(expertRelease(entry('F01',{results:{...entry('F01').results,reportDigest:report('F01',{contractSHA:h('0')})}}),{current:bound,evidence,usedCases:[],contractSHA}).released,false);
});
test('Mutation gap: the register itself refuses an unbounded scope, with every other part in order',()=>{
 const r=full();r.entries[0].competenceScope='universell, fehlerfrei';const v=validateRegister(r,{current:bound,evidence,contractSHA});assert.ok(v.issues.some(i=>i.id==='F01'&&i.issue==='scope-not-bounded'));assert.equal(v.summary.overallAccepted,false);
});
