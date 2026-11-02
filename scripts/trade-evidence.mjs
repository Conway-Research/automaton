import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';

export const feeds=[['Welt','https://feeds.bbci.co.uk/news/world/rss.xml'],['Wirtschaft','https://feeds.bbci.co.uk/news/business/rss.xml'],['Technologie','https://feeds.bbci.co.uk/news/technology/rss.xml'],['Wissenschaft/Umwelt','https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'],['Gesundheit','https://feeds.bbci.co.uk/news/health/rss.xml'],['US-Zentralbank','https://www.federalreserve.gov/feeds/press_monetary.xml'],['EZB','https://www.ecb.europa.eu/rss/press.html']];

const plain=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();

export function parseFeed(xml,source,now=Date.now()){

 const out=[];for(const item of xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)??[]){const tag=n=>plain(item.match(new RegExp('<'+n+'\\b[^>]*>([\\s\\S]*?)</'+n+'>','i'))?.[1]??'');const title=tag('title').slice(0,300),url=tag('link'),date=Date.parse(tag('pubDate'));let u;try{u=new URL(url);}catch{continue;}if(!title||u.protocol!=='https:'||u.username||u.password||!Number.isFinite(date)||date>now+60000||now-date>72*3600000)continue;out.push({title,url:u.href,publishedAt:new Date(date).toISOString(),firstSeenAt:new Date(now).toISOString(),source});}return out.slice(0,80);

}

export function relevantNews(symbol,items,company=""){

 const terms=['oil shock','trade war','tariff','global recession','pandemic','shipping disruption','energy crisis','war escalat','earthquake','drought'];for(const [currency,words] of Object.entries({USD:['federal reserve','united states','us economy','us inflation','u.s.'],EUR:['europe','euro','ecb'],GBP:['britain','british','uk ','bank of england'],JPY:['japan','yen','bank of japan'],AUD:['australia'],CAD:['canada'],CHF:['swiss','switzerland']}))if(symbol.includes(currency))terms.push(...words);

 if(company){const clean=company.toLowerCase().replace(/\b(inc|corp|corporation|plc|ltd|limited|class|common|stock|cfd|the|group)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').trim();if(clean.length>=5)terms.push(clean);}

 if(symbol.startsWith('#'))terms.push('tariff','trade war','oil shock','supply chain','global recession');

 const aliases={'#CME':['cme group'],'#CARR.US':['carrier global'],'#AAPL':['apple'],'#MSFT':['microsoft'],'#NVDA':['nvidia'],'#TSLA':['tesla']};terms.push(...(aliases[symbol]??[]));

 return items.filter(i=>terms.some(t=>i.title.toLowerCase().includes(t))).slice(0,5);

}

async function fetchFeed(url,fetcher){const r=await fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('Feed unavailable');let size=0,text='';const decoder=new TextDecoder();for await(const part of r.body){size+=part.length;if(size>1500000)throw Error('Feed too large');text+=decoder.decode(part,{stream:true});}return text+decoder.decode();}

export function createTradeEvidence({file,python,terminal,login,server,script,control,now=Date.now,fetcher=fetch,historyReader}){

 let report=null,busy=null,last=0;const pending=new Set();try{report=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}

 const snapshot=()=>report?{...report,stale:now()-Date.parse(report.observedAt)>30*60000}:null;

 const refresh=async(symbols=[])=>{for(const s of symbols)if(typeof s==='string'&&/^[\w.#-]{1,80}$/.test(s)&&pending.size<100)pending.add(s);if(busy)return busy;if(control()!=='running'||now()-last<15*60000)return;last=now();busy=(async()=>{

   const feedResults=await Promise.allSettled(feeds.map(async([label,url])=>({label,url,items:parseFeed(await fetchFeed(url,fetcher),label,now())})));

   const items=[...new Map(feedResults.flatMap(r=>r.status==='fulfilled'?r.value.items:[]).map(i=>[i.url,i])).values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));

   let history=null,error=null;try{const wanted=[...new Set(['EURUSD','GBPUSD','USDJPY',...pending])].slice(0,5);

     history=historyReader?await historyReader(wanted):JSON.parse((await promisify(execFile)(python,[script,'--terminal',terminal,'--login',String(login),'--server',server,'--symbols',wanted.join(',')],{timeout:45000,maxBuffer:1048576,windowsHide:true})).stdout);

     for(const s of wanted)pending.delete(s);

     if(history?.readOnly!==true||history.executionEnabled!==false||!Array.isArray(history.reports))throw Error('Invalid history');

   history.reports=history.reports.map(h=>({...h,observedAt:history.observedAt}));

     const merged=new Map((report?.history?.reports??[]).filter(h=>now()-Date.parse(h.observedAt)<86400000).map(h=>[h.symbol,h]));for(const h of history.reports)merged.set(h.symbol,h);history.reports=[...merged.values()].slice(-100);

   }catch{history=null;error='Historischer Test nicht verfügbar; automatischer neuer Versuch in 15 Minuten.';}

   if(control()!=='running')return;
   // Observation time, never publication time, defines when this system knew a headline.
   const key=i=>JSON.stringify([i.url,i.title,i.publishedAt]);
   const dir=file+'.news',journal=path.join(dir,new Date(now()).toISOString().slice(0,10)+'.json');
   let archived=[];try{archived=JSON.parse(fs.readFileSync(journal,'utf8'));}catch{}
   const known=new Map([...(report?.news?.items??[]),...archived].map(i=>[key(i),i]));
   for(const i of items){const old=known.get(key(i));if(old?.firstSeenAt&&Number.isFinite(Date.parse(old.firstSeenAt))&&Date.parse(old.firstSeenAt)<=now())i.firstSeenAt=old.firstSeenAt;known.set(key(i),i);}
   fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(journal+'.tmp',JSON.stringify([...known.values()].slice(-10000)));fs.renameSync(journal+'.tmp',journal);


   report={observedAt:new Date(now()).toISOString(),executionEnabled:false,history,error,news:{items,feeds:feedResults.map((r,i)=>({source:feeds[i][0],url:feeds[i][1],status:r.status==='fulfilled'?'read':'unavailable',items:r.status==='fulfilled'?r.value.items.length:0})),coverage:'Auswahl weltweiter Themenquellen, keine vollständige Nachrichtenabdeckung. Relevanz anhand von Überschriften; keine Richtungsprognose. Erstbeobachtung wird für künftige News-Tests gespeichert; historische News-Profitabilität nicht geprüft.'}};

   fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(report));fs.renameSync(file+'.tmp',file);

 })().catch(()=>{report={observedAt:new Date(now()).toISOString(),executionEnabled:false,error:'Bewertungsdaten konnten nicht aktualisiert werden.'};}).finally(()=>busy=null);return busy;};

 return {snapshot,refresh,observe(symbols){for(const s of symbols)if(typeof s==='string'&&/^[\w.#-]{1,80}$/.test(s)&&pending.size<100)pending.add(s);}};

}

