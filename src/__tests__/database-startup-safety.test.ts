import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';
import {createDatabase} from '../state/database.js';
import {SCHEMA_VERSION} from '../state/schema.js';
it('rejects future schemas before changing persistent schema or journal mode',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-db-safety-')),file=path.join(dir,'state.db');
 try{
  const db=new Database(file);db.exec('CREATE TABLE schema_version(version INTEGER);INSERT INTO schema_version VALUES(999);CREATE TABLE preserved(value TEXT);INSERT INTO preserved VALUES(\'fixture\')');db.close();
  const before=fs.readFileSync(file);
  expect(()=>createDatabase(file)).toThrow('incompatible');
  expect(fs.readFileSync(file)).toEqual(before);
  // A failed opener must release its handle.
  const check=new Database(file);try{expect(check.pragma('journal_mode',{simple:true})).toBe('delete');expect(check.prepare('SELECT value FROM preserved').get()).toEqual({value:'fixture'});}finally{check.close();}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
it('rolls back a failed migration including newly created tables',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-db-rollback-')),file=path.join(dir,'state.db');
 try{
  const seed=createDatabase(file);seed.raw.prepare('DELETE FROM schema_version WHERE version=?').run(SCHEMA_VERSION);
  seed.raw.exec("CREATE TRIGGER reject_version BEFORE INSERT ON schema_version BEGIN SELECT RAISE(ABORT,'fixture migration failure'); END; DROP TRIGGER experiment_baseline_insert; DROP TRIGGER experiment_baseline_start; DROP TABLE revenue_experiment_baselines;");seed.close();
  expect(()=>createDatabase(file)).toThrow('fixture migration failure');
  const check=new Database(file);try{expect(check.prepare("SELECT 1 FROM sqlite_master WHERE name='revenue_experiment_baselines'").get()).toBeUndefined();expect(check.prepare('SELECT MAX(version) v FROM schema_version').get()).toEqual({v:SCHEMA_VERSION-1});}finally{check.close();}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

