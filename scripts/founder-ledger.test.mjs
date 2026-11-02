import test from 'node:test';
import assert from 'node:assert/strict';
import {openFounderLedger} from './founder-ledger.mjs';
import {financialSummary} from '../web/founder/model.mjs';
const now=Date.parse('2026-10-13T10:00Z'),created=now/1000;
const report={transactions:[{id:'txn_a',type:'charge',amount:10000,fee:300,net:9700,currency:'chf',created},{id:'txn_b',type:'payout',amount:-5000,fee:0,net:-5000,currency:'chf',created}],coverage:{complete:true,from:created-86400,to:created}};
test('actual CHF profit excludes transfers and estimates, survives reopen and invalidates on changes',()=>{
 const ledger=openFounderLedger(':memory:');const budget={entries:[{id:'r',day:'2026-10-13',actualCostRappen:99999}],entriesComplete:true};
 const add=(kind,amount,evidence)=>ledger.apply({action:'add',day:'2026-10-13',kind,amount,title:'Beleg',evidence},report,budget,now);
 add('expense',2000,'invoice-1');add('income',1000,'income-1');add('refund',500,'refund-1');add('expense-refund',200,'credit-1');add('transfer',50000,'transfer-1');
 const state=ledger.snapshot(report,budget,now);assert.equal(financialSummary({financeReport:report,financeLedger:state,autonomy:{budget}},'today',now).profitMinor,null);
 const closed=ledger.apply({action:'close',period:'today',fingerprint:state.closures.today.fingerprint,evidence:'Alle Konten und Rechnungen geprüft'},report,budget,now);
 assert.equal(financialSummary({financeReport:report,financeLedger:closed,autonomy:{budget}},'today',now).profitMinor,8400);
 assert.throws(()=>add('expense',2000,'invoice-1'));
 assert.throws(()=>ledger.apply({action:'add',day:'2026-02-30',kind:'expense',amount:20,title:'Invalid',evidence:'invalid-date'},report,budget,now));
 add('expense',100,'invoice-2');assert.equal(ledger.snapshot(report,budget,now).closures.today.complete,false);
 assert.throws(()=>ledger.apply({action:'close',period:'today',fingerprint:state.closures.today.fingerprint,evidence:'Alle Konten und Rechnungen geprüft'},report,budget,now));ledger.close();
});
test('changed Stripe bookings, usage, foreign currencies and partial coverage cannot certify profit',()=>{
 const ledger=openFounderLedger(':memory:'),budget={entries:[],entriesComplete:true};const state=ledger.snapshot(report,budget,now);ledger.apply({action:'close',period:'today',fingerprint:state.closures.today.fingerprint,evidence:'Alle Geschäftskonten geprüft'},report,budget,now);
 const changed={...report,transactions:[...report.transactions,{id:'txn_c',type:'charge',amount:100,fee:0,net:100,currency:'usd',created}]};assert.equal(ledger.snapshot(changed,budget,now).closures.today.complete,false);
 assert.equal(ledger.snapshot(report,{entries:[{id:'usage',day:'2026-10-13',actualCostRappen:1}]},now).closures.today.complete,false);
 const s={financeReport:{...report,coverage:{...report.coverage,complete:false}},financeLedger:ledger.snapshot(report,budget,now)};assert.equal(financialSummary(s,'today',now).profitMinor,null);ledger.close();
});
