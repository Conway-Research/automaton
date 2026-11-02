/** Independent acceptance check for a data delivery. It reads the original CSV itself, so a delivery cannot
 * reconcile against its own parsing. Pure and offline: it judges, it repairs nothing and grants no permission.
 * Amounts are exact scaled integers. A value with two valid readings must be held, never resolved by guessing. */
import {canonicalText} from './founder-operating-boundary.mjs';
const WINDOWS_1252='€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
/** Text is double-decoded when its characters, read back as Windows-1252 bytes, are valid UTF-8 with multi-byte sequences. */
const doubleDecoded=text=>{
 const bytes=[];
 for(const c of text){const code=c.codePointAt(0),at=WINDOWS_1252.indexOf(c);if(code<0x80||code>=0xa0&&code<=0xff)bytes.push(code);else if(at>=0)bytes.push(0x80+at);else return false;}
 if(bytes.every(b=>b<0x80))return false;
 try{new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes));return true;}catch{return false;}
};
const damaged=text=>text.includes('\uFFFD')||/[\u00C3\u00C2][\u0080-\u00BF]|\u00E2\u20AC|\u00C3\s{2}|\p{Ll}\u00C3(?:\s|$)/u.test(text)||text.split(/[ \t\r\n]+/).some(doubleDecoded);
// Spreadsheet and export leftovers are never a value. A few words can be real in an optional text field (NA is also Namibia).
const NO_VALUE=new Set(['n/a','#n/a','null','#null!','nan','-','--','?']),MAYBE_VALUE=new Set(['na','nil','none']);
export function parseCsvStrict(text,{delimiter=',',file='input'}={}){
 const input=String(text).replace(/^﻿/,''),records=[];let cells=[],cell='',quoted=false,afterQuote=false,line=1,start=1,any=false;
 const end=()=>{cells.push(cell);cell='';if(any||cells.length>1||cells[0]!=='')records.push({line:start,cells});cells=[];any=false;afterQuote=false;};
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quoted){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else{if(c==='\n')line++;cell+=c;}continue;}
  if(c==='\r'&&input[i+1]==='\n')continue;
  if(c==='\n'){end();line++;start=line;continue;}
  if(c===delimiter){cells.push(cell);cell='';afterQuote=false;any=true;continue;}
  if(afterQuote)throw Error(`Malformed quote in ${file} at line ${line}`);
  if(c==='"'&&cell===''){quoted=true;any=true;continue;}
  cell+=c;
 }
 if(quoted)throw Error(`Unterminated quote in ${file}`);
 if(cell!==''||cells.length||any)end();
 if(!records.length)throw Error(`Empty CSV ${file}`);
 const header=records[0].cells;if(new Set(header).size!==header.length)throw Error(`Duplicate column in ${file}`);
 return {header,rows:records.slice(1).map(r=>({rowId:`${file}:${r.line}`,cells:r.cells}))};
}
function scaled(digits,fraction,negative,scale){
 if(fraction.length>scale)return null;
 const v=BigInt(digits+fraction.padEnd(scale,'0'));return negative?-v:v;
}
function parseDecimal(raw,style,scale){
 const negative=raw.startsWith('-'),body=negative?raw.slice(1):raw;let use=style;
 if(!use){
  const dot=body.lastIndexOf('.'),comma=body.lastIndexOf(',');
  if(dot>=0&&comma>=0)use=dot>comma?'en':'de';
  else if(dot<0&&comma<0)use='en';
  else{
   const sep=dot>=0?'.':',',parts=body.split(sep);
   if(parts.length>2)use=sep==='.'?'de':'en';
   else if(/^\d{1,3}$/.test(parts[0])&&/^\d{3}$/.test(parts[1]))return {state:'ambiguous'};
   else use=sep==='.'?'en':'de';
  }
 }
 const [group,point]=use==='de'?['\\.',',']:[',','\\.'];
 const m=new RegExp(`^(\\d{1,3}(?:${group}\\d{3})+|\\d+)(?:${point}(\\d+))?$`).exec(body);
 if(!m)return {state:'invalid'};
 const value=scaled(m[1].replace(/[.,]/g,''),m[2]??'',negative,scale);
 return value===null?{state:'invalid'}:{state:'ok',value};
}
const realDate=(y,m,d)=>{const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;};
const iso=(y,m,d)=>`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
function parseDate(raw,style){
 let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
 if(m)return realDate(+m[1],+m[2],+m[3])?{state:'ok',value:raw}:{state:'invalid'};
 m=/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);if(!m)return {state:'invalid'};
 const a=+m[1],b=+m[2],y=+m[3],dmy=realDate(y,b,a),mdy=realDate(y,a,b);
 if(style==='DMY')return dmy?{state:'ok',value:iso(y,b,a)}:{state:'invalid'};
 if(style==='MDY')return mdy?{state:'ok',value:iso(y,a,b)}:{state:'invalid'};
 if(dmy&&mdy&&a!==b)return {state:'ambiguous'};
 if(dmy)return {state:'ok',value:iso(y,b,a)};
 return mdy?{state:'ok',value:iso(y,a,b)}:{state:'invalid'};
}
function interpret(spec,raw,source){
 if(raw===null||canonicalText(raw)==='')return {state:spec.required?'missing':'null'};
 const blank=canonicalText(raw);
 if(NO_VALUE.has(blank))return {state:spec.required?'missing':'null'};
 if(MAYBE_VALUE.has(blank)&&spec.required)return {state:'missing'};
 if(MAYBE_VALUE.has(blank)&&spec.type==='string')return {state:'placeholder',value:raw.trim().normalize('NFC')};
 if(MAYBE_VALUE.has(blank))return {state:'null'};
 const text=raw.trim();
 if(spec.type==='decimal')return parseDecimal(text,source.decimal,spec.scale??0);
 if(spec.type==='date')return parseDate(text,source.date);
 return damaged(text)?{state:'damaged'}:{state:'ok',value:text.normalize('NFC')};
}
function readOutput(spec,value){
 if(typeof value!=='string')return null;
 if(spec.type==='decimal'){
  const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value);return m?scaled(m[2],m[3]??'',m[1]==='-',spec.scale??0):null;
 }
 return spec.type==='date'?value:value.normalize('NFC');
}
function format(value,scale){
 const negative=value<0n,digits=(negative?-value:value).toString().padStart(scale+1,'0');
 const body=scale?`${digits.slice(0,-scale)}.${digits.slice(-scale)}`:digits;return (negative?'-':'')+body;
}
const signature=fields=>JSON.stringify([...fields].map(([k,v])=>[k,v.state,typeof v.value==='bigint'?v.value.toString():v.value??null]));
const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const COUNTS=['input','output','rejected','ambiguous','merged'];

export function verifyDataDelivery({contract,inputs,delivery}){
 const names=Object.keys(contract?.fields??{});
 if(!names.length||!names.includes(contract.key)||!contract.sources||!Array.isArray(inputs)||!inputs.length||!inputs.every(i=>hasOwn(contract.sources,i.file))||!Array.isArray(delivery?.rows)||!Array.isArray(delivery.rejected)||!Array.isArray(delivery.ambiguous))throw Error('Invalid data contract');
 for(const spec of Object.values(contract.fields))if(!['string','decimal','date'].includes(spec?.type)||spec.sum&&spec.type!=='decimal'||spec.scale!==undefined&&!(Number.isSafeInteger(spec.scale)&&spec.scale>=0))throw Error('Invalid data contract');
 for(const source of Object.values(contract.sources))if(![undefined,'de','en'].includes(source?.decimal)||![undefined,'DMY','MDY'].includes(source?.date))throw Error('Invalid data contract');
 const issues=[],issue=(code,detail={})=>issues.push({code,...detail}),expected=new Map(),keyCount=new Map(),rowsByKey=new Map(),files=new Set();
 for(const file of Object.keys(contract.sources))if(!inputs.some(i=>i.file===file))issue('source-missing',{file});
 for(const input of inputs){
  if(files.has(input.file)){issue('input-duplicate',{file:input.file});continue;}
  files.add(input.file);
  const {header,rows}=parseCsvStrict(input.text,{delimiter:input.delimiter??',',file:input.file}),source=contract.sources[input.file];
  const unknown=header.filter(h=>!names.includes(h)),missing=names.filter(n=>!header.includes(n));
  if(unknown.length||missing.length)issue('input-schema-mismatch',{file:input.file,unknown,missing});
  if(!rows.length)issue('input-empty',{file:input.file});
  for(const row of rows){
   if(row.cells.length!==header.length){expected.set(row.rowId,{malformed:true});continue;}
   const fields=new Map(names.map(name=>{const at=header.indexOf(name);return [name,interpret(contract.fields[name],at<0?null:row.cells[at],source)];}));
   expected.set(row.rowId,{fields});
   const key=fields.get(contract.key);
   if(key.state==='ok'){const k=canonicalText(key.value);keyCount.set(k,(keyCount.get(k)??0)+1);rowsByKey.set(k,[...(rowsByKey.get(k)??[]),row.rowId]);}
  }
 }
 const seen=new Map(),count=id=>seen.set(id,(seen.get(id)??0)+1),totals=new Map(names.filter(n=>contract.fields[n].sum).map(n=>[n,0n])),outKeys=new Map();let merged=0;
 for(const out of delivery.rows){
  const from=Array.isArray(out?.from)?out.from:[];
  if(!from.length||from.some(id=>!expected.has(id))){issue('invented-row',{from});continue;}
  from.forEach(count);merged+=from.length-1;
  const sources=from.map(id=>expected.get(id));
  if(sources.some(s=>s.malformed)){issue('invalid-value-accepted',{from,reason:'malformed-row'});continue;}
  if(new Set(sources.map(s=>signature(s.fields))).size>1)issue('conflict-hidden',{from});
  const keys=Object.keys(out.values??{});
  if(keys.length!==names.length||!names.every(n=>hasOwn(out.values,n)))issue('schema-mismatch',{from,keys});
  for(const name of names){
   const spec=contract.fields[name],want=sources[0].fields.get(name),got=out.values?.[name]??null,where={rowId:from[0],field:name};
   if(want.state==='ambiguous')issue(spec.type==='date'?'ambiguous-date-resolved':'ambiguous-decimal-resolved',where);
   else if(want.state==='invalid')issue('invalid-value-accepted',where);
   else if(want.state==='damaged')issue('encoding-damaged',where);
   else if(want.state==='missing')issue(got===null?'invalid-value-accepted':'value-invented',where);
   else if(want.state==='null'){if(got!==null)issue('value-invented',where);}
   else if(want.state==='placeholder'){if(got!==null&&readOutput(spec,got)!==want.value)issue('value-altered',where);}
   else if(got===null)issue('value-dropped',where);
   else if(readOutput(spec,got)!==want.value)issue('value-altered',where);
   if(want.state==='ok'&&totals.has(name))totals.set(name,totals.get(name)+want.value);
  }
  const key=canonicalText(out.values?.[contract.key]);outKeys.set(key,(outKeys.get(key)??0)+1);
  const own=signature(sources[0].fields);
  for(const id of rowsByKey.get(key)??[])if(!from.includes(id)&&expected.get(id).fields&&signature(expected.get(id).fields)!==own)issue('conflict-resolved-by-guess',{from,rowId:id});
 }
 for(const [key,n] of outKeys)if(n>1)issue('duplicate-undetected',{key});
 const withheld=(list,kind)=>{
  const ids=new Set();
  for(const item of list){
   if(!expected.has(item?.rowId)){issue('invented-row',{rowId:item?.rowId,kind});continue;}
   if(typeof item.reason!=='string'||!item.reason.trim())issue('withheld-without-reason',{rowId:item.rowId,kind});
   ids.add(item.rowId);
  }
  for(const id of ids){
   count(id);const e=expected.get(id);
   const clean=!e.malformed&&[...e.fields.values()].every(f=>['ok','null','placeholder'].includes(f.state));
   if(clean&&keyCount.get(canonicalText(e.fields.get(contract.key).value))===1)issue('clean-row-withheld',{rowId:id,kind});
  }
  return ids.size;
 };
 const rejected=withheld(delivery.rejected,'rejected'),ambiguous=withheld(delivery.ambiguous,'ambiguous');
 for(const id of expected.keys()){const n=seen.get(id)??0;if(n===0)issue('row-lost',{rowId:id});else if(n>1)issue('row-double-counted',{rowId:id});}
 const counts={input:expected.size,output:delivery.rows.length,rejected,ambiguous,merged};
 for(const k of COUNTS)if(delivery.report?.counts?.[k]!==counts[k])issue('count-mismatch',{count:k,actual:counts[k],reported:delivery.report?.counts?.[k]??null});
 const formatted={};
 for(const [name,value] of totals){
  const scale=contract.fields[name].scale??0;formatted[name]=format(value,scale);
  if(readOutput(contract.fields[name],delivery.report?.totals?.[name])!==value)issue('sum-mismatch',{field:name,actual:formatted[name],reported:delivery.report?.totals?.[name]??null});
 }
 return {accepted:issues.length===0,issues,reconciliation:{counts,totals:formatted},scope:'Prüfung einer einzelnen Lieferung; kein Fähigkeitsnachweis.'};
}
