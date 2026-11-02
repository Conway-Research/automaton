import { expect, it, vi } from 'vitest';
import { readBaseBalance } from '../online/wallet-balance.js';
const address='0x6Cc15B882a463423ea7A400Ce6512c30b1A76615';
const hash='0x'+'ab'.repeat(32);
function fixture(values: unknown[] = ['0x2105',{hash,number:'0xa'},'0xde0b6b3a7640000','0x12d687',{hash},'0x2105']) {
 return {request:vi.fn(async()=>{if(!values.length)throw Error('Unexpected request');return values.shift();})};
}
it('reads exact ETH and native USDC at one finalized block using only read methods',async()=>{
 const p=fixture();expect(await readBaseBalance(p,address)).toEqual({eth:'1.000000000000000000',usdc:'1.234567',blockNumber:'10',blockHash:hash});
 expect(p.request.mock.calls).toEqual([
 [{method:'eth_chainId',params:[]}], [{method:'eth_getBlockByNumber',params:['finalized',false]}],
 [{method:'eth_getBalance',params:[address,'0xa']}],
 [{method:'eth_call',params:[{to:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',data:'0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0')},'0xa']}],
 [{method:'eth_getBlockByNumber',params:['0xa',false]}], [{method:'eth_chainId',params:[]}],
 ]);
});
it.each([
 ['0x1'], ['0x2105',null], ['0x2105',{hash,number:'0xa'},'0x'],
 ['0x2105',{hash,number:'0xa'},'0x0','0x0',{hash:'different'}],
 ['0x2105',{hash,number:'0xa'},'0x0','0x0',{hash},'0x1'],
])('fails closed for invalid or changing RPC state (%j)',async(...values)=>{
 await expect(readBaseBalance(fixture(values),address)).rejects.toThrow();
});
it('propagates RPC failure and never turns failure into zero balance',async()=>{
 await expect(readBaseBalance({request:async()=>{throw Error('offline');}},address)).rejects.toThrow('offline');
 const p=fixture();await expect(readBaseBalance(p,'bad')).rejects.toThrow();expect(p.request).not.toHaveBeenCalled();
});
it('times out a stalled provider without returning a fabricated balance',async()=>{
 vi.useFakeTimers();
 try {
  const result=readBaseBalance({request:()=>new Promise(()=>{})},address);
  const assertion=expect(result).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(15000);await assertion;
  expect(vi.getTimerCount()).toBe(0);
 } finally {vi.useRealTimers();}
});
