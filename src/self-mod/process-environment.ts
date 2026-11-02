import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const gitNullFile=process.platform==='win32'?'NUL':os.devNull;

const executablePaths=process.platform==='win32'
 ? {git:['C:/Program Files/Git/cmd/git.exe'],curl:['C:/Windows/System32/curl.exe']}
 : {git:['/usr/bin/git','/bin/git'],curl:['/usr/bin/curl','/bin/curl']};

/** Fresh process working directory, not an OS sandbox. Only this newly created directory is removed. */
export function withMaintenanceDirectory<T>(run:(directory:string)=>T):T{
 const base=fs.realpathSync(os.tmpdir());
 const directory=fs.mkdtempSync(path.join(base,'obolus-maintenance-'));
 try{return run(directory);}
 finally{
  const relative=path.relative(base,directory);
  // oxlint-disable-next-line no-unsafe-finally -- Cleanup refusal intentionally overrides success or the original error; never delete an unsafe path.
  if(!relative.startsWith('obolus-maintenance-')||relative.includes(path.sep)||fs.lstatSync(directory).isSymbolicLink())throw new Error('Maintenance directory cleanup refused.');
  fs.rmSync(directory,{recursive:true,force:true});
 }
}

/** Fixed installation locations, never PATH/current-directory lookup. Not a signature attestation. */
export function maintenanceExecutable(tool:'git'|'curl'):string{
 for(const candidate of executablePaths[tool]){
  try{if(!fs.lstatSync(candidate).isFile())continue;fs.accessSync(candidate,process.platform==='win32'?fs.constants.F_OK:fs.constants.X_OK);return path.resolve(candidate);}catch{}
 }
 throw new Error('Required maintenance executable is unavailable at the accepted installation paths.');
}

/** Minimal host compatibility variables; never forward credentials or runtime injection options. */
export function maintenanceProcessEnvironment(source:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
 const result:NodeJS.ProcessEnv={};
 const names=new Set(['systemroot','windir','temp','tmp','tmpdir','lang','lc_all']);
 for(const [key,value] of Object.entries(source)){
  if(value!==undefined&&names.has(key.toLowerCase()))result[key]=value;
 }
 result.PATH=process.platform==='win32'?'C:\\Program Files\\Git\\cmd;C:\\Windows\\System32':'/usr/bin:/bin';
 result.GIT_CONFIG_NOSYSTEM='1';
 result.GIT_CONFIG_SYSTEM=gitNullFile;
 result.GIT_CONFIG_GLOBAL=gitNullFile;
 result.GIT_TERMINAL_PROMPT='0';
 return result;
}

/** Overrides known executable helpers and disallows non-HTTP transports. */
export function gitMaintenanceEnvironment(source:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
 const env=maintenanceProcessEnvironment(source);
 const config=[['credential.helper',''],['credential.interactive','false'],['core.askPass',''],
  ['core.hooksPath',gitNullFile],['core.fsmonitor','false'],['protocol.allow','never'],
  ['protocol.http.allow','always'],['protocol.https.allow','always'],['http.followRedirects','false'],
  ['http.extraHeader',''],['submodule.recurse','false'],['gc.auto','0']];
 env.GIT_CONFIG_COUNT=String(config.length);
 config.forEach(([key,value],i)=>{env[`GIT_CONFIG_KEY_${i}`]=key;env[`GIT_CONFIG_VALUE_${i}`]=value;});
 return env;
}
