import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { renewCapitalQuote } from "../revenue/capital-budget.js";
import { attributeCommerceObservation, syncCommerceHolds } from "../commerce/attribution.js";
import { fileURLToPath } from "node:url";
import { openSimulation, seedDemo, paperDemo, runToIdle } from "./simulation.js";
import { startDashboard } from "./dashboard.js";
import { soakSimulation, benchmarkSimulation } from "./verification.js";
import { DEFAULT_SETTINGS } from "./runtime.js";
import { reviewCosts } from "./cost-review.js";
import { readBounded } from "./offline-input.js";
import { openOnline } from "../online/workspace.js";
import { startOnlineDashboard } from "../online/dashboard.js";
import { researchStrategies, strategyCatalogue } from "../revenue/strategy-research.js";
import {advancedPaper} from '../revenue/advanced-paper.js';
import { marketDataDigest } from "../revenue/strategy-series.js";
import { openStrategySeries } from "./strategy-series.js";
import { PaperPortfolio } from "../revenue/paper-portfolio.js";
import { openCommerce } from "../commerce/workspace.js";
import { startStripeWebhook } from "../commerce/webhook-server.js";
import { DigitalDelivery } from "../commerce/delivery.js";
import { startStorefront } from "../commerce/storefront.js";
import { startCommerceHoldSync } from "../commerce/hold-sync.js";
import { livePreflight } from "./live-preflight.js";
import {rehearseSetup} from './setup-rehearsal.js';
import {initializeSalesControl,salesPaused,setSalesPaused} from '../commerce/sales-control.js';
import {verifyPersonalCycle} from './personal-verification.js';
import {benchmarkPersonalFocus} from './personal-benchmark.js';
import {reconcileOperation} from '../revenue/operation-reconciliation.js';
import {recordReconciledPayout} from '../revenue/payout-reconciliation.js';
import {reconcileProviderCheckedPayout} from '../commerce/payout-verification.js';
import {planResearchExperiment,handoffResearchTask} from '../revenue/research-handoff.js';
import {cancelReviewedDispatch} from '../orchestration/research-dispatch.js';
import {grantAdapterPermission,revokeAdapterPermission} from '../revenue/adapter-permissions.js';
import {registerActionReview,evaluateActionGate,revokeActionReview,containSecurityIncident} from '../security/action-gate.js';
import {eraseSupportCase,configureSupportRetention,expireSupportCases} from '../commerce/support-privacy.js';
import {registerExperimentProduct,reconcileLocalProduct} from '../commerce/product-adapter.js';
import {registerOutcomeContract,recordCustomerEvidence,assessExperimentOutcome} from '../revenue/outcome.js';
import {configureSupportOutbox,pauseSupportOutbox,queueSupportReply,sendNextSupportReply,reconcileSupportReply,cancelSupportReply} from '../commerce/support-outbox.js';
import {closeSupportReview} from '../commerce/support-inbox.js';
import {queueSupportFollowup} from '../commerce/support-followups.js';
import {supportCaseReview} from '../commerce/support-review.js';
import {GmailSupportClient} from '../commerce/gmail-support.js';
import {createGmailTokenProvider} from '../commerce/gmail-credentials.js';
import {pollSupportInbox,startSupportPolling,supportPollStatus,resetSupportPollCursor,excludeSupportImport} from '../commerce/support-poll.js';
import {publishSupportAnswer,revokeSupportAnswer,replaceSupportAnswer} from '../commerce/support-knowledge.js';
import {reviewEconomicContradiction} from '../revenue/research-assumptions.js';
import {prepareValidationPilot} from '../revenue/validation-pilot.js';
import {compareOptimization} from '../revenue/optimization-comparison.js';
import {inspectResearchIntegrity} from '../revenue/research-integrity.js';
import {inspectSkillInstallations} from '../skills/install-inspection.js';
import {economicState} from '../revenue/economic-state.js';
import {evaluateArbitrage} from '../revenue/arbitrage.js';
import {planCapitalAllocation} from '../revenue/capital-allocation.js';
import {OpportunityProfiles} from '../revenue/opportunity-profile.js';
import {inspectTradingControl,planPositionExit} from '../revenue/trading-control.js';
import {createRuntimeBundle} from '../replication/runtime-bundle.js';

