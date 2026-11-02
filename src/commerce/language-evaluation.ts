import {createHash} from 'node:crypto';
import {checkLocalLanguage} from './writing-quality.js';
// Synthetic regression examples, not a representative estimate of commercial product quality.
export const LANGUAGE_CASES=Object.freeze([
 {id:'de-spelling',language:'de-CH',text:'Dies ist ein einfaher Test.',error:'einfaher'},
 {id:'de-spelling-control',language:'de-CH',text:'Dies ist ein einfacher Test.',error:null},
 {id:'de-install',language:'de-CH',text:'Installieren Sie die Anwendugn auf Ihrem Computer.',error:'Anwendugn'},
 {id:'de-install-control',language:'de-CH',text:'Installieren Sie die Anwendung auf Ihrem Computer.',error:null},
 {id:'en-agreement',language:'en-US',text:'This are a test.',error:'This are'},
 {id:'en-agreement-control',language:'en-US',text:'This is a test.',error:null},
 {id:'en-install',language:'en-US',text:'Install the applicaton on your computer.',error:'applicaton'},
 {id:'en-install-control',language:'en-US',text:'Install the application on your computer.',error:null},
 {id:'fr-spelling',language:'fr',text:'Installez cette apliccation sur votre ordinateur.',error:'apliccation'},
 {id:'fr-spelling-control',language:'fr',text:'Installez cette application sur votre ordinateur.',error:null},
 {id:'it-agreement',language:'it',text:'Questo sono un test.',error:'Questo sono'},
 {id:'it-agreement-control',language:'it',text:'Questo è un test.',error:null},
].map(value=>Object.freeze(value)));

export async function evaluateLocalLanguage(endpoint:string|undefined,request:typeof fetch=fetch){
 const cases:{id:string;language:string;expected:'clean'|'defect';outcome:string;elapsedMs:number;rules:string[]}[]=[];
 for(const sample of LANGUAGE_CASES){
  const started=Date.now();const result=await checkLocalLanguage(sample.text,sample.language,endpoint,request);
  const offset=sample.error===null?-1:sample.text.indexOf(sample.error);
  const detected=sample.error!==null&&result.matches.some((m:{offset:number;length:number})=>m.offset<offset+sample.error!.length&&m.offset+m.length>offset);
  const outcome=result.status==='unavailable'?'unavailable':sample.error===null?(result.matches.length?'false_positive':'clean_control'):(detected?'detected':'missed');
  cases.push({id:sample.id,language:sample.language,expected:sample.error===null?'clean':'defect',outcome,elapsedMs:Math.max(0,Date.now()-started),rules:result.matches.map((m:{ruleId:string})=>m.ruleId)});
 }
 const byLanguage=[...new Set(LANGUAGE_CASES.map(c=>c.language))].map(language=>{
  const rows=cases.filter(c=>c.language===language);
  return {language,cases:rows.length,detected:rows.filter(c=>c.outcome==='detected').length,missed:rows.filter(c=>c.outcome==='missed').length,
   falsePositives:rows.filter(c=>c.outcome==='false_positive').length,cleanControls:rows.filter(c=>c.outcome==='clean_control').length,unavailable:rows.filter(c=>c.outcome==='unavailable').length};
 });
 return {corpusDigest:createHash('sha256').update(JSON.stringify(LANGUAGE_CASES)).digest('hex'),cases,byLanguage,
  allCasesMatched:cases.every(c=>c.outcome==='detected'||c.outcome==='clean_control'),releaseAuthorized:false,profitabilityProven:false,
  limitation:'Small synthetic regression corpus. Detection requires overlap with the labelled error, not any finding elsewhere. Unavailable checks are not successes. No representative accuracy, semantic correctness or product release claim.'};
}
