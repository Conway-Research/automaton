import {setTimeout as delay} from 'node:timers/promises';
// One bounded GET per traversal step; batches checkpoint each successful step.
const SCHEMA='github-time-partitions-v1',PER_PAGE=100,CAP=1000;
const fail=()=>{throw Object.assign(Error('invalid-response'),{code:'invalid-response'});};
const iso=s=>new Date(s*1000).toISOString().replace('.000Z','Z');
export async function runGithubSearchBatch({git,ctx,previous,query,now=Date.now,pause=(ms,signal)=>delay(ms,undefined,{signal})}){
 const started=now(),steps=[],items=[];let result,quota;
 for(let i=0;i<4;i++){
  ctx.assertActive();if(i&&now()-started>=45000)break;
  const deadline=AbortSignal.timeout(Math.max(1,45000-(now()-started)));
  const stepCtx={...ctx,signal:ctx.signal?AbortSignal.any([ctx.signal,deadline]):deadline,onResponse(value){quota=value;ctx.onResponse?.(value);}};
  result=await runPartitionedGithubSearch({git,ctx:stepCtx,previous:i?{cursor:result.cursor}:previous,query,now});
  steps.push(result.data);items.push(...result.data.items);
  const stop=quota?.remaining!==null&&Number.isFinite(quota?.remaining)&&quota.remaining<=2?'quota-reserve':result.data.coverageComplete||result.data.phase==='blocked'||result.data.phase==='gap'||result.data.phase==='retry-changed-window'?'traversal-boundary':i===3?'request-limit':now()-started>=45000?'time-limit':null;
  if(stop==='quota-reserve')result.nextAt=Math.max(result.nextAt,quota.resetAt??now()+600000);
  result={...result,data:{...result.data,items:[...items],steps:[...steps],batch:{requests:steps.length,maxRequests:4,maxMs:45000,minSpacingMs:6500,stop}}};
  await ctx.checkpoint?.(result);
  if(stop)break;
  if(now()-started+6500>=45000){result.data.batch.stop='time-limit';break;}
  await pause(6500,ctx.signal);ctx.assertActive();
 }
 return result;
}
function initial(now){const end=Math.floor(now/1000);if(!Number.isSafeInteger(end)||end<0)fail();return {schema:SCHEMA,scanId:iso(end),snapshotEnd:end,queue:[{from:0,to:end,page:1,expectedTotal:null,seen:[]}],seen:[],completedRanges:0,gaps:[]};}
function valid(c){
 if(c?.schema!==SCHEMA||!Number.isSafeInteger(c.snapshotEnd)||c.snapshotEnd<0||typeof c.scanId!=='string'||!Array.isArray(c.queue)||c.queue.length>128||!Array.isArray(c.seen)||c.seen.length>100000||!Array.isArray(c.gaps)||c.gaps.length>1000||!Number.isSafeInteger(c.completedRanges)||c.completedRanges<0)fail();
 if(!c.seen.every(x=>typeof x==='string'&&/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*$/.test(x)))fail();
 for(const w of c.queue)if(!Number.isSafeInteger(w.from)||!Number.isSafeInteger(w.to)||w.from<0||w.to<w.from||w.to>c.snapshotEnd||!Number.isSafeInteger(w.page)||w.page<1||w.page>10||!Array.isArray(w.seen)||w.seen.length>CAP||!w.seen.every(x=>typeof x==='string')||!(w.expectedTotal===null||Number.isSafeInteger(w.expectedTotal)&&w.expectedTotal>=0&&w.expectedTotal<=CAP))fail();
 return c;
}
export async function runPartitionedGithubSearch({git,ctx,previous,query,now=Date.now}){
 ctx.assertActive();let c;
 if(previous?.cursor&&typeof previous.cursor==='object')c=valid(structuredClone(previous.cursor));
 else c=initial(now()); // Numeric legacy cursor deliberately restarts from page one.
 if(!c.queue.length){
  if(c.gaps.length)return {data:{scanId:c.scanId,phase:'blocked',coverageComplete:false,gaps:c.gaps,items:[],pendingRanges:0,completedRanges:c.completedRanges},cursor:c,nextAt:now()+86400000};
  c=initial(now());
 }
 const w=c.queue[0],q=query+' created:'+iso(w.from)+'..'+iso(w.to);
 const response=await git('/search/issues?q='+encodeURIComponent(q)+'&sort=created&order=desc&per_page='+PER_PAGE+'&page='+w.page,ctx);ctx.assertActive();
 if(!response||!Array.isArray(response.items)||response.items.length>PER_PAGE||typeof response.incomplete_results!=='boolean'||!Number.isSafeInteger(response.total_count)||response.total_count<0)fail();
 const total=response.total_count,data={scanId:c.scanId,range:{from:iso(w.from),to:iso(w.to)},page:w.page,total,items:[],rawItems:[],assignmentConfirmed:false,paymentConfirmed:false,searchScope:'Observed results of the configured query, partitioned by creation time; not all GitHub or a transactional snapshot'};
 const restart=()=>{w.page=1;w.expectedTotal=null;w.seen=[];data.phase='retry-changed-window';};
 const splitShort=()=>{c.queue.shift();if(w.from===w.to){c.gaps.push({from:w.from,to:w.to,total,reason:'short-page-single-second'});data.phase='gap';}else{const mid=Math.floor((w.from+w.to)/2);c.queue.unshift({from:mid+1,to:w.to,page:1,expectedTotal:null,seen:[]},{from:w.from,to:mid,page:1,expectedTotal:null,seen:[]});data.phase='split-short-page';}};
 if(total>CAP||response.incomplete_results){
  c.queue.shift();
  if(w.from===w.to){c.gaps.push({from:w.from,to:w.to,total,reason:response.incomplete_results?'incomplete-single-second':'over1000-single-second'});data.phase='gap';}
  else {const mid=Math.floor((w.from+w.to)/2);c.queue.unshift({from:mid+1,to:w.to,page:1,expectedTotal:null,seen:[]},{from:w.from,to:mid,page:1,expectedTotal:null,seen:[]});data.phase='split';}
 }else if(w.expectedTotal!==null&&w.expectedTotal!==total){restart();}
 else {
  const rows=response.items.map(x=>{
   if(typeof x.html_url!=='string'||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*$/.test(x.html_url))fail();
   if(x.created_at!==undefined){const at=Date.parse(x.created_at)/1000;if(!Number.isFinite(at)||at<w.from||at>w.to)fail();}
   return {url:x.html_url,title:x.title,body:x.body,assignees:x.assignees?.map(a=>a.login),labels:x.labels?.map(l=>l.name),createdAt:x.created_at,updatedAt:x.updated_at};
  });data.rawItems=rows;
  const ids=rows.map(x=>x.url),local=new Set(w.seen),duplicates=ids.some(id=>local.has(id))||new Set(ids).size!==ids.length;
  if(!rows.length&&local.size<total){splitShort();}
  else if(duplicates){restart();}
  else {
   w.expectedTotal=total;w.seen.push(...ids);const seen=new Set(c.seen);data.items=rows.filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true;});data.duplicatesSuppressed=rows.length-data.items.length;c.seen=[...seen];
   if(c.seen.length>100000)fail();
   if(w.seen.length===total){c.queue.shift();c.completedRanges++;data.phase='window-completed';}
   else if(w.seen.length>total){restart();}
   else if(rows.length<PER_PAGE||w.page>=10){splitShort();}
   else {w.page++;data.phase='page-completed';}
  }
 }
 data.completedRanges=c.completedRanges;data.pendingRanges=c.queue.length;data.gaps=c.gaps;data.uniqueResultsObserved=c.seen.length;data.coverageComplete=c.queue.length===0&&c.gaps.length===0;valid(c);
 return {data,cursor:c,nextAt:now()+(c.queue.length?600000:86400000)};
}

