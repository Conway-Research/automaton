import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openFounderLedger} from './founder-ledger.mjs';
import {openFounderCostImport} from './founder-cost-import.mjs';
test('manual CHF payments persist and corrections replace rather than duplicate prepaid or service entries',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-payments-')),file=path.join(dir,'finance.db'),ledger=openFounderLedger(file);let store=openFounderCostImport(file);
 try{
 const invoice={provider:'OpenAI',reference:'openai-payment-test',observedDay:'2026-10-02',amountMinor:8648,currency:'USD',invoice:'0005',reason:'scope',source:'https://mail.google.com/mail/u/1/#all/example'};
 store.ingest([invoice]);const input={action:'payment',reference:invoice.reference,amount:7392,numaronAmount:7392,day:'2026-10-02',nature:'prepaid'};
 store.resolve(input);store.resolve(input);assert.equal(ledger.snapshot().entries.length,1);assert.equal(ledger.snapshot().entries[0].kind,'transfer');assert.equal(store.snapshot().invoices[0].payment.amount,7392);
 assert.throws(()=>store.resolve({...input,numaronAmount:8000}));assert.throws(()=>store.resolve({...input,day:'2026-02-30'}));
 store.resolve({...input,amount:7400,numaronAmount:3700,nature:'service'});assert.equal(ledger.snapshot().entries.length,1);assert.equal(ledger.snapshot().entries[0].amount,3700);assert.equal(ledger.snapshot().entries[0].kind,'expense');
 store.close();store=openFounderCostImport(file);assert.equal(store.snapshot().invoices[0].payment.numaronAmount,3700);
 }finally{store.close();ledger.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('invoice import persists, deduplicates, keeps USD outside CHF profit and only books verified service expenses',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-invoices-')),file=path.join(dir,'finance.db');const ledger=openFounderLedger(file);let store=openFounderCostImport(file);
 const invoice={provider:'OpenAI',reference:'openai-invoice-0005',observedDay:'2026-10-02',amountMinor:8648,currency:'USD',invoice:'0005',reason:'scope',source:'https://mail.google.com/mail/u/1/#all/example'};
 try{
  store.ingest([invoice]);store.ingest([invoice]);assert.equal(store.snapshot().invoices.length,1);assert.equal(ledger.snapshot().entries.length,0);
  assert.throws(()=>store.ingest([{...invoice,amountMinor:999}]));assert.throws(()=>store.ingest([{...invoice,reference:'untrusted-invoice',source:'https://evil.example/invoice'}]));
  assert.throws(()=>store.ingest([{...invoice,reference:'wrong-currency',reason:'ready'}]));
  const ready={...invoice,provider:'Hostpoint',reference:'hostpoint-numaron-123',currency:'CHF',reason:'ready',scope:'numaron-only',nature:'consumed-service',accountingDay:'2026-10-02',allocationEvidence:'Invoice line explicitly names numaron.com'};
  store.ingest([ready]);store.ingest([ready]);assert.equal(ledger.snapshot().entries.length,1);assert.equal(ledger.snapshot().entries[0].amount,8648);
  assert.throws(()=>store.ingest([{...ready,reference:'top-up-invalid',nature:'top-up'}]));
  assert.throws(()=>store.resolve({action:'allocate',reference:invoice.reference,amount:100,day:'2026-02-30',evidence:'Project usage and card evidence'}));
  store.resolve({action:'allocate',reference:invoice.reference,amount:125,day:'2026-10-02',evidence:'Project usage allocated; actual CHF card charge used'});
  assert.equal(ledger.snapshot().entries.find(e=>e.evidence===invoice.reference).amount,125);
  assert.equal(store.snapshot().invoices.find(i=>i.reference===invoice.reference).amountMinor,8648);
  assert.throws(()=>store.resolve({action:'allocate',reference:invoice.reference,amount:125,day:'2026-10-02',evidence:'Project usage allocated; actual CHF card charge used'}));
  const excluded={...invoice,reference:'openai-other-project-123'};store.ingest([excluded]);store.resolve({action:'exclude',reference:excluded.reference,evidence:'Invoice only concerns another project'});assert.equal(store.snapshot().invoices.find(i=>i.reference===excluded.reference).reason,'excluded');
  store.close();store=openFounderCostImport(file);assert.equal(store.snapshot().invoices.length,3);
 }finally{store.close();ledger.close();fs.rmSync(dir,{recursive:true,force:true});}
});
