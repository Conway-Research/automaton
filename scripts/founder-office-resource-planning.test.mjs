import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {normalizeInventory} from './founder-source-registry.mjs';
import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';
for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report'])test(profile+': complete resources include conflicts and explicit lifecycle survives reopen',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'office-planning-')),workPackages={rows:[{id:'u',label:'ugig',inventoryKind:'core'}]},sourceId=normalizeInventory({},workPackages).sources[0].id;
 let enabled=false,service;const options={base,directory:path.join(base,'state'),isEnabled:()=>enabled,workPackages,execution:{sources:[createMarketplaceWorkSource({platform:'ugig',sourceId,isEnabled:()=>false,readAssignment:()=>{throw Error('network forbidden');}})]}};
 try{
  service=openOrderRestoration(options);
  const windows=[{start:'2026-06-30T20:00:00Z',end:'2026-06-30T22:00:00Z',capacityMinutes:120}],calendar={resourceId:'r',calendarRevision:'v1',bookingsComplete:true,bookings:[],windows};
  service.registerOfficeCalendar(calendar,0);service.registerOfficeCalendar({...calendar,resourceId:'other'},0);
  const assignments=[];
  for(let i=0;i<2;i++){
   const doc=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/'+profile+'.json',import.meta.url),'utf8'));
   doc.binding.gig='synthetic-gig-'+i;doc.binding.applicationId='synthetic-application-'+i;
   doc.commercialTerms.deadline='2026-06-30T22:00:00Z';doc.commercialTerms.timezone='UTC';
   for(const p of doc.assessmentInput.plan.phases)p.hours=0.5;
   doc.assessmentInput.plan.capacitySchedule={start:windows[0].start,calendarComplete:true,prerequisitesReady:true,availabilityRef:'local:synthetic',capacityModel:'flexible-within-window',windows};
   doc.assessmentInput.plan.phaseSchedule={model:'sequential-preemptible-elapsed-minutes',order:doc.assessmentInput.plan.phases.map(p=>p.id),timing:doc.assessmentInput.plan.phases.map(p=>({phaseId:p.id,notBefore:windows[0].start,minElapsedMinutes:0,after:[]}))};
   const key={sourceId,externalId:'synthetic-'+i,ownerId:'synthetic-owner'};
   service.store.register({...key,rootTaskId:'root-'+i,sourceRevision:'r1',state:'discovered',gigId:doc.binding.gig,applicationId:doc.binding.applicationId,conversationId:doc.binding.conversationId,workKind:profile,provenance:{type:'reviewed-local-registration',ownerId:key.ownerId,evidenceRef:'synthetic'}});
   const plan=service.registerOfficeServicePlan(key,'r1',doc,0);assignments.push(service.registerOfficeResourceAssignment(plan.key,1,'r',1,0));
  }
  const [a,b]=assignments,ordersBefore=JSON.stringify(service.store.snapshot());
  assert.equal(service.inspectCompleteOfficeResources(['r']).issues.length,2);
  service.setOfficePlanningStatus(a.key,1,'included',0);service.setOfficePlanningStatus(b.key,1,'draft',0);
  assert.equal(service.inspectCompleteOfficeResources(['r']).status,'consistent');
  const booked={...calendar,resourceId:'booked-only',bookings:['one','two'].map(bookingId=>({bookingId,windowIndex:0,startedUtc:'2026-06-30T20:00:00.000Z',finishedUtc:'2026-06-30T21:30:00.000Z'}))};
  service.registerOfficeCalendar(booked,0);
  for(const ids of [['booked-only'],['r','booked-only']]){const result=service.inspectCompleteOfficeResources(ids);assert.equal(result.status,'conflict');assert.equal(result.complete,true);assert.ok(result.reviews.find(r=>r.resourceId==='booked-only').review.conflicts.some(c=>c.kind==='window-budget-exceeded'));assert.equal(result.sendAuthorized,false);}
  service.close();service=openOrderRestoration(options);assert.equal(service.inspectCompleteOfficeResources(['booked-only']).status,'conflict');
  service.setOfficePlanningStatus(b.key,1,'included',1);
  const conflict=service.inspectCompleteOfficeResources(['r']);assert.equal(conflict.status,'conflict');assert.equal(conflict.included.length,2);assert.equal(conflict.workAuthorized,false);
  assert.equal(service.inspectCompleteOfficeResources(['other']).status,'no-included-plans');
  service.setOfficePlanningStatus(b.key,1,'withdrawn',2);
  service.close();service=openOrderRestoration(options);
  const clear=service.inspectCompleteOfficeResources(['r']);assert.equal(clear.status,'consistent');assert.equal(clear.excluded[0].status,'withdrawn');assert.notEqual(clear.snapshotDigest,conflict.snapshotDigest);
  assert.throws(()=>service.setOfficePlanningStatus(b.key,1,'included',2),/version/i);
  service.setOfficePlanningStatus(b.key,1,'included',3);assert.equal(service.inspectCompleteOfficeResources(['r']).status,'conflict');
  service.registerOfficeResourceAssignment(b.key,1,'other',1,1);
  assert.equal(service.inspectCompleteOfficeResources(['r','other']).status,'undetermined');
  service.setOfficePlanningStatus(b.key,2,'included',4);assert.equal(service.inspectCompleteOfficeResources(['r','other']).status,'consistent');
  service.registerOfficeCalendar({...calendar,calendarRevision:'v2'},1);
  assert.equal(service.inspectCompleteOfficeResources(['r']).issues[0].reason,'stale-assignment-dependency');
  service.setOfficePlanningStatus(a.key,1,'withdrawn',1);assert.equal(service.inspectCompleteOfficeResources(['r']).status,'no-included-plans');
  service.registerOfficeCalendar({...calendar,calendarRevision:'v3',bookings:booked.bookings},2);
  const retired=service.inspectCompleteOfficeResources(['r']);assert.equal(retired.included.length,0);assert.equal(retired.status,'conflict');assert.equal(retired.customerConfirmed,false);
  assert.equal(service.inspectCompleteOfficeResources(['missing']).complete,false);
  assert.throws(()=>service.inspectCompleteOfficeResources(['r','r']));
  enabled=true;assert.throws(()=>service.setOfficePlanningStatus(a.key,1,'draft',2),/OFF/);enabled=false;
  assert.equal(JSON.stringify(service.store.snapshot()),ordersBefore);assert.equal(service.status().execution.products,0);
 }finally{service?.close();assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(base,{recursive:true,force:true});}
});
