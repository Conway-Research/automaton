import {randomUUID} from 'node:crypto';
import {createProjectBlackBoxVerifier} from './founder-project-blackbox.mjs';
import {boundedProcess} from './founder-code-sandbox.mjs';
import {digest,checkedJSON} from './founder-restoration-integrity.mjs';
import {projectDiagnosticExecution} from './founder-project-diagnostics.mjs';

const architectureScript=`import ast,json,sys\nbody=json.load(sys.stdin)\nfiles={f['path']:f['content'] for f in body['files']}\nentry=body['entrypoint']\nmodules={p[:-3].replace('/','.') for p in files if p.endswith('.py') and p!=entry and not p.startswith('tests/')}\ntry:\n tree=ast.parse(files[entry],filename=entry)\n aliases=set()\n for node in ast.walk(tree):\n  if isinstance(node,ast.Import):\n   for a in node.names:\n    if a.name in modules: aliases.add(a.asname or a.name.split('.')[0])\n  elif isinstance(node,ast.ImportFrom):\n   for a in node.names:\n    if node.module in modules or ((node.module or '')+'.'+a.name) in modules: aliases.add(a.asname or a.name)\n def root(node):\n  while isinstance(node,ast.Attribute): node=node.value\n  return node.id if isinstance(node,ast.Name) else None\n calls=sorted({root(n.func) for n in ast.walk(tree) if isinstance(n,ast.Call) and root(n.func) in aliases})\n print(json.dumps({'passed':bool(modules and aliases and calls),'projectImports':sorted(aliases),'calledProjectSymbols':calls,'declaredModules':sorted(modules)}))\nexcept SyntaxError as e: print(json.dumps({'passed':False,'syntaxError':str(e)}))\n`;

/** Same independent behavioral cases, plus a separately isolated source parse.
 * The architecture process never imports or executes generated modules.
 * Exception tracing is diagnostic only; it cannot turn a behavioral failure green.
 */
export function createProjectDeliveryVerifier({image,entrypoint,cases,acceptance,process:run=boundedProcess}){
 const diagnosticProcess=(args,options,syntheticArguments=false)=>{
  const fixed=[...args],index=fixed.indexOf('-c');
  if(index>=0&&fixed.at(-1)===entrypoint&&String(fixed[index+1]).includes("runpy.run_path('/source/'+entry"))fixed[index+1]=projectDiagnosticExecution({syntheticArguments});
  return run(fixed,options);
 };
 const baseOptions={image,entrypoint,cases:checkedJSON(cases,160000),acceptance:checkedJSON(acceptance)},base=createProjectBlackBoxVerifier({...baseOptions,process:run});
 const policy={version:1,entrypoint,requireDeclaredProjectImportAndCall:true,syntaxOnlyArchitectureProcess:true};
 const oracleDigest=digest({baseOracleDigest:base.oracleDigest,policy});
 return {kind:'isolated-python-project-delivery-v2',image,entrypoint,acceptanceDigest:base.acceptanceDigest,oracleDigest,strengthensOracleDigest:base.oracleDigest,policy,
  async verify(input,ctx={}){
   const scoped=createProjectBlackBoxVerifier({...baseOptions,process:(args,options)=>diagnosticProcess(args,options,input.scope?.privacy==='synthetic')});
   const behavioral=await scoped.verify(input,ctx),name='numaron-architecture-'+randomUUID();
   const args=['run','--rm','--name='+name,'--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=128m','--memory-swap=128m','--cpus=1','--pids-limit=32','--timeout=20','--entrypoint=/usr/local/bin/python3','-i',image,'-I','-c',architectureScript];
   let result;try{ctx.assertActive?.();result=await run(args,{input:JSON.stringify({files:input.files,entrypoint}),signal:ctx.signal,timeout:25000});ctx.assertActive?.();}finally{await run(['rm','--force',name],{timeout:10000}).catch(()=>{});}
   let actual=null;try{actual=JSON.parse(result.stdout);}catch{}
   const passed=result.code===0&&actual?.passed===true;
   const check={id:'R8-declared-component-delegation',passed,actual,...(!passed?{feedback:{requirementId:'R8',error:'The CLI must use its separately declared project modules; a standalone duplicate implementation does not satisfy the model-designed separation of CLI, domain and storage.',details:actual,stderr:result.stderr}}:{})};
   const checks=[...behavioral.checks,check],failedCases=checks.filter(c=>!c.passed).map(c=>c.id);
   return {...behavioral,passed:behavioral.passed&&passed,exitCode:failedCases.length?1:0,tests:behavioral.tests+1,oracleDigest,checks,failedCases,log:JSON.stringify(checks.filter(c=>!c.passed)).slice(-12000)};
  }
 };
}
