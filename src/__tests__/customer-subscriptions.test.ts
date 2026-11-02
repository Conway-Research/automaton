import {it,expect} from 'vitest';import Database from 'better-sqlite3';
import {editionAdmission} from '../revenue/edition-policy.js';
import {openSubscriptionEntitlements,workspacePermission} from '../commerce/subscriptions.js';
it('Professional is a recognized edition without adding any permission or bypassing emergency stop',()=>{
 const p={edition:'professional' as const,commercialFeatures:['research' as const],permissions:['research' as const],emergencyStop:false};
 expect(editionAdmission(p,'research').allowed).toBe(true);expect(editionAdmission(p,'live_trading').allowed).toBe(false);expect(editionAdmission({...p,emergencyStop:true},'research').allowed).toBe(false);expect(editionAdmission({...p,commercialFeatures:[]},'research').allowed).toBe(false);
});
it('subscription entitlements require trusted signature validation, exact tenant binding and fresh paid period',()=>{
 const db=new Database(':memory:');let valid=true;const event={eventId:'evt1',subscriptionId:'sub1',customerId:'customer',workspaceId:'workspace',edition:'professional',status:'active',paid:true,periodStart:1000,periodEnd:2000,observedAt:1100,revision:1};
 const store=openSubscriptionEntitlements(db,{providerAccount:'account',verifyEvent:(_raw:string,_signature:string)=>{if(!valid)throw Error('signature invalid');return {...event,providerAccount:'account'};}});
 try{expect(store.ingest('fake event','synthetic signature')).toBe(true);expect(store.ingest('fake event','synthetic signature')).toBe(false);expect(store.access({customerId:'customer',workspaceId:'workspace',now:1500}).allowed).toBe(true);expect(store.access({customerId:'other',workspaceId:'workspace',now:1500}).allowed).toBe(false);expect(store.access({customerId:'customer',workspaceId:'workspace',now:2000}).allowed).toBe(false);valid=false;expect(()=>store.ingest('fake','bad')).toThrow();}finally{db.close();}
});
it('late or revoked subscription events never extend another tenant or resurrect an unpaid account',()=>{
 const db=new Database(':memory:');let event:any={eventId:'e1',subscriptionId:'s1',providerAccount:'a',customerId:'c',workspaceId:'w',edition:'business',status:'active',paid:true,periodStart:1000,periodEnd:5000,observedAt:1100,revision:1};const store=openSubscriptionEntitlements(db,{providerAccount:'a',verifyEvent:()=>event});
 try{store.ingest('1','sig');event={...event,eventId:'e2',revision:2,status:'unpaid'};store.ingest('2','sig');expect(store.access({customerId:'c',workspaceId:'w',now:1500}).allowed).toBe(false);event={...event,eventId:'late',revision:1,status:'active'};store.ingest('3','sig');expect(store.access({customerId:'c',workspaceId:'w',now:1500}).allowed).toBe(false);event={...event,eventId:'alien',revision:3,customerId:'different'};expect(()=>store.ingest('4','sig')).toThrow();}finally{db.close();}
});
it('workspace roles are tenant-bound and editions do not grant team or billing authority',()=>{
 const workspace={id:'w',edition:'business' as const,members:[{userId:'owner',role:'owner' as const},{userId:'editor',role:'editor' as const},{userId:'viewer',role:'viewer' as const}]};
 expect(workspacePermission(workspace,{workspaceId:'w',userId:'editor',action:'edit'}).allowed).toBe(true);expect(workspacePermission(workspace,{workspaceId:'w',userId:'editor',action:'billing'}).allowed).toBe(false);expect(workspacePermission(workspace,{workspaceId:'wrong',userId:'owner',action:'billing'}).allowed).toBe(false);expect(workspacePermission({...workspace,edition:'personal'},{workspaceId:'w',userId:'owner',action:'edit'}).allowed).toBe(false);
});

it('provider accounts sharing a database cannot share entitlements or ambiguous identifiers',()=>{
 const db=new Database(':memory:');const event={eventId:'evt',subscriptionId:'sub',customerId:'c',workspaceId:'w',edition:'personal',status:'active',paid:true,periodStart:1,periodEnd:100,observedAt:1,revision:1};
 const a=openSubscriptionEntitlements(db,{providerAccount:'a',verifyEvent:()=>({...event,providerAccount:'a'})}),b=openSubscriptionEntitlements(db,{providerAccount:'b',verifyEvent:()=>({...event,providerAccount:'b'})});try{a.ingest('x','s');expect(b.access({customerId:'c',workspaceId:'w',now:50}).allowed).toBe(false);b.ingest('y','s');expect(a.access({customerId:'c',workspaceId:'w',now:50}).allowed).toBe(true);}finally{db.close();}
});

it('colon-containing provider and remote identifiers have unambiguous storage identities',()=>{
 const db=new Database(':memory:');const event={customerId:'c',workspaceId:'w',edition:'personal',status:'active',paid:true,periodStart:1,periodEnd:100,observedAt:1,revision:1};const a=openSubscriptionEntitlements(db,{providerAccount:'a:b',verifyEvent:()=>({...event,providerAccount:'a:b',eventId:'e',subscriptionId:'s'})}),b=openSubscriptionEntitlements(db,{providerAccount:'a',verifyEvent:()=>({...event,providerAccount:'a',eventId:'b:e',subscriptionId:'b:s'})});try{a.ingest('x','s');expect(()=>b.ingest('y','s')).not.toThrow();expect(a.access({customerId:'c',workspaceId:'w',now:50}).allowed).toBe(true);expect(b.access({customerId:'c',workspaceId:'w',now:50}).allowed).toBe(true);}finally{db.close();}
});
