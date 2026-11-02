import {SAHIL_ORDER} from './founder-laborx-sahil.mjs';
// These readers are reviewed composition dependencies. Neither a logged-in
// browser, the buyer's consent nor a task-provided flag is a provider exception.
export function createLaborxAccessReader({isEnabled,readProviderGrant,readSession,now=Date.now}={}){
 const must=(v,m)=>{if(!v)throw Error('LaborX access: '+m);};
 const active=ctx=>{must(isEnabled?.()===true,'OFF');must(!ctx?.signal?.aborted,'cancelled');ctx?.assertActive?.();};
 const fresh=r=>must(r&&Number.isFinite(r.observedAt)&&r.observedAt<=now()&&now()-r.observedAt<60000&&Number.isFinite(r.expiresAt)&&r.expiresAt>now()&&r.expiresAt<=now()+60000&&typeof r.evidenceRef==='string'&&r.evidenceRef.length>0,'fresh independent evidence required');
 return async(order,ctx)=>{
  active(ctx);must(Object.entries(SAHIL_ORDER).every(([k,v])=>order?.[k]===v),'exact Sahil order required');
  must(typeof readProviderGrant==='function','verified provider exception missing');
  const grant=await readProviderGrant(Object.freeze({...order}),ctx);active(ctx);fresh(grant);
  must(grant.issuer==='https://laborx.com'&&grant.providerVerified===true&&grant.exceptionClause==='4.1.1(h)'&&grant.automationAllowed===true&&Object.entries(SAHIL_ORDER).every(([k,v])=>grant[k]===v)&&grant.sourceId===order.sourceId&&Array.isArray(grant.operations)&&grant.operations.length>0&&grant.operations.every(op=>['read','submit','reconcile'].includes(op)),'exact independently verified provider exception required');
  must(typeof readSession==='function','own authenticated session reader missing');
  const session=await readSession(order,ctx);active(ctx);fresh(session);must(session.authenticated===true&&session.accountId===SAHIL_ORDER.ownerId,'own authenticated account required');
  return {...order,accountId:session.accountId,authenticated:true,automationAllowed:true,operations:[...new Set(grant.operations)],observedAt:Math.min(grant.observedAt,session.observedAt),expiresAt:Math.min(grant.expiresAt,session.expiresAt),evidenceRef:grant.evidenceRef};
 };
}
