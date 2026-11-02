import {loadRecordedFounderIdentity} from './founder-work-context.mjs';
export const BASE_USDC_TOKEN='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ORIGIN='https://mainnet.base.org',TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const fail=message=>{throw Error('GitHub Base payment: '+message);};
const lower=value=>String(value??'').toLowerCase();
const hash=value=>/^0x[0-9a-f]{64}$/i.test(value??'');
const quantity=value=>{if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))fail('RPC quantity');return BigInt(value);};
export function validateBaseUsdcSettlement(value,{currency,netAmountMinor,recipient}={}){
 if(!value||value.network!=='base'||value.chainId!==8453||value.asset!=='USDC'||lower(value.token)!==BASE_USDC_TOKEN||value.decimals!==6||!/^0x[0-9a-f]{40}$/i.test(value.recipientAddress??'')||/^0x0{40}$/i.test(value.recipientAddress)||typeof value.amountAtomic!=='string'||!/^\d{1,78}$/.test(value.amountAtomic)||BigInt(value.amountAtomic)<=0n||BigInt(value.amountAtomic)>=2n**256n||value.settlesCurrency!==currency||value.settlesAmountMinor!==netAmountMinor||!Number.isSafeInteger(netAmountMinor)||netAmountMinor<=0)fail('explicit exact settlement agreement required');
 if(recipient&&lower(recipient)!==lower(value.recipientAddress))fail('operator recipient mismatch');
 return {network:'base',chainId:8453,asset:'USDC',token:BASE_USDC_TOKEN,decimals:6,recipientAddress:lower(value.recipientAddress),amountAtomic:BigInt(value.amountAtomic).toString(),settlesCurrency:currency,settlesAmountMinor:netAmountMinor};
}
export function githubBasePaymentReference(comments,expected){
 const declarations=[];
 for(const c of comments){if(!['OWNER','MEMBER','COLLABORATOR'].includes(c.author_association))continue;const text=String(c.body??'');if(text.length>100000)fail('oversized comment');const matches=[...text.matchAll(/<!--\s*numaron-base-payment-v1\s*\n([\s\S]*?)-->/g)];if(!matches.length&&text.includes('numaron-base-payment-v1'))fail('malformed payment reference');for(const m of matches){if(m[1].length>10000)fail('oversized reference');declarations.push(JSON.parse(m[1]));}
  if(!/```|~~~/m.test(text))for(const line of text.split(/\r?\n/)){const m=line.trim().match(/^Payment for (https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*): https:\/\/basescan\.org\/tx\/(0x[a-f0-9]{64})\.?$/i);if(m)declarations.push({orderUrl:m[1],scopeDigest:expected.scopeDigest,contractDigest:expected.contractDigest,transactionHash:m[2],logIndex:null,selection:'unique-exact-transfer'});}
 }
 if(!declarations.length)return null;if(declarations.length!==1)fail('ambiguous payment reference');const r=declarations[0];
 for(const key of ['orderUrl','scopeDigest','contractDigest'])if(r[key]!==expected[key])fail('payment reference binding mismatch');
 if(!hash(r.transactionHash)||!(Number.isSafeInteger(r.logIndex)&&r.logIndex>=0||r.logIndex===null&&r.selection==='unique-exact-transfer'))fail('exact transaction and log required');return {...r,transactionHash:lower(r.transactionHash)};
}
export function createGithubBaseUsdcSource({isEnabled,readReference,rpc,request=fetch,identityProvider=loadRecordedFounderIdentity,now=Date.now}={}){
 if(typeof isEnabled!=='function'||typeof readReference!=='function')fail('guards and reference reader required');
 const active=ctx=>{if(!isEnabled())fail('OFF');if(ctx?.signal?.aborted)fail('cancelled');ctx?.assertActive?.();};
 const call=async(method,params,ctx)=>{
  active(ctx);if(!['eth_chainId','eth_getTransactionReceipt','eth_getBlockByNumber'].includes(method))fail('RPC method not allowed');
  let result;if(rpc)result=await rpc(method,params,ctx);else{
   const response=await request(ORIGIN,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:ctx?.signal?AbortSignal.any([ctx.signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});active(ctx);
   if(!response.ok||!response.body)fail('RPC unavailable');const reader=response.body.getReader(),parts=[];let size=0;try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>2000000)fail('RPC response limit');parts.push(x.value);}}finally{await reader.cancel();}
   const data=JSON.parse(Buffer.concat(parts).toString('utf8'));if(data.jsonrpc!=='2.0'||data.id!==1||data.error||!Object.hasOwn(data,'result'))fail('RPC response');result=data.result;
  }active(ctx);return result;
 };
 return {provider:'base-usdc-finalized',origin:ORIGIN,
  async read(expected,ctx,order){
   active(ctx);if(!order?.paymentAuthorization?.settlement)return {confirmed:false,blocker:'Explicit Base/USDC settlement agreement missing'};const recipient=identityProvider().recipient;if(!/^0x[a-f0-9]{40}$/i.test(recipient??''))fail('verified operator identity required');const p=order?.paymentAuthorization,settlement=validateBaseUsdcSettlement(p?.settlement,{currency:expected.currency,netAmountMinor:expected.amountMinor,recipient});
   const reference=await readReference(order,ctx);active(ctx);if(!reference)return {confirmed:false};
   for(const [key,value] of Object.entries({orderUrl:expected.orderUrl,scopeDigest:p.scopeDigest,contractDigest:p.contractDigest}))if(reference[key]!==value)fail('reference mismatch');
   if(!hash(reference.transactionHash)||!(Number.isSafeInteger(reference.logIndex)&&reference.logIndex>=0||reference.logIndex===null&&reference.selection==='unique-exact-transfer'))fail('transaction reference');
   if(await call('eth_chainId',[],ctx)!=='0x2105')fail('Base chain required');
   const receipt=await call('eth_getTransactionReceipt',[reference.transactionHash],ctx);
   if(receipt===null)return {confirmed:false,blocker:'Transaction not yet mined'};
   if(!receipt||receipt.status!=='0x1'||lower(receipt.transactionHash)!==lower(reference.transactionHash)||!hash(receipt.blockHash)||!Array.isArray(receipt.logs)||receipt.logs.length>10000)fail('successful mined receipt required');
   const height=quantity(receipt.blockNumber),finalized=await call('eth_getBlockByNumber',['finalized',false],ctx);if(!finalized||!hash(finalized.hash))fail('finalized block unavailable');if(quantity(finalized.number)<height)return {confirmed:false,blocker:'Receipt not finalized'};
   const block=await call('eth_getBlockByNumber',[receipt.blockNumber,false],ctx);if(!block||quantity(block.number)!==height||lower(block.hash)!==lower(receipt.blockHash))fail('noncanonical receipt');
   const preparedAt=Date.parse(order.observedAt),blockTime=quantity(block.timestamp);if(!Number.isFinite(preparedAt)||blockTime<BigInt(Math.floor(preparedAt/1000))||blockTime>BigInt(Math.floor(now()/1000)))fail('payment predates order or has future timestamp');
   const logs=receipt.logs.filter(l=>reference.logIndex!==null?quantity(l.logIndex)===BigInt(reference.logIndex):lower(l.address)===BASE_USDC_TOKEN&&lower(l.topics?.[0])===TRANSFER&&lower(l.topics?.[2])==='0x'+'0'.repeat(24)+settlement.recipientAddress.slice(2)&&/^0x[0-9a-f]{64}$/i.test(l.data??'')&&BigInt(l.data)===BigInt(settlement.amountAtomic));if(logs.length!==1)fail('unique transfer log required');const log=logs[0];const logIndex=quantity(log.logIndex);if(logIndex>BigInt(Number.MAX_SAFE_INTEGER))fail('log index overflow');
   if(lower(log.address)!==BASE_USDC_TOKEN||log.removed!==false||lower(log.transactionHash)!==lower(receipt.transactionHash)||lower(log.blockHash)!==lower(receipt.blockHash)||quantity(log.blockNumber)!==height||log.topics?.length!==3||lower(log.topics[0])!==TRANSFER||!/^0x[0-9a-f]{64}$/i.test(log.topics[1]??'')||/^0x0{64}$/i.test(log.topics[1])||lower(log.topics[2])!=='0x'+'0'.repeat(24)+settlement.recipientAddress.slice(2)||!/^0x[0-9a-f]{64}$/i.test(log.data??'')||BigInt(log.data)!==BigInt(settlement.amountAtomic))fail('exact incoming USDC transfer required');
   active(ctx);return {...expected,kind:'incoming-payment',status:'settled',paymentId:`8453:${BASE_USDC_TOKEN}:${lower(receipt.transactionHash)}:${logIndex}`,sourceUrl:ORIGIN,settlement,observedAt:new Date(now()).toISOString(),expiresAt:new Date(now()+60000).toISOString()};
  }
 };
}
