import {it,expect} from 'vitest';
import Database from 'better-sqlite3';
import {ResearchStore} from '../revenue/research.js';
import {researchAdmissionBlock} from '../revenue/research-admission.js';

// Model an already persisted legacy handoff. No worker or execution permission.
it.each([
 {name:'independent origins',origins:['https://origin.example/one','https://origin.example/two'],blocked:false},
 {name:'syndicated origin',origins:['https://origin.example/one','https://origin.example/one'],blocked:true},
 {name:'copy of the first source',origins:[undefined,'https://a.example/request'],blocked:true},
 {name:'legacy independent sources',origins:[undefined,undefined],blocked:false},
])('revalidates source independence in a persisted handoff: $name',({origins,blocked})=>{
 const db=new Database(':memory:');
 try{
  const store=new ResearchStore(db);
  store.import({opportunities:[{id:'o',title:'Synthetic',sector:'software',hypothesis:'Synthetic fixture',
   forecast:{revenueCents:1000,costCents:0,probability:1,days:1,validationBudgetCents:0}}],
   evidence:['a','b'].map((host,i)=>({id:`e${i}`,opportunityId:'o',sourceUrl:`https://${host}.example/request`,
    ...(origins[i]?{originUrl:origins[i]}:{}),observedAt:new Date().toISOString(),kind:'request' as const,
    excerpt:`Distinct synthetic wording ${i}`,provenance:'reported' as const,reviewedBy:null}))});
  for(const id of ['e0','e1'])store.review(id,'fixture','accept','Synthetic provenance review');
  db.exec(`CREATE TABLE obolus_research_experiments(research_id TEXT,experiment_id TEXT,snapshot TEXT);
   CREATE TABLE obolus_research_handoffs(research_id TEXT,opportunity_id TEXT);
   CREATE TABLE revenue_experiments(id TEXT,opportunity_id TEXT);
   INSERT INTO obolus_research_handoffs VALUES('o','op');
   INSERT INTO revenue_experiments VALUES('exp','op');`);
  const source=db.prepare('SELECT digest FROM research_opportunities WHERE id=?').get('o') as {digest:string};
  const reviews=db.prepare('SELECT id,evidence_id,evidence_digest FROM research_reviews').all();
  db.prepare('INSERT INTO obolus_research_experiments VALUES(?,?,?)').run('o','exp',JSON.stringify({sourceDigest:source.digest,reviews}));
  expect(store.rank()[0].decision).toBe(blocked?'hold':'validate');
  const before=db.prepare('SELECT total_changes() n').get();
  const result=researchAdmissionBlock(db,'exp');
  if(blocked)expect(result).toContain('Research evidence');else expect(result).toBeUndefined();
  expect(db.prepare('SELECT total_changes() n').get()).toEqual(before);
 }finally{db.close();}
});
