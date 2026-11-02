import type {AutomatonConfig,ConwayClient} from '../types.js';

export type OperatingMode='local'|'conway';
export function isConwayEndpoint(value:string):boolean {
 try {const host=new URL(value).hostname.toLowerCase();return host==='conway.tech'||host.endsWith('.conway.tech');} catch {return false;}
}
/** Mode selects infrastructure, never permissions, budget or startup acceptance. */
export function operatingMode(config:Pick<AutomatonConfig,'sandboxId'|'operatingMode'>):OperatingMode {
 if(config.operatingMode!==undefined){
  if(config.operatingMode!=='local'&&config.operatingMode!=='conway')throw Error('Invalid operating mode');
  return config.operatingMode;
 }
 const id=config.sandboxId?.trim();
 return !id||id==='undefined'||id==='null'?'local':'conway';
}
export function localOperation(config:Pick<AutomatonConfig,'sandboxId'|'operatingMode'>,client?:Pick<ConwayClient,'isLocal'>){
 return operatingMode(config)==='local'||client?.isLocal===true;
}
export class ConwayUnavailableError extends Error {
 readonly code='CONWAY_UNAVAILABLE_LOCAL';
 constructor(){super('Conway capability unavailable in local mode');this.name='ConwayUnavailableError';}
}
export const CONWAY_ONLY_TOOLS=new Set(['check_credits','topup_credits','transfer_credits','create_sandbox','delete_sandbox','list_sandboxes',
 'spawn_child','fund_child','search_domains','register_domain','manage_dns','send_message','distress_signal','heartbeat_ping']);
/** No callback invocation, credentials or signing in local startup. */
export async function conwayStartupStep<T>(mode:OperatingMode,action:()=>Promise<T>):Promise<T|undefined>{
 if(mode==='local')return undefined;
 if(mode!=='conway')throw Error('Invalid operating mode');
 return action();
}
