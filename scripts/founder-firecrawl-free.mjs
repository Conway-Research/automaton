// Production uses the documented keyless free tier; never inherit SDK keys or browser cookies.
// Account access, if injected by an isolated integration, requires independent zero-spend proof.
import {selectResearchSource,cleanResearchMarkdown} from './founder-source-quality.mjs';
export function createFreeFirecrawl({keyless=false,expiresAt=Infinity,getAccess=()=>null,request=fetch,claim,source,publicUrl,nextReadyAt=()=>0,now=Date.now}){
 const access=()=>{if(now()>=expiresAt)return null;if(keyless)return {keyless:true};try{const a=getAccess();return a?.providerEnforcedZeroSpend===true&&typeof a.key==='string'&&/^fc-[A-Za-z0-9-]+$/.test(a.key)?a:null;}catch{return null;}};
 // Explicit operator retry still requires a settled controller receipt and
 // current access/cooldown checks. Never replay an uncertain scrape on a timer.
 return {get available(){return !!access();},maxCostRappen:0,retrySafe:false,manualRetrySafe:true,
 get reason(){return this.available?null:'Firecrawl: Kostenfreiheit je Abruf nicht automatisch nachweisbar. Gratis-Creditbestand allein genügt nicht; Abruf bleibt gesperrt.';},
 get nextReadyAt(){return nextReadyAt();},
 async execute(ctx){
  ctx.assertActive();const a=access();if(!a)throw Error('Kostenfreiheit nicht nachgewiesen');
  if(!ctx.grant?.reservationId||ctx.grant.maxCostRappen!==0)throw Error('Controller grant missing');
  const candidates=(ctx.dependencies??[]).filter(d=>d.privacy!=='private').flatMap(d=>d.sources??[]);
  const selected=selectResearchSource(candidates,ctx.task?.input?.researchGoal??ctx.task?.input?.title,publicUrl);
  const url=selected?publicUrl(selected.url):null;if(!url)throw Error('No relevant admissible public source for research goal');
  if(nextReadyAt()>now())throw Error('Firecrawl six-hour cooldown');
  claim('firecrawl');ctx.assertActive();
  let response;try{response=await request('https://api.firecrawl.dev/v2/scrape',{method:'POST',redirect:'error',credentials:'omit',signal:AbortSignal.any([ctx.signal??new AbortController().signal,AbortSignal.timeout(25000)]),headers:{...(a.keyless?{}:{Authorization:`Bearer ${a.key}`}), 'Content-Type':'application/json'},body:JSON.stringify({url,formats:['markdown'],onlyMainContent:true,timeout:20000,...(a.keyless?{proxy:'basic'}:{})})});}catch{throw Error('Firecrawl request outcome unknown; no automatic retry');}
  if(!response.ok){await response.body?.cancel();throw Error(`Firecrawl HTTP ${response.status}`);}
  if(!response.body)throw Error('Empty Firecrawl response');const reader=response.body.getReader(),chunks=[];let n=0;
  try{for(;;){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>250000)throw Error('Firecrawl response limit');chunks.push(r.value);}}finally{await reader.cancel();}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid Firecrawl response');}
  ctx.assertActive();if(data.success!==true||typeof data.data?.markdown!=='string')throw Error('No Firecrawl evidence');
  if(data.data.metadata?.sourceURL&&publicUrl(data.data.metadata.sourceURL)!==url)throw Error('Unexpected Firecrawl source');
  const cleaned=cleanResearchMarkdown(data.data.markdown,url);
  const s=cleaned?source(url,cleaned,'firecrawl'):null;if(!s)throw Error('No substantive Firecrawl evidence after interface cleanup');
  s.contentQuality={cleanedBeforeTruncation:true,originalCharacters:data.data.markdown.length,cleanedCharacters:cleaned.length,storedCharacters:s.claim.length,truncated:s.claim.length<cleaned.length};
  return {kind:'firecrawl-research',provider:'firecrawl',researchGoal:String(ctx.task?.input?.researchGoal??ctx.task?.input?.title??'').slice(0,500),sources:[s],observedAt:new Date(now()).toISOString(),costReceipt:{actualCostRappen:0,evidenceRef:`firecrawl:free:${ctx.grant.reservationId}`},costEvidence:{basis:a.keyless?'Documented keyless free tier; no account credentials or paid fallback':'Provider-enforced zero monetary spend; credit consumption is separate',creditsUsed:data.data.metadata?.creditsUsed??null}};
 },verify:r=>r?.kind==='firecrawl-research'&&r.sources?.length===1&&!!publicUrl(r.sources[0].url)&&!!r.sources[0].digest};
}
