import {financialSummary} from '../web/founder/model.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeFinanceSnapshot,financeRefreshMessage} from '../web/founder/finance-refresh.mjs';
test('independent finance updates preserve tasks and cannot be overwritten by slower general snapshots',()=>{
 const finance={financeReport:{transactions:[{id:'new'}]},financeBudget:{periodRappen:15000},financeStatus:{reportAvailable:true,reportObservedAt:'2026-10-15T11:40:00Z'}};
 const merged=mergeFinanceSnapshot({autonomy:{tasks:[{id:'task'}],budget:{periodRappen:1}},financeReport:{transactions:[]}},finance);
 assert.equal(merged.financeReport.transactions[0].id,'new');assert.equal(merged.autonomy.tasks[0].id,'task');assert.equal(merged.autonomy.budget.periodRappen,15000);
 assert.match(financeRefreshMessage(finance),/Finanzansicht verbunden/);
 assert.match(financeRefreshMessage({...finance,financeStatus:{...finance.financeStatus,reportAvailable:false}}),/Letzter gespeicherter Stand/);
});

test('failed revenue refresh cannot show a fully reconciled profit from old evidence',()=>{
 const now=Date.parse('2026-10-15T11:40:00Z');
 const data={financeStatus:{reportAvailable:false},financeReport:{transactions:[],coverage:{complete:true,from:now/1000-86400,to:now/1000}},financeLedger:{entries:[],closures:{today:{complete:true}}},autonomy:{budget:{entries:[]}},billing:{providers:[{provider:'OpenAI',status:'connected',rows:[]},{provider:'Cloudflare',status:'connected',rows:[]}]}};
 const result=financialSummary(data,'today',now);
 assert.equal(result.reconciled,false);assert.equal(result.profitStatus,'partial');
 assert.ok(result.reconciliationIssues.some(x=>x.includes('Einnahmenabruf')));
});
