/** Synthetic delivery model only. Not an Obolus connector or production feature.
 * Fixed scope: form event -> inventory request row; no email, payment or network.
 * CSV: <=500 records, six columns, only surrounding title whitespace may change.
 */
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const HANDOVER = {
  syntheticOnly:true,liveReady:false,
  workflow:{trigger:'form event',mapping:'id -> idempotency key, sku -> product, quantity -> units',
    target:'mock request table',maxAttempts:3,
    recovery:'receipt reconciliation only after uncertain commit; no blind replay',
    permissionFailure:'hold until separately authorized; benchmark never authorizes',
    unresolved:'invalid input, conflicting key, denied access and exhausted retry require review',
    credentialHandling:'no credentials accepted or required'},
  csv:{schema:['sku','handle','title','option','price','inventory'],maxRows:500,
    allowedChange:'trim surrounding title whitespace only on otherwise valid rows',
    protected:['sku','price','inventory'],delivery:'accepted CSV plus lossless quarantine JSON plus change list',
    unresolved:'no inferred replacement values; ask data owner in a future authorized delivery'},
};
export function hasUnsafePrefix(value:string) {
  const first=[...value].find(char=>char.charCodeAt(0)>32 && !/\s/u.test(char));
  return first!==undefined && '=+@-'.includes(first);
}
export type Event = {id:string; sku:string; quantity:number};
export type Fault = 'none'|'timeout-before'|'timeout-after'|'denied'|'crash-after';
export class MockTarget {
  calls=0;
  fault:Fault='none';
  constructor(readonly db:Database.Database) {
    db.exec('CREATE TABLE IF NOT EXISTS target(id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  }
  receipt(id:string) { return this.db.prepare('SELECT payload FROM target WHERE id=?').get(id) as {payload:string}|undefined; }
  put(event:Event) {
    this.calls++;
    if(this.fault==='denied') throw Error('DENIED');
    if(this.fault==='timeout-before') throw Error('RETRYABLE');
    const payload=JSON.stringify({product:event.sku,units:event.quantity});
    const previous=this.receipt(event.id);
    if(previous && previous.payload!==payload) throw Error('CONFLICT');
    this.db.prepare('INSERT OR IGNORE INTO target VALUES(?,?)').run(event.id,payload);
    if(this.fault==='timeout-after') throw Error('UNCERTAIN');
    if(this.fault==='crash-after') throw Error('CRASH');
  }
}

export class MockWorkflow {
  constructor(readonly db:Database.Database,readonly target:MockTarget) {
    db.exec(`CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY, id TEXT NOT NULL, code TEXT NOT NULL);`);
  }
  log(id:string,code:string) {this.db.prepare('INSERT INTO audit(id,code) VALUES(?,?)').run(id,code);}
  status(id:string) {return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as {id:string;payload:string;status:string}|undefined;}
  finish(id:string,status:string) {
    this.db.transaction(()=>{this.log(id,status);this.db.prepare('UPDATE jobs SET status=? WHERE id=?').run(status,id);})();
    return status;
  }
  handle(input:unknown):string {
    const e=input as Partial<Event>|null;
    if(!e || typeof e!=='object' || Object.keys(e).sort().join(',')!=='id,quantity,sku' ||
      typeof e.id!=='string' || !/^evt-[a-z0-9-]{1,50}$/.test(e.id) ||
      typeof e.sku!=='string' || !/^SKU-[0-9]{4}$/.test(e.sku) ||
      !Number.isInteger(e.quantity) || e.quantity!<1 || e.quantity!>10) {
      this.log('invalid-input','INVALID');return 'invalid';
    }
    const event=e as Event,payload=JSON.stringify({id:event.id,sku:event.sku,quantity:event.quantity});
    const previous=this.status(event.id);
    if(previous) {
      if(previous.payload!==payload){this.log(event.id,'CONFLICT');return 'conflict';}
      this.log(event.id,'DUPLICATE');return previous.status;
    }
    this.db.transaction(()=>{this.log(event.id,'ACCEPTED');this.db.prepare('INSERT INTO jobs VALUES(?,?,?)').run(event.id,payload,'pending');})();
    for(let attempt=0;attempt<3;attempt++) {
      this.log(event.id,'ATTEMPT');
      try {this.target.put(event);} catch(error) {
        const code=error instanceof Error?error.message:'UNKNOWN';
        if(code==='CRASH') throw Error('Synthetic crash after target commit');
        if(code==='DENIED') return this.finish(event.id,'blocked');
        if(code==='RETRYABLE'){this.log(event.id,'RETRYABLE');continue;}
        return this.finish(event.id,'review');
      }
      return this.finish(event.id,'done');
    }
    return this.finish(event.id,'review');
  }
  reconcile(id:string) {
    const job=this.status(id);
    if(!job || !['pending','review'].includes(job.status)) return job?.status;
    const e=JSON.parse(job.payload) as Event;
    if(this.target.receipt(id)?.payload===JSON.stringify({product:e.sku,units:e.quantity})) return this.finish(id,'done');
    return this.finish(id,'review');
  }
}

export const HEADER=['sku','handle','title','option','price','inventory'];
export function encodeCsv(rows:string[][]) {
  return rows.map(row=>row.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(',')).join('\r\n');
}
/** Strict fixture parser: fail closed for broken quoting or oversized records. */
export function parseCsv(text:string):string[][] {
  if(Buffer.byteLength(text)>1_000_000) throw Error('SIZE');
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
  const field=()=>{row.push(cell);cell='';closed=false;};
  const record=()=>{field();rows.push(row);row=[];if(rows.length>501) throw Error('ROWS');};
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell||closed) throw Error('QUOTE');quoted=true;}
    else if(c===',') field();
    else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;record();}
    else {if(closed)throw Error('QUOTE');cell+=c;}
  }
  if(quoted)throw Error('QUOTE');
  if(cell||closed||row.length)record();
  return rows;
}
export function syntheticCsv() {
  const rows=Array.from({length:480},(_,i)=>[
    `SKU-${String(i).padStart(4,'0')}`,`product-${Math.floor(i/2)}`,`Product ${i}`,
    i%2?'large':'small','12.50','10',
  ]);
  rows[0][2]='';rows[1][4]='';rows[2][4]='12,50';rows[3][5]='-1';
  rows[4]=[...rows[5]];rows[6][0]=rows[7][0];rows[8][3]=rows[9][3];
  rows[10][2]='=1+1';rows[11][0]='@SUM(1)';rows[12][2]='\t+1';
  rows[13][2]='  Safe title  ';rows[14][2]='A "quoted", multiline\r\ntitle';
  rows[15][4]='012.50';rows[16][5]='1e2';rows[17][0]=' SKU-0017 ';
  rows[18][1]='';rows[19][2]='\r\n=1+1';rows[20]=HEADER.map(()=>'');
  return encodeCsv([HEADER,...rows]);
}
export function cleanCsv(input:string) {
  const parsed=parseCsv(input);
  if(JSON.stringify(parsed[0])!==JSON.stringify(HEADER))throw Error('SCHEMA');
  const source=parsed.slice(1);
  if(!source.length || source.some(row=>row.length!==HEADER.length))throw Error('SCHEMA');
  const skus=new Map<string,number>(),variants=new Map<string,number>();
  for(const row of source){skus.set(row[0],(skus.get(row[0])??0)+1);const key=JSON.stringify([row[1],row[3]]);variants.set(key,(variants.get(key)??0)+1);}
  const changes:{row:number;field:string;before:string;after:string;rule:string}[]=[];
  const records=source.map((original,index)=>{
    const values=[...original],issues:string[]=[];
    if(original.some(value=>!value.trim())) issues.push('MISSING');
    if(!/^SKU-[0-9]{4}$/.test(original[0]))issues.push('SKU_FORMAT');
    if(!/^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(original[4]))issues.push('PRICE_FORMAT');
    if(!/^(0|[1-9][0-9]*)$/.test(original[5]))issues.push('INVENTORY_FORMAT');
    if((skus.get(original[0])??0)>1)issues.push('DUPLICATE_SKU');
    if((variants.get(JSON.stringify([original[1],original[3]]))??0)>1)issues.push('DUPLICATE_VARIANT');
    if(original.some(hasUnsafePrefix))issues.push('FORMULA_OR_UNSAFE_PREFIX');
    if(!issues.length && values[2]!==values[2].trim()){
      changes.push({row:index+2,field:'title',before:values[2],after:values[2].trim(),rule:'TRIM_TITLE_ONLY'});
      values[2]=values[2].trim();
    }
    return {sourceRow:index+2,original,values,issues,status:issues.length?'quarantine':'accepted',sourceDigest:digest(JSON.stringify(original))};
  });
  return {sourceDigest:digest(input),records,changes,
    acceptedCsv:encodeCsv([HEADER,...records.filter(r=>r.status==='accepted').map(r=>r.values)]),
    // Quarantine stays JSON, never a spreadsheet that might evaluate formulas.
    quarantineJson:JSON.stringify(records.filter(r=>r.status==='quarantine'))};
}
