import type {Bar} from '../paper-trading.js';
import {HISTORY_LIMITS,type SourceRecord,type ReturnSeries,type CashSeries,type MacroSeries,type Series,type QualityReport,type DatasetRecord} from './types.js';
function date8(text:string){if(!/^\d{8}$/.test(text))throw Error('Invalid date');const y=Number(text.slice(0,4)),m=Number(text.slice(4,6)),d=Number(text.slice(6));const at=Date.UTC(y,m-1,d),dt=new Date(at);if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw Error('Invalid date');return at;}
export function normalizeFrenchCsv(raw:Uint8Array,source:SourceRecord):ReturnSeries{
 if(source.kind!=='factor-returns'||raw.byteLength>HISTORY_LIMITS.fileBytes)throw Error('Invalid return source');
 const rows:ReturnSeries['rows']=[],limitations:string[]=['Aggregierte US-Forschungsrenditen; keine ausführbaren OHLC- oder Bid/Ask-Daten.','Historische Datenstände können revidiert sein.'];let last=-Infinity,started=false,header=false;
 for(const line of Buffer.from(raw).toString('utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
  if(/^\s*,\s*Mkt-RF\s*,\s*SMB\s*,\s*HML\s*,\s*RF\s*$/i.test(line)){header=true;continue;}
  if(!/^\s*\d{8},/.test(line)){if(started){if(!line.trim()||/^\s*(Annual|\d{4},)/i.test(line))break;throw Error('Corrupt daily return section');}continue;}
  if(!header)throw Error('Return units/header missing');started=true;const parts=line.trim().split(',');if(parts.length!==5)throw Error('Invalid return row');const at=date8(parts[0]);if(at<=last)throw Error('Unsorted or duplicate dates');last=at;
  const values=parts.slice(1).map(x=>{if(!/^[+-]?\d+(?:\.\d+)?$/.test(x.trim()))throw Error('Invalid return value');return Number(x);});
  if(values.some(x=>x===-99.99||x===-999)){limitations.push('Fehlwert am '+parts[0]+'; keine Interpolation.');continue;}
  const returnDecimals=(values[0]+values[3])/100;if(!Number.isFinite(returnDecimals)||returnDecimals<=-1)throw Error('Invalid market return');rows.push({date:at,returnDecimals});
 }
 if(!rows.length)throw Error('No daily returns');return {kind:'factor-returns',rows,field:'US-Marktgesamtrendite: Mkt-RF + RF, Prozent in Dezimalwerte',currency:'USD',limitations};
}
interface CashMetadata {productType:string;symbol:string;currency:string;productEvidence:string;adjustmentEvidence:string;}
export function normalizeCashBars(raw:Bar[],metadata:CashMetadata):CashSeries{
 if(metadata.productType!=='cash'||!['USD','EUR','CHF'].includes(metadata.currency)||!metadata.symbol||!metadata.productEvidence?.trim()||!metadata.adjustmentEvidence?.trim())throw Error('Cash product evidence missing');
 const series:CashSeries={kind:'cash-ohlc',bars:raw.map(b=>({...b})),symbol:metadata.symbol,currency:metadata.currency as CashSeries['currency'],productEvidence:metadata.productEvidence,adjustmentEvidence:metadata.adjustmentEvidence,limitations:['Universum, Delistings und Dividenden benötigen gesonderte Prüfung.']};
 if(!assessQuality(series).valid)throw Error('Invalid OHLC data');return series;
}
export function assessQuality(series:Series):QualityReport{
 const issues:string[]=[],warnings:string[]=[];const rows=series.kind==='cash-ohlc'?series.bars:series.rows;let last=-Infinity,lastMonth:number|null=null;
 if(series.kind!=='macro')warnings.push('Handelskalender und erwartete Beobachtungen sind nicht vollständig verifiziert.');
 if(series.limitations.some(x=>/Fehlwert|Fehlender Zinswert/i.test(x)))warnings.push('Fehlende Werte wurden ausgelassen und nicht interpoliert.');
 if(!rows.length)issues.push('Keine Daten');
 for(const row of rows){const at='time' in row?row.time:row.date;if(!Number.isSafeInteger(at)||at<=last)issues.push('Zeitpunkte ungültig oder ungeordnet');if(last!==-Infinity&&series.kind!=='macro'&&at-last>7*86400000)warnings.push('Zeitliche Lücke oder ungeklärter Handelskalender.');last=at;
  if(series.kind==='macro'){const d=new Date(at),month=d.getUTCFullYear()*12+d.getUTCMonth();if(lastMonth!==null&&month!==lastMonth+1)warnings.push('Monatslücke in der Zinsreihe.');lastMonth=month;if(d.getUTCDate()!==new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate())warnings.push('Monatsquotierung nicht am erwarteten Monatsende.');}
  if('open' in row){if(![row.open,row.high,row.low,row.close].every(x=>Number.isSafeInteger(x)&&x>0)||row.high<Math.max(row.open,row.close)||row.low>Math.min(row.open,row.close)||row.low>row.high)issues.push('Ungültige OHLC-Centwerte');}
  else if('returnDecimals' in row){if(!Number.isFinite(row.returnDecimals)||row.returnDecimals<=-1)issues.push('Ungültige Rendite');}
  else if('rate' in row){if(!Number.isFinite(row.rate)||row.rate<=0)issues.push('Ungültiger Referenzkurs');}
  else if(!Number.isFinite(row.annualRatePercent))issues.push('Ungültiger Zinssatz');
 }
 return {valid:issues.length===0,issues:[...new Set(issues)],warnings:[...new Set(warnings)],complete:issues.length===0&&warnings.length===0};
}
export function normalizeBoardXml(raw:Uint8Array):MacroSeries{
 if(raw.byteLength>HISTORY_LIMITS.fileBytes)throw Error('XML size limit');const xml=Buffer.from(raw).toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('External XML definitions forbidden');
 const marker='SERIES_NAME="RIFSGFSM03_N.M"',at=xml.indexOf(marker);if(at<0||xml.indexOf(marker,at+marker.length)>=0)throw Error('Missing or duplicate Board series');
 const start=xml.lastIndexOf('<kf:Series',at),end=xml.indexOf('</kf:Series>',at);if(start<0||end<0)throw Error('Invalid Board series');const body=xml.slice(start,end);
 if(!/UNIT="Percent:_Per_Year"/.test(body.slice(0,body.indexOf('>'))))throw Error('Board rate unit mismatch');
 const rows:MacroSeries['rows']=[],limitations=['Quelle: Board of Governors of the Federal Reserve System, H.15, RIFSGFSM03_N.M.','Monatliche Quotierung eines annualisierten Diskontzinssatzes; keine investierbare Monatsrendite.','Revidierte historische Werte; ohne damalige Veröffentlichungsstände nur rückblickender Kontext.'];let previous=-Infinity;
 for(const m of body.matchAll(/<frb:Obs\s+([^>]+)\/>/g)){
  const attrs=Object.fromEntries([...m[1].matchAll(/([A-Z_]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(attrs.TIME_PERIOD??''))throw Error('Invalid macro date');const date=date8(attrs.TIME_PERIOD.replaceAll('-',''));if(date<=previous)throw Error('Unsorted macro dates');previous=date;
  if(attrs.OBS_STATUS!=='A'||! /^[+-]?\d+(?:\.\d+)?$/.test(attrs.OBS_VALUE??'')){limitations.push('Fehlender Zinswert am '+attrs.TIME_PERIOD);continue;}
  const annualRatePercent=Number(attrs.OBS_VALUE);if(!Number.isFinite(annualRatePercent))throw Error('Invalid rate');rows.push({date,annualRatePercent});
 }
 if(!rows.length)throw Error('No macro observations');return {kind:'macro',rows,field:'US 3-Month Treasury Bill secondary market rate, discount basis',currency:'USD',limitations};
}
export function coverage(records:Pick<DatasetRecord,'kind'|'start'|'end'|'frequency'|'quality'>[],start:number,end:number){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)throw Error('Invalid coverage request');
 return records.map(r=>({kind:r.kind,start:r.start,end:r.end,frequency:r.frequency,valid:r.quality.valid,startsLate:r.start>start,endsEarly:r.end<end}));
}
