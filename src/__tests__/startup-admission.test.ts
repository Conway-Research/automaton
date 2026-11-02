import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {assertPersonalStartup} from '../v1/startup-admission.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {isProtectedFile} from '../self-mod/code.js';

it('includes an explicitly configured research workspace in startup admission without modifying either database',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-startup-research-')),file=path.join(dir,'agent.db'),researchFile=path.join(dir,'research.db'),db=createDatabase(file),research=createDatabase(researchFile);
 try{
  const before=db.raw.serialize(),researchBefore=research.raw.serialize();
  expect(()=>assertPersonalStartup(file,researchFile)).toThrow('separate_research_integrity');
  expect(db.raw.serialize()).toEqual(before);expect(research.raw.serialize()).toEqual(researchBefore);
  research.raw.exec('CREATE TABLE research_evidence(id TEXT,opportunity_id TEXT,payload TEXT,digest TEXT)');
  research.raw.exec("INSERT INTO research_evidence VALUES('private-id','private-parent','private-content','invalid')");
  expect(()=>assertPersonalStartup(file,researchFile)).toThrow('separate_research_integrity');
  const missing=path.join(dir,'missing.db');
  expect(()=>assertPersonalStartup(file,missing)).toThrow('research_database');expect(fs.existsSync(missing)).toBe(false);
  expect(()=>assertPersonalStartup(file)).toThrow('autonomous_business_cycle');
 }finally{research.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it.each(['',' ',' padded.db','db\nname',null,5])('rejects invalid configured research paths without treating them as absent: %s',value=>{
 expect(()=>assertPersonalStartup('unused.db',value as string)).toThrow('Invalid configured research database path');
});

it('fails closed without modifying an existing database or creating a missing database',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-startup-')),file=path.join(dir,'db');
 const db=createDatabase(file);
 try{
  const before=db.raw.prepare('SELECT COUNT(*) n FROM schema_version').get();
  expect(()=>assertPersonalStartup(file)).toThrow('capital_policy');
  initializeCapitalBudget(db.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  registerBudgetPolicy(db.raw,{daily_cents:10,hourly_cents:10,session_cents:10,call_cents:1,halted:0,revision:1});
  expect(()=>assertPersonalStartup(file)).toThrow('autonomous_business_cycle');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM schema_version').get()).toEqual(before);
  const missing=path.join(dir,'absent.db');
  expect(()=>assertPersonalStartup(missing)).toThrow('agent_database');expect(fs.existsSync(missing)).toBe(false);
  expect(isProtectedFile('C:/project/src/v1/startup-admission.ts')).toBe(true);
  expect(isProtectedFile('C:/project/dist/v1/live-preflight.js')).toBe(true);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

it('propagates capital and enclosing-limit failures through the actual startup admission',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-startup-limits-')),file=path.join(dir,'db'),db=createDatabase(file);
 try{
  initializeCapitalBudget(db.raw,{capitalChfCents:5,reserveChfCents:4,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  registerBudgetPolicy(db.raw,{daily_cents:10,hourly_cents:10,session_cents:1,call_cents:2,halted:0,revision:1});const before=db.raw.serialize();
  expect(()=>assertPersonalStartup(file)).toThrow('inference_limit_consistency');expect(()=>assertPersonalStartup(file)).toThrow('capital_call_capacity');expect(db.raw.serialize()).toEqual(before);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('blocks orphaned optimization claims before any provider reservation exists',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-startup-claims-')),file=path.join(dir,'db'),db=createDatabase(file);
 try{
  db.raw.exec("CREATE TABLE obolus_optimization_attempts(session_id TEXT,status TEXT);CREATE TABLE obolus_optimization_budget_holds(session_id TEXT,actual_cents INTEGER);CREATE TABLE obolus_optimization_rollout_runs(id TEXT,status TEXT,actual_cents INTEGER)");
  for(const table of ['obolus_optimization_attempts','obolus_optimization_budget_holds','obolus_optimization_rollout_runs']){
   if(table==='obolus_optimization_attempts')db.raw.exec("INSERT INTO obolus_optimization_attempts VALUES('private-session','claimed')");
   if(table==='obolus_optimization_budget_holds')db.raw.exec("INSERT INTO obolus_optimization_budget_holds VALUES('private-session',NULL)");
   if(table==='obolus_optimization_rollout_runs')db.raw.exec("INSERT INTO obolus_optimization_rollout_runs VALUES('private-run','rejected',NULL)");
   const before=db.raw.serialize();expect(()=>assertPersonalStartup(file)).toThrow('unresolved_optimization');expect(db.raw.serialize()).toEqual(before);db.raw.exec('DELETE FROM '+table);
  }
  expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
