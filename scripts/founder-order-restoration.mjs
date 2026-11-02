import {contentReviewTask} from './founder-content-worker.mjs';
import {officePortfolioReceipt} from './founder-office-portfolio.mjs';
import {openOfficeVersions} from './founder-office-versions.mjs';
import {calendarDeadline} from './founder-office-service-plan.mjs';
import {applicationReadOutcome} from './founder-application-read.mjs';
import {orderAccounts} from './founder-order-accountability.mjs';
import {createOrderSources,importHistoricalOwnOrders} from './order-sources/index.mjs';
import {openOrderAdapterLearning} from './founder-order-adapter-learning.mjs';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';
import {normalizeInventory,openSourceRegistry} from './founder-source-registry.mjs';
import {openOpportunityStore,observationDigest} from './founder-opportunity-store.mjs';
import {ingestMonitorObservations} from './founder-monitor-handoff.mjs';
import {advanceOrderActions,guardOrderAction} from './founder-order-lifecycle.mjs';
import {digest,checkedJSON} from './founder-restoration-integrity.mjs';
import {openOrderExecution} from './founder-order-execution.mjs';
const kinds=['qualify','apply','reconcile-application','prepare','work','verify','submit','reconcile-delivery','acceptance','payment'];
export function openOrderRestoration({base,directory,handoffDirectory=path.join(base,'artifacts/numaron-local-monitor/handoffs'),isEnabled,workPackages,actionAdapters={},execution={},historicalRegistrations=[]}){
 fs.mkdirSync(directory,{recursive:true});const registry=openSourceRegistry(path.join(directory,'sources.db')),store=openOpportunityStore(path.join(directory,'opportunities.db'),{paymentAuthority:execution.paymentAuthority});
 if(!workPackages){const file=path.join(base,'docs/superpowers/plans/2026-10-18-numaron-source-work-packages.json');workPackages=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{rows:[]};}
 const normalized=normalizeInventory({},workPackages);registry.import(normalized.sources,normalized.mappings);let rejectedRounds=0;
 execution={...execution,sources:createOrderSources({registry,implementations:typeof execution.sources==='function'?execution.sources({registry,store}):execution.sources??[]})};importHistoricalOwnOrders({store,registry,registrations:historicalRegistrations});
 const executionEngine=openOrderExecution({directory,isEnabled,options:execution});actionAdapters={...executionEngine.adapters,...actionAdapters};
 const historyFile=path.join(base,'artifacts/chat-handover-20261017/task-register.json');if(fs.existsSync(historyFile)){if(fs.lstatSync(historyFile).isSymbolicLink()||fs.statSync(historyFile).size>2000000)throw Error('Invalid historical register');store.importHistory(JSON.parse(fs.readFileSync(historyFile,'utf8')).tasks);}
 const active=ctx=>{if(!isEnabled())throw Error('Order restoration OFF');ctx.assertActive();};
 if(execution.requireConfirmedFundedOrders!==undefined&&typeof execution.requireConfirmedFundedOrders!=='boolean')throw Error('Explicit confirmed-funded mode required');
 const confirmedPolicy={requireConfirmedFundedOrders:execution.requireConfirmedFundedOrders===true,confirmedWorkAuthority:execution.confirmedWorkAuthority};
 const refreshConfirmed=async(order,ctx)=>{if(!confirmedPolicy.requireConfirmedFundedOrders)return;active(ctx);if(!order||typeof confirmedPolicy.confirmedWorkAuthority?.refresh!=='function')throw Error('Confirmed customer-work authority unavailable');await confirmedPolicy.confirmedWorkAuthority.refresh(order,ctx);active(ctx);if(confirmedPolicy.confirmedWorkAuthority.allows(order)!==true)throw Error('Confirmed customer-work authority changed');};
 const currentOrder=action=>store.snapshot().orders.find(o=>o.sourceId===action.orderKey.sourceId&&o.externalId===action.orderKey.externalId&&o.ownerId===action.orderKey.ownerId);
 const adapterFor=(kind,sourceId)=>{const a=actionAdapters[kind];return a&&typeof a.execute==='function'&&typeof a.verify==='function'&&a.sourceIds?.includes(sourceId)?a:null;};
 // Queue readiness only: execution still requires its real grant and the full guard below.
 const sourceWait=task=>{
  const action=task?.input?.action;
  if(!isEnabled()||task?.kind!=='source-reconcile-application'||action?.kind!=='reconcile-application'||!action.orderKey||action.maxCostRappen!==0||actionAdapters['reconcile-application']?.maxCostRappen!==0||task.rootTaskId!==action.rootTaskId)return null;
  const order=currentOrder(action),source=registry.snapshot().sources.find(s=>s.id===order?.sourceId);
  const guard=guardOrderAction(action,{order,source,powerEnabled:true,controllerRunning:true,budget:{active:true,rootRemainingRappen:0}});
  return guard.blocker==='capability-unverified-or-expired'?{code:'source-evidence',reason:'Wartet auf einen aktuellen freigegebenen Monitorbeleg; kein neuer Abruf ausgelöst.',until:null}:null;
 };
 const adapters=Object.fromEntries(kinds.map(kind=>['source-'+kind,{maxCostRappen:actionAdapters[kind]?.maxCostRappen??0,providerTracked:actionAdapters[kind]?.providerTracked===true,get sourceIds(){return actionAdapters[kind]?.sourceIds??[];},qualityProfilesForSource(sourceId){return actionAdapters[kind]?.qualityProfilesForSource?.(sourceId)??actionAdapters[kind]?.qualityProfiles??[];},get qualityProfiles(){return actionAdapters[kind]?.qualityProfiles??[];},get evidenceImplemented(){return typeof actionAdapters[kind]?.execute==='function'&&typeof actionAdapters[kind]?.verify==='function';},get evidenceRevision(){return actionAdapters[kind]?.evidenceRevision;},get accessRevision(){return actionAdapters[kind]?.accessRevision;},get available(){return !!actionAdapters[kind]?.sourceIds?.length;},reason:'Quellspezifischer geprüfter Aktionsadapter erforderlich.',retrySafe:false,autoRetrySafe:false,
  nextReadyAtFor({task}){return sourceWait(task)?Date.now()+60000:0;},
  waitStateFor({task}){return sourceWait(task);},
  async execute(ctx){let activeIntent=null;const action=ctx.task.input?.action;if(action?.kind!==kind||ctx.task.rootTaskId!==action.rootTaskId)throw Error('Exact action binding required');const evaluate=({refreshingFunding=false}={})=>{active(ctx);const savedOrder=currentOrder(action),order=activeIntent&&savedOrder?.pendingActionId===activeIntent?{...savedOrder,pendingWrite:false}:savedOrder,source=registry.snapshot().sources.find(s=>s.id===order?.sourceId),guard=guardOrderAction(action,{order,source,powerEnabled:isEnabled(),controllerRunning:true,paymentAuthority:execution.paymentAuthority,...confirmedPolicy,...(refreshingFunding?{requireConfirmedFundedOrders:false}:{}),budget:{active:!!ctx.grant?.reservationId,rootRemainingRappen:ctx.grant?.maxCostRappen??-1}});if(!guard.allowed)throw Error('Source action blocked: '+guard.blocker);return order;};
   active(ctx);const saved=currentOrder(action);if(['prepare','work','verify','submit'].includes(kind))await refreshConfirmed(saved,ctx);if(saved?.paymentAuthorization&&['prepare','work','verify','submit'].includes(kind)){if(!execution.paymentAuthority)throw Error('Payment authority unavailable');const proof=await execution.paymentAuthority.refresh(saved,ctx);store.renewPayment(saved,saved.sourceRevision,proof);}
   let order=evaluate();const adapter=adapterFor(kind,order.sourceId);if(!adapter||adapter.maxCostRappen!==ctx.grant.maxCostRappen||action.maxCostRappen!==adapter.maxCostRappen)throw Error('Exact certified source adapter required');
   if(['apply','submit'].includes(kind)){const journalId=kind==='submit'&&adapter.prepareDispatch?await adapter.prepareDispatch({...ctx,order,assertActive:()=>evaluate()}):null;evaluate();activeIntent=randomUUID();store.update(order,order.sourceRevision,{pendingWrite:kind==='apply'?'application':'delivery',pendingActionId:activeIntent,...(journalId?{pendingDeliveryJournalId:journalId}:{})});}
   const guarded={...ctx,assertActive:()=>{evaluate();},assertFundingRefreshActive:()=>{evaluate({refreshingFunding:true});}};const outcome=await adapter.execute({...guarded,order});active(ctx);
   if(!adapter.verify(outcome))throw Error('Independent source result verification failed');
   if(['prepare','work','verify','submit'].includes(kind))await refreshConfirmed(currentOrder(action),ctx);
   evaluate(); // A completed adapter cannot commit under expired or revoked authority.
   const state={qualify:'qualified',apply:'applied','reconcile-application':'applied','reconcile-delivery':'submitted',prepare:'prepared',work:'worked',verify:'verified',submit:'submitted',acceptance:'accepted',payment:'paid'}[kind];
   if(kind==='payment'&&outcome.confirmed===true&&(!outcome.payment||outcome.payment.sourceId!==order.sourceId||outcome.payment.externalId!==order.externalId||outcome.payment.ownerId!==order.ownerId||!outcome.payment.evidenceRef||outcome.payment.confirmed!==true))throw Error('Exact payment evidence required');
   if(kind==='payment'&&outcome.confirmed===true){store.checkPayment(order,order.sourceRevision,outcome.payment);if(order.paymentAuthorization)execution.paymentAuthority.settle(order,outcome.payment,ctx);}
   if(kind==='reconcile-delivery'&&outcome.dispatchNotStarted===true){if(!order.pendingDeliveryJournalId||order.pendingDeliveryJournalId!==outcome.deliveryIntent||adapter.canResume?.(order,outcome)!==true)throw Error('Persisted unsent dispatch binding required');store.update(order,order.sourceRevision,{pendingWrite:false,pendingActionId:null,pendingDeliveryJournalId:null,state:'verified',deliveryAttempt:(order.deliveryAttempt??0)+1});}
   else if(kind==='acceptance'&&outcome.review?.status==='changes-requested')store.applyReview(order,order.sourceRevision,outcome.review);
   else if(outcome.confirmed===true&&outcome.assignment&&['apply','reconcile-application'].includes(kind))store.confirmAssignment(order,order.sourceRevision,outcome);
   else if(outcome.confirmed===true&&state)store.update(order,order.sourceRevision,{state,pendingWrite:false,pendingActionId:null,...(kind==='verify'?{verification:outcome.verification}:{}),...(kind==='payment'?{payment:outcome.payment}:{}),...(['submit','reconcile-delivery'].includes(kind)?{deliveryDigest:order.verification.digest}:{})});
   return {kind:'source-'+kind,orderKey:action.orderKey,outcome:checkedJSON(outcome),...(outcome.costReceipt?{costReceipt:outcome.costReceipt}:{})};
  },verify:r=>r?.kind==='source-'+kind&&typeof r.outcome==='object'}]));
 const readApplication=adapters['source-reconcile-application'].execute;
 adapters['source-reconcile-application'].execute=ctx=>applicationReadOutcome(readApplication,{...ctx,assertActive:()=>active(ctx)});
 const adapterLearning=openOrderAdapterLearning({directory,isEnabled,registry,sources:executionEngine.contracts,orders:()=>store.snapshot().orders,options:execution.learning});Object.assign(adapters,adapterLearning.adapters);
  const reviewAdapter=executionEngine.contentReviewAdapter;
 adapters['ugig-content-review']={maxCostRappen:50,providerTracked:true,retrySafe:false,autoRetrySafe:false,get available(){return reviewAdapter.available;},get accessRevision(){return reviewAdapter.accessRevision;},async execute(ctx){const i=ctx.task.input,order=store.snapshot().orders.find(o=>digest({sourceId:o.sourceId,externalId:o.externalId,ownerId:o.ownerId})===digest(i.orderKey));if(!order||order.profileId!=='content-repurpose'||order.rootTaskId!==ctx.task.rootTaskId||order.sourceRevision!==i.sourceRevision)throw Error('Exact content review order required');await refreshConfirmed(order,ctx);const action={kind:'verify',orderKey:i.orderKey,rootTaskId:order.rootTaskId,sourceRevision:order.sourceRevision,maxCostRappen:50};const assertActive=({refreshingFunding=false}={})=>{active(ctx);const current=currentOrder(action),source=registry.snapshot().sources.find(s=>s.id===current?.sourceId);if(!guardOrderAction(action,{order:current,source,powerEnabled:isEnabled(),controllerRunning:true,paymentAuthority:execution.paymentAuthority,...confirmedPolicy,...(refreshingFunding?{requireConfirmedFundedOrders:false}:{}),budget:{active:!!ctx.grant?.reservationId,rootRemainingRappen:ctx.grant?.maxCostRappen??-1}}).allowed)throw Error('Content review authority changed');};assertActive();const result=await reviewAdapter.execute({...ctx,order,assertActive:()=>assertActive(),assertFundingRefreshActive:()=>assertActive({refreshingFunding:true})});await refreshConfirmed(currentOrder(action),ctx);assertActive();return result;},verify:r=>reviewAdapter.verify(r)};
 const officeVersions=openOfficeVersions(path.join(directory,'office-versions.db'));
 const api={registry,store,adapters,
  setOfficePlanningStatus(assignmentKey,assignmentVersion,status,expectedVersion){
   if(isEnabled()!==false)throw Error('Explicit OFF required for local planning status');
   if(status==='included')api.inspectAssignedOfficePortfolio([{key:assignmentKey,version:assignmentVersion}]);
   return officeVersions.put('planning',assignmentKey,expectedVersion,{assignmentVersion,status});
  },
  inspectCompleteOfficeResources(resourceIds){
   const snapshot=officeVersions.resourceSnapshot(checkedJSON(resourceIds));
   const base={schema:'office-complete-resource-inspection-v1',planningOnly:true,scope:'all-latest-registered-assignments-for-requested-resources',complete:snapshot.issues.length===0,snapshotDigest:snapshot.snapshotDigest,workAuthorized:false,sendAuthorized:false,deliveryAuthorized:false,customerConfirmed:false,included:snapshot.included.map(r=>({key:r.assignment.key,assignmentVersion:r.assignment.version,planningVersion:r.planning.version,planVersion:r.plan.version,calendarVersion:r.calendar.version,resourceId:r.calendar.key})),excluded:snapshot.excluded.map(r=>({key:r.assignment.key,assignmentVersion:r.assignment.version,planningVersion:r.planning.version,status:r.planning.value.status})),issues:snapshot.issues.map(r=>({key:r.key,reason:r.reason})),reviews:[]};
   for(const resourceId of resourceIds){
    const rows=snapshot.included.filter(r=>r.calendar.key===resourceId);
    if(!rows.length){
     const calendar=snapshot.calendars.find(c=>c.key===resourceId);
     const review=officePortfolioReceipt({resources:calendar?[calendar.value]:[],plans:[]});
     base.reviews.push({resourceId,status:'no-included-plans',capacityConfirmed:false,review});
     if(review.status==='undetermined'){base.complete=false;base.issues.push({key:resourceId,reason:'incomplete-resource-calendar'});}
     continue;
    }
    const plans=rows.map(({assignment,plan,calendar})=>({planId:assignment.key,resourceId,calendarRevision:calendar.value.calendarRevision,...plan.value}));
    try{const review=api.inspectBoundOfficePortfolio({resources:[rows[0].calendar.value],plans});base.reviews.push({resourceId,...review});if(review.review.status==='undetermined'){base.complete=false;base.issues.push({key:resourceId,reason:'incomplete-plan-inputs'});}}
    catch{base.complete=false;base.issues.push({key:resourceId,reason:'current-order-plan-binding-required'});}
   }
   return {...base,status:!base.complete?'undetermined':base.reviews.some(r=>r.review?.status==='conflict')?'conflict':snapshot.included.length?'consistent':'no-included-plans'};
  },
  registerOfficeResourceAssignment(planKey,planVersion,resourceId,calendarVersion,expectedVersion){
   if(isEnabled()!==false)throw Error('Explicit OFF required for local version registration');
   const review=api.inspectRegisteredOfficePortfolio({plans:[{key:planKey,version:planVersion,resourceId}],calendars:[{key:resourceId,version:calendarVersion}]});
   if(review.review.status!=='consistent')throw Error('Consistent explicit resource plan required');
   return officeVersions.put('assignment',planKey,expectedVersion,{plan:{kind:'plan',key:planKey,version:planVersion},calendar:{kind:'calendar',key:resourceId,version:calendarVersion}});
  },
  inspectAssignedOfficePortfolio(references){
   const refs=checkedJSON(references);
   if(!Array.isArray(refs)||!refs.length||refs.length>100||refs.some(r=>!r||Object.keys(r).some(k=>!['key','version'].includes(k))))throw Error('Only assignment references allowed');
   const rows=officeVersions.resolveAssignments(refs),resources=new Map();
   const plans=rows.map(({assignment,plan,calendar})=>{resources.set(calendar.key,calendar.value);return {planId:assignment.key,resourceId:calendar.key,calendarRevision:calendar.value.calendarRevision,...plan.value};});
   const result=api.inspectBoundOfficePortfolio({resources:[...resources.values()],plans});
   return {...result,schema:'office-assigned-portfolio-inspection-v1',persistedPlanVersionVerified:true,persistedCalendarVersionVerified:true,persistedResourceAssignmentVerified:true,customerConfirmed:false,versions:rows.map(({assignment,plan,calendar})=>({assignment:{key:assignment.key,version:assignment.version,digest:assignment.digest},plan:{key:plan.key,version:plan.version,digest:plan.digest},calendar:{key:calendar.key,version:calendar.version,digest:calendar.digest}}))};
  },
  registerOfficeServicePlan(key,sourceRevision,document,expectedVersion){
   if(isEnabled()!==false)throw Error('Explicit OFF required for local version registration');
   const inspected=api.inspectOfficeServicePlan(key,sourceRevision,document);
   if(inspected.review.missing.some(k=>['supported-office-plan','exact-candidate-binding','exact-profile-phases','exact-profile-capability'].includes(k)))throw Error('Exact Office plan binding required');
   return officeVersions.put('plan',digest(inspected.orderKey),expectedVersion,{orderKey:inspected.orderKey,sourceRevision,document:checkedJSON(document),planDigest:inspected.planDigest});
  },
  registerOfficeCalendar(document,expectedVersion){
   if(isEnabled()!==false)throw Error('Explicit OFF required for local version registration');
   const value=checkedJSON(document);
   if(Array.isArray(value?.windows)&&value.windows.some(w=>!calendarDeadline(w?.start)||!calendarDeadline(w?.end)))throw Error('Invalid calendar date or offset');
   if(!value||typeof value.resourceId!=='string'||typeof value.calendarRevision!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.calendarRevision)||value.bookingsComplete!==true||!Array.isArray(value.windows)||!value.windows.length||value.windows.length>1000||!Array.isArray(value.bookings)||value.bookings.length>1000)throw Error('Explicit calendar required');
   const windows=value.windows.map(w=>{const a=Date.parse(w?.start),z=Date.parse(w?.end);if(typeof w?.start!=='string'||typeof w?.end!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(w.start)||!/(Z|[+-]\d\d:\d\d)$/.test(w.end)||!Number.isFinite(a)||!Number.isFinite(z)||a>=z||!Number.isSafeInteger(w.capacityMinutes)||w.capacityMinutes<0||w.capacityMinutes>Math.floor((z-a)/60000))throw Error('Invalid calendar window');return {a,z};});
   const sorted=[...windows].sort((a,b)=>a.a-b.a);if(sorted.some((w,i)=>i&&w.a<sorted[i-1].z))throw Error('Overlapping calendar windows');
   const seen=new Set();for(const b of value.bookings){const w=windows[b?.windowIndex],a=Date.parse(b?.startedUtc),z=Date.parse(b?.finishedUtc);if(!b||typeof b.bookingId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(b.bookingId)||seen.has(b.bookingId)||!Number.isSafeInteger(b.windowIndex)||!w||!Number.isFinite(a)||!Number.isFinite(z)||new Date(a).toISOString()!==b.startedUtc||new Date(z).toISOString()!==b.finishedUtc||a>=z||(z-a)%60000||a<w.a||z>w.z)throw Error('Invalid calendar booking');seen.add(b.bookingId);}
   return officeVersions.put('calendar',value.resourceId,expectedVersion,value);
  },
  inspectRegisteredOfficePortfolio(document){
   const input=checkedJSON(document);
   if(!input||Object.keys(input).some(k=>k!=='plans'&&k!=='calendars')||!Array.isArray(input.plans)||!input.plans.length||input.plans.length>100||!Array.isArray(input.calendars)||!input.calendars.length||input.calendars.length>100)throw Error('Explicit registered portfolio required');
   for(const p of input.plans)if(!p||Object.keys(p).some(k=>!['key','version','resourceId'].includes(k)))throw Error('Only saved plan references allowed');
   for(const c of input.calendars)if(!c||Object.keys(c).some(k=>!['key','version'].includes(k)))throw Error('Only saved calendar references allowed');
   const rows=officeVersions.resolve([...input.plans.map(p=>({kind:'plan',key:p.key,version:p.version})),...input.calendars.map(c=>({kind:'calendar',key:c.key,version:c.version}))]);
   const resources=rows.filter(r=>r.kind==='calendar').map(r=>r.value);
   const plans=input.plans.map((p,i)=>{const saved=rows[i].value,calendar=resources.find(r=>r.resourceId===p.resourceId);if(!calendar)throw Error('Registered resource required');return {planId:p.key,resourceId:p.resourceId,calendarRevision:calendar.calendarRevision,...saved};});
   const result=api.inspectBoundOfficePortfolio({resources,plans});
   return {...result,schema:'office-registered-portfolio-inspection-v1',persistedPlanVersionVerified:true,persistedCalendarVersionVerified:true,persistedResourceAssignmentVerified:false,versions:rows.map(({kind,key,version,digest})=>({kind,key,version,digest})),customerConfirmed:false};
  },
  inspectBoundOfficePortfolio(document){
   const input=checkedJSON(document);
   if(!input||!Array.isArray(input.plans)||!input.plans.length||input.plans.length>100)throw Error('Explicit bounded Office plans required');
   const seen=new Set(),bindings=[],plans=[];
   for(const row of input.plans){
    if(!row||Object.keys(row).some(k=>!['planId','resourceId','calendarRevision','orderKey','sourceRevision','planDigest','document'].includes(k)))throw Error('Only bound plan inputs allowed');
    const key=row.orderKey;
    if(!key||!['sourceId','externalId','ownerId'].every(k=>typeof key[k]==='string'&&key[k].length>0))throw Error('Exact order identity required');
    const identity={sourceId:key.sourceId,externalId:key.externalId,ownerId:key.ownerId},hash=digest(identity);
    if(seen.has(hash))throw Error('Duplicate stored order');seen.add(hash);
    const inspected=api.inspectOfficeServicePlan(identity,row.sourceRevision,row.document);
    if(typeof row.planDigest!=='string'||row.planDigest!==inspected.planDigest)throw Error('Reviewed plan digest changed');
    const review=inspected.review;
    if(!review.phaseReceipt||review.missing.some(k=>['supported-office-plan','exact-candidate-binding','exact-profile-phases','exact-profile-capability'].includes(k)))throw Error('Exact Office plan binding required');
    const d=row.document;
    bindings.push({planId:row.planId,resourceId:row.resourceId,calendarRevision:row.calendarRevision,orderKey:identity,sourceRevision:row.sourceRevision,planDigest:inspected.planDigest,officeReview:review});
    plans.push({planId:row.planId,resourceId:row.resourceId,calendarRevision:row.calendarRevision,input:{phases:d.assessmentInput.plan.phases,deadline:d.commercialTerms?.deadline,timezone:d.commercialTerms?.timezone,schedule:d.assessmentInput.plan.capacitySchedule,phaseSchedule:d.assessmentInput.plan.phaseSchedule}});
   }
   return {schema:'office-bound-portfolio-inspection-v1',planningOnly:true,storedOrdersVerified:true,persistedPlanVersionVerified:false,workAuthorized:false,sendAuthorized:false,deliveryAuthorized:false,inputDigest:digest(input),bindings,review:officePortfolioReceipt({resources:input.resources,plans})};
  },
  inspectOfficePortfolio(document){
   const input=checkedJSON(document);
   return {schema:'office-portfolio-inspection-v1',planningOnly:true,storedOrdersVerified:false,inputDigest:digest(input),review:officePortfolioReceipt(input)};
  },
  inspectOfficeServicePlan(key,sourceRevision,document){
   const order=currentOrder({orderKey:key});
   if(!order||typeof sourceRevision!=='string'||!sourceRevision||order.sourceRevision!==sourceRevision)throw Error('Current stored order revision required');
   const plan=checkedJSON(document);
   return {schema:'office-plan-inspection-v1',sourceRevision,planDigest:digest(plan),orderKey:{sourceId:order.sourceId,externalId:order.externalId,ownerId:order.ownerId},review:executionEngine.inspectOfficeServicePlan(order,plan)};
  },
  async refreshRegistrations(ctx){const n=await executionEngine.refreshRegistrations({...ctx,store});if(confirmedPolicy.requireConfirmedFundedOrders)for(const order of store.snapshot().orders.filter(o=>['assigned','prepared','worked','verified'].includes(o.state))){try{await refreshConfirmed(order,ctx);}catch{active(ctx);}}if(execution.paymentAuthority)for(const order of store.snapshot().orders.filter(o=>o.paymentAuthorization&&['assigned','prepared','worked','verified'].includes(o.state))){active(ctx);const proof=await execution.paymentAuthority.refresh(order,{...ctx,rootTaskId:order.rootTaskId});store.renewPayment(order,order.sourceRevision,proof);}if(store.snapshot().orders.some(o=>['assigned','prepared','worked','verified'].includes(o.state)))await executionEngine.refreshReadiness(ctx,store.snapshot().orders);return n;},
  tick({assertActive,controller,budget}={}){
   if(!isEnabled())return {inserted:0,enqueued:0};const ctx={assertActive:assertActive??(()=>{})};active(ctx);let inserted=0;
   if(fs.existsSync(handoffDirectory)){if(fs.lstatSync(handoffDirectory).isSymbolicLink())throw Error('Symlink handoff directory');const sources=registry.snapshot().sources;let visited=0;for(const name of fs.readdirSync(handoffDirectory).filter(n=>/^handoff-[a-f0-9]{64}\.json$/.test(n)).sort()){
    if(store.hasHandoff(name))continue;active(ctx);const file=path.join(handoffDirectory,name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1000000){rejectedRounds++;continue;}const raw=fs.readFileSync(file,'utf8'),rejectionKey='rejected:'+name+':'+digest(raw);if(store.hasHandoff(rejectionKey))continue;if(++visited>50)break;
    try{const batch=JSON.parse(raw);if(batch.schema!=='numaron-monitor-observations-v1'||name!=='handoff-'+digest(batch.roundId)+'.json')throw Error('Invalid monitor envelope');const observations=batch.observations.map(o=>{if(o.digest!==observationDigest(o))throw Error('Invalid monitor digest');const alias=o.sourceId.startsWith('github')?'github':o.sourceId.startsWith('synmerco-')?'synmerco':o.sourceId.startsWith('dealwork-')?'dealwork':o.sourceId;const source=(alias==='opire'?sources.find(s=>s.aliases.includes('Opire')):null)??sources.find(s=>s.aliases.some(a=>a.toLowerCase()===alias.toLowerCase()));if(!source)throw Error('Unmapped monitor source');const mapped={...o,sourceId:source.id};return {...mapped,digest:observationDigest(mapped)};});const result=ingestMonitorObservations({store,observations,assertActive:()=>active(ctx)});inserted+=result.inserted;store.recordHandoff(name,digest(batch));}catch{active(ctx);store.recordHandoff(rejectionKey,digest(raw));rejectedRounds++;}
   }}
   let enqueued=0;if(controller&&budget){active(ctx);for(const order of store.snapshot().orders){const spent=(budget.entries??[]).filter(e=>e.taskId===order.rootTaskId).reduce((n,e)=>n+(e.actualCostRappen??e.maxCostRappen??0),0);const rootRemainingRappen=Math.min(budget.remainingRappen??250,budget.dayRemainingRappen??250,Math.max(0,(budget.taskRappen??250)-spent));enqueued+=adapterLearning.advance({controller,order,budget:{...budget,rootRemainingRappen},assertActive:()=>active(ctx)});enqueued+=advanceOrderActions({controller,orders:[order],registry,budget:{...budget,rootRemainingRappen},isEnabled,paymentAuthority:execution.paymentAuthority,...confirmedPolicy,actionCosts:Object.fromEntries(Object.entries(actionAdapters).map(([k,a])=>[k,a.maxCostRappen])),dependenciesForAction:(action,o)=>{if(action.kind!=='verify'||o.profileId!=='content-repurpose')return [];const p=executionEngine.readContentProduct(o);if(!p)return ['missing-content-product'];const work=controller.planningHistory().find(t=>t.kind==='source-work'&&t.status==='done'&&t.rootTaskId===o.rootTaskId&&t.input?.action?.sourceRevision===o.sourceRevision&&digest(t.input.action.orderKey)===digest(action.orderKey));if(!work)return ['missing-content-work'];const review=contentReviewTask(o,p,work.id);if(!controller.hasTask(review.id))controller.enqueue(review);return [review.id];}}).enqueued;}}return {inserted,enqueued};
  },
  status(){const s=registry.snapshot(),o=store.snapshot();return {sources:s.sources.length,mappings:s.mappings.length,observations:o.observations.length,orders:o.orders.length,historicalTasks:o.historicalTasks.length,rejectedRounds,selection:store.selection(),liveReady:false,confirmedFundedPolicy:{required:confirmedPolicy.requireConfirmedFundedOrders,configured:typeof confirmedPolicy.confirmedWorkAuthority?.refresh==='function',synthetic:confirmedPolicy.confirmedWorkAuthority?.status?.().synthetic??false},blockedSources:s.sources.filter(s=>s.capabilities.work.state!=='live-verified').length,execution:executionEngine.snapshot(),learning:adapterLearning.snapshot(),...(execution.productionStatus?{productionBindings:execution.productionStatus()}:{})};},
  selection(options){return store.selection(options);},
  // Which payment sources count as receipts is undecided: strict production reports no contribution until then.
  accounts(budget){return orderAccounts(store.snapshot().orders,budget,{receiptSourcesDecided:!confirmedPolicy.requireConfirmedFundedOrders});},
  close(){adapterLearning.close();executionEngine.close();store.close();registry.close();}
 };return api;
}
