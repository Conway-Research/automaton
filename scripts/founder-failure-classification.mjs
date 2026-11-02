// Only exact locally generated guard messages are interpreted. Never publish error text.
function classifyFailureCode(error){
 const message=typeof error?.message==='string'?error.message:'';
 if(message==='Communication HTTP 404'||message==='Communication HTTP 410')return {code:'policy_blocked'};
 if(['GitHub access required','uGig access required','Dealwork access required'].includes(message))return {code:'service_unauthorized'};
 if(/^Communication HTTP 5\d\d$/.test(message))return {code:'service_read_failed',httpStatus:Number(message.slice(-3))};
 if(error?.name==='TimeoutError')return {code:'service_timeout'};
 if(['ENOTFOUND','EAI_AGAIN'].includes(error?.cause?.code))return {code:'service_dns_failed'};
 if(['ECONNRESET','ECONNREFUSED','ETIMEDOUT'].includes(error?.cause?.code))return {code:'service_network_failed'};
 if(message==='Job not eligible for autonomous communication'||message==='uGig job not eligible'||message==='Explicit reward required'||message==='Job outside supported technical profiles')return {code:'policy_blocked'};
 if(/^Current independently observed source receipt unavailable: (ugig|github|dealwork|synmerco|gmail)$/.test(message)||message==='Source action blocked: capability-unverified-or-expired')return {code:'source_evidence_unavailable'};
 if(message==='Communication HTTP 401'||message==='Communication HTTP 403')return {code:'service_unauthorized',httpStatus:Number(message.slice(-3))};
 if(message==='Communication HTTP 429'||message==='Communication access/rate cooldown')return {code:'service_rate_limited'};
 const allowed=['service_unauthorized','service_rate_limited','service_read_failed','service_dns_failed','service_timeout','service_network_failed','service_tool_error','service_invalid_response','service_no_results','service_evidence_filtered'];
 return {code:allowed.includes(error?.diagnostic?.code)?error.diagnostic.code:'local_read_failed',...(Number.isInteger(error?.diagnostic?.httpStatus)?{httpStatus:error.diagnostic.httpStatus}:{})};
}
export function communicationRetryAllowed(error){
 const d=classifyLocalFailure(error);
 return ['service_rate_limited','service_dns_failed','service_network_failed','service_timeout'].includes(d.code)||(d.code==='service_read_failed'&&d.httpStatus>=500&&d.httpStatus<=599);
}

// Only bounded, enumerated metadata from read-only transport failures is public.
export function classifyLocalFailure(error){
 const result=classifyFailureCode(error),r=error?.communicationRead;
 if(r&&['github','ugig','dealwork'].includes(r.source)&&['identity','job','messages','applications','conversations','list'].includes(r.operation)&&['headers','body','decode'].includes(r.phase)&&Number.isInteger(r.elapsedMs)&&r.elapsedMs>=0&&r.elapsedMs<=240000)
  return {...result,readSource:r.source,readOperation:r.operation,readPhase:r.phase,readElapsedMs:r.elapsedMs};
 return result;
}
