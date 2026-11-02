import fs from 'node:fs';import path from 'node:path';import {atomicJSON} from './numaron-monitor.mjs';
const parsed=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const stamp=x=>typeof x==='number'?x:Date.parse(x);
function safe(base,file){const resolved=path.resolve(base,file),rel=path.relative(base,resolved);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Register path rejected');return resolved;}
export function reconcileMonitorRegister({base,config,state}){
 const candidates=[safe(base,config.sourceRegister)],artifacts=path.join(base,'artifacts');
 for(const name of fs.readdirSync(artifacts).filter(n=>/^order-monitor-\d{8}-\d{4}$/.test(n)).sort().reverse()){
  const file=path.join(artifacts,name,'source-register.json');if(fs.existsSync(file))candidates.push(file);
 }
 let chosen,register;for(const file of candidates){try{const value=parsed(file);if(value.github&&Number.isFinite(stamp(value.at))&&(!register||stamp(value.at)>stamp(register.at))){chosen=file;register=value;}}catch{}}
 if(!register)throw Error('Source register unavailable');
 const configs=new Map((config.tracked??[]).map(t=>[t.repo+'#'+t.n,t]));
 for(const t of register.github.tracked??[]){if(/^[\w.-]+\/[\w.-]+$/.test(t.repo)&&Number.isSafeInteger(t.n)&&t.n>0&&['pr','issue'].includes(t.type))configs.set(t.repo+'#'+t.n,t);}
 const ownFile=path.join(path.dirname(chosen),'github.json');
 if(fs.existsSync(ownFile))try{for(const t of parsed(ownFile)){if(/^[\w.-]+\/[\w.-]+$/.test(t.repo)&&Number.isSafeInteger(t.n)&&['pr','issue'].includes(t.type))configs.set(t.repo+'#'+t.n,{repo:t.repo,n:t.n,type:t.type});}}catch{}
 const discovery=state.get('github-discovery'),next=register.github.filteredLabelBountyCreated?.nextPage;
 const registerAt=stamp(register.github.checkedAt??register.at);
 if(discovery.cursor?.schema!=='github-time-partitions-v1'&&Number.isSafeInteger(next)&&next>0&&(discovery.checkedAt===null||registerAt>discovery.checkedAt))state.save('github-discovery',{...discovery,cursor:Math.max(discovery.cursor??config.discoveryNextPage??1,next)});
 for(const pause of register.monitorSources??[]){
  if(!/^[\w-]{1,150}$/.test(pause.id))continue;const old=state.get(pause.id),nextAt=stamp(pause.nextAt??pause.retryAt??pause.pausedUntil);
  if(Number.isFinite(nextAt))state.save(pause.id,{...old,nextAt:Math.max(old.nextAt,nextAt)});
 }
 // Import project timestamps and prior API quota evidence along the bounded register chain.
 const imported=path.join(base,'artifacts/numaron-local-monitor/imported');fs.mkdirSync(imported,{recursive:true});
 const seen=new Set();let file=chosen;
 for(let depth=0;file&&depth<12&&!seen.has(file);depth++){
  seen.add(file);let r;try{r=parsed(file);}catch{break;}const folder=path.dirname(file),when=stamp(r.github?.checkedAt??r.at);
  for(const name of ['github-read.json','github.json']){
   const f=path.join(folder,name);if(!fs.existsSync(f))continue;let rows;try{rows=parsed(f);}catch{continue;}if(!Array.isArray(rows))rows=rows&&typeof rows.path==='string'?[rows]:[];
   for(const row of rows){
    if(row.status>=400){const until=row.retryAfter?stamp(row.checkedAt)+Number(row.retryAfter)*1000:NaN;if(Number.isFinite(until)){const old=state.get('__provider-github');state.save(old.id,{...old,nextAt:Math.max(old.nextAt,until),status:'imported-quota'});}continue;}
    const match=row.path?.match(/^\/repos\/([\w.-]+\/[\w.-]+)\/(pulls|issues)\/(\d+)$/);const t=match?{repo:match[1],n:Number(match[3]),type:match[2]==='pulls'?'pr':'issue'}:row.repo?row:null;
    if(!t||!configs.has(t.repo+'#'+t.n))continue;
    const id='github-'+t.repo.replace('/','-')+'-'+t.n,old=state.get(id),at=stamp(row.checkedAt) || when;
    const project=row.data??{html_url:'https://github.com/'+t.repo+'/'+(t.type==='pr'?'pull':'issues')+'/'+t.n,state:row.state,merged:row.merged,assignees:[]};
    if(!Number.isFinite(at)||old.checkedAt!==null&&old.checkedAt>=at)continue;
    const evidence=path.join(imported,id+'.json');atomicJSON(evidence,{checkedAt:new Date(at).toISOString(),data:{project,projectCheckedAt:at,comments:row.comments??[],reviews:row.reviews??[],inline:row.reviewComments??[]}});
    state.save(id,{...old,checkedAt:at,nextAt:Math.max(old.nextAt,at+600000),status:'imported-last-success',evidence});
   }
  }
  const prior=r.previousRegister??r.previousSuccessfulRegister??r.previousSuccessfulMonitor;file=prior?safe(base,prior):null;if(file&&fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'source-register.json');
 }
 return {...config,sourceRegister:path.relative(base,chosen).replaceAll('\\','/'),tracked:[...configs.values()]};
}
