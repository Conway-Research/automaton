import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {backtest} from './lib/ema-vwap-offline.mjs';
import {parseFiveMinuteCsv,summarizeHistory} from './lib/ema-vwap-history.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'outputs/ema-vwap-extended-20261019');
const power=()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(p.enabled!==false)throw Error('Expected OFF');return {enabled:p.enabled,revision:p.revision};};
const before=power();
if(fs.existsSync(path.join(out,'results.json')))throw Error('Results already exist; refuse overwrite');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'download-manifest.json'),'utf8'));
if(manifest.errors.length||manifest.archives.length!==96)throw Error('Incomplete downloads');
const prior=JSON.parse(fs.readFileSync(path.join(root,'outputs/ema-vwap-historical-20261019/protocol.json'),'utf8'));
const protocol={...prior,registeredAt:new Date().toISOString(),symbols:['ETHUSDT','BTCUSDT'],
  symbol:undefined,source:undefined,archiveSha256:undefined,csvSha256:undefined,rows:undefined,quantityUnit:undefined,
  period:'2022-01-01 inclusive to 2026-01-01 exclusive',
  selection:'All 96 preselected monthly archives; invalid months excluded and listed. No interpolation. EMA restarts only after excluded gaps.',
  quantity:'1 base asset unit per trade; compare normalized bp per trade, not absolute BTC vs ETH PnL',
  parametersOptimized:false,independentHoldout:false,dataReuse:'Fixed historical extension, retrospective evaluation. No claim of unseen holdout.',
  shortBorrowBpsPerHour:1,productionWrites:false};
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const quality=[],results=[];
function stats(trades,bars) {
  const s=summarizeHistory(trades,bars,1);
  for(const [side,filter] of Object.entries({all:()=>true,long:t=>t.direction===1,short:t=>t.direction===-1})) {
    const chosen=trades.filter(filter);
    const bp=chosen.map(t=>{
      const hours=Math.max(1,Math.ceil((bars[t.exitIndex].time-bars[t.entryIndex].time)/3600000));
      return t.net/t.entry*10000-(t.direction===-1?hours:0);
    });
    s[side].meanNetBpsPerTrade=bp.length?bp.reduce((a,b)=>a+b,0)/bp.length:null;
  }
  return s;
}
for(const symbol of ['ETHUSDT','BTCUSDT']) {
  let bars=[],segments=[];
  for(const source of manifest.archives.filter(a=>a.symbol===symbol)) {
    const name=`${symbol}-5m-${source.year}-${String(source.month).padStart(2,'0')}`;
    const file=fs.readFileSync(path.join(out,'data',name+'.csv'));
    if(createHash('sha256').update(file).digest('hex')!==source.csvSha256)throw Error('CSV integrity failure');
    const start=Date.UTC(source.year,source.month-1,1),end=Date.UTC(source.year,source.month,1);
    try {
      const month=parseFiveMinuteCsv(file.toString('utf8'),start,end);
      if(bars.length&&bars.at(-1).time+300000!==month[0].time){segments.push(bars);bars=[];}
      // Spread-call exceeds engine argument limits for large arrays; each month is bounded.
      bars.push(...month);
      quality.push({symbol,month:name.slice(-7),status:'valid',rows:month.length});
    } catch(e) {
      quality.push({symbol,month:name.slice(-7),status:'excluded',reason:e.message,expectedRows:(end-start)/300000,actualRows:file.toString('utf8').trim().split(/\r?\n/).length});
      if(bars.length){segments.push(bars);bars=[];}
    }
  }
  if(bars.length)segments.push(bars);
  // Evaluate each continuous segment without artificial month/year EMA resets.
  for(const variant of ['cross','early'])for(const [scenario,costs] of Object.entries(prior.costScenarios)) {
    const allBars=[],allTrades=[];
    for(const segment of segments) {
      const offset=allBars.length,run=backtest(segment,variant,costs);
      for(const b of segment)allBars.push(b);
      for(const t of run.trades)allTrades.push({...t,signalIndex:t.signalIndex+offset,entryIndex:t.entryIndex+offset,exitIndex:t.exitIndex+offset});
    }
    const overall=stats(allTrades,allBars),monthly=[],yearly=[];
    for(let year=2022;year<=2025;year++) {
      const yearTrades=allTrades.filter(t=>new Date(allBars[t.entryIndex].time).getUTCFullYear()===year);
      yearly.push({year,...stats(yearTrades,allBars)});
      for(let m=1;m<=12;m++) {
        const key=`${year}-${String(m).padStart(2,'0')}`;
        const monthTrades=yearTrades.filter(t=>allBars[t.entryIndex].session.startsWith(key));
        const q=quality.find(q=>q.symbol===symbol&&q.month===key);
        monthly.push({month:key,dataStatus:q.status,...stats(monthTrades,allBars)});
      }
    }
    const annotated=allTrades.map(t=>({...t,entryAt:new Date(allBars[t.entryIndex].time).toISOString(),exitBarStart:new Date(allBars[t.exitIndex].time).toISOString()}));
    const tradesFile=`trades-${symbol}-${variant}-${scenario}.json`;
    fs.writeFileSync(path.join(out,tradesFile),JSON.stringify(annotated));
    results.push({symbol,variant,scenario,costs,rows:allBars.length,segments:segments.length,overall,yearly,monthly,tradesFile});
    console.log(`${symbol} ${variant} ${scenario}: ${overall.all.trades} trades, ${overall.all.net.toFixed(2)} USDT, ${overall.all.meanNetBpsPerTrade?.toFixed(3)} bp/trade`);
  }
}
const after=power();if(after.revision!==before.revision)throw Error('Power revision changed externally');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({protocol,quality,results,powerBefore:before,powerAfter:after},null,2));
console.log('Excluded months:',JSON.stringify(quality.filter(q=>q.status!=='valid')));
