import {createUgigPilotClient} from './founder-ugig-pilot-contract.mjs';
import {digest,orderKey,checkedJSON,bounded} from './founder-restoration-integrity.mjs';
import fs from 'node:fs';import path from 'node:path';
// Immutable, fsynced attempt claims. An attempted but unseen part is ambiguous,
// never retried automatically. Composition performs no filesystem access.
export function createUgigDeliveryJournal({base,isEnabled}){return (key,value)=>{
 if(isEnabled()!==true)throw Error('Delivery journal OFF');
 const root=path.resolve(base);let current=path.parse(root).root;
 for(const part of root.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Unsafe delivery journal');fs.mkdirSync(current,{recursive:true});}
 const file=path.join(root,digest(key)+'.json'),text=JSON.stringify(checkedJSON(value));
 if(isEnabled()!==true)throw Error('Delivery journal OFF');
 let fd;try{fd=fs.openSync(file,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;if(fs.lstatSync(file).isSymbolicLink()||fs.readFileSync(file,'utf8')!==text)throw Error('Delivery intent conflict');return false;}
 try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return true;
 };}
export function renderPilotDeliveryParts({agreement,product,deliveryIntent}){
 if(agreement.deliveryProtocol!=='numbered-messages-v1')return [renderPilotDelivery({agreement,product,deliveryIntent})];
 if(!bounded(deliveryIntent,100)||!product?.files?.length||product.files.length>100||product.digest!==digest({files:product.files})||product.files.some(f=>!bounded(f.path,200)||typeof f.content!=='string'))throw Error('Exact bounded delivery required');
 const body=agreement.deliveryRequirements?.format==='text-files-v1'?JSON.stringify({schema:'numaron-text-files-v1',files:product.files.map(f=>({path:f.path,content:f.content,contentDigest:digest(f.content)}))}):product.files.map(f=>f.path+'\n'+f.content).join('\n');if(Buffer.byteLength(body)>128000)throw Error('Delivery package too large');
 const chunks=[];let chunk='';for(const point of body){if(chunk.length+point.length>1400){chunks.push(chunk);chunk='';}chunk+=point;}if(chunk)chunks.push(chunk);
 if(!chunks.length||chunks.length>100)throw Error('Bounded delivery part count required');
 return chunks.map((chunk,i)=>'Numaron delivery '+deliveryIntent+'\nProduct SHA256: '+product.digest+'\nPart '+(i+1)+'/'+chunks.length+' SHA256: '+digest(chunk)+'\n\n'+chunk);
}
// Official messageSchema: master/src/lib/validations.ts, checked 2026-10-19,
// z.string().max(2000). Check UTF-16 length as well as the local codepoint limit.
export function renderPilotDelivery({agreement,product,deliveryIntent}){
 if(!bounded(deliveryIntent)||!product?.files?.length||product.digest!==digest({files:product.files}))throw Error('Exact delivery product required');
 const content='Numaron delivery '+deliveryIntent+'\nProduct SHA256: '+product.digest+'\n'+product.files.map(f=>f.path+'\n'+f.content).join('\n');
 if(content.length>2000||Array.from(content.normalize('NFC')).length>2000)throw Error('Agreed delivery exceeds supported message limit');return content;
}
export function createUgigPilotDelivery({isEnabled,request,credential,readAssignment,recordEvidence,claimDelivery,canResumeDelivery=()=>false,beforeSend=async()=>{},now=Date.now}){
 const client=createUgigPilotClient({isEnabled,request,credential,now});
 async function authority(order,ctx){client.active(ctx);if(typeof recordEvidence!=='function'||typeof readAssignment!=='function')throw Error('Independent evidence store and assignment reader required');const r=await readAssignment(order,ctx);client.active(ctx);if(r.observedAt>now()||now()-r.observedAt>=60000||r.expiresAt<=now()||r.binding?.deliveryAllowed!==true||r.binding.deliveryChannel!=='existing-ugig-conversation')throw Error('Current agreed delivery authority required');return r.binding;}
 async function multipart(order,intent,product,ctx,send,resuming=false){
  const a=await authority(order,ctx),parts=renderPilotDeliveryParts({agreement:a,product,deliveryIntent:intent});
  if(typeof claimDelivery!=='function')throw Error('Durable multipart journal required');
  const key={order:orderKey(order),intent},manifest={revision:order.sourceRevision,scope:order.scopeDigest,conversation:a.conversationId,agreement:digest(a),product:product.digest,parts:parts.map(digest)};
  client.active(ctx);claimDelivery(key,manifest);
  let rows=await client.messages(a.conversationId,ctx);const matches=content=>rows.filter(m=>m.conversation_id===a.conversationId&&m.sender_id===order.ownerId&&m.content===content);
  const delivered=[];
  for(let i=0;i<parts.length;i++){
   let found=matches(parts[i]);if(found.length>1)throw Error('Duplicate delivery part');
   if(!found.length){
    if(!send)throw Error('Incomplete delivery; submit permission required');
    const current=await authority(order,ctx);if(digest(current)!==digest(a))throw Error('Delivery agreement changed');
    if(resuming&&await canResumeDelivery(order,ctx)!==true)throw Error('Current submit permission required for resume');
    client.active(ctx);if(!claimDelivery({...key,part:i},{manifest:digest(manifest),contentDigest:digest(parts[i])}))throw Error('Attempted delivery part unknown; manual reconciliation required');
    await beforeSend(order,product,ctx);client.active(ctx);await client.call('/api/conversations/'+a.conversationId+'/messages',ctx,{content:parts[i]});
    rows=await client.messages(a.conversationId,ctx);found=matches(parts[i]);
   }
   if(found.length!==1||!bounded(found[0].id))throw Error('Unique delivered part readback required');delivered.push(found[0]);
  }
  // Final full read catches disappearance/duplication during a multi-part send.
  rows=await client.messages(a.conversationId,ctx);if(parts.some((p,i)=>matches(p).length!==1||matches(p)[0].id!==delivered[i].id)||new Set(delivered.map(m=>m.id)).size!==parts.length)throw Error('Complete unique delivery required');
  if(digest(await authority(order,ctx))!==digest(a))throw Error('Delivery agreement changed');
  client.active(ctx);const ref=await recordEvidence({conversationId:a.conversationId,manifest,messages:delivered,productDigest:product.digest,deliveryIntent:intent},ctx);client.active(ctx);if(!bounded(ref,2000))throw Error('Durable delivery evidence required');
  return {...orderKey(order),sourceRevision:order.sourceRevision,rootTaskId:order.rootTaskId,scopeDigest:order.scopeDigest,verified:true,digest:product.digest,remoteId:'ugig-parts:'+digest(delivered.map(m=>m.id)),evidenceRef:ref,observedAt:now(),expiresAt:now()+59000};
 }
 async function readDelivery(order,intent,ctx){const a=await authority(order,ctx);if(a.deliveryProtocol==='numbered-messages-v1')return multipart(order,intent,ctx.product,ctx,await canResumeDelivery(order,ctx)===true,true);const content=renderPilotDelivery({agreement:a,product:ctx.product,deliveryIntent:intent});const rows=await client.messages(a.conversationId,ctx);const matches=rows.filter(m=>m.conversation_id===a.conversationId&&m.sender_id===order.ownerId&&m.content===content);if(matches.length!==1)throw Error('Delivery outcome unknown; exact unique own readback required');client.active(ctx);const m=matches[0];if(!bounded(m.id))throw Error('Delivery message id required');const evidenceRef=await recordEvidence(checkedJSON({conversationId:a.conversationId,message:m,productDigest:ctx.product.digest,deliveryIntent:intent}),ctx);client.active(ctx);if(!bounded(evidenceRef,2000))throw Error('Durable delivery evidence required');return {...orderKey(order),sourceRevision:order.sourceRevision,rootTaskId:order.rootTaskId,scopeDigest:order.scopeDigest,verified:true,digest:ctx.product.digest,remoteId:m.id,evidenceRef,observedAt:now(),expiresAt:now()+59000};}
 async function submitDelivery(input,ctx){const order={...orderKey(input),sourceRevision:input.sourceRevision,rootTaskId:input.rootTaskId,scopeDigest:input.scopeDigest},a=await authority(order,ctx);if(a.deliveryProtocol==='numbered-messages-v1')return multipart(order,input.idempotencyKey,input.product,ctx,true);const content=renderPilotDelivery({agreement:a,product:input.product,deliveryIntent:input.idempotencyKey});await beforeSend(order,input.product,ctx);client.active(ctx);await client.call('/api/conversations/'+a.conversationId+'/messages',ctx,{content});client.active(ctx);}
 return {submitDelivery,readDelivery};
}
