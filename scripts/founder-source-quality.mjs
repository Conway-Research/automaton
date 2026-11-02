// Goals only filter already-public sources locally; never transmit private planner text.
export function researchGoalFor(task,history){
 if(task.input?.researchGoal)return task.input.researchGoal;
 const parents=history.filter(p=>task.dependencies?.includes(p.id));
 return parents.length===1?parents[0].input?.title??task.input?.title:task.input?.title;
}
export function selectResearchSource(sources,goal,publicUrl){
 const candidates=sources.filter(s=>s.privacy!=='private'&&publicUrl(s.url));
 const title=String(goal??'');
 const exact=title.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:issues|pull)\/\d+)?/i)?.[0];
 const named=title.match(/^\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\s*:/);
 const owner=exact?.split('/')[3]??named?.[1];
 const repo=exact?.split('/')[4]??named?.[2]??title.match(/^\s*([A-Za-z0-9_.]+(?:-[A-Za-z0-9_.]+)+)\s*:/)?.[1];
 let scoped=candidates;
 if(repo)scoped=scoped.filter(s=>{try{const u=new URL(s.url);return u.hostname==='github.com'&&u.pathname.split('/')[2]?.toLowerCase()===repo.toLowerCase()&&(!owner||u.pathname.split('/')[1]?.toLowerCase()===owner.toLowerCase());}catch{return false;}});
 // A public repository establishes where to read, never the status of a derived PR.
 const pr=title.match(/\bPR\s*#\s*([1-9]\d*)\b/i)?.[1];
 if(pr&&owner&&repo&&scoped.length){
  const url=publicUrl(`https://github.com/${owner}/${repo}/pull/${pr}`);
  if(!url)return null;
  return scoped.find(s=>s.url===url)??{url,retrievalTargetOnly:true,derivedFrom:scoped[0].url};
 }
 if(exact){const exactMatch=scoped.find(s=>s.url===exact);if(exactMatch)return exactMatch;}
 return scoped[0]??null;
}
export function cleanResearchMarkdown(markdown,url){
 let text=String(markdown??'').replace(/\r\n/g,'\n');
 let github=false;try{github=new URL(url).hostname==='github.com';}catch{}
 if(!github)return text.trim();
 // GitHub file pages place the actual rendered Markdown after this UI boundary.
 const marker=text.match(/(?:^|\n)Edit and raw actions\s*\n/);
 if(marker)text=text.slice(marker.index+marker[0].length);
 const lines=text.split('\n');let fenced=false;
 return lines.filter(line=>{
  if(/^\s*(```|~~~)/.test(line)){fenced=!fenced;return true;}
  if(fenced)return true;
  return !/^\s*(?:You signed (?:in|out) with another tab|You switched accounts|You must be signed in|\[Skip to content\]|\[Permalink:|\{\{ message \}\}|Dismiss alert|(?:Sign in|Sign up|Blame|More file actions|Copy path|Copy raw file|Download raw file|Outline|Edit and raw actions|Collapse file tree|File metadata and controls)\s*$)/i.test(line);
 }).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
