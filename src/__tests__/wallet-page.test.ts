import { expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { walletPage } from '../online/wallet-page.js';
const address='0x6Cc15B882a463423ea7A400Ce6512c30b1A76615';
function setup(accounts=[address], initial='0x2105', reject=false, missing=false){
 const elements=Object.fromEntries(['state','connect','base','balance','balances'].map(id=>[id,{textContent:'',disabled:id==='base',onclick:undefined as any}]));
 const handlers:Record<string,()=>void>={};let chain=initial;
 const request=vi.fn(async({method}:any): Promise<unknown>=>{if(reject)throw {code:4001};if(method==='eth_requestAccounts'||method==='eth_accounts')return accounts;if(method==='eth_chainId')return chain;if(method==='wallet_switchEthereumChain'){chain='0x2105';handlers.chainChanged?.();return null;}throw Error('Unexpected method');});
 vm.runInNewContext(/<script[^>]*>([\s\S]*?)<\/script>/.exec(walletPage('test'))![1],{document:{getElementById:(id:string)=>elements[id]},window:{ethereum:missing?undefined:{isMetaMask:true,request,on:(e:string,f:()=>void)=>handlers[e]=f},addEventListener(){},dispatchEvent(){}},Event:class{},setTimeout,clearTimeout});
 return {elements,request,handlers};
}
it('connects expected account on Base without signing or transactions',async()=>{const s=setup();expect(s.request).not.toHaveBeenCalled();await s.elements.connect.onclick();expect(s.elements.state.textContent).toContain('Verbunden:');expect(s.request.mock.calls.map(c=>c[0].method)).toEqual(['eth_requestAccounts','eth_accounts','eth_chainId']);s.handlers.accountsChanged();expect(s.elements.state.textContent).not.toContain('Verbunden:');});
it('switches to Base only on explicit button click',async()=>{const s=setup([address],'0x1');await s.elements.connect.onclick();expect(s.elements.base.disabled).toBe(false);await s.elements.base.onclick();expect(s.elements.state.textContent).toContain('Verbunden:');expect(s.request.mock.calls[3][0]).toEqual({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});});
it('rejects wrong accounts and clears success on disconnect',async()=>{const s=setup(['0x0000000000000000000000000000000000000000']);await s.elements.connect.onclick();expect(s.elements.base.disabled).toBe(true);expect(s.elements.state.textContent).not.toContain('Verbunden:');const ok=setup();await ok.elements.connect.onclick();ok.handlers.disconnect();expect(ok.elements.state.textContent).not.toContain('Verbunden:');});
it('handles denial and missing extension without claiming connection',async()=>{const s=setup([address],'0x2105',true);await s.elements.connect.onclick();expect(s.elements.state.textContent).toContain('abgelehnt');const absent=setup([], '0x1',false,true);await absent.elements.connect.onclick();expect(absent.elements.state.textContent).toContain('nicht gefunden');expect(absent.request).not.toHaveBeenCalled();});
it('runs the embedded balance reader and discards balances after network changes',async()=>{
 const s=setup();await s.elements.connect.onclick();expect(s.elements.balance.disabled).toBe(false);
 const hash='0x'+'ab'.repeat(32);
 s.request.mockImplementation(async({method}:any)=>{
  if(method==='eth_chainId')return '0x2105';
  if(method==='eth_getBlockByNumber')return {hash,number:'0xa'};
  return '0x0';
 });
 await s.elements.balance.onclick();expect(s.elements.balances.textContent).toContain('0.000000 USDC');
 s.handlers.chainChanged();expect(s.elements.balances.textContent).toContain('unbekannt');expect(s.elements.balance.disabled).toBe(true);
});
it('ignores an in-flight balance result after disconnection',async()=>{
 const s=setup();await s.elements.connect.onclick();
 let resolve!: (value:any)=>void;
 s.request.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const pending=s.elements.balance.onclick();await Promise.resolve();s.handlers.disconnect();resolve('0x1');await pending;
 expect(s.elements.balances.textContent).toContain('unbekannt');expect(s.elements.balance.disabled).toBe(true);
});
