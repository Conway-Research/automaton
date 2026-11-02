import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createDatabase} from '../state/database.js';
import {rehearseSetup} from '../v1/setup-rehearsal.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {reserveInferenceCost} from '../inference/reservations.js';
import {main} from '../v1/cli.js';

const proposal=()=>({capital:{capitalChfCents:5000,reserveChfCents:4000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000},inference:{dailyCents:100,hourlyCents:50,sessionCents:25,callCents:5}});
function fixture(run:(file:string,db:ReturnType<typeof createDatabase>)=>void){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-setup-rehearsal-')),file=path.join(dir,'test.db'),db=createDatabase(file);
 try{run(file,db);}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
it('rehearses on an in-memory snapshot including WAL liabilities without modifying the source',()=>fixture((file,db)=>{
 db.raw.transaction(()=>reserveInferenceCost(db.raw,'private-session',undefined,'mock',80)).immediate();
 const before=db.raw.serialize();
 const result=rehearseSetup(file,proposal());
 expect(result).toMatchObject({mode:'isolated-setup-rehearsal',productionChanged:false,capitalVerified:false,fxVerified:false,liveReady:false,blocked:true,blockers:['unresolved_inference_reservations'],unresolvedInferenceCents:80,projectedCapital:{allowed:true,remainingChfCents:920},callCeilingFitsCapital:true});
 expect(JSON.stringify(result)).not.toContain('private-session');
 expect(db.raw.serialize()).toEqual(before);
 expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='aureus_capital_policy'").get()).toBeUndefined();
}));
it('preserves a prior halt and tighter shared limits in the isolated proposal',()=>fixture((file,db)=>{
 registerBudgetPolicy(db.raw,{daily_cents:20,hourly_cents:10,session_cents:8,call_cents:2,halted:1,revision:1});
 const before=db.raw.serialize();
 const result=rehearseSetup(file,proposal());
 expect(result).toMatchObject({blocked:true,effectiveInference:{daily_cents:20,hourly_cents:10,session_cents:8,call_cents:2,halted:1}});
 expect(db.raw.serialize()).toEqual(before);
}));
it('does not hide exhausted capital or change immutable capital policy',()=>fixture((file,db)=>{
 const input=proposal();initializeCapitalBudget(db.raw,input.capital);
 db.raw.transaction(()=>reserveInferenceCost(db.raw,'held',undefined,'mock',1001)).immediate();
 const before=db.raw.serialize();
 expect(rehearseSetup(file,input)).toMatchObject({blocked:true,projectedCapital:{allowed:false,remainingChfCents:0},callCeilingFitsCapital:false});
 expect(()=>rehearseSetup(file,{...input,capital:{...input.capital,capitalChfCents:10000}})).toThrow('conflicts');
 expect(db.raw.serialize()).toEqual(before);
}));
it('rejects malformed proposals and incompatible databases without repairs or leaked contents',()=>fixture((file,db)=>{
 for(const n of [0,-1,0.5,Infinity,NaN])expect(()=>rehearseSetup(file,{...proposal(),inference:{...proposal().inference,callCents:n}})).toThrow('positive bounded');
 expect(()=>rehearseSetup(file,{...proposal(),capital:{...proposal().capital,quoteExpiresAt:1}})).toThrow('Proposal invalid');
 db.raw.exec('INSERT INTO schema_version(version) VALUES(999)');
 const before=db.raw.serialize();
 expect(()=>rehearseSetup(file,proposal())).toThrow('compatible database');
 expect(db.raw.serialize()).toEqual(before);
 const missing=path.join(path.dirname(file),'missing.db');
 expect(()=>rehearseSetup(missing,proposal())).toThrow('compatible database');
 expect(fs.existsSync(missing)).toBe(false);
}));
it('refuses a production apply flag before reading files',async()=>{
 await expect(main(['setup-rehearse','--database','unused','--input','unused','--apply'])).rejects.toThrow('not supported');
});
it('runs the CLI rehearsal without exposing malformed JSON or overwriting a report',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-setup-cli-')),file=path.join(dir,'test.db'),input=path.join(dir,'proposal.json'),output=path.join(dir,'report.json'),db=createDatabase(file);
 const stdout=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
 try{
  fs.writeFileSync(input,'{"private-marker": invalid}');
  await expect(main(['setup-rehearse','--database',file,'--input',input,'--output',output])).rejects.toThrow('Invalid bounded setup proposal JSON');
  expect(stdout).not.toHaveBeenCalled();expect(fs.existsSync(output)).toBe(false);
  fs.writeFileSync(input,JSON.stringify(proposal()));
  await main(['setup-rehearse','--database',file,'--input',input,'--output',output]);
  const before=fs.readFileSync(output,'utf8');
  expect(JSON.parse(before)).toMatchObject({productionChanged:false,capitalVerified:false,liveReady:false});
  await expect(main(['setup-rehearse','--database',file,'--input',input,'--output',output])).rejects.toThrow();
  expect(fs.readFileSync(output,'utf8')).toBe(before);
  expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='aureus_capital_policy'").get()).toBeUndefined();
 }finally{stdout.mockRestore();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

it('blocks a proposal whose maximum call cannot fit remaining capital despite positive headroom',()=>fixture((file,db)=>{
 const input=proposal();input.capital.reserveChfCents=4998;const before=db.raw.serialize();
 expect(rehearseSetup(file,input)).toMatchObject({blocked:true,blockers:['call_ceiling_exceeds_available_capital'],projectedCapital:{allowed:true,remainingChfCents:2},callCeilingFitsCapital:false});
 expect(db.raw.serialize()).toEqual(before);
}));
it('preserves explicit zero limits and diagnoses a call ceiling larger than an enclosing limit',()=>fixture((file,db)=>{
 registerBudgetPolicy(db.raw,{daily_cents:100,hourly_cents:50,session_cents:0,call_cents:5,halted:0,revision:1});const before=db.raw.serialize();
 const result=rehearseSetup(file,proposal());expect(result.blocked).toBe(true);
 expect(result.blockers).toEqual(expect.arrayContaining(['effective_inference_limit_not_positive','call_ceiling_exceeds_enclosing_limit']));expect(result.effectiveInference.session_cents).toBe(0);expect(db.raw.serialize()).toEqual(before);
}));
it('does not treat unresolved zero-cent reservations as a clean setup',()=>fixture((file,db)=>{
 db.raw.transaction(()=>reserveInferenceCost(db.raw,'private-zero',undefined,'mock',0)).immediate();
 const before=db.raw.serialize();const result=rehearseSetup(file,proposal());
 expect(result).toMatchObject({blocked:true,unresolvedInferenceCount:1,unresolvedInferenceCents:0,blockers:['unresolved_inference_reservations']});expect(JSON.stringify(result)).not.toContain('private-zero');expect(db.raw.serialize()).toEqual(before);
}));
it('keeps an internally consistent empty-ledger rehearsal non-blocked without granting live authority',()=>fixture((file)=>{
 expect(rehearseSetup(file,proposal())).toMatchObject({blocked:false,blockers:[],startsAgent:false,liveReady:false,capitalVerified:false,fxVerified:false});
}));
