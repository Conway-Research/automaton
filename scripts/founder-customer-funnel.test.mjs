import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {rankCandidates,draftOffer,clarificationStep,projectFunnel as openFunnel,contactEligibility,followUpDraft,scopeChange,reworkReserve,funnelReport,salesProjection,requiredOrders,zurichMonthBounds,zurichMonthOf,guardedAction,routineDecision} from './founder-customer-funnel.mjs';

const now=Date.parse('2026-11-01T12:00:00Z'),DAY=86400000,projectFunnel=(events,options)=>openFunnel(events,{receiptPolicy:{acceptedTypes:['bank']},...options});
const candidate=over=>({id:'c1',admissible:true,currency:'CHF',listPriceMinor:50000,feesMinor:5000,costUpperMinor:5000,acquisitionMinor:1000,reworkReserveMinor:2000,computeMinutes:60,...over});
const ev=(id,type,over={})=>({id,type,customerRef:'cust',sourceId:'src',family:'daten',rootTaskId:'root',offerVersion:'v1',at:new Date(now-DAY).toISOString(),evidenceRef:'ref:'+id,...over});
const policy={maxFollowUps:2,minWaitMs:3*DAY};

test('G01 rank uses conservative contribution per capacity minute, not list price',()=>{
 const expensive=candidate({id:'expensive',listPriceMinor:200000,reworkReserveMinor:80000,computeMinutes:2000}),better=candidate({id:'better'}),r=rankCandidates([expensive,better],{currency:'CHF',capacityMinutes:5000});
 assert.deepEqual(r.ranked.map(x=>x.id),['better','expensive']);assert.equal(r.ranked[0].contributionMinor,37000);assert.equal(r.ranked[0].minutes,60);
 const tooCostly=rankCandidates([candidate({id:'loss',listPriceMinor:9000})],{currency:'CHF',capacityMinutes:100});assert.equal(tooCostly.ranked.length,0);assert.equal(tooCostly.rejected[0].reason,'no-positive-contribution');
});
test('G01 inadmissible, missing costs, foreign currency, full capacity and duplicates are not ranked',()=>{
 for(const [over,reason] of [[{admissible:false},'not-admissible'],[{admissible:undefined},'not-admissible'],[{costUpperMinor:undefined},'cost-unknown'],[{acquisitionMinor:null},'cost-unknown'],[{reworkReserveMinor:-1},'cost-unknown'],[{listPriceMinor:undefined},'price-unknown'],[{currency:'USD'},'currency-mismatch'],[{computeMinutes:undefined},'capacity-unknown'],[{computeMinutes:0},'capacity-unknown'],[{computeMinutes:9000},'no-capacity']]){
  const r=rankCandidates([candidate(over)],{currency:'CHF',capacityMinutes:5000});assert.equal(r.ranked.length,0,reason);assert.equal(r.rejected[0].reason,reason);
 }
 const dup=rankCandidates([candidate(),candidate()],{currency:'CHF',capacityMinutes:5000});assert.equal(dup.ranked.length,1);assert.equal(dup.rejected[0].reason,'duplicate');
 assert.equal(rankCandidates([candidate()],{currency:'CHF'}).ranked.length,0);
 assert.ok(rankCandidates([candidate({successProbability:0.9})],{currency:'CHF',capacityMinutes:5000}).ranked.every(x=>!('successProbability'in x)));
 assert.throws(()=>rankCandidates([candidate({hourlyRateMinor:5000})],{currency:'CHF',capacityMinutes:5000}),/personnel/i);
});
test('G01 a suitable candidate gets one offer bound to scope, version and evidence; it sends nothing',()=>{
 const d=draftOffer({candidateId:'c1',offerVersion:'v3',scope:{inputs:['csv'],outputs:['report']},claims:[{kind:'capability',id:'data-cleaning'}],evidence:{capabilities:{'data-cleaning':'ref:cap'},references:[]}});
 assert.equal(d.status,'draft');assert.equal(d.candidateId,'c1');assert.equal(d.offerVersion,'v3');assert.match(d.scopeDigest,/^[a-f0-9]{64}$/);assert.equal(d.sendAuthorized,false);assert.equal(d.workAuthorized,false);
 const other=draftOffer({candidateId:'c1',offerVersion:'v3',scope:{inputs:['xlsx'],outputs:['report']},claims:[],evidence:{}});assert.notEqual(other.scopeDigest,d.scopeDigest);
});
test('G02 missing capability or reference evidence blocks the claim; synthetic stays an example',()=>{
 const missing=draftOffer({candidateId:'c',offerVersion:'v',scope:{},claims:[{kind:'capability',id:'ocr'}],evidence:{capabilities:{}}});assert.equal(missing.status,'blocked');assert.deepEqual(missing.blocked,['capability:ocr']);
 for(const kind of ['metric','rating','saving','guarantee','customer-count'])assert.equal(draftOffer({candidateId:'c',offerVersion:'v',scope:{},claims:[{kind,id:'x'}],evidence:{}}).status,'blocked',kind);
 const example=draftOffer({candidateId:'c',offerVersion:'v',scope:{},claims:[{kind:'reference',id:'syn'}],evidence:{references:[{id:'syn',origin:'synthetic',evidenceRef:'ref:s'}]}});assert.equal(example.status,'draft');assert.deepEqual(example.statements,[{kind:'example',id:'syn',label:'Synthetisches Beispiel',evidenceRef:'ref:s'}]);assert.equal(JSON.stringify(example).includes('customer-reference'),false);
 const noPermission=draftOffer({candidateId:'c',offerVersion:'v',scope:{},claims:[{kind:'reference',id:'k'}],evidence:{references:[{id:'k',origin:'customer',evidenceRef:'ref:k'}]}});assert.equal(noPermission.status,'blocked');assert.deepEqual(noPermission.blocked,['reference-permission:k']);
 const allowed=draftOffer({candidateId:'c',offerVersion:'v',scope:{},claims:[{kind:'reference',id:'k'}],evidence:{references:[{id:'k',origin:'customer',evidenceRef:'ref:k',publicationAllowedRef:'ref:p'}]}});assert.equal(allowed.statements[0].kind,'customer-reference');
 assert.equal(draftOffer({candidateId:'c',offerVersion:'v',scope:{},claims:[{kind:'reference',id:'nope'}],evidence:{references:[]}}).status,'blocked');
 assert.equal(draftOffer({candidateId:'c',offerVersion:'v',scope:{},claims:[{kind:'capability',id:'x'}],evidence:{capabilities:{x:''}}}).status,'blocked');
});
test('G03 answered questions are not repeated; missing input means waiting without work',()=>{
 const required=[{id:'format',question:'Which format?'},{id:'volume',question:'How many rows?'},{id:'deadline',question:'Which deadline?'}];
 const first=clarificationStep({required,answers:{format:{value:'csv',evidenceRef:'ref:a'}},asked:[]});assert.equal(first.state,'waiting-customer');assert.equal(first.workAllowed,false);assert.equal(first.modelSpendAllowed,false);assert.deepEqual(first.questions.map(q=>q.id),['volume','deadline']);assert.equal(first.messages,1);
 const again=clarificationStep({required,answers:{format:{value:'csv',evidenceRef:'ref:a'}},asked:['volume','deadline']});assert.equal(again.state,'waiting-customer');assert.deepEqual(again.questions,[]);assert.equal(again.messages,0);
 const noRef=clarificationStep({required:[required[0]],answers:{format:{value:'csv'}},asked:[]});assert.equal(noRef.state,'waiting-customer');
 const done=clarificationStep({required,answers:Object.fromEntries(required.map(q=>[q.id,{value:'x',evidenceRef:'ref'}])),asked:[]});assert.equal(done.state,'ready');assert.equal(done.workAllowed,true);assert.equal(done.sendAuthorized,false);
});
test('G04 duplicate events, listings and identities do not double count or resend',()=>{
 const p=projectFunnel([ev('e1','qualified'),ev('e1','qualified'),ev('e2','sent',{channel:'platform'})]);assert.equal(p.events.length,2);assert.deepEqual(p.conflicts,[]);assert.equal(p.cases[0].sent,1);
 assert.equal(contactEligibility(p,{customerRef:'cust',rootTaskId:'root',kind:'application',policy,now}).eligible,false);
 assert.ok(contactEligibility(p,{customerRef:'cust',rootTaskId:'root',kind:'application',policy,now}).reasons.includes('already-sent'));
 const conflict=projectFunnel([ev('e1','qualified'),ev('e1','paid',{amountMinor:5,currency:'CHF'})]);assert.deepEqual(conflict.conflicts,['e1']);
 const alias=projectFunnel([ev('a','sent',{customerRef:'mail:x',rootTaskId:'r1',channel:'mail'}),ev('b','qualified',{customerRef:'platform:x',rootTaskId:'r2'})],{aliases:{'mail:x':'person-1','platform:x':'person-1'}});
 assert.deepEqual([...new Set(alias.cases.map(c=>c.customerRef))],['person-1']);
 const other=contactEligibility(alias,{customerRef:'platform:x',rootTaskId:'r2',kind:'application',policy,now,channel:'platform'});assert.equal(other.eligible,false);assert.ok(other.reasons.includes('customer-contacted-recently'));
});
test('G04 an unclear send is reconciled first, never sent again',()=>{
 const p=projectFunnel([ev('s','send-uncertain',{channel:'platform'})]),r=contactEligibility(p,{customerRef:'cust',rootTaskId:'root',kind:'application',policy,now});assert.equal(r.eligible,false);assert.ok(r.reasons.includes('reconcile-send-first'));
 const fresh=contactEligibility(projectFunnel([ev('q','qualified')]),{customerRef:'cust',rootTaskId:'root',kind:'application',policy,now});assert.equal(fresh.eligible,true);assert.equal(fresh.sendAuthorized,false);
});
test('G05 complaint, contact ban, rejection, closure, need gone and exhausted follow-ups stop contact',()=>{
 const paid=[ev('s','sent',{at:new Date(now-30*DAY).toISOString()}),ev('a','accepted',{at:new Date(now-20*DAY).toISOString()}),ev('p','paid',{amountMinor:100,currency:'CHF',receiptRef:'bank:r',at:new Date(now-20*DAY).toISOString()})];
 const base={customerRef:'cust',rootTaskId:'root',kind:'followup',policy,now};
 assert.equal(contactEligibility(projectFunnel(paid),base).eligible,true);
 for(const [type,reason] of [['complaint','complaint-open'],['contact-block','contact-blocked'],['rejection','rejected'],['closed','closed'],['no-need','no-need']]){const r=contactEligibility(projectFunnel([...paid,ev('x',type)]),base);assert.equal(r.eligible,false,type);assert.ok(r.reasons.includes(reason),type);}
 assert.equal(contactEligibility(projectFunnel([...paid,ev('x','complaint'),ev('y','complaint-resolved')]),base).eligible,true);
 const fu=n=>Array.from({length:n},(_,i)=>ev('f'+i,'followup-sent',{at:new Date(now-(20-i)*DAY).toISOString()}));
 assert.ok(contactEligibility(projectFunnel([...paid,...fu(2)]),base).reasons.includes('followup-limit'));
 assert.ok(contactEligibility(projectFunnel([...paid,ev('w','followup-sent',{at:new Date(now-DAY).toISOString()})]),base).reasons.includes('customer-contacted-recently'));
 assert.ok(contactEligibility(projectFunnel(paid),{...base,policy:undefined}).reasons.includes('contact-policy-missing'));
 assert.ok(contactEligibility(projectFunnel(paid),{...base,policy:{maxFollowUps:1}}).reasons.includes('contact-policy-missing'));
});
test('G06 confirmed acceptance, payment and need give exactly one draft, no order or revenue',()=>{
 const chain=[ev('a','accepted'),ev('p','paid',{amountMinor:100,currency:'CHF',receiptRef:'bank:r'})],need={kind:'next-month-file',evidenceRef:'ref:need'},prior={costMinor:300,currency:'CHF'};
 const d=followUpDraft(projectFunnel(chain),{customerRef:'cust',rootTaskId:'root',need,prior,policy,now});assert.equal(d.status,'draft');assert.equal(d.order,null);assert.equal(d.revenueMinor,null);assert.equal(d.autoOrder,false);assert.equal(d.costReviewRequired,true);assert.equal(d.sendAuthorized,false);
 const twice=followUpDraft(projectFunnel(chain),{customerRef:'cust',rootTaskId:'root',need,prior,policy,now});assert.equal(twice.id,d.id);
 const existing=followUpDraft(projectFunnel([...chain,ev('fd','followup-draft',{draftId:d.id})]),{customerRef:'cust',rootTaskId:'root',need,prior,policy,now});assert.equal(existing.status,'exists');
 for(const [events,reason] of [[[ev('p','paid',{amountMinor:100,currency:'CHF',receiptRef:'bank:r'})],'acceptance-pending'],[[ev('a','accepted')],'payment-pending'],[[ev('a','accepted'),ev('p','paid',{receiptRef:'bank:r'})],'payment-pending'],[[ev('a','accepted'),ev('n','payment-claimed')],'payment-pending']]){const r=followUpDraft(projectFunnel(events),{customerRef:'cust',rootTaskId:'root',need,prior,policy,now});assert.equal(r.status,'blocked');assert.ok(r.reasons.includes(reason),reason);}
 assert.ok(followUpDraft(projectFunnel(chain),{customerRef:'cust',rootTaskId:'root',prior,policy,now}).reasons.includes('need-undocumented'));
 assert.ok(followUpDraft(projectFunnel(chain),{customerRef:'cust',rootTaskId:'root',need,policy,now}).reasons.includes('prior-cost-unknown'));
 assert.ok(followUpDraft(projectFunnel([...chain,ev('b','contact-block')]),{customerRef:'cust',rootTaskId:'root',need,prior,policy,now}).reasons.includes('contact-blocked'));
});
test('G07 a scope change forces recalculation and waits for matching contract and funding',()=>{
 const agreed={scopeDigest:'a',priceMinor:1000,costUpperMinor:400};
 assert.equal(scopeChange({agreed,requested:{scopeDigest:'a'}}).status,'unchanged');
 const r=scopeChange({agreed,requested:{scopeDigest:'b',costUpperMinor:700,priceMinor:1500}});assert.equal(r.status,'addendum-required');assert.equal(r.workAllowed,false);assert.equal(r.additionalCostUpperMinor,300);assert.equal(r.oldPriceApplies,false);
 assert.equal(scopeChange({agreed,requested:{scopeDigest:'b'}}).status,'cost-unknown');assert.equal(scopeChange({agreed,requested:{scopeDigest:'b'}}).workAllowed,false);
 for(const evidence of [{contract:{scopeDigest:'b',evidenceRef:'contract:c'}},{funding:{scopeDigest:'b',evidenceRef:'funding:f'}},{contract:{scopeDigest:'a',evidenceRef:'contract:c'},funding:{scopeDigest:'b',evidenceRef:'funding:f'}},{contract:{scopeDigest:'b'},funding:{scopeDigest:'b',evidenceRef:'funding:f'}}])assert.equal(scopeChange({agreed,requested:{scopeDigest:'b',costUpperMinor:700,priceMinor:1500},...evidence}).workAllowed,false);
 const ok=scopeChange({agreed,requested:{scopeDigest:'b',costUpperMinor:700,priceMinor:1500},contract:{scopeDigest:'b',evidenceRef:'contract:c'},funding:{scopeDigest:'b',evidenceRef:'funding:f'}});assert.equal(ok.status,'addendum-covered');assert.equal(ok.workAllowed,true);assert.equal(ok.submitAuthorized,false);
});
test('G07 rework beyond its reserve stops further uncovered work',()=>{
 assert.equal(reworkReserve({reserveMinor:100,actualMinor:100}).workAllowed,true);assert.equal(reworkReserve({reserveMinor:100,actualMinor:101}).workAllowed,false);assert.equal(reworkReserve({reserveMinor:100,actualMinor:101}).overrunMinor,1);assert.equal(reworkReserve({reserveMinor:100}).status,'unknown');assert.equal(reworkReserve({actualMinor:1}).workAllowed,false);
});
const mixed=()=>[
 ev('q1','qualified',{rootTaskId:'r1'}),ev('s1','sent',{rootTaskId:'r1',feeMinor:50,currency:'CHF'}),ev('w1','awarded',{rootTaskId:'r1'}),ev('d1','delivered',{rootTaskId:'r1',reworkMinor:30,currency:'CHF'}),ev('a1','accepted',{rootTaskId:'r1'}),ev('p1','paid',{rootTaskId:'r1',amountMinor:1000,currency:'CHF',receiptRef:'bank:rc1'}),
 ev('q2','qualified',{rootTaskId:'r2'}),ev('s2','sent',{rootTaskId:'r2',feeMinor:50,currency:'CHF'}),
 ev('q3','qualified',{rootTaskId:'r3'}),ev('s3','sent',{rootTaskId:'r3'}),ev('l3','lost',{rootTaskId:'r3'}),
 ev('q4','qualified',{rootTaskId:'r4'}),ev('s4','sent',{rootTaskId:'r4'}),ev('w4','awarded',{rootTaskId:'r4'}),ev('d4','delivered',{rootTaskId:'r4'}),ev('a4','accepted',{rootTaskId:'r4'}),
 ev('q5','qualified',{rootTaskId:'r5'}),ev('s5','sent',{rootTaskId:'r5'}),ev('w5','awarded',{rootTaskId:'r5'}),ev('d5','delivered',{rootTaskId:'r5'}),ev('a5','accepted',{rootTaskId:'r5'}),ev('p5','paid',{rootTaskId:'r5',amountMinor:500,currency:'CHF',receiptRef:'bank:rc5'}),ev('r5','refund',{rootTaskId:'r5',amountMinor:200,currency:'CHF',receiptRef:'bank:rr5'}),
];
test('G08 the funnel keeps unanswered, lost and unpaid cases with clear denominators',()=>{
 const r=funnelReport(projectFunnel(mixed()),{from:'2026-10-01T00:00:00Z',to:'2026-11-02T00:00:00Z'}),g=r.groups[0];
 assert.equal(g.key,'src|daten');assert.equal(g.counts.qualified,5);assert.equal(g.counts.sent,5);assert.equal(g.counts.awarded,3);assert.equal(g.counts.accepted,3);assert.equal(g.counts.paid,2);assert.equal(g.counts.unanswered,1);assert.equal(g.counts.lost,1);assert.equal(g.counts.unpaid,1);assert.equal(g.counts.refunded,1);
 assert.deepEqual(g.rates.paidOfSent,{numerator:2,denominator:5});assert.deepEqual(g.rates.awardedOfSent,{numerator:3,denominator:5});assert.deepEqual(g.rates.paidOfAccepted,{numerator:2,denominator:3});
 assert.equal(g.money.CHF.receivedMinor,1500);assert.equal(g.money.CHF.refundedMinor,200);assert.equal(g.money.CHF.feesMinor,100);assert.equal(g.money.CHF.reworkMinor,30);assert.equal(g.window.from,'2026-10-01T00:00:00Z');
});
test('G08 double receipts, foreign currency and events outside the window are not merged',()=>{
 const dup=funnelReport(projectFunnel([ev('p1','paid',{rootTaskId:'x',amountMinor:100,currency:'CHF',receiptRef:'bank:same'}),ev('p2','paid',{rootTaskId:'y',amountMinor:100,currency:'CHF',receiptRef:'bank:same'})]),{});assert.equal(dup.groups[0].money.CHF.receivedMinor,100);assert.deepEqual(dup.groups[0].duplicateReceipts,['bank:same']);
 const fx=funnelReport(projectFunnel([ev('a','paid',{rootTaskId:'x',amountMinor:100,currency:'CHF',receiptRef:'bank:a'}),ev('b','paid',{rootTaskId:'y',amountMinor:100,currency:'USD',receiptRef:'bank:b'})]),{});assert.equal(fx.groups[0].money.CHF.receivedMinor,100);assert.equal(fx.groups[0].money.USD.receivedMinor,100);assert.equal(fx.groups[0].total,undefined);
 const windowed=funnelReport(projectFunnel(mixed()),{from:'2030-01-01T00:00:00Z'});assert.equal(windowed.groups.length,0);
 const claim=funnelReport(projectFunnel([ev('c','payment-claimed',{amountMinor:100,currency:'CHF'}),ev('d','pending-payment',{amountMinor:100,currency:'CHF'})]),{});assert.equal(claim.groups[0].money.CHF,undefined);assert.equal(claim.groups[0].counts.paid,0);
 const noReceipt=funnelReport(projectFunnel([ev('p','paid',{amountMinor:100,currency:'CHF'})]),{});assert.equal(noReceipt.groups[0].counts.paid,0);
 assert.throws(()=>funnelReport(projectFunnel([ev('z','sent',{salaryMinor:5})]),{}),/personnel/i);
});
test('G09 small samples and synthetic success are not projected onto real prospects',()=>{
 const synth=mixed().map(e=>({...e,synthetic:true})),s=salesProjection(funnelReport(projectFunnel(synth),{}),{requiredPaidOrders:8,minSample:3});assert.equal(s.status,'no-projection');assert.ok(s.reasons.includes('no-real-outcomes'));assert.equal(s.neededOffers,null);assert.equal(s.permissionToScale,false);assert.equal(s.syntheticExcluded,true);
 const small=salesProjection(funnelReport(projectFunnel(mixed()),{}),{requiredPaidOrders:8,minSample:6});assert.equal(small.status,'no-projection');assert.ok(small.reasons.includes('sample-too-small'));assert.equal(small.neededOffers,null);
 const nopolicy=salesProjection(funnelReport(projectFunnel(mixed()),{}),{requiredPaidOrders:8});assert.ok(nopolicy.reasons.includes('sample-policy-missing'));
 const est=salesProjection(funnelReport(projectFunnel(mixed()),{}),{requiredPaidOrders:8,minSample:5});assert.equal(est.status,'uncertain-estimate');assert.equal(est.neededOffers,20);assert.equal(est.permissionToScale,false);assert.equal(est.contactRightsGranted,false);
 const mix=salesProjection(funnelReport(projectFunnel([...mixed(),ev('sy','paid',{rootTaskId:'s',amountMinor:9,currency:'CHF',receiptRef:'bank:sy',synthetic:true})]),{}),{requiredPaidOrders:8,minSample:5});assert.equal(mix.neededOffers,20);
 const zero=salesProjection(funnelReport(projectFunnel([ev('s1','sent',{rootTaskId:'a'}),ev('s2','sent',{rootTaskId:'b'})]),{}),{requiredPaidOrders:8,minSample:2});assert.equal(zero.status,'no-projection');assert.ok(zero.reasons.includes('no-paid-outcomes'));
});
test('Section 6 scenario rounds up, shows capacity conflicts and grants nothing',()=>{
 assert.equal(requiredOrders({targetMinor:300000,overheadMinor:100000,contributionMinor:50000,maxOrders:50}).orders,8);
 assert.equal(requiredOrders({targetMinor:1000000,overheadMinor:200000,contributionMinor:75000,maxOrders:50}).orders,16);
 assert.equal(requiredOrders({targetMinor:100001,overheadMinor:0,contributionMinor:50000,maxOrders:50}).orders,3);
 const full=requiredOrders({targetMinor:300000,overheadMinor:100000,contributionMinor:50000,maxOrders:7});assert.equal(full.status,'capacity-insufficient');assert.equal(full.orders,8);
 for(const over of [{contributionMinor:0},{contributionMinor:-5},{contributionMinor:undefined},{overheadMinor:undefined},{targetMinor:null},{maxOrders:undefined}])assert.equal(requiredOrders({targetMinor:1,overheadMinor:1,contributionMinor:1,maxOrders:1,...over}).status,'incomplete',JSON.stringify(over));
 assert.equal(requiredOrders({targetMinor:Number.MAX_SAFE_INTEGER,overheadMinor:Number.MAX_SAFE_INTEGER,contributionMinor:1,maxOrders:1}).status,'overflow');
 const r=requiredOrders({targetMinor:1000,overheadMinor:0,contributionMinor:1000,maxOrders:5});assert.equal(r.budgetChange,null);assert.equal(r.parallelismChange,null);assert.equal(r.riskChange,null);assert.equal(r.reachable,null);
});
test('Month bounds follow Europe/Zurich, half-open, across DST and year end',()=>{
 assert.deepEqual(zurichMonthBounds('2026-03'),{from:'2026-02-28T23:00:00.000Z',to:'2026-03-31T22:00:00.000Z'});
 assert.deepEqual(zurichMonthBounds('2026-10'),{from:'2026-09-30T22:00:00.000Z',to:'2026-10-31T23:00:00.000Z'});
 assert.deepEqual(zurichMonthBounds('2026-12'),{from:'2026-11-30T23:00:00.000Z',to:'2026-12-31T23:00:00.000Z'});
 assert.equal(zurichMonthOf('2026-12-31T22:59:59Z'),'2026-12');assert.equal(zurichMonthOf('2026-12-31T23:00:00Z'),'2027-01');assert.equal(zurichMonthOf('2026-02-28T23:00:00Z'),'2026-03');assert.equal(zurichMonthOf('nonsense'),null);
 for(const bad of ['2026-13','2026-3','x'])assert.throws(()=>zurichMonthBounds(bad),/month/i);
});
test('G10 OFF stops search, message, application and delivery before the fake runs',async()=>{
 let on=false,calls=0;const action=guardedAction({isEnabled:()=>on,run:async()=>{calls++;return 'done';}});
 await assert.rejects(action(),/OFF/);assert.equal(calls,0);on=true;assert.equal(await action(),'done');
 const late=guardedAction({isEnabled:()=>on,run:async()=>{on=false;return 'x';}});await assert.rejects(late(),/OFF/);
 assert.throws(()=>guardedAction({run:async()=>{}}),/isEnabled/);
 const src=fs.readFileSync(new URL('./founder-customer-funnel.mjs',import.meta.url),'utf8');assert.ok(!/better-sqlite3|node:fs|node:net|node:http|fetch\(/.test(src));
});
test('G10 stored approval spares routine questions but never bypasses OFF, access or new orders',()=>{
 const scope={source:'docs/numaron-long-term-adaptation-20261026.md',kinds:['internal-ranking','isolated-experiment','recipe-update']};
 const off=routineDecision({kind:'internal-ranking',scope,power:{enabled:false},external:false});assert.equal(off.askHuman,false);assert.equal(off.proceed,true);
 const external=routineDecision({kind:'internal-ranking',scope,power:{enabled:false},external:true});assert.equal(external.proceed,false);assert.equal(external.askHuman,false);assert.deepEqual(external.blockers,['power-off']);
 const newKind=routineDecision({kind:'raise-budget',scope,power:{enabled:true},external:false});assert.equal(newKind.proceed,false);assert.equal(newKind.askHuman,true);
 const access=routineDecision({kind:'recipe-update',scope,power:{enabled:true},external:true,missingAccess:['api-key:x']});assert.equal(access.proceed,false);assert.equal(access.askHuman,false);assert.deepEqual(access.blockers,['access-missing:api-key:x']);
 const order=routineDecision({kind:'internal-ranking',scope,power:{enabled:true},external:true,counterOrder:'no-takeover'});assert.equal(order.proceed,false);assert.ok(order.blockers.includes('human-order:no-takeover'));
 assert.equal(routineDecision({kind:'internal-ranking',power:{enabled:false},external:false}).askHuman,true);
 assert.equal(routineDecision({kind:'internal-ranking',scope,external:false}).proceed,false);
});
