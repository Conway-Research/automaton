import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDemoMt5Readers} from './founder-mt5-demo.mjs';
const binding={readOnly:true,executionEnabled:false,accountBinding:{demo:true,tradeMode:0}};
function setup(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'market-log-'));const profileFile=path.join(dir,'profile.json');fs.writeFileSync(profileFile,JSON.stringify({version:1,terminal:path.join(dir,'terminal64.exe'),login:123,server:'PRIVATE',portable:true,requireDemo:true,executionEnabled:false}));return {dir,profileFile,readers:createDemoMt5Readers({profileFile,python:'fake',run}),rows:()=>fs.readFileSync(path.join(dir,'market-read-errors.jsonl'),'utf8').trim().split('\n').map(JSON.parse),close(){fs.rmSync(dir,{recursive:true,force:true})}}}
test('failed market process logs only fixed metadata and a per-read correlation ID',async()=>{
 let options,calls=0;const f=setup(async(_p,_args,o)=>{calls++;options=o;throw Object.assign(Error('PRIVATE token=password'),{code:'ENOENT',stderr:'PRIVATE',stdout:'PRIVATE'})});
 try{await assert.rejects(f.readers.market({},'trading'),e=>!e.message.includes('PRIVATE'));assert.equal(calls,1);const [r]=f.rows();assert.equal(r.code,'PROCESS_NOT_FOUND');assert.equal(r.phase,'execute');assert.equal(r.reader,'trading');assert.equal(r.readId,options.env.NUMARON_MARKET_READ_ID);assert.match(r.readId,/^[a-f0-9-]{36}$/);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.ok(r.elapsedMs>=0)}finally{f.close()}
});
test('invalid JSON and missing demo binding have separate safe codes',async()=>{
 for(const [stdout,code] of [['PRIVATE invalid','INVALID_JSON'],[JSON.stringify({...binding,accountBinding:{demo:false}}),'DEMO_EVIDENCE_MISSING']]){const f=setup(async()=>({stdout}));try{await assert.rejects(f.readers.market());assert.equal(f.rows()[0].code,code);assert.equal(JSON.stringify(f.rows()).includes('PRIVATE'),false)}finally{f.close()}}
});
test('timeouts, output limits and unknown failures use fixed codes',async()=>{
 for(const [error,code] of [[{killed:true,signal:'SIGTERM'},'PROCESS_TERMINATED'],[{code:'ETIMEDOUT'},'PROCESS_TIMEOUT'],[{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'},'OUTPUT_LIMIT'],[{code:'PRIVATE'},'PROCESS_FAILED']]){const f=setup(async()=>{throw Object.assign(Error('PRIVATE'),error)});try{await assert.rejects(f.readers.market());assert.equal(f.rows()[0].code,code)}finally{f.close()}}
});
test('successful reads produce no error entry and logging failure cannot retry a failed read',async()=>{
 const f=setup(async()=>({stdout:JSON.stringify(binding)}));try{await f.readers.market();assert.equal(fs.existsSync(path.join(f.dir,'market-read-errors.jsonl')),false)}finally{f.close()}
 let calls=0;const g=setup(async()=>{calls++;throw Error('PRIVATE')});try{fs.mkdirSync(path.join(g.dir,'market-read-errors.jsonl'));await assert.rejects(g.readers.market());assert.equal(calls,1)}finally{g.close()}
});
test('profile changes during a read are separately logged with no account data',async()=>{
 let f;f=setup(async()=>{const p=JSON.parse(fs.readFileSync(f.profileFile));fs.writeFileSync(f.profileFile,JSON.stringify({...p,login:456}));return {stdout:JSON.stringify(binding)}});
 try{await assert.rejects(f.readers.market());assert.equal(f.rows()[0].phase,'profile-recheck');assert.equal(f.rows()[0].code,'PROFILE_CHANGED');assert.equal(JSON.stringify(f.rows()).includes('PRIVATE'),false)}finally{f.close()}
});
test('missing profile is logged without spawning; repeated attempts have distinct IDs',async()=>{
 let calls=0;const f=setup(async()=>{calls++;throw Error('PRIVATE')});try{fs.unlinkSync(f.profileFile);await assert.rejects(f.readers.market());await assert.rejects(f.readers.market());assert.equal(calls,0);const rows=f.rows();assert.equal(rows[0].code,'PROFILE_UNAVAILABLE');assert.notEqual(rows[0].readId,rows[1].readId);assert.equal(rows[0].phase,'profile')}finally{f.close()}
});
