import Database from 'better-sqlite3';
import {bounded,digest,checkedJSON} from './founder-restoration-integrity.mjs';
const names=['read','apply','work','verify','submit','reconcile'];
const states=['candidate','historical','offline-verified','live-verified','blocked','expired'];
const restricted=new Set(['index','context','program']);
const coreLabels={github:'GitHub',ugig:'ugig',dealwork:'Dealwork',synmerco:'Synmerco',guru:'Guru',gmail:'Gmail',arcbounty:'ArcBounty',bidpostloop:'BidPostLoop'};
const canonicalLabel=label=>coreLabels[label.toLowerCase()]??label;
export function normalizeInventory(_inventory,workPackages){
 if(!Array.isArray(workPackages?.rows)||workPackages.rows.length>5000)throw Error('Invalid source inventory');
 const sources=new Map(),mappings=[],ids=new Set();
 const explicitCore=new Set(workPackages.rows.filter(r=>r.inventoryKind==='core'&&r.lane!=='context-or-program-review'&&typeof r.label==='string'&&coreLabels[r.label.toLowerCase()]).map(r=>canonicalLabel(r.label.normalize('NFKC').trim())));
 for(const row of workPackages.rows){
  if(!bounded(row.id)||ids.has(row.id)||!bounded(row.label))throw Error('Invalid or duplicate source row');ids.add(row.id);
  const label=row.label.normalize('NFKC').trim(),canonical=canonicalLabel(label);
  const kind=explicitCore.has(canonical)?'marketplace':row.inventoryKind==='publisher'||row.lane==='context-or-program-review'?'context':row.inventoryKind==='secondary-index-board'?'index':'marketplace';
  const id='source-'+digest(canonical).slice(0,24);let s=sources.get(id);
  if(!s){s={id,aliases:[],kind,provenance:[],endpoints:[],capabilities:Object.fromEntries(names.map(k=>[k,{state:'blocked',evidenceRefs:[],expiresAt:null,blocker:'adapter-and-current-source-evidence-required'}])),blockers:['adapter-and-current-source-evidence-required'],reviewedAt:null,expiresAt:null};sources.set(id,s);}
  if(s.kind!==kind&&restricted.has(kind))s.kind=kind;
  if(!s.aliases.includes(label))s.aliases.push(label);
  for(const p of row.provenance??[])if(bounded(p,2000)&&!s.provenance.includes(p))s.provenance.push(p);
  mappings.push({rowId:row.id,sourceId:id,inventoryKind:row.inventoryKind??'unknown'});
 }
 return {sources:[...sources.values()],mappings};
}
export function openSourceRegistry(file){
 const db=new Database(file);db.pragma('busy_timeout=5000');db.exec('CREATE TABLE IF NOT EXISTS restoration_sources(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS restoration_source_rows(row_id TEXT PRIMARY KEY,source_id TEXT NOT NULL,payload TEXT NOT NULL)');
 const read=id=>{const r=db.prepare('SELECT payload FROM restoration_sources WHERE id=?').get(id);if(!r)throw Error('Unknown source');return JSON.parse(r.payload);};
 const api={
  import:db.transaction((records,mappings)=>{
   for(const record of records){const s=checkedJSON(record);if(!bounded(s.id)||!s.capabilities||!['marketplace','index','context','program','specific-order'].includes(s.kind))throw Error('Invalid source record');
    const old=db.prepare('SELECT payload FROM restoration_sources WHERE id=?').get(s.id);if(old){const saved=JSON.parse(old.payload);if(saved.kind!==s.kind)throw Error('Source kind conflict');s.capabilities=saved.capabilities;}
    db.prepare('INSERT INTO restoration_sources VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(s.id,JSON.stringify(s));
   }
   for(const mapping of mappings){read(mapping.sourceId);const old=db.prepare('SELECT source_id FROM restoration_source_rows WHERE row_id=?').get(mapping.rowId);if(old&&old.source_id!==mapping.sourceId)throw Error('Source mapping conflict');db.prepare('INSERT OR IGNORE INTO restoration_source_rows VALUES(?,?,?)').run(mapping.rowId,mapping.sourceId,JSON.stringify(checkedJSON(mapping)));}
  }),
  setCapability(sourceId,capability,evidence){const s=read(sourceId),e=checkedJSON(evidence);if(!names.includes(capability)||!states.includes(e.state)||!Array.isArray(e.evidenceRefs)||!e.evidenceRefs.every(x=>bounded(x,2000)))throw Error('Invalid capability evidence');if(restricted.has(s.kind)&&['apply','work','submit'].includes(capability))throw Error('Context or index is not an execution source');if(['offline-verified','live-verified'].includes(e.state)&&(!e.evidenceRefs.length||!Number.isFinite(e.expiresAt)))throw Error('Dated independent capability evidence required');s.capabilities[capability]=e;db.prepare('UPDATE restoration_sources SET payload=? WHERE id=?').run(JSON.stringify(s),sourceId);},
  snapshot(now=Date.now()){return {sources:db.prepare('SELECT payload FROM restoration_sources ORDER BY id').all().map(r=>{const s=JSON.parse(r.payload);for(const e of Object.values(s.capabilities))if(Number.isFinite(e.expiresAt)&&e.expiresAt<=now)e.state='expired';return s;}),mappings:db.prepare('SELECT payload FROM restoration_source_rows ORDER BY row_id').all().map(r=>JSON.parse(r.payload))};},
  close(){db.close();}
 };return api;
}
