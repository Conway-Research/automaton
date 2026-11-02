import fs from 'node:fs';import path from 'node:path';
import {checkedJSON,digest,orderKey} from './founder-restoration-integrity.mjs';
import {sha256} from './founder-binary-artifacts.mjs';
import {validateOfficeWork,validateOfficeGrant,officeWorkView,officeMust as must} from './founder-ugig-office-contract.mjs';
export function readOfficeFile(file,max){
 const p=path.resolve(file);function components(){let c=path.parse(p).root;for(const part of p.slice(c.length).split(path.sep)){c=path.join(c,part);must(!fs.lstatSync(c).isSymbolicLink(),'linked input path');}}
 components();const fd=fs.openSync(p,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
 try{const a=fs.fstatSync(fd);must(a.isFile()&&a.nlink===1&&a.size>0&&a.size<=max,'input size/type');const b=fs.readFileSync(fd);const c=fs.fstatSync(fd);components();const d=fs.statSync(p);must(b.length===a.size&&['dev','ino','size','mtimeMs','ctimeMs','nlink'].every(k=>a[k]===c[k]&&a[k]===d[k]),'input exchanged during read');return b;}finally{fs.closeSync(fd);}
}
function publicTree(v){if(v&&typeof v==='object'){if(Object.hasOwn(v,'privacy'))must(v.privacy==='public','private nested input');Object.values(v).forEach(publicTree);}}
export function createOfficeEvidence({base,isEnabled,now=Date.now}){
 const root=path.resolve(base,'artifacts/founder-autonomy-20261013'),active=()=>must(isEnabled()===true,'OFF');
 const read=(p,max=256000)=>{active();const b=readOfficeFile(p,max);active();return b;};
 const json=p=>checkedJSON(JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,'')));
 const file=o=>path.join(root,'ugig-office-contracts',digest(orderKey(o))+'.json');
 function work(o){const p=json(file(o));must(Object.keys(p).every(k=>['agreement','workGrant','fundingEvidence','acceptance'].includes(k)),'work pack fields');const a=p.agreement;must(validateOfficeWork(a).valid&&digest(orderKey(o))===digest(orderKey(a))&&o.rootTaskId===a.rootTaskId&&o.sourceRevision===a.sourceRevision&&(o.scopeDigest===undefined||o.scopeDigest===a.scopeDigest),'exact work binding');validateOfficeGrant(p.workGrant,'work',digest(a),now());must(p.fundingEvidence&&typeof p.fundingEvidence==='object','funding evidence required');return p;}
 function release(o,key){work(o);must(/^[a-f0-9]{64}$/.test(key),'generation key');const p=path.join(root,'ugig-office-releases',key+'.json');return fs.existsSync(p)?json(p):null;}
 function inputs(a){active();must(validateOfficeWork(a).valid,'input agreement');const blob=(r,max)=>{must(r.privacy==='public'&&/^[a-f0-9]{64}$/.test(r.sha256),'public input reference');const b=read(path.join(root,'ugig-office-inputs',r.sha256),max);must(b.length===r.size&&sha256(b)===r.sha256,'input integrity');return b;};
 const spec=JSON.parse(blob(a.specRef,96000)),reference=JSON.parse(blob(a.referenceRef,16*1024*1024));publicTree(spec);publicTree(reference);
 must(spec.workKind===a.workKind&&spec.privacy==='public'&&spec.customerApproved===true&&!Object.hasOwn(spec,'workbooks'),'agreed input kind');
 if(a.inputRefs.length)spec.workbooks=a.inputRefs.map(i=>({name:i.name,data:blob(i.blob,10*1024*1024).toString('base64')}));
 active();return {spec,reference};}
 function reviewInputs(a){active();must(validateOfficeWork(a).valid,'input agreement');const pinned=r=>{const b=read(path.join(root,'ugig-office-inputs',r.sha256),256000);must(b.length===r.size&&sha256(b)===r.sha256,'input integrity');return b;};return {specBytes:pinned(a.specRef),referenceBytes:pinned(a.referenceRef)};}
 return {work,release,inputs,reviewInputs,
  has(o){active();return fs.existsSync(file(o));},
  completionPack(o){const p=work(o),e=p.fundingEvidence;must(Object.keys(e).every(k=>['funding','paymentAuthorization','netReceipt','escrowReview','solReference','paymentAssociation'].includes(k)),'funding fields');const {paymentAssociation,...completion}=e;return {...completion,agreement:officeWorkView(p.agreement,e),...(p.acceptance?{acceptance:p.acceptance}:{})};}};
}
