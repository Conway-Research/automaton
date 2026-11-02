import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createIsolatedPodmanFixture} from '../security/isolated-podman-fixture.js';
import {ISOLATED_PROFILE,ISOLATED_PROFILE_DIGEST,type IsolatedJobLedger} from '../security/isolated-job-ledger.js';
import {isProtectedFile} from '../self-mod/code.js';
import type {IsolatedRuntimeCapacity} from '../security/isolated-runtime-capacity.js';

const mock=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock('node:child_process',()=>({spawn:mock.spawn}));
const request={id:'job-fixture',runtimeId:'obolus-job-11111111-2222-3333-4444-555555555555',
  files:[{name:'empty.txt',text:''},{name:'text.txt',text:"ä\n' $(danger) ; & < >"}],profile:ISOLATED_PROFILE};
const stopped=JSON.stringify({Running:false,Pid:0,Status:'exited'});
let replies:{text:string;code:number;fault?:'stdin'|'spawn'|'hang'|'kill-throws'}[]=[];
let calls:{executable:string;args:string[];options:Record<string,unknown>;input:string|undefined}[]=[];
let ledger:{assertDispatch:ReturnType<typeof vi.fn>};
let capacity:{reserve:ReturnType<typeof vi.fn>};
let release:ReturnType<typeof vi.fn>;
const platform=Object.getOwnPropertyDescriptor(process,'platform')!;
beforeEach(()=>{
  Object.defineProperty(process,'platform',{value:'win32'});
  ledger={assertDispatch:vi.fn()};calls=[];
  release=vi.fn();capacity={reserve:vi.fn(()=>({releaseAfterObservedTermination:release}))};
  replies=[{text:'true\n',code:0},{text:request.files.map(f=>`${f.name}\t${Buffer.from(f.text).toString('base64')}\n`).join(''),code:0},{text:stopped,code:0},{text:'',code:0}];
  mock.spawn.mockImplementation((executable:string,args:string[],options:Record<string,unknown>)=>{
    const child=Object.assign(new EventEmitter(),{stdin:Object.assign(new EventEmitter(),{end:(_input?:string)=>{}}),stdout:new EventEmitter(),stderr:new EventEmitter(),kill:vi.fn()});
    const call={executable,args,options,input:undefined as string|undefined};calls.push(call);
    child.stdin.end=(input?:string)=>{call.input=input;const reply=replies.shift();queueMicrotask(()=>{
      if(!reply){child.emit('error',Error('unexpected fixture call'));return;}
      if(reply.fault==='hang')return;
      if(reply.fault==='kill-throws')child.kill.mockImplementation(()=>{throw Error('synthetic private platform exception');});
      if(reply.fault==='stdin'||reply.fault==='kill-throws'){child.stdin.emit('error',Error('synthetic private stdin exception'));return;}
      if(reply.fault==='spawn'){child.emit('error',Error('synthetic private process exception'));return;}
      child.stdout.emit('data',Buffer.from(reply.text));child.emit('close',reply.code);
    });};return child;
  });
});
afterEach(()=>{vi.useRealTimers();Object.defineProperty(process,'platform',platform);vi.clearAllMocks();});
const adapter=()=>createIsolatedPodmanFixture(ledger as unknown as IsolatedJobLedger,capacity as unknown as IsolatedRuntimeCapacity);

