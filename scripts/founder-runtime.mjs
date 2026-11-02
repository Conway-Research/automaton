import {readLicensedTask} from './founder-licensed-task.mjs';
import {founderStartupStatus} from './founder-startup-status.mjs';
import {createContentGenerator,createContentReviewer} from './founder-content-worker.mjs';
import {projectCertificateCurrency} from './founder-certificate-currency.mjs';
import {fingerprintSources} from './founder-certify-offline.mjs';
import {projectQualityBindings} from './founder-quality-bindings.mjs';
import {readLearningRecovery} from './founder-learning-recovery.mjs';
import {createLocalTaskFollowup} from './founder-task-followup.mjs';
import {loadUgigGroupBindings} from './founder-ugig-group-replies.mjs';
import {openFounderCommunication} from './founder-communication.mjs';
import {loadGmailReplyBindings} from './founder-gmail-order-replies.mjs';
import {createOrderProfileSandbox} from './founder-order-profile-sandbox.mjs';
import {createFounderCodeExecution} from './founder-code-execution.mjs';
import {createGithubBaseUsdcSource} from './founder-github-base-usdc.mjs';
import {createGithubPaymentReader} from './founder-github-payment-reader.mjs';
import {createCodeSandbox} from './founder-code-sandbox.mjs';
import {createProfileWorkGenerator,createAdapterDraftWorker} from './founder-profile-worker.mjs';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {openLearningStore} from '../src/research/store.ts';
import {buildLearningInputs} from '../src/research/curriculum.ts';
import {digest as learningDigest} from '../src/research/integrity.ts';
import {createFounderLearning} from './founder-learning.mjs';
import {createFreeLearningAdapters} from './founder-learning-adapters.mjs';
import {createSplitPrivateAdapters,appendPrivateLessons} from './founder-private-split.mjs';
import {researchGoalFor} from './founder-source-quality.mjs';
import {sourceRepairTask,resumableLegacySourceRepair} from './founder-source-repair.mjs';
import os from 'node:os';
import {createLocalAccessCache,readLocalCredential} from './founder-local-access.mjs';
import {founderMethods,pluginReadiness} from './founder-methods.mjs';
import fs from 'node:fs';import path from 'node:path';
import {createHash} from 'node:crypto';
import {openFounderBudget} from './founder-budget.mjs';
import {openFounderController} from './founder-controller.mjs';
import {recoverCapacityAdmission} from './founder-capacity-recovery.mjs';
import {refreshExecutionAccess} from './founder-execution-access.mjs';
import {createPlanningCheckpoint} from './founder-planning-checkpoint.mjs';
import {openFounderKnowledge,planFounderWork,admissibleResearchSources} from './founder-knowledge.mjs';
import {createFounderResearch} from './founder-research.mjs';
import {createFounderWorker} from './founder-worker.mjs';
import {readFounderReports} from './founder-operations.mjs';
import {createFounderFinanceAdapter} from './founder-finance.mjs';
import {createFounderConnectors} from './founder-connectors.mjs';
import {readSofaCredential} from './founder-sofa-key.mjs';
import {createFounderPlanner,validatePlan} from './founder-planner.mjs';
import {openFounderOrders} from './founder-orders.mjs';
import {loadOwnOrderRegistry} from './founder-order-registry.mjs';
import {createServiceReaders} from './founder-service-readers.mjs';
import {readServiceAccess} from './founder-service-access.mjs';
import {openFounderDelivery} from './founder-delivery.mjs';
import Database from 'better-sqlite3';
import {createGoogleAccessManager} from './founder-google-access.mjs';
import {autonomyStatus} from './founder-autonomy-status.mjs';
import {createOrderFlow} from './founder-order-flow.mjs';
import {createDealworkEscrow} from './founder-dealwork-escrow.mjs';
import {createDealworkCode} from './founder-dealwork-code.mjs';
import {openOrderPayment} from './founder-order-payment.mjs';
import {createProductionGithubFunding} from './founder-production-github-funding.mjs';
export function openFounderRuntime({base,directory=path.join(base,'artifacts/founder-autonomy-20261013'),apiKey,getApiKey,mission,stripeKeyFile,adapters:overrides,orderFlow:providedOrderFlow,githubFunding:providedGithubFunding,paymentAuthority:providedPaymentAuthority,postpaidSource,postpaidPaymentReader,communication:providedCommunication,dealworkEscrow:providedDealworkEscrow,dealworkCode:providedDealworkCode,activate=false,onError,isEnabled=()=>true,learningOptions=undefined,generalWebSearch=undefined,restorationAdapters=undefined,restorationOptions=undefined,capabilityProofs=[],capabilityRevocations=[],capabilityEvidenceStore=undefined,capabilityRevisionReader=undefined,requireCurrentQueueReview=false}){
 if(typeof requireCurrentQueueReview!=='boolean')throw Error('Explicit Boolean queue review policy required');
 fs.mkdirSync(directory,{recursive:true});
 const budget=openFounderBudget(path.join(directory,'budget.db')),knowledge=openFounderKnowledge(path.join(directory,'knowledge.db'));
 const orders=openFounderOrders(path.join(directory,'orders.db')),registry=loadOwnOrderRegistry(base);for(const r of registry)orders.register(r);
 const workflow=new Database(path.join(directory,'workflow.db'));workflow.pragma('journal_mode=WAL');workflow.exec('CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,payload TEXT NOT NULL,at INTEGER NOT NULL)');
 const googleAccess=overrides?null:createGoogleAccessManager({isActive:()=>isEnabled()&&controller.controlState().status==='running'});
 const localDirectory=path.join(process.env.LOCALAPPDATA??path.join(os.homedir(),'AppData/Local'),'Numaron');
 const amplitudeAccess=overrides?null:createLocalAccessCache({file:path.join(localDirectory,'amplitude-access.dpapi'),read:()=>readLocalCredential('service',{provider:'amplitude',directory:localDirectory})});
 const dealworkAccess=overrides||providedDealworkEscrow?null:createLocalAccessCache({file:path.join(os.homedir(),'AppData/Local/Obolus/DealworkCredentials/primary.dpapi'),read:()=>readLocalCredential('dealwork')});
 const delivery=openFounderDelivery({directory:path.join(directory,'deliveries'),access:()=>googleAccess?.current()??{available:false}});
 const readers=overrides?null:createServiceReaders({directory:path.join(directory,'services'),registry,access:kind=>kind==='amplitude-metrics'?amplitudeAccess.current():googleAccess.current()});
 const initial=!budget.snapshot().startAt;
 if(activate&&initial)budget.activate({startAt:Date.now(),authorizationRef:'patrice:2026-10-15:CHF150-30days:CHF20-day:CHF2.50-task'});
 const research=overrides?null:createFounderResearch({directory:path.join(directory,'research')});
 const connectors=overrides?null:createFounderConnectors({directory:path.join(directory,'connectors'),sofaKey:readSofaCredential(),firecrawlKeyless:true,generalWebSearch,reserveDiscoveryWindows:learningOptions?.enabled===true&&learningOptions.activationApproved===true});
 const executionSandbox=providedOrderFlow?.executionSandbox??providedDealworkCode?.executionSandbox??createOrderProfileSandbox({isEnabled});
 const githubFunding=providedGithubFunding??createProductionGithubFunding({isEnabled});
 const paymentAuthority=providedPaymentAuthority??openOrderPayment({file:path.join(directory,'payment-authority.db'),isEnabled,budgetSnapshot:()=>budget.snapshot(),escrow:githubFunding,postpaidSource:postpaidSource??null,paymentReader:postpaidPaymentReader??createGithubPaymentReader({isEnabled,source:createGithubBaseUsdcSource({isEnabled,readReference:(order,ctx)=>orderFlow.readBasePaymentReference(order,ctx)})})});
 const orderFlow=providedOrderFlow??(overrides?null:createOrderFlow({directory:path.join(directory,'code-orders'),funding:paymentAuthority,sandbox:executionSandbox,apiKey,getApiKey,mission,onSubmitted:r=>{
  const p=r.prepared,url=r.submission.url,externalId=url.slice('https://github.com/'.length),id='code-'+p.id;
  const provenance=`artifacts/founder-code-order-${p.id}/completion.json`,file=path.join(base,provenance);
  if(!fs.existsSync(file)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({owner:'tricebr',pullRequest:url,issue:p.url,submissionConfirmed:true,acceptanceConfirmed:false,paymentConfirmed:false},null,2),{flag:'wx'});}
  const registration={id,provider:'github',externalId,owner:'tricebr',provenance};orders.register(registration);if(!registry.some(x=>x.id===id))registry.push(registration);
  orders.ingest({provider:'github',externalId,revision:p.id,ownOrderId:id,kind:'delivery',observedAt:p.observedAt,payload:{url,submissionConfirmed:true,acceptanceConfirmed:false,paymentConfirmed:false}});
 }}));
 const communication=providedCommunication??(overrides?null:openFounderCommunication({file:path.join(directory,'communication.db'),isEnabled,requireCurrentSendReview:requireCurrentQueueReview,getUgigGroupBindings:()=>loadUgigGroupBindings(path.join(directory,'communication-platform-links.json')),googleAccess:()=>googleAccess.current(),getGmailBindings:()=>loadGmailReplyBindings(path.join(directory,'communication-mail-bindings.json'))}));
 const adapters=overrides?Object.fromEntries(Object.entries(overrides).map(([kind,a])=>[kind,Object.defineProperties({},Object.getOwnPropertyDescriptors(a))])):{
  research,...connectors.adapters,...readers.adapters,
  'work-planner':createFounderPlanner({apiKey,getApiKey,mission}),
  'private-analysis':createFounderWorker({apiKey,getApiKey,mission}),
  'private-draft':createFounderWorker({apiKey,getApiKey,mission,purpose:'deliverable'}),
  'drive-output':{get available(){const a=googleAccess.current();return a.available&&!!a.scope.folderId;},reason:'Eigener Google-Zugang und numaron-Ausgabeordner erforderlich.',maxCostRappen:0,retrySafe:true,reconcileSafe:true,async execute(ctx){const r=await delivery.publish(ctx.task.input.operationId,ctx);const {content,...metadata}=r;return {kind:'drive-output',privacy:'private',...metadata};},verify:r=>r?.remoteStatus==='verified'&&!!r.remoteId},
  'order-report':{maxCostRappen:0,retrySafe:true,autoRetrySafe:true,repairSafe:true,repairRevision:'monitor-interruption-schema-v1',repair({assertActive}){assertActive();return readFounderReports(base).orders;},verifyRepair:r=>['recent','partial','stale'].includes(r?.status),async execute({assertActive}){assertActive();return {kind:'order-report',observedAt:new Date().toISOString(),report:readFounderReports(base).orders};},verify:r=>['recent','partial','stale'].includes(r.report?.status)},
  'finance-report':createFounderFinanceAdapter({file:stripeKeyFile}),
  'code-execution':createFounderCodeExecution({sandbox:executionSandbox,isEnabled}),
  'external-communication':communication.adapter,
  'live-trading':{available:false,maxCostRappen:0,reason:'Kein Handelskapital oder Verlustlimit durch das Betriebsbudget zugeteilt.'}
 };
 if(!overrides)Object.assign(adapters,createSplitPrivateAdapters({apiKey,getApiKey,mission}));
 for(const kind of ['private-analysis','private-draft','private-part'])if(adapters[kind]){const original=adapters[kind].execute;adapters[kind].execute=async ctx=>{const k=knowledge.snapshot();const dependencies=ctx.dependencies.map(r=>({...r,sources:admissibleResearchSources(r.sources??[],k)}));if(!dependencies.some(r=>r.sources.length))throw Error('Fresh uncontradicted evidence unavailable');const lessons=k.filter(r=>r.id.startsWith('sofa-')&&!r.stale&&r.verification!=='contradicted').sort((a,b)=>b.observedAt-a.observedAt).slice(0,2).map(r=>({id:r.id,url:r.sources[0],claim:`Ungeprüfter technischer Lösungsansatz, kein Nachfragebeleg: ${r.claim}`,observedAt:new Date(r.observedAt).toISOString()}));return original({...ctx,dependencies:appendPrivateLessons(dependencies,lessons,ctx.task)});};}
 const dealworkEscrow=providedDealworkEscrow??(overrides?null:createDealworkEscrow({getAccess:()=>dealworkAccess.current()}));
 if(dealworkEscrow)adapters['dealwork-escrow']=dealworkEscrow.adapter;
 const dealworkCode=providedDealworkCode??(overrides?null:createDealworkCode({directory:path.join(directory,'dealwork-code'),sandbox:executionSandbox,provider:dealworkEscrow,apiKey,getApiKey,mission}));
 Object.assign(adapters,dealworkCode?.adapters??{});
 Object.assign(adapters,orderFlow?.adapters??{});
 if(!overrides&&adapters['firecrawl-research']){const execute=adapters['firecrawl-research'].execute;adapters['firecrawl-research'].execute=ctx=>execute({...ctx,task:{...ctx.task,input:{...ctx.task.input,researchGoal:researchGoalFor(ctx.task,controller.planningHistory())}}});}
 let learningEngine=null,learningStore=null;
 if(learningOptions?.enabled===true)adapters['adaptive-learning']={maxCostRappen:0,retrySafe:false,get available(){return !!learningEngine&&learningEngine.adapter.available;},get nextReadyAt(){return learningEngine?.adapter.nextReadyAt??0;},execute:ctx=>learningEngine.adapter.execute(ctx),verify:r=>learningEngine.adapter.verify(r)};
 if(learningOptions?.enabled===true&&learningOptions.historyTick)adapters['adaptive-history']={maxCostRappen:0,retrySafe:false,execute:ctx=>learningEngine.runHistory(ctx,learningOptions.historyTick),verify:r=>r?.kind==='adaptive-history'};
 const configuredRestoration=typeof restorationOptions==='function'?restorationOptions({base,directory,isEnabled,executionSandbox,orderFlow,dealworkCode,dealworkEscrow,delivery,paymentAuthority}):restorationOptions;
 const executionOptions={generateContent:createContentGenerator({apiKey,getApiKey,mission}),reviewContent:createContentReviewer({apiKey,getApiKey,mission}),generate:createProfileWorkGenerator({apiKey,getApiKey,mission}),...configuredRestoration,paymentAuthority,learning:{draft:createAdapterDraftWorker({apiKey,getApiKey,mission}),...configuredRestoration?.learning}};
 const orderRestoration=openOrderRestoration({base,directory:path.join(directory,'restoration'),isEnabled,actionAdapters:restorationAdapters,execution:executionOptions,historicalRegistrations:registry});
 Object.assign(adapters,orderRestoration.adapters);
 const controller=openFounderController({file:path.join(directory,'controller.db'),budget,adapters,queueReview:requireCurrentQueueReview?{isEnabled,holdExistingOnFirstUse:true,repeatBlockedTaskIds:['message-0aab1d446283aa243551ea2b790c3f88','message-180be518ec2f41897676137c67549e35','message-a44ad42435513e42a666b993726cdc27']}:null});
 const taskFollowup=createLocalTaskFollowup({file:path.join(directory,'firecrawl-followup.json'),controllerFile:path.join(directory,'controller.db'),isEnabled,readControl:()=>controller.controlState()});
 if(learningOptions?.enabled===true){
  learningStore=openLearningStore({directory:path.join(directory,'learning')});
  const getContext=(rootTaskId)=>{const s=controller.snapshot(),b=s.budget;const accounting=budget.learningAccounting(rootTaskId),spent=accounting.spentRappen;return {now:Date.now(),powerEnabled:isEnabled()===true,controllerRunning:s.status==='running',budgetActive:b.active&&accounting.complete===true,availableSlots:Math.max(0,s.maxWorkers-s.activeWorkers),budgetRemainingRappen:b.remainingRappen,dayRemainingRappen:b.dayRemainingRappen,rootRemainingRappen:Math.max(0,b.taskRappen-spent),limitsDigest:learningDigest({period:b.periodRappen,day:b.dailyRappen,task:b.taskRappen,workers:s.maxWorkers}),policyDigest:learningDigest({version:'adaptive-learning-v1',permissions:Object.keys(adapters)}),goalId:'mission-'+learningDigest(mission?.digest??'existing-founder-mission'),goalVersion:1,activationApproved:learningOptions.activationApproved===true,permissions:s.capabilities.filter(c=>c.status!=='blocked').map(c=>c.kind)};};
  const freeAdapters=learningOptions.adapters??createFreeLearningAdapters({research:connectors?.discovery,getContext,benchmarks:learningOptions.benchmarks,getWorkloadTaskIds:()=>controller.planningHistory()});
  if(learningOptions.admitMarketSource)freeAdapters.admitMarketSource=learningOptions.admitMarketSource;
  learningEngine=createFounderLearning({store:learningStore,controller,budget,adapters:freeAdapters,getContext,getInputs:()=>{const inputs=buildLearningInputs({missionDigest:mission?.digest??'existing-founder-mission',now:Date.now(),researchCapability:'adaptive-learning',capabilities:controller.snapshot().capabilities,opportunities:learningStore.snapshot().events.filter(e=>e.kind==='opportunity').map(e=>e.detail),tasks:controller.planningHistory(),knowledge:knowledge.snapshot(),history:learningOptions.historySnapshot?.()});return {...inputs,observations:[...inputs.observations,...readLearningRecovery({base,snapshot:learningStore.snapshot(),history:controller.planningHistory(),getContext,digest:learningDigest}),...readLicensedTask({base,store:learningStore,history:controller.planningHistory(),getContext,digest:learningDigest})]};}});
  // Recipe hints remain subordinate data. Independent application verifiers are registered code, never model output.
  for(const [kind,adapter] of Object.entries(adapters)){if(kind==='adaptive-learning'||!adapter.execute)continue;const verify=adapter.verify;if(verify)adapter.verify=result=>verify.call(adapter,result)&&result?.learningQuality?.passed!==false;const original=adapter.execute;adapter.execute=async ctx=>{const task=learningEngine.decorateTask(ctx.task);const result=learningEngine.applyResult(task,await original.call(adapter,{...ctx,task}));learningEngine.observeTaskResult?.(task,result,ctx.grant);return result;};}
 }

 if(activate&&initial&&isEnabled())controller.control('start');
 let current=null,closed=false,timer,error=null;
 const capabilityEvidence=(s=controller.snapshot(),now=Date.now())=>{
  let stored={certificates:[],revocations:[]};
  try{if(capabilityEvidenceStore){stored=capabilityEvidenceStore.snapshot();if(!Array.isArray(stored.certificates)||!Array.isArray(stored.revocations)||stored.certificates.length>2048||stored.revocations.length>2048)throw Error('Invalid store');}}
  catch{return {schemaVersion:1,observedAt:new Date(now).toISOString(),entries:[],certificates:[],diagnostics:['evidence-store-unavailable']};}
  const projection=projectCapabilityEvidence({
  capabilities:s.capabilities.map(c=>({...c,implemented:adapters[c.kind]?.evidenceImplemented??(typeof adapters[c.kind]?.execute==='function'),
   revision:adapters[c.kind]?.evidenceRevision,sourceIds:adapters[c.kind]?.sourceIds})),
  sources:orderRestoration.registry.snapshot(now).sources,proofs:capabilityProofs,revocations:Array.isArray(capabilityRevocations)?[...capabilityRevocations,...stored.revocations]:capabilityRevocations,
  now,powerEnabled:isEnabled()===true,controllerRunning:s.status==='running',budgetActive:s.budget.active===true
  });
  try{
   const bindings=stored.qualityBindings??[];
   let currentRevision;
   if(bindings.length||stored.certificates.length)try{currentRevision=capabilityRevisionReader?capabilityRevisionReader():fingerprintSources(base).revision;}catch{projection.diagnostics.push('source-revision-unavailable');}
   const qualityBindings=projectQualityBindings({bindings,certificates:stored.certificates,entries:projection.entries.map(e=>({...e,qualityProfiles:adapters[e.capabilityId]?.qualityProfilesForSource?.(e.sourceId)??adapters[e.capabilityId]?.qualityProfiles})),currentRevision,now});
   return {...projection,certificates:projectCertificateCurrency(stored.certificates,currentRevision),qualityBindings};
  }catch{return {schemaVersion:1,observedAt:new Date(now).toISOString(),entries:[],certificates:[],qualityBindings:[],diagnostics:['quality-evidence-unavailable']};}
 };
 const snapshot=()=>{const s=controller.snapshot();const cs=connectors?.status()??[];const plugins=pluginReadiness.map(p=>{const serviceKind={GitHub:'github-orders',Amplitude:'amplitude-metrics'}[p.name];const service=serviceKind?readers?.status().find(r=>r.kind===serviceKind):null;const drive=p.name==='Google Drive'?s.capabilities.find(c=>c.kind==='drive-output'):null;if(service)return {...p,runtimeConnected:service.available&&service.last?.status==='succeeded',runtimeStatus:!service.available?'Dienstzugang fehlt':service.last?.status==='succeeded'?'Letzter eigener Dienstabruf erfolgreich.':'Letzter eigener Dienstabruf nicht erfolgreich.',lastCheckedAt:service.last?new Date(service.last.at).toISOString():null};if(drive)return {...p,runtimeConnected:drive.status!=='blocked'&&!!drive.lastSuccessAt,runtimeStatus:drive.status==='blocked'?drive.reason:drive.lastSuccessAt?'Private Drive-Ablage durch Lauf belegt.':'Drive eingerichtet; erfolgreicher Lauf noch offen.',lastCheckedAt:drive.lastOutcome?new Date(drive.lastOutcome.at).toISOString():null};const c=cs.find(c=>c.kind===`${p.name.toLowerCase()}-research`);return c?{...p,runtimeConnected:c.available&&c.last?.status==='succeeded',runtimeStatus:!c.available?c.reason:c.last?.status==='succeeded'?'Direkter Dienstaufruf erfolgreich; kostenloser Lesezugang.':c.last?'Letzter direkter Versuch nicht erfolgreich.':'Direkter Adapter eingerichtet; erfolgreicher Lauf noch offen.',lastCheckedAt:c.last?new Date(c.last.at).toISOString():null}:p;});return {...s,capabilityEvidence:capabilityEvidence(s),taskFollowup:taskFollowup.snapshot(),repairs:controller.repairStatus(),communication:communication?.status()??null,orderRestoration:orderRestoration.status(),orderAccounts:orderRestoration.accounts(s.budget),autonomyContract:autonomyStatus(s),methods:founderMethods.map(({guidance,...m})=>m),plugins,knowledge:knowledge.snapshot(),schedulerError:error,scope:'Autonome öffentliche Recherche, private Analyse und lesende Bestandsberichte. Keine verbindliche Auftragsannahme.',capabilities:s.capabilities.map(c=>({...c,status:c.status==='blocked'?'blocked':c.lastSuccessAt?'verified':'configured'}))};};
 const api={budgetSnapshot:()=>budget.snapshot(),startupSnapshot:()=>founderStartupStatus({budget,productionStatus:executionOptions.productionStatus}),capabilityEvidence:()=>capabilityEvidence(),communicationStatus:()=>communication?.status()??null,learningSnapshot:()=>learningEngine?.snapshot()??null,controlState:()=>controller.controlState(),snapshot:()=>({...snapshot(),githubFunding:githubFunding.status(),paymentAuthority:paymentAuthority.snapshot(),codeOrders:orderFlow?.status()??null,dealworkCodeOrders:dealworkCode?.status()??null,services:readers?.status()??[],orders:orders.snapshot(),deliveries:delivery.snapshot(),decisions:workflow.prepare('SELECT id,payload,at FROM decisions ORDER BY at DESC LIMIT 30').all().map(r=>({...r,decision:JSON.parse(r.payload),payload:undefined})),googleBillingAllowed:false}),result:id=>controller.result(id),
  async readOrderFunding({provider,terms},ctx={}){const assertActive=()=>{if(!isEnabled()||controller.snapshot().status!=='running')throw Error('Numaron is OFF or not running');ctx.assertActive?.();};assertActive();if(provider!=='dealwork'||!dealworkEscrow)throw Error('Funding provider unavailable');return dealworkEscrow.requireFunding(terms,{...ctx,assertActive});},
  checkLocalReadiness:()=>isEnabled()&&controller.controlState().status==='running'?orderFlow?.probeIsolation?.():false,
  queueReviewStatus:()=>controller.queueReviewStatus(),
  holdQueueForReview:input=>{controller.holdQueueForReview(input);return snapshot();},
  archive:input=>controller.archive(input),
  recordSightInspection:input=>controller.recordSightInspection(input),
  retry(input){if(!input||Object.keys(input).sort().join(',')!=='id,updatedMs')throw Error('Invalid retry');controller.retry(input.id,input.updatedMs);return snapshot();},
  control(input){if(!input||Object.keys(input).sort().join(',')!=='action,revision'||!Number.isSafeInteger(input.revision))throw Error('Invalid control');controller.control(input.action,input.revision);return snapshot();},
  async cycle(){
   if(closed||!isEnabled())return;if(current)return current;
   current=(async()=>{
    const planningCheckpoint=createPlanningCheckpoint({isActive:()=>!closed&&isEnabled()&&controller.controlState().status==='running'});
    let s=controller.snapshot();if(s.status!=='running'||!s.budget.active)return;
    const historicalQueueHeld=requireCurrentQueueReview&&controller.queueReviewStatus().heldTaskCount>0;
    taskFollowup.tick();
    // Held historical work cannot authorize provider-reading registration or assignment hooks.
    if(!historicalQueueHeld){
    await orderRestoration.refreshRegistrations({assertActive:()=>{if(!isEnabled()||controller.controlState().status!=='running')throw Error('OFF');}});
    orderRestoration.tick({assertActive:()=>{if(!isEnabled()||controller.controlState().status!=='running')throw Error('OFF');},controller,budget:s.budget});
    }
    communication?.advance(controller,[]);
    await Promise.all([googleAccess?.refresh(),amplitudeAccess?.refresh(),dealworkAccess?.refresh()]);if(!isEnabled()||controller.controlState().status!=='running')return;s=controller.snapshot();s.tasks=controller.planningHistory();
    for(const task of planFounderWork({completed:s.tasks.map(t=>t.id),capabilities:s.capabilities,observations:s.tasks,budget:s.budget,knowledge:knowledge.snapshot()}))if(!controller.hasTask(task.id))controller.enqueue(task);
    const known=new Set(knowledge.snapshot().map(k=>k.id));
    if(!overrides&&adapters['exa-research']?.retrySafe===true)for(const t of s.tasks.filter(t=>t.kind==='exa-research'&&t.status==='failed'&&t.input?.sourceRepair)){const row=snapshot().tasks.find(r=>r.id===t.id);if(row&&resumableLegacySourceRepair(row,budget.receipt(row.run_id)))controller.retry(row.id,row.updated_ms);}
    for(const task of [...s.tasks]){if(!await planningCheckpoint())return;const repair=sourceRepairTask(task,s.tasks,id=>controller.result(id));if(repair&&adapters['exa-research']?.available!==false&&adapters['exa-research']){controller.enqueue(repair);s.tasks.push({...repair,status:'queued'});}}
    for(const t of s.tasks.filter(t=>t.status==='done'&&['research','exa-research','firecrawl-research','sofa-research','github-orders','adaptive-learning'].includes(t.kind))){if(!await planningCheckpoint())return;
     const r=controller.result(t.id);
     communication?.advance(controller,[{...r,id:t.id,rootTaskId:t.rootTaskId}]);
     for(const source of r.sources??[]){const observedAt=Date.parse(source.observedAt);if(known.has(source.id)||!Number.isFinite(observedAt)||observedAt>Date.now()+1000)continue;knowledge.record({id:source.id,claim:String(source.claim).slice(0,5000),sources:[source.url],observedAt,expiresAt:observedAt+7*86400000,verification:'reported'});known.add(source.id);}
     if(t.kind==='exa-research'){const id=`firecrawl-${t.id}`;if(adapters['firecrawl-research']&&adapters['firecrawl-research'].available!==false&&!controller.hasTask(id))controller.enqueue({id,rootTaskId:t.rootTaskId,kind:'firecrawl-research',input:{...(t.input?.sourceRepair?{sourceRepair:t.input.sourceRepair}:{}),researchGoal:t.input?.researchGoal??t.input?.title??'',title:'Eine gefundene öffentliche Quelle vertiefen'},dependencies:[t.id],resources:['firecrawl']});continue;}
     if(t.kind==='sofa-research'||!r.sources?.length)continue;
     const fingerprint=createHash('sha256').update((r.researchGoal?String(r.researchGoal)+'\n':'')+JSON.stringify(r.sources.map(x=>[x.id,x.digest??x.claim]).sort())).digest('hex').slice(0,32),id=`analysis-${fingerprint}`;
     if(adapters['work-planner']?.available!==false&&adapters['work-planner']){const pid=`plan-${fingerprint}`;if(!controller.hasTask(pid))controller.enqueue({id:pid,rootTaskId:t.rootTaskId,kind:'work-planner',input:{researchGoal:r.researchGoal??'',title:'Gemäß Genesis nächste sinnvolle Arbeit auswählen oder begründet warten'},dependencies:[t.id],resources:['planner']});continue;}
     if(adapters['private-analysis']&&adapters['private-analysis'].available!==false&&admissibleResearchSources(r.sources??[],knowledge.snapshot()).length&&!controller.hasTask(id))controller.enqueue({id,rootTaskId:t.rootTaskId,kind:'private-analysis',input:{title:'Aus öffentlichen Quellen eine konkrete Arbeitschance auswählen und ihre Grenzen erklären'},dependencies:[t.id],resources:[]});
    }
    for(const t of s.tasks.filter(t=>t.status==='done'&&t.kind==='private-analysis'&&!adapters['work-planner'])){if(!await planningCheckpoint())return;
     const id=`draft-${t.id}`;if(adapters['private-draft']&&adapters['private-draft'].available!==false&&!controller.hasTask(id))controller.enqueue({id,rootTaskId:t.rootTaskId,kind:'private-draft',input:{title:'Aus der ausgewählten Chance eine nutzbare private Arbeitsvorlage erstellen'},dependencies:[t.id],resources:[]});
    }
    for(const t of s.tasks.filter(t=>t.status==='done')){if(!await planningCheckpoint())return;
     if(workflow.prepare('SELECT 1 FROM decisions WHERE id=?').get(t.id))continue;const r=controller.result(t.id);
     if(['github-orders','gmail-orders','calendar-deadlines'].includes(t.kind))for(const e of r.evidence??[])orders.ingest(e);
     let decision={kind:t.kind,handled:true};
     if(t.kind==='work-planner'){
      const rootSpent=s.budget.entries.filter(e=>e.taskId===t.rootTaskId).reduce((n,e)=>n+(e.actualCostRappen??e.maxCostRappen),0);
      decision=validatePlan({candidates:r.analysis?.candidates,capabilities:s.capabilities,evidence:r.sources??[],budget:{...s.budget,remainingRappen:Math.min(s.budget.remainingRappen,Math.max(0,s.budget.taskRappen-rootSpent))}});
      decision.reason=String(r.analysis?.summary??'Keine zulässige wirtschaftlich begründete Folgearbeit.').slice(0,1000);decision.nextReviewAt=new Date(Date.now()+21600000).toISOString();
      if(!decision.accepted.length&&s.tasks.filter(x=>x.rootTaskId===t.rootTaskId&&x.kind==='work-planner').length<4){
       const id='wait-review-'+createHash('sha256').update(t.id).digest('hex').slice(0,32);
       if(!controller.hasTask(id))controller.enqueue({id,rootTaskId:t.rootTaskId,kind:'work-planner',input:{title:'Gespeicherte Warteentscheidung und verfügbare Belege erneut bewerten',notBefore:Date.parse(decision.nextReviewAt)},dependencies:[t.id],resources:['planner']});
      }
      for(const c of decision.accepted){const id=`selected-${c.fingerprint}`;if(!controller.hasTask(id))controller.enqueue({id,rootTaskId:t.rootTaskId,kind:c.kind,input:{title:c.title,expectedBenefit:c.expectedBenefit,uncertainty:c.uncertainty,nextReviewAt:c.nextReviewAt,notBefore:c.kind.endsWith('-research')?Math.max(Date.parse(c.nextReviewAt),Math.ceil(Date.now()/21600000)*21600000):0},dependencies:[t.id],resources:c.kind.startsWith('private-')?[]:[c.kind]});}
     }
     if(t.kind==='private-draft'&&r.analysis?.deliverableMarkdown){
      const markdown=r.analysis.deliverableMarkdown,rows=[['Quelle','URL','Prüfstatus'],...(r.sources??[]).map(source=>[String(source.id),String(source.url),'Quellenbehauptung; keine Abnahme oder Zahlung bestätigt'])];
      decision.deliveries=['markdown','document','spreadsheet'].map(format=>{const content=format==='spreadsheet'?JSON.stringify(rows):markdown;return delivery.prepare({resultId:t.id,digest:createHash('sha256').update(content).digest('hex'),content,format,checks:{schema:true,sourceIds:r.analysis.sourceIds,independentFactualVerification:false}}).operationId;});
     }
     if(['private-analysis','private-draft'].includes(t.kind)&&adapters['work-planner']?.available!==false&&adapters['work-planner']){
      const depth=s.tasks.filter(x=>x.rootTaskId===t.rootTaskId&&x.kind==='work-planner').length,id=`replan-${createHash('sha256').update(t.id).digest('hex').slice(0,32)}`;
      if(depth<4&&!controller.hasTask(id))controller.enqueue({id,rootTaskId:t.rootTaskId,kind:'work-planner',input:{title:'Ergebnis und verbleibende Wissenslücken prüfen; nächste nützliche Arbeit oder Warten wählen'},dependencies:[t.id],resources:['planner']});
     }
     workflow.prepare('INSERT INTO decisions VALUES(?,?,?)').run(t.id,JSON.stringify(decision),Date.now());
    }
    if(adapters['drive-output']?.available)for(const d of delivery.snapshot().filter(d=>d.remoteStatus!=='verified')){
     const id=`upload-${d.operationId}`;if(!controller.hasTask(id))controller.enqueue({id,rootTaskId:s.tasks.find(t=>t.id===d.resultId)?.rootTaskId??d.resultId,kind:'drive-output',input:{title:'Geprüfte private Ergebnisversion im numaron-Ordner ablegen',operationId:d.operationId},dependencies:[d.resultId],resources:['drive-output']});
    }
    if(!isEnabled())return;await orderFlow?.refresh({isEnabled});if(!isEnabled())return;orderFlow?.advance(controller);
    if(!isEnabled())return;await dealworkCode?.refresh({isEnabled});if(!isEnabled())return;dealworkCode?.advance(controller);
    if(!isEnabled())return;await learningEngine?.tick();if(learningEngine&&learningOptions.historyTick){const at=Math.floor(Date.now()/900000),id='adaptive-history-'+at;if(!controller.hasTask(id)&&!controller.planningHistory().some(t=>t.kind==='adaptive-history'&&['queued','running','verifying'].includes(t.status)))controller.enqueue({id,rootTaskId:'adaptive-history',kind:'adaptive-history',input:{title:'Geeignete Marktdaten und vorregistrierte Strategietests pr�fen'},dependencies:[],resources:['research-cpu']});}if(!isEnabled())return;if(!overrides)controller.preparePrivateSplits();if(!await refreshExecutionAccess({isActive:()=>isEnabled()&&controller.controlState().status==='running',caches:[amplitudeAccess,dealworkAccess]}))return;await controller.tick();error=null;
   })().catch(async e=>{if(overrides)onError?.(e);try{if(await recoverCapacityAdmission(e,{controller,isEnabled,beforeTick:()=>refreshExecutionAccess({isActive:()=>isEnabled()&&controller.controlState().status==='running',caches:[amplitudeAccess,dealworkAccess]})})){error='Aufgabenablage voll: Vorhandene Aufgaben werden weiterbearbeitet; neue Aufnahme wartet auf nachweiserhaltende Archivierung.';return;}}catch{error='Aufgabenablage voll; Bearbeitung vorhandener Aufgaben konnte nicht bestätigt werden.';return;}error='Arbeitsplanung fehlgeschlagen. Gespeicherte Ergebnisse bleiben erhalten.';}).finally(()=>{current=null;});return current;
  },
  startLoop(){if(timer||closed)return;void api.cycle();timer=setInterval(()=>void api.cycle(),10000);},
  async close(){if(closed)return;closed=true;clearInterval(timer);await controller.close();await current;learningEngine?.close();learningStore?.close();research?.close();connectors?.close();readers?.close();orderFlow?.close();dealworkCode?.close();orderRestoration.close();if(!providedCommunication)communication?.close();if(!providedPaymentAuthority)paymentAuthority.close();delivery.close();orders.close();workflow.close();knowledge.close();budget.close();}
 };return api;
}

import {projectCapabilityEvidence} from './founder-capability-evidence.mjs';
