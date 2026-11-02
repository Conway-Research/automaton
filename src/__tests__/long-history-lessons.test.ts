import {it,expect} from 'vitest';import {deriveLessons,recordLessons,buildResearchContext} from '../revenue/long-history/lessons.js';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {openHistoryStore} from '../revenue/long-history/store.js';import {sourceCatalogue} from '../revenue/long-history/sources.js';
it('records failed strategy evidence with scope instead of declaring profitable knowledge',()=>{
 const report={id:'r',runId:'run',datasetId:'d',kind:'cash-paper',nativeCurrency:'USD',costStatus:'model' as const,metrics:{netPnlCents:-100},limitations:['fixture'],decision:'verworfen' as const,evidenceHashes:[],liveAuthorized:false as const};
 const [lesson]=deriveLessons(report,{version:14});expect(lesson.status).toBe('widerlegt');expect(lesson.sourceReportIds).toEqual(['r']);expect(lesson.contradictingEvidence).toEqual(['r']);expect(lesson.scope).toContain('d');expect(deriveLessons(report,{version:14})).toEqual([lesson]);
});
it('revisions supersede earlier lessons while keeping contradictory evidence',()=>{
 const d=mkdtempSync(join(tmpdir(),'history-lessons-')),s=openHistoryStore(d);try{
  const source={...sourceCatalogue()[0],licenseStatus:'allowed' as const,licenseEvidence:'fixture'};s.registerSource(source);const raw=Buffer.from('fixture');const data=s.putDataset({sourceId:source.id,rawSha256:createHash('sha256').update(raw).digest('hex'),revision:'1',normalizationVersion:'1',kind:source.kind,start:1,end:2,frequency:'fixture',unit:'decimal',currency:'USD',quality:{valid:true,issues:[]},limitations:[],provenance:'fixture'},raw);
  const base={id:'r1',runId:'run',datasetId:data.id,kind:'cash-paper',nativeCurrency:'USD',costStatus:'model' as const,metrics:{variantId:'momentum-10'},limitations:['fixture'],decision:'verworfen' as const,evidenceHashes:[],liveAuthorized:false as const};s.saveReport(base);const first=recordLessons(s,deriveLessons(base,{version:14}))[0];
  const next={...base,id:'r2',decision:'weiter untersuchen' as const};s.saveReport(next);const second=recordLessons(s,deriveLessons(next,{version:14}))[0];expect(second.version).toBe(2);expect(second.supersedes).toBe(first.id);expect(second.contradictingEvidence).toContain('r1');expect(recordLessons(s,deriveLessons(next,{version:14}))[0].version).toBe(2);
  const context=buildResearchContext(s,{version:14,literature:{fullTextsReviewed:2,publisherOverviewsReviewed:148,overviewIndex:[{id:'book',title:'Book',topic:'trend'}]}},{limit:20});expect(context.references?.[0].status).toBe('publisher-overview');expect(context.modelRetrained).toBe(false);
 }finally{s.close();rmSync(d,{recursive:true,force:true});}
});
it('gives macro findings a practical financing check without an intraday direction',()=>{
 const r={id:'macro',runId:'r',datasetId:'d',kind:'macro-history',nativeCurrency:'USD',costStatus:'unknown' as const,metrics:{minimumAnnualRatePercent:.01,maximumAnnualRatePercent:16.3},limitations:[],decision:'weiter untersuchen' as const,evidenceHashes:[],liveAuthorized:false as const};const l=deriveLessons(r,{})[0];expect(l.application?.horizon).toBe('macro');expect(l.application?.use).toMatch(/Finanzierung/);expect(l.application?.transferability).toBe('context-only');
});
