import {submissionIdentity} from './founder-work-context.mjs';
export function githubSubmissionBody({prepared,certificate,login,marker,identity,requirement}){
 let text=marker+'\n\nProposed fix for '+prepared.url+'.\n\nAI-assisted contribution by numaron for @'+login+'. Offline Node tests passed on the exact submitted files; regression fails against the original implementation. Network disabled; no host mounts. Image '+certificate.validation.image+'. Full project CI and maintainer acceptance are not confirmed. No payment or assignment is claimed.\n\nSource digest: '+certificate.digest;
 if(requirement){if(identity?.githubLogin!==login)throw Error('Payout identity mismatch');const value=submissionIdentity({identity,purpose:'payout',requirement});if(!value.payout)throw Error('Requested payout identity unavailable');text+='\n\nUSDC receiving address on Base, provided as requested: `'+value.payout.address+'`. This is receiving information, not confirmation of payment.';}
 return text;
}
