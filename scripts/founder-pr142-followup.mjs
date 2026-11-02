// Configure the existing queued task; no timer, provider request or power transition.
export const PR142_TASK='firecrawl-source-repair-2a654007d99f8f1daba5c5736de0fcec';
export function configurePr142Followup(db,readPower,now=Date.now()){
 return db.transaction(()=>{
  if(readPower()?.enabled!==true||db.prepare('SELECT status FROM founder_control').get()?.status!=='running')throw Error('Running session required; no power changes allowed');
  const row=db.prepare('SELECT * FROM founder_jobs WHERE id=?').get(PR142_TASK);
  if(!row||row.status!=='queued'||row.attempts!==0)throw Error('Task already claimed or unavailable');
  const task=JSON.parse(row.payload);
  if(task.kind!=='firecrawl-research'||task.rootTaskId!=='github-orders-82960'||task.dependencies.length!==1||task.dependencies[0]!=='source-repair-2a654007d99f8f1daba5c5736de0fcec')throw Error('Unexpected task scope');
  task.input={...task.input,title:'PR #142 nach Abrufpause prüfen',notBefore:Math.max(task.input.notBefore??0,Date.parse('2026-10-17T03:14:00Z')),researchGoal:'Presago-Labs/presago: PR #142 prüfen: offen/geschlossen, gemergt ja/nein, offene Follow-ups. Konkrete Textbelege nennen; fehlende Angaben als ungeklärt kennzeichnen. Keine Zahlung ableiten.'};
  const payload=JSON.stringify(task);
  if(payload===row.payload)return {changed:false,task};
  db.prepare("UPDATE founder_jobs SET payload=?,updated_ms=? WHERE id=? AND status='queued' AND attempts=0").run(payload,now,PR142_TASK);
  db.prepare('INSERT INTO founder_reconciliations(task_id,at,evidence) VALUES(?,?,?)').run(PR142_TASK,new Date(now).toISOString(),JSON.stringify({action:'configure-existing-pr142-followup',oldPayload:row.payload,newPayload:payload,scope:'existing task only; limits, power, attempts and receipts unchanged'}));
  return {changed:true,task};
 }).immediate();
}
