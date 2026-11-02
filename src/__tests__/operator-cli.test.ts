import {it,expect,vi} from 'vitest';
import {fixtureSecurityReview} from './fixtures/security-review.js';
import {adapterActionScope} from '../revenue/adapter-permissions.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {main} from '../v1/cli.js';
import {createDatabase} from '../state/database.js';
import Database from 'better-sqlite3';
import {StripeCheckout} from '../commerce/stripe-checkout.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';

it('requires explicit apply and an existing database for operator actions, persists grant and revoke',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-operator-')),file=path.join(dir,'agent.db'),input=path.join(dir,'permission.json');
 const db=createDatabase(file),output=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
 try{
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('o','fixture','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis) VALUES('e','o','running','fixture')");
  fs.writeFileSync(input,JSON.stringify({adapter:'local-product',experimentId:'e',maxCostUsdCents:0,expiresAt:Date.now()+60000,reviewedBy:'fixture operator'}));
  const args=['adapter-permission','--database',file,'--input',input,'--action','grant'];
  await expect(main(args)).rejects.toThrow('--apply');
  expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_adapter_permissions'").get()).toBeUndefined();
  await main([...args,'--apply']);
  expect(db.raw.prepare('SELECT revoked,max_cost FROM obolus_adapter_permissions').get()).toEqual({revoked:0,max_cost:0});
  await main(['adapter-permission','--database',file,'--input',input,'--action','revoke','--apply']);
  expect(db.raw.prepare('SELECT revoked FROM obolus_adapter_permissions').get()).toEqual({revoked:1});
  await expect(main(['product-register','--database',file])).rejects.toThrow('--apply');
  const missing=path.join(dir,'missing.db');
  await expect(main(['adapter-permission','--database',missing,'--input',input,'--action','grant','--apply'])).rejects.toThrow();
  expect(fs.existsSync(missing)).toBe(false);
  const commerceFile=path.join(dir,'commerce.db'),commerce=new Database(commerceFile);
  try {
    new StripeCheckout(commerce,{mode:'test',secretKey:'sk_test_fixture',webhookSecret:'whsec_synthetic_test',accountId:'acct_fixture'});
    db.raw.exec("UPDATE revenue_experiments SET max_budget_cents=100,max_duration_hours=1,success_criteria='success',failure_criteria='failure',stop_condition='stop',started_at=datetime('now')");
    initializeCapitalBudget(db.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
    registerBudgetPolicy(db.raw,{daily_cents:100,hourly_cents:100,session_cents:100,call_cents:100,halted:0,revision:1});
    await main([...args,'--apply']);
    fixtureSecurityReview(db.raw,adapterActionScope('local-product','e',0),Date.now());
    const manifest=path.join(dir,'product.json'),asset=path.join(dir,'product.txt');
    fs.writeFileSync(manifest,JSON.stringify({operationId:'op_cli',experimentId:'e',productId:'fixture',filename:'fixture.txt'}));
    fs.writeFileSync(asset,'synthetic CLI product');
    const productArgs=['product-register','--database',file,'--commerce-db',commerceFile,'--input',manifest,'--asset',asset,'--apply'];
    await main(productArgs);await main(productArgs);
    const recoveryArgs=['product-reconcile','--database',file,'--commerce-db',commerceFile,'--operation','op_cli'];
    await expect(main(recoveryArgs)).rejects.toThrow('--apply');
    await main([...recoveryArgs,'--apply']);
    expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_local_product_reconciliations').get()).toEqual({n:1});
    expect(commerce.prepare('SELECT COUNT(*) n FROM commerce_assets').get()).toEqual({n:1});
    expect(commerce.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
    expect(db.raw.prepare("SELECT status FROM obolus_reserved_operations WHERE id='op_cli'").get()).toEqual({status:'settled'});
    const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_register_local_product')!;
    const context={db} as ToolContext;
    const product={operation_id:'op_agent',experiment_id:'e',product_id:'agent-product',filename:'agent.txt',content:'synthetic agent product'};
    vi.stubEnv('OBOLUS_COMMERCE_DB','');
    await expect(tool.execute(product,context)).rejects.toThrow('configure');
    vi.stubEnv('OBOLUS_COMMERCE_DB',commerceFile);
    await expect(tool.execute({...product,filename:'../secret'},context)).rejects.toThrow('Invalid');
    await expect(tool.execute({...product,content:'x'.repeat(100001)},context)).rejects.toThrow('UTF-8');
    expect(JSON.parse(await tool.execute(product,context))).toMatchObject({duplicate:false,publication:'not performed'});
    expect(JSON.parse(await tool.execute(product,context))).toMatchObject({duplicate:true});
    await main(['adapter-permission','--database',file,'--input',input,'--action','revoke','--apply']);
    await expect(tool.execute({...product,operation_id:'op_revoked',product_id:'another'},context)).rejects.toThrow('permission');
    expect(commerce.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
  }finally{commerce.close();}
 }finally{vi.unstubAllEnvs();output.mockRestore();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
