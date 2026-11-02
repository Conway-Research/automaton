import {bounded,digest} from './founder-restoration-integrity.mjs';
import {createUgigContractReader,validateUgigAgreementBase} from './founder-ugig-pilot-contract.mjs';
// Trusted profile callbacks are supplied by application code, never by a contract.
// This reader confirms assignment only; it neither grants work nor delivers files.
export function ugigOrderScopeDigest(a){const terms=a.paymentAuthorization??a.funding;return digest({schema:'ugig-order-scope-v1',...Object.fromEntries(['sourceId','externalId','ownerId','rootTaskId','sourceRevision','profileId','workKind','deliveryRequirements','gigId','applicationId','conversationId','buyerId','inputs','files','data','report','contentBrief','qualityContract','dataUse','allowedChanges','sources','metadataOnlyAccepted','privacy','acceptanceCriteria','deadline','deliveryChannel','deliveryAllowed','deliveryProtocol','conversationBinding','aiAllowed','agreementEvidence',...(a.profileId==='reviewed-binary'?['binaryArtifacts','binaryProvenance']:[])].map(k=>[k,a[k]??null])),paymentTerms:Object.fromEntries(['paymentMode','amountMinor','netAmountMinor','currency','recipient','settlement','policyVersion','exposureRappen','commitmentDigest','contractDigest'].map(k=>[k,terms?.[k]??null]))});}
export function validateUgigOrderAgreement(a,profileValidators={}){return validateUgigAgreementBase(a,{
 allowedDeliveryProtocols:['numbered-messages-v1','binary-attachments-v1','mixed-files-v1'],
 validateIdentity:a=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(a.gigId)&&a.externalId==='application:'+a.gigId&&a.rootTaskId==='ugig-'+digest(a.gigId).slice(0,24),
 validateProfile:a=>bounded(a.profileId)&&Object.hasOwn(profileValidators,a.profileId)&&typeof profileValidators[a.profileId]==='function'&&profileValidators[a.profileId](a)===true&&Array.isArray(a.inputs)&&a.inputs.length>0,
 scopeDigest:ugigOrderScopeDigest});}
export function createUgigOrderContract({profileValidators={},...options}){const policies=Object.freeze({...profileValidators});return {...createUgigContractReader({...options,validateAgreement:a=>validateUgigOrderAgreement(a,policies)}),status:()=>({profileIds:Object.keys(policies),liveReady:false,assignmentReaderOnly:true,workAuthorized:false,submissionConfigured:false})};}
import {createUgigEvidenceReaders} from './founder-ugig-evidence.mjs';
/** Opt-in composition. Reads operator-approved packs, never creates grants.
 * Funding verification and independent product/delivery adapters remain mandatory
 * in any caller that subsequently promotes an assignment into executable work. */
export function createUgigReviewedOrderContract({base,isEnabled,profileValidators={},request,credential,now=Date.now}){
 const policies=Object.freeze({...profileValidators});
 const evidence=createUgigEvidenceReaders({base,isEnabled,now,validateAgreement:a=>validateUgigOrderAgreement(a,policies)});
 const contract=createUgigOrderContract({isEnabled,request,credential,now,profileValidators:policies,getReviewedAgreement:evidence.agreement,getReviewedLifecycleMessages:evidence.lifecycleMessages});
 return {...contract,access:evidence.access};
}
