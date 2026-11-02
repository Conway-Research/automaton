// Preserve each source interval and shared provider pause; never overlap rounds.
export function nextMonitorDue(sources,state,now=Date.now()){
 const deadlines=sources.map(s=>Math.max(state.get(s.id).nextAt??0,s.provider?state.get('__provider-'+s.provider).nextAt??0:0)).filter(Number.isFinite);
 return Math.max(now+15000,deadlines.length?Math.min(...deadlines):now+600000);
}
