import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {boundedProcess} from './founder-code-sandbox.mjs';
import {inspectStaticWebsite} from './founder-static-website.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
import {digest} from './founder-restoration-integrity.mjs';

// Fixed worker; site files arrive as JSON, never as executable Node code.
// The pinned image must already contain Node, Playwright and Chromium. No pull,
// install, host browser, personal profile or --no-sandbox fallback is allowed.
export const browserWorker=String.raw`const fs=require('node:fs');
(async()=>{
 const p=JSON.parse(fs.readFileSync(0,'utf8'));
 const cap=/CapEff:\s+0+\s/.test(fs.readFileSync('/proc/self/status','utf8'));
 let rootReadOnly=false;try{fs.writeFileSync('/numaron-browser-probe','x');}catch(e){rootReadOnly=e.code==='EROFS'||e.code==='EACCES';}
 const protection={uid:process.getuid(),capabilitiesZero:cap,rootReadOnly,networkInterfaces:fs.readdirSync('/sys/class/net')};
 if(protection.uid!==65534||!cap||!rootReadOnly||protection.networkInterfaces.some(x=>x!=='lo'))throw Error('Isolation probe failed');
 const {chromium}=require('playwright');
 const browser=await chromium.launch({headless:true,chromiumSandbox:true});
 try{
  const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});
  const files=new Map(p.files.map(f=>[f.path,f.content]));
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());const name=u.pathname.slice(1);
   if(u.origin!=='https://numaron.invalid'||u.search||!files.has(name))return route.abort();
   return route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':'text/html',headers:{'Content-Security-Policy':"default-src 'none'; style-src 'self'; img-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"},body:files.get(name)});
  });
  const pages=[];let total=0;
  for(const f of p.files.filter(f=>f.path.endsWith('.html')))for(const viewport of p.viewports){
   const page=await context.newPage();await page.setViewportSize(viewport);await page.goto('https://numaron.invalid/'+f.path,{waitUntil:'load',timeout:10000});
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,headings:document.querySelectorAll('h1').length}));
   const bytes=await page.screenshot({type:'png',fullPage:false});total+=bytes.length;if(total>60000)throw Error('Bounded visual evidence limit exceeded');
   pages.push({path:f.path,...viewport,...metrics,screenshot:bytes.toString('base64')});await page.close();
  }
  await context.close();process.stdout.write(JSON.stringify({requestId:p.requestId,filesDigest:p.filesDigest,protection,pages}));
 }finally{await browser.close();}
})().catch(error=>{process.stderr.write('Isolated browser failed: '+String(error.message).slice(0,2000));process.exitCode=1;});`;

export function browserSandboxArgs(image,name,seccompProfile){
 if(!/^sha256:[a-f0-9]{64}$/.test(image??'')||!/^numaron-browser-[a-z0-9-]{1,80}$/.test(name??''))throw Error('Pinned browser image and owned name required');
 if(seccompProfile!==undefined&&!/^\/home\/user\/\.cache\/numaron-browser\/seccomp-[a-f0-9]{64}\.json$/.test(seccompProfile))throw Error('Content-addressed browser seccomp profile required');
 return ['run','--name='+name,'--rm','--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges',...(seccompProfile?['--security-opt=seccomp='+seccompProfile]:[]),'--memory=512m','--memory-swap=512m','--cpus=1','--pids-limit=128','--timeout=55','--tmpfs=/tmp:rw,nosuid,nodev,size=134217728,mode=1777','--tmpfs=/work:rw,nosuid,nodev,noexec,size=16777216,mode=1777','--workdir=/work','--env=HOME=/work','--entrypoint=node','-i',image,'-e',browserWorker];
}

