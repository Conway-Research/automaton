import {createHash} from 'node:crypto';
import type {Database} from 'better-sqlite3';
import {inspectWriting,checkLocalLanguage} from './writing-quality.js';
export interface ProductQualityContract {productId:string;format:'text'|'json';purpose:string;audience:string;minBytes:number;maxBytes:number;requiredText:string[];forbiddenText:string[];requiredJsonKeys:string[];language?:string}
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const id=(s:unknown)=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
const text=(s:unknown,max=500)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
const table=(db:Database,name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
function schema(db:Database){db.exec(`
 CREATE TABLE IF NOT EXISTS obolus_product_quality_contracts(product_id TEXT PRIMARY KEY,payload TEXT NOT NULL,digest TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS obolus_product_quality_assessments(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS obolus_product_quality_revocations(product_id TEXT NOT NULL,content_digest TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(product_id,content_digest));
 CREATE TABLE IF NOT EXISTS obolus_product_language_checks(id INTEGER PRIMARY KEY,product_id TEXT NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS obolus_product_language_attempts(id INTEGER PRIMARY KEY,product_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','completed')),receipt_id INTEGER);
 CREATE UNIQUE INDEX IF NOT EXISTS product_language_one_pending ON obolus_product_language_attempts(product_id) WHERE status='pending';
 CREATE TRIGGER IF NOT EXISTS product_language_attempt_update BEFORE UPDATE ON obolus_product_language_attempts WHEN OLD.status!='pending' OR NEW.id!=OLD.id OR NEW.product_id!=OLD.product_id OR NEW.status!='completed' OR NEW.receipt_id IS NULL BEGIN SELECT RAISE(ABORT,'Language attempt immutable or invalid'); END;
 CREATE TRIGGER IF NOT EXISTS product_language_attempt_delete BEFORE DELETE ON obolus_product_language_attempts BEGIN SELECT RAISE(ABORT,'Language attempt history immutable'); END;
 CREATE TRIGGER IF NOT EXISTS product_language_update BEFORE UPDATE ON obolus_product_language_checks BEGIN SELECT RAISE(ABORT,'Language receipt immutable'); END;
 CREATE TRIGGER IF NOT EXISTS product_language_delete BEFORE DELETE ON obolus_product_language_checks BEGIN SELECT RAISE(ABORT,'Language receipt immutable'); END;
 CREATE TRIGGER IF NOT EXISTS product_quality_contract_update BEFORE UPDATE ON obolus_product_quality_contracts BEGIN SELECT RAISE(ABORT,'Quality contract immutable'); END;
 CREATE TRIGGER IF NOT EXISTS product_quality_contract_delete BEFORE DELETE ON obolus_product_quality_contracts BEGIN SELECT RAISE(ABORT,'Quality contract immutable'); END;
 CREATE TRIGGER IF NOT EXISTS product_quality_assessment_update BEFORE UPDATE ON obolus_product_quality_assessments BEGIN SELECT RAISE(ABORT,'Quality assessment immutable'); END;
 CREATE TRIGGER IF NOT EXISTS product_quality_assessment_delete BEFORE DELETE ON obolus_product_quality_assessments BEGIN SELECT RAISE(ABORT,'Quality assessment immutable'); END;
 CREATE TRIGGER IF NOT EXISTS product_quality_revocation_update BEFORE UPDATE ON obolus_product_quality_revocations BEGIN SELECT RAISE(ABORT,'Quality revocation immutable'); END;
 CREATE TRIGGER IF NOT EXISTS product_quality_revocation_delete BEFORE DELETE ON obolus_product_quality_revocations BEGIN SELECT RAISE(ABORT,'Quality revocation immutable'); END;`);}
export function registerProductQuality(db:Database,input:ProductQualityContract){
 if(!input||!id(input.productId)||!['text','json'].includes(input.format)||!text(input.purpose)||!text(input.audience)||
  !Number.isSafeInteger(input.minBytes)||!Number.isSafeInteger(input.maxBytes)||input.minBytes<1||input.maxBytes<input.minBytes||input.maxBytes>262144||
  ![input.requiredText,input.forbiddenText,input.requiredJsonKeys].every(a=>Array.isArray(a)&&a.length<=20&&a.every(s=>text(s,200))&&new Set(a).size===a.length)||
  (input.format==='text'?!input.requiredText.length:!input.requiredJsonKeys.length)||
  (input.language!==undefined&&(input.format!=='text'||!['de-CH','de-DE','en-US','en-GB','fr','it'].includes(input.language))))throw Error('Bounded product-specific quality contract required');
 const payload=JSON.stringify({productId:input.productId,format:input.format,purpose:input.purpose,audience:input.audience,minBytes:input.minBytes,maxBytes:input.maxBytes,
  requiredText:[...input.requiredText].sort(),forbiddenText:[...input.forbiddenText].sort(),requiredJsonKeys:[...input.requiredJsonKeys].sort(),...(input.language!==undefined?{language:input.language}:{})}),digest=hash(payload);
 return db.transaction(()=>{
  schema(db);const old=db.prepare('SELECT payload FROM obolus_product_quality_contracts WHERE product_id=?').get(input.productId) as {payload:string}|undefined;
  if(old){if(old.payload!==payload)throw Error('Quality contract immutable; use a new product version');return {duplicate:true,digest};}
  if(table(db,'commerce_orders')&&db.prepare("SELECT 1 FROM commerce_orders WHERE json_extract(offer,'$.productId')=? LIMIT 1").get(input.productId))throw Error('Register quality criteria before selling');
  if((db.prepare('SELECT COUNT(*) n FROM obolus_product_quality_contracts').get() as {n:number}).n>=1000)throw Error('Quality contract capacity reached');
  db.prepare('INSERT INTO obolus_product_quality_contracts VALUES(?,?,?)').run(input.productId,payload,digest);return {duplicate:false,digest};
 }).immediate();
}
function contract(db:Database,productId:string){
 const row=table(db,'obolus_product_quality_contracts')?db.prepare('SELECT payload,digest FROM obolus_product_quality_contracts WHERE product_id=?').get(productId) as {payload:string;digest:string}|undefined:undefined;
 if(!row||hash(row.payload)!==row.digest)throw Error('Current intact product quality contract required');
 return {data:JSON.parse(row.payload) as ProductQualityContract,digest:row.digest};
}
export function inspectProductQuality(db:Database,productId:string,filename:string,content:Buffer){
 if(!id(productId)||!text(filename,120)||!Buffer.isBuffer(content)||content.length>10*1024*1024)throw Error('Bounded product bytes required');
 const {data:c,digest}=contract(db,productId),findings:string[]=[],contentDigest=hash(content);
 if(content.length<c.minBytes||content.length>c.maxBytes)findings.push('byte_limit');
 if(c.format==='text'?!/\.(txt|md)$/i.test(filename):!/\.json$/i.test(filename))findings.push('unsupported_filename');
 let decoded='';try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(content);}catch{findings.push('invalid_utf8');}
 if(!decoded.trim())findings.push('empty_content');
 // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(decoded))findings.push('control_characters');
 if(/\b(TODO|TBD|FIXME|lorem ipsum)\b/i.test(decoded))findings.push('unfinished_placeholder');
 // High-confidence credential shapes only; never copy matched values into findings or logs.
 if(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bsk_(?:live|proj)_[A-Za-z0-9_-]{12,}|\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})|\bAKIA[A-Z0-9]{16}\b/.test(decoded))findings.push('possible_secret');
 if(/\b(?:private[_ -]?key|secret[_ -]?key)\b["']?\s*[:=]\s*["']?(?:0x)?[a-fA-F0-9]{64}\b/i.test(decoded))findings.push('possible_private_key');
 c.requiredText.forEach((value,i)=>{if(!decoded.includes(value))findings.push(`missing_required_text_${i}`);});
 c.forbiddenText.forEach((value,i)=>{if(decoded.includes(value))findings.push(`forbidden_text_${i}`);});
 // Fixed format requirements cannot be removed by agent-supplied contract criteria.
 // Only deterministic structural defects block here; language suggestions remain unverified.
 if(c.format==='text'){
  if(Buffer.byteLength(decoded,'utf8')>100000)findings.push('formatting_check_size_limit');
  else{
   const writing=inspectWriting(decoded,/\.md$/i.test(filename)?'markdown':'text');
   if(writing.changed)findings.push('formatting_normalization_required');
   for(const finding of writing.findings)if(['unclosed_code_fence','heading_level_jump'].includes(finding.code))findings.push(`formatting_${finding.code}`);
   if(writing.findingsTruncated)findings.push('formatting_findings_truncated');
  }
 }
 if(c.format==='json')try{
  const parsed=JSON.parse(decoded);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();
  c.requiredJsonKeys.forEach((key,i)=>{if(!Object.hasOwn(parsed,key)||parsed[key]===null||typeof parsed[key]==='string'&&!parsed[key].trim())findings.push(`missing_json_key_${i}`);});
 }catch{findings.push('invalid_json_object');}
 if(table(db,'obolus_product_quality_revocations')&&db.prepare('SELECT 1 FROM obolus_product_quality_revocations WHERE product_id=? AND content_digest=?').get(productId,contentDigest))findings.push('revoked_product_version');
 const result={validator:'technical-product-v4',productId,filename,contentDigest,contractDigest:digest,bytes:content.length,passed:findings.length===0,findings:[...new Set(findings)],
  limitation:'Technical acceptance only. Does not establish factual accuracy, copyright clearance, accessibility, user value or highest possible quality. No publication or payment authority.'};
 return {...result,assessmentId:hash(JSON.stringify(result))};
}
export function assessProductQuality(db:Database,productId:string,filename:string,content:Buffer){
 return db.transaction(()=>{
  const result=inspectProductQuality(db,productId,filename,content),payload=JSON.stringify(result);
  const old=db.prepare('SELECT payload FROM obolus_product_quality_assessments WHERE id=?').get(result.assessmentId) as {payload:string}|undefined;
  if(old){if(old.payload!==payload)throw Error('Quality assessment integrity failure');return result;}
  if((db.prepare('SELECT COUNT(*) n FROM obolus_product_quality_assessments WHERE product_id=?').get(productId) as {n:number}).n>=20)throw Error('Quality iteration limit reached; redesign the product');
  db.prepare('INSERT INTO obolus_product_quality_assessments VALUES(?,?,?,?)').run(result.assessmentId,productId,payload,hash(payload));return result;
 }).immediate();
}
export function revokeProductQuality(db:Database,productId:string,contentDigest:string,reason:string){
 if(!id(productId)||!/^[a-f0-9]{64}$/.test(contentDigest)||!text(reason,1000))throw Error('Bounded quality revocation required');
 db.transaction(()=>{contract(db,productId);db.prepare('INSERT OR IGNORE INTO obolus_product_quality_revocations VALUES(?,?,?)').run(productId,contentDigest,reason);}).immediate();
}
/** Local checker output only; model-supplied status cannot create a receipt. No open transaction during I/O. */
export async function assessProductLanguage(db:Database,productId:string,filename:string,content:Buffer,endpoint:string|undefined,request:typeof fetch=fetch){
 const bytes=Buffer.from(content),technical=inspectProductQuality(db,productId,filename,bytes),c=contract(db,productId);
 if(!c.data.language||!technical.passed||bytes.length>20000)throw Error('Declared language and technically valid bounded text required');
 const count=()=>table(db,'obolus_product_language_checks')?(db.prepare('SELECT COUNT(*) n FROM obolus_product_language_checks WHERE product_id=?').get(productId) as {n:number}).n:0;
 const attempt=db.transaction(()=>{
  schema(db);
  if(db.prepare("SELECT 1 FROM obolus_product_language_attempts WHERE product_id=? AND status='pending'").get(productId))throw Error('Language check pending; reconciliation required before retry');
  if(count()>=20)throw Error('Language review limit reached');
  return db.prepare("INSERT INTO obolus_product_language_attempts(product_id,status) VALUES(?,'pending')").run(productId).lastInsertRowid;
 }).immediate();
 const result=await checkLocalLanguage(new TextDecoder('utf-8',{fatal:true}).decode(bytes),c.data.language,endpoint,request);
 return db.transaction(()=>{
  const current=inspectProductQuality(db,productId,filename,bytes);
  if(!current.passed||current.contractDigest!==technical.contractDigest)throw Error('Product changed or revoked during language check');
  schema(db);if(count()>=20)throw Error('Language review limit reached');
  // Do not persist product text, replacement text or provider errors.
  const receipt={validator:'local-language-v1',productId,filename,contentDigest:technical.contentDigest,contractDigest:c.digest,language:c.data.language,
   status:result.status,findings:result.matches.length,checkedAt:Date.now()};
  const payload=JSON.stringify(receipt);const saved=db.prepare('INSERT INTO obolus_product_language_checks(product_id,payload,digest) VALUES(?,?,?)').run(productId,payload,hash(payload));
  const completed=db.prepare("UPDATE obolus_product_language_attempts SET status='completed',receipt_id=? WHERE id=? AND status='pending'").run(saved.lastInsertRowid,attempt);
  if(completed.changes!==1)throw Error('Language claim lost; receipt not released');
  return {...receipt,limitation:'Local checker observation, not flawless language, correct locale selection, factual accuracy or comprehensive approval.'};
 }).immediate();
}
export function inspectProductLanguage(db:Database,productId:string,filename:string,content:Buffer){
 const c=contract(db,productId),contentDigest=hash(content);
 if(!c.data.language)return {status:'not_required_by_contract',passed:false};
 const pending=table(db,'obolus_product_language_attempts')?db.prepare("SELECT id FROM obolus_product_language_attempts WHERE product_id=? AND status='pending'").get(productId) as {id:number}|undefined:undefined;
 if(pending)return {status:'pending_reconciliation',passed:false,attemptId:pending.id};
 const rows=table(db,'obolus_product_language_checks')?db.prepare('SELECT payload,digest FROM obolus_product_language_checks WHERE product_id=? ORDER BY id DESC LIMIT 21').all(productId) as {payload:string;digest:string}[]:[];
 if(rows.length>20)return {status:'invalid_history',passed:false};
 for(const row of rows){
  if(hash(row.payload)!==row.digest)return {status:'invalid_history',passed:false};
  let value;try{value=JSON.parse(row.payload);}catch{return {status:'invalid_history',passed:false};}
  if(value.productId!==productId||value.contractDigest!==c.digest)return {status:'invalid_history',passed:false};
  if(value.validator==='language-withdrawal-v1')return {status:'fresh_check_required',passed:false};
  if(value.contentDigest===contentDigest&&value.filename===filename){
   const passed=value.validator==='local-language-v1'&&value.language===c.data.language&&value.status==='checked_no_findings'&&value.findings===0;
   return {status:passed?'checked_no_findings':'not_passed',passed};
  }
 }
 return {status:'missing',passed:false};
}
/** Withdraw a specific pending check. Never grants release or automatically starts another request. */
export function withdrawProductLanguage(db:Database,productId:string,attemptId:number){
 if(!id(productId)||!Number.isSafeInteger(attemptId)||attemptId<1)throw Error('Product and exact pending attempt ID required');
 return db.transaction(()=>{
  const c=contract(db,productId);schema(db);
  const pending=db.prepare("SELECT id FROM obolus_product_language_attempts WHERE product_id=? AND status='pending'").get(productId) as {id:number}|undefined;
  if(!pending||pending.id!==attemptId)throw Error('Pending language attempt changed; inspect again');
  if((db.prepare('SELECT COUNT(*) n FROM obolus_product_language_checks WHERE product_id=?').get(productId) as {n:number}).n>=20)throw Error('Language review limit reached');
  // A product-wide barrier prevents any older version from regaining approval.
  const payload=JSON.stringify({validator:'language-withdrawal-v1',productId,contractDigest:c.digest,attemptId,status:'withdrawn',checkedAt:Date.now()});
  const receipt=db.prepare('INSERT INTO obolus_product_language_checks(product_id,payload,digest) VALUES(?,?,?)').run(productId,payload,hash(payload));
  const closed=db.prepare("UPDATE obolus_product_language_attempts SET status='completed',receipt_id=? WHERE id=? AND product_id=? AND status='pending'").run(receipt.lastInsertRowid,attemptId,productId);
  if(closed.changes!==1)throw Error('Language withdrawal conflict');
  return {status:'withdrawn',attemptId,freshCheckRequired:true,releaseAuthorized:false,providerStarted:false};
 }).immediate();
}
/** Bounded feedback from immutable local checks, not self-reported quality scores. */
export function productQualityLessons(db:Database){
 const rows=table(db,'obolus_product_quality_assessments')?db.prepare('SELECT payload,digest FROM obolus_product_quality_assessments ORDER BY rowid DESC LIMIT 101').all() as {payload:string;digest:string}[]:[];
 const counts=new Map<string,number>();let invalidRecords=0,passed=0;
 for(const row of rows.slice(0,100)){
  try{
   if(hash(row.payload)!==row.digest)throw Error();const value=JSON.parse(row.payload);
   if(!Array.isArray(value.findings)||value.findings.length>100||value.findings.some((s:unknown)=>typeof s!=='string'||!/^[a-z_0-9]{1,100}$/.test(s))||typeof value.passed!=='boolean')throw Error();
   if(value.passed)passed++;
   for(const code of new Set<string>(value.findings))counts.set(code,(counts.get(code)??0)+1);
  }catch{invalidRecords++;}
 }
 return {sampleDigest:hash(JSON.stringify(rows.slice(0,100))),sampleSize:Math.min(rows.length,100),truncated:rows.length>100,invalidRecords,technicalPasses:passed,
  recurringFindings:[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([code,count])=>({code,count})),
  instruction:'Use recurring defects to propose root-cause fixes and regression cases. Repeated reads are the same evidence. Historical passes may now be revoked; this summary grants no release. Compare improved methods on held-out cases; do not relax safety or acceptance criteria.'};
}
/** Mandatory for live commerce and for any product with an explicit quality contract, including test mode. */
export function assertProductQuality(db:Database,productId:string,asset?:{filename:string;content:Buffer}){
 const mode=(db.prepare('SELECT mode FROM commerce_stripe_config WHERE id=1').get() as {mode:string}|undefined)?.mode;
 const configured=table(db,'obolus_product_quality_contracts')&&db.prepare('SELECT 1 FROM obolus_product_quality_contracts WHERE product_id=?').get(productId);
 if(mode==='test'&&!configured)return;
 const bytes=asset??(table(db,'commerce_assets')?db.prepare('SELECT filename,content FROM commerce_assets WHERE product_id=?').get(productId) as {filename:string;content:Buffer}|undefined:undefined);
 if(!bytes)throw Error('Quality-reviewed product asset required');
 const result=inspectProductQuality(db,productId,bytes.filename,bytes.content);
 const saved=db.prepare('SELECT payload,digest FROM obolus_product_quality_assessments WHERE id=? AND product_id=?').get(result.assessmentId,productId) as {payload:string;digest:string}|undefined;
 if(!result.passed||!saved||hash(saved.payload)!==saved.digest||saved.payload!==JSON.stringify(result))throw Error('Product quality gate blocked; inspect findings and repair before release');
 if(contract(db,productId).data.language&&!inspectProductLanguage(db,productId,bytes.filename,bytes.content).passed)throw Error('Product language gate blocked; check exact bytes with configured local service');
 return {assessmentId:result.assessmentId,assessmentDigest:saved.digest,
  languageDigest:hash(JSON.stringify(db.prepare('SELECT digest FROM obolus_product_language_checks WHERE product_id=? ORDER BY id').all(productId)))};
}
