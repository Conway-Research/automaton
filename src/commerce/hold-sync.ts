import fs from 'node:fs';
import Database from 'better-sqlite3';
import {syncCommerceHolds} from './attribution.js';

/** Local polling of durable webhook state. No network or agent execution. */
export function startCommerceHoldSync(source:Database.Database,targetFile:string,intervalMs=10000,onHealthChange:(healthy:boolean)=>void=()=>{}) {
  if(!Number.isSafeInteger(intervalMs)||intervalMs<100||intervalMs>60000)throw new Error('Invalid hold sync interval');
  if(fs.realpathSync(source.name).toLowerCase()===fs.realpathSync(targetFile).toLowerCase())throw new Error('Separate agent database required');
  const target=new Database(targetFile,{fileMustExist:true,timeout:100});
  let stopped=false;
  let status:{healthy:boolean;lastSuccessAt:number|null;checked:number;held:number}={healthy:false,lastSuccessAt:null,checked:0,held:0};
  const tick=()=>{
    if(stopped)return;
    const previous=status.healthy;
    try {const result=syncCommerceHolds(source,target);status={healthy:true,lastSuccessAt:Date.now(),...result};}
    catch {status={...status,healthy:false};}
    if(previous!==status.healthy) {try{onHealthChange(status.healthy);}catch{/* Reporting must not stop retries. */}}
  };
  try {
    if(!target.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='revenue_experiments'").get())throw new Error('Existing agent database required');
    // Validate account/schema at startup; later lock failures retry from persisted state.
    syncCommerceHolds(source,target);tick();
    const timer=setInterval(tick,intervalMs);timer.unref();
    return {status:()=>({...status}),close:()=>{if(stopped)return;stopped=true;clearInterval(timer);target.close();}};
  }catch(error){target.close();throw error;}
}
