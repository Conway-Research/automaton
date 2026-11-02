import path from 'node:path';import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {founderPaperStatus,startFounderPaper,founderPaperTick,assertFounderPaperPath} from './founder-paper.js';
import {OnlineRuntime} from '../online/runtime.js';
import {searchAvailability} from '../online/search-runner.js';
import {withPaperStatusSnapshot} from '../security/paper-status-snapshot.js';
export async function founderPaperCommand(args:string[]){
 if(args.length!==3||!['status','start','resume','pause','stop','emergency'].includes(args[0])||args[1]!=='--database')throw Error('Use status|start|resume|pause|stop|emergency --database prepared-paper-copy.db');
 const {file}=assertFounderPaperPath(args[2]);
 if(args[0]==='status'){
  const result=withPaperStatusSnapshot(file,db=>({ ...founderPaperStatus(db,file),searchProviders:searchAvailability(db),readOnly:true,startsController:false,
   source:'closed-file-memory-snapshot',limitation:'No live database attachment; WAL/SHM/journal or WAL-mode files are refused.' }));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');return;
 }
 const db=new Database(file,{fileMustExist:true,readonly:args[0]==='status'});let running=true,started=false;
 const interrupt=()=>{running=false;try{if(db.open&&new OnlineRuntime(db).status==='running')new OnlineRuntime(db).control('pause');}catch{/* The finalizer also closes this controller; no new work follows. */}};
 try{
  founderPaperStatus(db);
  if(['pause','stop','emergency'].includes(args[0])){new OnlineRuntime(db).control(args[0] as 'pause'|'stop'|'emergency');return;}
  startFounderPaper(db,args[0]==='resume');started=true;process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  process.stdout.write('Founder paper research started: no paid models, targets, submissions or financial actions.\n');
  while(running){await founderPaperTick(db);const state=founderPaperStatus(db);process.stdout.write(JSON.stringify({at:new Date().toISOString(),status:state.status,phaseEndsAt:state.phase?.ends_ms,liveReady:false})+'\n');if(state.status!=='running')break;await new Promise(r=>{const timer=setInterval(()=>{if(!running){clearInterval(timer);r(undefined);}},250);setTimeout(()=>{clearInterval(timer);r(undefined);},60000).unref();});}
 }finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);if(db.open){if(started&&(db.prepare('SELECT status FROM online_control WHERE id=1').get() as {status:string}).status==='running')new OnlineRuntime(db).control('pause');db.close();}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))founderPaperCommand(process.argv.slice(2)).catch(error=>{
 const code=error instanceof Error&&/^PAPER_STATUS_(CLOSED_SNAPSHOT_REQUIRED|INVALID_SNAPSHOT|SNAPSHOT_CHANGED)$/.test(error.message)?error.message:null;
 process.stderr.write(code?`${code}: Status verweigert. Eine separat vorbereitete, abgeschlossene Rollback-Snapshotdatei ohne WAL/SHM/Journal ist erforderlich. Kein Controller wurde verändert.\n`:
  'Founder paper command blocked or failed; inspect local status and reviewed prerequisites. No live permission granted.\n');process.exitCode=1;
});
