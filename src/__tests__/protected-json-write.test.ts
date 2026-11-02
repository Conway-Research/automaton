import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execFileSync} from 'node:child_process';
import * as childProcess from 'node:child_process';
vi.mock('node:child_process',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:child_process')>();
 return {...actual,execFileSync:vi.fn(actual.execFileSync)};
});
import {writeNewProtectedIdentity,writeProtectedJson,readProtectedJson,transformProtectedJson} from '../security/protected-json.js';
afterEach(()=>vi.restoreAllMocks());
it('identity creation has no plaintext fallback on unsupported platforms',()=>withFile(file=>{
 const descriptor=Object.getOwnPropertyDescriptor(process,'platform')!;
 try{Object.defineProperty(process,'platform',{value:'linux'});expect(()=>writeNewProtectedIdentity(file,{privateKey:'synthetic-only'})).toThrow('unavailable');expect(fs.existsSync(file)).toBe(false);}
 finally{Object.defineProperty(process,'platform',descriptor);}
}));
it.runIf(process.platform==='win32')('failed identity protection leaves no file and sanitizes the error',()=>withFile((file,dir)=>{
 vi.mocked(childProcess.execFileSync).mockImplementationOnce(()=>{throw Error('synthetic-secret-must-not-escape');});
 expect(()=>writeNewProtectedIdentity(file,{privateKey:'synthetic-secret-must-not-escape'})).toThrow(/^Protected credential operation failed$/);
 expect(fs.readdirSync(dir)).toEqual([]);
}));
it.runIf(process.platform==='win32').each(['privateKey','secretKey','openaiApiKey'])('protects newly created %s without caller metadata',key=>withFile(file=>{
 const value={[key]:'synthetic-new-identity-7262'};
 writeProtectedJson(file,value,true);
 expect(fs.readFileSync(file,'utf8')).not.toContain(value[key]);
 expect(readProtectedJson(file)).toEqual(value);
 expect(()=>writeProtectedJson(file,{[key]:'other'},true)).toThrow('already exists');
}));
it.runIf(process.platform==='win32').each([false,true])('honors explicit protection on first policy write (existing legacy: %s)',existing=>withFile(file=>{
 if(existing)fs.writeFileSync(file,'{}');
 const value={apiKey:'synthetic-first-policy-7262',__obolusCredentialProtection:'windows-dpapi-v1'};
 writeProtectedJson(file,value);
 expect(fs.readFileSync(file,'utf8')).not.toContain(value.apiKey);
 expect(readProtectedJson(file)).toEqual({apiKey:value.apiKey});
}));
function withFile(run:(file:string,dir:string)=>void){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-atomic-write-'));try{run(path.join(dir,'config.json'),dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
it('creates exclusively and never replaces an existing identity',()=>withFile(file=>{
 writeProtectedJson(file,{name:'original'},true);
 expect(()=>writeProtectedJson(file,{name:'replacement'},true)).toThrow('already exists');
 expect(readProtectedJson(file)).toEqual({name:'original'});
}));
it('updates a complete document and cleans staged files',()=>withFile((file,dir)=>{
 fs.writeFileSync(file,'{"name":"old"}');writeProtectedJson(file,{name:'new'});
 expect(readProtectedJson(file)).toEqual({name:'new'});
 expect(fs.readdirSync(dir)).toEqual(['config.json']);
}));
it('leaves destination and another writer lock untouched when locked',()=>withFile((file,dir)=>{
 const original='{"name":"old"}';fs.writeFileSync(file,original);fs.writeFileSync(file+'.obolus-write-lock','held');
 expect(()=>writeProtectedJson(file,{name:'new'})).toThrow('write failed');
 expect(fs.readFileSync(file,'utf8')).toBe(original);
 expect(fs.readFileSync(file+'.obolus-write-lock','utf8')).toBe('held');
 expect(fs.readdirSync(dir).length).toBe(2);
}));
it('rejects a changed destination between serialization and writer lock',()=>withFile(file=>{
 fs.writeFileSync(file,'{}');let changed=false;
 const value={toJSON(){if(!changed){fs.writeFileSync(file,'{"concurrent":true}');changed=true;}return {name:'stale'};}};
 expect(()=>writeProtectedJson(file,value)).toThrow('write failed');
 expect(JSON.parse(fs.readFileSync(file,'utf8'))).toEqual({concurrent:true});
}));
it('rejects a concurrent identity creation rather than replacing it',()=>withFile(file=>{
 const value={toJSON(){fs.writeFileSync(file,'{"identity":"other-writer"}');return {identity:'stale-writer'};}};
 expect(()=>writeProtectedJson(file,value,true)).toThrow('write failed');
 expect(JSON.parse(fs.readFileSync(file,'utf8'))).toEqual({identity:'other-writer'});
}));
it.runIf(process.platform==='win32')('preserves original and removes staged data on failure after flush',()=>withFile((file,dir)=>{
 fs.writeFileSync(file,'{"preserved":true}');const real=vi.mocked(childProcess.execFileSync).getMockImplementation()!;
 vi.mocked(childProcess.execFileSync).mockImplementationOnce(((command:string,args:string[],options:object)=>{
  const changed=args.map(arg=>arg.replace('$stream.Flush($true);',"$stream.Flush($true);throw 'synthetic interruption';"));
  return real(command,changed,options);
 }) as typeof childProcess.execFileSync);
 expect(()=>writeProtectedJson(file,{replacement:true})).toThrow('write failed');
 expect(fs.readFileSync(file,'utf8')).toBe('{"preserved":true}');
 expect(fs.readdirSync(dir)).toEqual(['config.json']);
}));
it.runIf(process.platform==='win32')('preserves Windows DACL and encrypted format during replacement',()=>withFile(file=>{
 fs.writeFileSync(file,JSON.stringify(transformProtectedJson({apiKey:'synthetic-atomic-7262'},'protect')));
 const ps=path.join(process.env.SystemRoot!,'System32','WindowsPowerShell','v1.0','powershell.exe');
 execFileSync(ps,['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$a=[IO.File]::GetAccessControl($p);$a.SetAccessRuleProtection($true,$false);$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$r=New-Object Security.AccessControl.FileSystemAccessRule($s,'FullControl','Allow');$a.AddAccessRule($r);[IO.File]::SetAccessControl($p,$a)`],{input:file,windowsHide:true});
 const getAcl=()=>execFileSync(ps,['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();[IO.File]::GetAccessControl($p).Sddl`],{input:file,encoding:'utf8',windowsHide:true}).trim();
 const before=getAcl();writeProtectedJson(file,{apiKey:'synthetic-replacement-7262'});
 expect(getAcl()).toBe(before);
 expect(fs.readFileSync(file,'utf8')).not.toContain('synthetic-replacement-7262');
 expect(readProtectedJson(file)).toEqual({apiKey:'synthetic-replacement-7262'});
}),30000);
it.runIf(process.platform==='win32').each(['before-replace','after-replace'])('survives actual writer termination %s and releases its lock',boundary=>withFile((file,dir)=>{
 const oldSecret='synthetic-crash-original-7262',newSecret='synthetic-crash-replacement-7262';
 fs.writeFileSync(file,JSON.stringify(transformProtectedJson({apiKey:oldSecret},'protect')));
 const before=fs.readFileSync(file),real=vi.mocked(childProcess.execFileSync).getMockImplementation()!;
 let injected=false;
 vi.mocked(childProcess.execFileSync).mockImplementation(((command:string,args:string[],options:object)=>{
  const needle=boundary==='before-replace'?'$stream.Flush($true);':'$temp=$null;\n  }catch';
  const kill='[Diagnostics.Process]::GetCurrentProcess().Kill();[Threading.Thread]::Sleep(60000);';
  const changed=args.map(arg=>{
   if(!arg.includes(needle))return arg;
   injected=true;
   return arg.replace(needle,boundary==='before-replace'?needle+kill:kill+needle);
  });
  return real(command,changed,options);
 }) as typeof childProcess.execFileSync);
 try{expect(()=>writeProtectedJson(file,{apiKey:newSecret})).toThrow('write failed');}
 finally{vi.mocked(childProcess.execFileSync).mockImplementation(real);}
 expect(injected).toBe(true);
 expect(fs.existsSync(file+'.obolus-write-lock')).toBe(false);
 const pending=fs.readdirSync(dir).filter(name=>name.includes('.pending-'));
 if(boundary==='before-replace'){
  expect(fs.readFileSync(file)).toEqual(before);expect(pending).toHaveLength(1);
  expect(fs.readFileSync(path.join(dir,pending[0]),'utf8')).not.toContain(newSecret);
 }else{expect(readProtectedJson(file)).toEqual({apiKey:newSecret});expect(pending).toHaveLength(0);}
 writeProtectedJson(file,{apiKey:'synthetic-after-restart-7262'});
 expect(readProtectedJson(file)).toEqual({apiKey:'synthetic-after-restart-7262'});
 // No automatic adoption/deletion of an uncommitted pending file.
 expect(fs.readdirSync(dir).filter(name=>name.includes('.pending-'))).toEqual(pending);
}),30000);
