import test from 'node:test';import assert from 'node:assert/strict';import {referenceScope} from './founder-reference-approvals.mjs';import {digest} from './founder-restoration-integrity.mjs';
test('reference approval scope rejects invalid invoice rows even with a matching digest',()=>{
 const valid={sourceId:'source',externalId:'order',ownerId:'owner',rootTaskId:'root',sourceRevision:'v1',scopeDigest:'scope',profileId:'structured-data'};
 for(const rows of [[],{},[{id:'a',amountMinor:-1,currency:'CHF'}],[{id:'a',amountMinor:1,currency:'CHF'},{id:'a',amountMinor:2,currency:'CHF'}],[{id:'a',amountMinor:1,currency:'CHF',extra:'x'}],[{id:'a',amountMinor:Number.MAX_SAFE_INTEGER,currency:'CHF'},{id:'b',amountMinor:1,currency:'CHF'}]]){
  assert.throws(()=>referenceScope({...valid,qualityContract:{profile:'invoice-reconciliation-v1',referenceRows:rows,referenceDigest:digest(rows),evidenceRef:'contract:reference'}}));
 }
});
import {createReferenceAdmin} from './founder-reference-admin.mjs';
test('invalid provenance cannot enter reference administration and never writes approvals',()=>{
 const rows=[{id:'a',amountMinor:1,currency:'CHF'}],base={sourceId:'source',externalId:'order',ownerId:'owner',rootTaskId:'root',sourceRevision:'v1',scopeDigest:'scope',profileId:'structured-data'},q={profile:'invoice-reconciliation-v1',referenceRows:rows,referenceDigest:digest(rows),evidenceRef:'contract:reference'};
 for(const qualityContract of [{...q,evidenceRef:'https://example.invalid'},{...q,extra:true},{...q,referenceRows:[],referenceDigest:digest([])}]){
  let writes=0;const store={snapshot:()=>({referenceApprovals:[],referenceWithdrawals:[],acceptanceProtocols:[]}),recordReferenceApproval:()=>{writes++;}};
  const admin=createReferenceAdmin({store,readProducts:()=>[{id:'candidate',product:{binding:{...base,qualityContract},files:[]}}],readPower:()=>({enabled:false}),reviewerId:'reviewer'});
  assert.equal(admin.snapshot().candidateReadStatus,'unavailable');assert.throws(()=>admin.prepare({candidateId:'candidate'},'session'));assert.equal(writes,0);
 }
});
test('valid multiple-currency reference scopes remain stable without granting execution',()=>{
 const rows=[{id:'a',amountMinor:0,currency:'CHF'},{id:'b',amountMinor:Number.MAX_SAFE_INTEGER,currency:'USD'}],binding={sourceId:'source',externalId:'order',ownerId:'owner',rootTaskId:'root',sourceRevision:'v1',scopeDigest:'scope',profileId:'structured-data',qualityContract:{profile:'invoice-reconciliation-v1',referenceRows:rows,referenceDigest:digest(rows),evidenceRef:'contract:reference'}};
 const before=structuredClone(binding);assert.equal(referenceScope(binding).contractDigest,digest(binding.qualityContract));assert.deepEqual(binding,before);
});
