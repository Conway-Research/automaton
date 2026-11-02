import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createDatabase} from '../state/database.js';
import {prepareFounderPaper,startFounderPaper,founderPaperTick,founderPaperStatus} from '../v1/founder-paper.js';
import {individualSourceScope} from '../online/source-diversity.js';
import {shadowSourceScope} from '../online/shadow-sources.js';
import {GATE_DOMAINS,registerActionReview,type ActionScope} from '../security/action-gate.js';
import {OnlineRuntime} from '../online/runtime.js';
import {researchSchedule} from '../online/scheduler.js';
import {readBudgetPolicy} from '../inference/budget-policy.js';

const transport=vi.hoisted(()=>vi.fn<typeof fetch>());
vi.mock('../online/fixed-public-fetch.js',()=>({fixedPublicFetch:transport}));
let dir:string,db:ReturnType<typeof createDatabase>;
beforeEach(()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-founder-flow-'));
 db=createDatabase(path.join(dir,'synthetic.db'));
 prepareFounderPaper(db.raw,false,'individual');
 transport.mockReset();
});
afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});vi.restoreAllMocks();});
// Synthetic trusted reviews exist only in disposable test databases. These are
// not production source approval, demand evidence or permission to spend.
function approve(scope:ActionScope){
 const now=Date.now(),e={jurisdiction:'CH',source:'https://example.invalid/fixture',sourceDigest:'a'.repeat(64),observedAt:now,expiresAt:now+86400000,decision:'APPROVED' as const,reason:'Synthetic fixture only'};
 registerActionReview(db.raw,{...scope,classification:'PUBLIC',reviewedBy:'fixture',evidence:[...GATE_DOMAINS.map(domain=>({...e,domain,requirement:domain})),...['public-source-egress','public-source-terms'].map(requirement=>({...e,domain:'security' as const,requirement}))]});
}
function response(value:unknown){return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});}

it('Founder tick discovers its own topic but cannot grant that topic a transport review',async()=>{
 approve(individualSourceScope('uk-tenders'));
 transport.mockImplementation(async input=>{
  expect(new URL(String(input)).hostname).toBe('www.find-tender.service.gov.uk');
  return response({releases:[{ocid:'ocds-fixture-1',date:new Date().toISOString(),tender:{title:'Need invoice workflow automation',description:'Looking for invoice workflow automation to replace manual reports.'}}]});
 });
 startFounderPaper(db.raw);
 await founderPaperTick(db.raw);
 expect(transport).toHaveBeenCalledTimes(1);
 const selected=researchSchedule(db.raw);
 expect(selected.reason).toBe('derived_hypothesis');
 expect(selected.topic).toBeTruthy();
 await founderPaperTick(db.raw);
 // A source-specific review cannot silently approve a different transport.
 expect(transport).toHaveBeenCalledTimes(1);
 expect(db.raw.prepare("SELECT status FROM online_jobs ORDER BY id DESC LIMIT 1").get()).toEqual({status:'failed'});
 expect(readBudgetPolicy(db.raw)).toMatchObject({halted:1,daily_cents:0,call_cents:0});
 expect(founderPaperStatus(db.raw)).toMatchObject({liveReady:false,productionAccepted:false,realCapitalChf:0});
});

it('a separately reviewed follow-up creates only a private evidence-bound draft and survives restart',async()=>{
 approve(individualSourceScope('uk-tenders'));
 transport.mockImplementation(async input=>{
  const url=String(input),date=new Date().toISOString();
  if(url.includes('find-tender'))return response({releases:[{ocid:'ocds-fixture-2',date,tender:{title:'Need invoice workflow automation',description:'Looking for invoice workflow automation to replace manual reports.'}}]});
  if(url.includes('api.github.com'))return response({incomplete_results:false,items:[{html_url:'https://github.com/example/synthetic/issues/1',title:'Need invoice workflow automation',body:'Looking for invoice workflow automation. Willing to pay for a solution.',created_at:date}]});
  if(url.includes('askstories'))return response([42]);
  if(url.includes('/item/42'))return response({type:'story',title:'Need invoice workflow automation',text:'Looking for invoice workflow automation. Willing to pay for a solution.',time:Math.floor(Date.now()/1000)});
  throw Error('Unexpected fixture destination');
 });
 startFounderPaper(db.raw);await founderPaperTick(db.raw);
 const topic=researchSchedule(db.raw).topic!;
 approve(shadowSourceScope(topic,false));
 await founderPaperTick(db.raw);await founderPaperTick(db.raw);
 const drafts=db.raw.prepare('SELECT digest,payload FROM online_drafts').all() as {digest:string;payload:string}[];
 expect(drafts).toHaveLength(1);
 expect(JSON.parse(drafts[0].payload)).toMatchObject({state:'private-draft',publication:'Not authorised or performed',plannedExperimentId:null});
 expect(new OnlineRuntime(db.raw).research.rank().every(o=>o.decision!=='validate')).toBe(true);
 const runtime=new OnlineRuntime(db.raw);runtime.control('pause');
 const count=transport.mock.calls.length;
 await founderPaperTick(db.raw);expect(transport).toHaveBeenCalledTimes(count);
 db.close();db=createDatabase(path.join(dir,'synthetic.db'));startFounderPaper(db.raw,true);
 await founderPaperTick(db.raw);
 expect(db.raw.prepare('SELECT digest FROM online_drafts').all()).toEqual([{digest:drafts[0].digest}]);
 new OnlineRuntime(db.raw).control('emergency');
 await expect(founderPaperTick(db.raw)).rejects.toThrow();
 expect(()=>startFounderPaper(db.raw,true)).toThrow();
 expect(transport).toHaveBeenCalledTimes(count);
});
