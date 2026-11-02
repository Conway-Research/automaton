import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeTestRun} from './founder-certify-offline.mjs';
const tap='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('only complete successful non-skipped test runs certify',()=>{
 assert.equal(summarizeTestRun({output:tap,exitCode:0}).status,'passed');
 for(const args of [{output:tap,exitCode:1},{output:tap,exitCode:null},{output:tap+'# pass 2\n',exitCode:0},{output:'',exitCode:0},{output:tap.replace('# skipped 0','# skipped 1'),exitCode:0},{output:tap.replace('# tests 2','# tests 0'),exitCode:0},{output:tap,exitCode:0,signal:'SIGTERM'}])assert.notEqual(summarizeTestRun(args).status,'passed');
});

import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fingerprintSources,checkCertificateCurrency} from './founder-certify-offline.mjs';
const positive=revision=>({revision,finishedRevision:revision,status:'passed',scope:'offline-synthetic',exitCode:0,tests:2,passed:2,failed:0,skipped:0,cancelled:0,todo:0});
test('currency helper rejects incomplete positive certificates before reading sources',()=>{
 const missing=path.join(os.tmpdir(),'not-present-certificate-source');
 for(const c of [{status:'passed'}, {...positive('a'.repeat(64)),finishedRevision:'b'.repeat(64)},{...positive('a'.repeat(64)),skipped:1}])assert.equal(checkCertificateCurrency(c,missing),'not-passed');
});
test('source fingerprint changes with implementation and test files, not output data',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'founder-fingerprint-'));try{
  fs.mkdirSync(path.join(base,'scripts'));fs.mkdirSync(path.join(base,'outputs'));fs.writeFileSync(path.join(base,'scripts/a.mjs'),'export const value=1');
  const first=fingerprintSources(base);const c=positive(first.revision);assert.equal(checkCertificateCurrency(c,base),'current');
  fs.writeFileSync(path.join(base,'outputs/result.json'),'{}');assert.equal(fingerprintSources(base).revision,first.revision);
  fs.writeFileSync(path.join(base,'scripts/a.mjs'),'export const value=2');assert.equal(checkCertificateCurrency(c,base),'stale');
  fs.writeFileSync(path.join(base,'scripts/negative.test.mjs'),'test');assert.notEqual(fingerprintSources(base).revision,first.revision);
  assert.equal(checkCertificateCurrency({...c,status:'failed'},base),'not-passed');
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('fingerprint covers dashboard markup, styling and shell program sources',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'founder-fingerprint-types-'));try{
  fs.mkdirSync(path.join(base,'web'));fs.mkdirSync(path.join(base,'scripts'));fs.writeFileSync(path.join(base,'scripts/seed.mjs'),'seed');
  for(const file of ['web/index.html','web/style.css','scripts/run.sh','scripts/search-credentials.ts','scripts/search-credentials.ps1']){const before=fingerprintSources(base).revision;fs.writeFileSync(path.join(base,file),'new source');assert.notEqual(fingerprintSources(base).revision,before);}
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
