import test from 'node:test';import assert from 'node:assert/strict';
import {browserSandboxArgs,browserWorker,createStaticBrowserRuntime,createStaticBrowserVisualReader} from './founder-static-browser.mjs';
import vm from 'node:vm';import {digest} from './founder-restoration-integrity.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
const image='sha256:'+'c'.repeat(64),at=100000;
const files=[{path:'index.html',content:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title></head><body><main><h1>Synthetic</h1></main></body></html>'},{path:'README.md',content:'Synthetic.'}];
function fake(input){const p=JSON.parse(input);return {code:0,stdout:JSON.stringify({requestId:p.requestId,filesDigest:profileFilesDigest(p.files),protection:{uid:65534,capabilitiesZero:true,rootReadOnly:true,networkInterfaces:['lo']},pages:p.files.filter(f=>f.path.endsWith('.html')).flatMap(f=>p.viewports.map(v=>({path:f.path,...v,overflow:false,headings:1,screenshot:Buffer.from('synthetic-image').toString('base64')})))})};}
test('browser invocation is pinned offline non-root without host/profile mounts or disabled Chromium sandbox',()=>{
 const args=browserSandboxArgs(image,'numaron-browser-fixture');for(const v of ['--network=none','--read-only','--user=65534:65534','--pull=never','--cap-drop=ALL'])assert.ok(args.includes(v));assert.ok(!args.some(x=>/--no-sandbox|--privileged|type=bind|user-data-dir/.test(x)));assert.throws(()=>browserSandboxArgs('latest','numaron-browser-fixture'));
});

test('browser seccomp configuration is content addressed and never unconfined',()=>{
 const policy='/home/user/.cache/numaron-browser/seccomp-'+'a'.repeat(64)+'.json';
 assert.ok(browserSandboxArgs(image,'numaron-browser-test',policy).includes('--security-opt=seccomp='+policy));
 assert.throws(()=>browserSandboxArgs(image,'numaron-browser-test','unconfined'));
 assert.throws(()=>browserSandboxArgs(image,'numaron-browser-test','/tmp/arbitrary.json'));
});

test('changed seccomp content blocks before any container creation',async()=>{
 let calls=0;
 const runtime=createStaticBrowserRuntime({image,seccompProfile:'/home/user/.cache/numaron-browser/seccomp-'+'a'.repeat(64)+'.json',verifySeccomp:async()=>false,isEnabled:()=>true,process:async()=>{calls++;}});
 await assert.rejects(runtime.render({files}),/seccomp content changed/);assert.equal(calls,0);
});
test('OFF performs no browser process and a fake isolated render needs independent acceptance',async()=>{
 let on=false,calls=0;const r=createStaticBrowserRuntime({image,isEnabled:()=>on,now:()=>at,process:async(a,o)=>{if(a[0]==='rm')return {code:0,stdout:''};calls++;return fake(o.input);}});
 await assert.rejects(r.render({files}),/OFF/);assert.equal(calls,0);on=true;
 const result=await r.render({files});assert.equal(result.structuralPassed,true);assert.equal(result.acceptancePassed,false);assert.equal(result.filesDigest,profileFilesDigest(files));assert.equal(calls,1);
});
test('forged output, missing viewport, non-isolation and overflow fail closed',async()=>{
 for(const fault of ['digest','nonce','network','uid','viewport','overflow']){
  const r=createStaticBrowserRuntime({image,isEnabled:()=>true,now:()=>at,process:async(a,o)=>{if(a[0]==='rm')return {code:0};const out=fake(o.input),v=JSON.parse(out.stdout);if(fault==='digest')v.filesDigest='bad';if(fault==='nonce')v.requestId='old';if(fault==='network')v.protection.networkInterfaces.push('eth0');if(fault==='uid')v.protection.uid=0;if(fault==='viewport')v.pages.pop();if(fault==='overflow')v.pages[0].overflow=true;return {...out,stdout:JSON.stringify(v)};}});
  await assert.rejects(r.render({files}));
 }
});
test('render cannot turn fake geometry into visual acceptance or call a review while OFF',async()=>{
 const r=createStaticBrowserRuntime({image,isEnabled:()=>true,now:()=>at,process:async(a,o)=>a[0]==='rm'?{code:0}:fake(o.input)});
 assert.equal(r.status().liveVerified,false);const p=await r.render({files});assert.equal(p.visualReviewRequired,true);
});

test('unconfirmed owned-container cleanup cannot return a successful render',async()=>{
 const r=createStaticBrowserRuntime({image,isEnabled:()=>true,now:()=>at,process:async(a,o)=>a[0]==='rm'?{code:1}:fake(o.input)});
 await assert.rejects(r.render({files}),/cleanup/);
});

test('fixed worker uses sandboxed Chromium, disabled page scripts and only in-memory local routes',async()=>{
 const payload={requestId:'fake',files,filesDigest:profileFilesDigest(files),viewports:[{width:375,height:812},{width:1440,height:900}]};let stdout='',routeHandler,closed=false;
 const context={async route(pattern,handler){routeHandler=handler;},async newPage(){return {async setViewportSize(){},async goto(url){let fulfilled=false;await routeHandler({request:()=>({url:()=>url}),fulfill:async()=>{fulfilled=true;},abort:async()=>{throw Error('local fixture route blocked');}});assert.equal(fulfilled,true);},async evaluate(){return {overflow:false,headings:1};},async screenshot(){return Buffer.from('fake screenshot');},async close(){}};},async close(){}};
 const fs={readFileSync(p){return p===0?JSON.stringify(payload):'CapEff:\t0000000000000000\n';},writeFileSync(){throw Object.assign(Error('readonly'),{code:'EROFS'});},readdirSync(){return ['lo'];}};
 const chromium={async launch(o){assert.equal(o.chromiumSandbox,true);assert.equal(o.headless,true);return {async newContext(c){assert.equal(c.javaScriptEnabled,false);assert.equal(c.serviceWorkers,'block');assert.equal(c.acceptDownloads,false);return context;},async close(){closed=true;}};}};
 await vm.runInNewContext(browserWorker,{require:n=>n==='node:fs'?fs:{chromium},process:{getuid:()=>65534,stdout:{write:v=>stdout+=v},stderr:{write:()=>{throw Error('worker failed');}}},URL});
 let aborted=false;await routeHandler({request:()=>({url:()=> 'https://external.invalid/x'}),abort:async()=>{aborted=true;}});assert.equal(aborted,true);assert.equal(closed,true);assert.equal(JSON.parse(stdout).pages.length,2);
});

test('visual reader binds independent review to exact screenshots and order; geometry alone never approves',async()=>{
 const order={sourceId:'fixture',externalId:'105216',ownerId:'474954',buyerId:'355073',rootTaskId:'laborx-105216-sahil',scopeDigest:'scope',sourceRevision:'r1'},ctx={order,assertActive(){}};
 const runtime=createStaticBrowserRuntime({image,isEnabled:()=>true,now:()=>at,process:async(a,o)=>a[0]==='rm'?{code:0}:fake(o.input)});
 const read=createStaticBrowserVisualReader({runtime,isEnabled:()=>true,now:()=>at,review:async({renderDigest})=>({...order,renderDigest,verified:true,acceptancePassed:true,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:independent-review'})});
 assert.equal((await read({files},ctx)).acceptancePassed,true);
 const bad=createStaticBrowserVisualReader({runtime,isEnabled:()=>true,now:()=>at,review:async()=>({...order,renderDigest:'foreign',verified:true,acceptancePassed:true,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:old-review'})});
 await assert.rejects(bad({files},ctx),/review/);
});
