import {createHash} from 'node:crypto';
import type {Database} from 'better-sqlite3';
import {DigitalDelivery} from './delivery.js';
import {runReservedOperation,settleReservedOperation} from '../revenue/reserved-operation.js';

/** Trusted local catalogue adapter. Registers bytes only: no checkout, publication or provider call.
 * Cross-database failure remains pending for reconciliation; never automatically retries an effect.
 */
export async function registerExperimentProduct(ledger:Database,commerce:Database,input:{
  operationId:string;experimentId:string;productId:string;filename:string;content:Buffer;
}) {
  if(!input||!Buffer.isBuffer(input.content)||input.content.length<1||input.content.length>10*1024*1024||
    typeof input.productId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.productId)||
    typeof input.filename!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(input.filename)||input.filename.includes('..'))throw new Error('Invalid product asset');
  const {operationId,experimentId,productId,filename}=input;
  const content=Buffer.from(input.content);
  const sha256=createHash('sha256').update(content).digest('hex');
  const config=commerce.prepare('SELECT mode,account_id FROM commerce_stripe_config WHERE id=1').get() as {mode:string;account_id:string}|undefined;
  if(!config||!['test','live'].includes(config.mode))throw new Error('Commerce workspace required');
  const purpose=JSON.stringify({action:'register-product',account:config.account_id,mode:config.mode,productId,filename,sha256});
  const result=await runReservedOperation(ledger,{id:operationId,experimentId,adapter:'local-product',purpose,maxCostUsdCents:0},async()=>{
    // Existing orders must not acquire previously absent bytes through this adapter.
    commerce.transaction(()=>{
      if(commerce.prepare("SELECT 1 FROM commerce_orders WHERE json_extract(offer,'$.productId')=? LIMIT 1").get(productId))
        throw new Error('Product already referenced by an order; review required');
      new DigitalDelivery(commerce).register(productId,filename,content);
      commerce.exec(`CREATE TABLE IF NOT EXISTS obolus_product_experiments(
        product_id TEXT PRIMARY KEY,experiment_id TEXT NOT NULL,operation_id TEXT NOT NULL,sha256 TEXT NOT NULL);
        CREATE TRIGGER IF NOT EXISTS obolus_product_binding_update BEFORE UPDATE ON obolus_product_experiments BEGIN SELECT RAISE(ABORT,'Product binding immutable'); END;
        CREATE TRIGGER IF NOT EXISTS obolus_product_binding_delete BEFORE DELETE ON obolus_product_experiments BEGIN SELECT RAISE(ABORT,'Product binding immutable'); END;`);
      const prior=commerce.prepare('SELECT experiment_id,operation_id,sha256 FROM obolus_product_experiments WHERE product_id=?').get(productId) as {experiment_id:string;operation_id:string;sha256:string}|undefined;
      if(prior&&(prior.experiment_id!==experimentId||prior.operation_id!==operationId||prior.sha256!==sha256))throw new Error('Conflicting product experiment binding');
      commerce.prepare('INSERT OR IGNORE INTO obolus_product_experiments VALUES(?,?,?,?)').run(productId,experimentId,operationId,sha256);
    }).immediate();
    return {actualCostUsdCents:0};
  },()=>{});
  const stored=commerce.prepare('SELECT filename,sha256,content FROM commerce_assets WHERE product_id=?').get(productId) as {filename:string;sha256:string;content:Buffer}|undefined;
  if(!stored||stored.filename!==filename||stored.sha256!==sha256||createHash('sha256').update(stored.content).digest('hex')!==sha256)
    throw new Error('Registered asset missing or changed; reconciliation required');
  const bound=commerce.prepare('SELECT experiment_id,operation_id,sha256 FROM obolus_product_experiments WHERE product_id=?').get(productId) as {experiment_id:string;operation_id:string;sha256:string}|undefined;
  if(!bound||bound.experiment_id!==experimentId||bound.operation_id!==operationId||bound.sha256!==sha256)throw new Error('Product attribution requires reconciliation');
  return {...result,productId,sha256,bytes:content.length,publication:'not performed'};
}

/** Verify an already completed local effect; never create an asset or rerun an adapter. */
export function reconcileLocalProduct(ledger:Database,commerce:Database,operationId:string) {
  if(typeof operationId!=='string'||!/^op_[A-Za-z0-9_-]{1,90}$/.test(operationId))throw new Error('Invalid operation ID');
  return commerce.transaction(()=>ledger.transaction(()=>{
    const operation=ledger.prepare('SELECT payload FROM obolus_reserved_operations WHERE id=?').get(operationId) as {payload:string}|undefined;
    if(!operation)throw new Error('Unknown product operation');
    const admitted=JSON.parse(operation.payload);
    if(admitted.adapter!=='local-product'||admitted.maxCostUsdCents!==0)throw new Error('Zero-cost local product operation required');
    const purpose=JSON.parse(admitted.purpose);
    const config=commerce.prepare('SELECT mode,account_id FROM commerce_stripe_config WHERE id=1').get() as {mode:string;account_id:string}|undefined;
    if(purpose.action!=='register-product'||!config||config.mode!==purpose.mode||config.account_id!==purpose.account)throw new Error('Product workspace mismatch');
    const asset=commerce.prepare('SELECT filename,sha256,content FROM commerce_assets WHERE product_id=?').get(purpose.productId) as {filename:string;sha256:string;content:Buffer}|undefined;
    const binding=commerce.prepare('SELECT experiment_id,operation_id,sha256 FROM obolus_product_experiments WHERE product_id=?').get(purpose.productId) as {experiment_id:string;operation_id:string;sha256:string}|undefined;
    if(!asset||!binding||asset.filename!==purpose.filename||asset.sha256!==purpose.sha256||
      !Buffer.isBuffer(asset.content)||asset.content.length<1||asset.content.length>10*1024*1024||
      createHash('sha256').update(asset.content).digest('hex')!==purpose.sha256||binding.sha256!==purpose.sha256||
      binding.experiment_id!==admitted.experimentId||binding.operation_id!==operationId)throw new Error('Product evidence mismatch; reservation retained');
    const result=settleReservedOperation(ledger,operationId,0,()=>{});
    ledger.exec(`CREATE TABLE IF NOT EXISTS obolus_local_product_reconciliations(operation_id TEXT PRIMARY KEY,evidence TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')));
      CREATE TRIGGER IF NOT EXISTS local_product_reconciliation_update BEFORE UPDATE ON obolus_local_product_reconciliations BEGIN SELECT RAISE(ABORT,'Immutable local evidence'); END;
      CREATE TRIGGER IF NOT EXISTS local_product_reconciliation_delete BEFORE DELETE ON obolus_local_product_reconciliations BEGIN SELECT RAISE(ABORT,'Immutable local evidence'); END;`);
    const evidence=JSON.stringify({experimentId:admitted.experimentId,...purpose});
    const old=ledger.prepare('SELECT evidence FROM obolus_local_product_reconciliations WHERE operation_id=?').get(operationId) as {evidence:string}|undefined;
    if(old&&old.evidence!==evidence)throw new Error('Conflicting local product evidence');
    ledger.prepare('INSERT OR IGNORE INTO obolus_local_product_reconciliations(operation_id,evidence) VALUES(?,?)').run(operationId,evidence);
    return {...result,productId:purpose.productId,sha256:purpose.sha256,reexecuted:false};
  }).immediate()) .immediate();
}
