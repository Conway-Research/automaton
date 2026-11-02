import {afterEach,expect,it,vi} from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {IsolatedJobLedger,isolatedJobScope,ISOLATED_PROFILE,ISOLATED_PROFILE_DIGEST} from '../security/isolated-job-ledger.js';
import {containSecurityIncident,registerActionReview,GATE_DOMAINS,type ActionScope} from '../security/action-gate.js';
import {registerLogSecrets} from '../observability/redaction.js';
import {isProtectedFile} from '../self-mod/code.js';
import {IsolatedJobSupervisor,ISOLATED_MONITOR_INTERVAL_MS} from '../security/isolated-job-supervisor.js';

const cleanups:(()=>void)[]=[];
afterEach(()=>{vi.useRealTimers();for(const cleanup of cleanups.splice(0).reverse())cleanup();});
const input=[{name:'input.txt',text:'synthetic fixture only'}];
it('rejects sparse input before persisting a job',()=>{
  const {a,one}=setup();
  expect(()=>one.submit('job-sparse',Array(1))).toThrow('Invalid isolated text file');
  expect(a.prepare('SELECT count(*) n FROM isolated_jobs').get()).toEqual({n:0});
});
it.each([
  {name:'sparse',output:Array(1)},
  {name:'null',output:null},
  {name:'traversal',output:[{name:'../out.txt',text:'synthetic'}]},
  {name:'duplicate-case',output:[{name:'out.txt',text:'a'},{name:'OUT.txt',text:'b'}]},
  {name:'invalid-unicode',output:[{name:'out.txt',text:'\ud800'}]},
])('retains uncertainty for malformed output $name after reopening',async({output})=>{
  const {a,one}=setup();approve(a,'job-invalid-output');approve(a,'job-next');
  const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,
    run:async()=>({terminated:true,exitCode:0,output:output as unknown as typeof input})});
  expect(await supervisor.run('job-invalid-output',input)).toBe('uncertain');
  const reopened=new Database(a.name);
  try{
    const ledger=new IsolatedJobLedger(reopened);
    expect(ledger.get('job-invalid-output')).toMatchObject({state:'uncertain',result:null});
    ledger.submit('job-next',input);expect(()=>ledger.claim('job-next',input)).toThrow('slot unavailable');
    expect(reopened.prepare("SELECT count(*) n FROM isolated_job_audit WHERE event='completed'").get()).toEqual({n:0});
  }finally{reopened.close();}
});
it.each(['false','true',1,{},[],null])('rejects malformed termination flag %# without releasing the job',async terminated=>{
  const {a,one,two}=setup();approve(a,'job-malformed');approve(a,'job-next');
  const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,
    run:async()=>({terminated:terminated as unknown as boolean,exitCode:0,output:[]})});
  expect(await supervisor.run('job-malformed',input)).toBe('uncertain');
  expect(two.get('job-malformed')?.state).toBe('uncertain');
  two.submit('job-next',input);
  expect(()=>two.claim('job-next',input)).toThrow('slot unavailable');
});
// Synthetic authorization only in temporary databases; no production evidence.
function fixtureSecurityReview(db:Database.Database,scope:ActionScope,now:number,requirements:string[]=[]){
  registerActionReview(db,{...scope,classification:'INTERNAL',reviewedBy:'synthetic-fixture',
    evidence:[...GATE_DOMAINS.map(domain=>({domain,requirement:domain as string})),
      ...requirements.map(requirement=>({domain:'security' as const,requirement}))].map(item=>({...item,
      jurisdiction:'CH',source:'https://example.invalid/mock-only',sourceDigest:'a'.repeat(64),
      observedAt:now,expiresAt:now+600000,decision:'APPROVED' as const,reason:'Synthetic fixture, no real approval'}))},now);
}
function setup(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-isolated-jobs-'));
  cleanups.push(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'fixture.db');
  const a=new Database(file),b=new Database(file);cleanups.push(()=>{a.close();b.close();});
  return {a,b,one:new IsolatedJobLedger(a),two:new IsolatedJobLedger(b)};
}
function approve(db:Database.Database,id:string){fixtureSecurityReview(db,isolatedJobScope(id,input),Date.now(),['isolated-backend-acceptance']);}

