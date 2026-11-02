import type {Database} from 'better-sqlite3';

/** Durable operator control for new storefront purchases, not cancellation of in-flight payments. */
export function initializeSalesControl(db:Database) {
  db.transaction(()=>{
    const config=db.prepare('SELECT mode FROM commerce_stripe_config WHERE id=1').get() as {mode:string}|undefined;
    if(!config||!['live','test'].includes(config.mode))throw new Error('Commerce configuration required');
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_sales_control(id INTEGER PRIMARY KEY CHECK(id=1),paused INTEGER NOT NULL CHECK(paused IN (0,1)));
      CREATE TABLE IF NOT EXISTS obolus_sales_audit(id INTEGER PRIMARY KEY,paused INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')));`);
    db.prepare('INSERT OR IGNORE INTO obolus_sales_control(id,paused) VALUES(1,?)').run(config.mode==='live'?1:0);
  }).immediate();
}
export function salesPaused(db:Database):boolean {
  const row=db.prepare('SELECT paused FROM obolus_sales_control WHERE id=1').get() as {paused:number}|undefined;
  return row?.paused!==0;
}
export function setSalesPaused(db:Database,paused:boolean) {
  if(typeof paused!=='boolean')throw new Error('Boolean sales state required');
  initializeSalesControl(db);
  db.transaction(()=>{
    db.prepare('UPDATE obolus_sales_control SET paused=? WHERE id=1').run(paused?1:0);
    db.prepare('INSERT INTO obolus_sales_audit(paused) VALUES(?)').run(paused?1:0);
  }).immediate();
  return {paused};
}
