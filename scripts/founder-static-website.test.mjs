import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStaticWebsite,createStaticWebsiteSandbox,generateStaticWebsite} from './founder-static-website.mjs';
import {codeDigest} from './founder-code-sandbox.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
export const website=[{path:'index.html',content:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic</title><link rel="stylesheet" href="style.css"></head><body><nav><a href="#main">Home</a></nav><main id="main"><h1>Synthetic product</h1></main></body></html>'},{path:'style.css',content:'body { margin: 0; } @media (max-width: 600px) { main { padding: 1rem; } }'},{path:'README.md',content:'Synthetic offline site. Open index.html.'}];
test('static website validates local responsive HTML/CSS without executing scripts',()=>{assert.equal(inspectStaticWebsite(website).passed,true);});
test('active content, remote resources, unsafe paths and broken links fail',()=>{
 for(const [path,content] of [['../index.html','x'],['index.html',website[0].content.replace('<main','<script>alert(1)</script><main')],['style.css','@import "https://example.test/a.css";'],['style.css','a{background:url(//example.test/x)}'],['index.html',website[0].content.replace('style.css','missing.css')],['index.html',website[0].content.replace('<body>','<body onclick="x()">')],['index.html',website[0].content.replace('<main','<iframe srcdoc="x"></iframe><main')]]){
  const files=website.filter(f=>f.path!==path);files.push({path,content});assert.equal(inspectStaticWebsite(files).passed,false,path);
 }
});
test('static wrapper runs only fixed validation code in existing offline sandbox and binds original files',async()=>{
 let on=true,calls=0;const image='sha256:'+'a'.repeat(64);
 const node={available:true,image,async probe(){return true;},async run(files){calls++;assert.ok(files.some(f=>f.path==='site.json'));assert.ok(files.every(f=>!f.path.endsWith('.html')));return {passed:true,tests:1,image,network:'none',hostMounts:false,sourceDigest:codeDigest(files)};}};
 const s=createStaticWebsiteSandbox({isEnabled:()=>on,nodeSandbox:node});
 assert.equal(await s.probe(),true);const r=await s.run(website);assert.equal(r.passed,true);assert.equal(r.sourceDigest,profileFilesDigest(website));assert.equal(s.certification.profileId,'static-website');
 on=false;await assert.rejects(s.run(website),/OFF/);assert.equal(calls,1);
});
test('static wrapper rejects false isolation and forged digest evidence',async()=>{
 for(const fault of [{network:'bridge'},{hostMounts:true},{sourceDigest:'foreign'},{tests:0}]){
  const image='sha256:'+'a'.repeat(64),node={available:true,image,async probe(){return true;},async run(files){return {passed:true,tests:1,image,network:'none',hostMounts:false,sourceDigest:codeDigest(files),...fault};}};
  const s=createStaticWebsiteSandbox({isEnabled:()=>true,nodeSandbox:node});await s.probe();await assert.rejects(s.run(website));
 }
});

test('deterministic website worker uses only agreed supplied copy and emits bounded HTML/CSS',async()=>{
 const brief={language:'en',title:'Synthetic & Co',pages:[{path:'index.html',title:'Home',heading:'Synthetic <product>',sections:[{heading:'Details',paragraphs:['Provided synthetic text.']}]}]};
 const r=await generateStaticWebsite({binding:{websiteBrief:brief},grant:{reservationId:'synthetic'}});
 assert.equal(inspectStaticWebsite(r.files).passed,true);assert.match(r.files[0].content,/Synthetic &lt;product&gt;/);
 assert.equal(r.costReceipt.actualCostRappen,0);assert.equal(r.costReceipt.evidenceRef,'local:synthetic');
 assert.deepEqual(r,await generateStaticWebsite({binding:{websiteBrief:brief},grant:{reservationId:'synthetic'}}));
 await assert.rejects(generateStaticWebsite({binding:{websiteBrief:{...brief,pages:[{...brief.pages[0],path:'../index.html'}]}}}));
});

test('fixed encoded runner actually executes the structural check on synthetic files',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'website-fixed-check-')),image='sha256:'+'b'.repeat(64);
 const node={available:true,image,async probe(){return true;},async run(files){
  for(const f of files)fs.writeFileSync(path.join(directory,f.path),f.content,{flag:'wx'});
  const r=spawnSync(process.execPath,['--test','static.test.cjs'],{cwd:directory,encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(r.status,0,r.stdout+r.stderr);
  return {passed:r.status===0,tests:1,image,network:'none',hostMounts:false,sourceDigest:codeDigest(files)};
 }};
 try{const s=createStaticWebsiteSandbox({isEnabled:()=>true,nodeSandbox:node});await s.probe();assert.equal((await s.run(website)).passed,true);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
