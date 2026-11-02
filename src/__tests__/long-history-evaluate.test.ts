import {it,expect} from 'vitest';import {evaluateCashTrial,stressCosts,assessCandidate,familyBlockBounds} from '../revenue/long-history/evaluate.js';
import {normalizeCashBars} from '../revenue/long-history/normalize.js';
it('keeps costs as model estimates and never authorizes trading',()=>{
 const bars=Array.from({length:300},(_,i)=>({time:i+1,open:10000+i*50,high:10100+i*50,low:9900+i*50,close:10070+i*50}));
 const series=normalizeCashBars(bars,{productType:'cash',symbol:'X',currency:'USD',productEvidence:'fixture',adjustmentEvidence:'fixture'});
 const report=evaluateCashTrial(series,{id:'r',datasetId:'d',start:1,end:300,seed:1,variantIds:['momentum-10']},'momentum-10');
 expect(report.costStatus).toBe('model');expect(report.liveAuthorized).toBe(false);expect(report.metrics.trades).toBeGreaterThan(0);expect(report.decision).not.toBe('für Paper-Vorwärtstest geeignet');expect(assessCandidate(report,{})).not.toBe('für Paper-Vorwärtstest geeignet');
 expect((report.metrics.periodPnlCents as number[]).reduce((a,b)=>a+b,0)).toBe(report.metrics.netPnlCents);
 expect(evaluateCashTrial(series,{id:'r',datasetId:'d',start:1,end:300,seed:1,variantIds:['momentum-10']},'momentum-10')).toEqual(report);
});
it('computes joint block bounds only on aligned sufficiently long periods',()=>{
 const a=Array(120).fill(2),b=Array(120).fill(-1);const r=familyBlockBounds([a,b],42);expect(r?.lowerMeans).toEqual([2,-1]);expect(r?.method).toBe('joint-block-max-statistic');expect(familyBlockBounds([a,b.slice(1)],42)).toBeNull();expect(familyBlockBounds([a.slice(0,20)],42)).toBeNull();
});
it('never improves financing credits in an adverse cost scenario',()=>{
 expect(stressCosts({feeBps:10,slippageBps:10,minimumFeeCents:100,financingCashFlow:2})).toEqual({feeBps:20,slippageBps:20,minimumFeeCents:200,financingCashFlow:0});
 expect(stressCosts({feeBps:10,slippageBps:10,minimumFeeCents:100,financingCashFlow:-2}).financingCashFlow).toBe(-4);
});
it('cannot assess a cash report with missing metrics',()=>{expect(assessCandidate({kind:'cash-paper',metrics:{}} as any,{})).toBe('nicht prüfbar');});
