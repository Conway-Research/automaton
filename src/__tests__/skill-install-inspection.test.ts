import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {main} from '../v1/cli.js';
import {inspectSkillInstallations} from '../skills/install-inspection.js';

it('reports pending installations without leaking document content or changing files',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-install-status-'));
 try{
  const skills=path.join(root,'skills');fs.mkdirSync(skills);
  for(const name of ['intact','changed']){const dir=path.join(skills,name);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'SKILL.md'),name==='intact'?'PRIVATE_FIXTURE':'changed');fs.writeFileSync(path.join(dir,'.install-pending.json'),JSON.stringify({version:1,name,source:'url',sha256:createHash('sha256').update('PRIVATE_FIXTURE').digest('hex')}));}
  const snapshot=()=>['intact','changed'].flatMap(name=>['SKILL.md','.install-pending.json'].map(file=>fs.readFileSync(path.join(skills,name,file),'utf8')));
  const before=snapshot(),output=path.join(root,'report.json'),stdout=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
  try{await main(['skill-install-status','--skills-dir',skills,'--output',output]);}finally{stdout.mockRestore();}
  const text=fs.readFileSync(output,'utf8'),report=JSON.parse(text);
  expect(report).toMatchObject({mode:'read-only',complete:true,checked:2,requiresReview:true,executionAuthorized:false});
  expect(report.issues.map((x:any)=>x.status).sort()).toEqual(['pending_document_intact','pending_inconsistent']);
  expect(text).not.toContain('PRIVATE_FIXTURE');expect(snapshot()).toEqual(before);
  await expect(main(['skill-install-status','--skills-dir',skills,'--apply'])).rejects.toThrow('read-only');
  expect(()=>inspectSkillInstallations(path.join(root,'missing'))).toThrow();expect(fs.existsSync(path.join(root,'missing'))).toBe(false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

it('reports truncation instead of implying a complete inspection',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-install-limit-'));
 try{for(let i=0;i<1001;i++)fs.writeFileSync(path.join(root,String(i)),'');
  expect(inspectSkillInstallations(root)).toMatchObject({checked:1000,complete:false,requiresReview:true});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
