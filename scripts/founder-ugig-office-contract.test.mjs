import test from 'node:test';import assert from 'node:assert/strict';
import {officeFixture} from './founder-ugig-office-fixture.mjs';
import {officeScopeDigest,validateOfficeWork,validateOfficeRelease,officeGenerationKey} from './founder-ugig-office-contract.mjs';
test('public work agreement needs no output manifest',()=>{const f=officeFixture();assert.equal(validateOfficeWork(f.a).valid,true);assert.equal(validateOfficeRelease({agreement:f.a,result:{},releasePack:null,now:f.now}).valid,false);});
for(const key of ['sourceRevision','buyerId','generatorVersion','requiredFiles','specRef','paymentTerms'])test('scope binds '+key,()=>{const f=officeFixture(),a=structuredClone(f.a);a[key]=null;assert.notEqual(officeScopeDigest(a),f.a.scopeDigest);assert.equal(validateOfficeWork(a).valid,false);assert.notEqual(officeGenerationKey(a),officeGenerationKey(f.a));});
for(const mutate of [a=>a.extra=true,a=>a.schema='unknown',a=>a.privacy='private',a=>a.specRef.privacy='unknown',a=>a.processing.approved=false])test('invalid agreement blocks',()=>{const {a}=officeFixture();mutate(a);a.scopeDigest=officeScopeDigest(a);assert.equal(validateOfficeWork(a).valid,false);});
test('JSON key order does not change scope',()=>{const {a}=officeFixture();assert.equal(officeScopeDigest(Object.fromEntries(Object.entries(a).reverse())),a.scopeDigest);});
