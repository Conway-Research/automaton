import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHmac,createHash} from 'node:crypto';
import {createOrderFunding} from './founder-order-funding.mjs';

export const DEALWORK_ACCOUNT='dd23a701-dc59-4dab-9287-6669a95c4da2';
const ORIGIN='https://dealwork.ai';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HELD=new Set(['escrow_locked','in_progress','in_review','revision_requested']);
const fail=()=>{throw Error('Dealwork escrow evidence unavailable or inconsistent');};
const active=ctx=>{if(ctx?.signal?.aborted)fail();ctx?.assertActive?.();};
const cents=value=>{if(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(value))fail();const [whole,fraction='']=value.split('.');const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<=0)fail();return n;};

// Reuse the already provisioned dedicated agent credential. Never read browser or
// Codex credential stores; never persist decrypted contents or return them in reports.
export function readDealworkAccess({file=path.join(os.homedir(),'AppData/Local/Obolus/DealworkCredentials/primary.dpapi'),decrypt}={}){
 try{
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64000)fail();
  const encrypted=fs.readFileSync(file,'utf8').trim();
  const plain=decrypt?decrypt(encrypted):execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
   "Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; $s=ConvertTo-SecureString ([Console]::In.ReadToEnd()); $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }"],
   {input:encrypted,encoding:'utf8',windowsHide:true,timeout:5000,stdio:['pipe','pipe','ignore']});
  const envelope=JSON.parse(plain),a=envelope.response?.data??envelope.response;
  if(a?.agentAccountId!==DEALWORK_ACCOUNT||![a.apiKey,a.hmacSecret].every(x=>typeof x==='string'&&x.length>=8&&x.length<=8000&&!/[\r\n]/.test(x)))fail();
  return {available:true,agentAccountId:a.agentAccountId,apiKey:a.apiKey,hmacSecret:a.hmacSecret};
 }catch{return {available:false};}
}

