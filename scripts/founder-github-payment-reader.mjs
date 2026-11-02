/** Trusted composition supplies an authenticated read-only provider mapper.
 * This module defines an internal receipt contract, not a vendor API schema.
 * No transport, credential lookup, balance inference or task-supplied source. */
export function createGithubPaymentReader({isEnabled,source=null,now=Date.now}={}){
 const fail=message=>{throw Error('GitHub payment: '+message);};
 if(typeof isEnabled!=='function')fail('OFF guard required');
 const text=x=>typeof x==='string'&&x.length>0&&x.length<=1000;
 let origin=null;
 if(source){if(source.testOnly===true||!text(source.provider)||typeof source.read!=='function')fail('trusted production source required');const url=new URL(source.origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail('source origin');origin=url.origin;}
 const active=ctx=>{if(!isEnabled())fail('OFF');if(ctx?.signal?.aborted)fail('cancelled');ctx?.assertActive?.();};
 const read=async(order,ctx)=>{
  active(ctx);if(!source)return {confirmed:false,blocker:'Independent GitHub payment provider not connected'};
  const p=order?.paymentAuthorization;
  if(order.sourceId!=='github'||order.ownerId!=='tricebr'||order.externalId!==order.url||p?.orderUrl!==order.url||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*$/.test(order.url)||p.recipient!=='github:tricebr'||!Number.isSafeInteger(p.netAmountMinor)||p.netAmountMinor<=0||!/^[A-Z]{3}$/.test(p.currency))fail('exact authorized order required');
  const expected=Object.freeze({sourceId:'github',externalId:order.url,ownerId:'tricebr',orderUrl:order.url,recipient:p.recipient,currency:p.currency,amountMinor:p.netAmountMinor});
  const result=await source.read(expected,ctx,JSON.parse(JSON.stringify(order)));active(ctx);
  if(result?.confirmed===false)return {confirmed:false,blocker:result.blocker??'Payment not independently confirmed'};
  if(!result||result.kind!=='incoming-payment'||result.status!=='settled'||result.environment==='sandbox'||result.liveAuthority===false||!text(result.paymentId))fail('settled incoming payment required');
  for(const key of Object.keys(expected))if(result[key]!==expected[key])fail('receipt binding mismatch: '+key);
  const url=new URL(result.sourceUrl);if(url.origin!==origin||url.username||url.password||url.search||url.hash)fail('official receipt reference');
  const observed=Date.parse(result.observedAt),expires=Date.parse(result.expiresAt),at=now();if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed>at||at-observed>=60000||expires<=at)fail('stale payment receipt');
  return {...expected,confirmed:true,evidenceRef:origin+':incoming-payment:'+encodeURIComponent(result.paymentId),sourceUrl:url.href,provider:source.provider,observedAt:new Date(observed).toISOString()};
 };
 read.status=()=>({connected:!!source,available:!!source&&isEnabled()===true,powered:isEnabled()===true,reason:!source?'Independent GitHub payment provider not connected':!isEnabled()?'GitHub payment OFF':null});
 return read;
}