export async function main(args = process.argv.slice(2)): Promise<void> {
  const command = args[0] ?? "dashboard";
  const option = (name: string) => { const index = args.indexOf(name); if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${name}`); return args[index + 1]; };
  const publish = (report: unknown) => {
    const text = JSON.stringify(report, null, 2); const output = option("--output");
    if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, text + "\n", { flag: "wx" }); }
    process.stdout.write(text + "\n");
  };
  if(['security-review','security-status','security-revoke','security-contain','support-erase','support-retention'].includes(command)){
    const file=option('--database'),input=option('--input'),readOnly=command==='security-status';
    if(!file||command!=='security-contain'&&!input||!readOnly&&!args.includes('--apply')||readOnly&&args.includes('--apply'))
      throw Error('Use existing --database, reviewed --input JSON, and --apply for mutations; security-status is read-only');
    const data=input?JSON.parse(readBounded(input,100000).toString('utf8')):null;
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:readOnly,timeout:1000});
    try{
      if(command==='security-status')publish(evaluateActionGate(db,data));
      else if(command==='support-erase')publish(eraseSupportCase(db,data.inboxId));
      else if(command==='support-retention'){configureSupportRetention(db,data.days);publish(expireSupportCases(db));}
      else{
        if(command==='security-review')registerActionReview(db,data);
        else if(command==='security-revoke')revokeActionReview(db,data);
        else containSecurityIncident(db);
        publish({applied:true,command,startsExecution:false,legalConclusion:false,liveAccepted:false});
      }
    }finally{db.close();}return;
  }
  if(command==='trading-status'){
    const file=option('--database');
    if(!file||args.includes('--apply'))throw new Error('Use trading-status --database existing.db [--output new-report.json]; read-only');
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:true,timeout:1000});
    try{publish(inspectTradingControl(db));}finally{db.close();}return;
  }
  if(command==='trading-exit-plan'){
    const file=option('--database'),input=option('--input');
    if(!file||!input||args.includes('--apply'))throw new Error('Use trading-exit-plan --database existing.db --input quote.json; planning only');
    const data=JSON.parse(readBounded(input,8192).toString('utf8'));
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:true,timeout:1000});
    try{publish(planPositionExit(db,data.clientOrderId,data.quote));}finally{db.close();}return;
  }
  if(command==='runtime-bundle'){
    const root=option('--source'),output=option('--output');
    if(!root||!output||args.includes('--apply'))throw new Error('Use runtime-bundle --source reviewed-project --output new-bundle.json; local export only');
    const bundle=createRuntimeBundle(path.resolve(root));
    fs.writeFileSync(path.resolve(output),JSON.stringify(bundle),{flag:'wx',mode:0o600});
    process.stdout.write(JSON.stringify({files:bundle.files.length,sha256:bundle.sha256,published:false})+'\n');return;
  }
  if(command==='skill-install-status'){
    const directory=option('--skills-dir');
    if(!directory||args.includes('--apply'))throw new Error('Use skill-install-status --skills-dir existing-directory [--output new-report.json]; read-only inspection');
    publish(inspectSkillInstallations(directory));return;
  }
  if(command==='economic-state'){
    const file=option('--database');
    if(!file||args.includes('--apply'))throw new Error('Use economic-state --database existing.db [--output new-report.json]; read-only');
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:true,timeout:1000});
    try{publish(economicState(db));}finally{db.close();}
    return;
  }
  if(command==='profitability'){
    const file=option('--database'),opportunity=option('--opportunity');
    if(!file||!opportunity||args.includes('--apply'))throw new Error('Use profitability --database existing.db --opportunity ID; read-only');
    const {profitabilitySnapshot}=await import('../revenue/profitability.js');
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:true,timeout:1000});
    try{publish(profitabilitySnapshot(db,opportunity));}finally{db.close();}return;
  }
  if(command==='profitability-policy'||command==='profitability-revalidation'||command==='profitability-scaling-review'||command==='profitability-strategy'||command==='live-settlement-account'){
    const file=option('--database'),inputFile=option('--input');
    if(!file||!inputFile)throw new Error('Use an existing --database and reviewed --input JSON; explicit --apply is required to register');
    const input=JSON.parse(readBounded(inputFile,32768).toString('utf8'));
    if(!args.includes('--apply')){publish({command,applied:false,executionAuthorized:false,requirement:'Review the policy and use --apply to register immutable limits; no agent or economic cycle is started.'});return;}
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:1000});
    try{
      if(command==='profitability-policy'){
        const {registerProfitabilityPolicy}=await import('../revenue/profitability.js');registerProfitabilityPolicy(db,input);
      }else if(command==='profitability-scaling-review'){
        const {registerScalingReview}=await import('../revenue/profitability.js');registerScalingReview(db,input);
      }else if(command==='profitability-strategy'){
        const {registerStrategyEconomics}=await import('../revenue/profitability.js');registerStrategyEconomics(db,input.strategyId,input.opportunityId);
      }else if(command==='live-settlement-account'){
        const {registerLiveSettlementAccount}=await import('../revenue/live-settlement.js');registerLiveSettlementAccount(db,input.venueId,input.accountRef);
      }else{
        const {registerRevalidationAllowance}=await import('../revenue/revalidation.js');registerRevalidationAllowance(db,input);
      }
      publish({command,applied:true,executionAuthorized:false});
    }finally{db.close();}return;
  }
  if(command==='arbitrage-evaluate'){
    const input=option('--input');if(!input||args.includes('--apply'))throw new Error('Use arbitrage-evaluate --input candidate.json; evaluation only');
    const data=JSON.parse(readBounded(input,32768).toString('utf8'));
    publish(evaluateArbitrage(data.candidate,data.limits,data.now??Date.now()));return;
  }
  if(command==='arbitrage-paper-configure'){
    const input=option('--input'),file=option('--database');
    if(!input||!file||!args.includes('--apply'))throw new Error('Use arbitrage-paper-configure --database existing.db --input reviewed.json --apply; paper only');
    const data=JSON.parse(readBounded(input,32768).toString('utf8'));
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:1000});
    try{const {ArbitragePaperEngine}=await import('../revenue/arbitrage.js');new ArbitragePaperEngine(db).configureRuntime(data.limits,data.policy);
      publish({command,applied:true,mode:'paper',liveExecutionAuthorized:false});
    }finally{db.close();}return;
  }
  if(command==='child-funding-reconcile'){
    const input=option('--input'),file=option('--database');
    if(!input||!file||!args.includes('--apply'))throw new Error('Use child-funding-reconcile --database existing.db --input independently-reviewed.json --apply');
    const receipt=JSON.parse(readBounded(input,32768).toString('utf8'));
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:1000});
    try{const {reconcileChildFunding}=await import('../revenue/operation-reconciliation.js');publish(reconcileChildFunding(db,receipt));}finally{db.close();}return;
  }
  if(command==='capital-plan'){
    const input=option('--input'),file=option('--database');if(!input||!file||args.includes('--apply'))throw new Error('Use capital-plan --database existing.db --input proposal.json; no execution authority');
    const data=JSON.parse(readBounded(input,65536).toString('utf8'));
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:true,timeout:1000});
    try{publish(planCapitalAllocation(db,data.candidates,data.limits,data.policy));}finally{db.close();}return;
  }
  if(command==='opportunity-profile'){
    const input=option('--input'),file=option('--database');if(!input||!file||!args.includes('--apply'))throw new Error('Use opportunity-profile --database existing.db --input profile.json --apply; records assumptions, not spending authority');
    const data=JSON.parse(readBounded(input,16384).toString('utf8'));
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:1000});
    try{new OpportunityProfiles(db).record(data);publish({recorded:true,executionAuthorized:false});}finally{db.close();}return;
  }
  if(command==='research-integrity'){
    const file=option('--database');
    if(!file||args.includes('--apply'))throw new Error('Use research-integrity --database existing.db [--output new-report.json]; read-only inspection');
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:true,timeout:1000});
    try{publish(inspectResearchIntegrity(db));}finally{db.close();}
    return;
  }
  if(command==='optimization-compare'){
    const input=option('--input');if(!input||args.includes('--apply'))throw new Error('Use optimization-compare --input paired-measurements.json [--output new-report.json]; no policy application');
    let data;try{data=JSON.parse(readBounded(input,131072).toString('utf8'));}catch{throw new Error('Invalid bounded comparison JSON');}
    publish(compareOptimization(data));return;
  }
  if(command==='research-resolve-contradiction'){
    const file=option('--database'),input=option('--input'),apply=args.includes('--apply');
    if(!file||!input)throw new Error('Use research-resolve-contradiction --database existing.db --input review.json [--apply]');
    let proposal;
    try{proposal=JSON.parse(readBounded(input,16384).toString('utf8'));}catch{throw new Error('Invalid bounded economic review JSON');}
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:!apply,timeout:5000});
    try{publish(reviewEconomicContradiction(db,proposal,apply));}finally{db.close();}
    return;
  }
  if(command==='setup-rehearse') {
    const file=option('--database'),input=option('--input');
    if(!file||!input||args.includes('--apply'))throw new Error('Use setup-rehearse --database existing.db --input proposal.json; production application is not supported');
    let proposal;
    try{proposal=JSON.parse(readBounded(input,16384).toString('utf8'));}catch{throw new Error('Invalid bounded setup proposal JSON');}
    publish(rehearseSetup(file,proposal));return;
  }
  if(command==='live-preflight') {
    const scope=option('--scope')??'personal';
    if(scope!=='personal'&&scope!=='commerce')throw new Error('Use --scope personal|commerce');
    publish(livePreflight({agentFile:option('--database'),commerceFile:option('--commerce-db'),researchFile:option('--research-db'),publicOrigin:option('--public-origin'),operatingScope:scope,includeTrading:args.includes('--with-trading'),includeSupport:args.includes('--with-support')}));return;
  }
  if(command==='personal-verify') {publish(await verifyPersonalCycle());return;}
  if(command==='support-review'){
    const file=option('--database'),output=option('--output'),cursor=option('--before-rowid');
    if(!file||!output)throw new Error('Private support review requires existing --database, --inbox-id and a new local --output file');
    const db=new Database(path.resolve(file),{readonly:true,fileMustExist:true,timeout:5000});
    try{
      const report=supportCaseReview(db,option('--inbox-id')??'',cursor===undefined?undefined:Number(cursor));
      // Never echo private customer content to shared terminal logs. Never overwrite an existing export.
      fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
      process.stdout.write(JSON.stringify({exported:true,containsPrivateContent:true,replies:report.replies.length,nextBeforeRowid:report.nextBeforeRowid,startsSending:false})+'\n');
    }finally{db.close();}
    return;
  }
  if(command==='personal-benchmark') {publish(await benchmarkPersonalFocus());return;}
  if(['support-configure','support-control','support-draft','support-followup','support-cancel','support-receive','support-poll','support-poll-status','support-poll-reset','support-poll-exclude','support-send','support-reconcile','support-publish-answer','support-revoke-answer','support-close-review'].includes(command)){
    const file=option('--database');
    if(!file||command!=='support-poll-status'&&!args.includes('--apply'))throw new Error('Support commands require existing --database and --apply');
    const external=['support-receive','support-poll','support-send','support-reconcile'].includes(command);
    if(external&&!args.includes('--allow-network'))throw new Error('External support operations require explicit --allow-network');
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:command==='support-poll-status',timeout:5000});
    try{
      if(command==='support-poll-status'||command==='support-poll-reset'||command==='support-poll-exclude'){
        const policy=db.prepare('SELECT mailbox FROM obolus_support_policy WHERE id=1').get() as {mailbox:string}|undefined;
        const label=option('--label');if(!policy||!label||!/^Label_[A-Za-z0-9_-]{1,100}$/.test(label))throw new Error('Configured mailbox and explicit --label required');
        const scope={mailbox:policy.mailbox,label};
        publish(command==='support-poll-status'?supportPollStatus(db,scope):command==='support-poll-exclude'?
          excludeSupportImport(db,scope,option('--message-id')??'',option('--reason')??''):
          resetSupportPollCursor(db,scope,option('--expected-cursor-digest')??'',option('--reason')??''));
      }else if(command==='support-followup'){
        const input=option('--input');if(!input)throw new Error('Reviewed followup requires bounded --input text file');
        publish(queueSupportFollowup(db,option('--previous-reply-id')??'',readBounded(input,20000).toString('utf8'),option('--reason')??'',option('--reviewed-by')??''));
      }else if(command==='support-cancel'){
        publish(cancelSupportReply(db,option('--reply-id')??'',option('--reason')??''));
      }else if(command==='support-close-review'){
        publish(closeSupportReview(db,option('--inbox-id')??'',option('--reason')??'',option('--reviewed-by')??''));
      }else if(command==='support-publish-answer'){
        if(!args.includes('--public-content'))throw new Error('Explicit --public-content declaration required');
        const input=option('--input');if(!input)throw new Error('Public support answer requires --input');
        const content=JSON.parse(readBounded(input,40000).toString('utf8'));
        const previous=option('--replaces');
        publish(previous?replaceSupportAnswer(db,previous,content.answer):publishSupportAnswer(db,content));
      }else if(command==='support-revoke-answer'){
        publish(revokeSupportAnswer(db,option('--publication-id')??''));
      }else if(command==='support-configure'){
        configureSupportOutbox(db,option('--mailbox')??'',Number(option('--daily-limit')));publish({configured:true,startsSending:false});
      }else if(command==='support-control'){
        const action=option('--action');if(!['pause','resume'].includes(action??''))throw new Error('Use --action pause|resume');
        pauseSupportOutbox(db,action==='pause');publish({paused:action==='pause'});
      }else if(command==='support-draft'){
        const input=option('--input');if(!input)throw new Error('Support draft requires bounded --input text file');
        publish(queueSupportReply(db,option('--inbox-id')??'',readBounded(input,20000).toString('utf8')));
      }else{
        const policy=db.prepare('SELECT mailbox FROM obolus_support_policy WHERE id=1').get() as {mailbox:string}|undefined;
        if(!policy)throw new Error('Configure support mailbox first');
        const client=new GmailSupportClient(policy.mailbox,process.env.OBOLUS_SUPPORT_LABEL??'',createGmailTokenProvider());
        if(command==='support-poll'&&args.includes('--watch')){
          const service=startSupportPolling(db,client);
          try{publish({watching:true,readOnlyProviderAccess:true});await new Promise<void>(resolve=>{
            const stop=()=>{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);resolve();};
            process.once('SIGINT',stop);process.once('SIGTERM',stop);
          });}finally{await service.close();}
        }else if(command==='support-poll')publish(await pollSupportInbox(db,client));
        else if(command==='support-receive')publish(await client.receive(db,option('--message-id')??''));
        else if(command==='support-send')publish(await sendNextSupportReply(db,client));
        else publish(await reconcileSupportReply(db,option('--reply-id')??'',option('--provider-id')??'',(reply,id)=>client.confirm(reply,id)));
      }
    }finally{db.close();}
    return;
  }
  if(['outcome-contract','customer-evidence','outcome-assess'].includes(command)){
    const file=option('--database'),id=option('--experiment-id'),input=option('--input');
    if(!file||!args.includes('--apply')||command!=='customer-evidence'&&!id||command!=='outcome-assess'&&!input)
      throw new Error('Outcome commands require --database, --apply, --experiment-id for contract/assessment and reviewed --input for contract/evidence');
    const data=input?JSON.parse(readBounded(input,8192).toString()):undefined;
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try{publish(command==='outcome-contract'?registerOutcomeContract(db,id!,data):command==='customer-evidence'?recordCustomerEvidence(db,data):assessExperimentOutcome(db,id!));}
    finally{db.close();}
    return;
  }
  if(command==='research-pilot') {
    const file=option('--database'),id=option('--research-id'),reviewer=option('--reviewer'),mode=option('--mode'),apply=args.includes('--apply');
    if(!file||!id||!reviewer||!['test','live'].includes(mode??''))throw new Error('research-pilot requires existing --database, --research-id, --reviewer and --mode test|live; optional --apply');
    const db=new Database(path.resolve(file),{fileMustExist:true,readonly:!apply,timeout:5000});
    try{publish(prepareValidationPilot(db,{researchId:id,reviewedBy:reviewer,mode:mode as 'test'|'live',revisionReason:option('--revision-reason')},apply));}finally{db.close();}
    return;
  }
  if(command==='research-plan') {
    const file=option('--database'),id=option('--research-id');
    if(!file||!id||!args.includes('--apply'))throw new Error('research-plan requires --database, --research-id and --apply');
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try{publish(planResearchExperiment(db,id,option('--revision-reason')));}finally{db.close();}
    return;
  }
  if(command==='dispatch-cancel') {
    const file=option('--database'),task=option('--task-id'),reason=option('--reason');
    if(!file||!task||!reason||!args.includes('--apply')||!args.includes('--workers-stopped'))throw new Error('dispatch-cancel requires --database, --task-id, --reason, --workers-stopped and --apply');
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try{publish(cancelReviewedDispatch(db,task,reason,true));}finally{db.close();}
    return;
  }
  if(command==='research-task') {
    const file=option('--database'),id=option('--experiment-id'),goal=option('--goal-id');
    if(!file||!id||!goal||!args.includes('--apply'))throw new Error('research-task requires --database, --experiment-id, --goal-id and --apply');
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try{publish(handoffResearchTask(db,id,goal));}finally{db.close();}
    return;
  }
  if(command==='adapter-permission') {
    const file=option('--database'),input=option('--input'),action=option('--action');
    if(!file||!input||!['grant','revoke'].includes(action??'')||!args.includes('--apply'))
      throw new Error('adapter-permission requires --database, --input, --action grant|revoke and --apply');
    const reviewed=JSON.parse(readBounded(input,8192).toString());
    if(!reviewed||typeof reviewed.adapter!=='string'||typeof reviewed.experimentId!=='string')throw new Error('Invalid adapter permission input');
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try {
      if(action==='grant')grantAdapterPermission(db,reviewed);else revokeAdapterPermission(db,reviewed.adapter,reviewed.experimentId);
      publish({action,adapter:reviewed.adapter,experimentId:reviewed.experimentId,startsAgent:false});
    }finally{db.close();}
    return;
  }
  if(command==='product-register') {
    const file=option('--database'),commerceFile=option('--commerce-db'),input=option('--input'),asset=option('--asset');
    if(!file||!commerceFile||!input||!asset||!args.includes('--apply'))
      throw new Error('product-register requires --database, --commerce-db, reviewed --input, --asset and --apply');
    const reviewed=JSON.parse(readBounded(input,8192).toString()),content=readBounded(asset,10*1024*1024);
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try {
      const commerce=new Database(path.resolve(commerceFile),{fileMustExist:true,timeout:5000});
      try{publish(await registerExperimentProduct(db,commerce,{...reviewed,content}));}finally{commerce.close();}
    }finally{db.close();}
    return;
  }
  if(command==='product-reconcile') {
    const file=option('--database'),commerceFile=option('--commerce-db'),operation=option('--operation');
    if(!file||!commerceFile||!operation||!args.includes('--apply'))throw new Error('product-reconcile requires --database, --commerce-db, --operation and --apply');
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try {
      const commerce=new Database(path.resolve(commerceFile),{fileMustExist:true,timeout:5000});
      try{publish(reconcileLocalProduct(db,commerce,operation));}finally{commerce.close();}
    }finally{db.close();}
    return;
  }
  if(command==='payout-reconcile-checked'){
    const file=option('--database'),commerce=option('--commerce-db'),input=option('--input');
    if(!file||!commerce||!input||!args.includes('--apply')||!args.includes('--allow-network')||!args.includes('--allow-live'))throw new Error('Checked payout requires existing agent/commerce databases, reviewed input, --apply, --allow-network and --allow-live');
    const receipt=JSON.parse(readBounded(input,8192).toString('utf8'));
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try{
      const workspace=openCommerce(commerce,{mode:'live',allowLive:true,secretKey:process.env.OBOLUS_STRIPE_SECRET_KEY??process.env.AUREUS_STRIPE_SECRET_KEY??'',
        webhookSecret:process.env.OBOLUS_STRIPE_WEBHOOK_SECRET??process.env.AUREUS_STRIPE_WEBHOOK_SECRET??'',accountId:process.env.OBOLUS_STRIPE_ACCOUNT_ID??process.env.AUREUS_STRIPE_ACCOUNT_ID??''});
      try{publish(await reconcileProviderCheckedPayout(db,workspace.checkout,receipt));}finally{workspace.db.close();}
    }finally{db.close();}
    return;
  }
  if(command==='operation-reconcile'||command==='payout-reconcile') {
    const file=option('--database'),input=option('--input');
    if(!file||!input||!args.includes('--apply'))throw new Error(`${command} requires --database, reviewed --input and --apply`);
    const receipt=JSON.parse(readBounded(input,8192).toString());
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try{publish(command==='payout-reconcile'?recordReconciledPayout(db,receipt):reconcileOperation(db,receipt));}finally{db.close();}
    return;
  }
  if(command==='shop-control') {
    const file=option('--database'),action=option('--action');
    if(!file||!action||!['status','pause','resume'].includes(action)||action!=='status'&&!args.includes('--apply'))throw new Error('shop-control requires --database, --action status|pause|resume and --apply for changes');
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try {initializeSalesControl(db);publish(action==='status'?{paused:salesPaused(db)}:setSalesPaused(db,action==='pause'));}finally{db.close();}
    return;
  }
  if (command === "commerce-attribute" || command === "commerce-sync") {
    const source=option("--commerce-db"),target=option("--database"),order=option("--order"),experiment=option("--experiment");
    if(!source||!target||command==='commerce-attribute'&&(!order||!experiment)||!args.includes("--apply"))throw new Error("Commerce attribution requires --commerce-db, --database and --apply; attribution also requires --order and --experiment");
    if(fs.realpathSync(source).toLowerCase()===fs.realpathSync(target).toLowerCase())throw new Error("Use separate commerce and agent databases");
    const commerce=new Database(path.resolve(source),{fileMustExist:true,timeout:5000});
    try {
      const agent=new Database(path.resolve(target),{fileMustExist:true,timeout:5000});
      try {publish(command==='commerce-sync'?syncCommerceHolds(commerce,agent):attributeCommerceObservation(commerce,agent,order!,experiment!,args.includes("--allow-test")));}finally{agent.close();}
    }finally{commerce.close();}
    return;
  }
  if (command === "capital-quote") {
    const file=option("--database"),input=option("--input");
    if(!file||!input||!args.includes("--apply"))throw new Error("capital-quote requires --database, reviewed --input JSON and --apply");
    const entry=JSON.parse(readBounded(input,8192).toString());
    const db=new Database(path.resolve(file),{fileMustExist:true,timeout:5000});
    try {publish(renewCapitalQuote(db,entry));} finally {db.close();}
    return;
  }
  if (command === "stripe-checkout" || command === "stripe-webhook" || command === "stripe-delivery" || command === "stripe-shop" || command === "stripe-reconcile" || command === "stripe-account-check" || command==='stripe-payout-check') {
    if(command==='stripe-payout-check'&&(!args.includes('--allow-network')||!option('--payout-id')))throw new Error('Payout observation requires --allow-network and --payout-id');
    const file=option("--database"),input=option("--input"),mode=option("--mode")??"test";
    if(!file || !["test","live"].includes(mode) || (command==="stripe-checkout"&&!input)) throw new Error("Stripe requires --database, --mode test|live and checkout --input");
    const workspace=openCommerce(file,{mode:mode as "test"|"live",allowLive:args.includes("--allow-live"),
      secretKey:process.env.OBOLUS_STRIPE_SECRET_KEY??process.env.AUREUS_STRIPE_SECRET_KEY??"",webhookSecret:process.env.OBOLUS_STRIPE_WEBHOOK_SECRET??process.env.AUREUS_STRIPE_WEBHOOK_SECRET??"",accountId:process.env.OBOLUS_STRIPE_ACCOUNT_ID??process.env.AUREUS_STRIPE_ACCOUNT_ID??""},args.includes("--new"));
    if(command==='stripe-payout-check') {
      try{publish(await workspace.checkout.observePayout(option('--payout-id')!));}finally{workspace.db.close();}
    }else if(command==='stripe-account-check') {
      try {publish(await workspace.checkout.checkAccount());}finally{workspace.db.close();}
    } else if(command==="stripe-reconcile") {
      try {const order=option("--order");if(!order)throw new Error("stripe-reconcile requires --order");publish(await workspace.checkout.reconcile(order));}
      finally {workspace.db.close();}
    } else if(command==="stripe-shop") {
      let sync:ReturnType<typeof startCommerceHoldSync>|undefined;
      try {
        if(!input)throw new Error("stripe-shop requires --input catalogue JSON");
        if(option('--agent-database'))sync=startCommerceHoldSync(workspace.db,option('--agent-database')!,10000,healthy=>{process.stderr.write(healthy?'numaron payment hold sync: healthy\n':'numaron payment hold sync: unavailable; retrying; payment observations may be stale\n');});
        const shop=await startStorefront(workspace.db,workspace.checkout,JSON.parse(readBounded(input,256*1024).toString()),{port:Number(option("--port")??0),publicOrigin:option("--public-origin")});
        process.stdout.write(`numaron ${mode} product shop: ${shop.localUrl}\nConfigured origin: ${shop.publicOrigin}\n`);
        let closing=false;const close=async()=>{if(closing)return;closing=true;await shop.close();sync?.close();workspace.db.close();};
        process.once("SIGINT",()=>{void close();});process.once("SIGTERM",()=>{void close();});
      }catch(error){sync?.close();workspace.db.close();throw error;}
    } else if(command==="stripe-delivery") {
      try {
        const delivery=new DigitalDelivery(workspace.db),action=option("--action"),order=option("--order");
        if(action==="register"&&input&&option("--product")&&option("--filename")) publish(delivery.register(option("--product")!,option("--filename")!,readBounded(input,10*1024*1024)));
        else if(action==="issue"&&order) publish(delivery.issue(order));
        else if(action==="revoke"&&order) {delivery.revoke(order);publish({revoked:true});}
        else throw new Error("stripe-delivery requires register --input --product --filename, or issue/revoke --order");
      } finally {workspace.db.close();}
    } else if(command==="stripe-checkout") {
      try {publish(await workspace.checkout.checkout(JSON.parse(readBounded(input!,8192).toString())));}
      finally {workspace.db.close();}
    } else {
      let sync:ReturnType<typeof startCommerceHoldSync>|undefined;
      try {
        if(option('--agent-database'))sync=startCommerceHoldSync(workspace.db,option('--agent-database')!,10000,healthy=>{process.stderr.write(healthy?'numaron payment hold sync: healthy\n':'numaron payment hold sync: unavailable; retrying; payment observations may be stale\n');});
        const listener=await startStripeWebhook(workspace.checkout,Number(option("--port")??0),new DigitalDelivery(workspace.db));
        process.stdout.write(`Stripe ${mode} webhook listener: ${listener.url}\nNo checkout creation or agent startup. HTTPS forwarding required for provider delivery.\n`);
        let closing=false;
        const close=async()=>{if(closing)return;closing=true;await listener.close();sync?.close();workspace.db.close();};
        process.once("SIGINT",()=>{void close();});process.once("SIGTERM",()=>{void close();});
      } catch(error){sync?.close();workspace.db.close();throw error;}
    }
    return;
  }
  if (command === "online-scan") {
    if (!args.includes("--read-public") || !option("--topic") || option("--resume")) throw new Error("online-scan requires --topic and --read-public; it always creates a separate workspace");
    const online = openOnline({ directory: option("--new") });
    try {
      online.runtime.enqueue(option("--topic")!); online.runtime.control("start");
      await online.runtime.tick(); online.runtime.control("pause");
      const state = online.runtime.snapshot();
      publish({ mode: state.mode, database: online.file, status: state.status, jobs: state.jobs,
        evidenceCount: state.evidence.length, requestCount: state.requests.length, paidCalls: 0, externalWrites: 0 });
    } finally { online.database.close(); }
    return;
  }
  if (command === 'strategy-catalogue') {
    publish({mode:'paper-only',variants:strategyCatalogue(),liveAuthorized:false}); return;
  }
  if(command==='advanced-paper'){
    const input=option('--input');if(!input)throw new Error('advanced-paper requires local --input JSON');
    publish(advancedPaper(JSON.parse(readBounded(input,2*1024*1024).toString('utf8'))));return;
  }
  if (command === "strategy-research") {
    const input = option("--input");
    if (!input) throw new Error("strategy-research requires a local --input JSON file");
    publish(researchStrategies(JSON.parse(readBounded(input, 2 * 1024 * 1024).toString("utf8"))));
    return;
  }
  if (command === "strategy-digest") {
    const input=option("--input");
    if(!input) throw new Error("strategy-digest requires a local JSON array of bars");
    const bars=JSON.parse(readBounded(input,2*1024*1024).toString("utf8"));
    publish({holdoutDigest:marketDataDigest(bars),holdoutBars:bars.length});return;
  }
  if(command==="paper-portfolio") {
    const file=option("--database"),action=option("--action"),input=option("--input");
    if(!file||!action||!["initialize","open","observe","settle","halt","status"].includes(action)||
      (action!=="status"&&!input)||(args.includes("--new")&&action!=="initialize")) throw new Error("paper-portfolio requires --database, --action and --input except status; --new only for initialize");
    const data=input?JSON.parse(readBounded(input,2*1024*1024).toString("utf8")):undefined;
    const workspace=openStrategySeries(file,args.includes("--new"));
    try {
      const portfolio=new PaperPortfolio(workspace.db);
      if(action==="initialize") portfolio.initialize(data);
      if(action==="open") publish(portfolio.open(data.id,data.plan,data.at));
      else if(action==="observe") publish(portfolio.observe(data.at,data.quotes));
      else if(action==="settle") publish(portfolio.settle(data.id,data.bars));
      else {if(action==="halt") portfolio.halt(data.reason);publish(portfolio.snapshot());}
    } finally {workspace.db.close();}
    return;
  }
  if(command === "strategy-series") {
    const file=option("--database"),action=option("--action"),series=option("--series");
    if(!file || !action || !["register","trial","lock","finalize","status","learning","learned-trial"].includes(action) ||
        (action!=="register" && !series) || (args.includes("--new") && action!=="register")) throw new Error("Specify --database, --action and --series; --new only with register");
    const input=option("--input");
    if(["register","trial","finalize","learning","learned-trial"].includes(action) && !input) throw new Error("Action requires --input JSON");
    if(action==="lock" && !option("--trial")) throw new Error("lock requires --trial");
    const data=input ? JSON.parse(readBounded(input,2*1024*1024).toString("utf8")) : undefined;
    const workspace=openStrategySeries(file,args.includes("--new"));
    try {
      if(action==="register") publish(workspace.store.snapshot(workspace.store.register(data)));
      if(action==="trial") publish(workspace.store.trial(series!,data));
      if(action==="lock") {workspace.store.lock(series!,option("--trial")!);publish(workspace.store.snapshot(series!));}
      if(action==="finalize") publish(workspace.store.finalize(series!,data));
      if(action==="status") publish(workspace.store.snapshot(series!));
      if(action==="learning") publish(workspace.store.learning(series!,data));
      if(action==="learned-trial") publish(workspace.store.learnedTrial(series!,data));
    } finally {workspace.db.close();}
    return;
  }
  if (command === "online") {
    const port = Number(option("--port") ?? 0);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
    const online = openOnline({ resume: option("--resume"), directory: option("--new") });
    try {
      const ui = await startOnlineDashboard(online.runtime, port);
      process.stdout.write(`numaron ONLINE RESEARCH (stopped/paused; public reads only after Start)\n${ui.url}\nDatabase: ${online.file}\n`);
      let closing = false;
      const close = async () => { if (closing) return; closing = true; await ui.close(); online.database.close(); };
      process.once("SIGINT", () => { void close(); }); process.once("SIGTERM", () => { void close(); });
    } catch (error) { online.database.close(); throw error; }
    return;
  }
  if (command === "soak") { publish(await soakSimulation(Number(option("--days") ?? 90), Number(option("--pace-ms") ?? 0))); return; }
  if (command === "benchmark") { publish(await benchmarkSimulation()); return; }
  if (command === "costs") {
    const database = option("--database");
    if (!database) throw new Error("costs requires --database (an existing V15 database)");
    publish(reviewCosts({ database, evidence: option("--evidence"), source: option("--source"), apply: args.includes("--apply") }));
    return;
  }
  if (command === "research") {
    const sim = openSimulation(option("--resume"), DEFAULT_SETTINGS, undefined, false);
    try {
      const input = option("--input");
      if (input) {
        sim.runtime.research.import(JSON.parse(readBounded(input, 5 * 1024 * 1024).toString("utf8")));
      }
      publish({ database: sim.file, ranking: sim.runtime.research.rank(), proposal: sim.runtime.research.plan(Number(option("--budget-cents") ?? 0)) });
    } finally { sim.database.close(); }
    return;
  }
  if (!["dashboard", "demo"].includes(command)) throw new Error("Use online, dashboard, demo, soak, benchmark, research, strategy-research, strategy-series, strategy-digest or costs. Paid execution is unavailable.");
  const resume = option("--resume");
  let directory: string | undefined;
  if (command === "dashboard" && !resume) {
    directory = path.resolve(option("--new") ?? path.join("obolus-v1-data", `simulation-${Date.now()}`));
    fs.mkdirSync(path.dirname(directory), { recursive: true });
  }
  const sim = openSimulation(resume, DEFAULT_SETTINGS, directory);
  if (command === "demo") {
    try {
      seedDemo(sim.runtime);
      if (sim.runtime.status === "paused") sim.runtime.control("resume"); else sim.runtime.control("start");
      const processed = await runToIdle(sim.runtime); sim.runtime.control("pause");
      publish({ mode: "simulation", processed, database: sim.file, totals: sim.runtime.totals(), paper: paperDemo(sim.runtime),
        note: "Synthetic outcomes only; no real provider calls or trades" });
    } finally { sim.database.close(); }
    return;
  }
  const port = Number(option("--port") ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) { sim.database.close(); throw new Error("Invalid port"); }
  const ui = await startDashboard(sim.runtime, port);
  process.stdout.write(`numaron V1 SIMULATION (stopped/paused; no automatic start)\n${ui.url}\nDatabase: ${sim.file}\n`);
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await ui.close(); sim.database.close(); };
  process.once("SIGINT", () => { void close(); }); process.once("SIGTERM", () => { void close(); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "numaron simulation failed"}\n`); process.exitCode = 1; });
}
