import {createProjectSyntaxVerifier} from './founder-project-syntax-verifier.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {createLocalProjectModel} from './founder-local-project-model.mjs';
import {openProjectAuthor} from './founder-project-author.mjs';
import {createProfileSandbox} from './founder-profile-sandbox.mjs';
import {createProjectBlackBoxVerifier} from './founder-project-blackbox.mjs';
import {createProjectDeliveryVerifier} from './founder-project-delivery-verifier.mjs';
import {createProjectReleaseVerifier} from './founder-project-release-verifier.mjs';
import {createProjectReviewVerifier} from './founder-project-review-verifier.mjs';
import {boundedProcess} from './founder-code-sandbox.mjs';
import {realProjectScope,realProjectAcceptance,realProjectCases} from './founder-real-project-spec.mjs';
import {digest} from './founder-restoration-integrity.mjs';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export async function runRealProject(output,{installationFile='outputs/local-model-install-20261024/installation-host.json'}={}){
 fs.mkdirSync(output,{recursive:true});
 const installation=JSON.parse(fs.readFileSync(installationFile,'utf8'));
 const sourceFiles=['founder-project-execution-diagnostics.mjs','founder-project-syntax-diagnostics.mjs','founder-project-repair-anchors.mjs','founder-project-diagnostics.mjs','founder-project-repair-tools.mjs','founder-project-repair-catalog.mjs','founder-project-task.mjs','founder-project-document-verifier.mjs','founder-project-release-verifier.mjs','founder-project-review-verifier.mjs','founder-project-syntax-verifier.mjs','founder-project-source-context.mjs','founder-project-patches.mjs','founder-project-delivery-verifier.mjs','founder-local-project-model.mjs','founder-project-author.mjs','founder-project-author-contract.mjs','founder-project-blackbox.mjs','founder-project-package.mjs','founder-real-project-spec.mjs','founder-real-project-run.mjs','founder-profile-sandbox.mjs','founder-code-sandbox.mjs','founder-work-profiles.mjs','founder-test-summary.mjs','founder-restoration-integrity.mjs'].map(name=>fileURLToPath(new URL(name,import.meta.url)));
 const extraFile=path.join(output,'release-extra-cases.json'),extraContract=JSON.parse(fs.readFileSync(extraFile,'utf8'));assert.equal(digest(extraContract.cases),extraContract.oracleDigest);sourceFiles.push(path.resolve(extraFile),path.resolve(installationFile));
 const reviewFile=path.join(output,'review-extra-cases.json'),reviewContract=fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile,'utf8')):null;if(reviewContract){assert.equal(digest(reviewContract.cases),reviewContract.oracleDigest);sourceFiles.push(path.resolve(reviewFile));}
 const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(file)]));
 const sourceBaselineFile='source-baseline-'+Date.now()+'.json';fs.writeFileSync(path.join(output,sourceBaselineFile),JSON.stringify({at:new Date().toISOString(),sourceHashes,meaning:'Source baseline for this invocation; earlier development/failures remain recorded separately'},null,2),{flag:'wx'});
 const frozen={scope:realProjectScope,acceptance:realProjectAcceptance,cases:realProjectCases,scopeDigest:digest(realProjectScope),acceptanceDigest:digest(realProjectAcceptance),oracleDigest:digest(realProjectCases)};
 const contractFile=path.join(output,'frozen-contract.json');
 if(fs.existsSync(contractFile))assert.equal(digest(JSON.parse(fs.readFileSync(contractFile))),digest(frozen),'Never replace scope/acceptance on resume');else fs.writeFileSync(contractFile,JSON.stringify(frozen,null,2),{flag:'wx'});
 const status=body=>{fs.writeFileSync(path.join(output,'status.json'),JSON.stringify({at:new Date().toISOString(),...body},null,2));console.log(JSON.stringify(body));};
 status({phase:'probing-model',modelId:installation.modelId});
 const model=createLocalProjectModel({...installation,directory:path.join(output,'inference-journal'),timeoutMs:3600000});
 assert.equal(await model.probe(),true,'Genuine pinned local runtime/model probe required');
 const pin=await boundedProcess(['image','inspect','localhost/obolus-specula-python:3.11','--format','{{.Id}}'],{timeout:10000});assert.equal(pin.code,0);
 const image=pin.stdout.trim().replace(/^(?!sha256:)/,'sha256:');
 const sandbox=createProfileSandbox({runtime:{profileId:'python',image}});assert.equal(await sandbox.probe(),true);
 const verifier=createProjectBlackBoxVerifier({image,entrypoint:'cli.py',cases:realProjectCases,acceptance:realProjectAcceptance});
 const strengthened=createProjectDeliveryVerifier({image,entrypoint:'cli.py',cases:realProjectCases,acceptance:realProjectAcceptance});
 const release=createProjectReleaseVerifier({image,entrypoint:'cli.py',cases:realProjectCases,extraCases:extraContract.cases,acceptance:realProjectAcceptance});
 const reviewed=reviewContract?createProjectReviewVerifier({baseVerifier:release,reviewCases:reviewContract.cases,acceptance:realProjectAcceptance}):null;
 const syntax=createProjectSyntaxVerifier({baseVerifier:reviewed??release});
 const options={directory:path.join(output,'author-state'),model,sandbox,verifier,maxRounds:8,inferenceTimeoutMs:14400000};
 let author=openProjectAuthor(options);
 const storedKind=author.snapshot(realProjectScope.id)?.verifierContract?.kind;
 if([strengthened.kind,release.kind,...(reviewed?[reviewed.kind]:[]),syntax.kind].includes(storedKind)){author.close();author=openProjectAuthor({...options,verifier:storedKind===syntax.kind?syntax:storedKind===reviewed?.kind?reviewed:storedKind===release.kind?release:strengthened});}
 let result;
 try{
  for(let i=0;i<96;i++){
   let before=author.snapshot(realProjectScope.id);
   if(before?.status==='exhausted'&&!before.pendingInference&&before.verification?.passed===false&&before.round>=8&&before.round<32){
    before=author.extendRepairBudget(realProjectScope.id,{additionalRounds:Math.min(8,32-before.round),reason:'Continue the user-authorized isolated offline project with unchanged requirements and acceptance; preserve every failed round'});
    status({phase:'bounded-repair-budget-extended',round:before.round,limit:before.repairBudget.limit});
   }
   if(before&&!before.pendingInference&&['testing','repairing','packaged'].includes(before.status)&&![release.kind,...(reviewed?[reviewed.kind]:[]),syntax.kind].includes(before.verifierContract.kind)){
    if(before.verifierContract.kind!==strengthened.kind){
     const file=path.join(output,'strengthened-verifier-contract.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),originalVerifier:before.verifierContract,policy:strengthened.policy,oracleDigest:strengthened.oracleDigest,meaning:'Additional R8 architecture gate; original immutable behavioral cases and scope remain unchanged'},null,2),{flag:'wx'});
     before=author.strengthenVerifier(realProjectScope.id,strengthened);
    }
    const file=path.join(output,'release-verifier-contract.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),originalVerifier:before.verifierContract,policy:release.policy,oracleDigest:release.oracleDigest,additionalCasesDigest:extraContract.oracleDigest,meaning:'Conjunctive executable-documentation, generated-unittest, additional-behavior and isolated module-mutation gates; original scope/cases unchanged'},null,2),{flag:'wx'});
    before=author.strengthenVerifier(realProjectScope.id,release);
   }
   if(reviewed&&before&&!before.pendingInference&&['testing','repairing','packaged'].includes(before.status)&&before.verifierContract.kind!==reviewed.kind&&before.verifierContract.kind!==syntax.kind){
    assert.equal(before.verifierContract.oracleDigest,release.oracleDigest,'Review gate may only add to the exact original release contract');
    const file=path.join(output,'reviewed-verifier-contract.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),originalVerifier:before.verifierContract,policy:reviewed.policy,oracleDigest:reviewed.oracleDigest,reviewCasesDigest:reviewContract.oracleDigest,meaning:'All original checks remain; independently reproduced R1/R5/R6/R7 regressions are additional conjunctive requirements, no candidate code or scope changes'},null,2),{flag:'wx'});
    before=author.strengthenVerifier(realProjectScope.id,reviewed);status({phase:'independent-review-regressions-bound',round:before.round});
   }
   if(before&&!before.pendingInference&&['testing','repairing','packaged'].includes(before.status)&&before.verifierContract.kind!==syntax.kind){
    assert.equal(before.verifierContract.oracleDigest,(reviewed??release).oracleDigest,'Source validity only adds to the exact existing independent contract');
    const file=path.join(output,'syntax-verifier-contract.json');if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),originalVerifier:before.verifierContract,policy:syntax.policy,oracleDigest:syntax.oracleDigest,meaning:'Conjunctive compile-without-execution check for every delivered Python source; all original acceptance, additional and review cases remain unchanged'},null,2),{flag:'wx'});
    before=author.strengthenVerifier(realProjectScope.id,syntax);status({phase:'all-python-source-validity-bound',round:before.round});
   }
   if(before&&!before.pendingInference&&['testing','repairing'].includes(before.status)&&before.diagnosticsPolicyVersion!=='synthetic-arguments-v1'){before=author.refreshDiagnostics(realProjectScope.id,{policyVersion:'synthetic-arguments-v1'});status({phase:'diagnostics-refreshed-without-source-change',round:before.round});}
   if(before?.pendingInference&&await model.recoverKnownIncomplete(before.pendingInference))status({phase:'confirmed-output-limit-recovery',round:before.round});
   status({phase:'executing-'+(before?.status??'new-design'),round:before?.round??0});
   result=await author.step(realProjectScope,realProjectAcceptance);
   status({phase:result.status,round:result.round,modelOrigin:result.modelOrigin??null,autonomousGenerationProven:result.autonomousGenerationProven,failedCases:result.feedback?.failedCases??[]});
   fs.writeFileSync(path.join(output,'project-state.json'),JSON.stringify(result,null,2));
   if(['packaged','blocked','awaiting-model-reconciliation'].includes(result.status)||(result.status==='exhausted'&&!(result.verification?.passed===false&&result.round>=8&&result.round<32)))break;
  }
  assert.equal(result.status,'packaged','Real local model has not completed acceptance');assert.equal(result.autonomousGenerationProven,true);
  assert.equal(result.modelOrigin,'local-model');assert(result.modelReceipts.length>=2&&result.modelReceipts.every(r=>r.verified===true));
  const product=author.delivery(realProjectScope.id);fs.writeFileSync(path.join(output,'reservation-engine.zip'),product.bytes);
  const trustedArchiveTest={path:'tests/test_fresh_package.py',content:"import unittest,base64,io,json,zipfile,hashlib,subprocess,sys\nfrom pathlib import Path,PurePosixPath\nclass FreshPackage(unittest.TestCase):\n def test_extract_and_execute(self):\n  raw=base64.b64decode(json.load(open('/source/archive.json'))['base64']);root=Path('/work/delivery');root.mkdir()\n  with zipfile.ZipFile(io.BytesIO(raw)) as z:\n   self.assertIsNone(z.testzip());m=json.loads(z.read('MANIFEST.json'));self.assertTrue(m['autonomousGenerationProven']);self.assertEqual(set(z.namelist()),{x['path'] for x in m['files']}|{'MANIFEST.json'})\n   for item in m['files']:\n    p=PurePosixPath(item['path']);self.assertFalse(p.is_absolute());self.assertNotIn('..',p.parts);self.assertEqual(hashlib.sha256(z.read(item['path'])).hexdigest(),item['sha256'])\n   z.extractall(root)\n  script=\"import sys,unittest;sys.path.insert(0,'/work/delivery');s=unittest.defaultTestLoader.discover('/work/delivery/tests');r=unittest.TextTestRunner().run(s);sys.exit(0 if r.wasSuccessful() and r.testsRun>=3 else 1)\"\n  r=subprocess.run([sys.executable,'-I','-c',script],cwd=str(root),capture_output=True,text=True,timeout=25);self.assertEqual(r.returncode,0,r.stderr[-8000:])\n"};
  status({phase:'fresh-package-verification',round:result.round});
  const fresh=await sandbox.run([{path:'archive.json',content:JSON.stringify({base64:product.bytes.toString('base64')})},trustedArchiveTest]);
  fs.writeFileSync(path.join(output,'fresh-package.json'),JSON.stringify(fresh,null,2));assert(fresh.passed,'Extracted package failed actual tests');
  for(const [file,value] of Object.entries(sourceHashes))assert.equal(hash(file),value,'Author implementation drifted during run');
  const proof={checkedAt:new Date().toISOString(),modelOrigin:'local-model',modelId:installation.modelId,modelDigest:installation.modelDigest,modelImage:installation.image,modelRunnerDigest:installation.runnerDigest,authoringRequestIds:result.modelReceipts.map(r=>r.requestId),modelReceipts:result.modelReceipts,scopeDigest:result.scopeDigest,verifierBindingDigest:result.verifierBindingDigest,sourceHashes,sourceBaselineFile,sourceUnchanged:true,sourceUnchangedScope:'successful invocation, including any reconciled earlier model receipts; no candidate code manually edited',rounds:result.round,verification:result.verification,filesDigest:result.filesDigest,archiveSha256:product.sha256,freshPackagePassed:true,autonomousGenerationProven:true,scope:'one fixed unseen requirement-only SQLite reservation project; no generic unlimited capability claim',preparedImplementationProvided:false,candidateCodeManuallyEdited:false,network:'none',hostMounts:false,productionPowerChanged:false,productionRestarted:false,realSubmissions:0};
  fs.writeFileSync(path.join(output,'proof.json'),JSON.stringify(proof,null,2));status({phase:'complete',round:result.round,archiveSha256:product.sha256,autonomousGenerationProven:true});return proof;
 }catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({at:new Date().toISOString(),error:String(error),state:author.snapshot(realProjectScope.id),autonomousGenerationProven:false},null,2));throw error;}finally{author.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await runRealProject(path.resolve(process.argv[2]??'outputs/real-project-run-20261024'),{...(process.argv[3]?{installationFile:process.argv[3]}:{})});
