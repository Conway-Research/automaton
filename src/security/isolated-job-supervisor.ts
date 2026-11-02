import {IsolatedJobLedger,ISOLATED_PROFILE,ISOLATED_PROFILE_DIGEST,type IsolatedTextFile} from './isolated-job-ledger.js';

/** Trusted adapter contract, not agent-supplied code. An adapter must enforce
 * streaming byte limits, kernel limits and observed process-tree termination.
 * Implementing this interface alone is NOT an isolation acceptance. */
export interface ReviewedIsolatedTransport {
  readonly profileDigest:string;
  run(request:Readonly<{id:string;runtimeId:string;files:readonly IsolatedTextFile[];profile:typeof ISOLATED_PROFILE}>,signal:AbortSignal):Promise<{
    terminated:boolean;exitCode:number;output:readonly IsolatedTextFile[];
  }>;
}
export type IsolatedOutcome = 'disabled'|'completed'|'uncertain';
export const ISOLATED_MONITOR_INTERVAL_MS=250;

/** No default backend and no host-shell fallback. This module is not wired to
 * agent tools. Production adapter selection requires a separate trusted path. */
export class IsolatedJobSupervisor {
  private readonly active=new Map<string,AbortController>();
  constructor(private readonly ledger:IsolatedJobLedger,private readonly transport?:ReviewedIsolatedTransport) {}

  cancel(id:string):void {
    // Durable uncertainty comes first; failed persistence never reports success.
    try {this.ledger.cancel(id);} finally {this.active.get(id)?.abort();}
  }

  async run(id:string,input:readonly IsolatedTextFile[]):Promise<IsolatedOutcome> {
    if(!this.transport)return 'disabled';
    if(this.transport.profileDigest!==ISOLATED_PROFILE_DIGEST)throw Error('Isolated transport profile mismatch');
    const transport=this.transport,invoke=transport.run.bind(transport);
    // Detach caller-owned mutable data before gate validation and asynchronous use.
    const files=input.map(file=>Object.freeze({...file}));Object.freeze(files);
    this.ledger.submit(id,files);
    const token=this.ledger.claim(id,files),controller=new AbortController();
    this.active.set(id,controller);
    let timer:ReturnType<typeof setTimeout>|undefined;
    let monitor:ReturnType<typeof setInterval>|undefined;
    let aborted:(()=>void)|undefined;
    try {
      const interrupted=new Promise<null>(resolve=>{
        aborted=()=>resolve(null);controller.signal.addEventListener('abort',aborted,{once:true});
        timer=setTimeout(()=>controller.abort(),ISOLATED_PROFILE.timeoutMs);
        monitor=setInterval(()=>{
          try {
            if(transport.profileDigest!==ISOLATED_PROFILE_DIGEST)throw Error('Isolated transport profile changed');
            this.ledger.assertActive(id,token,files);
          } catch {controller.abort();}
        },ISOLATED_MONITOR_INTERVAL_MS);
      });
      // A late transport reply cannot settle after the timeout/cancel branch.
      const result=await Promise.race([
        Promise.resolve().then(()=>{
          if(controller.signal.aborted)return null;
          if(transport.profileDigest!==ISOLATED_PROFILE_DIGEST)throw Error('Isolated transport profile changed');
          this.ledger.assertDispatch(id,token,files);
          return invoke(Object.freeze({id,runtimeId:`obolus-job-${token}`,files,profile:ISOLATED_PROFILE}),controller.signal);
        }),
        interrupted,
      ]);
      if(!result||result.terminated!==true||controller.signal.aborted||this.ledger.get(id)?.state!=='running') {
        this.ledger.cancel(id);return 'uncertain';
      }
      // Do not accept a result that races a stop or revocation between polls.
      if(transport.profileDigest!==ISOLATED_PROFILE_DIGEST)throw Error('Isolated transport profile changed');
      this.ledger.assertActive(id,token,files);
      this.ledger.complete(id,token,result.output,result.exitCode);
      return 'completed';
    } catch {
      // Provider exceptions are deliberately not copied into logs or receipts.
      this.ledger.cancel(id);controller.abort();return 'uncertain';
    } finally {
      controller.abort();
      if(timer)clearTimeout(timer);
      if(monitor)clearInterval(monitor);
      if(aborted)controller.signal.removeEventListener('abort',aborted);
      this.active.delete(id);
    }
  }
}
