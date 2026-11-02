// Select verbatim evidence only. This does not infer PR status or execute source text.
export function sourceExcerpt(source){
 const text=String(source.claim),limit=450;let github=false;
 try{github=new URL(source.url).hostname==='github.com';}catch{}
 const pattern=/merged\s+commit\b|"merged"\s*:\s*(?:true|false)|"state"\s*:\s*"(?:open|closed)"|\b(?:reopened|closed)\s+(?:this\s+)?(?:pull request|issue)\b/gi;
 const hits=github?[...text.matchAll(pattern)]:[];
 let claim=text.slice(0,limit),selection='prefix';
 if(text.length>limit&&hits.some(h=>h.index>=limit)){
  // Keep surrounding actor, commit link, branch and date together for a merge event.
  const primary=hits.find(h=>/^merged\s+commit/i.test(h[0]))??hits.find(h=>/^"merged"/.test(h[0]))??hits[0];
  const start=Math.max(0,primary.index-40),end=Math.min(text.length,Math.max(start+400,primary.index+primary[0].length));
  claim='[Partial source excerpt]\n'+text.slice(start,end);selection='status-focused';
 }
 return {claim:claim.slice(0,limit),excerpt:{selection,originalCharacters:text.length,complete:text.length<=limit&&source.contentQuality?.truncated!==true,truncated:text.length>limit||source.contentQuality?.truncated===true}};
}
