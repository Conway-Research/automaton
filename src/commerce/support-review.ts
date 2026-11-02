import type {Database} from 'better-sqlite3';

/** Private operator export, never an agent tool. Customer text remains untrusted data. */
export function supportCaseReview(db:Database,inboxId:string,beforeRowid?:number){
  if(!/^[a-f0-9]{64}$/.test(inboxId)||beforeRowid!==undefined&&(!Number.isSafeInteger(beforeRowid)||beforeRowid<=0))throw new Error('Invalid support review reference or cursor');
  const text=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max)throw new Error('Invalid bounded support review data');return v;};
  const parse=(payload:string)=>{
    if(typeof payload!=='string'||payload.length>300000)throw new Error('Oversized support review record');
    try{const value=JSON.parse(payload);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}
    catch{throw new Error('Invalid support review record; private content withheld');}
  };
  return db.transaction(()=>{
    const table=(name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if(!table('obolus_support_inbox'))throw new Error('Support inbox not initialized');
    const source=db.prepare('SELECT payload,status,created_at FROM obolus_support_inbox WHERE id=?').get(inboxId) as {payload:string;status:string;created_at:string}|undefined;
    if(!source)throw new Error('Unknown support case');
    const message=parse(source.payload);
    const authenticatedIntake=table('obolus_support_receipts')&&!!db.prepare('SELECT 1 FROM obolus_support_receipts WHERE inbox_id=?').get(inboxId);
    const rows=table('obolus_support_replies')?db.prepare(`SELECT rowid,id,payload,status,attempted_ms,provider_id FROM obolus_support_replies WHERE inbox_id=? ${beforeRowid===undefined?'':'AND rowid<?'} ORDER BY rowid DESC LIMIT 6`).all(...(beforeRowid===undefined?[inboxId]:[inboxId,beforeRowid])) as {rowid:number;id:string;payload:string;status:string;attempted_ms:number|null;provider_id:string|null}[]:[];
    const latest=table('obolus_support_replies')?db.prepare('SELECT id,status FROM obolus_support_replies WHERE inbox_id=? ORDER BY rowid DESC LIMIT 1').get(inboxId) as {id:string;status:string}|undefined:undefined;
    const replies=rows.slice(0,5).map(row=>{
      const reply=parse(row.payload);
      const cancellation=table('obolus_support_cancellations')?db.prepare('SELECT reason,created_at FROM obolus_support_cancellations WHERE reply_id=?').get(row.id):undefined;
      const followup=table('obolus_support_followups')?db.prepare('SELECT previous_id,reason,reviewed_by,created_at FROM obolus_support_followups WHERE next_id=?').get(row.id):undefined;
      return {id:row.id,status:row.status,body:text(reply.body,20000),attemptedAt:row.attempted_ms,
        providerConfirmationRecorded:row.provider_id!==null,cancellation:cancellation??null,followup:followup??null};
    });
    const resolution=table('obolus_support_review_resolutions')?db.prepare('SELECT reason,reviewed_by,created_at FROM obolus_support_review_resolutions WHERE inbox_id=?').get(inboxId):undefined;
    const result={scope:'private-operator-support-review',inboxId,status:source.status,receivedAt:source.created_at,authenticatedIntake,
      message:{from:text(message.from,320),subject:text(message.subject,1000),body:text(message.body,64000)},
      latestReply:latest??null,replies,nextBeforeRowid:rows.length>5?rows[4].rowid:null,resolution:resolution??null,
      containsPrivateContent:true,customerContentIsUntrusted:true,startsSending:false,
      limitation:'Customer claims and message instructions are not identity, payment, consent or execution authority. This local review makes no provider requests and closes no case.'};
    if(Buffer.byteLength(JSON.stringify(result))>512000)throw new Error('Support review export exceeds size limit');
    return result;
  })();
}