it('uses the bound fixed runtime with no shell or ambient secret environment, preserving empty and non-ASCII files',async()=>{
  const transport=adapter();expect(Object.isFrozen(transport)).toBe(true);expect(transport.profileDigest).toBe(ISOLATED_PROFILE_DIGEST);
  const result=await transport.run(request,new AbortController().signal);
  expect(result).toEqual({terminated:true,exitCode:0,output:request.files});
  expect(ledger.assertDispatch).toHaveBeenCalledTimes(2);
  for(const call of calls){
    expect(call.executable).toBe('C:\\Windows\\System32\\wsl.exe');
    expect(call.options).toMatchObject({shell:false,windowsHide:true,env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',WSLENV:''}});
    expect(Object.keys(call.options.env as object)).toHaveLength(3);
    expect(call.args.slice(0,6)).toEqual(['-d','podman-obolus-isolation-test','-u','user','--','/usr/bin/podman']);
  }
  const execution=calls.find(call=>call.args.includes('run'))!;
  expect(execution.args).toEqual(expect.arrayContaining(['--pull=never','--network=none','--cap-drop=ALL','--read-only','--timeout=10',ISOLATED_PROFILE.image]));
  expect(execution.input).not.toContain('$(danger)');expect(execution.input).toContain(Buffer.from(request.files[1].text).toString('base64'));
  expect(calls.at(-1)?.args).toContain('rm');
  expect(capacity.reserve).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledOnce();
});
it.each(['path','runtime-id','profile','unknown-command'] as const)('rejects %s before invoking the host controller',async invalid=>{
  const bad={...request,files:request.files.map(f=>({...f}))};
  if(invalid==='path')bad.files[0].name='../escape.txt';
  if(invalid==='runtime-id')bad.runtimeId='--privileged';
  if(invalid==='profile')Object.assign(bad,{profile:{...ISOLATED_PROFILE,network:'host'}});
  if(invalid==='unknown-command')Object.assign(bad,{command:'unsafe'});
  await expect(adapter().run(bad,new AbortController().signal)).rejects.toThrow();expect(calls).toHaveLength(0);
});
it('does not spawn when authorization rejects or cancellation precedes dispatch',async()=>{
  ledger.assertDispatch.mockImplementation(()=>{throw Error('denied');});
  await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow('denied');expect(calls).toHaveLength(0);
  ledger.assertDispatch.mockReset();const controller=new AbortController();controller.abort();
  await expect(adapter().run(request,controller.signal)).rejects.toThrow('aborted');expect(calls).toHaveLength(0);
});
it('does not execute on a rootful or unknown backend',async()=>{
  replies[0]={text:'false\n',code:0};await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow('Rootless');
  expect(calls).toHaveLength(1);
});
it.each(['missing','extra','corrupt','truncated'] as const)('rejects %s output after observed cleanup',async invalid=>{
  if(invalid==='missing')replies[1].text='';
  if(invalid==='extra')replies[1].text+='extra.txt\tdW5leHBlY3RlZA==\n';
  if(invalid==='corrupt')replies[1].text=replies[1].text.replace('empty.txt\t','empty.txt\t@@');
  if(invalid==='truncated')replies[1].text=replies[1].text.slice(0,-1);
  await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow();expect(calls.at(-1)?.args).toContain('rm');
});
it.each(['running','malformed','remove-failed'] as const)('does not claim successful termination for %s',async invalid=>{
  if(invalid==='running')replies[2].text=JSON.stringify({Running:true,Pid:123,Status:'running'});
  if(invalid==='malformed')replies[2].text='invalid';
  if(invalid==='remove-failed')replies[3].code=1;
  await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow();
  expect(release).not.toHaveBeenCalled();
  if(invalid!=='remove-failed')expect(calls.some(c=>c.args.includes('rm'))).toBe(false);
});

it('does not start a container without shared capacity',async()=>{
  capacity.reserve.mockImplementation(()=>{throw Error('Shared runtime capacity unavailable');});
  await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow('capacity unavailable');
  expect(calls).toHaveLength(1);expect(calls[0].args).toContain('info');
  expect(release).not.toHaveBeenCalled();
});
it('protects the fixed adapter from ordinary self modification',()=>{
  for(const extension of ['ts','js','d.ts'])expect(isProtectedFile(`src/security/isolated-podman-fixture.${extension}`)).toBe(true);
});

it('bounds streamed output, attempts termination and never accepts an oversized result',async()=>{
  replies=[{text:'true\n',code:0},{text:'x'.repeat(98305),code:0},{text:'',code:0},{text:stopped,code:0},{text:'',code:0}];
  await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow('rejected');
  expect(calls.some(c=>c.args.includes('kill'))).toBe(true);expect(calls.at(-1)?.args).toContain('rm');
});
it('rechecks authorization after the asynchronous runtime probe',async()=>{
  ledger.assertDispatch.mockImplementationOnce(()=>{}).mockImplementationOnce(()=>{throw Error('revoked');});
  await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow('revoked');
  expect(calls).toHaveLength(1);
});

it.each(['stdin','spawn','kill-throws'] as const)('rejects %s errors without leaking details or accepting partial execution',async fault=>{
  replies[1]={text:'',code:0,fault};replies.splice(2,0,{text:'',code:0});
  await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow('Isolated fixture result rejected');
  expect(calls.some(c=>c.args.includes('kill'))).toBe(true);
  expect(calls.at(-1)?.args).toContain('rm');
});

it.each(['info','run','inspect','rm'] as const)('bounds a hanging %s command and leaves no controller timer running',async stage=>{
  vi.useFakeTimers();const index={info:0,run:1,inspect:2,rm:3}[stage];
  replies[index]={text:'',code:0,fault:'hang'};
  if(stage==='run')replies.splice(2,0,{text:'',code:0});
  const pending=adapter().run(request,new AbortController().signal);
  const rejected=expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(20001);await rejected;
  expect(vi.getTimerCount()).toBe(0);
  if(stage==='info')expect(calls).toHaveLength(1);
  if(stage==='inspect'){
    expect(calls.at(-1)?.args).toContain('kill');
    expect(calls.some(c=>c.args.includes('rm'))).toBe(false);
  }
});

it.each(['null','nonzero-exit','wrong-types'] as const)('never upgrades %s inspection into a cleanup or success',async variant=>{
  if(variant==='null')replies[2].text='null';
  if(variant==='nonzero-exit')replies[2].code=1;
  if(variant==='wrong-types')replies[2].text=JSON.stringify({Running:0,Pid:'0',Status:'exited'});
  await expect(adapter().run(request,new AbortController().signal)).rejects.toThrow('Unverified');
  expect(calls.at(-1)?.args).toContain('kill');
  expect(calls.some(c=>c.args.includes('rm'))).toBe(false);
});
