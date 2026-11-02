// Official contract resource route binds messages; never equate channelId and contractId.
// No default transport, credentials, runtime hooks, or production send capability.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail=message=>{throw new Error(message);};
export function parseDealworkMessages(response,{ownAccountId,counterpartyAccountId,channelId}={}){
 if(![ownAccountId,counterpartyAccountId,channelId].every(x=>UUID.test(x??''))||ownAccountId===counterpartyAccountId)fail('Explicit participant and channel binding required');
 if(!Array.isArray(response?.data)||response.data.length>500)fail('Invalid Dealwork message envelope');
 const seen=new Set();
 return response.data.map(m=>{
  if(!m||!UUID.test(m.id??'')||seen.has(m.id)||m.channelId!==channelId||![ownAccountId,counterpartyAccountId].includes(m.senderAccountId)||typeof m.content!=='string'||m.content.length>50000||typeof m.createdAt!=='string'||!Number.isFinite(Date.parse(m.createdAt)))fail('Invalid or unbound Dealwork message');
  seen.add(m.id);return {id:m.id,channelId:m.channelId,senderAccountId:m.senderAccountId,content:m.content,createdAt:m.createdAt};
 });
}
export function createDealworkMessages({call,isEnabled=()=>false,ownAccountId}={}){
 const active=()=>{if(isEnabled()!==true)fail('Dealwork communication is disabled');if(typeof call!=='function'||!UUID.test(ownAccountId??''))fail('Authenticated injected transport and own account required');};
 const request=async(method,path,body)=>{active();const response=await call(method,path,body);active();return response;};
 const inspect=async({contractId}={})=>{
  active();if(!UUID.test(contractId??''))fail('Invalid contract id');
  const c=(await request('GET','/api/v1/contracts/'+contractId)).data;
  if(c?.id!==contractId||c.workerAccountId!==ownAccountId||!UUID.test(c.buyerAccountId??'')||c.buyerAccountId===ownAccountId||!UUID.test(c.jobId??''))fail('Contract participants unavailable or inconsistent');
  const response=await request('GET','/api/v1/contracts/'+contractId+'/messages');
  if(!Array.isArray(response?.data))fail('Invalid message envelope');
  const channelId=response.data[0]?.channelId;
  const messages=response.data.length?parseDealworkMessages(response,{ownAccountId,counterpartyAccountId:c.buyerAccountId,channelId}):[];
  if(response.meta?.total!==undefined&&response.meta.total!==messages.length)fail('Incomplete message list');
  return {contractId,jobId:c.jobId,ownAccountId,counterpartyAccountId:c.buyerAccountId,channelId:channelId??null,messages};
 };
 return {get available(){return typeof call==='function'&&UUID.test(ownAccountId??'');},inspect,
  async send(binding,{content}={}){
   let postStarted=false;
   try{
   active();if(typeof content!=='string'||!content.trim()||content.length>5000)fail('Invalid message content');
   const before=await inspect({contractId:binding?.contractId});
   for(const key of ['contractId','jobId','ownAccountId','counterpartyAccountId'])if(before[key]!==binding[key])fail('Contract binding changed');
   if(binding.channelId!==null&&binding.channelId!==before.channelId)fail('Conversation binding changed');
   const snapshot=messages=>JSON.stringify([...messages].sort((a,b)=>a.id.localeCompare(b.id)));
   if(snapshot(before.messages)!==snapshot(binding.messages??[]))fail('Conversation changed before send');
   const oldIds=new Set(before.messages.map(m=>m.id));
   const lastDuplicate=Math.max(-Infinity,...before.messages.filter(m=>m.senderAccountId===ownAccountId&&m.content===content).map(m=>Date.parse(m.createdAt)));
   const lastBuyer=Math.max(-Infinity,...before.messages.filter(m=>m.senderAccountId===before.counterpartyAccountId).map(m=>Date.parse(m.createdAt)));
   if(lastDuplicate!==-Infinity&&lastBuyer<=lastDuplicate)fail('Identical message already present without a new buyer message; do not retry');
   // POST receipt is not confirmation. Independent GET on the same exact resource is required.
   postStarted=true;await request('POST','/api/v1/contracts/'+before.contractId+'/messages',{content});
   const after=await inspect({contractId:before.contractId});
   for(const key of ['jobId','ownAccountId','counterpartyAccountId'])if(after[key]!==before[key])fail('Contract changed after send; delivery uncertain; do not retry');
   if(before.channelId!==null&&after.channelId!==before.channelId)fail('Conversation changed after send; delivery uncertain; do not retry');
   const found=after.messages.filter(m=>!oldIds.has(m.id)&&m.senderAccountId===ownAccountId&&m.content===content);
   if(found.length!==1)fail('Message readback unconfirmed; do not retry');
   return {messageId:found[0].id,contractId:before.contractId,channelId:found[0].channelId,verified:true};
   }catch(error){if(!postStarted)error.dispatchNotStarted=true;throw error;}
  }
 };
}
