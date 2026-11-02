import Database from 'better-sqlite3';
import {checkCapitalBudget} from '../revenue/capital-budget.js';
import {SCHEMA_VERSION} from '../state/schema.js';
import {readBudgetPolicy} from '../inference/budget-policy.js';
import {RevenueStore,validateEconomicNumbers} from '../revenue/store.js';
import {assertProductQuality} from '../commerce/product-quality.js';
import {createHash} from 'node:crypto';
import {inspectResearchIntegrity} from '../revenue/research-integrity.js';
import {researchAdmissionBlock} from '../revenue/research-admission.js';

/** Local inspection only: no migration, provider request, secret output or start. */
export function livePreflight(options:{agentFile?:string;commerceFile?:string;researchFile?:string;publicOrigin?:string;operatingScope?:'personal'|'commerce';includeTrading?:boolean;includeSupport?:boolean}={},environment:Record<string,string|undefined>=process.env) {
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Invalid preflight options');
  for(const key of ['includeTrading','includeSupport'] as const){
    if(options[key]!==undefined&&typeof options[key]!=='boolean')throw new Error('Invalid preflight capability selection');
  }
  const operatingScope=options.operatingScope??'personal';
  if(!['personal','commerce'].includes(operatingScope))throw new Error('Invalid operating scope');
  const checks:{id:string;status:'pass'|'blocked'|'unverified';detail:string}[]=[];
  const add=(id:string,status:'pass'|'blocked'|'unverified',detail:string)=>checks.push({id,status,detail});
  const key=environment.OBOLUS_STRIPE_SECRET_KEY??environment.AUREUS_STRIPE_SECRET_KEY;
  const webhook=environment.OBOLUS_STRIPE_WEBHOOK_SECRET??environment.AUREUS_STRIPE_WEBHOOK_SECRET;
  const account=environment.OBOLUS_STRIPE_ACCOUNT_ID??environment.AUREUS_STRIPE_ACCOUNT_ID;
  const configured=typeof key==='string'&&key.startsWith('sk_live_')&&typeof webhook==='string'&&webhook.startsWith('whsec_')&&webhook.length>=16&&typeof account==='string'&&/^acct_[A-Za-z0-9]+$/.test(account);
  if(operatingScope==='commerce')add('stripe_configuration',configured?'pass':'blocked',configured?'Live-format configuration present; values withheld.':'Live-format account/key/webhook configuration missing or invalid.');
  let https=false;try {const u=new URL(options.publicOrigin??'');https=u.protocol==='https:'&&u.origin===options.publicOrigin&&!u.username&&!u.password;}catch{}
  if(operatingScope==='commerce')add('https_origin',https?'pass':'blocked',https?'HTTPS origin has valid format; deployment not verified.':'Explicit HTTPS public origin required.');
  const inspect=(file:string|undefined,id:string,fn:(db:Database.Database)=>void)=>{
    if(!file){add(id,'blocked','Existing database path required.');return;}
    let db:Database.Database|undefined;
    try {db=new Database(file,{readonly:true,fileMustExist:true,timeout:100});const current=db;db.transaction(()=>fn(current))();}
    catch{add(id,'blocked','Database unreadable, incompatible or requires explicit reconciliation.');}
    finally{db?.close();}
  };
  inspect(options.agentFile,'agent_database',db=>{
    const version=(db.prepare('SELECT MAX(version) n FROM schema_version').get() as {n:number}).n;
    add('agent_schema',version===SCHEMA_VERSION?'pass':'blocked',version===SCHEMA_VERSION?'Expected database schema available.':'Database version differs from this build; migration or compatible build required.');
    if(version!==SCHEMA_VERSION)return;
    const securityHaltTable=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_security_halt'").get();
    const securityHalted=securityHaltTable&&!!db.prepare('SELECT 1 FROM obolus_security_halt LIMIT 1').get();
    add('security_stop',securityHalted?'blocked':'pass',securityHalted?
      'Persistent security incident containment is active. Trusted incident recovery is required; inspection never clears the halt.':
      'No persistent security incident halt recorded. This does not approve any action, legal/privacy evidence or production security.');
    const researchLedger=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_evidence'").get();
    if(!researchLedger)add('research_integrity','pass','No research evidence ledger present; no research integrity or demand attestation inferred.');
    else{
      try{
        const integrity=inspectResearchIntegrity(db);
        add('research_integrity',integrity.valid?'pass':'blocked',integrity.valid?
          `${integrity.checked} research evidence records passed bounded payload integrity and identity checks; not external verification.`:
          `Research reconciliation required: ${integrity.checked} checked, ${integrity.issues.length} inconsistent, inspection complete: ${integrity.complete}. No records changed.`);
      }catch{add('research_integrity','blocked','Research ledger unreadable or incompatible; explicit reconciliation required.');}
    }
    const revenue=new RevenueStore(db);
    let invalidOpportunities=0,invalidExperiments=0,inactiveParents=0,blockedResearchPlans=0;
    for(const row of db.prepare("SELECT id FROM revenue_opportunities WHERE status IN ('discovered','screening','validating','active','scale')").iterate() as Iterable<{id:string}>) {
      try {validateEconomicNumbers(revenue.getOpportunity(row.id)!);}catch{invalidOpportunities++;}
    }
    for(const row of db.prepare("SELECT id FROM revenue_experiments WHERE status IN ('planned','running')").iterate() as Iterable<{id:string}>) {
      const experiment=revenue.getExperiment(row.id)!;
      try {validateEconomicNumbers(experiment);}catch{invalidExperiments++;}
      const parent=revenue.getOpportunity(experiment.opportunityId);
      if(!parent||!['validating','active','scale'].includes(parent.status))inactiveParents++;
      try{if(researchAdmissionBlock(db,experiment.id))blockedResearchPlans++;}catch{blockedResearchPlans++;}
    }
    const invalidEconomics=invalidOpportunities+invalidExperiments+inactiveParents;
    add('research_plan_admission',blockedResearchPlans?'blocked':'pass',blockedResearchPlans?
      `${blockedResearchPlans} planned/running research experiments require evidence or plan reconciliation. No approvals or records changed.`:
      'No evidence-admission blocks found for planned/running research experiments; no execution or profitability attestation.');
    add('economic_integrity',invalidEconomics?'blocked':'pass',invalidEconomics?
      `Review required: ${invalidOpportunities} active/candidate opportunities with invalid numbers; ${invalidExperiments} planned/running experiments with invalid numbers; ${inactiveParents} planned/running experiments with missing or inactive parents. Counts may overlap; no records changed.`:
      'Active/candidate economic numbers and planned/running parent links passed local validation. This does not verify demand, forecasts or profitability.');
    const policy=readBudgetPolicy(db);
    const bounded=policy&&['daily_cents','hourly_cents','session_cents','call_cents'].every(k=>{
      const n=policy[k as keyof typeof policy];return Number.isSafeInteger(n)&&n!==null&&n>0;
    });
    add('inference_limits',bounded?'pass':'blocked',bounded?'Explicit positive shared inference limits are present.':'Daily, hourly, session and per-call ceilings must be explicitly configured for live operation.');
    const consistent=!!bounded&&!!policy&&['daily_cents','hourly_cents','session_cents'].every(key=>policy.call_cents!<=policy[key as 'daily_cents'|'hourly_cents'|'session_cents']!);
    add('inference_limit_consistency',consistent?'pass':'blocked',consistent?
      'Configured call ceiling fits the configured daily, hourly and session ceilings; current window consumption is still enforced by the router.':
      'Positive limits required, with call ceiling no larger than each enclosing ceiling. Inspection never raises existing limits.');
    add('inference_stop',policy?.halted===0?'pass':'blocked',policy?.halted===0?'Inference budget not halted.':'Inference budget missing or halted; no automatic reset.');
    const table=(name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    const payoutHolds=table('obolus_payout_capital_holds')?(db.prepare('SELECT COUNT(*) n FROM obolus_payout_capital_holds').get() as {n:number}).n:0;
    add('payout_capital_holds',payoutHolds?'blocked':'pass',payoutHolds?
      `${payoutHolds} unresolved payout capital hold(s). Independently reconcile the destination account before further capital admission; inspection never releases holds.`:
      'No payout capital holds recorded. This does not verify external payouts or destination receipts.');
    if(options.includeSupport){
      const support=table('obolus_support_policy')?db.prepare('SELECT paused,max_daily FROM obolus_support_policy WHERE id=1').get() as {paused:number;max_daily:number}|undefined:undefined;
      const boundedSupport=!!support&&Number.isSafeInteger(support.max_daily)&&support.max_daily>=1&&support.max_daily<=100;
      add('support_policy',boundedSupport?'pass':'blocked',boundedSupport?'Explicit bounded support policy present.':'Configure a bounded support mailbox before operation.');
      add('support_control',boundedSupport&&support.paused===0?'pass':'blocked',boundedSupport&&support.paused===0?'Support is locally enabled; no provider identity verified.':'Support paused or unavailable; inspection does not resume it.');
      const uncertain=table('obolus_support_replies')?(db.prepare("SELECT COUNT(*) n FROM obolus_support_replies WHERE status IN ('sending','uncertain')").get() as {n:number}).n:0;
      add('support_delivery',uncertain?'blocked':'pass',uncertain?'Unresolved support delivery claims require provider reconciliation.':'No unresolved support delivery claims found at inspection time.');
      const replies=table('obolus_support_replies');
      const openWhere="r.status IN ('queued','deferred','sending','uncertain')";
      const inconsistent=replies?(table('obolus_support_inbox')?
        (db.prepare(`SELECT COUNT(*) n FROM obolus_support_replies r LEFT JOIN obolus_support_inbox i ON i.id=r.inbox_id WHERE ${openWhere} AND (i.id IS NULL OR i.status='reviewed')`).get() as {n:number}).n:
        (db.prepare(`SELECT COUNT(*) n FROM obolus_support_replies r WHERE ${openWhere}`).get() as {n:number}).n):0;
      const invalidStatus=replies?(db.prepare("SELECT COUNT(*) n FROM obolus_support_replies WHERE status IS NULL OR status NOT IN ('queued','deferred','sending','uncertain','sent','cancelled')").get() as {n:number}).n:0;
      add('support_case_integrity',inconsistent||invalidStatus?'blocked':'pass',inconsistent||invalidStatus?
        `Support reconciliation required: ${inconsistent} open replies with closed or missing cases; ${invalidStatus} invalid reply states. Inspection preserves all records.`:
        'No open replies with closed or missing cases, or invalid reply states, found. This is not customer resolution or provider verification.');
    }
    // Unknown/null states cannot establish completion. NOT EXISTS also avoids
    // a corrupt null settlement ID hiding unrelated outstanding commitments.
    const inferencePending=(db.prepare("SELECT COUNT(*) n FROM inference_reservations WHERE status IS NULL OR status<>'settled'").get() as {n:number}).n;
    const operationsPending=table('obolus_reserved_operations')?(db.prepare("SELECT COUNT(*) n FROM obolus_reserved_operations WHERE status IS NULL OR status<>'settled'").get() as {n:number}).n:0;
    const commitmentsPending=table('aureus_capital_commitments')?(db.prepare('SELECT COUNT(*) n FROM aureus_capital_commitments c WHERE NOT EXISTS (SELECT 1 FROM aureus_capital_settlements s WHERE s.id=c.id)').get() as {n:number}).n:0;
    const unresolved=inferencePending+operationsPending+commitmentsPending>0;
    add('unresolved_spending',unresolved?'blocked':'pass',unresolved?
      `Open records: inference ${inferencePending}, operations ${operationsPending}, capital commitments ${commitmentsPending}. Counts may overlap; inspect active work or reconcile before a fresh start. Never release automatically.`:
      'No open spending records found at inspection time.');
    const trialClaims=table('obolus_optimization_attempts')?(db.prepare("SELECT COUNT(*) n FROM obolus_optimization_attempts WHERE status='claimed'").get() as {n:number}).n:0;
    const trialHolds=table('obolus_optimization_budget_holds')?(db.prepare('SELECT COUNT(*) n FROM obolus_optimization_budget_holds WHERE actual_cents IS NULL').get() as {n:number}).n:0;
    const rolloutClaims=table('obolus_optimization_rollout_runs')?(db.prepare("SELECT COUNT(*) n FROM obolus_optimization_rollout_runs WHERE status='claimed' OR actual_cents IS NULL").get() as {n:number}).n:0;
    add('unresolved_optimization',trialClaims||trialHolds||rolloutClaims?'blocked':'pass',trialClaims||trialHolds||rolloutClaims?
      `Open optimization records: trial claims ${trialClaims}, budget holds ${trialHolds}, rollout claims/costs ${rolloutClaims}. Counts may overlap; reconcile before a fresh start. No retries or releases performed.`:
      'No open optimization claims or budget holds found at inspection time. This is not a quality or profitability assessment.');
    const grants=table('obolus_adapter_permissions')?(db.prepare(`SELECT COUNT(*) n FROM obolus_adapter_permissions p JOIN revenue_experiments e ON e.id=p.experiment_id
      WHERE p.revoked=0 AND p.expires_ms>? AND p.max_cost>=0 AND e.status='running'`).get(Date.now()) as {n:number}).n:0;
    add('adapter_permissions',grants?'unverified':'blocked',grants?
      `${grants} non-revoked, unexpired experiment grant(s) found; intended adapter scope and execution admission still require verification.`:
      'No current adapter grants for running experiments. No execution authority inferred from capital alone.');
    const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='aureus_capital_policy'").get();
    if(!exists){add('capital_policy','blocked','Shared capital policy not initialized.');add('capital_call_capacity','blocked','A capital policy and explicit positive call ceiling are required.');return;}
    const admission=checkCapitalBudget(db,0);
    const available=admission.allowed&&(admission.remainingChfCents??0)>0;
    add('capital_policy',available?'pass':'blocked',available?'Shared capital check has positive remaining headroom at inspection time.':'Capital policy expired, exhausted or requires reconciliation.');
    const callFits=!!bounded&&!!policy&&available&&checkCapitalBudget(db,policy.call_cents!).allowed;
    add('capital_call_capacity',callFits?'pass':'blocked',callFits?
      'Configured maximum call fits current locally recorded capital headroom; external funds and FX remain unverified.':
      'Configured maximum call does not fit available capital, or explicit limits/capital are missing. Smaller calls may fit; no configuration changed.');
  });
  if(options.researchFile!==undefined)inspect(options.researchFile,'research_database',db=>{
    try{
      const integrity=inspectResearchIntegrity(db);
      add('separate_research_integrity',integrity.valid?'pass':'blocked',integrity.valid?
        `${integrity.checked} separate research evidence records passed bounded integrity checks; no external verification.`:
        `Separate research reconciliation required: ${integrity.checked} checked, ${integrity.issues.length} inconsistent, inspection complete: ${integrity.complete}. No records changed.`);
    }catch{add('separate_research_integrity','blocked','Separate research ledger unreadable or incompatible; explicit reconciliation required.');}
  });
  if(operatingScope==='commerce')inspect(options.commerceFile,'commerce_database',db=>{
    const config=db.prepare('SELECT mode,account_id FROM commerce_stripe_config WHERE id=1').get() as {mode:string;account_id:string}|undefined;
    const match=config?.mode==='live'&&config.account_id===account;
    add('commerce_mode',match?'pass':'blocked',match?'Commerce database matches configured live account.':'Commerce account missing, mismatched or in test mode.');
    const control=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_sales_control'").get();
    const sales=control?db.prepare('SELECT paused FROM obolus_sales_control WHERE id=1').get() as {paused:number}|undefined:undefined;
    add('sales_control',sales?.paused===0?'pass':'blocked',sales?.paused===0?'Local sales are enabled; this does not verify publication or cancel existing checkout links.':'Sales paused or control missing; inspection does not initialize or resume sales.');
  });
  // Optional catalogue inspection also applies to a personal business, without requiring a public site.
  if(options.commerceFile||operatingScope==='commerce')inspect(options.commerceFile,'product_database',db=>{
    const table=(name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if(!table('commerce_assets')){add('product_quality','blocked','No product catalogue available for acceptance.');return;}
    const assets=db.prepare('SELECT product_id,length(content) bytes FROM commerce_assets LIMIT 101').all() as {product_id:string;bytes:number}[];
    if(!assets.length){add('product_quality','blocked','No product assets available for acceptance.');return;}
    if(assets.length>100){add('product_quality','blocked','Catalogue exceeds bounded inspection capacity; no partial pass issued.');return;}
    let failed=0;
    for(const asset of assets){
      try{
        if(!Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>262144)throw Error();
        if(!table('obolus_product_quality_contracts')||!db.prepare('SELECT 1 FROM obolus_product_quality_contracts WHERE product_id=?').get(asset.product_id))throw Error();
        const value=db.prepare('SELECT filename,content,sha256 FROM commerce_assets WHERE product_id=?').get(asset.product_id) as {filename:string;content:Buffer;sha256:string};
        if(!Buffer.isBuffer(value.content)||createHash('sha256').update(value.content).digest('hex')!==value.sha256)throw Error();
        assertProductQuality(db,asset.product_id,value);
      }catch{failed++;}
    }
    add('product_quality',failed?'blocked':'pass',failed?
      `${failed} of ${assets.length} product assets failed current integrity or configured quality gates. No names, content or findings disclosed; inspect privately and reassess.`:
      `${assets.length} product assets passed current integrity and configured technical gates. This does not establish comprehensive quality, language coverage, legal clearance or customer value.`);
  });
  if(operatingScope==='commerce') {
    add('provider_account','unverified','Run the explicit read-only stripe-account-check; local configuration is not account verification.');
    add('webhook_delivery','unverified','Public HTTPS and signed provider webhook delivery require deployment verification.');
  } else add('private_interface','unverified','Private operation requires loopback-only or authenticated access; public website and Stripe are not prerequisites. Binding/authentication must be checked for the actual running interface.');
  add('payout_capital_pipeline','blocked','Operator-reconciled payout allocation and bounded reinvestment are locally tested; automatic authenticated receipt ingestion and end-to-end live acceptance remain missing.');
  add('autonomous_business_cycle','blocked','Complete productive discovery-to-reinvestment execution has not been accepted.');
  add('shell_isolation','blocked','Local arbitrary shell execution is disabled. An isolated execution backend with filesystem, credential, network and resource boundaries has not been accepted.');
  if(options.includeSupport){
    const credential=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=16384&&!/\s/.test(value);
    const refresh=[environment.OBOLUS_GMAIL_CLIENT_ID,environment.OBOLUS_GMAIL_CLIENT_SECRET,environment.OBOLUS_GMAIL_REFRESH_TOKEN];
    const supplied=refresh.some(value=>value!==undefined)?refresh.every(credential):credential(environment.OBOLUS_GMAIL_ACCESS_TOKEN);
    const label=/^Label_[A-Za-z0-9_-]{1,100}$/.test(environment.OBOLUS_SUPPORT_LABEL??'');
    add('support_credentials',supplied&&label?'pass':'blocked',supplied&&label?'Credential and label configuration has valid local shape; not authenticated.':'Complete operator credentials and an explicit support label are required.');
    add('support_provider','unverified','Actual OAuth grant, mailbox identity and end-to-end delivery require separate acceptance; this inspection makes no requests.');
  }
  if(options.includeTrading)add('live_trading','blocked','No fully accepted bounded live-order integration or activated execution authority.');
  return {product:'Obolus',scope:'local-preflight-only',operatingScope,tradingIncluded:options.includeTrading===true,supportIncluded:options.includeSupport===true,liveReady:false,productionAccepted:false,startsAgent:false,checks,
    nextSteps:preflightNextSteps(checks),
    limitation:'Passing local checks is not a live release, external account verification or profitability evidence.'};
}

/** Remediation metadata is not evidence or authority. Unknown gates remain
 * blocked for review; no resolver writes policy, grants or production state. */
export function preflightNextSteps(checks:readonly {id:string;status:string}[]){
  const groups:Array<{ids:readonly string[];category:'local_reconciliation'|'founder_decision'|'external_verification';evidence:string}>=[
    {ids:['agent_database','research_database','commerce_database','product_database','agent_schema'],category:'local_reconciliation',evidence:'Separately prepared consistent snapshot, compatible schema and bounded read-only inspection. No implicit migration or live database recovery.'},
    {ids:['research_integrity','separate_research_integrity','research_plan_admission','economic_integrity','product_quality','support_case_integrity'],category:'local_reconciliation',evidence:'Reproduce the failed invariant on synthetic data or an authorised copy, repair the cause, and rerun integrity and quality checks. Real demand and rights require independent evidence.'},
    {ids:['inference_limits','inference_limit_consistency','inference_stop','capital_policy','capital_call_capacity','adapter_permissions','sales_control','support_policy','support_control'],category:'founder_decision',evidence:'Explicit task-specific limits and permissions plus valid underlying evidence. Do not increase limits, clear a stop or infer approval from a test. Zero-cost Paper operation uses its separate admission path.'},
    {ids:['security_stop'],category:'external_verification',evidence:'Trusted incident investigation, containment and documented recovery acceptance; never clear the persistent halt automatically.'},
    {ids:['unresolved_spending','unresolved_optimization','payout_capital_holds','support_delivery'],category:'external_verification',evidence:'Reconcile each uncertain operation against an authoritative result or authenticated provider receipt. Do not release holds or retry consequential actions based on local success alone.'},
    {ids:['stripe_configuration','support_credentials'],category:'founder_decision',evidence:'Authorised provider and securely provisioned scoped credentials. Presence or valid format does not prove account identity or permissions.'},
    {ids:['private_interface','https_origin','webhook_delivery','provider_account','commerce_mode','support_provider'],category:'external_verification',evidence:'Verify the concrete deployment, authenticated account identity and required transport/access controls. Test delivery with provider-supported test fixtures before separately authorised production acceptance.'},
    {ids:['shell_isolation'],category:'external_verification',evidence:'Independent acceptance of the actual bounded backend: filesystem, credentials, network, CPU, memory, processes, timeout and termination. Fixture/WSL configuration is not acceptance; no host-shell fallback.'},
    {ids:['payout_capital_pipeline'],category:'external_verification',evidence:'Authenticated receipt ingestion and destination reconciliation, duplicate/reversal/fee tests, then explicit bounded production acceptance. Code adoption or payment claims are not cash receipts.'},
    {ids:['autonomous_business_cycle'],category:'external_verification',evidence:'A specified permitted delivery path with current legal/privacy/rights evidence, quality acceptance, bounded resources, stop/recovery tests and authenticated outcome reconciliation. No generic live release from mock results.'},
    {ids:['live_trading'],category:'external_verification',evidence:'Named provider, licensed/account-authorised access, instrument/cost/data model, paper acceptance and explicit live capital/order limits. No live orders during local verification.'},
  ];
  return checks.filter(check=>check.status!=='pass').map(check=>{
    const group=groups.find(item=>item.ids.includes(check.id));
    return {gate:check.id,status:check.status,category:group?.category??'external_verification',
      evidenceRequired:group?.evidence??'Unrecognised gate requires explicit trusted review; no automatic approval or execution.',
      automaticallyResolvable:false as const,grantsAuthority:false as const};
  });
}
