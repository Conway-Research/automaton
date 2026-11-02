import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {assertPersonalStartup} from '../v1/startup-admission.js';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import Database from 'better-sqlite3';
import {livePreflight} from '../v1/live-preflight.js';
import {createDatabase} from '../state/database.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {configureSupportOutbox} from '../commerce/support-outbox.js';
it('inspects a separately supplied research database without migration or disclosure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-separate-research-')),file=path.join(dir,'agent.db'),researchFile=path.join(dir,'research.db'),db=createDatabase(file),research=new Database(researchFile);
 try{
  const inspect=()=>livePreflight({agentFile:file,researchFile},{});
  expect(inspect().checks).toContainEqual(expect.objectContaining({id:'separate_research_integrity',status:'blocked'}));
  expect(research.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
  research.exec('CREATE TABLE research_evidence(id TEXT PRIMARY KEY,opportunity_id TEXT,payload TEXT,digest TEXT)');
  const payload=JSON.stringify({id:'private-id',opportunityId:'private-research',excerpt:'private-text'});
  research.prepare('INSERT INTO research_evidence VALUES(?,?,?,?)').run('private-id','private-research',payload,createHash('sha256').update(payload).digest('hex'));
  expect(inspect().checks).toContainEqual(expect.objectContaining({id:'separate_research_integrity',status:'pass'}));
  research.exec("UPDATE research_evidence SET digest='private-invalid'");
  const before=research.prepare('SELECT * FROM research_evidence').all(),report=inspect();
  expect(report.checks).toContainEqual(expect.objectContaining({id:'separate_research_integrity',status:'blocked'}));
  expect(report.checks).toContainEqual(expect.objectContaining({id:'research_integrity',status:'pass'}));
  expect(JSON.stringify(report)).not.toContain('private-');
  expect(research.prepare('SELECT * FROM research_evidence').all()).toEqual(before);
  expect(livePreflight({agentFile:file},{}).checks.some(c=>c.id==='separate_research_integrity')).toBe(false);
  const missing=path.join(dir,'missing.db');
  expect(livePreflight({agentFile:file,researchFile:missing},{}).checks).toContainEqual(expect.objectContaining({id:'research_database',status:'blocked'}));
  expect(fs.existsSync(missing)).toBe(false);
 }finally{research.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('checks research integrity before startup without initializing, disclosing or repairing evidence',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-research-preflight-')),file=path.join(dir,'test.db'),db=createDatabase(file);
 try{
  const inspect=()=>livePreflight({agentFile:file},{});
  expect(inspect().checks).toContainEqual(expect.objectContaining({id:'research_integrity',status:'pass'}));
  expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='research_evidence'").get()).toBeUndefined();
  db.raw.exec('CREATE TABLE research_evidence(id TEXT PRIMARY KEY,opportunity_id TEXT,payload TEXT,digest TEXT)');
  const payload=JSON.stringify({id:'private-id',opportunityId:'private-opportunity',excerpt:'private-content'});
  db.raw.prepare('INSERT INTO research_evidence VALUES(?,?,?,?)').run('private-id','private-opportunity',payload,createHash('sha256').update(payload).digest('hex'));
  expect(inspect().checks).toContainEqual(expect.objectContaining({id:'research_integrity',status:'pass'}));
  db.raw.exec("UPDATE research_evidence SET payload='private-corrupt'");
  const before=db.raw.prepare('SELECT * FROM research_evidence').all(),report=inspect();
  expect(report.checks).toContainEqual(expect.objectContaining({id:'research_integrity',status:'blocked',detail:expect.stringContaining('1 inconsistent')}));
  expect(JSON.stringify(report)).not.toContain('private-');
  expect(()=>assertPersonalStartup(file)).toThrow('research_integrity');
  expect(db.raw.prepare('SELECT * FROM research_evidence').all()).toEqual(before);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('blocks incompatible research tables while preserving the remaining preflight checks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-research-schema-')),file=path.join(dir,'test.db'),db=createDatabase(file);
 try{
  db.raw.exec('CREATE TABLE research_evidence(unexpected TEXT)');
  const report=livePreflight({agentFile:file},{});
  expect(report.checks).toContainEqual(expect.objectContaining({id:'research_integrity',status:'blocked'}));
  expect(report.checks).toContainEqual(expect.objectContaining({id:'economic_integrity',status:'pass'}));
  expect(db.raw.prepare("PRAGMA table_info('research_evidence')").all()).toHaveLength(1);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('reports malformed active economics and orphan experiments without leaking or repairing stored data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-economics-preflight-')),file=path.join(dir,'test.db'),db=createDatabase(file);
 try{
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('private-parent','private-business','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis) VALUES('private-experiment','private-parent','running','private-hypothesis')");
  const check=()=>livePreflight({agentFile:file},{});
  expect(check().checks).toContainEqual(expect.objectContaining({id:'economic_integrity',status:'pass'}));
  db.raw.exec("UPDATE revenue_opportunities SET expected_cost_cents=-1; UPDATE revenue_experiments SET forecast_probability_success=101");
  const before=db.raw.prepare('SELECT * FROM revenue_experiments').all();
  const result=check();
  expect(result.checks).toContainEqual(expect.objectContaining({id:'economic_integrity',status:'blocked',detail:expect.stringContaining('1 active/candidate opportunities')}));
  expect(result.checks.find(c=>c.id==='economic_integrity')?.detail).toContain('1 planned/running experiments with invalid numbers');
  expect(JSON.stringify(result)).not.toContain('private-');
  expect(db.raw.prepare('SELECT * FROM revenue_experiments').all()).toEqual(before);
  expect(db.raw.prepare('SELECT expected_cost_cents n FROM revenue_opportunities').get()).toEqual({n:-1});
  db.raw.exec("UPDATE revenue_opportunities SET status='paused'");
  expect(check().checks.find(c=>c.id==='economic_integrity')?.detail).toContain('1 planned/running experiments with missing or inactive parents');
  db.raw.pragma('foreign_keys = OFF');
  db.raw.exec("UPDATE revenue_experiments SET opportunity_id='private-missing'");
  db.raw.pragma('foreign_keys = ON');
  expect(check().checks.find(c=>c.id==='economic_integrity')?.detail).toContain('1 planned/running experiments with missing or inactive parents');
  db.raw.exec("UPDATE revenue_experiments SET status='stopped'");
  expect(check().checks).toContainEqual(expect.objectContaining({id:'economic_integrity',status:'pass'}));
  expect(check().liveReady).toBe(false);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('reports contradictory support cases without changing records or exposing message data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-support-integrity-')),file=path.join(dir,'db'),db=createDatabase(file);
 try{
  configureSupportOutbox(db.raw,'fixture@example.com',2);
  db.raw.prepare("INSERT INTO obolus_support_replies(id,inbox_id,payload,status) VALUES('private-reply','private-case','private-payload','queued')").run();
  expect(livePreflight({agentFile:file,includeSupport:true},{}).checks).toContainEqual(expect.objectContaining({id:'support_case_integrity',status:'blocked',detail:expect.stringContaining('1 open replies')}));
  db.raw.exec('CREATE TABLE obolus_support_inbox(id TEXT PRIMARY KEY,status TEXT)');
  db.raw.prepare('INSERT INTO obolus_support_inbox VALUES(?,?)').run('private-case','reviewed');
  const report=livePreflight({agentFile:file,includeSupport:true},{});
  expect(report.checks).toContainEqual(expect.objectContaining({id:'support_case_integrity',status:'blocked'}));
  for(const value of ['private-reply','private-case','private-payload'])expect(JSON.stringify(report)).not.toContain(value);
  expect(db.raw.prepare('SELECT status FROM obolus_support_replies').get()).toEqual({status:'queued'});
  db.raw.prepare("UPDATE obolus_support_inbox SET status='received'").run();
  expect(livePreflight({agentFile:file,includeSupport:true},{}).checks).toContainEqual(expect.objectContaining({id:'support_case_integrity',status:'pass'}));
  db.raw.prepare("INSERT INTO obolus_support_replies(id,inbox_id,payload,status) VALUES('invalid','other','{}','invalid')").run();
  expect(livePreflight({agentFile:file,includeSupport:true},{}).checks).toContainEqual(expect.objectContaining({id:'support_case_integrity',status:'blocked',detail:expect.stringContaining('1 invalid reply states')}));
  expect(livePreflight({agentFile:file},{}).checks.some(c=>c.id==='support_case_integrity')).toBe(false);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
import {reconcileProviderCheckedPayout} from '../commerce/payout-verification.js';
it('reports persistent payout holds without exposing evidence or changing the ledger',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-hold-preflight-')),file=path.join(dir,'test.db'),db=createDatabase(file);
 try{
  expect(livePreflight({agentFile:file},{}).checks).toContainEqual(expect.objectContaining({id:'payout_capital_holds',status:'pass'}));
  expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_payout_capital_holds'").get()).toBeUndefined();
  initializeCapitalBudget(db.raw,{capitalChfCents:100,reserveChfCents:100,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  const receipt={providerAccount:'acct_privatefixture',payoutId:'po_privatefixture',mode:'live' as const,cash:{accountRef:'private-bank-fixture',transactionRef:'private-transfer',kind:'receipt' as const,cashChfCents:100,retainedChfCents:20,evidenceSha256:'a'.repeat(64),reviewedBy:'private-reviewer'}};
  const observation={providerAccount:receipt.providerAccount,payoutId:receipt.payoutId,mode:'live' as const,amountCents:100,currency:'chf',providerStatus:'paid',expectedArrivalSeconds:0,observedAt:Date.now(),capitalCreditedCents:0,limitation:'fixture'};
  await reconcileProviderCheckedPayout(db.raw,{observePayout:async()=>observation},receipt);
  await expect(reconcileProviderCheckedPayout(db.raw,{observePayout:async()=>({...observation,providerStatus:'failed'})},receipt)).rejects.toThrow();
  const before=db.raw.prepare('SELECT * FROM obolus_payout_capital_holds').all();
  const result=livePreflight({agentFile:file},{});
  expect(result.checks).toContainEqual(expect.objectContaining({id:'payout_capital_holds',status:'blocked',detail:expect.stringContaining('1 unresolved')}));
  expect(result.checks).toContainEqual(expect.objectContaining({id:'capital_policy',status:'blocked'}));
  for(const hidden of ['privatefixture','private-bank-fixture','private-transfer','private-reviewer','a'.repeat(64)])expect(JSON.stringify(result)).not.toContain(hidden);
  expect(db.raw.prepare('SELECT * FROM obolus_payout_capital_holds').all()).toEqual(before);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM aureus_reconciled_cash').get()).toEqual({n:1});
  expect(result.liveReady).toBe(false);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('defaults to personal scope without requiring public commerce or silently enabling trading',()=>{
 const result=livePreflight({},{});
 expect(result.operatingScope).toBe('personal');expect(result.liveReady).toBe(false);
 const ids=result.checks.map(c=>c.id);
 expect(ids).toContain('private_interface');
 for(const id of ['stripe_configuration','https_origin','commerce_database','provider_account','webhook_delivery','live_trading'])expect(ids).not.toContain(id);
 expect(result.tradingIncluded).toBe(false);
 expect(livePreflight({includeTrading:true},{}).checks).toContainEqual(expect.objectContaining({id:'live_trading',status:'blocked'}));
 expect(()=>livePreflight({operatingScope:'invalid' as any},{})).toThrow('scope');
});
it('never reports an unconfigured project ready or exposes secrets',()=>{
 const env={OBOLUS_STRIPE_SECRET_KEY:'sk_live_fixture_private',OBOLUS_STRIPE_WEBHOOK_SECRET:'whsec_fixture_private',OBOLUS_STRIPE_ACCOUNT_ID:'acct_fixture'};
 const result=livePreflight({operatingScope:'commerce'},env);expect(result.liveReady).toBe(false);expect(JSON.stringify(result)).not.toContain('fixture_private');
 expect(result.checks.some(c=>c.id==='stripe_configuration'&&c.status==='pass')).toBe(true);
 expect(livePreflight({operatingScope:'commerce'},{}).checks[0].status).toBe('blocked');
});
it('includes opt-in support controls and unresolved deliveries without reading or exposing token values',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-support-preflight-')),file=path.join(dir,'test.db'),db=createDatabase(file);
 try{
  configureSupportOutbox(db.raw,'fixture@example.com',2);
  db.raw.prepare("INSERT INTO obolus_support_replies(id,inbox_id,payload,status) VALUES('fixture','fixture','{}','uncertain')").run();
  const env={OBOLUS_SUPPORT_LABEL:'Label_fixture',OBOLUS_GMAIL_ACCESS_TOKEN:'fixture-private-access',OBOLUS_GMAIL_REFRESH_TOKEN:'fixture-private-refresh'};
  const result=livePreflight({agentFile:file,includeSupport:true},env);
  expect(result.checks).toContainEqual(expect.objectContaining({id:'support_credentials',status:'blocked'}));
  expect(result.checks).toContainEqual(expect.objectContaining({id:'support_control',status:'blocked'}));
  expect(result.checks).toContainEqual(expect.objectContaining({id:'support_delivery',status:'blocked'}));
  expect(result.checks).toContainEqual(expect.objectContaining({id:'support_provider',status:'unverified'}));
  expect(JSON.stringify(result)).not.toContain('fixture-private');
  expect(db.raw.prepare('SELECT paused FROM obolus_support_policy').get()).toEqual({paused:1});
  expect(livePreflight({agentFile:file},env).checks.some(check=>check.id.startsWith('support_'))).toBe(false);
  const complete=livePreflight({agentFile:file,includeSupport:true},{...env,OBOLUS_GMAIL_CLIENT_ID:'fixture-client',OBOLUS_GMAIL_CLIENT_SECRET:'fixture-secret'});
  expect(complete.checks).toContainEqual(expect.objectContaining({id:'support_credentials',status:'pass'}));expect(complete.liveReady).toBe(false);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('inspects existing databases without migrations, creations or false external readiness',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-preflight-'));const agentFile=path.join(dir,'agent.db'),commerceFile=path.join(dir,'commerce.db');
 const a=createDatabase(agentFile),c=new Database(commerceFile);
 try {
  initializeCapitalBudget(a.raw,{capitalChfCents:5000,reserveChfCents:1000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  c.exec("CREATE TABLE commerce_stripe_config(id INTEGER PRIMARY KEY,mode TEXT,account_id TEXT); INSERT INTO commerce_stripe_config VALUES(1,'live','acct_fixture')");
  const before=a.raw.prepare('SELECT COUNT(*) n FROM schema_version').get();
  const r=livePreflight({agentFile,commerceFile,publicOrigin:'https://example.com',operatingScope:'commerce'},{OBOLUS_STRIPE_ACCOUNT_ID:'acct_fixture'});
  expect(r.checks).toContainEqual(expect.objectContaining({id:'capital_policy',status:'pass'}));
  expect(r.checks).toContainEqual(expect.objectContaining({id:'provider_account',status:'unverified'}));expect(r.liveReady).toBe(false);
  expect(a.raw.prepare('SELECT COUNT(*) n FROM schema_version').get()).toEqual(before);
  expect(r.checks).toContainEqual(expect.objectContaining({id:'inference_limits',status:'blocked'}));
  expect(r.checks).toContainEqual(expect.objectContaining({id:'unresolved_spending',status:'pass'}));
  expect(r.checks).toContainEqual(expect.objectContaining({id:'adapter_permissions',status:'blocked'}));
  expect(r.checks).toContainEqual(expect.objectContaining({id:'sales_control',status:'blocked'}));
  expect(c.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_sales_control'").get()).toBeUndefined();
  a.raw.exec("CREATE TABLE obolus_reserved_operations(id TEXT,status TEXT); INSERT INTO obolus_reserved_operations VALUES('fixture','pending')");
  expect(livePreflight({agentFile},{}).checks).toContainEqual(expect.objectContaining({id:'unresolved_spending',status:'blocked'}));
  expect(a.raw.prepare('SELECT status FROM obolus_reserved_operations').get()).toEqual({status:'pending'});
  a.raw.exec("UPDATE obolus_reserved_operations SET status='settled'; CREATE TABLE obolus_adapter_permissions(adapter TEXT,experiment_id TEXT,revoked INTEGER,expires_ms INTEGER,max_cost INTEGER); INSERT INTO revenue_opportunities(id,name,status) VALUES('o','fixture','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis) VALUES('e','o','running','fixture')");
  a.raw.prepare('INSERT INTO obolus_adapter_permissions VALUES(?,?,?,?,?)').run('fixture','e',0,Date.now()+60000,0);
  expect(livePreflight({agentFile},{}).checks).toContainEqual(expect.objectContaining({id:'adapter_permissions',status:'unverified'}));
  a.raw.exec('UPDATE obolus_adapter_permissions SET revoked=1');
  expect(livePreflight({agentFile},{}).checks).toContainEqual(expect.objectContaining({id:'adapter_permissions',status:'blocked'}));
  a.raw.exec('INSERT INTO inference_budget_policy(id,daily_cents,hourly_cents,session_cents,call_cents,halted) VALUES(1,100,50,25,5,1)');
  const stopped=livePreflight({agentFile},{});expect(stopped.checks).toContainEqual(expect.objectContaining({id:'inference_limits',status:'pass'}));
  expect(stopped.checks).toContainEqual(expect.objectContaining({id:'inference_stop',status:'blocked'}));
  expect(a.raw.prepare('SELECT halted FROM inference_budget_policy').get()).toEqual({halted:1});
  a.raw.exec('INSERT INTO schema_version(version) VALUES(999)');
  expect(livePreflight({agentFile},{}).checks).toContainEqual(expect.objectContaining({id:'agent_schema',status:'blocked'}));
  const missing=path.join(dir,'missing.db');livePreflight({agentFile:missing},{});expect(fs.existsSync(missing)).toBe(false);
 }finally{a.close();c.close();fs.rmSync(dir,{recursive:true,force:true});}
});

import {registerProductQuality,assessProductQuality,revokeProductQuality} from '../commerce/product-quality.js';
import {StripeCheckout} from '../commerce/stripe-checkout.js';
import {DigitalDelivery} from '../commerce/delivery.js';
it('inspects a private catalogue read-only and blocks changed or revoked product bytes without disclosure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-catalogue-preflight-')),file=path.join(dir,'commerce.db'),db=new Database(file);
 try{
  new StripeCheckout(db,{mode:'test',secretKey:'sk_test_fixture',webhookSecret:'whsec_synthetic_test',accountId:'acct_fixture'});
  const delivery=new DigitalDelivery(db);const bytes=Buffer.from('Private fixture instructions.');
  registerProductQuality(db,{productId:'private-product',format:'text',purpose:'Fixture',audience:'Fixture',minBytes:1,maxBytes:1000,requiredText:['instructions'],forbiddenText:[],requiredJsonKeys:[]});
  const checked=assessProductQuality(db,'private-product','guide.txt',bytes);delivery.register('private-product','guide.txt',bytes);
  const run=()=>livePreflight({commerceFile:file,operatingScope:'personal'},{});
  const before=fs.readFileSync(file);const report=run();expect(report.checks).toContainEqual(expect.objectContaining({id:'product_quality',status:'pass'}));expect(fs.readFileSync(file)).toEqual(before);
  expect(JSON.stringify(report)).not.toContain('private-product');expect(JSON.stringify(report)).not.toContain(bytes.toString());
  expect(report.checks.some(c=>c.id==='https_origin')).toBe(false);expect(report.liveReady).toBe(false);
  db.exec("UPDATE commerce_assets SET sha256='changed'");expect(run().checks).toContainEqual(expect.objectContaining({id:'product_quality',status:'blocked'}));
  db.prepare('UPDATE commerce_assets SET sha256=?').run(checked.contentDigest);revokeProductQuality(db,'private-product',checked.contentDigest,'Fixture defect');
  expect(run().checks).toContainEqual(expect.objectContaining({id:'product_quality',status:'blocked'}));
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('does not accept a test-mode catalogue with no contract and refuses a truncated catalogue scan',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-catalogue-bounds-')),file=path.join(dir,'commerce.db'),db=new Database(file);
 try{
  new StripeCheckout(db,{mode:'test',secretKey:'sk_test_fixture',webhookSecret:'whsec_synthetic_test',accountId:'acct_fixture'});const delivery=new DigitalDelivery(db);
  const run=()=>livePreflight({commerceFile:file},{}).checks.find(c=>c.id==='product_quality');
  expect(run()?.status).toBe('blocked');delivery.register('fixture','guide.txt',Buffer.from('Fixture'));
  expect(run()?.status).toBe('blocked');
  const insert=db.prepare('INSERT INTO commerce_assets VALUES(?,?,?,?)');for(let i=0;i<100;i++)insert.run('extra'+i,'guide.txt','fixture',Buffer.from('Fixture'));
  expect(run()?.detail).toContain('capacity');
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

import {registerBudgetPolicy} from '../inference/budget-policy.js';
it('reports positive but insufficient capital for the configured call ceiling without changing funds',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-call-capital-')),file=path.join(dir,'agent.db'),db=createDatabase(file);
 try{
  registerBudgetPolicy(db.raw,{daily_cents:100,hourly_cents:50,session_cents:25,call_cents:5,halted:0,revision:1});
  initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:4998,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  const before=db.raw.serialize();const report=livePreflight({agentFile:file},{});
  expect(report.checks).toContainEqual(expect.objectContaining({id:'capital_policy',status:'pass'}));
  expect(report.checks).toContainEqual(expect.objectContaining({id:'capital_call_capacity',status:'blocked'}));expect(db.raw.serialize()).toEqual(before);
  registerBudgetPolicy(db.raw,{daily_cents:100,hourly_cents:50,session_cents:25,call_cents:2,halted:0,revision:1});
  expect(livePreflight({agentFile:file},{}).checks).toContainEqual(expect.objectContaining({id:'capital_call_capacity',status:'pass'}));
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('detects enclosing budget contradictions independently of capital availability',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-call-consistency-')),file=path.join(dir,'agent.db'),db=createDatabase(file);
 try{
  registerBudgetPolicy(db.raw,{daily_cents:100,hourly_cents:50,session_cents:2,call_cents:5,halted:0,revision:1});
  const before=db.raw.serialize();const report=livePreflight({agentFile:file},{});
  expect(report.checks).toContainEqual(expect.objectContaining({id:'inference_limits',status:'pass'}));
  expect(report.checks).toContainEqual(expect.objectContaining({id:'inference_limit_consistency',status:'blocked'}));
  expect(report.checks).toContainEqual(expect.objectContaining({id:'capital_call_capacity',status:'blocked'}));
  expect(report.liveReady).toBe(false);expect(db.raw.serialize()).toEqual(before);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
