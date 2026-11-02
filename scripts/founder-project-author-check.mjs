/** Offline controller integration check, explicitly NOT autonomous-model proof.
 * No local model exists here. The scripted double exercises only control flow;
 * candidate execution, failure feedback and archive checking use real containers.
 */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {openProjectAuthor} from './founder-project-author.mjs';
import {createProjectBlackBoxVerifier} from './founder-project-blackbox.mjs';
import {createProfileSandbox} from './founder-profile-sandbox.mjs';
import {boundedProcess} from './founder-code-sandbox.mjs';

export async function checkProjectAuthor(output){
 const sourcePaths=['founder-project-author.mjs','founder-project-author-contract.mjs','founder-project-blackbox.mjs','founder-project-package.mjs','founder-project-task.mjs','founder-project-author-check.mjs','founder-profile-sandbox.mjs','founder-work-profiles.mjs','founder-code-sandbox.mjs','founder-restoration-integrity.mjs'].map(name=>new URL(name,import.meta.url));
 const sourceHashes=Object.fromEntries(sourcePaths.map(url=>[fileURLToPath(url),createHash('sha256').update(fs.readFileSync(url)).digest('hex')]));
 fs.mkdirSync(output,{recursive:true});const directory=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-author-check-'));
 const scope={id:'controller-fixture',profileId:'python',privacy:'synthetic',requirements:[{id:'R1',text:'Sum signed integer minor amounts; include negative adjustments.'},{id:'R2',text:'Deduplicate equal id+amount rows. Different amounts for one id return duplicate-conflict.'},{id:'R3',text:'Reject noninteger or boolean amounts as invalid-row. Return total and unique count.'},{id:'R4',text:'Provide a JSON stdin/stdout CLI and README; no dependencies or network.'}],deliverables:['ledger.py','cli.py','README.md']};
 const cases=[{id:'negative-adjustment',input:{rows:[{id:'a',amount:12},{id:'b',amount:-5}]},expected:{total:7,count:2}},{id:'exact-duplicate',input:{rows:[{id:'a',amount:7},{id:'a',amount:7}]},expected:{total:7,count:1}},{id:'conflicting-duplicate',input:{rows:[{id:'a',amount:7},{id:'a',amount:8}]},expected:{error:'duplicate-conflict'}},{id:'boolean-is-not-money',input:{rows:[{id:'a',amount:true}]},expected:{error:'invalid-row'}},{id:'empty',input:{rows:[]},expected:{total:0,count:0}}];
 const acceptance=[{path:'tests/test_acceptance.py',content:`import unittest,subprocess,json,sys\nfrom pathlib import Path\nclass Acceptance(unittest.TestCase):\n def test_blackbox_cases(self):\n  root=str(Path(__file__).resolve().parents[1])\n  cases=json.loads(${JSON.stringify(JSON.stringify(cases))})\n  for c in cases:\n   r=subprocess.run([sys.executable,'-I','-c',"import sys,runpy;sys.path.insert(0,sys.argv[1]);runpy.run_path(sys.argv[1]+'/cli.py',run_name='__main__')",root],input=json.dumps(c['input']),capture_output=True,text=True,timeout=5)\n   self.assertEqual(r.returncode,0,c['id']);self.assertEqual(json.loads(r.stdout),c['expected'],c['id'])\n`}];
 let author;
 try{
  const unavailable=openProjectAuthor({directory:path.join(directory,'unavailable'),model:null});
  let actualReadiness;try{actualReadiness=await unavailable.run({...scope,id:'real-offline-author'},acceptance);}finally{unavailable.close();}
  assert.equal(actualReadiness.status,'blocked');assert.equal(actualReadiness.blocker,'offline-model-required');
  fs.writeFileSync(path.join(output,'real-model-readiness.json'),JSON.stringify({status:actualReadiness.status,blocker:actualReadiness.blocker,autonomousGenerationProven:false,localModelFound:false,userConfirmedNoLocalModel:true,downloads:0,hostedInferenceCalls:0,productionPowerChanged:false},null,2));
  const pin=await boundedProcess(['image','inspect','localhost/obolus-specula-python:3.11','--format','{{.Id}}'],{timeout:15000});assert.equal(pin.code,0);const image=pin.stdout.trim().replace(/^(?!sha256:)/,'sha256:');
  const sandbox=createProfileSandbox({runtime:{profileId:'python',image}});assert.equal(await sandbox.probe(),true);
  const verifier=createProjectBlackBoxVerifier({image,entrypoint:'cli.py',cases,acceptance});
  const design={summary:'Separate validation/aggregation module, JSON CLI and usage guide',components:[{path:'ledger.py',purpose:'validate and aggregate signed unique records'},{path:'cli.py',purpose:'read one JSON request and emit one JSON response'},{path:'README.md',purpose:'usage and limitations'}],coverage:{R1:['ledger.py'],R2:['ledger.py'],R3:['ledger.py'],R4:['cli.py','README.md']}};
  const implementation=`def summarize(data):\n rows=data.get('rows') if isinstance(data,dict) else None\n if not isinstance(rows,list): return {'error':'invalid-row'}\n unique={}\n for row in rows:\n  if not isinstance(row,dict) or not isinstance(row.get('id'),str) or not row['id'] or type(row.get('amount')) is not int: return {'error':'invalid-row'}\n  if row['id'] in unique and unique[row['id']]!=row['amount']: return {'error':'duplicate-conflict'}\n  unique[row['id']]=row['amount']\n return {'total':sum(unique.values()),'count':len(unique)}\n`;
  const requests=[];
  const model={available:true,origin:'fixture',binding:{modelDigest:'fixture-no-llm'},async infer(request){
   requests.push({phase:request.phase,requestId:request.requestId,inputDigest:request.inputDigest,receivedFiles:request.files?.map(f=>f.path)??[],feedback:request.feedback??null});
   if(request.phase==='repair')assert(request.feedback.failedCases.includes('negative-adjustment'));
   const output=request.phase==='design'?{design}:{files:[{path:'ledger.py',content:request.phase==='implement'?implementation.replace('sum(unique.values())','sum(abs(v) for v in unique.values())'):implementation},{path:'cli.py',content:"import json,sys\nfrom ledger import summarize\nprint(json.dumps(summarize(json.load(sys.stdin))))\n"},{path:'README.md',content:'Controller test fixture only: JSON stdin/stdout ledger with integer minor amounts. Run python cli.py. No real model authored this file; it is a scripted integration double.'}]};
   return {requestId:request.requestId,inputDigest:request.inputDigest,output};
  }};
  author=openProjectAuthor({directory:path.join(directory,'fixture'),model,sandbox,verifier,allowTestModel:true,maxRounds:3});
  const result=await author.run(scope,acceptance);assert.equal(result.status,'packaged');assert.equal(result.autonomousGenerationProven,false);assert.deepEqual(requests.map(r=>r.phase),['design','implement','repair']);assert.equal(requests[0].receivedFiles.length,0);
  const product=author.delivery(scope.id);fs.writeFileSync(path.join(output,'controller-fixture.zip'),product.bytes);
  const archiveFile={path:'archive.json',content:JSON.stringify({bytes:product.bytes.toString('base64')})};
  const archiveTest={path:'tests/test_archive.py',content:"import unittest,zipfile,io,json,base64,hashlib\nclass Archive(unittest.TestCase):\n def test_zip(self):\n  raw=base64.b64decode(json.load(open('/source/archive.json'))['bytes'])\n  with zipfile.ZipFile(io.BytesIO(raw)) as z:\n   self.assertIsNone(z.testzip());manifest=json.loads(z.read('MANIFEST.json'));self.assertFalse(manifest['autonomousGenerationProven'])\n   self.assertEqual(set(z.namelist()),{x['path'] for x in manifest['files']}|{'MANIFEST.json'})\n   for item in manifest['files']:\n    self.assertEqual(hashlib.sha256(z.read(item['path'])).hexdigest(),item['sha256'])\n"};
  const zipCheck=await sandbox.run([archiveFile,archiveTest]);assert.equal(zipCheck.passed,true);
  const embeddedTests=await sandbox.run(result.files);assert.equal(embeddedTests.passed,true);
  fs.writeFileSync(path.join(output,'fixture-trace.json'),JSON.stringify({requests,events:author.trace(scope.id),verification:result.verification,receipts:result.modelReceipts,proofLevel:result.proofLevel,autonomousGenerationProven:false},null,2));
  for(const [file,hash] of Object.entries(sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'Implementation changed during isolated check');
  const report={controllerIntegrationPassed:true,realAutonomousAuthorshipProven:false,modelOrigin:'fixture',modelCallsAreScripted:true,realModelReadiness:'offline-model-required',sourceHashes,sourceUnchanged:true,image,network:'none',hostMounts:false,rounds:result.round,initialFailureObserved:requests[2].feedback.failedCases.includes('negative-adjustment'),independentJsonCases:cases.length,finalAllPassed:result.verification.passed,embeddedAcceptance:embeddedTests,zipVerification:zipCheck,archiveSha256:product.sha256,filesDigest:result.filesDigest,productionRestarted:false,providerCalls:0,realSubmissions:0};
  fs.writeFileSync(path.join(output,'integration.json'),JSON.stringify(report,null,2));return report;
 }finally{author?.close();assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await checkProjectAuthor(path.resolve(process.argv[2]??'outputs/project-author-20261024')),null,2));
