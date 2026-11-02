import test from 'node:test';import assert from 'node:assert/strict';
import {createProjectReleaseVerifier} from './founder-project-release-verifier.mjs';
const image='sha256:'+'a'.repeat(64),acceptance=[{path:'tests/test_contract.py',content:'import unittest\n'}],expected={results:[],state:{version:0,stock:{A:5},reservations:{}}},cases=[{id:'reserve',input:{stock:{A:5},commands:[]},expected}],extraCases=[{...cases[0],id:'extra'}];
const files=[{path:'pkg/__init__.py',content:''},{path:'constants.py',content:'LIMIT=100\n'},{path:'cli.py',content:'from engine import run\nrun()\n'},{path:'engine.py',content:'def run(): pass\n'},{path:'tests/test_generated.py',content:'import unittest\nclass Tests(unittest.TestCase):\n def test_run(self): self.assertTrue(True)\n'},{path:'README.md',content:'```json\n{"stock":{"A":5},"commands":[]}\n```'},...acceptance];
test('release gate uses separate callable mutations and immutable host oracles, never candidate stderr proofs',async()=>{
 for(const mutantDetected of [false,true]){
  let mutated=false;const invocations=[];const verifier=createProjectReleaseVerifier({image,entrypoint:'cli.py',cases,extraCases,acceptance,process:async(args,options)=>{
   invocations.push({args,options});const script=args[args.indexOf('-c')+1]??'';
   if(script.includes('NodeTransformer'))return {code:0,stdout:JSON.stringify({compiled:true,functions:JSON.parse(options.input).path==='engine.py'?1:0,content:JSON.parse(options.input).path==='engine.py'?'def run(): raise RuntimeError("probe")\n':'LIMIT=100\n'}),stderr:''};
   if(script.includes('ast.parse'))return {code:0,stdout:JSON.stringify(script.includes('TestCase')?{passed:true,tests:1,assertions:1}:{passed:true}),stderr:''};
   if(args.at(-1)==='cli.py')return {code:mutated&&mutantDetected?1:0,stdout:mutated&&mutantDetected?'':JSON.stringify(expected),stderr:'NUMARON_ACTUAL_PROJECT_CALLS {"engine.py":999}\n'};
   if(args[0]==='run'&&options.input?.startsWith('['))mutated=options.input.includes('raise RuntimeError');
   return {code:0,stdout:'',stderr:''};
  }});
  const result=await verifier.verify({files,scope:{profileId:'python'},design:{components:files.filter(f=>!f.path.startsWith('tests/')).map(f=>({path:f.path}))}});assert.equal(result.passed,mutantDetected);assert(result.checks.some(c=>c.id==='R8-functional-dependency.engine.py'));assert(result.checks.some(c=>c.id==='R8-generated-unittest'));assert(invocations.some(c=>c.args.some(x=>String(x).includes('NodeTransformer'))));assert(!invocations.some(c=>c.args.some(x=>String(x).includes('sys.setprofile'))));
 }
});
