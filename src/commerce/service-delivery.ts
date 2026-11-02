import {createHash} from 'node:crypto';
import type {AutomatonTool} from '../types.js';
import {recordsToCsv} from '../agent/coding-delivery.js';
import {inspectCode} from './code-quality.js';

type Cell=string|number|boolean|null;
export interface DataContract {
 columns:string[]; required:string[]; deduplicateBy:string[];
 trim:string[]; lowercase:string[];
}
const own=(value:object,key:string)=>Object.hasOwn(value,key);
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function bounded(value:unknown){
 const encoded=JSON.stringify(value);
 if(!encoded||Buffer.byteLength(encoded)>100000)throw Error('Service input exceeds 100000 bytes');
}
function contractCheck(c:DataContract){
 if(!c||Object.keys(c).sort().join(',')!=='columns,deduplicateBy,lowercase,required,trim')throw Error('Explicit data contract required');
 for(const key of ['columns','required','deduplicateBy','trim','lowercase'] as const)
  if(!Array.isArray(c[key])||c[key].length>50||new Set(c[key]).size!==c[key].length||c[key].some(v=>typeof v!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v)))throw Error('Invalid data contract');
 if(!c.columns.length||['required','deduplicateBy','trim','lowercase'].some(k=>c[k as keyof DataContract].some(v=>!c.columns.includes(v))))throw Error('Unknown contract column');
}

/** Explicit transformations only. Rejects conflicting identities instead of choosing a winner. */
export function prepareServiceData(input:unknown,c:DataContract){
 bounded({input,c});contractCheck(c);
 if(!Array.isArray(input)||input.length>500)throw Error('Expected at most 500 records');
 const rows:Record<string,Cell>[]=[];
 const issues:{row:number;code:string;column?:string}[]=[];
 const seen=new Map<string,string>();
 let duplicates=0;
 input.forEach((raw,index)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!c.columns.includes(k))){issues.push({row:index+1,code:'UNMAPPED_RECORD'});return;}
  const row:Record<string,Cell>=Object.create(null);
  let invalid=false;
  for(const key of c.columns){
   let value=own(raw,key)?raw[key]:null;
   if(value!==null&&(!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))){issues.push({row:index+1,column:key,code:'INVALID_CELL'});invalid=true;continue;}
   if(typeof value==='string'){
    if(c.trim.includes(key))value=value.trim();
    if(c.lowercase.includes(key))value=value.toLowerCase();
   }
   if(c.required.includes(key)&&(value===null||value==='')){issues.push({row:index+1,column:key,code:'REQUIRED_VALUE'});invalid=true;}
   row[key]=value;
  }
  if(invalid)return;
  if(c.deduplicateBy.length){
   if(c.deduplicateBy.some(key=>row[key]===null||row[key]==='')){issues.push({row:index+1,code:'MISSING_IDENTITY'});return;}
   const identity=JSON.stringify(c.deduplicateBy.map(key=>row[key])),hash=digest(row),prior=seen.get(identity);
   if(prior){if(prior===hash)duplicates++;else issues.push({row:index+1,code:'CONFLICTING_IDENTITY'});return;}
   seen.set(identity,hash);
  }
  rows.push(row);
 });
 return {status:issues.length?'review_required' as const:'prepared' as const,
  inputDigest:digest(input),contractDigest:digest(c),outputDigest:digest(rows),
  inputRows:input.length,outputRows:rows.length,duplicates,issues,rows,
  // No deliverable when any row requires review; partial data remains diagnostic.
  csv:issues.length?null:recordsToCsv(rows,c.columns),executionAuthorized:false,productionAccepted:false};
}

