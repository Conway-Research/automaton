// Screening only. Listing metadata is a claim, never assignment/payment authority.
// No I/O, provider calls, state changes or automatic messages.
export function orderSelectionMetadata(row){
 const result={};
 for(const key of ['proposalCount','applicationFeeMinor'])if(Number.isSafeInteger(row?.[key])&&row[key]>=0)result[key]=row[key];
 const enums={fit:['strong','possible','incompatible'],scope:['bounded','large'],acceptance:['clear','unknown'],payment:['protected','unknown'],aiUse:['allowed','unknown']};
 for(const [key,values] of Object.entries(enums))if(values.includes(row?.[key]))result[key]=row[key];
 for(const key of ['requiresWorkerDeposit','identityMisrepresentation','eligibilityMismatch','aiForbidden','adapterAvailable','humanPresence','personalIdentity','promptInjection','termsUnreadable'])if(typeof row?.[key]==='boolean')result[key]=row[key];
 if(typeof row?.deadline==='string'&&row.deadline.length<=40)result.deadline=row.deadline;
 return result;
}
export function selectOrderCandidate(c,{now=Date.now()}={}){
 const questions=[],reasons=[];
 const result=(decision,score=0)=>({decision,score,questions,reasons,executionAuthorized:false,paymentVerified:false,contactAuthorized:false});
 if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.title!=='string'||!c.title.trim()||c.title.length>500){reasons.push('invalid-listing');return result('exclude');}
 for(const flag of ['requiresWorkerDeposit','identityMisrepresentation','eligibilityMismatch','aiForbidden'])if(c[flag]===true)reasons.push(flag);
 if(['closed','cancelled','canceled','filled','archived'].includes(c.remoteState))reasons.push('not-open');
 if(c.fit==='incompatible')reasons.push('unsupported-work');
 if(reasons.length)return result('exclude');
 let score=c.fit==='strong'?50:c.fit==='possible'?30:10;
 if(!['strong','possible'].includes(c.fit))questions.push('Which deliverable fits our demonstrated capabilities and available runtime?');
 const seen=Date.parse(c.observedAt),fresh=Number.isFinite(seen)&&seen<=now+1000&&now-seen<=7*86400000;
 const deadline=c.deadline==null?null:Date.parse(c.deadline);
 if(!fresh||c.remoteState!=='open'||deadline!==null&&(!Number.isFinite(deadline)||deadline<=now))questions.push('Is the job still available, with a current deadline and no existing hire?');
 if(!Number.isSafeInteger(c.proposalCount)||c.proposalCount<0)questions.push('How many active proposals or competing solutions are there?');
 else if(c.proposalCount<=30)score+=30;
 else if(c.proposalCount<=60){score+=10;if(c.fit!=='strong')questions.push('What specific advantage makes our proposal worthwhile despite the competition?');}
 else questions.push('What demonstrated capability makes our solution valuable despite the competition?');
 if(!['bounded','large'].includes(c.scope))questions.push('Can we agree exact inputs, outputs, exclusions, acceptance and delivery time for the full technically feasible scope?');
 if(c.acceptance!=='clear')questions.push('What reproducible checks, review period and correction round define acceptance?');
 if(c.payment!=='protected')questions.push('Will the client fully fund the agreed platform escrow/milestone before work, with asset, fees and release terms confirmed?');
 if(c.aiUse!=='allowed')questions.push('Is transparently disclosed AI-assisted delivery permitted by the customer and project rules?');
 if(c.applicationFeeMinor!==0)questions.push('Is there an authorized application route without deposit, paid verification or proposal fee?');
 if(c.adapterAvailable===false)questions.push('Which official permitted contact route or reviewed adapter is available?');
 if(typeof c.url!=='string'||!/^https:\/\/[^\s]+$/.test(c.url)||c.url.length>2000)questions.push('What is the original authoritative listing URL?');
 if(c.humanPresence===true)questions.push('Is in-person, call or camera participation really required, or can the work be delivered without it?');
 if(c.personalIdentity===true)questions.push('Which personal identity, CV or location requirement applies, and can it be met without misrepresentation?');
 if(c.promptInjection===true)questions.push('Listing text contains instructions aimed at an automated reader; is this a genuine order?');
 if(c.termsUnreadable===true)questions.push('Which traceable translation of the listing and its terms is available?');
 if(c.acceptance==='clear')score+=10;
 if(c.payment==='protected')score+=10;
 return result(questions.length?'clarify':'propose',score);
}
export function selectOrderObservations(observations,{now=Date.now()}={}){
 const latest=new Map();
 for(const o of observations??[]){if(o?.kind!=='listing')continue;const key=JSON.stringify([o.sourceId,o.externalId]),previous=latest.get(key);if(!previous||Date.parse(o.observedAt)>=Date.parse(previous.observedAt))latest.set(key,o);}
 return [...latest.values()].map(o=>({sourceId:o.sourceId,externalId:o.externalId,revision:o.revision,evidenceRef:o.evidenceRef,selection:selectOrderCandidate({...o.data,observedAt:o.observedAt},{now})})).sort((a,b)=>b.selection.score-a.selection.score||String(a.externalId).localeCompare(String(b.externalId)));
}
