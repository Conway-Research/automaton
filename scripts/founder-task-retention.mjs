import {createHash} from 'node:crypto';
// Called only inside the controller's immediate admission transaction.
// Never archive a live job, a referenced prerequisite or a result without integrity proof.
export function retainTerminalJobs(db,{limit=500,before=Date.now()-86400000}={}){
 const rows=db.prepare(`SELECT * FROM founder_jobs j WHERE status='done' AND updated_ms<?
 AND NOT EXISTS(SELECT 1 FROM founder_jobs child,json_each(child.payload,'$.dependencies') dep WHERE dep.value=j.id)
 ORDER BY updated_ms,id LIMIT ?`).all(before,limit);
 let count=0;
 for(const row of rows){
  if(typeof row.result!=='string'||createHash('sha256').update(row.result).digest('hex')!==row.digest)continue;
  db.prepare('INSERT INTO founder_job_archive SELECT * FROM founder_jobs WHERE id=?').run(row.id);
  db.prepare("DELETE FROM founder_jobs WHERE id=? AND status='done'").run(row.id);count++;
 }
 return count;
}
