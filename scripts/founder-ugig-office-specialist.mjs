import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
import {sha256,binaryManifestFiles} from './founder-binary-artifacts.mjs';
import {mixedPackageDigest,validMixedTextFiles} from './founder-ugig-mixed-package.mjs';
import {validateOfficeTechnicalReport} from './founder-ugig-office-report.mjs';
import {validateOfficeWork,officeGenerationKey,OFFICE_CHECKS,officeMust as must} from './founder-ugig-office-contract.mjs';

const fields=(o,names)=>must(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===names.length&&names.every(k=>Object.hasOwn(o,k)),'specialist fields');
const list=(v,max=200)=>{must(Array.isArray(v)&&v.length<=max,'specialist list');return v;};
const text=v=>{must(typeof v==='string'&&v.trim().length>0&&v.length<=12000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),'specialist text');return v;};
const unique=(v,key)=>must(new Set(v.map(key)).size===v.length,'duplicate specialist identity');
function publicTree(v){if(v&&typeof v==='object'){if(Object.hasOwn(v,'privacy'))must(v.privacy==='public','confidential evidence');Object.values(v).forEach(publicTree);}}
function support(spec,reference,e,issues){
 fields(e,['schema','privacy','rules','cases']);list(e.rules);list(e.cases);
 unique(e.rules,r=>r.id);unique(e.cases,c=>c.id);
 const rules=new Map();
 for(const r of e.rules){
  fields(r,['id','policyIndex','quote','expectedAction','forbiddenPromises','escalationTarget']);text(r.id);text(r.expectedAction);text(r.escalationTarget);list(r.forbiddenPromises).forEach(text);
  must(Number.isInteger(r.policyIndex)&&r.policyIndex>=0&&typeof spec.checklist?.[r.policyIndex]==='string'&&spec.checklist[r.policyIndex].includes(text(r.quote)),'policy quote');rules.set(r.id,r);
 }
 for(let i=0;i<spec.checklist.length;i++)if(!e.rules.some(r=>r.policyIndex===i))issues.push('missing-policy:'+i);
 const expected=list(reference.expectedCaseIds),cases=list(reference.cases),templates=list(spec.templates);
 unique(expected,x=>x);unique(cases,x=>x.id);unique(templates,x=>x.id);
 must(digest([...expected].sort())===digest(cases.map(c=>c.id).sort()),'reference cases');
 for(const id of expected)if(!e.cases.some(c=>c.id===id))issues.push('missing-case:'+id);
 for(const c of e.cases){
  fields(c,['id','templateId','ruleIds','expectedAction','escalationTarget','segments']);text(c.expectedAction);text(c.escalationTarget);
  const original=cases.find(x=>x.id===c.id),template=templates.find(x=>x.id===c.templateId);
  must(original&&template&&original.templateId===c.templateId,'case/template binding');list(c.ruleIds);unique(c.ruleIds,x=>x);list(c.segments);
  if(!c.ruleIds.length)issues.push('missing-rules:'+c.id);
  for(const id of c.ruleIds){const r=rules.get(id);must(r,'unknown rule');if(r.expectedAction!==c.expectedAction||r.escalationTarget!==c.escalationTarget)issues.push('rule-conflict:'+c.id+':'+id);for(const forbidden of r.forbiddenPromises)if(['subject','body','short','escalation'].some(k=>template[k].includes(forbidden)))issues.push('forbidden-promise:'+c.id+':'+id);}
  for(const s of c.segments){fields(s,['field','quote']);must(['subject','body','short','escalation'].includes(s.field)&&template[s.field].includes(text(s.quote)),'template quote');}
  if(!c.segments.some(s=>s.field==='body'))issues.push('missing-body-evidence:'+c.id);
  if(!c.segments.some(s=>s.field==='escalation'&&s.quote.includes(c.escalationTarget)))issues.push('missing-escalation-evidence:'+c.id);
 }
 for(const t of templates)if(!e.cases.some(c=>c.templateId===t.id))issues.push('missing-template-case:'+t.id);
 for(const r of e.rules)if(!e.cases.some(c=>c.ruleIds.includes(r.id)))issues.push('unused-rule:'+r.id);
 return {rules:e.rules,cases:e.cases};
}
function research(spec,e,issues,now){
 fields(e,['schema','privacy','maxAgeDays','snapshots','claims']);list(e.snapshots,100);list(e.claims,1000);unique(e.snapshots,s=>s.id);unique(e.claims,c=>JSON.stringify([c.row,c.column]));
 must(Number.isInteger(e.maxAgeDays)&&e.maxAgeDays>=1&&e.maxAgeDays<=365,'source freshness window');
 const snapshots=new Map();
 for(const s of e.snapshots){
  fields(s,['id','url','retrievedAt','privacy','text','sha256']);text(s.id);text(s.text);const url=new URL(s.url);
  must(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password,'source URL');
  const time=Date.parse(s.retrievedAt);must(Number.isFinite(time)&&new Date(time).toISOString()===s.retrievedAt&&time<=now,'source timestamp');
  must(sha256(Buffer.from(s.text,'utf8'))===s.sha256,'source hash');if(now-time>e.maxAgeDays*86400000)issues.push('stale-source:'+s.id);snapshots.set(s.id,s);
 }
 unique(spec.headers,x=>x);const urlColumn=spec.headers.indexOf('source_url'),dateColumn=spec.headers.indexOf('retrieved_at');must(urlColumn>=0&&dateColumn>=0,'source columns');
 for(const c of e.claims){
  fields(c,['row','column','value','snapshotId','quote','relation']);const s=snapshots.get(c.snapshotId);must(s&&s.text.includes(text(c.quote)),'source excerpt');must(['supports','contradicts'].includes(c.relation),'claim relation');
  if(c.row===null)must(c.column==='summary'&&c.value===spec.summary,'summary binding');
  else{const col=spec.headers.indexOf(c.column);must(Number.isInteger(c.row)&&c.row>=0&&c.row<spec.rows.length&&col>=0&&!['source_url','retrieved_at'].includes(c.column),'claim cell');const row=spec.rows[c.row];must(digest(row[col])===digest(c.value)&&row[urlColumn]===s.url&&row[dateColumn]===s.retrievedAt.slice(0,10),'claim/source binding');}
  if(c.relation==='contradicts')issues.push('source-conflict:'+c.row+':'+c.column);
 }
 for(let row=0;row<spec.rows.length;row++)for(const column of spec.headers.filter(h=>!['source_url','retrieved_at'].includes(h)))if(!e.claims.some(c=>c.row===row&&c.column===column))issues.push('missing-claim:'+row+':'+column);
 if(!e.claims.some(c=>c.row===null&&c.column==='summary'))issues.push('missing-summary-evidence');
 for(const s of e.snapshots)if(!e.claims.some(c=>c.snapshotId===s.id))issues.push('unused-source:'+s.id);
 return {maxAgeDays:e.maxAgeDays,snapshots:e.snapshots,claims:e.claims};
}
/** Pure preparation only. Excerpts prove byte linkage, never meaning, truth, rights or approval. */
export function prepareOfficeSpecialistEvidence({agreement,product,specBytes,referenceBytes,now=Date.now()}){
 const a=checkedJSON(agreement),p=checkedJSON(product);must(validateOfficeWork(a).valid&&['support-templates','research-report'].includes(a.workKind),'specialist agreement');must(Number.isFinite(now),'review time');
 const parse=(b,r,max)=>{must(Buffer.isBuffer(b)&&b.length<=max&&b.length===r.size&&sha256(b)===r.sha256,'input integrity');return checkedJSON(JSON.parse(b.toString('utf8')),max);};
 const spec=parse(specBytes,a.specRef,96000),reference=parse(referenceBytes,a.referenceRef,256000);publicTree(spec);publicTree(reference);
 must(spec.workKind===a.workKind&&spec.privacy==='public'&&spec.customerApproved===true,'public agreed inputs');
 must(validMixedTextFiles(p)&&p.generationKey===officeGenerationKey(a)&&p.packageDigest===mixedPackageDigest(p)&&p.productDigest===digest({files:binaryManifestFiles({...p,deliveryProtocol:'mixed-files-v1'})}),'exact generated package');
 validateOfficeTechnicalReport(p,a.workKind);
 must(digest([...a.requiredFiles].sort())===digest([...p.binaryArtifacts.map(b=>b.name),...p.files.map(f=>f.path)].sort()),'required package files');
 const issues=[],input=reference.specialistEvidence;let details={};
 if(!input)issues.push('missing-structured-evidence');
 else{must(input.schema==='numaron-office-specialist-input-v1'&&input.privacy==='public','specialist schema/privacy');details=a.workKind==='support-templates'?support(spec,reference,input,issues):research(spec,input,issues,now);}
 const evidence={schema:'numaron-office-specialist-evidence-v1',workKind:a.workKind,specSha256:a.specRef.sha256,referenceSha256:a.referenceRef.sha256,issues:[...new Set(issues)],...details};
 const evidenceDigest=digest(evidence);
 return {schema:'numaron-office-specialist-request-v1',agreementDigest:digest(a),generationKey:p.generationKey,packageDigest:p.packageDigest,productDigest:p.productDigest,observedAt:now,evidenceDigest,evidence,status:issues.length?'blocked-evidence-issues':'pending-specialist-review',checks:OFFICE_CHECKS[a.workKind].map(id=>({id,status:'pending',evidenceRefs:['office-specialist:'+evidenceDigest]})),reviewed:false,independentlyVerified:false,deliveryReady:false};
}
