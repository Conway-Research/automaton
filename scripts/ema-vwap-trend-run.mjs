import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {backtest} from './lib/ema-vwap-offline.mjs';
import {parseFiveMinuteCsv,summarizeHistory} from './lib/ema-vwap-history.mjs';
import {candidates,trendBacktest,chooseCandidate} from './lib/ema-vwap-trend.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'outputs/ema-vwap-trend-20261019'),dataDir=path.join(root,'outputs/ema-vwap-extended-20261019');
const sha=x=>createHash('sha256').update(x).digest('hex');
const power=()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(p.enabled!==false)throw Error('OFF required');return {enabled:p.enabled,revision:p.revision};};
const before=power();
if(fs.existsSync(path.join(out,'protocol.json')))throw Error('Experiment already exists; refuse overwrite');
fs.mkdirSync(out,{recursive:true});
const prior=JSON.parse(fs.readFileSync(path.join(dataDir,'protocol.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(dataDir,'download-manifest.json'),'utf8'));
const protocol={registeredAt:new Date().toISOString(),candidates,costScenarios:prior.costScenarios,
  training:'2022-2023, excluding March 2023',validation:'2024',test:'2025',
  selection:'Highest equal-asset average of mean net bp/trade at base cost on training only; nonempty sample on both assets; lexical id tie break. If best is negative, still evaluate once as diagnostic, never claim profitability.',
  evaluation:'Only locked winner on validation then test, all three fixed cost models. No selection, veto, fallback or tuning after training.',
  trend:'5m EMA200 seeded with first 200 closes; price above/below EMA and EMA rising/falling vs 12 completed bars ago.',
  risk:'At next-open executed entry, max(positive distance to signal extreme, 2*Wilder ATR14 at signal close, 0.5% or 1% of entry). Target 2R/3R. Stop first if ambiguous; next-open counter-cross exit; UTC day end exit.',
  indicatorHistory:'Prior price context retained across split boundaries; no prior-period trades admitted. EMA/ATR restarted after excluded March 2023, never across a missing interval.',
  limits:'Temporal separation for new candidate selection only. All years previously evaluated on original strategy; not an independently unseen holdout. Fees and spread/slippage/short borrow assumptions unchanged; no historical quote/borrow verification. 1 base unit, no account return.',
  shortBorrowBpsPerStartedHour:1,liveAuthorized:false,productionWrites:false,networkCalls:false,
  codeSha256:sha(fs.readFileSync(path.join(root,'scripts/lib/ema-vwap-trend.mjs')))};
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const quality=new Map();
function load(symbol,endYear) {
  const segments=[];let bars=[];
  for(const a of manifest.archives.filter(a=>a.symbol===symbol&&a.year<=endYear)) {
    const name=`${symbol}-5m-${a.year}-${String(a.month).padStart(2,'0')}`,key=`${symbol}-${a.year}-${a.month}`;
    const raw=fs.readFileSync(path.join(dataDir,'data',name+'.csv'));
    if(sha(raw)!==a.csvSha256)throw Error('Changed historical CSV');
    let month;
    try{month=parseFiveMinuteCsv(raw.toString('utf8'),Date.UTC(a.year,a.month-1,1),Date.UTC(a.year,a.month,1));}
    catch(e){quality.set(key,{symbol,month:name.slice(-7),status:'excluded',reason:e.message});if(bars.length)segments.push(bars);bars=[];continue;}
    quality.set(key,{symbol,month:name.slice(-7),status:'valid',rows:month.length});
    if(bars.length&&bars.at(-1).time+300000!==month[0].time)throw Error('Undeclared gap');
    bars.push(...month);
  }
  if(bars.length)segments.push(bars);return segments;
}
function summarize(trades,bars) {
  const s=summarizeHistory(trades,bars,1);
  for(const [side,filter] of Object.entries({all:()=>true,long:t=>t.direction===1,short:t=>t.direction===-1})) {
    const chosen=trades.filter(filter);
    s[side].meanNetBpsPerTrade=chosen.length?chosen.reduce((acc,t)=>{
      const hours=Math.max(1,Math.ceil((bars[t.exitIndex].time-bars[t.entryIndex].time)/3600000));
      return acc+t.net/t.entry*10000-(t.direction===-1?hours:0);
    },0)/chosen.length:null;
  }
  return s;
}
function evaluate(symbol,segments,c,scenario,period,start,baseline=false) {
  const allBars=[],allTrades=[];
  for(const segment of segments) {
    const offset=allBars.length;
    const run=baseline?backtest(segment,c.variant,prior.costScenarios[scenario]):trendBacktest(segment,c,prior.costScenarios[scenario],start);
    for(const b of segment)allBars.push(b);
    for(const t of run.trades)if(segment[t.signalIndex].time>=start)allTrades.push({...t,signalIndex:t.signalIndex+offset,entryIndex:t.entryIndex+offset,exitIndex:t.exitIndex+offset});
  }
  const stats=summarize(allTrades,allBars),monthly=[];
  const years=period==='train'?[2022,2023]:period==='validation'?[2024]:[2025];
  for(const year of years)for(let m=1;m<=12;m++) {
    const key=`${year}-${String(m).padStart(2,'0')}`,trades=allTrades.filter(t=>allBars[t.entryIndex].session.startsWith(key));
    monthly.push({month:key,status:quality.get(`${symbol}-${year}-${m}`).status,stats:summarize(trades,allBars)});
  }
  const id=baseline?`original-${c.variant}`:c.id;
  const tradesFile=`trades-${period}-${symbol}-${id}-${scenario}.json`;
  fs.writeFileSync(path.join(out,tradesFile),JSON.stringify(allTrades.map(t=>({...t,
    signalAt:new Date(allBars[t.signalIndex].time+300000).toISOString(),entryAt:new Date(allBars[t.entryIndex].time).toISOString(),
    exitBarStart:new Date(allBars[t.exitIndex].time).toISOString()}))));
  const result={period,symbol,candidateId:id,baseline,scenario,costs:prior.costScenarios[scenario],stats,monthly,tradesFile};
  console.log(`${period} ${symbol} ${id} ${scenario}: ${stats.all.trades} trades, ${stats.all.meanNetBpsPerTrade?.toFixed(3)} bp/trade`);
  return result;
}
const training=[],selectionRows=[];
for(const symbol of ['ETHUSDT','BTCUSDT']) {
  const segments=load(symbol,2023);
  for(const c of candidates)for(const scenario of ['low','base','stress']) {
    const r=evaluate(symbol,segments,c,scenario,'train',Date.UTC(2022,0,1));training.push(r);
    if(scenario==='base')selectionRows.push({candidateId:c.id,symbol,period:'train',scenario,mean:r.stats.all.meanNetBpsPerTrade,trades:r.stats.all.trades});
  }
  for(const variant of ['cross','early'])for(const scenario of ['low','base','stress'])training.push(evaluate(symbol,segments,{variant},scenario,'train',Date.UTC(2022,0,1),true));
}
fs.writeFileSync(path.join(out,'training.json'),JSON.stringify(training,null,2));
const selection=chooseCandidate(selectionRows),selected=candidates.find(c=>c.id===selection.candidateId);
const lock={lockedAt:new Date().toISOString(),selected,selection,trainingSha256:sha(fs.readFileSync(path.join(out,'training.json'))),
  note:'Committed before loading ANY validation or test prices in this experiment. Historical original-strategy results were already known.'};
fs.writeFileSync(path.join(out,'selection-lock.json'),JSON.stringify(lock,null,2));
console.log('LOCKED:',selected.id,selection.score);
const evaluations=[];
for(const [period,year] of [['validation',2024],['test',2025]])for(const symbol of ['ETHUSDT','BTCUSDT']) {
  const segments=load(symbol,year);
  for(const scenario of ['low','base','stress']) {
    evaluations.push(evaluate(symbol,segments,selected,scenario,period,Date.UTC(year,0,1)));
    for(const variant of ['cross','early'])evaluations.push(evaluate(symbol,segments,{variant},scenario,period,Date.UTC(year,0,1),true));
  }
}
const after=power();if(after.revision!==before.revision)throw Error('External power revision change');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({protocol,lock,training,evaluations,quality:[...quality.values()],powerBefore:before,powerAfter:after},null,2));
