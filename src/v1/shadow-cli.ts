import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {ShadowRuntime} from './shadow-runtime.js';
import {RESEARCH_SECTORS,type ResearchDossier} from '../revenue/research.js';

/** Fixed mock generator; never calls a model or fetches its synthetic source URL. */
export function mockShadowDossier(index:number,at:number):ResearchDossier{
 if(!Number.isSafeInteger(index)||index<0||index>=112)throw Error('Invalid mock index');
 const id=`shadow_candidate_${index}`;
 return {opportunities:[{id,title:`Synthetic opportunity ${index}`,sector:RESEARCH_SECTORS[index%RESEARCH_SECTORS.length],
  hypothesis:'Mock customer problem; needs actual independent investigation',forecastState:'unknown',
  forecast:{revenueCents:0,costCents:0,probability:0,days:1,validationBudgetCents:0}}],
  evidence:[{id:`shadow_evidence_${index}`,opportunityId:id,sourceUrl:`https://example.invalid/mock/${index}`,
   observedAt:new Date(at).toISOString(),kind:'request',excerpt:'Synthetic problem indicator, not actual demand',provenance:'synthetic',reviewedBy:null}]};
}
/** Deliberately no database/provider/command parameter: new temporary DB only. */
export function runMockShadowDemo(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-shadow-controller-'));
 const file=path.join(directory,'shadow.db');let db=new Database(file);
 try{
  const start=Date.now();let runtime=ShadowRuntime.initialize(db,start);
  for(let day=0;day<14;day++){
   const at=start+day*86400000;
   if(day===7){runtime.controlPhase('pause',at);db.close();db=new Database(file);runtime=new ShadowRuntime(db);runtime.controlPhase('resume',at);}
   runtime.claim(`shadow_day_${day}`,at);runtime.complete(`shadow_day_${day}`,mockShadowDossier(day,at),at);
  }
  return {...runtime.report(start+14*86400000),accelerated:true,elapsedRealDays:0,temporaryWorkspaceRemovedOnExit:true};
 }finally{if(db.open)db.close();fs.rmSync(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==2)throw Error('This offline command accepts no options');process.stdout.write(JSON.stringify(runMockShadowDemo(),null,2)+'\n');}
 catch{process.stderr.write('Offline shadow verification failed; no live action started.\n');process.exitCode=1;}
}
