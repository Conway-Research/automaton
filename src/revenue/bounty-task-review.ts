import type {Database} from 'better-sqlite3';
import {bountyMetadata,bountyPage} from '../online/bounty-readonly.js';
import {actionContextDigest} from '../security/action-gate.js';
import {assertModelPrivacy} from '../security/privacy-egress.js';
import {prepareRevenuePathDraft,type RevenuePathAssessment} from './revenue-paths.js';

type Activity=RevenuePathAssessment['activityClass'];
export interface BountyReviewTarget {id:string;version:number;activityClass:Activity;observedAt:number}
const record=(v:unknown):Record<string,unknown>=>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Bounty detail object required');
 return v as Record<string,unknown>;
};
/** Pure local adapter into the existing revenue gates. No provider, key, ledger
 * write, task claim or autonomous dispatch. Input text never supplies approval. */
export function prepareBountyTaskReview(db:Database,raw:unknown,target:BountyReviewTarget,now=Date.now()){
 if(!target||Object.keys(target).sort().join(',')!=='activityClass,id,observedAt,version'||
  !['research','software','quality-assurance','data-report','template'].includes(target.activityClass)||
  !Number.isSafeInteger(now)||now<=0||target.observedAt>now)throw Error('Explicit bounded review target required');
 const encoded=JSON.stringify(raw);
 if(typeof encoded!=='string'||Buffer.byteLength(encoded)>1000000)throw Error('Bounded task detail required');
 const detail=record(raw),task=record(detail.bounty),metadata=bountyMetadata(task,target.observedAt);
 assertModelPrivacy(metadata);
 if(metadata.id!==target.id||metadata.version!==target.version)throw Error('Bounty identity or version changed; re-evaluation required');
 if(!['CHF','USD','EUR'].includes(metadata.currency)||metadata.expectedPayoutMinor>100_000_000)throw Error('Unsupported forecast currency or amount');
 if(typeof task.description!=='string'||!task.description.trim()||task.description.length>20000||
  task.verification!==undefined&&(typeof task.verification!=='string'||task.verification.length>20000)||
  !Array.isArray(detail.attachments)||detail.attachments.length>100||!Array.isArray(detail.comments)||detail.comments.length>1000)
  throw Error('Bounded task requirements required');
 const deadline=task.expires_at===undefined?null:task.expires_at;
 if(deadline!==null&&(!Number.isSafeInteger(deadline)||Number(deadline)<0))throw Error('Invalid task deadline');
 const requirements={description:task.description,verification:task.verification??null};
 assertModelPrivacy(requirements);
 // Bind opaque attachments/comments without exporting or fetching their content.
 // Their presence remains a blocker; hashing is not an approval or a PII scan.
 const revisionDigest=actionContextDigest({task,attachments:detail.attachments,comments:detail.comments});
 const a:RevenuePathAssessment={
  path:'research-qa-subcontract',region:'UNKNOWN_REQUIRES_REVIEW',
  sourceUrl:`https://api.trybounty.ai/v1/agent/bounties/${metadata.id}`,retrievedAt:target.observedAt,
  provenance:'public-indicator',activityClass:target.activityClass,
  demand:metadata.providerOpen?['Provider advertises a task; no customer response to Obolus or payment verified']:[],
  counterEvidence:['Listing and payout are provider claims; competition, funding and acceptance remain unverified'],
  prerequisites:['Check task-specific AI permission, rights, jurisdiction, acceptance, costs and bounded delivery'],
  deliveryEvidence:[],conditions:[],entryFeeCents:null,effortMinutes:null,
  forecast:{currency:metadata.currency as 'CHF'|'USD'|'EUR',receiptsCents:metadata.expectedPayoutMinor,
   directCashCents:null,feesCents:null,refundsCents:null,openCosts:['Delivery, support, fees, refunds and mandatory cash charges unresolved'],
   probability:null,estimateSource:'Unverified provider payout conditional on acceptance and settlement',uncertainty:'unknown'},
  rewardedTask:{status:metadata.providerOpen?'open':'unknown',deadlineAt:deadline as number|null,
   agentUse:'unknown',humanReviewAvailable:false,claim:'required',acceptance:'unknown',payout:'unknown'},
  blockers:[`TASK_REVISION:${revisionDigest}`,'TASK_SPECIFIC_REVIEW_REQUIRED',
   ...(detail.attachments.length?['ATTACHMENTS_UNREVIEWED']:[]),...(detail.comments.length?['DISCUSSION_UNREVIEWED']:[])],
  nextSafeCheck:'Review already obtained task requirements locally; do not contact, claim, fetch attachments or submit',
 };
 return {metadata,revisionDigest,untrustedRequirements:requirements,
  attachmentCount:detail.attachments.length,commentCount:detail.comments.length,
  draft:prepareRevenuePathDraft(db,a,now)};
}

/** Source utility is not demand calibration. Empty pages never become negative
 * market evidence or a reason to spend more, retry, or invent an opportunity. */
export function inspectBountyAvailability(raw:unknown,limit:number,observedAt:number){
 const page=bountyPage(raw,limit,observedAt);
 return {...page,observation:page.rows.length?'CANDIDATES_REQUIRE_REVIEW':page.moreAvailable?'EMPTY_PARTIAL_PAGE':'NO_TASKS_FOR_THIS_ACCOUNT',
  automaticRetry:false,marketDemandConclusion:'UNKNOWN',realizedRevenueMinor:null,
  nextSafeAction:page.rows.length?'LOCAL_TASK_REVIEW':'PRESERVE_RESOURCES_OR_OTHER_APPROVED_SOURCE'};
}
