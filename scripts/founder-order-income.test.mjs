import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collectOrderIncome,readOrderIncome} from './founder-order-income.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const dir='artifacts/synmerco-followup-search-20261016-current/';
const fixture=()=>({source:dir,confirmation:read(dir+'payment-confirmed.json'),rpc:read(dir+'receipt-rpc.json'),blocks:read(dir+'block-rpc.json')});
test('validated receipt retains exact six-decimal units and order mapping',()=>{const r=collectOrderIncome([fixture()]);assert.equal(r.totalAtomic,'7740000');assert.equal(r.receipts[0].jobId,12);assert.equal(r.receipts[0].bidId,174);assert.match(r.receipts[0].transactionURL,/^https:\/\/basescan.org\/tx\/0x/);});
test('duplicate artifact copies count once',()=>{const r=collectOrderIncome([fixture(),fixture()]);assert.equal(r.receipts.length,1);assert.equal(r.totalAtomic,'7740000');});
for(const [name,mutate] of [
 ['failed receipt',f=>f.rpc.find(x=>x.result?.logs).result.status='0x0'],
 ['wrong recipient',f=>f.confirmation.wallet='0x'+'1'.repeat(40)],
 ['wrong network',f=>f.rpc.find(x=>x.result==='0x2105').result='0x1'],
 ['wrong declared amount',f=>f.confirmation.receivedUSDC='8'],
 ['noncanonical block',f=>f.blocks.find(x=>x.result?.hash).result.hash='0x'+'0'.repeat(64)],
 ['unconfirmed claim',f=>f.confirmation.actualReceiptConfirmed=false],
 ['wrong job',f=>f.confirmation.baseJob=13],
])test(name+' is excluded',()=>{const f=fixture();mutate(f);const r=collectOrderIncome([f]);assert.equal(r.totalAtomic,'0');assert.equal(r.receipts.length,0);assert.equal(r.issues.length,1);});
test('contradictory copies quarantine the identity rather than keeping first',()=>{const a=fixture(),b=fixture();b.confirmation.bid=999;const r=collectOrderIncome([a,b]);assert.equal(r.receipts.length,0);assert.ok(r.issues.length);});
test('existing three independently verified receipts sum exactly without rounding',()=>{const r=readOrderIncome(process.cwd());assert.equal(r.totalAtomic,'36765000');assert.equal(r.receipts.length,3);assert.deepEqual(r.issues,[]);});
