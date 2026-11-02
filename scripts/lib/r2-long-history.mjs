import {dailyIndicators,dailyStats} from './daily-reversion.mjs';
const DAY=86400000;
export function r2Features(bars) {
 for(let i=0;i<bars.length;i++)if(!Number.isSafeInteger(bars[i].time)||bars[i].time%DAY||i&&bars[i].time<=bars[i-1].time)throw Error('Invalid session chronology');
 // SMA/RSI use completed trading observations, not calendar-day interpolation.
 return dailyIndicators(bars.map((b,i)=>({...b,time:i*DAY})));
}
export function r2LongBacktest(bars,market,costs,start,end,initialCapital=10000) {
 if(!['SPY','crypto'].includes(market)||!Number.isFinite(initialCapital)||initialCapital<=0||end<=start)throw Error('Invalid backtest');
 const f=r2Features(bars),trades=[],equity=[],tails=[];
 if(![costs.spreadBps,costs.slippageBps,...(market==='crypto'?[costs.feeBps]:[costs.perShare,costs.minFee,costs.regulatorySellBps])].every(x=>Number.isFinite(x)&&x>=0))throw Error('Invalid costs');
 const slip=(costs.spreadBps/2+costs.slippageBps)/10000;
 const commission=(q,p,sell=false)=>market==='crypto'?q*p*costs.feeBps/10000:
  Math.min(q*p*.01,Math.max(costs.minFee,q*costs.perShare))+(sell?q*p*costs.regulatorySellBps/10000:0);
 let cash=initialCapital,position=null,pending=null;
 function close(i,raw,reason,exitSignalIndex=null) {
  const p=position,exit=raw*(1-slip),exitFee=commission(p.quantity,exit,true),fee=p.entryFee+exitFee;
  const net=(exit-p.entry)*p.quantity-fee+p.dividends;
  cash+=p.quantity*exit-exitFee;
  trades.push({...p,exitIndex:i,exitSignalIndex,rawExit:raw,exit,exitFee,fee,net,netReturn:net/p.capitalBefore,reason,
   holdingDays:(bars[i].time-bars[p.entryIndex].time)/DAY+(reason==='boundary'?1:0),holdingSessions:i-p.entryIndex+(reason==='boundary'?1:0)});position=null;
 }
 for(let i=0;i<bars.length;i++) {
  const b=bars[i];if(b.time<start||b.time>=end)continue;
  const last=i===bars.length-1||bars[i+1].time>=end;
  // Ex-date accrual belongs to positions held before today's open, including sales today.
  if(position&&b.dividend){const paid=position.quantity*b.dividend;cash+=paid;position.dividends+=paid;}
  if(pending) {
   if(pending.type==='exit'&&position)close(i,b.open,'signal',pending.signalIndex);
   else if(pending.type==='entry'&&!position&&!last){
    const entry=b.open*(1+slip),capitalBefore=cash;
    let quantity=market==='crypto'?cash/(entry*(1+costs.feeBps/10000)):Math.floor(cash/entry);
    while(quantity>0&&quantity*entry+commission(quantity,entry)>cash+1e-9)quantity--;
    if(quantity>0){const entryFee=commission(quantity,entry);cash-=quantity*entry+entryFee;
     position={signalIndex:pending.signalIndex,entryIndex:i,rawEntry:b.open,entry,quantity,entryFee,capitalBefore,dividends:0,worstLow:entry,worstLiquidationReturn:0};}
   }
   pending=null;
  }
  const held=!!position;
  if(position){const p=position;p.worstLow=Math.min(p.worstLow,b.low);const exit=b.low*(1-slip);
   p.worstLiquidationReturn=Math.min(p.worstLiquidationReturn,(cash+p.quantity*exit-commission(p.quantity,exit,true))/p.capitalBefore-1);}
  if(last&&position){tails.push({entryIndex:position.entryIndex,boundaryIndex:i});close(i,b.close,'boundary');}
  equity.push({time:b.time+DAY,equity:cash+(position?position.quantity*b.close:0),held});
  if(!last){const a=f[i],buy=i>=4&&a.sma200!==null&&b.close>a.sma200&&f[i-2].rsi2<65&&f[i-1].rsi2<f[i-2].rsi2&&a.rsi2<f[i-1].rsi2;
   if(position&&a.rsi2>75)pending={type:'exit',signalIndex:i};else if(!position&&buy)pending={type:'entry',signalIndex:i};}
 }
 return {market,costs,stats:dailyStats(trades,equity,initialCapital),trades,equity,tails,liveAuthorized:false};
}
