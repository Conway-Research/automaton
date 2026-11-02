import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../state/database.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {reconcileOperation} from '../revenue/operation-reconciliation.js';
let dir:string,a:ReturnType<typeof createDatabase>,b:ReturnType<typeof createDatabase>;
const receipt={operationId:'op_fixture',accountRef:'synthetic',transactionRef:'synthetic-tx',actualCostUsdCents:5,evidenceSha256:'a'.repeat(64),reviewedBy:'synthetic-review'};
beforeEach(()=>{
 dir=mkdtempSync(join(tmpdir(),'obolus-receipt-integrity-'));a=createDatabase(join(dir,'test.db'));b=createDatabase(join(dir,'test.db'));
 initializeCapitalBudget(a.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
 a.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('o','synthetic','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis) VALUES('e','o','running','synthetic'); CREATE TABLE obolus_reserved_operations(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL,actual_cost INTEGER)");
 a.raw.prepare("INSERT INTO obolus_reserved_operations VALUES(?,?,'pending',NULL)").run(receipt.operationId,JSON.stringify({experimentId:'e',maxCostUsdCents:10,purpose:'synthetic'}));
 a.raw.prepare('INSERT INTO aureus_capital_commitments VALUES(?,?,?)').run(receipt.operationId,'synthetic',10);
 expect(reconcileOperation(a.raw,receipt)).toEqual({duplicate:false});
});
afterEach(()=>{a.close();b.close();rmSync(dir,{recursive:true,force:true});});
it.each([
 "DELETE FROM economic_events",
 "UPDATE economic_events SET amount_cents=4",
 "UPDATE economic_events SET metadata_json='{}'",
 "DELETE FROM aureus_capital_settlements",
 "UPDATE aureus_capital_settlements SET actual_usd_cents=4",
 "DELETE FROM aureus_capital_commitments",
 "UPDATE obolus_reserved_operations SET actual_cost=NULL",
 "UPDATE obolus_reserved_operations SET status='pending'",
] )('refuses duplicate success after storage corruption: %s',sql=>{
 // Privileged test-only corruption, never a supported agent action.
 a.raw.exec(sql);
 const before=a.raw.prepare('SELECT * FROM economic_events').all();
 expect(()=>reconcileOperation(b.raw,receipt)).toThrow('Reviewed operation accounting mismatch');
 expect(a.raw.prepare('SELECT * FROM economic_events').all()).toEqual(before);
});
it('accepts intact replay across connections without another cost',()=>{
 expect(reconcileOperation(b.raw,receipt)).toEqual({duplicate:true});
 expect(a.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:1});
});
it('does not silently finish a pending operation with an already existing capital settlement',()=>{
 // Model contradictory persisted state. Atomic normal settlement cannot create it.
 a.raw.exec("DROP TRIGGER operation_receipt_no_delete; DELETE FROM obolus_operation_receipts; DELETE FROM economic_events; UPDATE obolus_reserved_operations SET status='pending',actual_cost=NULL");
 expect(()=>reconcileOperation(b.raw,receipt)).toThrow('Pending operation has existing capital settlement');
 expect(a.raw.prepare('SELECT COUNT(*) n FROM obolus_operation_receipts').get()).toEqual({n:0});
 expect(a.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
 expect(a.raw.prepare('SELECT status,actual_cost FROM obolus_reserved_operations').get()).toEqual({status:'pending',actual_cost:null});
 expect(a.raw.prepare('SELECT actual_usd_cents FROM aureus_capital_settlements').get()).toEqual({actual_usd_cents:5});
});
