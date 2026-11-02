import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {hasRequiredBinary} from '../skills/requirements.js';
const dirs:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-binary-'));dirs.push(dir);vi.stubEnv('PATH',dir);vi.stubEnv('PATHEXT','.EXE;.CMD');return dir;}

it('recognizes a binary fixture through PATH without executing its contents',()=>{
 const dir=fixture(),suffix=process.platform==='win32'?'.CMD':'';
 fs.writeFileSync(path.join(dir,'fixture'+suffix),'not an executable program',{mode:0o700});
 expect(hasRequiredBinary('fixture')).toBe(true);
 expect(hasRequiredBinary('missing')).toBe(false);
 fs.mkdirSync(path.join(dir,'directory'+suffix));expect(hasRequiredBinary('directory')).toBe(false);
 if(process.platform==='win32'){fs.writeFileSync(path.join(dir,'document.txt'),'text');expect(hasRequiredBinary('document.txt')).toBe(false);}
});

it('rejects injected names and implicit working-directory searches',()=>{
 fixture();for(const name of ['../node','node;echo bad','node.exe & echo bad','.','..','a/b','a\\b'])expect(hasRequiredBinary(name)).toBe(false);
 vi.stubEnv('PATH','.'+path.delimiter+'');expect(hasRequiredBinary('fixture')).toBe(false);
});

it('fails closed when the search list exceeds its bounded capacity',()=>{
 const dir=fixture();vi.stubEnv('PATH',Array(257).fill(dir).join(path.delimiter));
 expect(hasRequiredBinary('fixture')).toBe(false);
});
