/** Bounded, causal research signals. No orders, permissions, sizing or profit claims. */
export interface SessionBar {start:number;end:number;open:number;high:number;low:number;close:number}
export interface SessionSignal {
  strategy:'opening-range-breakout'|'market-close-momentum';
  sessionOpen:number;sessionClose:number;now:number;barMs:number;
  openingWindowMs:number;closingWindowMs:number;thresholdBps:number;
  bars:SessionBar[];
}
export interface FlowQuote {sequence:number;at:number;bid:number;ask:number;bidSize:number;askSize:number}
export interface FlowSignal {
  strategy:'order-flow-imbalance';now:number;maxAgeMs:number;latencyMs:number;
  maxHoldingMs:number;threshold:number;quotes:FlowQuote[];
}
export type IntradaySignal = SessionSignal|FlowSignal;
function check(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
const int=(n:unknown,min=0,max=Number.MAX_SAFE_INTEGER):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const price=(n:unknown)=>int(n,1,1_000_000_000);
function result(direction:'long'|'short'|'none',at:number,exitBy:number,metric:number,details:object) {
  return {mode:'paper-signal',status:'HOLD_UNVALIDATED',direction,signalAt:at,exitBy,metric,...details,
    liveAuthorized:false,realizedRevenueCents:0,
    limitation:'Research hypothesis only. Short is a direction, not borrow permission. Calendar, feed completeness, costs, fills and latency need independent verification. No order routing or HFT claim.'};
}
export function intradaySignal(i:IntradaySignal) {
  check(i&&int(i.now),'Invalid signal time');
  if(i.strategy==='order-flow-imbalance') {
    check(int(i.maxAgeMs,1,60000)&&int(i.latencyMs,0,60000)&&int(i.maxHoldingMs,1,3600000)&&
      typeof i.threshold==='number'&&Number.isFinite(i.threshold)&&i.threshold>0&&i.threshold<=10000,'Invalid flow bounds');
    check(Array.isArray(i.quotes)&&i.quotes.length>=2&&i.quotes.length<=10000,'Invalid flow sample size');
    let flow=0,depth=0;
    i.quotes.forEach((q,n)=>{
      check(q&&int(q.sequence)&&int(q.at)&&q.at<=i.now&&price(q.bid)&&price(q.ask)&&q.bid<q.ask&&
        price(q.bidSize)&&price(q.askSize),'Invalid/future quote');
      depth+=(q.bidSize+q.askSize)/2;
      if(n){const p=i.quotes[n-1];
        check(q.sequence===p.sequence+1&&q.at>=p.at,'Missing/duplicate/reordered quote');
        // Cont/Kukanov/Stoikov best-quote OFI; simultaneous price changes included.
        flow+=(q.bid>=p.bid?q.bidSize:0)-(q.bid<=p.bid?p.bidSize:0)
          -(q.ask<=p.ask?q.askSize:0)+(q.ask>=p.ask?p.askSize:0);
      }
    });
    const last=i.quotes[i.quotes.length-1];
    check(i.now-last.at<=i.maxAgeMs,'Stale flow');
    const earliestEntryAt=i.now+i.latencyMs,exitBy=earliestEntryAt+i.maxHoldingMs;
    check(int(exitBy),'Time overflow');
    const metric=flow/(depth/i.quotes.length);
    return result(metric>=i.threshold?'long':metric<=-i.threshold?'short':'none',i.now,exitBy,metric,
      {earliestEntryAt,rawImbalance:flow,quoteCount:i.quotes.length,
        latencyEvidence:'supplied assumption, not measured execution latency'});
  }
  check(i.strategy==='opening-range-breakout'||i.strategy==='market-close-momentum','Unsupported intraday strategy');
  check(int(i.sessionOpen)&&int(i.sessionClose)&&i.sessionClose>i.sessionOpen&&i.now>=i.sessionOpen&&i.now<i.sessionClose&&
    int(i.barMs,1,3600000)&&int(i.openingWindowMs,i.barMs)&&int(i.closingWindowMs,i.barMs)&&
    i.openingWindowMs%i.barMs===0&&i.closingWindowMs%i.barMs===0&&
    i.openingWindowMs+i.closingWindowMs<i.sessionClose-i.sessionOpen&&
    typeof i.thresholdBps==='number'&&Number.isFinite(i.thresholdBps)&&i.thresholdBps>=0&&i.thresholdBps<=10000,'Invalid session/window bounds');
  check(Array.isArray(i.bars)&&i.bars.length>=1&&i.bars.length<=10000,'Invalid session sample');
  i.bars.forEach((b,n)=>{
    check(b&&int(b.start)&&int(b.end)&&b.start===(n?i.bars[n-1].end:i.sessionOpen)&&b.end-b.start===i.barMs&&
      b.end<=i.now&&b.end<=i.sessionClose&&[b.open,b.high,b.low,b.close].every(price)&&
      b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close),'Invalid/gapped/future session bar');
  });
  const last=i.bars[i.bars.length-1],rangeEnd=i.sessionOpen+i.openingWindowMs;
  check(i.now-last.end<i.barMs,'Missing latest completed bar');
  if(last.end<rangeEnd)return result('none',i.now,i.sessionClose,0,{reason:'opening-range-incomplete'});
  const opening=i.bars.filter(b=>b.end<=rangeEnd);
  const high=Math.max(...opening.map(b=>b.high)),low=Math.min(...opening.map(b=>b.low));
  if(i.strategy==='opening-range-breakout'){
    const metric=last.close>high?(last.close/high-1)*10000:last.close<low?(last.close/low-1)*10000:0;
    const direction=last.end>rangeEnd&&metric>i.thresholdBps?'long':last.end>rangeEnd&&metric<-i.thresholdBps?'short':'none';
    return result(direction,i.now,i.sessionClose,metric,{rangeHigh:high,rangeLow:low,rangeEnd});
  }
  const entryAt=i.sessionClose-i.closingWindowMs;
  // A fixed single entry boundary avoids drifting the entry after observing later prices.
  check(i.now===entryAt&&last.end===entryAt,'Close momentum requires exact preregistered entry boundary');
  const metric=(opening[opening.length-1].close/opening[0].open-1)*10000;
  return result(metric>i.thresholdBps?'long':metric<-i.thresholdBps?'short':'none',i.now,i.sessionClose,metric,
    {entryAt,featureEndsAt:rangeEnd,limitationOfHypothesis:'Open-to-range-close variant; does not replicate overnight-inclusive published ETF effect. Closing auction fills are not assumed.'});
}
