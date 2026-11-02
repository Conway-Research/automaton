import {createHash,randomUUID} from 'node:crypto';
import type {Database} from 'better-sqlite3';
import {assertActionGate,type ActionScope} from './action-gate.js';
import {ISOLATED_PROFILE_DIGEST,type IsolatedTerminationEvidence} from './isolated-job-ledger.js';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
interface Row {runtime_id:string;job_digest:string;capability_hash:string;state:'held'|'released';proof_hash:string|null}
export interface IsolatedCapacityLease {releaseAfterObservedTermination(evidence:IsolatedTerminationEvidence):void}

/** Trusted deployment must supply ONE shared durable DB for all adapters on the
 * runtime. Separate stores do not impose a host-wide limit. No expiry, automatic
 * restart release or agent tool exists; unknown execution retains the slot. */
export class IsolatedRuntimeCapacity {
  constructor(private readonly db:Database,existingOnly=false){
    if(!db.name||db.name===':memory:')throw Error('Persistent shared capacity database required');
    if(existingOnly){
      for(const name of ['isolated_runtime_capacity','isolated_runtime_one_slot','isolated_capacity_audit','isolated_capacity_audit_no_update','isolated_capacity_audit_no_delete'])
        if(!db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name))throw Error('Existing capacity schema required');
      return;
    }
    db.exec(`CREATE TABLE IF NOT EXISTS isolated_runtime_capacity (
      runtime_id TEXT PRIMARY KEY,job_digest TEXT NOT NULL,capability_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('held','released')),proof_hash TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS isolated_runtime_one_slot ON isolated_runtime_capacity((1)) WHERE state='held';
      CREATE TABLE IF NOT EXISTS isolated_capacity_audit (
      seq INTEGER PRIMARY KEY,runtime_id TEXT NOT NULL,event TEXT NOT NULL,created_ms INTEGER NOT NULL);
      CREATE TRIGGER IF NOT EXISTS isolated_capacity_audit_no_update BEFORE UPDATE ON isolated_capacity_audit
      BEGIN SELECT RAISE(ABORT,'Capacity audit immutable'); END;
      CREATE TRIGGER IF NOT EXISTS isolated_capacity_audit_no_delete BEFORE DELETE ON isolated_capacity_audit
      BEGIN SELECT RAISE(ABORT,'Capacity audit immutable'); END;`);
  }
  private audit(id:string,event:string){this.db.prepare('INSERT INTO isolated_capacity_audit(runtime_id,event,created_ms) VALUES(?,?,?)').run(id,event,Date.now());}
  private row(id:string){return this.db.prepare('SELECT * FROM isolated_runtime_capacity WHERE runtime_id=?').get(id) as Row|undefined;}
  /** Trusted bindings revalidate inside the same writer transaction. */
  protected assertBoundAdmission():void {}
  reserve(runtimeId:string,jobDigest:string):IsolatedCapacityLease {
    if(this.db.inTransaction)throw Error('Shared capacity must commit before dispatch');
    if(typeof runtimeId!=='string'||typeof jobDigest!=='string'||
      !/^obolus-job-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runtimeId)||
      !/^[a-f0-9]{64}$/.test(jobDigest))throw Error('Invalid shared capacity request');
    const capability=randomUUID();
    this.db.transaction(()=>{
      this.assertBoundAdmission();
      if(this.row(runtimeId))throw Error('Runtime capacity identity already used');
      if(this.db.prepare("SELECT 1 FROM isolated_runtime_capacity WHERE state='held'").get())throw Error('Shared runtime capacity unavailable');
      this.db.prepare("INSERT INTO isolated_runtime_capacity VALUES(?,?,?,'held',NULL)").run(runtimeId,jobDigest,hash(capability));
      this.audit(runtimeId,'reserved');
    }).immediate();
    return Object.freeze({releaseAfterObservedTermination:(evidence:IsolatedTerminationEvidence)=>{
      this.db.transaction(()=>{
        this.assertBoundAdmission();
        const row=this.row(runtimeId);
        if(!row||row.capability_hash!==hash(capability))throw Error('Capacity capability mismatch');
        this.release(runtimeId,evidence);
      }).immediate();
    }});
  }
  private validate(id:string,evidence:IsolatedTerminationEvidence){
    if(!this.row(id)||!evidence||Object.keys(evidence).sort().join(',')!=='observedAt,pid,profileDigest,removed,running,runtimeId'||
      evidence.runtimeId!==id||evidence.profileDigest!==ISOLATED_PROFILE_DIGEST||evidence.running!==false||
      evidence.pid!==0||evidence.removed!==true||!Number.isSafeInteger(evidence.observedAt)||
      evidence.observedAt>Date.now()||Date.now()-evidence.observedAt>60000)throw Error('Invalid or stale capacity termination evidence');
  }
  private release(id:string,evidence:IsolatedTerminationEvidence){
    this.validate(id,evidence);const row=this.row(id)!,proof=hash(evidence);
    if(row.state==='released'){if(row.proof_hash!==proof)throw Error('Conflicting capacity release');return;}
    this.db.prepare("UPDATE isolated_runtime_capacity SET state='released',proof_hash=? WHERE runtime_id=?").run(proof,id);
    this.audit(id,'released');
  }
  reconciliationScope(id:string,evidence:IsolatedTerminationEvidence):ActionScope {
    this.validate(id,evidence);
    return {activity:'isolated-capacity-reconciliation',component:'isolated-runtime-capacity',dataClass:'INTERNAL',
      contextDigest:hash({runtimeId:id,jobDigest:this.row(id)!.job_digest,evidence})};
  }
  /** Restart recovery uses a separate trusted review, not the lost in-memory
   * capability and never a raw assertion from an agent or an expiry timestamp. */
  reconcileTerminated(id:string,evidence:IsolatedTerminationEvidence):void {
    const scope=this.reconciliationScope(id,evidence);
    assertActionGate(this.db,scope,Date.now(),['isolated-termination-verification']);
    this.db.transaction(()=>{
      assertActionGate(this.db,scope,Date.now(),['isolated-termination-verification']);
      this.release(id,evidence);
    }).immediate();
  }
}
