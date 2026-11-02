import test from 'node:test';
import assert from 'node:assert/strict';
import {financialSummary} from '../web/founder/model.mjs';
const now=Date.parse('2026-10-13T15:00:00Z');
function state(rows=[]){return {financeReport:{transactions:[{id:'txn1',type:'charge',amount:1000,fee:30,currency:'chf',created:now/1000}],coverage:{complete:true,from:Date.parse('2024-01-01')/1000,to:now/1000}},financeLedger:{entries:[],closures:{}},billing:{checkedAt:new Date(now).toISOString(),providers:[{provider:'OpenAI',status:'connected',from:'2025-10-13',rows},{provider:'Cloudflare',status:'connected',rows:[]}]},autonomy:{budget:{entries:[],entriesComplete:true}}};}
const row=(day,amountCHF=0.2036)=>({day,amount:0.2446,currency:'USD',amountCHF,rateDay:day,reference:'openai-usage:test:'+day});
test('manual confirmation needs no bank connection and prepaid payment never reduces profit twice',()=>{
 const s=state();s.financeLedger.entries=[{day:'2026-10-13',kind:'transfer',amount:7392,title:'OpenAI Guthaben',evidence:'invoice-prepaid'}];
 s.financeLedger.closures.today={complete:true};const f=financialSummary(s,'today',now);
 assert.equal(f.profitMinor,970);assert.equal(f.reconciled,true);assert.ok(!f.reconciliationIssues.some(x=>/Bank|Karte/.test(x)));
 s.financeLedger.closures.today.complete=false;assert.ok(!financialSummary(s,'today',now).reconciliationIssues.some(x=>/Bank|Karte/.test(x)));
});
test('calculated profit subtracts converted usage and actual expenses, never conservative budget estimates',()=>{
 const s=state([row('2026-10-13')]);s.financeLedger.entries=[{day:'2026-10-13',kind:'expense',amount:100,title:'Domain',evidence:'domain1'}];s.autonomy.budget.entries=[{day:'2026-10-13',actualCostRappen:9000}];
 const f=financialSummary(s,'today',now);assert.equal(f.calculatedProfitMinor,850);assert.equal(f.automaticCostMinor,20);assert.equal(f.profitMinor,null);assert.equal(f.profitStatus,'provisional');assert.ok(f.reconciliationIssues.length);
});
test('period selection isolates rows and missing history yields partial profit rather than a complete zero',()=>{
 const s=state([row('2026-10-13',1),row('2026-10-08',2),row('2026-09-23',3)]);
 assert.equal(financialSummary(s,'today',now).calculatedProfitMinor,870);assert.equal(financialSummary(s,'week',now).calculatedProfitMinor,670);assert.equal(financialSummary(s,'month',now).calculatedProfitMinor,370);s.billing.providers[0].from='2026-01-01';const year=financialSummary(s,'year',now);assert.equal(year.calculatedProfitMinor,370);assert.equal(year.profitStatus,'partial');assert.ok(year.reconciliationIssues.some(i=>i.includes('2026-01-01')));
});
test('exact provider reference reconciles expense instead of counting usage twice',()=>{
 const r=row('2026-10-13',1);const s=state([r]);s.financeLedger.entries=[{day:r.day,kind:'expense',amount:110,title:'OpenAI',evidence:r.reference}];const f=financialSummary(s,'today',now);assert.equal(f.calculatedProfitMinor,860);assert.equal(f.automaticCostMinor,0);assert.equal(f.matchedBillingCount,1);
});
test('missing FX prevents a numeric profit and disconnected provider clearly marks partial data',()=>{
 const s=state([{day:'2026-10-13',amount:1,currency:'USD'}]);assert.equal(financialSummary(s,'today',now).calculatedProfitMinor,null);
 s.billing.providers[0]={provider:'OpenAI',status:'unavailable',rows:[]};assert.equal(financialSummary(s,'today',now).profitStatus,'partial');
});
test('a provider outage keeps known cached costs in a clearly partial profit',()=>{
 const s=state([row('2026-10-13',1)]);s.billing.providers[0].status='stale';const f=financialSummary(s,'today',now);assert.equal(f.calculatedProfitMinor,870);assert.equal(f.profitStatus,'partial');assert.ok(f.reconciliationIssues.some(i=>i.includes('gespeicherter')));
});
test('usage revisions invalidate exact evidence matches rather than hiding additional consumption',()=>{
 const before=row('2026-10-13',1);before.reference+=':1';const s=state([{...before,amountCHF:2,reference:before.reference+':revision2'}]);s.financeLedger.entries=[{day:before.day,kind:'expense',title:'OpenAI',amount:100,evidence:before.reference}];assert.equal(financialSummary(s,'today',now).calculatedProfitMinor,null);
});
test('unallocated Cloudflare charges and provider invoice overlaps are not silently deducted twice',()=>{
 const s=state([row('2026-10-13',1)]);s.financeLedger.entries=[{day:'2026-10-13',kind:'expense',amount:110,title:'OpenAI · Invoice',evidence:'invoice1'}];assert.equal(financialSummary(s,'today',now).calculatedProfitMinor,null);
 s.financeLedger.entries=[];s.billing.providers[1].rows=[{day:'2026-10-13',amount:10,amountCHF:8,currency:'USD',type:'charge'}];assert.equal(financialSummary(s,'today',now).profitStatus,'partial');assert.equal(financialSummary(s,'today',now).automaticCostMinor,100);
});
