import {it,expect} from 'vitest';
import Database from 'better-sqlite3';
import {ResearchStore,type DemandEvidence} from '../revenue/research.js';
const now=Date.UTC(2026,9,6);
// Fixed synthetic comparison set. Labels describe source independence, not demand.
const cases=[
 {id:'independent',hosts:['a','b'],origins:['one','two'],texts:['request A','request B'],expected:2},
 {id:'syndicated',hosts:['a','b'],origins:['one','one'],texts:['request A','rephrased A'],expected:1},
 {id:'same-host',hosts:['a','a'],origins:['one','two'],texts:['request A','request B'],expected:1},
 {id:'verbatim',hosts:['a','b'],origins:['one','two'],texts:['same request','same request'],expected:1},
];
it.each(cases)('fixed provenance benchmark: $id',c=>{
 const db=new Database(':memory:');try{
  const store=new ResearchStore(db);
  const evidence:DemandEvidence[]=c.hosts.map((h,i)=>({id:`e${i}`,opportunityId:'o',sourceUrl:`https://${h}.example/record-${i}`,originUrl:`https://origin.example/${c.origins[i]}`,observedAt:new Date(now).toISOString(),kind:'request',excerpt:c.texts[i],provenance:'reported',reviewedBy:null}));
  store.import({opportunities:[{id:'o',title:'Synthetic opportunity',sector:'software',hypothesis:'Synthetic need',forecast:{revenueCents:0,costCents:0,probability:0,days:1,validationBudgetCents:0},forecastState:'unknown'}],evidence});
  for(const e of evidence)store.review(e.id,'fixture-reviewer','accept','Synthetic origin label');
  expect(store.rank(now)[0]).toMatchObject({independentSources:c.expected,decision:'hold',forecastNetCents:null});
  expect(store.rank(now+91*86400000)[0].independentSources).toBe(0);
  expect(()=>store.import({opportunities:[],evidence:[{...evidence[0],originUrl:'https://origin.example/changed'}]})).toThrow('immutable');
 }finally{db.close();}
});
it('rejects credential-bearing origin without persisting evidence',()=>{
 const db=new Database(':memory:');try{
 const store=new ResearchStore(db);
 expect(()=>store.import({opportunities:[],evidence:[{id:'e',opportunityId:'o',sourceUrl:'https://a.example/',originUrl:'https://user:pass@a.example/',observedAt:new Date(now).toISOString(),kind:'request',excerpt:'Synthetic',provenance:'synthetic',reviewedBy:null}]})).toThrow('origin');
 expect(store.evidence()).toEqual([]);
 }finally{db.close();}
});
