import {createOrderFunding} from './founder-order-funding.mjs';

/** source is trusted application code implementing an authenticated official
 * escrow read. Task text, local receipt JSON and another platform's balance
 * cannot supply it. Missing source is deliberately unavailable, never a grant. */
export function createProductionGithubFunding({isEnabled,source=null,now=Date.now}={}){
 if(typeof isEnabled!=='function')throw Error('GitHub funding OFF guard required');
 if(source?.testOnly===true)throw Error('Sandbox source cannot authorize production funding');
 const active=ctx=>{if(!isEnabled())throw Error('GitHub funding OFF');if(ctx?.signal?.aborted)throw Error('GitHub funding cancelled');ctx?.assertActive?.();};
 const guard=createOrderFunding({source,now});
 return {
  status(){const status=guard.status();return {...status,connected:status.available,powered:isEnabled()===true,available:isEnabled()===true&&status.available,reason:!isEnabled()?'GitHub funding OFF':status.reason};},
  async require(terms,ctx,options){active(ctx);if(terms?.recipient!=='github:tricebr')throw Error('GitHub funding beneficiary mismatch');const proof=await guard.require(terms,ctx,options);active(ctx);return proof;}
 };
}
