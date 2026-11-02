import fs from'node:fs';import {Worker} from'node:worker_threads';
const unavailable=()=>({available:false,reason:'Lokaler Dienstzugang noch nicht aktuell geprüft.'});
// Status getters only inspect file identity. DPAPI work runs in a separate thread.
export function createLocalAccessCache({file,read,now=Date.now,ttlMs=30000}){
 let value=null,identity=null,at=-Infinity,pending=null;
 const stamp=()=>{try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink()&&s.size<=64000?`${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`:null;}catch{return null;}};
 const current=()=>{const id=stamp();return value&&id&&id===identity&&now()>=at&&now()-at<ttlMs?value:unavailable();};
 return {current,async refresh(){if(pending)return pending;if(current().available)return current();const before=stamp();value=null;identity=null;if(!before)return unavailable();pending=(async()=>{try{const result=await read();if(stamp()!==before||result?.available!==true)return unavailable();value=result;identity=before;at=now();return current();}catch{return unavailable();}})();try{return await pending;}finally{pending=null;}}};
}
const operations=new Set(['service','dealwork','google-access','google-client','google-save']);
export function readLocalCredential(operation,options={}){
 if(!operations.has(operation))return Promise.reject(Error('Unsupported local access operation'));
 return new Promise((resolve,reject)=>{let settled=false;const worker=new Worker(new URL('./founder-local-access-worker.mjs',import.meta.url),{workerData:{operation,options}});const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(Error('Local credential operation unavailable')):resolve(value);};const timer=setTimeout(()=>finish(true),10000);worker.once('message',message=>finish(message?.ok!==true,message?.value));worker.once('error',()=>finish(true));worker.once('exit',()=>finish(true));});
}
