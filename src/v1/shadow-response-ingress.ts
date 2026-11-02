import {ShadowRuntime} from './shadow-runtime.js';
import {RESEARCH_SECTORS,type ResearchDossier} from '../revenue/research.js';
import {assertNoKnownSecrets} from '../observability/redaction.js';

/** Offline contract rehearsal for separate model/source responses. No callbacks,
 * HTTP client, model invocation or tool executor. Never imports reported evidence.
 * Production adapters require separate authorization and persistent cost control. */
export function ingestMockShadowResponse(runtime:ShadowRuntime,stepId:string,
 modelJson:string,sources:{id:string;excerpt:string}[],now=Date.now()){
 // Claim first: malformed/uncertain deliveries consume work and retain their hold.
 // Repeated delivery must never trigger a second external attempt implicitly.
 runtime.claim(stepId,now);
 return completeMockShadowResponse(runtime,stepId,modelJson,sources,now);
}
/** For a controller that already persisted the work claim before inference. */
export function completeMockShadowResponse(runtime:ShadowRuntime,stepId:string,
 modelJson:string,sources:{id:string;excerpt:string}[],now=Date.now()){
 if(typeof modelJson!=='string'||Buffer.byteLength(modelJson)>8192)throw Error('Bounded model response required');
 if(!Array.isArray(sources)||sources.length>4)throw Error('Bounded mock source response required');
 assertNoKnownSecrets({modelJson,sources});
 let value:unknown;try{value=JSON.parse(modelJson);}catch{throw Error('Invalid model JSON');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Model object required');
 const p=value as Record<string,unknown>;
 if(Object.keys(p).sort().join(',')!=='hypothesis,sector,sourceIds,title'||
  typeof p.title!=='string'||!p.title.trim()||p.title.length>200||
  typeof p.hypothesis!=='string'||!p.hypothesis.trim()||p.hypothesis.length>2000||
  !RESEARCH_SECTORS.includes(p.sector as typeof RESEARCH_SECTORS[number])||
  !Array.isArray(p.sourceIds)||p.sourceIds.length>4||new Set(p.sourceIds).size!==p.sourceIds.length)
  throw Error('Strict proposal schema required; tools, approvals and financial claims forbidden');
 const sourceIds=p.sourceIds;
 const ids=new Set<string>();
 for(const source of sources){
  if(!source||Object.keys(source).sort().join(',')!=='excerpt,id'||typeof source.id!=='string'||
   !/^[a-z0-9_-]{1,60}$/.test(source.id)||stepId.length+1+source.id.length>100||ids.has(source.id)||typeof source.excerpt!=='string'||
   !source.excerpt.trim()||source.excerpt.length>4000)throw Error('Invalid or duplicate mock source');
  ids.add(source.id);
 }
 if(sourceIds.some(id=>typeof id!=='string'||!ids.has(id)))throw Error('Model cited an unavailable source');
 const dossier:ResearchDossier={opportunities:[{id:stepId,title:p.title,hypothesis:p.hypothesis,
  sector:p.sector as typeof RESEARCH_SECTORS[number],forecastState:'unknown',
  forecast:{revenueCents:0,costCents:0,probability:0,days:14,validationBudgetCents:0}}],
  evidence:sources.filter(s=>sourceIds.includes(s.id)).map(s=>({id:`${stepId}_${s.id}`,
   opportunityId:stepId,sourceUrl:`https://example.invalid/mock/${s.id}`,observedAt:new Date(now).toISOString(),
   kind:'request',excerpt:s.excerpt,provenance:'synthetic',reviewedBy:null}))};
 return runtime.complete(stepId,dossier,now);
}
