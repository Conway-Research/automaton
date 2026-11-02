import {digest} from './founder-restoration-integrity.mjs';
export const SOLANA_MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const ORIGIN='https://api.mainnet-beta.solana.com',SYSTEM='11111111111111111111111111111111';
const must=(ok,message)=>{if(!ok)throw Error('SOL proof: '+message);};
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function solBase58(s,bytes=32){if(typeof s!=='string'||s.length>90||!s.length)return false;const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of s){const i=alphabet.indexOf(c);if(i<0)return false;n=n*58n+BigInt(i);}let size=0;while(n){size++;n>>=8n;}return size+(s.match(/^1*/)?.[0].length??0)===bytes;}
export const solAmount=s=>typeof s==='string'&&/^[1-9]\d{0,15}$/.test(s)&&BigInt(s)<=BigInt(Number.MAX_SAFE_INTEGER);
// Read-only RPC allowlist; no signer, secret key or transaction sender exists here.
export function createSolanaReceiptReader({isEnabled,rpc,request=fetch,now=Date.now}){
 const active=ctx=>{must(isEnabled()===true&&!ctx?.signal?.aborted,'OFF or cancelled');ctx?.assertActive?.();};
 async function call(method,params,ctx){active(ctx);must(['getGenesisHash','getSignatureStatuses','getTransaction','getBalance'].includes(method),'read-only method');let result;
  if(rpc)result=await rpc(method,params,ctx);else{const r=await request(ORIGIN,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.any([ctx?.signal??new AbortController().signal,AbortSignal.timeout(10000)])});active(ctx);must(r.ok&&r.body,'RPC unavailable');const reader=r.body.getReader(),parts=[];let size=0;try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;must(size<=1000000,'response too large');parts.push(x.value);}}finally{await reader.cancel();}const data=JSON.parse(Buffer.concat(parts).toString('utf8'));must(data.jsonrpc==='2.0'&&data.id===1&&!data.error&&Object.hasOwn(data,'result'),'RPC envelope');result=data.result;}
  active(ctx);return result;
 }
 return {
  async balance(address,minSlot,ctx){active(ctx);must(solBase58(address)&&integer(minSlot),'balance parameters');must(await call('getGenesisHash',[],ctx)===SOLANA_MAINNET,'mainnet required');const r=await call('getBalance',[address,{commitment:'finalized',minContextSlot:minSlot}],ctx);must(integer(r?.value)&&integer(r.context?.slot)&&r.context.slot>=minSlot,'finalized balance');return String(r.value);},
  async read({signature,sender,recipient,lamports,notBefore},ctx){active(ctx);must(solBase58(signature,64)&&solBase58(sender)&&solBase58(recipient)&&sender!==recipient&&recipient!==SYSTEM&&solAmount(lamports)&&Number.isFinite(notBefore)&&notBefore<=now(),'exact transfer agreement');must(await call('getGenesisHash',[],ctx)===SOLANA_MAINNET,'mainnet required');
   const status=await call('getSignatureStatuses',[[signature],{searchTransactionHistory:true}],ctx),s=status?.value?.[0];must(status?.value?.length===1&&s?.confirmationStatus==='finalized'&&s.err===null&&integer(s.slot),'finalized successful signature');
   const tx=await call('getTransaction',[signature,{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:0}],ctx),m=tx?.meta,message=tx?.transaction?.message;
   must(tx&&integer(tx.slot)&&tx.slot===s.slot&&integer(tx.blockTime)&&tx.blockTime>=Math.floor(notBefore/1000)&&tx.blockTime<=Math.floor(now()/1000)&&tx.transaction.signatures?.[0]===signature&&m?.err===null&&integer(m.fee),'successful exact transaction');
   must(Array.isArray(message?.accountKeys)&&Array.isArray(message.instructions)&&message.instructions.length<=100&&Array.isArray(m.preBalances)&&Array.isArray(m.postBalances)&&m.preBalances.length===message.accountKeys.length&&m.postBalances.length===message.accountKeys.length&&m.preBalances.every(integer)&&m.postBalances.every(integer)&&(!m.innerInstructions||m.innerInstructions.every(x=>Array.isArray(x.instructions)&&x.instructions.length===0)),'complete simple transfer metadata');
   const keys=message.accountKeys;must(keys.every(k=>solBase58(k.pubkey))&&new Set(keys.map(k=>k.pubkey)).size===keys.length,'unique account keys');const i=keys.findIndex(k=>k.pubkey===recipient);must(i>0&&keys[i].signer===false&&BigInt(m.postBalances[i])-BigInt(m.preBalances[i])===BigInt(lamports),'exact net recipient balance');
   const transfers=message.instructions.filter(x=>x.programId===SYSTEM&&x.program==='system'&&x.parsed?.type==='transfer'&&x.parsed.info?.destination===recipient);must(transfers.length===1,'unique incoming native transfer');const info=transfers[0].parsed.info;must(info.source===sender&&integer(info.lamports)&&BigInt(info.lamports)===BigInt(lamports)&&keys.some(k=>k.pubkey===sender&&k.signer===true),'exact sender and lamports');
   active(ctx);return {network:'solana-mainnet',genesisHash:SOLANA_MAINNET,signature,sender,recipient,lamports,slot:tx.slot,blockTime:tx.blockTime,feeLamports:String(m.fee),receiptDigest:digest(tx),evidenceRef:'solana-mainnet:'+signature};
  }
 };
}
