import {ugigGroupRoot} from './founder-ugig-group-replies.mjs';
import {classifyLocalFailure,communicationRetryAllowed} from './founder-failure-classification.mjs';
import {createHash} from 'node:crypto';
import {openOutreach} from './founder-outreach.mjs';
import {createOutreachTransports,communicationTarget} from './founder-outreach-transports.mjs';
export function openFounderCommunication({file,isEnabled,credential,request,now=Date.now,transports,ugigCredential,dealworkCredential,googleAccess,getGmailBindings=()=>[],getUgigGroupBindings=()=>[],requireCurrentSendReview=false}){
 if(typeof requireCurrentSendReview!=='boolean')throw Error('Explicit Boolean communication review policy required');
 const service=openOutreach({file,isEnabled,now,transports:transports??createOutreachTransports({isEnabled,request,now,githubKey:credential,ugigCredential,dealworkCredential,googleAccess,getUgigGroupBindings,getGmailBinding:threadId=>getGmailBindings().find(b=>b.threadId===threadId)??null})});
 const hash=x=>createHash('sha256').update(x).digest('hex').slice(0,32);
 const adapter=service.adapter;
 const interruptedRetrySafe=task=>{if(requireCurrentSendReview)return false;const target=communicationTarget(task?.input?.url);return !!target&&adapter.interruptedRetrySafe({...task,input:{...task.input,source:target.source}});};
 const policyReasons={
  'Explicit reward required':'explicit_reward_missing',
  'Job outside supported technical profiles':'technical_profile_unverified',
  'Job not eligible for autonomous communication':'github_eligibility_unverified',
  'uGig job not eligible':'ugig_eligibility_unverified',
  'Communication HTTP 404':'target_not_found',
  'Communication HTTP 410':'target_removed'
 };

 return {...service,status:()=>({...service.status(),...(requireCurrentSendReview?{freeOffers:false,autonomousReplies:false,currentSendReviewRequired:true,reason:'Konkrete aktuelle Nachrichtenpruefung erforderlich; keine automatischen Abrufe oder Sendungen.'}:{}),ugigGroupReplies:{reviewedGroupCount:getUgigGroupBindings().length,automaticWorkStart:false,orderBudgetsUsed:false}}),adapter:{...adapter,get available(){return !requireCurrentSendReview&&adapter.available!==false;},get reason(){return requireCurrentSendReview?'operator-send-review-required':adapter.reason??null;},interruptedRetrySafe,retrySafe:false,reconcileSafe:false,manualRetrySafe:!requireCurrentSendReview,shouldAutoRetry:communicationRetryAllowed,get nextReadyAt(){return adapter.nextReadyAt;},async execute(ctx){if(requireCurrentSendReview){ctx.assertActive?.();if(!isEnabled())throw Error('Communication OFF');return {kind:'external-communication',status:'blocked',reason:'operator-send-review-required',url:ctx.task?.input?.url,customerWorkStarted:false};}const url=ctx.task?.input?.url,target=communicationTarget(url);if(!target)throw Error('Exact supported public job target required');try{const result=await adapter.execute({...ctx,task:{...ctx.task,input:{...ctx.task.input,source:target.source}}});if(result.status==='blocked')service.deferTarget(url,now()+3600000,result.reason??'blocked');return result;}catch(error){const diagnostic=classifyLocalFailure(error);if(diagnostic.code!=='policy_blocked'){if(communicationRetryAllowed(error)||diagnostic.code==='service_unauthorized')service.deferTarget(url,now()+3600000,diagnostic.code);throw error;}ctx.assertActive?.();if(!isEnabled())throw Error('Communication OFF');const policyReason=policyReasons[error.message]??'eligibility_unverified';service.deferTarget(url,now()+86400000,policyReason);return {kind:'external-communication',status:'blocked',reason:'policy_blocked',policyReason,url,customerWorkStarted:false};}}},
  advance(controller,observations=[]){
   if(requireCurrentSendReview)return;
   if(!isEnabled())return;
   for(const b of getUgigGroupBindings())service.registerTarget({source:'ugig',url:'https://ugig.net/api/conversations/'+b.conversationId+'/messages',rootTaskId:ugigGroupRoot(b.conversationId)});
   for(const b of getGmailBindings())service.registerTarget({source:'gmail',url:'https://mail.google.com/mail/u/0/#all/'+b.threadId,rootTaskId:b.rootTaskId});
   for(const o of observations)for(const s of o.sources??[]){const target=communicationTarget(s.url);if(s.privacy==='private'||o.privacy==='private'||!target||target.source==='gmail'||target.type==='conversation')continue;service.registerTarget({...target,rootTaskId:o.rootTaskId});}
   // Revisit known conversations through the existing controller, retaining their budget root.
   let pendingUrls;
   const pending=()=>pendingUrls??=new Set((controller.planningHistory?.()??[]).filter(x=>x.kind==='external-communication'&&!['done','failed','cancelled','canceled'].includes(x.status)).map(x=>x.input?.url));
   for(const t of service.targets()){
    if(t.scheduled>=0&&now()-t.scheduled<600000)continue;
    const id='message-'+hash(t.url+':'+Math.floor(now()/600000));
    if(controller.hasTask(id))continue;
    if(pending().has(t.url))continue;
    if(!isEnabled())return;
    controller.enqueue({id,rootTaskId:t.root,kind:'external-communication',input:{url:t.url,title:'Auftragsbezogenes Angebot oder erforderliche Antwort prüfen'},dependencies:[],resources:['communication-'+hash(t.url)]});service.markScheduled(t.url);return;
   }
  }
 };
}
