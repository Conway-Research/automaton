import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {summarizeNativeCoverage} from './summarize-native-coverage.mjs';

// Local verification only. Never invokes the production agent or provisions services.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=path.join(root,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
const directory=fs.mkdtempSync(path.join(artifacts,'local-acceptance-'));
const environment=Object.fromEntries(Object.entries(process.env).filter(([name])=>
  !/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|MNEMONIC|PRIVATE)/i.test(name)&&
  !/^(OBOLUS_|AUREUS_|OPENAI_|ANTHROPIC_|CONWAY_|STRIPE_)/i.test(name)));
environment.CI='1';environment.NO_COLOR='1';
environment.NODE_OPTIONS=`--require="${path.join(root,'scripts','verification-network-guard.cjs').replaceAll('\\','/')}"`;
const rootBuild=path.join(directory,'root-build'),cliBuild=path.join(directory,'cli-build');
const report={mode:'local-verification-and-simulation',startedAt:new Date().toISOString(),
  sourceDigestBefore:null,sourceDigestAfter:null,sourceUnchanged:false,checks:[],tests:null,
  success:false,liveAccepted:false,profitabilityProven:false,
  limitation:'Offline tests and deterministic simulations do not authenticate productive accounts, prove profit or authorize live operation.'};
const save=()=>fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
function fingerprint(){
  const files=[];
  const walk=folder=>{
    if(!fs.existsSync(folder))return;
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw new Error('Verification source contains a symbolic link');
      const file=path.join(folder,entry.name);
      if(entry.isDirectory()){
        if(!['node_modules','dist','.git'].includes(entry.name))walk(file);
      }else if(/\.(ts|mts|cts|js|mjs|cjs|json|html|css)$/.test(entry.name)&&!entry.name.includes('.backup'))files.push(file);
    }
  };
  for(const folder of ['src','packages','web','scripts'])walk(path.join(root,folder));
  for(const name of ['.oxlintrc.json','.github/workflows/ci.yml','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','tsconfig.tests.json','vitest.config.ts']){
    const file=path.join(root,name);if(fs.existsSync(file))files.push(file);
  }
  const hash=crypto.createHash('sha256');
  for(const file of [...new Set(files)].sort()){
    hash.update(path.relative(root,file).replaceAll('\\','/'));hash.update('\0');hash.update(fs.readFileSync(file));hash.update('\0');
  }
  return hash.digest('hex');
}
function check(name,executable,args){
  const log=path.join(directory,`${name}.log`),fd=fs.openSync(log,'wx'),started=Date.now();
  let result;
  try{result=spawnSync(executable,args,{cwd:root,env:environment,stdio:['ignore',fd,fd],timeout:600000,windowsHide:true});}
  finally{fs.closeSync(fd);}
  const passed=!result.error&&result.status===0;
  report.checks.push({name,passed,exitCode:result.status,durationMs:Date.now()-started,log:path.basename(log)});save();
  process.stdout.write(`${name}: ${passed?'passed':'FAILED'}\n`);
  if(!passed)throw new Error(`Verification failed: ${name}; inspect local log`);
}
try{
  report.sourceDigestBefore=fingerprint();save();
  check('lint',process.execPath,['node_modules/oxlint/bin/oxlint','-c','.oxlintrc.json','--disable-nested-config','--max-warnings','102','src','packages/cli/src','scripts','vitest.config.ts']);
  check('typecheck',process.execPath,['node_modules/typescript/bin/tsc','--noEmit']);
  const results=path.join(directory,'tests.json');
  environment.NODE_V8_COVERAGE=path.join(directory,'v8-coverage');
  fs.mkdirSync(environment.NODE_V8_COVERAGE,{recursive:true});
  environment.OBOLUS_VERIFICATION_COVERAGE=environment.NODE_V8_COVERAGE;
  check('tests',process.execPath,['node_modules/vitest/vitest.mjs','run','--reporter=json',`--outputFile=${results}`]);
  delete environment.NODE_V8_COVERAGE;
  delete environment.OBOLUS_VERIFICATION_COVERAGE;
  const tests=JSON.parse(fs.readFileSync(results,'utf8'));
  if(tests.success!==true||tests.numFailedTests!==0||tests.numPendingTests!==0||tests.numPassedTests<1)throw new Error('Invalid or unsuccessful test summary');
  report.tests={passed:tests.numPassedTests,failed:tests.numFailedTests,pending:tests.numPendingTests,files:tests.testResults.length};save();
  const coverage=summarizeNativeCoverage(root,path.join(directory,'v8-coverage'));
  if(coverage.workerReports!==tests.testResults.length)throw new Error('Coverage missing for one or more test files');
  fs.writeFileSync(path.join(directory,'coverage-summary.json'),JSON.stringify(coverage,null,2)+'\n');
  report.coverage={report:'coverage-summary.json',metric:coverage.metric,observedSourceFiles:coverage.observedSourceFiles,sourceFiles:coverage.sourceFiles,observedFunctionPercent:coverage.observedFunctionPercent};
  check('test-typecheck',process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.tests.json']);
  report.testTypecheckScope='Full src tree including all test files';
  check('root-build',process.execPath,['node_modules/typescript/bin/tsc','--outDir',rootBuild]);
  check('cli-build',process.execPath,['node_modules/typescript/bin/tsc','-p','packages/cli/tsconfig.json','--outDir',cliBuild]);
  check('working-diff','git',['diff','--check']);
  check('staged-diff','git',['diff','--cached','--check']);
  for(const [name,args] of [
    ['personal-cycle',['personal-verify']],
    ['personal-allocation',['personal-benchmark']],
    ['simulated-soak',['soak','--days','120']],
  ])check(name,process.execPath,[path.join(rootBuild,'v1/cli.js'),...args,'--output',path.join(directory,`${name}.json`)]);
  report.sourceDigestAfter=fingerprint();report.sourceUnchanged=report.sourceDigestBefore===report.sourceDigestAfter;
  if(!report.sourceUnchanged)throw new Error('Source changed during verification; run again against stable files');
  report.success=true;
}catch(error){
  // Errors originate from fixed local checks; do not include child environments or output in the report.
  report.failure=error instanceof Error?error.message:'Local verification failed';process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();save();process.stdout.write(`Report: ${path.join(directory,'report.json')}\n`);
}
