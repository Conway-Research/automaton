import test from 'node:test';import assert from 'node:assert/strict';
import {repairPatchPayload} from './founder-project-repair-tools.mjs';import {profileFilesDigest} from './founder-work-profiles.mjs';
import {repairSourceAnchors,normalizeAnchoredRepair} from './founder-project-repair-anchors.mjs';import {applyProjectPatches} from './founder-project-patches.mjs';
const source='import json\n\nimport sys\n\ndef run():\n return 1\n',files=[{path:'example.py',content:source}],selection={path:'example.py',symbols:['run'],startLine:0,lineCount:20},inspection={path:'example.py',filesDigest:profileFilesDigest(files),wholeFile:true,imports:['import json\n','import sys\n'],snippets:[{symbol:'whole-file',startLine:1,endLine:6,text:source}]},request={phase:'repair',outputFormat:'exact-patches-v1',repairProtocol:'inspect-and-patch-v2',repairTools:'contextual-v1',repairInspection:'selected-source-only-v1',repairEditProtocol:'inspection-anchors-v1',requirements:[],design:{components:[{path:'example.py',purpose:'Example'}]},files};
test('model replaces an inspected import anchor without copying intervening blank lines',()=>{
 const anchors=repairSourceAnchors(request,selection,inspection),a=anchors.find(a=>a.text==='import json\n');assert(a);
 const raw={baseFilesDigest:profileFilesDigest(files),patches:[{path:'example.py',anchorId:a.anchorId,replacement:'import json, math\n'}]},normalized=normalizeAnchoredRepair(raw,request,selection,inspection);
 const result=applyProjectPatches(files,{baseFilesDigest:raw.baseFilesDigest,patches:normalized.patches.map(p=>({path:p.path,oldText:p.before,newText:p.replacement}))},request.design);
 assert.equal(result[0].content,source.replace('import json','import json, math'));assert.equal(files[0].content,source);
 const payload=repairPatchPayload(request,selection,inspection),schema=payload.response_format.schema.properties.patches.items;assert(schema.properties.anchorId);assert(!schema.properties.before);assert(payload.messages[1].content.includes('sourceAnchors'));
});
test('unknown IDs, foreign paths, stale source, duplicate and overlapping anchors reject',()=>{
 const anchors=repairSourceAnchors(request,selection,inspection),all=anchors.find(a=>a.text===source),line=anchors.find(a=>a.text==='import json\n'),base={baseFilesDigest:profileFilesDigest(files)},patch=a=>({path:'example.py',anchorId:a.anchorId,replacement:'replacement\n'});
 assert.throws(()=>normalizeAnchoredRepair({...base,patches:[{...patch(line),anchorId:'unknown'}]},request,selection,inspection),/anchor/i);
 assert.throws(()=>normalizeAnchoredRepair({...base,patches:[{...patch(line),path:'other.py'}]},request,selection,inspection),/selected/i);
 assert.throws(()=>normalizeAnchoredRepair({...base,patches:[patch(line),patch(line)]},request,selection,inspection),/overlap|repeat/i);
 assert.throws(()=>normalizeAnchoredRepair({...base,patches:[patch(all),patch(line)]},request,selection,inspection),/overlap/i);
 assert.throws(()=>normalizeAnchoredRepair({...base,patches:[patch(line)]},{...request,files:[{path:'example.py',content:source+'# changed\n'}]},selection,inspection),/source|inspection/i);
 assert.throws(()=>normalizeAnchoredRepair({...base,patches:[{...patch(line),before:'guessed'}]},request,selection,inspection),/shape|format/i);
});
test('ambiguous text never becomes an anchor; old payload shape remains unchanged',()=>{
 const f=[{path:'example.py',content:'repeat\nrepeat\nsecret\n'}],i={path:'example.py',filesDigest:profileFilesDigest(f),wholeFile:false,imports:[],snippets:[{text:'repeat\n'}]};assert.deepEqual(repairSourceAnchors({...request,files:f},selection,i),[]);
 const old={...request};delete old.repairEditProtocol;const p=repairPatchPayload(old,selection,inspection);assert(p.response_format.schema.properties.patches.items.properties.before);assert(!p.messages[1].content.includes('sourceAnchors'));assert.deepEqual(repairPatchPayload(old,selection,inspection),p);
});
test('a fully inspected empty file has one explicit replacement anchor; repeated zero-length anchors reject',()=>{
 const f=[{path:'example.py',content:''}],r={...request,files:f},i={path:'example.py',filesDigest:profileFilesDigest(f),wholeFile:true,imports:[],snippets:[{text:''}]},anchors=repairSourceAnchors(r,selection,i);assert.equal(anchors.length,1);assert.equal(anchors[0].text,'');
 const p={path:'example.py',anchorId:anchors[0].anchorId,replacement:'# model source\n'},raw={baseFilesDigest:profileFilesDigest(f),patches:[p]};assert.equal(normalizeAnchoredRepair(raw,r,selection,i).patches[0].before,'');assert.throws(()=>normalizeAnchoredRepair({...raw,patches:[p,p]},r,selection,i),/repeat|overlap/i);
});
test('explicit unique-line anchors preserve surrounding structural text and remain inside the inspected source',()=>{
 const r={...request,repairAnchorPolicy:'unique-lines-v1'},anchors=repairSourceAnchors(r,selection,inspection),a=anchors.find(x=>x.text===' return 1\n');assert(a&&a.anchorId.startsWith('l'));const n=normalizeAnchoredRepair({baseFilesDigest:profileFilesDigest(files),patches:[{path:'example.py',anchorId:a.anchorId,replacement:' return 2\n'}]},r,selection,inspection),result=applyProjectPatches(files,{baseFilesDigest:n.baseFilesDigest,patches:n.patches.map(p=>({path:p.path,oldText:p.before,newText:p.replacement}))},r.design);assert.equal(result[0].content,source.replace('return 1','return 2'));assert(!repairSourceAnchors(request,selection,inspection).some(x=>x.anchorId.startsWith('l')));
 const f=[{path:'example.py',content:'duplicate\nduplicate\nunique\nsecret\n'}],i={path:'example.py',filesDigest:profileFilesDigest(f),wholeFile:false,imports:[],snippets:[{text:'duplicate\nduplicate\nunique\n'}]},bounded=repairSourceAnchors({...r,files:f},selection,i);assert(!bounded.some(x=>x.anchorId.startsWith('l')&&x.text==='duplicate\n'));assert(!bounded.some(x=>x.text==='secret\n'));assert(bounded.some(x=>x.text==='unique\n'));
});
test('line anchors require full physical inspected lines and stay under an explicit count bound',()=>{
 const r={...request,repairAnchorPolicy:'unique-lines-v1'},f=[{path:'example.py',content:'prefix partial\nnext\n'}],i={path:'example.py',filesDigest:profileFilesDigest(f),wholeFile:false,imports:[],snippets:[{text:'partial\nnext\n'}]},anchors=repairSourceAnchors({...r,files:f},selection,i);assert(!anchors.some(a=>a.anchorId.startsWith('l')&&a.text==='partial\n'));assert(anchors.some(a=>a.anchorId.startsWith('l')&&a.text==='next\n'));
 const many=Array.from({length:90},(_,n)=>'value_'+n+' = '+n+'\n').join(''),mf=[{path:'example.py',content:many}],mi={path:'example.py',filesDigest:profileFilesDigest(mf),wholeFile:true,imports:[],snippets:[{text:many}]};assert.equal(repairSourceAnchors({...r,files:mf},selection,mi).filter(a=>a.anchorId.startsWith('l')).length,48);
 assert.throws(()=>repairSourceAnchors({...r,repairAnchorPolicy:'unbounded'},selection,inspection),/policy/i);
});
