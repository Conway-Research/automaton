import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {writeProtectedJson,readProtectedJson} from '../security/protected-json.js';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate:()=>boolean,timeout=20000){
 const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await delay(25);}throw Error('Synthetic controller test timed out');
}
function alive(pid:number){try{process.kill(pid,0);return true;}catch{return false;}}

it.runIf(process.platform==='win32')('preserves safe retry after actual controller death at the staged-write boundary',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-controller-crash-'));
 const file=path.join(dir,'config.json'),controller=path.join(dir,'controller.mjs');
 fs.writeFileSync(file,'{"name":"original"}');
 const moduleUrl=pathToFileURL(path.resolve('src/security/protected-json.ts')).href;
 // Instrument the real fixed writer with a bounded barrier, only in this test.
 const barrier="$stream.Flush($true);[IO.File]::WriteAllText(($r.path+'.ready'),[string]$PID);$deadline=[DateTime]::UtcNow.AddSeconds(10);while(-not [IO.File]::Exists($r.path+'.release')){if([DateTime]::UtcNow -gt $deadline){throw 'Synthetic barrier expired'};[Threading.Thread]::Sleep(25)};";
 fs.writeFileSync(controller,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
 const real=cp.execFileSync;cp.execFileSync=(cmd,args,opts)=>real(cmd,args.map(a=>a.replace('$stream.Flush($true);',${JSON.stringify(barrier)})),opts);syncBuiltinESMExports();
 const {writeProtectedJson}=await import(${JSON.stringify(moduleUrl)});writeProtectedJson(process.argv[2],{name:'controller-result'});`);
 const tsx=pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href;
 const child=spawn(process.execPath,['--import',tsx,controller,file],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let syntheticError='';child.stderr?.on('data',chunk=>{syntheticError=(syntheticError+String(chunk)).slice(0,8192);});
 let exited=false,writerPid:number|undefined;const exit=new Promise<void>(resolve=>child.once('exit',()=>{exited=true;resolve();}));
 try{
  await until(()=>fs.existsSync(file+'.ready')||exited);
  expect(exited,syntheticError).toBe(false);writerPid=Number(fs.readFileSync(file+'.ready','utf8'));
  expect(Number.isSafeInteger(writerPid)&&writerPid>0).toBe(true);
  expect(child.kill('SIGKILL')).toBe(true);await exit;
  const writerSurvived=alive(writerPid);
  console.info(`Synthetic controller termination: writer ${writerSurvived?'survived':'also terminated'}`);
  if(writerSurvived){
   expect(()=>writeProtectedJson(file,{name:'premature-retry'})).toThrow('write failed');
   expect(readProtectedJson(file)).toEqual({name:'original'});
   fs.writeFileSync(file+'.release','release');
   await until(()=>!alive(writerPid!));
   expect(readProtectedJson(file)).toEqual({name:'controller-result'});
  }else{
   expect(readProtectedJson(file)).toEqual({name:'original'});
   expect(fs.readdirSync(dir).filter(name=>name.includes('.pending-'))).toHaveLength(1);
  }
  // Process exit can precede Windows DeleteOnClose handle cleanup. Await the
  // actual release with a deadline; never delete the lock to make retry pass.
  await until(()=>!fs.existsSync(file+'.obolus-write-lock'),10000);
  expect(fs.existsSync(file+'.obolus-write-lock')).toBe(false);
  writeProtectedJson(file,{name:'verified-retry'});
  expect(readProtectedJson(file)).toEqual({name:'verified-retry'});
 }finally{
  fs.writeFileSync(file+'.release','release');
  if(!exited){child.kill('SIGKILL');await exit;}
  if(writerPid)await until(()=>!alive(writerPid!),15000);
  // Windows can release the terminated writer's file handle after process exit.
  // Bound cleanup retries; all crash/retry assertions above remain mandatory.
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
},45000);
