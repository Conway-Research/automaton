import {createHash} from 'node:crypto';

// This is a service construction dependency, never task/model input. A source.read
// implementation must authenticate an official read-only escrow API and map its
// concrete lock and beneficiary. No such provider is assumed to exist by default.
const MAX_AGE_MS=60_000;
const fail=message=>{throw Error('Funding: '+message);};
const text=value=>typeof value==='string'&&value.length>0&&value.length<=500;
const fields=['provider','sourceOrigin','escrowId','orderUrl','amountMinor','currency','recipient'];
const active=ctx=>{if(ctx?.signal?.aborted)fail('operation cancelled');ctx?.assertActive?.();};

export function issueFundingTerms(issue,login){
 const body=String(issue?.body??'');
 // Deliberately narrow fixed-price grammar: exactly one money marker, bound
 // directly to Bounty/Reward, terminated by a sentence, newline or end of input.
 // Unsupported prices must never be skipped in favour of an unrelated fee.
 const markers=[...body.matchAll(/\$|\bUSD(?=\s*\d)/gi)];
 const declaration=body.match(/\b(?:bounty|reward)\s*:?\s*(?:\$|USD\s*)(\d+(?:\.\d{1,2})?)(?=\s*(?:[;!\r\n]|\.(?!\d)|$))/i);
 if(markers.length!==1||!declaration||/\b(?:EUR|CHF|CAD|AUD|NZD|SGD|HKD|SOL|USDT|USDC|BTC|ETH)\b/i.test(body))fail('ambiguous or unsupported bounty amount');
 const amountMinor=Math.round(Number(declaration[1])*100);
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*$/.test(issue?.html_url??'')||login!=='tricebr')fail('unambiguous order, amount and recipient required');
 return Object.freeze({orderUrl:issue.html_url,amountMinor,currency:'USD',recipient:'github:'+login});
}

export function createOrderFunding({source=null,now=Date.now}={}){
 let origin;const reader=source?.read,provider=source?.provider;
 if(source?.testOnly===true)fail('sandbox source is not production funding');
 if(source){
  try{const url=new URL(source.origin);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!text(source.provider)||typeof source.read!=='function')fail('invalid trusted source configuration');origin=url.origin;}catch{fail('invalid trusted source configuration');}
 }
 return {
  status:()=>({available:!!source,reason:source?null:'Kein authentifizierter Escrow-Leseadapter verbunden; neue Kundenarbeit und Einreichung gesperrt.'}),
  async require(terms,ctx,{previous}={}){
   active(ctx);
   if(!source)fail('authenticated escrow reader unavailable');
   if(!terms||!text(terms.orderUrl)||!Number.isSafeInteger(terms.amountMinor)||terms.amountMinor<=0||!/^[A-Z]{3}$/.test(terms.currency??'')||!text(terms.recipient))fail('order terms missing');
   const expected=Object.freeze({orderUrl:terms.orderUrl,amountMinor:terms.amountMinor,currency:terms.currency,recipient:terms.recipient});
   let evidence;
   try{evidence=await reader(expected,ctx);}catch{active(ctx);fail('authenticated escrow read failed');}
   active(ctx);
   const checkedAt=now();
   if(!Number.isSafeInteger(checkedAt)||!evidence||evidence.environment==='sandbox'||evidence.liveAuthority===false||evidence.kind!=='escrow-lock'||evidence.status!=='held'||!text(evidence.escrowId))fail('concrete held escrow required');
   for(const field of ['orderUrl','amountMinor','currency','recipient'])if(evidence[field]!==expected[field])fail('order, amount, currency or beneficiary mismatch');
   let url;try{url=new URL(evidence.sourceUrl);}catch{fail('official source reference missing');}
   if(url.origin!==origin||url.username||url.password||url.hash||url.search)fail('official source reference mismatch');
   // An official fresh read is required at every boundary. Expiry never extends
   // the maximum evidence age, including after restore/restart.
   const observedAt=Date.parse(evidence.observedAt),expiresAt=Date.parse(evidence.expiresAt);
   if(!Number.isFinite(observedAt)||!Number.isFinite(expiresAt)||observedAt>checkedAt||checkedAt-observedAt>=MAX_AGE_MS||expiresAt<=checkedAt||expiresAt<=observedAt)fail('stale, future or expired escrow evidence');
   const proof={provider,sourceOrigin:origin,sourceUrl:url.href,escrowId:evidence.escrowId,...expected,status:'held',observedAt:new Date(observedAt).toISOString(),expiresAt:new Date(Math.min(expiresAt,observedAt+MAX_AGE_MS)).toISOString(),checkedAt:new Date(checkedAt).toISOString()};
   if(previous&&fields.some(field=>previous[field]!==proof[field]))fail('escrow commitment changed; new review required');
   proof.digest=createHash('sha256').update(JSON.stringify(proof)).digest('hex');
   return Object.freeze(proof);
  }
 };
}
