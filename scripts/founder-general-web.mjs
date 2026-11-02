import fs from 'node:fs';
import {LEARNING_DOMAINS} from '../src/research/curriculum.ts';
import {publicHttps} from '../src/research/sources.ts';
import {digest} from '../src/research/integrity.ts';

// This is a dedicated, fixed local service, not a configurable network proxy.
export const GENERAL_WEB_ENDPOINT='http://127.0.0.1:18888/search';
export function generalWebConfiguration(value){
 const valid=value?.schemaVersion===1&&typeof value.enabled==='boolean'&&typeof value.activationApproved==='boolean'&&Object.keys(value).every(k=>['schemaVersion','enabled','activationApproved'].includes(k));
 return {schemaVersion:1,enabled:valid&&value.enabled&&value.activationApproved,activationApproved:valid&&value.activationApproved};
}
export function readGeneralWebConfiguration(file){
 try{return generalWebConfiguration(JSON.parse(fs.readFileSync(file,'utf8')));}catch{return generalWebConfiguration(null);}
}
export function webCandidates(payload){
 if(!Array.isArray(payload?.results))throw Error('Invalid general web response');
 const found=new Map();
 for(const row of payload.results.slice(0,100)){
  if(!publicHttps(row?.url)||typeof row?.title!=='string'||!row.title.trim())continue;
  const u=new URL(row.url);u.hash='';const url=u.href;
  if(!found.has(url))found.set(url,{id:'candidate-'+digest(url),url,claim:row.title.replace(/[\u0000-\u001f]/g,' ').slice(0,256),digest:digest(url),privacy:'public',admission:'unreviewed-candidate',metadataOnly:false,provider:'searxng-local'});
  if(found.size===2)break;
 }
 return [...found.values()];
}
export function createGeneralWebDiscovery({configuration,request,claim,finish,ready,readBody}){
 const config=generalWebConfiguration(configuration);
 return {maxCostRappen:0,available:config.enabled,get nextReadyAt(){return ready();},reason:config.enabled?null:'Local general web search not activated',
  async execute(ctx){
   ctx.assertActive();
   if(!config.enabled||!ctx.grant?.reservationId||ctx.grant.maxCostRappen!==0)throw Error('General web grant unavailable');
   const domain=LEARNING_DOMAINS.find(d=>d.id===ctx.task?.input?.learningTopic);
   if(!domain)throw Error('Registered public learning topic required');
   // Retrieval hint only: original, scope-bound permission is still required by sourceProbe.
   const u=new URL(GENERAL_WEB_ENDPOINT);u.searchParams.set('q',domain.query+' ("CC0" OR "CC BY 4.0")');u.searchParams.set('format','json');u.searchParams.set('categories','general');u.searchParams.set('engines','duckduckgo');u.searchParams.set('pageno','1');u.searchParams.set('safesearch','1');
   claim();
   try{
    let response;
    try{response=await request(u.href,{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json','User-Agent':'NumaronDiscovery/1.0'},signal:AbortSignal.any([ctx.signal,AbortSignal.timeout(10000)])});}
    catch{const error=Error('Local search transport unavailable');error.diagnostic={code:'service_network_failed'};throw error;}
    // readBody supplies the existing size cap and Retry-After/error handling.
    if(response.ok&&!/application\/(?:[a-z.+-]*\+)?json\b/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Local search JSON required');}
    const payload=JSON.parse(await readBody(response));ctx.assertActive();
    const sources=webCandidates(payload);finish('succeeded');
    return {kind:'learning-discovery',provider:'searxng-local',sources,costReceipt:{actualCostRappen:0,evidenceRef:'local-searxng:'+ctx.grant.reservationId},costEvidence:{basis:'Self-hosted open-source metasearch; no paid API or credentials',endpoint:GENERAL_WEB_ENDPOINT,scope:'Unreviewed public links only; no content licence or truth established'}};
   }catch(error){finish('failed:'+(error.diagnostic?.code??'service_invalid_response')+(Number.isInteger(error.diagnostic?.httpStatus)?':'+error.diagnostic.httpStatus:''),error.diagnostic?.retryAfterMs??0);throw error;}
  },
  verify:r=>r?.kind==='learning-discovery'&&r.provider==='searxng-local'&&Array.isArray(r.sources)&&r.sources.length<=2&&r.sources.every(s=>publicHttps(s.url)&&s.admission==='unreviewed-candidate'&&s.metadataOnly===false)
 };
}
