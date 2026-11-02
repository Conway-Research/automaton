import type {Database} from 'better-sqlite3';
import {settleReservedOperation} from './reserved-operation.js';
import {assertNoKnownSecrets} from '../observability/redaction.js';
import {settleCapitalCommitment} from './capital-budget.js';
import {pendingChildFundingCost} from './pending-operations.js';

export interface ReviewedOperationReceipt {
  operationId:string;accountRef:string;transactionRef:string;actualCostUsdCents:number;
  evidenceSha256:string;reviewedBy:string;
}
export interface ReviewedChildFundingReceipt extends ReviewedOperationReceipt {
  fundingTransferRef:string;returnedLiquidUsdCents:number;additionalDebitUsdCents:number;
  remainingNoncashCreditCents:0;allLiabilitiesFinal:true;observedAt:number;
}
/** Operator/verified-connector boundary, never an LLM tool. Review must cover
 * child consumption AND liquid funds returned to the owner. Provider credits
 * are not cash; retain their allocation until used or actually redeemed. */
export function reconcileChildFunding(db:Database,input:ReviewedChildFundingReceipt){
  const ref=(s:unknown)=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(s);
  if(!input||![input.operationId,input.accountRef,input.transactionRef,input.fundingTransferRef,input.reviewedBy].every(ref)||
    ![input.actualCostUsdCents,input.returnedLiquidUsdCents,input.additionalDebitUsdCents].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000)||
    input.remainingNoncashCreditCents!==0||input.allLiabilitiesFinal!==true||!Number.isSafeInteger(input.observedAt)||input.observedAt<0||input.observedAt>Date.now()||
    !/^[a-f0-9]{64}$/.test(input.evidenceSha256))throw new Error('Invalid complete child funding receipt');
  const receipt={operationId:input.operationId,accountRef:input.accountRef,transactionRef:input.transactionRef,fundingTransferRef:input.fundingTransferRef,
    actualCostUsdCents:input.actualCostUsdCents,returnedLiquidUsdCents:input.returnedLiquidUsdCents,additionalDebitUsdCents:input.additionalDebitUsdCents,
    remainingNoncashCreditCents:0,allLiabilitiesFinal:true,observedAt:input.observedAt,evidenceSha256:input.evidenceSha256,reviewedBy:input.reviewedBy};
  assertNoKnownSecrets(receipt);const payload=JSON.stringify(receipt);
  return db.transaction(()=>{
    const row=db.prepare('SELECT payload,status,receipt FROM obolus_child_funding WHERE id=?').get(receipt.operationId) as {payload:string;status:string;receipt:string|null}|undefined;
    if(!row)throw new Error('Unknown child funding');
    const intent=JSON.parse(row.payload);
    if(row.receipt!==null&&row.receipt!==receipt.fundingTransferRef||receipt.actualCostUsdCents+receipt.returnedLiquidUsdCents!==intent.amountCents+receipt.additionalDebitUsdCents)throw new Error('Funding identity or gross settlement mismatch');
    if(db.prepare('SELECT 1 FROM obolus_child_funding WHERE receipt=? AND id<>?').get(receipt.fundingTransferRef,receipt.operationId))throw new Error('Funding transfer already attributed');
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_child_funding_closures(operation_id TEXT PRIMARY KEY,payload TEXT NOT NULL,account_ref TEXT NOT NULL,transaction_ref TEXT NOT NULL,funding_ref TEXT NOT NULL UNIQUE,UNIQUE(account_ref,transaction_ref));
      CREATE TRIGGER IF NOT EXISTS child_closure_no_update BEFORE UPDATE ON obolus_child_funding_closures BEGIN SELECT RAISE(ABORT,'Funding closure immutable'); END;
      CREATE TRIGGER IF NOT EXISTS child_closure_no_delete BEFORE DELETE ON obolus_child_funding_closures BEGIN SELECT RAISE(ABORT,'Funding closure immutable'); END;`);
    const old=db.prepare('SELECT payload FROM obolus_child_funding_closures WHERE operation_id=?').get(receipt.operationId) as {payload:string}|undefined;
    if(old){if(old.payload!==payload)throw new Error('Conflicting funding closure');pendingChildFundingCost(db);return {duplicate:true};}
    if(Date.now()-receipt.observedAt>300000)throw new Error('Fresh independent funding review required');
    const experiment=db.prepare('SELECT opportunity_id FROM revenue_experiments WHERE id=?').get(intent.experimentId) as {opportunity_id:string}|undefined;
    const hold=db.prepare('SELECT usd_cents FROM aureus_capital_commitments WHERE id=?').get(receipt.operationId) as {usd_cents:number}|undefined;
    if(!experiment||hold?.usd_cents!==intent.amountCents)throw new Error('Funding attribution or hold mismatch');
    settleCapitalCommitment(db,receipt.operationId,receipt.actualCostUsdCents,()=>{
      db.prepare("INSERT INTO economic_events(id,opportunity_id,experiment_id,event_type,category,amount_cents,currency,metadata_json) VALUES(?,?,?,'cost','remote-child-consumption',?,'USD',?)")
        .run(`child-cost:${receipt.operationId}`,experiment.opportunity_id,intent.experimentId,receipt.actualCostUsdCents,JSON.stringify({operationId:receipt.operationId,evidenceSha256:receipt.evidenceSha256}));
    });
    db.prepare('INSERT INTO obolus_child_funding_closures VALUES(?,?,?,?,?)').run(receipt.operationId,payload,receipt.accountRef,receipt.transactionRef,receipt.fundingTransferRef);
    if(row.status==='confirmed')db.prepare('UPDATE children SET funded_amount_cents=MAX(0,funded_amount_cents-?) WHERE address=?').run(intent.amountCents,intent.childAddress);
    if(receipt.additionalDebitUsdCents>0)db.prepare('UPDATE inference_budget_policy SET halted=1,revision=revision+1 WHERE id=1').run();
    pendingChildFundingCost(db);
    return {duplicate:false,actualCostUsdCents:receipt.actualCostUsdCents,additionalCapitalCreditedCents:0,spendingHalted:receipt.additionalDebitUsdCents>0};
  }).immediate();
}
/** Operator-only. A supplied hash is not evidence verification and must never be an agent tool. */
export function reconcileOperation(db:Database,input:ReviewedOperationReceipt) {
  // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
  const ref=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim()&&!/[\u0000-\u001f\u007f]/.test(v);
  if(!input||![input.operationId,input.accountRef,input.transactionRef,input.reviewedBy].every(ref)||
    !/^[a-f0-9]{64}$/.test(input.evidenceSha256)||!Number.isSafeInteger(input.actualCostUsdCents)||input.actualCostUsdCents<0||input.actualCostUsdCents>100000000)throw new Error('Invalid reviewed operation receipt');
  const receipt={operationId:input.operationId,accountRef:input.accountRef,transactionRef:input.transactionRef,
    actualCostUsdCents:input.actualCostUsdCents,evidenceSha256:input.evidenceSha256,reviewedBy:input.reviewedBy};
  assertNoKnownSecrets(receipt);
  const payload=JSON.stringify(receipt);
  return db.transaction(()=>{
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_operation_receipts(operation_id TEXT PRIMARY KEY,account_ref TEXT NOT NULL,transaction_ref TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(account_ref,transaction_ref));
      CREATE TRIGGER IF NOT EXISTS operation_receipt_no_update BEFORE UPDATE ON obolus_operation_receipts BEGIN SELECT RAISE(ABORT,'Immutable receipt'); END;
      CREATE TRIGGER IF NOT EXISTS operation_receipt_no_delete BEFORE DELETE ON obolus_operation_receipts BEGIN SELECT RAISE(ABORT,'Immutable receipt'); END;`);
    const old=db.prepare('SELECT payload FROM obolus_operation_receipts WHERE operation_id=?').get(receipt.operationId) as {payload:string}|undefined;
    if(old){
      if(old.payload!==payload)throw new Error('Conflicting reviewed receipt');
      // A receipt alone cannot prove its linked accounting survived intact.
      // Validate without repairing or booking another expense on replay.
      const operation=db.prepare('SELECT payload,status,actual_cost FROM obolus_reserved_operations WHERE id=?').get(receipt.operationId) as {payload:string;status:string;actual_cost:number}|undefined;
      const intent=operation?JSON.parse(operation.payload):undefined;
      const hold=db.prepare('SELECT usd_cents,purpose FROM aureus_capital_commitments WHERE id=?').get(receipt.operationId) as {usd_cents:number;purpose:string}|undefined;
      const settlement=db.prepare('SELECT actual_usd_cents FROM aureus_capital_settlements WHERE id=?').get(receipt.operationId) as {actual_usd_cents:number}|undefined;
      const event=db.prepare('SELECT opportunity_id,experiment_id,event_type,category,amount_cents,currency,metadata_json FROM economic_events WHERE id=?').get(`reconciled:${receipt.operationId}`) as {opportunity_id:string;experiment_id:string;event_type:string;category:string;amount_cents:number;currency:string;metadata_json:string}|undefined;
      const experiment=typeof intent?.experimentId==='string'?db.prepare('SELECT opportunity_id FROM revenue_experiments WHERE id=?').get(intent.experimentId) as {opportunity_id:string}|undefined:undefined;
      const metadata=event?JSON.parse(event.metadata_json):undefined;
      if(!operation||operation.status!=='settled'||operation.actual_cost!==receipt.actualCostUsdCents||
        !hold||hold.usd_cents!==intent.maxCostUsdCents||hold.purpose!==intent.purpose||
        settlement?.actual_usd_cents!==receipt.actualCostUsdCents||!experiment||!event||
        event.experiment_id!==intent.experimentId||event.opportunity_id!==experiment.opportunity_id||
        event.event_type!=='cost'||event.category!=='reviewed-operation'||event.currency!=='USD'||event.amount_cents!==receipt.actualCostUsdCents||
        metadata?.operationId!==receipt.operationId||metadata?.evidenceSha256!==receipt.evidenceSha256)
        throw new Error('Reviewed operation accounting mismatch');
      return {duplicate:true};
    }
    const row=db.prepare('SELECT payload,status FROM obolus_reserved_operations WHERE id=?').get(receipt.operationId) as {payload:string;status:string}|undefined;
    if(!row||row.status!=='pending')throw new Error('Pending operation required');
    const experimentId=JSON.parse(row.payload).experimentId;
    const experiment=db.prepare('SELECT opportunity_id FROM revenue_experiments WHERE id=?').get(experimentId) as {opportunity_id:string}|undefined;
    if(!experiment)throw new Error('Operation attribution unavailable');
    db.prepare('INSERT INTO obolus_operation_receipts VALUES(?,?,?,?)').run(receipt.operationId,receipt.accountRef,receipt.transactionRef,payload);
    settleReservedOperation(db,receipt.operationId,receipt.actualCostUsdCents,n=>{
      db.prepare(`INSERT INTO economic_events(id,opportunity_id,experiment_id,event_type,category,amount_cents,currency,metadata_json)
        VALUES(?,?,?,'cost','reviewed-operation',?,'USD',?)`).run(`reconciled:${receipt.operationId}`,experiment.opportunity_id,experimentId,n,JSON.stringify({operationId:receipt.operationId,evidenceSha256:receipt.evidenceSha256}));
    });
    return {duplicate:false};
  }).immediate();
}
