import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {noCrossBacktest} from './lib/ema-vwap-no-cross.mjs';
import {trendBacktest} from './lib/ema-vwap-trend.mjs';
import {parseFiveMinuteCsv,summarizeHistory} from './lib/ema-vwap-history.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'outputs/ema-vwap-no-cross-20261019');
const dataDir=path.join(root,'outputs/ema-vwap-extended-20261019');
const sha=x=>createHash('sha256').update(x).digest('hex');
const power=()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(p.enabled!==false)throw Error('OFF required');return {enabled:p.enabled,revision:p.revision};};
const before=power();
if(fs.existsSync(path.join(out,'protocol.json')))throw Error('Preserve existing experiment');
fs.mkdirSync(out,{recursive:true});
const previous=JSON.parse(fs.readFileSync(path.join(root,'outputs/ema-vwap-trend-20261019/results.json'),'utf8'));
const selected=previous.lock.selected;
if(selected.id!=='cross-stop1-R3')throw Error('Unexpected selection');
const costs=previous.protocol.costScenarios;
const manifest=JSON.parse(fs.readFileSync(path.join(dataDir,'download-manifest.json'),'utf8'));
const protocol={registeredAt:new Date().toISOString(),candidate:selected,change:'Remove counter-cross exit only; stop, target and UTC session close remain',
  training:'2022-2023, excluding March 2023',validation:'2024',test:'2025',
  selection:'No new candidate selection or optimization; use previous frozen cross-stop1-R3 for both exit modes.',
  costScenarios:costs,shortBorrowBpsPerStartedHour:1,
  limits:'All historical periods have been viewed in earlier experiments. Temporal reporting separation, not an independent untouched holdout. Plausible cost scenarios, no measured historical spread/slippage/borrow. Spot shorts hypothetical.',
  codeSha256:sha(fs.readFileSync(path.join(root,'scripts/lib/ema-vwap-no-cross.mjs'))),
  priorCodeSha256:sha(fs.readFileSync(path.join(root,'scripts/lib/ema-vwap-trend.mjs'))),
  priorResultsSha256:sha(fs.readFileSync(path.join(root,'outputs/ema-vwap-trend-20261019/results.json'))),
  networkCalls:false,productionWrites:false,liveAuthorized:false};
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const quality=new Map(),results=[];
function load(symbol,endYear) {
  const segments=[];let bars=[];
  for(const a of manifest.archives.filter(a=>a.symbol===symbol&&a.year<=endYear)) {
    const name=`${symbol}-5m-${a.year}-${String(a.month).padStart(2,'0')}`,raw=fs.readFileSync(path.join(dataDir,'data',name+'.csv'));
    if(sha(raw)!==a.csvSha256)throw Error('CSV hash changed');
    let month;
    try{month=parseFiveMinuteCsv(raw.toString('utf8'),Date.UTC(a.year,a.month-1,1),Date.UTC(a.year,a.month,1));}
    catch(e){quality.set(name,{symbol,month:name.slice(-7),status:'excluded',reason:e.message});if(bars.length)segments.push(bars);bars=[];continue;}
    quality.set(name,{symbol,month:name.slice(-7),status:'valid',rows:month.length});
    if(bars.length&&bars.at(-1).time+300000!==month[0].time)throw Error('Unexpected gap');
    bars.push(...month);
  }
  if(bars.length)segments.push(bars);return segments;
}
function stats(trades,bars) {
  const s=summarizeHistory(trades,bars,1);
  for(const [side,filter] of Object.entries({all:()=>true,long:t=>t.direction===1,short:t=>t.direction===-1})) {
    const chosen=trades.filter(filter);
    s[side].meanNetBpsPerTrade=chosen.length?chosen.reduce((a,t)=>a+t.net/t.entry*10000-(t.direction===-1?Math.max(1,Math.ceil((bars[t.exitIndex].time-bars[t.entryIndex].time)/3600000)):0),0)/chosen.length:null;
  }
  return s;
}
for(const [period,year,startYear] of [['train',2023,2022],['validation',2024,2024],['test',2025,2025]])for(const symbol of ['ETHUSDT','BTCUSDT']) {
  const segments=load(symbol,year),start=Date.UTC(startYear,0,1);
  for(const [scenario,cost] of Object.entries(costs))for(const mode of ['with-cross','no-cross']) {
    const bars=[],trades=[];
    for(const segment of segments) {
      const offset=bars.length,run=(mode==='no-cross'?noCrossBacktest:trendBacktest)(segment,selected,cost,start);
      for(const b of segment)bars.push(b);
      for(const t of run.trades)trades.push({...t,signalIndex:t.signalIndex+offset,entryIndex:t.entryIndex+offset,exitIndex:t.exitIndex+offset});
    }
    const monthly=[];
    for(let y=startYear;y<=year;y++)for(let m=1;m<=12;m++) {
      const key=`${y}-${String(m).padStart(2,'0')}`,subset=trades.filter(t=>bars[t.entryIndex].session.startsWith(key));
      monthly.push({month:key,status:quality.get(`${symbol}-5m-${key}`).status,stats:stats(subset,bars)});
    }
    const summary=stats(trades,bars),tradesFile=`trades-${period}-${symbol}-${scenario}-${mode}.json`;
    fs.writeFileSync(path.join(out,tradesFile),JSON.stringify(trades.map(t=>({...t,signalAt:new Date(bars[t.signalIndex].time+300000).toISOString(),entryAt:new Date(bars[t.entryIndex].time).toISOString(),exitBarStart:new Date(bars[t.exitIndex].time).toISOString()}))));
    if(mode==='with-cross') {
      const old=(period==='train'?previous.training:previous.evaluations).find(x=>!x.baseline&&x.period===period&&x.symbol===symbol&&x.scenario===scenario&&x.candidateId===selected.id);
      if(summary.all.trades!==old.stats.all.trades||Math.abs(summary.all.net-old.stats.all.net)>1e-7)throw Error('Old experiment reproduction failed');
    }
    results.push({period,symbol,scenario,costs:cost,mode,stats:summary,monthly,tradesFile});
    console.log(`${period} ${symbol} ${scenario} ${mode}: ${summary.all.trades} trades, ${summary.all.meanNetBpsPerTrade?.toFixed(3)} bp/trade`);
  }
}
const after=power();if(before.revision!==after.revision)throw Error('External power state change');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({protocol,results,quality:[...quality.values()],powerBefore:before,powerAfter:after},null,2));
