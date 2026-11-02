import fs from 'node:fs';import path from 'node:path';import Database from 'better-sqlite3';
import os from 'node:os';
import {checkedJSON,digest,orderKey} from './founder-restoration-integrity.mjs';
import {referenceScope,createReferenceAuthority} from './founder-reference-approvals.mjs';
import {createReferenceAdmin} from './founder-reference-admin.mjs';import {openEvidenceStore} from './founder-evidence-store.mjs';
function noLinks(file){for(let p=path.resolve(file);;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Reference path link rejected');if(path.dirname(p)===p)break;}}
function boundedFile(file,max){noLinks(file);if(!fs.existsSync(file))return false;const s=fs.statSync(file);if(!s.isFile()||s.size>max)throw Error('Reference file size or type rejected');return true;}
function inspectCopy(directory,files,inspect){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-reference-inspection-'));
 try{
  const originals=files.map(([name,max])=>{const file=path.join(directory,name);const bytes=boundedFile(file,max)?fs.readFileSync(file):null;if(bytes)fs.writeFileSync(path.join(temp,name),bytes);return {name,max,bytes};});
  const result=inspect(temp);
  for(const {name,max,bytes} of originals){const file=path.join(directory,name),exists=boundedFile(file,max);if(bytes===null?exists:!exists||!bytes.equals(fs.readFileSync(file)))throw Error('Reference files changed during inspection');}
  return result;
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
const identity=b=>digest([orderKey(b),b.sourceRevision]);
export function readLocalReferenceProducts(directory){
 noLinks(directory);const staged=path.join(directory,'reference-candidates.json'),productsFile=path.join(directory,'products.db'),rows=new Map();
 if(boundedFile(staged,2000000)){
  const manifest=checkedJSON(JSON.parse(fs.readFileSync(staged,'utf8')),2000000);
  if(Object.keys(manifest).sort().join(',')!=='bindings,schema'||manifest.schema!=='reference-candidates-v1'||!Array.isArray(manifest.bindings)||manifest.bindings.length>100)throw Error('Invalid reference candidate manifest');
  for(const binding of manifest.bindings){referenceScope(binding);const id=identity(binding);if(rows.has(id))throw Error('Duplicate reference candidate');rows.set(id,{id,product:{binding,files:[],stage:'reference-preparation'}});}
 }
 if(boundedFile(productsFile,20000000)){
  for(const suffix of ['-wal','-shm'])noLinks(productsFile+suffix);
  const db=new Database(productsFile,{readonly:true,fileMustExist:true});try{
   const bounds=db.prepare('SELECT count(*) n, coalesce(sum(length(payload)),0) bytes FROM restoration_products').get();if(bounds.n>1000||bounds.bytes>2000000)throw Error('Reference product bounds exceeded');
   for(const row of db.prepare('SELECT id,payload FROM restoration_products ORDER BY id').all()){
    const product=checkedJSON(JSON.parse(row.payload));if(product.binding?.qualityContract?.profile!=='invoice-reconciliation-v1')continue;
    referenceScope(product.binding);if(row.id!==identity(product.binding))throw Error('Stored reference identity mismatch');
    if(!['prepared','worked','verified'].includes(product.stage))throw Error('Invalid product stage');
    if(product.stage==='prepared')product.files=[];
    else if(!Array.isArray(product.files)||product.digest!==digest({files:product.files}))throw Error('Stored product bytes mismatch');
    rows.set(row.id,{id:row.id,product});
   }
  }finally{db.close();}
 }
 if(rows.size>100)throw Error('Too many reference candidates');return [...rows.values()];
}
export function openLocalReferenceAdmin({directory,readPower,reviewerId,now=Date.now}){
 if(typeof readPower!=='function'||readPower()?.enabled!==false)throw Error('Reference administration startup requires confirmed OFF');
 noLinks(directory);if(!fs.statSync(directory).isDirectory())throw Error('Existing reviewed directory required');
 const file=path.join(directory,'reference-evidence.db');for(const suffix of ['','-wal','-shm'])noLinks(file+suffix);
 const store=openEvidenceStore({file});try{
  const admin=createReferenceAdmin({store,readProducts:()=>readLocalReferenceProducts(directory),readPower,reviewerId,now});
  return {admin,evidenceSnapshot:()=>store.snapshot(),authority:sourceId=>createReferenceAuthority({sourceId,store,now}),close:()=>store.close()};
 }catch(e){store.close();throw e;}
}
function readReferenceConfig(base){
 const file=path.join(base,'artifacts/founder-reference-admin-config.json');if(!boundedFile(file,2048))return null;
 const config=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!config||Object.keys(config).sort().join(',')!=='enabled,reviewerId'||typeof config.enabled!=='boolean'||typeof config.reviewerId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(config.reviewerId))throw Error('Invalid reference administration configuration');
 return config;
}
export function openConfiguredReferenceAdmin({base,readPower,now=Date.now}){
 const config=readReferenceConfig(base);if(!config)return null;
 if(!config.enabled)return null;
 return openLocalReferenceAdmin({directory:path.join(base,'artifacts/founder-autonomy-20261013/restoration'),readPower,reviewerId:config.reviewerId,now});
}

/** Inspect isolated DB/WAL copies only; never open source SQLite files. */
export function inspectReferenceReadiness({base,readPower}){
 const result={status:'blocked',configuration:'missing',candidates:'unavailable',candidateCount:0,evidence:'missing',capacity:null,power:'unknown',maintenanceAllowed:false,liveAcceptanceVerified:false,blockers:[]};
 try{const enabled=readPower?.()?.enabled;result.power=enabled===true?'ON':enabled===false?'OFF':'unknown';}catch{}
 result.maintenanceAllowed=result.power==='OFF';
 try{const config=readReferenceConfig(base);result.configuration=!config?'missing':config.enabled?'enabled':'disabled';}catch{result.configuration='invalid';}
 if(result.configuration!=='enabled')result.blockers.push('reference-configuration-'+result.configuration);
 const directory=path.join(base,'artifacts/founder-autonomy-20261013/restoration');
 try{const rows=inspectCopy(directory,[['reference-candidates.json',2000000],['products.db',20000000],['products.db-wal',20000000]],copy=>readLocalReferenceProducts(copy));result.candidateCount=rows.length;result.candidates=rows.length?'available':'empty';}catch{result.candidates='unavailable';}
 if(result.candidates!=='available')result.blockers.push('reference-candidates-'+result.candidates);
 try{
  const s=inspectCopy(directory,[['reference-evidence.db',20000000],['reference-evidence.db-wal',20000000]],copy=>{const file=path.join(copy,'reference-evidence.db');if(!fs.existsSync(file))return null;const store=openEvidenceStore({file,readonly:true});try{return store.snapshot();}finally{store.close();}});
  if(s){result.evidence='verified';result.capacity=s.capacity;}
 }catch{result.evidence='unavailable';}
 if(result.evidence!=='verified')result.blockers.push('reference-evidence-'+result.evidence);
 if(result.capacity?.reserveDeficit>0)result.blockers.push('reference-withdrawal-reserve-deficit');
 if(!result.blockers.length)result.status='ready-for-reference-review';
 return result;
}
