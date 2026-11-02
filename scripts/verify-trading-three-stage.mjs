import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {strategySignal} from '../dist/revenue/strategy-research.js';
const dir='artifacts/trading-three-stage-20261011',old='artifacts/trading-comparison-20261011';
const read=p=>JSON.parse(fs.readFileSync(p));
const protocol=read(`${dir}/protocol.json`),previous=read(`${old}/protocol.json`),reports=read(`${dir}/fractional-results.json`);
const hash=v=>createHash('sha256').update(v).digest('hex');
assert.equal(protocol.originalProtocolHash,hash(fs.readFileSync(`${old}/protocol.json`)));
let verifiedTrades=0;
for(const r of reports){const raw=fs.readFileSync(`${old}/${r.symbol}-raw.json`);assert.equal(r.rawHash,hash(raw));const bars=JSON.parse(raw).map(v=>({time:v[0],open:Math.round(Number(v[1])*100),high:Math.ceil(Number(v[2])*100),low:Math.floor(Number(v[3])*100),close:Math.round(Number(v[4])*100)}));
 for(const result of [r.base,...r.stress]){const m=result.multiplier??1;let equity=r.capital*100,last=-1;
  for(const t of result.trades){assert.ok(t.entryTime>last);last=t.exitTime;assert.ok(t.atoms%protocol.rules.stepAtoms===0);assert.ok(t.committedCents<=equity);
   const ceil=(n,d)=>(n+d-1n)/d,d=BigInt(protocol.rules.scale)*10000n,a=BigInt(t.atoms),slip=BigInt(protocol.friction.slippageBps*m),bps=BigInt(protocol.friction.feeBps*m);
   const entry=ceil(BigInt(t.entry)*a*(10000n+slip),d),exit=BigInt(t.exit)*a*(10000n-slip)/d;
   const feeIn=ceil(entry*bps,10000n),feeOut=ceil(exit*bps,10000n);
   assert.equal(t.netPnlCents,Number(exit-feeOut-entry-feeIn));assert.equal(t.committedCents,Number(entry+feeIn));
   const i=bars.findIndex(b=>b.time===t.entryTime),window=Math.floor((i-previous.trainSize)/previous.testSize),id=r.base.selections[window];
   const plan=strategySignal(protocol.variants.find(v=>v.id===id),'paper')(bars.slice(0,i),bars[i].open);assert.ok(plan);
   const end=previous.trainSize+(window+1)*previous.testSize;let expected;
   for(let j=i;j<end;j++){const b=bars[j];if(b.low<=plan.stopCents){expected={time:b.time,price:Math.min(b.open,plan.stopCents),reason:'stop'};break;}if(b.high>=plan.targetsCents[0]){expected={time:b.time,price:plan.targetsCents[0],reason:'target'};break;}}
   expected??={time:bars[end-1].time,price:bars[end-1].close,reason:'window_end'};
   assert.deepEqual({time:t.exitTime,price:t.exit,reason:t.reason},expected);equity+=t.netPnlCents;verifiedTrades++;
  }assert.equal(result.finalEquity,equity);assert.equal(result.net,equity-r.capital*100);
 }
}
// Import an exact, hash-recorded copy of the reviewed research routine for matched selection runs.
const source=fs.readFileSync('scripts/trading-three-stage.mjs','utf8');const body=source.slice(source.indexOf('function run('),source.indexOf('const normalize='));
const moduleText=`import {strategySignal} from '../../dist/revenue/strategy-research.js';\nimport {sizeFractionalPaper} from '../../dist/revenue/fractional-paper-sizing.js';\nimport {fractionalPaperQuote} from '../../dist/revenue/paper-trading.js';\nconst p=${JSON.stringify(previous)},rules=${JSON.stringify(protocol.rules)};\nexport ${body}`;
fs.writeFileSync(`${dir}/frozen-engine.mjs`,moduleText,{flag:'wx'});const {run}=await import(`../${dir}/frozen-engine.mjs`);
const matched=reports.map(r=>{const prior=read(`${old}/${r.symbol}-${r.capital}-${r.strategy}.json`);const bars=read(`${old}/${r.symbol}-raw.json`).map(v=>({time:v[0],open:Math.round(Number(v[1])*100),high:Math.ceil(Number(v[2])*100),low:Math.floor(Number(v[3])*100),close:Math.round(Number(v[4])*100)}));const vs=r.strategy==='training-selector'?protocol.variants:protocol.variants.filter(v=>v.id===r.strategy);const result=run(bars,previous.trainSize,previous.testSize,r.capital*100,vs,protocol.friction,prior.selections.map(s=>s.selectedId));return {symbol:r.symbol,capital:r.capital,strategy:r.strategy,oldWholeNetCents:prior.evaluation.netPnlCents,frozenSelectionsFractional:result};});
fs.writeFileSync(`${dir}/matched-selection-results.json`,JSON.stringify(matched,null,2),{flag:'wx'});
const decisions=read(`${dir}/event-decisions.json`),commit=read(`${dir}/event-decision-commitment.json`);assert.equal(commit.sha256,hash(fs.readFileSync(`${dir}/event-decisions.json`)));assert.ok(Date.parse(commit.committedAt)<=Date.parse(read(`${dir}/event-reveal.json`).revealedAt));assert.equal(decisions.filter(d=>d.audit.disposition==='paper-review-only').length,1);assert.equal(decisions.find(d=>d.audit.disposition==='paper-review-only').eventId,'unique-valid');
const result={checkedAt:new Date().toISOString(),reports:reports.length,verifiedTrades,checks:['raw data/protocol integrity','independent bigint fee and PnL arithmetic','cash ceiling and lot grid','first stop/target touch, stop wins ambiguity, window-end close','nonoverlapping trades and equity reconciliation','event decision hash before reveal'],matchedSelectionComparisons:matched.length,engineHash:hash(moduleText),liveAuthorized:false};fs.writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
