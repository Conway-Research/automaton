import {it,expect} from 'vitest';
import Database from 'better-sqlite3';
import {releaseFocusSlot,configureFocusAdmission} from '../revenue/focus-admission.js';
it('blocks unfinished descendants, missing roots and oversized trees without freeing a slot',()=>{
 const db=new Database(':memory:');
 try {
  db.exec(`CREATE TABLE revenue_experiments(id TEXT,opportunity_id TEXT,status TEXT,task_id TEXT);
    CREATE TABLE inference_reservations(experiment_id TEXT,status TEXT);
    CREATE TABLE task_graph(id TEXT PRIMARY KEY,parent_id TEXT,status TEXT);
    CREATE TABLE obolus_focus_slots(opportunity_id TEXT PRIMARY KEY);
    INSERT INTO revenue_experiments VALUES('e','o','completed','root');
    INSERT INTO obolus_focus_slots VALUES('o');
    INSERT INTO task_graph VALUES('root',NULL,'completed'),('child','root','running'),('grandchild','child','completed');`);
  expect(()=>releaseFocusSlot(db,'o','review')).toThrow('Open or missing');
  expect(db.prepare('SELECT COUNT(*) n FROM obolus_focus_slots').get()).toEqual({n:1});
  db.exec("UPDATE task_graph SET status='completed'; DELETE FROM task_graph WHERE id='root'");
  expect(()=>releaseFocusSlot(db,'o','review')).toThrow('Open or missing');
  db.exec("INSERT INTO task_graph VALUES('root','grandchild','completed')");
  db.exec("CREATE TABLE aureus_capital_commitments(id TEXT PRIMARY KEY); CREATE TABLE aureus_capital_settlements(id TEXT PRIMARY KEY); INSERT INTO aureus_capital_commitments VALUES('paid-service')");
  expect(()=>releaseFocusSlot(db,'o','review')).toThrow('commitments');
  db.exec("INSERT INTO aureus_capital_settlements VALUES('paid-service')");
  // Cycles terminate because the recursive query uses UNION, not UNION ALL.
  expect(releaseFocusSlot(db,'o','All synthetic tasks checked').released).toBe(true);
  db.exec("INSERT INTO obolus_focus_slots VALUES('o')");
  const insert=db.prepare('INSERT INTO task_graph VALUES(?,?,?)');
  db.transaction(()=>{for(let i=0;i<1001;i++)insert.run(`extra${i}`,'root','completed');})();
  expect(()=>releaseFocusSlot(db,'o','review')).toThrow('capacity');
 }finally{db.close();}
});
it('preserves focus for unresolved external operations even with zero expected cost and terminal experiments',()=>{
 const db=new Database(':memory:');
 try {
  db.exec(`CREATE TABLE revenue_opportunities(id TEXT PRIMARY KEY);
    CREATE TABLE revenue_experiments(id TEXT PRIMARY KEY,opportunity_id TEXT,status TEXT,task_id TEXT);
    CREATE TABLE inference_reservations(experiment_id TEXT,status TEXT);
    CREATE TABLE task_graph(id TEXT PRIMARY KEY,parent_id TEXT,status TEXT);
    CREATE TABLE obolus_reserved_operations(id TEXT PRIMARY KEY,payload TEXT,status TEXT);
    INSERT INTO revenue_opportunities VALUES('o');
    INSERT INTO revenue_experiments VALUES('e','o','stopped',NULL);`);
  db.prepare('INSERT INTO obolus_reserved_operations VALUES(?,?,?)').run('external',JSON.stringify({experimentId:'e',maxCostUsdCents:0}),'pending');
  configureFocusAdmission(db,1);
  expect(db.prepare('SELECT opportunity_id FROM obolus_focus_slots').all()).toEqual([{opportunity_id:'o'}]);
  expect(()=>releaseFocusSlot(db,'o','Checked terminal state')).toThrow('external operations');
  expect(db.prepare('SELECT COUNT(*) n FROM obolus_focus_slots').get()).toEqual({n:1});
  db.exec("UPDATE obolus_reserved_operations SET status='settled'");
  expect(releaseFocusSlot(db,'o','External result reconciled')).toEqual({released:true});
 }finally{db.close();}
});
