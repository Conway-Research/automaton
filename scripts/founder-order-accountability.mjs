import {bounded,digest,orderKey} from './founder-restoration-integrity.mjs';
const money=n=>Number.isSafeInteger(n)&&n>=0;
export function validateOrderPayment(order,payment){
 const terms=order.paymentAuthorization??order.funding;
 if(!terms||!money(terms.amountMinor)||!money(terms.netAmountMinor)||terms.netAmountMinor<=0||terms.netAmountMinor>terms.amountMinor||!bounded(terms.recipient)||!/^[A-Z]{3}$/.test(terms.currency??'')||payment?.confirmed!==true||!bounded(payment.evidenceRef,2000)||digest(orderKey(payment))!==digest(orderKey(order))||payment.amountMinor!==terms.netAmountMinor||payment.currency!==terms.currency||payment.recipient!==terms.recipient)throw Error('Exact contract-bound payment receipt required');
 return payment;
}

/** Read-only projection of trusted persisted orders and the existing budget.
 * No FX guesses, new expense ledger, provider access or budget mutations.
 * Contribution covers recorded direct costs, not tax, labour or total profit.
 */
// Explicit markers only; the fixed source list follows Patrice's receipt-source decision.
const nonReal=p=>p?.synthetic===true||p?.refunded===true||p?.chargeback===true||(p?.environment!==undefined&&p.environment!=='production');
export function orderAccounts(orders=[],budget={},{receiptSourcesDecided=true}={}){
 const roots=new Map(),receipts=new Map(),costs=new Map(),conflicts=new Set();
 for(const o of orders){roots.set(o.rootTaskId,(roots.get(o.rootTaskId)??0)+1);if(o.payment?.evidenceRef)receipts.set(o.payment.evidenceRef,(receipts.get(o.payment.evidenceRef)??0)+1);}
 for(const e of budget.entries??[]){
  if(!bounded(e.id)||!bounded(e.taskId)){conflicts.add('*');continue;}
  const old=costs.get(e.id);if(old&&digest(old)!==digest(e)){conflicts.add(old.taskId);conflicts.add(e.taskId);}else costs.set(e.id,e);
 }
 const rows=orders.map(o=>{
  const blockers=[];let actualCostRappen=0,heldRappen=0;
  if(budget.entriesComplete!==true)blockers.push('cost-coverage-incomplete');
  if(!bounded(o.rootTaskId)||roots.get(o.rootTaskId)!==1)blockers.push('cost-root-ambiguous');
  if(conflicts.has('*')||conflicts.has(o.rootTaskId))blockers.push('cost-evidence-conflict');
  if(![...costs.values()].some(e=>e.taskId===o.rootTaskId))blockers.push('cost-evidence-missing');
  for(const e of costs.values())if(e.taskId===o.rootTaskId){
   if(!money(e.maxCostRappen)||e.actualCostRappen!=null&&!money(e.actualCostRappen)){blockers.push('invalid-cost');continue;}
   if(e.actualCostRappen==null){heldRappen+=e.maxCostRappen;blockers.push('cost-unsettled');}else actualCostRappen+=e.actualCostRappen;
  }
  if(!money(actualCostRappen)||!money(heldRappen))blockers.push('cost-overflow');
  let received=null;
  if(o.state==='paid')try{validateOrderPayment(o,o.payment);if(receipts.get(o.payment.evidenceRef)!==1)throw Error();received={amountMinor:o.payment.amountMinor,currency:o.payment.currency,evidenceRef:o.payment.evidenceRef,...(o.payment.settlement?{settlement:structuredClone(o.payment.settlement)}:{})};}catch{blockers.push('payment-unverified-or-reused');}
  else blockers.push('payment-not-confirmed');
  if(received&&nonReal(o.payment))blockers.push('payment-not-real');
  if(received&&!receiptSourcesDecided)blockers.push('receipt-source-policy-undecided');
  if(received&&received.currency!=='CHF')blockers.push('settlement-currency-not-chf');
  const terms=o.paymentAuthorization??o.funding;
  const agreed=terms&&money(terms.amountMinor)&&money(terms.netAmountMinor)&&terms.netAmountMinor<=terms.amountMinor?{grossMinor:terms.amountMinor,netMinor:terms.netAmountMinor,contractDeductionsMinor:terms.amountMinor-terms.netAmountMinor,currency:terms.currency}:null;
  return {...orderKey(o),rootTaskId:o.rootTaskId,state:o.state,agreed,received,actualCostRappen,heldRappen,contributionRappen:blockers.length?null:received.amountMinor-actualCostRappen,blockers:[...new Set(blockers)]};
 });
 const unmatched=[...costs.values()].filter(e=>!roots.has(e.taskId));
 return {orders:rows,unallocatedCostEntries:unmatched.length,unallocatedActualCostRappen:unmatched.every(e=>money(e.actualCostRappen))?unmatched.reduce((n,e)=>n+e.actualCostRappen,0):null,scope:'Auftragsbeitrag aus bestätigtem Nettoeingang abzüglich erfasster direkter CHF-Kosten; kein Gesamtgewinn. Nicht zugeordnete Akquise-/Betriebskosten bleiben separat.'};
}
