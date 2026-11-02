import {afterEach,it,expect,vi} from "vitest";
import {createLogger,StructuredLogger} from "../observability/logger.js";
import {registerLogSecrets,registerConfigurationSecrets,assertNoKnownSecrets,redactLogText} from "../observability/redaction.js";
import {createDatabase} from '../state/database.js';
import {SemanticMemoryManager} from '../memory/semantic.js';
import {RevenueStore} from '../revenue/store.js';
import {ProceduralMemoryManager} from '../memory/procedural.js';
import {RelationshipMemoryManager} from '../memory/relationship.js';
import {recordReconciledCash} from '../revenue/capital-receipts.js';
import {recordReconciledPayout} from '../revenue/payout-reconciliation.js';
import {reconcileOperation} from '../revenue/operation-reconciliation.js';
afterEach(()=>{StructuredLogger.resetSink();vi.unstubAllEnvs();vi.restoreAllMocks();});
it('registers nested configuration credentials including arrays and cyclic containers',()=>{
 const secret='synthetic-nested-credential-7262';
 const config:Record<string,unknown>={providers:[{credentials:{apiKey:secret}}]};config.self=config;
 registerConfigurationSecrets(config);
 expect(redactLogText(secret)).toBe('[REDACTED]');
 expect(()=>assertNoKnownSecrets({text:secret})).toThrow('Credential material');
});
it.each(['RSA ','EC ','OPENSSH ','ENCRYPTED ',''])('redacts complete unregistered %sPEM private key blocks',kind=>{
 const body='SYNTHETIC_NOT_A_REAL_KEY_BODY_7262';
 const pem=`-----BEGIN ${kind}PRIVATE KEY-----\n${body}\n-----END ${kind}PRIVATE KEY-----`;
 const result=redactLogText(`before ${pem} after`);
 expect(result).not.toContain(body);expect(result).toContain('before');expect(result).toContain('after');
});
it('redacts incomplete PEM private key blocks through end of message',()=>{
 const body='SYNTHETIC_INCOMPLETE_KEY_BODY_7262';
 expect(redactLogText(`-----BEGIN PRIVATE KEY-----\n${body}`)).not.toContain(body);
});
it('rejects and redacts common encoded forms of registered secrets',()=>{
 const secret='fixture/private+encoded?secret=123';registerLogSecrets([secret]);
 for(const value of [secret,encodeURIComponent(secret),Buffer.from(secret).toString('base64'),Buffer.from(secret).toString('base64url')]){
  expect(()=>assertNoKnownSecrets({content:value})).toThrow('Credential material');
  expect(redactLogText(value)).toBe('[REDACTED]');
 }
});
it.each(['cash','payout','operation'])('rejects known secrets before %s receipt persistence or accounting',kind=>{
  const db=createDatabase(':memory:'),secret='fixture-private-receipt-material-123';registerLogSecrets([secret]);
  const cash={accountRef:'fixture-account',transactionRef:'fixture-transaction',kind:'receipt' as const,cashChfCents:100,retainedChfCents:0,evidenceSha256:'a'.repeat(64),reviewedBy:'fixture operator'};
  try{
    const action=()=>kind==='cash'?recordReconciledCash(db.raw,{...cash,accountRef:secret}):
      kind==='payout'?recordReconciledPayout(db.raw,{providerAccount:secret,payoutId:'payout',mode:'live',cash}):
      reconcileOperation(db.raw,{operationId:'operation',accountRef:'account',transactionRef:'transaction',actualCostUsdCents:1,evidenceSha256:'b'.repeat(64),reviewedBy:secret});
    expect(action).toThrow('Credential material');
    expect(db.raw.prepare("SELECT name FROM sqlite_master WHERE name IN ('aureus_reconciled_cash','obolus_reconciled_payouts','obolus_operation_receipts')").all()).toEqual([]);
    expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
  }finally{db.close();}
});
it("redacts configured and environmental secrets from messages, context, errors and stacks",()=>{
  registerLogSecrets(["fixture-secret-known-123"]);
  vi.stubEnv("EXAMPLE_API_KEY","fixture-environment-key-123");
  const rows:unknown[]=[];StructuredLogger.setSink(row=>rows.push(row));
  createLogger("test").error("fixture-secret-known-123 https://user:pass@example.invalid/a?token=sensitive",
    new Error("fixture-environment-key-123"),{apiKey:"arbitrary-short-secret",nested:{privateKey:"another-secret"},count:42});
  const output=JSON.stringify(rows);
  for(const value of ["fixture-secret-known-123","fixture-environment-key-123","arbitrary-short-secret","another-secret","user:pass","token=sensitive"])expect(output).not.toContain(value);
  expect(output).toContain("REDACTED");expect(output).toContain("42");
});
it("does not leak the original message when the sink throws",()=>{
  StructuredLogger.setSink(()=>{throw new Error("sink failed");});
  const output=vi.spyOn(process.stderr,"write").mockImplementation(()=>true);
  createLogger("test").info("private unstructured message");
  expect(output).toHaveBeenCalledWith("[logger-fallback] Log entry could not be safely serialized\n");
});
it('rejects known credentials before semantic or economic persistence',()=>{
  const db=createDatabase(':memory:');registerLogSecrets(['fixture-memory-secret-123']);
  try{
    expect(()=>new SemanticMemoryManager(db.raw).store({category:'self',key:'credential',value:'fixture-memory-secret-123',source:'test'}))
      .toThrow('Credential material');
    expect(()=>new RevenueStore(db.raw).addEconomicEvent({opportunityId:null,experimentId:null,goalId:null,taskId:null,
      eventType:'cost',category:'test',amountCents:1,currency:'USD',channel:null,offer:null,customerRef:null,
      metadata:{value:'fixture-memory-secret-123'},occurredAt:new Date().toISOString()})).toThrow('Credential material');
    expect(db.raw.prepare('SELECT COUNT(*) n FROM semantic_memory').get()).toEqual({n:0});
    expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
  }finally{db.close();}
});
it('returns the actual persistent identity when lessons or relationships are updated',()=>{
  const db=createDatabase(':memory:');
  try{
    const procedures=new ProceduralMemoryManager(db.raw),relationships=new RelationshipMemoryManager(db.raw);
    const id=procedures.save({name:'validated',description:'initial',steps:[]});
    expect(procedures.save({name:'validated',description:'improved',steps:[]})).toBe(id);
    const entity=relationships.record({entityAddress:'test-entity',relationshipType:'customer'});
    expect(relationships.record({entityAddress:'test-entity',relationshipType:'customer',notes:'updated'})).toBe(entity);
    db.raw.exec('DROP TABLE semantic_memory');StructuredLogger.setSink(()=>{});
    expect(()=>new SemanticMemoryManager(db.raw).store({category:'self',key:'test',value:'test',source:'test'})).toThrow('persistence failed');
  }finally{db.close();}
});
