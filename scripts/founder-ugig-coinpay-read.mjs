import {bounded} from './founder-restoration-integrity.mjs';
// Only GET of one existing escrow. Never retain release/beneficiary tokens.
export function createCoinpayEscrowReader({isEnabled,request=fetch,credential=()=>process.env.COINPAY_API_KEY}){
 const active=ctx=>{if(isEnabled()!==true||ctx?.signal?.aborted)throw Error('CoinPay read OFF');ctx?.assertActive?.();};
 return async(id,ctx)=>{active(ctx);if(!/^[a-zA-Z0-9_-]{1,150}$/.test(id))throw Error('Exact CoinPay escrow id required');const key=credential();if(!bounded(key,1000))throw Error('Authorized CoinPay read credential missing');
  const r=await request('https://coinpayportal.com/api/escrow/'+id,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.any([ctx?.signal??new AbortController().signal,AbortSignal.timeout(10000)])});active(ctx);if(!r.ok||!r.body)throw Error('CoinPay escrow read unavailable');
  const reader=r.body.getReader(),parts=[];let size=0;try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>1000000)throw Error('CoinPay response limit');parts.push(x.value);}}finally{await reader.cancel();}
  const raw=JSON.parse(Buffer.concat(parts).toString('utf8'));active(ctx);
  const fields=['id','status','chain','amount','amount_usd','deposited_amount','fee_amount','marketplace_fee_amount','depositor_address','beneficiary_address','escrow_address','deposit_tx_hash','settlement_tx_hash','funded_at','released_at','settled_at','disputed_at','refunded_at','expires_at'];
  return {...Object.fromEntries(fields.map(k=>[k,raw[k]??null])),metadata:Object.fromEntries(['platform','gig_id','application_id','poster_id','worker_id'].map(k=>[k,raw.metadata?.[k]??null]))};
 };
}
