import {it,expect,vi} from 'vitest';
import {fetchSource} from '../revenue/long-history/download.js';
import {sourceCatalogue} from '../revenue/long-history/sources.js';
const source=()=>({...sourceCatalogue()[0],licenseStatus:'allowed' as const,licenseEvidence:'test permission'});
const lookup=async()=>[{address:'8.8.8.8',family:4}];
it('does not request a source whose permission is pending',async()=>{
 let calls=0;await expect(fetchSource(sourceCatalogue()[0],{remainingBytes:100,fetchImpl:async()=>{calls++;return new Response('x');},lookup})).rejects.toThrow(/allowed/i);expect(calls).toBe(0);
});
it('returns actual bytes and refuses streamed bytes beyond the reserved limit',async()=>{
 const options={remainingBytes:3,fetchImpl:async()=>new Response('abc'),lookup};
 const r=await fetchSource(source(),options);expect(Buffer.from(r.bytes).toString()).toBe('abc');expect(r.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 await expect(fetchSource(source(),{...options,remainingBytes:2})).rejects.toThrow(/size/i);
});
it('rejects declared oversize before reading the response stream',async()=>{
 await expect(fetchSource(source(),{remainingBytes:3,lookup,fetchImpl:async()=>new Response('abc',{headers:{'content-length':'4'}})})).rejects.toThrow(/size/i);
});
it('refuses redirect outside the source allowlist',async()=>{
 await expect(fetchSource(source(),{remainingBytes:100,lookup,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://evil.example/data.csv'}})})).rejects.toThrow(/host/i);
});
it('rejects a private resolved address before network access',async()=>{
 let calls=0;await expect(fetchSource(source(),{remainingBytes:100,lookup:async()=>[{address:'127.0.0.1',family:4}],fetchImpl:async()=>{calls++;return new Response('x');}})).rejects.toThrow(/address/i);expect(calls).toBe(0);
});
it('abort settles even when an upstream request ignores cancellation',async()=>{
 const c=new AbortController();const pending=fetchSource(source(),{remainingBytes:100,signal:c.signal,lookup,fetchImpl:()=>new Promise<Response>(()=>{})});c.abort();await expect(pending).rejects.toThrow(/abort/i);
});
it('distinguishes the unchanged sixty-second deadline from cancellation by the parent',async()=>{
 vi.useFakeTimers();const deadline=vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{expect(ms).toBe(60000);const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;});try{
  const pending=expect(fetchSource(source(),{remainingBytes:100,lookup,fetchImpl:()=>new Promise<Response>(()=>{})})).rejects.toMatchObject({code:'source_timeout'});
  await vi.advanceTimersByTimeAsync(60001);await pending;
  const parent=new AbortController();const cancelled=expect(fetchSource(source(),{remainingBytes:100,lookup,signal:parent.signal,fetchImpl:()=>new Promise<Response>(()=>{})})).rejects.toMatchObject({code:'source_aborted'});parent.abort();await cancelled;
 }finally{deadline.mockRestore();vi.useRealTimers();}
});
