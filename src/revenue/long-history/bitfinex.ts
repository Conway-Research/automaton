import {normalizeCashBars} from './normalize.js';
import {HISTORY_LIMITS,type CashSeries} from './types.js';
export const BITFINEX_ETH_START=Date.UTC(2023,0,1);
export const BITFINEX_ETH_END=Date.UTC(2026,9,15)-1;
const day=86400000;
/** Public spot execution candles: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME].
 * No rounding, rescaling into smaller lots, interpolation or synthetic bars. */
export function normalizeBitfinexEthUsd(raw:Uint8Array):CashSeries{
 if(raw.byteLength>HISTORY_LIMITS.fileBytes)throw Error('OHLC file size limit');
 const data:unknown=JSON.parse(Buffer.from(raw).toString('utf8'));
 if(!Array.isArray(data)||data.length!==Math.floor((BITFINEX_ETH_END-BITFINEX_ETH_START)/day)+1||data.length>=10000)throw Error('Incomplete or invalid Bitfinex daily history');
 const cents=(v:unknown)=>{
  if(typeof v!=='number'||!Number.isFinite(v)||!/^\d+(?:\.\d{1,2})?$/.test(String(v)))throw Error('Unsupported subcent or invalid OHLC price');
  const [whole,decimal='']=String(v).split('.'),n=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n<=0)throw Error('Invalid OHLC cent price');return n;
 };
 const bars=data.map((row:unknown,i:number)=>{
  if(!Array.isArray(row)||row.length!==6||!Number.isSafeInteger(row[0])||row[0]!==BITFINEX_ETH_START+i*day||typeof row[5]!=='number'||!Number.isFinite(row[5])||row[5]<=0)throw Error('Invalid or missing daily execution candle');
  return {time:row[0],open:cents(row[1]),close:cents(row[2]),high:cents(row[3]),low:cents(row[4])};
 });
 const result=normalizeCashBars(bars,{productType:'cash',symbol:'ETHUSD',currency:'USD',
  productEvidence:'Bitfinex public spot tETHUSD, one whole ETH quoted in USD. Daily execution candles: https://docs.bitfinex.com/reference/rest-public-candles. No derivatives, leverage or authenticated access.',
  adjustmentEvidence:'Original unadjusted spot execution prices; exact USD-to-cent representation only. Raw response retained unchanged by the archive. No split, dividend, staking-income or synthetic adjustment.'});
 result.researchUse={internalOnly:true,allowBenchmark:false,redistribution:false};
 result.limitations=[
  'Nur interne Markt- und Preisanalyse gemäß https://www.bitfinex.com/legal/general/market-data/; keine Weitergabe, Veröffentlichung, Finanzprodukte, Indizes oder finanziellen Benchmarks.',
  'Quelle: Bitfinex, öffentliche tägliche ETH/USD-Spot-Ausführungskerzen; Daten bleiben Eigentum des Anbieters, keine offene Weiterverbreitungslizenz.',
  'Zeitraum 2023-01-01 bis 2026-10-14 fest begrenzt; genau eine vollständige UTC-Tageskerze je Tag, kein Auffüllen und keine Rundung von Untercentpreisen.',
  'Heutiger historischer Datenstand; damalige Revisionen, Ausfälle und Tick-Reihenfolge nicht unabhängig verifiziert. Eine Handelsplattform und ein Vermögenswert, kein diversifiziertes Universum.',
  'Einheiten im Modell sind ganze ETH. Nicht finanzierbare Positionen werden unter unveränderten virtuellen Kapital- und Risikogrenzen abgelehnt.',
  'Keine belegten historischen Spreads, Gebühren, Liquidität oder Finanzierung; OHLC-Simulation ist kein Nachweis tatsächlicher Ausführbarkeit.',
  'Bei widerrufenem Zugang oder Wegfall des internen Forschungszwecks gelten die Löschpflichten des Anbieters. Keine automatischen Ausweichanbieter oder kostenpflichtigen Zugänge.',
 ];return result;
}
