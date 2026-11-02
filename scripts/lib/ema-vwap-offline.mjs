/** Pure offline research. No runtime imports, network, account or order adapter. */
export function indicators(bars) {
  if(!Array.isArray(bars)||bars.length<9||bars.length>500000)throw Error('Invalid sample size');
  let ema=0,seed=0,pv=0,volume=0,session;
  const seen=new Set();
  return bars.map((b,i)=>{
    if(!b||!Number.isSafeInteger(b.time)||b.time<0||typeof b.session!=='string'||!b.session||
      ![b.open,b.high,b.low,b.close,b.volume].every(v=>Number.isFinite(v)&&v>0)||
      b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||
      (i&&(b.time<=bars[i-1].time||(b.session===session&&b.time-bars[i-1].time!==300000))))throw Error('Invalid OHLCV or five-minute chronology');
    if(session!==b.session){if(seen.has(b.session))throw Error('Reused session');seen.add(b.session);session=b.session;pv=0;volume=0;}
    pv+=((b.high+b.low+b.close)/3)*b.volume;volume+=b.volume;
    if(!Number.isFinite(pv)||!Number.isFinite(volume))throw Error('Volume overflow');
    seed+=i<9?b.close:0;
    if(i===8)ema=seed/9;else if(i>8)ema+=0.2*(b.close-ema);
    return {ema:i<8?null:ema,vwap:pv/volume};
  });
}
export function signals(bars,variant) {
  if(!['cross','early'].includes(variant))throw Error('Unknown variant');
  const ind=indicators(bars);
  return bars.map((b,i)=>{
    const p=ind[i-1],a=ind[i];let direction=0;
    if(i>=9&&bars[i-1].session===b.session) {
      const old=p.ema-p.vwap,d=a.ema-a.vwap;
      const up=b.close>bars[i-1].high,down=b.close<bars[i-1].low;
      if(variant==='cross') {
        if(old<=0&&d>0&&up&&b.close>a.ema&&b.close>a.vwap)direction=1;
        if(old>=0&&d<0&&down&&b.close<a.ema&&b.close<a.vwap)direction=-1;
      } else if(Math.abs(d)/a.vwap<=0.001) {
        if(old<d&&d<0&&a.ema>p.ema&&up)direction=1;
        if(old>d&&d>0&&a.ema<p.ema&&down)direction=-1;
      }
    }
    return {direction,...a};
  });
}
export function backtest(bars,variant,costs) {
  if(!costs||![costs.feeBps,costs.spreadBps,costs.slippageBps].every(v=>Number.isFinite(v)&&v>=0&&v<=1000))throw Error('Invalid costs');
  const s=signals(bars,variant),trades=[];
  let position=null,pending=null,equity=0,peak=0,maxDrawdown=0;
  // Unit quantity; full quoted spread split across two fills; adverse slippage each fill.
  const adverse=(costs.spreadBps/2+costs.slippageBps)/10000;
  function close(index,raw,reason) {
    const p=position,exit=raw*(1-p.direction*adverse);
    const gross=p.direction*(raw-p.rawEntry),fee=(p.entry+exit)*costs.feeBps/10000;
    const net=p.direction*(exit-p.entry)-fee,cost=gross-net;
    trades.push({...p,exitIndex:index,rawExit:raw,exit,reason,gross,cost,fee,net});
    equity+=net;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);position=null;
  }
  for(let i=1;i<bars.length;i++) {
    const b=bars[i],lastSessionBar=i===bars.length-1||bars[i+1].session!==b.session;
    if(pending) {
      const q=pending;pending=null;
      if(q.session===b.session&&!lastSessionBar) {
        const stop=q.direction===1?bars[q.signalIndex].low:bars[q.signalIndex].high;
        const entry=b.open*(1+q.direction*adverse),risk=q.direction*(entry-stop);
        if(risk>0)position={...q,entryIndex:i,rawEntry:b.open,entry,stop,target:entry+q.direction*1.5*risk};
      }
    }
    if(position) {
      const p=position,long=p.direction===1;
      if(long?b.open<=p.stop:b.open>=p.stop)close(i,b.open,'gap-stop');
      else if(long?b.low<=p.stop:b.high>=p.stop)close(i,p.stop,'stop-first');
      else if(long?b.high>=p.target:b.low<=p.target)close(i,p.target,'target');
      else if(lastSessionBar)close(i,b.close,'session-end');
      else {
        const old=s[i-1].ema-s[i-1].vwap,d=s[i].ema-s[i].vwap;
        if(long?old>=0&&d<0:old<=0&&d>0)position.exitNext=true;
      }
    }
    // An observed counter-cross exits at the FOLLOWING open, not its close.
    if(position?.exitNext&&i+1<bars.length) {close(i+1,bars[i+1].open,'counter-cross');i++;continue;}
    if(!position&&!lastSessionBar&&s[i].direction&&trades.at(-1)?.exitIndex!==i)
      pending={direction:s[i].direction,signalIndex:i,session:b.session};
  }
  return {variant,costs,quantity:1,liveAuthorized:false,provenance:'caller-supplied-offline',trades,
    net:equity,gross:trades.reduce((a,t)=>a+t.gross,0),cost:trades.reduce((a,t)=>a+t.cost,0),
    winRate:trades.length?trades.filter(t=>t.net>0).length/trades.length:0,maxClosedDrawdown:maxDrawdown};
}
export function syntheticBars(seed=7,sessions=20,regime='mixed') {
  let state=seed>>>0,price=100;const bars=[];
  const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
  for(let day=0;day<sessions;day++)for(let i=0;i<78;i++) {
    const open=price,phase=Math.floor(i/13)%2===0?1:-1;
    const drift=regime==='trend'?(day%2===0?0.055:-0.055):regime==='chop'?0:phase*0.065;
    price=Math.max(1,open+drift+(random()-0.5)*(regime==='chop'?0.3:0.16));
    bars.push({time:Date.UTC(2026,0,1+day,9,0)+i*300000,session:`synthetic-${day}`,
      open,high:Math.max(open,price)+random()*0.035,low:Math.min(open,price)-random()*0.035,close:price,volume:100+Math.floor(random()*1000)});
  }
  return bars;
}
