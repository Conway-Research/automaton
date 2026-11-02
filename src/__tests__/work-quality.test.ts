import {it, expect} from 'vitest';
import {validateWorkCompletion, WORK_QUALITY_POLICY} from '../agent/work-quality.js';
import {normalizeTaskResult} from '../orchestration/task-graph.js';
import {QUALITY_AREAS} from '../commerce/quality-review.js';

it.each([null, [], {}, {summary:''}, {summary:' '}, {summary:'x',success:'false'},
  {summary:'x',success:1}, {summary:'x'.repeat(16001)}, {summary:'sk-'+'a'.repeat(24)}])
('rejects malformed or secret-bearing completion without echoing it', input => {
  expect(()=>validateWorkCompletion(input)).toThrow();
});
it('preserves explicit failure and legacy omitted boolean without accepting arbitrary truthy input',()=>{
  expect(validateWorkCompletion({summary:'blocked',success:false})).toEqual({summary:'blocked',success:false});
  expect(validateWorkCompletion({summary:'draft created'}).success).toBe(true);
});
it.each(['costCents','duration'] as const)('rejects invalid %s before task-history learning', key=>{
  for(const value of [NaN,Infinity,-1,'0',null])
    expect(normalizeTaskResult({success:true,output:'fixture',[key]:value})).toBeNull();
});
it('does not deserialize agent-invented quality approval as trusted evidence',()=>{
  const result=normalizeTaskResult({success:true,output:'draft',quality:{status:'APPROVED'},costCents:0,duration:1});
  expect(result?.success).toBe(true);
  expect(result?.quality?.status).toBe('UNVERIFIED');
  expect(normalizeTaskResult(JSON.parse(JSON.stringify(result)))?.quality?.status).toBe('UNVERIFIED');
});
it('covers all existing quality areas without promising profit or weakening budget boundaries',()=>{
  for(const area of QUALITY_AREAS)expect(WORK_QUALITY_POLICY).toContain(area);
  for(const domain of ['Research:', 'Data:', 'Trading:', 'Products, text and marketing:', 'Bug bounty'])
    expect(WORK_QUALITY_POLICY).toContain(domain);
  expect(WORK_QUALITY_POLICY).toContain('existing resource limits');
});
