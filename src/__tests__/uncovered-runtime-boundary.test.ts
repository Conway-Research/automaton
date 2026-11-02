import {it,expect,vi,afterEach} from 'vitest';
import {prettySink} from '../observability/pretty-sink.js';
import {registerLogSecrets} from '../observability/redaction.js';
import type {LogEntry} from '../types.js';
import {soakSimulation} from '../v1/verification.js';
afterEach(()=>vi.restoreAllMocks());
it('redacts direct pretty sink calls including malformed fallback',()=>{
 const secret='synthetic-boundary-secret-987';registerLogSecrets([secret]);const write=vi.spyOn(process.stdout,'write').mockReturnValue(true);
 for(const level of ['info','warn','error'])prettySink({timestamp:new Date(0).toISOString(),level,module:secret,message:'[ERROR] '+secret,error:{message:secret}} as LogEntry);
 prettySink({message:secret} as LogEntry);expect(write).toHaveBeenCalledTimes(4);expect(JSON.stringify(write.mock.calls)).not.toContain(secret);
});
it.each([0,-1,121,NaN,Infinity,1.2])('rejects invalid soak horizon %s',async v=>{await expect(soakSimulation(v)).rejects.toThrow();});
it.each([-1,5001,NaN,0.5])('rejects invalid pacing %s',async v=>{await expect(soakSimulation(1,v)).rejects.toThrow();});
it('runs synthetic recovery and reconciliation without external actions',async()=>{const r=await soakSimulation(1);expect(r).toMatchObject({realProviderCalls:0,realOrders:0,budgetViolations:0});});
