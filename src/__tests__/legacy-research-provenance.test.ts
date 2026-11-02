import {it,expect} from 'vitest';
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {ResearchStore} from '../revenue/research.js';
import {researchEconomicVersionBlock} from '../revenue/research-admission.js';

it.each(['preserved','missing','changed'] as const)('checks legacy revision provenance without rewriting it: %s',mode=>{
 const db=new Database(':memory:');
 try{
  const store=new ResearchStore(db),origin='https://original.example/request';
  const opportunity=(id:string)=>({id,title:'Synthetic',sector:'software' as const,hypothesis:'Fixture only',
   forecast:{revenueCents:1000,costCents:0,probability:1,days:1,validationBudgetCents:0}});
  const childId=`econev-${createHash('sha256').update('revisione0').digest('hex').slice(0,40)}`;
  store.import({opportunities:[opportunity('root'),opportunity('revision')],evidence:[
   {id:'e0',opportunityId:'root',sourceUrl:'https://copy.example/request',originUrl:origin,observedAt:new Date().toISOString(),kind:'request',excerpt:'Fixture source',provenance:'reported',reviewedBy:null},
   {id:childId,opportunityId:'revision',sourceUrl:'https://copy.example/request',...(mode==='missing'?{}:{originUrl:mode==='changed'?'https://other.example/request':origin}),observedAt:new Date().toISOString(),kind:'request',excerpt:'Fixture source',provenance:'reported',reviewedBy:null},
  ]});
  db.exec("CREATE TABLE research_economic_revisions(id TEXT,root_id TEXT,previous_id TEXT); INSERT INTO research_economic_revisions VALUES('revision','root','root')");
  const before=db.prepare('SELECT total_changes() n').get();
  const result=researchEconomicVersionBlock(db,'revision');
  if(mode==='preserved')expect(result).toBeUndefined();else expect(result).toContain('provenance');
  expect(db.prepare('SELECT total_changes() n').get()).toEqual(before);
 }finally{db.close();}
});

it.each(['valid','missing-root','missing-intermediate','changed-payload','wrong-root','cycle','too-deep'] as const)(
 'validates the complete immutable economic lineage: %s',mode=>{
 const db=new Database(':memory:');
 try{
  const store=new ResearchStore(db);
  const count=mode==='too-deep'?9:8;
  store.import({opportunities:Array.from({length:count+1},(_,i)=>({id:`v${i}`,title:'Synthetic',sector:'software' as const,
   hypothesis:'Lineage integrity fixture',forecast:{revenueCents:1000,costCents:0,probability:1,days:1,validationBudgetCents:0}})),evidence:[]});
  db.exec('CREATE TABLE research_economic_revisions(id TEXT PRIMARY KEY,root_id TEXT,previous_id TEXT)');
  for(let i=1;i<=count;i++)db.prepare('INSERT INTO research_economic_revisions VALUES(?,?,?)').run(`v${i}`,'v0',`v${i-1}`);
  if(mode==='missing-root')db.prepare('DELETE FROM research_opportunities WHERE id=?').run('v0');
  if(mode==='missing-intermediate')db.prepare('DELETE FROM research_economic_revisions WHERE id=?').run('v4');
  if(mode==='changed-payload')db.prepare("UPDATE research_opportunities SET payload='{}' WHERE id=?").run('v4');
  if(mode==='wrong-root')db.prepare('UPDATE research_economic_revisions SET root_id=? WHERE id=?').run('different-root','v4');
  if(mode==='cycle')db.prepare('UPDATE research_economic_revisions SET previous_id=? WHERE id=?').run('v5','v4');
  const before=db.prepare('SELECT total_changes() n').get();
  const result=researchEconomicVersionBlock(db,`v${count}`);
  if(mode==='valid')expect(result).toBeUndefined();else expect(result).toBeDefined();
  expect(db.prepare('SELECT total_changes() n').get()).toEqual(before);
 }finally{db.close();}
});
