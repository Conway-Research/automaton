import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {inspectOfficeServicePlan,officeEvidenceScopeDigest} from './founder-office-service-plan.mjs';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {normalizeInventory} from './founder-source-registry.mjs';
import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';
for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report']){
 const doc=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/'+profile+'.json',import.meta.url),'utf8')),expected={...doc.binding,profile};
 test(profile+': removed, empty and malformed required fields remain reported',()=>{
  for(const value of [undefined,{},'']){const d=structuredClone(doc);d.commercialTerms=value;d.profileInputs=value;const r=inspectOfficeServicePlan(d,expected);assert.ok(r.missing.includes('terms.deadline'));for(const k of Object.keys(doc.profileInputs))assert.ok(r.missing.includes('profile-input.'+k));assert.equal(r.workAuthorized,false);}
  for(const value of [{},' ',42]){const d=structuredClone(doc);d.commercialTerms.deadline=value;d.evidenceMapping.find(m=>m.id==='funding').ref=value;const r=inspectOfficeServicePlan(d,expected);assert.ok(r.missing.includes('terms.deadline'));assert.ok(r.missing.includes('evidence.funding'));}
 });
 test(profile+': wrong targets, duplicate IDs and foreign scope are rejected',()=>{
  for(const change of [m=>{m.target='gates.release';},m=>{m.scopeDigest='f'.repeat(64);},m=>{m.ref='https://untrusted.example';}]){const d=structuredClone(doc),m=d.evidenceMapping.find(m=>m.id==='funding');m.ref='local:funding';change(m);assert.ok(inspectOfficeServicePlan(d,expected).missing.includes('evidence.funding'));}
  const d=structuredClone(doc);d.evidenceMapping.push({...d.evidenceMapping[0]});assert.ok(inspectOfficeServicePlan(d,expected).missing.includes('evidence.identity'));
 });
 test(profile+': well-formed scoped mapping is distinguishable from a verified grant',()=>{
  const d=structuredClone(doc),m=d.evidenceMapping.find(m=>m.id==='funding');m.ref='local:synthetic-funding';m.scopeDigest=officeEvidenceScopeDigest(d);
  const r=inspectOfficeServicePlan(d,expected);assert.ok(!r.missing.includes('evidence.funding'));assert.equal(r.evidenceVerified,false);assert.equal(r.deliveryAuthorized,false);
  d.assessmentInput.plan.hourlyRateMinor=123;assert.ok(inspectOfficeServicePlan(d,expected).missing.includes('evidence.funding'));
 });
 test(profile+': restoration uses stored identity while OFF without writes or network',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'office-preflight-')),workPackages={rows:[{id:'u',label:'ugig',inventoryKind:'core'}]},sourceId=normalizeInventory({},workPackages).sources[0].id;let service;
  const key={sourceId,externalId:'synthetic',ownerId:'synthetic-owner'},revision='r1';
  const source=createMarketplaceWorkSource({platform:'ugig',sourceId,isEnabled:()=>false,readAssignment:()=>{throw Error('network forbidden');}});
  try{service=openOrderRestoration({base,directory:path.join(base,'state'),isEnabled:()=>false,workPackages,execution:{sources:[source]}});
   service.store.register({...key,rootTaskId:'root',sourceRevision:revision,state:'discovered',gigId:doc.binding.gig,applicationId:doc.binding.applicationId,conversationId:doc.binding.conversationId,workKind:profile,provenance:{type:'reviewed-local-registration',ownerId:key.ownerId,evidenceRef:'synthetic'}});
   const before=JSON.stringify(service.store.snapshot());const r=service.inspectOfficeServicePlan(key,revision,doc);assert.equal(r.review.workAuthorized,false);assert.match(r.planDigest,/^[a-f0-9]{64}$/);assert.equal(r.schema,'office-plan-inspection-v1');assert.equal(JSON.stringify(service.store.snapshot()),before);assert.equal(service.status().execution.products,0);
   assert.throws(()=>service.inspectOfficeServicePlan(key,'old',doc),/revision|order/i);assert.throws(()=>service.inspectOfficeServicePlan({...key,ownerId:'other'},revision,doc),/order/i);
   const dated=structuredClone(doc);dated.commercialTerms.deadline='2026-07-01T12:00:00+14:00';dated.commercialTerms.timezone='Europe/Zurich';const datedBefore=JSON.stringify(dated);
   const receipt=service.inspectOfficeServicePlan(key,revision,dated).review.deadlineReceipt;
   assert.equal(receipt.utc,'2026-06-30T22:00:00.000Z');assert.equal(receipt.localDateTime,'2026-07-01T00:00:00.000');assert.equal(receipt.offset,'+02:00');assert.equal(JSON.stringify(dated),datedBefore);
   for(const phase of dated.assessmentInput.plan.phases)phase.hours=0.5;
   dated.assessmentInput.plan.capacitySchedule={start:'2026-06-30T20:00:00Z',calendarComplete:true,prerequisitesReady:true,availabilityRef:'local:synthetic-calendar',capacityModel:'flexible-within-window',windows:[{start:'2026-06-30T20:00:00Z',end:'2026-06-30T22:00:00Z',capacityMinutes:120}]};
   const capacity=service.inspectOfficeServicePlan(key,revision,dated).review.capacityReceipt;
   assert.equal(capacity.status,'capacity-sufficient');assert.equal(capacity.requiredMinutes,120);assert.equal(capacity.availableMinutes,120);assert.equal(capacity.workAuthorized,false);
   dated.assessmentInput.plan.phaseSchedule={model:'sequential-preemptible-elapsed-minutes',order:dated.assessmentInput.plan.phases.map(p=>p.id),timing:dated.assessmentInput.plan.phases.map((p,i,all)=>({phaseId:p.id,notBefore:'2026-06-30T20:00:00Z',minElapsedMinutes:0,after:i?[{phaseId:all[i-1].id,lagMinutes:0}]:[]}))};
   const phaseReceipt=service.inspectOfficeServicePlan(key,revision,dated).review.phaseReceipt;
   assert.equal(phaseReceipt.status,'fits-declared-plan');assert.equal(phaseReceipt.finishedUtc,'2026-06-30T22:00:00.000Z');assert.equal(phaseReceipt.workAuthorized,false);
   assert.equal(phaseReceipt.phases.flatMap(p=>p.segments).reduce((n,s)=>n+s.minutes,0),120);
   const portfolio={resources:[{resourceId:'synthetic',calendarRevision:'v1',windows:dated.assessmentInput.plan.capacitySchedule.windows,bookingsComplete:true,bookings:[]}],plans:[{planId:profile,resourceId:'synthetic',calendarRevision:'v1',input:{phases:dated.assessmentInput.plan.phases,deadline:dated.commercialTerms.deadline,timezone:dated.commercialTerms.timezone,schedule:dated.assessmentInput.plan.capacitySchedule,phaseSchedule:dated.assessmentInput.plan.phaseSchedule}}]};
   const portfolioBefore=JSON.stringify(portfolio),pr=service.inspectOfficePortfolio(portfolio);
   const inspected=service.inspectOfficeServicePlan(key,revision,dated);
   const bound={resources:portfolio.resources,plans:[{planId:profile,resourceId:'synthetic',calendarRevision:'v1',orderKey:key,sourceRevision:revision,planDigest:inspected.planDigest,document:dated}]};
   const boundBefore=JSON.stringify(bound),br=service.inspectBoundOfficePortfolio(bound);
   const savedPlan=service.registerOfficeServicePlan(key,revision,dated,0),savedCalendar=service.registerOfficeCalendar(portfolio.resources[0],0);
   const registered={plans:[{key:savedPlan.key,version:1,resourceId:'synthetic'}],calendars:[{key:savedCalendar.key,version:1}]};
   const rr=service.inspectRegisteredOfficePortfolio(registered);
   for(const day of ['2026-02-29','2026-02-30','2026-04-31']){
    assert.throws(()=>service.registerOfficeCalendar({...portfolio.resources[0],windows:[{start:day+'T10:00:00Z',end:day+'T11:00:00Z',capacityMinutes:60}]},1),/calendar/i);
   }
   assert.equal(service.inspectRegisteredOfficePortfolio(registered).review.status,'consistent');
   for(const offset of ['+14:01','+15:00','+01:60'])assert.throws(()=>service.registerOfficeCalendar({...portfolio.resources[0],windows:[{start:'2026-06-30T10:00:00'+offset,end:'2026-06-30T11:00:00'+offset,capacityMinutes:60}]},1),/calendar/i);
   const leapCalendar={...portfolio.resources[0],resourceId:'leap',windows:[{start:'2028-02-29T10:00:00+05:30',end:'2028-02-29T11:00:00+05:30',capacityMinutes:60}]};
   assert.equal(service.registerOfficeCalendar(leapCalendar,0).version,1);
   const assignment=service.registerOfficeResourceAssignment(savedPlan.key,1,'synthetic',1,0);
   const assignmentRefs=[{key:assignment.key,version:1}];
   assert.equal(service.inspectAssignedOfficePortfolio(assignmentRefs).persistedResourceAssignmentVerified,true);
   assert.throws(()=>service.inspectAssignedOfficePortfolio([{...assignmentRefs[0],resourceId:'other'}]),/reference/i);
   service.registerOfficeResourceAssignment(savedPlan.key,1,'synthetic',1,1);
   assert.throws(()=>service.inspectAssignedOfficePortfolio(assignmentRefs),/version/i);
   assignmentRefs[0].version=2;
   service.registerOfficeCalendar({...portfolio.resources[0],resourceId:'alternative'},0);
   service.registerOfficeResourceAssignment(savedPlan.key,1,'alternative',1,2);
   assert.throws(()=>service.inspectAssignedOfficePortfolio(assignmentRefs),/version/i);
   assignmentRefs[0].version=3;
   assert.equal(service.inspectAssignedOfficePortfolio(assignmentRefs).bindings[0].resourceId,'alternative');
   service.registerOfficeResourceAssignment(savedPlan.key,1,'synthetic',1,3);
   assert.throws(()=>service.inspectAssignedOfficePortfolio(assignmentRefs),/version/i);
   assignmentRefs[0].version=4;
   assert.equal(rr.review.status,'consistent');assert.equal(rr.persistedPlanVersionVerified,true);assert.equal(rr.persistedCalendarVersionVerified,true);assert.equal(rr.workAuthorized,false);assert.equal(rr.customerConfirmed,false);
   assert.throws(()=>service.registerOfficeServicePlan(key,revision,dated,0),/version/i);
   assert.throws(()=>service.registerOfficeCalendar({...portfolio.resources[0],bookingsComplete:false},1),/calendar/i);
   service.registerOfficeCalendar({...portfolio.resources[0],calendarRevision:'v2'},1);
   assert.throws(()=>service.inspectAssignedOfficePortfolio(assignmentRefs),/version/i);
   assert.throws(()=>service.inspectRegisteredOfficePortfolio(registered),/version/i);
   service.registerOfficeCalendar(portfolio.resources[0],2); // A/B/A content never revives version 1.
   assert.throws(()=>service.inspectRegisteredOfficePortfolio(registered),/version/i);
   registered.calendars[0].version=3;
   assert.equal(service.inspectRegisteredOfficePortfolio(registered).review.status,'consistent');
   service.registerOfficeServicePlan(key,revision,dated,1);
   assert.throws(()=>service.inspectRegisteredOfficePortfolio(registered),/version/i);
   registered.plans[0].version=2;
   assert.equal(service.inspectRegisteredOfficePortfolio(registered).review.status,'consistent');
   assert.throws(()=>service.inspectRegisteredOfficePortfolio({...registered,plans:[{...registered.plans[0],document:dated}]}),/references/i);
   service.close();service=openOrderRestoration({base,directory:path.join(base,'state'),isEnabled:()=>false,workPackages,execution:{sources:[source]}});
   assert.throws(()=>service.inspectAssignedOfficePortfolio(assignmentRefs),/version/i);
   service.registerOfficeResourceAssignment(savedPlan.key,2,'synthetic',3,4);
   assignmentRefs[0].version=5;
   assert.equal(service.inspectAssignedOfficePortfolio(assignmentRefs).review.status,'consistent');
   assert.equal(service.inspectRegisteredOfficePortfolio(registered).review.status,'consistent');
   const onService=openOrderRestoration({base,directory:path.join(base,'on-test'),isEnabled:()=>true,workPackages,execution:{sources:[source]}});
   try{assert.throws(()=>onService.registerOfficeResourceAssignment(savedPlan.key,2,'synthetic',3,0),/OFF/);assert.throws(()=>onService.registerOfficeCalendar(portfolio.resources[0],0),/OFF/);assert.throws(()=>onService.registerOfficeServicePlan(key,revision,dated,0),/OFF/);}finally{onService.close();}
   assert.equal(br.review.status,'consistent');assert.equal(br.storedOrdersVerified,true);assert.equal(br.workAuthorized,false);assert.equal(br.bindings[0].planDigest,inspected.planDigest);assert.equal(JSON.stringify(bound),boundBefore);
   for(const mutate of [x=>x.plans[0].sourceRevision='old',x=>x.plans[0].orderKey.ownerId='foreign',x=>x.plans[0].document.binding.gig='foreign',x=>x.plans[0].document.commercialTerms.deadline='2027-01-01T00:00:00Z',x=>x.plans.push({...x.plans[0],planId:'alias'}),x=>x.plans[0].input=portfolio.plans[0].input]){const invalid=structuredClone(bound);mutate(invalid);assert.throws(()=>service.inspectBoundOfficePortfolio(invalid));}
   const foreign=structuredClone(bound);foreign.plans[0].document.profile='foreign';foreign.plans[0].planDigest=service.inspectOfficeServicePlan(key,revision,foreign.plans[0].document).planDigest;assert.throws(()=>service.inspectBoundOfficePortfolio(foreign));
   for(const field of ['gig','applicationId','conversationId']){const wrong=structuredClone(bound);wrong.plans[0].document.binding[field]='wrong';wrong.plans[0].planDigest=service.inspectOfficeServicePlan(key,revision,wrong.plans[0].document).planDigest;assert.throws(()=>service.inspectBoundOfficePortfolio(wrong));}
   assert.equal(pr.review.status,'consistent');assert.equal(pr.planningOnly,true);assert.equal(pr.storedOrdersVerified,false);assert.equal(pr.review.workAuthorized,false);assert.match(pr.inputDigest,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(portfolio),portfolioBefore);
   portfolio.plans.push({...portfolio.plans[0],planId:'second'});assert.equal(service.inspectOfficePortfolio(portfolio).review.status,'conflict');assert.notEqual(service.inspectOfficePortfolio(portfolio).inputDigest,pr.inputDigest);
   const altered=structuredClone(doc);altered.binding.gig='other';assert.deepEqual(service.inspectOfficeServicePlan(key,revision,altered).review.missing,['exact-candidate-binding']);
   const ambiguous=structuredClone(doc);ambiguous.assessmentInput.evidence.capabilities.unshift({profileId:'foreign',executorRef:'local:foreign',reviewerRef:'local:foreign',deliveryRef:'local:foreign'});
   const rejected=service.inspectOfficeServicePlan(key,revision,ambiguous).review;
   assert.equal(rejected.status,'blocked');assert.deepEqual(rejected.missing,['exact-profile-capability']);assert.equal(rejected.workAuthorized,false);assert.equal(rejected.evidenceVerified,false);
   assert.equal(JSON.stringify(service.store.snapshot()),before);assert.equal(service.status().execution.products,0);
  }finally{service?.close();fs.rmSync(base,{recursive:true,force:true});}
 });
}
