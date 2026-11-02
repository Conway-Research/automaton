import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import Database from 'better-sqlite3';
import {withPaperStatusSnapshot} from '../security/paper-status-snapshot.js';
function fixture(run:(file:string)=>void){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paper-snapshot-'));try{run(path.join(dir,'test.db'));}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function bytes(file:string){return ['', '-wal','-shm','-journal'].map(s=>[s,fs.existsSync(file+s)?fs.readFileSync(file+s).toString('hex'):null]);}
it('reads a closed rollback database in memory without source or sidecar changes',()=>fixture(file=>{
 const writer=new Database(file);writer.exec('CREATE TABLE sample(value INTEGER); INSERT INTO sample VALUES(7)');writer.close();
 const before=bytes(file);
 expect(withPaperStatusSnapshot(file,db=>{expect(()=>db.exec('INSERT INTO sample VALUES(8)')).toThrow();return db.prepare('SELECT value FROM sample').get();})).toEqual({value:7});
 expect(bytes(file)).toEqual(before);
}));
it('refuses active WAL including uncheckpointed data without touching DB/WAL/SHM',()=>fixture(file=>{
 const writer=new Database(file);writer.pragma('journal_mode=WAL');writer.exec('CREATE TABLE sample(value);INSERT INTO sample VALUES(7)');
 try{const before=bytes(file);expect(()=>withPaperStatusSnapshot(file,()=>null)).toThrow('CLOSED_SNAPSHOT_REQUIRED');expect(bytes(file)).toEqual(before);}finally{writer.close();}
}));
it.each(['-journal','-wal','-shm'])('refuses recovery sidecar %s without recovery or deletion',suffix=>fixture(file=>{
 const writer=new Database(file);writer.exec('CREATE TABLE sample(value)');writer.close();fs.writeFileSync(file+suffix,'synthetic incomplete recovery');
 const before=bytes(file);expect(()=>withPaperStatusSnapshot(file,()=>null)).toThrow('CLOSED_SNAPSHOT_REQUIRED');expect(bytes(file)).toEqual(before);
}));
it('does not initialize missing tables or repair corrupt files',()=>fixture(file=>{
 const writer=new Database(file);writer.exec('CREATE TABLE unrelated(value)');writer.close();const before=bytes(file);
 expect(()=>withPaperStatusSnapshot(file,db=>db.prepare('SELECT * FROM missing').get())).toThrow();expect(bytes(file)).toEqual(before);
 fs.writeFileSync(file,Buffer.alloc(4096));const corrupted=bytes(file);expect(()=>withPaperStatusSnapshot(file,()=>null)).toThrow();expect(bytes(file)).toEqual(corrupted);
}));
