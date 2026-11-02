import {relevantNews} from './trade-evidence.mjs';

import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';

const finite=v=>typeof v==='number'&&Number.isFinite(v),positive=v=>finite(v)&&v>0;

export function assessMarket(m,now=Date.now()){

 const result={status:'data-missing',observedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),setups:[],checked:0,issues:[],executionEnabled:false,method:'Experimentell: M5-Schlusskurs außerhalb der vorherigen 20 abgeschlossenen Kerzen; Stop an den letzten drei Kerzen; Bruttoziel 2R. Profitabilität nicht validiert.'};

 if(!m||m.readOnly!==true||m.executionEnabled!==false||!Array.isArray(m.rows)||m.rows.length>100||!Number.isFinite(Date.parse(m.observedAt))||now-Date.parse(m.observedAt)>15000||now<Date.parse(m.observedAt)-1000||!/^[A-Z]{3}$/.test(m.currency??'')){result.issues.push('Keine aktuelle vollständige Marktaufnahme.');return result;}

 result.clock=m.clock??null;result.observedAt=m.observedAt;result.visibleCount=m.visibleCount;result.truncated=m.truncated===true;result.nextStart=Number.isSafeInteger(m.nextStart)&&m.nextStart>=0?m.nextStart:0;

 for(const row of m.rows){const fail=reason=>result.issues.push(String(row.symbol??'?')+': '+reason);const b=row.bars;

  if('clockOffsetSeconds' in row||'rawQuoteTime' in row||m.clock||(Array.isArray(b)&&b.some(v=>v&&'rawTime' in v))){const c=m.clock,o=row.clockOffsetSeconds;const proof=o===0?(!c||c.offsetSeconds===0):(c?.method==='advancing-tick-consensus'&&c.offsetSeconds===10800&&o===c.offsetSeconds&&Number.isInteger(c.sources)&&c.sources>=3&&finite(c.sampleSeconds)&&c.sampleSeconds>=2&&c.sampleSeconds<=10);if(!finite(o)||!proof||!finite(row.rawQuoteTime)||Math.abs(row.rawQuoteTime-row.quoteTime-o)>.001||!Array.isArray(b)||b.some(v=>!finite(v.rawTime)||Math.abs(v.rawTime-v.time-o)>.001)){fail('Broker-Zeitumrechnung nicht belegt.');continue;}}

  if(typeof row.symbol!=='string'||row.symbol.length>80||!positive(row.bid)||!positive(row.ask)||row.ask<row.bid||!finite(row.quoteTime)||now/1000-row.quoteTime>15||row.quoteTime>now/1000+1){fail('Kurs fehlt oder Kurszeit ist unklar/veraltet.');continue;}

  if(!Array.isArray(b)||b.length!==25||b.some((v,i)=>!['time','open','high','low','close'].every(k=>positive(v[k]))||v.high<Math.max(v.open,v.close)||v.low>Math.min(v.open,v.close)||v.low>v.high||(i>0&&v.time-b[i-1].time!==300))||b[24].time+300>now/1000||now/1000-(b[24].time+300)>300){fail('Abgeschlossene M5-Kerzen fehlen oder sind lückenhaft.');continue;}

  if(row.tradeMode!==4){fail('Instrument eingeschränkt.');continue;}result.checked++;

  const last=b[24],prior=b.slice(-21,-1),side=last.close>Math.max(...prior.map(x=>x.high))?'BUY':last.close<Math.min(...prior.map(x=>x.low))?'SELL':null;if(!side)continue;

  const entry=side==='BUY'?row.ask:row.bid,stop=side==='BUY'?Math.min(...b.slice(-3).map(x=>x.low)):Math.max(...b.slice(-3).map(x=>x.high))+row.ask-row.bid;

  const distance=side==='BUY'?entry-stop:stop-entry,target=side==='BUY'?entry+2*distance:entry-2*distance;

  if(side==='BUY'&&row.bid<=Math.max(...prior.map(x=>x.high))||side==='SELL'&&row.ask>=Math.min(...prior.map(x=>x.low))){fail('Ausbruch bereits zurückgenommen.');continue;}

  if(!['entry','stop','target'].every(k=>positive(row[k]))||distance<=0||!positive(target)||!['lots','plannedLoss','margin'].every(k=>positive(row[k]))||!finite(row.spreadCost)||row.spreadCost<0||Math.abs(row.entry-entry)>1e-8||Math.abs(row.stop-stop)>1e-8||Math.abs(row.target-target)>1e-8){fail('Risiko- oder Brokerberechnung unvollständig.');continue;}

  result.setups.push({symbol:row.symbol,company:row.company??'',side,entry,stop,target,lots:row.lots,plannedLoss:row.plannedLoss,margin:row.margin,spreadCost:row.spreadCost,currency:m.currency,observedAt:m.observedAt,expiresAt:new Date(Math.min(now+60000,(row.quoteTime+60)*1000)).toISOString(),costEvaluation:row.costEvaluation??null,costsVerified:false,riskChecked:false,executionEnabled:false,rationale:side==='BUY'?'Letzter abgeschlossener M5-Schlusskurs über dem vorherigen 20-Kerzen-Hoch.':'Letzter abgeschlossener M5-Schlusskurs unter dem vorherigen 20-Kerzen-Tief.',invalidation:'Ungültig nach Ablauf oder wenn der Kurs das Ausbruchsniveau zurück durchbricht. Vor jeder Entscheidung aktuelle Kurse prüfen.',limitations:['Experimentelles Setup; keine nachgewiesene Profitabilität.','Mindestlot nur Rechenbeispiel, keine empfohlene Positionsgröße.','Kommission, Slippage und Finanzierung nicht vollständig belegt. Stop-Verlust ist nicht garantiert begrenzt.']});

 }

 result.status=result.setups.length?'setups':result.checked&&!result.issues.length?'no-signal':'data-missing';return result;

}

