import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {readMt5Account} from '../src/revenue/mt5-readonly.ts';
import {randomUUID} from 'node:crypto';
const wrapper=path.resolve(import.meta.dirname,'mt5-demo-readonly.py');
export function readDemoProfile(file){
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8000)throw Error('Demo profile unavailable');
 const p=JSON.parse(fs.readFileSync(file,'utf8'));
 if(Object.keys(p).sort().join(',')!=='executionEnabled,login,portable,requireDemo,server,terminal,version'||p.version!==1||p.portable!==true||p.requireDemo!==true||p.executionEnabled!==false||!path.isAbsolute(p.terminal??'')||path.basename(p.terminal).toLowerCase()!=='terminal64.exe'||!Number.isSafeInteger(p.login)||p.login<1||typeof p.server!=='string'||!p.server||p.server.length>150||/[\r\n\0]/.test(p.server))throw Error('Strict demo profile required');
 return p;
}
export function createDemoMt5Readers({profileFile,python,accountReader=readMt5Account,run=promisify(execFile)}){
 let pinned=null;
 const load=()=>{const p=readDemoProfile(profileFile),serialized=JSON.stringify(p);if(pinned!==null&&pinned!==serialized)throw Error('Demo profile changed; controlled restart and account storage review required');pinned??=serialized;return p;};
 const base=(p,reader)=>[wrapper,'--reader',reader,'--terminal',p.terminal,'--login',String(p.login),'--server',p.server];
 const read=async(reader,extra=[])=>{
  const readId=randomUUID(),started=performance.now();let phase='profile',code='PROFILE_UNAVAILABLE';
  let activePhase=null,phaseStarted=0,outcome='failed',maxDelay=0,nextProbe=performance.now()+1000;
  const timing=(event,measuredPhase,elapsedMs=null,phaseOutcome=null)=>{try{const target=path.join(path.dirname(profileFile),'market-read-timing.jsonl');try{if(!fs.lstatSync(target).isFile())throw Error('Invalid target');}catch(error){if(error.code!=='ENOENT')throw error;}fs.appendFileSync(target,JSON.stringify({schema:'numaron-market-read-timing-v1',at:new Date().toISOString(),pid:process.pid,readId,reader,event,phase:measuredPhase,elapsedMs,outcome:phaseOutcome,...(event==='read-end'?{eventLoopDelayMaxMs:Math.max(maxDelay,Math.max(0,performance.now()-nextProbe)),eventLoopTailDelayMs:Math.max(0,performance.now()-nextProbe)}:{})})+'\n',{mode:0o600});}catch{}};
  const probe=setInterval(()=>{const at=performance.now();maxDelay=Math.max(maxDelay,Math.max(0,at-nextProbe));nextProbe=at+1000;},1000);probe.unref?.();
  const endPhase=result=>{if(activePhase){timing('end',activePhase,Math.max(0,performance.now()-phaseStarted),result);activePhase=null;}};
  const beginPhase=name=>{endPhase('ok');activePhase=name;phaseStarted=performance.now();timing('begin',name);};
  try{
   const p=load();phase='execute';beginPhase('execute');let stdout;
   try{({stdout}=await run(python,[...base(p,reader),...extra],{timeout:45000,maxBuffer:1048576,windowsHide:true,env:{...process.env,NUMARON_MARKET_READ_ID:readId}}));}
   catch(error){code=error?.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'OUTPUT_LIMIT':error?.code==='ENOENT'?'PROCESS_NOT_FOUND':error?.code==='EACCES'?'PROCESS_ACCESS_DENIED':error?.code==='ETIMEDOUT'?'PROCESS_TIMEOUT':error?.killed===true&&['SIGTERM','SIGKILL'].includes(error?.signal)?'PROCESS_TERMINATED':'PROCESS_FAILED';throw Error('Reader failed');}
   phase='decode';beginPhase('decode');code='INVALID_JSON';const result=JSON.parse(stdout);
   phase='evidence';beginPhase('validation');code='DEMO_EVIDENCE_MISSING';
   if(!result||result.readOnly!==true||result.executionEnabled!==false||result.accountBinding?.demo!==true||result.accountBinding?.tradeMode!==0)throw Error('Read evidence missing');
   phase='profile-recheck';code='PROFILE_CHANGED';if(JSON.stringify(load())!==JSON.stringify(p))throw Error('Profile changed');outcome='ok';return result;
  }catch{
   // Only fixed labels and generated metadata: never serialize the error, argv or output.
   try{const target=path.join(path.dirname(profileFile),'market-read-errors.jsonl');try{if(!fs.lstatSync(target).isFile())throw Error('Not a regular log');}catch(error){if(error.code!=='ENOENT')throw error;}fs.appendFileSync(target,JSON.stringify({schema:'numaron-market-read-error-v1',at:new Date().toISOString(),pid:process.pid,readId,reader,phase,code,elapsedMs:Math.round(performance.now()-started)})+'\n',{mode:0o600});}catch{}
   throw Error('Demo-only MT5 reader unavailable; no fallback');
  }finally{clearInterval(probe);endPhase(outcome);timing('read-end',null,Math.max(0,performance.now()-started),outcome);}
 };
 return {
  async account(){const p=load();let result;try{result=await accountReader({python,terminal:p.terminal,script:wrapper,expectedLogin:p.login,expectedServer:p.server,expectedTradeMode:0,scriptArgs:['--server',p.server]});}catch{throw Error('Demo-only MT5 account unavailable; no fallback');}if(result.account.trade_mode!==0||result.executionEnabled!==false||JSON.stringify(load())!==JSON.stringify(p))throw Error('Demo account not confirmed');return result;},
  market({start=0,watch=[],dayWindow}={},reader='market'){
   if(!['market','trading'].includes(reader)||!Number.isSafeInteger(start)||start<0||!Array.isArray(watch)||watch.length>100||watch.some(x=>typeof x!=='string'||!/^[\w.#\[\]-]{1,80}$/.test(x)))throw Error('Invalid demo market read');
   return read(reader,['--start',String(start),...(reader==='trading'?watch.flatMap(x=>['--watch',x]):[]),...(reader==='trading'&&dayWindow?['--day-start',String(dayWindow.startsAt),'--day-end',String(dayWindow.endsAt)]:[])]);
  },
  history(symbols){if(!Array.isArray(symbols)||symbols.length>5||symbols.some(x=>typeof x!=='string'||!/^[\w.#\[\]-]{1,80}$/.test(x)))throw Error('Invalid demo history read');return read('history',['--symbols',symbols.join(',')]);}
 };
}
