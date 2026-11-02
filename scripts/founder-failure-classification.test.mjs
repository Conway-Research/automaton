import test from 'node:test';import assert from 'node:assert/strict';
import {classifyLocalFailure,communicationRetryAllowed} from './founder-failure-classification.mjs';

test('communication retries only transient reads, not permanent guards or uncertain writes',()=>{
 for(const message of ['Communication HTTP 401','Communication HTTP 403','Communication HTTP 404','GitHub access required','Conversation binding required','Communication outcome uncertain; reconcile before retry','unknown private failure'])assert.equal(communicationRetryAllowed(Error(message)),false,message);
 for(const message of ['Communication HTTP 429','Communication HTTP 503','Communication access/rate cooldown'])assert.equal(communicationRetryAllowed(Error(message)),true,message);
 assert.equal(classifyLocalFailure(Error('Communication HTTP 404')).code,'policy_blocked');
 assert.equal(communicationRetryAllowed(Object.assign(Error('private server text'),{name:'TimeoutError'})),true);
});
test('known eligibility and stale-evidence gates retain their cause without secrets',()=>{
 assert.equal(classifyLocalFailure(Error('Job not eligible for autonomous communication')).code,'policy_blocked');
 assert.equal(classifyLocalFailure(Error('Current independently observed source receipt unavailable: ugig')).code,'source_evidence_unavailable');
 assert.equal(classifyLocalFailure(Error('Source action blocked: capability-unverified-or-expired')).code,'source_evidence_unavailable');
 assert.equal(classifyLocalFailure(Error('Communication HTTP 401')).code,'service_unauthorized');
 assert.equal(classifyLocalFailure(Error('secret token private')).code,'local_read_failed');
 assert.ok(!JSON.stringify(classifyLocalFailure(Error('secret token private'))).includes('secret'));
});
