import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openOnline} from '../online/workspace.js';
import {collectReviewedShadowSources,shadowSourceScope} from '../online/shadow-sources.js';
import {initializeInferencePhase,inferencePhaseSnapshot} from '../inference/phase-budget.js';
import {GATE_DOMAINS,registerActionReview,revokeActionReview,containSecurityIncident} from '../security/action-gate.js';
import {publicJson,SOURCE_LIMITS,assertPublicEndpoint} from '../online/sources.js';
import {HORIZON_TOPIC} from '../online/discovery.js';
let dir:string,online:ReturnType<typeof openOnline>,now:number;
const json=(value:unknown)=>new Response(JSON.stringify(value));
function fixture(items?:unknown[]){return vi.fn<typeof fetch>(async(input,init)=>{
 expect(init).toMatchObject({method:'GET',redirect:'error',credentials:'omit'});
 expect(new Headers(init?.headers).has('authorization')).toBe(false);
 return String(input).includes('api.github.com')?json({incomplete_results:false,items:items??[item(1)]}):json([]);
});}
function item(id:number,body='Public problem indicator',age=1000){return {html_url:`https://github.com/fixture/project/issues/${id}`,title:'Synthetic issue',body,created_at:new Date(now-age).toISOString()};}
function approve(){
 const base={jurisdiction:'CH',source:'https://example.invalid/synthetic-only',sourceDigest:'a'.repeat(64),observedAt:now-100,expiresAt:now+60000,decision:'APPROVED' as const,reason:'Synthetic test only'};
 registerActionReview(online.database.raw,{...shadowSourceScope(HORIZON_TOPIC,true),reviewedBy:'fixture-operator',classification:'PUBLIC',evidence:[
 ...GATE_DOMAINS.map(domain=>({...base,domain,requirement:domain})),
 ...['public-source-egress','public-source-terms'].map(requirement=>({...base,domain:'security' as const,requirement}))]});
}
const collect=(request:typeof fetch)=>collectReviewedShadowSources(online.database.raw,HORIZON_TOPIC,true,new AbortController().signal,request);
beforeEach(()=>{now=Date.now();dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-source-'));online=openOnline({directory:path.join(dir,'research'),request:fixture()});
 initializeInferencePhase(online.database.raw,{startsAt:now,endsAt:now+86400000,limitCents:0});online.runtime.control('start');});
