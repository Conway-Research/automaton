import {it,expect,vi} from 'vitest';
import {evaluateLocalLanguage,LANGUAGE_CASES} from '../commerce/language-evaluation.js';
it('counts unavailable checks separately and never contacts an unconfigured provider',async()=>{
 const provider=vi.fn();const report=await evaluateLocalLanguage(undefined,provider);
 expect(provider).not.toHaveBeenCalled();expect(report.cases.every(c=>c.outcome==='unavailable')).toBe(true);
 expect(report.allCasesMatched).toBe(false);expect(report.releaseAuthorized).toBe(false);
});
it('distinguishes missed errors, unrelated findings and false positives without promoting a product',async()=>{
 const provider=vi.fn(async(_url:unknown,options:any)=>{
  const text=options.body.get('text');const sample=LANGUAGE_CASES.find(c=>c.text===text)!;
  const offset=sample.error===null?0:text.indexOf(sample.error);
  const matches=sample.id==='en-install'?[]:[{offset:sample.id==='de-install'?0:offset,length:1,rule:{id:'FIXTURE'},replacements:[]}];
  return new Response(JSON.stringify({matches}));
 });
 const report=await evaluateLocalLanguage('http://127.0.0.1:8081/v2/check',provider);
 expect(report.cases.find(c=>c.id==='de-install')?.outcome).toBe('missed');
 expect(report.cases.find(c=>c.id==='en-install')?.outcome).toBe('missed');
 expect(report.byLanguage.reduce((sum,row)=>sum+row.falsePositives,0)).toBe(6);
 expect(report.corpusDigest).toMatch(/^[a-f0-9]{64}$/);expect(report.releaseAuthorized).toBe(false);
});
