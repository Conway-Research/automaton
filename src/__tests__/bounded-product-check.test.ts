import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';
import {createDatabase} from '../state/database.js';
import {IsolatedRuntimeCapacity} from '../security/isolated-runtime-capacity.js';
import {IsolatedJobLedger,isolatedJobScope} from '../security/isolated-job-ledger.js';
import {bindReviewedRuntime,inspectCapacityIdentity,capacityBindingScope,assertReviewedRuntime,type ReviewedRuntimeBinding} from '../security/reviewed-runtime-binding.js';
import {runBoundedProductCheck,boundedProductScope,BOUNDED_PRODUCT_ADAPTER,type BoundedProductCheck} from '../commerce/bounded-product-check.js';
import {registerProductQuality} from '../commerce/product-quality.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {containSecurityIncident,revokeActionReview,registerActionReview,GATE_DOMAINS,type ActionScope} from '../security/action-gate.js';
import {revokeAdapterPermission,grantAdapterPermission,adapterActionScope} from '../revenue/adapter-permissions.js';
import {isProtectedFile} from '../self-mod/code.js';
import {ResearchStore,RESEARCH_SECTORS} from '../revenue/research.js';
import {planResearchExperiment} from '../revenue/research-handoff.js';
import {RevenueStore} from '../revenue/store.js';
import {ProfitLedger} from '../revenue/profit-ledger.js';

