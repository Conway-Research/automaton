/** Isolated research implementation. No network, runtime, accounts or orders. */
import {signals,indicators} from './ema-vwap-offline.mjs';

export const candidates=Object.freeze(['cross','early'].flatMap(variant=>[0.005,0.01].flatMap(minStopFraction=>[2,3].map(rewardR=>
  Object.freeze({id:`${variant}-stop${minStopFraction*100}-R${rewardR}`,variant,minStopFraction,rewardR})))));

export function trendFeatures(bars) {
  indicators(bars);
  let ema=0,seed=0,atr=0;
  const result=[];
  bars.forEach((b,i)=>{
    if(i<200)seed+=b.close;
    if(i===199)ema=seed/200;else if(i>199)ema+=(2/201)*(b.close-ema);
    const tr=i?Math.max(b.high-b.low,Math.abs(b.high-bars[i-1].close),Math.abs(b.low-bars[i-1].close)):b.high-b.low;
    if(i<14)atr+=tr/14;else atr=(atr*13+tr)/14;
    result.push({ema200:i>=199?ema:null,ema200Past12:i>=211?result[i-12].ema200:null,atr14:i>=13?atr:null});
  });
  return result;
}
export function trendAllows(direction,close,f) {
  if(!f||f.ema200===null||f.ema200Past12===null)return false;
  return direction===1?close>f.ema200&&f.ema200>f.ema200Past12:
    direction===-1?close<f.ema200&&f.ema200<f.ema200Past12:false;
}
export function entryPlan(direction,entry,signal,atr,c) {
  const original=direction===1?entry-signal.low:signal.high-entry;
  if(original<=0)return null;
  const risk=Math.max(original,2*atr,entry*c.minStopFraction);
  return {risk,stop:entry-direction*risk,target:entry+direction*c.rewardR*risk};
}
export function chooseCandidate(rows) {
  if(rows.some(r=>r.period!=='train'||r.scenario!=='base'))throw Error('Selection accepts base-cost development only');
  const ranking=candidates.map(c=>{
    const pair=['ETHUSDT','BTCUSDT'].map(symbol=>rows.find(r=>r.candidateId===c.id&&r.symbol===symbol));
    if(pair.some(r=>!r||r.trades<=0||!Number.isFinite(r.mean)))throw Error('Missing development sample');
    return {candidateId:c.id,score:(pair[0].mean+pair[1].mean)/2,trades:pair.map(r=>r.trades)};
  }).sort((a,b)=>b.score-a.score||a.candidateId.localeCompare(b.candidateId));
  return {...ranking[0],ranking};
}
export function trendBacktest(bars,c,costs,tradeStart=0) {
  if(!candidates.some(x=>x.id===c.id&&x.variant===c.variant&&x.rewardR===c.rewardR&&x.minStopFraction===c.minStopFraction))throw Error('Unregistered candidate');
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
      else {
        const old=s[i-1].ema-s[i-1].vwap,d=s[i].ema-s[i].vwap;
        if(long?old>=0&&d<0:old<=0&&d>0){close(i+1,bars[i+1].open,'counter-cross');i++;continue;}
      }
    }
    if(!position&&!last&&b.time>=tradeStart&&s[i].direction&&trades.at(-1)?.exitIndex!==i&&trendAllows(s[i].direction,b.close,features[i]))
      pending={direction:s[i].direction,signalIndex:i,session:b.session,signalClose:b.close,signalLow:b.low,signalHigh:b.high,
        signalEma200:features[i].ema200,signalEma200Past12:features[i].ema200Past12,signalATR14:features[i].atr14};
  }
  return {candidate:c,costs,trades,liveAuthorized:false};
}
