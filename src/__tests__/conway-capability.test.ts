import {it,expect,vi,afterEach} from 'vitest';
import {createConwayClient,conwayActionScope} from '../conway/client.js';
import {assertActionGate} from '../security/action-gate.js';
import {createDatabase} from '../state/database.js';
import {fixtureSecurityReview} from './fixtures/security-review.js';
afterEach(()=>vi.unstubAllGlobals());
const options={apiUrl:'https://example.invalid',apiKey:'fixture-conway-key',sandboxId:'sandbox-a'};
it('security: missing capability denies shell, transfer and signing before any provider or private-key use',async()=>{
 const request=vi.fn();vi.stubGlobal('fetch',request);const client=createConwayClient(options);
 await expect(client.exec('echo safe')).rejects.toThrow('capability');
 await expect(client.transferCredits('0x1111111111111111111111111111111111111111',1)).rejects.toThrow('capability');
 const signTypedData=vi.fn();
 await expect(client.registerAutomaton({automatonId:'fixture',automatonAddress:'0x1111111111111111111111111111111111111111',creatorAddress:'0x2222222222222222222222222222222222222222',name:'Fixture',account:{signTypedData} as never})).rejects.toThrow('capability');
 expect(signTypedData).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();
});
it('security: remote cwd is quoted, capability is sandbox-specific and uncertain mutation is never retried',async()=>{
 const db=createDatabase(':memory:');try{
  const cwd="/tmp/a'; echo BAD; '",body={command:"cd '/tmp/a'\\''; echo BAD; '\\''' && echo fixture",timeout:1000};
  const scope=conwayActionScope(options.apiUrl,'POST','/v1/sandboxes/sandbox-a/exec',body);
  fixtureSecurityReview(db.raw,scope,Date.now());
  const client=createConwayClient({...options,authorizeMutation:s=>assertActionGate(db.raw,s)});
  const request=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response('{}',{status:500}));vi.stubGlobal('fetch',request);
  await expect(client.exec('echo fixture',1000,cwd)).rejects.toThrow('500');
  expect(request).toHaveBeenCalledTimes(1);expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual(body);
  await expect(client.createScopedClient('sandbox-b').exec('echo fixture',1000,cwd)).rejects.toThrow('INSUFFICIENT_EVIDENCE');
  expect(request).toHaveBeenCalledTimes(1);
  await expect(client.exec('echo fixture',Infinity,cwd)).rejects.toThrow('bounded');
 }finally{db.close();}
});
