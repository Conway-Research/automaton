// Counter-examples from the independent review of 1 Nov 2026: each one passed the module before its correction.
import test from 'node:test';import assert from 'node:assert/strict';
import {rankCandidates,draftOffer,clarificationStep,projectFunnel as openFunnel,contactEligibility,followUpDraft,scopeChange,funnelReport,salesProjection,routineDecision,reuseCheck,closeMonth,offerFamilyCheck} from './founder-customer-funnel.mjs';
import {realProfitMilestones,economicsClaim as claim} from './founder-expert-acceptance.mjs';
const h=c=>c.repeat(64),clock=Date.parse('2027-12-15T12:00:00Z'),receiptPolicy={acceptedTypes:['rc','receipt','bank']},milestones=m=>realProfitMilestones(m,{now:clock,receiptPolicy}),economicsClaim=a=>claim({receiptPolicy,...a}),projectFunnel=(e,o)=>openFunnel(e,{receiptPolicy,...o});
const ledger=k=>({evidenceRef:'ledger:'+k}),all={fee:ledger('fee'),fulfillment:ledger('fulfillment'),rework:ledger('rework'),acquisition:ledger('acquisition'),overhead:ledger('overhead'),learning:ledger('learning')};
const close=(month,entries,over={})=>closeMonth({month,now:clock,entries,coverage:all,calculationVersion:'v1',receiptPolicy,...over});
const entry=(id,kind,over={})=>({id,kind,status:'settled',amountMinor:100,currency:'CHF',at:'2027-01-10T12:00:00Z',evidenceRef:kind+':'+id,...over});
test('Close: only settled entries count; every other status stays open and earns no claim',()=>{
 for(const status of ['failed','reversed','simulated','chargeback','disputed','Pending','settled ',undefined,null]){
  const m=close('2027-01',[entry('r','receipt',{status})]);assert.equal(m.complete,false,String(status));assert.equal(m.outcome.receiptsMinor,0,String(status));assert.ok(m.openPoints.includes('not-settled:r'),String(status));
  assert.notEqual(economicsClaim({outcome:m.outcome,learningMinor:m.learningMinor}).status,'confirmed',String(status));
 }
});
test('Close: invalid values stay open points and never decide by crashing',()=>{
 for(const amountMinor of [NaN,Infinity,-1,1.5,'100',undefined,null]){const m=close('2027-01',[entry('f','fee',{amountMinor})]);assert.ok(m.openPoints.includes('cost-unknown:f'),String(amountMinor));assert.equal(m.complete,false,String(amountMinor));}
 assert.deepEqual(projectFunnel([{id:'x',type:'qualified',customerRef:'c',amountMinor:NaN},{id:'x',type:'qualified',customerRef:'c',amountMinor:NaN}]).conflicts,[]);
 assert.deepEqual(projectFunnel([{id:'x',type:'qualified',customerRef:'c',note:undefined},{id:'x',type:'closed',customerRef:'c'}]).conflicts,['x']);
});
test('Close: simulated income in any spelling never reaches the amounts, also in a mixed month',()=>{
 for(const over of [{evidenceRef:'simulated:1'},{evidenceRef:'sim_1'},{evidenceRef:'paper:1'},{evidenceRef:'mock-1'},{evidenceRef:' fake:1'},{evidenceRef:'​fake:1'},{evidenceRef:'ｆake:1'},{synthetic:'true'},{synthetic:1},{synthetic:true}]){
  const m=close('2027-01',[entry('real','receipt',{evidenceRef:'rc:real'}),entry('s','receipt',over)]),label=JSON.stringify(over);
  assert.equal(m.outcome.receiptsMinor,100,label);assert.equal(m.synthetic,true,label);assert.equal(m.complete,false,label);assert.ok(m.openPoints.includes('simulated:s'),label);
 }
 const free=close('2027-01',[entry('f','receipt',{evidenceRef:'customer said paid'})]);assert.ok(free.openPoints.includes('receipt-evidence:f'));assert.equal(free.outcome.receiptsMinor,0);
});
test('Close: a cost without a valid date stays open and is not read as zero',()=>{
 for(const at of [undefined,'','garbage','2027-01-10','2027-02-30T00:00:00Z','2027-01-10T12:00:00']){
  const m=close('2027-01',[entry('r','receipt'),entry('f','fee',{amountMinor:400000,at})]);assert.equal(m.complete,false,String(at));assert.ok(m.openPoints.includes('date-missing:f'),String(at));assert.equal(m.outcome.costsComplete,false,String(at));
 }
});
test('Close: one payment counts once across months',()=>{
 const same=x=>close(x,[entry('r','receipt',{amountMinor:900000,evidenceRef:'rc:one',at:x+'-10T12:00:00Z'})]);
 assert.equal(milestones([same('2027-01'),same('2027-02'),same('2027-03')]).stage,0);
 const together=['2027-01','2027-02'].map(x=>entry('r','receipt',{at:x+'-10T12:00:00Z'}));
 for(const x of ['2027-01','2027-02'])assert.ok(close(x,together).openPoints.includes('conflict:r'),x);
 const variant=x=>close(x,[entry('r'+x,'receipt',{amountMinor:900000,evidenceRef:x==='2027-02'?'RC:one​':'rc:one',at:x+'-10T12:00:00Z'})]);
 assert.equal(milestones([variant('2027-01'),variant('2027-02'),variant('2027-03')]).stage,0);
});
test('Close: a refund moves its receipt month, whenever it arrives; without a link that month stays open',()=>{
 const rc=entry('r','receipt',{evidenceRef:'rc:jan',amountMinor:500000}),rf=entry('f','refund',{at:'2027-04-02T00:00:00Z',receiptRef:'rc:jan',amountMinor:500000});
 const jan=close('2027-01',[rc,rf]),apr=close('2027-04',[rc,rf]);
 assert.equal(jan.outcome.refundsMinor,500000);assert.equal(apr.outcome.refundsMinor,0);assert.ok(apr.excluded.includes('f'));
 const free=close('2027-04',[rc,entry('f','refund',{at:'2027-04-02T00:00:00Z'})]);assert.ok(free.openPoints.includes('refund-unlinked:f'));assert.equal(free.complete,false);
 assert.ok(close('2027-01',[rc,entry('c','chargeback')]).openPoints.includes('refund-unlinked:c'));
});
test('Close: open points and running months keep costs incomplete; no claim from them',()=>{
 for(const [m,reason] of [[close('2027-01',[entry('r','receipt'),entry('f','fee',{amountMinor:null})]),'cost-unknown'],[close('2027-01',[entry('r','receipt'),entry('f','fee',{status:'pending'})]),'not-settled'],[close('2027-01',[entry('r','receipt'),entry('f','fee',{currency:'USD'})]),'fx'],[close('2027-12',[entry('r','receipt',{at:'2027-12-02T00:00:00Z'})]),'provisional']]){
  assert.equal(m.outcome.costsComplete,false,reason);assert.notEqual(economicsClaim({outcome:m.outcome,learningMinor:m.learningMinor}).status,'confirmed',reason);
 }
});
test('Close: a true flag proves no cost coverage and absent costs are not zero',()=>{
 const flags={fee:true,fulfillment:true,rework:true,acquisition:true,overhead:true,learning:true},m=close('2027-01',[entry('r','receipt')],{coverage:flags});
 assert.equal(m.complete,false);for(const k of Object.keys(flags))assert.ok(m.openPoints.includes('coverage:'+k),k);assert.equal(m.learningMinor,null);
 assert.equal(close('2027-01',[entry('r','receipt')],{coverage:{...all,fee:{evidenceRef:'fake:1'}}}).complete,false);
});
test('Close: the month digest binds its entries and coverage',()=>{
 const base=close('2027-01',[entry('r','receipt'),entry('f','fee',{evidenceRef:'fee:a'})]),other=close('2027-01',[entry('r','receipt'),entry('f','fee',{evidenceRef:'fee:b'})],{previous:base});
 assert.notEqual(other.digest,base.digest);assert.equal(other.revision,2);
 assert.notEqual(close('2027-01',[entry('r','receipt')],{coverage:{...all,fee:{evidenceRef:'ledger:other'}}}).digest,close('2027-01',[entry('r','receipt')]).digest);
});
test('Close: future or running months and personnel categories reach no milestone',()=>{
 const m=x=>close(x,[entry('r'+x,'receipt',{amountMinor:900000,evidenceRef:'rc:'+x,at:x+'-10T12:00:00Z'})]),months=[m('2027-01'),m('2027-02'),m('2027-03')];
 assert.equal(realProfitMilestones(months,{now:Date.parse('2027-03-20T00:00:00Z'),receiptPolicy}).stage,0);assert.equal(realProfitMilestones(months,{now:Date.parse('2027-04-02T00:00:00Z'),receiptPolicy}).stage,1);
 for(const record of [{category:'employee salary'},{payrollMinor:1},{gehaltMinor:1},{staffCostMinor:1},{ownerTimeMinor:1},{ownerHours:1},{type:'salary'},{personalkostenMinor:1},{'sаlary':1},{note:'{"wageMinor":1}'}])
  assert.throws(()=>close('2027-01',[entry('o','overhead',record)]),/personnel|minutes/i,JSON.stringify(record));
});
const component=over=>({id:'csv-kit',version:'3',license:'own',containsCredentials:false,sourceDigest:h('a'),runtimeDigest:h('b'),verifierDigest:h('c'),schemaDigest:h('d'),containsCustomerData:false,confidential:false,...over});
const current={sourceDigest:h('a'),runtimeDigest:h('b'),verifierDigest:h('c'),schemaDigest:h('d')},fresh=[{id:'new-input',passed:true,oldTest:false}];
test('Reuse and offer family: fail-open defaults are closed',()=>{
 for(const containsCredentials of [true,undefined])assert.ok(reuseCheck({component:component({containsCredentials}),current,checks:fresh}).reasons.includes('credentials'),String(containsCredentials));
 assert.ok(reuseCheck({component:component(),current,checks:[...fresh,{id:'old',passed:false,oldTest:true}]}).reasons.includes('check-failed:old'));
 const run=(id,over)=>({inputId:id,workPath:'w1',passed:true,unknownBefore:true,...over});
 assert.equal(offerFamilyCheck({familyId:'x',runs:[run('a'),run('b')]}).ready,false);
 assert.ok(offerFamilyCheck({familyId:'x',scopeDigest:'s',runs:[run('a',{scopeDigest:'s',workPath:undefined}),run('b',{scopeDigest:'s',workPath:undefined})]}).reasons.includes('work-path-missing'));
 assert.ok(offerFamilyCheck({familyId:'x',scopeDigest:'s',runs:[run('a',{scopeDigest:'s'}),run(undefined,{scopeDigest:'s'})]}).reasons.includes('two-unknown-inputs-required'));
});

