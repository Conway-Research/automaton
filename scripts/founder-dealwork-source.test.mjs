import test from 'node:test';import assert from 'node:assert/strict';
import {prepareDealworkSource} from './founder-dealwork-source.mjs';
const binding={job:{title:'Fix',description:'Implement public issue: https://github.com/owner/project/issues/1'}};
const at=Date.now(),sha='a'.repeat(40),tree='b'.repeat(40);
function fixture(mutate=()=>{}){
 const files=[{path:'x.js',content:'old'},{path:'x.test.js',content:'test'}];let reads=0;
 return {get reads(){return reads;},async read(p){reads++;let r;
  if(p==='/repos/owner/project')r={full_name:'owner/project',private:false,archived:false,default_branch:'main'};
  else if(p.endsWith('/issues/1'))r={number:1,html_url:'https://github.com/owner/project/issues/1',state:'open',title:'Fix',body:'AI-assisted contributions welcome',author_association:'OWNER'};
  else if(p.includes('/comments?'))r=[];
  else if(p.includes('/commits/'))r={sha,commit:{tree:{sha:tree}}};
  else if(p.includes('/git/trees/'))r={truncated:false,tree:files.map((f,i)=>({...f,type:'blob',mode:'100644',sha:String(i+1).repeat(40),size:f.content.length}))};
  else r={encoding:'base64',content:Buffer.from(p.endsWith('1'.repeat(40))?'old':'test').toString('base64')};
  mutate(p,r);return r;
 }};
}
test('read-only source envelope rejects private, archived, policy-restricted and unsupported sources',async()=>{
 for(const mutate of [(p,r)=>{if(p==='/repos/owner/project')r.private=true;},(p,r)=>{if(p==='/repos/owner/project')r.archived=true;},(p,r)=>{if(p.endsWith('/issues/1'))r.body+='; no AI';},(p,r)=>{if(p.endsWith('/issues/1'))r.author_association='NONE';},(p,r)=>{if(p.includes('/git/trees/'))r.truncated=true;},(p,r)=>{if(p.includes('/git/trees/'))r.tree[0].mode='120000';},(p,r)=>{if(p.includes('/git/trees/'))r.tree.push({path:'secret.ts',mode:'100644',type:'blob'});},(p,r)=>{if(p.includes('/git/blobs/'))r.content=Buffer.from('different').toString('base64');}]){
  const f=fixture(mutate);await assert.rejects(prepareDealworkSource(binding,f.read,{},()=>at));
 }
});
test('source transport stops before any read when cancellation is requested',async()=>{const f=fixture();await assert.rejects(prepareDealworkSource(binding,f.read,{signal:AbortSignal.abort()},()=>at));assert.equal(f.reads,0);});
test('unknown native scope fields and titles cannot be silently ignored',async()=>{
 for(const job of [{...binding.job,deliverables:'Private additional requirement'},{...binding.job,title:'Different private task'}]){const f=fixture();await assert.rejects(prepareDealworkSource({job},f.read,{},()=>at));}
});