it('denies missing acceptance, different inputs, stale evidence and security halt',()=>{
  const {a,one}=setup();one.submit('job-a',input);
  expect(()=>one.claim('job-a',input)).toThrow();
  fixtureSecurityReview(a,isolatedJobScope('job-a',input),Date.now());
  expect(()=>one.claim('job-a',input)).toThrow();
  one.submit('job-stale',input);
  fixtureSecurityReview(a,isolatedJobScope('job-stale',input),Date.now()-700000,['isolated-backend-acceptance']);
  expect(()=>one.claim('job-stale',input)).toThrow();
  one.submit('job-approved',input);approve(a,'job-approved');
  expect(()=>one.claim('job-approved',[{name:'input.txt',text:'changed'}])).toThrow();
  containSecurityIncident(a);expect(()=>one.claim('job-approved',input)).toThrow();
  expect(one.get('job-a')?.state).toBe('queued');
});
it('deduplicates submission and rejects conflicting content without persisting text',()=>{
  const {a,one}=setup();expect(one.submit('job-a',input)).toEqual(one.submit('job-a',input));
  expect(()=>one.submit('job-a',[{name:'input.txt',text:'other'}])).toThrow('Conflicting');
  expect(a.serialize().includes(Buffer.from(input[0].text))).toBe(false);
});
it('serializes two database connections and never frees an unresolved slot on restart',()=>{
  const {a,one,two}=setup();for(const id of ['job-a','job-b']){one.submit(id,input);approve(a,id);}
  const token=one.claim('job-a',input);
  expect(()=>two.claim('job-a',input)).toThrow('not claimable');
  expect(()=>two.claim('job-b',input)).toThrow('slot unavailable');
  expect(two.recover()).toBe(1);expect(one.recover()).toBe(0);
  expect(()=>one.complete('job-a',token,[],0)).toThrow('reconciliation');
  expect(()=>two.claim('job-b',input)).toThrow('slot unavailable');
  expect(one.get('job-a')?.state).toBe('uncertain');
});
it('does not equate cancellation with termination',()=>{
  const {a,one}=setup();one.submit('job-a',input);one.cancel('job-a');
  expect(one.get('job-a')?.state).toBe('cancelled');
  one.submit('job-b',input);approve(a,'job-b');const token=one.claim('job-b',input);one.cancel('job-b');
  expect(one.get('job-b')?.state).toBe('uncertain');
  expect(()=>one.complete('job-b',token,[],0)).toThrow('reconciliation');
});
it('requires the lease and exactly matching duplicate results; bounded output leaves unresolved work reserved',()=>{
  const {a,one}=setup();one.submit('job-a',input);approve(a,'job-a');const token=one.claim('job-a',input);
  expect(()=>one.complete('job-a','wrong',[],0)).toThrow('lease');
  expect(()=>one.complete('job-a',token,[{name:'out.txt',text:'x'.repeat(ISOLATED_PROFILE.outputBytes+1)}],0)).toThrow('byte limit');
  expect(one.get('job-a')?.state).toBe('running');
  one.complete('job-a',token,[],0);one.complete('job-a',token,[],0);
  expect(()=>one.complete('job-a',token,[],1)).toThrow('Conflicting');
  expect(a.prepare("SELECT count(*) n FROM isolated_job_audit WHERE event='completed'").get()).toEqual({n:1});
});
it.each(['../escape.txt','C:\\host.txt','aux.txt','COM1.json','a/b.txt','file.txt:stream','input.txt.','a.csv\u0000'])('rejects unsafe logical filename %s',name=>{
  const {one}=setup();expect(()=>one.submit('job-a',[{name,text:'fixture'}])).toThrow();
});
it('rejects aliases, malformed text, unknown fields, excess files and secret material',()=>{
  const {one}=setup();
  expect(()=>one.submit('job-a',[{name:'a.txt',text:''},{name:'A.txt',text:''}])).toThrow('Duplicate');
  expect(()=>one.submit('job-a',[{name:'a.txt',text:'\ud800'}])).toThrow();
  expect(()=>one.submit('job-a',[{name:'a.txt',text:'',path:'/etc'} as typeof input[number]])).toThrow();
  expect(()=>one.submit('job-a',Array.from({length:17},(_,i)=>({name:`a${i}.txt`,text:''})))).toThrow();
  registerLogSecrets(['synthetic-credential-canary-ledger']);
  expect(()=>one.submit('job-a',[{name:'a.txt',text:'synthetic-credential-canary-ledger'}])).toThrow();
});
it('rolls back admission and settlement if durable audit fails',()=>{
  const {a,one}=setup();one.submit('job-a',input);approve(a,'job-a');
  a.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON isolated_job_audit BEGIN SELECT RAISE(ABORT,'fixture audit unavailable'); END");
  expect(()=>one.claim('job-a',input)).toThrow('audit unavailable');expect(one.get('job-a')?.state).toBe('queued');
  a.exec('DROP TRIGGER reject_fixture');const token=one.claim('job-a',input);
  a.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON isolated_job_audit BEGIN SELECT RAISE(ABORT,'fixture audit unavailable'); END");
  expect(()=>one.complete('job-a',token,[],0)).toThrow('audit unavailable');expect(one.get('job-a')?.state).toBe('running');
});
it('protects source and compiled control code from ordinary self modification',()=>{
  for(const name of ['isolated-job-ledger','isolated-job-supervisor'])
    for(const extension of ['ts','js','d.ts'])expect(isProtectedFile(`src/security/${name}.${extension}`)).toBe(true);
});

