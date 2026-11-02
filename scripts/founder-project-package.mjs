import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {profileFilesDigest} from './founder-work-profiles.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
/** ZIP construction only; source text is never evaluated or written as host code. */
export function buildProjectPackage(state){
 if(state.status!=='packaged'||!state.verification?.passed||state.verification.filesDigest!==profileFilesDigest(state.files))throw Error('Exact independently verified packaged project required');
 const files=[...state.files,{path:'PROJECT-DESIGN.json',content:JSON.stringify(state.design,null,2)},{path:'PROJECT-SCOPE.json',content:JSON.stringify(state.scope,null,2)}];
 const names=new Set();for(const f of files){if(names.has(f.path.toLowerCase())||['MANIFEST.json'].includes(f.path)||!/^[-\w.]+(?:\/[-\w.]+)*$/.test(f.path)||f.path.split('/').some(p=>p==='.'||p==='..'))throw Error('Unsafe package path');names.add(f.path.toLowerCase());}
 const manifest={schema:'numaron-project-package-v1',scopeDigest:state.scopeDigest,filesDigest:state.verification.filesDigest,verifierBindingDigest:state.verifierBindingDigest,verifierContract:state.verifierContract,proofLevel:state.proofLevel,autonomousGenerationProven:state.autonomousGenerationProven,files:files.map(f=>({path:f.path,sha256:hash(Buffer.from(f.content,'utf8'))}))};
 files.push({path:'MANIFEST.json',content:JSON.stringify(manifest,null,2)});
 const local=[],central=[];let offset=0;
 for(const f of files.sort((a,b)=>a.path.localeCompare(b.path))){const name=Buffer.from(f.path),raw=Buffer.from(f.content),compressed=deflateRawSync(raw),crc=crc32(raw),header=Buffer.alloc(30),directory=Buffer.alloc(46);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x21,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(name.length,26);
  directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(0x21,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(raw.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
  local.push(header,name,compressed);central.push(directory,name);offset+=header.length+name.length+compressed.length;
 }
 const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
 const bytes=Buffer.concat([...local,index,end]);return {filename:state.scope.id+'.zip',bytes,sha256:hash(bytes),filesDigest:state.verification.filesDigest,manifest};
}
