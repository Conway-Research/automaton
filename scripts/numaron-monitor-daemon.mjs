import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {openMonitorCoordination,openMonitorState,runMonitorRound,atomicJSON} from './numaron-monitor.mjs';
import {readLocalStatus,readPower} from './numaron-local-status.mjs';import {inspectProcess} from './numaron-process.mjs';import {createMonitorSources} from './numaron-monitor-sources.mjs';
import {publishMonitorOverviewData} from './numaron-monitor-overview.mjs';
import {reconcileMonitorRegister} from './numaron-monitor-register.mjs';
import {nextMonitorDue} from './numaron-monitor-cadence.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),directory=path.join(base,'artifacts/numaron-local-monitor');
fs.mkdirSync(directory,{recursive:true});
const coordination=openMonitorCoordination(path.join(directory,'coordination.db')),self=inspectProcess(process.pid);
if(self.state!=='alive'||!self.birth)throw Error('Monitor process identity unavailable');
const lease=coordination.acquire({owner:'local',pid:process.pid,birth:self.birth});
if(!lease){coordination.close();process.exit(0);}
const state=openMonitorState(path.join(directory,'sources.db'));let config=JSON.parse(fs.readFileSync(path.join(directory,'config.json'),'utf8'));
let closing=false,timer,current,roundPower;
const record={pid:process.pid,birth:self.birth,parentPid:process.ppid,startedAt:new Date().toISOString(),intervalMs:600000,scope:'read-only; existing budgeted runtime handles AI and protected execution',githubDiscoverySchema:'github-time-partitions-v1',githubBatchMaxRequests:4};
atomicJSON(path.join(directory,'process.json'),record);
function health(data){
 atomicJSON(path.join(directory,'health.json'),data);let ugig=null;
 try{const row=state.get('ugig');if(row.status==='succeeded'&&Number.isFinite(row.checkedAt)&&row.evidence){const info=fs.lstatSync(row.evidence);if(info.isFile()&&!info.isSymbolicLink()&&info.size<=8000000){const value=JSON.parse(fs.readFileSync(row.evidence,'utf8')).data;if(value.account?.username==='Obolus'&&Array.isArray(value.applications)&&Array.isArray(value.conversations))ugig={checkedAt:new Date(row.checkedAt).toISOString(),account:'Obolus',status:value.applications.find(a=>a.gig_id==='a9d2b12a-0e59-4a63-842c-daee22f7fdd5')?.status??'not_found',total:value.applications.length,pending:value.applications.filter(a=>a.status==='pending').length,conversations:value.conversations.length};}}}catch{}
 publishMonitorOverviewData(path.join(base,'web/founder/interaction.mjs'),path.join(directory,'source-overview.json'),{checkedAt:data.at,status:data.status,nextAt:data.nextAt,ugig,gaps:state.all().filter(s=>s.status==='access-required').map(s=>s.id)});
}
let due=0;try{due=JSON.parse(fs.readFileSync(path.join(directory,'schedule.json'),'utf8')).nextAt;}catch{}
function active(){coordination.assertLease(lease);if(closing||JSON.stringify(readPower(base))!==roundPower)throw Error('power-unconfirmed');}
function fresh(){const s=readLocalStatus({base});if(!s.confirmedOn||JSON.stringify(s.power)!==roundPower)throw Error('power-unconfirmed');return s;}
async function tick(){
 if(closing||current)return;
 current=(async()=>{
  coordination.assertLease(lease);
  let power;try{power=readPower(base);}catch{health({...record,at:new Date().toISOString(),status:'power-unconfirmed'});return;}
  if(!power.enabled){health({...record,at:new Date().toISOString(),status:'waiting-power',externalReads:false});return;}
  if(Date.now()<due){health({...record,at:new Date().toISOString(),status:'waiting',nextAt:due});return;}
  roundPower=JSON.stringify(power);const status=fresh();health({...record,at:new Date().toISOString(),status:'running',localStatus:status});
  config=reconcileMonitorRegister({base,config:JSON.parse(fs.readFileSync(path.join(directory,'config.json'),'utf8')),state});atomicJSON(path.join(directory,'config.json'),config);
  const sources=createMonitorSources({config});
  const result=await runMonitorRound({coordination,lease,state,sources,assertActive:active,beforeSource:fresh,directory});
  due=nextMonitorDue(sources,state);atomicJSON(path.join(directory,'schedule.json'),{nextAt:due});
  health({...record,at:new Date().toISOString(),status:result.status==='completed'?'waiting':'interrupted',nextAt:due,lastRun:result.runId});
 })().catch(()=>{health({...record,at:new Date().toISOString(),status:'local-status-or-monitor-unavailable'});}).finally(()=>{current=null;});
 await current;
}
async function close(){if(closing)return;closing=true;clearInterval(timer);await current;coordination.release(lease);state.close();coordination.close();}
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>void close());
await tick();timer=setInterval(()=>void tick(),15000);
