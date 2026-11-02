import {randomUUID} from 'node:crypto';
import {digest} from './founder-restoration-integrity.mjs';
import {boundedProcess} from './founder-code-sandbox.mjs';
import {createProjectDeliveryVerifier} from './founder-project-delivery-verifier.mjs';
import {createProjectDocumentVerifier} from './founder-project-document-verifier.mjs';
import {createProjectBlackBoxVerifier} from './founder-project-blackbox.mjs';

const mutateScript=`import ast,json,sys
body=json.load(sys.stdin);tree=ast.parse(body['content']);count=0
class Mutator(ast.NodeTransformer):
 def visit_FunctionDef(self,node):
  global count
  count+=1;node.body=[ast.Raise(exc=ast.Call(func=ast.Name(id='RuntimeError',ctx=ast.Load()),args=[ast.Constant(value=body['marker'])],keywords=[]),cause=None)];return node
 def visit_AsyncFunctionDef(self,node): return self.visit_FunctionDef(node)
tree=Mutator().visit(tree);ast.fix_missing_locations(tree);content=ast.unparse(tree);compile(content,body['path'],'exec')
print(json.dumps({'compiled':True,'functions':count,'content':content}))
`;
const unittestScript=`import ast,json,sys
tree=ast.parse(json.load(sys.stdin)['content']);aliases={'unittest'};bases=set()
for n in ast.walk(tree):
 if isinstance(n,ast.Import):
  for a in n.names:
   if a.name=='unittest': aliases.add(a.asname or a.name)
 if isinstance(n,ast.ImportFrom) and n.module=='unittest':
  for a in n.names:
   if a.name=='TestCase': bases.add(a.asname or a.name)
tests=0;assertions=0
for n in ast.walk(tree):
 if isinstance(n,ast.ClassDef) and any((isinstance(b,ast.Attribute) and b.attr=='TestCase' and isinstance(b.value,ast.Name) and b.value.id in aliases) or (isinstance(b,ast.Name) and b.id in bases) for b in n.bases):
  for m in n.body:
   if isinstance(m,ast.FunctionDef) and m.name.startswith('test_'):
    tests+=1;assertions+=sum(1 for call in ast.walk(m) if isinstance(call,ast.Call) and isinstance(call.func,ast.Attribute) and call.func.attr.startswith('assert'))
print(json.dumps({'passed':tests>0 and assertions>0,'tests':tests,'assertions':assertions}))
`;

/** Conjunctive release checks. Module dependency is measured by independent
 * host-oracle runs of separate AST-mutated copies, never by candidate stdout,
 * stderr, Python profiling, or a mutable in-process receipt. Delivery files
 * themselves remain byte-for-byte intact. AST source is parsed, never imported.
 */
