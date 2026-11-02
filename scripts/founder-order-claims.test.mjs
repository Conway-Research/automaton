// Offline acceptance for confirmed-funded cases Z01, Z03, Z05, Z08, Z09 and Z11. Synthetic records shaped like the
// audited patterns in outputs/order-payment-audit-20261028/REPORT.md; no account, chain or platform is read.
import test from 'node:test';import assert from 'node:assert/strict';
import {projectOrderClaims} from './founder-order-claims.mjs';
import {orderAccounts} from './founder-order-accountability.mjs';
const paid=(id,gross,net,extra={})=>({id,source:'synthetic-escrow',gross:{decimal:gross,currency:'USDC'},assignment:{own:true,ref:'fake:assign:'+id},funding:{verified:true,ownRecipient:true,ref:'fake:fund:'+id},submission:{ref:'fake:proof:'+id},release:{ref:'fake:release:'+id},transfer:{confirmed:true,netDecimal:net,currency:'USDC',ref:'fake:tx:'+id},...extra});
const byId=(r,id)=>r.records.find(x=>x.id===id);

test('Z01 three audited patterns map exactly and historical receipts start no new work',()=>{
 const r=projectOrderClaims([paid('csv','10','9.675',{expectedNet:{decimal:'9.68',displayRounded:true}}),paid('chicago','20','19.35'),paid('philadelphia','8','7.74')]);
 for(const x of r.records){assert.equal(x.classification,'paid');assert.equal(x.startsWork,false);assert.equal(x.dueDecimal,null);}
 assert.deepEqual(r.totals,[{currency:'USDC',grossPaidDecimal:'38',receivedDecimal:'36.765',deductionsDecimal:'1.235',openConfirmedDecimal:'0'}]);
});
test('Z01 a later real receipt supersedes an older completion flag, visibly',()=>{
 const x=byId(projectOrderClaims([paid('csv','10','9.675',{completionFlags:{acceptanceConfirmed:false,paymentReceivedConfirmed:false}})]),'csv');
 assert.equal(x.classification,'paid');assert.deepEqual(x.supersededFlags,['acceptanceConfirmed','paymentReceivedConfirmed']);
});
test('Z03 one advertisement with two PRs yields a single unconfirmed nominal and no claim',()=>{
 const pr=id=>({id,source:'synthetic-git',advertised:{decimal:'100',currency:'USD',announcementId:'issue-24'},submission:{ref:'fake:'+id},merge:{merged:id==='pr-b'}});
 const r=projectOrderClaims([pr('pr-a'),pr('pr-b')]);
 for(const x of r.records){assert.equal(x.classification,'claim-unconfirmed');assert.equal(x.dueDecimal,null);assert.equal(x.startsWork,false);}
 assert.deepEqual(r.nominalUnconfirmed,[{currency:'USD',decimal:'100',announcements:1}]);assert.deepEqual(r.totals,[]);
});
test('Z02 merge alone is not acceptance, payment or revenue',()=>{
 const x=byId(projectOrderClaims([{id:'m',source:'synthetic-git',submission:{ref:'fake:m'},merge:{merged:true}}]),'m');
 assert.equal(x.classification,'claim-unconfirmed');assert.equal(x.receivedDecimal,null);assert.ok(x.reasons.includes('merge-is-not-acceptance'));
});
test('Z05 pending ledger and a reward message for someone else invent no amount',()=>{
 const r=projectOrderClaims([{id:'ledger',source:'synthetic-forum',submission:{ref:'fake:l'},pendingLedger:true,foreignRewardObserved:{decimal:'250',currency:'USD',ownerOwn:false}}]);
 const x=r.records[0];assert.equal(x.classification,'claim-unconfirmed');assert.equal(x.dueDecimal,null);assert.equal(x.amountKnown,false);assert.ok(x.reasons.includes('pending-ledger'));assert.ok(x.reasons.includes('foreign-reward-ignored'));
 assert.deepEqual(r.totals,[]);assert.deepEqual(r.nominalUnconfirmed,[]);
});
test('Z08 release without a transfer stays unpaid with the agreed net open',()=>{
 const x=paid('r','10','9.5');delete x.transfer;x.expectedNet={decimal:'9.5'};
 const r=projectOrderClaims([x]),y=r.records[0];
 assert.equal(y.classification,'released-unpaid');assert.equal(y.receivedDecimal,null);assert.equal(y.dueDecimal,'9.5');assert.equal(y.startsWork,false);
 assert.deepEqual(r.totals,[{currency:'USDC',grossPaidDecimal:'0',receivedDecimal:'0',deductionsDecimal:'0',openConfirmedDecimal:'9.5'}]);
});
test('Z08 an unconfirmed transfer never counts as received',()=>{
 const x=paid('r','10','9.5');x.transfer.confirmed=false;const y=projectOrderClaims([x]).records[0];
 assert.equal(y.classification,'released-unpaid');assert.equal(y.receivedDecimal,null);assert.equal(y.dueDecimal,null);assert.equal(y.amountKnown,false);
});
test('Z09 displayed rounding is documented, keeps original precision and is no shortfall',()=>{
 const x=projectOrderClaims([paid('csv','10','9.675',{expectedNet:{decimal:'9.68',displayRounded:true}})]).records[0];
 assert.equal(x.receivedDecimal,'9.675');assert.deepEqual(x.difference,{decimal:'0.005',kind:'documented-rounding'});assert.equal(x.dueDecimal,null);
});
for(const [name,net,expected,kind,due] of [
 ['real shortfall without the rounding flag','9.675',{decimal:'9.68'},'shortfall','0.005'],
 ['flagged display that does not round to the receipt','9.6',{decimal:'9.68',displayRounded:true},'shortfall','0.08'],
 ['overpayment','9.7',{decimal:'9.68',displayRounded:true},'overpayment',null]
])test('Z09 '+name+' is not hidden as rounding',()=>{
 const x=projectOrderClaims([paid('c','10',net,{expectedNet:expected})]).records[0];assert.equal(x.difference.kind,kind);assert.equal(x.dueDecimal,due);
});
test('Z09 currencies are never summed and no exchange rate is guessed',()=>{
 const r=projectOrderClaims([paid('a','10','9'),{...paid('b','5','4'),gross:{decimal:'5',currency:'CHF'},transfer:{confirmed:true,netDecimal:'4',currency:'CHF',ref:'fake:tx:b'}}]);
 assert.deepEqual(r.totals.map(t=>[t.currency,t.receivedDecimal]),[['CHF','4'],['USDC','9']]);assert.equal(JSON.stringify(r).includes('fx'),false);
});
test('invalid amounts and duplicate receipts fail closed',()=>{
 assert.throws(()=>projectOrderClaims([paid('a','10','9.5.1')]),/decimal/i);
 assert.throws(()=>projectOrderClaims([paid('a','10','1e3')]),/decimal/i);
 assert.throws(()=>projectOrderClaims([paid('a','10','9'),paid('a','10','9')]),/duplicate/i);
 const a=paid('a','10','9'),b=paid('b','10','9');b.transfer.ref=a.transfer.ref;const r=projectOrderClaims([a,b]);
 assert.equal(r.records[1].classification,'receipt-conflict');assert.equal(r.records[0].classification,'receipt-conflict');assert.deepEqual(r.totals,[]);
});
test('Z11 unknown cost yields no contribution; minutes stay outside money',()=>{
 const key={sourceId:'s',externalId:'e',ownerId:'o'},order={...key,rootTaskId:'root',state:'paid',funding:{amountMinor:1000,netAmountMinor:900,currency:'CHF',recipient:'me'},payment:{...key,confirmed:true,evidenceRef:'fake:r',amountMinor:900,currency:'CHF',recipient:'me'}};
 for(const budget of [{entriesComplete:true,entries:[]},{entriesComplete:false,entries:[{id:'c',taskId:'root',maxCostRappen:10,actualCostRappen:10}]},{entriesComplete:true,entries:[{id:'c',taskId:'root',maxCostRappen:10,actualCostRappen:null}]}]){
  const row=orderAccounts([order],budget).orders[0];assert.equal(row.contributionRappen,null);assert.ok(row.blockers.length>0);
 }
 const row=orderAccounts([order],{entriesComplete:true,entries:[{id:'c',taskId:'root',maxCostRappen:10,actualCostRappen:10}]}).orders[0];assert.equal(row.contributionRappen,890);
 const text=JSON.stringify(row);for(const word of ['salary','wage','personnel','labour'])assert.equal(text.includes(word),false);
});
