import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const mock=vi.hoisted(()=>({exec:vi.fn()}));
vi.mock('child_process',()=>({execFileSync:mock.exec}));
import {installSkillFromGit,installSkillFromUrl,recoverDownloadedSkill} from '../skills/registry.js';
import {loadSkills} from '../skills/loader.js';
import {getRepoInfo,getUpstreamDiffs} from '../self-mod/upstream.js';
import {maintenanceProcessEnvironment,gitMaintenanceEnvironment,maintenanceExecutable,withMaintenanceDirectory} from '../self-mod/process-environment.js';
import type {AutomatonDatabase,ConwayClient} from '../types.js';
const dirs:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();mock.exec.mockReset();for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-process-'));dirs.push(dir);return dir;}
const db={} as AutomatonDatabase,client={} as ConwayClient;

it('rejects credential-bearing download URLs without spawning or disclosing the URL',async()=>{
 const root=fixture();
 for(const install of [installSkillFromGit,installSkillFromUrl])for(const url of ['https://user:SECRET@example.invalid/a','https://example.invalid/a?token=SECRET','https://example.invalid/a#SECRET']){
  try{await install(url,'fixture',root,db,client);throw Error('Unexpected success');}catch(e){expect(String(e)).toMatch(/Invalid (repo )?URL/);expect(String(e)).not.toContain('SECRET');}
 }
 expect(mock.exec).not.toHaveBeenCalled();expect(fs.readdirSync(root)).toEqual([]);
});

it('withholds stderr and command content from failed Git and curl processes',async()=>{
 vi.stubEnv('OPENAI_API_KEY','SYNTHETIC_SECRET');vi.stubEnv('NODE_OPTIONS','SYNTHETIC_SECRET');
 const root=fixture();mock.exec.mockImplementation(()=>{throw Error('SYNTHETIC_SECRET stderr command');});
 for(const install of [installSkillFromGit,installSkillFromUrl])await expect(install('https://example.invalid/public','fixture',root,db,client)).rejects.toThrow('process details withheld');
 expect(()=>getRepoInfo()).toThrow('process details withheld');
 for(const call of mock.exec.mock.calls){expect(call[2]).toMatchObject({maxBuffer:1_048_576,windowsHide:true});expect(call[2].env.OPENAI_API_KEY).toBeUndefined();expect(call[2].env.NODE_OPTIONS).toBeUndefined();expect(call[2].env.GIT_CONFIG_NOSYSTEM).toBe('1');}
 for(const call of mock.exec.mock.calls.slice(0,2)){expect(call[2].cwd).not.toBe(process.cwd());expect(fs.existsSync(call[2].cwd)).toBe(false);}
 expect(mock.exec.mock.calls.find(call=>/curl(?:\.exe)?$/i.test(call[0]))?.[1][0]).toBe('-q');
 expect(mock.exec.mock.calls.find(call=>/curl(?:\.exe)?$/i.test(call[0]))?.[1]).toEqual(expect.arrayContaining(['--proto','=http,https','--proto-redir','--max-filesize','1048576','--max-redirs','3']));
});

it('overrides executable Git helpers and transport policies without inheriting injected settings',()=>{
 const env=gitMaintenanceEnvironment({GIT_CONFIG_COUNT:'999',GIT_CONFIG_KEY_0:'bad',GIT_CONFIG_VALUE_0:'bad'});
 const config=Object.fromEntries(Array.from({length:Number(env.GIT_CONFIG_COUNT)},(_,i)=>[env[`GIT_CONFIG_KEY_${i}`],env[`GIT_CONFIG_VALUE_${i}`]]));
 expect(config).toMatchObject({'credential.helper':'','core.hooksPath':process.platform==='win32'?'NUL':os.devNull,'core.fsmonitor':'false','protocol.allow':'never','protocol.http.allow':'always','protocol.https.allow':'always','http.followRedirects':'false','http.extraHeader':''});
 expect(JSON.stringify(env)).not.toContain('bad');
});

