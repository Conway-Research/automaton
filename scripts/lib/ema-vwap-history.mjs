import {indicators} from './ema-vwap-offline.mjs';

/** Strict local Binance millisecond/microsecond kline CSV. No fetching or credentials. */
export function parseFiveMinuteCsv(csv,start,end) {
  if(typeof csv!=='string'||Buffer.byteLength(csv)>20000000||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
    start%300000||end%300000||end<=start||(end-start)/300000>100000)throw Error('Invalid historical bounds');
  const rows=csv.trim().split(/\r?\n/);
  if(rows.length!==(end-start)/300000)throw Error('Missing or extra bars');
  const bars=rows.map((row,i)=>{
    const c=row.split(',');
    if(c.length!==12||c.some(x=>!/^\d+(\.\d+)?$/.test(x)))throw Error('Malformed historical row');
    const v=c.map(Number),scale=v[0]>=1e15?1000:1,time=v[0]/scale;
    if(!Number.isSafeInteger(v[0])||time!==start+i*300000||v[6]!==(time+300000)*scale-1||
      !Number.isSafeInteger(v[8])||v[8]<=0||v[7]<=0||v[9]>v[5]||v[10]>v[7]||
      v[7]/v[5]<v[3]-1e-6||v[7]/v[5]>v[2]+1e-6)throw Error('Invalid timestamp, trades or traded volumes');
    return {time,session:new Date(time).toISOString().slice(0,10),open:v[1],high:v[2],low:v[3],close:v[4],volume:v[5],quoteVolume:v[7]};
  });
  indicators(bars);return bars;
}
export function summarizeHistory(trades,bars,shortBorrowBpsPerHour=0) {
  if(!Number.isFinite(shortBorrowBpsPerHour)||shortBorrowBpsPerHour<0)throw Error('Invalid borrowing assumption');
  const result={};
  for(const [key,filter] of Object.entries({all:()=>true,long:t=>t.direction===1,short:t=>t.direction===-1})) {
    const selected=trades.filter(filter);let net=0,peak=0,drawdown=0,wins=0,profits=0,losses=0,borrow=0;
    for(const t of selected) {
      const hours=Math.max(1,Math.ceil((bars[t.exitIndex].time-bars[t.entryIndex].time)/3600000));
      const interest=t.direction===-1?t.entry*shortBorrowBpsPerHour/10000*hours:0;
      const n=t.net-interest;borrow+=interest;net+=n;peak=Math.max(peak,net);drawdown=Math.max(drawdown,peak-net);
      if(n>0){wins++;profits+=n;}else losses-=n;
    }
    result[key]={trades:selected.length,gross:selected.reduce((a,t)=>a+t.gross,0),
      executionCosts:selected.reduce((a,t)=>a+t.cost,0),borrow,net,
      winRate:selected.length?wins/selected.length:0,profitFactor:losses?profits/losses:null,
      maxClosedDrawdown:drawdown};
  }
  return result;
}
