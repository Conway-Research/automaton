import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {confineWritePath} from '../agent/write-path.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';
const dirs:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-write-'));dirs.push(dir);const home=path.join(dir,'home');fs.mkdirSync(home);vi.stubEnv('HOME',home);return {dir,home};}

it('writes only inside the local home through the actual tool and retains protected-file checks',async()=>{
 const {home,dir}=fixture();const writeFile=vi.fn(async(p:string,content:string)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content);});
 const ctx={conway:{isLocal:true,writeFile}} as unknown as ToolContext;
 const tool=createBuiltinTools('').find(t=>t.name==='write_file')!;
 expect(await tool.execute({path:'products/result.txt',content:'fixture'},ctx)).toContain('File written');
 expect(fs.readFileSync(path.join(home,'products/result.txt'),'utf8')).toBe('fixture');
 for(const p of ['../outside.txt',path.join(dir,'home-other','x'),'~other/x','~/.automaton/wallet.json','src/agent/write-path.ts','dist/agent/write-path.js','dist/agent/write-path.d.ts']){
  expect(await tool.execute({path:p,content:'blocked'},ctx)).toContain('Blocked');
 }
 expect(writeFile).toHaveBeenCalledTimes(1);
 expect(confineWritePath('~/products/new.txt',false)).toBe(path.join(home,'products/new.txt'));
 if(process.platform==='win32')for(const p of ['Z:\\outside.txt','C:relative.txt','\\\\server\\share\\x','file.txt:stream','NUL.txt','dir.\\file','file '])expect(confineWritePath(p,false)).toHaveProperty('error');
});

it('blocks directory junctions and hard links to files outside the home',()=>{
 const {home,dir}=fixture();const outside=path.join(dir,'outside');fs.mkdirSync(outside);
 fs.symlinkSync(outside,path.join(home,'alias'),process.platform==='win32'?'junction':'dir');
 expect(confineWritePath(path.join(home,'alias','new','file.txt'),false)).toHaveProperty('error');
 fs.writeFileSync(path.join(outside,'original.txt'),'unchanged');
 fs.linkSync(path.join(outside,'original.txt'),path.join(home,'hard.txt'));
 expect(confineWritePath(path.join(home,'hard.txt'),false)).toHaveProperty('error');
 expect(fs.readFileSync(path.join(outside,'original.txt'),'utf8')).toBe('unchanged');
});

it('keeps remote POSIX confinement independent of the local machine',()=>{
 fixture();expect(confineWritePath('~/product.txt',true)).toBe('/root/product.txt');
 expect(confineWritePath('products/result.txt',true)).toBe('/root/products/result.txt');
 for(const p of ['/root-other/file','../../etc/passwd','C:\\file','dir\\file','/root'])expect(confineWritePath(p,true)).toHaveProperty('error');
});