export function createDealworkEscrow({getAccess=readDealworkAccess,request=fetch,now=Date.now}={}){
 let access,accessAt=-Infinity;
 const credentials=()=>{if(getAccess!==readDealworkAccess||now()-accessAt>=30000||now()<accessAt){try{access=getAccess();}catch{access=null;}accessAt=now();}return access?.available===true&&access.agentAccountId===DEALWORK_ACCOUNT&&typeof access.apiKey==='string'&&typeof access.hmacSecret==='string'?access:null;};
 async function get(endpoint,ctx,body){
  active(ctx);
  if(!/^\/api\/v1\/(?:agents\/me|contracts\?role=worker&per_page=50&page=[1-9]\d?|contracts\/[a-f0-9-]{36}(?:\/deliverables)?)$/.test(endpoint)&&!(body&&/^\/api\/v1\/contracts\/[a-f0-9-]{36}\/events$/.test(endpoint)))fail();
  const auth=credentials();if(!auth)fail();
  const stamp=String(Math.floor(now()/1000));
  const raw=body===undefined?'':JSON.stringify(body);
  const signature=createHmac('sha256',auth.hmacSecret).update(auth.agentAccountId+stamp+raw).digest('hex');
  let response;
  try{response=await request(ORIGIN+endpoint,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:raw}),redirect:'error',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(20000),...(ctx?.signal?[ctx.signal]:[])]),headers:{Authorization:'Bearer '+auth.apiKey,'X-Agent-ID':auth.agentAccountId,'X-Timestamp':stamp,'X-Signature':signature,'Cache-Control':'no-cache',Accept:'application/json','Content-Type':'application/json'}});}catch{fail();}
  active(ctx);if(!response.ok)fail();
  const date=Date.parse(response.headers.get('date')),age=Number(response.headers.get('age')??0);
  if(!Number.isFinite(date)||Math.abs(date-now())>30000||!Number.isFinite(age)||age!==0)fail();
  const reader=response.body?.getReader();if(!reader)fail();let size=0;const chunks=[];
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>300000)fail();chunks.push(chunk.value);active(ctx);}}finally{await reader.cancel();}
  active(ctx);try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail();}
 }
 async function listOwn(ctx){
  const me=(await get('/api/v1/agents/me',ctx)).data;
  // agents/me.id is the agent profile, accountId is the contract beneficiary.
  if(me?.accountId!==DEALWORK_ACCOUNT||me.isSuspended!==false)fail();
  const rows=[];let total;
  for(let page=1;page<=10;page++){
   const r=await get('/api/v1/contracts?role=worker&per_page=50&page='+page,ctx);
   if(!Array.isArray(r.data)||r.data.length>50||r.meta?.page!==page||r.meta.per_page!==50||!Number.isSafeInteger(r.meta.total)||r.meta.total<0||r.meta.total>500||total!==undefined&&total!==r.meta.total)fail();
   total=r.meta.total;
   for(const row of r.data){if(!UUID.test(row.id??'')||!UUID.test(row.jobId??'')||row.workerAccountId!==DEALWORK_ACCOUNT||row.currency!==undefined&&row.currency!=='USD'||typeof row.state!=='string'||rows.some(x=>x.id===row.id))fail();rows.push(row);}
   if(rows.length===total)return rows;
   if(r.data.length!==50||rows.length>total)fail();
  }
  fail();
 }
 const nativeTerms=row=>({orderUrl:ORIGIN+'/dashboard/jobs/'+row.jobId,amountMinor:cents(row.amount),currency:'USD',recipient:'dealwork:'+DEALWORK_ACCOUNT});
 const source={provider:'dealwork',origin:ORIGIN,async read(terms,ctx){
  // Native contract binding only. A job description containing a GitHub URL is
  // not proof that the escrow finances that repository's bounty.
  const match=terms.orderUrl?.match(/^https:\/\/dealwork\.ai\/dashboard\/jobs\/([a-f0-9-]{36})$/);
  if(!match||!UUID.test(match[1])||terms.recipient!=='dealwork:'+DEALWORK_ACCOUNT||terms.currency!=='USD')fail();
  const rows=(await listOwn(ctx)).filter(r=>r.jobId===match[1]&&HELD.has(r.state));
  if(rows.length!==1)fail();const row=rows[0],detail=(await get('/api/v1/contracts/'+row.id,ctx)).data;
  if(!detail||detail.id!==row.id||detail.jobId!==row.jobId||detail.workerAccountId!==DEALWORK_ACCOUNT||!HELD.has(detail.state)||cents(detail.amount)!==cents(row.amount)||detail.currency!==undefined&&detail.currency!=='USD')fail();
  if(detail.deadline!=null&&(!Number.isFinite(Date.parse(detail.deadline))||Date.parse(detail.deadline)<=now()))fail();
  // Official contract state is the platform's escrow attestation, not an
  // independently audited bank balance. USD denomination: /terms section 3.
  const observedAt=now();return {...nativeTerms(detail),kind:'escrow-lock',status:'held',escrowId:detail.id,sourceUrl:ORIGIN+'/api/v1/contracts/'+detail.id,observedAt:new Date(observedAt).toISOString(),expiresAt:new Date(observedAt+60000).toISOString()};
 }};
 const funding=createOrderFunding({source,now});
 const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 async function readWork(id,ctx){
  if(!UUID.test(id??''))fail();
  const rows=(await listOwn(ctx)).filter(r=>r.id===id);if(rows.length!==1)fail();
  const row=rows[0],d=(await get('/api/v1/contracts/'+id,ctx)).data;
  const contractKeys=new Set(['id','jobId','workerAccountId','buyerAccountId','amount','currency','state','deadline','job','createdAt','updatedAt','revisionCount']);
  if(!d||Object.keys(d).some(k=>!contractKeys.has(k)))fail();
  if(!d||d.id!==id||d.jobId!==row.jobId||d.workerAccountId!==DEALWORK_ACCOUNT||d.buyerAccountId!==row.buyerAccountId||!UUID.test(d.buyerAccountId??'')||d.buyerAccountId===DEALWORK_ACCOUNT||!HELD.has(d.state)||d.state!==row.state||cents(d.amount)!==cents(row.amount)||d.currency!==undefined&&d.currency!=='USD'||!Number.isFinite(Date.parse(d.deadline))||Date.parse(d.deadline)<=now())fail();
  if(d.job?.id!==d.jobId||typeof d.job.title!=='string'||typeof d.job.description!=='string'||!d.job.description.trim()||Buffer.byteLength(JSON.stringify(d.job))>20000)fail();
  const terms=nativeTerms(d),proof=await funding.require(terms,ctx);
  if(proof.escrowId!==id)fail();
  // Bind every returned contractual field, except operational state/timestamps.
  // New or changed fields invalidate preparation instead of silently expanding scope.
  const {state,updatedAt,createdAt,...scope}=d;
  return {contractId:id,jobId:d.jobId,buyerAccountId:d.buyerAccountId,state,deadline:d.deadline,scopeDigest:digest(scope),job:d.job,terms,funding:proof};
 }
 async function requireWork(binding,ctx){
  const current=await readWork(binding?.contractId,ctx);
  if(current.scopeDigest!==binding.scopeDigest||JSON.stringify(current.terms)!==JSON.stringify(binding.terms)||current.funding.escrowId!==binding.funding?.escrowId){const error=Error('Dealwork contract binding changed; fresh preparation required');error.code='DEALWORK_BINDING_CHANGED';throw error;}
  return current;
 }
 return {
  async listWork(ctx){return (await listOwn(ctx)).filter(r=>['escrow_locked','in_progress','in_review'].includes(r.state)).map(r=>({contractId:r.id,state:r.state}));},
  readWork,requireWork,
  async deliveries(id,ctx){await readWork(id,ctx);const r=await get('/api/v1/contracts/'+id+'/deliverables',ctx);if(!Array.isArray(r.data)||r.data.length>=50||r.meta&&r.meta.total!==r.data.length)fail();return r.data;},
  async writeWork(binding,operation,ctx){
   const current=await requireWork(binding,ctx);let endpoint='/api/v1/contracts/'+binding.contractId+'/events',body;
   if(operation?.type==='START_WORK'&&Object.keys(operation).length===1&&current.state==='escrow_locked')body={type:'START_WORK'};
   else if(operation?.type==='SUBMIT_WORK'&&Object.keys(operation).sort().join(',')==='deliverableId,type'&&UUID.test(operation.deliverableId??'')&&current.state==='in_progress')body={type:'SUBMIT_WORK',deliverableId:operation.deliverableId};
   else if(operation?.type==='DELIVER'&&Object.keys(operation).sort().join(',')==='description,outputData,type'&&current.state==='in_progress'&&typeof operation.description==='string'&&operation.description.length<=2000&&operation.outputData&&Buffer.byteLength(JSON.stringify(operation.outputData))<=40000){endpoint='/api/v1/contracts/'+binding.contractId+'/deliverables';body={description:operation.description,outputData:operation.outputData};}
   else fail();
   return (await get(endpoint,ctx,body)).data;
  },
  async requireFunding(terms,ctx,options){if(!credentials())fail();return funding.require(terms,ctx,options);},
  adapter:{get available(){return !!credentials();},reason:'Vorhandener eigener Dealwork-Agentzugang erforderlich; ausschließlich lesender Escrow-Abgleich.',maxCostRappen:0,retrySafe:true,autoRetrySafe:true,
   async execute(ctx){
    const rows=await listOwn(ctx),held=rows.filter(r=>HELD.has(r.state));if(held.length>10)fail();
    const proofs=[];for(const row of held)proofs.push(await funding.require(nativeTerms(row),ctx));
    return {kind:'dealwork-escrow',privacy:'private',observedAt:new Date(now()).toISOString(),sources:[],data:{ownContracts:rows.length,proofs,assignmentOrWorkAuthorizedByThisRead:false,paymentConfirmed:false}};
   },verify:r=>r?.kind==='dealwork-escrow'&&r.privacy==='private'&&r.sources?.length===0&&Number.isSafeInteger(r.data?.ownContracts)&&Array.isArray(r.data?.proofs)&&r.data.proofs.every(p=>p.provider==='dealwork'&&p.recipient==='dealwork:'+DEALWORK_ACCOUNT&&p.status==='held')},
 };
}
