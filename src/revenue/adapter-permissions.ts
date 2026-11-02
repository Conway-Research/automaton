import type {Database} from 'better-sqlite3';
import {assertActionGate,actionContextDigest} from '../security/action-gate.js';
export const adapterActionScope=(adapter:string,experimentId:string,maxCostUsdCents:number)=>({activity:'adapter-operation',component:adapter,
 contextDigest:actionContextDigest({experimentId,maxCostUsdCents})});

export interface AdapterPermission {
  adapter:string;
  experimentId:string;
  maxCostUsdCents:number;
  expiresAt:number;
  reviewedBy:string;
}
function schema(db:Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS obolus_adapter_permissions (
    adapter TEXT NOT NULL,experiment_id TEXT NOT NULL REFERENCES revenue_experiments(id),
    max_cost INTEGER NOT NULL,expires_ms INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,
    reviewed_by TEXT NOT NULL,PRIMARY KEY(adapter,experiment_id));
    CREATE TABLE IF NOT EXISTS obolus_adapter_permission_audit (
    id INTEGER PRIMARY KEY,action TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')));`);
}
/** Trusted operator boundary, deliberately not an agent tool. Does not grant network or wallet access. */
export function grantAdapterPermission(db:Database,input:AdapterPermission) {
  if (!input || !/^[a-z][a-z0-9_-]{0,60}$/.test(input.adapter) ||
      typeof input.experimentId!=='string'||!input.experimentId||input.experimentId.length>100||
      !Number.isSafeInteger(input.maxCostUsdCents)||input.maxCostUsdCents<0||input.maxCostUsdCents>100000000||
      !Number.isSafeInteger(input.expiresAt)||input.expiresAt<=Date.now()||input.expiresAt>Date.now()+86400000||
      typeof input.reviewedBy!=='string'||!input.reviewedBy.trim()||input.reviewedBy.length>100)
    throw new Error('Invalid adapter permission (maximum duration 24 hours)');
  db.transaction(()=>{
    schema(db);
    if(!db.prepare('SELECT 1 FROM revenue_experiments WHERE id=?').get(input.experimentId))throw new Error('Unknown experiment');
    db.prepare(`INSERT INTO obolus_adapter_permissions VALUES(?,?,?,?,0,?)
      ON CONFLICT(adapter,experiment_id) DO UPDATE SET max_cost=excluded.max_cost,
      expires_ms=excluded.expires_ms,revoked=0,reviewed_by=excluded.reviewed_by`)
      .run(input.adapter,input.experimentId,input.maxCostUsdCents,input.expiresAt,input.reviewedBy);
    db.prepare("INSERT INTO obolus_adapter_permission_audit(action,payload) VALUES('grant',?)").run(JSON.stringify(input));
  }).immediate();
}
export function revokeAdapterPermission(db:Database,adapter:string,experimentId:string) {
  db.transaction(()=>{
    schema(db);
    const changed=db.prepare('UPDATE obolus_adapter_permissions SET revoked=1 WHERE adapter=? AND experiment_id=? AND revoked=0').run(adapter,experimentId);
    if(changed.changes)db.prepare("INSERT INTO obolus_adapter_permission_audit(action,payload) VALUES('revoke',?)").run(JSON.stringify({adapter,experimentId}));
  }).immediate();
}
/** Must be called inside the same admission transaction as the cost reservation. */
export function assertAdapterPermission(db:Database,adapter:string,experimentId:string,cost:number) {
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_adapter_permissions'").get())throw new Error('Adapter permission required');
  const p=db.prepare('SELECT max_cost,expires_ms,revoked FROM obolus_adapter_permissions WHERE adapter=? AND experiment_id=?').get(adapter,experimentId) as {max_cost:number;expires_ms:number;revoked:number}|undefined;
  if(!p||p.revoked!==0||!Number.isSafeInteger(p.expires_ms)||p.expires_ms<=Date.now()||
    !Number.isSafeInteger(p.max_cost)||p.max_cost<0||!Number.isSafeInteger(cost)||cost<0||cost>p.max_cost)
    throw new Error('Adapter permission absent, expired, revoked or insufficient');
  // Draft registration is local, zero-cost and still protected by its scoped
  // permission, quality/secret checks and workspace boundary. Publication has
  // a separate mandatory checkout/release gate; do not require legal approval
  // merely to create a draft or simulate an objective.
  if(adapter!=='local-product'||cost!==0)assertActionGate(db,adapterActionScope(adapter,experimentId,p.max_cost));
}
