import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const ZERO='0'.repeat(64);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const methods=new Set(['GET','POST','HEAD','PUT','PATCH','DELETE','OPTIONS']);
const reasons=new Set(['ok','unauthenticated','session-expired','invalid-bootstrap','origin-host','origin-format','forbidden','invalid-request','too-large','too-many-sessions','server-error','aborted']);
const id=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x)?x:null;
export function verifyAuditRecords(rows){
 if(!Array.isArray(rows))return {valid:false};
 let previous=null,seq=null;
 for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row))return {valid:false};const {hash,...r}=row;
  if(r.schema!=='numaron-security-audit-v1'||!Number.isSafeInteger(r.seq)||r.seq<1||!/^[a-f0-9]{64}$/.test(r.previousHash)||hash!==digest(r)||previous!==null&&(r.previousHash!==previous||r.seq!==seq+1))return {valid:false,records:rows.length};
  previous=hash;seq=r.seq;
 }
 return {valid:true,records:rows.length,lastHash:previous??ZERO,lastSeq:seq??0,startsAtGenesis:rows.length===0||rows[0].seq===1&&rows[0].previousHash===ZERO};
}
// Single writer. This local chain needs an independently retained anchor to
// resist wholesale rewriting. It is not tamper-proof storage.
export function createSecurityAudit({file,maxBytes=2*1024*1024,archives=3,knownRoutes=['/','/api/session','/api/power'],now=Date.now}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>10*1024*1024||!Number.isSafeInteger(archives)||archives<0||archives>5)throw Error('Invalid audit retention');
 const routes=new Set(knownRoutes);let errors=0,written=0,seq=0,previousHash=ZERO,size=0,ready=false,lastError=null;
 const check=(name,dir=false)=>{try{const s=fs.lstatSync(name);if(s.isSymbolicLink()||!(dir?s.isDirectory():s.isFile()))throw Error('Invalid audit path');return s;}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const parents=()=>{for(let p=path.dirname(path.resolve(file));;p=path.dirname(p)){check(p,true);if(p===path.dirname(p))break;}};
 const initialize=()=>{
  parents();fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true,mode:0o700});parents();const s=check(file);
  const rows=[];for(let i=archives;i>=0;i--){const name=i?file+'.'+i:file,stat=check(name);if(!stat)continue;if(stat.size>maxBytes)throw Error('Oversized audit');const raw=fs.readFileSync(name,'utf8');if(raw&&!raw.endsWith('\n'))throw Error('Incomplete audit');if(raw.trim())rows.push(...raw.trim().split('\n').map(JSON.parse));}
  const result=verifyAuditRecords(rows);if(!result.valid)throw Error('Invalid audit chain');seq=result.lastSeq;previousHash=result.lastHash;size=s?.size??0;ready=true;
 };
 return {
  record(input={}){
   if(!file)return false;
   try{
    if(!ready)initialize();parents();const current=check(file);if((current?.size??0)!==size)throw Error('Audit changed externally');
    const route=typeof input.route==='string'?input.route.split(/[?#]/,1)[0]:'';
    const r={schema:'numaron-security-audit-v1',seq:seq+1,at:new Date(now()).toISOString(),pid:process.pid,event:input.event==='login'?'login':'http',requestId:id(input.requestId),sessionRef:id(input.sessionRef),method:methods.has(input.method)?input.method:'OTHER',route:routes.has(route)?route:'other',status:Number.isInteger(input.status)&&input.status>=100&&input.status<=599?input.status:0,reason:reasons.has(input.reason)?input.reason:'other',authenticated:input.authenticated===true,peer:input.peer==='loopback'?'loopback':'other',previousHash};
    const hash=digest(r),line=JSON.stringify({...r,hash})+'\n',bytes=Buffer.byteLength(line);if(bytes>maxBytes)throw Error('Oversized audit record');
    if(size+bytes>maxBytes){
     for(let i=1;i<=archives;i++)check(file+'.'+i);
     if(archives){if(check(file+'.'+archives))fs.unlinkSync(file+'.'+archives);for(let i=archives-1;i>=1;i--)if(check(file+'.'+i))fs.renameSync(file+'.'+i,file+'.'+(i+1));if(current)fs.renameSync(file,file+'.1');}
     else if(current)fs.unlinkSync(file);size=0;
    }
    fs.appendFileSync(file,line,{mode:0o600,flush:true});size+=bytes;seq++;previousHash=hash;written++;lastError=null;return true;
   }catch{errors++;if(lastError===null)process.stderr.write('[numaron-security-audit] audit-write-failed; inspect local audit storage\n');lastError='audit-write-failed';return false;}
  },
  status(){return {enabled:!!file,written,errors,lastError,maxBytes,archives,lastSeq:seq,lastHash:previousHash};}
 };
}
