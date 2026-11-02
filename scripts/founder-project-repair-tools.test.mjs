import test from 'node:test';import assert from 'node:assert/strict';
import {compactRepairFeedback,repairSelectionPayload,repairPatchPayload,validateSourceInspection,inspectProjectSource} from './founder-project-repair-tools.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
test('versioned repair feedback preserves exact rejected-edit cause alongside oracle examples',()=>{
 const feedback={examples:[{id:'persist',feedback:{expected:{ok:true},actual:{error:'bad'}}}],failedCases:['persist','model-edit-not-applicable'],modelEditError:{kind:'PATCH_NOT_APPLICABLE',message:'Old text was not present in the inspected source; select the relevant exact source before editing'},log:'Model edit rejected without source changes: Old text was not present in the inspected source; select the relevant exact source before editing'};
 const legacy=compactRepairFeedback(feedback),updated=compactRepairFeedback(feedback,{includeEditErrors:true});
 assert.equal(legacy.modelEditError,undefined,'Existing receipt payloads must remain reproducible');
 assert.deepEqual(updated.modelEditError,feedback.modelEditError);
 assert.equal(updated.examples.length,1);
});
test('versioned compact feedback retains observed exception and triggering input from structured checks',()=>{
 const feedback={failedCases:['persist'],examples:[{id:'persist',feedback:{input:{database:'state.db',stock:{A:5},commands:[]},expected:{ok:true},actual:{error:'invalid-request'},error:'NUMARON_SOURCE_EXCEPTIONS [{"file":"/source/cli.py","line":33,"type":"NameError","message":"name re is not defined"}]'}}],log:'A truncated tail without the original exception'};
 const legacy=compactRepairFeedback(feedback),updated=compactRepairFeedback(feedback,{includeEditErrors:true});
 assert.equal(legacy.sourceExceptions.length,0);
 assert.equal(updated.sourceExceptions[0].type,'NameError');
 assert.deepEqual(updated.examples[0].input,feedback.examples[0].feedback.input);
});
test('v2 repair feedback locates actual early return without an exception and keeps old payloads stable',()=>{
 const feedback={examples:[{id:'database',feedback:{input:{database:'case.db'},expected:{ok:true},actual:{error:'invalid-request'},error:'NUMARON_SOURCE_STEPS [{"file":"/source/cli.py","line":2,"function":"main","event":"line"},{"file":"/source/cli.py","line":3,"function":"main","event":"return"}]\n'}}],log:''};
 assert.equal(compactRepairFeedback(feedback).sourceSteps,undefined);
 const value=compactRepairFeedback(feedback,{includeEditErrors:true});assert.equal(value.sourceSteps[0].file,'cli.py');assert.equal(value.sourceSteps.at(-1).event,'return');
 const p=repairSelectionPayload({...request,repairProtocol:'inspect-and-patch-v2',feedback});assert(p.messages[1].content.includes('sourceLine'));
});
test('primitive argument evidence is exposed only under an explicitly synthetic repair scope',()=>{
 const feedback={examples:[{id:'database',feedback:{expected:{ok:true},actual:{error:'invalid-request'},error:'NUMARON_SYNTHETIC_EXCEPTION_ARGUMENTS [{"file":"/source/core.py","line":3,"function":"__init__","arguments":{"db_path":"/state/case.db","password":"never-forward","custom":{"unsafe":true}}}]\n'}}]};
 assert.equal(compactRepairFeedback(feedback,{includeEditErrors:true}).sourceArguments,undefined);
 const f=compactRepairFeedback(feedback,{includeEditErrors:true,includeSyntheticArguments:true});assert.deepEqual(f.sourceArguments[0].arguments,{db_path:'/state/case.db'});
 const synthetic=repairSelectionPayload({...request,privacy:'synthetic',repairProtocol:'inspect-and-patch-v2',feedback}),publicRequest=repairSelectionPayload({...request,privacy:'public',repairProtocol:'inspect-and-patch-v2',feedback});assert(synthetic.messages[1].content.includes('sourceArguments'));assert(!publicRequest.messages[1].content.includes('sourceArguments'));
});
test('hypothesis planning remembers verified no-effect source selections and filters stale file revisions',()=>{
 const memory={requestId:'e'.repeat(64),path:'core.py',symbols:['Core.__init__'],reason:'Investigated this helper and produced no effective edit',outcome:'NO_EFFECT',fileDigest:profileFilesDigest([files[1]])},feedback={...request.feedback,rejectedEdits:[memory]};
 const p=repairSelectionPayload({...request,repairProtocol:'inspect-and-patch-v2',repairPlanning:'hypothesis-memory-v1',feedback}),data=JSON.parse(p.messages[1].content.split('\nTASK_DATA\n')[1]);
 assert(p.response_format.schema.required.includes('hypothesis'));assert.equal(Object.keys(p.response_format.schema.properties).sort()[0],'hypothesis');assert.equal(data.feedback.rejectedEdits[0].path,'core.py');assert(!JSON.stringify(data.feedback.rejectedEdits).includes('e'.repeat(64)));assert(p.messages[0].content.includes('caller'));
 const stale=repairSelectionPayload({...request,repairProtocol:'inspect-and-patch-v2',repairPlanning:'hypothesis-memory-v1',feedback:{...feedback,rejectedEdits:[{...memory,fileDigest:'0'.repeat(64)}]}});assert.equal(JSON.parse(stale.messages[1].content.split('\nTASK_DATA\n')[1]).feedback.rejectedEdits,undefined);
 assert(!repairSelectionPayload(request).response_format.schema.required.includes('hypothesis'));
});
test('contextual tool protocol supplies caller diagnostics and orders before source ahead of replacement',()=>{
 const feedback={examples:[{id:'caller',feedback:{expected:{ok:true},actual:{error:'bad'},error:'NUMARON_SOURCE_EXCEPTIONS [{"file":"/source/cli.py","line":2,"type":"ValueError","message":"bad caller argument"},{"file":"/source/core.py","line":3,"type":"ValueError","message":"bad caller argument"}]'}}]},r={...request,repairProtocol:'inspect-and-patch-v2',repairTools:'contextual-v1',feedback};
 const select=repairSelectionPayload(r),data=JSON.parse(select.messages[1].content.split('\nTASK_DATA\n')[1]);assert(data.interfaces.find(f=>f.path==='cli.py').excerpts[0].text.includes('from core import run'));
 const old=repairSelectionPayload({...r,repairTools:undefined});assert.equal(JSON.parse(old.messages[1].content.split('\nTASK_DATA\n')[1]).interfaces[0].excerpts,undefined);
 const inspection={path:'core.py',filesDigest:profileFilesDigest(files),wholeFile:true,snippets:[{text:files[1].content}],imports:[]},patch=repairPatchPayload(r,{path:'core.py',reason:'Fix caller interaction'},inspection),schema=patch.response_format.schema.properties.patches.items;
 assert.equal(Object.keys(schema.properties).sort()[0],'before');assert(schema.required.includes('replacement'));assert(!schema.properties.oldText);assert(patch.messages[0].content.includes('replacement'));assert(!patch.messages[0].content.includes('oldText'));
});
test('explicit contextual symbol selection reads the complete named definition despite line hints',async()=>{
 for(const preferSymbols of [false,true]){
  const seen=[],selection={path:'core.py',symbols:['Core.__init__'],startLine:2,lineCount:1};
  const result=await inspectProjectSource({image:'sha256:'+'b'.repeat(64),files,selection,preferSymbols,process:async(args,opts)=>{if(args[0]==='run'){const b=JSON.parse(opts.input);seen.push(b.selection);return {code:0,stdout:JSON.stringify({path:'core.py',filesDigest:profileFilesDigest(files),wholeFile:false,imports:[],snippets:[{text:' def __init__(self, path):\n  self.path = path\n'}]}),stderr:''};}return {code:0,stdout:'',stderr:''};}});
  assert.equal(seen[0].startLine,preferSymbols?0:2);assert.equal(selection.startLine,2);assert.equal(result.selectionMode,preferSymbols?'qualified-symbols':undefined);
 }
});
const files=[{path:'cli.py',content:'from core import run\nrun()\n'},{path:'core.py',content:'class Core:\n def __init__(self, path):\n  self.path = path\n'}],request={projectId:'test',phase:'repair',requirements:[{id:'R1',text:'Keep state durable'}],design:{components:files.map(f=>({path:f.path,purpose:'Own module'}))},files,feedback:{failedCases:['persist'],log:'INDEPENDENT HOST ORACLE:\n'+JSON.stringify([{id:'persist',passed:false,inputDigest:'a'.repeat(64),feedback:{expected:{ok:true},actual:{error:'bad'},error:'NUMARON_SOURCE_EXCEPTIONS [{"file":"/source/core.py","line":3,"type":"TypeError","message":"NoneType"}]'}}])}};
test('repair inspection separates actual symptoms from digest noise and constrains selection',()=>{
 const f=compactRepairFeedback(request.feedback);assert.deepEqual(f.failedCases,['persist']);assert.equal(f.sourceExceptions[0].file,'core.py');assert(!JSON.stringify(f).includes('a'.repeat(64)));assert(f.examples.some(e=>e.id==='persist'));
 const p=repairSelectionPayload(request);assert(p.messages[1].content.startsWith('TASK:'));assert.deepEqual(p.response_format.schema.properties.path.enum,['cli.py','core.py']);assert.equal(p.max_tokens,384);
});
test('selected exact source is bound to immutable current files and patches cannot touch other paths',()=>{
 const inspection={path:'core.py',filesDigest:profileFilesDigest(files),wholeFile:true,snippets:[{text:files[1].content}],imports:[]};assert.equal(validateSourceInspection(inspection,request.files,{path:'core.py'}),true);
 const p=repairPatchPayload(request,{path:'core.py',reason:'Fix failure'},inspection);assert.deepEqual(p.response_format.schema.properties.patches.items.properties.path.enum,['core.py']);assert.equal(p.response_format.schema.properties.patches.maxItems,4);assert(p.messages[1].content.includes(files[1].content.split('\n')[0]));
 assert.equal(validateSourceInspection({...inspection,snippets:[{text:'forged code'}]},files,{path:'core.py'}),false);assert.equal(validateSourceInspection({...inspection,filesDigest:'0'.repeat(64)},files,{path:'core.py'}),false);
});
test('source inspector only parses source as data in a bounded network-none container',async()=>{
 const calls=[],selection={path:'core.py',symbols:['Core.__init__'],startLine:0,lineCount:40};
 const result=await inspectProjectSource({image:'sha256:'+'b'.repeat(64),files,selection,process:async(args,opts)=>{calls.push({args,opts});return {code:0,stdout:JSON.stringify({path:'core.py',filesDigest:profileFilesDigest(files),wholeFile:false,imports:[],snippets:[{text:' def __init__(self, path):\n  self.path = path\n'}]}),stderr:''};}});
 assert.equal(result.path,'core.py');assert(calls[0].args.includes('--network=none'));assert(calls[0].args.includes('--memory=128m'));assert(calls[0].args.includes('--read-only'));assert(calls[0].args.some(a=>a.includes('ast.parse')));assert(!calls[0].args.some(a=>a.includes('runpy.run_path')));assert(!calls[0].args.some(a=>a.includes('type=bind')));
});

