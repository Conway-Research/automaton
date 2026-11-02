import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createBuiltinTools} from '../agent/tools.js';
import {isProtectedFile} from '../self-mod/code.js';
import {readHarnessFile} from '../agent/read-path.js';
import {readLocalToolFile} from '../agent/read-path.js';
import type {ToolContext} from '../types.js';
const dirs:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
const tool=createBuiltinTools('').find(t=>t.name==='read_file')!;
function context(local:boolean){const conway={isLocal:local,readFile:vi.fn(),exec:vi.fn()};return {conway,ctx:{conway,allowedReadRoot:process.env.HOME} as unknown as ToolContext};}
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-read-'));dirs.push(dir);vi.stubEnv('HOME',dir);return dir;}
it('privacy: local reads cannot cross the trusted product root even when the target is an ordinary file',()=>{
 const dir=fixture(),a=path.join(dir,'product-a'),b=path.join(dir,'product-b');fs.mkdirSync(a);fs.mkdirSync(b);
 const file=path.join(b,'customers.txt');fs.writeFileSync(file,'synthetic-private-data');
 expect(()=>readLocalToolFile(file,a)).toThrow('Blocked');
 expect(()=>readLocalToolFile(path.join(a,'..','product-b','customers.txt'),a)).toThrow('Blocked');
});
it('security: denied remote reads never fall back to shell access',async()=>{
 const {ctx,conway}=context(false);conway.readFile.mockRejectedValue(new Error('Access denied'));
 expect(await tool.execute({path:'public.txt'},ctx)).toContain('no alternate transport');
 expect(conway.exec).not.toHaveBeenCalled();
});

it('blocks credential spellings and backup names before invoking any backend',async()=>{
 for(const local of [true,false]){
  const {ctx,conway}=context(local);
  for(const name of ['C:\\data\\WALLET.JSON','/data/Automaton.Json.bak','/data/.ENV.local','/data/secret.PEM','/data/private-key-copy','wallet.json:stream','wallet.json. ','config.json.backup','bad\0name']){
   expect(await tool.execute({path:name},ctx)).toContain('Blocked');
  }
  expect(conway.readFile).not.toHaveBeenCalled();expect(conway.exec).not.toHaveBeenCalled();
 }
});

it('reads bounded regular local files and never shells out for failed or oversized reads',async()=>{
 const dir=fixture(),{ctx,conway}=context(true);
 fs.writeFileSync(path.join(dir,'readme.txt'),'ordinary fixture');
 expect(await tool.execute({path:'~/readme.txt'},ctx)).toBe('ordinary fixture');
 fs.writeFileSync(path.join(dir,'large.txt'),Buffer.alloc(1_048_577));
 for(const p of ['~/large.txt','~/missing.txt',dir])expect(await tool.execute({path:p},ctx)).toContain('Blocked');
 if(process.platform==='win32')for(const p of ['NUL','C:relative.txt','\\\\server\\share\\file','~/readme.txt:stream','~/readme.txt.'])expect(await tool.execute({path:p},ctx)).toContain('Blocked');
 expect(conway.readFile).not.toHaveBeenCalled();expect(conway.exec).not.toHaveBeenCalled();
 for(const suffix of ['ts','js','d.ts'])expect(isProtectedFile('src/agent/read-path.'+suffix)).toBe(true);
});

it('blocks local junction and hardlink aliases to synthetic credentials',async()=>{
 const dir=fixture(),{ctx,conway}=context(true),privateDir=path.join(dir,'private');fs.mkdirSync(privateDir);
 fs.writeFileSync(path.join(privateDir,'wallet.json'),'SYNTHETIC_SECRET');
 fs.symlinkSync(privateDir,path.join(dir,'linked'),process.platform==='win32'?'junction':'dir');
 fs.writeFileSync(path.join(privateDir,'ordinary.txt'),'SYNTHETIC_SECRET');
 fs.linkSync(path.join(privateDir,'wallet.json'),path.join(dir,'innocent.txt'));
 for(const p of ['~/linked/ordinary.txt','~/innocent.txt']){
  const result=await tool.execute({path:p},ctx);expect(result).toContain('Blocked');expect(result).not.toContain('SYNTHETIC_SECRET');
 }
 expect(conway.exec).not.toHaveBeenCalled();
});

it('shares local alias rejection and sensitive-name checks with worker reads',async()=>{
 const dir=fixture();fs.writeFileSync(path.join(dir,'wallet.json'),'SYNTHETIC_SECRET');
 fs.linkSync(path.join(dir,'wallet.json'),path.join(dir,'safe.txt'));
 const readFile=vi.fn(async()=> 'must not be called');
 await expect(readHarnessFile({isLocal:true,readFile},path.join(dir,'safe.txt'))).rejects.toThrow();
 for(const isLocal of [true,false])await expect(readHarnessFile({isLocal,readFile},'C:\\data\\WALLET.JSON.bak')).rejects.toThrow('Blocked');
 expect(readFile).not.toHaveBeenCalled();
});