const now=Date.parse('2026-11-01T12:00:00Z'),DAY=86400000,policy={maxFollowUps:2,minWaitMs:3*DAY};
const candidate=over=>({id:'c1',admissible:true,currency:'CHF',listPriceMinor:50000,feesMinor:5000,costUpperMinor:5000,acquisitionMinor:1000,reworkReserveMinor:2000,computeMinutes:60,...over});
const ev=(id,type,over={})=>({id,type,customerRef:'cust',sourceId:'src',family:'daten',rootTaskId:'root',offerVersion:'v1',at:new Date(now-30*DAY).toISOString(),evidenceRef:'ref:'+id,...over});
const elig=(events,over={},opt)=>contactEligibility(projectFunnel(events,opt),{customerRef:'cust',rootTaskId:'root',kind:'followup',policy,now,...over});
test('G05 a stop with a reused id is not lost and the conflict blocks contact',()=>{
 const r=elig([ev('b','qualified'),ev('b','contact-block')]);assert.equal(r.eligible,false);assert.ok(r.reasons.includes('event-conflict'));assert.ok(r.reasons.includes('contact-blocked'));
 assert.ok(elig([ev('b','qualified'),ev('b','complaint')]).reasons.includes('complaint-open'));
});
test('G04 G05 identity variants and alias chains reach the same person',()=>{
 for(const customerRef of ['Cust','cust ','CUST','cu​st','ｃｕｓｔ'])assert.equal(elig([ev('x','contact-block',{customerRef})]).eligible,false,JSON.stringify(customerRef));
 const chain=projectFunnel([ev('x','contact-block',{customerRef:'c'})],{aliases:{a:'b',b:'c'}});assert.equal(contactEligibility(chain,{customerRef:'a',rootTaskId:'r',kind:'followup',policy,now}).eligible,false);
 assert.equal(contactEligibility(projectFunnel([ev('x','qualified',{customerRef:'a'})],{aliases:{a:'b',b:'a'}}),{customerRef:'a',rootTaskId:'root',kind:'application',policy,now}).eligible,true);
});
test('G05 complaints follow their order, a surplus resolve closes nothing later',()=>{
 const at=d=>({at:new Date(now-d*DAY).toISOString()});
 assert.ok(elig([ev('c1','complaint',at(40)),ev('r1','complaint-resolved',at(39)),ev('r2','complaint-resolved',at(38)),ev('c2','complaint',at(37))]).reasons.includes('complaint-open'));
 assert.ok(elig([ev('r1','complaint-resolved',at(40)),ev('c1','complaint',at(39))]).reasons.includes('complaint-open'));
 assert.equal(elig([ev('c1','complaint',at(40)),ev('r1','complaint-resolved',at(39))]).eligible,true);
});
test('G05 a new root does not reset exhausted follow-ups; unknown kinds and objections stop',()=>{
 assert.ok(elig([1,2].map(i=>ev('f'+i,'followup-sent',{rootTaskId:'other'}))).reasons.includes('followup-limit'));
 for(const kind of [undefined,'follow-up','FOLLOWUP'])assert.ok(elig([ev('q','qualified')],{kind}).reasons.includes('contact-kind-unknown'),String(kind));
 assert.ok(elig([ev('o','objection')]).reasons.includes('objected'));
});
test('G06 only a real payment that stands allows a follow-up draft, one per need kind',()=>{
 const need={kind:'next-month-file',evidenceRef:'ref:need'},prior={costMinor:300,currency:'CHF'},args={customerRef:'cust',rootTaskId:'root',need,prior,policy,now},acc=ev('a','accepted'),pay=over=>ev('p','paid',{amountMinor:100,currency:'CHF',receiptRef:'bank:r',...over});
 for(const over of [{synthetic:true},{synthetic:'true'},{receiptRef:'fake:1'},{receiptRef:'mock-1'},{receiptRef:'paid by customer'},{currency:'__proto__'},{currency:'chf'}])assert.ok(followUpDraft(projectFunnel([acc,pay(over)]),args).reasons.includes('payment-pending'),JSON.stringify(over));
 for(const reversal of [ev('x','refund',{amountMinor:100,currency:'CHF',receiptRef:'rf'}),ev('x','chargeback',{amountMinor:100,currency:'CHF',receiptRef:'cb'}),ev('x','chargeback',{receiptRef:'cb'})])assert.ok(followUpDraft(projectFunnel([acc,pay(),reversal]),args).reasons.includes('payment-reversed'),reversal.type);
 const first=followUpDraft(projectFunnel([acc,pay()]),args);assert.equal(first.status,'draft');
 assert.equal(followUpDraft(projectFunnel([acc,pay(),ev('d','followup-draft',{draftId:first.id})]),{...args,need:{...need,evidenceRef:'ref:other'}}).status,'exists');
});
test('G08 receipts, reversals and money gaps stay honest across cases and families',()=>{
 const dup=funnelReport(projectFunnel([ev('p1','paid',{rootTaskId:'x',amountMinor:100,currency:'CHF',receiptRef:'bank:same'}),ev('p2','paid',{rootTaskId:'y',amountMinor:100,currency:'CHF',receiptRef:'bank:same'})]),{});assert.equal(dup.groups[0].counts.paid,1);
 const families=funnelReport(projectFunnel([ev('p1','paid',{rootTaskId:'x',family:'a',amountMinor:100,currency:'CHF',receiptRef:'bank:same'}),ev('p2','paid',{rootTaskId:'y',family:'b',amountMinor:100,currency:'CHF',receiptRef:'BANK:same\u200b'})]),{});assert.equal(families.groups.reduce((n,g)=>n+(g.money.CHF?.receivedMinor??0),0),100);
 const fake=funnelReport(projectFunnel([ev('p','paid',{amountMinor:100,currency:'CHF',receiptRef:'fake:1'})]),{});assert.equal(fake.groups[0].counts.paid,0);assert.equal(fake.groups[0].money.CHF,undefined);
 const g=funnelReport(projectFunnel([ev('s','sent'),ev('p','paid',{amountMinor:100,currency:'CHF',receiptRef:'bank:r'}),ev('x','chargeback',{amountMinor:100,currency:'CHF',receiptRef:'cb'})]),{}).groups[0];assert.equal(g.counts.paid,0);assert.equal(g.counts.chargebacks,1);assert.equal(g.money.CHF.refundedMinor,100);
 const twice=funnelReport(projectFunnel([ev('p','paid',{amountMinor:500,currency:'CHF',receiptRef:'bank:r'}),ev('x','refund',{amountMinor:100,currency:'CHF',receiptRef:'rf'}),ev('y','refund',{amountMinor:100,currency:'CHF',receiptRef:'rf'})]),{}).groups[0];assert.equal(twice.money.CHF.refundedMinor,100);assert.ok(twice.openPoints.includes('reversal-unproven:y'));
 const gaps=funnelReport(projectFunnel([ev('a','sent',{feeMinor:50}),ev('b','sent',{rootTaskId:'q',feeMinor:'50',currency:'CHF'}),ev('c','refund',{rootTaskId:'q',receiptRef:'z'}),ev('d','sent',{rootTaskId:'q2',evidenceRef:undefined})]),{}).groups[0];
 for(const point of ['fee-unknown:a','fee-unknown:b','reversal-unknown:c','evidence-missing:d'])assert.ok(gaps.openPoints.includes(point),point);
 const proto=funnelReport(projectFunnel([ev('p','sent',{feeMinor:5,currency:'__proto__'})]),{});assert.equal(({}).receivedMinor,undefined);assert.ok(proto.groups[0].openPoints.includes('fee-unknown:p'));
 const undated=funnelReport(projectFunnel([ev('a','sent',{at:undefined}),ev('b','sent',{rootTaskId:'z',at:'2026-10-01T00:00:00'})]),{});assert.deepEqual(undated.undated,['a','b']);
 assert.ok(salesProjection(undated,{requiredPaidOrders:1,minSample:1}).reasons.includes('no-real-outcomes')||salesProjection(undated,{requiredPaidOrders:1,minSample:1}).reasons.includes('report-open'));
 assert.ok(salesProjection(dup,{requiredPaidOrders:1,minSample:1}).reasons.includes('report-open'));
});
test('G01 G03 G07 defaults fail closed and uneconomic changes stay blocked',()=>{
 assert.equal(draftOffer().status,'blocked');assert.deepEqual(draftOffer().blocked,['candidate-missing','offer-version-missing','scope-missing']);
 const c=clarificationStep();assert.equal(c.workAllowed,false);assert.equal(c.state,'requirements-unknown');assert.equal(clarificationStep({required:[]}).workAllowed,true);
 assert.equal(scopeChange().workAllowed,false);assert.equal(scopeChange({agreed:{},requested:{}}).status,'scope-unknown');
 const low=scopeChange({agreed:{scopeDigest:'a',costUpperMinor:1},requested:{scopeDigest:'b',costUpperMinor:900,priceMinor:1},contract:{scopeDigest:'b',evidenceRef:'contract:c'},funding:{scopeDigest:'b',evidenceRef:'funding:f'}});assert.equal(low.status,'price-below-cost');assert.equal(low.workAllowed,false);
 const fakeRef=draftOffer({candidateId:'c',offerVersion:'v',scope:{},claims:[{kind:'capability',id:'x'},{kind:'reference',id:'k'}],evidence:{capabilities:{x:'fake:1'},references:[{id:'k',origin:'customer',synthetic:true,evidenceRef:'ref:k',publicationAllowedRef:'ref:p'}]}});assert.deepEqual(fakeRef.blocked,['capability:x','reference-permission:k']);
});
test('G01 currency, shared capacity and deadlines are honest',()=>{
 assert.equal(rankCandidates([candidate({currency:undefined})],{capacityMinutes:100}).ranked.length,0);
 assert.deepEqual(rankCandidates([candidate({id:'a'}),candidate({id:'b'})],{currency:'CHF',capacityMinutes:60,now}).ranked.map(x=>x.withinCapacity),[true,false]);
 for(const deadlineAt of ['2020-01-01T00:00:00Z','soon'])assert.equal(rankCandidates([candidate({deadlineAt})],{currency:'CHF',capacityMinutes:100,now}).rejected[0].reason,'deadline-not-reachable',deadlineAt);
 assert.equal(rankCandidates([candidate({deadlineAt:'2030-01-01T00:00:00Z'})],{currency:'CHF',capacityMinutes:100,now}).ranked.length,1);
});
test('G10 a newer human order always stops, however long it is',()=>{
 const scope={source:'docs/x.md',kinds:['internal-ranking']},run=counterOrder=>routineDecision({kind:'internal-ranking',scope,power:{enabled:true},external:false,counterOrder});
 for(const order of ['x'.repeat(5000),'stop\nnow',{reason:'no'},0])assert.equal(run(order).proceed,false,JSON.stringify(order));
 assert.equal(run(undefined).proceed,true);assert.equal(run(null).proceed,true);
});
test('Round 2: a chargeback reaches its receipt month exactly like a refund',()=>{
 const months=['2027-01','2027-02','2027-03'],all=months.flatMap(m=>[entry('r'+m,'receipt',{amountMinor:900000,evidenceRef:'rc:'+m,at:m+'-10T12:00:00Z'}),entry('c'+m,'chargeback',{amountMinor:900000,receiptRef:'rc:'+m,at:'2027-04-02T00:00:00Z'})]);
 const closed=months.map(m=>close(m,all));for(const m of closed)assert.equal(m.outcome.refundsMinor,900000);assert.equal(milestones(closed).stage,0);
 assert.equal(close('2027-04',all).outcome.refundsMinor,0);
});
test('Round 2: a real-looking reference counts only under an accepted type',()=>{
 for(const ref of ['mock1','fake1','stub:1','receipt:fake:1','sandbox:1','n/a','pi_test_123','mockpayment:1','stripe-test:1','rc:simulated','paypal-sim-1','other:1','1234']){
  const m=close('2027-01',[entry('r','receipt',{evidenceRef:ref})]);assert.equal(m.outcome.receiptsMinor,0,ref);assert.equal(m.complete,false,ref);
  assert.notEqual(economicsClaim({outcome:{receiptsMinor:1,refundsMinor:0,feesMinor:0,fulfillmentMinor:0,reworkMinor:0,acquisitionMinor:0,overheadMinor:0,currency:'CHF',costsComplete:true,receiptEvidence:[ref]},learningMinor:0}).status,'confirmed',ref);
 }
 assert.equal(close('2027-01',[entry('r','receipt',{evidenceRef:'rc:1'})],{receiptPolicy:undefined}).outcome.receiptsMinor,0);
});
test('Round 2: a failed retry cannot take a refund away from the paid month; odd refunds stay open',()=>{
 const paid=entry('r','receipt',{evidenceRef:'rc:jan',amountMinor:500000}),retry=entry('t','receipt',{evidenceRef:'rc:jan',status:'failed',at:'2027-03-10T12:00:00Z'}),back=entry('f','refund',{receiptRef:'rc:jan',amountMinor:500000,at:'2027-04-02T00:00:00Z'});
 assert.equal(close('2027-01',[paid,retry,back]).outcome.refundsMinor,500000);assert.equal(close('2027-03',[paid,retry,back]).outcome.refundsMinor,0);
 assert.ok(close('2027-01',[paid,entry('f','refund',{receiptRef:'rc:jan',amountMinor:500001})]).openPoints.includes('refund-exceeds-receipt:f'));
 assert.ok(close('2027-01',[paid,entry('f','refund',{receiptRef:'rc:jan',at:'2027-01-02T00:00:00Z'})]).openPoints.includes('refund-before-receipt:f'));
 const jan=close('2027-01',[entry('r','receipt',{amountMinor:900000,evidenceRef:'rc:a'})]),apr=close('2027-04',[entry('f','refund',{at:'2027-04-02T00:00:00Z'})]);assert.equal(jan.complete,true);assert.equal(milestones([jan,apr]).blocker,'reversal-unlinked');
});
test('Round 2: entries without id never collapse and unknown money fields stay open',()=>{
 const fee={kind:'fee',status:'settled',amountMinor:4000,currency:'CHF',at:'2027-01-10T12:00:00Z',evidenceRef:'f:1'},m=close('2027-01',[entry('r','receipt'),fee,{...fee}]);assert.equal(m.complete,false);assert.ok(m.openPoints.includes('entry-id-missing:1'));assert.ok(m.openPoints.includes('entry-id-missing:2'));
 for(const over of [{expenseMinor:5},{sozialMinor:5},{foo:1}]){const r=close('2027-01',[entry('o','overhead',over)]);assert.equal(r.complete,false,JSON.stringify(over));assert.equal(r.outcome.overheadMinor,0,JSON.stringify(over));}
 for(const kind of ['constructor','__proto__','toString'])assert.ok(close('2027-01',[entry('o',kind)]).openPoints.includes('unknown-kind:o'),kind);
 assert.ok(close('2027-01',[null]).openPoints.includes('entry-id-missing:0'));
});
test('Round 2: identity cycles stay one person, fictional funding covers nothing, failed payments are no payments, ids keep their case',()=>{
 assert.equal(contactEligibility(projectFunnel([ev('x','contact-block',{customerRef:'b'})],{aliases:{a:'b',b:'a'}}),{customerRef:'a',rootTaskId:'r',kind:'followup',policy,now}).eligible,false);
 assert.ok(contactEligibility(projectFunnel([]),{rootTaskId:'r',kind:'followup',policy,now}).reasons.includes('customer-unknown'));
 const agreed={scopeDigest:'a',costUpperMinor:1},requested={scopeDigest:'b',costUpperMinor:2,priceMinor:9};
 assert.equal(scopeChange({agreed,requested,contract:{scopeDigest:'b',evidenceRef:'fake:1'},funding:{scopeDigest:'b',evidenceRef:'simulated:1'}}).workAllowed,false);
 assert.equal(scopeChange({agreed,requested,contract:{scopeDigest:'b',evidenceRef:'contract:1'},funding:{scopeDigest:'b',evidenceRef:'escrow:1'}}).workAllowed,true);
 const g=funnelReport(projectFunnel([ev('p','paid',{amountMinor:9,currency:'CHF',receiptRef:'bank:r',status:'failed'})]),{}).groups[0];assert.equal(g.counts.paid,0);assert.equal(g.money.CHF,undefined);
 const two=funnelReport(projectFunnel([ev('a','paid',{rootTaskId:'x',amountMinor:9,currency:'CHF',receiptRef:'bank:ch_AbC'}),ev('b','paid',{rootTaskId:'y',amountMinor:9,currency:'CHF',receiptRef:'bank:ch_aBc'})]),{}).groups[0];assert.equal(two.counts.paid,2);
 const elsewhere=[ev('a','accepted'),ev('p','paid',{amountMinor:100,currency:'CHF',receiptRef:'bank:r'}),ev('x','refund',{rootTaskId:'other',amountMinor:100,currency:'CHF',receiptRef:'rf',paymentRef:'bank:r'})];
 assert.ok(followUpDraft(projectFunnel(elsewhere),{customerRef:'cust',rootTaskId:'root',need:{kind:'k',evidenceRef:'n:1'},prior:{costMinor:1,currency:'CHF'},policy,now}).reasons.includes('payment-reversed'));
});
test('Round 3 B2 B3: a later row about a paid receipt keeps its month open, in whole or separate closes',()=>{
 const months=['2027-01','2027-02','2027-03'],base=months.map(m=>entry('r'+m,'receipt',{amountMinor:900000,evidenceRef:'rc:'+m,at:m+'-10T12:00:00Z'}));
 for(const over of [{status:'reversed'},{status:'chargeback'},{amountMinor:-900000},{status:'settled',amountMinor:1}]){
  const all=[...base,entry('late','receipt',{evidenceRef:'rc:2027-01',at:'2027-04-02T00:00:00Z',...over})],jan=close('2027-01',all);assert.equal(jan.complete,false,JSON.stringify(over));assert.ok(jan.openPoints.includes('payment-disputed:late'),JSON.stringify(over));assert.equal(milestones(months.map(m=>close(m,all))).stage,0,JSON.stringify(over));
 }
 const separate=months.map((m,i)=>close(m,[base[i]]));assert.equal(milestones(separate).stage,1);
 for(const over of [{amountMinor:null},{status:'pending'},{currency:'EUR'},{reason:'x'},{paymentRef:'rc:2027-01'}]){const april=close('2027-04',[entry('c','chargeback',{at:'2027-04-02T00:00:00Z',...over})]);assert.equal(milestones([...separate,april]).stage,0,JSON.stringify(over));}
 assert.equal(milestones([...separate,close('2027-04',[entry('s','receipt',{status:'reversed',evidenceRef:'rc:other',at:'2027-04-02T00:00:00Z'})])]).stage,0);
 assert.equal(milestones([...separate,close('2027-04',[entry('k','Refund',{at:'2027-04-02T00:00:00Z'})])]).stage,0);
});
test('Round 3 B4: only reversals move to the receipt month; other rows stay and open that month',()=>{
 const low=entry('r1','receipt',{amountMinor:50000,evidenceRef:'rc:a'}),other=entry('r2','receipt',{amountMinor:500000,evidenceRef:'rc:b',receiptRef:'rc:a',at:'2027-04-10T12:00:00Z'});
 const jan=close('2027-01',[low,other]);assert.equal(jan.outcome.receiptsMinor,50000);assert.ok(jan.openPoints.includes('payment-disputed:r2'));assert.equal(close('2027-04',[low,other]).outcome.receiptsMinor,500000);
 const fee=entry('f','fee',{amountMinor:880000,receiptRef:'rc:a',at:'2027-02-10T12:00:00Z'});assert.equal(close('2027-02',[low,fee]).outcome.feesMinor,880000);assert.equal(close('2027-01',[low,fee]).outcome.feesMinor,0);assert.equal(close('2027-01',[low,fee]).complete,true);
});
test('Round 3 B5: the earliest settled receipt decides, in any ledger order',()=>{
 const first=entry('first','receipt',{evidenceRef:'rc:x'}),later=entry('later','receipt',{evidenceRef:'rc:x',at:'2027-05-10T12:00:00Z'}),back=entry('f','refund',{receiptRef:'rc:x',at:'2027-06-01T00:00:00Z'});
 for(const order of [[first,later,back],[later,first,back],[back,later,first]]){assert.equal(close('2027-01',order).outcome.refundsMinor,back.amountMinor);assert.equal(close('2027-05',order).outcome.refundsMinor,0);assert.equal(close('2027-01',order).complete,false);}
});
test('Round 3: receipt ids differing only by case keep the month open and count once for milestones',()=>{
 const m=close('2027-01',[entry('a','receipt',{evidenceRef:'rc:ONE',amountMinor:900000}),entry('b','receipt',{evidenceRef:'rc:one',amountMinor:900000})]);assert.equal(m.complete,false);assert.ok(m.openPoints.some(p=>p.startsWith('receipt-case-variant:')));
 const v=(x,ref)=>close(x,[entry('r'+x,'receipt',{amountMinor:900000,evidenceRef:ref,at:x+'-10T12:00:00Z'})]);assert.equal(milestones([v('2027-01','rc:ONE'),v('2027-02','rc:one'),v('2027-03','rc:One')]).stage,0);
 const g=funnelReport(projectFunnel([ev('a','paid',{rootTaskId:'x',amountMinor:9,currency:'CHF',receiptRef:'bank:ONE'}),ev('b','paid',{rootTaskId:'y',amountMinor:9,currency:'CHF',receiptRef:'bank:one'})]),{}).groups[0];assert.ok(g.openPoints.includes('receipt-case-variant:b'));
});
test('Round 3 B6: only a dated, real, documented resolution after a dated complaint closes it; odd stops still stop',()=>{
 const at=d=>new Date(now-d*DAY).toISOString(),c=(id,type,over={})=>ev(id,type,{at:at(30),...over});
 assert.ok(elig([c('c','complaint',{at:'bad'}),c('r','complaint-resolved',{at:at(40)})]).reasons.includes('complaint-open'));
 assert.ok(elig([c('c','complaint',{at:undefined}),c('r','complaint-resolved')]).reasons.includes('complaint-open'));
 for(const over of [{synthetic:true},{evidenceRef:'fake:1'},{evidenceRef:undefined},{at:'bad'}])assert.ok(elig([c('c','complaint',{at:at(40)}),c('r','complaint-resolved',over)]).reasons.includes('complaint-open'),JSON.stringify(over));
 for(const type of ['Contact-Block','contact_block','CONTACT BLOCK'])assert.equal(elig([c('x',type)]).eligible,false,type);
 assert.ok(elig([c('x','contact-block',{customerRef:undefined})]).reasons.includes('stop-unattributed'));
 assert.ok(elig([null,c('q','qualified')]).reasons.includes('stop-unattributed'));
});
test('Round 3 check: case variants and undated reversals cannot leave a paid month clean; plain attempts and linked costs do not open it',()=>{
 const months=['2027-01','2027-02','2027-03'],base=months.map(m=>entry('r'+m,'receipt',{amountMinor:900000,evidenceRef:'rc:'+m+'A',at:m+'-10T12:00:00Z'})),apr={at:'2027-04-02T00:00:00Z'};
 for(const extra of [entry('v','receipt',{status:'reversed',evidenceRef:'rc:2027-01a',...apr}),entry('v','refund',{receiptRef:'rc:2027-01a',...apr}),entry('v','chargeback',{receiptRef:'RC:2027-01a',...apr})]){const all=[...base,extra];assert.equal(milestones(months.map(m=>close(m,all))).stage,0,extra.kind);}
 const separate=months.map((m,i)=>close(m,[base[i]]));
 for(const row of [entry('u','refund',{at:undefined}),entry('u','refund',{at:'2027-04-02'}),entry('u','receipt',{status:'reversed',evidenceRef:'rc:x',at:undefined}),entry('u','receipt',{amountMinor:-900000,evidenceRef:'rc:2027-01A',...apr})])assert.equal(milestones([...separate,close('2027-04',[row])]).stage,0,JSON.stringify(row));
 for(const at of ['2026-12-10T12:00:00Z','2027-03-01T12:00:00Z'])assert.equal(close('2027-01',[base[0],entry('t','receipt',{status:'failed',evidenceRef:'rc:2027-01A',at})]).complete,true,at);
 const janFee=entry('f','fee',{amountMinor:100,receiptRef:'rc:2027-01A'});const m=close('2027-01',[base[0],janFee]);assert.equal(m.complete,true);assert.equal(m.outcome.feesMinor,100);
});
