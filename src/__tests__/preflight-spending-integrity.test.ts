import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../state/database.js';
import {livePreflight} from '../v1/live-preflight.js';
let dir:string,file:string,db:ReturnType<typeof createDatabase>;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'obolus-preflight-spending-'));file=join(dir,'synthetic.db');db=createDatabase(file);});
afterEach(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
it.each(['inference-null','inference-unknown','operation-null','operation-unknown','null-settlement'])(
 'blocks contradictory spending storage without mutation: %s',fault=>{
  // Incompatible tables intentionally model damaged/legacy storage, never live state.
  if(fault.startsWith('inference')){
   db.raw.exec('DROP TABLE inference_reservations; CREATE TABLE inference_reservations(id TEXT,status TEXT)');
   db.raw.prepare('INSERT INTO inference_reservations VALUES(?,?)').run('synthetic',fault.endsWith('null')?null:'invalid-private-value');
  }else if(fault.startsWith('operation')){
   db.raw.exec('CREATE TABLE obolus_reserved_operations(id TEXT,status TEXT)');
   db.raw.prepare('INSERT INTO obolus_reserved_operations VALUES(?,?)').run('synthetic',fault.endsWith('null')?null:'invalid-private-value');
  }else{
   db.raw.exec("CREATE TABLE aureus_capital_commitments(id TEXT,usd_cents INTEGER); CREATE TABLE aureus_capital_settlements(id TEXT,actual_usd_cents INTEGER); INSERT INTO aureus_capital_commitments VALUES('synthetic',10); INSERT INTO aureus_capital_settlements VALUES(NULL,0)");
  }
  const before=db.raw.serialize();
  const report=livePreflight({agentFile:file},{});
  expect(report.checks).toContainEqual(expect.objectContaining({id:'unresolved_spending',status:'blocked'}));
  expect(report.liveReady).toBe(false);expect(JSON.stringify(report)).not.toContain('invalid-private-value');
  expect(db.raw.serialize()).toEqual(before);
 });
it('keeps empty spending state distinguishable from unresolved spending',()=>{
 expect(livePreflight({agentFile:file},{}).checks).toContainEqual(expect.objectContaining({id:'unresolved_spending',status:'pass'}));
});
