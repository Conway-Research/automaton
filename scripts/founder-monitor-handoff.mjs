import fs from 'node:fs';import path from 'node:path';
import {checkedJSON,digest,bounded} from './founder-restoration-integrity.mjs';
import {observationDigest} from './founder-opportunity-store.mjs';
import {opireGithubObservations} from './founder-opire-observations.mjs';
import {orderSelectionMetadata} from './founder-order-selection.mjs';
export function publishObservations({round,directory,assertActive}){
 assertActive();if(round?.status!=='completed'||!bounded(round.id)||!Array.isArray(round.rows))throw Error('Completed monitor round required');
 const observations=[];
 for(const row of round.rows){if(row.status!=='succeeded')continue;for(const x of row.data?.observations??[]){if(!bounded(row.id)||!bounded(x.externalId)||!bounded(x.revision))throw Error('Observation identity missing');const opire=row.id.startsWith('github-')&&x.sourceId==='opire';const o={sourceId:opire?'opire':row.id,externalId:x.externalId,revision:x.revision,observedAt:opire?x.observedAt:new Date(row.checkedAt).toISOString(),evidenceRef:opire?x.evidenceRef:row.evidenceRef??'monitor-round:'+round.id,kind:x.kind,data:x.data};observations.push({...o,digest:observationDigest(o)});}}
 const value=checkedJSON({schema:'numaron-monitor-observations-v1',roundId:round.id,observations});const name='handoff-'+digest(round.id)+'.json';fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,name);assertActive();
 if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||fs.readFileSync(file,'utf8')!==JSON.stringify(value))throw Error('Monitor handoff conflict');}else fs.writeFileSync(file,JSON.stringify(value),{flag:'wx',mode:0o600});return {published:observations.length,cursor:round.id,file};
}
export function ingestMonitorObservations({store,observations,assertActive}){if(!Array.isArray(observations)||observations.length>1000)throw Error('Invalid monitor batch');return store.ingestBatch(observations,assertActive);}
export function monitorResultObservations({sourceId,data}){
 if(!data||typeof data!=='object')return [];const observations=[];
 const listing=(row)=>{const externalId=String(row?.id??row?.task_id??row?.html_url??row?.url??'');if(!bounded(externalId))return;const value={title:String(row.title??row.name??'').slice(0,500),url:typeof row.html_url==='string'?row.html_url:typeof row.url==='string'?row.url:null,remoteState:String(row.status??row.state??'unknown').slice(0,80),...orderSelectionMetadata(row),assignmentConfirmed:false,paymentConfirmed:false};observations.push({externalId,revision:digest(value),kind:'listing',data:value});};
 const rows=data.listings?.items??data.tasks??data.bounties??data.jobs??data.items??(Array.isArray(data)?data:[]);if(Array.isArray(rows))for(const row of rows.slice(0,100))listing(row);
 if(sourceId==='ugig'&&data.account?.username==='Obolus'&&data.applicationsComplete===true&&Array.isArray(data.applications))for(const a of data.applications.slice(0,100)){if(!bounded(a.gig_id))continue;const value={account:'Obolus',status:String(a.status??'unknown').slice(0,80),assignmentConfirmed:false,paymentConfirmed:false};observations.push({externalId:'application:'+a.gig_id,revision:digest(value),kind:'own-application',data:value});}
 if(sourceId.startsWith('github')&&typeof data.url==='string')listing({id:data.url,title:data.project?.title??'',url:data.url,state:data.state});
 if(sourceId.startsWith('github-')&&Array.isArray(data.comments)&&data.commentsComplete===true)observations.push(...opireGithubObservations({issueUrl:data.url,comments:data.comments,complete:true}));
 return observations;
}