test('explicit next-read symbol budget is enforced by schema without changing default historical payloads',()=>{const request={phase:'repair',requirements:[],files:[{path:'cli.py',content:'def main():\n    pass\n'}],design:{components:[{path:'cli.py',purpose:'CLI'}]},repairProtocol:'inspect-and-patch-v2',repairTools:'contextual-v1',repairInspection:'selected-source-only-v1',feedback:{log:''}};const baseline=repairSelectionPayload(request),limited=repairSelectionPayload({...request,repairSourceSymbolLimit:1});assert.equal(baseline.response_format.schema.properties.symbols.maxItems,3);assert.equal(limited.response_format.schema.properties.symbols.maxItems,1);assert.match(limited.messages[1].content,/symbol budget: 1/i);assert.throws(()=>repairSelectionPayload({...request,repairSourceSymbolLimit:4}),/symbol.*budget|budget.*symbol/i);});

test('verified historical rejection causes survive compact feedback after a later source-size error',()=>{const error={kind:'PATCH_NOT_APPLICABLE',message:'Old text matches multiple locations in cli.py; include unique context'},feedback={modelEditError:{kind:'PATCH_NOT_APPLICABLE',message:'Selected source exceeds 6000 characters'},rejectedEdits:[{requestId:'a'.repeat(64),path:'cli.py',fileDigest:'b'.repeat(64),symbols:['main'],reason:'Original model hypothesis',outcome:'NOT_APPLICABLE',error}],log:''};const result=compactRepairFeedback(feedback,{includeEditErrors:true,includeRejectedEdits:true});assert.deepEqual(result.rejectedEdits[0].error,error);assert.match(result.modelEditError.message,/6000/);assert.equal(compactRepairFeedback({...feedback,rejectedEdits:[{...feedback.rejectedEdits[0],error:{kind:'invented',message:'untrusted'}}]},{includeEditErrors:true,includeRejectedEdits:true}).rejectedEdits[0].error,undefined);});
