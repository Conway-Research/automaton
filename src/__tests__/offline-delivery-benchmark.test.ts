import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import childProcess from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {MockTarget,MockWorkflow,HEADER,HANDOVER,cleanCsv,digest,encodeCsv,parseCsv,syntheticCsv} from './fixtures/offline-delivery-benchmark.js';

const forbidden=vi.fn(()=>{throw Error('OFFLINE_BENCHMARK_FORBIDDEN_IO');});
beforeAll(()=>{
  vi.stubGlobal('fetch',forbidden);
  vi.spyOn(http,'request').mockImplementation(forbidden);
  vi.spyOn(http,'get').mockImplementation(forbidden);
  vi.spyOn(https,'request').mockImplementation(forbidden);
  vi.spyOn(https,'get').mockImplementation(forbidden);
  vi.spyOn(net.Socket.prototype,'connect').mockImplementation(forbidden);
  vi.spyOn(childProcess,'exec').mockImplementation(forbidden);
  vi.spyOn(childProcess,'execSync').mockImplementation(forbidden);
  vi.spyOn(childProcess,'execFile').mockImplementation(forbidden);
  vi.spyOn(childProcess,'execFileSync').mockImplementation(forbidden);
  vi.spyOn(childProcess,'spawn').mockImplementation(forbidden);
  vi.spyOn(childProcess,'spawnSync').mockImplementation(forbidden);
  vi.spyOn(childProcess,'fork').mockImplementation(forbidden);
});
afterAll(()=>{expect(forbidden).not.toHaveBeenCalled();vi.restoreAllMocks();vi.unstubAllGlobals();});

const event=(id:string)=>({id:`evt-${id}`,sku:'SKU-0001',quantity:2});
function fixture() {
  const db=new Database(':memory:'),remote=new Database(':memory:');
  const target=new MockTarget(remote),workflow=new MockWorkflow(db,target);
  return {db,remote,target,workflow,close:()=>{db.close();remote.close();}};
}

describe('offline delivery fixed workflow contract',()=>{
  it('maps one trigger to exactly one target action and delivers an audit trail',()=>{
    const f=fixture();try{
      expect(f.workflow.handle(event('happy'))).toBe('done');
      expect(f.target.receipt('evt-happy')).toEqual({payload:'{"product":"SKU-0001","units":2}'});
      expect(f.db.prepare('SELECT code FROM audit ORDER BY seq').all()).toEqual([{code:'ACCEPTED'},{code:'ATTEMPT'},{code:'done'}]);
    }finally{f.close();}
  });
  it.each([null,{}, {id:'evt-missing',sku:'SKU-0001'}, {...event('bad'),quantity:0},
    {...event('bad'),quantity:1.5},{...event('bad'),quantity:'2'}, {...event('bad'),sku:'=1+1'},
    {...event('bad'),permission:'admin'}])('rejects invalid or privilege-bearing input %j',input=>{
    const f=fixture();try{expect(f.workflow.handle(input)).toBe('invalid');expect(f.target.calls).toBe(0);}finally{f.close();}
  });
  it('deduplicates replay and rejects changed content under the same key',()=>{
    const f=fixture();try{
      expect(f.workflow.handle(event('duplicate'))).toBe('done');
      expect(f.workflow.handle(event('duplicate'))).toBe('done');
      expect(f.workflow.handle({...event('duplicate'),quantity:3})).toBe('conflict');
      expect(f.target.calls).toBe(1);
    }finally{f.close();}
  });
  it('bounds transient retries and leaves exhausted retries for review',()=>{
    const f=fixture();try{
      f.target.fault='timeout-before';expect(f.workflow.handle(event('retry'))).toBe('review');
      expect(f.target.calls).toBe(3);expect(f.target.receipt('evt-retry')).toBeUndefined();
      expect(f.workflow.handle(event('retry'))).toBe('review');expect(f.target.calls).toBe(3);
    }finally{f.close();}
  });
  it('recovers a transient pre-commit failure without manual intervention',()=>{
    const f=fixture();try{
      const original=f.target.put.bind(f.target);let failures=0;
      vi.spyOn(f.target,'put').mockImplementation(e=>{if(failures++===0)throw Error('RETRYABLE');original(e);});
      expect(f.workflow.handle(event('transient'))).toBe('done');
      expect(f.db.prepare("SELECT COUNT(*) n FROM audit WHERE code='ATTEMPT'").get()).toEqual({n:2});
    }finally{f.close();}
  });
  it('blocks permission errors without retries or self-authorization',()=>{
    const f=fixture();try{
      f.target.fault='denied';expect(f.workflow.handle(event('denied'))).toBe('blocked');
      f.target.fault='none';expect(f.workflow.handle(event('denied'))).toBe('blocked');
      expect(f.target.calls).toBe(1);expect(f.target.receipt('evt-denied')).toBeUndefined();
    }finally{f.close();}
  });
  it('reconciles uncertain target commits from receipts without repeating the action',()=>{
    const f=fixture();try{
      f.target.fault='timeout-after';expect(f.workflow.handle(event('partial'))).toBe('review');
      expect(f.workflow.reconcile('evt-partial')).toBe('done');expect(f.target.calls).toBe(1);
    }finally{f.close();}
  });
  it('fails closed when audit persistence fails',()=>{
    const f=fixture();try{
      f.db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      expect(()=>f.workflow.handle(event('audit'))).toThrow('synthetic failure');expect(f.target.calls).toBe(0);
    }finally{f.close();}
  });
  it('survives reopening temporary databases after a crash between target and local commit',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-offline-delivery-'));
    let db=new Database(path.join(dir,'local.db')),remote=new Database(path.join(dir,'target.db'));
    try{
      let target=new MockTarget(remote);target.fault='crash-after';
      expect(()=>new MockWorkflow(db,target).handle(event('crash'))).toThrow('Synthetic crash');
      db.close();remote.close();
      db=new Database(path.join(dir,'local.db'));remote=new Database(path.join(dir,'target.db'));
      target=new MockTarget(remote);const restored=new MockWorkflow(db,target);
      expect(restored.handle(event('crash'))).toBe('pending');
      expect(restored.reconcile('evt-crash')).toBe('done');expect(target.calls).toBe(0);
      expect(remote.prepare('SELECT COUNT(*) n FROM target').get()).toEqual({n:1});
    }finally{
      db.close();remote.close();
      // Delete only our new temporary fixture directory, never a project path.
      expect(fs.realpathSync(dir)).toBe(path.join(fs.realpathSync(os.tmpdir()),path.basename(dir)));
      expect(path.basename(dir).startsWith('obolus-offline-delivery-')).toBe(true);
      fs.rmSync(dir,{recursive:true,force:true});
    }
  });
});

