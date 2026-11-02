/** Independent acceptance run for a two-system sync against in-memory fakes. No socket, no provider, real time only
 * as a wall limit. The fakes inject page and record faults, a lost response after commit and a process crash;
 * only the effects recorded by the fake target decide the outcome, never the report of the sync itself. */
const never=()=>new Promise(()=>{});
const failure=(message,extra={})=>Object.assign(Error(message),extra);
const kind=f=>typeof f==='string'?f:f?.kind;
/** The secret counts as leaked in its common encodings too. */
/** The encoded secret at each byte alignment, so a prefix like user: cannot hide it. */
const encodedForms=secret=>[0,1,2].flatMap(pad=>{const bytes=Buffer.concat([Buffer.alloc(pad),Buffer.from(secret)]),skip=Math.ceil(pad*4/3);return ['base64','base64url'].map(kind=>{const text=bytes.toString(kind).replace(/=+$/,'');return text.slice(skip,text.length-2);});});
const leaks=(text,secret)=>{const s=String(text);return s.includes(secret)||s.includes(encodeURIComponent(secret))||s.toLowerCase().includes(Buffer.from(secret).toString('hex'))||encodedForms(secret).some(form=>s.includes(form));};
const printable=x=>{if(typeof x==='string')return x;try{return JSON.stringify(x)??String(x);}catch{return String(x);}};
export async function runInterfaceScenario(sync,scenario){
 const {records,pageSize=2,allowedFields,secret,maxAttempts=4,sourceFaults={},targetFaults={},permanent=[],crashAfterEffects,redeliver=0,wallLimitMs=2000,authRequired=false}=scenario??{};
 if(typeof sync!=='function'||!Array.isArray(records)||!records.length||new Set(records.map(r=>r?.id)).size!==records.length||!Array.isArray(allowedFields)||!allowedFields.length||typeof secret!=='string'||!secret||!Number.isSafeInteger(pageSize)||pageSize<1)throw Error('Invalid interface scenario');
 const issues=new Map(),issue=(code,detail={})=>issues.set(JSON.stringify([code,detail.recordId??null]),{code,...detail});
 const byId=new Map(records.map(r=>[r.id,r])),firing=new Map(),keys=new Map(),effects=[],pages=Math.ceil(records.length/pageSize);
 const fired=new Set(),fire=(table,subject)=>{const n=(firing.get(subject)??0)+1,key=`${subject}:${n}`;firing.set(subject,n);if(Object.prototype.hasOwnProperty.call(table,key))fired.add(key);return table[key];};
 const authorized=token=>{if(authRequired&&token!==secret){issue('auth-missing');throw failure('Unauthorized',{permanent:true,status:401});}};
 let now=0,blockedUntil=0,crashArmed=Number.isSafeInteger(crashAfterEffects);
 const runOnce=async stored=>{
  let dead=false,settleCrash;const attempts=new Map(),logs=[],crash=new Promise(r=>{settleCrash=r;});
  const enter=subject=>{
   const n=(attempts.get(subject)??0)+1;attempts.set(subject,n);
   if(n>maxAttempts)issue('retry-unbounded',{subject});
   return !dead&&n<=maxAttempts*2;
  };
  const hang=signal=>signal?new Promise((_,reject)=>{const stop=()=>reject(failure('timeout',{timeout:true}));if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});}):never();
  const raise=(fault,signal)=>{
   const k=kind(fault);
   if(k==='hang')return hang(signal);
   if(k==='rate-limit'){blockedUntil=now+(fault.retryAfterMs??1000);throw failure('rate limited',{status:429,retryAfterMs:fault.retryAfterMs??1000});}
   throw failure(k==='server-error'?'server error':'timeout',k==='server-error'?{status:503}:{timeout:true});
  };
  const source={async list(args={}){
   const {cursor=null,signal,token}=args;
   const {token:_t,signal:_s,...sent}=args;if(leaks(printable(sent),secret))issue('secret-leaked',{where:'request'});
   const subject=String(cursor);if(!enter('list:'+subject))return never();
   authorized(token);
   const index=cursor===null?0:/^p\d+$/.test(cursor)?Number(cursor.slice(1)):-1;
   if(index<0||index>=pages)throw failure('Invalid cursor',{permanent:true,status:400});
   const fault=fire(sourceFaults,subject);if(fault)await raise(fault,signal);
   const start=index*pageSize;
   return {items:records.slice(start,start+pageSize).map(r=>({...r})),nextCursor:index+1<pages?'p'+(index+1):null};
  }};
  const target={async apply(args={}){
   const {idempotencyKey,record,signal,token}=args;
   const {token:_t,signal:_s,record:_r,idempotencyKey:_k,...sent}=args;if(leaks(printable(sent),secret))issue('secret-leaked',{where:'request'});
   const id=record?.id;if(!enter('apply:'+id))return never();
   authorized(token);
   for(const field of Object.keys(record??{}))if(!allowedFields.includes(field))issue('field-outside-contract',{recordId:id,field});
   if(leaks(JSON.stringify(record??null),secret))issue('secret-leaked',{where:'payload'});
   if(idempotencyKey!==undefined&&leaks(idempotencyKey,secret))issue('secret-leaked',{where:'idempotency-key'});
   const known=byId.get(id);if(!known)throw failure('Unknown record',{permanent:true,status:422});
   if(allowedFields.some(f=>Object.prototype.hasOwnProperty.call(record,f)&&record[f]!==known[f]))issue('record-altered',{recordId:id});
   if(allowedFields.some(f=>Object.prototype.hasOwnProperty.call(known,f)&&!Object.prototype.hasOwnProperty.call(record,f)))issue('field-dropped',{recordId:id});
   if(now<blockedUntil){issue('limit-ignored',{recordId:id});throw failure('rate limited',{status:429,retryAfterMs:blockedUntil-now});}
   if(permanent.includes(id))throw failure('Rejected by target',{permanent:true,status:422});
   const fault=fire(targetFaults,id),k=kind(fault);
   if(fault&&k!=='timeout-after-commit')await raise(fault,signal);
   if(idempotencyKey!==undefined&&keys.has(idempotencyKey)){
    const prior=keys.get(idempotencyKey);if(prior.recordId!==id)issue('idempotency-key-reused',{recordId:id});
    return {ok:true,replayed:true,effect:prior.effect};
   }
   effects.push(id);const effect=effects.length;if(idempotencyKey!==undefined)keys.set(idempotencyKey,{recordId:id,effect});
   if(crashArmed&&effects.length>=crashAfterEffects){crashArmed=false;dead=true;settleCrash({crashed:true});throw failure('process died',{simulatedCrash:true});}
   if(k==='timeout-after-commit')throw failure('timeout',{timeout:true});
   return {ok:true,replayed:false,effect};
  }};
  const env={source,target,token:secret,log:line=>{logs.push(printable(line));},
   sleep:async ms=>{if(dead)return never();if(Number.isFinite(ms)&&ms>0)now+=ms;await new Promise(r=>setImmediate(r));},
   checkpoint:{get:()=>stored.value===undefined?null:JSON.parse(stored.value),set:value=>{if(dead)return;stored.value=JSON.stringify(value);if(leaks(stored.value,secret))issue('secret-leaked',{where:'checkpoint'});}}};
  // The sync may also write straight to the console; that is a log like any other during this run.
  const original={log:console.log,info:console.info,warn:console.warn,error:console.error,debug:console.debug};
  for(const k of Object.keys(original))console[k]=(...args)=>{logs.push(args.map(printable).join(' '));};
  const originalWrite=process.stdout.write;process.stdout.write=function(chunk,...rest){logs.push(String(chunk));return originalWrite.call(process.stdout,chunk,...rest);};
  let timer;
  const wall=new Promise(r=>{timer=setTimeout(()=>r({wall:true}),wallLimitMs);});
  const finished=Promise.resolve().then(()=>sync(env)).then(report=>({report}),error=>error?.simulatedCrash?{crashed:true}:{error});
  const outcome=await Promise.race([finished,crash,wall]);clearTimeout(timer);dead=true;
  Object.assign(console,original);process.stdout.write=originalWrite;
  if(logs.some(l=>leaks(l,secret)))issue('secret-leaked',{where:'log'});
  if(outcome.report!==undefined&&leaks(JSON.stringify(outcome.report)??'',secret))issue('secret-leaked',{where:'report'});
  if(outcome.wall)issue('hang-unhandled');
  if(outcome.error)issue('run-failed',{message:String(outcome.error?.message??outcome.error).slice(0,200)});
  return outcome;
 };
 const stored={},reports=[];let runs=0,last=await runOnce(stored);runs++;
 if(last.report)reports.push(last.report);
 if(last.crashed){last=await runOnce(stored);runs++;if(last.report)reports.push(last.report);}
 for(let i=0;i<redeliver;i++){last=await runOnce({});runs++;if(last.report)reports.push(last.report);}
 const final=reports.at(-1)??null;
 if(typeof final?.complete!=='boolean'||!Array.isArray(final?.applied)||!Array.isArray(final?.failed))issue('report-missing');
 for(const key of [...Object.keys(sourceFaults),...Object.keys(targetFaults)])if(!fired.has(key))issue('fault-not-exercised',{recordId:key});
 if(Number.isSafeInteger(crashAfterEffects)&&crashArmed)issue('fault-not-exercised',{recordId:'crash'});
 const failed=(Array.isArray(final?.failed)?final.failed:[]).map(f=>f?.id??f),done=new Map();
 for(const id of effects)done.set(id,(done.get(id)??0)+1);
 for(const r of records){
  const n=done.get(r.id)??0;
  if(n>1)issue('duplicate-action',{recordId:r.id,effects:n});
  if(n===0&&!permanent.includes(r.id))issue('record-lost',{recordId:r.id});
  if(n===0&&permanent.includes(r.id)&&!failed.includes(r.id))issue('failure-hidden',{recordId:r.id});
 }
 if(final?.complete===true&&records.some(r=>!done.has(r.id)))issue('false-complete');
 const applied=new Set(reports.flatMap(x=>Array.isArray(x?.applied)?x.applied:[]));
 if(applied.size!==done.size||[...applied].some(id=>!done.has(id))||failed.some(id=>done.has(id)||!byId.has(id)))issue('report-mismatch');
 if(final?.complete===false&&!failed.length)issue('report-mismatch');
 const list=[...issues.values()];
 return {accepted:list.length===0,issues:list,effects:[...effects],failed,complete:final?.complete??null,runs,scope:'synthetic-offline'};
}

