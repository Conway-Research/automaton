import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openOrderPayment} from './founder-order-payment.mjs';
import {orderAccounts} from './founder-order-accountability.mjs';
import {openFounderRuntime} from './founder-runtime.mjs';
// Review of package C, finding B1 and H3. Instruction of 28.10.2026: a payment promise never replaces funding.
const budget={active:true,entriesComplete:true,entries:[],remainingRappen:1000,dayRemainingRappen:1000,taskRappen:250};
const terms={orderUrl:'https://github.com/o/r/issues/1',amountMinor:5000,currency:'USD',recipient:'0xown',scopeDigest:'scope',sourceRevision:'r1',postpaidDeclared:true};
const packages={rows:[{id:'core',label:'ugig',inventoryKind:'core'}]};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'postpaid-closed-'));
const withPlans=base=>{fs.mkdirSync(path.join(base,'docs/superpowers/plans'),{recursive:true});fs.writeFileSync(path.join(base,'docs/superpowers/plans/2026-10-18-numaron-source-work-packages.json'),JSON.stringify(packages));};
test('the production runtime composition offers no postpaid mode',async()=>{const base=temp();withPlans(base);let runtime;try{
 runtime=openFounderRuntime({base,directory:path.join(base,'runtime'),adapters:{},activate:false,isEnabled:()=>false});
 const modes=runtime.snapshot().paymentAuthority.modes;assert.equal(modes['postpaid-limited'],false);
}finally{await runtime?.close();fs.rmSync(base,{recursive:true,force:true});}});
test('a declared payment promise goes to the escrow check and without funding gets no authority',async()=>{const base=temp();let escrowChecks=0;const service=openOrderPayment({file:path.join(base,'p.db'),isEnabled:()=>true,budgetSnapshot:()=>budget,escrow:{status:()=>({available:true}),require:async()=>{escrowChecks++;throw Error('No funded escrow');}}});try{
 await assert.rejects(service.require(terms,{rootTaskId:'root'}),/funded escrow/);assert.equal(escrowChecks,1);assert.equal(service.snapshot().openOrders,0);
}finally{service.close();fs.rmSync(base,{recursive:true,force:true});}});
test('an earlier stored postpaid authorization no longer allows work and cannot refresh',async()=>{const base=temp(),file=path.join(base,'p.db'),at=Date.now();const open=postpaidSource=>openOrderPayment({file,isEnabled:()=>true,budgetSnapshot:()=>budget,postpaidSource,escrow:{status:()=>({available:false}),require:async()=>{throw Error('No funded escrow');}}});
 const old=open({origin:'https://github.com',modeFor:()=>'postpaid-limited',read:async t=>({...t,kind:'postpaid-agreement',status:'accepted',openContributionConfirmed:true,acceptanceCriteria:['a'],feesKnown:true,netAmountMinor:4000,estimatedNetRappen:1000,payoutMethod:'usdc',paymentWithinDaysAfterAcceptance:14,sourceUrl:t.orderUrl,evidenceRef:'promise',observedAt:new Date(at).toISOString(),expiresAt:new Date(at+60000).toISOString()})});
 const {postpaidDeclared,...bound}=terms;let authorization;try{authorization=await old.require(bound,{rootTaskId:'root'});const order={rootTaskId:'root',scopeDigest:'scope',sourceRevision:'r1',paymentAuthorization:authorization,paymentTerms:bound};assert.equal(old.allows(order),true,'precondition: the old composition allowed it');old.close();
  const closed=open(null);try{assert.equal(closed.allows(order),false);await assert.rejects(closed.refresh(order,{rootTaskId:'root'}),/payment mode changed/);}finally{closed.close();}
 }finally{fs.rmSync(base,{recursive:true,force:true});}});
const funding={amountMinor:9000,netAmountMinor:9000,currency:'CHF',recipient:'own'};
const key={sourceId:'s',externalId:'e',ownerId:'o'};
const payment={...key,confirmed:true,amountMinor:9000,currency:'CHF',recipient:'own',evidenceRef:'bank:1'};
const costs={entriesComplete:true,entries:[{id:'c',taskId:'root',maxCostRappen:10,actualCostRappen:10}]};
const account=(p,options)=>orderAccounts([{...key,rootTaskId:'root',state:'paid',funding,payment:p}],costs,options).orders[0];
test('a real looking receipt still counts where the source policy is decided',()=>assert.equal(account(payment).contributionRappen,8990));
for(const [name,change] of Object.entries({synthetic:{synthetic:true},refunded:{refunded:true},chargeback:{chargeback:true},environment:{environment:'synthetic'},sandbox:{environment:'sandbox'}}))test('non-real receipt never counts as income: '+name,()=>{const r=account({...payment,...change});assert.equal(r.contributionRappen,null);assert.ok(r.blockers.includes('payment-not-real'));});
test('only accepted receipt kinds count in the strict accounts, and a reversal removes the receipt',()=>{const strict={acceptedReceiptKinds:['bank-statement','finalized-chain-receipt','provider-settlement']};for(const kind of [undefined,'platform-display']){const r=account({...payment,...(kind?{receiptKind:kind}:{})},strict);assert.equal(r.contributionRappen,null);assert.ok(r.blockers.includes('receipt-source-not-accepted'));}assert.equal(account({...payment,receiptKind:'bank-statement'},strict).contributionRappen,8990);assert.equal(account({...payment,receiptKind:'bank-statement'},strict).received.basis,'confirmed-at-check-time');const reversed=orderAccounts([{...key,rootTaskId:'root',state:'paid',funding,payment:{...payment,receiptKind:'bank-statement'},paymentReversal:{evidenceRef:'chargeback:1',at:1}}],costs,strict).orders[0];assert.equal(reversed.contributionRappen,null);assert.ok(reversed.blockers.includes('payment-reversed'));});
