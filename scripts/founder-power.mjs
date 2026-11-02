import fs from 'node:fs';import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function openFounderPower({file,modules=[],caller}){
 const startupAt=new Date().toISOString();
 const startupId=randomUUID(),startupCall='openFounderPower';
 // Fixed labels only: never persist argv, stacks, paths or arbitrary context.
 const startupCaller=['founder-dashboard','maintenance-off'].includes(caller)?caller:'direct-open';
 let previousEnabled=null,previousRevision=null,priorState='unreadable';
 let state={enabled:false,revision:0,changedAt:startupAt,cause:'startup-off'};
 try{
  const history=fs.readFileSync(file,'utf8').trim().split('\n');
  const saved=JSON.parse(history.at(-1));
  if(typeof saved.enabled==='boolean'&&Number.isSafeInteger(saved.revision)&&saved.revision>=0){
   previousEnabled=saved.enabled;previousRevision=saved.revision;priorState='valid';
   const {startRequestId,...previous}=saved;
   let offCause=saved.cause??'startup-off';
   // Older startups overwrote cause while retaining the transition identity.
   // Recover only a matching OFF transition; never borrow from another revision.
   if(!saved.enabled&&offCause==='startup-off'&&typeof saved.changedAt==='string'&&Number.isFinite(Date.parse(saved.changedAt)))for(let i=history.length-2;i>=0;i--){
    let record;try{record=JSON.parse(history[i])}catch{continue}
    if(!record||typeof record!=='object'||Array.isArray(record))continue;
    if(record.enabled===false&&record.revision===saved.revision&&record.changedAt===saved.changedAt&&typeof record.cause==='string'&&record.cause!=='startup-off'){offCause=record.cause;break}
   }
   state={...previous,enabled:false,revision:saved.revision+Number(saved.enabled),changedAt:saved.enabled?startupAt:saved.changedAt,cause:saved.enabled?'startup-off':offCause};
  }
 }catch(error){if(error.code==='ENOENT')priorState='missing';}
 state={...state,startupAt,startupPid:process.pid,startupCall,startupCaller,startupId};
 const write=()=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,JSON.stringify(state)+'\n',{flush:true})};
 write();
 const stop=()=>{const errors=[];for(const m of modules)try{m.stop()}catch{errors.push(m.name)}return errors};
 const auditFile=path.join(path.dirname(file),'power-audit.jsonl');
 const audit=record=>{
  try{if(!fs.lstatSync(auditFile).isFile())throw Error('Audit file rejected');}catch(error){if(error.code!=='ENOENT')throw error;}
  fs.appendFileSync(auditFile,JSON.stringify({schema:'numaron-power-audit-v1',at:new Date().toISOString(),pid:process.pid,...record})+'\n',{flush:true,mode:0o600});
 };
 // Persist OFF before auditing. If auditing fails, initialization aborts OFF;
 // no module starts and the durable state still carries the startup evidence.
 try{audit({at:startupAt,event:'startup-off',startupId,call:startupCall,caller:startupCaller,priorState,previousEnabled,previousRevision,enabled:false,revision:state.revision,transitionCause:state.cause,transitionAt:state.changedAt});}
 catch{throw Error('Numaron bleibt ausgeschaltet: Startprotokoll konnte nicht gespeichert werden.');}
 const snapshot=()=>({enabled:state.enabled,status:state.enabled?'on':'off',revision:state.revision,changedAt:state.changedAt??null,modules:modules.map(m=>({name:m.name,enabled:state.enabled})),liveTradingEnabled:false});
 return {snapshot,isOn:()=>state.enabled,
 reconcile(){if(!state.enabled){stop();return snapshot()}try{for(const m of modules)m.start();return snapshot()}catch{state={...state,enabled:false,revision:state.revision+1,changedAt:new Date().toISOString(),cause:'start-failed'};stop();try{write()}catch{}throw Error('Numaron bleibt ausgeschaltet: Start einer Fähigkeit fehlgeschlagen.')}},
 control(input,context={}){
 if(!input||Object.keys(input).sort().join(',')!=='enabled,revision'||typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.revision))throw Error('Ungültige Ein-/Aus-Aktion.');
 let entry,stopAuditFailed=false;
 if(!input.enabled){
  entry={at:new Date().toISOString(),requestId:randomUUID(),call:'control',caller:context?.route==='/api/power'?'dashboard-api':'internal-control',method:context?.route==='/api/power'?'POST':'control',route:context?.route==='/api/power'?'/api/power':'internal-control',sessionId:typeof context?.sessionId==='string'&&/^[a-f0-9]{32}$/.test(context.sessionId)?context.sessionId:null,requestedRevision:input.revision,previousRevision:state.revision,previousEnabled:state.enabled};
  try{audit({...entry,event:'stop-request'})}catch{stopAuditFailed=true}
 }
 if(input.enabled){
  entry={requestId:randomUUID(),method:context?.route==='/api/power'?'POST':'control',route:context?.route==='/api/power'?'/api/power':'internal-control',sessionId:typeof context?.sessionId==='string'&&/^[a-f0-9]{32}$/.test(context.sessionId)?context.sessionId:null,requestedRevision:input.revision,previousRevision:state.revision,previousEnabled:state.enabled};
  try{audit({...entry,event:'start-request'});}catch{throw Error('Start verweigert: Protokoll konnte nicht gespeichert werden.');}
  if(input.revision!==state.revision){try{audit({...entry,event:'start-result',outcome:'stale-revision',enabled:state.enabled,revision:state.revision});}catch{}throw Error('Betriebszustand geändert. Bitte aktualisieren.');}
 }
 state={enabled:input.enabled,revision:state.revision+1,changedAt:input.enabled?new Date().toISOString():entry.at,cause:input.enabled?'explicit-start-request':'stop-request',...(input.enabled?{startRequestId:entry.requestId}:{stopRequestId:entry.requestId,stopRequestedAt:entry.at,stopPid:process.pid,stopCaller:entry.caller,stopRoute:entry.route,...(stopAuditFailed?{stopAuditFailed:true}:{})})};
 if(!input.enabled){
  const errors=stop();let persisted=true;
  try{write()}catch{persisted=false}
  const {at,...resultEntry}=entry;
  try{audit({...resultEntry,event:'stop-result',outcome:!persisted?'state-write-failed':errors.length?'stop-incomplete':'stopped',enabled:false,revision:state.revision,stopErrorCount:errors.length,requestAuditFailed:stopAuditFailed})}
  catch{state={...state,stopAuditFailed:true};if(persisted)try{write()}catch{persisted=false}}
  if(!persisted)throw Error('Numaron gestoppt; Ausschaltzustand konnte nicht gespeichert werden. Beim Neustart bleibt Numaron aus.');
  if(errors.length)throw Error('Ausgeschaltet; einzelne laufende Dienste konnten den Stopp noch nicht bestätigen.');
  return snapshot()
 }
 let result;
 try{write();result=this.reconcile();}
 catch{if(state.enabled){state={...state,enabled:false};stop();try{write()}catch{}}try{audit({...entry,event:'start-result',outcome:'start-failed',enabled:false,revision:state.revision});}catch{}throw Error('Numaron bleibt ausgeschaltet: Start fehlgeschlagen.');}
 try{audit({...entry,event:'start-result',outcome:'started',enabled:true,revision:state.revision});}
 catch{state={...state,enabled:false,revision:state.revision+1,changedAt:new Date().toISOString(),cause:'audit-failed'};stop();try{write()}catch{}throw Error('Numaron gestoppt: Start-Ergebnis konnte nicht im Protokoll gespeichert werden.');}
 return result;}
 };
}
