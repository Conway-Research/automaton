import {digest,orderKey} from './founder-restoration-integrity.mjs';
const capFor={qualify:'read',apply:'apply','reconcile-application':'reconcile',prepare:'work',work:'work',verify:'verify',submit:'submit','reconcile-delivery':'reconcile',acceptance:'reconcile',payment:'reconcile'};
const funded=new Set(['prepare','work','verify','submit']);
export function guardOrderAction(action,ctx){
 const block=blocker=>({allowed:false,blocker});if(ctx.powerEnabled!==true||ctx.controllerRunning!==true)return block('power-or-controller-off');
 const {order,source,budget}=ctx;if(!order||!source||!budget?.active||!capFor[action.kind])return block('missing-order-source-or-budget');
 let key;try{key=orderKey(order);orderKey(action.orderKey);}catch{return block('invalid-order-key');}if(digest(key)!==digest(action.orderKey)||source.id!==key.sourceId||action.rootTaskId!==order.rootTaskId||action.sourceRevision!==order.sourceRevision)return block('order-or-family-binding-mismatch');
 const cap=source.capabilities?.[capFor[action.kind]],now=ctx.now??Date.now();if(cap?.state!=='live-verified'||!Number.isFinite(cap.expiresAt)||cap.expiresAt<=now||!cap.evidenceRefs?.length)return block('capability-unverified-or-expired');
 if(!Number.isSafeInteger(action.maxCostRappen)||action.maxCostRappen<0||action.maxCostRappen>250||action.maxCostRappen>budget.rootRemainingRappen)return block('root-budget-limit');
 const expected={qualify:['discovered'],apply:['qualified'],prepare:['assigned'],work:['prepared'],verify:['worked'],submit:['verified'],acceptance:['submitted'],payment:['accepted'],'reconcile-application':['applied','qualified'],'reconcile-delivery':['verified','submitted']}[action.kind];if(!expected.includes(order.state))return block('action-state-changed');
 if((action.deliveryAttempt??0)!==(order.deliveryAttempt??0))return block('delivery-attempt-changed');
 const readApplication=action.kind==='reconcile-application'&&action.maxCostRappen===0;
 if(order.termsVerified!==true&&!readApplication)return block('terms-unverified');
 if(action.kind==='apply'&&order.applicationAllowed!==true)return block('application-not-authorized');
 if(funded.has(action.kind)&&ctx.requireConfirmedFundedOrders===true&&ctx.confirmedWorkAuthority?.allows(order)!==true)return block('confirmed-assignment-compensation-and-funded-scope-required');
 if(funded.has(action.kind)&&order.paymentAuthorization?.paymentMode==='postpaid-limited'){if(ctx.paymentAuthority?.allows(order)!==true)return block('postpaid-authority-missing');}
 else if(funded.has(action.kind)){const p=order.funding;if(!['assigned','prepared','worked','verified'].includes(order.state)||p?.verified!==true||p.sourceId!==key.sourceId||p.externalId!==key.externalId||p.ownerId!==key.ownerId||!Number.isFinite(p.expiresAt)||p.expiresAt<=now)return block('assignment-or-funding-missing');}
 if(order.pendingWrite&&!['reconcile-application','reconcile-delivery'].includes(action.kind))return block('unknown-write-reconciliation-required');
 if(action.kind==='submit'&&(!order.verification?.passed||!order.verification.digest))return block('verified-delivery-or-reconciliation-required');
 return {allowed:true,blocker:null};
}
export function planOrderActions({order,source,budget,now=Date.now(),actionCosts={},paymentAuthority,requireConfirmedFundedOrders=false,confirmedWorkAuthority}){
 const kind=order.pendingWrite?order.pendingWrite==='application'?'reconcile-application':'reconcile-delivery':({discovered:'qualify',qualified:'apply',applied:'reconcile-application',assigned:'prepare',prepared:'work',worked:'verify',verified:'submit',submitted:'acceptance',accepted:'payment'})[order.state];if(!kind)return [];
 const action={id:'order-action-'+digest([orderKey(order),order.sourceRevision,kind,order.deliveryAttempt??0,...(['reconcile-application','reconcile-delivery','acceptance','payment'].includes(kind)?[Math.floor(now/60000)]:[])]).slice(0,32),kind,deliveryAttempt:order.deliveryAttempt??0,orderKey:orderKey(order),rootTaskId:order.rootTaskId,sourceRevision:order.sourceRevision,maxCostRappen:actionCosts[kind]??order.actionCostRappen??0};return guardOrderAction(action,{order,source,budget,now,powerEnabled:true,controllerRunning:true,paymentAuthority,requireConfirmedFundedOrders,confirmedWorkAuthority}).allowed?[action]:[];
}
export function advanceOrderActions({controller,orders=[],registry,budget,isEnabled,actionCosts={},paymentAuthority,requireConfirmedFundedOrders=false,confirmedWorkAuthority,dependenciesForAction=()=>[],actionGuard=()=>true}){
 if(!isEnabled())return {enqueued:0};let enqueued=0;const sources=registry.snapshot().sources;
 for(const order of orders){const source=sources.find(s=>s.id===order.sourceId);if(!source)continue;for(const action of planOrderActions({order,source,budget,actionCosts,paymentAuthority,requireConfirmedFundedOrders,confirmedWorkAuthority})){if(!isEnabled())return {enqueued};if(!actionGuard(action,order))continue;if(controller.hasTask(action.id))continue;if(controller.planningHistory?.().some(t=>!['done','failed','canceled','cancelled'].includes(t.status)&&t.input?.action?.kind===action.kind&&t.input.action.sourceRevision===action.sourceRevision&&digest(t.input.action.orderKey)===digest(action.orderKey)))continue;controller.enqueue({id:action.id,rootTaskId:action.rootTaskId,kind:'source-'+action.kind,input:{action},dependencies:dependenciesForAction(action,order),resources:['source-'+digest(order.sourceId).slice(0,24)]});enqueued++;}}return {enqueued};
}
