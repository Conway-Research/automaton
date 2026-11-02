import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
const identity=(kind,key)=>{if(!['plan','calendar','assignment','planning'].includes(kind)||typeof key!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(key))throw Error('Invalid version identity');};
// Local audit history, not a customer grant or a signature from an external authority.
export function openOfficeVersions(file){
 const access=(write,fn)=>{
  if(!fs.existsSync(file)&&!write)return fn(null);
  if(fs.existsSync(file)&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))throw Error('Invalid version file');
  if(write)fs.mkdirSync(path.dirname(file),{recursive:true});
  const db=new Database(file,{readonly:!write});
  try{
   if(write)db.exec('CREATE TABLE IF NOT EXISTS office_versions (kind TEXT NOT NULL, key TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(kind,key,version))');
   const transaction=db.transaction(()=>fn(db));return write?transaction.immediate():transaction();
  }finally{db.close();}
 };
 const history=(db,kind,key)=>{
  identity(kind,key);if(!db)return [];
  return db.prepare('SELECT * FROM office_versions WHERE kind=? AND key=? ORDER BY version').all(kind,key).map((r,i)=>{
   let value;try{value=checkedJSON(JSON.parse(r.payload));}catch{throw Error('Version integrity failure');}
   if(r.version!==i+1||digest({kind,key,version:r.version,value})!==r.digest)throw Error('Version integrity failure');
   return {kind,key,version:r.version,value,digest:r.digest};
  });
 };
 const resolve=(db,refs)=>{if(!Array.isArray(refs)||!refs.length||refs.length>200)throw Error('Bounded version references required');return refs.map(r=>{identity(r?.kind,r?.key);const current=history(db,r.kind,r.key).at(-1);if(!Number.isSafeInteger(r.version)||!current||current.version!==r.version)throw Error('Current version required');return current;});};
 return {
  history:(kind,key)=>access(false,db=>history(db,kind,key)),
  get:(kind,key)=>access(false,db=>history(db,kind,key).at(-1)??null),
  put(kind,key,expectedVersion,value){
   identity(kind,key);if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>=Number.MAX_SAFE_INTEGER)throw Error('Invalid expected version');
   const clean=checkedJSON(value);
   return access(true,db=>{const latest=history(db,kind,key).at(-1);if((latest?.version??0)!==expectedVersion)throw Error('Stale version');
    if(kind==='assignment'){
     if(!clean||clean.plan?.kind!=='plan'||clean.calendar?.kind!=='calendar'||clean.plan.key!==key||Object.keys(clean).some(k=>!['plan','calendar'].includes(k)))throw Error('Exact assignment references required');
     resolve(db,[clean.plan,clean.calendar]);
    }
    if(kind==='planning'){
     if(!clean||!['draft','included','withdrawn'].includes(clean.status)||Object.keys(clean).some(k=>!['assignmentVersion','status'].includes(k)))throw Error('Explicit planning status required');
     const [assignment]=resolve(db,[{kind:'assignment',key,version:clean.assignmentVersion}]);
     if(clean.status==='included')resolve(db,[assignment.value.plan,assignment.value.calendar]);
    }
    const version=expectedVersion+1,hash=digest({kind,key,version,value:clean});
    db.prepare('INSERT INTO office_versions VALUES (?,?,?,?,?)').run(kind,key,version,JSON.stringify(clean),hash);
    return {kind,key,version,value:clean,digest:hash};});
  },
  resourceSnapshot(resourceIds){
   if(!Array.isArray(resourceIds)||!resourceIds.length||resourceIds.length>100||new Set(resourceIds).size!==resourceIds.length)throw Error('Explicit unique resources required');
   resourceIds.forEach(key=>identity('calendar',key));
   return access(false,db=>{
    const included=[],excluded=[],issues=[],calendars=[];
    for(const key of resourceIds){const c=history(db,'calendar',key).at(-1);if(c)calendars.push(c);else issues.push({key,reason:'calendar-required'});}
    const keys=db?db.prepare("SELECT DISTINCT key FROM office_versions WHERE kind='assignment' ORDER BY key").all():[];
    if(keys.length>10000)throw Error('Assignment snapshot limit exceeded');
    for(const {key} of keys){
     const assignment=history(db,'assignment',key).at(-1);
     if(!resourceIds.includes(assignment.value.calendar.key))continue;
     const planning=history(db,'planning',key).at(-1),entry={assignment,planning:planning??null};
     if(!planning||planning.value.assignmentVersion!==assignment.version){issues.push({...entry,key,reason:'planning-status-required'});continue;}
     if(planning.value.status==='draft'||planning.value.status==='withdrawn'){excluded.push(entry);continue;}
     if(planning.value.status!=='included')throw Error('Invalid planning status integrity');
     const plan=history(db,'plan',assignment.value.plan.key).at(-1),calendar=history(db,'calendar',assignment.value.calendar.key).at(-1);
     if(!plan||!calendar||plan.version!==assignment.value.plan.version||calendar.version!==assignment.value.calendar.version){issues.push({...entry,key,reason:'stale-assignment-dependency'});continue;}
     included.push({...entry,plan,calendar});
    }
    const snapshot={resources:resourceIds,calendars,included,excluded,issues};return {...snapshot,snapshotDigest:digest(snapshot)};
   });
  },
  resolveAssignments(refs){return access(false,db=>{
   const seen=new Set();const assignments=resolve(db,refs.map(r=>({...r,kind:'assignment'})));
   return assignments.map(assignment=>{if(seen.has(assignment.key))throw Error('Duplicate assignment');seen.add(assignment.key);const [plan,calendar]=resolve(db,[assignment.value.plan,assignment.value.calendar]);return {assignment,plan,calendar};});
  });},
  resolve(refs){
   if(!Array.isArray(refs)||!refs.length||refs.length>200)throw Error('Bounded version references required');
   return access(false,db=>{const seen=new Set();return refs.map(r=>{identity(r?.kind,r?.key);const id=r.kind+':'+r.key;if(seen.has(id))throw Error('Duplicate version reference');seen.add(id);
    const current=history(db,r.kind,r.key).at(-1);if(!Number.isSafeInteger(r.version)||!current||current.version!==r.version)throw Error('Current version required');return current;});});
  }
 };
}
