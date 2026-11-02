import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {OnlineRuntime} from '../online/runtime.js';
import {HORIZON_TOPIC} from '../online/discovery.js';
import {RESEARCH_FRONTIERS,improvementResearchSchedule,proactiveResearchAgenda} from '../revenue/proactive-research.js';
let dir:string,db:ReturnType<typeof createDatabase>,runtime:OnlineRuntime;
const request=vi.fn<typeof fetch>(async input=>new Response(JSON.stringify(String(input).includes('api.github.com')?
 {incomplete_results:false,items:[{html_url:'https://github.com/example/project/issues/1',title:'Delivery validation method',body:'Compare independent validation cases',created_at:new Date().toISOString()}]}:[]),{headers:{'content-type':'application/json'}}));
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-frontier-'));db=createDatabase(path.join(dir,'test.db'));runtime=new OnlineRuntime(db.raw,request);request.mockClear();});
afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
function seedMarket(){for(const topic of ['market one','market two',HORIZON_TOPIC])db.raw.prepare("INSERT INTO online_jobs(topic,opportunity_id,status) VALUES(?,'fixture','done')").run(topic);}
it('starts with existing market research instead of creating a new budget or uncontrolled study',()=>{
 expect(improvementResearchSchedule(db.raw)).toMatchObject({topic:null,reason:'initial_market_research_first'});
 expect(proactiveResearchAgenda().profitabilityProven).toBe(false);
});
it('selects an improvement topic without a failure once initial source research exists',()=>{
 seedMarket();expect(improvementResearchSchedule(db.raw)).toMatchObject({topic:RESEARCH_FRONTIERS[0].topic,reason:'proactive_improvement_research'});
 expect(improvementResearchSchedule(db.raw)).toEqual(improvementResearchSchedule(db.raw));
 expect(db.raw.prepare('SELECT COUNT(*) n FROM online_requests').get()).toEqual({n:0});
});
it('honors shared quota, queued work and 24-hour improvement cooldown',()=>{
 seedMarket();db.raw.prepare("INSERT INTO online_jobs(topic,opportunity_id,status) VALUES(?,'fixture','done')").run(RESEARCH_FRONTIERS[0].topic);
 expect(improvementResearchSchedule(db.raw).reason).toBe('improvement_cooldown');
 db.raw.exec("INSERT INTO online_jobs(topic,opportunity_id,status) VALUES('queued','fixture','pending')");
 expect(improvementResearchSchedule(db.raw).reason).toBe('queued_work');
 db.raw.exec("UPDATE online_jobs SET status='done'; UPDATE online_jobs SET created_at=datetime('now','-25 hours')");
 for(let i=0;i<60;i++)db.raw.exec("INSERT INTO online_requests(source,status) VALUES('fixture','received')");
 expect(improvementResearchSchedule(db.raw).reason).toBe('source_quota');
});
it('does not retry failed method work and limits each topic to two attempts',()=>{
 seedMarket();
 for(const f of RESEARCH_FRONTIERS)for(let i=0;i<2;i++)db.raw.prepare("INSERT INTO online_jobs(topic,opportunity_id,status,created_at) VALUES(?,'fixture',?,datetime('now','-25 hours'))").run(f.topic,i===0?'done':'failed');
 expect(improvementResearchSchedule(db.raw)).toMatchObject({topic:null,reason:'improvement_review_required'});
});
it('requires new market observations before repeating an already studied topic',()=>{
 seedMarket();for(const f of RESEARCH_FRONTIERS)db.raw.prepare("INSERT INTO online_jobs(topic,opportunity_id,status,created_at) VALUES(?,'fixture','done',datetime('now','-25 hours'))").run(f.topic);
 expect(improvementResearchSchedule(db.raw).topic).toBeNull();
 db.raw.exec("INSERT INTO online_jobs(topic,opportunity_id,status) VALUES('new market evidence','fixture','done')");
 expect(improvementResearchSchedule(db.raw)).toMatchObject({topic:RESEARCH_FRONTIERS[0].topic,revisit:true});
});
it('runs autonomous method collection through the existing bounded mocked transport and keeps it out of demand evidence',async()=>{
 seedMarket();runtime.configureAutonomy(true);runtime.control('start');
 expect(await runtime.autonomousTick()).toBeGreaterThan(0);
 const job=db.raw.prepare('SELECT topic,status,opportunity_id FROM online_jobs ORDER BY id DESC LIMIT 1').get() as {topic:string;status:string;opportunity_id:string};
 expect(job.topic).toBe(RESEARCH_FRONTIERS[0].topic);expect(job.status).toBe('done');expect(request).toHaveBeenCalled();
 const evidence=runtime.research.evidence(job.opportunity_id);expect(evidence.length).toBeGreaterThan(0);expect(evidence.every(e=>e.kind==='method')).toBe(true);
 for(const e of evidence)runtime.research.review(e.id,'fixture','accept','Method citation checked only');
 expect(runtime.research.rank().find(r=>r.id===job.opportunity_id)).toMatchObject({decision:'hold',independentSources:0,forecastNetCents:null});
 expect(runtime.research.outcomeLearning(job.opportunity_id).paymentClaims).toEqual([]);
 expect(()=>runtime.draft(job.opportunity_id)).toThrow('not a customer offer');
 expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
});
it('keeps autonomous method collection stopped when paused or disabled',async()=>{
 seedMarket();runtime.configureAutonomy(true);runtime.control('start');runtime.control('pause');
 expect(await runtime.autonomousTick()).toBe(0);expect(request).not.toHaveBeenCalled();
 runtime.configureAutonomy(false);runtime.control('resume');expect(await runtime.autonomousTick()).toBe(0);expect(request).not.toHaveBeenCalled();
});
it('shares autonomous method selection across connections without duplicating a job',async()=>{
 seedMarket();runtime.configureAutonomy(true);runtime.control('start');
 const other=createDatabase(path.join(dir,'test.db')),second=new OnlineRuntime(other.raw,request);
 try{
  await Promise.all([runtime.autonomousTick(),second.autonomousTick()]);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM online_jobs WHERE topic=?').get(RESEARCH_FRONTIERS[0].topic)).toEqual({n:1});
  expect(improvementResearchSchedule(other.raw).reason).toBe('improvement_cooldown');
 }finally{other.close();}
});
