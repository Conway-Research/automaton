import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as office from './founder-office-service-plan.mjs';

const cases=[
 ['2026-07-01T12:00:00+14:00','Europe/Zurich','2026-06-30T22:00:00.000Z','2026-07-01T00:00:00.000','+02:00'],
 ['2026-01-01T00:00:00Z','Europe/Zurich','2026-01-01T00:00:00.000Z','2026-01-01T01:00:00.000','+01:00'],
 ['2026-03-29T00:59:59Z','Europe/Zurich','2026-03-29T00:59:59.000Z','2026-03-29T01:59:59.000','+01:00'],
 ['2026-03-29T01:00:00Z','Europe/Zurich','2026-03-29T01:00:00.000Z','2026-03-29T03:00:00.000','+02:00'],
 ['2026-10-25T00:30:00Z','Europe/Zurich','2026-10-25T00:30:00.000Z','2026-10-25T02:30:00.000','+02:00'],
 ['2026-10-25T01:30:00Z','Europe/Zurich','2026-10-25T01:30:00.000Z','2026-10-25T02:30:00.000','+01:00'],
 ['2026-01-01T00:00:00.123Z','Asia/Kathmandu','2026-01-01T00:00:00.123Z','2026-01-01T05:45:00.123','+05:45'],
 ['2026-01-01T00:00:00Z','Asia/Kolkata','2026-01-01T00:00:00.000Z','2026-01-01T05:30:00.000','+05:30'],
 ['2026-01-01T00:00:00Z','America/New_York','2026-01-01T00:00:00.000Z','2025-12-31T19:00:00.000','-05:00'],
 ['2026-01-01T00:00:00Z','UTC','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000','+00:00']
];
for(const [deadline,timezone,utc,local,offset] of cases)test(deadline+' in '+timezone,()=>{
 const r=office.officeDeadlineReceipt(deadline,timezone);
 assert.equal(r.status,'normalized');assert.equal(r.originalDeadline,deadline);assert.equal(r.timezone,timezone);
 assert.equal(r.utc,utc);assert.equal(r.localDateTime,local);assert.equal(r.offset,offset);assert.equal(r.customerConfirmed,false);
});
test('invalid and missing inputs never produce a guessed instant',()=>{
 for(const [d,z] of [[null,'UTC'],['2026-02-30T00:00:00Z','UTC'],['2026-10-25T02:30:00','Europe/Zurich'],['2026-01-01T00:00:00Z',null],['2026-01-01T00:00:00Z','invalid/zone']]){
  const r=office.officeDeadlineReceipt(d,z);assert.equal(r.status,'incomplete');assert.equal(r.utc,null);assert.equal(r.localDateTime,null);assert.equal(r.offset,null);
 }
});
for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report'])test(profile+': receipt is derived without changing contract or authority',()=>{
 const d=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/'+profile+'.json',import.meta.url),'utf8'));
 d.commercialTerms.deadline=cases[0][0];d.commercialTerms.timezone=cases[0][1];const before=JSON.stringify(d);
 const r=office.inspectOfficeServicePlan(d,{...d.binding,profile});assert.equal(r.deadlineReceipt.utc,cases[0][2]);assert.equal(JSON.stringify(d),before);
 assert.equal(r.workAuthorized,false);assert.equal(r.deliveryAuthorized,false);assert.ok(r.missing.includes('finished-package-customer-release'));
});
