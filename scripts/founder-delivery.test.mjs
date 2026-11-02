import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {openFounderDelivery} from './founder-delivery.mjs';
test('reconciliation never overwrites an edited tagged Markdown file',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-edit-'));let d,writes=0;const content='Original private output. '.repeat(20);
 const s=openFounderDelivery({directory,access:()=>({available:true,credential:'t',scope:{account:'numaronia@gmail.com',folderId:'folder1'}}),request:async(u,o)=>{if(o.method!=='GET'){writes++;return Response.json({id:'remote1',md5Checksum:createHash('md5').update(content).digest('hex')});}return Response.json(u.includes('files?')?{files:[{id:'remote1',parents:['folder1'],appProperties:{numaronOperation:d.operationId,digest:d.digest},md5Checksum:'changed'}]}:{id:'remote1',md5Checksum:'changed'});}});
 try{d=s.prepare({resultId:'edit',content,digest:createHash('sha256').update(content).digest('hex'),format:'markdown',checks:{schema:true,sourceIds:['s']}});await assert.rejects(s.publish(d.operationId));assert.equal(writes,0);}finally{s.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('native document version survives restart separately from markdown',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-native-'));let s=openFounderDelivery({directory});const content='Private source-based document. '.repeat(15),input={resultId:'r1',digest:createHash('sha256').update(content).digest('hex'),content,checks:{schema:true,sourceIds:['s1']}};
 try{const md=s.prepare({...input,format:'markdown'}),doc=s.prepare({...input,format:'document'});assert.notEqual(md.operationId,doc.operationId);s.close();s=openFounderDelivery({directory});assert.equal(s.read(doc.operationId).format,'document');}finally{s.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('two processes never repeat an uncertain create and canceled work makes no request',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-race-'));let creates=0,gets=0,release,racing=false;const barrier=new Promise(r=>release=r);
 const access=()=>({available:true,credential:'token',scope:{account:'numaronia@gmail.com',folderId:'folder1'}});
 const request=async(u,o)=>{if(o.method==='GET'){if(!racing)throw Error('unexpected network');if(++gets===2)release();await barrier;return Response.json({files:[]});}creates++;throw Error('uncertain');};
 const a=openFounderDelivery({directory,access,request}),b=openFounderDelivery({directory,access,request});const content='Useful private result. '.repeat(30);const d=a.prepare({resultId:'r1',digest:createHash('sha256').update(content).digest('hex'),content,format:'markdown',checks:{schema:true,sourceIds:['s1']}});
 try{await assert.rejects(a.publish(d.operationId,{assertActive(){throw Error('paused');},signal:new AbortController().signal}),/paused/);assert.equal(gets,0);racing=true;await Promise.allSettled([a.publish(d.operationId),b.publish(d.operationId)]);assert.equal(creates,1);}finally{a.close();b.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('local delivery persists exact version, rejects missing checks and does not duplicate on restart',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-'));let s=openFounderDelivery({directory});const content='A useful private deliverable. '.repeat(20),digest=createHash('sha256').update(content).digest('hex'),input={resultId:'r1',orderId:null,digest,content,format:'markdown',checks:{schema:true,sourceIds:['s1'],independentFactualVerification:false}};
 try{assert.throws(()=>s.prepare({...input,checks:{}}));const a=s.prepare(input);assert.equal(a.independentFactualVerification,false);assert.equal(s.prepare(input).operationId,a.operationId);s.close();s=openFounderDelivery({directory});assert.equal(s.prepare(input).operationId,a.operationId);assert.equal(s.snapshot().length,1);assert.equal(s.read(a.operationId).content,content);}finally{s.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('unknown Drive outcome reconciles by operation ID before another create',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-'));let created=0,remote=null;const request=async(u,o)=>{if(o.method==='GET')return Response.json({files:remote?[remote]:[]});if(o.method==='PATCH')return Response.json({id:remote.id,md5Checksum:createHash('md5').update(o.body).digest('hex')});created++;const m=JSON.parse(o.body.split('\r\n\r\n')[1].split('\r\n--')[0]);remote={id:'remote1',parents:m.parents,appProperties:m.appProperties,md5Checksum:createHash('md5').update(content).digest('hex')};throw Error('response lost');};
 const s=openFounderDelivery({directory,access:()=>({available:true,credential:'token',scope:{account:'numaronia@gmail.com',folderId:'folder1'}}),request});
 const content='Specific useful private work. '.repeat(20),digest=createHash('sha256').update(content).digest('hex');
 try{const d=s.prepare({resultId:'r1',digest,content,format:'markdown',checks:{schema:true,sourceIds:['s1']}});await assert.rejects(s.publish(d.operationId));assert.equal(s.snapshot()[0].remoteStatus,'unknown');const r=await s.publish(d.operationId);assert.equal(r.remoteId,'remote1');assert.equal(created,1);}finally{s.close();fs.rmSync(directory,{recursive:true,force:true});}
});
