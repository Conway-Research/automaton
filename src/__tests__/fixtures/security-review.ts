import type {Database} from 'better-sqlite3';
import {GATE_DOMAINS,registerActionReview,type ActionScope} from '../../security/action-gate.js';
import {grantAdapterPermission,adapterActionScope} from '../../revenue/adapter-permissions.js';
import {createHash} from 'node:crypto';
import {sendNextSupportReply,supportContentActionScope,type SupportReply} from '../../commerce/support-outbox.js';
import {PRODUCT_RELEASE_EVIDENCE} from '../../commerce/quality-review.js';
/** Emulates a trusted externally authenticated record ONLY in temporary DBs.
 * Separate rejection tests explicitly use LOKALE_FIXTURE provenance. */
export const fixturePublicationContext={audience:'synthetic-test',language:'de',region:'CH',channel:'fixture',variant:'v1'};
export function fixtureGrantAdapterPermission(...args:Parameters<typeof grantAdapterPermission>){
 grantAdapterPermission(...args);
 const [db,input]=args;
 fixtureSecurityReview(db,adapterActionScope(input.adapter,input.experimentId,input.maxCostUsdCents),Date.now());
}
/** Explicit synthetic evidence for mock-only tests, never used by runtime. */
export function fixtureSecurityReview(db:Database,scope:ActionScope,now:number,requirements:readonly string[]=[],statements?:string[]){
 const target=scope.claimTarget??(['support-publication','external-publication'].includes(scope.activity)?{...fixturePublicationContext,productDigest:'a'.repeat(64),requirementsDigest:'b'.repeat(64),payloadDigest:scope.contextDigest}:undefined);
 const assertions:NonNullable<NonNullable<ActionScope['claimTarget']>['assertions']>=target?.assertions??statements?.map(statement=>({statement}))??[{statement:'Synthetic product fixture'}];
 registerActionReview(db,{...scope,reviewedBy:'synthetic-test-operator',classification:scope.dataClass??'PUBLIC',
  ...(target?{publicationClaims:{target,inventoryComplete:true as const,inventoryReviewer:'mock-independent-reviewer',claims:assertions.map(assertion=>({
   statement:assertion.statement,type:assertion.type??'function' as const,status:'BELEGT' as const,target,
   source:'https://example.invalid/mock-functional-capture',sourceContent:'Mock functional result',sourceDigest:createHash('sha256').update('Mock functional result').digest('hex'),
   observedAt:now,expiresAt:now+600000,method:assertion.type==='price'?'price_verification' as const:'functional_test' as const,provenance:'EXTERN_BEOBACHTET' as const,confidence:1,qualification:null,
  }))}}:{}),
  ...(scope.dataClass==='PERSONAL'?{privacy:{purpose:'customer-support',minimumFields:['mailbox','recipient','subject','body'],retentionDays:30,
   processors:[{id:'gmail',country:'CH',purpose:'customer-support'}]}}:{}),
  evidence:[...GATE_DOMAINS.map(domain=>({domain,requirement:domain as string})),...requirements.map(requirement=>({domain:'security' as const,requirement}))].map(({domain,requirement})=>({domain,requirement,jurisdiction:'CH',
   source:'https://example.invalid/synthetic-fixture',sourceDigest:'a'.repeat(64),observedAt:now,
   expiresAt:now+600000,decision:'APPROVED',reason:'Mock-only fixture, not real legal or security evidence'}))},now);
}
/** Existing transport tests supply an explicit mock content review before sending.
 * Claim-gate attack tests call the real send function without this preparation. */
export async function sendReviewedSupportFixture(...args:Parameters<typeof sendNextSupportReply>){
 const db=args[0];
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_support_replies'").get()){
  const rows=db.prepare("SELECT payload FROM obolus_support_replies WHERE status IN ('queued','deferred')").all() as {payload:string}[];
  for(const row of rows){const reply=JSON.parse(row.payload) as SupportReply;fixtureSecurityReview(db,supportContentActionScope(reply),Date.now(),PRODUCT_RELEASE_EVIDENCE,[reply.body]);}
 }
 return sendNextSupportReply(...args);
}