it('supervisor is disabled by default and rejects unapproved transport execution',async()=>{
  const {one}=setup();const run=vi.fn();
  expect(await new IsolatedJobSupervisor(one).run('job-a',input)).toBe('disabled');
  expect(one.get('job-a')).toBeUndefined();
  await expect(new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,run}).run('job-a',input)).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
it('supervisor delivers immutable exact inputs to a mock and accounts once after observed termination',async()=>{
  const {a,one}=setup();approve(a,'job-a');const mutable=input.map(file=>({...file}));
  const run=vi.fn(async(request)=>{
    expect(request.files).toEqual(input);expect(Object.isFrozen(request.files[0])).toBe(true);
    expect(request.profile).toEqual(ISOLATED_PROFILE);
    return {terminated:true,exitCode:0,output:[{name:'out.txt',text:'synthetic output'}]};
  });
  const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,run});const pending=supervisor.run('job-a',mutable);mutable[0].text='changed after admission';
  expect(await pending).toBe('completed');
  await expect(supervisor.run('job-a',input)).rejects.toThrow();expect(run).toHaveBeenCalledTimes(1);
});
it.each(['timeout','cancel','recovery'] as const)('keeps %s unresolved, aborts when possible and ignores late mock replies',async mode=>{
  vi.useFakeTimers();const {a,one,two}=setup();approve(a,'job-a');
  let finish!:(value:{terminated:boolean;exitCode:number;output:never[]})=>void;
  let signal:AbortSignal|undefined;
  const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,run:async(_request,s)=>{signal=s;return new Promise(resolve=>{finish=resolve;});}});
  const pending=supervisor.run('job-a',input);await Promise.resolve();
  if(mode==='timeout')await vi.advanceTimersByTimeAsync(ISOLATED_PROFILE.timeoutMs);
  if(mode==='cancel')supervisor.cancel('job-a');
  if(mode==='recovery'){two.recover();finish({terminated:true,exitCode:0,output:[]});}
  expect(await pending).toBe('uncertain');
  if(mode!=='recovery')expect(signal?.aborted).toBe(true);
  finish({terminated:true,exitCode:0,output:[]});await Promise.resolve();
  expect(one.get('job-a')?.state).toBe('uncertain');
});
it.each(['exception','unconfirmed','oversize'] as const)('keeps %s mock outcome fail-closed without recording provider details',async mode=>{
  const {a,one}=setup();approve(a,'job-a');
  const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,run:async()=>{
    if(mode==='exception')throw Error('synthetic sensitive provider details');
    return {terminated:mode!=='unconfirmed',exitCode:0,output:[{name:'out.txt',text:'x'.repeat(mode==='oversize'?65537:1)}]};
  }});
  expect(await supervisor.run('job-a',input)).toBe('uncertain');
  expect(a.serialize().includes(Buffer.from('synthetic sensitive provider details'))).toBe(false);
});