export interface ReportSource {id:string;url:string;observedAt:number;excerpt:string}
export interface ReportClaim {text:string;sourceId:string;quote:string}
/** Citation matching is provenance support, not semantic truth or reuse permission. */
export function prepareSourceReport(sources:ReportSource[],claims:ReportClaim[],now:number,maxAgeMs:number){
 bounded({sources,claims});
 if(!Array.isArray(sources)||!Array.isArray(claims)||sources.length>30||claims.length>50||!claims.length||
  !Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1||maxAgeMs>90*86400000)throw Error('Invalid report bounds');
 const map=new Map<string,ReportSource>();
 for(const s of sources){
  if(!s||typeof s.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(s.id)||map.has(s.id)||typeof s.excerpt!=='string'||!s.excerpt.trim()||s.excerpt.length>10000||
   !Number.isSafeInteger(s.observedAt)||s.observedAt>now||s.observedAt<0)throw Error('Invalid source');
  const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Invalid source URL');
  map.set(s.id,s);
 }
 const issues:{claim:number;code:string}[]=[];
 const entries=claims.map((claim,index)=>{
  if(!claim||typeof claim.text!=='string'||!claim.text.trim()||claim.text.length>2000||typeof claim.quote!=='string'||!claim.quote.trim()||claim.quote.length>2000)throw Error('Invalid claim');
  const source=map.get(claim.sourceId);
  if(!source)issues.push({claim:index+1,code:'MISSING_SOURCE'});
  else if(now-source.observedAt>maxAgeMs)issues.push({claim:index+1,code:'STALE_SOURCE'});
  else if(!source.excerpt.includes(claim.quote))issues.push({claim:index+1,code:'QUOTE_MISMATCH'});
  return {claim:claim.text,quote:claim.quote,sourceId:claim.sourceId,url:source?.url??null,observedAt:source?.observedAt??null,
   sourceDigest:source?digest(source):null};
 });
 return {status:issues.length?'review_required':'citation_matched',entries,issues,inputDigest:digest({sources,claims}),
  verifiedTruth:false,verifiedReuseRights:false,executionAuthorized:false,productionAccepted:false};
}

export function createServiceDeliveryTool():AutomatonTool{
 return {name:'revenue_service_delivery',category:'revenue',riskLevel:'caution',
  description:'Prepare bounded customer service candidates: data cleanup with explicit rules and conflict reports; repeatable data transformations; JS/TS maintenance inspection using existing checks; source report with exact quotations and freshness. No files, network, code execution, publication or payment. Input must already be authorized for this context. Results require existing product quality and release gates; never imply customer acceptance or profit.',
  parameters:{type:'object',properties:{action:{type:'string',enum:['data','automation','maintenance','report']},
   rows:{type:'array',maxItems:500},contract:{type:'object',description:'Explicit arrays columns, required, deduplicateBy, trim, lowercase. No implicit coercion or fuzzy merging.'},
   content:{type:'string',maxLength:100000},before_content:{type:'string',maxLength:100000},language:{type:'string',enum:['typescript','javascript']},
   expected_output_digest:{type:'string',pattern:'^[a-f0-9]{64}$',description:'Optional independently specified output digest for a repeatable transformation; mismatch blocks the CSV.'},
   sources:{type:'array',maxItems:30},claims:{type:'array',maxItems:50},max_age_ms:{type:'integer',minimum:1,maximum:7776000000}},required:['action'],additionalProperties:false},
  execute:async(args)=>{
   bounded(args);
   if(args.action==='data'||args.action==='automation'){
    const result=prepareServiceData(args.rows,args.contract as DataContract);
    if(args.expected_output_digest!==undefined){
     if(typeof args.expected_output_digest!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_output_digest))throw Error('Invalid expected output digest');
     if(args.expected_output_digest!==result.outputDigest){result.status='review_required';result.csv=null;result.issues.push({row:0,code:'OUTPUT_CONTRACT_MISMATCH'});}
    }
    return JSON.stringify(result);
   }
   if(args.action==='maintenance'){
    const after=inspectCode(args.content as string,args.language as 'typescript'|'javascript');
    if(args.before_content===undefined)return JSON.stringify(after);
    const before=inspectCode(args.before_content as string,args.language as 'typescript'|'javascript');
    return JSON.stringify({before,after,changed:before.sourceDigest!==after.sourceDigest,
     syntaxErrorsRemoved:before.syntax.length-after.syntax.length,newSecurityCodes:after.security.filter(item=>!before.security.some(old=>old.code===item.code)),
     functionalRepairVerified:false,executionPerformed:false,productionAccepted:false});
   }
   if(args.action==='report')return JSON.stringify(prepareSourceReport(args.sources as ReportSource[],args.claims as ReportClaim[],Date.now(),args.max_age_ms as number));
   throw Error('Unknown service action');
  }};
}