it('extracts only SKILL.md without checkout or executing repository content',async()=>{
 const root=fixture(),target=path.join(root,'fixture'),upsertSkill=vi.fn();
 mock.exec.mockImplementationOnce((_exe,args,options)=>{expect(args).toContain('--no-checkout');expect(fs.readdirSync(options.cwd)).toEqual([]);expect(options.env.GIT_CEILING_DIRECTORIES).toBe(options.cwd);fs.mkdirSync(args.at(-1));return '';}).mockReturnValueOnce('# Harmless fixture');
 const result=await installSkillFromGit('https://example.invalid/public','fixture',root,{upsertSkill,getSkillByName:()=>undefined} as unknown as AutomatonDatabase,client);
 expect(result?.instructions).toBe('# Harmless fixture');expect(fs.readdirSync(target)).toEqual(['SKILL.md']);
 expect(mock.exec.mock.calls[1][1]).toEqual(['show','HEAD:SKILL.md']);expect(upsertSkill).toHaveBeenCalledOnce();
});

it('cleans only the fresh maintenance directory after success and failure',()=>{
 const root=fixture();const sentinel=path.join(root,'keep');fs.writeFileSync(sentinel,'preserved');
 const visited:string[]=[];
 const result=withMaintenanceDirectory(dir=>{visited.push(dir);fs.writeFileSync(path.join(dir,'temporary'),'test');return 7;});expect(result).toBe(7);
 expect(()=>withMaintenanceDirectory(dir=>{visited.push(dir);fs.mkdirSync(path.join(dir,'nested'));throw Error('mock failure');})).toThrow('mock failure');
 expect(new Set(visited).size).toBe(2);for(const dir of visited)expect(fs.existsSync(dir)).toBe(false);
 expect(fs.readFileSync(sentinel,'utf8')).toBe('preserved');
});

