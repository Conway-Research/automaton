import {afterEach, beforeEach, expect, it} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pendingOperationCost} from '../revenue/pending-operations.js';

let dir:string, db:Database.Database, reader:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'obolus-pending-integrity-'));
  db=new Database(join(dir,'synthetic.db'));
  db.exec('CREATE TABLE obolus_reserved_operations(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL)');
  reader=new Database(join(dir,'synthetic.db'));
});
afterEach(()=>{reader.close();db.close();rmSync(dir,{recursive:true,force:true});});
function insert(id:string,cost:unknown,status='pending',experimentId='synthetic'){
  db.prepare('INSERT INTO obolus_reserved_operations VALUES(?,?,?)').run(id,JSON.stringify({experimentId,maxCostUsdCents:cost}),status);
}
it.each([
  ['negative cancellation',[-10,10]],
  ['fractional cancellation',[0.5,0.5]],
  ['missing cost',[undefined]],
  ['null cost',[null]],
  ['string cost',['12']],
] as const)('rejects %s before summing persistent holds',(_name,costs)=>{
  costs.forEach((cost,i)=>insert(String(i),cost));
  expect(()=>pendingOperationCost(reader,'synthetic')).toThrow('Invalid pending operation');
});
it('does not lose a hold with an unknown persisted status',()=>{
  insert('unknown',10,'unexpected');
  expect(()=>pendingOperationCost(reader,'synthetic')).toThrow('Invalid pending operation');
});
it('preserves valid zero holds, attribution and settled legacy records',()=>{
  insert('zero',0);insert('active',12);insert('other',20,'pending','other');insert('settled',undefined,'settled');
  expect(pendingOperationCost(reader,'synthetic')).toBe(12);
  expect(pendingOperationCost(reader,'other')).toBe(20);
});
it('rejects aggregate overflow',()=>{
  insert('a',Number.MAX_SAFE_INTEGER);insert('b',1);
  expect(()=>pendingOperationCost(reader,'synthetic')).toThrow();
});
