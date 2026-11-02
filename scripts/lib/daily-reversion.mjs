/** Pure offline daily mean-reversion research. No runtime or network imports. */
const DAY=86400000;
export const strategies=['improved-r2','double7','ibs-rsi2'];
export function aggregateDaily(bars) {
 if(!Array.isArray(bars)||!bars.length||bars.length%288)throw Error('Incomplete UTC day');
 const out=[];
 for(let i=0;i<bars.length;i+=288) {
  const block=bars.slice(i,i+288),start=block[0].time;
  if(start%DAY||block.some((b,j)=>b.time!==start+j*300000)||i&&start!==bars[i-1].time+300000)throw Error('Gapped UTC day');
  out.push({time:start,open:block[0].open,high:Math.max(...block.map(b=>b.high)),low:Math.min(...block.map(b=>b.low)),
   close:block.at(-1).close,volume:block.reduce((a,b)=>a+b.volume,0)});
 }
 return out;
}
export function dailyIndicators(bars) {
 if(!Array.isArray(bars)||bars.length<3||bars.length>10000)throw Error('Invalid daily sample');
 let sum=0,gain=0,loss=0;
 return bars.map((b,i)=>{
  if(!b||!Number.isSafeInteger(b.time)||b.time%DAY||[b.open,b.high,b.low,b.close,b.volume].some(v=>!Number.isFinite(v)||v<=0)||
   b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||i&&b.time-bars[i-1].time!==DAY)throw Error('Invalid or gapped daily OHLCV');
  sum+=b.close;if(i>=200)sum-=bars[i-200].close;
  if(i){const d=b.close-bars[i-1].close,g=Math.max(d,0),l=Math.max(-d,0);
   if(i<=2){gain+=g/2;loss+=l/2;}else{gain=(gain+g)/2;loss=(loss+l)/2;}}
  const rsi2=i<2?null:gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
  return {sma200:i>=199?sum/200:null,rsi2,ibs:b.high===b.low?.5:(b.close-b.low)/(b.high-b.low)};
 });
}
export function dailyRule(strategy,bars,f,i) {
 if(!strategies.includes(strategy))throw Error('Unknown strategy');
 const a=f[i],b=bars[i];if(!a||a.rsi2===null)return {buy:false,sell:false};
 if(strategy==='improved-r2')return {buy:i>=4&&a.sma200!==null&&b.close>a.sma200&&f[i-2].rsi2<65&&f[i-1].rsi2<f[i-2].rsi2&&a.rsi2<f[i-1].rsi2,sell:a.rsi2>75};
 if(strategy==='ibs-rsi2')return {buy:a.ibs<.2&&a.rsi2<10,sell:i>0&&b.close>bars[i-1].high};
 if(i<6)return {buy:false,sell:false};
 const closes=bars.slice(i-6,i+1).map(x=>x.close);
 return {buy:a.sma200!==null&&b.close>a.sma200&&b.close===Math.min(...closes),sell:b.close===Math.max(...closes)};
}
export function wilson(wins,n) {
 if(!n)return null;
 const z=1.959963984540054,p=wins/n,den=1+z*z/n,center=(p+z*z/(2*n))/den;
 const half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 return {low:Math.max(0,center-half),high:Math.min(1,center+half)};
}
export function dailyBacktest(bars,strategy,costs,start,end,initialCapital=10000) {
 if(!strategies.includes(strategy)||!costs||![costs.feeBps,costs.spreadBps,costs.slippageBps].every(v=>Number.isFinite(v)&&v>=0&&v<=1000)||
  !Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||!Number.isFinite(initialCapital)||initialCapital<=0)throw Error('Invalid research settings');
 const f=dailyIndicators(bars),trades=[],equity=[];
 const adverse=(costs.spreadBps/2+costs.slippageBps)/10000,rate=costs.feeBps/10000;
 let cash=initialCapital,position=null,pending=null,peak=initialCapital,dd=0,exposed=0;
 const tails=[];
 function close(i,raw,reason,exitSignalIndex=null) {
  const p=position,exit=raw*(1-adverse),fee=(p.entry+exit)*p.quantity*rate,net=(exit-p.entry)*p.quantity-fee;
  cash=p.quantity*exit*(1-rate);
  trades.push({...p,exitIndex:i,exitSignalIndex,rawExit:raw,exit,reason,fee,net,netReturn:net/p.capitalBefore,
   holdingDays:(bars[i].time-bars[p.entryIndex].time)/DAY+(reason==='boundary'?1:0),
   worstLiquidationReturn:p.quantity*p.worstLow*(1-adverse)*(1-rate)/p.capitalBefore-1});
  position=null;
 }
 for(let i=0;i<bars.length;i++) {
  const b=bars[i];if(b.time<start||b.time>=end)continue;
  const last=i===bars.length-1||bars[i+1].time>=end;
  if(pending) {
   if(pending.type==='exit'&&position)close(i,b.open,'signal',pending.signalIndex);
   else if(pending.type==='entry'&&!position&&!last){
    const entry=b.open*(1+adverse),quantity=cash/(entry*(1+rate));
    position={entryIndex:i,signalIndex:pending.signalIndex,rawEntry:b.open,entry,quantity,capitalBefore:cash,worstLow:entry};cash=0;
   }
   pending=null;
  }
  const held=!!position;
  if(position){position.worstLow=Math.min(position.worstLow,b.low);exposed++;}
  if(last&&position){tails.push({entryIndex:position.entryIndex,boundaryIndex:i,rawMark:b.close});close(i,b.close,'boundary');}
  const value=position?cash+position.quantity*b.close:cash;
  peak=Math.max(peak,value);dd=Math.max(dd,1-value/peak);
  equity.push({time:b.time+DAY,equity:value,held});
  if(!last){const signal=dailyRule(strategy,bars,f,i);
   if(position&&signal.sell)pending={type:'exit',signalIndex:i};
   else if(!position&&signal.buy)pending={type:'entry',signalIndex:i};
  }
 }
 const stats=dailyStats(trades,equity,initialCapital);
 return {strategy,costs,initialCapital,stats,trades,equity,tails,liveAuthorized:false};
}
export function dailyStats(trades,equity,initialCapital=10000) {
 const cash=equity.at(-1)?.equity??initialCapital;
 let peak=initialCapital,dd=0;
 for(const e of equity){peak=Math.max(peak,e.equity);dd=Math.max(dd,1-e.equity/peak);}
 const exposed=equity.filter(e=>e.held).length;
 const wins=trades.filter(t=>t.net>0),losses=trades.filter(t=>t.net<0),profit=wins.reduce((a,t)=>a+t.net,0),loss=-losses.reduce((a,t)=>a+t.net,0);
 const natural=trades.filter(t=>t.reason==='signal');
 const stats={trades:trades.length,wins:wins.length,winRate:trades.length?wins.length/trades.length:null,
  winRateWilson95:wilson(wins.length,trades.length),net:trades.reduce((a,t)=>a+t.net,0),endingCapital:cash,
  netReturn:cash/initialCapital-1,meanNetReturn:trades.length?trades.reduce((a,t)=>a+t.netReturn,0)/trades.length:null,
  profitFactor:loss?profit/loss:null,averageWinReturn:wins.length?wins.reduce((a,t)=>a+t.netReturn,0)/wins.length:null,
  averageLossReturn:losses.length?losses.reduce((a,t)=>a+t.netReturn,0)/losses.length:null,
  worstTradeReturn:trades.length?Math.min(...trades.map(t=>t.netReturn)):null,
  worstLiquidationReturn:trades.length?Math.min(...trades.map(t=>t.worstLiquidationReturn)):null,
  maxCloseDrawdownFraction:dd,exposureFraction:equity.length?exposed/equity.length:0,
  meanHoldingDays:trades.length?trades.reduce((a,t)=>a+t.holdingDays,0)/trades.length:null,
  boundaryTrades:trades.length-natural.length,naturalExitTrades:natural.length,
  naturalExitWinRate:natural.length?natural.filter(t=>t.net>0).length/natural.length:null,
  meets75PercentObserved:trades.length>0&&wins.length/trades.length>=.75,
  positiveNet:cash>initialCapital};
 return stats;
}