it('does not invoke a transport cancelled before its dispatch microtask',async()=>{
  const {a,one}=setup();approve(a,'job-a');const run=vi.fn();
  const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,run});
  const pending=supervisor.run('job-a',input);supervisor.cancel('job-a');
  expect(await pending).toBe('uncertain');expect(run).not.toHaveBeenCalled();
});
it('aborts a running transport even if cancellation audit persistence fails',async()=>{
  const {a,one}=setup();approve(a,'job-a');let signal:AbortSignal|undefined;
  const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,run:async(_request,s)=>{signal=s;return new Promise(()=>{});}});
  const pending=supervisor.run('job-a',input);await Promise.resolve();
  a.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON isolated_job_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  expect(()=>supervisor.cancel('job-a')).toThrow('audit unavailable');
  await expect(pending).rejects.toThrow('audit unavailable');expect(signal?.aborted).toBe(true);
  expect(one.get('job-a')?.state).toBe('running');
});
it('preserves unresolved state through actual database close and reopen',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-isolated-reopen-'));
  const file=path.join(dir,'fixture.db');let db=new Database(file);
  try{
    let ledger=new IsolatedJobLedger(db);ledger.submit('job-a',input);approve(db,'job-a');ledger.claim('job-a',input);
    db.close();db=new Database(file);ledger=new IsolatedJobLedger(db);
    expect(ledger.get('job-a')?.state).toBe('running');expect(ledger.recover()).toBe(1);
    db.close();db=new Database(file);ledger=new IsolatedJobLedger(db);
    expect(ledger.get('job-a')?.state).toBe('uncertain');expect(ledger.recover()).toBe(0);
    expect(()=>db.prepare('DELETE FROM isolated_job_audit').run()).toThrow('immutable');
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

it.each(['halt','expired','recovered','audit-failure'] as const)('revalidates %s between claim and asynchronous transport dispatch',async boundary=>{
  vi.useFakeTimers();const {a,one,two}=setup();approve(a,'job-a');
  const run=vi.fn();const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,run});
  const pending=supervisor.run('job-a',input);
  if(boundary==='halt')containSecurityIncident(a);
  if(boundary==='expired')vi.setSystemTime(Date.now()+700000);
  if(boundary==='recovered')two.recover();
  if(boundary==='audit-failure')a.exec("CREATE TRIGGER reject_dispatch BEFORE INSERT ON isolated_job_audit WHEN NEW.event='dispatch-validated' BEGIN SELECT RAISE(ABORT,'dispatch audit unavailable'); END");
  expect(await pending).toBe('uncertain');expect(run).not.toHaveBeenCalled();
  expect(one.get('job-a')?.state).toBe('uncertain');
});

it('rejects unknown or changed transport binding and never dispatches it',async()=>{
  const {a,one}=setup();approve(a,'job-a');const run=vi.fn();
  const transport={profileDigest:'unknown',run};const supervisor=new IsolatedJobSupervisor(one,transport);
  await expect(supervisor.run('job-a',input)).rejects.toThrow('profile mismatch');
  expect(one.get('job-a')).toBeUndefined();
  transport.profileDigest=ISOLATED_PROFILE_DIGEST;
  const pending=supervisor.run('job-a',input);transport.profileDigest='changed';
  expect(await pending).toBe('uncertain');expect(run).not.toHaveBeenCalled();
});