const verifyPolicy=profile=>new Promise((resolve,reject)=>execFile('wsl.exe',['-d','podman-obolus-isolation-test','-u','user','--','sha256sum',profile],{windowsHide:true,timeout:10000,maxBuffer:2000},(error,stdout)=>error?reject(Error('Browser seccomp verification unavailable')):resolve(stdout.trim().split(/\s+/)[0]===profile.match(/seccomp-([a-f0-9]{64})\.json$/)?.[1])));
export function createStaticBrowserRuntime({image,seccompProfile,verifySeccomp=verifyPolicy,isEnabled,process:run=boundedProcess,now=Date.now}={}){
 const active=ctx=>{if(isEnabled?.()!==true)throw Error('Static browser OFF');if(ctx?.signal?.aborted)throw Error('Static browser cancelled');ctx?.assertActive?.();};
 return {
  status:()=>({configured:/^sha256:[a-f0-9]{64}$/.test(image??''),liveVerified:false,network:'none',hostMounts:false,visualReviewRequired:true}),
  async render(product,ctx={}){
   active(ctx);if(!inspectStaticWebsite(product?.files).passed)throw Error('Static browser requires admitted website files');
   const requestId=randomUUID(),files=structuredClone(product.files),filesDigest=profileFilesDigest(files),viewports=[{width:375,height:812},{width:1440,height:900}];
   const args=browserSandboxArgs(image,'numaron-browser-'+requestId,seccompProfile);
   if(seccompProfile){if(await verifySeccomp(seccompProfile)!==true)throw Error('Browser seccomp content changed');active(ctx);}
   let r;try{r=await run(args,{input:JSON.stringify({requestId,files,filesDigest,viewports}),signal:ctx.signal,timeout:60000,assertActive:ctx.assertActive});}
   finally{
    let removed;try{removed=await run(['rm','--force','--ignore','numaron-browser-'+requestId],{timeout:10000});}catch{throw Error('Owned browser cleanup not confirmed');}
    if(removed?.code!==0)throw Error('Owned browser cleanup not confirmed');
   }
   active(ctx);if(r.code!==0||typeof r.stdout!=='string'||Buffer.byteLength(r.stdout)>95000)throw Error('Isolated browser unavailable or output exceeded');
   const p=JSON.parse(r.stdout),protection=p.protection;
   if(p.requestId!==requestId||p.filesDigest!==filesDigest||protection?.uid!==65534||protection.capabilitiesZero!==true||protection.rootReadOnly!==true||!Array.isArray(protection.networkInterfaces)||protection.networkInterfaces.some(x=>x!=='lo'))throw Error('Exact isolated browser proof required');
   const expected=files.filter(f=>f.path.endsWith('.html')).flatMap(f=>viewports.map(v=>({...v,path:f.path}))),seen=new Set();
   if(!Array.isArray(p.pages)||p.pages.length!==expected.length)throw Error('Complete visual viewports required');
   for(const page of p.pages){const key=[page.path,page.width,page.height].join(':');if(seen.has(key)||!expected.some(v=>v.path===page.path&&v.width===page.width&&v.height===page.height)||page.overflow!==false||page.headings!==1||typeof page.screenshot!=='string'||!page.screenshot.length||Buffer.from(page.screenshot,'base64').toString('base64')!==page.screenshot)throw Error('Invalid visual viewport evidence');seen.add(key);}
   active(ctx);return {...p,image,filesDigest,observedAt:now(),expiresAt:now()+60000,network:'none',hostMounts:false,structuralPassed:true,acceptancePassed:false,visualReviewRequired:true};
  }
 };
}

export function createStaticBrowserVisualReader({runtime,review,isEnabled,now=Date.now}={}){
 const active=ctx=>{if(isEnabled?.()!==true||ctx?.signal?.aborted)throw Error('Browser visual review OFF or cancelled');ctx?.assertActive?.();};
 return async(product,ctx)=>{
  active(ctx);if(typeof review!=='function')throw Error('Independent browser visual review missing');
  const rendered=await runtime.render(product,ctx);active(ctx);const renderDigest=digest(rendered);
  const proof=await review({order:structuredClone(ctx.order),rendered:structuredClone(rendered),renderDigest},ctx);active(ctx);
  const keys=['sourceId','externalId','ownerId','buyerId','rootTaskId','sourceRevision','scopeDigest'];
  if(!proof||keys.some(k=>!ctx.order[k]||proof[k]!==ctx.order[k])||proof.verified!==true||proof.acceptancePassed!==true||proof.renderDigest!==renderDigest||!Number.isFinite(proof.observedAt)||proof.observedAt>now()||now()-proof.observedAt>=60000||!Number.isFinite(proof.expiresAt)||proof.expiresAt<=now()||proof.expiresAt>now()+60000||typeof proof.evidenceRef!=='string'||!proof.evidenceRef.length)throw Error('Exact independent browser visual review required');
  return {...ctx.order,verified:true,acceptancePassed:true,filesDigest:rendered.filesDigest,image:rendered.image,network:'none',hostMounts:false,viewports:[{width:375,height:812,passed:true},{width:1440,height:900,passed:true}],renderDigest,evidenceRef:proof.evidenceRef,observedAt:Math.min(proof.observedAt,rendered.observedAt),expiresAt:Math.min(proof.expiresAt,rendered.expiresAt)};
 };
}
