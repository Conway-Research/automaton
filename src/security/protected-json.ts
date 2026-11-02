import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {registerLogSecrets} from '../observability/redaction.js';

const prefix='obolus-dpapi:v1:';
const protectionField='__obolusCredentialProtection';
const protectionVersion='windows-dpapi-v1';
const sensitive=/^(?:.*apiKey|privateKey|secretKey|accessToken|refreshToken|clientSecret|password|passphrase|mnemonic)$/i;
/** Fixed operator/runtime cryptographic operation; no agent-supplied commands.
 * CurrentUser DPAPI protects at rest, not from the same user or account loss. */
export function transformProtectedJson<T>(value:T,operation:'protect'|'unprotect'):T {
 const cloned=JSON.parse(JSON.stringify(value)) as T;
 const declaredProtection=Boolean(cloned&&typeof cloned==='object'&&Object.hasOwn(cloned,protectionField));
 if(cloned&&typeof cloned==='object'&&Object.hasOwn(cloned,protectionField)){
  const record=cloned as Record<string,unknown>;
  if(record[protectionField]!==protectionVersion)throw Error('Unsupported credential protection policy');
  if(operation==='unprotect')delete record[protectionField];
 }
 const slots:Array<{owner:Record<string,unknown>;key:string;value:string}>=[];
 const existingCiphertexts:Array<{apiKey:string}>=[];
 const walk=(item:unknown,depth=0)=>{
  if(depth>64)throw Error('Protected configuration nesting limit exceeded');
  if(!item||typeof item!=='object')return;
  for(const [key,v] of Object.entries(item)){
   if(typeof v==='string'&&sensitive.test(key)&&v.length){
    const encoded=v.startsWith('obolus-dpapi:');
    if(operation==='unprotect'&&declaredProtection&&!encoded)throw Error('Credential protection policy mismatch');
    if(encoded&&!v.startsWith(prefix))throw Error('Unsupported protected credential version');
    if(operation==='protect'&&encoded)existingCiphertexts.push({apiKey:v});
    if(operation==='unprotect'&&encoded||operation==='protect'&&!encoded)
     slots.push({owner:item as Record<string,unknown>,key,value:operation==='unprotect'?v.slice(prefix.length):v});
   }else if(v&&typeof v==='object')walk(v,depth+1);
  }
 };
 walk(cloned);
 if(slots.length+existingCiphertexts.length>256)throw Error('Too many protected credentials');
 // A prefix is not proof of decryptability. Validate supplied ciphertext before
 // it can replace working credentials, while preserving its original bytes.
 if(existingCiphertexts.length)transformProtectedJson(existingCiphertexts,'unprotect');
 if(!slots.length)return cloned;
 if(process.platform!=='win32')throw Error('Windows protected credentials unavailable');
 if(slots.length>256)throw Error('Too many protected credentials');
 const script=`$ErrorActionPreference='Stop';try {[Console]::InputEncoding=New-Object Text.UTF8Encoding($false);[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);Add-Type -AssemblyName System.Security; $items=ConvertFrom-Json ([Console]::In.ReadToEnd()); $result=@(); foreach($item in $items){${operation==='protect'?
  '$bytes=[Text.Encoding]::UTF8.GetBytes([string]$item);$out=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$result += [Convert]::ToBase64String($out)':
  '$bytes=[Convert]::FromBase64String([string]$item);$out=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$result += [Text.Encoding]::UTF8.GetString($out)'} }; [Console]::Out.Write((ConvertTo-Json -InputObject @($result) -Compress))}catch{exit 1}`;
 try {
  const output=execFileSync(path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{
   input:JSON.stringify(slots.map(s=>s.value)),encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:4*1024*1024,stdio:['pipe','pipe','pipe'],
   env:Object.fromEntries(['SystemRoot','WINDIR','LOCALAPPDATA','USERPROFILE','TEMP','TMP'].flatMap(k=>process.env[k]?[[k,process.env[k]!]]:[]))});
  const values:unknown=JSON.parse(output);
  if(!Array.isArray(values)||values.length!==slots.length||values.some(v=>typeof v!=='string'||!v.length))throw Error('Invalid result');
  slots.forEach((slot,i)=>{slot.owner[slot.key]=operation==='protect'?prefix+values[i]:values[i];});
  if(operation==='unprotect')registerLogSecrets(values);
  return cloned;
 }catch{throw Error('Protected credential operation failed');}
}

