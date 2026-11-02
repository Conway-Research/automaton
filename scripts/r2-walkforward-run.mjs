import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {stopVariants,r2StopBacktest} from './lib/r2-stops.mjs';
import {annualWalkforward,drawdownDuration} from './lib/r2-walkforward.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'outputs/r2-walkforward-20261019'),source=path.join(root,'outputs/r2-history-20261019');
const sha=x=>createHash('sha256').update(x).digest('hex');
const power=()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(p.enabled!==false)throw Error('OFF required');return {enabled:false,revision:p.revision};};
const before=power();if(fs.existsSync(path.join(out,'protocol.json')))throw Error('Preserve existing experiment');fs.mkdirSync(out,{recursive:true});
const history=JSON.parse(fs.readFileSync(path.join(source,'results.json'),'utf8'));
const config=[{symbol:'ETHUSDT',stop:'fixed10',firstYear:2021},{symbol:'SPY',stop:'fixed5',firstYear:1997}];
const protocol={registeredAt:new Date().toISOString(),config,costs:history.protocol.costs,
 window:'Three immediately preceding calendar years as reference only; next calendar year as observation window; step one year. 2026 January-September separately. No model fitted, no parameter optimization, no candidate replacement or trading gate based on reference performance.',
 execution:'One continuous OOS simulation per asset, exit mode and cost, from first test year through September2026. No year-end forced sale or capital reset. Only final September2026 boundary liquidation.',
 features:'All available preceding observations for causal indicator history. Three-year reference is an independently reported past-only comparison, not parameter training.',
 annualMetrics:'Calendar-year account return/drawdown from carried year-start equity, close-to-close. Trade cohort grouped by entry year; cross-year exits counted, as-of-year-end closed-only win rate also supplied. No double counting into total trades.',
 evidenceLimit:'Stops were selected after viewing parts of this same history in previous experiments. Retrospective fixed-rule rolling validation, not independent unseen out-of-sample evidence or a re-trained adaptive strategy.',
 referenceCapital:'References start separately with 10000 synthetic USD/USDT. Continuous OOS starts once with 10000 and carries capital/positions over years. Same original fees, gross dividends, gap stops, whole SPY shares and mark-to-market limitations.',
 dataHashes:history.protocol.dataHashes,
 hashes:Object.fromEntries(['lib/r2-stops.mjs','lib/r2-long-history.mjs','lib/daily-reversion.mjs','lib/r2-walkforward.mjs','r2-stops-report.py'].map(f=>[f,sha(fs.readFileSync(path.join(root,'scripts',f)))])),
 networkCalls:false,productionWrites:false,liveAuthorized:false};
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const results=[],references=[];
for(const c of config) {
 const raw=fs.readFileSync(path.join(source,`normalized-${c.symbol}.json`));if(sha(raw)!==history.protocol.dataHashes[c.symbol])throw Error('Data changed');const bars=JSON.parse(raw);
 for(const [scenario,costs] of Object.entries(c.symbol==='SPY'?history.protocol.costs.SPY:history.protocol.costs.crypto))for(const mode of [c.stop,'none']) {
  const variant=stopVariants.find(v=>v.id===mode),market=c.symbol==='SPY'?'SPY':'crypto';
  const startDate=`${c.firstYear}-01-01`,endDate='2026-10-01';
  const run=r2StopBacktest(bars,market,costs,Date.parse(startDate+'T00:00:00Z'),Date.parse(endDate+'T00:00:00Z'),variant);
  const trades=run.trades.map(t=>({...t,signalDate:bars[t.signalIndex].date,entryDate:bars[t.entryIndex].date,exitDate:bars[t.exitIndex].date,exitSignalDate:t.exitSignalIndex===null?null:bars[t.exitSignalIndex].date}));
  const annual=annualWalkforward(run.equity,trades),duration=drawdownDuration(run.equity);
  let streak=0,longestLosingTradeStreak=0;for(const t of trades){streak=t.net<0?streak+1:0;longestLosingTradeStreak=Math.max(streak,longestLosingTradeStreak);}
  const completedYears=annual.filter(a=>a.year<=2025),detailsFile=`run-${c.symbol}-${scenario}-${mode}.json`;
  fs.writeFileSync(path.join(out,detailsFile),JSON.stringify({...run,trades,annual,duration,symbol:c.symbol,scenario,mode,startDate,endDate}));
  results.push({symbol:c.symbol,scenario,costs,mode,startDate,endDate,stop:variant,stats:run.stats,annual,duration,longestLosingTradeStreak,
   completedYears:completedYears.length,profitableYears:completedYears.filter(a=>a.netReturn>0).length,
   entryCohort75Years:completedYears.filter(a=>a.entryCohort.winRate!==null&&a.entryCohort.winRate>=.75).length,
   yearsWithEntries:completedYears.filter(a=>a.entryCohort.trades>0).length,
   worstYear:completedYears.reduce((a,b)=>a.netReturn<b.netReturn?a:b),detailsFile});
  for(let year=c.firstYear;year<=2026;year++) {
   const refStart=`${year-3}-01-01`,refEnd=`${year}-01-01`;
   const ref=r2StopBacktest(bars,market,costs,Date.parse(refStart+'T00:00:00Z'),Date.parse(refEnd+'T00:00:00Z'),variant);
   references.push({symbol:c.symbol,scenario,costs,mode,stop:variant,followingYear:year,startDate:refStart,endDate:refEnd,stats:ref.stats});
  }
  console.log(`${c.symbol} ${scenario} ${mode}: ${run.stats.wins}/${run.stats.trades} wins; ${(100*run.stats.netReturn).toFixed(2)}% total; ${(100*run.stats.maxCloseDrawdownFraction).toFixed(2)}% DD; profitable years ${results.at(-1).profitableYears}/${completedYears.length}`);
 }
}
for(const x of results) {
 const base=results.find(b=>b.symbol===x.symbol&&b.scenario===x.scenario&&b.mode==='none');
 x.annual=x.annual.map(a=>{const b=base.annual.find(b=>b.year===a.year);return {...a,baselineAnnualDrawdown:b.maxCloseDrawdownFraction,
  simultaneousPass:a.entryCohort.winRate!==null&&a.entryCohort.winRate>=.75&&a.netReturn>0&&a.maxCloseDrawdownFraction<b.maxCloseDrawdownFraction-1e-12};});
}
const after=power();if(before.revision!==after.revision)throw Error('External power change');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({protocol,results,references,powerBefore:before,powerAfter:after},null,2));
