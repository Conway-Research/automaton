import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';
import {mkdtempSync,writeFileSync,rmSync,linkSync,mkdirSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {transformProtectedJson,readProtectedJson,serializeProtectedJson} from '../security/protected-json.js';
import {isProtectedFile} from '../self-mod/code.js';
afterEach(()=>vi.restoreAllMocks());
it.runIf(process.platform==='win32').each(['obolus-dpapi:v1:','obolus-dpapi:v1:CORRUPTED'])('rejects invalid pre-encrypted replacement: %s',apiKey=>{
 expect(()=>transformProtectedJson({apiKey},'protect')).toThrow('Protected credential operation failed');
});
it.runIf(process.platform==='win32')('validates and preserves existing ciphertext when protecting mixed input',()=>{
 const encrypted=transformProtectedJson({apiKey:'synthetic-existing-7262'},'protect');
 const mixed={...encrypted,nested:{password:'synthetic-new-7262'}};
 const result=transformProtectedJson(mixed,'protect');
 expect(result.apiKey).toBe(encrypted.apiKey);
 expect(transformProtectedJson(result,'unprotect')).toEqual({apiKey:'synthetic-existing-7262',nested:{password:'synthetic-new-7262'}});
},30000);
it.each(['apiKey','nested'])('rejects plaintext contradicting a declared protection policy: %s',field=>{
 const dir=mkdtempSync(join(tmpdir(),'obolus-policy-conflict-')),file=join(dir,'config.json');
 const payload=field==='nested'?{nested:{password:'synthetic-policy-secret'}}:{apiKey:'synthetic-policy-secret'};
 const bytes=JSON.stringify({...payload,__obolusCredentialProtection:'windows-dpapi-v1'});
 try{
  writeFileSync(file,bytes);
  expect(()=>readProtectedJson(file)).toThrow('Credential protection policy mismatch');
  expect(()=>serializeProtectedJson(file,{apiKey:'replacement'})).toThrow('Credential protection policy mismatch');
  expect(readFileSync(file,'utf8')).toBe(bytes);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it.runIf(process.platform==='win32').each([
 '\\\\server.invalid\\share\\config.json',
 '//server.invalid/share/config.json',
 '\\\\?\\C:\\private\\config.json',
 'C:config.json',
 'C:\\private\\config.json:secret',
 'C:\\private\\NUL.json',
 'C:\\private\\config.json. ',
 'C:\\private\\config\u0000.json',
])('rejects unsafe Windows credential path before filesystem access: %s',file=>{
 const stat=vi.spyOn(fs,'lstatSync').mockImplementation(()=>{throw Error('Unexpected filesystem access');});
 expect(()=>readProtectedJson(file)).toThrow('Unsafe protected configuration path');
 expect(()=>serializeProtectedJson(file,{})).toThrow('Unsafe protected configuration path');
 expect(stat).not.toHaveBeenCalled();
});
it('rejects hard-linked credential files without changing either path',()=>{
 const dir=mkdtempSync(join(tmpdir(),'obolus-linked-secret-')),file=join(dir,'config.json'),alias=join(dir,'alias.json');
 try{
  const bytes=JSON.stringify({apiKey:'synthetic-linked-7262'});writeFileSync(file,bytes);linkSync(file,alias);
  expect(()=>readProtectedJson(alias)).toThrow('Unsafe protected configuration path');
  expect(()=>serializeProtectedJson(alias,{apiKey:'replacement'})).toThrow('Unsafe protected configuration path');
  expect(readFileSync(file,'utf8')).toBe(bytes);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('rejects directory junctions in the credential path',()=>{
 const dir=mkdtempSync(join(tmpdir(),'obolus-junction-secret-')),target=join(dir,'target'),alias=join(dir,'alias');
 try{
  mkdirSync(target);writeFileSync(join(target,'config.json'),'{}');symlinkSync(target,alias,'junction');
  expect(()=>readProtectedJson(join(alias,'config.json'))).toThrow('Unsafe protected configuration path');
  expect(()=>serializeProtectedJson(join(alias,'config.json'),{})).toThrow('Unsafe protected configuration path');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('protects the credential loader from agent self-modification',()=>{
 for(const ext of ['ts','js','d.ts'])expect(isProtectedFile(`src/security/protected-json.${ext}`)).toBe(true);
});
it('preserves legacy plaintext and nonsecret data when reading',()=>{
 const input={apiKey:'synthetic-legacy-123',genesisPrompt:'Full directive',budget:0};
 expect(transformProtectedJson(input,'unprotect')).toEqual(input);
});
it('rejects unknown protected versions without leaking credential content',()=>{
 expect(()=>transformProtectedJson({apiKey:'obolus-dpapi:v99:synthetic'},'unprotect')).toThrow('Unsupported protected');
});
it('bounds malicious nesting',()=>{
 let v:Record<string,unknown>={};for(let i=0;i<70;i++)v={child:v};
 expect(()=>transformProtectedJson(v,'protect')).toThrow('nesting limit');
});
it('refuses saving over an unsupported protected credential instead of downgrading to plaintext',()=>{
 const dir=mkdtempSync(join(tmpdir(),'obolus-protected-version-')),file=join(dir,'config.json');
 try{
  writeFileSync(file,JSON.stringify({apiKey:'obolus-dpapi:v99:unsupported'}));
  expect(()=>serializeProtectedJson(file,{apiKey:'synthetic-replacement-7262'})).toThrow('Unsupported protected');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it.runIf(process.platform==='win32')('preserves Unicode credentials across the PowerShell pipe',()=>{
 const input={password:'synthetic-Äö-日本-🔐-7262'};
 expect(transformProtectedJson(transformProtectedJson(input,'protect'),'unprotect')).toEqual(input);
},30000);
it.runIf(process.platform==='win32')('retains protection after all credentials are cleared and later replaced',()=>{
 const dir=mkdtempSync(join(tmpdir(),'obolus-protection-lifecycle-')),file=join(dir,'config.json');
 try{
  writeFileSync(file,JSON.stringify(transformProtectedJson({apiKey:'synthetic-old-7262'},'protect')));
  writeFileSync(file,serializeProtectedJson(file,{apiKey:'',genesisPrompt:'unchanged'}));
  expect(readProtectedJson(file)).toEqual({apiKey:'',genesisPrompt:'unchanged'});
  const saved=serializeProtectedJson(file,{apiKey:'synthetic-new-7262',genesisPrompt:'unchanged'});
  expect(saved).not.toContain('synthetic-new-7262');
  writeFileSync(file,saved);
  expect(readProtectedJson(file)).toEqual({apiKey:'synthetic-new-7262',genesisPrompt:'unchanged'});
 }finally{rmSync(dir,{recursive:true,force:true});}
},30000);
it.runIf(process.platform==='win32')('roundtrips synthetic secrets, rejects corruption and preserves protection on saves',()=>{
 const dir=mkdtempSync(join(tmpdir(),'obolus-protected-test-')),file=join(dir,'config.json');
 const input={openaiApiKey:'synthetic-openai-7262',nested:{privateKey:'synthetic-wallet-7262'},genesisPrompt:'Unchanged full directive',budgets:{daily:0}};
 try{
  const encrypted=transformProtectedJson(input,'protect');
  expect(encrypted.openaiApiKey).toMatch(/^obolus-dpapi:v1:/);
  expect(JSON.stringify(encrypted)).not.toContain('synthetic-openai-7262');
  expect(encrypted.genesisPrompt).toBe(input.genesisPrompt);
  expect(encrypted.budgets).toEqual(input.budgets);
  expect(transformProtectedJson(encrypted,'unprotect')).toEqual(input);
  writeFileSync(file,JSON.stringify(encrypted));
  expect(readProtectedJson(file)).toEqual(input);
  const saved=serializeProtectedJson(file,{...input,genesisPrompt:'Next directive'});
  expect(saved).not.toContain(input.openaiApiKey);
  expect(transformProtectedJson(JSON.parse(saved),'unprotect').genesisPrompt).toBe('Next directive');
  expect(()=>transformProtectedJson({apiKey:'obolus-dpapi:v1:CORRUPTED'},'unprotect')).toThrow('Protected credential operation failed');
 }finally{rmSync(dir,{recursive:true,force:true});}
},30000);
