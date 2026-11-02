import {it,expect,vi,afterEach} from 'vitest';
import {createGmailTokenProvider} from '../commerce/gmail-credentials.js';
const environment={OBOLUS_GMAIL_CLIENT_ID:'fixture-client',OBOLUS_GMAIL_CLIENT_SECRET:'fixture-secret',OBOLUS_GMAIL_REFRESH_TOKEN:'fixture-refresh'};
afterEach(()=>vi.restoreAllMocks());
it('coalesces concurrent refresh, caches credentials and refreshes before expiry',async()=>{
  let now=100000;vi.spyOn(Date,'now').mockImplementation(()=>now);
  const request=vi.fn(async()=>new Response(JSON.stringify({access_token:'fixture-access',token_type:'Bearer',expires_in:3600})));
  const token=createGmailTokenProvider(environment,request);
  expect(await Promise.all([token(),token(),token()])).toEqual(['fixture-access','fixture-access','fixture-access']);
  expect(request).toHaveBeenCalledTimes(1);await token();expect(request).toHaveBeenCalledTimes(1);
  now+=3540000;await token();expect(request).toHaveBeenCalledTimes(2);
  const [url,options]=request.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://oauth2.googleapis.com/token');expect(options.redirect).toBe('error');
  expect(new URLSearchParams(options.body as string).get('grant_type')).toBe('refresh_token');
});
it('redacts refresh failure and prevents repeated attempts during backoff',async()=>{
  let now=100000;vi.spyOn(Date,'now').mockImplementation(()=>now);
  const request=vi.fn(async()=>{throw new Error('fixture-secret fixture-refresh');}),token=createGmailTokenProvider(environment,request);
  await expect(token()).rejects.toThrow('Gmail token refresh failed');
  await expect(token()).rejects.toThrow('temporarily blocked');expect(request).toHaveBeenCalledTimes(1);
  now+=60000;await expect(token()).rejects.toThrow('Gmail token refresh failed');expect(request).toHaveBeenCalledTimes(2);
});
it.each([{expires_in:0},{expires_in:3600,token_type:'Basic'},{expires_in:3600,access_token:'bad token'},{expires_in:3600.5}])('rejects malformed token metadata %j',invalid=>{
  const request=vi.fn(async()=>new Response(JSON.stringify({access_token:'fixture-access',token_type:'Bearer',...invalid})));
  return expect(createGmailTokenProvider(environment,request)()).rejects.toThrow('refresh failed');
});
it('supports explicit short-lived tokens but never falls back from partial refresh configuration',async()=>{
  const request=vi.fn(async()=>{throw new Error('No network expected');});
  expect(await createGmailTokenProvider({OBOLUS_GMAIL_ACCESS_TOKEN:'fixture-access'},request)()).toBe('fixture-access');
  await expect(createGmailTokenProvider({OBOLUS_GMAIL_ACCESS_TOKEN:'fixture-access',OBOLUS_GMAIL_REFRESH_TOKEN:'fixture-refresh'},request)()).rejects.toThrow('Complete');
  expect(request).not.toHaveBeenCalled();
});
