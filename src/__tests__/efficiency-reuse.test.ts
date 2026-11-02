import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createDatabase} from '../state/database.js';
import {reusePublicResearch} from '../online/research-cache.js';
const valid=(v:unknown):v is string=>typeof v==='string';
it('coalesces duplicate research across two connections and preserves cached observations across restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-efficiency-')),file=path.join(dir,'state.db');
 let a=createDatabase(file);const b=createDatabase(file),signal=new AbortController().signal;
 try{
  let complete!:(value:string)=>void;const work=vi.fn(()=>new Promise<string>(resolve=>{complete=resolve;}));
  const pending=reusePublicResearch(a.raw,{topic:'test'},signal,work,valid);
  await expect(reusePublicResearch(b.raw,{topic:'test'},signal,work,valid)).rejects.toThrow('already in progress');
  expect(work).toHaveBeenCalledOnce();complete('verified public source');expect(await pending).toBe('verified public source');
  a.close();a=createDatabase(file);
  expect(await reusePublicResearch(a.raw,{topic:'test'},signal,work,valid)).toBe('verified public source');expect(work).toHaveBeenCalledOnce();
  expect(a.raw.prepare('SELECT hits,misses,busy FROM research_reuse_metrics').get()).toEqual({hits:1,misses:1,busy:1});
  a.raw.exec("UPDATE research_result_cache SET payload='\"tampered\"'");
  await expect(reusePublicResearch(a.raw,{topic:'test'},signal,work,valid)).rejects.toThrow('integrity');
 }finally{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('bounds adaptive freshness; changed context or expired data requires work and private data is not cached',async()=>{
 const db=createDatabase(':memory:'),signal=new AbortController().signal;
 let now=Date.now();const clock=vi.spyOn(Date,'now').mockImplementation(()=>now),work=vi.fn(async()=>'unchanged public result');
 try{
  for(let i=0;i<5;i++){
   await reusePublicResearch(db.raw,{topic:'test'},signal,work,valid);
   const expiry=(db.raw.prepare('SELECT expires_ms FROM research_result_cache').get() as {expires_ms:number}).expires_ms;
   expect(expiry-now).toBeLessThanOrEqual(300000);now=expiry+1;
  }
  expect(work).toHaveBeenCalledTimes(5);
  await reusePublicResearch(db.raw,{topic:'different'},signal,work,valid);expect(work).toHaveBeenCalledTimes(6);
  const personal=vi.fn(async()=>'customer@example.invalid');
  await reusePublicResearch(db.raw,{topic:'private'},signal,personal,valid);
  await reusePublicResearch(db.raw,{topic:'private'},signal,personal,valid);expect(personal).toHaveBeenCalledTimes(2);
  const abort=new AbortController();abort.abort();
  await expect(reusePublicResearch(db.raw,{topic:'different'},abort.signal,work,valid)).rejects.toThrow();
 }finally{clock.mockRestore();db.close();}
});