afterEach(()=>{vi.useRealTimers();online.database.close();fs.rmSync(dir,{recursive:true,force:true});});
it('unknown approval blocks without a request and retains denial audit',async()=>{const request=fixture();await expect(collect(request)).rejects.toThrow('INSUFFICIENT_EVIDENCE');expect(request).not.toHaveBeenCalled();expect(online.database.raw.prepare('SELECT state FROM obolus_security_audit').all()).toEqual([{state:'INSUFFICIENT_EVIDENCE'}]);});
it('keeps source provenance, actual retrieval time and untrusted status separate from demand',async()=>{approve();const result=await collect(fixture());expect(result).toMatchObject({verifiedDemand:false,verifiedRevenue:false,liveReady:false,productionAccepted:false});expect(result.sources).toHaveLength(1);expect(result.sources[0]).toMatchObject({reviewed:false,untrusted:true,publishedAt:new Date(now-1000).toISOString()});expect(result.sources[0].contentDigest).toMatch(/^[a-f0-9]{64}$/);expect(Date.parse(result.retrievedAt)).toBeGreaterThanOrEqual(now);});
it('rejects stale, future, private and duplicate content without silently inventing corrections',async()=>{approve();const result=await collect(fixture([item(1),item(2),item(3,'Older',91*86400000),item(4,'Future',-86400000),item(5,'person@example.com')]));expect(result.sources).toHaveLength(1);expect(result.rejected.map(x=>x.reason).sort()).toEqual(['duplicate_excerpt','privacy_review_required','stale_or_future_source','stale_or_future_source']);});
it('revocation during request blocks the entire response and later requests',async()=>{approve();const request=vi.fn<typeof fetch>(async()=>{revokeActionReview(online.database.raw,shadowSourceScope(HORIZON_TOPIC,true));return json({items:[]});});await expect(collect(request)).rejects.toThrow();expect(request).toHaveBeenCalledTimes(1);});
it.each(['pause','emergency'] as const)('research %s blocks before egress',async(action)=>{approve();online.runtime.control(action);const request=fixture();await expect(collect(request)).rejects.toThrow();expect(request).not.toHaveBeenCalled();});
it('persistent security containment blocks source access',async()=>{approve();containSecurityIncident(online.database.raw);const request=fixture();await expect(collect(request)).rejects.toThrow('BLOCKED');expect(request).not.toHaveBeenCalled();});
it('phase expiry survives failed admission and cannot roll back',async()=>{approve();vi.useFakeTimers();vi.setSystemTime(now+86400001);const request=fixture();await expect(collect(request)).rejects.toThrow('inactive');expect(inferencePhaseSnapshot(online.database.raw)?.halted).toBe(1);expect(request).not.toHaveBeenCalled();});
it('topic and scope cannot be replaced by caller or model assertions',()=>{expect(()=>shadowSourceScope('events',true)).toThrow();expect(()=>shadowSourceScope('https://localhost',false)).toThrow();expect(shadowSourceScope('software needs',false).contextDigest).not.toBe(shadowSourceScope(HORIZON_TOPIC,true).contextDigest);});
it.each(['http://api.github.com/search/issues','https://127.0.0.1/','https://169.254.169.254/','file:///C:/wallet','https://api.github.com.evil.invalid/search/issues','https://api.github.com/search/issues?redirect=localhost'])('rejects unauthorized endpoint %s',url=>{expect(()=>assertPublicEndpoint(url)).toThrow();});
it.each(['transport','body'])('bounds stalled %s without automatic retry',async(kind)=>{vi.useFakeTimers();const request=vi.fn<typeof fetch>(async()=>kind==='transport'?new Promise<Response>(()=>{}):new Response(new ReadableStream({pull:()=>new Promise(()=>{})})));
 const work=publicJson(online.database.raw,'https://hacker-news.firebaseio.com/v0/askstories.json',new AbortController().signal,request);
 const rejected=expect(work).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(SOURCE_LIMITS.timeoutMs+1);await rejected;expect(request).toHaveBeenCalledTimes(1);expect(online.database.raw.prepare('SELECT status FROM online_requests').all()).toEqual([{status:'failed'}]);});
it('quota exhaustion fails closed before the next source fetch',async()=>{approve();for(let i=0;i<SOURCE_LIMITS.hourlyRequests;i++)online.database.raw.prepare("INSERT INTO online_requests(source,status) VALUES('fixture','failed')").run();const request=fixture();await expect(collect(request)).rejects.toThrow('quota');expect(request).not.toHaveBeenCalled();});

it('receipt failure blocks delivery instead of bypassing audit',async()=>{approve();online.database.raw.exec("CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON online_audit WHEN NEW.action='shadow_source_receipt' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");await expect(collect(fixture())).rejects.toThrow('audit unavailable');});
it('receipt contains provenance but neither raw text nor rejected PII',async()=>{approve();await collect(fixture([item(1,'UNTRUSTED_MARKER'),item(2,'person@example.com')]));const receipt=online.database.raw.prepare("SELECT detail FROM online_audit WHERE action='shadow_source_receipt'").get() as {detail:string};expect(receipt.detail).not.toContain('UNTRUSTED_MARKER');expect(receipt.detail).not.toContain('person@example.com');expect(JSON.parse(receipt.detail).sources).toHaveLength(1);});
it('sources feed the actual budgeted router only through an explicitly synthetic offline rehearsal',async()=>{
 approve();const sourceReport=await collect(fixture());
 const {default:Database}=await import('better-sqlite3');const {ShadowRuntime}=await import('../v1/shadow-runtime.js');
 const {createDatabase}=await import('../state/database.js');const {ModelRegistry}=await import('../inference/registry.js');
 const {registerBudgetPolicy}=await import('../inference/budget-policy.js');const {runBoundMockShadowInference}=await import('../v1/shadow-router-binding.js');
 const file=path.join(dir,'mock-shadow.db'),start=Date.now();const raw=new Database(file);ShadowRuntime.initialize(raw,start);raw.close();const db=createDatabase(file);
 try{
  const registry=new ModelRegistry(db.raw);registry.initialize();registry.upsert({...registry.get('gpt-5-mini')!,costPer1kInput:0,costPer1kOutput:1000});
  initializeInferencePhase(db.raw,{startsAt:start,endsAt:start+14*86400000,limitCents:6});registerBudgetPolicy(db.raw,{daily_cents:6,hourly_cents:6,session_cents:6,call_cents:6,halted:0,revision:1});
  const sources=sourceReport.sources.slice(0,4).map(({id,excerpt})=>({id,excerpt}));
  const result=await runBoundMockShadowInference(db.raw,{stepId:'shadow_source_pipeline',genesis:Array.from({length:57},(_,i)=>`SECTION ${i+1}: Synthetic principles. `).join('\n'),sources,
   response:{content:JSON.stringify({title:'Synthetic opportunity',hypothesis:'Check demand without assuming profit',sector:'software',sourceIds:sources.map(s=>s.id)}),inputTokens:1,outputTokens:1}});
  expect(result).toMatchObject({mode:'mock-only',realProviderCalls:0,realCostCents:0,simulatedModelCostCents:1,genesisDelivery:{complete:true},phase:{spentCents:1,pendingCents:0}});
  expect(new ShadowRuntime(db.raw).report().candidates[0]).toMatchObject({decision:'hold',expectedNetCents:null,independentSources:0});
 }finally{db.close();}
});

