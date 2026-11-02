import {it,expect} from 'vitest';
import {researchWorker} from '../revenue/long-history/worker-client.js';
import {normalizeCashBars} from '../revenue/long-history/normalize.js';
import {evaluateCashTrial} from '../revenue/long-history/evaluate.js';
it('executes a fixed cash adapter in the bounded worker with deterministic output',async()=>{
 const bars=Array.from({length:150},(_,i)=>({time:Date.UTC(2020,0,1)+i*86400000,open:10000+i*50,high:10100+i*50,low:9900+i*50,close:10070+i*50}));
 const series=normalizeCashBars(bars,{productType:'cash',symbol:'FIXTURE',currency:'USD',productEvidence:'test fixture only',adjustmentEvidence:'test fixture only'}),registration={id:'r',datasetId:'d',start:bars[0].time,end:bars.at(-1)!.time,seed:42,variantIds:['momentum-10']};
 expect(await researchWorker({kind:'cash',series,registration,variantId:'momentum-10'},new AbortController().signal)).toEqual(evaluateCashTrial(series,registration,'momentum-10'));
 const stop=new AbortController();stop.abort();await expect(researchWorker({kind:'cash',series,registration},stop.signal)).rejects.toThrow(/abgebrochen/);
});