function assertProtectedPath(file:string):void {
 // Reject special Windows namespaces before even probing the filesystem.
 if(!file.length||Array.from(file).some(c=>c.charCodeAt(0)<32))throw Error('Unsafe protected configuration path');
 if(process.platform==='win32'){
  if(/^[/\\]{2}/.test(file)||/^[a-z]:(?![/\\])/i.test(file))throw Error('Unsafe protected configuration path');
  const tail=file.replace(/^[a-z]:[/\\]/i,'');
  if(tail.includes(':')||tail.split(/[/\\]/).some(p=>p!=='.'&&p!=='..'&&(/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))))
   throw Error('Unsafe protected configuration path');
 }
 const resolved=path.resolve(file);
 let current=resolved;
 while(true){
  let info:fs.Stats|undefined;
  try{info=fs.lstatSync(current);}catch(error){
   if((error as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Unsafe protected configuration path');
  }
  if(info&&(info.isSymbolicLink()||(current===resolved&&(!info.isFile()||info.nlink!==1))))
   throw Error('Unsafe protected configuration path');
  const parent=path.dirname(current);if(parent===current)break;current=parent;
 }
}

export function readProtectedJson(file:string):any {
 assertProtectedPath(file);
 return transformProtectedJson(JSON.parse(fs.readFileSync(file,'utf8')),'unprotect');
}

/** Identity creation never inherits a legacy/plaintext storage policy. */
export function writeNewProtectedIdentity(file:string,value:unknown):void {
 assertProtectedPath(file);
 if(fs.existsSync(file))throw Error('Protected identity already exists');
 if(process.platform!=='win32')throw Error('Protected identity storage unavailable on this platform');
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Protected identity object required');
 writeProtectedJson(file,{...value,[protectionField]:protectionVersion},true);
}

/** Preserve protected-at-rest format on later saves of migrated files. */
export function serializeProtectedJson(file:string,value:unknown):string {
 assertProtectedPath(file);
 // New Windows documents are protected by default. Existing legacy files are
 // intentionally not migrated as a side effect of an ordinary save.
 let protectedFile=process.platform==='win32'&&!fs.existsSync(file);
 if(fs.existsSync(file)){
  const stored=fs.readFileSync(file,'utf8');
  // Reject damaged/unsupported stored credentials before any replacement can
  // silently turn a previously protected file into plaintext.
  const parsed=JSON.parse(stored);
  transformProtectedJson(parsed,'unprotect');
  protectedFile=stored.includes('obolus-dpapi:')||Boolean(parsed&&typeof parsed==='object'&&Object.hasOwn(parsed,protectionField));
 }
 const requestedProtection=Boolean(value&&typeof value==='object'&&Object.hasOwn(value,protectionField));
 if(!protectedFile&&!requestedProtection)return JSON.stringify(value,null,2);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Protected configuration must be an object');
 // Keep the policy even if the last credential is cleared. Ciphertext presence
 // alone must not determine whether a later replacement gets encrypted.
 const protectedValue=transformProtectedJson(value,'protect') as Record<string,unknown>;
 protectedValue[protectionField]=protectionVersion;
 return JSON.stringify(protectedValue,null,2);
}

/** Complete a staged write without truncating the existing file. A stale lock
 * on non-Windows systems fails closed and needs trusted recovery, not guessing.
 * This is not protection against a hostile process with the same OS identity. */
export function writeProtectedJson(file:string,value:unknown,exclusive=false):void {
 assertProtectedPath(file);
 const destination=path.resolve(file);
 const existing=fs.existsSync(destination)?fs.readFileSync(destination):null;
 if(exclusive&&existing!==null)throw Error('Protected configuration already exists');
 const serialized=serializeProtectedJson(destination,value);
 const expected=existing===null?null:createHash('sha256').update(existing).digest('hex');
 if(process.platform==='win32'){
  const script=`$ErrorActionPreference='Stop';$lock=$null;$stream=$null;$temp=$null;try{
   [Console]::InputEncoding=New-Object Text.UTF8Encoding($false);$r=ConvertFrom-Json ([Console]::In.ReadToEnd());
   $lock=New-Object IO.FileStream(($r.path+'.obolus-write-lock'),[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None,4096,[IO.FileOptions]::DeleteOnClose);
   if([IO.File]::Exists($r.path)){
    if($null -eq $r.expected){throw 'Concurrent create'};
    $sha=[Security.Cryptography.SHA256]::Create();try{$hash=[BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($r.path))).Replace('-','')}finally{$sha.Dispose()};
    if($hash -ne $r.expected){throw 'Concurrent update'};
   }elseif($null -ne $r.expected){throw 'File disappeared'};
   $temp=$r.path+'.pending-'+[Guid]::NewGuid().ToString('N');
   $stream=New-Object IO.FileStream($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);
   if($null -ne $r.expected){$stream.SetAccessControl([IO.File]::GetAccessControl($r.path))};
   $bytes=[Text.Encoding]::UTF8.GetBytes([string]$r.content);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true);$stream.Dispose();$stream=$null;
   if($null -eq $r.expected){[IO.File]::Move($temp,$r.path)}else{[IO.File]::Replace($temp,$r.path,[NullString]::Value,$false)};
   $temp=$null;
  }catch{exit 1}finally{if($stream){$stream.Dispose()};if($temp -and [IO.File]::Exists($temp)){[IO.File]::Delete($temp)};if($lock){$lock.Dispose()}}`;
  try{execFileSync(path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{
   input:JSON.stringify({path:destination,expected,content:serialized}),windowsHide:true,timeout:15000,maxBuffer:8192,stdio:['pipe','pipe','pipe'],
   env:Object.fromEntries(['SystemRoot','WINDIR','LOCALAPPDATA','USERPROFILE','TEMP','TMP'].flatMap(k=>process.env[k]?[[k,process.env[k]!]]:[]))});
  }catch{throw Error('Protected configuration write failed; existing state requires verification');}
  return;
 }
 const lock=destination+'.obolus-write-lock',temp=destination+'.pending-'+randomUUID();
 let lockFd:number|undefined,tempFd:number|undefined,tempCreated=false;
 try{
  lockFd=fs.openSync(lock,'wx',0o600);
  const current=fs.existsSync(destination)?fs.readFileSync(destination):null;
  if((current===null?null:createHash('sha256').update(current).digest('hex'))!==expected)throw Error('Concurrent update');
  const stat=current===null?null:fs.statSync(destination);
  if(stat&&process.getuid&&stat.uid!==process.getuid())throw Error('Foreign file owner');
  tempFd=fs.openSync(temp,'wx',0o600);tempCreated=true;
  if(stat)fs.fchmodSync(tempFd,stat.mode&0o777);
  fs.writeFileSync(tempFd,serialized);fs.fsyncSync(tempFd);fs.closeSync(tempFd);tempFd=undefined;
  if(existing===null){fs.linkSync(temp,destination);fs.unlinkSync(temp);}else fs.renameSync(temp,destination);
  tempCreated=false;
 }catch{throw Error('Protected configuration write failed; existing state requires verification');}
 finally{
  if(tempFd!==undefined)fs.closeSync(tempFd);
  if(tempCreated)fs.unlinkSync(temp);
  if(lockFd!==undefined){fs.closeSync(lockFd);fs.unlinkSync(lock);}
 }
}
