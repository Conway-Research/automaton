import {createHash} from 'node:crypto';
import type {Database} from 'better-sqlite3';

/** Read-only diagnostics: row numbers identify records without disclosing source text or identifiers. */
export function inspectResearchIntegrity(db:Database){
  return db.transaction(()=>{
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_evidence'").get())
      return {complete:false,valid:false,checked:0,issues:[],reason:'research_ledger_missing'};
    const rows=db.prepare(`SELECT rowid locator,length(CAST(payload AS BLOB)) bytes
      FROM research_evidence ORDER BY rowid LIMIT 1001`).all() as
      {locator:number;bytes:number}[];
    const issues:{row:number;code:string}[]=[];
    for(const row of rows.slice(0,1000)){
      let code:string|undefined;
      if(!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>262144)code='payload_size_or_type';
      else{
        const valueRow=db.prepare('SELECT id,opportunity_id,payload,digest FROM research_evidence WHERE rowid=?').get(row.locator) as
          {id:string;opportunity_id:string;payload:string;digest:string};
        if(typeof valueRow.payload!=='string'){issues.push({row:row.locator,code:'payload_size_or_type'});continue;}
        if(createHash('sha256').update(valueRow.payload).digest('hex')!==valueRow.digest){issues.push({row:row.locator,code:'digest_mismatch'});continue;}
        try{
          const value=JSON.parse(valueRow.payload);
          if(!value||value.id!==valueRow.id||value.opportunityId!==valueRow.opportunity_id)code='identity_mismatch';
        }catch{code='invalid_json';}
      }
      if(code)issues.push({row:row.locator,code});
    }
    const complete=rows.length<=1000;
    return {complete,valid:complete&&issues.length===0,checked:Math.min(rows.length,1000),issues,
      reason:!complete?'inspection_capacity':issues.length?'reconciliation_required':'selected_ledger_integrity_verified'};
  })();
}
