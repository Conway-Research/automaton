import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
import {checkContentPackage} from './founder-content-package.mjs';
export const qualityProfiles=Object.freeze(['content-package-structural-v1','invoice-reconciliation-v1']);
const fields=(o,keys)=>o&&Object.keys(o).sort().join(',')===keys.slice().sort().join(',');
const invoiceRow=r=>fields(r,['id','amountMinor','currency'])&&typeof r.id==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(r.id)&&Number.isSafeInteger(r.amountMinor)&&r.amountMinor>=0&&typeof r.currency==='string'&&/^[A-Z]{3}$/.test(r.currency);
export function validateInvoiceReferenceRows(source){
 if(!Array.isArray(source)||!source.length||source.length>1000||!source.every(invoiceRow)||new Set(source.map(r=>r.id)).size!==source.length)throw Error('invalid-reference');
 const totals=new Map();
 for(const r of source)totals.set(r.currency,(totals.get(r.currency)??0n)+BigInt(r.amountMinor));
 for(const total of totals.values())if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('unsafe-total');
 return totals;
}
export function evaluateQuality(profile,input){
 const result={profile,passed:false,issues:[],sourceDigest:null,outputDigest:null,sourceTruthVerified:false};
 try{
  checkedJSON(input,250000);
  if(profile==='content-package-structural-v1'){
   const r=checkContentPackage(input);return {...result,passed:r.passed,issues:r.issues,outputDigest:r.packageDigest,semanticVerified:false};
  }
  if(profile!=='invoice-reconciliation-v1')throw Error('unsupported-profile');
  const {source,report}=input;
  const totals=validateInvoiceReferenceRows(source),row=invoiceRow;
  result.sourceDigest=digest(source);
  if(!fields(report,['rows','totals'])||!Array.isArray(report.rows)||report.rows.length!==source.length||!report.rows.every(row)||new Set(report.rows.map(r=>r.id)).size!==report.rows.length)throw Error('incomplete-or-duplicate-rows');
  const expected=new Map(source.map(r=>[r.id,r]));
  for(const r of report.rows){const e=expected.get(r.id);if(!e||e.currency!==r.currency||e.amountMinor!==r.amountMinor)throw Error('reference-mismatch');}
  if(!Array.isArray(report.totals)||report.totals.length!==totals.size||new Set(report.totals.map(r=>r.currency)).size!==totals.size)throw Error('incomplete-or-duplicate-totals');
  for(const r of report.totals)if(!fields(r,['currency','amountMinor'])||!Number.isSafeInteger(r.amountMinor)||r.amountMinor<0||totals.get(r.currency)!==BigInt(r.amountMinor))throw Error('total-mismatch');
  return {...result,passed:true,outputDigest:digest(report)};
 }catch(e){const safe=new Set(['unsupported-profile','invalid-reference','incomplete-or-duplicate-rows','unsafe-total','reference-mismatch','incomplete-or-duplicate-totals','total-mismatch']);return {...result,issues:[safe.has(e.message)?e.message:'invalid-quality-input']};}
}
