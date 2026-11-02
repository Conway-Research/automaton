import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as service from './founder-office-service-plan.mjs';
import {offerScopeDigest} from './founder-offer-feasibility.mjs';
const scope=d=>service.officeEvidenceScopeDigest?.(d)??offerScopeDigest(d.assessmentInput.job,d.assessmentInput.plan);
for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report']){
 const original=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/'+profile+'.json',import.meta.url),'utf8')),expected={...original.binding,profile};
 test(profile+': every material input invalidates old mapping',()=>{
  for(const change of [d=>d.commercialTerms.correctionRounds=99,d=>d.profileInputs[Object.keys(d.profileInputs)[0]]='local:changed',d=>d.assessmentInput.evidence.rightsRef='local:changed']){
   const d=structuredClone(original),m=d.evidenceMapping.find(m=>m.id==='scope');m.ref='local:synthetic';m.scopeDigest=scope(d);assert.ok(!service.inspectOfficeServicePlan(d,expected).missing.includes('evidence.scope'));change(d);assert.ok(service.inspectOfficeServicePlan(d,expected).missing.includes('evidence.scope'));
  }
 });
 test(profile+': reference mapping must match input, capability and profile targets',()=>{
  for(const [id,set] of [['inputs',d=>d.assessmentInput.evidence.customerInputsRef='local:one'],['executor',d=>d.assessmentInput.evidence.capabilities[0].executorRef='local:one'],['profile-'+Object.keys(original.profileInputs)[0],d=>d.profileInputs[Object.keys(d.profileInputs)[0]]='local:one']]){
   const d=structuredClone(original);set(d);const m=d.evidenceMapping.find(m=>m.id===id);m.ref='local:two';m.scopeDigest=scope(d);assert.ok(service.inspectOfficeServicePlan(d,expected).missing.includes('evidence.'+id));m.ref='local:one';const r=service.inspectOfficeServicePlan(d,expected);assert.ok(!r.missing.includes('evidence.'+id));assert.equal(r.workAuthorized,false);assert.equal(r.evidenceVerified,false);
  }
 });
}
const base=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/document-cleanup.json',import.meta.url),'utf8'));
for(const value of ['2026-02-30T12:00:00Z','2025-02-29T12:00:00Z','2100-02-29T12:00:00Z','2026-04-31T12:00:00Z','2026-01-01T24:00:00Z','2026-01-01T12:60:00Z','2026-01-01T12:00:60Z','2026-01-01T12:00:00+14:01','2026-01-01T12:00:00+25:00','2026-01-01'])test('invalid deadline '+value,()=>{const d=structuredClone(base);d.commercialTerms.deadline=value;assert.ok(service.inspectOfficeServicePlan(d,{...d.binding,profile:d.profile}).missing.includes('terms.deadline'));});
for(const value of ['2028-02-29T12:00:00Z','2000-02-29T23:59:59.123Z','2026-04-30T12:00:00+02:00','2026-01-01T12:00:00-14:00'])test('valid calendar deadline '+value,()=>{const d=structuredClone(base);d.commercialTerms.deadline=value;assert.ok(!service.inspectOfficeServicePlan(d,{...d.binding,profile:d.profile}).missing.includes('terms.deadline'));});
test('versioned scope is canonical and excludes mapping metadata but rejects legacy scope',()=>{
 assert.equal(typeof service.officeEvidenceScopeDigest,'function');const d=structuredClone(base),a=scope(d);assert.match(a,/^office-evidence-scope-v1:[a-f0-9]{64}$/);d.evidenceMapping[0].reviewedBy='synthetic';assert.equal(scope(d),a);d.commercialTerms=Object.fromEntries(Object.entries(d.commercialTerms).reverse());assert.equal(scope(d),a);
 const m=d.evidenceMapping.find(m=>m.id==='scope');m.ref='local:synthetic';m.scopeDigest=offerScopeDigest(d.assessmentInput.job,d.assessmentInput.plan);assert.ok(service.inspectOfficeServicePlan(d,{...d.binding,profile:d.profile}).missing.includes('evidence.scope'));
});
