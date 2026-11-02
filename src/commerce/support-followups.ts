import {createHash} from 'node:crypto';
import type {Database} from 'better-sqlite3';
import type {SupportReply} from './support-outbox.js';

/** Run only inside the operator's IMMEDIATE transaction. Preserve the original table as a sealed archive. */
function migrateReplies(db:Database){
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_support_followups'").get())return;
  const columns=db.prepare('PRAGMA table_info(obolus_support_replies)').all() as {name:string}[];
  if(columns.map(c=>c.name).join(',')!=='id,inbox_id,payload,status,attempted_ms,provider_id')throw new Error('Unsupported support schema; explicit migration required');
  // Column names alone do not reveal CHECK, UNIQUE, COLLATE, defaults or outbound foreign keys.
  // Only migrate the exact legacy definition emitted by this project; retain all custom definitions for explicit review.
  const definition=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='obolus_support_replies'").get() as {sql:string}|undefined;
  const supported="CREATE TABLE obolus_support_replies(id TEXT PRIMARY KEY,inbox_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempted_ms INTEGER,provider_id TEXT)";
  if(definition?.sql!==supported)throw new Error('Custom support table definition requires explicit migration');
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_support_replies_v1_archive'").get())throw new Error('Support migration archive already exists');
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('view','trigger') AND tbl_name<>'obolus_support_replies' AND instr(lower(sql),'obolus_support_replies')>0").get())throw new Error('Dependent support schema requires explicit migration');
  // Do not silently retarget a foreign key while renaming the legacy table.
  for(const table of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]){
    const quoted=table.name.replace(/"/g,'""');
    if((db.prepare(`PRAGMA foreign_key_list("${quoted}")`).all() as {table:string}[]).some(f=>f.table==='obolus_support_replies'))throw new Error('Referenced support schema requires explicit migration');
  }
  const objects=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE tbl_name='obolus_support_replies' AND type IN ('trigger','index') AND sql IS NOT NULL").all() as {type:string;name:string;sql:string}[];
  for(const object of objects)db.exec(`DROP ${object.type.toUpperCase()} "${object.name.replace(/"/g,'""')}"`);
  db.exec(`ALTER TABLE obolus_support_replies RENAME TO obolus_support_replies_v1_archive;
    CREATE TABLE obolus_support_replies(id TEXT PRIMARY KEY,inbox_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempted_ms INTEGER,provider_id TEXT);
    INSERT INTO obolus_support_replies(rowid,id,inbox_id,payload,status,attempted_ms,provider_id)
      SELECT rowid,id,inbox_id,payload,status,attempted_ms,provider_id FROM obolus_support_replies_v1_archive;
    CREATE INDEX support_reply_case_history ON obolus_support_replies(inbox_id);
    CREATE UNIQUE INDEX support_one_open_reply ON obolus_support_replies(inbox_id) WHERE status IN ('queued','deferred','sending','uncertain');
    CREATE TRIGGER support_archive_insert BEFORE INSERT ON obolus_support_replies_v1_archive BEGIN SELECT RAISE(ABORT,'Support archive immutable'); END;
    CREATE TRIGGER support_archive_update BEFORE UPDATE ON obolus_support_replies_v1_archive BEGIN SELECT RAISE(ABORT,'Support archive immutable'); END;
    CREATE TRIGGER support_archive_delete BEFORE DELETE ON obolus_support_replies_v1_archive BEGIN SELECT RAISE(ABORT,'Support archive immutable'); END;
    CREATE TABLE obolus_support_followups(previous_id TEXT PRIMARY KEY,next_id TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,reviewed_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')));
    CREATE TRIGGER support_followup_update BEFORE UPDATE ON obolus_support_followups BEGIN SELECT RAISE(ABORT,'Support followup audit immutable'); END;
    CREATE TRIGGER support_followup_delete BEFORE DELETE ON obolus_support_followups BEGIN SELECT RAISE(ABORT,'Support followup audit immutable'); END;`);
  for(const object of objects)db.exec(object.sql);
}

/** Operator-reviewed text only. No send, free recipient, automatic case closure or model publication. */
export function queueSupportFollowup(db:Database,previousId:string,body:string,reason:string,reviewedBy:string){
  // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
  const review=(v:unknown,max:number)=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
  if(!/^[a-f0-9]{64}$/.test(previousId)||typeof body!=='string'||!body.trim()||body.includes('\0')||Buffer.byteLength(body)>20000||!review(reason,1000)||!review(reviewedBy,200))throw new Error('Bounded reviewed support followup required');
  return db.transaction(()=>{
    const policy=db.prepare('SELECT mailbox,paused FROM obolus_support_policy WHERE id=1').get() as {mailbox:string;paused:number}|undefined;
    if(policy?.paused!==1)throw new Error('Pause support before drafting a followup');
    const previous=db.prepare('SELECT inbox_id,payload,status FROM obolus_support_replies WHERE id=?').get(previousId) as {inbox_id:string;payload:string;status:string}|undefined;
    if(!previous||!['sent','cancelled'].includes(previous.status))throw new Error('Confirmed sent or cancelled predecessor required');
    const original=JSON.parse(previous.payload) as SupportReply;
    if(original.id!==previousId||original.mailbox!==policy.mailbox)throw new Error('Support predecessor binding mismatch');
    const id=createHash('sha256').update(JSON.stringify({previousId,body,reason,reviewedBy})).digest('hex');
    const payload=JSON.stringify({...original,id,body});
    const hasHistory=db.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_support_followups'").get();
    if(hasHistory){
      const existing=db.prepare('SELECT next_id FROM obolus_support_followups WHERE previous_id=?').get(previousId) as {next_id:string}|undefined;
      if(existing){if(existing.next_id!==id)throw new Error('Conflicting support followup; review latest reply');return {id,duplicate:true};}
    }
    const inbox=db.prepare('SELECT status FROM obolus_support_inbox WHERE id=?').get(previous.inbox_id) as {status:string}|undefined;
    if(!inbox||inbox.status==='reviewed')throw new Error('Open support case required');
    const latest=db.prepare('SELECT id FROM obolus_support_replies WHERE inbox_id=? ORDER BY rowid DESC LIMIT 1').get(previous.inbox_id) as {id:string};
    if(latest.id!==previousId)throw new Error('Followup must reference latest reply');
    if((db.prepare('SELECT COUNT(*) n FROM obolus_support_replies').get() as {n:number}).n>=10000)throw new Error('Support outbox capacity reached');
    migrateReplies(db);
    db.prepare('INSERT INTO obolus_support_replies(id,inbox_id,payload) VALUES(?,?,?)').run(id,previous.inbox_id,payload);
    db.prepare('INSERT INTO obolus_support_followups(previous_id,next_id,reason,reviewed_by) VALUES(?,?,?,?)').run(previousId,id,reason,reviewedBy);
    db.prepare("UPDATE obolus_support_inbox SET status='needs_review' WHERE id=?").run(previous.inbox_id);
    return {id,duplicate:false};
  }).immediate();
}
