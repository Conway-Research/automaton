/** Read-only projection of existing delivery and payment evidence into separate commercial states.
 * No second ledger, provider access, FX guess or persistence. Historical evidence never authorizes new work.
 * Exact decimal strings only: 9.675 stays 9.675, a rounded platform display stays a display. */
const SCALE=10n**18n,ROUND_DECIMALS=2;
function parse(value){if(typeof value!=='string'||value.length>40||!/^(0|[1-9]\d{0,20})(\.\d{1,18})?$/.test(value))throw Error('Exact decimal string required');const [whole,fraction='']=value.split('.');return BigInt(whole)*SCALE+BigInt(fraction.padEnd(18,'0'));}
function format(n){const whole=n/SCALE,fraction=(n%SCALE).toString().padStart(18,'0').replace(/0+$/,'');return fraction?whole+'.'+fraction:whole.toString();}
function roundHalfUp(n,decimals){const unit=10n**BigInt(18-decimals);return (n+unit/2n)/unit*unit;}
const absolute=n=>n<0n?-n:n;
function differenceOf(expected,received){
 if(!expected)return {difference:{decimal:null,kind:'not-declared'},shortfall:null};
 const agreed=parse(expected.decimal),gap=agreed-received,decimal=format(absolute(gap));
 if(gap===0n)return {difference:{decimal:'0',kind:'none'},shortfall:null};
 if(gap>0n&&expected.displayRounded===true&&roundHalfUp(received,ROUND_DECIMALS)===agreed)return {difference:{decimal,kind:'documented-rounding'},shortfall:null};
 return gap>0n?{difference:{decimal,kind:'shortfall'},shortfall:gap}:{difference:{decimal,kind:'overpayment'},shortfall:null};
}
function classify(r,conflicts){
 const confirmed=r.transfer?.confirmed===true;
 if(confirmed&&conflicts.has(r.transfer.ref))return 'receipt-conflict';
 if(confirmed)return r.assignment?.own===true?'paid':'receipt-unbound';
 if(r.release)return 'released-unpaid';
 if(r.submission)return r.assignment?.own===true?'submitted-awaiting-acceptance':'claim-unconfirmed';
 return 'no-claim';
}
export function projectOrderClaims(records=[]){
 const ids=new Set(),receipts=new Map();
 for(const r of records){if(typeof r?.id!=='string'||!r.id)throw Error('Record identity required');if(ids.has(r.id))throw Error('Duplicate record identity');ids.add(r.id);if(r.transfer?.confirmed===true)receipts.set(r.transfer.ref,(receipts.get(r.transfer.ref)??0)+1);}
 const conflicts=new Set([...receipts].filter(([,n])=>n>1).map(([ref])=>ref)),totals=new Map(),nominal=new Map();
 const total=currency=>{if(!totals.has(currency))totals.set(currency,{gross:0n,received:0n,open:0n,grossComplete:true});return totals.get(currency);};
 const rows=records.map(r=>{
  const classification=classify(r,conflicts),reasons=[];let receivedDecimal=null,dueDecimal=null,difference=null,amountKnown=false,supersededFlags=[];
  if(classification==='paid'){
   const received=parse(r.transfer.netDecimal),t=total(r.transfer.currency),result=differenceOf(r.expectedNet,received);
   receivedDecimal=format(received);amountKnown=true;difference=result.difference;t.received+=received;
   if(r.gross?.currency===r.transfer.currency)t.gross+=parse(r.gross.decimal);else{t.grossComplete=false;reasons.push('gross-currency-differs');}
   if(result.shortfall!==null){dueDecimal=format(result.shortfall);t.open+=result.shortfall;}
   supersededFlags=Object.entries(r.completionFlags??{}).filter(([,v])=>v===false).map(([k])=>k);
  }else if(classification==='released-unpaid'&&r.expectedNet){
   const open=parse(r.expectedNet.decimal);dueDecimal=format(open);amountKnown=true;total(r.gross?.currency).open+=open;
  }
  if(r.merge?.merged===true&&classification!=='paid')reasons.push('merge-is-not-acceptance');
  if(r.pendingLedger===true)reasons.push('pending-ledger');
  if(r.foreignRewardObserved&&r.foreignRewardObserved.ownerOwn!==true)reasons.push('foreign-reward-ignored');
  if(r.advertised&&classification!=='paid'){const key=r.advertised.currency+'|'+r.advertised.announcementId;if(!nominal.has(key))nominal.set(key,{currency:r.advertised.currency,amount:parse(r.advertised.decimal)});}
  return {id:r.id,source:r.source??null,classification,receivedDecimal,dueDecimal,amountKnown,difference,supersededFlags,reasons,startsWork:false};
 });
 const pool=new Map();for(const {currency,amount} of nominal.values()){const p=pool.get(currency)??{amount:0n,announcements:0};p.amount+=amount;p.announcements++;pool.set(currency,p);}
 const sorted=m=>[...m.entries()].sort(([a],[b])=>a<b?-1:1);
 return {schema:'numaron-order-claims-v1',records:rows,
  totals:sorted(totals).map(([currency,t])=>({currency,grossPaidDecimal:format(t.gross),receivedDecimal:format(t.received),deductionsDecimal:t.grossComplete?format(t.gross-t.received):null,openConfirmedDecimal:format(t.open)})),
  nominalUnconfirmed:sorted(pool).map(([currency,p])=>({currency,decimal:format(p.amount),announcements:p.announcements})),
  scope:'Getrennte Zustände aus vorhandenen Belegen; keine Gesamtsumme über Währungen, kein Gewinn, keine neue Kundenarbeit.'};
}
