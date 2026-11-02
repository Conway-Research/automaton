import {checkedJSON,digest,bounded} from './founder-restoration-integrity.mjs';
const exactFields=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
const kinds=new Set(['social-post','email','summary']),normal=s=>s.normalize('NFC').replace(/\s+/gu,' ').trim();
export function validateContentBrief(brief){const issues=[];try{
 checkedJSON(brief,60000);const s=brief.source;
 if(!s||!bounded(s.id)||typeof s.text!=='string'||!s.text.trim()||Buffer.byteLength(s.text)>40000||s.digest!==digest(s.text)||s.privacy!=='public'||s.reuseAllowed!==true)issues.push('authorized-public-source-required');
 if(!['language','audience','tone'].every(k=>bounded(brief[k],1000)))issues.push('explicit-audience-language-tone-required');
 if(!Array.isArray(brief.formats)||!brief.formats.length||brief.formats.length>20||new Set(brief.formats.map(f=>f.id)).size!==brief.formats.length||brief.formats.some(f=>!bounded(f.id)||!kinds.has(f.kind)||!Number.isSafeInteger(f.count)||f.count<1||f.count>20||!Number.isSafeInteger(f.maxCharacters)||f.maxCharacters<1||f.maxCharacters>16000)||brief.formats.reduce((n,f)=>n+f.count,0)>20)issues.push('bounded-explicit-formats-required');
 if(!Array.isArray(brief.requiredPoints)||!brief.requiredPoints.length||brief.requiredPoints.some(x=>!bounded(x,2000)))issues.push('required-points-missing');
 if(!Array.isArray(brief.allowedLinks)||brief.allowedLinks.length>20||brief.allowedLinks.some(x=>{try{const u=new URL(x);return u.protocol!=='https:'||!!u.username||!!u.password;}catch{return true;}}))issues.push('invalid-approved-links');
 }catch{issues.push('invalid-brief');}return {passed:issues.length===0,issues,briefDigest:issues.length?null:digest(brief)};}
export function checkContentPackage({brief,package:p}){const valid=validateContentBrief(brief),issues=[...valid.issues];try{
 checkedJSON(p,16000);if(!exactFields(p,['briefDigest','items']))throw Error('package-schema');if(p.briefDigest!==valid.briefDigest)issues.push('brief-changed');
 if(!Array.isArray(p.items)||!p.items.length||p.items.length>20)throw Error('items');
 const ids=new Set(),texts=new Set();for(const item of p.items){if(!exactFields(item,['id','formatId','kind','text','evidence',...(item?.kind==='email'?['subject']:[])]))throw Error('item-schema');const f=brief.formats.find(f=>f.id===item.formatId);if(!f||f.kind!==item.kind||!bounded(item.id)||ids.has(item.id)||typeof item.text!=='string'||!item.text.trim())throw Error('invalid-output');ids.add(item.id);
 const text=normal(item.text);if(texts.has(text))issues.push('duplicate-content');texts.add(text);
 if(Array.from(item.text.normalize('NFC')).length>f.maxCharacters)issues.push('format-length');
 if(item.kind==='email'&&(!bounded(item.subject,300)))issues.push('email-subject-required');
 if(/\b(?:TODO|TBD|PLACEHOLDER|LOREM IPSUM)\b|\[insert\b/i.test(item.text+' '+(item.subject??'')))issues.push('placeholder');
 for(const link of (item.text+' '+(item.subject??'')).match(/https?:\/\/[^\s<>"')]+/gi)??[])if(!brief.allowedLinks.includes(link))issues.push('foreign-link');
 if(!Array.isArray(item.evidence)||!item.evidence.length||item.evidence.some(e=>!exactFields(e,['sourceId','quote'])||e.sourceId!==brief.source.id||typeof e.quote!=='string'||!e.quote.trim()||!brief.source.text.includes(e.quote)))issues.push('source-reference-mismatch');
 }
 for(const f of brief.formats)if(p.items.filter(i=>i.formatId===f.id).length!==f.count)issues.push('format-count');
 const combined=normal(p.items.map(i=>i.text).join(' ')).toLowerCase();for(const point of brief.requiredPoints)if(!combined.includes(normal(point).toLowerCase()))issues.push('required-point-missing');
 }catch{issues.push('invalid-package');}return {passed:issues.length===0,issues:[...new Set(issues)],packageDigest:issues.length?null:digest(p),semanticVerified:false};}
export function contentPackageFiles(p){checkedJSON(p,16000);return [{path:'content-package.json',content:JSON.stringify(checkedJSON(p))}];}
