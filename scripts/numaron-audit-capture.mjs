import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {verifyAuditRecords} from './founder-security-audit.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const limit=100000;
const safeAction=x=>typeof x==='string'&&/^[a-z][a-z0-9:-]{0,99}$/.test(x)?x:'other';
function regular(file,base){
 const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||!fs.realpathSync(file).startsWith(fs.realpathSync(base)+path.sep))throw Error('Unsafe evidence source');return s;
}
export function captureOperationalAudit({base,destination,now=Date.now}){
 base=path.resolve(base);destination=path.resolve(destination);
 if(fs.existsSync(destination))throw Error('Capture destination already exists');
 for(let p=path.dirname(destination);;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Unsafe capture parent');if(p===path.dirname(p))break;}
 fs.mkdirSync(destination,{recursive:true,mode:0o700});
 const report={schema:'numaron-audit-capture-v1',at:new Date(now()).toISOString(),sources:[],baseline:[],limits:['Separate read-only SQLite snapshots, not a globally atomic snapshot','Local hashes require independent retention; not tamper-proof','No past missing log events reconstructed; no services or network requests started']};
 const write=(name,rows)=>fs.writeFileSync(path.join(destination,name),rows.map(r=>JSON.stringify(r)).join('\n')+(rows.length?'\n':''),{mode:0o600,flag:'wx'});
 for(const [id,relative,table,columns] of [
  ['controller','artifacts/founder-autonomy-20261013/controller.db','founder_events','seq,at,task_id,action'],
  ['operations','artifacts/founder-integration-20261012/founder-operations.db','founder_audit','seq,at,action,digest']
 ]){
  const info={id,file:relative},file=path.join(base,relative);let db;
  try{regular(file,base);db=new Database(file,{readonly:true,fileMustExist:true});db.pragma('query_only = ON');
   const snapshot=db.transaction(()=>({total:db.prepare(`select count(*) n from ${table}`).get().n,rows:db.prepare(`select ${columns} from ${table} order by seq desc limit ?`).all(limit).reverse()}))();
   const rows=snapshot.rows.map(r=>id==='controller'?{seq:r.seq,at:r.at,taskId:r.task_id,action:safeAction(r.action)}:{seq:r.seq,at:r.at,actionClass:r.action==='Aufgabe erfasst'?'task-created':r.action?.includes('→')?'task-transition':r.action==='Inhalt lokal geprüft'?'review':'other',actionDigest:hash(String(r.action)),digest:/^[a-f0-9]{64}$/i.test(r.digest??'')?r.digest:null});
   write(id+'.jsonl',rows);Object.assign(info,{status:'captured',total:snapshot.total,records:rows.length,truncated:snapshot.total>limit});
  }catch(e){info.status=e.code==='ENOENT'?'missing':'unavailable';}finally{db?.close();}report.sources.push(info);
 }
 const fields=['at','changedAt','event','outcome','cause','method','route','revision','previousRevision','requestedRevision','enabled','previousEnabled','pid','startupPid','requestId','sessionId'];
 for(const name of ['power-audit.jsonl','power-state.jsonl']){
  const relative='artifacts/founder-integration-20261012/'+name,file=path.join(base,relative),info={id:name,file:relative};
  try{const s=regular(file,base);if(s.size>4*1024*1024)throw Error('Source oversized');const bytes=fs.readFileSync(file),text=bytes.toString('utf8'),complete=text.slice(0,text.lastIndexOf('\n')+1);let invalid=0;const rows=[];
   for(const line of complete.split('\n').filter(Boolean).slice(-limit)){try{const r=JSON.parse(line),out={};for(const k of fields){const v=r[k];if(typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))out[k]=v;else if(typeof v==='string'&&/^[a-zA-Z0-9_:/ .+-]{1,120}$/.test(v))out[k]=v;}rows.push(out);}catch{invalid++;}}
   write(name,rows);Object.assign(info,{status:'captured',records:rows.length,invalid,sourceBytes:bytes.length,sourceSha256:hash(bytes),incompleteTrailingRecord:complete.length!==text.length});
  }catch(e){info.status=e.code==='ENOENT'?'missing':'unavailable';}report.sources.push(info);
 }
 const httpInfo={id:'security-http',file:'artifacts/founder-integration-20261012/security-http.jsonl',exportFile:'security-http.jsonl'};
 try{const records=[];let found=false;for(const suffix of ['.3','.2','.1','']){const file=path.join(base,httpInfo.file+suffix);if(!fs.existsSync(file))continue;found=true;const s=regular(file,base);if(s.size>2*1024*1024)throw Error('Oversized HTTP audit');const raw=fs.readFileSync(file,'utf8');if(raw&&!raw.endsWith('\n'))throw Error('Incomplete HTTP audit');records.push(...raw.split('\n').filter(Boolean).map(JSON.parse));}
  if(!found)httpInfo.status='missing';else{const chain=verifyAuditRecords(records);if(!chain.valid)throw Error('Invalid HTTP chain');
   const rows=records.map(r=>({seq:r.seq,at:typeof r.at==='string'&&/^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(r.at)?r.at:null,event:['login','http'].includes(r.event)?r.event:'other',method:['GET','POST','HEAD','PUT','PATCH','DELETE','OPTIONS'].includes(r.method)?r.method:'OTHER',route:['/','/api/session','/api/power'].includes(r.route)?r.route:'other',status:Number.isInteger(r.status)?r.status:0,authenticated:r.authenticated===true,sourceRecordHash:r.hash,previousHash:r.previousHash}));
   write(httpInfo.exportFile,rows);Object.assign(httpInfo,{status:'captured',records:rows.length,sourceChain:chain,projection:'Restricted metadata; source hashes refer to original records'});
  }
 }catch{httpInfo.status='unavailable';}report.sources.push(httpInfo);
 const codeFiles=['scripts/founder-dashboard.mjs','scripts/founder-security-audit.mjs','scripts/founder-power.mjs','scripts/founder-controller.mjs','scripts/founder-mt5.mjs'];
 const site=path.join(base,'sites/numaron/cloudflare-upload');
 if(fs.existsSync(site)&&fs.lstatSync(site).isDirectory()&&!fs.lstatSync(site).isSymbolicLink())for(const e of fs.readdirSync(site,{withFileTypes:true}))if(e.isFile())codeFiles.push('sites/numaron/cloudflare-upload/'+e.name);
 for(const relative of codeFiles){try{const file=path.join(base,relative);const s=regular(file,base);if(s.size>8*1024*1024)continue;report.baseline.push({file:relative,bytes:s.size,sha256:hash(fs.readFileSync(file))});}catch{}}
 fs.writeFileSync(path.join(destination,'capture.json'),JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
 const files=fs.readdirSync(destination).map(file=>({file,sha256:hash(fs.readFileSync(path.join(destination,file)))}));
 fs.writeFileSync(path.join(destination,'SHA256.json'),JSON.stringify({schema:'numaron-audit-manifest-v1',at:report.at,files},null,2),{mode:0o600,flag:'wx'});
 return report;
}
export function verifyCapture(destination){
 try{const m=JSON.parse(fs.readFileSync(path.join(destination,'SHA256.json'),'utf8'));if(m.schema!=='numaron-audit-manifest-v1'||!Array.isArray(m.files)||m.files.length>64)return {valid:false};
  const seen=new Set();for(const r of m.files){if(typeof r.file!=='string'||path.basename(r.file)!==r.file||r.file==='.'||r.file==='..'||seen.has(r.file)||!/^[a-f0-9]{64}$/.test(r.sha256))return {valid:false};seen.add(r.file);const file=path.join(destination,r.file),s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>64*1024*1024||hash(fs.readFileSync(file))!==r.sha256)return {valid:false};}
  if(!seen.has('capture.json')||fs.readdirSync(destination).some(n=>n!=='SHA256.json'&&!seen.has(n)))return {valid:false};
  const report=JSON.parse(fs.readFileSync(path.join(destination,'capture.json'),'utf8'));
  const expected=['controller','operations','power-audit.jsonl','power-state.jsonl','security-http'];
  if(report.schema!=='numaron-audit-capture-v1'||!Array.isArray(report.sources)||report.sources.length!==expected.length||new Set(report.sources.map(s=>s?.id)).size!==expected.length||expected.some(id=>!report.sources.some(s=>s?.id===id)))return {valid:false};
  for(const source of report.sources){if(!source||!['captured','missing','unavailable'].includes(source.status))return {valid:false};if(source.status==='captured'&&!seen.has(source.exportFile??(source.id.endsWith('.jsonl')?source.id:source.id+'.jsonl')))return {valid:false};}
  return {valid:true,files:seen.size};
 }catch{return {valid:false};}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==2||!['--out','--verify'].includes(args[0]))throw Error('Usage: node scripts/numaron-audit-capture.mjs --out NEW_OUTPUT_DIRECTORY | --verify CAPTURE_DIRECTORY');
 if(args[0]==='--verify'){const result=verifyCapture(path.resolve(args[1]));console.log(JSON.stringify(result));if(!result.valid)process.exitCode=1;}
 else{const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),destination=path.resolve(args[1]);if(!destination.startsWith(path.join(base,'outputs')+path.sep))throw Error('Use a new directory under workspace outputs');const report=captureOperationalAudit({base,destination});console.log(JSON.stringify({destination,sources:report.sources,verification:verifyCapture(destination)}));}
}
