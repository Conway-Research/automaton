import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseFiveMinuteCsv} from './lib/ema-vwap-history.mjs';
import {strategies,aggregateDaily,dailyBacktest,dailyStats} from './lib/daily-reversion.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'outputs/daily-reversion-20261019'),sourceDir=path.join(root,'outputs/ema-vwap-extended-20261019');
const sha=x=>createHash('sha256').update(x).digest('hex');
const power=()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(p.enabled!==false)throw Error('OFF required');return {enabled:p.enabled,revision:p.revision};};
const before=power();if(fs.existsSync(path.join(out,'protocol.json')))throw Error('Preserve prior experiment');
fs.mkdirSync(out,{recursive:true});
const old=JSON.parse(fs.readFileSync(path.join(sourceDir,'protocol.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(sourceDir,'download-manifest.json'),'utf8'));
const research=JSON.parse(fs.readFileSync(path.join(root,'outputs/high-win-rate-research-20261019/research.json'),'utf8'));
const periods=[{id:'train',start:Date.UTC(2022,0,1),end:Date.UTC(2024,0,1)},
 {id:'validation',start:Date.UTC(2024,0,1),end:Date.UTC(2025,0,1)},
 {id:'test',start:Date.UTC(2025,0,1),end:Date.UTC(2026,0,1)}];
const protocol={registeredAt:new Date().toISOString(),strategies:research.candidates,periods,costScenarios:old.costScenarios,
 fixedRules:true,parameterSearch:false,selection:false,
 execution:'Complete UTC daily candles from local 5m OHLCV; daily-close signals filled at following day open, long-only, one fully paid spot position, no scale-ins or protective stops, multi-day holdings.',
 simulation:'Each market/strategy/period/cost starts with 10000 synthetic USDT, 100% available equity including entry fee, fractional quantity, compounding; no leverage or production capital. Cash carried across data segments within a period.',
 boundaries:'Each period starts flat; past prices for indicator warmup only. Open tails at data/period end recorded and liquidated at final close with costs. No entry on last available day. Boundary trades included in primary net win rate and also reported separately.',
 gaps:'Entire March2023 excluded as in prior experiments; indicator history resets after gap. SMA200 needs 200 complete consecutive daily bars. No interpolation.',
 costs:'10 bp fee each side; spread/slippage low 1/1, base 4/3, stress 10/10 bp; plausible assumptions, not measured historical quotes or personal tariff. Long-only unlevered spot: no borrowing charge.',
 metrics:'Strict net>0 winner; primary win rate includes boundary liquidation, signal-only rate separately. Wilson95 under iid approximation; correlated trades/assets and small counts weaken inference. Daily-close mark-to-market drawdown, worst marked intratrade low liquidation return separately.',
 limitations:'Crypto transfer test, not exact source-equity reproduction. All years previously viewed in other strategies, not an untouched holdout. Daily close drawdown misses intraday portfolio path. No minimum-lot, liquidity, tax or custody model.',
 codeSha256:sha(fs.readFileSync(path.join(root,'scripts/lib/daily-reversion.mjs'))),
 researchSha256:sha(fs.readFileSync(path.join(root,'outputs/high-win-rate-research-20261019/research.json'))),
 networkCalls:false,productionWrites:false,liveAuthorized:false};
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const quality=[],results=[];
for(const symbol of ['ETHUSDT','BTCUSDT']) {
 const segments=[];let bars=[];
 for(const a of manifest.archives.filter(a=>a.symbol===symbol)) {
  const name=`${symbol}-5m-${a.year}-${String(a.month).padStart(2,'0')}`,raw=fs.readFileSync(path.join(sourceDir,'data',name+'.csv'));
  if(sha(raw)!==a.csvSha256)throw Error('Historical CSV changed');
  let month;
  try{month=aggregateDaily(parseFiveMinuteCsv(raw.toString('utf8'),Date.UTC(a.year,a.month-1,1),Date.UTC(a.year,a.month,1)));}
  catch(e){quality.push({symbol,month:name.slice(-7),status:'excluded',reason:e.message});if(bars.length)segments.push(bars);bars=[];continue;}
  quality.push({symbol,month:name.slice(-7),status:'valid',dailyBars:month.length});
  if(bars.length&&bars.at(-1).time+86400000!==month[0].time)throw Error('Unexplained gap');
  bars.push(...month);
 }
 if(bars.length)segments.push(bars);
 fs.writeFileSync(path.join(out,`daily-${symbol}.json`),JSON.stringify(segments));
 for(const strategy of strategies)for(const period of periods)for(const [scenario,costs] of Object.entries(old.costScenarios)) {
  const trades=[],equity=[],tails=[];let capital=10000;
  for(const [segmentId,segment] of segments.entries()) {
   if(segment.at(-1).time<period.start||segment[0].time>=period.end)continue;
   const run=dailyBacktest(segment,strategy,costs,period.start,period.end,capital);capital=run.stats.endingCapital;
   trades.push(...run.trades.map(t=>({...t,segmentId,signalAt:new Date(segment[t.signalIndex].time+86400000).toISOString(),
    entryAt:new Date(segment[t.entryIndex].time).toISOString(),exitAt:new Date(segment[t.exitIndex].time+(t.reason==='boundary'?86400000:0)).toISOString(),
    exitSignalAt:t.exitSignalIndex===null?null:new Date(segment[t.exitSignalIndex].time+86400000).toISOString()})));
   equity.push(...run.equity);tails.push(...run.tails.map(t=>({...t,segmentId})));
  }
  const stats=dailyStats(trades,equity,10000),detailsFile=`run-${symbol}-${strategy}-${period.id}-${scenario}.json`;
  fs.writeFileSync(path.join(out,detailsFile),JSON.stringify({symbol,strategy,period,scenario,costs,stats,trades,equity,tails}));
  results.push({symbol,strategy,period:period.id,scenario,costs,stats,detailsFile});
  console.log(`${symbol} ${strategy} ${period.id} ${scenario}: ${stats.wins}/${stats.trades} net wins, ${stats.winRate===null?'n/a':(100*stats.winRate).toFixed(2)+'%'}, net ${stats.net.toFixed(2)} USDT`);
 }
}
const after=power();if(before.revision!==after.revision)throw Error('External power state change');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({protocol,quality,results,powerBefore:before,powerAfter:after},null,2));
