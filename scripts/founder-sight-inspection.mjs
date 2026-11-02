import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function validateSightInspection(task){
 const r=task.input?.sightInspection;if(r===undefined)return null;
 if(!r||Object.keys(r).sort().join(',')!=='dependencyId,reason,required,requirementRef'||r.required!==true||!['customer-required','mandatory-quality'].includes(r.reason)||typeof r.requirementRef!=='string'||!/^contract:[a-zA-Z0-9_.:-]{1,160}$/.test(r.requirementRef)||!task.dependencies.includes(r.dependencyId))throw Error('Explicit mandatory sight inspection and result dependency required');
 return r;
}
// Personal observation only: this ledger grants no independent quality, delivery,
// customer acceptance, power or budget authority.
export function openTaskSightInspection(db){
 db.exec('CREATE TABLE IF NOT EXISTS founder_sight_inspections(token TEXT PRIMARY KEY,task_id TEXT NOT NULL,outcome TEXT NOT NULL,at_ms INTEGER NOT NULL)');
 function inspect(task){
  const requirement=validateSightInspection(task);if(!requirement)return null;
  const result=db.prepare('SELECT status,digest,result FROM founder_job_history WHERE id=?').get(requirement.dependencyId);
  if(result?.status!=='done'||!/^[a-f0-9]{64}$/.test(result.digest??'')||typeof result.result!=='string'||createHash('sha256').update(result.result).digest('hex')!==result.digest)return {status:'awaiting-result',requirement};
  const token=hash({task,resultDigest:result.digest}),record=db.prepare('SELECT outcome,at_ms FROM founder_sight_inspections WHERE token=? AND task_id=?').get(token,task.id);
  return {status:record?.outcome==='inspected'?'completed':record?.outcome??'pending',token,resultDigest:result.digest,requirement,completedAt:record?.at_ms??null};
 }
 const record=db.transaction(input=>{
  if(!input||Object.keys(input).sort().join(',')!=='id,outcome,token'||typeof input.id!=='string'||!['inspected','corrections-needed'].includes(input.outcome)||typeof input.token!=='string')throw Error('Invalid sight inspection');
  const row=db.prepare('SELECT payload,status FROM founder_jobs WHERE id=?').get(input.id);
  if(row?.status!=='queued')throw Error('Queued inspection task required');
  const current=inspect(JSON.parse(row.payload));
  if(current?.status!=='pending'||current.token!==input.token)throw Error('Sight inspection changed or already recorded');
  db.prepare('INSERT INTO founder_sight_inspections VALUES(?,?,?,?)').run(current.token,input.id,input.outcome,Date.now());
  return inspect(JSON.parse(row.payload));
 }).immediate;
 function wait(task){const s=inspect(task);if(!s||s.status==='completed')return null;return {code:'sight-inspection',until:null,reason:s.status==='awaiting-result'?'Sichtprüfung wartet auf ein gültiges fertiges Ergebnis.':s.status==='corrections-needed'?'Korrektur nötig; für das geänderte Ergebnis ist eine neue Sichtprüfung erforderlich.':'Wartet auf erforderliche Sichtprüfung. Andere unabhängige Aufgaben laufen weiter.'};}
 return {inspect,record,wait};
}
