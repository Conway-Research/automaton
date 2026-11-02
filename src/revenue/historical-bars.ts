import { createHash } from 'node:crypto';
import { validateBars, type Bar } from './paper-trading.js';

/** Strict Binance daily spot kline adapter. Reads already downloaded public
 * CSV only. No network, credentials, repair, interpolation or live permission. */
export function parseHistoricalDailyCsv(csv: string, startMs: number, endExclusiveMs: number) {
  const day=86400000;
  if(typeof csv!=='string'||Buffer.byteLength(csv)>2_000_000||!Number.isSafeInteger(startMs)||!Number.isSafeInteger(endExclusiveMs)||
    startMs%day!==0||endExclusiveMs%day!==0||endExclusiveMs<=startMs||(endExclusiveMs-startMs)/day>5000)throw new Error('Invalid historical data bounds');
  const lines=csv.trim().split(/\r?\n/);
  if(lines.length!==(endExclusiveMs-startMs)/day)throw new Error('Missing or extra historical daily rows');
  const cents=(value:string)=>{
    if(!/^\d+\.\d{2}0{0,6}$/.test(value))throw new Error('Historical price cannot be represented exactly in cents');
    const [whole,fraction]=value.split('.');const n=Number(whole)*100+Number(fraction.slice(0,2));
    if(!Number.isSafeInteger(n)||n<=0||n>100_000_000)throw new Error('Historical price bound');return n;
  };
  const bars:Bar[]=lines.map((line,i)=>{
    const c=line.split(',');if(c.length!==12||c.some(v=>!/^\d+(\.\d+)?$/.test(v)))throw new Error('Malformed historical row');
    const raw=Number(c[0]);const scale=raw>=1e15?1000:1;
    const time=raw/scale,closeTime=Number(c[6])/scale;
    if(!Number.isSafeInteger(raw)||time!==startMs+i*day||Math.floor(closeTime)!==time+day-1||
      !Number.isSafeInteger(Number(c[8]))||Number(c[8])<1||![5,7,9,10].every(j=>Number.isFinite(Number(c[j]))&&Number(c[j])>0))throw new Error('Invalid timestamp, gap, duplicate or volume');
    return {time,open:cents(c[1]),high:cents(c[2]),low:cents(c[3]),close:cents(c[4])};
  });
  validateBars(bars);
  return {bars,quality:{rows:bars.length,sourceSha256:createHash('sha256').update(csv).digest('hex'),
    timestampUnit:'milliseconds-normalized',exactCentConversion:true,missingRows:0,duplicateRows:0,
    independentlyVerifiedPrices:false,liveAuthorized:false,
    limitation:'Structure, chronology and exact conversion verified; no independent price, venue or execution-quality verification.'}};
}
