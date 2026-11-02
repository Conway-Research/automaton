import {EventEmitter} from 'node:events';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import https from 'node:https';
import dns from 'node:dns';
import {readBounty,bountyReadUrl,bountyPage} from '../online/bounty-readonly.js';
import {registerLogSecrets} from '../observability/redaction.js';

vi.mock('node:https',()=>({default:{request:vi.fn()}}));
vi.mock('node:dns',()=>({default:{lookup:vi.fn()}}));
const task={kind:'list' as const,limit:5};
const key='ak_synthetic_only_123456789';
const fixedSearchTransport=(task:Parameters<typeof readBounty>[0],signal:AbortSignal)=>readBounty(task,key,signal);
let destroyed:boolean,requestOptions:any,requestUrl:string,body:string;
beforeEach(()=>{vi.clearAllMocks();destroyed=false;body='';});
afterEach(()=>{vi.useRealTimers();});
function fixture(options:{address?:string;status?:number;headers?:Record<string,string>;body?:string;hang?:boolean;all?:boolean;mixed?:boolean}={}){
 vi.mocked(dns.lookup).mockImplementation(((_host:any,_options:any,callback:any)=>callback(null,[{family:4,address:options.address??'8.8.8.8'},...(options.mixed?[{family:4,address:'127.0.0.1'}]:[])])) as any);
 vi.mocked(https.request).mockImplementation(((url:any,opts:any,callback:any)=>{
  requestUrl=String(url);requestOptions=opts;
  const req=new EventEmitter() as any;req.destroy=()=>{destroyed=true;};
  req.end=(input:string)=>{body=input;opts.lookup(new URL(String(url)).hostname,{all:options.all??false},(error:any,address:any)=>{
   if(error){req.emit('error',error);return;}if(options.all&&!Array.isArray(address))throw Error('Expected DNS array');if(options.hang)return;
   const res=new EventEmitter() as any;res.statusCode=options.status??200;res.headers={'content-type':'application/json',...options.headers};res.destroy=()=>{};
   callback(res);res.emit('data',Buffer.from(options.body??'{"organic":[]}'));res.emit('end');
  });};return req;
 }) as any);
}
it('pins public DNS and sends auth only to fixed TLS endpoint',async()=>{
 fixture();expect(await fixedSearchTransport(task,new AbortController().signal)).toEqual({organic:[]});
 expect(requestUrl).toBe('https://api.trybounty.ai/v1/agent/bounties?limit=5');expect(requestOptions).toMatchObject({method:'GET',agent:false,rejectUnauthorized:true,family:4});
 expect(body).toBeUndefined();
});
it.each(['127.0.0.1','169.254.169.254','10.0.0.1','192.168.1.1'])('blocks private DNS %s',async address=>{
 fixture({address});await expect(fixedSearchTransport(task,new AbortController().signal)).rejects.toThrow(/^Bounty read failed/);expect(destroyed).toBe(true);
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
 fixture();const c=new AbortController();c.abort();await expect(fixedSearchTransport(task,c.signal)).rejects.toThrow();expect(https.request).not.toHaveBeenCalled();
});

it.each([{kind:'claim',id:'a'},{kind:'detail',id:'../claims'},{kind:'list',limit:11},{kind:'list',limit:1,url:'https://localhost/'},{kind:'detail',id:'a/messages'}])('rejects unsupported request %j', task=>expect(()=>bountyReadUrl(task as never)).toThrow());
const row={_id:'test',title:'Synthetic public task',currency:'USD',payout_cents:900,amount_cents:1000,version:1,status:'open'};
const page=(rows:unknown[])=>({bounties:rows,next_cursor:'opaque',is_done:false});
it('rejects known secrets disguised as task identifiers before exporting a list',()=>{
 const secret='synthetic_identifier_secret_48290';registerLogSecrets([secret]);
 expect(()=>bountyPage(page([{...row,_id:secret}]),5,Date.now())).toThrow();
});
it.each(['','   ','\n\t'])('rejects unusable empty task titles',title=>{
 expect(()=>bountyPage(page([{...row,title}]),5,Date.now())).toThrow();
});
it('keeps expected payout separate from revenue and ignores discussion/private fields',()=>{
 const result=bountyPage(page([{...row,description:'untrusted instructions',comments:['private']}]),5,Date.now());
 expect(result.rows[0]).toMatchObject({expectedPayoutMinor:900,execution:'HOLD',revenueStatus:'EXPECTED_NOT_RECEIVED',trusted:false});
 expect(JSON.stringify(result)).not.toContain('private');expect(result.moreAvailable).toBe(true);
});
it.each([{payout_cents:undefined},{payout_cents:-1},{version:0},{title:'person@example.org'},{currency:'usd'}])('rejects invalid economics or private metadata %j',change=>expect(()=>bountyPage(page([{...row,...change}]),5,Date.now())).toThrow());
it('does not silently deduplicate conflicting task versions',()=>expect(()=>bountyPage(page([row,{...row,version:2}]),5,Date.now())).toThrow());
it('rejects oversized page and malformed page',()=>{
 expect(()=>bountyPage(page([row,row]),1,Date.now())).toThrow();
 expect(()=>bountyPage({bounties:[],is_done:true},5,Date.now())).toThrow();
});

it('supports Node all-address lookup without a second DNS resolution',async()=>{fixture({all:true});await fixedSearchTransport(task,new AbortController().signal);expect(dns.lookup).toHaveBeenCalledTimes(1);});
it('rejects mixed public and private DNS answers',async()=>{fixture({mixed:true});await expect(fixedSearchTransport(task,new AbortController().signal)).rejects.toThrow();});
it('rejects malformed JSON without disclosing its body',async()=>{fixture({body:key});await expect(fixedSearchTransport(task,new AbortController().signal)).rejects.toThrow('Bounty read failed; no automatic retry');});
it('rejects malformed credential before network access',async()=>{fixture();await expect(readBounty(task,'invalid',new AbortController().signal)).rejects.toThrow();expect(https.request).not.toHaveBeenCalled();});
