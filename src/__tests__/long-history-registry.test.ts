import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {openHistoryStore} from '../revenue/long-history/store.js';import {sourceCatalogue} from '../revenue/long-history/sources.js';
import {registerRun,phaseView,claimFinalEvaluation} from '../revenue/long-history/registry.js';
it('freezes rules and keeps final claims across run identifiers',()=>{
 const d=mkdtempSync(join(tmpdir(),'history-registry-')),s=openHistoryStore(d);try{
  s.registerSource({...sourceCatalogue()[0],licenseStatus:'allowed',licenseEvidence:'fixture'});const raw=Buffer.from('fixture');const data=s.putDataset({sourceId:'french-daily',rawSha256:createHash('sha256').update(raw).digest('hex'),revision:'1',normalizationVersion:'1',kind:'factor-returns',start:Date.UTC(1946,9,13),end:Date.UTC(2026,9,13),frequency:'daily',unit:'decimal',currency:'USD',quality:{valid:true,issues:[]},limitations:[],provenance:'fixture'},raw);
  const config={id:'r1',registeredAt:1,datasetIds:[data.id],variantIds:['v1'],rulesVersion:'v1',split:{developmentEnd:Date.UTC(1985,11,31),validationEnd:Date.UTC(2005,11,31),finalEnd:Date.UTC(2026,9,13)},costs:{},seed:1,limits:{},codeHash:'a'.repeat(64)};
  registerRun(s,config);expect(phaseView(s,'r1','development',data.id).end).toBe(config.split.developmentEnd);
  expect(()=>registerRun(s,{...config,seed:2})).toThrow(/immutable/i);
  expect(()=>registerRun(s,{...config,id:'many',variantIds:Array.from({length:25},(_,i)=>'v'+i)})).toThrow(/limit/i);
  expect(claimFinalEvaluation(s,'r1','v1',data.id).contaminated).toBe(false);
  registerRun(s,{...config,id:'r2'});expect(claimFinalEvaluation(s,'r2','v1',data.id).contaminated).toBe(true);
 }finally{s.close();rmSync(d,{recursive:true,force:true});}
});
