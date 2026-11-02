import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import Database from 'better-sqlite3';
import {captureOperationalAudit,verifyCapture} from './numaron-audit-capture.mjs';
import {createSecurityAudit} from './founder-security-audit.mjs';
test('capture verifies HTTP source chain and exports restricted metadata',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-http-capture-'));
 try{const file=path.join(base,'artifacts/founder-integration-20261012/security-http.jsonl');const audit=createSecurityAudit({file});assert.equal(audit.record({event:'login',method:'POST',route:'/api/session',status:200,body:'SECRET'}),true);
 const destination=path.join(base,'capture'),report=captureOperationalAudit({base,destination});assert.equal(report.sources.find(x=>x.id==='security-http').sourceChain.valid,true);assert.equal(verifyCapture(destination).valid,true);assert.equal(fs.readFileSync(path.join(destination,'security-http.jsonl'),'utf8').includes('SECRET'),false);
 }finally{assert.equal(path.dirname(path.resolve(base)),path.resolve(os.tmpdir()));fs.rmSync(base,{recursive:true,force:true});}
});
test('empty manifest does not constitute a verified capture',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-empty-capture-'));
 try{fs.writeFileSync(path.join(dir,'SHA256.json'),JSON.stringify({schema:'numaron-audit-manifest-v1',files:[]}));assert.equal(verifyCapture(dir).valid,false);}
 finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
test('read-only evidence capture exports ordered metadata, reports gaps and detects alteration',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-audit-capture-'));
 try{const dir=path.join(base,'artifacts/founder-autonomy-20261013');fs.mkdirSync(dir,{recursive:true});const db=new Database(path.join(dir,'controller.db'));db.exec("CREATE TABLE founder_events(seq INTEGER PRIMARY KEY,at TEXT,task_id TEXT,action TEXT); INSERT INTO founder_events VALUES(1,'2026-10-23T00:00:00Z','test-task','done');");
 const destination=path.join(base,'capture');const report=captureOperationalAudit({base,destination});
 assert.equal(db.prepare('select count(*) n from founder_events').get().n,1);db.close();
 assert.equal(report.sources.find(x=>x.id==='controller').records,1);assert.ok(report.sources.some(x=>x.status==='missing'));assert.equal(verifyCapture(destination).valid,true);
 const metadata=fs.readFileSync(path.join(destination,'controller.jsonl'),'utf8');assert.match(metadata,/test-task/);
 fs.appendFileSync(path.join(destination,'controller.jsonl'),'alteration');assert.equal(verifyCapture(destination).valid,false);
 assert.throws(()=>captureOperationalAudit({base,destination}),/exist/i);
 }finally{assert.equal(path.dirname(path.resolve(base)),path.resolve(os.tmpdir()));fs.rmSync(base,{recursive:true,force:true});}
});