it('requires fresh separately reviewed termination bound to the actual lease before releasing an uncertain slot',()=>{
  const {a,one,two}=setup();one.submit('job-a',input);approve(a,'job-a');
  const token=one.claim('job-a',input);one.recover();
  const evidence={runtimeId:`obolus-job-${token}`,profileDigest:ISOLATED_PROFILE_DIGEST,observedAt:Date.now(),running:false as const,pid:0 as const,removed:true as const};
  expect(()=>one.reconcileTerminated('job-a',token,evidence)).toThrow();
  expect(()=>one.terminationScope('job-a',token,{...evidence,runtimeId:'other-container'})).toThrow();
  expect(()=>one.terminationScope('job-a',token,{...evidence,observedAt:Date.now()-60001})).toThrow();
  const scope=one.terminationScope('job-a',token,evidence);
  fixtureSecurityReview(a,scope,Date.now(),['isolated-termination-verification']);
  a.exec("CREATE TRIGGER reject_reconcile BEFORE INSERT ON isolated_job_audit WHEN NEW.event='termination-reconciled' BEGIN SELECT RAISE(ABORT,'fixture reconciliation audit failure'); END");
  expect(()=>one.reconcileTerminated('job-a',token,evidence)).toThrow('audit failure');expect(one.get('job-a')?.state).toBe('uncertain');
  a.exec('DROP TRIGGER reject_reconcile');
  one.reconcileTerminated('job-a',token,evidence);two.reconcileTerminated('job-a',token,evidence);
  expect(one.get('job-a')?.state).toBe('cancelled');
  expect(()=>one.complete('job-a',token,[],0)).toThrow();
  one.submit('job-b',input);approve(a,'job-b');expect(two.claim('job-b',input)).toBeTruthy();
  expect(a.prepare("SELECT count(*) n FROM isolated_job_audit WHERE event='termination-reconciled'").get()).toEqual({n:1});
});

it.each(['halt','expired','recovered','binding','audit-failure'] as const)('monitors %s while a transport is already running',async boundary=>{
  vi.useFakeTimers();const {a,one,two}=setup();approve(a,'job-a');let signal:AbortSignal|undefined;
  const transport={profileDigest:ISOLATED_PROFILE_DIGEST,run:async(_request:unknown,s:AbortSignal)=>{signal=s;return new Promise<never>(()=>{});}};
  const supervisor=new IsolatedJobSupervisor(one,transport);const pending=supervisor.run('job-a',input);
  await Promise.resolve();expect(signal).toBeDefined();
  if(boundary==='halt')containSecurityIncident(a);
  if(boundary==='expired')vi.setSystemTime(Date.now()+700000);
  if(boundary==='recovered')two.recover();
  if(boundary==='binding')transport.profileDigest='changed';
  if(boundary==='audit-failure')a.exec("CREATE TRIGGER reject_monitor BEFORE INSERT ON isolated_job_audit WHEN NEW.event='runtime-validated' BEGIN SELECT RAISE(ABORT,'monitor audit unavailable'); END");
  await vi.advanceTimersByTimeAsync(ISOLATED_MONITOR_INTERVAL_MS);
  expect(await pending).toBe('uncertain');expect(signal?.aborted).toBe(true);
  expect(one.get('job-a')?.state).toBe('uncertain');expect(vi.getTimerCount()).toBe(0);
});

it('rejects a completed transport response racing a halt before the next monitor tick',async()=>{
  const {a,one}=setup();approve(a,'job-a');
  const supervisor=new IsolatedJobSupervisor(one,{profileDigest:ISOLATED_PROFILE_DIGEST,run:async()=>{
    containSecurityIncident(a);return {terminated:true,exitCode:0,output:[]};
  }});
  expect(await supervisor.run('job-a',input)).toBe('uncertain');
  expect(one.get('job-a')?.result).toBeNull();
});

it('rechecks authorization atomically with settlement after the prior runtime check',()=>{
  const {a,b,one}=setup();one.submit('job-a',input);approve(a,'job-a');const token=one.claim('job-a',input);
  one.assertActive('job-a',token,input);containSecurityIncident(b);
  expect(()=>one.complete('job-a',token,[],0)).toThrow();
  expect(one.get('job-a')).toMatchObject({state:'running',result:null});
});
