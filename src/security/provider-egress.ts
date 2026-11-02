/** Endpoint configuration is a trusted operator boundary. Requests cannot escape
 * that origin through redirects or SDK overrides. Hostname DNS and OS/network
 * isolation still need deployment-level enforcement. */
export function providerEgress(baseUrl:string,local:boolean):typeof fetch {
 const base=new URL(baseUrl),host=base.hostname.toLowerCase();
 const loopback=['localhost','127.0.0.1','[::1]'].includes(host);
 if(base.username||base.password||base.search||base.hash||local&&!loopback||
   !(base.protocol==='https:'||local&&loopback&&base.protocol==='http:')||
   !local&&(loopback||host.includes(':')||/^(?:0|10|127|169\.254|192\.168)\./.test(host)||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)||host.endsWith('.local')||host.endsWith('.localhost')))
  throw Error('Provider endpoint requires approved secure transport');
 return async(input,init)=>{
  const target=new URL(input instanceof Request?input.url:String(input));
  if(target.origin!==base.origin||target.username||target.password||target.hash)throw Error('Provider request escaped configured origin');
  return fetch(input,{...init,redirect:'error',credentials:'omit'});
 };
}
