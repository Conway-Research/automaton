import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {initializeCapitalBudget,renewCapitalQuote,checkCapitalBudget,reserveCapitalCommitment} from '../revenue/capital-budget.js';
import {main} from '../v1/cli.js';
import {RevenueStore} from '../revenue/store.js';
let dir:string,a:ReturnType<typeof createDatabase>,b:ReturnType<typeof createDatabase>;
const now=1800000000000;
const quote=(id='q1')=>({id,chfPerUsdNumerator:1,chfPerUsdDenominator:1,observedAt:now+2000,expiresAt:now+60000,source:'synthetic fixture only',reviewedBy:'test operator'});
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(now);dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-quote-'));a=createDatabase(path.join(dir,'test.db'));b=createDatabase(path.join(dir,'test.db'));
 initializeCapitalBudget(a.raw,{capitalChfCents:5000,reserveChfCents:1000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:now+1000});
 reserveCapitalCommitment(a.raw,'existing','synthetic outstanding cost',3000);vi.mocked(Date.now).mockReturnValue(now+2000);});
afterEach(()=>{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});vi.restoreAllMocks();});
it('renews expired policy atomically across two connections without resetting commitments',()=>{
 expect(checkCapitalBudget(b.raw,0).allowed).toBe(false);renewCapitalQuote(a.raw,quote());
 expect(checkCapitalBudget(b.raw,1000).allowed).toBe(true);expect(checkCapitalBudget(b.raw,1001).allowed).toBe(false);
 expect(renewCapitalQuote(b.raw,quote()).duplicate).toBe(true);
 a.close();a=createDatabase(path.join(dir,'test.db'));expect(renewCapitalQuote(a.raw,quote()).duplicate).toBe(true);
 expect(()=>renewCapitalQuote(b.raw,{...quote(),chfPerUsdNumerator:2})).toThrow('Conflicting');
});
it('never releases capital from a cheaper rate and tightens admission at a higher rate',()=>{
 const lower=renewCapitalQuote(a.raw,{...quote(),chfPerUsdDenominator:2});expect(lower.appliedPolicy.chfPerUsdDenominator).toBe(1);
 vi.mocked(Date.now).mockReturnValue(now+3000);
 renewCapitalQuote(b.raw,{...quote('q2'),observedAt:now+3000,chfPerUsdNumerator:2});
 expect(checkCapitalBudget(a.raw,0).allowed).toBe(false);
 expect(a.raw.prepare('SELECT COUNT(*) n FROM aureus_capital_commitments').get()).toEqual({n:1});
});
it('rejects stale, future, unreviewed and overly long quotes',()=>{
 for(const q of [{...quote(),source:''},{...quote(),observedAt:now+4000},{...quote(),expiresAt:now+86400001+2000},{...quote(),expiresAt:now+2000}])expect(()=>renewCapitalQuote(a.raw,q)).toThrow();
 renewCapitalQuote(a.raw,quote());expect(()=>renewCapitalQuote(b.raw,{...quote('q2'),observedAt:now+1999})).toThrow('Stale');
});
it('rolls back the audit record and preserves the blocked policy if updating fails',()=>{
 a.raw.exec("CREATE TRIGGER reject_quote BEFORE UPDATE ON aureus_capital_policy BEGIN SELECT RAISE(ABORT,'fixture'); END");
 expect(()=>renewCapitalQuote(a.raw,quote())).toThrow('fixture');expect(checkCapitalBudget(b.raw,0).allowed).toBe(false);
 a.raw.exec('DROP TRIGGER reject_quote');expect(renewCapitalQuote(b.raw,quote()).duplicate).toBe(false);
});
it('provides an explicit operator CLI using only the supplied existing database',async()=>{
 const input=path.join(dir,'quote.json');fs.writeFileSync(input,JSON.stringify(quote()));
 const output=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
 await expect(main(['capital-quote','--database',path.join(dir,'test.db'),'--input',input])).rejects.toThrow('--apply');
 await main(['capital-quote','--database',path.join(dir,'test.db'),'--input',input,'--apply']);
 expect(output).toHaveBeenCalled();expect(checkCapitalBudget(b.raw,1001).allowed).toBe(false);expect(checkCapitalBudget(b.raw,1000).allowed).toBe(true);
 const missing=path.join(dir,'missing.db');await expect(main(['capital-quote','--database',missing,'--input',input,'--apply'])).rejects.toThrow();expect(fs.existsSync(missing)).toBe(false);
});
it('upgrades V15 without retroactively inventing baselines and persists new ones across connections and restart',()=>{
 a.raw.exec("DROP TRIGGER experiment_baseline_insert; DROP TRIGGER experiment_baseline_start; DROP TRIGGER experiment_baseline_no_update; DROP TRIGGER experiment_baseline_no_delete; DROP TABLE revenue_experiment_baselines; DELETE FROM schema_version WHERE version>=16;");
 a.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('legacy-op','Legacy','validating'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,forecast_revenue_cents) VALUES('old','legacy-op','running','old assumption',123),('planned','legacy-op','planned','new assumption',456);");
 a.close();a=createDatabase(path.join(dir,'test.db'));
 const store=new RevenueStore(a.raw);
 expect(store.getExperimentBaseline('old')).toBeNull();
 expect(store.getForecastVsActual('old')).toMatchObject({forecastBasis:'legacy-current-values',forecastRevenueCents:123});
 store.transitionExperimentStatus('planned','running');
 expect(new RevenueStore(b.raw).getExperimentBaseline('planned')?.forecastRevenueCents).toBe(456);
 a.close();a=createDatabase(path.join(dir,'test.db'));
 expect(new RevenueStore(a.raw).getExperimentBaseline('planned')?.forecastRevenueCents).toBe(456);
});