it('existing research runtime uses the mandatory phase gates rather than legacy transport',async()=>{
 online.runtime.enqueue(HORIZON_TOPIC);await online.runtime.tick();
 expect(online.database.raw.prepare('SELECT status FROM online_jobs').get()).toEqual({status:'failed'});
 expect(online.database.raw.prepare('SELECT COUNT(*) n FROM online_requests').get()).toEqual({n:0});
});
it('approved phase uses existing research ingestion with unreviewed provenance and no model costs',async()=>{
 approve();online.runtime.enqueue(HORIZON_TOPIC);await online.runtime.tick();
 expect(online.database.raw.prepare('SELECT status FROM online_jobs').get()).toEqual({status:'done'});
 expect(online.database.raw.prepare("SELECT COUNT(*) n FROM online_audit WHERE action='shadow_source_receipt'").get()).toEqual({n:1});
 expect(inferencePhaseSnapshot(online.database.raw)).toMatchObject({spentCents:0,pendingCents:0});
});
it('partial phase accounting cannot fall back to legacy research',async()=>{
 approve();online.database.raw.exec('DROP TABLE inference_phase_charges');online.runtime.enqueue(HORIZON_TOPIC);await online.runtime.tick();
 expect(online.database.raw.prepare('SELECT status FROM online_jobs').get()).toEqual({status:'failed'});
 expect(online.database.raw.prepare('SELECT COUNT(*) n FROM online_requests').get()).toEqual({n:0});
});


it.each(['hourly','daily'] as const)('allows the final configured %s request and rejects the next',async(period)=>{
 expect(SOURCE_LIMITS).toMatchObject({hourlyRequests:60,dailyRequests:1440,responseBytes:1000000,timeoutMs:15000});
 const db=online.database.raw,limit=period==='hourly'?60:1440;
 // Deterministic SQLite noon clock avoids a midnight-dependent daily test.
 db.function('datetime',{varargs:true},(...args:unknown[])=>args[1]==='-1 hour'?'2026-10-04 11:00:00':'2026-10-04 12:00:00');
 db.function('date',(value:unknown)=>value==='now'?'2026-10-04':String(value).slice(0,10));
 for(let i=0;i<limit-1;i++)db.prepare("INSERT INTO online_requests(source,status,created_at) VALUES('fixture','received',?)").run(period==='daily'?'2026-10-04 09:00:00':'2026-10-04 12:00:00');
 const request=vi.fn<typeof fetch>(async()=>json([]));
 await publicJson(db,'https://hacker-news.firebaseio.com/v0/askstories.json',new AbortController().signal,request);
 await expect(publicJson(db,'https://hacker-news.firebaseio.com/v0/askstories.json',new AbortController().signal,request)).rejects.toThrow('quota');
 expect(request).toHaveBeenCalledTimes(1);
});
