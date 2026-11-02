import type {Database} from 'better-sqlite3';

/** Opt-in operator policy. Durable slots survive terminal labels until explicit reconciliation. */
export function configureFocusAdmission(db:Database,maxOpportunities:number) {
  if(!Number.isSafeInteger(maxOpportunities)||maxOpportunities<1||maxOpportunities>100)throw new Error('Invalid focus limit');
  db.transaction(()=>{
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_focus_policy(id INTEGER PRIMARY KEY CHECK(id=1),max_opportunities INTEGER NOT NULL CHECK(max_opportunities BETWEEN 1 AND 100));
      CREATE TABLE IF NOT EXISTS obolus_focus_slots(opportunity_id TEXT PRIMARY KEY REFERENCES revenue_opportunities(id),created_at TEXT NOT NULL DEFAULT(datetime('now')));`);
    db.exec(`INSERT OR IGNORE INTO obolus_focus_slots(opportunity_id)
      SELECT DISTINCT e.opportunity_id FROM revenue_experiments e WHERE e.status='running'
      OR EXISTS(SELECT 1 FROM inference_reservations r WHERE r.experiment_id=e.id AND r.status='pending');`);
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_reserved_operations'").get()){
      db.exec(`INSERT OR IGNORE INTO obolus_focus_slots(opportunity_id)
        SELECT DISTINCT e.opportunity_id FROM revenue_experiments e JOIN obolus_reserved_operations r
        ON json_extract(r.payload,'$.experimentId')=e.id WHERE r.status<>'settled'`);
    }
    const count=(db.prepare('SELECT COUNT(*) n FROM obolus_focus_slots').get() as {n:number}).n;
    if(count>maxOpportunities)throw new Error('Existing funded opportunities exceed requested limit; reconcile first');
    db.prepare('INSERT INTO obolus_focus_policy VALUES(1,?) ON CONFLICT(id) DO UPDATE SET max_opportunities=excluded.max_opportunities').run(maxOpportunities);
    for(const event of ['INSERT','UPDATE OF status,opportunity_id']) {
      const name=event==='INSERT'?'insert':'update';
      db.exec(`CREATE TRIGGER IF NOT EXISTS obolus_focus_${name} BEFORE ${event} ON revenue_experiments
        WHEN NEW.status='running' BEGIN
        SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM obolus_focus_slots WHERE opportunity_id=NEW.opportunity_id)
          AND (SELECT COUNT(*) FROM obolus_focus_slots)>=(SELECT max_opportunities FROM obolus_focus_policy WHERE id=1)
          THEN RAISE(ABORT,'Opportunity focus capacity reached') END;
        INSERT OR IGNORE INTO obolus_focus_slots(opportunity_id) VALUES(NEW.opportunity_id);
        END;`);
    }
  }).immediate();
  return {maxOpportunities};
}

/** Trusted operator reconciliation only. No automatic release from a status label. */
export function releaseFocusSlot(db:Database,opportunityId:string,reason:string) {
  if(!opportunityId||typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new Error('Reviewed release reason required');
  return db.transaction(()=>{
    if(db.prepare("SELECT 1 FROM revenue_experiments WHERE opportunity_id=? AND status IN ('planned','running')").get(opportunityId))throw new Error('Open experiments prevent focus release');
    if(db.prepare(`SELECT 1 FROM inference_reservations r JOIN revenue_experiments e ON e.id=r.experiment_id
      WHERE e.opportunity_id=? AND r.status='pending'`).get(opportunityId))throw new Error('Unresolved costs prevent focus release');
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_reserved_operations'").get()&&
      db.prepare(`SELECT 1 FROM obolus_reserved_operations r JOIN revenue_experiments e ON json_extract(r.payload,'$.experimentId')=e.id
        WHERE e.opportunity_id=? AND r.status<>'settled' LIMIT 1`).get(opportunityId))throw new Error('Unresolved external operations prevent focus release');
    const tasks=db.prepare(`WITH RECURSIVE subtree(id) AS (
      SELECT task_id FROM revenue_experiments WHERE opportunity_id=? AND task_id IS NOT NULL
      UNION SELECT t.id FROM task_graph t JOIN subtree s ON t.parent_id=s.id LIMIT 1001
    ) SELECT s.id,t.status FROM subtree s LEFT JOIN task_graph t ON t.id=s.id`).all(opportunityId) as {id:string;status:string|null}[];
    if(tasks.length>1000)throw new Error('Task tree exceeds review capacity');
    if(tasks.some(t=>!t.status||!['completed','failed','cancelled'].includes(t.status)))throw new Error('Open or missing task prevents focus release');
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='aureus_capital_commitments'").get()&&
      db.prepare('SELECT 1 FROM aureus_capital_commitments c WHERE NOT EXISTS(SELECT 1 FROM aureus_capital_settlements s WHERE s.id=c.id) LIMIT 1').get())throw new Error('Unallocated capital commitments require reconciliation first');
    db.exec("CREATE TABLE IF NOT EXISTS obolus_focus_releases(id INTEGER PRIMARY KEY,opportunity_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')))");
    const released=db.prepare('DELETE FROM obolus_focus_slots WHERE opportunity_id=?').run(opportunityId).changes===1;
    if(released)db.prepare('INSERT INTO obolus_focus_releases(opportunity_id,reason) VALUES(?,?)').run(opportunityId,reason.trim());
    return {released};
  }).immediate();
}
