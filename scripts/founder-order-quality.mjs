import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
import {evaluateQuality} from './founder-quality-profiles.mjs';
import {contentPackageFiles} from './founder-content-package.mjs';
import {verifyContentReview} from './founder-content-worker.mjs';
import {prepareServiceData} from '../src/commerce/service-delivery.ts';
export function validateOrderQualityContract(binding,contract){
 if(binding.qualityContract!==undefined){
  const q=binding.qualityContract;
  if(binding.profileId!=='structured-data'||!q||Object.keys(q).sort().join(',')!=='evidenceRef,profile,referenceDigest,referenceRows'||q.profile!=='invoice-reconciliation-v1'||q.referenceDigest!==digest(q.referenceRows)||typeof q.evidenceRef!=='string'||!/^contract:[a-zA-Z0-9_.:-]{1,120}$/.test(q.evidenceRef)||!contract.qualityProfiles?.includes(q.profile)||typeof contract.validateQualityContract!=='function'||contract.validateQualityContract(checkedJSON(binding))!==true)throw Error('Reviewed invoice quality contract required');
  return q.profile;
 }
 return binding.profileId==='content-repurpose'?'content-package-structural-v1':null;
}
export function invoiceQualityFiles(binding){
 const r=prepareServiceData(binding.data?.rows,binding.data?.contract);if(r.status!=='prepared')throw Error('Invoice data contract failed');
 const rows=JSON.parse(JSON.stringify(r.rows)),totals=new Map();
 for(const row of rows){if(!Number.isSafeInteger(row.amountMinor)||row.amountMinor<0)throw Error('Invoice integer amount required');totals.set(row.currency,(totals.get(row.currency)??0n)+BigInt(row.amountMinor));}
 const report={rows,totals:[...totals].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([currency,amount])=>{if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Invoice total overflow');return {currency,amountMinor:Number(amount)};})};
 if(!evaluateQuality('invoice-reconciliation-v1',{source:binding.qualityContract.referenceRows,report}).passed)throw Error('Invoice quality check failed');
 return [{path:'delivery.csv',content:r.csv},{path:'reconciliation.json',content:JSON.stringify(report)}];
}
export function checkOrderQuality(product,contract,{requireReview=false}={}){
 const profile=validateOrderQualityContract(product.binding,contract);if(!profile)return null;
 let result;
 if(profile==='content-package-structural-v1'){
  result=evaluateQuality(profile,{brief:product.binding.contentBrief,package:product.package});
  if(!result.passed||digest(contentPackageFiles(product.package))!==digest(product.files))throw Error('Content quality or delivered bytes mismatch');
  if(requireReview&&!verifyContentReview(product,product.review))throw Error('Independent content review required');
 }else{
  if(digest(invoiceQualityFiles(product.binding))!==digest(product.files))throw Error('Invoice deliverable differs from approved reference');
  const file=product.files.find(f=>f.path==='reconciliation.json');
  result=evaluateQuality(profile,{source:product.binding.qualityContract.referenceRows,report:JSON.parse(file.content)});
  if(!result.passed)throw Error('Invoice quality check failed');
 }
 return {...result,filesDigest:digest({files:product.files}),bindingDigest:digest(product.binding)};
}
