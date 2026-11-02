import {it,expect,vi,afterEach} from 'vitest';
import {fetchAgentCard,isAllowedUri} from '../registry/discovery.js';
import {providerEgress} from '../security/provider-egress.js';
afterEach(()=>vi.unstubAllGlobals());
it('security: provider transport is origin-bound and only explicit local providers allow loopback HTTP',async()=>{
 expect(()=>providerEgress('http://127.0.0.1:11434/v1',false)).toThrow('secure transport');
 expect(()=>providerEgress('https://user:password@example.invalid/v1',false)).toThrow();
 expect(()=>providerEgress('https://remote.example.invalid/v1',true)).toThrow('secure transport');
 const request=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response('{}'));vi.stubGlobal('fetch',request);
 const send=providerEgress('https://example.invalid/v1',false);
 await expect(send('https://attacker.invalid/',{redirect:'follow'})).rejects.toThrow('origin');
 expect(request).not.toHaveBeenCalled();
 await send('https://example.invalid/v1/chat/completions',{redirect:'follow'});
 expect(request.mock.calls[0][1]).toMatchObject({redirect:'error',credentials:'omit'});
 await providerEgress('http://127.0.0.1:11434/v1',true)('http://127.0.0.1:11434/v1/chat/completions');
});
it.each(['https://[::1]/','https://[::ffff:127.0.0.1]/','https://100.64.0.1/','https://169.254.169.254/',
 'https://user:password@example.invalid/','https://localhost./','https://127.1/','https://2130706433/'])('security: rejects SSRF destination %s',uri=>{
 expect(isAllowedUri(uri)).toBe(false);
});
it('security: unknown card hosts never fetch; approved hosts cannot redirect and body reads are bounded',async()=>{
 const request=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({type:'agent',name:'Fixture'})));vi.stubGlobal('fetch',request);
 expect(await fetchAgentCard('https://example.invalid/card')).toBeNull();expect(request).not.toHaveBeenCalled();
 expect(await fetchAgentCard('https://example.invalid/card',{allowedCardHosts:['example.invalid']})).toMatchObject({name:'Fixture'});
 expect(request.mock.calls[0][1]).toMatchObject({redirect:'error',credentials:'omit'});
 request.mockResolvedValue(new Response('x'.repeat(1000)));
 expect(await fetchAgentCard('https://example.invalid/card',{allowedCardHosts:['example.invalid'],maxCardSizeBytes:100})).toBeNull();
});
