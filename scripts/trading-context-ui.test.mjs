import test from 'node:test';import assert from 'node:assert/strict';import {marketContextView} from '../web/founder/trading.mjs';
test('context display preserves negative comparisons and unknown costs without CHF claims',()=>{
 const v=marketContextView({stale:false,comparison:{enrolled:20,open:3,filtered:5,pairedKnown:10,unknown:7,baselineR:2,contextR:-1,differenceR:-3},samples:[]});assert.match(v.result,/schlechter/);assert.match(v.result,/-3.00/);assert.ok(!v.result.includes('CHF'));assert.match(marketContextView({comparison:{pairedKnown:0,baselineR:null,contextR:null,differenceR:null},samples:[]}).result,/ausstehend/);
});
