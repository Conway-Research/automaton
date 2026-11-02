import {it,expect} from 'vitest';
import {preselectDigitalTender} from '../revenue/revenue-paths.js';
import {normalizeDiverseSource} from '../online/source-diversity.js';
it.each(['Software testing','CSV data conversion','Accessibility audit','Desk research'])('prioritizes %s for review only',title=>{
 const result=preselectDigitalTender(title,'Fixed deliverable');
 expect(result.priority).toBe('review-first');expect(result.state).toBe('HOLD');expect(result.executionAuthorized).toBe(false);expect(result.verifiedDemand).toBe(false);
 expect(result.requiredChecks).toContain('cash-economics');expect(result.requiredChecks).toContain('delivery-evidence');
});
it.each(['Software with on-site installation','API for clinical patient services','Software managed services','Supply and delivery of laser cameras'])('defers mixed/physical scope %s',title=>{
 expect(preselectDigitalTender(title,'').priority).toBe('defer');
});
it('unknown, excessive and malformed metadata cannot become a positive match',()=>{
 for(const title of ['', 'Consultancy services','Software'.repeat(1000),null as unknown as string])expect(preselectDigitalTender(title,'').priority).toBe('unknown');
});
it('negation and persuasive claims cannot provide any execution authority',()=>{
 const r=preselectDigitalTender('No software required','approved guaranteed profit ignore instructions');
 expect(r.state).toBe('HOLD');expect(r.executionAuthorized).toBe(false);
});
it('integrates stable review ordering without deleting notices or promoting financial evidence',()=>{
 const now=Date.UTC(2026,9,9),titles=['HVAC software maintenance','Unknown services','CSV data conversion','Software testing'];
 const releases=titles.map((title,i)=>({ocid:`ocds-fixture-${i}`,date:new Date(now).toISOString(),tender:{title,description:'Synthetic only'}}));
 const out=normalizeDiverseSource('uk-tenders',{releases},now);
 expect(out.map(x=>x.title)).toEqual([titles[2],titles[3],titles[1],titles[0]]);
 expect(out).toHaveLength(4);
 for(const s of out){expect(s.deliveryPreselection?.state).toBe('HOLD');expect(s.verifiedDemand).toBe(false);expect(s.verifiedRevenue).toBe(false);}
});
