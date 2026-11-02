import {createHash, randomUUID} from 'node:crypto';
import type {Database} from 'better-sqlite3';
import {assertNoKnownSecrets} from '../observability/redaction.js';
import {assertActionGate, type ActionScope} from './action-gate.js';

/** Admission/accounting only. No subprocess, host path, agent tool or runtime
 * activation is provided here. A future trusted supervisor must independently
 * verify termination before calling complete; a timeout is NOT that proof. */
export const ISOLATED_PROFILE = Object.freeze({
  version: 2, network: 'none', rootReadonly: true, uid: 65534,
  backend: 'rootless-podman-fixture-v1', workload: 'text-roundtrip-fixture-v1',
  image: 'sha256:638c2e5c56de6391df9e8a911b3f448a71d9fe4fd23038c20f6aa526acb39241',
  memoryBytes: 67108864, pids: 16, cpu: 0.5, timeoutMs: 10000,
  inputBytes: 65536, outputBytes: 65536, maxFiles: 16,
});
export const ISOLATED_PROFILE_DIGEST=createHash('sha256').update(JSON.stringify(ISOLATED_PROFILE)).digest('hex');
export interface IsolatedTextFile {name: string; text: string}
export interface IsolatedTerminationEvidence {
  runtimeId:string; profileDigest:string; observedAt:number;
  running:false; pid:0; removed:true;
}
type State = 'queued'|'running'|'uncertain'|'completed'|'cancelled';
interface Row {id:string; digest:string; state:State; token:string|null; result:string|null}
const digest = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function identifier(id:string) {
  if(typeof id!=='string'||!/^job-[a-z0-9-]{1,64}$/.test(id)) throw Error('Invalid isolated job identifier');
}
/** Text-only logical files, never host paths or archive entries. No correction,
 * path normalization, case folding or silent content truncation is performed. */
