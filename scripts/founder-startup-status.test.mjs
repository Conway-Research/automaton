import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {founderStartupStatus} from './founder-startup-status.mjs';
test('startup status reads one budget projection and bounded composition, not full dashboard',()=>{
 let budgetReads=0,compositionReads=0;const budget={snapshot(){budgetReads++;return {active:true,periodRappen:15000,dailyRappen:2000,taskRappen:250,maxWorkers:10};}};
 const result=founderStartupStatus({budget,productionStatus(){compositionReads++;return {marketplaceWork:{ugig:{additionalOrders:{officeGeneration:{configured:true,visualConfigured:true,liveReady:false}}}}};}});
 assert.equal(budgetReads,1);assert.equal(compositionReads,1);assert.equal(result.budget.periodRappen,15000);assert.equal(result.officeOrderFlow.liveReady,false);
});
test('no production composition is valid but unavailable budget is never replaced with success',()=>{assert.equal(founderStartupStatus({budget:{snapshot:()=>({active:false})}}).officeOrderFlow,null);assert.throws(()=>founderStartupStatus({budget:{snapshot(){throw Error('Budget unavailable');}}}),/Budget unavailable/);});
test('entrypoint never builds the full dashboard before ready, preserves real health and supervisor deadline',()=>{const main=fs.readFileSync(new URL('./founder-mt5.mjs',import.meta.url),'utf8');assert.ok(main.includes('autonomy.startupSnapshot()'));assert.equal(main.includes('autonomy.snapshot()'),false);assert.ok(main.indexOf('autonomy.startupSnapshot()')<main.indexOf("process.send?.('ready')"));const supervisor=fs.readFileSync(new URL('./founder-supervisor-state.mjs',import.meta.url),'utf8');assert.match(supervisor,/timeoutMs=45000/);assert.match(supervisor,/healthMatches\(child.pid\)/);assert.match(supervisor,/canStop\(\)===true/);});
