import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openEvidenceStore} from './founder-evidence-store.mjs';import {createReferenceAdmin} from './founder-reference-admin.mjs';import {digest} from './founder-restoration-integrity.mjs';import {invoiceQualityFiles} from './founder-order-quality.mjs';import {startFounderDashboard} from './founder-dashboard.mjs';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reference-admin-')),store=openEvidenceStore({file:path.join(dir,'e.db')}),rows=[{id:'a',amountMinor:100,currency:'CHF'}];let enabled=false,now=1000;const binding={sourceId:'guru',externalId:'job',ownerId:'owner',rootTaskId:'root',sourceRevision:'v1',scopeDigest:'scope',profileId:'structured-data',data:{rows,contract:{columns:['id','amountMinor','currency'],required:['id','amountMinor','currency'],deduplicateBy:[],trim:[],lowercase:[]}},qualityContract:{profile:'invoice-reconciliation-v1',referenceRows:rows,referenceDigest:digest(rows),evidenceRef:'contract:invoice'}};const product={binding,files:invoiceQualityFiles(binding)};const admin=createReferenceAdmin({store,readProducts:()=>[{id:'candidate',product}],readPower:()=>({enabled}),reviewerId:'Patrice',now:()=>now});return {admin,store,product,setPower:x=>enabled=x,setTime:x=>now=x,close(){store.close();fs.rmSync(dir,{recursive:true,force:true});}};}
const preview=(f,session='one')=>f.admin.prepare({candidateId:'candidate'},session);
const approve=(f,p,session='one')=>f.admin.approve({previewToken:p.previewToken,expiresAt:100000,ref:'contract:reviewed'},session);

test('admin cannot persist a reference approval by the order owner',()=>{
 const f=fixture();
 const admin=createReferenceAdmin({store:f.store,readProducts:()=>[{id:'candidate',product:f.product}],readPower:()=>({enabled:false}),reviewerId:f.product.binding.ownerId,now:()=>1000});
 try{const p=admin.prepare({candidateId:'candidate'},'one');assert.throws(()=>admin.approve({previewToken:p.previewToken,expiresAt:100000,ref:'contract:reviewed'},'one'),/independent|approval/i);assert.equal(f.store.snapshot().referenceApprovals.length,0);}finally{f.close();}
});

test('admin exposes derived capacity while ON without writing or reading providers',()=>{
 const f=fixture();try{approve(f,preview(f));f.setPower(true);const before=f.store.snapshot(),state=f.admin.snapshot();assert.deepEqual(state.capacity,{limit:2048,used:1,available:2047,reservedWithdrawals:1,freeForOtherWrites:2046,reserveDeficit:0});assert.deepEqual(f.store.snapshot(),before);}finally{f.close();}
});

test('capacity UI distinguishes reserved space and legacy deficits without granting writes',()=>{
 const f=fixture(),doc={createElement:tag=>new Element(doc,tag)},root=new Element(doc,'section');try{
  const state={...f.admin.snapshot(),capacity:{limit:2048,used:2047,available:1,reservedWithdrawals:2,freeForOtherWrites:0,reserveDeficit:1}};
  renderReferenceAdmin(root,state,{request:async()=>{throw Error('No action expected');},refresh:async()=>{},notify:()=>{}});
  const text=all(root).map(n=>n.textContent).join(' ');
  assert.match(text,/2047 von 2048/);assert.match(text,/Widerrufsreserve: 2/);assert.match(text,/Reservedefizit: 1/);assert.match(text,/nicht für alle ausstehenden Widerrufe/);
 }finally{f.close();}
});

test('preview expiry is checked again after rereading candidates',()=>{
 const f=fixture();let at=1000,slow=false;
 const admin=createReferenceAdmin({store:f.store,reviewerId:'Patrice',now:()=>at,readPower:()=>({enabled:false}),readProducts:()=>{if(slow)at=301000;return [{id:'candidate',product:f.product}];}});
 try{const p=admin.prepare({candidateId:'candidate'},'one');slow=true;assert.throws(()=>admin.approve({previewToken:p.previewToken,expiresAt:400000,ref:'contract:reviewed'},'one'),/Preview/);assert.equal(f.store.snapshot().referenceApprovals.length,0);}finally{f.close();}
});

