import {it,expect} from 'vitest';import {analyzeHistory} from '../revenue/long-history/history.js';
it('compounds returns and does not invent CHF money or trades',()=>{
 const r=analyzeHistory({kind:'factor-returns',rows:[{date:1,returnDecimals:.5},{date:2,returnDecimals:-.5}],field:'fixture',currency:'USD',limitations:[]},{id:'report',runId:'run',datasetId:'data',start:1,end:2});
 expect(r.metrics.totalReturn).toBe(-.25);expect(r.metrics.maximumDrawdown).toBe(.5);expect(r.metrics).not.toHaveProperty('trades');expect(r.metrics).not.toHaveProperty('CHF');expect(r.liveAuthorized).toBe(false);
});
