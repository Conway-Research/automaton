import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({exec:vi.fn()}));
vi.mock('node:child_process',()=>({execFile:m.exec}));
import {readSearchCredential} from '../online/search-credentials.js';
import type {SearchProvider} from '../online/search-adapters.js';
beforeEach(()=>{m.exec.mockReset();});
it('TED never reads secrets',async()=>{expect(await readSearchCredential('ted')).toBeUndefined();expect(m.exec).not.toHaveBeenCalled();});
it('unknown provider cannot interpolate a command',async()=>{await expect(readSearchCredential("x';curl" as SearchProvider)).rejects.toThrow();expect(m.exec).not.toHaveBeenCalled();});
it.runIf(process.platform==='win32').each(['short','sk-synthetic-credential','tvly-unsafe\nvalue','a'.repeat(4097)])('rejects malformed credential output without exposing it',async s=>{m.exec.mockImplementation((_p,_a,_o,cb)=>cb(null,s));await expect(readSearchCredential('tavily')).rejects.toThrow('invalid');});
it.runIf(process.platform==='win32')('bounds process and strips provider errors',async()=>{m.exec.mockImplementation((_p,_a,_o,cb)=>cb(Error('synthetic-secret')));await expect(readSearchCredential('serper')).rejects.toThrow('Protected search credential read failed');const opts=m.exec.mock.calls[0][2];expect(opts.timeout).toBe(10000);expect(opts.maxBuffer).toBe(8192);expect(opts.windowsHide).toBe(true);});

it.runIf(process.platform==='win32').each(['brave','firecrawl'] as const)('loads %s only through the fixed protected pipe',async provider=>{
 const secret=provider==='firecrawl'?'fc-synthetic-key-123456789':'synthetic-key-123456789';
 m.exec.mockImplementation((_p,_a,_o,cb)=>cb(null,secret));
 expect(await readSearchCredential(provider)).toBe(secret);
 const [file,args,opts]=m.exec.mock.calls[0];
 expect(file).toMatch(/powershell.exe$/);expect(args.join(' ')).toContain(provider+'.dpapi');
 expect(args.join(' ')).not.toContain(secret);expect(JSON.stringify(opts.env)).not.toContain(secret);
});
it.runIf(process.platform==='win32').each([['brave','fc-wrong-provider-123456789'],['firecrawl','tvly-wrong-provider-123456789'],['firecrawl','missing-prefix-123456789']])('rejects swapped %s credential',async(provider,key)=>{
 m.exec.mockImplementation((_p,_a,_o,cb)=>cb(null,key));
 await expect(readSearchCredential(provider as SearchProvider)).rejects.toThrow('invalid');
});
