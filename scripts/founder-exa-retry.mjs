const WINDOW=21600000;
export function transientExaFailure(code,httpStatus){
 return ['service_dns_failed','service_network_failed','service_timeout','service_rate_limited'].includes(code)||code==='service_read_failed'&&Number.isInteger(httpStatus)&&httpStatus>=500&&httpStatus<=599;
}
export function nextExaAttempt({now,last,count=0,windowEnd}){
 if(!last)return 0;
 const providerUntil=last.at+(last.retry_after_ms??0);
 if(providerUntil>now)return providerUntil;
 const [state,code,status]=last.status.split(':');
 if(Math.floor(last.at/WINDOW)!==Math.floor(now/WINDOW))return state==='attempted'||state==='failed'&&transientExaFailure(code,Number(status))?last.at+300000:0;
 if(state!=='failed'||!transientExaFailure(code,Number(status))||count>=3)return windowEnd;
 return Math.max(providerUntil,last.at+300000*2**Math.max(0,count-1));
}