/** The acceptance run: one fault-free run proves little, so every fault class must be met by the same sync. */
export async function runInterfaceMatrix(sync,base){
 if(!Array.isArray(base?.records)||!(base.records.length>(base.pageSize??2)))throw Error('Invalid interface scenario');
 const first=base.records[0].id,second=base.records[1].id;
 const scenarios={plain:{},auth:{authRequired:true},lostResponse:{targetFaults:{[`${first}:1`]:'timeout-after-commit'}},beforeCommit:{targetFaults:{[`${first}:1`]:'timeout-before-commit',[`${first}:2`]:'server-error'}},pages:{sourceFaults:{'null:1':'timeout','p1:1':'server-error'}},hang:{sourceFaults:{'p1:1':'hang'}},targetHang:{targetFaults:{[`${first}:1`]:'hang'}},rateLimit:{targetFaults:{[`${first}:1`]:{kind:'rate-limit',retryAfterMs:500}}},permanent:{permanent:[second]},crash:{crashAfterEffects:2},redelivery:{redeliver:1}};
 const results={};
 for(const [name,over] of Object.entries(scenarios))results[name]=await runInterfaceScenario(sync,{...base,...over});
 return {accepted:Object.values(results).every(r=>r.accepted),results,scope:'synthetic-offline'};
}
