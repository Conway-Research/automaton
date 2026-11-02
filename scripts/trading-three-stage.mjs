import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {strategySignal} from '../dist/revenue/strategy-research.js';
import {sizeFractionalPaper} from '../dist/revenue/fractional-paper-sizing.js';
import {fractionalPaperQuote} from '../dist/revenue/paper-trading.js';
import {eventOpportunityAudit} from '../dist/revenue/event-opportunity.js';
const dir='artifacts/trading-three-stage-20261011';fs.mkdirSync(dir,{recursive:true});
const save=(n,v)=>fs.writeFileSync(`${dir}/${n}`,JSON.stringify(v,null,2),{flag:'wx'});
const hash=v=>createHash('sha256').update(v).digest('hex');
const old='artifacts/trading-comparison-20261011';
const p=JSON.parse(fs.readFileSync(`${old}/protocol.json`));
const rules={scale:1000000,stepAtoms:10,minAtoms:10,maxAtoms:1000000000,minNotionalCents:500};
const variants=p.families.flatMap(family=>p.lookbacks.map(lookback=>({id:`${family}-${lookback}`,family,lookback,thresholdBps:p.thresholdBps,stopBps:p.stopBps,targetBps:p.targetBps})));
const friction={feeBps:p.feeBpsPerSide,slippageBps:p.slippageBpsPerSide};
save('protocol.json',{createdAt:new Date().toISOString(),originalProtocolHash:hash(fs.readFileSync(`${old}/protocol.json`)),rules,friction,variants,paperDurationMs:300000,pollMs:15000,capitalCents:10000,independentProfitabilityEvidence:false,liveAuthorized:false,notes:'Fractional model comparison uses same training gate and fixed parameters. Hypothetical lot rules, not verified account rules. Fresh paper uses completed 15-minute bars, decisions at next observed quote; no fabricated candle-open fills. Five minutes is an operational sample, not validation. Synthetic event outcomes are isolated from decision routine, not an independent human/LLM blind examination.'});
function run(bars,train,test,capital,vs,f,selections){
 let equity=capital,peak=capital,dd=0,rejected=0;const trades=[],chosen=[];
 for(let start=train,w=0;start+test<=bars.length;start+=test,w++){
  const training=bars.slice(start-train,start);
  let id;
  if(selections)id=selections[w];else{
   const warm=Math.max(...vs.map(v=>v.lookback));
   const candidates=vs.map(v=>{const r=run(training,warm,training.length-warm,capital,[v],f,[v.id]);return {id:v.id,score:r.net-r.dd,eligible:r.net>0&&r.trades.length>=p.minTrainingTrades&&r.rejected===0&&r.dd<=capital*p.maxTrainingClosedDrawdownFraction};});
   id=candidates.filter(c=>c.eligible&&c.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))[0]?.id??null;
  }
  chosen.push(id);if(!id)continue;const signal=strategySignal(vs.find(v=>v.id===id),'paper');
  for(let i=start;i<start+test;i++){
   const plan=signal(bars.slice(0,i),bars[i].open);if(!plan)continue;
   const size=sizeFractionalPaper(plan.entryCents,plan.stopCents,equity,Math.floor(equity*.01),rules,f);
   if(!size){rejected++;continue;}
   let j=i,price,reason;
   for(;j<start+test;j++){const b=bars[j];if(b.low<=plan.stopCents){price=Math.min(b.open,plan.stopCents);reason='stop';break;}if(b.high>=plan.targetsCents[0]){price=plan.targetsCents[0];reason='target';break;}}
   if(price===undefined){j=start+test-1;price=bars[j].close;reason='window_end';}
   const q=fractionalPaperQuote(plan.entryCents,price,size.atoms,rules,f);equity+=q.netPnlCents;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);
   trades.push({entryTime:bars[i].time,exitTime:bars[j].time,entry:plan.entryCents,exit:price,reason,...q});i=j;
  }
 }
 return {net:equity-capital,finalEquity:equity,dd,rejected,trades,selections:chosen};
}
const normalize=rows=>rows.map(r=>({time:r[0],open:Math.round(Number(r[1])*100),high:Math.ceil(Number(r[2])*100),low:Math.floor(Number(r[3])*100),close:Math.round(Number(r[4])*100)}));
const reports=[];
for(const symbol of p.symbols){const raw=fs.readFileSync(`${old}/${symbol}-raw.json`);const bars=normalize(JSON.parse(raw));
 for(const capital of p.capitalQuoteUnits)for(const candidate of [null,...variants]){
  const vs=candidate?[candidate]:variants;const base=run(bars,p.trainSize,p.testSize,capital*100,vs,friction);
  const stress=[2,3].map(m=>({multiplier:m,...run(bars,p.trainSize,p.testSize,capital*100,vs,{feeBps:friction.feeBps*m,slippageBps:friction.slippageBps*m},base.selections)}));
  reports.push({symbol,capital,strategy:candidate?.id??'training-selector',rawHash:hash(raw),base,stress});
 }
}
save('fractional-results.json',reports);console.log('STEP1',JSON.stringify(reports.filter(r=>r.strategy==='training-selector').map(r=>({symbol:r.symbol,capital:r.capital,net:r.base.net,trades:r.base.trades.length,stress:r.stress.map(s=>s.net)}))));
// Outcome producer and decision consumer are separate; no result is supplied to audit.
const common={sourceUrl:'https://example.org/synthetic-case',invalidation:'Correction, stale quote, halt or price limit breach',exitRule:'Stop at scenario loss, target at scenario gain; exit at expiry if executable',probabilityBasis:'Synthetic supplied range, uncalibrated',decisionMs:10000,publishedMs:9000,receivedMs:9100,processedMs:9200,expiresMs:20000,quoteMs:9900,maxQuoteAgeMs:1000,executionLatencyMs:100,gainIfRight:20,lossIfWrong:5,roundTripCost:1,stressedRoundTripCost:2,probabilityLow:.6,probabilityHigh:.7,stressLoss:8,lossBudget:10,sourceChecked:true,publicInformation:true,conflictingEvidence:false,halted:false,depthSufficient:true,exitAvailable:true};
const cases=[['recycled-headline',{sourceChecked:false}],['stale-quote',{quoteMs:5000}],['syndicated-source',{sourceChecked:false}],['already-priced',{gainIfRight:3}],['missing-second-leg',{exitAvailable:false}],['unique-valid',{}],['halt',{halted:true}]].map(([eventId,change])=>({...common,eventId,...change}));
save('event-inputs.json',cases);
save('event-outcomes-hidden.json',[12,8,-4,9,7,-5,15]);
const decisions=JSON.parse(fs.readFileSync(`${dir}/event-inputs.json`)).map(x=>({eventId:x.eventId,recordedAt:new Date().toISOString(),entry:x.eventId==='unique-valid'?'hypothetical paper entry only':'abstain',expiresMs:x.expiresMs,invalidation:x.invalidation,exitRule:x.exitRule,audit:eventOpportunityAudit(x)}));
save('event-decisions.json',decisions);save('event-decision-commitment.json',{sha256:hash(fs.readFileSync(`${dir}/event-decisions.json`)),committedAt:new Date().toISOString()});
const outcomes=JSON.parse(fs.readFileSync(`${dir}/event-outcomes-hidden.json`));save('event-reveal.json',{revealedAt:new Date().toISOString(),cases:decisions.map((d,i)=>({eventId:d.eventId,decision:d.audit.disposition,syntheticCounterfactualOutcome:outcomes[i]})),independentSkillAssessment:false});console.log('STEP2 decisions committed before reveal');
async function get(path){const r=await fetch(`https://api.binance.com/api/v3/${path}`,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`Public data HTTP ${r.status}`);return r.json();}
const journal=`${dir}/paper-journal.jsonl`;let chain='';
function log(v){const record={recordedAt:new Date().toISOString(),previousHash:chain,...v};const body=JSON.stringify(record);chain=hash(body);fs.appendFileSync(journal,JSON.stringify({record,...{sha256:chain}})+'\n');}
const states=[];
for(const symbol of p.symbols){const rows=await get(`klines?symbol=${symbol}&interval=15m&limit=310`);const completed=rows.filter(r=>r[6]<Date.now());save(`fresh-${symbol}.json`,completed);const bars=normalize(completed).slice(-p.trainSize);
 const warm=Math.max(...variants.map(v=>v.lookback));const candidates=variants.map(v=>{const r=run(bars,warm,bars.length-warm,10000,[v],friction,[v.id]);return {id:v.id,score:r.net-r.dd,eligible:r.net>0&&r.trades.length>=p.minTrainingTrades&&r.rejected===0&&r.dd<=1000};});
 const selected=candidates.filter(c=>c.eligible&&c.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))[0]?.id??null;
 states.push({symbol,bars,selected,equity:10000,position:null,lastBar:bars.at(-1).time});log({type:'selection',symbol,selected,candidates,trainingEnd:bars.at(-1).time});
}
const started=Date.now(),ends=started+300000;log({type:'observation-start',started,ends});
do{
 for(const s of states){try{const before=Date.now();const q=await get(`ticker/bookTicker?symbol=${s.symbol}`);const after=Date.now();const bid=Math.floor(Number(q.bidPrice)*100),ask=Math.ceil(Number(q.askPrice)*100);if(!(bid>0&&ask>=bid))throw Error('Invalid quote');
  let action='abstain',reason='no eligible training candidate';
  if(s.position){const pos=s.position;if(bid<=pos.stop||bid>=pos.target){const value=fractionalPaperQuote(pos.entry,bid,pos.atoms,rules,friction);s.equity+=value.netPnlCents;s.position=null;action='paper-exit';reason=bid<=pos.stop?'stop':'target';log({type:'fill-model',symbol:s.symbol,value});}else{reason='holding until exit or UTC day end';action='hold';}}
  else if(!s.attempted){s.attempted=true;if(s.selected){const plan=strategySignal(variants.find(v=>v.id===s.selected),s.symbol)(s.bars,ask);reason='signal absent';if(plan){const size=sizeFractionalPaper(ask,plan.stopCents,s.equity,100,rules,friction);reason='size unavailable';if(size&&after-before<=2000&&Number(q.askQty)*rules.scale>=size.atoms){s.position={entry:ask,stop:plan.stopCents,target:plan.targetsCents[0],atoms:size.atoms};action='paper-entry';reason='fixed signal with observed ask and displayed size';}else if(size)reason='latency or displayed size insufficient';}}}
  else reason='no new 15-minute decision boundary within fixed observation';
  s.lastBid=bid;log({type:'decision',symbol:s.symbol,before,after,quote:q,action,reason,position:s.position,equity:s.equity,exchangeTimestampAvailable:false});
 }catch(e){log({type:'data-error',symbol:s.symbol,message:String(e)});}}
 console.log('PAPER',new Date().toISOString());if(Date.now()<ends)await new Promise(r=>setTimeout(r,Math.min(15000,ends-Date.now())));
}while(Date.now()<ends);
save('paper-summary.json',{started,ended:Date.now(),finalJournalHash:chain,accounts:states.map(s=>({symbol:s.symbol,realizedNetCents:s.equity-10000,openPosition:s.position,markedNetCents:s.position?fractionalPaperQuote(s.position.entry,s.lastBid,s.position.atoms,rules,friction).netPnlCents:0})),limits:'Five minutes only. No fills confirmed; displayed quote and size are not guaranteed executions. No future-data access at decisions. Open positions remain open; liquidation marks are hypothetical. Separate 100 USDT virtual accounts. No HFT performance or profitability established.',liveAuthorized:false});console.log('COMPLETE');
