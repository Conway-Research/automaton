import {it,expect} from 'vitest';
import {inspectSearchResults,planBuyerSearches,searchRequest} from '../online/search-adapters.js';
const task={provider:'ted' as const,query:'data services',limit:5};
const now=Date.parse('2026-10-05T12:00:00Z');
const notice={'publication-number':'1234-2026','notice-title':{eng:['Synthetic notice']},'publication-date':'2026-10-01'};
it('distinguishes empty TED from rejected metadata without saving raw content',()=>{
 expect(inspectSearchResults(task,{notices:[]},now).state).toBe('UPSTREAM_EMPTY');
 const result=inspectSearchResults(task,{notices:[{'notice-title':'person@example.org'}]},now);
 expect(result.state).toBe('ALL_EXAMINED_REJECTED');expect(result.diagnostics.rejected).toBe(1);
 expect(JSON.stringify(result)).not.toContain('person@example.org');
 expect(()=>inspectSearchResults(task,{error:'upstream rejected'},now)).toThrow();
});
it('counts bounded processing and duplicate rejection exactly',()=>{
 const r=inspectSearchResults({...task,limit:2},{notices:[notice,notice,notice]},now);
 expect(r.diagnostics).toMatchObject({rawRecords:3,examined:2,beyondLimit:1,accepted:1,rejected:1});
});
it.each(['2026-02-30','2026-13-01','2026-10-06','unknown'])('does not turn invalid or future date %s into freshness evidence',date=>{
 const r=inspectSearchResults(task,{notices:[{...notice,'publication-date':date}]},now);
 expect(r.results[0].publishedAt).toBeNull();expect(r.diagnostics.missingOrInvalidDates).toBe(1);
});
it('preserves valid date, title and public-indicator uncertainty',()=>{
 expect(inspectSearchResults(task,{notices:[notice]},now).results[0]).toMatchObject({title:'Synthetic notice',publishedAt:'2026-10-01T00:00:00.000Z',trusted:false,evidence:'PUBLIC_INDICATOR'});
});
it('plans varied buyer-intent searches without imposing a sector or changing TED syntax',()=>{
 for(const topic of ['water monitoring','translation services','equipment maintenance']){
  expect(planBuyerSearches('exa',topic)).toHaveLength(3);
  const ted=planBuyerSearches('ted',topic);expect(ted[0].query).toBe(topic);
  expect(JSON.parse(searchRequest(ted[0]).body).query).toBe(`FT ~ "${topic}"`);
 }
 expect(()=>planBuyerSearches('exa','person@example.org')).toThrow();
 expect(()=>planBuyerSearches('ted','x'.repeat(201))).toThrow();
});
