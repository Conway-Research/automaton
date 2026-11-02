import fs from 'node:fs';import path from 'node:path';import Database from 'better-sqlite3';
import {createOrderGithub} from './founder-order-github.mjs';
import {createCodeSandbox,codeDigest} from './founder-code-sandbox.mjs';
import {createOrderCodeWorker,applyCodeChanges,verifyOrderCode} from './founder-order-code.mjs';
import {prepareDealworkSource,nativeDigest} from './founder-dealwork-source.mjs';
const uuid=x=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x??'');

export function createDealworkCode({directory,provider,github=createOrderGithub({directory:path.join(directory,'public-source')}),sandbox=createCodeSandbox(),code,apiKey,getApiKey,mission,now=Date.now}){
 fs.mkdirSync(directory,{recursive:true});
 const db=new Database(path.join(directory,'native-code.db'));db.pragma('journal_mode=WAL');db.pragma('busy_timeout=5000');db.pragma('synchronous=FULL');
 db.exec('CREATE TABLE IF NOT EXISTS native_code(id TEXT PRIMARY KEY,contract_id TEXT NOT NULL,payload TEXT NOT NULL,certificate TEXT,state TEXT NOT NULL,deliverable_id TEXT,delivery TEXT,updated INTEGER NOT NULL)');
 code??=createOrderCodeWorker({apiKey,getApiKey,mission});
 let contracts=[],lastRefresh=-Infinity,readStatus='not-checked';const active=new Set();
 const read=id=>{const row=db.prepare('SELECT * FROM native_code WHERE id=?').get(id);if(!row)throw Error('Persisted native order missing');return {...row,payload:JSON.parse(row.payload),certificate:row.certificate?JSON.parse(row.certificate):null,delivery:row.delivery?JSON.parse(row.delivery):null};};
 const save=(id,state,extra={})=>db.prepare('UPDATE native_code SET state=?,deliverable_id=COALESCE(?,deliverable_id),delivery=COALESCE(?,delivery),updated=? WHERE id=?').run(state,extra.deliverableId??null,extra.delivery?JSON.stringify(extra.delivery):null,now(),id);
 const available=()=>provider?.adapter?.available===true&&sandbox.available===true;
 const reason=()=>!provider?.adapter?.available?'Eigener Dealwork-Agentzugang fehlt.':!sandbox.available?sandbox.reason??'Offline-Isolation fehlt.':null;
 const free=(execute,verify)=>({get available(){return available();},get reason(){return reason();},maxCostRappen:0,retrySafe:true,reconcileSafe:true,autoRetrySafe:true,execute,verify});
 const source=(binding,ctx)=>prepareDealworkSource(binding,(p,c)=>github.read(p,c),ctx,now);
 const stored=p=>{const row=read(p?.id);if(JSON.stringify(row.payload.prepared)!==JSON.stringify(p))throw Error('Native preparation integrity mismatch');return row;};
 const invalidate=row=>{if(row.state==='prepared')save(row.id,'invalidated');};
 const requireWork=async(row,ctx)=>{try{return await provider.requireWork(row.payload.binding,ctx);}catch(e){if(e.code==='DEALWORK_BINDING_CHANGED')invalidate(row);throw e;}};
 async function guard(row,ctx,{allowReview=false}={}){
  ctx?.assertActive?.();if(ctx?.signal?.aborted)throw Error('Stopped');
  if(row.state==='invalidated')throw Error('Native preparation invalidated');
  const work=await requireWork(row,ctx);
  if(!['escrow_locked','in_progress',...(allowReview?['in_review']:[])].includes(work.state))throw Error('Native work state does not allow this operation');
  const current=await source(row.payload.binding,ctx),p=row.payload.prepared;
  if(current.baseSha!==p.baseSha||current.sourceDigest!==p.sourceDigest||current.publicScopeDigest!==p.publicScopeDigest){invalidate(row);throw Error('Public scope or source changed; fresh preparation required');}
  // Source reads may take longer than the funding proof's lifetime. Refresh the
  // native assignment/scope/escrow after them, immediately before local/AI work.
  const final=await requireWork(row,ctx);
  if(!['escrow_locked','in_progress',...(allowReview?['in_review']:[])].includes(final.state))throw Error('Native work state changed during source refresh');
  return final;
 }
 const coding=Object.defineProperties({},Object.getOwnPropertyDescriptors(code));
 Object.defineProperty(coding,'available',{configurable:true,get:()=>available()&&code.available!==false});
 Object.defineProperty(coding,'reason',{configurable:true,get:()=>reason()??code.reason});
 coding.execute=async ctx=>{
  const previous=ctx.dependencies.find(r=>r.prepared),row=stored(previous?.prepared);await guard(row,ctx);
  const publicPrevious={prepared:row.payload.prepared,sources:previous.sources,analysis:previous.analysis,validation:previous.validation};
  const result=await code.execute({...ctx,task:{...ctx.task,input:{title:'Implement public issue with a regression test'}},dependencies:[publicPrevious]});
  return {...result,kind:'dealwork-code',prepared:row.payload.prepared};
 };
 coding.verify=r=>code.verify({...r,kind:'order-code'})&&!!applyCodeChanges(r.prepared,r.analysis.changes);
 const adapters={
  'dealwork-code-prepare':free(async ctx=>{
   const binding=await provider.readWork(ctx.task.input.contractId,ctx);if(!['escrow_locked','in_progress'].includes(binding.state))throw Error('Native contract is not ready for work');
   const publicSource=await source(binding,ctx),id=nativeDigest([binding.contractId,binding.scopeDigest,publicSource.baseSha,publicSource.publicScopeDigest]).slice(0,32);
   const old=db.prepare('SELECT id FROM native_code WHERE id=?').get(id);
   const prepared=old?read(id).payload.prepared:{...publicSource,id};
   if(!old)db.prepare("INSERT INTO native_code VALUES(?,?,?,NULL,'prepared',NULL,NULL,?)").run(id,binding.contractId,JSON.stringify({binding,prepared}),now());
   const row=stored(prepared);await guard(row,ctx);const baseline=await sandbox.run(prepared.files,ctx);
   return {kind:'dealwork-code-prepare',prepared,baseline,eligible:baseline.passed,sources:[{id:'native-public-'+id,url:prepared.url,claim:prepared.issueBody.slice(0,1000),observedAt:prepared.observedAt}]};
  },r=>typeof r?.eligible==='boolean'&&!!r.prepared),
  'dealwork-code':coding,
  'dealwork-code-check':free(async ctx=>{
   const r=ctx.dependencies.find(x=>x.kind==='dealwork-code');if(!r)throw Error('Native code missing');const row=stored(r.prepared);
   const guarded={image:sandbox.image,async run(files,options){await guard(row,ctx);return sandbox.run(files,{...ctx,...options});}};
   const validation=await verifyOrderCode(r,guarded,ctx);
   if(validation.passed){const files=applyCodeChanges(r.prepared,r.analysis.changes);
    if(!validation.baselinePassed||!validation.regressionFailsOriginal||validation.sourceDigest!==codeDigest(files)||validation.baseDigest!==r.prepared.sourceDigest||!/^sha256:[a-f0-9]{64}$/.test(validation.image??'')||!Number.isSafeInteger(validation.tests)||validation.tests<1)throw Error('Exact validation certificate missing');
    if(row.certificate&&row.certificate.digest!==codeDigest(files))throw Error('Immutable native certificate');
    db.prepare('UPDATE native_code SET certificate=?,updated=? WHERE id=?').run(JSON.stringify({files,validation,digest:codeDigest(files)}),now(),r.prepared.id);
   }
   return {...r,kind:'dealwork-code-check',validation};
  },r=>typeof r?.validation?.passed==='boolean'),
  'dealwork-code-submit':free(async ctx=>{
   const r=ctx.dependencies.find(x=>x.kind==='dealwork-code-check');if(!r?.validation?.passed)throw Error('Native validation required');
   const id=r.prepared.id;if(active.has(id))throw Error('Native delivery already active');active.add(id);
   try{
    let row=stored(r.prepared);if(!row.certificate||codeDigest(row.certificate.files)!==row.certificate.digest)throw Error('Certified files missing');
    const done=()=>({kind:'dealwork-code-submit',prepared:r.prepared,submission:{submitted:true,deliverableId:read(id).deliverable_id,acceptanceConfirmed:false,paymentConfirmed:false}});
    if(row.state==='submitted')return done();
    let work=await guard(row,ctx,{allowReview:true});
    if(row.state==='start-unknown'){
     if(work.state!=='in_progress')throw Error('Unknown START_WORK outcome; no repeat POST');save(id,'started');
    }
    row=read(id);
    if(row.state==='prepared'){
     if(work.state==='escrow_locked'){await guard(row,ctx);save(id,'start-unknown');await provider.writeWork(row.payload.binding,{type:'START_WORK'},ctx);work=await provider.requireWork(row.payload.binding,ctx);if(work.state!=='in_progress')throw Error('START_WORK not confirmed');}
     if(work.state!=='in_progress')throw Error('Native state requires reconciliation');save(id,'started');
    }
    row=read(id);
    if(!row.delivery){
     const delivery={description:'numaron verified public code '+id,outputData:{files:Object.fromEntries(row.certificate.files.map(f=>[f.path,f.content])),validation:{sourceDigest:row.certificate.digest,baseDigest:r.prepared.sourceDigest,image:row.certificate.validation.image,tests:row.certificate.validation.tests,baselinePassed:true,regressionFailsOriginal:true}}};
     if(Buffer.byteLength(JSON.stringify(delivery.outputData))>40000)throw Error('Native delivery size limit');save(id,row.state,{delivery});row=read(id);
    }
    if(row.state==='delivery-unknown'||row.state==='submit-unknown'){
     const deliveries=await provider.deliveries(row.contract_id,ctx),matches=deliveries.filter(x=>x.description===row.delivery.description&&nativeDigest(x.outputData)===nativeDigest(row.delivery.outputData));
     if(matches.length!==1||!uuid(matches[0]?.id)||row.deliverable_id&&row.deliverable_id!==matches[0].id)throw Error('Unknown or ambiguous deliverable; no repeat POST');
     if(row.state==='submit-unknown'){
      if(work.state!=='in_review'||deliveries.length!==1)throw Error('Unknown SUBMIT_WORK outcome; no repeat POST');
      save(id,'submitted',{deliverableId:matches[0].id});return done();
     }
     save(id,'delivered',{deliverableId:matches[0].id});
    }
    row=read(id);
    if(row.state==='started'){
     await guard(row,ctx);const previous=await provider.deliveries(row.contract_id,ctx);
     if(previous.length)throw Error('Existing native deliverables require explicit revision review');
     save(id,'delivery-unknown');const d=await provider.writeWork(row.payload.binding,{type:'DELIVER',...row.delivery},ctx);
     if(!uuid(d?.id))throw Error('Deliverable identifier missing');
     const deliveries=await provider.deliveries(row.contract_id,ctx),matches=deliveries.filter(x=>x.id===d.id&&x.description===row.delivery.description&&nativeDigest(x.outputData)===nativeDigest(row.delivery.outputData));
     if(matches.length!==1||deliveries.length!==1)throw Error('Exact remote deliverable unconfirmed');save(id,'delivered',{deliverableId:d.id});
    }
    row=read(id);if(row.state!=='delivered')throw Error('Native delivery state invalid');
    await guard(row,ctx);save(id,'submit-unknown');await provider.writeWork(row.payload.binding,{type:'SUBMIT_WORK',deliverableId:row.deliverable_id},ctx);
    work=await provider.requireWork(row.payload.binding,ctx);if(work.state!=='in_review')throw Error('Submission unconfirmed');
    save(id,'submitted');return done();
   }finally{active.delete(id);}
  },r=>r?.submission?.submitted===true&&!!r.submission.deliverableId)
 };
 return {adapters,executionSandbox:sandbox,
  async refresh({isEnabled=()=>true}={}){
   if(!isEnabled())return;await sandbox.refresh();if(!isEnabled()||now()-lastRefresh<60000)return;
   lastRefresh=now();try{contracts=await provider.listWork({assertActive(){if(!isEnabled())throw Error('Numaron OFF');}});readStatus='verified';}catch{contracts=[];readStatus='failed';}
  },
  status:()=>({platform:'dealwork',scope:'Assigned funded native code; public JavaScript sources; no bids or financial actions',available:available(),reason:reason(),authenticatedRead:readStatus,ownWorkContracts:contracts.length,algora:'read-only research',orders:db.prepare('SELECT id,contract_id,state,deliverable_id,updated FROM native_code ORDER BY updated DESC LIMIT 100').all()}),
  advance(controller){
   const snapshot=controller.snapshot();if(snapshot.status!=='running'||!snapshot.budget.active)return;
   const history=controller.planningHistory(),enqueue=(id,kind,rootTaskId,input,dependencies=[])=>{if(!controller.hasTask(id))controller.enqueue({id,kind,rootTaskId,input,dependencies,resources:['dealwork-'+input.contractId]});};
   for(const c of contracts.filter(c=>['escrow_locked','in_progress'].includes(c.state))){const root='dealwork-'+c.contractId;enqueue(root+'-prepare','dealwork-code-prepare',root,{contractId:c.contractId,version:1,title:'Zugewiesenen Dealwork-Codeauftrag vorbereiten'});}
   for(const t of history.filter(t=>t.status==='done'&&t.kind.startsWith('dealwork-code'))){
    const r=controller.result(t.id),root=t.rootTaskId,contractId=root.slice('dealwork-'.length),attempt=t.input.attempt??1,version=t.input.version??1,prefix=version===1?root:root+'-v'+version;
    const row=r.prepared?read(r.prepared.id):null;
    if(row?.state==='invalidated'){
     if(version<3)enqueue(root+'-v'+(version+1)+'-prepare','dealwork-code-prepare',root,{contractId,version:version+1,title:'Geänderten Dealwork-Auftrag neu vorbereiten'});
     continue;
    }
    if(t.kind==='dealwork-code-prepare'&&r.eligible)enqueue(prefix+'-code-1','dealwork-code',root,{contractId,attempt:1,version,title:'Öffentlichen Codefehler beheben'},[t.id]);
    if(t.kind==='dealwork-code')enqueue(prefix+'-check-'+attempt,'dealwork-code-check',root,{contractId,attempt,version,title:'Änderung und neue Regression offline prüfen'},[t.id]);
    if(t.kind==='dealwork-code-check'){
     if(r.validation.passed)enqueue(prefix+'-submit','dealwork-code-submit',root,{contractId,version,title:'Geprüfte native Lieferung einmalig einreichen'},[t.id]);
     else if(attempt<3)enqueue(prefix+'-code-'+(attempt+1),'dealwork-code',root,{contractId,attempt:attempt+1,version,title:'Testfehler gezielt beheben'},[t.id]);
    }
   }
  },close(){github.close?.();db.close();}
 };
}
