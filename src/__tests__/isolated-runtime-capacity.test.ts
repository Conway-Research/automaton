import {afterEach,expect,it} from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {IsolatedRuntimeCapacity} from '../security/isolated-runtime-capacity.js';
import {IsolatedJobLedger,isolatedJobScope,ISOLATED_PROFILE_DIGEST} from '../security/isolated-job-ledger.js';
import {GATE_DOMAINS,registerActionReview,type ActionScope} from '../security/action-gate.js';
import {isProtectedFile} from '../self-mod/code.js';

const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const cleanup of cleanups.splice(0).reverse())cleanup();});
function setup(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-capacity-'));cleanups.push(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const open=(name:string)=>{const db=new Database(path.join(dir,name));cleanups.push(()=>{if(db.open)db.close();});return db;};
  const a=open('shared.db'),b=open('shared.db');return {open,a,b,one:new IsolatedRuntimeCapacity(a),two:new IsolatedRuntimeCapacity(b)};
}
const runtime=()=>`obolus-job-${randomUUID()}`;
const proof=(id:string)=>({runtimeId:id,profileDigest:ISOLATED_PROFILE_DIGEST,observedAt:Date.now(),running:false as const,pid:0 as const,removed:true as const});
function review(db:Database.Database,scope:ActionScope,requirement:string){
  const now=Date.now();registerActionReview(db,{...scope,classification:'INTERNAL',reviewedBy:'synthetic-capacity-fixture',
    evidence:[...GATE_DOMAINS.map(domain=>({domain,requirement:domain as string})),{domain:'security' as const,requirement}].map(item=>({...item,
      jurisdiction:'CH',source:'https://example.invalid/capacity-fixture',sourceDigest:'a'.repeat(64),observedAt:now,expiresAt:now+600000,
      decision:'APPROVED' as const,reason:'Synthetic temporary test only, no production approval'}))},now);
}

it('limits two separate job databases through two connections to a common capacity database',()=>{
  const {open,one,two}=setup();const ids:{runtimeId:string;digest:string}[]=[];
  for(const name of ['one.db','two.db']){
    const db=open(name),ledger=new IsolatedJobLedger(db),input=[{name:'input.txt',text:name}],scope=isolatedJobScope('job-shared-name',input);
    ledger.submit('job-shared-name',input);review(db,scope,'isolated-backend-acceptance');
    ids.push({runtimeId:`obolus-job-${ledger.claim('job-shared-name',input)}`,digest:scope.contextDigest});
  }
  const first=one.reserve(ids[0].runtimeId,ids[0].digest);
  expect(()=>two.reserve(ids[1].runtimeId,ids[1].digest)).toThrow('unavailable');
  first.releaseAfterObservedTermination(proof(ids[0].runtimeId));
  expect(()=>two.reserve(ids[1].runtimeId,ids[1].digest)).not.toThrow();
});
it('preserves the shared hold after connection loss until a separately reviewed reconciliation',()=>{
  const {open,a,b,one}=setup(),id=runtime();one.reserve(id,'a'.repeat(64));a.close();
  const restarted=new IsolatedRuntimeCapacity(open('shared.db'));
  expect(()=>restarted.reserve(runtime(),'b'.repeat(64))).toThrow('unavailable');
  const evidence=proof(id);expect(()=>restarted.reconcileTerminated(id,evidence)).toThrow();
  review(b,restarted.reconciliationScope(id,evidence),'isolated-termination-verification');
  restarted.reconcileTerminated(id,evidence);restarted.reconcileTerminated(id,evidence);
  expect(()=>restarted.reserve(runtime(),'b'.repeat(64))).not.toThrow();
  expect(b.prepare("SELECT count(*) n FROM isolated_capacity_audit WHERE event='released'").get()).toEqual({n:1});
});
it('does not reuse a runtime identity or silently accept conflicting release evidence',()=>{
  const {one,two}=setup(),id=runtime(),lease=one.reserve(id,'a'.repeat(64)),evidence=proof(id);
  expect(()=>two.reserve(id,'a'.repeat(64))).toThrow('already used');
  expect(()=>lease.releaseAfterObservedTermination({...evidence,runtimeId:runtime()})).toThrow();
  expect(()=>lease.releaseAfterObservedTermination({...evidence,observedAt:Date.now()-60001})).toThrow();
  lease.releaseAfterObservedTermination(evidence);lease.releaseAfterObservedTermination(evidence);
  expect(()=>lease.releaseAfterObservedTermination({...evidence,observedAt:evidence.observedAt-1})).toThrow('Conflicting');
  expect(()=>two.reserve(id,'a'.repeat(64))).toThrow('already used');
});
it('rolls back reservation and release when their atomic audits fail',()=>{
  const {a,one,two}=setup();
  a.exec("CREATE TRIGGER fail_capacity BEFORE INSERT ON isolated_capacity_audit BEGIN SELECT RAISE(ABORT,'capacity audit unavailable'); END");
  expect(()=>one.reserve(runtime(),'a'.repeat(64))).toThrow('audit unavailable');
  expect(a.prepare('SELECT count(*) n FROM isolated_runtime_capacity').get()).toEqual({n:0});
  a.exec('DROP TRIGGER fail_capacity');const id=runtime(),lease=two.reserve(id,'a'.repeat(64));
  a.exec("CREATE TRIGGER fail_capacity BEFORE INSERT ON isolated_capacity_audit BEGIN SELECT RAISE(ABORT,'capacity audit unavailable'); END");
  expect(()=>lease.releaseAfterObservedTermination(proof(id))).toThrow('audit unavailable');
  expect(a.prepare('SELECT state FROM isolated_runtime_capacity').get()).toEqual({state:'held'});
});
it('rejects ephemeral stores and an uncommitted enclosing transaction',()=>{
  const memory=new Database(':memory:');try{expect(()=>new IsolatedRuntimeCapacity(memory)).toThrow('Persistent');}finally{memory.close();}
  const {a,one}=setup();a.transaction(()=>{expect(()=>one.reserve(runtime(),'a'.repeat(64))).toThrow('commit before dispatch');})();
  expect(a.prepare('SELECT count(*) n FROM isolated_runtime_capacity').get()).toEqual({n:0});
});
it('protects the capacity source and its audit',()=>{
  const {a,one}=setup();one.reserve(runtime(),'a'.repeat(64));
  expect(()=>a.prepare('DELETE FROM isolated_capacity_audit').run()).toThrow('immutable');
  for(const extension of ['ts','js','d.ts'])expect(isProtectedFile(`src/security/isolated-runtime-capacity.${extension}`)).toBe(true);
});
