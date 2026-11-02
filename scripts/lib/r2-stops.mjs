/** Fixed protective stops for isolated R2 research. No order adapters. */
import {r2Features,r2LongBacktest} from './r2-long-history.mjs';
import {dailyStats} from './daily-reversion.mjs';
const DAY=86400000;
export const stopVariants=Object.freeze([
 Object.freeze({id:'none',type:'none'}),Object.freeze({id:'fixed5',type:'fixed',fraction:.05}),
 Object.freeze({id:'fixed10',type:'fixed',fraction:.10}),Object.freeze({id:'fixed15',type:'fixed',fraction:.15}),
 Object.freeze({id:'atr3',type:'atr',multiple:3})]);
export function atr14(bars) {
 let value=0;
 return bars.map((b,i)=>{
  const tr=i?Math.max(b.high-b.low,Math.abs(b.high-bars[i-1].close),Math.abs(b.low-bars[i-1].close)):b.high-b.low;
  if(i<14)value+=tr/14;else value=(13*value+tr)/14;
  return i<13?null:value;
 });
}
export function stopPrice(entry,variant,atr) {
 if(variant.type==='none')return null;
 const stop=variant.type==='fixed'?entry*(1-variant.fraction):entry-variant.multiple*atr;
 return Number.isFinite(stop)&&stop>0&&stop<entry?stop:null;
}
export function r2StopBacktest(bars,market,costs,start,end,variant,initialCapital=10000) {
 if(!stopVariants.some(v=>JSON.stringify(v)===JSON.stringify(variant)))throw Error('Unregistered stop');
 if(variant.id==='none')return r2LongBacktest(bars,market,costs,start,end,initialCapital);
 if(!['SPY','crypto'].includes(market)||!Number.isFinite(initialCapital)||initialCapital<=0||end<=start)throw Error('Invalid research settings');
 const f=r2Features(bars),atr=atr14(bars),trades=[],equity=[],tails=[];
 if(![costs.spreadBps,costs.slippageBps,...(market==='crypto'?[costs.feeBps]:[costs.perShare,costs.minFee,costs.regulatorySellBps])].every(x=>Number.isFinite(x)&&x>=0))throw Error('Invalid costs');
 const slip=(costs.spreadBps/2+costs.slippageBps)/10000;
 const commission=(q,p,sell=false)=>market==='crypto'?q*p*costs.feeBps/10000:
  Math.min(q*p*.01,Math.max(costs.minFee,q*costs.perShare))+(sell?q*p*costs.regulatorySellBps/10000:0);
 let cash=initialCapital,position=null,pending=null,rejectedInvalidStop=0;
 function markLow(raw) {
  const p=position;p.worstLow=Math.min(p.worstLow,raw);const exit=raw*(1-slip);
  p.worstLiquidationReturn=Math.min(p.worstLiquidationReturn,(cash+p.quantity*exit-commission(p.quantity,exit,true))/p.capitalBefore-1);
 }
 function close(i,raw,reason,exitSignalIndex=null) {
  const p=position;markLow(raw);
  const exit=raw*(1-slip),exitFee=commission(p.quantity,exit,true),fee=p.entryFee+exitFee;
  const net=(exit-p.entry)*p.quantity-fee+p.dividends;cash+=p.quantity*exit-exitFee;
  trades.push({...p,exitIndex:i,exitSignalIndex,rawExit:raw,exit,exitFee,fee,net,netReturn:net/p.capitalBefore,reason,
   holdingDays:(bars[i].time-bars[p.entryIndex].time)/DAY+(reason==='boundary'?1:0),holdingSessions:i-p.entryIndex+(reason==='boundary'?1:0)});position=null;
 }
 for(let i=0;i<bars.length;i++) {
  const b=bars[i];if(b.time<start||b.time>=end)continue;
  const last=i===bars.length-1||bars[i+1].time>=end;
  if(position&&b.dividend){const paid=position.quantity*b.dividend;cash+=paid;position.dividends+=paid;}
  const heldAtOpen=!!position;
  // A pre-existing protective stop executes through an opening gap, even if
  // an RSI exit was also scheduled. Both use the observed adverse open.
  if(position&&b.open<=position.stop){close(i,b.open,'gap-stop');pending=null;}
  if(pending) {
   if(pending.type==='exit'&&position)close(i,b.open,'signal',pending.signalIndex);
   else if(pending.type==='entry'&&!position&&!last){
    const entry=b.open*(1+slip),capitalBefore=cash,stop=stopPrice(entry,variant,atr[pending.signalIndex]);
    if(stop===null)rejectedInvalidStop++;
    else {
     let quantity=market==='crypto'?cash/(entry*(1+costs.feeBps/10000)):Math.floor(cash/entry);
     while(quantity>0&&quantity*entry+commission(quantity,entry)>cash+1e-9)quantity--;
     if(quantity>0){const entryFee=commission(quantity,entry);cash-=quantity*entry+entryFee;
      position={signalIndex:pending.signalIndex,entryIndex:i,rawEntry:b.open,entry,quantity,entryFee,capitalBefore,
       stop,stopId:variant.id,signalATR14:atr[pending.signalIndex],dividends:0,worstLow:entry,worstLiquidationReturn:0};}
    }
   }
   pending=null;
  }
  const held=heldAtOpen||!!position;
  // On entry day the stop is already active. Do not mark later lows as if
  // the position were still held after a stop execution.
  if(position&&b.low<=position.stop)close(i,position.stop,'stop');
  else if(position)markLow(b.low);
  if(last&&position){tails.push({entryIndex:position.entryIndex,boundaryIndex:i});close(i,b.close,'boundary');}
  equity.push({time:b.time+DAY,equity:cash+(position?position.quantity*b.close:0),held});
  if(!last){const a=f[i],buy=i>=4&&a.sma200!==null&&b.close>a.sma200&&f[i-2].rsi2<65&&f[i-1].rsi2<f[i-2].rsi2&&a.rsi2<f[i-1].rsi2;
   if(position&&a.rsi2>75)pending={type:'exit',signalIndex:i};else if(!position&&buy)pending={type:'entry',signalIndex:i};}
 }
 const stats=dailyStats(trades,equity,initialCapital);
 // The shared helper predates protective stops. Stops are strategy exits,
 // not forced data/period-boundary liquidations.
 stats.boundaryTrades=trades.filter(t=>t.reason==='boundary').length;
 stats.strategyExitTrades=trades.length-stats.boundaryTrades;
 return {market,costs,variant,rejectedInvalidStop,stats,trades,equity,tails,liveAuthorized:false};
}