describe('offline delivery CSV fixed contract',()=>{
  it('retains all 480 rows and protected values, quarantines ambiguity, exports safe records only',()=>{
    const input=syntheticCsv(),original=parseCsv(input).slice(1),result=cleanCsv(input);
    expect(result.records).toHaveLength(480);expect(result.sourceDigest).toBe(digest(input));
    for(const [index,record] of result.records.entries()) {
      expect(record.original).toEqual(original[index]);
      for(const column of [0,4,5])expect(record.values[column]).toBe(original[index][column]);
    }
    expect(new Set(result.records.map(r=>r.sourceRow)).size).toBe(480);
    expect(result.changes).toEqual([{row:15,field:'title',before:'  Safe title  ',after:'Safe title',rule:'TRIM_TITLE_ONLY'}]);
    const rejected=result.records.filter(r=>r.status==='quarantine');
    expect(rejected.map(r=>r.sourceRow)).toEqual([...Array.from({length:13},(_,i)=>i+2),17,18,19,20,21,22]);
    expect(JSON.parse(result.quarantineJson)).toHaveLength(19);
    const approved=parseCsv(result.acceptedCsv).slice(1);
    expect(approved).toHaveLength(461);
    expect(approved.flat().some(value=>{
      const prefix=[...value].filter(c=>c.charCodeAt(0)>32).join('').trimStart()[0];
      return prefix!==undefined && '=+@-'.includes(prefix);
    })).toBe(false);
    expect(approved.some(row=>row[2]==='A "quoted", multiline\r\ntitle')).toBe(true);
    expect(result.records[2].values[4]).toBe('12,50');
    expect(result.records[4].values).toEqual(result.records[5].values);
  });
  it.each(['"unterminated','a"b','"a"b',encodeCsv([['wrong'],['x']]),encodeCsv([HEADER,['short']])])('rejects malformed CSV/schema without partial export %s',input=>{
    expect(()=>cleanCsv(input)).toThrow();
  });
  it('enforces record/byte limits and permits the exact 500-record boundary',()=>{
    const rows=parseCsv(syntheticCsv());
    for(let i=480;i<500;i++)rows.push([`SKU-${String(i).padStart(4,'0')}`,`p-${i}`,'title','small','1.00','0']);
    expect(cleanCsv(encodeCsv(rows)).records).toHaveLength(500);
    rows.push(rows[1]);expect(()=>cleanCsv(encodeCsv(rows))).toThrow('ROWS');
    expect(()=>parseCsv('x'.repeat(1_000_001))).toThrow('SIZE');
  });
  it('preserves CSV quoting, empty cells, Unicode and line breaks in deterministic round trips',()=>{
    const cells=['','plain','a,b','a"b','a\r\nb','äö你好','000123','=1+1'];
    const rows=cells.map(a=>cells.map(b=>a+b));expect(parseCsv(encodeCsv(rows))).toEqual(rows);
  });
});

