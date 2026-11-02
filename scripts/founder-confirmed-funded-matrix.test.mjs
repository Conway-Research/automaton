// Fail-closed matrix from the independent review of package C.
import test from 'node:test';import assert from 'node:assert/strict';
import {createConfirmedFundedAuthority as C} from './founder-confirmed-funded-authority.mjs';
import {digest} from './founder-restoration-integrity.mjs';
const h=digest,now0=Date.parse('2026-11-02T10:00:00Z');
const order={sourceId:'s',externalId:'e',ownerId:'own',buyerId:'buyer',rootTaskId:'r',sourceRevision:'v',scopeDigest:h('scope'),customerWork:{milestoneId:'m',inputsDigest:h('i'),acceptanceDigest:h('a'),deadlineUtc:'2026-12-01T00:00:00Z',correctionScopeDigest:h('c'),grossDecimal:'38',deductionsDecimal:'2',netDecimal:'36',currency:'USD',recipient:'acct',paymentTrigger:'t'}};
function fx(change=x=>x,opts={}){let clock=now0,on=true;
 const a=C({isEnabled:()=>on,now:()=>clock,allowSyntheticForTests:true,ownRecipients:{own:['acct']},source:{testOnly:true,origin:'https://f.invalid',async read(e,ctx){await opts.during?.();const d=digest(e),p={bindingDigest:d,sourceRef:'https://f.invalid/x'};return change({schema:'confirmed-funded-customer-work-v1',environment:'synthetic',bindingDigest:d,observedAt:clock,expiresAt:clock+60000,assignment:{...p,platformOrderId:e.externalId,status:'assigned',buyerId:'buyer',contractorId:'own'},compensation:{...p,...e.customerWork},funding:{...p,fundingId:'esc:'+e.externalId,kind:'funded-escrow',status:'held',amountDecimal:'38',currency:'USD',recipient:'acct'}});}},...opts.ctor});
 return {a,tick:t=>clock=t,off:()=>on=false};}
test('baseline: the unchanged evidence is accepted',async()=>{const f=fx();await f.a.refresh(order);assert.equal(f.a.allows(order),true);});
const bad={
 'falsche Waehrung':x=>({...x,funding:{...x.funding,currency:'EUR'}}),
 'Vorauszahlung zu klein':x=>({...x,funding:{...x.funding,kind:'verified-advance',status:'received',amountDecimal:'35.99'}}),
 'fremder Auftraggeber':x=>({...x,assignment:{...x.assignment,buyerId:'other'}}),
 'fremder Auftragnehmer':x=>({...x,assignment:{...x.assignment,contractorId:'other'}}),
 'Umgebung production bei synthetic':x=>({...x,environment:'production'}),
 'falsches Schema':x=>({...x,schema:'v0'}),
 'fremde Gesamtbindung':x=>({...x,bindingDigest:h('x')}),
 'gleichwertiger Schutz ohne Callback':x=>({...x,funding:{...x.funding,kind:'equivalent-protection',status:'protected',protectionDigest:h('p')}}),
 'alt trotz langer Laufzeit':x=>({...x,observedAt:x.observedAt-60000,expiresAt:x.observedAt+600000}),
 'null':()=>null,'undefined':()=>undefined,'String':()=>'{}','Array':()=>[],
 'funding fehlt':x=>{const {funding,...r}=x;return r;},
 'assignment fehlt':x=>{const {assignment,...r}=x;return r;},
 'Betrag 1e3':x=>({...x,funding:{...x.funding,amountDecimal:'1e3'}}),
 'Betrag negativ':x=>({...x,funding:{...x.funding,amountDecimal:'-38'}}),
 'Betrag als Zahl':x=>({...x,funding:{...x.funding,amountDecimal:38}}),
 'Status charged-back':x=>({...x,funding:{...x.funding,status:'charged-back'}}),
 'Status refunded':x=>({...x,funding:{...x.funding,status:'refunded'}}),
 'sourceRef Klartext':x=>({...x,funding:{...x.funding,sourceRef:'see mail'}}),
 'sourceRef Wurzel':x=>({...x,funding:{...x.funding,sourceRef:'https://f.invalid/'}}),
 'observedAt String':x=>({...x,observedAt:String(x.observedAt)}),
};
for(const [name,change] of Object.entries(bad))test('abgelehnt: '+name,async()=>{const f=fx(change);await assert.rejects(f.a.refresh(order));assert.equal(f.a.allows(order),false);});
const badOrder={
 'Frist abgelaufen':{...order,customerWork:{...order.customerWork,deadlineUtc:'2026-01-01T00:00:00Z'}},
 'netto+abzug != brutto':{...order,customerWork:{...order.customerWork,netDecimal:'35'}},
 'Betrag 0':{...order,customerWork:{...order.customerWork,grossDecimal:'0',deductionsDecimal:'0',netDecimal:'0'}},
 'Kaeufer = Eigentuemer':{...order,buyerId:'own'},
 'kein customerWork':{...order,customerWork:undefined},
 'kaputter Schluessel':{...order,sourceId:''},
};
for(const [name,o] of Object.entries(badOrder))test('Auftrag abgelehnt: '+name,async()=>{const f=fx();await assert.rejects(f.a.refresh(o));assert.equal(f.a.allows(o),false);});
test('OFF nach gueltigem Refresh entzieht sofort',async()=>{const f=fx();await f.a.refresh(order);assert.equal(f.a.allows(order),true);f.off();assert.equal(f.a.allows(order),false);});
test('Beleg ist nach 60 s ungueltig, Grenze exakt',async()=>{const f=fx();await f.a.refresh(order);f.tick(now0+59999);assert.equal(f.a.allows(order),true);f.tick(now0+60000);assert.equal(f.a.allows(order),false);});
test('Auftrag waehrend des Lesens geaendert',async()=>{const o=structuredClone(order);const f=fx(x=>x,{during:async()=>{o.scopeDigest=h('neu');}});await assert.rejects(f.a.refresh(o));assert.equal(f.a.allows(o),false);});
test('abgebrochenes Signal und Fehler nach Commit',async()=>{const f=fx();const c=new AbortController();c.abort();await assert.rejects(f.a.refresh(order,{signal:c.signal}));let n=0;await assert.rejects(f.a.refresh(order,{assertActive(){if(++n>=4)throw Error('stop');}}));assert.equal(f.a.allows(order),false);});
test('Quelle ohne authenticated/https',()=>{for(const source of [{origin:'https://x.invalid',read(){}},{origin:'http://x.invalid',authenticated:true,read(){}},{origin:'https://u:p@x.invalid',authenticated:true,read(){}},{origin:'https://x.invalid/path',authenticated:true,read(){}},{origin:'https://x.invalid',authenticated:true}])assert.throws(()=>C({isEnabled:()=>true,source}));});
test('Replay: Bestaetigung fuer Auftrag A auf Auftrag B',async()=>{let saved;const f=fx(x=>{if(!saved)saved=x;return saved;});await f.a.refresh(order);const b={...order,externalId:'other'};await assert.rejects(f.a.refresh(b));assert.equal(f.a.allows(b),false);});
