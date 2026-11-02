import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {writeWorkspaceFile,listWorkspaceDirectory,MAX_WRITE_BYTES,MAX_DIRECTORY_ENTRIES,MAX_DIRECTORY_BYTES} from '../agent/write-path.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-limits-'));dirs.push(dir);return dir;}

it('checks UTF-8 bytes before writes or backend calls, preserving existing content',async()=>{
 const root=fixture(),file=path.join(root,'file.txt');fs.writeFileSync(file,'KEEP');const writeFile=vi.fn();
 const exact='é'.repeat(MAX_WRITE_BYTES/2);
 await writeWorkspaceFile({isLocal:true,writeFile},file,exact,root);expect(fs.statSync(file).size).toBe(MAX_WRITE_BYTES);
 for(const isLocal of [true,false]){
  await expect(writeWorkspaceFile({isLocal,writeFile},file,exact+'é',root)).rejects.toThrow('Blocked');
  await expect(writeWorkspaceFile({isLocal,writeFile},path.join(root,'new','file'),42 as unknown as string,root)).rejects.toThrow('Blocked');
 }
 expect(fs.readFileSync(file,'utf8')).toBe(exact);expect(fs.existsSync(path.join(root,'new'))).toBe(false);expect(writeFile).not.toHaveBeenCalled();
 const tool=createBuiltinTools('').find(t=>t.name==='write_file')!;
 expect(await tool.execute({path:'/root/test.txt',content:exact+'é'},{conway:{writeFile}} as unknown as ToolContext)).toContain('Blocked');
 expect(writeFile).not.toHaveBeenCalled();
});

it('distinguishes an exact entry limit from a truncated directory',()=>{
 const root=fixture();for(let i=0;i<MAX_DIRECTORY_ENTRIES;i++)fs.writeFileSync(path.join(root,`file-${i}`),'');
 expect(listWorkspaceDirectory(root,root)).toMatchObject({truncated:false});
 fs.writeFileSync(path.join(root,'extra'),'');const result=listWorkspaceDirectory(root,root);
 expect(result.lines).toHaveLength(MAX_DIRECTORY_ENTRIES);expect(result.truncated).toBe(true);
});

it('also bounds directory output bytes independently of entry count',()=>{
 const root=fixture();for(let i=0;i<500;i++)fs.writeFileSync(path.join(root,`${i}-`+'x'.repeat(150)),'');
 const result=listWorkspaceDirectory(root,root);expect(result.truncated).toBe(true);expect(result.lines.length).toBeLessThan(500);
 expect(Buffer.byteLength(result.lines.join('\n'),'utf8')).toBeLessThanOrEqual(MAX_DIRECTORY_BYTES);
});