function files(value:readonly IsolatedTextFile[], maxBytes:number) {
  if(!Array.isArray(value)||value.length>ISOLATED_PROFILE.maxFiles) throw Error('Invalid isolated file count');
  const names=new Set<string>();let bytes=0;
  // Array.from visits sparse slots too; map would silently skip validation.
  const copy=Array.from(value,file=>{
    if(!file||Object.keys(file).sort().join(',')!=='name,text'||typeof file.name!=='string'||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.(txt|csv|json)$/.test(file.name)||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(file.name)||typeof file.text!=='string'||
      file.text.includes('\0')||Buffer.from(file.text,'utf8').toString('utf8')!==file.text)
      throw Error('Invalid isolated text file');
    const key=file.name.toLowerCase();if(names.has(key)) throw Error('Duplicate isolated filename');names.add(key);
    bytes+=Buffer.byteLength(file.text,'utf8');if(bytes>maxBytes) throw Error('Isolated file byte limit exceeded');
    assertNoKnownSecrets(file);
    return {name:file.name,text:file.text};
  });
  return copy.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
export function isolatedJobScope(id:string, input:readonly IsolatedTextFile[]):ActionScope {
  identifier(id);
  return {activity:'isolated-execution',component:'isolated-job-ledger',dataClass:'INTERNAL',
    contextDigest:digest({id,profile:ISOLATED_PROFILE,input:files(input,ISOLATED_PROFILE.inputBytes)})};
}

/** Separate, trusted control-plane primitive. Persist only digests and states;
 * input/output content is not retained in the ledger or audit. All unresolved
 * executions occupy the single slot until a trusted termination reconciliation.
 * This is deliberately not connected to ConwayClient.exec or any agent tool. */
export class IsolatedJobLedger {
  constructor(private readonly db:Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS isolated_jobs (
      id TEXT PRIMARY KEY,digest TEXT NOT NULL,state TEXT NOT NULL,
      token TEXT,result TEXT);
      CREATE TABLE IF NOT EXISTS isolated_job_audit (
      seq INTEGER PRIMARY KEY,job_id TEXT NOT NULL,event TEXT NOT NULL,created_ms INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS isolated_single_slot ON isolated_jobs((1))
      WHERE state IN ('running','uncertain');
      CREATE TRIGGER IF NOT EXISTS isolated_audit_no_update BEFORE UPDATE ON isolated_job_audit
      BEGIN SELECT RAISE(ABORT,'Isolated audit immutable'); END;
      CREATE TRIGGER IF NOT EXISTS isolated_audit_no_delete BEFORE DELETE ON isolated_job_audit
      BEGIN SELECT RAISE(ABORT,'Isolated audit immutable'); END;`);
  }
  private audit(id:string,event:string) {
    this.db.prepare('INSERT INTO isolated_job_audit(job_id,event,created_ms) VALUES(?,?,?)').run(id,event,Date.now());
  }
  get(id:string):Readonly<Row>|undefined {
    identifier(id);return this.db.prepare('SELECT * FROM isolated_jobs WHERE id=?').get(id) as Row|undefined;
  }
  submit(id:string,input:readonly IsolatedTextFile[]):Readonly<Row> {
    const hash=isolatedJobScope(id,input).contextDigest;
    return this.db.transaction(()=>{
      const old=this.get(id);
      if(old) {if(old.digest!==hash) throw Error('Conflicting isolated job');return old;}
      this.db.prepare("INSERT INTO isolated_jobs VALUES(?,?,'queued',NULL,NULL)").run(id,hash);
      this.audit(id,'submitted');return this.get(id)!;
    }).immediate();
  }
  claim(id:string,input:readonly IsolatedTextFile[]):string {
    const scope=isolatedJobScope(id,input);
    // Persist denied attempts even though no job transaction will be committed.
    assertActionGate(this.db,scope,Date.now(),['isolated-backend-acceptance']);
    return this.db.transaction(()=>{
      // Recheck inside the writer transaction against concurrent revocation/halt.
      assertActionGate(this.db,scope,Date.now(),['isolated-backend-acceptance']);
      const row=this.get(id);
      if(!row||row.digest!==scope.contextDigest||row.state!=='queued') throw Error('Isolated job is not claimable');
      if(this.db.prepare("SELECT 1 FROM isolated_jobs WHERE state IN ('running','uncertain')").get())
        throw Error('Isolated execution slot unavailable');
      const token=randomUUID();
      this.db.prepare("UPDATE isolated_jobs SET state='running',token=? WHERE id=?").run(token,id);
      this.audit(id,'claimed');return token;
    }).immediate();
  }
  cancel(id:string):void {
    this.db.transaction(()=>{
      const row=this.get(id);if(!row) throw Error('Unknown isolated job');
      if(row.state==='queued'||row.state==='running') {
        // Cancellation is a request, never proof that a process has stopped.
        this.db.prepare('UPDATE isolated_jobs SET state=? WHERE id=?').run(row.state==='queued'?'cancelled':'uncertain',id);
        this.audit(id,'cancel-requested');
      }
    }).immediate();
  }
  /** Revalidate immediately at the trusted transport boundary. Claiming a job
   * is not a durable authorization to dispatch it after revocation or recovery. */
  assertDispatch(id:string,token:string,input:readonly IsolatedTextFile[]):void {
    this.assertLease(id,token,input,'dispatch-validated');
  }
  assertActive(id:string,token:string,input:readonly IsolatedTextFile[]):void {
    this.assertLease(id,token,input,'runtime-validated');
  }
  private assertLease(id:string,token:string,input:readonly IsolatedTextFile[],event:string):void {
    const scope=isolatedJobScope(id,input);
    assertActionGate(this.db,scope,Date.now(),['isolated-backend-acceptance']);
    this.db.transaction(()=>{
      assertActionGate(this.db,scope,Date.now(),['isolated-backend-acceptance']);
      const row=this.get(id);
      if(!row||row.state!=='running'||row.token!==token||row.digest!==scope.contextDigest)
        throw Error('Isolated dispatch lease is no longer valid');
      this.audit(id,event);
    }).immediate();
  }
  recover():number {
    return this.db.transaction(()=>{
      const rows=this.db.prepare("SELECT id FROM isolated_jobs WHERE state='running'").all() as {id:string}[];
      for(const row of rows) {this.db.prepare("UPDATE isolated_jobs SET state='uncertain' WHERE id=?").run(row.id);this.audit(row.id,'recovery-uncertain');}
      return rows.length;
    }).immediate();
  }
  /** Evidence is supplied and independently reviewed by a trusted controller,
   * never inferred from an agent assertion or an elapsed timeout. */
  terminationScope(id:string,token:string,evidence:IsolatedTerminationEvidence):ActionScope {
    const row=this.get(id);
    if(!row||!token||row.token!==token||!evidence||
      Object.keys(evidence).sort().join(',')!=='observedAt,pid,profileDigest,removed,running,runtimeId'||
      evidence.runtimeId!==`obolus-job-${token}`||evidence.profileDigest!==ISOLATED_PROFILE_DIGEST||
      evidence.running!==false||evidence.pid!==0||evidence.removed!==true||
      !Number.isSafeInteger(evidence.observedAt)||evidence.observedAt>Date.now()||Date.now()-evidence.observedAt>60000)
      throw Error('Invalid or stale isolated termination evidence');
    return {activity:'isolated-termination-reconciliation',component:'isolated-job-ledger',dataClass:'INTERNAL',
      contextDigest:digest({id,jobDigest:row.digest,token,evidence})};
  }
  reconcileTerminated(id:string,token:string,evidence:IsolatedTerminationEvidence):void {
    const scope=this.terminationScope(id,token,evidence);
    assertActionGate(this.db,scope,Date.now(),['isolated-termination-verification']);
    this.db.transaction(()=>{
      this.terminationScope(id,token,evidence);
      assertActionGate(this.db,scope,Date.now(),['isolated-termination-verification']);
      const row=this.get(id)!;
      if(row.state==='cancelled'&&row.result===scope.contextDigest)return;
      if(row.state!=='uncertain')throw Error('Isolated termination conflicts with current state');
      this.db.prepare("UPDATE isolated_jobs SET state='cancelled',result=? WHERE id=?").run(scope.contextDigest,id);
      this.audit(id,'termination-reconciled');
    }).immediate();
  }
  /** Only the trusted supervisor may attest observed termination and output.
   * Agent text or an expired lease is insufficient. There is no public tool. */
  complete(id:string,token:string,output:readonly IsolatedTextFile[],exitCode:number):void {
    const result=digest({output:files(output,ISOLATED_PROFILE.outputBytes),exitCode});
    if(!Number.isSafeInteger(exitCode)||exitCode<0||exitCode>255) throw Error('Invalid exit status');
    this.db.transaction(()=>{
      const row=this.get(id);
      if(!row||!token||row.token!==token) throw Error('Invalid isolated lease');
      if(row.state==='completed') {if(row.result!==result) throw Error('Conflicting isolated result');return;}
      if(row.state!=='running') throw Error('Isolated job requires termination reconciliation');
      // Final admission and result transition share the SQLite writer transaction;
      // another connection cannot slip a revocation between these two operations.
      assertActionGate(this.db,{activity:'isolated-execution',component:'isolated-job-ledger',
        dataClass:'INTERNAL',contextDigest:row.digest},Date.now(),['isolated-backend-acceptance']);
      this.db.prepare("UPDATE isolated_jobs SET state='completed',result=? WHERE id=?").run(result,id);
      this.audit(id,'completed');
    }).immediate();
  }
}
