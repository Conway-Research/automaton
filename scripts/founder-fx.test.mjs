import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEcbRates,convertToCHF,readFounderFX} from './founder-fx.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const xml=`<gesmes:Envelope><Cube><Cube time='2026-10-09'><Cube currency='USD' rate='1.2'/><Cube currency='CHF' rate='0.96'/></Cube><Cube time='2026-10-13'><Cube currency='USD' rate='1.1188'/><Cube currency='CHF' rate='0.9312'/></Cube></Cube></gesmes:Envelope>`;
test('ECB cross rate keeps precision, uses preceding business date and records provenance',()=>{
 const rates=parseEcbRates(xml);const r=convertToCHF(0.2446346,'USD','2026-10-13',rates);assert.ok(Math.abs(r.amountCHF-0.20361435423668217)<1e-9);assert.equal(r.rateDay,'2026-10-13');assert.equal(convertToCHF(10,'USD','2026-10-11',rates).amountCHF,8);assert.equal(convertToCHF(10,'EUR','2026-10-11',rates).amountCHF,9.6);
});
test('missing, future-only, too old and invalid rates fail closed; CHF needs no FX',()=>{
 const rates=parseEcbRates(xml);assert.equal(convertToCHF(10,'USD','2026-10-08',rates),null);assert.equal(convertToCHF(10,'USD','2026-10-22',rates),null);assert.equal(convertToCHF(10,'GBP','2026-10-13',rates),null);assert.equal(convertToCHF(10,'CHF','2026-10-13',[]).amountCHF,10);assert.throws(()=>parseEcbRates(`<Cube time='2026-10-13'><Cube currency='USD' rate='0'/><Cube currency='CHF' rate='1'/></Cube>`));
});
test('rates survive reopening, daily cache avoids refetching and outages retain dated evidence',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'founder-fx-'));fs.mkdirSync(path.join(base,'artifacts/founder-integration-20261012'),{recursive:true});const now=Date.parse('2026-10-13T16:00Z');let calls=0;
 try{const options={now,request:async()=>{calls++;return {ok:true,headers:new Headers({etag:'rate-v1'}),text:async()=>xml};}};const first=await readFounderFX(base,options);const cached=await readFounderFX(base,options);assert.equal(calls,1);assert.deepEqual(cached,first);
 const stale=await readFounderFX(base,{now:now+7*3600000,request:async()=>{throw Error('offline');}});assert.equal(stale.stale,true);assert.equal(convertToCHF(10,'USD','2026-10-13',stale.rates).rateDay,'2026-10-13');
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
