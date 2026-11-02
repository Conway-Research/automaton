import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import type {Database} from 'better-sqlite3';
import {OnlineRuntime} from '../online/runtime.js';
import {registerBudgetPolicy,readBudgetPolicy} from '../inference/budget-policy.js';
import {initializeInferencePhase,inferencePhaseSnapshot,observeInferencePhase} from '../inference/phase-budget.js';
import {initializeSourceDiversity,diverseSourceScope,hasSourceDiversity,individualSourceMode,individualSourceReviews} from '../online/source-diversity.js';
import {evaluateActionGate} from '../security/action-gate.js';
import {shadowSourceScope} from '../online/shadow-sources.js';
import {HORIZON_TOPIC} from '../online/discovery.js';
const POLICY=JSON.stringify({edition:'founder',days:14,paidCalls:false,capitalChf:0,brokerActions:false,submission:false,shell:false,liveReady:false,productionAccepted:false});
function temporary(db:Database){const file=fs.realpathSync(db.name),root=fs.realpathSync(os.tmpdir()),rel=path.relative(root,file);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Temporary database copy required');}
/** Founder-authorized dedicated path. A marker binds this workspace, not a
 * production security attestation. Same-user filesystem compromise remains a risk. */
export const FOUNDER_PAPER_DIRECTORY='C:/Users/Patrice/Obolus-Paper';
export function assertFounderPaperPath(input:string):{file:string;workspaceId?:string}{
 const file=fs.realpathSync(input),temp=path.relative(fs.realpathSync(os.tmpdir()),file);
 if(temp&&!temp.startsWith('..')&&!path.isAbsolute(temp))return {file};
 const root=path.resolve(FOUNDER_PAPER_DIRECTORY),expected=path.join(root,'paper.db');
 if(path.resolve(input)!==expected||file!==expected||fs.realpathSync(root)!==root||fs.lstatSync(root).isSymbolicLink()||fs.lstatSync(input).isSymbolicLink())throw Error('Unapproved paper workspace path');
 const markerPath=path.join(root,'workspace.json');if(fs.lstatSync(markerPath).isSymbolicLink()||fs.statSync(markerPath).size>4096)throw Error('Invalid workspace marker');
 const marker=JSON.parse(fs.readFileSync(markerPath,'utf8'));
 if(marker.version!==1||marker.database!==expected||marker.mode!=='founder-paper'||typeof marker.workspaceId!=='string'||!/^[-a-f0-9]{36}$/.test(marker.workspaceId)||Object.keys(marker).sort().join(',')!=='database,mode,version,workspaceId')throw Error('Invalid workspace binding');
 return {file,workspaceId:marker.workspaceId};
}
/** Trusted preparation only, not an agent tool. No config or external I/O. */
export function prepareFounderPaper(db:Database,quarantinedCopy:boolean,sourceMode:'catalogue'|'individual'='catalogue'){
 temporary(db);if(typeof quarantinedCopy!=='boolean')throw Error('Explicit copy classification required');
 if(!['catalogue','individual'].includes(sourceMode)||quarantinedCopy&&sourceMode==='individual')throw Error('Individual sources require a clean paper copy');
 db.transaction(()=>{
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='founder_paper_policy'").get())throw Error('Founder phase already prepared');
  if(!quarantinedCopy){
   const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_version'").all() as {name:string}[];
   if(tables.some(t=>db.prepare('SELECT 1 FROM "'+t.name.replace(/"/g,'""')+'" LIMIT 1').get()))throw Error('Runnable paper copy must contain no prior operating data');
  }
  new OnlineRuntime(db);
  if((db.prepare('SELECT status FROM online_control WHERE id=1').get() as {status:string}).status!=='stopped')throw Error('Stopped copy required');
  registerBudgetPolicy(db,{daily_cents:0,hourly_cents:0,session_cents:0,call_cents:0,halted:1,revision:1});
  db.exec(`CREATE TABLE obolus_paper_capital_stop(id INTEGER PRIMARY KEY CHECK(id=1)); INSERT INTO obolus_paper_capital_stop VALUES(1);
   CREATE TRIGGER paper_capital_no_delete BEFORE DELETE ON obolus_paper_capital_stop BEGIN SELECT RAISE(ABORT,'Paper capital stop retained'); END;
   CREATE TABLE founder_paper_policy(id INTEGER PRIMARY KEY CHECK(id=1),policy TEXT NOT NULL,quarantined INTEGER NOT NULL);
   CREATE TRIGGER founder_paper_no_update BEFORE UPDATE ON founder_paper_policy BEGIN SELECT RAISE(ABORT,'Immutable Founder paper policy'); END;
   CREATE TRIGGER founder_paper_no_delete BEFORE DELETE ON founder_paper_policy BEGIN SELECT RAISE(ABORT,'Founder policy retained'); END;`);
  db.prepare('INSERT INTO founder_paper_policy VALUES(1,?,?)').run(POLICY,Number(quarantinedCopy));
  if(sourceMode==='individual')db.exec(`CREATE TABLE founder_paper_source_mode(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL CHECK(mode='individual-v1'));
   INSERT INTO founder_paper_source_mode VALUES(1,'individual-v1');
   CREATE TRIGGER founder_source_mode_no_update BEFORE UPDATE ON founder_paper_source_mode BEGIN SELECT RAISE(ABORT,'Immutable source mode'); END;
   CREATE TRIGGER founder_source_mode_no_delete BEFORE DELETE ON founder_paper_source_mode BEGIN SELECT RAISE(ABORT,'Source mode retained'); END;`);
  db.prepare("INSERT INTO online_audit(action,detail) VALUES('founder_paper_prepare',?)").run(JSON.stringify({quarantinedCopy,sourceMode,externalSpend:0}));
 }).immediate();
}
export function founderPaperStatus(db:Database,paperPath=db.name){
 const location=assertFounderPaperPath(paperPath);
 if(location.workspaceId){const binding=db.prepare('SELECT workspace_id,database_path FROM founder_paper_workspace WHERE id=1').get() as {workspace_id:string;database_path:string}|undefined;if(!binding||binding.workspace_id!==location.workspaceId||binding.database_path!==location.file)throw Error('Paper database workspace mismatch');}
 const row=db.prepare('SELECT policy,quarantined FROM founder_paper_policy WHERE id=1').get() as {policy:string;quarantined:number}|undefined;
 if(!row||row.policy!==POLICY||![0,1].includes(row.quarantined))throw Error('Invalid Founder paper policy');
 const budget=readBudgetPolicy(db);if(!budget||budget.halted!==1||[budget.daily_cents,budget.hourly_cents,budget.session_cents,budget.call_cents].some(n=>n!==0)||!db.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_paper_capital_stop'").get())throw Error('Paper protections missing or changed');
 const source=evaluateActionGate(db,diverseSourceScope(),Date.now(),['public-source-egress','public-source-terms']);
 const broad=evaluateActionGate(db,shadowSourceScope(HORIZON_TOPIC,true),Date.now(),['public-source-egress','public-source-terms']);
 const individual=individualSourceMode(db),reviews=individual?individualSourceReviews(db):[];
 const phase=inferencePhaseSnapshot(db),status=(db.prepare('SELECT status FROM online_control WHERE id=1').get() as {status:string}).status;
 const sourceBlockers=individual?(reviews.some(r=>r.state==='APPROVED')?[]:['individual_sources:INSUFFICIENT_EVIDENCE']):[...(source.state!=='APPROVED'?[`source_review:${source.state}:${source.reason}`]:[]),...(broad.state!=='APPROVED'?[`broad_source_review:${broad.state}:${broad.reason}`]:[])];
 const now=Date.now();
 const blockers=[...(row.quarantined?['quarantined_operating_copy']:[]),...sourceBlockers,...(status==='emergency'?['emergency_stop']:[]),
  ...(phase&&(phase.halted||now<phase.starts_ms||now>=phase.ends_ms)?['phase_inactive']:[]),
  ...(phase&&now<phase.last_ms?['phase_clock_rollback']:[]),
  ...(phase&&(phase.limit_cents!==0||phase.spentCents!==0||phase.pendingCents!==0)?['paper_phase_cost_mismatch']:[])];
 return {edition:'founder',mode:'paper-public-research',quarantinedCopy:row.quarantined===1,status,
 phase,sourceMode:individual?'individual':'catalogue',individualReviews:reviews,sourceReview:source,broadReview:broad,blockers,
 blockerDetails:blockers.map(code=>({code,explanation:code==='quarantined_operating_copy'?'Diese Kopie ist quarantänisiert und darf nicht gestartet werden.':code==='emergency_stop'?'Der Not-Aus ist aktiv.':code==='phase_inactive'?'Die Paper-Phase ist gestoppt, noch nicht gültig oder abgelaufen.':code==='phase_clock_rollback'?'Die aktuelle Uhr liegt vor dem zuletzt beobachteten Phasenzeitpunkt. Keine automatische Zeitkorrektur.':code==='paper_phase_cost_mismatch'?'Die kostenlose Paper-Phase enthält ein positives Ausgabenlimit, Kosten oder offene Kostenreservierungen. Abgleich erforderlich; keine automatische Freigabe.':'Erforderliche aktuelle und zweckgebundene Quellenfreigabe fehlt.'})),
 canStart:blockers.length===0,requiresResume:phase!==null,
 paidCalls:false,realCapitalChf:0,brokerActions:false,liveReady:false,productionAccepted:false,
 documentedCeilingsOnly:{total90DaysChf:[300,500],broker90DaysChf:75,spendAuthorization:false},
 limitation:'Public evidence collection and deterministic triage only; no validated model reasoning, real target testing or realized profitability'};
}
export function startFounderPaper(db:Database,resume=false){
 const before=founderPaperStatus(db);
 if(before.status==='emergency')throw Error('Emergency stop retained');
 if(before.phase){observeInferencePhase(db);if(inferencePhaseSnapshot(db)!.halted)throw Error('Phase expired or halted');}
 if(!before.canStart)throw Error('Founder source reviews missing, stale or copy quarantined');
 db.transaction(()=>{
  if(!founderPaperStatus(db).canStart)throw Error('Source review changed');
  if(!before.phase){if(resume)throw Error('No phase to resume');const start=Date.now();initializeInferencePhase(db,{startsAt:start,endsAt:start+14*86400000,limitCents:0});}
  else {if(!resume)throw Error('Use resume; phase cannot restart');observeInferencePhase(db);if(inferencePhaseSnapshot(db)!.halted)throw Error('Phase expired or halted');}
  if(!hasSourceDiversity(db))initializeSourceDiversity(db);
  const runtime=new OnlineRuntime(db);if(resume)runtime.recover();if(runtime.status!=='running'){runtime.configureAutonomy(true);runtime.control(runtime.status==='paused'?'resume':'start');}
 }).immediate();
}
/** No injected provider or command; fixed reviewed public-source runtime only. */
export async function founderPaperTick(db:Database){
 const state=founderPaperStatus(db);if(!state.canStart||!state.phase)throw Error('Founder paper admission blocked');
 observeInferencePhase(db);if(inferencePhaseSnapshot(db)!.halted){new OnlineRuntime(db).control('stop');return 0;}
 return new OnlineRuntime(db).autonomousTick();
}
