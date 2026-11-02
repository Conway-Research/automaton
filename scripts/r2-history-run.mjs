import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {r2LongBacktest} from './lib/r2-long-history.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'outputs/r2-history-20261019');
const sha=x=>createHash('sha256').update(x).digest('hex');
const power=()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));if(p.enabled!==false)throw Error('OFF required');return {enabled:false,revision:p.revision};};
const before=power();if(fs.existsSync(path.join(out,'protocol.json')))throw Error('Do not overwrite an existing run');
const plan=JSON.parse(fs.readFileSync(path.join(out,'acquisition-plan.json'),'utf8'));
const crypto={low:{feeBps:10,spreadBps:1,slippageBps:1},base:{feeBps:10,spreadBps:4,slippageBps:3},stress:{feeBps:10,spreadBps:10,slippageBps:10}};
const spy={low:{perShare:.005,minFee:1,regulatorySellBps:.5,spreadBps:1,slippageBps:1},
 base:{perShare:.005,minFee:1,regulatorySellBps:.5,spreadBps:2,slippageBps:2},
 stress:{perShare:.01,minFee:2,regulatorySellBps:1,spreadBps:10,slippageBps:10}};
const dataHashes=Object.fromEntries(['ETHUSDT','BTCUSDT','SPY'].map(s=>[s,sha(fs.readFileSync(path.join(out,`normalized-${s}.json`)))]));
const protocol={registeredAt:new Date().toISOString(),plan,rule:'Unchanged Improved R2: raw close above SMA200; RSI2 two sessions ago<65, then two strictly falling RSI2 readings. Buy next session open; sell next session open after RSI2>75. No stop, long-only, one fully paid position.',
 costs:{crypto,SPY:spy},commissionReference:'https://www.interactivebrokers.com/en/pricing/commissions-stocks.php',
 costsStatus:'Public IBKR Pro Fixed fee anchors checked 2026-10-19, not an authenticated personal or historical broker tariff. Whole shares; fee min(1% of notional,max(minTicket,shares*perShare)); additional regulatory sell buffer. Spread/slippage assumptions, not measured quotes. No FX, taxes, custody, cash interest or opportunity cost.',
 capital:'10000 synthetic USD/USDT independently at every stage; compounding, whole SPY shares, fractional crypto, no leverage. Not production budget.',
 dividends:'SPY raw quote OHLC for signals/fills; adjusted-close unused. Gross cash dividend accrual on ex-date only for holders from prior close. Credit simplified to ex-date instead of payment date, no reinvestment until next trade. No tax withholding modeled; results before tax.',
 calendar:'SPY trading-observation SMA/RSI, NYSE holiday and special-closure calendar checked against all source observations. Crypto every UTC day. Actual elapsed holding days retained.',
 boundaries:'Start every stage flat, past-only indicator warmup, mandatory final-close liquidation with costs for open tails, separately report boundary and signal-only rates. No new entry on last session.',
 dataReuse:'Native daily crypto archives remove old 5m March2023 exclusion and subsequent reset; not directly identical to the earlier dataset. Historical stages overlap previous research; not a pristine independent holdout. 2026 extension is newly evaluated for R2, but not prospectively collected.',
 sourceComparison:'Additional SPY 1995-2006 proxy with next-open execution for published SPX 1995-2006 claim; different instrument/execution, no exact 84.31% replication claim.',
 fixedParameters:true,optimization:false,selection:false,codeSha256:sha(fs.readFileSync(path.join(root,'scripts/lib/r2-long-history.mjs'))),
 sharedStatsCodeSha256:sha(fs.readFileSync(path.join(root,'scripts/lib/daily-reversion.mjs'))),dataHashes,networkCalls:false,productionWrites:false,liveAuthorized:false};
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const results=[];
for(const symbol of ['ETHUSDT','BTCUSDT','SPY']) {
 const bars=JSON.parse(fs.readFileSync(path.join(out,`normalized-${symbol}.json`),'utf8'));
 const periods=(symbol==='SPY'?plan.spyPeriods:plan.cryptoPeriods).map(x=>[...x]);
 if(symbol==='SPY')periods.push(['original-window-proxy','1995-01-01','2007-01-01']);
 for(const [period,startDate,endDate] of periods)for(const [scenario,costs] of Object.entries(symbol==='SPY'?spy:crypto)) {
  const run=r2LongBacktest(bars,symbol==='SPY'?'SPY':'crypto',costs,Date.parse(startDate+'T00:00:00Z'),Date.parse(endDate+'T00:00:00Z'));
  const trades=run.trades.map(t=>({...t,signalDate:bars[t.signalIndex].date,entryDate:bars[t.entryIndex].date,exitDate:bars[t.exitIndex].date,exitSignalDate:t.exitSignalIndex===null?null:bars[t.exitSignalIndex].date}));
  const detailsFile=`run-${symbol}-${period}-${scenario}.json`;
  fs.writeFileSync(path.join(out,detailsFile),JSON.stringify({...run,trades,symbol,period,startDate,endDate}));
  results.push({symbol,period,startDate,endDate,scenario,costs,stats:run.stats,dividendIncome:trades.reduce((a,t)=>a+t.dividends,0),detailsFile});
  console.log(`${symbol} ${period} ${scenario}: ${run.stats.wins}/${run.stats.trades} = ${run.stats.winRate===null?'n/a':(100*run.stats.winRate).toFixed(2)+'%'} net wins; account return ${(100*run.stats.netReturn).toFixed(2)}%`);
 }
}
const after=power();if(before.revision!==after.revision)throw Error('External power revision changed');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({protocol,results,powerBefore:before,powerAfter:after},null,2));