export function createTradeRadar({file,read,control,now=Date.now,evidence=()=>null}){

 let restored=true,report=null,busy=null,closed=false,timer,lastAttempt=0;try{const p=JSON.parse(fs.readFileSync(file,'utf8'));if(p.executionEnabled===false&&Array.isArray(p.setups))report=p;}catch{}

 const snapshot=()=>{const state=control();if(state!=='running')return {...report,status:'paused',setups:[],executionEnabled:false};if(restored&&report)return {status:'stale',setups:[],executionEnabled:false,issues:['Gespeicherte Aufnahme wird nach Neustart neu geprüft.']};if(!report)return {status:'waiting',setups:[],executionEnabled:false};if(!Number.isFinite(Date.parse(report.expiresAt))||now()>=Date.parse(report.expiresAt)||report.setups?.some(p=>now()>=Date.parse(p.expiresAt)))return {...report,status:'stale',setups:[],executionEnabled:false};return report;};

 const cycle=async()=>{if(closed||busy||control()!=='running'||now()-lastAttempt<60000)return;lastAttempt=now();busy=(async()=>{let next;try{next=assessMarket(await read({start:report?.nextStart??0}),now());}catch{next={status:'data-missing',observedAt:new Date(now()).toISOString(),expiresAt:new Date(now()+60000).toISOString(),setups:[],issues:['MT5-Marktaufnahme nicht verfügbar. Automatischer neuer Versuch in einer Minute.'],executionEnabled:false};}if(closed||control()!=='running')return;next.history=[...(report?.history??[]),{observedAt:next.observedAt,status:next.status,setups:next.setups}].slice(-30);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(next));fs.renameSync(file+'.tmp',file);report=next;restored=false;})().catch(()=>{report={status:'data-missing',setups:[],issues:['Marktjournal konnte nicht gespeichert werden.'],executionEnabled:false};}).finally(()=>busy=null);return busy;};

 const enriched=()=>{const r=snapshot(),e=evidence();return {...r,evaluation:e,setups:(r.setups??[]).map(p=>{const news=e&&!e.stale?relevantNews(p.symbol,e.news?.items??[],p.company):[],h=e&&!e.stale?e.history?.reports?.find(h=>h.symbol===p.symbol):null,c=p.costEvaluation;const reasons=[];if(!c)reasons.push('Kosten fehlen');else if(c.stressNetTarget<=0)reasons.push('Nettoziel im Kostenstress nicht positiv');if(h?.holdout?.netR<0)reasons.push('Historischer Prüfzeitraum nach Kosten negativ');if(!h||h.profitabilityProven!==true)reasons.push('Profitabilität nicht nachgewiesen');if(!e||e.stale||!e.news?.feeds?.every(f=>f.status==='read'))reasons.push('Nachrichtenabdeckung unvollständig oder veraltet');if(news.length)reasons.push('Relevante Nachrichten als zusätzlicher Risikokontext prüfen');return {...p,assessment:{status:'not-validated',reasons,executionEnabled:false},news,newsChecked:!!e&&!e.stale&&e.news?.feeds?.some(f=>f.status==='read')};})};};

 return {snapshot:enriched,cycle,start(){if(!timer){void cycle();timer=setInterval(()=>void cycle(),1000);}},close(){closed=true;clearInterval(timer);return busy;}};

}

export async function readMarket({python,terminal,login,server,script,start=0,watch=[],dayWindow=null}){const {stdout}=await promisify(execFile)(python,[script,'--terminal',terminal,'--login',String(login),'--server',server,'--start',String(start),...watch.slice(0,100).flatMap(symbol=>['--watch',symbol]),...(dayWindow?['--day-start',String(dayWindow.startsAt),'--day-end',String(dayWindow.endsAt)]:[])],{timeout:45000,maxBuffer:1048576,windowsHide:true});return JSON.parse(stdout);}

