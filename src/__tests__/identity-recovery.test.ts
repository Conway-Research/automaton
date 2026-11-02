import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as childProcess from 'node:child_process';
vi.mock('node:child_process',async original=>{const real=await original<typeof import('node:child_process')>();return {...real,execFileSync:vi.fn(real.execFileSync)};});
import {encodeIdentityRecovery,restoreIdentityRecovery} from '../security/identity-recovery.js';
import {readProtectedJson} from '../security/protected-json.js';
import {isProtectedFile} from '../self-mod/code.js';
afterEach(()=>vi.restoreAllMocks());
it('recovery and snapshot controls cannot be rewritten by ordinary self-modification',()=>{
 for(const name of ['identity-recovery','paper-status-snapshot'])for(const ext of ['ts','js','d.ts'])expect(isProtectedFile(`src/security/${name}.${ext}`)).toBe(true);
});
function fixture(run:(file:string)=>void){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-recovery-synthetic-'));try{run(path.join(dir,'identity.json'));}finally{fs.rmSync(dir,{recursive:true,force:true});}}
it.runIf(process.platform==='win32').each(['evm','solana'] as const)('restores synthetic %s only to a new protected destination',chainType=>fixture(file=>{
 const value={chainType,createdAt:'2026-10-06T00:00:00Z',[chainType==='evm'?'privateKey':'secretKey']:'synthetic-not-a-real-key'};
 const envelope=encodeIdentityRecovery(value);expect(envelope).not.toContain('synthetic-not-a-real-key');
 restoreIdentityRecovery(envelope,file);expect(readProtectedJson(file)).toEqual(value);const before=fs.readFileSync(file);
 expect(before.toString()).not.toContain('synthetic-not-a-real-key');expect(()=>restoreIdentityRecovery(envelope,file)).toThrow('already exists');expect(fs.readFileSync(file)).toEqual(before);
}));
it.each(['{}','{"version":1','{"version":1,"protection":"windows-dpapi-current-user","payload":"plaintext"}'])('rejects incomplete or plaintext recovery without writing',envelope=>fixture(file=>{
 expect(()=>restoreIdentityRecovery(envelope,file)).toThrow('rejected');expect(fs.existsSync(file)).toBe(false);
}));
it.runIf(process.platform==='win32')('wrong account/unprotect failure and tampering reject without leaking or writing',()=>fixture(file=>{
 const envelope=encodeIdentityRecovery({chainType:'evm',createdAt:'2026-10-06',privateKey:'synthetic-only'});
 vi.mocked(childProcess.execFileSync).mockImplementationOnce(()=>{throw Error('synthetic secret or account unavailable');});
 expect(()=>restoreIdentityRecovery(envelope,file)).toThrow(/^Identity recovery rejected$/);expect(fs.existsSync(file)).toBe(false);
 const parsed=JSON.parse(envelope);parsed.payload=parsed.payload.slice(0,-12)+'AAAAAAAAAAAA';
 expect(()=>restoreIdentityRecovery(JSON.stringify(parsed),file)).toThrow(/^Identity recovery rejected$/);expect(fs.existsSync(file)).toBe(false);
}));
it.runIf(process.platform==='win32')('interrupted restore write leaves no plaintext or partial destination',()=>fixture(file=>{
 const envelope=encodeIdentityRecovery({chainType:'evm',createdAt:'2026-10-06',privateKey:'synthetic-interrupted-only'});
 const real=vi.mocked(childProcess.execFileSync).getMockImplementation()!;let injected=false;
 vi.mocked(childProcess.execFileSync).mockImplementation(((command:string,args:string[],options:object)=>{
  const changed=args.map(arg=>{if(!arg.includes('$stream.Flush($true);'))return arg;injected=true;return arg.replace('$stream.Flush($true);',"$stream.Flush($true);throw 'synthetic interruption';");});
  return real(command,changed,options);
 }) as typeof childProcess.execFileSync);
 expect(()=>restoreIdentityRecovery(envelope,file)).toThrow('write failed');expect(injected).toBe(true);
 expect(fs.existsSync(file)).toBe(false);expect(fs.readdirSync(path.dirname(file))).toEqual([]);
}),30000);
