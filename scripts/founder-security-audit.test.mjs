import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSecurityAudit,verifyAuditRecords} from './founder-security-audit.mjs';

const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'numaron-audit-'));
test('missing active file after rotation preserves archived chain',()=>{
 const dir=temp(),file=path.join(dir,'http.jsonl');
 try{const first=createSecurityAudit({file});assert.equal(first.record({}),true);fs.renameSync(file,file+'.1');
 const reopened=createSecurityAudit({file});assert.equal(reopened.record({}),true);
 const rows=[file+'.1',file].flatMap(p=>fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse));assert.equal(verifyAuditRecords(rows).valid,true);
 assert.equal(verifyAuditRecords([null]).valid,false);
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
test('allowlisted metadata excludes secrets and verifies its record chain',()=>{
 const dir=temp(),file=path.join(dir,'http.jsonl');
 try{const audit=createSecurityAudit({file});
 assert.equal(audit.record({event:'login',method:'POST',route:'/api/session',status:403,reason:'invalid-bootstrap',requestId:'a'.repeat(32),token:'SECRET',cookie:'SECRET',body:'SECRET',url:'/secret?SECRET',sessionRef:'b'.repeat(32)}),true);
 assert.equal(audit.record({event:'http',method:'GET',route:'/unknown/SECRET',status:401,reason:'SECRET'}),true);
 const raw=fs.readFileSync(file,'utf8');assert.equal(raw.includes('SECRET'),false);
 const rows=raw.trim().split('\n').map(JSON.parse);assert.equal(rows[1].route,'other');assert.equal(rows[1].reason,'other');
 assert.equal(verifyAuditRecords(rows).valid,true);rows[0].status=200;assert.equal(verifyAuditRecords(rows).valid,false);
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
test('rotation is bounded, chain continues, and reopen resumes sequence',()=>{
 const dir=temp(),file=path.join(dir,'http.jsonl');
 try{let audit=createSecurityAudit({file,maxBytes:1024,archives:2});
 for(let i=0;i<20;i++)assert.equal(audit.record({event:'http',method:'GET',route:'/',status:200}),true);
 let before=audit.status().written;assert.equal(before,20);
 assert.ok(fs.readdirSync(dir).length<=3);
 const read=()=>[file+'.2',file+'.1',file].filter(fs.existsSync).flatMap(p=>fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
 assert.equal(verifyAuditRecords(read()).valid,true);
 const previous=read().at(-1).seq;audit=createSecurityAudit({file,maxBytes:1024,archives:2});assert.equal(audit.record({event:'http',method:'GET',route:'/',status:200}),true);
 assert.equal(read().at(-1).seq,previous+1);assert.equal(verifyAuditRecords(read()).valid,true);
 for(let n of fs.readdirSync(dir))assert.ok(fs.statSync(path.join(dir,n)).size<=1024);
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
test('nonregular targets and altered logs fail visibly without throwing to caller',()=>{
 const dir=temp(),file=path.join(dir,'http.jsonl');
 try{fs.mkdirSync(file);let audit=createSecurityAudit({file});assert.equal(audit.record({event:'http'}),false);assert.ok(audit.status().errors>0);fs.rmdirSync(file);
 audit=createSecurityAudit({file});audit.record({event:'http',route:'/',status:200});fs.appendFileSync(file,'tampered\n');
 assert.equal(audit.record({event:'http'}),false);
 const reopened=createSecurityAudit({file});assert.equal(reopened.record({event:'http'}),false);assert.ok(reopened.status().errors>0);
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