test('withdrawal rechecks power after ledger read before persisting',()=>{
 for(const changed of [true,undefined]){
  const f=fixture();approve(f,preview(f));const state=f.admin.snapshot();let enabled=false;
  const store={snapshot(){const s=f.store.snapshot();enabled=changed;return s;},recordReferenceWithdrawal:r=>f.store.recordReferenceWithdrawal(r)};
  const admin=createReferenceAdmin({store,reviewerId:'Patrice',now:()=>1000,readPower:()=>({enabled}),readProducts:()=>[]});
  try{assert.throws(()=>admin.withdraw({approvalId:state.approvals[0].id,revision:state.revision,ref:'contract:withdraw'}),/OFF/);assert.equal(f.store.snapshot().referenceWithdrawals.length,0);}finally{f.close();}
 }
});
test('server prepared approval is session bound single use and stores reviewer',()=>{const f=fixture();try{const p=preview(f);assert.throws(()=>approve(f,p,'two'));assert.equal(f.store.snapshot().referenceApprovals.length,0);const q=preview(f);approve(f,q);assert.throws(()=>approve(f,q));assert.equal(f.store.snapshot().referenceApprovals[0].reviewerId,'Patrice');assert.equal(JSON.stringify(f.admin.snapshot()).includes('referenceRows'),false);}finally{f.close();}});
test('OFF, expiry, changed product and stale ledger block mutations',()=>{for(const cause of ['on','unknown','expired','product','ledger']){const f=fixture();try{const p=preview(f);if(cause==='on')f.setPower(true);if(cause==='unknown')f.setPower(undefined);if(cause==='expired')f.setTime(400000);if(cause==='product')f.product.files[0].content+='changed';if(cause==='ledger')approve(f,preview(f));assert.throws(()=>approve(f,p));}finally{f.close();}}});
test('withdrawal and acceptance protocols remain audited local records',()=>{const f=fixture();try{approve(f,preview(f));let s=f.admin.snapshot();const p=f.admin.protocol({candidateId:'candidate',revision:s.revision});assert.equal(p.protocol.accepted,false);assert.equal(f.store.snapshot().acceptanceProtocols.length,1);s=f.admin.snapshot();f.admin.withdraw({approvalId:s.approvals[0].id,revision:s.revision,ref:'contract:withdrawn'});assert.equal(f.store.snapshot().referenceWithdrawals[0].reviewerId,'Patrice');assert.equal(f.admin.snapshot().approvals[0].status,'withdrawn');assert.equal(f.admin.snapshot().protocols[0].currentReferenceApproved,false);}finally{f.close();}});
test('dashboard enforces login origin CSRF and does not call broad readers',async()=>{const f=fixture(),forbidden=()=>{throw Error('provider forbidden');};const ui=await startFounderDashboard({store:{},referenceAdmin:f.admin,readUsage:forbidden,autonomy:{snapshot:forbidden}});const req=(route,body,headers={})=>fetch(ui.url+route,{method:body?'POST':'GET',headers:{Origin:ui.url,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});try{assert.equal((await req('/api/reference-admin')).status,401);const login=await req('/api/session',{token:new URL(ui.loginUrl).hash.slice(1)}),cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf,h={Cookie:cookie,'X-Obolus-CSRF':csrf};assert.equal((await req('/api/reference-admin/prepare',{candidateId:'candidate'},{Cookie:cookie})).status,403);assert.equal((await req('/api/reference-admin',null,{...h,Origin:'https://evil.invalid'})).status,403);assert.equal((await req('/api/reference-admin',null,h)).status,200);const p=await (await req('/api/reference-admin/prepare',{candidateId:'candidate'},h)).json();assert.equal((await req('/api/reference-admin/approve',{previewToken:p.previewToken,expiresAt:100000,ref:'contract:reviewed'},h)).status,200);assert.equal(f.store.snapshot().referenceApprovals.length,1);}finally{await ui.close();f.close();}});

import {renderReferenceAdmin,referenceAdminLabel} from '../web/founder/reference-admin.mjs';
class Element{constructor(doc,tag){this.ownerDocument=doc;this.tag=tag;this.children=[];this.textContent='';this.disabled=false;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}focus(){this.ownerDocument.activeElement=this;}set innerHTML(v){throw Error('Unsafe HTML rendering');}}
const all=n=>[n,...n.children.flatMap(all)];
test('UI renders untrusted text safely and requires explicit review before approval',async()=>{const doc={createElement:tag=>new Element(doc,tag)},root=new Element(doc,'section'),f=fixture();let refreshed=0;const calls=[],notices=[];try{const state=f.admin.snapshot();state.reviewerId='<img src=x onerror=alert(1)>';renderReferenceAdmin(root,state,{request:async(action,body)=>{calls.push(action);return f.admin[action](body,'ui');},refresh:async()=>{refreshed++;},notify:m=>notices.push(m)});assert.ok(all(root).some(n=>n.textContent.includes('<img')));const button=label=>all(root).find(n=>n.tag==='button'&&n.textContent===label);await button('Freigabe prüfen').onclick();assert.deepEqual(calls,['prepare']);const save=button('Referenzfreigabe speichern');assert.equal(save.disabled,true);await save.onclick();assert.deepEqual(calls,['prepare']);const check=all(root).find(n=>n.tag==='input'&&n.type==='checkbox');check.checked=true;check.onchange();const ref=all(root).find(n=>n.tag==='input'&&n.type==='text');ref.value='contract:ui';const date=all(root).find(n=>n.tag==='input'&&n.type==='datetime-local');date.value='1970-01-01T01:01';await save.onclick();assert.equal(calls.at(-1),'approve');assert.equal(refreshed,1);}finally{f.close();}});
test('protocol ledger rejects fabricated buyer acceptance and extra fields',()=>{const f=fixture();try{const s=f.admin.snapshot(),p=f.admin.protocol({candidateId:'candidate',revision:s.revision});const {id,...record}=p;assert.throws(()=>f.store.recordAcceptanceProtocol({...record,protocol:{...record.protocol,accepted:true}}));assert.throws(()=>f.store.recordAcceptanceProtocol({...record,protocol:{...record.protocol,executionAuthorized:true}}));assert.throws(()=>f.store.recordAcceptanceProtocol({...record,rawData:'private'}));}finally{f.close();}});

test('withdrawals and protocol writes refuse ON and unreadable power',()=>{for(const power of [true,undefined]){const f=fixture();try{approve(f,preview(f));const s=f.admin.snapshot();f.setPower(power);assert.throws(()=>f.admin.withdraw({approvalId:s.approvals[0].id,revision:s.revision,ref:'contract:withdraw'}));assert.throws(()=>f.admin.protocol({candidateId:'candidate',revision:s.revision}));assert.equal(f.store.snapshot().referenceWithdrawals.length,0);assert.equal(f.store.snapshot().acceptanceProtocols.length,0);}finally{f.close();}}});
test('protocol records survive readonly reopening with integrity validation',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'protocol-reopen-')),file=path.join(dir,'e.db'),f=fixture();let writer,reader;try{const s=f.admin.snapshot(),{id,...record}=f.admin.protocol({candidateId:'candidate',revision:s.revision});writer=openEvidenceStore({file});writer.recordAcceptanceProtocol(record);writer.close();writer=null;reader=openEvidenceStore({file,readonly:true});assert.equal(reader.snapshot().acceptanceProtocols[0].protocol.accepted,false);assert.throws(()=>reader.recordAcceptanceProtocol(record));}finally{writer?.close();reader?.close();f.close();fs.rmSync(dir,{recursive:true,force:true});}});

