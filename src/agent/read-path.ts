import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {ConwayClient} from '../types.js';

/** A remote failure must never become a read from the controller's filesystem. */
export async function readHarnessFile(client:Pick<ConwayClient,'isLocal'|'readFile'>,file:string,root=process.cwd()):Promise<string>{
 if(isSensitiveReadPath(file))throw new Error('Blocked: sensitive file.');
 if(client.isLocal===true)return readLocalToolFile(file,root);
 return client.readFile(file);
}

export function isSensitiveReadPath(input:unknown):boolean{
 // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
 if(typeof input!=='string'||!input||/[\x00-\x1f]/.test(input))return true;
 return input.split(/[/\\]/).some(part=>{
  const name=part.toLowerCase().split(':')[0].replace(/[. ]+$/,'');
  if(['obolus-paper','.ssh','.aws','.azure','.gnupg','.kube','.npmrc','.pypirc','.netrc','id_rsa','id_ed25519','id_dsa','credentials'].includes(name)||/\.(p12|pfx|keystore)(?:$|[.~-])/.test(name))return true;
  return /^(wallet\.json|automaton\.json|config\.json)(?:$|[.~-])/.test(name)||
   /^\.env(?:$|[.~-])/.test(name)||/\.(key|pem)(?:$|[.~-])/.test(name)||name.startsWith('private-key');
 });
}

/** Bounded local read. Reject aliases; never fall back to a shell after a denial/error. */
export function readLocalToolFile(input:string,root=process.cwd()):string{
 const deny=()=>new Error('Blocked: unsafe or sensitive local read path.');
 if(isSensitiveReadPath(input))throw deny();
 if(input.startsWith('~')&&!/^~[/\\]/.test(input))throw deny();
 if(process.platform==='win32'){
  if(/^[/\\]{2}/.test(input)||/^[a-z]:(?![/\\])/i.test(input))throw deny();
  const tail=input.replace(/^[a-z]:[/\\]/i,'');
  if(tail.includes(':')||tail.split(/[/\\]/).some(p=>p!=='.'&&p!=='..'&&(/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))))throw deny();
 }
 const resolved=path.resolve(input.startsWith('~')?path.join(process.env.HOME||os.homedir(),input.slice(1)):input);
 const relative=path.relative(path.resolve(root),resolved);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw deny();
 let current=resolved;
 while(true){
  const stat=fs.lstatSync(current);if(stat.isSymbolicLink())throw deny();
  if(current===resolved&&(!stat.isFile()||stat.nlink!==1||stat.size>1_048_576))throw deny();
  const parent=path.dirname(current);if(parent===current)break;current=parent;
 }
 const canonical=fs.realpathSync.native(resolved);
 if(isSensitiveReadPath(canonical))throw deny();
 const fd=fs.openSync(canonical,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.nlink!==1||stat.size>1_048_576)throw deny();
  const bytes=Buffer.alloc(1_048_577);let used=0;
  while(used<bytes.length){const n=fs.readSync(fd,bytes,used,bytes.length-used,null);if(!n)break;used+=n;}
  if(used>1_048_576)throw deny();return bytes.subarray(0,used).toString('utf8');
 }finally{fs.closeSync(fd);}
}
