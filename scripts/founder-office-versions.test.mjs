import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import Database from 'better-sqlite3';
import {openOfficeVersions} from './founder-office-versions.mjs';
test('complete resource snapshot requires explicit current planning status and retains stale included entries',()=>fixture(file=>{
 const a=openOfficeVersions(file);a.put('plan','a',0,{});a.put('calendar','r',0,{});
 a.put('assignment','a',0,{plan:{kind:'plan',key:'a',version:1},calendar:{kind:'calendar',key:'r',version:1}});
 assert.equal(a.resourceSnapshot(['r']).issues[0].reason,'planning-status-required');
 a.put('planning','a',0,{assignmentVersion:1,status:'included'});
 assert.equal(a.resourceSnapshot(['r']).included.length,1);
 a.put('calendar','r',1,{});assert.equal(a.resourceSnapshot(['r']).issues[0].reason,'stale-assignment-dependency');
 assert.throws(()=>a.put('planning','a',1,{assignmentVersion:1,status:'included'}),/version/i);
 a.put('planning','a',1,{assignmentVersion:1,status:'withdrawn'});
 const reopened=openOfficeVersions(file).resourceSnapshot(['r']);assert.equal(reopened.excluded[0].planning.value.status,'withdrawn');assert.equal(reopened.issues.length,0);
 assert.throws(()=>a.put('planning','a',1,{assignmentVersion:1,status:'draft'}),/version/i);
}));
test('assignment writes atomically reject stale dependencies and preserve history',()=>fixture(file=>{
 const a=openOfficeVersions(file);a.put('plan','a',0,{x:1});a.put('calendar','r',0,{x:2});
 const value={plan:{kind:'plan',key:'a',version:1},calendar:{kind:'calendar',key:'r',version:1}};
 a.put('assignment','a',0,value);assert.equal(openOfficeVersions(file).resolveAssignments([{key:'a',version:1}])[0].plan.version,1);
 a.put('plan','a',1,{x:3});assert.throws(()=>a.put('assignment','a',1,value),/version/i);
 assert.equal(a.history('assignment','a').length,1);assert.throws(()=>a.resolveAssignments([{key:'a',version:1}]),/version/i);
 assert.throws(()=>a.put('assignment','alias',0,{...value,plan:{...value.plan,version:2}}),/references/i);
 assert.equal(a.get('assignment','alias'),null);
}));
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-versions-'));try{fn(path.join(dir,'versions.db'));}finally{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}}
test('missing reads create no file; revisions survive reopen and reject stale writers',()=>fixture(file=>{const a=openOfficeVersions(file);assert.equal(a.get('plan','a'),null);assert.equal(fs.existsSync(file),false);const v=a.put('plan','a',0,{x:1});assert.equal(v.version,1);const b=openOfficeVersions(file);assert.deepEqual(b.get('plan','a'),v);b.put('plan','a',1,{x:2});assert.throws(()=>a.put('plan','a',1,{x:3}),/version/i);assert.equal(a.get('plan','a').version,2);assert.equal(a.history('plan','a').length,2);}));
test('invalid writes leave history unchanged and tampered payload fails closed',()=>fixture(file=>{const a=openOfficeVersions(file);a.put('calendar','a',0,{x:1});assert.throws(()=>a.put('calendar','a',1,{password:'bad'}));assert.equal(a.get('calendar','a').version,1);const db=new Database(file);db.prepare('UPDATE office_versions SET payload=?').run('{"x":999}');db.close();assert.throws(()=>a.get('calendar','a'),/integrity/i);}));
test('snapshot checks latest versions across plan and calendar together',()=>fixture(file=>{const a=openOfficeVersions(file);a.put('plan','a',0,{x:1});a.put('calendar','r',0,{x:2});const refs=[{kind:'plan',key:'a',version:1},{kind:'calendar',key:'r',version:1}];assert.equal(a.resolve(refs).length,2);a.put('calendar','r',1,{x:3});assert.throws(()=>a.resolve(refs),/version/i);assert.throws(()=>a.resolve([{kind:'plan',key:'missing',version:1}]),/version/i);}));
