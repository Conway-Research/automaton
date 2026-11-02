import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {watchFounderStartup} from './founder-supervisor-state.mjs';
import {recordSupervisorEvent} from './founder-supervisor-events.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'artifacts/founder-integration-20261012');
const config=JSON.parse(fs.readFileSync(path.join(directory,'launch-config.json'),'utf8'));
if(!Array.isArray(config.args)||config.args.length!==6||config.args.some(v=>typeof v!=='string'||v.includes('\0')))throw Error('Invalid local launch configuration');
const log=fs.openSync(path.join(directory,'service.log'),'a');
let child,stopping=false,restarts=0,timer,disposeStartup,lastStatus;
function event(kind,detail={}){try{recordSupervisorEvent(directory,kind,{supervisorPid:process.pid,childPid:child?.pid,restarts,...detail});}catch{try{fs.writeSync(log,'Supervisor diagnostic write failed\n');}catch{}}}
function state(status,detail={}){lastStatus=status;event(status,detail);fs.writeFileSync(path.join(directory,'service-status.json'),JSON.stringify({at:new Date().toISOString(),status,supervisorPid:process.pid,childPid:child?.pid,restarts,url:'http://127.0.0.1:51439',paidExecution:'See authenticated controller budget and capabilities',...detail},null,2));}
process.on('uncaughtExceptionMonitor',error=>event('uncaught-exception',{reason:error?.code??'unclassified'}));
process.once('exit',code=>event('supervisor-exit',{code}));
function launch(){
 const startedAt=Date.now();
 child=spawn(process.execPath,['--import','tsx','scripts/founder-mt5.mjs',...config.args],{cwd:root,windowsHide:true,stdio:['ignore',log,log,'ipc']});
 state('starting');
 disposeStartup=watchFounderStartup({child,onState:state,healthMatches:pid=>{const h=JSON.parse(fs.readFileSync(path.join(directory,'runtime-health.json'),'utf8'));const at=Date.parse(h.startedAt);return h.pid===pid&&Number.isFinite(at)&&at>=startedAt&&at<=Date.now();},canStop:()=>{const p=JSON.parse(fs.readFileSync(path.join(directory,'power-state.jsonl'),'utf8').trim().split('\n').at(-1));return p.enabled===false;}});
 child.once('error',error=>{disposeStartup?.();state('launch-failed',{reason:typeof error.code==='string'?error.code:'spawn-error'});});
 child.once('exit',(code,signal)=>{
  event('child-exit',{code,signal});
  disposeStartup?.();
  if(stopping){state('stopped');return;}
  if(lastStatus==='startup-timeout'){state('needs-attention',{reason:'startup-timeout'});return;}
  if(code===0){state('stopped');return;}
  if(++restarts>5){state('needs-attention');return;}
  state('restarting');timer=setTimeout(launch,Math.min(30000,2000*restarts));
 });
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{event('stop-signal',{signal});stopping=true;clearTimeout(timer);disposeStartup?.();child?.kill();});
launch();
