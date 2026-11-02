import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ISOLATED_PROFILE,ISOLATED_PROFILE_DIGEST,isolatedJobScope,type IsolatedJobLedger,type IsolatedTextFile} from './isolated-job-ledger.js';
import type {ReviewedIsolatedTransport} from './isolated-job-supervisor.js';
import type {IsolatedRuntimeCapacity} from './isolated-runtime-capacity.js';

const EXECUTABLE='C:\\Windows\\System32\\wsl.exe';
const PREFIX=['-d','podman-obolus-isolation-test','-u','user','--','/usr/bin/podman'];
const STREAM_LIMIT=98304;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Request=Parameters<ReviewedIsolatedTransport['run']>[0];

/** Fixed text roundtrip only. No caller-supplied command, image, distribution,
 * mount, environment, network, resource flag or executable is accepted. */
function scriptFor(request:Request):string {
  if(!request||Object.keys(request).sort().join(',')!=='files,id,profile,runtimeId'||
    !/^obolus-job-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(request.runtimeId)||
    hash(request.profile)!==ISOLATED_PROFILE_DIGEST)throw Error('Invalid isolated fixture request');
  isolatedJobScope(request.id,request.files); // Includes file, DLP and byte checks.
  let script='set -eu\numask 077\n';
  for(const file of request.files){
    script+=`printf '%s' '${Buffer.from(file.text,'utf8').toString('base64')}' | base64 -d > '/work/${file.name}'\n`;
    script+=`printf '%s\\t' '${file.name}'\nbase64 '/work/${file.name}' | tr -d '\\n'\nprintf '\\n'\n`;
  }
  return script;
}
function outputFor(text:string,expected:readonly IsolatedTextFile[]):IsolatedTextFile[]{
  if(text!==''&&!text.endsWith('\n'))throw Error('Incomplete isolated fixture output');
  const lines=text===''?[]:text.slice(0,-1).split('\n');
  if(lines.length!==expected.length)throw Error('Unexpected isolated fixture output count');
  return lines.map((line,index)=>{
    const parts=line.split('\t'),file=expected[index];
    // Exact comparison also rejects malformed base64, unexpected data, duplicates
    // and exfiltrated content. Empty files retain their trailing tab.
    if(parts.length!==2||parts[0]!==file.name||parts[1]!==Buffer.from(file.text,'utf8').toString('base64'))
      throw Error('Isolated fixture output differs from bound input');
    return {...file};
  });
}

/** Development acceptance adapter, deliberately not selected by any runtime or
 * agent tool. The allowlisted Windows/WSL binaries and distribution are trusted
 * infrastructure; this factory is not a cryptographic runtime attestation. */
export function createIsolatedPodmanFixture(ledger:IsolatedJobLedger,capacity:IsolatedRuntimeCapacity):ReviewedIsolatedTransport {
  if(process.platform!=='win32')throw Error('Windows fixture runtime required');
  if(!capacity)throw Error('Shared runtime capacity store required');
  async function invoke(args:string[],input?:string):Promise<{code:number|null;text:string}> {
    return new Promise((resolve,reject)=>{
      let size=0,text='',finished=false;
      const child=spawn(EXECUTABLE,[...PREFIX,...args],{shell:false,windowsHide:true,
        env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',WSLENV:''},stdio:['pipe','pipe','pipe']});
      const fail=()=>{
        if(finished)return;finished=true;clearTimeout(timer);
        // Process termination itself can fail; still reject without leaking the
        // platform exception or leaving this promise unresolved.
        try{child.kill();}catch{/* Runtime termination is separately inspected. */}
        reject(Error('Isolated runtime command failed'));
      };
      const timer=setTimeout(fail,20000);
      child.on('error',fail);child.stdin.on('error',fail);
      child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>STREAM_LIMIT){fail();return;}if(!finished)text+=chunk.toString('utf8');});
      child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>STREAM_LIMIT)fail();});
      child.on('close',code=>{if(finished)return;finished=true;clearTimeout(timer);resolve({code,text});});
      child.stdin.end(input);
    });
  }
  return Object.freeze({profileDigest:ISOLATED_PROFILE_DIGEST,async run(request:Request,signal:AbortSignal){
    // Copy before any await so caller mutations cannot alter the selected work.
    const bound={...request,files:request.files.map(file=>({...file})),profile:{...request.profile}};
    const script=scriptFor(bound),token=bound.runtimeId.slice('obolus-job-'.length);
    ledger.assertDispatch(bound.id,token,bound.files);
    if(signal.aborted)throw Error('Isolated fixture aborted');
    const info=await invoke(['info','--format','{{.Host.Security.Rootless}}']);
    if(info.code!==0||info.text.trim()!=='true')throw Error('Rootless fixture runtime unavailable');
    ledger.assertDispatch(bound.id,token,bound.files);
    if(signal.aborted)throw Error('Isolated fixture aborted');
    const lease=capacity.reserve(bound.runtimeId,isolatedJobScope(bound.id,bound.files).contextDigest);
    let stopPromise:Promise<unknown>|undefined;
    const stop=()=>{stopPromise??=invoke(['kill',bound.runtimeId]).catch(()=>undefined);};
    signal.addEventListener('abort',stop,{once:true});
    let response:{code:number|null;text:string}|undefined;
    let failure=false;
    try {
      response=await invoke(['run','--name='+bound.runtimeId,'--pull=never','--network=none',
        '--read-only','--read-only-tmpfs=false','--user=65534:65534','--cap-drop=ALL',
        '--security-opt=no-new-privileges','--memory=64m','--memory-swap=64m',
        '--cpus=0.5','--pids-limit=16','--timeout=10',
        '--tmpfs=/work:rw,noexec,nosuid,nodev,size=1048576,mode=1777',
        '-i',ISOLATED_PROFILE.image,'/bin/sh','-s'],script);
    }catch{failure=true;stop();}
    finally{signal.removeEventListener('abort',stop);}
    if(stopPromise)await stopPromise;
    try{
      const inspection=await invoke(['inspect','--format','{{json .State}}',bound.runtimeId]);
      const state=JSON.parse(inspection.text) as {Running?:unknown;Pid?:unknown;Status?:unknown}|null;
      if(inspection.code!==0||state?.Running!==false||state?.Pid!==0||state?.Status!=='exited')
        throw Error('Unverified isolated runtime termination');
    }catch{
      // A failed inspection must not merely abandon a possibly running process.
      // One bounded stop attempt is allowed for this exact lease. It is NOT proof
      // of termination and does not authorize removal or result acceptance.
      await invoke(['kill',bound.runtimeId]).catch(()=>undefined);
      throw Error('Unverified isolated runtime termination');
    }
    const removal=await invoke(['rm',bound.runtimeId]);
    if(removal.code!==0)throw Error('Isolated runtime removal unverified');
    lease.releaseAfterObservedTermination({runtimeId:bound.runtimeId,profileDigest:ISOLATED_PROFILE_DIGEST,
      observedAt:Date.now(),running:false,pid:0,removed:true});
    if(failure||signal.aborted||response?.code!==0)throw Error('Isolated fixture result rejected');
    return {terminated:true,exitCode:0,output:outputFor(response.text,bound.files)};
  }});
}
