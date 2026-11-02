/** Frozen candidate with counter-cross exit removed. Pure local research. */
import {signals} from './ema-vwap-offline.mjs';
import {candidates,trendFeatures,trendAllows,entryPlan} from './ema-vwap-trend.mjs';

export function noCrossBacktest(bars,c,costs,tradeStart=0) {
  if(c.id!=='cross-stop1-R3'||!candidates.some(x=>x.id===c.id&&x.variant===c.variant&&x.rewardR===c.rewardR&&x.minStopFraction===c.minStopFraction))throw Error('Only frozen candidate allowed');
  if(!costs||![costs.feeBps,costs.spreadBps,costs.slippageBps].every(x=>Number.isFinite(x)&&x>=0&&x<=1000))throw Error('Invalid costs');
  const s=signals(bars,c.variant),features=trendFeatures(bars),trades=[];
  const adverse=(costs.spreadBps/2+costs.slippageBps)/10000;
  let position=null,pending=null;
  function close(i,raw,reason) {
    const p=position,exit=raw*(1-p.direction*adverse),fee=(p.entry+exit)*costs.feeBps/10000;
    const gross=p.direction*(raw-p.rawEntry),net=p.direction*(exit-p.entry)-fee;
    trades.push({...p,exitIndex:i,rawExit:raw,exit,fee,gross,net,cost:gross-net,reason});position=null;
  }
  for(let i=1;i<bars.length;i++) {
    const b=bars[i],last=i===bars.length-1||bars[i+1].session!==b.session;
    if(pending) {
      const q=pending;pending=null;
      if(q.session===b.session&&!last) {
        const entry=b.open*(1+q.direction*adverse),plan=entryPlan(q.direction,entry,bars[q.signalIndex],features[q.signalIndex].atr14,c);
        if(plan)position={...q,entryIndex:i,rawEntry:b.open,entry,...plan};
      }
    }
    if(position) {
      const p=position,long=p.direction===1;
      if(long?b.open<=p.stop:b.open>=p.stop)close(i,b.open,'gap-stop');
      else if(long?b.low<=p.stop:b.high>=p.stop)close(i,p.stop,'stop-first');
      else if(long?b.high>=p.target:b.low<=p.target)close(i,p.target,'target');
      else if(last)close(i,b.close,'session-end');
    }
    if(!position&&!last&&b.time>=tradeStart&&s[i].direction&&trades.at(-1)?.exitIndex!==i&&trendAllows(s[i].direction,b.close,features[i]))
      pending={direction:s[i].direction,signalIndex:i,session:b.session,signalClose:b.close,signalLow:b.low,signalHigh:b.high,
        signalEma200:features[i].ema200,signalEma200Past12:features[i].ema200Past12,signalATR14:features[i].atr14};
  }
  return {candidate:c,costs,trades,liveAuthorized:false};
}
