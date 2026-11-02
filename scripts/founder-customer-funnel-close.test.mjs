// Reuse checks and monthly close with the counter-checks named in the profit package. Temporary values only.
import test from 'node:test';import assert from 'node:assert/strict';
import {reuseCheck,closeMonth,offerFamilyCheck} from './founder-customer-funnel.mjs';
import {realProfitMilestones} from './founder-expert-acceptance.mjs';
const h=c=>c.repeat(64),now=Date.parse('2027-12-15T12:00:00Z'),receiptPolicy={acceptedTypes:['rc']},milestones=m=>realProfitMilestones(m,{now,receiptPolicy});
const component=over=>({id:'csv-kit',version:'3',license:'own',containsCredentials:false,sourceDigest:h('a'),runtimeDigest:h('b'),verifierDigest:h('c'),schemaDigest:h('d'),containsCustomerData:false,confidential:false,...over});
const current=over=>({sourceDigest:h('a'),runtimeDigest:h('b'),verifierDigest:h('c'),schemaDigest:h('d'),...over});
const fresh=[{id:'new-input',passed:true,oldTest:false}];
test('Section 3 reuse keeps its bindings and always needs fresh checks on new inputs',()=>{
 const ok=reuseCheck({component:component(),current:current(),checks:fresh});assert.equal(ok.allowed,true);assert.equal(ok.proofTransferred,false);
 for(const [over,reason] of [[{checks:[]},'fresh-check-missing'],[{checks:[{id:'old',passed:true,oldTest:true}]},'fresh-check-missing'],[{checks:[{id:'n',passed:false,oldTest:false}]},'check-failed:n'],[{current:current({schemaDigest:h('9')})},'schema-changed'],[{current:current({sourceDigest:h('9')})},'integrity-changed:sourceDigest'],[{current:current({runtimeDigest:h('9')})},'integrity-changed:runtimeDigest'],[{current:current({verifierDigest:h('9')})},'integrity-changed:verifierDigest'],[{component:component({license:'unknown'})},'license-not-suitable'],[{component:component({license:undefined})},'license-not-suitable'],[{component:component({containsCustomerData:true})},'customer-data'],[{component:component({confidential:true})},'confidential'],[{component:component({containsCustomerData:undefined})},'customer-data']]){
  const r=reuseCheck({component:component(),current:current(),checks:fresh,...over});assert.equal(r.allowed,false,reason);assert.ok(r.reasons.includes(reason),reason);
 }
 assert.equal(reuseCheck({component:component({license:'MIT'}),current:current(),checks:fresh}).allowed,true);
});
test('Section 1 an offer family needs two unknown inputs on one work path; other scope is recalculated',()=>{
 const run=(id,over)=>({inputId:id,workPath:'w1',passed:true,unknownBefore:true,scopeDigest:'s',...over}),family={familyId:'daten',scopeDigest:'s',runs:[run('a'),run('b')]};
 const ok=offerFamilyCheck(family);assert.equal(ok.ready,true);assert.equal(ok.salesAuthorized,false);
 for(const [runs,reason] of [[[run('a')],'two-unknown-inputs-required'],[[run('a'),run('a')],'two-unknown-inputs-required'],[[run('a'),run('b',{unknownBefore:false})],'two-unknown-inputs-required'],[[run('a'),run('b',{workPath:'w2'})],'one-work-path-required'],[[run('a'),run('b',{passed:false})],'run-failed:b']])
  {const r=offerFamilyCheck({...family,runs});assert.equal(r.ready,false,reason);assert.ok(r.reasons.includes(reason),reason);}
 const wider=offerFamilyCheck({...family,runs:[run('a'),run('b'),run('c',{scopeDigest:'other'})]});assert.deepEqual(wider.recalculate,['c']);assert.equal(wider.oldPriceApplies,false);
});
const ledger=k=>({evidenceRef:'ledger:'+k}),all={fee:ledger('fee'),fulfillment:ledger('fulfillment'),rework:ledger('rework'),acquisition:ledger('acquisition'),overhead:ledger('overhead'),learning:ledger('learning')};
const money=(month,amount,over={})=>[{id:month+'r',kind:'receipt',status:'settled',amountMinor:amount,currency:'CHF',at:month+'-15T12:00:00Z',evidenceRef:'rc:'+month},{id:month+'f',kind:'fee',status:'settled',amountMinor:0,currency:'CHF',at:month+'-15T12:00:00Z',evidenceRef:'fee'}].map(e=>({...e,...over}));
const close=(month,entries,over={})=>closeMonth({month,now,entries,coverage:all,calculationVersion:'v1',receiptPolicy,...over});
test('Month close counts only inside its Zurich month, half-open, across year end',()=>{
 const edge=[{id:'in',kind:'receipt',status:'settled',amountMinor:100,currency:'CHF',at:'2026-12-31T22:59:59Z',evidenceRef:'rc:a'},{id:'out',kind:'receipt',status:'settled',amountMinor:999,currency:'CHF',at:'2026-12-31T23:00:00Z',evidenceRef:'rc:b'}];
 assert.equal(close('2026-12',edge).outcome.receiptsMinor,100);assert.equal(close('2027-01',edge).outcome.receiptsMinor,999);
 const dst=[{id:'d',kind:'receipt',status:'settled',amountMinor:5,currency:'CHF',at:'2026-03-31T22:00:00Z',evidenceRef:'rc:a'}];assert.equal(close('2026-03',dst).outcome.receiptsMinor,0);assert.equal(close('2026-04',dst).outcome.receiptsMinor,5);
});
test('Three months exactly on target qualify; one low month breaks despite a high average',()=>{
 const m=(month,a)=>close(month,money(month,a));
 const three=milestones([m('2027-01',100000),m('2027-02',100000),m('2027-03',100000)]);assert.equal(three.stage,1);assert.deepEqual(three.stage1Months,['2027-01','2027-02','2027-03']);
 const low=milestones([m('2027-01',900000),m('2027-02',99999),m('2027-03',900000)]);assert.equal(low.stage,0);
 const second=milestones(['2027-01','2027-02','2027-03'].map(x=>m(x,300000)).concat(['2027-04','2027-05','2027-06'].map(x=>m(x,300000))));assert.equal(second.stage,2);assert.deepEqual(second.stage2Months,['2027-04','2027-05','2027-06']);
 assert.equal(milestones(['2027-01','2027-02','2027-03'].map(x=>m(x,300000))).stage,1);
 const broken=milestones(['2027-01','2027-02','2027-03','2027-04','2027-05'].map(x=>m(x,300000)).concat([m('2027-06',1),...['2027-07','2027-08','2027-09'].map(x=>m(x,300000))]));assert.equal(broken.stage,2);assert.deepEqual(broken.stage2Months,['2027-07','2027-08','2027-09']);
});
test('Partial months, missing costs, unsettled entries and foreign currency allow no reached month',()=>{
 const running=close('2027-12',money('2027-12',500000));assert.equal(running.complete,false);assert.equal(running.status,'provisional');
 const missing=close('2027-01',money('2027-01',500000),{coverage:{...all,acquisition:false}});assert.equal(missing.complete,false);assert.ok(missing.openPoints.includes('coverage:acquisition'));assert.equal(missing.outcome.costsComplete,false);
 const noCoverage=close('2027-01',money('2027-01',500000),{coverage:undefined});assert.equal(noCoverage.complete,false);
 for(const [extra,point] of [[{id:'x',kind:'fee',status:'settled',amountMinor:null,currency:'CHF',at:'2027-01-02T00:00:00Z'},'cost-unknown:x'],[{id:'y',kind:'fee',amountMinor:5,currency:'CHF',at:'2027-01-02T00:00:00Z',status:'estimated'},'not-settled:y'],[{id:'z',kind:'fee',amountMinor:5,currency:'CHF',at:'2027-01-02T00:00:00Z',status:'reserved'},'not-settled:z'],[{id:'u',kind:'receipt',status:'settled',amountMinor:5,currency:'USD',at:'2027-01-02T00:00:00Z',evidenceRef:'rc:r'},'fx-missing:u'],[{id:'n',kind:'receipt',status:'settled',amountMinor:5,currency:'CHF',at:'2027-01-02T00:00:00Z'},'receipt-evidence:n'],[{id:'p',kind:'receipt',amountMinor:5,currency:'CHF',at:'2027-01-02T00:00:00Z',evidenceRef:'rc:r',status:'pending'},'not-settled:p'],[{id:'t',kind:'mystery',amountMinor:5,currency:'CHF',at:'2027-01-02T00:00:00Z'},'unknown-kind:t']]){
  const r=close('2027-01',[...money('2027-01',500000),extra]);assert.equal(r.complete,false,point);assert.ok(r.openPoints.includes(point),point);
 }
 assert.throws(()=>close('2027-01',[{id:'s',kind:'fee',status:'settled',amountMinor:5,currency:'CHF',at:'2027-01-02T00:00:00Z',salaryMinor:5}]),/personnel/i);
});
test('Duplicates count once, transfers are no profit, conflicts stay open',()=>{
 const dup=close('2027-01',[...money('2027-01',100000),...money('2027-01',100000)]);assert.equal(dup.outcome.receiptsMinor,100000);assert.equal(dup.complete,true);
 const sameReceipt=close('2027-01',[{id:'a',kind:'receipt',status:'settled',amountMinor:100,currency:'CHF',at:'2027-01-02T00:00:00Z',evidenceRef:'rc:same'},{id:'b',kind:'receipt',status:'settled',amountMinor:100,currency:'CHF',at:'2027-01-03T00:00:00Z',evidenceRef:'rc:same'}]);assert.equal(sameReceipt.outcome.receiptsMinor,100);assert.ok(sameReceipt.openPoints.includes('duplicate-receipt:rc:same'));assert.equal(sameReceipt.complete,false);
 const conflict=close('2027-01',[{id:'a',kind:'fee',status:'settled',amountMinor:1,currency:'CHF',at:'2027-01-02T00:00:00Z'},{id:'a',kind:'fee',status:'settled',amountMinor:2,currency:'CHF',at:'2027-01-02T00:00:00Z'}]);assert.ok(conflict.openPoints.includes('conflict:a'));assert.equal(conflict.complete,false);
 const transfers=close('2027-01',[...money('2027-01',1000),{id:'w',kind:'withdrawal',amountMinor:500,currency:'CHF',at:'2027-01-02T00:00:00Z'},{id:'t',kind:'prepaid-transfer',amountMinor:700,currency:'CHF',at:'2027-01-02T00:00:00Z'}]);assert.equal(transfers.outcome.receiptsMinor,1000);assert.equal(transfers.outcome.overheadMinor,0);assert.deepEqual(transfers.excluded,['w','t']);assert.equal(transfers.complete,true);
});
test('A late refund or correction recalculates the month and archives the earlier result',()=>{
 const first=close('2027-01',money('2027-01',100000)),later=close('2027-01',[...money('2027-01',100000),{id:'rf',kind:'refund',status:'settled',amountMinor:1,currency:'CHF',at:'2027-01-20T00:00:00Z',evidenceRef:'rf'}],{previous:first});
 assert.notEqual(later.digest,first.digest);assert.equal(later.revision,2);assert.deepEqual(later.archived.map(a=>a.digest),[first.digest]);assert.equal(later.outcome.refundsMinor,1);
 const same=close('2027-01',money('2027-01',100000),{previous:first});assert.equal(same.revision,1);assert.deepEqual(same.archived,[]);
 const third=close('2027-01',money('2027-01',100000),{previous:later});assert.equal(third.revision,3);assert.equal(third.archived.length,2);
 const m=x=>close(x,money(x,100000));assert.equal(milestones([later,m('2027-02'),m('2027-03')]).stage,0);
});
test('Purely simulated income never reaches a milestone',()=>{
 const m=x=>close(x,money(x,500000,{synthetic:true}));const s=m('2027-01');assert.equal(s.synthetic,true);assert.equal(milestones([s,m('2027-02'),m('2027-03')]).stage,0);
 const mixed=close('2027-01',[...money('2027-01',500000),{id:'sim',kind:'receipt',status:'settled',amountMinor:1,currency:'CHF',at:'2027-01-02T00:00:00Z',evidenceRef:'rc:s',synthetic:true}]);assert.equal(mixed.synthetic,true);
 assert.equal(close('2027-01',money('2027-01',1)).budgetChange,null);
});