const mock=vi.hoisted(()=>({spawn:vi.fn()}));vi.mock('node:child_process',()=>({spawn:mock.spawn}));
const cleanup:(()=>void)[]=[];
function fixtureSecurityReview(db:Database.Database,scope:ActionScope,now:number,requirements:readonly string[]=[]){
 registerActionReview(db,{...scope,reviewedBy:'synthetic-only',classification:scope.dataClass??'PUBLIC',
 evidence:[...GATE_DOMAINS.map(domain=>({domain,requirement:domain as string})),...requirements.map(requirement=>({domain:'security' as const,requirement}))]
 .map(e=>({...e,jurisdiction:'CH',source:'https://example.invalid/synthetic-only',sourceDigest:'a'.repeat(64),observedAt:now,expiresAt:now+600000,
 decision:'APPROVED' as const,reason:'Synthetic local test, never production evidence'}))},now);
}
function fixtureGrantAdapterPermission(...args:Parameters<typeof grantAdapterPermission>){
 grantAdapterPermission(...args);const [db,grant]=args;
 fixtureSecurityReview(db,adapterActionScope(grant.adapter,grant.experimentId,grant.maxCostUsdCents),Date.now());
}
let output:string,hang:boolean,beforeRun:(()=>void)|undefined,calls:{args:string[];options:Record<string,unknown>;input?:string}[];
let hung:EventEmitter|undefined;
beforeEach(()=>{
  output='draft.json\t'+Buffer.from('{"title":"Synthetic draft"}').toString('base64')+'\n';hang=false;beforeRun=undefined;calls=[];hung=undefined;
  mock.spawn.mockImplementation((_exe:string,args:string[],options:Record<string,unknown>)=>{
    const call={args,options,input:undefined as string|undefined};calls.push(call);
    const child=Object.assign(new EventEmitter(),{stdin:Object.assign(new EventEmitter(),{end:(_input?:string)=>{}}),stdout:new EventEmitter(),stderr:new EventEmitter(),kill:vi.fn()});
    child.stdin.end=(input?:string)=>{call.input=input;queueMicrotask(()=>{
      const command=args[6];if(command==='run'){beforeRun?.();if(hang){hung=child;return;}}
      if(command==='kill'&&hung){const pending=hung;hung=undefined;pending.emit('close',137);}
      const text=command==='info'?'true':command==='run'?output:command==='inspect'?JSON.stringify({Running:hang,Pid:hang?123:0,Status:hang?'running':'exited'}):'';
      child.stdout.emit('data',Buffer.from(text));child.emit('close',0);
    });};return child;
  });
});
afterEach(()=>{vi.useRealTimers();for(const fn of cleanup.splice(0).reverse())fn();vi.clearAllMocks();});
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-bounded-'));cleanup.push(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const capacityDb=new Database(path.join(dir,'capacity.db'));cleanup.push(()=>{if(capacityDb.open)capacityDb.close();});
 new IsolatedRuntimeCapacity(capacityDb);
 const identity=inspectCapacityIdentity(capacityDb),scope=capacityBindingScope(identity);
 fixtureSecurityReview(capacityDb,scope,Date.now(),['shared-capacity-deployment']);
 const binding=bindReviewedRuntime(capacityDb,identity);
 const job=(name='one')=>{
  const db=createDatabase(path.join(dir,name+'.db'));cleanup.push(()=>db.close());
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('o','synthetic','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition,started_at) VALUES('e','o','running','test',100,1,'pass','fail','stop',datetime('now'))");
  initializeCapitalBudget(db.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+600000});
  registerBudgetPolicy(db.raw,{daily_cents:100,hourly_cents:100,session_cents:100,call_cents:100,halted:0,revision:1});
  fixtureGrantAdapterPermission(db.raw,{adapter:BOUNDED_PRODUCT_ADAPTER,experimentId:'e',maxCostUsdCents:0,expiresAt:Date.now()+600000,reviewedBy:'synthetic'});
  registerProductQuality(db.raw,{productId:'p',format:'json',purpose:'Synthetic draft check',audience:'test',minBytes:1,maxBytes:65536,requiredText:[],forbiddenText:[],requiredJsonKeys:['title']});
  const input:BoundedProductCheck={id:'job-'+name,productId:'p',experimentId:'e',file:{name:'draft.json',text:'{"title":"Synthetic draft"}'}};
  const review=()=>{fixtureSecurityReview(db.raw,boundedProductScope(input),Date.now(),['bounded-draft-workflow']);fixtureSecurityReview(db.raw,isolatedJobScope(input.id,[input.file]),Date.now(),['isolated-backend-acceptance']);};review();
  return {db:db.raw,input,review};
 };
 return {dir,capacityDb,identity,binding,job};
}
it('checks a bounded draft through real gates and one capacity reservation, returns no publication authority, deduplicates',async()=>{
 const s=setup(),a=s.job();const result=await runBoundedProductCheck(a.db,s.binding,a.input);
 expect(result).toMatchObject({duplicate:false,liveReady:false,productionAccepted:false,externalCostUsdCents:0,localOperatingCost:'unmeasured'});
 expect(result.assessment.passed).toBe(true);
 expect((await runBoundedProductCheck(a.db,s.binding,a.input)).duplicate).toBe(true);
 expect(s.capacityDb.prepare('SELECT count(*) n FROM isolated_runtime_capacity').get()).toEqual({n:1});
 expect(calls.filter(c=>c.args[6]==='run')).toHaveLength(1);
 expect(calls[1].args).toEqual(expect.arrayContaining(['--network=none','--read-only','--pids-limit=16','--memory=64m','--cpus=0.5','--timeout=10']));
 expect(calls[1].options).toMatchObject({shell:false,env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',WSLENV:''}});
 expect(calls[1].args.some(a=>a.startsWith('--volume')||a==='--privileged')).toBe(false);
 await expect(runBoundedProductCheck(a.db,s.binding,{...a.input,file:{...a.input.file,text:'{"title":"Changed"}'}})).rejects.toThrow();
});
it.each(['permission','halt','quality','audit','capacity-audit','binding-revocation','budget-stop'] as const)('blocks %s before any container execution',async fault=>{
 const s=setup(),a=s.job();
 if(fault==='permission')revokeAdapterPermission(a.db,BOUNDED_PRODUCT_ADAPTER,'e');
 if(fault==='halt')containSecurityIncident(a.db);
 if(fault==='quality'){a.input.file.text='{}';a.input.id='job-invalid';a.review();}
 if(fault==='audit')a.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON obolus_security_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
 if(fault==='capacity-audit')s.capacityDb.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON isolated_capacity_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
 if(fault==='binding-revocation')revokeActionReview(s.capacityDb,capacityBindingScope(s.identity));
 if(fault==='budget-stop')a.db.exec('UPDATE inference_budget_policy SET halted=1');
 await expect(runBoundedProductCheck(a.db,s.binding,a.input)).rejects.toThrow();
 expect(calls.filter(c=>c.args[6]==='run')).toHaveLength(0);
 expect(s.capacityDb.prepare('SELECT count(*) n FROM isolated_runtime_capacity').get()).toEqual({n:0});
});
it.each(['command','path','secret','size','network'] as const)('rejects %s without subprocess or exported input',async attack=>{
 const s=setup(),a=s.job();
 if(attack==='command')Object.assign(a.input,{command:'calc.exe'});
 if(attack==='network')Object.assign(a.input,{url:'http://169.254.169.254/'});
 if(attack==='path')a.input.file.name='../config.json';
 if(attack==='secret')a.input.file.text='sk-proj-'+ 'a'.repeat(80);
 if(attack==='size')a.input.file.text='x'.repeat(65537);
 await expect(runBoundedProductCheck(a.db,s.binding,a.input)).rejects.toThrow();expect(calls).toHaveLength(0);
});
it('keeps one hold across independent stores and requires reconciliation after interruption',async()=>{
 const s=setup(),a=s.job(),b=s.job('two');hang=true;
 const first=runBoundedProductCheck(a.db,s.binding,a.input);
 const rejection=expect(first).rejects.toThrow();
 await vi.waitFor(()=>expect(calls.filter(c=>c.args[6]==='run')).toHaveLength(1));
 await expect(runBoundedProductCheck(b.db,s.binding,b.input)).rejects.toThrow();
 expect(s.capacityDb.prepare("SELECT count(*) n FROM isolated_runtime_capacity WHERE state='held'").get()).toEqual({n:1});
 containSecurityIncident(a.db);await rejection;
 expect(new IsolatedJobLedger(a.db).get(a.input.id)?.state).toBe('uncertain');
 expect(s.capacityDb.prepare("SELECT state FROM isolated_runtime_capacity").get()).toEqual({state:'held'});
 expect(calls.filter(c=>c.args[6]==='run')).toHaveLength(1);
 await vi.waitFor(()=>expect(calls.some(c=>c.args[6]==='inspect')).toBe(true));
});
it('rejects altered output, retaining an unresolved operation instead of accepting a quality receipt',async()=>{
 const s=setup(),a=s.job();output='draft.json\te30=\n';
 await expect(runBoundedProductCheck(a.db,s.binding,a.input)).rejects.toThrow();
 expect(a.db.prepare('SELECT status FROM obolus_reserved_operations').get()).toEqual({status:'pending'});
 expect(a.db.prepare('SELECT count(*) n FROM obolus_product_quality_assessments').get()).toEqual({n:0});
});
it('rejects missing, forged, contradictory, non-durable and altered-schema bindings',()=>{
 const s=setup();
 expect(()=>assertReviewedRuntime({kind:'reviewed-fixture-binding'} as ReviewedRuntimeBinding)).toThrow();
 expect(()=>bindReviewedRuntime(s.capacityDb,{...s.identity,inode:'999999999'})).toThrow();
 s.capacityDb.pragma('synchronous=OFF');expect(()=>assertReviewedRuntime(s.binding)).toThrow('durability');s.capacityDb.pragma('synchronous=FULL');
 s.capacityDb.exec('DROP INDEX isolated_runtime_one_slot');expect(()=>assertReviewedRuntime(s.binding)).toThrow('schema');
 const blank=new Database(path.join(s.dir,'blank.db'));try{expect(()=>bindReviewedRuntime(blank,inspectCapacityIdentity(blank))).toThrow();}finally{blank.close();}
 s.capacityDb.close();expect(()=>assertReviewedRuntime(s.binding)).toThrow();
});
it('protects both new control-plane modules',()=>{
 for(const file of ['security/reviewed-runtime-binding','commerce/bounded-product-check'])for(const ext of ['ts','js','d.ts'])expect(isProtectedFile('src/'+file+'.'+ext)).toBe(true);
});
it.each(['permission','budget','binding','quality','experiment-stop','invalid-economics'] as const)('rejects %s revocation during execution before result acceptance',async fault=>{
 const s=setup(),a=s.job();beforeRun=()=>{
  if(fault==='permission')revokeAdapterPermission(a.db,BOUNDED_PRODUCT_ADAPTER,'e');
  if(fault==='budget')a.db.exec('UPDATE inference_budget_policy SET halted=1');
  if(fault==='binding')containSecurityIncident(s.capacityDb);
  if(fault==='quality')a.db.exec("INSERT INTO obolus_product_quality_revocations VALUES('p','"+requireDigest(a.input.file.text)+"','synthetic rejection')");
  if(fault==='experiment-stop')a.db.exec("UPDATE revenue_experiments SET status='stopped'");
  if(fault==='invalid-economics')a.db.exec('UPDATE revenue_experiments SET forecast_cost_cents=-1');
 };
 await expect(runBoundedProductCheck(a.db,s.binding,a.input)).rejects.toThrow();
 expect(a.db.prepare('SELECT status FROM obolus_reserved_operations').get()).toEqual({status:'pending'});
 expect(a.db.prepare('SELECT count(*) n FROM obolus_product_quality_assessments').get()).toEqual({n:0});
});
it('refuses physically corrupted or absent capacity files without creating a replacement',()=>{
 const s=setup(),absent=path.join(s.dir,'absent.db'),corrupt=path.join(s.dir,'corrupt.db');
 expect(()=>new Database(absent,{fileMustExist:true})).toThrow();expect(fs.existsSync(absent)).toBe(false);
 fs.writeFileSync(corrupt,Buffer.alloc(4096,88));const db=new Database(corrupt);
 try{expect(()=>inspectCapacityIdentity(db)).toThrow();}finally{db.close();}
 expect(calls).toHaveLength(0);
});
it('rejects stale review evidence and schema alteration without repairing it',()=>{
 const s=setup();vi.useFakeTimers();vi.setSystemTime(Date.now()+600001);
 expect(()=>assertReviewedRuntime(s.binding)).toThrow();vi.useRealTimers();
 s.capacityDb.exec("DROP TRIGGER isolated_capacity_audit_no_delete; CREATE TRIGGER isolated_capacity_audit_no_delete BEFORE DELETE ON isolated_capacity_audit BEGIN SELECT 1; END");
 expect(()=>assertReviewedRuntime(s.binding)).toThrow('identity');
});
it('never repairs a missing capacity schema at the execution boundary',()=>{
 const s=setup();s.capacityDb.exec('DROP INDEX isolated_runtime_one_slot');
 expect(()=>new IsolatedRuntimeCapacity(s.capacityDb,true)).toThrow('Existing');
 expect(s.capacityDb.prepare("SELECT 1 FROM sqlite_master WHERE name='isolated_runtime_one_slot'").get()).toBeUndefined();
});
import {createHash} from 'node:crypto';
const requireDigest=(s:string)=>createHash('sha256').update(s).digest('hex');
it.each(['complete-and-stop','withdraw-during-runtime'] as const)('composes sector-open research, reserved draft execution, paper accounting and durable learning: %s',async mode=>{
 const s=setup(),a=s.job(),research=new ResearchStore(a.db),store=new RevenueStore(a.db),now=new Date().toISOString();
 // All quotations below are fabricated offline fixtures exercising the reported
 // evidence branch. They are never imported into a live database or real report.
 research.import({opportunities:RESEARCH_SECTORS.map((sector,i)=>({id:'candidate-'+i,title:'Synthetic '+i,sector,hypothesis:'Synthetic delivery hypothesis',
 forecast:{revenueCents:1000,costCents:100,probability:0.8,days:1,validationBudgetCents:10}})),
 evidence:RESEARCH_SECTORS.flatMap((_,i)=>['a','b'].map((source,j)=>({id:`e-${i}-${source}`,opportunityId:'candidate-'+i,
 sourceUrl:`https://${source}.example.invalid/fixture`,observedAt:now,kind:'request' as const,excerpt:'Distinct synthetic problem '+j,
 provenance:'reported' as const,reviewedBy:null})))});
 expect(research.rank().every(r=>r.decision==='hold')).toBe(true);
 for(let i=0;i<RESEARCH_SECTORS.length;i++)for(const e of research.evidence('candidate-'+i))research.review(e.id,'synthetic-reviewer','accept','Offline quotation fixture only');
 const ranked=research.rank();expect(new Set(ranked.map(r=>r.sector)).size).toBe(RESEARCH_SECTORS.length);
 expect(ranked.every(r=>r.decision==='validate')).toBe(true);
 const selected=ranked[0],planned=planResearchExperiment(a.db,selected.id),experiment=store.getExperiment(planned.experimentId)!;
 // Explicit temporary operator seed; the research handoff itself grants no money.
 expect(experiment.maxBudgetCents).toBe(0);
 store.updateOpportunity(experiment.opportunityId,{status:'validating'});
 store.updateExperiment(experiment.id,{maxBudgetCents:100,maxInferenceCostCents:50});
 store.transitionExperimentStatus(experiment.id,'running','Synthetic bounded test');
 const input={...a.input,id:'job-cycle',experimentId:experiment.id};
 fixtureGrantAdapterPermission(a.db,{adapter:BOUNDED_PRODUCT_ADAPTER,experimentId:experiment.id,maxCostUsdCents:0,expiresAt:Date.now()+600000,reviewedBy:'synthetic'});
 fixtureSecurityReview(a.db,boundedProductScope(input),Date.now(),['bounded-draft-workflow']);
 fixtureSecurityReview(a.db,isolatedJobScope(input.id,[input.file]),Date.now(),['isolated-backend-acceptance']);
 if(mode==='withdraw-during-runtime'){
  beforeRun=()=>research.review(research.evidence(selected.id)[0].id,'synthetic-reviewer','reject','Synthetic contradictory observation');
  await expect(runBoundedProductCheck(a.db,s.binding,input)).rejects.toThrow();
  expect(store.hasUnresolvedOperation(experiment.id)).toBe(true);
  expect(a.db.prepare('SELECT count(*) n FROM obolus_product_quality_assessments').get()).toEqual({n:0});
 }else{
  expect((await runBoundedProductCheck(a.db,s.binding,input)).assessment.passed).toBe(true);
  const ledger=new ProfitLedger(a.db),base={mode:'paper' as const,opportunityId:experiment.opportunityId,experimentId:experiment.id,strategyId:null,businessId:null,productId:'p',occurredAt:now};
  ledger.record({...base,id:'simulated-revenue',kind:'revenue',amountCents:100,category:'other'});
  ledger.record({...base,id:'simulated-all-cost',kind:'expense',amountCents:140,category:'experiment'});
  expect(ledger.aggregate().groups.all.paper.netProfitCents).toBe(-40);
  expect(ledger.aggregate().groups.all.realized.netProfitCents).toBe(0);
 }
 store.transitionExperimentStatus(experiment.id,'stopped','Synthetic result: no scale authority');
 store.updateExperiment(experiment.id,{lesson:'Synthetic experiment only: resolve evidence and all costs before retry or scale.'});
 const observer=createDatabase(a.db.name);
 try{
  const resumed=new RevenueStore(observer.raw),lesson=resumed.getLearningContext().lessons.find(e=>e.experimentId===experiment.id)!;
  expect(lesson.status).toBe('stopped');expect(lesson.verification).toBe('unverified-ledger-claims');
  if(mode==='withdraw-during-runtime')expect(lesson.blockers).toContain('unresolved_operation');
  const count=calls.length;await expect(runBoundedProductCheck(observer.raw,s.binding,input)).rejects.toThrow();expect(calls.length).toBe(count);
 }finally{observer.close();}
});