export function createProjectReleaseVerifier({image,entrypoint,cases,extraCases,acceptance,process:run=boundedProcess}){
 const original=createProjectDeliveryVerifier({image,entrypoint,cases,acceptance,process:run});
 const document=createProjectDocumentVerifier({base:original,process:run});
 const behavioral=createProjectBlackBoxVerifier({image,entrypoint,cases,acceptance,process:run});
 const extra=createProjectBlackBoxVerifier({image,entrypoint,cases:extraCases,acceptance,process:run});
 const policy={version:2,nonCallableSupportExempt:true,minFunctionalModules:1,moduleCallableMutation:true,mutatedCopiesNeverDelivered:true,generatedUnittestRequired:true,documentationOracle:document.oracleDigest,additionalOracle:extra.oracleDigest};
 const oracleDigest=digest({baseOracleDigest:original.oracleDigest,policy});
 async function analyze(script,input,ctx){
  const name='numaron-source-audit-'+randomUUID(),args=['run','--rm','--name='+name,'--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=128m','--memory-swap=128m','--cpus=1','--pids-limit=32','--timeout=20','--entrypoint=/usr/local/bin/python3','-i',image,'-I','-c',script];
  try{if(ctx.signal?.aborted)throw Error('Release audit aborted');ctx.assertActive?.();const r=await run(args,{input:JSON.stringify(input),signal:ctx.signal,timeout:25000});ctx.assertActive?.();if(r.code!==0)throw Error('Isolated source audit failed: '+String(r.stderr).slice(-1500));return JSON.parse(r.stdout);}finally{await run(['rm','--force',name],{timeout:10000}).catch(()=>{});}
 }
 return {kind:'isolated-project-release-v2',image,entrypoint,acceptanceDigest:original.acceptanceDigest,oracleDigest,strengthensOracleDigest:original.oracleDigest,policy,
  async verify(input,ctx={}){
   const primary=await document.verify(input,ctx),additional=await extra.verify(input,ctx);
   if(primary.sourceDigest!==additional.sourceDigest)throw Error('Release checks must bind the same source');
   const checks=[...primary.checks,...additional.checks.map(c=>({...c,id:'release-extra.'+c.id}))];let mutationTestExecutions=0;
   const testFile=input.files.find(f=>f.path==='tests/test_generated.py');let testAnalysis;
   try{testAnalysis=await analyze(unittestScript,{content:testFile?.content??''},ctx);}catch(error){if(ctx.signal?.aborted)throw error;testAnalysis={passed:false,error:String(error)};}
   checks.push({id:'R8-generated-unittest',passed:testAnalysis.passed===true,actual:testAnalysis,...(testAnalysis.passed?{}:{feedback:{file:'tests/test_generated.py',error:'Provide real unittest.TestCase test_ methods with assertions against the application; do not put application main/engine implementation in the test file'}})});
   const modules=input.design.components.map(c=>c.path).filter(p=>p.endsWith('.py')&&p!==entrypoint&&!p.startsWith('tests/'));
   for(const file of modules){
    if(!primary.passed||!additional.passed){checks.push({id:'R8-functional-dependency.'+file,passed:false,notRun:true,feedback:{file,error:'Dependency probe awaits passing baseline behavior/documentation; module execution is not yet proven'}});continue;}
    const source=input.files.find(f=>f.path===file);if(!source)throw Error('Declared release module missing');
    const mutation=await analyze(mutateScript,{...source,marker:'isolated-module-dependency-'+randomUUID()},ctx);
    if(mutation.compiled!==true||!Number.isSafeInteger(mutation.functions)||typeof mutation.content!=='string')throw Error('Exact compiled callable mutation required');
    if(mutation.functions===0){checks.push({id:'R8-support-source.'+file,passed:true,mutatedCallables:0,evidenceKind:'non-callable-support-only',meaning:'Package markers/constants do not claim executable delegation'});continue;}
    let result=null;
    if(mutation.functions>0){const files=input.files.map(f=>f.path===file?{path:file,content:mutation.content}:f);result=await behavioral.verify({...input,files},ctx);mutationTestExecutions+=result.tests;}
    const passed=mutation.functions>0&&result?.passed===false&&result.failedCases.length>0;
    checks.push({id:'R8-functional-dependency.'+file,passed,mutatedCallables:mutation.functions,mutationResult:result,...(!passed?{feedback:{file,error:'Disabling all module functions did not break any original independent behavior check; delegate actual domain/storage work to the declared module'}}:{})});
   }
   const callableModulesProven=checks.filter(c=>c.id.startsWith('R8-functional-dependency.')&&c.passed&&c.mutatedCallables>0).length;
   if(!callableModulesProven)checks.push({id:'R8-functional-modules',passed:false,feedback:{error:'At least one separately declared executable domain/storage module must be necessary for original behavior; non-callable support files do not establish this'}});
   const failedCases=checks.filter(c=>!c.passed).map(c=>c.id),passed=primary.passed&&additional.passed&&testAnalysis.passed===true&&callableModulesProven>0&&!failedCases.length;
   return {...primary,passed,exitCode:passed?0:1,tests:primary.tests+additional.tests+1+modules.length+mutationTestExecutions+(!callableModulesProven?1:0),mutationTestExecutions,callableModulesProven,oracleDigest,checks,failedCases,log:JSON.stringify(checks.filter(c=>!c.passed).map(({mutationResult,...c})=>({...c,...(mutationResult?{mutationResult:{passed:mutationResult.passed,tests:mutationResult.tests,failedCases:mutationResult.failedCases,sourceDigest:mutationResult.sourceDigest}}:{})}))).slice(-12000)};
  }
 };
}
