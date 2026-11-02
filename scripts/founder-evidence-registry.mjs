// Records that were fixed before they were used, addressed by the real hash of their content. No file, store or network.
// A check over this registry is only as good as its owner: a later connection must let the runner write, never the party being checked.
import {createHash} from 'node:crypto';
const stable=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(n=>[n,v[n]])):v);
export const contentHash=(kind,body)=>createHash('sha256').update(stable([kind,body])).digest('hex');
const issued=new WeakSet();
/** The writer stays with whoever runs the work; a check receives only the reader. */
export function createEvidenceRegistry(){
 const records=new Map();let sequence=0;
 const reader=Object.freeze({get(hash){
  const r=records.get(hash);if(!r)return null;
  const body=JSON.parse(r.text);
  return contentHash(r.kind,body)===hash?{kind:r.kind,body,sequence:r.sequence}:null;
 },list(kind){
  return [...records.entries()].filter(([,r])=>r.kind===kind).map(([hash,r])=>({hash,kind,body:JSON.parse(r.text),sequence:r.sequence}));
 }});
 issued.add(reader);
 const writer=Object.freeze({add(kind,body){
  if(typeof kind!=='string'||!kind||body===undefined)throw Error('Evidence needs a kind and a body');
  const text=stable(body),hash=contentHash(kind,JSON.parse(text));
  if(!records.has(hash))records.set(hash,{kind,text,sequence:++sequence});
  return hash;
 }});
 return {reader,writer};
}
/** A record of exactly this kind from a real registry, or nothing. */
export const readEvidence=(reader,hash,kind)=>{
 if(!reader||typeof reader!=='object'||!issued.has(reader))return null;
 const record=reader.get(hash);return record?.kind===kind?record:null;
};
/** Every record of one kind, so a check can see what the caller did not hand it. */
export const listEvidence=(reader,kind)=>reader&&typeof reader==='object'&&issued.has(reader)?reader.list(kind):[];