test('admin status and protocol labels are readable German with conservative unknown fallback',()=>{assert.equal(referenceAdminLabel('active'),'Aktiv');assert.equal(referenceAdminLabel('withdrawn'),'Widerrufen');assert.equal(referenceAdminLabel('pending-external'),'Externer Nachweis ausstehend');assert.equal(referenceAdminLabel('buyer-acceptance'),'Käuferabnahme');assert.equal(referenceAdminLabel('ready-for-source-review'),'Bereit für Quellenprüfung');assert.equal(referenceAdminLabel('unexpected-value'),'Unbekannter Prüfstand');});

test('unconfigured reference administration returns explicit unavailable status and serves scoped stylesheet',async()=>{const ui=await startFounderDashboard({store:{},readUsage:()=>({status:'offline'})});try{const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})}),cookie=login.headers.get('set-cookie').split(';')[0];const response=await fetch(ui.url+'/api/reference-admin',{headers:{Cookie:cookie}});assert.equal(response.status,503);assert.equal((await response.json()).error,'Referenzverwaltung ist nicht eingerichtet.');const css=await fetch(ui.url+'/reference-admin.css');assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);}finally{await ui.close();}});


test('preview focuses its heading and invalid inputs retain focus without sending approval',async()=>{
 const doc={createElement:tag=>new Element(doc,tag)},root=new Element(doc,'section'),f=fixture(),calls=[];
 try{renderReferenceAdmin(root,f.admin.snapshot(),{request:async(action,body)=>{calls.push(action);return f.admin[action](body,'keyboard');},refresh:async()=>{},notify:()=>{}});
 const button=label=>all(root).find(n=>n.tag==='button'&&n.textContent===label);
 await button('Freigabe prüfen').onclick();assert.equal(doc.activeElement?.tag,'h3');
 const check=all(root).find(n=>n.tag==='input'&&n.type==='checkbox');check.checked=true;check.onchange();
 const ref=all(root).find(n=>n.tag==='input'&&n.type==='text'),until=all(root).find(n=>n.type==='datetime-local');ref.value='invalid';
 await button('Referenzfreigabe speichern').onclick();assert.deepEqual(calls,['prepare']);assert.equal(doc.activeElement,ref);
 ref.value='contract:valid';until.value='';await button('Referenzfreigabe speichern').onclick();assert.deepEqual(calls,['prepare']);assert.equal(doc.activeElement,until);
 }finally{f.close();}
});

