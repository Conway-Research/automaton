import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createUgigOfficeGenerator} from './founder-ugig-office.mjs';
import {createBinaryArtifactStore,binaryManifestFiles} from './founder-binary-artifacts.mjs';
import {validMixedTextFiles} from './founder-ugig-mixed-package.mjs';
const python=process.env.NUMARON_OFFICE_TEST_PYTHON;
assert(python,'Explicit isolated-test Python path required');
function fixture(){return {spec:{workKind:'document-cleanup',privacy:'public',customerApproved:true,sourceBlocks:[{id:'one',text:'Original Ä'}],sections:[{heading:'Titel',blockIds:['one']}]},reference:{paragraphs:['Titel','Original Ä']}};}
function setup(overrides={}){const base=fs.mkdtempSync(path.join(os.tmpdir(),'ugig-office-test-'));const state={on:true,allowed:true,calls:0};const generator=createUgigOfficeGenerator({base,python,isEnabled:()=>state.on,authorize:async()=>{state.calls++;return state.allowed;},...overrides});return {base,state,generator,close:()=>fs.rmSync(base,{recursive:true,force:true})};}
test('real Office generation imports validated bytes and builds existing mixed package without grants',async()=>{const s=setup();try{const {spec,reference}=fixture();const p=await s.generator.generate({spec,reference});assert.equal(p.technicalReport.technicalPassed,true);assert.equal(p.technicalReport.independentlyVerified,false);assert.equal(p.deliveryReady,false);assert.equal(p.grant,undefined);assert(validMixedTextFiles(p));const bytes=createBinaryArtifactStore({base:s.base,isEnabled:()=>true}).read(p.binaryArtifacts[0]);assert(bytes.length>1000);assert.equal(binaryManifestFiles({...p,deliveryProtocol:'mixed-files-v1'}).length,p.files.length+1);assert(s.state.calls>=2);}finally{s.close();}});
for(const fault of ['off','permission','confidential','consent','reference'])test('generation blocks '+fault+' before import',async()=>{const s=setup();try{const f=fixture();if(fault==='off')s.state.on=false;if(fault==='permission')s.state.allowed=false;if(fault==='confidential')f.spec.privacy='confidential';if(fault==='consent')f.spec.customerApproved=false;if(fault==='reference')f.reference.paragraphs=['wrong'];await assert.rejects(s.generator.generate(f));assert(!fs.existsSync(path.join(s.base,'artifacts/founder-autonomy-20261013/binary-artifacts')));}finally{s.close();}});
test('authority lost during rendering blocks import',async()=>{let checks=0;const s=setup({authorize:async()=>++checks===1});try{await assert.rejects(s.generator.generate(fixture()));assert(!fs.existsSync(path.join(s.base,'artifacts/founder-autonomy-20261013/binary-artifacts')));}finally{s.close();}});
test('caller mutation cannot change frozen generation input',async()=>{const f=fixture();const s=setup({authorize:async()=>{f.spec.sections[0].heading='changed';return true;}});try{const p=await s.generator.generate(f);assert(p.files.find(x=>x.path==='delivery.md').content.startsWith('Titel'));}finally{s.close();}});
for(const kind of ['support-templates','research-report','xlsx-automation'])test('complete mixed package for '+kind,async()=>{
 const s=setup();try{
  const code='import sys,json;sys.path.insert(0,sys.argv[1]);from test_ugig_office import fixture;s,r=fixture(sys.argv[2]);print(json.dumps({"spec":s,"reference":r}))';
  const f=JSON.parse(execFileSync(python,['-I','-c',code,path.resolve('scripts'),kind],{encoding:'utf8',windowsHide:true}));
  const p=await s.generator.generate(f);assert(validMixedTextFiles(p));assert.equal(p.binaryArtifacts.length,1);
  if(kind==='xlsx-automation'){
   const dir=path.join(s.base,'delivered');fs.mkdirSync(dir);for(const file of p.files)fs.writeFileSync(path.join(dir,file.path),file.content);
   fs.mkdirSync(path.join(dir,'inputs'));fs.mkdirSync(path.join(dir,'result'));
   const original=Buffer.from(f.spec.workbooks[0].data,'base64');fs.writeFileSync(path.join(dir,'inputs/input.xlsx'),original);
   // Actual delivered Windows starter; synthetic files only, no shell interpolation.
   execFileSync(path.join(process.env.SYSTEMROOT,'System32/cmd.exe'),['/d','/c','run.bat'],{cwd:dir,windowsHide:true,timeout:30000,env:{SYSTEMROOT:process.env.SYSTEMROOT,PATH:path.dirname(python),TEMP:dir,TMP:dir}});
   assert.deepEqual(fs.readFileSync(path.join(dir,'inputs/input.xlsx')),original);
   assert.equal(fs.readFileSync(path.join(dir,'result/delivery.csv'),'utf8'),p.files.find(f=>f.path==='delivery.csv').content);
  }
 }finally{s.close();}
});

test('Python preflight and Node delivery count identical UTF-8 JSON bytes',()=>{
 const files=Array.from({length:40},(_,i)=>({path:`file-${i}.md`,content:'Ä 😀 \\ " \r\n\t \u2028'.repeat(i+1)}));
 const code="import sys,json; sys.path.insert(0,sys.argv[1]); from ugig_office import mixed_text_bytes; rows=json.loads(sys.stdin.buffer.read().decode('utf-8')); print(mixed_text_bytes({r['path']:r['content'] for r in rows}))";
 const actual=Number(execFileSync(python,['-I','-c',code,path.resolve('scripts')],{input:JSON.stringify(files),encoding:'utf8',windowsHide:true}));assert.equal(actual,Buffer.byteLength(JSON.stringify(files)));assert(validMixedTextFiles({files,binaryArtifacts:[]}));
});
