// Search terms must already occur in public evidence. Never send private metadata or
// arbitrary planner text (which may quote the protected mission) to search services.
export function publicResearchQuery(ctx,fallback){
 const target=ctx.task?.input?.repairTargetUrl;
 if(target&&(ctx.dependencies??[]).some(r=>r.privacy!=='private'&&(r.sources??[]).some(s=>s.privacy!=='private'&&s.url===target))){
  try{const u=new URL(target),p=u.pathname.split('/').filter(Boolean);if(u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.port&&!u.search&&p.length>=2&&p.slice(0,2).every(x=>/^[A-Za-z0-9_.-]+$/.test(x)))return `site:github.com/${p[0]}/${p[1]} issues pull requests status`; }catch{}
 }
 const words=x=>String(x??'').toLowerCase().match(/\b[a-z]{4,24}\b/g)??[];
 const allowed=new Set((ctx.dependencies??[]).filter(r=>r.privacy!=='private').flatMap(r=>(r.sources??[]).filter(s=>s.privacy!=='private').flatMap(s=>words(s.claim))));
 const terms=[...new Set(words(ctx.task?.input?.title))].filter(w=>allowed.has(w)).slice(0,10);
 return terms.length>=2?terms.join(' '):fallback;
}
