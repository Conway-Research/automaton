import {it,expect} from 'vitest';
import {normalizeFrenchCsv,normalizeCashBars,assessQuality,coverage} from '../revenue/long-history/normalize.js';
import {sourceCatalogue} from '../revenue/long-history/sources.js';
const csv=(rows:string)=>Buffer.from('Research description\n,Mkt-RF,SMB,HML,RF\n'+rows+'\n\nAnnual Factors\n1946,9,8,7,6');
it('converts declared percent returns, not annual footer, into decimal market returns',()=>{
 const s=normalizeFrenchCsv(csv('19461014,1,2,3,0.2\n19461015,-2,2,3,0.2'),sourceCatalogue()[0]);
 expect(s.kind).toBe('factor-returns');expect(s.rows).toHaveLength(2);expect(s.rows[0].returnDecimals).toBeCloseTo(.012);expect(s.rows[1].returnDecimals).toBeCloseTo(-.018);expect(s.rows[0].date).toBe(Date.UTC(1946,9,14));
});
it('preserves missing-value information and refuses unordered or invalid dates',()=>{
 const s=normalizeFrenchCsv(csv('19461014,-99.99,2,3,0.2\n19461015,1,2,3,0.2'),sourceCatalogue()[0]);expect(s.rows).toHaveLength(1);expect(s.limitations.join(' ')).toMatch(/fehl/i);
 expect(()=>normalizeFrenchCsv(csv('19461015,1,2,3,0.2\n19461014,1,2,3,0.2'),sourceCatalogue()[0])).toThrow();
 expect(()=>normalizeFrenchCsv(csv('19460231,1,2,3,0.2'),sourceCatalogue()[0])).toThrow();
});
it('never converts a CFD into cash prices or repairs invalid OHLC',()=>{
 const bars=[{time:Date.UTC(2020,0,1),open:100,high:110,low:90,close:105}];
 expect(()=>normalizeCashBars(bars,{productType:'cfd',symbol:'X',currency:'USD',productEvidence:'fixture',adjustmentEvidence:'fixture'})).toThrow();
 const s=normalizeCashBars(bars,{productType:'cash',symbol:'X',currency:'USD',productEvidence:'fixture',adjustmentEvidence:'fixture'});expect(assessQuality(s).valid).toBe(true);
 expect(()=>normalizeCashBars([{...bars[0],high:95}],{productType:'cash',symbol:'X',currency:'USD',productEvidence:'fixture',adjustmentEvidence:'fixture'})).toThrow();
});
it('reports actual coverage rather than inventing the requested 80 years',()=>{
 const r=coverage([{kind:'cash-ohlc',start:Date.UTC(2020,0,1),end:Date.UTC(2025,0,1),frequency:'daily',quality:{valid:true,issues:[]}}],Date.UTC(1946,9,13),Date.UTC(2026,9,13));expect(r[0].startsLate).toBe(true);expect(r[0].endsEarly).toBe(true);
});
it('flags calendar gaps and missing values without silently repairing them',()=>{
 const s=normalizeFrenchCsv(csv('19461014,1,2,3,0.2\n19461115,1,2,3,0.2'),sourceCatalogue()[0]);const q=assessQuality(s);expect(q.warnings?.join(' ')).toMatch(/Kalender|Lücke/);expect(q.complete).toBe(false);
});
it('rejects corrupt rows inside the daily section instead of truncating history',()=>{expect(()=>normalizeFrenchCsv(csv('19461014,1,2,3,0.2\nbroken,1,2,3,0.2\n19461015,1,2,3,0.2'),sourceCatalogue()[0])).toThrow();});
