import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {parseSourceOverview} from '../web/founder/interaction.mjs';
export function publishMonitorOverview(file,summary,beforeCommit=()=>{}){
 let tmp;
 try{const before=fs.readFileSync(file,'utf8'),data=parseSourceOverview(before);if(!Number.isFinite(Date.parse(summary.checkedAt)))return false;
  const re=/\/\* SOURCE_OVERVIEW_JSON\r?\n[\s\S]*?\r?\nEND_SOURCE_OVERVIEW_JSON \*\//g;if([...before.matchAll(re)].length!==1)return false;
  updateOverview(data,summary);
  const encoded=JSON.stringify(data).replaceAll('*/','*\\u002f');const after=before.replace(re,()=> '/* SOURCE_OVERVIEW_JSON\n'+encoded+'\nEND_SOURCE_OVERVIEW_JSON */');if(before.replace(re,'')!==after.replace(re,''))return false;
  tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,after);beforeCommit();if(fs.readFileSync(file,'utf8')!==before)return false;fs.renameSync(tmp,file);tmp=null;return true;
 }catch{return false;}finally{if(tmp)try{fs.unlinkSync(tmp);}catch{}}
}

function updateOverview(data,summary){
  data.localMonitor={checkedAt:summary.checkedAt,status:String(summary.status).slice(0,80),gaps:summary.gaps.filter(x=>/^[\w-]{1,100}$/.test(x)).slice(0,50),nextAt:summary.nextAt??null};
  const u=summary.ugig;
  if(u?.account==='Obolus'&&Number.isFinite(Date.parse(u.checkedAt))&&Date.parse(u.checkedAt)<=Date.parse(summary.checkedAt)&&Date.parse(u.checkedAt)>=Date.parse(data.ugig.checkedAt??data.checkedAt)&&['pending','reviewing','shortlisted','rejected','accepted','withdrawn','not_found'].includes(u.status)&&[u.total,u.pending,u.conversations].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=100000))data.ugig={...data.ugig,checkedAt:u.checkedAt,status:u.status,total:u.total,pending:u.pending,conversations:u.conversations,method:'local-api-get-only'};
}

// Runtime observations must never alter the source tree used by certificates.
function readBounded(file,missing=false){
 for(let parent=path.resolve(file);;parent=path.dirname(parent)){
  try{if(fs.lstatSync(parent).isSymbolicLink())throw Error('Linked overview path');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(path.dirname(parent)===parent)break;
 }
 let info;try{info=fs.lstatSync(file);}catch(error){if(missing&&error.code==='ENOENT')return null;throw error;}
 if(!info.isFile()||info.size>262144)throw Error('Invalid overview file');
 const content=fs.readFileSync(file,'utf8');if(Buffer.byteLength(content)>262144)throw Error('Oversized overview');return content;
}
function decodeOverview(content){
 const data=JSON.parse(content);
 if(!data||data.schema!=='numaron-source-overview-v1'||!Number.isFinite(Date.parse(data.checkedAt))||!data.ugig||typeof data.ugig!=='object'||Array.isArray(data.ugig)||!data.guru||typeof data.guru!=='object'||Array.isArray(data.guru))throw Error('Invalid overview');
 return data;
}
export function readMonitorOverviewData(sourceFile,dataFile){
 const current=readBounded(dataFile,true);
 return current===null?parseSourceOverview(readBounded(sourceFile)):decodeOverview(current);
}
export function publishMonitorOverviewData(sourceFile,dataFile,summary,beforeCommit=()=>{}){
 let tmp;
 try{
  if(path.resolve(sourceFile)===path.resolve(dataFile)||!Number.isFinite(Date.parse(summary.checkedAt)))return false;
  const before=readBounded(dataFile,true),source=before===null?readBounded(sourceFile):null;
  const data=before===null?parseSourceOverview(source):decodeOverview(before);
  updateOverview(data,summary);
  const encoded=JSON.stringify(data);if(Buffer.byteLength(encoded)>262144)return false;
  tmp=dataFile+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,encoded,{flag:'wx'});beforeCommit();
  if(readBounded(dataFile,true)!==before||(source!==null&&readBounded(sourceFile)!==source))return false;
  fs.renameSync(tmp,dataFile);tmp=null;return true;
 }catch{return false;}finally{if(tmp)try{fs.unlinkSync(tmp);}catch{}}
}
