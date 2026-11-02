import type {Database} from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {ResearchStore,type ResearchDossier} from '../revenue/research.js';
import {assertNoKnownSecrets} from '../observability/redaction.js';
import {editionAdmission} from '../revenue/edition-policy.js';

const DAY=86400000;
// Work limits for the offline mock harness, NOT money or Founder spend grants.
const POLICY=JSON.stringify({edition:'founder',mode:'mock-only',days:14,dailySteps:8,totalSteps:112,realCostCents:0});
type Control={started:number;deadline:number;last_time:number;status:string;policy:string};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const validTime=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=8640000000000000-14*DAY;

/** Trusted local mock controller. It has no execution, network, model or broker
 * adapters. Caller-supplied times are for deterministic tests; no CLI time override.
 * Only initialize on a NEW EMPTY temporary database, never the Founder DB. */
export class ShadowRuntime {
 constructor(private readonly db:Database){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shadow_control'").get())throw Error('Initialized shadow workspace required');
  this.control();
 }
 static initialize(db:Database,now=Date.now()){
  if(!validTime(now))throw Error('Invalid shadow time');
  db.transaction(()=>{
   if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' LIMIT 1").get())throw Error('New empty temporary shadow database required');
   db.exec(`CREATE TABLE shadow_control(id INTEGER PRIMARY KEY CHECK(id=1),started INTEGER NOT NULL,deadline INTEGER NOT NULL,last_time INTEGER NOT NULL,status TEXT NOT NULL,policy TEXT NOT NULL);
    CREATE TABLE shadow_steps(id TEXT PRIMARY KEY,day INTEGER NOT NULL,status TEXT NOT NULL,result_digest TEXT,created_ms INTEGER NOT NULL);
    CREATE TABLE shadow_audit(id INTEGER PRIMARY KEY,action TEXT NOT NULL,at_ms INTEGER NOT NULL);
    CREATE TRIGGER shadow_audit_no_update BEFORE UPDATE ON shadow_audit BEGIN SELECT RAISE(ABORT,'Immutable shadow audit'); END;
    CREATE TRIGGER shadow_audit_no_delete BEFORE DELETE ON shadow_audit BEGIN SELECT RAISE(ABORT,'Immutable shadow audit'); END;
    CREATE TRIGGER shadow_policy_no_update BEFORE UPDATE OF started,deadline,policy ON shadow_control BEGIN SELECT RAISE(ABORT,'Immutable shadow phase'); END;`);
   db.prepare("INSERT INTO shadow_control VALUES(1,?,?,?,'running',?)").run(now,now+14*DAY,now,POLICY);
   new ResearchStore(db);
   db.prepare('INSERT INTO shadow_audit(action,at_ms) VALUES(?,?)').run('initialize_mock_only',now);
  }).immediate();
  return new ShadowRuntime(db);
 }
 private control():Control{
  const c=this.db.prepare('SELECT * FROM shadow_control WHERE id=1').get() as Control|undefined;
  if(!c||c.policy!==POLICY||!validTime(c.started)||c.deadline!==c.started+14*DAY||!validTime(c.last_time)||c.last_time<c.started||!['running','paused','stopped','emergency','expired'].includes(c.status))throw Error('Invalid shadow control');
  return c;
 }
 private at(now:number){const c=this.control();if(!validTime(now)||now<c.last_time)throw Error('Shadow clock rollback');return c;}
 // Commit observed time BEFORE an action transaction that may be rejected.
 // A restart/clock rollback cannot reopen an already observed expired phase.
 private observe(now:number){this.db.transaction(()=>{
  const c=this.at(now);
  if(now>c.last_time){this.audit('clock_observed',now);}
  if(now>=c.deadline&&['running','paused'].includes(c.status)){
   this.db.prepare("UPDATE shadow_control SET status='expired' WHERE id=1").run();this.audit('expired',now);
  }
 }).immediate();}
 private audit(action:string,now:number){this.db.prepare('INSERT INTO shadow_audit(action,at_ms) VALUES(?,?)').run(action,now);this.db.prepare('UPDATE shadow_control SET last_time=? WHERE id=1').run(now);}
 private admission(now:number){
  const c=this.at(now);if(now>=c.deadline)throw Error('Shadow phase expired');
  if(c.status!=='running')throw Error('Shadow phase not running');
  if(!editionAdmission({edition:'founder',commercialFeatures:[],permissions:['research','paper_trading'],emergencyStop:false},'research').allowed)throw Error('Founder admission denied');
  return c;
 }
 claim(id:string,now=Date.now()){
  if(typeof id!=='string'||!/^shadow_[A-Za-z0-9_-]{1,60}$/.test(id))throw Error('Invalid shadow step ID');
  this.observe(now);
  return this.db.transaction(()=>{
   const c=this.admission(now),day=Math.floor((now-c.started)/DAY);
   if(this.db.prepare('SELECT 1 FROM shadow_steps WHERE id=?').get(id))throw Error('Existing shadow step; never retry automatically');
   if(this.db.prepare("SELECT 1 FROM shadow_steps WHERE status='pending' LIMIT 1").get())throw Error('Unresolved shadow step');
   const counts=this.db.prepare('SELECT COUNT(*) total,COALESCE(SUM(day=?),0) daily FROM shadow_steps').get(day) as {total:number;daily:number};
   if(counts.total>=112||counts.daily>=8)throw Error('Shadow work budget exhausted');
   this.db.prepare("INSERT INTO shadow_steps VALUES(?,?,'pending',NULL,?)").run(id,day,now);this.audit('claim',now);
   return {id,day,mode:'mock-only',realCostCents:0};
  }).immediate();
 }
 complete(id:string,dossier:ResearchDossier,now=Date.now()){
  const payload=JSON.stringify(dossier);
  if(typeof payload!=='string'||Buffer.byteLength(payload)>32768)throw Error('Bounded mock dossier required');
  assertNoKnownSecrets(dossier);
  const data=JSON.parse(payload) as ResearchDossier;
  if(!Array.isArray(data.opportunities)||!Array.isArray(data.evidence)||data.opportunities.length>1||data.evidence.length>4||
    data.opportunities.some(o=>o.forecastState!=='unknown')||data.evidence.some(e=>e.provenance!=='synthetic'||e.reviewedBy!==null))throw Error('Mock-only unknown forecasts and synthetic evidence required');
  this.observe(now);
  return this.db.transaction(()=>{
   this.at(now);
   const row=this.db.prepare('SELECT status,result_digest FROM shadow_steps WHERE id=?').get(id) as {status:string;result_digest:string|null}|undefined;
   if(row?.status==='complete'){if(row.result_digest!==hash(payload))throw Error('Conflicting shadow result');return {duplicate:true};}
   this.admission(now);
   if(row?.status!=='pending')throw Error('Pending shadow step required');
   new ResearchStore(this.db).import(data);
   this.db.prepare("UPDATE shadow_steps SET status='complete',result_digest=? WHERE id=?").run(hash(payload),id);this.audit('complete',now);
   return {duplicate:false};
  }).immediate();
 }
 /** Trusted explicit recovery only; retains failed attempt and consumed work slot. */
 abandonMockStep(id:string,now=Date.now()){
  this.observe(now);
  this.db.transaction(()=>{this.at(now);const r=this.db.prepare("UPDATE shadow_steps SET status='abandoned' WHERE id=? AND status='pending'").run(id);if(r.changes!==1)throw Error('Pending mock step required');this.audit('abandon_mock_step',now);}).immediate();
 }
 controlPhase(action:'pause'|'resume'|'stop'|'emergency',now=Date.now()){
  this.observe(now);
  this.db.transaction(()=>{
   if(!['pause','resume','stop','emergency'].includes(action))throw Error('Invalid shadow action');
   const c=this.at(now);
   if(action==='resume'&&(c.status!=='paused'||now>=c.deadline||this.db.prepare("SELECT 1 FROM shadow_steps WHERE status='pending'").get()))throw Error('Shadow resume denied');
   if(['stopped','emergency','expired'].includes(c.status))throw Error('Terminal shadow stop');
   const status={pause:'paused',resume:'running',stop:'stopped',emergency:'emergency'}[action];
   this.db.prepare('UPDATE shadow_control SET status=? WHERE id=1').run(status);this.audit(action,now);
  }).immediate();
 }
 report(now=Date.now()){
  this.observe(now);
  return this.db.transaction(()=>{
   const c=this.at(now),ranked=new ResearchStore(this.db).rank(now);
   return {edition:'founder',mode:'mock-only',startedAt:c.started,endsAt:c.deadline,status:now>=c.deadline?'expired':c.status,
    days:this.db.prepare("SELECT day,COUNT(*) attempts,SUM(status='complete') completed,SUM(status='pending') unresolved,SUM(status='abandoned') abandoned FROM shadow_steps GROUP BY day ORDER BY day").all(),
    candidates:ranked.map(r=>({id:r.id,sector:r.sector,decision:r.decision,independentSources:r.independentSources,expectedNetCents:r.forecastNetCents})),
    realCostCents:0,realTradingCapitalChf:0,brokerActionsChf:0,liveReady:false,productionAccepted:false,
    limitation:'Synthetic model/source outputs only; no real research, customer evidence, profit or autonomous live cycle. Stop and work budgets survive reopening. No paid-provider adapter exists.'};
  })();
 }
}
