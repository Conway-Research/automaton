import {wilson} from './daily-reversion.mjs';
const DAY=86400000;
function cohort(trades,year) {
 const wins=trades.filter(t=>t.net>0).length;
 const closed=trades.filter(t=>Number(t.exitDate.slice(0,4))<=year);
 return {trades:trades.length,wins,winRate:trades.length?wins/trades.length:null,winRateWilson95:wilson(wins,trades.length),
  crossYearExits:trades.filter(t=>Number(t.exitDate.slice(0,4))>year).length,
  boundaryTrades:trades.filter(t=>t.reason==='boundary').length,
  closedByYearEnd:closed.length,winRateAsOfYearEnd:closed.length?closed.filter(t=>t.net>0).length/closed.length:null};
}
export function annualWalkforward(equity,trades,initialCapital=10000) {
 const groups=new Map();
 for(const e of equity){const year=new Date(e.time-DAY).getUTCFullYear();if(!groups.has(year))groups.set(year,[]);groups.get(year).push(e);}
 const rows=[];let capital=initialCapital;
 for(const [year,marks] of groups) {
  let peak=capital,dd=0;
  for(const m of marks){peak=Math.max(peak,m.equity);dd=Math.max(dd,1-m.equity/peak);}
  const entries=trades.filter(t=>Number(t.entryDate.slice(0,4))===year),exits=trades.filter(t=>Number(t.exitDate.slice(0,4))===year);
  rows.push({year,startEquity:capital,endEquity:marks.at(-1).equity,netReturn:marks.at(-1).equity/capital-1,maxCloseDrawdownFraction:dd,
   firstSession:new Date(marks[0].time-DAY).toISOString().slice(0,10),lastSession:new Date(marks.at(-1).time-DAY).toISOString().slice(0,10),
   entryCohort:cohort(entries,year),exitCohort:cohort(exits,year)});
  capital=marks.at(-1).equity;
 }
 return rows;
}
export function drawdownDuration(equity,initialCapital=10000) {
 let peak=initialCapital,peakAt=(equity[0]?.time??DAY)-DAY;
 let longestCalendarDays=0,longestStart=null,longestEnd=null,unrecovered=false;
 for(const m of equity) {
  const below=m.equity<peak;
  const days=(m.time-peakAt)/DAY;
  if(days>longestCalendarDays&&(below||m.equity>=peak&&m.time>peakAt+DAY)) {
   // A flat series at its high-water mark is never underwater.
   const priorBelow=equity.some(e=>e.time>peakAt&&e.time<m.time&&e.equity<peak);
   if(below||priorBelow){longestCalendarDays=days;longestStart=peakAt;longestEnd=m.time;unrecovered=below;}
  }
  if(m.equity>=peak){peak=m.equity;peakAt=m.time;}
 }
 return {longestCalendarDays,longestStart,longestEnd,unrecovered,currentlyUnderwater:equity.length?equity.at(-1).equity<peak:false};
}
