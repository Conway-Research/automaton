import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {stopVariants,r2StopBacktest} from './lib/r2-stops.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'outputs/r2-stops-20261019-verified'),priorDir=path.join(root,'outputs/r2-history-20261019');
const sha=x=>createHash('sha256').update(x).digest('hex');
const power=()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(p.enabled!==false)throw Error('OFF required');return {enabled:false,revision:p.revision};};
const before=power();if(fs.existsSync(path.join(out,'protocol.json')))throw Error('Preserve existing experiment');
fs.mkdirSync(out,{recursive:true});
const prior=JSON.parse(fs.readFileSync(path.join(priorDir,'results.json'),'utf8'));
const protocol={registeredAt:new Date().toISOString(),stopVariants,costs:prior.protocol.costs,periods:prior.protocol.plan,
 preliminaryRun:'outputs/r2-stops-20261019 preserved; only boundary-exit accounting corrected before final report, no trading-rule change',
 comparison:'Four fixed protective stops vs unchanged R2 without stop on the same assets, periods and costs; all variants frozen, no selection or optimization.',
 stops:'Fixed 5%,10%,15% below executed entry or 3*Wilder ATR14 from completed signal session. Never trailed or dividend-adjusted. Active on entry day. Opening gap below stop fills at adverse open; intraday touch at stop with spread/slippage. Existing RSI next-open exit retained.',
 dividends:'Unchanged ex-date gross cash accrual for prior-close holders, before gap-stop; no dividend adjustment to stop price. Whole SPY shares and prior commission model retained.',
 reentry:'After stop exit, only a newly completed daily signal can schedule entry at next session open; no reuse of prior pending signal.',
 invalidStop:'ATR stop at or below zero is skipped and rejection count reported; no hidden parameter adjustment.',
 simultaneousPass:'Observed net win rate >=75%, positive net account result, and strictly lower daily-close mark-to-market drawdown than no-stop on same asset, period and cost. Not a guarantee of minimum true win probability.',
 limitations:'Previously viewed history, not a pristine untouched holdout. Stop fill, spread and slippage assumed from daily bars, not actual order-book fills. Gap losses may exceed stop distance. Close-based drawdown misses intraday path. Fees before tax; all earlier limitations retained.',
 capital:prior.protocol.capital,codeSha256:sha(fs.readFileSync(path.join(root,'scripts/lib/r2-stops.mjs'))),
 priorCodeSha256:sha(fs.readFileSync(path.join(root,'scripts/lib/r2-long-history.mjs'))),dataHashes:prior.protocol.dataHashes,
 networkCalls:false,productionWrites:false,liveAuthorized:false};
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const results=[];
for(const symbol of ['ETHUSDT','BTCUSDT','SPY']) {
 const raw=fs.readFileSync(path.join(priorDir,`normalized-${symbol}.json`));if(sha(raw)!==protocol.dataHashes[symbol])throw Error('Data hash mismatch');
 const bars=JSON.parse(raw);
 const settings=prior.results.filter(x=>x.symbol===symbol);
 for(const setting of settings)for(const variant of stopVariants) {
  const {period,scenario,costs,startDate,endDate}=setting;
  const run=r2StopBacktest(bars,symbol==='SPY'?'SPY':'crypto',costs,Date.parse(startDate+'T00:00:00Z'),Date.parse(endDate+'T00:00:00Z'),variant);
  if(variant.id==='none'&&JSON.stringify(run.stats)!==JSON.stringify(setting.stats))throw Error('No-stop reproduction mismatch');
  const baseline=setting.stats,stats=run.stats;
  const pass=stats.meets75PercentObserved&&stats.net>0&&stats.maxCloseDrawdownFraction<baseline.maxCloseDrawdownFraction-1e-12;
  const detailsFile=`run-${symbol}-${period}-${scenario}-${variant.id}.json`;
  const trades=run.trades.map(t=>({...t,signalDate:bars[t.signalIndex].date,entryDate:bars[t.entryIndex].date,exitDate:bars[t.exitIndex].date,exitSignalDate:t.exitSignalIndex===null?null:bars[t.exitSignalIndex].date}));
  fs.writeFileSync(path.join(out,detailsFile),JSON.stringify({...run,trades,symbol,period,scenario,startDate,endDate}));
  results.push({symbol,period,scenario,startDate,endDate,costs,stop:variant,stats,baselineStats:baseline,simultaneousPass:pass,
   rejectedInvalidStop:run.rejectedInvalidStop??0,stopExits:trades.filter(t=>['stop','gap-stop'].includes(t.reason)).length,detailsFile});
 }
 console.log(`${symbol}: evaluated ${settings.length} period/cost settings with five exit modes`);
}
const after=power();if(before.revision!==after.revision)throw Error('External power change');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({protocol,results,powerBefore:before,powerAfter:after},null,2));
for(const x of results.filter(x=>x.simultaneousPass&&x.scenario==='base'))console.log(`PASS base: ${x.symbol} ${x.period} ${x.stop.id} ${x.stats.wins}/${x.stats.trades} DD ${(100*x.stats.maxCloseDrawdownFraction).toFixed(2)}% vs ${(100*x.baselineStats.maxCloseDrawdownFraction).toFixed(2)}%`);
