import {it,expect,vi} from 'vitest';
import {Connection,PublicKey} from '@solana/web3.js';

it('security dependency update preserves Solana HTTP JSON-RPC with an injected offline transport',async()=>{
 const request=vi.fn(async(_url:unknown,options?:RequestInit)=>{
  const message=JSON.parse(String(options?.body));
  expect(message.method).toBe('getBalance');expect(message.id).toBeTruthy();
  return new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{context:{slot:1},value:123}}),{status:200});
 });
 const connection=new Connection('https://example.invalid',{fetch:request,disableRetryOnRateLimit:true});
 expect(await connection.getBalance(new PublicKey('11111111111111111111111111111111'))).toBe(123);
 expect(request).toHaveBeenCalledTimes(1);
});
