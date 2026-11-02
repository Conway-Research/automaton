import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from './founder-restoration-integrity.mjs';
import {createConfirmedFundedAuthority} from './founder-confirmed-funded-authority.mjs';
const NOW=Date.parse('2026-10-30T01:00:00Z'),h=x=>digest(x);
const order={sourceId:'fixture-source',externalId:'order-one',ownerId:'contractor',buyerId:'buyer',rootTaskId:'root-one',sourceRevision:'revision-one',scopeDigest:h('scope'),customerWork:{milestoneId:'milestone-one',inputsDigest:h('inputs'),acceptanceDigest:h('acceptance'),deadlineUtc:new Date(Date.now()+30*86400000).toISOString(),correctionScopeDigest:h('corrections'),grossDecimal:'38',deductionsDecimal:'1.235',netDecimal:'36.765',currency:'USD',recipient:'account:contractor',paymentTrigger:'accepted-milestone'}};
function fixture(){
 let enabled=true,clock=NOW,calls=0,change=x=>x;
 const api=createConfirmedFundedAuthority({allowSyntheticForTests:true,ownRecipients:{contractor:['account:contractor']},isEnabled:()=>enabled,now:()=>clock,source:{testOnly:true,origin:'https://fixtures.invalid',async read(expected){calls++;const ref='https://fixtures.invalid/evidence/'+calls,part={bindingDigest:digest(expected),sourceRef:ref};return change({schema:'confirmed-funded-customer-work-v1',environment:'synthetic',bindingDigest:digest(expected),observedAt:clock,expiresAt:clock+60000,assignment:{...part,status:'assigned',buyerId:order.buyerId,contractorId:order.ownerId},compensation:{...part,...order.customerWork},funding:{...part,kind:'funded-escrow',status:'held',amountDecimal:'38',currency:'USD',recipient:order.customerWork.recipient}});}}});
 return {api,calls:()=>calls,power:v=>enabled=v,time:v=>clock=v,change:v=>change=v};
}
test('missing reader never supplies customer-work authority',()=>{const a=createConfirmedFundedAuthority({isEnabled:()=>true});assert.equal(a.allows(order),false);assert.equal(a.status().configured,false);});
test('OFF rejects before any reader invocation',async()=>{const f=fixture();f.power(false);await assert.rejects(f.api.refresh(order),/OFF/);assert.equal(f.calls(),0);assert.equal(f.api.allows(order),false);});
test('complete own fresh funded milestone binds the exact reviewed context',async()=>{const f=fixture(),r=await f.api.refresh(order);assert.equal(f.api.allows(order),true);assert.equal(r.synthetic,true);assert.equal(r.realWorkAuthorized,false);assert.equal(r.compensation.netDecimal,'36.765');assert.equal(f.calls(),1);});
test('cached authority expires at the actual maximum age',async()=>{const f=fixture();await f.api.refresh(order);f.time(NOW+60000);assert.equal(f.api.allows(order),false);});
test('pending application or merged PR cannot replace a confirmed assignment',async()=>{for(const status of ['pending','merged','advertised','bid']){const f=fixture();f.change(x=>({...x,assignment:{...x.assignment,status}}));await assert.rejects(f.api.refresh(order));assert.equal(f.api.allows(order),false);}});
test('foreign recipient/order binding is rejected',async()=>{const f=fixture();f.change(x=>({...x,funding:{...x.funding,bindingDigest:h('foreign')}}));await assert.rejects(f.api.refresh(order));assert.equal(f.api.allows(order),false);});
test('scope milestone and input changes invalidate a cached proof immediately',async()=>{const f=fixture();await f.api.refresh(order);for(const changed of [{...order,scopeDigest:h('changed')},{...order,sourceRevision:'two'},{...order,customerWork:{...order.customerWork,milestoneId:'two'}},{...order,customerWork:{...order.customerWork,inputsDigest:h('two')}}])assert.equal(f.api.allows(changed),false);});
test('revocation on fresh read clears any previously successful authority',async()=>{const f=fixture();await f.api.refresh(order);f.change(x=>({...x,funding:{...x.funding,status:'revoked'}}));await assert.rejects(f.api.refresh(order));assert.equal(f.api.allows(order),false);});
test('insufficient own held escrow blocks customer work',async()=>{const f=fixture();f.change(x=>({...x,funding:{...x.funding,amountDecimal:'37.999'}}));await assert.rejects(f.api.refresh(order));});
test('different compensation beneficiary cannot be substituted',async()=>{const f=fixture();f.change(x=>({...x,compensation:{...x.compensation,recipient:'account:other'}}));await assert.rejects(f.api.refresh(order));});
test('verified received advance may cover the exact agreed net milestone',async()=>{const f=fixture();f.change(x=>({...x,funding:{...x.funding,kind:'verified-advance',status:'received',amountDecimal:'36.765'}}));await f.api.refresh(order);assert.equal(f.api.allows(order),true);});
test('historical release and postpaid promise are not funded protection',async()=>{for(const status of ['released','promised','pending']){const f=fixture();f.change(x=>({...x,funding:{...x.funding,status}}));await assert.rejects(f.api.refresh(order));}});
test('gross deductions and net preserve original decimal precision',async()=>{const f=fixture();await f.api.refresh(order);const changed={...order,customerWork:{...order.customerWork,netDecimal:'36.764'}};await assert.rejects(f.api.refresh(changed));assert.equal(f.api.allows(order),false);});
test('incomplete reviewed customer inputs fail before invoking a source',async()=>{const f=fixture();await assert.rejects(f.api.refresh({...order,customerWork:{...order.customerWork,inputsDigest:null}}));assert.equal(f.calls(),0);});
test('future and expired evidence snapshots are rejected',async()=>{for(const delta of [1,70000]){const f=fixture();f.change(x=>delta===1?{...x,observedAt:NOW+1}:{...x,observedAt:NOW-70000,expiresAt:NOW-1000});await assert.rejects(f.api.refresh(order));}});
test('source references must belong to configured authenticated origin',async()=>{const f=fixture();f.change(x=>({...x,assignment:{...x.assignment,sourceRef:'https://other.invalid/award'}}));await assert.rejects(f.api.refresh(order));});
test('test evidence is never accepted through production configuration',()=>assert.throws(()=>createConfirmedFundedAuthority({isEnabled:()=>true,source:{testOnly:true,origin:'https://fixtures.invalid',read:async()=>({})}}),/synthetic/));
test('a slower earlier valid read cannot overwrite a newer revocation',async()=>{
 const f=fixture();let finishEarlier;
 f.change(x=>new Promise(resolve=>finishEarlier=()=>resolve(x)));
 const earlier=f.api.refresh(order);
 f.change(x=>({...x,funding:{...x.funding,status:'revoked'}}));
 await assert.rejects(f.api.refresh(order));assert.equal(f.api.allows(order),false);
 finishEarlier();await assert.rejects(earlier,/superseded|newer/i);
 assert.equal(f.api.allows(order),false);
});
test('jointly substituted order compensation and funding recipient is not an owned account',async()=>{
 const f=fixture();f.change(x=>({...x,compensation:{...x.compensation,recipient:'account:other'},funding:{...x.funding,recipient:'account:other'}}));
 await assert.rejects(f.api.refresh({...order,customerWork:{...order.customerWork,recipient:'account:other'}}));
 assert.equal(f.api.allows(order),false);
});
test('synthetic opt-in must be the explicit Boolean true',()=>{
 for(const value of ['false',{},1,'true'])assert.throws(()=>createConfirmedFundedAuthority({allowSyntheticForTests:value,isEnabled:()=>true,source:{testOnly:true,origin:'https://fixtures.invalid',read:async()=>({})}}));
});
