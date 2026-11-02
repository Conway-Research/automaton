import {bounded,checkedJSON} from './founder-restoration-integrity.mjs';
const ORIGIN='https://api.escrow-sandbox.com';
const fields=['orderUrl','amountMinor','currency','recipient'];
/** OFFLINE scaffold only. transport and decode are explicit test dependencies.
 * decode must map a separately verified vendor schema; no unverified vendor
 * response schema or production authentication is assumed by this module. */
export function createEscrowComSandboxSource({isEnabled,bindings=[],transport,decode}={}){
 if(typeof isEnabled!=='function'||!Array.isArray(bindings)||bindings.length>100)throw Error('Sandbox configuration required');
 const reviewed=checkedJSON(bindings);
 const active=ctx=>{if(!isEnabled())throw Error('Escrow.com sandbox OFF');if(ctx?.signal?.aborted)throw Error('Escrow.com sandbox cancelled');ctx?.assertActive?.();};
 return {provider:'escrowcom-sandbox',origin:ORIGIN,testOnly:true,
  async read(expected,ctx){active(ctx);const matches=reviewed.filter(b=>fields.every(k=>b[k]===expected[k]));if(matches.length!==1)throw Error('Exact reviewed sandbox binding required');const b=matches[0];if(!Number.isSafeInteger(b.transactionId)||b.transactionId<1||!bounded(b.sellerId))throw Error('Sandbox transaction and seller required');if(typeof transport!=='function'||typeof decode!=='function')throw Error('Explicit fake transport and trusted decoder required');
   const url=ORIGIN+'/2017-09-01/transaction/'+b.transactionId;
   let value;try{const raw=await transport(url,{method:'GET',signal:ctx?.signal});active(ctx);value=checkedJSON(await decode(raw,b));}catch{active(ctx);throw Error('Sandbox response unavailable');}active(ctx);
   if(value.environment!=='sandbox'||value.authenticated!==true||value.transactionId!==b.transactionId||value.sellerId!==b.sellerId||value.kind!=='escrow-lock'||value.status!=='held'||!fields.every(k=>value[k]===expected[k]))throw Error('Unverified sandbox transaction');
   return {...Object.fromEntries(fields.map(k=>[k,value[k]])),kind:'escrow-lock',status:'held',escrowId:String(b.transactionId),sourceUrl:url,observedAt:value.observedAt,expiresAt:value.expiresAt,environment:'sandbox',liveAuthority:false};
  }
 };
}
