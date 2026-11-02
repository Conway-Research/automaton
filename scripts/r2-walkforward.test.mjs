import {test} from 'node:test';
import assert from 'node:assert/strict';
import {annualWalkforward,drawdownDuration} from './lib/r2-walkforward.mjs';
const end=date=>Date.parse(date+'T00:00:00Z')+86400000;
test('annual return carries capital and a year-end close belongs to its own year',()=>{
 const marks=[{time:end('2021-12-31'),equity:90},{time:end('2022-01-03'),equity:105}];
 const trades=[{entryDate:'2021-12-20',exitDate:'2022-01-03',net:5,reason:'signal'}];
 const a=annualWalkforward(marks,trades,100);
 assert.equal(a[0].year,2021);assert.ok(Math.abs(a[0].netReturn+.1)<1e-12);
 assert.equal(a[1].startEquity,90);assert.ok(Math.abs(a[1].netReturn-(105/90-1))<1e-12);
 assert.equal(a[0].entryCohort.trades,1);assert.equal(a[0].entryCohort.crossYearExits,1);
 assert.equal(a[0].entryCohort.closedByYearEnd,0);assert.equal(a[0].entryCohort.winRateAsOfYearEnd,null);
 assert.equal(a[1].exitCohort.trades,1);
});
test('annual drawdown uses incoming equity, never a synthetic new account',()=>{
 const marks=[{time:end('2021-12-31'),equity:80},{time:end('2022-01-01'),equity:60},{time:end('2022-12-31'),equity:100}];
 const a=annualWalkforward(marks,[],100);
 assert.ok(Math.abs(a[0].maxCloseDrawdownFraction-.2)<1e-12);
 assert.ok(Math.abs(a[1].maxCloseDrawdownFraction-.25)<1e-12);
 assert.equal(a[1].entryCohort.winRate,null);
 assert.ok(Math.abs((1+a[0].netReturn)*(1+a[1].netReturn)-1)<1e-12);
});
test('underwater duration uses calendar days and flags unrecovered losses',()=>{
 const a=drawdownDuration([{time:end('2021-01-01'),equity:100},{time:end('2021-01-02'),equity:90},{time:end('2021-01-06'),equity:100}],100);
 assert.equal(a.longestCalendarDays,5);assert.equal(a.unrecovered,false);
 const b=drawdownDuration([{time:end('2021-01-01'),equity:100},{time:end('2021-01-06'),equity:90}],100);
 assert.equal(b.longestCalendarDays,5);assert.equal(b.unrecovered,true);
});
