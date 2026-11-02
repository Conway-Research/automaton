import test from 'node:test';import assert from 'node:assert/strict';
import {createProjectDeliveryVerifier} from './founder-project-delivery-verifier.mjs';
import {digest} from './founder-restoration-integrity.mjs';
const image='sha256:'+'a'.repeat(64),acceptance=[{path:'tests/test_contract.py',content:'import unittest\n'}],cases=[{id:'sum',input:{a:3,b:4},expected:{sum:7}}];
const files=[{path:'cli.py',content:'from domain import run\nrun()\n'},{path:'domain.py',content:'def run(): pass\n'},...acceptance];
test('a green behavior result cannot override a missing project-module delegation',async()=>{
 for(const architecturalPass of [false,true]){
  const calls=[];const verifier=createProjectDeliveryVerifier({image,entrypoint:'cli.py',cases,acceptance,process:async(args,options)=>{calls.push({args,options});if(args.some(a=>String(a).includes('ast.parse')))return {code:0,stdout:JSON.stringify({passed:architecturalPass,projectImports:architecturalPass?['run']:[],calledProjectSymbols:architecturalPass?['run']:[]}),stderr:''};return {code:0,stdout:args.at(-1)==='cli.py'?'{"sum":7}':'',stderr:''};}});
  const result=await verifier.verify({files,scope:{profileId:'python'}});assert.equal(result.passed,architecturalPass);assert.equal(result.tests,2);assert.equal(verifier.strengthensOracleDigest,digest(cases));assert.equal(result.oracleDigest,verifier.oracleDigest);
  const execution=calls.find(c=>c.args.at(-1)==='cli.py');assert(execution.args.some(a=>String(a).includes('NUMARON_SOURCE_EXCEPTIONS')));
  assert(execution.args.some(a=>String(a).includes('NUMARON_SOURCE_STEPS')),'A non-exception failure must retain bounded line/return diagnostics');
  const parse=calls.find(c=>c.args.some(a=>String(a).includes('ast.parse')));assert(parse.args.includes('-I'));assert(parse.args.includes('--network=none'));assert(!parse.args.some(a=>String(a).includes('runpy.run_path')));assert(!parse.args.some(a=>String(a).includes('type=bind')));
 }
});
test('primitive argument capture is enabled only for a synthetic project scope',async()=>{
 for(const privacy of ['public','synthetic']){
  const calls=[],verifier=createProjectDeliveryVerifier({image,entrypoint:'cli.py',cases,acceptance,process:async(args)=>{calls.push(args);if(args.some(a=>String(a).includes('ast.parse')))return {code:0,stdout:JSON.stringify({passed:true}),stderr:''};return {code:0,stdout:args.at(-1)==='cli.py'?'{"sum":7}':'',stderr:''};}});
  assert.equal((await verifier.verify({files,scope:{profileId:'python',privacy}})).passed,true);
  assert(calls.find(args=>args.at(-1)==='cli.py').some(a=>String(a).includes('synthetic_arguments='+(privacy==='synthetic'?'True':'False'))));
 }
});
