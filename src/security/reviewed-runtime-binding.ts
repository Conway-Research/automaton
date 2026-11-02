import fs from 'node:fs';
import path from 'node:path';
import type {Database} from 'better-sqlite3';
import {actionContextDigest,assertActionGate,type ActionScope} from './action-gate.js';
import {IsolatedRuntimeCapacity} from './isolated-runtime-capacity.js';
import {IsolatedJobLedger,type IsolatedTextFile} from './isolated-job-ledger.js';
import {IsolatedJobSupervisor} from './isolated-job-supervisor.js';
import {createIsolatedPodmanFixture} from './isolated-podman-fixture.js';

const schemaNames=['isolated_runtime_capacity','isolated_runtime_one_slot','isolated_capacity_audit','isolated_capacity_audit_no_update','isolated_capacity_audit_no_delete'];
export interface CapacityIdentity {canonicalPath:string;device:string;inode:string;schemaDigest:string}
/** Trusted control-plane inspection, not an attestation or an agent-supplied path.
 * Provisioning is deliberately separate: this code never creates a missing DB. */
export function inspectCapacityIdentity(db:Database):CapacityIdentity {
  if(!db.open||!path.isAbsolute(db.name)||!fs.existsSync(db.name)||fs.lstatSync(db.name).isSymbolicLink())
    throw Error('Existing durable capacity file required');
  const canonicalPath=fs.realpathSync(db.name),stat=fs.statSync(canonicalPath,{bigint:true});
  if(!stat.isFile()||stat.ino===0n)throw Error('Capacity file identity unavailable');
  const schema=schemaNames.map(name=>{
    const row=db.prepare('SELECT type,sql FROM sqlite_master WHERE name=?').get(name) as {type:string;sql:string}|undefined;
    if(!row)throw Error('Capacity schema missing');return {name,...row};
  });
  return {canonicalPath,device:String(stat.dev),inode:String(stat.ino),schemaDigest:actionContextDigest(schema)};
}
export function capacityBindingScope(identity:CapacityIdentity):ActionScope {
  if(!identity||Object.keys(identity).sort().join(',')!=='canonicalPath,device,inode,schemaDigest'||
    typeof identity.canonicalPath!=='string'||!path.isAbsolute(identity.canonicalPath)||
    typeof identity.device!=='string'||typeof identity.inode!=='string'||typeof identity.schemaDigest!=='string'||
    !/^[0-9]+$/.test(identity.device)||!/^[1-9][0-9]*$/.test(identity.inode)||!/^[a-f0-9]{64}$/.test(identity.schemaDigest))throw Error('Invalid capacity identity');
  return {activity:'runtime-capacity-binding',component:'bounded-product-check',dataClass:'INTERNAL',contextDigest:actionContextDigest(identity)};
}
const bindings=new WeakMap<object,{db:Database;identity:CapacityIdentity}>();
export interface ReviewedRuntimeBinding {readonly kind:'reviewed-fixture-binding'}
export function bindReviewedRuntime(db:Database,identity:CapacityIdentity):ReviewedRuntimeBinding {
  const bound=Object.freeze({...identity}),handle=Object.freeze({kind:'reviewed-fixture-binding' as const});
  verify(db,bound);bindings.set(handle,{db,identity:bound});return handle;
}
function verify(db:Database,identity:CapacityIdentity,ownTransaction=false){
  const scope=capacityBindingScope(identity);
  if(actionContextDigest(inspectCapacityIdentity(db))!==scope.contextDigest)throw Error('Capacity identity mismatch');
  if((db.inTransaction&&!ownTransaction)||db.pragma('quick_check',{simple:true})!=='ok'||Number(db.pragma('synchronous',{simple:true}))<2)
    throw Error('Capacity durability or integrity unavailable');
  // Refuse absent/altered schema rather than repairing or creating it at admission.
  for(const name of schemaNames)if(!db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name))throw Error('Capacity schema missing');
  const index=db.prepare("SELECT sql FROM sqlite_master WHERE name='isolated_runtime_one_slot'").get() as {sql:string};
  if(index.sql.replace(/\s+/g,' ').trim()!=="CREATE UNIQUE INDEX isolated_runtime_one_slot ON isolated_runtime_capacity((1)) WHERE state='held'")throw Error('Capacity index mismatch');
  assertActionGate(db,scope,Date.now(),['shared-capacity-deployment']);
}
export function assertReviewedRuntime(binding:ReviewedRuntimeBinding):void {
  const state=bindings.get(binding);if(!state)throw Error('Trusted runtime binding required');verify(state.db,state.identity);
}
/** No selectable executable, command, network, environment, mount or callback. */
export async function runReviewedTextCheck(binding:ReviewedRuntimeBinding,ledger:IsolatedJobLedger,id:string,files:readonly IsolatedTextFile[]){
  assertReviewedRuntime(binding);const state=bindings.get(binding)!;
  class BoundCapacity extends IsolatedRuntimeCapacity {
    protected override assertBoundAdmission(){verify(state.db,state.identity,true);}
    override reserve(runtimeId:string,jobDigest:string){
      assertReviewedRuntime(binding);const lease=super.reserve(runtimeId,jobDigest);
      return Object.freeze({releaseAfterObservedTermination:(evidence:Parameters<typeof lease.releaseAfterObservedTermination>[0])=>{
        assertReviewedRuntime(binding);lease.releaseAfterObservedTermination(evidence);
      }});
    }
  }
  const adapter=createIsolatedPodmanFixture(ledger,new BoundCapacity(state.db,true));
  return new IsolatedJobSupervisor(ledger,adapter).run(id,files);
}
