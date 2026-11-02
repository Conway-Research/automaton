import {createHash} from 'node:crypto';
import {strategyCatalogue,strategySignal} from '../strategy-research.js';
import {walkForwardPaper,buyAndHoldPaper,type Friction,type WalkForwardResult,type Bar} from '../paper-trading.js';
import type {CashSeries,ResearchReport} from './types.js';import {assessQuality} from './normalize.js';
interface TrialRegistration {id:string;datasetId:string;start:number;end:number;seed:number;variantIds:string[];}
export function stressCosts(c:Friction&{financingCashFlow?:number}){
 return {...c,feeBps:c.feeBps*2,slippageBps:c.slippageBps*2,minimumFeeCents:(c.minimumFeeCents??0)*2,...(c.financingCashFlow===undefined?{}:{financingCashFlow:Math.min(0,c.financingCashFlow*2)})};
}
export function familyBlockBounds(candidates:number[][],seed:number){
 const n=candidates[0]?.length;if(!n||n<100||n>50000||!candidates.length||candidates.length>24||candidates.some(v=>v.length!==n||v.some(x=>!Number.isFinite(x))))return null;
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const means=candidates.map(v=>v.reduce((a,b)=>a+b,0)/n),centered=candidates.map((v,i)=>v.map(x=>x-means[i])),blockLength=Math.ceil(Math.sqrt(n)),maxima:number[]=[];
 for(let r=0;r<2000;r++){const sums=Array(candidates.length).fill(0);let count=0;while(count<n){const start=Math.floor(random()*n);for(let j=0;j<blockLength&&count<n;j++,count++){const index=(start+j)%n;for(let k=0;k<sums.length;k++)sums[k]+=centered[k][index];}}maxima.push(Math.max(...sums.map(s=>s/n)));}
 maxima.sort((a,b)=>a-b);const upper=maxima[Math.floor(.99*(maxima.length-1))];return {method:'joint-block-max-statistic' as const,lowerMeans:means.map(mean=>mean-upper),seed,replications:2000,blockLength,observations:n,variants:candidates.length};
}
function periodPnl(result:WalkForwardResult,bars:Bar[],friction:Friction){
 let balance=result.initialEquityCents,previous=balance,index=0;const values:number[]=[];
 for(const bar of bars){while(index<result.trades.length&&result.trades[index].exitTime<bar.time){balance+=result.trades[index].netPnlCents;index++;}const trade=result.trades[index];let equity=balance;
  if(trade&&Number((trade.plan as typeof trade.plan&{entryTime?:number}).entryTime)<=bar.time){if(trade.exitTime===bar.time)equity=balance+trade.netPnlCents;else{const value=Math.floor(bar.close*(10000-friction.slippageBps)/10000)*trade.units,fee=Math.max(friction.minimumFeeCents??0,Math.ceil(value*friction.feeBps/10000));equity=balance+value-fee-trade.committedCents;}}
  values.push(equity-previous);previous=equity;
 }if(values.reduce((a,b)=>a+b,0)!==result.netPnlCents)throw Error('Unaligned paper equity trace');return values;
}
export function completeFamilyReports(reports:ResearchReport[],seed:number,expectedVariants:number){
 const ordered=[...reports].sort((a,b)=>String(a.metrics.variantId).localeCompare(String(b.metrics.variantId))),eligible=ordered.length===expectedVariants&&new Set(ordered.map(r=>r.metrics.periodDatesHash)).size===1&&ordered.every(r=>typeof r.metrics.periodDatesHash==='string'&&Array.isArray(r.metrics.periodPnlCents)&&Array.isArray(r.metrics.stressPeriodPnlCents));
 const base=eligible?familyBlockBounds(ordered.map(r=>r.metrics.periodPnlCents as number[]),seed):null,stress=eligible?familyBlockBounds(ordered.map(r=>r.metrics.stressPeriodPnlCents as number[]),seed):null;
 return ordered.map((r,i)=>({...r,metrics:{...r.metrics,lowerMeanCents:base?.lowerMeans[i]??null,stressLowerMeanCents:stress?.lowerMeans[i]??null,intervalMethod:base&&stress?'joint-block-max-statistic':'Joint interval unavailable: incomplete or unaligned candidate family',familyStatistics:base}}));
}
export function evaluateCashTrial(series:CashSeries,registration:TrialRegistration,variantId:string):ResearchReport{
 if(series.kind!=='cash-ohlc'||!series.productEvidence||!series.adjustmentEvidence||!assessQuality(series).valid||!registration.variantIds.includes(variantId))throw Error('Unsupported or unregistered cash trial');
 const variant=strategyCatalogue().find(v=>v.id===variantId);if(!variant)throw Error('Unsupported strategy');
 const bars=series.bars.filter(b=>b.time>=registration.start&&b.time<=registration.end);if(bars.length<100)throw Error('Insufficient historical bars');
 const friction={feeBps:10,slippageBps:10,minimumFeeCents:100},capital=1000000;
 const nextTime=new Map(bars.slice(0,-1).map((b,i)=>[b.time,bars[i+1].time]));
 const signal=strategySignal(variant,series.symbol),fit=()=> (past:Parameters<typeof signal>[0],entry:number)=>{const p=signal(past,entry);return p?{...p,currency:series.currency,riskFraction:.01,entryTime:nextTime.get(past.at(-1)!.time)}:null;};
 const base=walkForwardPaper(bars,25,25,capital,friction,fit),stress=walkForwardPaper(bars,25,25,capital,stressCosts(friction),fit),benchmark=series.researchUse?.allowBenchmark===false?{status:'disabled-by-source-permission',reason:'Internal strategy simulations only; no financial benchmark or index.'}:buyAndHoldPaper(bars,capital,friction);
 const metrics={variantId,start:registration.start,end:registration.end,periodObservations:bars.length,periodDatesHash:createHash('sha256').update(JSON.stringify(bars.map(b=>b.time))).digest('hex'),virtualInitialCapitalCents:capital,trades:base.trades.length,netPnlCents:base.netPnlCents,stressNetPnlCents:stress.netPnlCents,maximumDrawdownUpperBoundFraction:base.ohlcDrawdownUpperBoundCents/capital,benchmark,periodPnlCents:periodPnl(base,bars,friction),stressPeriodPnlCents:periodPnl(stress,bars,stressCosts(friction)),lowerMeanCents:null,stressLowerMeanCents:null,intervalMethod:'Joint family interval pending',seed:registration.seed,registeredVariants:registration.variantIds.length};
 const report:ResearchReport={id:createHash('sha256').update(JSON.stringify({registration,variantId,series,friction})).digest('hex'),runId:registration.id,datasetId:registration.datasetId,kind:'cash-paper',nativeCurrency:series.currency,costStatus:'model',metrics,limitations:[...series.limitations,'Virtuelles Cash-Kapital, nur Long, eine Position gleichzeitig. Keine CFD-/Futures-/Short-Freigabe.','Feste Forschungsgebühren und Slippage, keine belegten historischen Brokerkosten.','OHLC-Drawdown ist eine konservative Hüllkurve, keine beobachtete Tick-Ausführung.','Keine prospektive unabhängige Strategienvalidierung; keine Buchung als Geschäftseinnahme.'],decision:'weiter untersuchen',evidenceHashes:[],liveAuthorized:false};
 report.decision=assessCandidate(report,{});return report;
}
export function assessCandidate(report:ResearchReport,_evidence:Record<string,unknown>):ResearchReport['decision']{
 if(report.kind!=='cash-paper'||!['netPnlCents','stressNetPnlCents','maximumDrawdownUpperBoundFraction','trades'].every(k=>typeof report.metrics[k]==='number'&&Number.isFinite(report.metrics[k])))return 'nicht prüfbar';
 if(Number(report.metrics.netPnlCents)<=0||Number(report.metrics.stressNetPnlCents)<=0||Number(report.metrics.maximumDrawdownUpperBoundFraction)>.15)return 'verworfen';
 // This adapter produces model-cost research only. Promotion needs separately
 // authenticated cost, selection and prospective evidence, which it cannot create.
 return 'weiter untersuchen';
}
