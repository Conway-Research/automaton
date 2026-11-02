import {expect,it} from 'vitest';
import {assertNoPersonnelCostInputs} from '../revenue/personnel-cost-policy.js';
import {validateEconomicNumbers} from '../revenue/store.js';
import {ResearchStore} from '../revenue/research.js';
import Database from 'better-sqlite3';

it.each(['personnel_cost_cents','LABOUR-COST','Mitarbeiterkosten','Stundensatz','hourly_rate'])('rejects nested personnel key %s',key=>{
 expect(()=>validateEconomicNumbers({details:[{[key]:3500}]})).toThrow(/Personnel/);
});
it('rejects cost category aliases but leaves research prose and human minutes intact',()=>{
 expect(()=>assertNoPersonnelCostInputs({costs:[{category:'Personalkosten',cents:3500}]})).toThrow(/Personnel/);
 expect(()=>assertNoPersonnelCostInputs({excerpt:'Customers want payroll software',humanInterventionMinutes:120,costs:[{category:'infrastructure',cents:100}]})).not.toThrow();
});
it('rejects cycles without stack exhaustion',()=>{
 const input:Record<string,unknown>={};input.self=input;
 expect(()=>assertNoPersonnelCostInputs(input)).toThrow(/cyclic/);
});
it('rejects contaminated research before persisting any opportunity',()=>{
 const db=new Database(':memory:');try{
  const store=new ResearchStore(db);
  expect(()=>store.import({opportunities:[{forecast:{salaryCents:3500}}],evidence:[]} as never)).toThrow(/Personnel/);
  expect(db.prepare('SELECT COUNT(*) n FROM research_opportunities').get()).toEqual({n:0});
 }finally{db.close();}
});
