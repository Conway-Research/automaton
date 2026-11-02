import {createHash} from 'node:crypto';
import {digest} from './founder-restoration-integrity.mjs';

// Reviewed handover files, never executable commands or inputs to a runtime.
export const mixedPackageDigest=a=>digest({binaryArtifacts:a.binaryArtifacts,files:a.files});
export function validMixedTextFiles(a){
 try {
  const files=a.files;
  if(!Array.isArray(files)||!files.length||files.length>50||Buffer.byteLength(JSON.stringify(files))>96000)return false;
  const seen=new Set(['binary-manifest.json',...a.binaryArtifacts.map(f=>f.name.toLowerCase())]);
  for(const f of files){
   if(!f||Object.keys(f).sort().join(',')!=='content,path'||typeof f.path!=='string'||f.path.length>200||
    !/^[-\w.]+(?:\/[-\w.]+)*\.(?:py|js|mjs|cjs|ts|tsx|sh|bat|csv|md|txt|json)$/.test(f.path)||
    f.path.split('/').some(p=>p==='.'||p==='..'||/^(node_modules|\.git|\.env|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))||
    typeof f.content!=='string'||f.content.includes('\0')||seen.has(f.path.toLowerCase()))return false;
   seen.add(f.path.toLowerCase());
  }
  return true;
 }catch{return false;}
}
export function mixedTextManifest(files){return files.map(f=>({
 path:f.path,size:Buffer.byteLength(f.content,'utf8'),
 sha256:createHash('sha256').update(f.content,'utf8').digest('hex')
}));}
export function renderMixedTextMessages(a,product,intent){
 if(!validMixedTextFiles(a))throw Error('Invalid mixed text files');
 // ASCII JSON chunks preserve every UTF-16 code unit, including astral characters,
 // without splitting a literal surrogate pair across independent messages.
 const body=JSON.stringify({schema:'numaron-mixed-text-v1',productDigest:product.digest,
  packageDigest:mixedPackageDigest(a),files:a.files}).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if(Buffer.byteLength(body)>576000)throw Error('Mixed text delivery bounds');
 const chunks=body.match(/[\s\S]{1,1400}/g);
 return chunks.map((chunk,i)=>({content:`Numaron mixed text ${intent}\nProduct SHA256: ${product.digest}\nPackage SHA256: ${mixedPackageDigest(a)}\nPart ${i+1}/${chunks.length}\n\n${chunk}`,attachments:[]}));
}