it('allowlists only maintenance environment variables and ignores injected Git/proxy configuration',()=>{
 const source={Path:'fixture-path',SystemRoot:'fixture-system',TEMP:'fixture-temp',HOME:'private-home',USERPROFILE:'private-profile',AWS_SECRET_ACCESS_KEY:'secret',HTTPS_PROXY:'secret',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.sshCommand',GIT_CONFIG_VALUE_0:'bad',GIT_SSH_COMMAND:'bad',LD_PRELOAD:'bad'};
 const env=maintenanceProcessEnvironment(source);
 expect(env.Path).toBeUndefined();expect(env.PATH).not.toContain('fixture-path');expect(env.SystemRoot).toBe('fixture-system');expect(env.TEMP).toBe('fixture-temp');
 for(const key of Object.keys(source).slice(3))expect(env[key]).toBeUndefined();
 expect(env.GIT_CONFIG_GLOBAL).toBe(process.platform==='win32'?'NUL':os.devNull);expect(env.GIT_CONFIG_SYSTEM).toBe(process.platform==='win32'?'NUL':os.devNull);expect(env.GIT_TERMINAL_PROMPT).toBe('0');
});

it('redacts origin credentials and query strings and disables external diff helpers',()=>{
 mock.exec.mockReturnValueOnce('https://user:SECRET@example.invalid/repo?token=SECRET').mockReturnValueOnce('main').mockReturnValueOnce('abc title');
 expect(getRepoInfo().originUrl).toBe('https://example.invalid/repo');
 mock.exec.mockReturnValueOnce('abcdef Author|||Title').mockReturnValueOnce('diff fixture');
 expect(getUpstreamDiffs()[0].diff).toBe('diff fixture');
 expect(mock.exec.mock.calls.at(-1)?.[1]).toEqual(['diff','--no-ext-diff','--no-textconv','abcdef~1..abcdef']);
});

it('does not select shadow executables from PATH or the project directory',()=>{
 const root=fixture();vi.stubEnv('PATH',root);
 fs.writeFileSync(path.join(root,process.platform==='win32'?'git.exe':'git'),'not a real program');
 const executable=maintenanceExecutable('git');expect(path.isAbsolute(executable)).toBe(true);expect(executable).not.toContain(root);
 expect(maintenanceProcessEnvironment().PATH).not.toContain(root);
});

it('fails closed without probing PATH when accepted executables are unavailable',()=>{
 const probe=vi.spyOn(fs,'lstatSync').mockImplementation(()=>{throw Error('missing');});
 try{expect(()=>maintenanceExecutable('git')).toThrow('accepted installation paths');expect(probe.mock.calls.every(([file])=>path.isAbsolute(String(file)))).toBe(true);}
 finally{probe.mockRestore();}
});

it('stages URL downloads and preserves an existing installation on repeated attempts',async()=>{
 const root=fixture(),target=path.join(root,'fixture'),upsertSkill=vi.fn();let stage='';
 mock.exec.mockImplementation((_exe,args,options)=>{stage=options.cwd;expect(fs.existsSync(target)).toBe(false);fs.writeFileSync(args[args.indexOf('-o')+1],'# Harmless fixture');return '';});
 const store={upsertSkill,getSkillByName:()=>undefined} as unknown as AutomatonDatabase;
 await installSkillFromUrl('https://example.invalid/public','fixture',root,store,client);
 expect(fs.existsSync(stage)).toBe(false);expect(fs.readFileSync(path.join(target,'SKILL.md'),'utf8')).toBe('# Harmless fixture');
 await expect(installSkillFromUrl('https://example.invalid/public','fixture',root,store,client)).rejects.toThrow('already exists');
 expect(mock.exec).toHaveBeenCalledOnce();expect(upsertSkill).toHaveBeenCalledOnce();
});

it('does not publish partial or invalid downloaded documents',async()=>{
 const root=fixture(),upsertSkill=vi.fn(),store={upsertSkill,getSkillByName:()=>undefined} as unknown as AutomatonDatabase;
 for(const fails of [true,false]){
  let stage='';mock.exec.mockImplementation((_exe,args,options)=>{stage=options.cwd;fs.writeFileSync(args[args.indexOf('-o')+1],'---\nunterminated');if(fails)throw Error('network failure');return '';});
  await expect(installSkillFromUrl('https://example.invalid/public','fixture',root,store,client)).rejects.toThrow();
  expect(fs.existsSync(stage)).toBe(false);expect(fs.existsSync(path.join(root,'fixture'))).toBe(false);
 }
 expect(upsertSkill).not.toHaveBeenCalled();
});

it('quarantines a failed registration and recovers the intact installation without a download',async()=>{
 const root=fixture(),target=path.join(root,'fixture');let registered:any;
 const store={getSkillByName:()=>registered,getSkills:()=>registered?[registered]:[],upsertSkill:vi.fn(()=>{throw Error('database unavailable');})} as unknown as AutomatonDatabase;
 mock.exec.mockImplementation((_exe,args)=>{fs.writeFileSync(args[args.indexOf('-o')+1],'# Harmless fixture');return '';});
 await expect(installSkillFromUrl('https://example.invalid/public','fixture',root,store,client)).rejects.toThrow('database unavailable');
 expect(fs.existsSync(path.join(target,'.install-pending.json'))).toBe(true);expect(loadSkills(root,store)).toEqual([]);
 (store.upsertSkill as ReturnType<typeof vi.fn>).mockImplementation(skill=>{registered=skill;});
 const recovered=recoverDownloadedSkill('fixture',root,store);expect(recovered.instructions).toBe('# Harmless fixture');
 expect(fs.existsSync(path.join(target,'.install-pending.json'))).toBe(false);expect(mock.exec).toHaveBeenCalledOnce();
});

it('refuses recovery of changed bytes and keeps them quarantined',async()=>{
 const root=fixture(),store={getSkillByName:()=>undefined,getSkills:()=>[],upsertSkill:vi.fn(()=>{throw Error('database unavailable');})} as unknown as AutomatonDatabase;
 mock.exec.mockImplementation((_exe,args)=>{fs.writeFileSync(args[args.indexOf('-o')+1],'# Harmless fixture');return '';});
 await expect(installSkillFromUrl('https://example.invalid/public','fixture',root,store,client)).rejects.toThrow();
 fs.writeFileSync(path.join(root,'fixture','SKILL.md'),'changed');
 expect(()=>recoverDownloadedSkill('fixture',root,store)).toThrow('inconsistent');
 expect(loadSkills(root,store)).toEqual([]);expect(fs.readFileSync(path.join(root,'fixture','SKILL.md'),'utf8')).toBe('changed');
});

it('keeps a committed but unfinished registration hidden and preserves its disabled state on recovery',async()=>{
 const root=fixture();let registered:any;
 const store={getSkillByName:()=>registered,getSkills:()=>registered?[registered]:[],upsertSkill:vi.fn(skill=>{registered={...skill,enabled:false};throw Error('interrupted after commit');})} as unknown as AutomatonDatabase;
 mock.exec.mockImplementation((_exe,args)=>{fs.writeFileSync(args[args.indexOf('-o')+1],'# Harmless fixture');return '';});
 await expect(installSkillFromUrl('https://example.invalid/public','fixture',root,store,client)).rejects.toThrow();
 expect(loadSkills(root,store)).toEqual([]);
 expect(recoverDownloadedSkill('fixture',root,store).enabled).toBe(false);
 expect(store.upsertSkill).toHaveBeenCalledOnce();expect(mock.exec).toHaveBeenCalledOnce();
});
