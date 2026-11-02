import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runReservedOperation} from '../revenue/reserved-operation.js';

let dir:string,db:Database.Database,reader:Database.Database;
const input={id:'op_fixture',adapter:'fixture',purpose:'synthetic replay',maxCostUsdCents:10,experimentId:'synthetic'};
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'obolus-replay-integrity-'));
  db=new Database(join(dir,'synthetic.db'));
  db.exec('CREATE TABLE obolus_reserved_operations(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL,actual_cost INTEGER)');
  reader=new Database(join(dir,'synthetic.db'));
});
afterEach(()=>{reader.close();db.close();rmSync(dir,{recursive:true,force:true});});
function seed(cost:unknown){
  const {id,...payload}=input;
  db.prepare("INSERT INTO obolus_reserved_operations VALUES(?,?,'settled',?)").run(id,JSON.stringify(payload),cost);
}
it.each([null,-1,0.5,100000001,'invalid'])('rejects damaged settled cost %s without executing again',async cost=>{
  seed(cost);
  const execute=vi.fn(async()=>{throw new Error('UNSAFE_REEXECUTION');}),record=vi.fn();
  await expect(runReservedOperation(reader,input,execute,record)).rejects.toThrow('Invalid persisted operation cost');
  expect(execute).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();
  expect(db.prepare('SELECT actual_cost FROM obolus_reserved_operations').get()).toEqual({actual_cost:cost});
});
it.each([0,10])('preserves valid settled replay with cost %s',async cost=>{
  seed(cost);const execute=vi.fn(),record=vi.fn();
  await expect(runReservedOperation(reader,input,execute,record)).resolves.toEqual({duplicate:true,actualCostUsdCents:cost});
  expect(execute).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();
});
