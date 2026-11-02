import test from 'node:test';import assert from 'node:assert/strict';
import {createLaborxAccessReader} from './founder-laborx-access.mjs';
import {SAHIL_ORDER} from './founder-laborx-sahil.mjs';
const at=100000,order={...SAHIL_ORDER,sourceId:'laborx-fixture'};
test('login alone cannot authorize automated LaborX access',async()=>{
 let sessions=0;const read=createLaborxAccessReader({isEnabled:()=>true,now:()=>at,readSession:async()=>{sessions++;return {authenticated:true};}});
 await assert.rejects(read(order),/provider/);assert.equal(sessions,0);
});
test('only independently verified exact provider exception plus own session grants operations',async()=>{
 const grant={...order,issuer:'https://laborx.com',providerVerified:true,exceptionClause:'4.1.1(h)',automationAllowed:true,operations:['read','submit','reconcile'],observedAt:at,expiresAt:at+60000,evidenceRef:'fake:independently-verified-support'};
 const session={accountId:order.ownerId,authenticated:true,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:session'};
 const make=()=>createLaborxAccessReader({isEnabled:()=>true,now:()=>at,readProviderGrant:async()=>structuredClone(grant),readSession:async()=>structuredClone(session)});
 assert.equal((await make()(order)).automationAllowed,true);
 for(const field of ['externalId','buyerId','ownerId']){const old=grant[field];grant[field]='foreign';await assert.rejects(make()(order));grant[field]=old;}
 grant.providerVerified=false;await assert.rejects(make()(order));grant.providerVerified=true;session.accountId='foreign';await assert.rejects(make()(order));
});
test('OFF and expired provider approval never read a session',async()=>{
 let calls=0;const read=createLaborxAccessReader({isEnabled:()=>false,readProviderGrant:async()=>{calls++;},readSession:async()=>{calls++;}});
 await assert.rejects(read(order),/OFF/);assert.equal(calls,0);
 const expired=createLaborxAccessReader({isEnabled:()=>true,now:()=>at,readProviderGrant:async()=>({...order,observedAt:at-60000,expiresAt:at,evidenceRef:'fake:expired'}),readSession:async()=>{calls++;}});
 await assert.rejects(expired(order),/fresh/);assert.equal(calls,0);
});
