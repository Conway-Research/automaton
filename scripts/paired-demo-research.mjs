// Research only. This module has no broker, order, controller-write or promotion API.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {openStrategyOptimization,RULES} from './trading-optimization.mjs';
import {evaluateStrategy} from './trading-strategies.mjs';
const profiles=['baseline','spread','trend'];
export function observePairedResearch({file,market:m,now=Date.now(),powerAllowed,expectedBinding,cohort='legacy'}){
 if(!powerAllowed)return {status:'off',executionEnabled:false};
 if(m?.readOnly!==true||m.executionEnabled!==false||m.accountBinding?.demo!==true||m.accountBinding.tradeMode!==0||m.account?.mode!==0||m.account.identity!==String(expectedBinding?.login)||m.account.server!==expectedBinding?.server||!Number.isFinite(m.account.observedAt)||now-m.account.observedAt>15000||m.account.observedAt>now+1000)throw Error('Fresh pinned read-only demo inputs required');
 const catalog=new Set((m.scan?.cryptoUniverse??[]).map(x=>x.symbol));
 if(!['legacy','61'].includes(cohort))throw Error('Unknown research policy');
 const policy={version:cohort==='61'?'paired-crypto-61-v1':'paired-crypto-100-v1',historyBars:cohort==='61'?61:100,maxResearchWatchSymbols:20,quoteGapLimitMs:15000};
 const instruments=(m.instruments??[]).filter(x=>catalog.has(x.symbol)||x.costTerms?.path?.startsWith('Cryptocurrencies\\')).map(x=>cohort==='61'?{...x,closedBars:Array.isArray(x.closedBars)?x.closedBars.slice(-61):x.closedBars}:x);
 const guard=new Database(file);
 try{guard.exec('CREATE TABLE IF NOT EXISTS paired_binding(id INTEGER PRIMARY KEY CHECK(id=1),identity TEXT NOT NULL,server TEXT NOT NULL);');
  const binding=guard.prepare('SELECT * FROM paired_binding WHERE id=1').get();
  if(binding&&(binding.identity!==m.account.identity||binding.server!==m.account.server))throw Error('Research cohort binding changed');
  guard.prepare('INSERT OR IGNORE INTO paired_binding VALUES(1,?,?)').run(m.account.identity,m.account.server);
  guard.exec('CREATE TABLE IF NOT EXISTS paired_policy(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);');
  const frozen=guard.prepare('SELECT payload FROM paired_policy WHERE id=1').get();
  if(frozen&&frozen.payload!==JSON.stringify(policy))throw Error('Research cohort policy changed');
  guard.prepare('INSERT OR IGNORE INTO paired_policy VALUES(1,?)').run(JSON.stringify(policy));
 }finally{guard.close();}
 const input={...m,instruments};let study;
 try{
  study=openStrategyOptimization(file,()=>now);study.observe(input,now,true);
  const snapshot=study.snapshot(now);const db=new Database(file);let observations,summary;
  try{
   db.exec('CREATE TABLE IF NOT EXISTS paired_observations(id INTEGER PRIMARY KEY AUTOINCREMENT,at REAL NOT NULL,payload TEXT NOT NULL);');
   const signals=evaluateStrategy({id:'numaron-breakout20-v1',rules:{kind:'breakout20'},source:{verified:true,reference:'scripts/trading-strategies.mjs'}},input,now);
   const admission=signals.map(s=>{const b=instruments.find(r=>r.symbol===s.symbol).closedBars;return {symbol:s.symbol,signalId:s.signalId,reason:b.at(-1).time*1000+300000<=snapshot.startedAt?'closed_before_cohort_start':b.some((x,i)=>i&&x.time-b[i-1].time!==300)?'noncontiguous_history':'evaluated_by_fixed_profiles'};});
   const id=db.prepare('INSERT INTO paired_observations(at,payload) VALUES(?,?)').run(now,JSON.stringify({cryptoProducts:instruments.length,capable:instruments.filter(x=>x.capability).length,admission})).lastInsertRowid;
   db.prepare('DELETE FROM paired_observations WHERE id <= ?').run(Number(id)-5000);
   observations=db.prepare('SELECT COUNT(*) n,MIN(at) firstAt,MAX(at) lastAt FROM paired_observations').get();
   summary=profiles.map(profile=>{const rows=db.prepare('SELECT status,payload,result FROM strategy_opt_records WHERE version=? AND profile=?').all(RULES.version,profile);
    const closed=rows.filter(x=>x.status==='closed').map(x=>JSON.parse(x.result));const complete=closed.filter(x=>!x.coverageGap&&Number.isFinite(x.grossR));
    return {...snapshot.variants.find(x=>x.id===profile),priceObservationsComplete:complete.length,priceOnlyR:complete.reduce((n,x)=>n+x.grossR,0),pairedSignals:rows.map(x=>JSON.parse(x.payload).signalId).length};});
  }finally{db.close();}
  return {status:'collecting',executionEnabled:false,liveAuthorized:false,profitabilityProven:false,automaticPromotion:false,cohortPolicy:policy,startedAt:snapshot.startedAt,observedAt:now,rules:snapshot.rules,rulesDigest:snapshot.rulesDigest,observations,variants:summary,admissionLimited:snapshot.archiveFull,
   watchCoverage:m.researchWatch??null,
   captureContext:'Regular demo market reads; up to20 additional bound open research symbols share the existing100-symbol quote capacity. Existing watches have priority. Quote gaps remain unknown and their limit stays15s.',
   limitations:['Hypothetical observations, no broker orders or guaranteed fills.','Bid/ask includes spread; additional slippage is a model scenario.','Crypto commission, funding and actual slippage remain unverified; missing costs are not zero.','Sampled quote gaps remain unknown outcomes; no profitability winner is declared.','Only future signals with closed bars after the fixed cohort start are enrolled.','No automatic strategy changes or promotion.']};
 }finally{study?.close();}
}
export function renderPairedResearch(s){const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const names={baseline:'Basisstrategie',spread:'Spreadfilter ≤ 10 % der Stop-Distanz',trend:'Trendfilter: Richtung der vorhandenen Durchschnittsregel'};
 return '<!doctype html><html lang="de"><meta charset="utf-8"><title>Numaron · Automatischer Strategievergleich</title><style>body{font:16px system-ui;background:#101c2b;color:#e4edf7;margin:35px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #435366;text-align:left}pre{white-space:pre-wrap}</style><h1>Automatischer Krypto-Strategievergleich</h1><p>Reine Forschung · keine Orders · keine automatische Strategieübernahme.</p><p>Start: '+esc(new Date(s.startedAt).toISOString())+' · letzter Abruf: '+esc(new Date(s.observedAt).toISOString())+' (UTC)</p><p>'+esc(s.observations.n)+' gespeicherte Abrufe. Bericht wird nach regulären Abrufen aktualisiert. Wieder öffnen oder aktualisieren.</p><table><tr><th>Variante</th><th>Offen</th><th>Ausgefiltert</th><th>Abgeschlossen</th><th>Verlauf unklar</th><th>Kosten unvollständig</th><th>Nur Preismodell: R</th></tr>'+s.variants.map(v=>'<tr>'+[names[v.id],v.open,v.filtered,v.closed,v.unknown,v.costPending,v.priceOnlyR.toFixed(3)].map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</table><p>R ist die anfängliche Stop-Distanz. Das Preismodell enthält Bid/Ask, aber keinen vollständigen Kosten- oder Ausführungsnachweis. Null bei fehlenden abgeschlossenen Beobachtungen ist kein gemessener Gewinn. Unbekannte Verläufe werden nicht als Nullergebnis gewertet.</p><p>Ein identisches Signal wird mit festen Regeln verglichen. Ein ausgefiltertes Signal bedeutet Nichtteilnahme. Überlappende Signale werden im jeweiligen Profil nach den bestehenden Regeln begrenzt; Summen sind daher kein gepaarter Beweis und keine Portfoliorendite.</p><p>Kein validierter Forschungsgewinner. Fehlende Kosten und Datenlücken verhindern eine Profitabilitätsaussage.</p><details><summary>Regeln, Nachweise und Grenzen</summary><pre>'+esc(JSON.stringify(s,null,2))+'</pre></details></html>';
}
const root=path.resolve(import.meta.dirname,'..');
function allowed(){let db;try{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(p.enabled!==true)return false;db=new Database(path.join(root,'artifacts/founder-autonomy-20261013/controller.db'),{readonly:true});return db.prepare('SELECT status FROM founder_control WHERE id=1').get()?.status==='running';}catch{return false;}finally{db?.close();}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>1048576)throw Error('Oversized research input');chunks.push(chunk);}
 const market=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!allowed()){console.log(JSON.stringify({status:'off',executionEnabled:false}));}else{
  const expectedBinding=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/mt5-demo-profile.json'),'utf8'));
  const dir=path.join(root,'artifacts/demo-execution-20261017');
  const results=[];
  for(const cohort of ['legacy','61']){
   if(!allowed())break;
   const suffix=cohort==='61'?'-61':'';
   const result=observePairedResearch({file:path.join(dir,'paired-crypto-research'+suffix+'.db'),market,powerAllowed:allowed(),expectedBinding,cohort});results.push(result.status);
   if(result.status!=='off')for(const [name,body] of [['paired-research'+suffix+'.json',JSON.stringify(result,null,2)],['paired-research'+suffix+'.html',renderPairedResearch(result).replace('<h1>Automatischer Krypto-Strategievergleich</h1>','<h1>Automatischer Krypto-Strategievergleich · '+result.cohortPolicy.historyBars+' Kerzen</h1>')]]){const file=path.join(dir,name);fs.writeFileSync(file+'.tmp',body);fs.renameSync(file+'.tmp',file);}
  }
  console.log(JSON.stringify({status:results.includes('collecting')?'collecting':'off',executionEnabled:false}));
 }
}
