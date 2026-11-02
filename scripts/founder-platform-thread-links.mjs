// Pure evidence reconciliation. These links are not runtime sending or work grants.
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
export function linkUgigCustomerThreads({identity,applications,threads}){
 requireValue(uuid.test(identity)&&Array.isArray(applications)&&applications.length<=100&&Array.isArray(threads)&&threads.length<=100,'Bounded own account evidence required');
 const apps=new Set();for(const a of applications){requireValue(uuid.test(a.id)&&!apps.has(a.id)&&a.applicant_id===identity&&uuid.test(a.gig_id)&&a.gig?.id===a.gig_id&&uuid.test(a.gig.poster?.id)&&a.gig.poster.id!==identity,'Own application and job poster binding required');apps.add(a.id);}
 const seen=new Set();return threads.map(({conversation:c,messages:m})=>{
  requireValue(c&&uuid.test(c.id)&&!seen.has(c.id)&&Array.isArray(c.participant_ids)&&c.participant_ids.length===2&&new Set(c.participant_ids).size===2&&c.participant_ids.includes(identity)&&c.participant_ids.every(x=>uuid.test(x)),'Exact two-party conversation required');seen.add(c.id);
  requireValue(Array.isArray(m?.data)&&m.data.length<=100&&!m.hasMore&&!m.has_more&&!m.nextCursor&&!m.next_cursor&&(m.total??m.data.length)===m.data.length,'Complete bounded message evidence required');
  const ids=new Set();for(const x of m.data){requireValue(uuid.test(x.id)&&!ids.has(x.id)&&x.conversation_id===c.id&&c.participant_ids.includes(x.sender_id)&&typeof x.content==='string'&&x.content.length<=50000&&Number.isFinite(Date.parse(x.created_at)),'Message sender and thread binding required');ids.add(x.id);}
  const buyer=c.participant_ids.find(x=>x!==identity),orders=applications.filter(a=>a.gig.poster.id===buyer&&(c.gig_id===null||a.gig_id===c.gig_id));
  requireValue(c.gig_id===null||uuid.test(c.gig_id),'Invalid provider job identity');requireValue(orders.length>0,'No own application for this buyer/job');
  return {source:'ugig',conversationId:c.id,ownAccountId:identity,counterpartyId:buyer,binding:c.gig_id===null?'verified-counterparty-group':'provider-job-conversation',orders:orders.map(a=>({applicationId:a.id,jobId:a.gig_id,title:a.gig.title,applicationStatus:a.status})),inboundMessages:m.data.filter(x=>x.sender_id===buyer).length,ownMessages:m.data.filter(x=>x.sender_id===identity).length,orderSpecificReplyAllowed:false,workAuthorized:false,evidenceRef:'artifacts/send-access-check-20261018/platform-customer-review.json'};
 });
}