test('candidate reader outage preserves audited withdrawals and invalidates old previews',()=>{
 const f=fixture();let broken=false;const a=createReferenceAdmin({store:f.store,reviewerId:'Patrice',now:()=>1000,readPower:()=>({enabled:false}),readProducts:()=>{if(broken)throw Error('private path must not leak');return [{id:'candidate',product:f.product}];}});
 try{const p=a.prepare({candidateId:'candidate'},'one');a.approve({previewToken:p.previewToken,expiresAt:100000,ref:'contract:reviewed'},'one');let s=a.snapshot();a.protocol({candidateId:'candidate',revision:s.revision});const stale=a.prepare({candidateId:'candidate'},'one');broken=true;s=a.snapshot();assert.equal(s.candidateReadStatus,'unavailable');assert.deepEqual(s.candidates,[]);assert.equal(s.approvals.length,1);assert.equal(s.protocols[0].currentReferenceApproved,false);assert.equal(JSON.stringify(s).includes('private path'),false);assert.throws(()=>a.prepare({candidateId:'candidate'},'one'));assert.throws(()=>a.protocol({candidateId:'candidate',revision:s.revision}));broken=false;assert.throws(()=>a.approve({previewToken:stale.previewToken,expiresAt:100000,ref:'contract:stale'},'one'));broken=true;a.withdraw({approvalId:s.approvals[0].id,revision:s.revision,ref:'contract:withdrawn'});assert.equal(a.snapshot().approvals[0].status,'withdrawn');}finally{f.close();}
});
test('malformed candidates degrade availability but corrupt evidence store never becomes a valid view',()=>{
 const f=fixture();try{const a=createReferenceAdmin({store:f.store,reviewerId:'Patrice',readPower:()=>({enabled:false}),readProducts:()=>[{id:'bad',product:{binding:{}}}]});assert.equal(a.snapshot().candidateReadStatus,'unavailable');const corrupt=createReferenceAdmin({store:{snapshot(){throw Error('Integrity failure');}},reviewerId:'Patrice',readPower:()=>({enabled:false}),readProducts:()=>[]});assert.throws(()=>corrupt.snapshot(),/Integrity/);}finally{f.close();}
});
test('degraded UI explains blocked candidate work while retaining withdrawal controls',()=>{const f=fixture(),doc={createElement:tag=>new Element(doc,tag)},root=new Element(doc,'section');try{approve(f,preview(f));const state={...f.admin.snapshot(),candidateReadStatus:'unavailable',candidates:[]};renderReferenceAdmin(root,state,{request:async()=>{},refresh:async()=>{},notify:()=>{}});assert.ok(all(root).some(n=>n.textContent.includes('Auftragsdaten sind derzeit nicht verfügbar')));assert.ok(all(root).some(n=>n.tag==='button'&&n.textContent==='Widerruf speichern'));assert.equal(all(root).some(n=>n.tag==='button'&&n.textContent==='Freigabe prüfen'),false);}finally{f.close();}});

test('authenticated HTTP withdrawal survives candidate outage and still enforces OFF',async()=>{
 const f=fixture();approve(f,preview(f));let enabled=false;
 const admin=createReferenceAdmin({store:f.store,reviewerId:'Patrice',now:()=>1000,readPower:()=>({enabled}),readProducts:()=>{throw Error('private reader failure');}});
 const ui=await startFounderDashboard({store:{},referenceAdmin:admin,readUsage:()=>{throw Error('provider forbidden');}});
 const req=(route,body,headers={})=>fetch(ui.url+route,{method:body?'POST':'GET',headers:{Origin:ui.url,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 try{
  const login=await req('/api/session',{token:new URL(ui.loginUrl).hash.slice(1)}),cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf,h={Cookie:cookie,'X-Obolus-CSRF':csrf};
  const response=await req('/api/reference-admin',null,h);assert.equal(response.status,200);const state=await response.json();assert.equal(state.candidateReadStatus,'unavailable');assert.equal(state.approvals.length,1);
  for(const action of ['prepare','protocol'])assert.notEqual((await req('/api/reference-admin/'+action,{candidateId:'candidate',revision:state.revision},h)).status,200);
  const body={approvalId:state.approvals[0].id,revision:state.revision,ref:'contract:withdraw'};
  assert.equal((await req('/api/reference-admin/withdraw',body,{Cookie:cookie})).status,403);
  enabled=true;assert.notEqual((await req('/api/reference-admin/withdraw',body,h)).status,200);assert.equal(f.store.snapshot().referenceWithdrawals.length,0);
  enabled=false;assert.equal((await req('/api/reference-admin/withdraw',body,h)).status,200);assert.equal(f.store.snapshot().referenceWithdrawals.length,1);
 }finally{await ui.close();f.close();}
});
