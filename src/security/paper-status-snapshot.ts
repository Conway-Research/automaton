import fs from 'node:fs';
import Database from 'better-sqlite3';

/** Never gives SQLite a source pathname, so it cannot write source journals or
 * shared-memory locks. Hot/WAL databases require a separately prepared closed
 * snapshot; no implicit checkpoint, recovery or backup is performed here. */
export function withPaperStatusSnapshot<T>(file:string,read:(db:Database.Database)=>T):T {
 const sidecars=['-wal','-shm','-journal'];
 const check=()=>{
  if(sidecars.some(s=>fs.existsSync(file+s)))throw Error('PAPER_STATUS_CLOSED_SNAPSHOT_REQUIRED');
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<100||stat.size>64*1024*1024)throw Error('PAPER_STATUS_INVALID_SNAPSHOT');
  return stat;
 };
 const before=check();
 const bytes=fs.readFileSync(file);
 const after=check();
 if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino||before.ctimeMs!==after.ctimeMs||bytes.length!==before.size)
  throw Error('PAPER_STATUS_SNAPSHOT_CHANGED');
 // A WAL-mode header may depend on an absent WAL after a crash/copy. Refuse
 // even when no sidecar happens to be present; never present stale state.
 if(bytes.toString('ascii',0,16)!=='SQLite format 3\0'||bytes[18]!==1||bytes[19]!==1)throw Error('PAPER_STATUS_CLOSED_SNAPSHOT_REQUIRED');
 const db=new Database(bytes,{readonly:true});
 try{
  if(db.pragma('quick_check',{simple:true})!=='ok')throw Error('PAPER_STATUS_INVALID_SNAPSHOT');
  return read(db);
 }finally{db.close();}
}
