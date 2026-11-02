/** Explicit offline acceptance runner. Never imported by the production launcher.
 * Authoring is Codex-authored code; execution uses the real Numaron order engine,
 * real pinned interpreter isolation and a deliberately synthetic source adapter.
 * No provider, credential, production grant, production ON or paid call is used.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {normalizeInventory} from './founder-source-registry.mjs';
import {planOrderActions} from './founder-order-lifecycle.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
import {createProfileSandbox} from './founder-profile-sandbox.mjs';
import {boundedProcess} from './founder-code-sandbox.mjs';
import {digest} from './founder-restoration-integrity.mjs';

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function referenceFiles(directory=path.join(workspace,'packages/numaron-it-reference')){
 const files=[];
 function visit(dir,prefix=''){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   if(entry.name==='__pycache__'||entry.name==='build_fixtures.py')continue;
   const name=prefix+entry.name,absolute=path.join(dir,entry.name);
   if(entry.isSymbolicLink())throw Error('Reference source cannot contain symlinks');
   if(entry.isDirectory())visit(absolute,name+'/');
   else if(/\.(py|json|md|txt)$/.test(name))files.push({path:name,content:fs.readFileSync(absolute,'utf8').replace(/^\uFEFF/,'')});
   else throw Error('Unexpected reference source: '+name);
  }
 }
 visit(directory);return files;
}

export async function runOfflineReference(output){
 const initial=referenceFiles(),initialDigest=profileFilesDigest(initial);
 fs.mkdirSync(output,{recursive:true});
 const pin=await boundedProcess(['image','inspect','localhost/obolus-specula-python:3.11','--format','{{.Id}}'],{timeout:15000});
 assert.equal(pin.code,0,'Existing offline Python image required; no pull fallback');
 const image=pin.stdout.trim().replace(/^(?!sha256:)/,'sha256:');
 assert.match(image,/^sha256:[a-f0-9]{64}$/);
 const sandbox=createProfileSandbox({runtime:{profileId:'python',image}});
 assert.equal(await sandbox.probe(),true,'Real network-none interpreter isolation probe required');
 const runs=[];
 const observedSandbox={get available(){return sandbox.available;},get certification(){return sandbox.certification;},get image(){return image;},filesDigest:profileFilesDigest,
  async run(files,ctx){const result=await sandbox.run(files,ctx);runs.push(result);return result;}};
 const acceptance=initial.filter(f=>/^tests\/test_(product|transport|evaluation)\.py$/.test(f.path));
 assert.equal(acceptance.length,3,'Independent acceptance files required');
 // An original boot/auth contract is preserved while all seven substantive
 // modules are intentionally unfinished. The work stage applies the entire
 // reviewed implementation, not just a precomputed successful result.
 const skeletons={
  'app.py':`class DocumentApp:\n def __init__(self,database,token): self.token=token\n def request(self,method,path,body,token):\n  if token!=self.token: return 401,{'error':'authentication required'}\n  if method=='GET' and path=='/api/jobs': return 200,{'jobs':[]}\n  raise NotImplementedError('document workflow not implemented')\n def close(self): pass\ndef extract_fields(text,label): raise NotImplementedError('field extraction not implemented')\n`,
  'ocr.py':`def parse_pgm(raw): raise NotImplementedError('raster decoder missing')\ndef parse_png(raw): raise NotImplementedError('PNG decoder missing')\ndef recognize(raw): raise NotImplementedError('OCR missing')\n`,
  'classifier.py':`class Classifier:\n @classmethod\n def load_default(cls): raise NotImplementedError('training and inference missing')\n`,
  'store.py':`class Conflict(Exception): pass\nclass Store:\n def __init__(self,file): raise NotImplementedError('durable store missing')\n`,
  'ui.py':`HTML='<h1>Document workflow not implemented</h1>'\n`,
  'cli.py':`raise NotImplementedError('transport not implemented')\n`,
  'evaluate.py':`def evaluate(fixtures,output): raise NotImplementedError('evaluation missing')\ndef score(cases,results): raise NotImplementedError('independent scoring missing')\n`
 };
 const baseline=initial.filter(f=>!acceptance.includes(f)).map(f=>Object.hasOwn(skeletons,f.path)?{...f,content:skeletons[f.path]}:f);
 assert.notEqual(profileFilesDigest(baseline),initialDigest);
 const changes=[...initial.filter(f=>Object.hasOwn(skeletons,f.path)),...acceptance];
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-it-acceptance-'));
 const workPackages={rows:[{id:'offline-it',label:'Offline reference fixture',inventoryKind:'core'}]};
 const sourceId=normalizeInventory({},workPackages).sources[0].id;
 const key={sourceId,externalId:'synthetic-document-project',ownerId:'synthetic-owner'};
 const sourceRevision='offline-scope-v1',scopeDigest=digest(initial.find(f=>f.path==='REQUIREMENTS.md')?.content??'reference-acceptance-v1');
 const binding={...key,assignmentConfirmed:true,buyerId:'synthetic-buyer',termsVerified:true,aiAllowed:true,profileId:'python',scopeDigest,inputs:[{privacy:'public',id:'locally-generated-noncustomer-fixtures'}],acceptanceCriteria:['Exact pixel recognition and field extraction','Heldout classification and verifier mutation rejection','Durable API/GUI workflow and exact-once simulated submission'],files:baseline};
 const recipient=path.join(base,'synthetic-recipient.json');let writes=0;const calls=[];
 const source={sourceId,profiles:['python'],evidenceRef:'fixture:offline-source-never-production',
  methods:{prepare:async()=>({confirmed:true,binding}),submit:async({product,deliveryIntent})=>{
   calls.push('submit');assert(!fs.existsSync(recipient),'Never dispatch twice');writes++;
   fs.writeFileSync(recipient,JSON.stringify({...key,sourceRevision,remoteId:'synthetic-receipt-1',digest:product.digest,files:product.files,deliveryIntent}),{flag:'wx'});
   throw Error('synthetic lost acknowledgement after durable recipient commit');
  },'reconcile-delivery':async()=>{calls.push('reconcile-delivery');const r=JSON.parse(fs.readFileSync(recipient));return {confirmed:true,delivery:{...key,sourceRevision,verified:true,digest:r.digest,remoteId:r.remoteId,evidenceRef:'fixture:separate-recipient-readback'}};}},
  verify(kind,result){if(kind==='prepare')return result.confirmed===true&&result.binding===binding;return kind==='reconcile-delivery'&&result.delivery?.sourceRevision===sourceRevision&&result.delivery?.ownerId===key.ownerId&&result.delivery?.sourceId===sourceId;},
  verifyProduct:async product=>profileFilesDigest(product.files)===initialDigest&&product.binding.scopeDigest===scopeDigest&&runs.some(r=>r.passed===true&&r.sourceDigest===initialDigest&&r.tests>=18)
 };
 let enabled=true,engine;
 const execution={sources:[source],sandboxes:{python:observedSandbox},patchLimits:{maxFiles:16,maxBytes:128000},evidenceMaxBytes:1000000,generate:async()=>({changes,costReceipt:{actualCostRappen:0,evidenceRef:'fixture:offline-prepared-implementation-no-inference'}})};
 const directory=path.join(base,'engine');
 const open=()=>openOrderRestoration({base,directory,isEnabled:()=>enabled,workPackages,execution});
 async function step(kind){const order=engine.store.snapshot().orders[0],s=engine.registry.snapshot().sources[0];const action=planOrderActions({order,source:s,budget:{active:true,rootRemainingRappen:250}})[0];assert.equal(action?.kind,kind);return engine.adapters['source-'+kind].execute({task:{rootTaskId:'offline-root',input:{action}},grant:{reservationId:'synthetic-reservation',maxCostRappen:0},assertActive(){assert(enabled,'Temporary fixture stopped');}});}
 try{
  engine=open();for(const operation of ['work','verify','submit','reconcile'])engine.registry.setCapability(sourceId,operation,{state:'live-verified',expiresAt:Date.now()+600000,evidenceRefs:['synthetic-only-in-temporary-db']});
  engine.store.register({...key,rootTaskId:'offline-root',sourceRevision,state:'assigned',termsVerified:true,funding:{...key,verified:true,amountMinor:1000,netAmountMinor:900,currency:'CHF',recipient:'synthetic-recipient-no-money',expiresAt:Date.now()+600000},provenance:{type:'reviewed-local-registration',ownerId:key.ownerId,evidenceRef:'fixture:no-real-assignment'}});
  for(const kind of ['prepare','work','verify'])await step(kind);
  await assert.rejects(step('submit'),/synthetic lost acknowledgement/);
  assert.equal(writes,1);assert.equal(engine.status().execution.deliveries[0].status,'unknown');
  engine.close();engine=open();
  await step('reconcile-delivery');assert.equal(writes,1);
  assert.equal(engine.status().execution.deliveries[0].status,'confirmed');
  const result=engine.store.snapshot().orders[0];
  assert.equal(result.state,'submitted');assert.equal(result.payment?.confirmed??false,false);
  const db=new Database(path.join(directory,'products.db'),{readonly:true});
  let product;try{product=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);}finally{db.close();}
  assert.equal(profileFilesDigest(product.files),initialDigest);
  fs.writeFileSync(path.join(output,'verified-files.json'),JSON.stringify(product.files));
  fs.writeFileSync(path.join(output,'sandbox-runs.json'),JSON.stringify(runs,null,2));
  enabled=false;
  const summary={schema:'numaron-it-reference-v1',checkedAt:new Date().toISOString(),image,sourceDigest:initialDigest,sourceUnchanged:initialDigest===profileFilesDigest(referenceFiles()),sandbox:{network:'none',hostMounts:false,pinned:true,probePassed:true},runs:runs.map(({passed,tests,exitCode,sourceDigest})=>({passed,tests,exitCode,sourceDigest})),implementationMode:'Codex-authored reviewed offline patch; deterministic replay through existing Numaron order engine, no model/provider calls',syntheticAuthorityOnly:true,temporaryState:true,productionPowerChanged:false,providerCalls:0,realMessagesSent:0,realPayments:0,submissionWrites:writes,calls,delivery:engine.status().execution.deliveries,orderState:result.state,paymentConfirmed:false,liveAuthorized:false};
  assert(summary.sourceUnchanged);assert(runs.some(r=>r.passed===false),'New acceptance must reject incomplete baseline');
  fs.writeFileSync(path.join(output,'lifecycle.json'),JSON.stringify(summary,null,2));
  return summary;
 }finally{engine?.close();assert(path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(base,{recursive:true,force:true});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=path.resolve(process.argv[2]??path.join(workspace,'outputs/it-reference-20261024'));
 const result=await runOfflineReference(output);console.log(JSON.stringify(result,null,2));
}