it('measures repeated synthetic deliveries; no real provider costs or customer evidence',()=>{
  const samples:{workflowMs:number;csvMs:number;workflowCpuMs:number;csvCpuMs:number}[]=[];
  const cpu=process.cpuUsage(),wall=performance.now(),rssBefore=process.memoryUsage().rss;
  let rssMax=rssBefore;
  const input=syntheticCsv();let workflowSummary:unknown;
  const audit=cleanCsv(input);
  for(let run=0;run<31;run++) {
    const start=performance.now(),workflowCpu=process.cpuUsage(),f=fixture();
    const trigger=vi.spyOn(f.workflow,'handle');
    try{
      for(let i=0;i<200;i++)expect(f.workflow.handle(event(String(i)))).toBe('done');
      for(let i=0;i<10;i++)expect(f.workflow.handle(event(String(i)))).toBe('done');
      for(const invalid of [null,{}, {...event('bad'),quantity:0},{...event('bad'),sku:'bad'}])expect(f.workflow.handle(invalid)).toBe('invalid');
      expect(f.workflow.handle({...event('0'),quantity:3})).toBe('conflict');
      f.target.fault='denied';expect(f.workflow.handle(event('denied'))).toBe('blocked');
      f.target.fault='timeout-before';expect(f.workflow.handle(event('retry'))).toBe('review');
      f.target.fault='timeout-after';expect(f.workflow.handle(event('partial'))).toBe('review');
      expect(f.workflow.reconcile('evt-partial')).toBe('done');
      f.target.fault='crash-after';expect(()=>f.workflow.handle(event('crash'))).toThrow('Synthetic crash');
      expect(new MockWorkflow(f.db,f.target).reconcile('evt-crash')).toBe('done');
      expect(f.remote.prepare('SELECT COUNT(*) n FROM target').get()).toEqual({n:202});
      expect(f.target.calls).toBe(206);
      const countCode=(code:string)=>(f.db.prepare('SELECT COUNT(*) n FROM audit WHERE code=?').get(code) as {n:number}).n;
      const countStatus=(status:string)=>(f.db.prepare('SELECT COUNT(*) n FROM jobs WHERE status=?').get(status) as {n:number}).n;
      workflowSummary={inputDeliveries:trigger.mock.calls.length,uniqueCompletedActions:countStatus('done'),targetAttempts:f.target.calls,
        duplicateReplays:countCode('DUPLICATE'),invalidInputs:countCode('INVALID'),identityConflicts:countCode('CONFLICT'),blockedPermission:countStatus('blocked'),
        exhaustedRetryCases:countStatus('review'),automaticReceiptRecoveries:2,unexpectedDuplicateWrites:0,
        reviewCasesUnresolved:countCode('INVALID')+countCode('CONFLICT')+countStatus('blocked')+countStatus('review'),actualHumanInterventions:0,
        auditRecords:(f.db.prepare('SELECT COUNT(*) n FROM audit').get() as {n:number}).n};
    }finally{trigger.mockRestore();f.close();}
    const wcpu=process.cpuUsage(workflowCpu),workflowMs=performance.now()-start,csvStart=performance.now(),csvCpu=process.cpuUsage();
    const result=cleanCsv(input);expect(result.records).toHaveLength(480);
    const ccpu=process.cpuUsage(csvCpu),csvMs=performance.now()-csvStart;
    if(run>0)samples.push({workflowMs,csvMs,workflowCpuMs:(wcpu.user+wcpu.system)/1000,csvCpuMs:(ccpu.user+ccpu.system)/1000}); // first run explicitly warm-up
    rssMax=Math.max(rssMax,process.memoryUsage().rss);
  }
  const used=process.cpuUsage(cpu);
  const summary=(key:'workflowMs'|'csvMs')=>{const n=samples.map(s=>s[key]).sort((a,b)=>a-b);return {minMs:n[0],medianMs:(n[14]+n[15])/2,p95Ms:n[Math.ceil(.95*n.length)-1],maxMs:n.at(-1)};};
  const report={kind:'SYNTHETIC_OFFLINE_BENCHMARK_NOT_DEMAND',liveReady:false,node:process.version,
    platform:process.platform,arch:process.arch,cpuModel:os.cpus()[0]?.model,logicalCpus:os.cpus().length,
    measuredRuns:30,warmupRuns:1,handover:HANDOVER,workflow:summary('workflowMs'),csv:summary('csvMs'),workflowSummary,
    csvSummary:{rows:480,accepted:461,quarantined:19,automaticChanges:audit.changes,
      protectedFieldChanges:0,lostRows:0,reviewCases:19,actualHumanCorrections:0,
      inputBytes:Buffer.byteLength(input),acceptedBytes:Buffer.byteLength(audit.acceptedCsv),
      quarantineBytes:Buffer.byteLength(audit.quarantineJson),
      quarantine:audit.records.filter(r=>r.status==='quarantine').map(r=>({sourceRow:r.sourceRow,issues:r.issues}))},
    batchWallMs:performance.now()-wall,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,
    rssBeforeBytes:rssBefore,rssSampledMaxBytes:rssMax,processPeakRssKiB:process.resourceUsage().maxRSS,
    forbiddenIoAttempts:forbidden.mock.calls.length,realProviderCalls:0,realProviderCharges:0,
    modelTokens:'not measured: no model used',providerBilling:'not queried; zero calls made',virtualRetries:'immediate, no network latency/backoff simulated',
    samples};
  console.log('OFFLINE_DELIVERY_BENCHMARK '+JSON.stringify(report));
  expect(forbidden).not.toHaveBeenCalled();
});
