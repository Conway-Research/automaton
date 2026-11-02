import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from './founder-binary-artifacts.mjs';
import {setupOfficePipeline} from './founder-ugig-office-test-support.mjs';
import {prepareOfficeSpecialistEvidence} from './founder-ugig-office-specialist.mjs';

function input(kind){
 const spec={workKind:kind,privacy:'public',customerApproved:true};
 let reference;
 if(kind==='support-templates'){
  Object.assign(spec,{voiceGuide:'Sachlich.',checklist:['Keine Zusage ohne Freigabe.'],templates:[{id:'refund',subject:'Anfrage {name}',body:'Wir prüfen den Fall.',short:'Wir prüfen.',escalation:'An Team A',placeholders:['name']}]});
  reference={paragraphs:['refund','Anfrage {name}','Wir prüfen den Fall.','Wir prüfen.','An Team A','Sachlich.','Keine Zusage ohne Freigabe.'],cases:[{id:'case-1',templateId:'refund',required:['prüfen'],forbidden:['garantiert']}],expectedCaseIds:['case-1'],specialistEvidence:{schema:'numaron-office-specialist-input-v1',privacy:'public',rules:[{id:'r1',policyIndex:0,quote:spec.checklist[0],expectedAction:'Prüfen',forbiddenPromises:['garantiert'],escalationTarget:'Team A'}],cases:[{id:'case-1',templateId:'refund',ruleIds:['r1'],expectedAction:'Prüfen',escalationTarget:'Team A',segments:[{field:'body',quote:'prüfen'},{field:'escalation',quote:'Team A'}]}]}};
 }else{
  Object.assign(spec,{summary:'Ein Referenzeintrag.',headers:['name','source_url','retrieved_at'],rows:[['A','https://example.org/a','2026-10-01']]});
  const text='Name: A';
  reference={headers:spec.headers,rows:spec.rows,summary:spec.summary,specialistEvidence:{schema:'numaron-office-specialist-input-v1',privacy:'public',maxAgeDays:365,snapshots:[{id:'s1',url:'https://example.org/a',retrievedAt:'2026-10-01T00:00:00.000Z',privacy:'public',text,sha256:sha256(text)}],claims:[{row:0,column:'name',value:'A',snapshotId:'s1',quote:text,relation:'supports'},{row:null,column:'summary',value:spec.summary,snapshotId:'s1',quote:text,relation:'supports'}]}};
 }
 return {spec,reference};
}
for(const kind of ['support-templates','research-report'])test(kind+' binds structured evidence without approval',async()=>{
 const s=await setupOfficePipeline(input(kind));try{
  const p=await s.p.generateOffice(s.f.order(),s.ctx),r=await s.p.prepareOfficeSpecialistEvidence(s.f.order(),s.ctx);
  assert.equal(r.status,'pending-specialist-review');assert.equal(r.productDigest,p.productDigest);assert.equal(r.deliveryReady,false);assert.equal(r.independentlyVerified,false);assert(r.checks.every(c=>c.status==='pending'));
  await assert.rejects(s.p.readDeliveryAssignment(s.f.order(),s.ctx),/release/);
  const args={agreement:s.f.a,product:p,specBytes:s.f.blobs.get(s.f.a.specRef.sha256),referenceBytes:s.f.blobs.get(s.f.a.referenceRef.sha256),now:s.f.now};
  assert.throws(()=>prepareOfficeSpecialistEvidence({...args,referenceBytes:Buffer.from('{}')}),/input integrity/);
  assert.throws(()=>prepareOfficeSpecialistEvidence({...args,product:{...p,packageDigest:'0'.repeat(64)}}),/package/);
  s.off();await assert.rejects(s.p.prepareOfficeSpecialistEvidence(s.f.order(),s.ctx),/OFF/);
 }finally{s.close();}
});
for(const fault of ['missing','uncovered','bad-quote','wrong-target','confidential','fake-approval','wrong-hash','stale','conflict','wrong-cell','future','duplicate','source-url','missing-summary'])test('structured evidence handles '+fault,async()=>{
 const research=['wrong-hash','stale','conflict','wrong-cell','future','duplicate','source-url','missing-summary'].includes(fault),i=input(research?'research-report':'support-templates'),e=i.reference.specialistEvidence;
 if(fault==='missing')delete i.reference.specialistEvidence;
 if(fault==='uncovered')e.cases=[];
 if(fault==='bad-quote')e.cases[0].segments[0].quote='Not present';
 if(fault==='wrong-target')e.cases[0].escalationTarget='Team B';
 if(fault==='confidential')e.privacy='confidential';
 if(fault==='fake-approval')e.reviewed=true;
 if(fault==='wrong-hash')e.snapshots[0].sha256='0'.repeat(64);
 if(fault==='stale')e.maxAgeDays=1;
 if(fault==='conflict')e.claims[0].relation='contradicts';
 if(fault==='wrong-cell')e.claims[0].value='B';
 if(fault==='future')e.snapshots[0].retrievedAt='2099-01-01T00:00:00.000Z';
 if(fault==='duplicate')e.claims.push({...e.claims[0]});
 if(fault==='source-url')e.snapshots[0].url='https://example.org/b';
 if(fault==='missing-summary')e.claims.pop();
 const s=await setupOfficePipeline(i);try{
  if(fault==='confidential'){await assert.rejects(s.p.generateOffice(s.f.order(),s.ctx));return;}
  await s.p.generateOffice(s.f.order(),s.ctx);
  if(['bad-quote','fake-approval','wrong-hash','wrong-cell','future','duplicate','source-url'].includes(fault))await assert.rejects(s.p.prepareOfficeSpecialistEvidence(s.f.order(),s.ctx));
  else{const r=await s.p.prepareOfficeSpecialistEvidence(s.f.order(),s.ctx);assert.equal(r.status,'blocked-evidence-issues');assert(r.evidence.issues.length);}
 }finally{s.close();}
});

test('revoked work cannot persist a specialist proof',async()=>{
 const s=await setupOfficePipeline(input('support-templates'));try{
  await s.p.generateOffice(s.f.order(),s.ctx);
  s.setRequestHook(()=>{s.f.pack.workGrant.approved=false;s.save();});
  await assert.rejects(s.p.prepareOfficeSpecialistEvidence(s.f.order(),s.ctx));
 }finally{s.close();}
});
