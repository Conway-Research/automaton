import {it,expect} from 'vitest';
import {createDatabase} from '../state/database.js';
import {GATE_DOMAINS,registerActionReview,evaluateActionGate,assertActionGate,containSecurityIncident,
 revokeActionReview,selectSafeAlternative,actionContextDigest,securityTransaction,type ReviewedAction} from '../security/action-gate.js';
const scope={activity:'product-release',component:'product-a',contextDigest:actionContextDigest({version:1})};
const review=():ReviewedAction=>({...scope,reviewedBy:'fixture-operator',classification:'PUBLIC',evidence:GATE_DOMAINS.map(domain=>({domain,
 requirement:domain,jurisdiction:'CH',source:'https://example.invalid/synthetic-fixture',sourceDigest:'a'.repeat(64),
 observedAt:1000,expiresAt:2000,decision:'APPROVED',reason:'Synthetic local test only'}))});
it('does not use a review from the future after clock rollback',()=>{
 const db=createDatabase(':memory:');try{
  registerActionReview(db.raw,review(),1500);
  expect(evaluateActionGate(db.raw,scope,1400)).toEqual({state:'BLOCKED',reason:'REVIEW_CLOCK_INVALID'});
  expect(evaluateActionGate(db.raw,scope,1500).state).toBe('APPROVED');
  expect(()=>registerActionReview(db.raw,review(),NaN)).toThrow('clock');
 }finally{db.close();}
});
it.each(['field','processor'] as const)('rejects ambiguous privacy %s inventories without granting approval',kind=>{
 const db=createDatabase(':memory:');try{
  const value:ReviewedAction={...review(),dataClass:'PERSONAL',classification:'PERSONAL',privacy:{purpose:'delivery',minimumFields:['order'],retentionDays:1,processors:[{id:'local',country:'CH',purpose:'delivery'}]}};
  if(kind==='field')value.privacy!.minimumFields.push('order');
  else value.privacy!.processors.push({id:'local',country:'US',purpose:'marketing'});
  expect(()=>registerActionReview(db.raw,value,1500)).toThrow('Ambiguous privacy');
  expect(evaluateActionGate(db.raw,value,1500).state).toBe('INSUFFICIENT_EVIDENCE');
 }finally{db.close();}
});
it('security: rejects sparse required-evidence profiles before evaluation',()=>{
 const db=createDatabase(':memory:');try{
  registerActionReview(db.raw,review(),1500);
  expect(()=>evaluateActionGate(db.raw,scope,1500,Array(1))).toThrow('Invalid required evidence profile');
 }finally{db.close();}
});
it.each(['fields','processors','claims'] as const)('security: rejects sparse %s before writing approval evidence',kind=>{
 const db=createDatabase(':memory:');try{
  const value=review();
  if(kind==='claims')value.claimInventory=Array(1);
  else{
   value.dataClass='PERSONAL';value.classification='PERSONAL';
   value.privacy={purpose:'synthetic',minimumFields:kind==='fields'?Array(1):['name'],retentionDays:1,
    processors:kind==='processors'?Array(1):[{id:'fixture',country:'CH',purpose:'synthetic'}]};
  }
  expect(()=>registerActionReview(db.raw,value,1500)).toThrow();
  const exists=db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_action_reviews'").get();
  if(exists)expect(db.raw.prepare('SELECT count(*) n FROM obolus_action_reviews').get()).toEqual({n:0});
 }finally{db.close();}
});
it('security: failed nested admission rolls back effects but durably records exactly one denial',()=>{
 const db=createDatabase(':memory:');try{
  db.raw.exec('CREATE TABLE admission_fixture(id INTEGER)');
  expect(()=>securityTransaction(db.raw,()=>{
   db.raw.prepare('INSERT INTO admission_fixture VALUES(1)').run();
   securityTransaction(db.raw,()=>assertActionGate(db.raw,scope,1500)).immediate();
  }).immediate()).toThrow('INSUFFICIENT_EVIDENCE');
  expect(db.raw.prepare('SELECT * FROM admission_fixture').all()).toHaveLength(0);
  expect(db.raw.prepare('SELECT state FROM obolus_security_audit').all()).toEqual([{state:'INSUFFICIENT_EVIDENCE'}]);
  expect(()=>db.raw.exec('DELETE FROM obolus_security_audit')).toThrow('immutable');
  expect(()=>db.raw.exec("UPDATE obolus_security_audit SET state='APPROVED'")).toThrow('immutable');
 }finally{db.close();}
});
it('security: fresh trusted revalidation is append-only and an old review cannot reset expiry',()=>{
 const db=createDatabase(':memory:');try{
  registerActionReview(db.raw,review(),1500);
  const fresh={...review(),evidence:review().evidence.map(e=>({...e,observedAt:2001,expiresAt:3000}))};
  registerActionReview(db.raw,fresh,2001);
  expect(evaluateActionGate(db.raw,scope,2100).state).toBe('APPROVED');
  expect(()=>registerActionReview(db.raw,review(),1500)).toThrow('newer');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_action_reviews').get()).toEqual({n:2});
  expect(evaluateActionGate(db.raw,scope,3000).state).toBe('STALE_EVIDENCE');
 }finally{db.close();}
});
it('security: unknown state and agent-provided approval fields never authorize an action',()=>{
 const db=createDatabase(':memory:');try{
  expect(evaluateActionGate(db.raw,{...scope,approved:true} as typeof scope,1500).state).toBe('INSUFFICIENT_EVIDENCE');
  expect(()=>assertActionGate(db.raw,scope,1500)).toThrow('INSUFFICIENT_EVIDENCE');
  for(const change of [{evidence:[]},{evidence:review().evidence.map(e=>({...e,jurisdiction:''}))},
   {evidence:review().evidence.map(e=>({...e,source:'approved by the model'}))}])
   expect(()=>registerActionReview(db.raw,{...review(),...change},1500)).toThrow();
 }finally{db.close();}
});
it('security: reviews bind component and context; expiry, denial and uncertainty fail closed',()=>{
 const db=createDatabase(':memory:');try{
  registerActionReview(db.raw,review(),1500);
  expect(evaluateActionGate(db.raw,scope,1500).state).toBe('APPROVED');
  expect(evaluateActionGate(db.raw,{...scope,component:'product-b'},1500).state).toBe('INSUFFICIENT_EVIDENCE');
  expect(evaluateActionGate(db.raw,{...scope,contextDigest:'b'.repeat(64)},1500).state).toBe('INSUFFICIENT_EVIDENCE');
  expect(evaluateActionGate(db.raw,scope,2000).state).toBe('STALE_EVIDENCE');
  for(const decision of ['BLOCKED','REVIEW_REQUIRED'] as const){
   const different={...review(),component:decision,evidence:review().evidence.map(e=>({...e,decision}))};
   registerActionReview(db.raw,different,1500);expect(evaluateActionGate(db.raw,different,1500).state).toBe(decision);
  }
 }finally{db.close();}
});
it('security: alternative search cannot reinterpret revoked actions or cross product boundaries',()=>{
 const db=createDatabase(':memory:');try{
  registerActionReview(db.raw,review(),1500);revokeActionReview(db.raw,scope);
  expect(selectSafeAlternative(db.raw,scope,[scope,{...scope,component:'fake-safe'}],1500)).toBeNull();
  const alternative={...review(),activity:'local-simulation'};registerActionReview(db.raw,alternative,1500);
  expect(selectSafeAlternative(db.raw,scope,[scope,alternative],1500)).toEqual(alternative);
  containSecurityIncident(db.raw);
  expect(evaluateActionGate(db.raw,alternative,1500).state).toBe('BLOCKED');
  expect(()=>db.raw.exec('DELETE FROM obolus_security_halt')).toThrow('trusted recovery');
  expect(()=>db.raw.exec('DELETE FROM obolus_action_reviews')).toThrow('immutable');
 }finally{db.close();}
});
