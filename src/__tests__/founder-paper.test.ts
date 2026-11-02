import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import Database from 'better-sqlite3';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {createDatabase} from '../state/database.js';
import {prepareFounderPaper,founderPaperStatus,startFounderPaper,founderPaperTick,assertFounderPaperPath,FOUNDER_PAPER_DIRECTORY} from '../v1/founder-paper.js';
import {checkCapitalBudget} from '../revenue/capital-budget.js';
import {readBudgetPolicy} from '../inference/budget-policy.js';
import {diverseSourceScope,individualSourceScope,collectReviewedDiverseSources} from '../online/source-diversity.js';
import {shadowSourceScope} from '../online/shadow-sources.js';
import {HORIZON_TOPIC} from '../online/discovery.js';
import {GATE_DOMAINS,registerActionReview,revokeActionReview} from '../security/action-gate.js';
import {OnlineRuntime} from '../online/runtime.js';
import {isProtectedFile} from '../self-mod/code.js';
import {isSensitiveReadPath} from '../agent/read-path.js';
import {confineWritePath} from '../agent/write-path.js';
import {founderPaperCommand} from '../v1/founder-paper-cli.js';
let dir:string,db:ReturnType<typeof createDatabase>,now:number;
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-policy-test-'));db=createDatabase(path.join(dir,'copy.db'));now=Date.now();});
afterEach(()=>{vi.restoreAllMocks();db.close();fs.rmSync(dir,{recursive:true,force:true});});
function approve(){for(const scope of [diverseSourceScope(),shadowSourceScope(HORIZON_TOPIC,true)]){const e={jurisdiction:'CH',source:'https://example.invalid/synthetic',sourceDigest:'a'.repeat(64),observedAt:now,expiresAt:now+86400000,decision:'APPROVED' as const,reason:'Fixture only'};registerActionReview(db.raw,{...scope,classification:'PUBLIC',reviewedBy:'fixture',evidence:[...GATE_DOMAINS.map(domain=>({...e,domain,requirement:domain})),...['public-source-egress','public-source-terms'].map(requirement=>({...e,domain:'security' as const,requirement}))]});}}
it('CLI status uses an in-memory snapshot and leaves all source sidecars and controller untouched',async()=>{
 prepareFounderPaper(db.raw,false);
 db.raw.pragma('journal_mode=DELETE');
 const file=db.raw.name;
 const snapshots=()=>['','-wal','-shm','-journal'].map(s=>[s,fs.existsSync(file+s)?fs.readFileSync(file+s).toString('hex'):null]);
 const before=snapshots();
 const write=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
 const control=vi.spyOn(OnlineRuntime.prototype,'control');
 await founderPaperCommand(['status','--database',file]);
 expect(snapshots()).toEqual(before);expect(control).not.toHaveBeenCalled();
 const result=JSON.parse(String(write.mock.calls[0][0]));
 expect(result).toMatchObject({readOnly:true,startsController:false,liveReady:false});
 expect(result.searchProviders.map((p:{provider:string})=>p.provider)).toEqual(['serper','tavily','exa','ted','brave','firecrawl']);
 expect(result.searchProviders.every((p:{reason:string})=>p.reason==='SEARCH_ALLOWANCE_ABSENT')).toBe(true);
});
it('prepares zero explicit budget, capital deny and no implicit source permission',()=>{prepareFounderPaper(db.raw,false);expect(readBudgetPolicy(db.raw)).toMatchObject({halted:1,daily_cents:0,call_cents:0});expect(checkCapitalBudget(db.raw,0).allowed).toBe(false);expect(checkCapitalBudget(db.raw,1).allowed).toBe(false);expect(founderPaperStatus(db.raw)).toMatchObject({canStart:false,phase:null,liveReady:false,productionAccepted:false});expect(()=>startFounderPaper(db.raw)).toThrow('reviews');});
it('quarantined operating copy cannot start even with synthetic reviews',()=>{prepareFounderPaper(db.raw,true);approve();expect(()=>startFounderPaper(db.raw)).toThrow('quarantined');expect(founderPaperStatus(db.raw).phase).toBeNull();});
it('actual phase lasts 14 days and resume preserves deadline, budget and stop',()=>{prepareFounderPaper(db.raw,false);approve();startFounderPaper(db.raw);const end=founderPaperStatus(db.raw).phase!.ends_ms;expect(end-now).toBeGreaterThan(13*86400000);new OnlineRuntime(db.raw).control('pause');const other=new Database(db.raw.name);try{startFounderPaper(other,true);expect(founderPaperStatus(other).phase!.ends_ms).toBe(end);new OnlineRuntime(other).control('emergency');expect(()=>startFounderPaper(db.raw,true)).toThrow('Emergency');expect(readBudgetPolicy(db.raw)!.halted).toBe(1);}finally{other.close();}});
it('revoked reviews block before network and learning cannot rewrite policies',async()=>{prepareFounderPaper(db.raw,false);approve();startFounderPaper(db.raw);revokeActionReview(db.raw,diverseSourceScope());const spy=vi.spyOn(OnlineRuntime.prototype,'autonomousTick');await expect(founderPaperTick(db.raw)).rejects.toThrow('blocked');expect(spy).not.toHaveBeenCalled();expect(()=>db.raw.prepare("UPDATE founder_paper_policy SET policy='unsafe'").run()).toThrow('Immutable');expect(()=>db.raw.prepare('DELETE FROM obolus_paper_capital_stop').run()).toThrow('retained');});
it('independent controllers cannot initialize a second phase or reset its clock',()=>{prepareFounderPaper(db.raw,false);approve();startFounderPaper(db.raw);const other=new Database(db.raw.name);try{expect(()=>startFounderPaper(other)).toThrow('resume');expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_phase_budget').get()).toEqual({n:1});}finally{other.close();}});
it('phase halt cannot reopen on restart',()=>{prepareFounderPaper(db.raw,false);approve();startFounderPaper(db.raw);db.raw.prepare('UPDATE inference_phase_budget SET halted=1 WHERE id=1').run();expect(()=>startFounderPaper(db.raw,true)).toThrow('expired');});
it('read-only admission explains clock rollback before resume or a network tick',async()=>{
 prepareFounderPaper(db.raw,false);approve();startFounderPaper(db.raw);
 db.raw.prepare('UPDATE inference_phase_budget SET last_ms=? WHERE id=1').run(Date.now()+60000);
 const before=db.raw.prepare('SELECT * FROM inference_phase_budget').get();
 expect(founderPaperStatus(db.raw)).toMatchObject({canStart:false,blockers:['phase_clock_rollback']});
 expect(db.raw.prepare('SELECT * FROM inference_phase_budget').get()).toEqual(before);
 const tick=vi.spyOn(OnlineRuntime.prototype,'autonomousTick');
 await expect(founderPaperTick(db.raw)).rejects.toThrow('blocked');expect(tick).not.toHaveBeenCalled();
 expect(()=>startFounderPaper(db.raw,true)).toThrow('clock rollback');
});
it('a separately initialized positive phase cannot become a free Founder phase',async()=>{
 prepareFounderPaper(db.raw,false);approve();
 const {initializeInferencePhase}=await import('../inference/phase-budget.js');
 initializeInferencePhase(db.raw,{startsAt:now,endsAt:now+86400000,limitCents:1});
 expect(founderPaperStatus(db.raw)).toMatchObject({canStart:false,blockers:['paper_phase_cost_mismatch']});
 expect(()=>startFounderPaper(db.raw,true)).toThrow();
 const tick=vi.spyOn(OnlineRuntime.prototype,'autonomousTick');
 await expect(founderPaperTick(db.raw)).rejects.toThrow('blocked');expect(tick).not.toHaveBeenCalled();
 expect(readBudgetPolicy(db.raw)).toMatchObject({halted:1,call_cents:0});
});
it('cannot relabel a populated operating copy as a clean research workspace',()=>{db.raw.exec("CREATE TABLE private_fixture(value TEXT); INSERT INTO private_fixture VALUES('synthetic only')");expect(()=>prepareFounderPaper(db.raw,false)).toThrow('prior operating data');expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='founder_paper_policy'").get()).toBeUndefined();});
it('crash recovery cancels uncertain jobs but retains source holds without another request',()=>{
 prepareFounderPaper(db.raw,false);approve();startFounderPaper(db.raw);const runtime=new OnlineRuntime(db.raw);runtime.enqueue(HORIZON_TOPIC);db.raw.prepare("UPDATE online_jobs SET status='running'").run();
 db.raw.prepare("INSERT INTO source_diversity_runs(id,source_id,status,started_ms) VALUES('uncertain','uk-data','pending',?)").run(now);
 const second=new Database(db.raw.name);try{startFounderPaper(second,true);expect(second.prepare('SELECT status FROM online_jobs').get()).toEqual({status:'cancelled'});expect(second.prepare('SELECT status FROM source_diversity_runs').get()).toEqual({status:'pending'});expect(second.prepare('SELECT COUNT(*) n FROM online_requests').get()).toEqual({n:0});}finally{second.close();}
});
function approveOne(id:string,decision:'APPROVED'|'BLOCKED'='APPROVED'){
 const e={jurisdiction:'CH',source:'https://example.invalid/synthetic',sourceDigest:'b'.repeat(64),observedAt:now,expiresAt:now+86400000,decision,reason:'Synthetic source-specific fixture only'};
 registerActionReview(db.raw,{...individualSourceScope(id),classification:'PUBLIC',reviewedBy:'fixture',evidence:[...GATE_DOMAINS.map(domain=>({...e,domain,requirement:domain})),...['public-source-egress','public-source-terms'].map(requirement=>({...e,domain:'security' as const,requirement}))]});
}
it('individual mode requires specific evidence and does not inherit catalogue approval',()=>{
 prepareFounderPaper(db.raw,false,'individual');approve();expect(founderPaperStatus(db.raw).canStart).toBe(false);
 approveOne('crossref');expect(founderPaperStatus(db.raw)).toMatchObject({canStart:true,sourceMode:'individual',phase:null});
 expect(founderPaperStatus(db.raw).individualReviews.filter(r=>r.state==='APPROVED').map(r=>r.id)).toEqual(['crossref']);
 expect(()=>db.raw.exec("UPDATE founder_paper_source_mode SET mode='catalogue'")).toThrow();
 expect(()=>db.raw.exec('DELETE FROM founder_paper_source_mode')).toThrow();
});
it('individual scopes are distinct and reject unknown sources',()=>{
 expect(individualSourceScope('crossref').contextDigest).not.toBe(individualSourceScope('uk-data').contextDigest);
 expect(()=>individualSourceScope('arbitrary-host')).toThrow();
});
it('individual mode cannot replace an existing reviewed workspace or classify a private copy',()=>{
 prepareFounderPaper(db.raw,false);approve();expect(()=>prepareFounderPaper(db.raw,false,'individual')).toThrow('already prepared');
 expect(()=>prepareFounderPaper(db.raw,true,'individual')).toThrow('clean paper copy');
});
it('one approved provider works while missing and denied providers receive no requests',async()=>{
 prepareFounderPaper(db.raw,false,'individual');approveOne('crossref');approveOne('uk-data','BLOCKED');startFounderPaper(db.raw);
 const request=vi.fn<typeof fetch>(async input=>{expect(new URL(String(input)).hostname).toBe('api.crossref.org');return new Response(JSON.stringify({status:'ok',message:{items:[]}}));});
 const result=await collectReviewedDiverseSources(db.raw,HORIZON_TOPIC,new AbortController().signal,request);
 expect(request).toHaveBeenCalledTimes(1);expect(result.reports.map(r=>r.sourceId)).toEqual(['crossref']);
 expect(db.raw.prepare('SELECT source FROM online_requests').all()).toEqual([{source:'api.crossref.org'}]);
});
it('revocation during an individually approved read blocks delivery and receipt persistence',async()=>{
 prepareFounderPaper(db.raw,false,'individual');approveOne('crossref');startFounderPaper(db.raw);
 const request=vi.fn<typeof fetch>(async()=>{revokeActionReview(db.raw,individualSourceScope('crossref'));return new Response(JSON.stringify({status:'ok',message:{items:[]}}));});
 await expect(collectReviewedDiverseSources(db.raw,HORIZON_TOPIC,new AbortController().signal,request)).rejects.toThrow();
 expect(db.raw.prepare('SELECT COUNT(*) n FROM source_diversity_receipts').get()).toEqual({n:0});
 expect(founderPaperStatus(db.raw).canStart).toBe(false);
});
it('expired individual evidence blocks restart without extending the approval',()=>{
 prepareFounderPaper(db.raw,false,'individual');approveOne('crossref');startFounderPaper(db.raw);
 vi.spyOn(Date,'now').mockReturnValue(now+2*86400000);
 expect(()=>startFounderPaper(db.raw,true)).toThrow('reviews');expect(founderPaperStatus(db.raw).individualReviews.find(r=>r.id==='crossref')!.state).toBe('STALE_EVIDENCE');
});
it('denied individual collection persists an audit without issuing any request',async()=>{
 prepareFounderPaper(db.raw,false,'individual');approveOne('crossref');startFounderPaper(db.raw);revokeActionReview(db.raw,individualSourceScope('crossref'));
 const request=vi.fn<typeof fetch>();await expect(collectReviewedDiverseSources(db.raw,HORIZON_TOPIC,new AbortController().signal,request)).rejects.toThrow();
 expect(request).not.toHaveBeenCalled();expect(db.raw.prepare("SELECT COUNT(*) n FROM obolus_security_audit WHERE state<>'APPROVED'").get()).toEqual({n:1});
});
function mockDurablePath(){
 const root=path.resolve(FOUNDER_PAPER_DIRECTORY),file=path.join(root,'paper.db'),workspaceId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 const marker={version:1,database:file,mode:'founder-paper',workspaceId};
 vi.spyOn(fs,'realpathSync').mockImplementation((value:any)=>path.resolve(String(value)));
 vi.spyOn(fs,'lstatSync').mockReturnValue({isSymbolicLink:()=>false} as never);
 vi.spyOn(fs,'statSync').mockReturnValue({size:100} as never);
 vi.spyOn(fs,'readFileSync').mockReturnValue(JSON.stringify(marker));return {file,marker,workspaceId};
}
it('accepts only the exact authorized durable path and a bounded marker',()=>{
 const {file,workspaceId}=mockDurablePath();expect(assertFounderPaperPath(file)).toEqual({file,workspaceId});
 expect(()=>assertFounderPaperPath(path.join(FOUNDER_PAPER_DIRECTORY,'other.db'))).toThrow();
 vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({version:1,database:file,mode:'live',workspaceId}));expect(()=>assertFounderPaperPath(file)).toThrow('binding');
});
it('rejects redirected durable files and symlink markers',()=>{
 const {file}=mockDurablePath();vi.mocked(fs.lstatSync).mockReturnValue({isSymbolicLink:()=>true} as never);expect(()=>assertFounderPaperPath(file)).toThrow();
 vi.mocked(fs.lstatSync).mockReturnValue({isSymbolicLink:()=>false} as never);vi.mocked(fs.realpathSync).mockImplementation((value:any)=>String(value)===file?path.join(FOUNDER_PAPER_DIRECTORY,'other.db'):path.resolve(String(value)));expect(()=>assertFounderPaperPath(file)).toThrow();
});
it('requires database identity to match the durable marker, not just its location',()=>{
 prepareFounderPaper(db.raw,false,'individual');
 db.raw.exec('CREATE TABLE founder_paper_workspace(id INTEGER PRIMARY KEY,workspace_id TEXT,database_path TEXT)');
 const {file,workspaceId}=mockDurablePath();
 const bound=new Proxy(db.raw,{get(target,key){if(key==='name')return file;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 expect(()=>founderPaperStatus(bound)).toThrow('mismatch');
 db.raw.prepare('INSERT INTO founder_paper_workspace VALUES(1,?,?)').run(workspaceId,file);expect(founderPaperStatus(bound).phase).toBeNull();
 db.raw.prepare("UPDATE founder_paper_workspace SET workspace_id='wrong'").run();expect(()=>founderPaperStatus(bound)).toThrow('mismatch');
});
it('ordinary agent file tools cannot read or rewrite the durable control plane even with a broad root',()=>{
 for(const name of ['workspace.json','paper.db','paper.initial.db','paper.db-wal']){
  const file=path.join(FOUNDER_PAPER_DIRECTORY,name);
  expect(isSensitiveReadPath(file)).toBe(true);expect(isProtectedFile(file)).toBe(true);
  expect(confineWritePath(file,false,path.dirname(path.resolve(FOUNDER_PAPER_DIRECTORY)))).toHaveProperty('error');
 }
});
