import {createHash} from 'node:crypto';
import {HISTORY_LIMITS,type ReferenceSeries,type ResearchReport} from './types.js';
import {assessQuality} from './normalize.js';
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
/** ECB reference observations are deliberately NOT converted to OHLC bars. */
export function normalizeEcbReference(raw:Uint8Array):ReferenceSeries{
 if(raw.byteLength>HISTORY_LIMITS.fileBytes)throw Error('Reference size limit');
 const xml=Buffer.from(raw).toString('utf8');
 if(/<!DOCTYPE|<!ENTITY|<!--/i.test(xml)||!/<\/gesmes:Envelope>\s*$/.test(xml))throw Error('Invalid reference XML');
 const rows:ReferenceSeries['rows']=[];
 for(const match of xml.matchAll(/<Cube\s+time=(['"])(\d{4}-\d{2}-\d{2})\1\s*>([\s\S]*?)<\/Cube>/g)){
  const date=Date.parse(match[2]+'T00:00:00Z');
  if(!Number.isSafeInteger(date)||new Date(date).toISOString().slice(0,10)!==match[2])throw Error('Invalid reference date');
  const values=[...match[3].matchAll(/<Cube\s+currency=(['"])USD\1\s+rate=(['"])(\d+(?:\.\d+)?)\2\s*\/>/g)];
  if(values.length!==1||[...match[3].matchAll(/currency=(['"])USD\1/g)].length!==1||!Number.isFinite(Number(values[0][3]))||Number(values[0][3])<=0)throw Error('Missing or invalid USD reference rate');
  rows.push({date,rate:Number(values[0][3])});
 }
 if(rows.length!==[...xml.matchAll(/<Cube\s+time=/g)].length)throw Error('Malformed reference observations');
 rows.sort((a,b)=>a.date-b.date);
 const series:ReferenceSeries={kind:'reference-rates',rows,symbol:'EURUSD',currency:'USD',limitations:[
  'Quelle: Europäische Zentralbank, Euro foreign exchange reference rates, USD je EUR; kostenlos direkt von www.ecb.europa.eu.',
  'Bearbeitung: chronologisch sortiert, USD-Reihe ausgewählt und daraus verzögerte hypothetische Renditen berechnet; keine Interpolation.',
  'Referenzkurse dienen Informationszwecken, nicht der Transaktionsausführung. Keine OHLC-, Bid/Ask-, Broker- oder Intraday-Daten.',
  'Historischer heutiger Datenstand, keine archivierten damaligen Veröffentlichungsstände; Revisionseinfluss nicht ausgeschlossen.',
  'EZB-Quellenangabe und Änderungskennzeichnung sind bei Weitergabe zu erhalten; Daten sind auf der EZB-Webseite kostenlos verfügbar.',
 ]};
 if(!assessQuality(series).valid)throw Error('Invalid reference series');return series;
}
export const referenceVariants=()=>['reference-trend-10','reference-trend-20','reference-reversion-10','reference-reversion-20'];
interface Registration {id:string;datasetId:string;start:number;end:number;seed:number;variantIds:string[];}
/** Hypothetical daily index, not a fill simulator. Signals are known two observations
 * before the end of the measured return (one entire observation before entry). */
export function evaluateReferenceTrial(series:ReferenceSeries,r:Registration,variantId:string):ResearchReport{
 if(series.kind!=='reference-rates'||!assessQuality(series).valid||!r.variantIds.includes(variantId)||!referenceVariants().includes(variantId))throw Error('Unregistered reference simulation');
 const rows=series.rows.filter(x=>x.date>=r.start&&x.date<=r.end);if(rows.length<100)throw Error('Insufficient reference observations');
 const lookback=Number(variantId.split('-').at(-1)),reversion=variantId.includes('reversion');
 const simulate=(cost:number)=>{
  let equity=1000000,peak=equity,drawdown=0,position=0,entries=0;const pnl:number[]=[];
  for(let i=0;i<rows.length;i++){
   let target=0;
   if(i>=lookback+1){const known=rows.slice(i-lookback-1,i-1),average=known.reduce((n,x)=>n+x.rate,0)/lookback,last=known.at(-1)!.rate;target=Number(reversion?last<average:last>average);}
   const previous=equity;
   if(target!==position){equity*=1-cost;if(target)entries++;}
   if(target&&i>0)equity*=rows[i].rate/rows[i-1].rate;
   if(i===rows.length-1&&target)equity*=1-cost;
   equity=Math.floor(equity);if(!Number.isSafeInteger(equity)||equity<=0)throw Error('Reference simulation arithmetic limit');
   peak=Math.max(peak,equity);drawdown=Math.max(drawdown,(peak-equity)/peak);pnl.push(equity-previous);position=target;
  }
  return {net:equity-1000000,pnl,drawdown,entries};
 };
 const base=simulate(.002),stress=simulate(.004);
 return {id:hash({r,variantId,rows,version:'reference-v1'}),runId:r.id,datasetId:r.datasetId,kind:'reference-simulation',nativeCurrency:'USD',costStatus:'model',
  metrics:{variantId,symbol:series.symbol,start:r.start,end:r.end,periodObservations:rows.length,periodDatesHash:hash(rows.map(x=>x.date)),virtualInitialCapitalCents:1000000,netPnlCents:base.net,stressNetPnlCents:stress.net,periodPnlCents:base.pnl,stressPeriodPnlCents:stress.pnl,maximumObservedReferenceDrawdownFraction:base.drawdown,entries:base.entries,signalLagObservations:2,oneWayCostBps:20,stressOneWayCostBps:40,executionAuthorized:false},
  limitations:[...series.limitations,'Hypothetischer Long/Cash-Index mit variablem Anteil, 20/40 Basispunkten je Positionswechsel und Schlussglattstellung; keine handelbaren Fills, Stopps, Ziele, Finanzierung oder Guthabenverzinsung modelliert.','Kurslücken werden als gesamtes Beobachtungsintervall behandelt; keine Risikobegrenzung zwischen Referenzzeitpunkten belegt.','Entwicklungs-, Validierungs- und Schlussabschnitt bleiben getrennt; kein Profitabilitätsnachweis oder automatischer Strategiewechsel.'],decision:base.net<=0||stress.net<=0?'verworfen':'weiter untersuchen',evidenceHashes:[],liveAuthorized:false};
}
