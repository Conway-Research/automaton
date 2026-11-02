import test from 'node:test';import assert from 'node:assert/strict';import {historyView,formatHistoryReport} from '../web/founder/long-history.mjs';
test('research UI describes actual coverage and does not turn quoted rates into money',()=>{
 const report={id:'r',kind:'macro-history',nativeCurrency:'USD',costStatus:'unknown',decision:'weiter untersuchen',metrics:{observations:960,start:Date.UTC(1946,9,31),end:Date.UTC(2026,8,30),minimumAnnualRatePercent:.01,maximumAnnualRatePercent:16.3,latestAnnualRatePercent:3.94},limitations:['Retrospektiver Kontext']};
 const view=historyView({status:'running',counts:{datasets:1,reports:2,ready:0},coverage:[{label:'US-Zinsen',start:Date.UTC(1934,0,31),end:Date.UTC(2026,8,30),endsEarly:true}],recentReports:[report],blockers:[]});assert.equal(view.ready,0);assert.match(view.coverage[0],/1934/);assert.match(view.coverage[0],/2026/);
 const text=formatHistoryReport(report);assert.match(text,/960/);assert.match(text,/16[.,]30/);assert.ok(!text.includes('CHF'));assert.ok(!text.includes('Gewinn:'));
});
