import fs from 'node:fs';import path from 'node:path';
import Database from 'better-sqlite3';import {createHash} from 'node:crypto';
const targets=['firecrawl-exa-research-82967','firecrawl-selected-4289d912b459e10a2bfce5dee00fc0ed'];
// This observer never enqueues work, contacts providers, or changes budget/controller state.
export function createLocalTaskFollowup({file,controllerFile,isEnabled,readControl,taskIds=targets,notBefore=Date.parse('2026-10-19T16:00:25Z'),now=Date.now}){
 const identity=JSON.stringify({taskIds,notBefore});let report=null;
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.schema==='local-task-followup-v1'&&saved.identity===identity&&Number.isFinite(saved.checkedAt)&&Number.isFinite(saved.nextCheckAt)&&Array.isArray(saved.tasks)&&saved.tasks.length===taskIds.length&&saved.tasks.every((t,i)=>t.id===taskIds[i])&&['completed','pending','attention'].includes(saved.status)&& (saved.status!=='completed'||saved.tasks.every(t=>t.state==='completed')))report=saved;}catch{}
 const active=()=>isEnabled()===true&&readControl().status==='running';
 const snapshot=()=>({...report,schema:'local-task-followup-v1',notBefore,taskIds:[...taskIds],status:!active()?'paused':report?.status??'scheduled',nextCheckAt:report?.nextCheckAt??notBefore});
 function tick(){
  if(!active()||report?.status==='completed'||now()<Math.max(notBefore,report?.nextCheckAt??0))return;
  const checkedAt=now();let db,tasks,error;
  try{db=new Database(controllerFile,{readonly:true,fileMustExist:true});tasks=taskIds.map(id=>{
   if(!active())throw Error('OFF');
   const row=db.prepare('SELECT status,reason,attempts,result,digest,next_retry_ms FROM founder_jobs WHERE id=?').get(id);
   if(!row)return {id,state:'missing'};
   const task={id,status:row.status,attempts:row.attempts,reason:row.reason,nextRetryAt:row.next_retry_ms,state:['blocked','failed','cancelled'].includes(row.status)?'attention':'pending'};
   if(row.status==='done'){
    let result;try{result=JSON.parse(row.result);}catch{}
    const sources=result?.sources;
    const valid=row.result&&createHash('sha256').update(row.result).digest('hex')===row.digest&&result?.kind==='firecrawl-research'&&Array.isArray(sources)&&sources.length>0&&sources.every(s=>{try{return new URL(s.url).protocol==='https:'&&typeof s.claim==='string'&&s.claim.trim().length>0&&/^[a-f0-9]{64}$/i.test(s.digest);}catch{return false;}});
    task.state=valid?'completed':'invalid-evidence';if(valid)task.sources=sources.slice(0,10).map(s=>({url:s.url,digest:s.digest}));
   }return task;
  });}catch(e){error=String(e.message).slice(0,300);tasks=taskIds.map(id=>({id,state:'unavailable'}));}finally{db?.close();}
  if(!active())return;
  const next={schema:'local-task-followup-v1',identity,checkedAt,nextCheckAt:checkedAt+60000,status:error||tasks.some(t=>['attention','missing','invalid-evidence'].includes(t.state))?'attention':tasks.every(t=>t.state==='completed')?'completed':'pending',tasks,...(error?{error}:{})};
  const temporary=file+'.tmp';try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(temporary,JSON.stringify(next,null,2)+'\n',{encoding:'utf8',mode:0o600});if(!active()){fs.rmSync(temporary,{force:true});return;}fs.renameSync(temporary,file);report=next;}catch(e){report={...next,status:'attention',error:'Nachprüfungsbericht konnte nicht gespeichert werden.'};try{fs.rmSync(temporary,{force:true});}catch{}}
 }
 return {tick,snapshot};
}
