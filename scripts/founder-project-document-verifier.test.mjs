import test from 'node:test';import assert from 'node:assert/strict';
import {documentExamples} from './founder-project-document-verifier.mjs';
test('documentation examples bind real request/response blocks and detect invalid commands',()=>{
 const text='```json\n'+JSON.stringify({stock:{A:5},commands:[{id:'one',op:'reserve',reservation:'r',sku:'A',qty:2,expected_version:0}]})+'\n```\n```json\n'+JSON.stringify({results:[{ok:true,version:1,replayed:false}],state:{version:1}})+'\n```';
 const examples=documentExamples(text);assert.equal(examples.length,1);assert.equal(examples[0].errors.length,0);assert(examples[0].expected.results);assert.equal(examples[0].line,1);
 const bad=documentExamples('```json\n{"stock":{"A":5},"database":"bad","commands":[{"id":"one","op":"reserve"}]}\n```');assert(bad[0].errors.some(s=>s.includes('expected_version')));assert(bad[0].errors.some(s=>s.includes('database')));
 assert.throws(()=>documentExamples('```json\nnot-json\n```'),/JSON/);
});

test('document execution adds real result checks without overriding the original oracle',async()=>{
 const {createProjectDocumentVerifier}=await import('./founder-project-document-verifier.mjs');const {digest}=await import('./founder-restoration-integrity.mjs');
 for(const [basePass,examplePass]of [[true,true],[false,true],[true,false]]){
  const image='sha256:'+'a'.repeat(64),calls=[],base={image,entrypoint:'cli.py',oracleDigest:digest('base'),acceptanceDigest:digest('acceptance'),async verify(){return {passed:basePass,tests:1,exitCode:basePass?0:1,sourceDigest:digest('files'),image,network:'none',hostMounts:false,checks:[{id:'original',passed:basePass}]};}};
  const verifier=createProjectDocumentVerifier({base,process:async(args,options)=>{calls.push({args,options});return {code:0,stdout:args.at(-1)==='cli.py'?JSON.stringify(examplePass?{results:[{ok:true,version:1,replayed:false}],state:{version:1}}:{error:'invalid-command'}):'',stderr:''};}});
  const readme='```json\n'+JSON.stringify({stock:{A:5},commands:[{id:'one',op:'reserve',reservation:'r',sku:'A',qty:2,expected_version:0}]})+'\n```';
  const result=await verifier.verify({files:[{path:'README.md',content:readme},{path:'cli.py',content:'print()'}]});assert.equal(result.passed,basePass&&examplePass);assert.equal(result.tests,2);assert.equal(verifier.strengthensOracleDigest,base.oracleDigest);
  const execution=calls.find(c=>c.args.at(-1)==='cli.py');assert(execution.args.includes('--network=none'));assert(execution.args.includes('--read-only'));assert(execution.args.includes('--user=65534:65534'));assert(!execution.args.some(a=>a.includes('type=bind')));
 }
});

test('explicit negative examples retain their exact expected error for execution',()=>{
 const examples=documentExamples('```json\n{"stock":{"A":-1},"commands":[]}\n```\n```json\n{"error":"invalid-request"}\n```');assert.deepEqual(examples[0].expected,{error:'invalid-request'});
 const paired=documentExamples('```json\n{"stock":{"A":5},"commands":[{"id":"one","op":"reserve"}]}\n```\n```json\n{"results":[{"ok":false,"error":"invalid-command"}],"state":{"version":0,"stock":{"A":5},"reservations":{}}}\n```');assert(paired[0].expected);assert.equal(paired[0].errors.length,0);
});
