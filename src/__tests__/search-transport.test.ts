import {EventEmitter} from 'node:events';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import https from 'node:https';
import dns from 'node:dns';
import {fixedSearchTransport} from '../online/search-transport.js';
import {readSearchCredential} from '../online/search-credentials.js';
vi.mock('node:https',()=>({default:{request:vi.fn()}}));
vi.mock('node:dns',()=>({default:{lookup:vi.fn()}}));
vi.mock('../online/search-credentials.js',()=>({readSearchCredential:vi.fn(async()=> 'synthetic-search-key-123456789')}));
const task={provider:'serper' as const,query:'public buyer requests',limit:5};
let destroyed:boolean,requestOptions:any,requestUrl:string,body:string;
beforeEach(()=>{vi.clearAllMocks();destroyed=false;body='';});
afterEach(()=>{vi.useRealTimers();});
function fixture(options:{address?:string;status?:number;headers?:Record<string,string>;body?:string;hang?:boolean}={}){
 vi.mocked(dns.lookup).mockImplementation(((_host:any,_options:any,callback:any)=>callback(null,[{family:4,address:options.address??'8.8.8.8'}])) as any);
 vi.mocked(https.request).mockImplementation(((url:any,opts:any,callback:any)=>{
  requestUrl=String(url);requestOptions=opts;
  const req=new EventEmitter() as any;req.destroy=()=>{destroyed=true;};
  req.end=(input:string)=>{body=input;opts.lookup(new URL(String(url)).hostname,{},(error:any)=>{
   if(error){req.emit('error',error);return;}if(options.hang)return;
   const res=new EventEmitter() as any;res.statusCode=options.status??200;res.headers={'content-type':'application/json',...options.headers};res.destroy=()=>{};
   callback(res);res.emit('data',Buffer.from(options.body??'{"organic":[]}'));res.emit('end');
  });};return req;
 }) as any);
}
it('pins public DNS and sends auth only to fixed TLS endpoint',async()=>{
 fixture();expect(await fixedSearchTransport(task,new AbortController().signal)).toEqual({organic:[]});
 expect(requestUrl).toBe('https://google.serper.dev/search');expect(requestOptions).toMatchObject({method:'POST',agent:false,rejectUnauthorized:true,family:4});
 expect(body).not.toContain('synthetic-search-key');expect(JSON.parse(body)).toEqual({q:task.query,num:5});
});
it.each(['127.0.0.1','169.254.169.254','10.0.0.1','192.168.1.1'])('blocks private DNS %s',async address=>{
 fixture({address});await expect(fixedSearchTransport(task,new AbortController().signal)).rejects.toThrow(/^Search transport failed/);expect(destroyed).toBe(true);
});
it.each([301,302,401,403,429,500])('rejects status %s without redirect or retry',async status=>{
 fixture({status,headers:{location:'http://localhost/secret'}});await expect(fixedSearchTransport(task,new AbortController().signal)).rejects.toThrow();expect(https.request).toHaveBeenCalledTimes(1);
});
it.each([{'retry-after':'60'},{'content-length':'1000001'},{'content-encoding':'gzip'},{'content-type':'text/html'}] as Record<string,string>[])('rejects unsafe response headers %j',async headers=>{
 fixture({headers});await expect(fixedSearchTransport(task,new AbortController().signal)).rejects.toThrow();
});
it('bounds actual body even without length declaration',async()=>{fixture({body:'x'.repeat(1000001)});await expect(fixedSearchTransport(task,new AbortController().signal)).rejects.toThrow();expect(destroyed).toBe(true);});
it('cancels a hung socket after timeout',async()=>{
 vi.useFakeTimers();fixture({hang:true});const work=expect(fixedSearchTransport(task,new AbortController().signal)).rejects.toThrow();await vi.advanceTimersByTimeAsync(15001);await work;expect(destroyed).toBe(true);
});
it('does not load secrets or open a connection after cancellation',async()=>{
 fixture();const c=new AbortController();c.abort();await expect(fixedSearchTransport(task,c.signal)).rejects.toThrow();expect(readSearchCredential).not.toHaveBeenCalled();expect(https.request).not.toHaveBeenCalled();
});
it('rechecks permission after credential loading, before opening a socket',async()=>{
 fixture();await expect(fixedSearchTransport(task,new AbortController().signal,()=>{throw Error('Revoked');})).rejects.toThrow('Revoked');expect(https.request).not.toHaveBeenCalled();
});

it.each(['brave','firecrawl'] as const)('sends the bounded %s wire contract without enrichment',async provider=>{
 vi.mocked(readSearchCredential).mockResolvedValue(provider==='firecrawl'?'fc-synthetic-1234567890':'synthetic-search-key-123456789');
 fixture({body:provider==='brave'?'{"web":{"results":[]}}':'{"success":true,"data":{"web":[]}}'});
 await fixedSearchTransport({...task,provider},new AbortController().signal);
 expect(requestOptions.agent).toBe(false);expect(requestOptions.rejectUnauthorized).toBe(true);
 if(provider==='brave'){
  expect(requestOptions.method).toBe('GET');expect(requestOptions.headers['x-subscription-token']).toBe('synthetic-search-key-123456789');
  expect(new URL(requestUrl).origin).toBe('https://api.search.brave.com');expect(new URL(requestUrl).searchParams.get('count')).toBe('5');
  expect(new URL(requestUrl).searchParams.get('result_filter')).toBe('web');expect(body).toBeUndefined();
 }else{
  expect(requestOptions.method).toBe('POST');expect(requestUrl).toBe('https://api.firecrawl.dev/v2/search');
  expect(JSON.parse(body)).toEqual({query:task.query,limit:5,sources:['web'],domainTools:false,highlights:false,timeout:10000});
 }
 expect(requestUrl).not.toContain('synthetic');
});
it.each(['brave','firecrawl'] as const)('does not redirect %s credentials or retry rejected requests',async provider=>{
 vi.mocked(readSearchCredential).mockResolvedValue(provider==='firecrawl'?'fc-synthetic-1234567890':'synthetic-search-key-123456789');
 fixture({status:302,headers:{location:'https://attacker.example.org/'}});
 await expect(fixedSearchTransport({...task,provider},new AbortController().signal)).rejects.toThrow();
 expect(https.request).toHaveBeenCalledTimes(1);
});
