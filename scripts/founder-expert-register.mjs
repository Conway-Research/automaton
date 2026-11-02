/** Machine-readable register of the 21 completeness-contract requirements.
 * Pure validation and projection: it grants no permission and records no result by itself.
 * A pass rests on a verifier report in the evidence registry; hand-typed values alone never count. A changed binding invalidates it. */
import {canonicalText,recordIssues} from './founder-operating-boundary.mjs';
import {readEvidence} from './founder-evidence-registry.mjs';
export const REGISTER_STATES=Object.freeze(['offen','implementiert-ungetestet','geprüft-bestanden','fehlgeschlagen','blockiert','entwertet']);
export const CONTRACT_IDS=Object.freeze(['F01','F02','F03','F04','F05','F06','T01','T02','T03','T04','T05','T06','T07','A01','A02','A03','A04','W01','W02','W03','S01']);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
export function parseContractRequirements(markdown){
 const rows=[...markdown.matchAll(/^\| ([FTAWS]\d{2}) \| (.+?) \| (.+?) \|\s*$/gm)].map(m=>({id:m[1],scope:m[2],requiredEvidence:m[3]}));
 if(rows.map(r=>r.id).join()!==CONTRACT_IDS.join())throw Error('Contract requirement list changed');return rows;
}
export function createRegister(markdown,{contractSHA,source}){
 if(!hash(contractSHA)||!text(source))throw Error('Exact contract binding required');
 return {schema:'numaron-expert-register-v1',contract:{source,sha256:contractSHA},entries:parseContractRequirements(markdown).map(r=>({...r,state:'offen',owner:null,dependencies:[],competenceScope:null,metrics:[],trainingCases:[],heldOutCases:[],baseline:null,candidate:null,binding:null,results:null,costs:{status:'unknown'},humanMinutes:null}))};
}
const BINDING=['sourceDigest','modelDigest','runtimeDigest'];
const textList=x=>Array.isArray(x)&&x.length>0&&Array.from(x).every(text);
const UNBOUNDED_SCOPE=/universal|universell|fehlerfrei|beliebig|alle aufgaben|alle auftr|all tasks|any task|unlimited|unbegrenzt/;
export const unboundedScope=scope=>UNBOUNDED_SCOPE.test(canonicalText(scope));
/** The report in the registry decides, not the numbers typed into the entry. */
function reportIssues(e,evidence,contractSHA){
 if(!hash(e.results?.reportDigest))return ['report-digest-missing'];
 const report=readEvidence(evidence,e.results.reportDigest,'verifier-report')?.body;
 if(!report)return ['report-not-registered'];
 const same=(a,b)=>JSON.stringify([...a].map(canonicalText).sort())===JSON.stringify([...b].map(canonicalText).sort()),issues=[];
 if(report.requirementId!==e.id||report.accepted!==true||report.verifier!==e.owner)issues.push('report-not-verified');
 if(!textList(report.heldOutCases)||!textList(e.heldOutCases)||!same(report.heldOutCases,e.heldOutCases))issues.push('report-not-verified');
 const rr=report.results;
 if(rr?.executed!==true||rr?.independent!==true||rr?.passed!==e.results.passed||rr?.total!==e.results.total||rr?.passed!==rr?.total||rr?.heldOutPassed!==report.heldOutCases?.length||rr?.heldOutTotal!==report.heldOutCases?.length)issues.push('report-not-verified');
 if(!BINDING.every(k=>hash(report.binding?.[k])&&report.binding[k]===e.binding?.[k]))issues.push('report-other-binding');
 if(!hash(contractSHA)||report.contractSHA!==contractSHA)issues.push('report-other-contract');
 return [...new Set(issues)];
}
function passedIssues(e,evidence,contractSHA){
 const issues=[];
 if(!text(e.competenceScope))issues.push('competence-scope-missing');else if(unboundedScope(e.competenceScope))issues.push('scope-not-bounded');
 if(!text(e.owner))issues.push('owner-missing');
 if(!textList(e.metrics))issues.push('metrics-not-predefined');
 if(!textList(e.trainingCases))issues.push('training-cases-missing');
 if(!e.heldOutCases?.length)issues.push('held-out-cases-missing');
 const held=(Array.isArray(e.heldOutCases)?e.heldOutCases:[]).map(canonicalText),trained=(Array.isArray(e.trainingCases)?e.trainingCases:[]).map(canonicalText);
 if(held.some(c=>trained.includes(c)))issues.push('held-out-overlaps-training');
 if(held.some(c=>!c)||new Set(held).size!==held.length)issues.push('held-out-cases-not-distinct');
 if(!text(e.baseline)||!text(e.candidate))issues.push('baseline-or-candidate-missing');
 if(!BINDING.every(k=>hash(e.binding?.[k])))issues.push('binding-incomplete');
 const r=e.results;
 if(!r||r.executed!==true||!Number.isSafeInteger(r.passed)||!Number.isSafeInteger(r.total)||r.total<1||r.passed!==r.total||!text(r.evidenceRef))issues.push('results-not-executed-or-not-complete');
 if(r?.synthetic!==true)issues.push('synthetic-scope-not-declared');
 if(r?.independent!==true)issues.push('not-independently-checked');
 if(r?.heldOutTotal!==e.heldOutCases?.length||r?.heldOutPassed!==e.heldOutCases?.length)issues.push('held-out-not-all-passed');
 if(Number.isSafeInteger(r?.total)&&r.heldOutTotal>r.total)issues.push('results-inconsistent');
 issues.push(...reportIssues(e,evidence,contractSHA));
 return issues;
}
export function effectiveEntry(e,{current,evidence,contractSHA}={}){
 const issues=[];if(!e||typeof e!=='object')return {id:null,declared:null,effective:'fehlgeschlagen',issues:['entry-invalid']};
 if(!REGISTER_STATES.includes(e.state))issues.push('unknown-state');
 if(e.humanMinutes!==null&&!(Number.isFinite(e.humanMinutes)&&e.humanMinutes>=0))issues.push('human-time-must-be-minutes');
 issues.push(...recordIssues(e).filter(i=>i==='personnel-cost-forbidden'));
 if(!['unknown','complete'].includes(e.costs?.status))issues.push('cost-status-invalid');
 let state=e.state;
 if(e.state==='geprüft-bestanden'){
  issues.push(...passedIssues(e,evidence,contractSHA));
  if(current&&BINDING.some(k=>current[k]!==undefined&&e.binding?.[k]!==current[k]))state='entwertet';
 }
 return {id:e.id,declared:e.state,effective:issues.length&&e.state==='geprüft-bestanden'?'fehlgeschlagen':state,issues};
}
export function validateRegister(register,{current,evidence,contractSHA}={}){
 const issues=[],ids=(register?.entries??[]).map(e=>e?.id);
 if(ids.length!==CONTRACT_IDS.length||ids.some((id,i)=>id!==CONTRACT_IDS[i]))issues.push({id:'*',issue:'requirements-missing-or-reordered'});
 if(contractSHA!==undefined&&register?.contract?.sha256!==contractSHA)issues.push({id:'*',issue:'contract-changed'});
 const entries=(register?.entries??[]).map(e=>{
  const {issues:own,...entry}=effectiveEntry(e,{current,evidence,contractSHA:contractSHA??register?.contract?.sha256});
  for(const issue of own)issues.push({id:e?.id??null,issue});
  return entry;
 });
 const passed=entries.filter(e=>e.effective==='geprüft-bestanden').length;
 return {valid:issues.length===0,issues,entries,summary:{total:CONTRACT_IDS.length,passed,overallAccepted:issues.length===0&&passed===CONTRACT_IDS.length&&hash(contractSHA)&&BINDING.every(k=>hash(current?.[k]))}};
}
