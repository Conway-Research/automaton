// Pure check of the offline operating limits. No I/O and no grant: an empty list only means no limit was crossed.
// What counts as real is decided by allow-lists. Word lists here only warn and can never make something count.
const LOOKALIKE={'а':'a','е':'e','о':'o','р':'p','с':'c','у':'y','х':'x','і':'i','ѕ':'s','ј':'j','ԁ':'d','ո':'n'};
/** The same id across invisible characters and width. Case stays, because ids can differ by case alone. */
export const identityText=x=>String(x??'').normalize('NFKC').replace(/\p{Cf}/gu,'').trim();
/** Lookalikes and invisible characters must not change what a text means to a check. */
export const canonicalText=x=>identityText(x).replace(/\p{Mn}/gu,'').toLowerCase().replace(/[аеорсухіѕјԁո]/g,c=>LOOKALIKE[c]).replace(/\s+/g,' ').trim();
const tokens=x=>canonicalText(String(x??'').replace(/([\p{Ll}\d])(\p{Lu})/gu,'$1 $2')).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const SIM_WORD=/^(?:fake|mock|sim|simulated|simulation|synthetic|test|testing|sandbox|stub|dummy|demo|paper|sample|example|placeholder|fixture)\d*$/,SIM_PREFIX=/^(?:fake|mock|sandbox|stub|dummy|fixture|simulated)/;
/** A warning sign of fictional evidence anywhere in a reference. Not finding one proves nothing. */
export const simulatedRef=x=>typeof x==='string'&&tokens(x).some(t=>SIM_WORD.test(t)||SIM_PREFIX.test(t));
/** The one form a reference may have: type:id. The type is case-free, the id keeps its case. */
export const normalizedRef=x=>{
 if(typeof x!=='string'||x.length>2000)return null;
 const m=identityText(x).match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(\S+)$/);
 return m?m[1].toLowerCase()+':'+m[2]:null;
};
/** A reference with a type and no sign of being fictional. Whether it exists is checked where it is resolved. */
export const realRef=x=>normalizedRef(x)!==null&&!simulatedRef(x);
/** A payment counts only under a receipt type someone has explicitly accepted. With no policy nothing counts. */
export const receiptStatus=(x,policy)=>{
 if(simulatedRef(x))return 'simulated';
 const ref=normalizedRef(x);if(!ref)return 'invalid';
 return Array.isArray(policy?.acceptedTypes)&&policy.acceptedTypes.includes(ref.slice(0,ref.indexOf(':')))?'accepted':'not-accepted';
};
/** Only `synthetic:false` or no statement at all reads as real; any other value is treated as simulated. */
export const declaredSynthetic=x=>x!==undefined&&x!==false;
/** An exact instant with an explicit offset; a calendar day that does not exist is no date. */
export const strictTime=x=>{
 const m=typeof x==='string'?x.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i):null;if(!m)return null;
 const t=Date.parse(x),day=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
 return Number.isFinite(t)&&day.getUTCMonth()===+m[2]-1&&day.getUTCDate()===+m[3]?t:null;
};
const PERSONNEL=/^(personnel\w*|personal(kosten|aufwand)|staff\w*(cost|costs)|salar(y|ies)\w*|payroll|hourly|wages?|\p{L}*lohn(kosten)?|lohn\p{L}*|l(oe|ö)hne|geh(a|ae|ä)lt(er|s\p{L}*)?|mitarbeit\p{L}*|employees?|staff(ing)?|labou?r|stundensatz|contractors?|freelancer|sozialabgaben|ahv)\d*$/u;
const NEUTRAL=new Set(['count','id','ids','ref','name','number','anzahl']),PERSONAL_PAIR=/\bpersonal (?:cost|costs|kosten|minor|aufwand)\b|\bpay roll\b/,COST=/^(cost|costs|kosten|minor|rate|aufwand)$/,TIME=/^(time|days?|hours?|stunden?|tage?)$/;
const HUMAN=new Set(['human','patrice','owner','operator','manual','founder']),OPERATOR_ALONE=new Set(['owner','operator','manual','founder']);
const LABEL=new Set(['kind','type','category','class','label','cost','costs','item','items','expense','description']);
const personnelWords=text=>{const t=tokens(text);return t.some(x=>PERSONNEL.test(x))||PERSONAL_PAIR.test(t.join(' '));};
const personnelKey=key=>personnelWords(key)&&!tokens(key).some(x=>NEUTRAL.has(x));
const personnelLabel=value=>{const t=tokens(value);return t.length<=3&&!t.includes('hourly')&&personnelWords(value)||canonicalText(value)==='personal';};
const humanIssue=(key,value)=>{
 const t=tokens(key),human=t.some(x=>HUMAN.has(x)),paid=t.some(x=>COST.test(x)||TIME.test(x));
 if(t.includes('minutes')&&human)return !(value===null||Number.isFinite(value)&&value>=0);
 if(human&&paid)return true;
 return t.length===1&&TIME.test(t[0])&&t[0]!=='time'&&value!==null&&value!==undefined;
};
/** Personnel costs and non-minute human time, wherever they sit in a record: in a key, a category value, a Map or embedded JSON. */
export function recordIssues(record){
 const issues=new Set(),stack=[record],seen=new WeakSet();
 const entry=(key,value)=>{
  if(personnelKey(key))issues.add('personnel-cost-forbidden');
  if(LABEL.has(canonicalText(key)))for(const v of Array.isArray(value)?value:[value])if(typeof v==='string'&&personnelLabel(v))issues.add('personnel-cost-forbidden');
  if(humanIssue(key,value))issues.add('human-time-must-be-minutes');
  stack.push(value);
 };
 for(let visited=0;stack.length&&visited<100000;visited++){
  const node=stack.pop();
  if(typeof node==='string'){if(/^\s*[[{]/.test(node)&&node.length<=100000){try{stack.push(JSON.parse(node));}catch{}}continue;}
  if(!node||typeof node!=='object'||seen.has(node))continue;
  seen.add(node);
  if(node instanceof Map){for(const [key,value] of node)entry(String(key),value);continue;}
  if(node instanceof Set){for(const value of node)stack.push(value);continue;}
  for(const [key,value] of Object.entries(node))entry(key,value);
 }
 if(stack.length)issues.add('record-too-large');
 return [...issues];
}
export function operatingBoundaryIssues({power,network,production,record}={}){
 const issues=new Set(recordIssues(record));
 if(power?.enabled!==false)issues.add('power-not-off');
 if(network?.guarded!==true)issues.add('network-guard-missing');
 if(['takeover','apply','restart'].some(k=>production?.[k]!==false))issues.add('production-takeover-forbidden');
 return [...issues];
}
