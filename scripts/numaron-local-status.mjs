import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import Database from 'better-sqlite3';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function readPower(base=root){const p=JSON.parse(fs.readFileSync(path.join(base,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(typeof p.enabled!=='boolean'||!Number.isSafeInteger(p.revision)||p.revision<0)throw Error('power-unconfirmed');return p;}
export function evaluateLocalStatus({power,samePower,runtime,processInfo,controller,latestAt,now}){
 const ageMs=now-latestAt,processMatches=processInfo.pid===runtime.pid&&processInfo.ownsPort===true&&processInfo.expectedCommand===true&&Date.parse(processInfo.createdAt)<=Date.parse(runtime.startedAt)&&Date.parse(runtime.startedAt)-Date.parse(processInfo.createdAt)<60000&&Date.parse(power.changedAt)>Date.parse(runtime.startedAt);
 const fresh=Number.isFinite(latestAt)&&ageMs>=0&&ageMs<=120000;
 return {at:new Date(now).toISOString(),method:'local-readonly-process-and-persisted-runtime-evidence',confirmedOn:samePower&&power.enabled===true&&processMatches&&controller.status==='running',power,controller,process:processInfo,lastObservationAt:latestAt,observationAgeMs:ageMs,fresh,samePower,processMatches,statusBasis:'power-controller-current-process',brokerObservationRequiredForOrders:false,dashboardSessionRenewed:false};
}
export function readLocalStatus({base=root,now=Date.now}={}){
 const first=readPower(base),runtime=JSON.parse(fs.readFileSync(path.join(base,'artifacts/founder-integration-20261012/runtime-health.json'),'utf8'));
 if(!Number.isSafeInteger(runtime.pid)||runtime.pid<1)throw Error('runtime-unconfirmed');
 const script=`$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${runtime.pid}'; $l=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 51439 -State Listen -ErrorAction Stop; if(!$p){throw 'Runtime absent'}; [pscustomobject]@{pid=$p.ProcessId;createdAt=$p.CreationDate.ToUniversalTime().ToString('o');expectedCommand=($p.CommandLine -like '*scripts/founder-mt5.mjs*');ownsPort=(@($l.OwningProcess) -contains $p.ProcessId)}|ConvertTo-Json -Compress`;
 const processInfo=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:10000,stdio:['ignore','pipe','ignore']}));
 const query=(file,sql)=>{const db=new Database(path.join(base,file),{readonly:true,fileMustExist:true});try{db.pragma('query_only=ON');return db.prepare(sql).get();}finally{db.close();}};
 const controller=query('artifacts/founder-autonomy-20261013/controller.db','SELECT status,revision,generation FROM founder_control WHERE id=1');
 let observation={latestAt:null};try{observation=query('artifacts/founder-integration-20261012/autonomous-trading-demo-20261016.db',"SELECT MAX(at) AS latestAt FROM trading_events WHERE kind='market-observation'");}catch{}
 const power=readPower(base);
 return evaluateLocalStatus({power,samePower:JSON.stringify(first)===JSON.stringify(power),runtime,processInfo,controller,latestAt:observation.latestAt,now:now()});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(readLocalStatus(),null,2));}catch{console.log(JSON.stringify({at:new Date().toISOString(),confirmedOn:false,status:'local-status-unavailable'}));process.exitCode=1;}}
