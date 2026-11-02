import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {ConwayClient} from '../types.js';

export const MAX_WRITE_BYTES=1_048_576;
export const MAX_DIRECTORY_ENTRIES=1000;
export const MAX_DIRECTORY_BYTES=64_000;
export function assertWriteContent(content:unknown):asserts content is string{
 if(typeof content!=='string'||content.length>MAX_WRITE_BYTES||Buffer.byteLength(content,'utf8')>MAX_WRITE_BYTES)throw new Error('Blocked: write content exceeds the 1 MiB UTF-8 limit or is not text.');
}

/** Local checks are fail-closed, but are not an OS sandbox against concurrent filesystem mutation. */
export function confineWritePath(input:string,remote:boolean,localRoot?:string,allowRoot=false):string|{error:string}{
 const blocked=()=>({error:'Blocked: write path is outside the allowed directory or uses an unsafe filesystem alias.'});
 // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
 if(typeof input!=='string'||!input||/[\x00-\x1f]/.test(input))return blocked();
 const paths=remote?path.posix:path;
 const root=remote?'/root':paths.resolve(localRoot??(process.env.HOME||os.homedir()));
 if(remote&&(input.includes('\\')||/^[a-z]:/i.test(input)))return blocked();
 if(!remote&&process.platform==='win32'){
  // Reject device/UNC syntax, alternate streams, drive-relative paths and Win32 aliases.
  if(/^[/\\]{2}/.test(input)||/^[a-z]:(?![/\\])/i.test(input))return blocked();
  const tail=input.replace(/^[a-z]:[/\\]/i,'');
  if(tail.includes(':')||tail.split(/[/\\]/).some(p=>p!=='.'&&p!=='..'&&(/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))))return blocked();
 }
 if(input.startsWith('~')&&input!=='~'&&!/^~[/\\]/.test(input))return blocked();
 const expanded=input.startsWith('~')?paths.join(root,input.slice(1)):input;
 const resolved=paths.resolve(root,expanded),relative=paths.relative(root,resolved);
 if(resolved.split(/[/\\]/).some(part=>part.toLowerCase()==='obolus-paper'))return blocked();
 if((!relative&&!allowRoot)||relative==='..'||relative.startsWith('..'+paths.sep)||paths.isAbsolute(relative))return blocked();
 if(!remote){
  try{
   // Check existing ancestors, including links above the configured root. Reject dangling links too.
   let current=resolved;
   while(true){
    try{const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||(stat.isFile()&&stat.nlink>1))return blocked();}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')return blocked();}
    const parent=paths.dirname(current);if(parent===current)break;current=parent;
   }
  }catch{return blocked();}
 }
 return resolved;
}

export async function writeWorkspaceFile(client:Pick<ConwayClient,'isLocal'|'writeFile'>,file:string,content:string,root:string):Promise<void>{
 assertWriteContent(content);
 if(client.isLocal!==true){await client.writeFile(file,content);return;}
 const check=()=>{const result=confineWritePath(file,false,root);if(typeof result!=='string')throw new Error(result.error);return result;};
 const target=check();fs.mkdirSync(path.dirname(target),{recursive:true});check();
 // Do not truncate until the opened descriptor has passed regular-file and hardlink checks.
 const fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|(fs.constants.O_NOFOLLOW||0),0o600);
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.nlink!==1)throw new Error('Blocked: unsafe write target.');fs.ftruncateSync(fd,0);fs.writeFileSync(fd,content,'utf8');}
 finally{fs.closeSync(fd);}
}

export function listWorkspaceDirectory(file:string,root:string):{lines:string[];truncated:boolean}{
 const result=confineWritePath(file,false,root,true);
 if(typeof result!=='string')throw new Error(result.error);
 const directory=fs.opendirSync(result),lines:string[]=[];let bytes=0,truncated=false;
 try{
  while(true){
   const entry=directory.readSync();if(!entry)break;
   // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
   const name=/[\x00-\x1f\x7f]/.test(entry.name)?JSON.stringify(entry.name):entry.name;
   const line=`${entry.isDirectory()?'dir':entry.isFile()?'file':'other'}\t${name}`;
   const size=Buffer.byteLength(line,'utf8')+1;
   if(lines.length>=MAX_DIRECTORY_ENTRIES||bytes+size>MAX_DIRECTORY_BYTES){truncated=true;break;}
   lines.push(line);bytes+=size;
  }
 }finally{directory.closeSync();}
 return {lines,truncated};
}
