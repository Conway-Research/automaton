// Offline-only correction of a redundant reference list. Never invent a citation,
// rewrite prose/candidates, relax validation, or perform a provider request.
export function repairExplicitSourceList(original){
 const a=original?.analysis,s=original?.sources;
 if(original?.status!=='completed'||!Array.isArray(s)||!Array.isArray(a?.sourceIds)||s.some(x=>typeof x.id!=='string'))return null;
 const known=new Set(s.map(x=>x.id));if(known.size!==s.length)return null;
 const unknown=a.sourceIds.filter(id=>!known.has(id));if(unknown.length!==1)return null;
 const rest=structuredClone(original);delete rest.analysis.sourceIds;
 if(JSON.stringify(rest).includes(unknown[0]))return null;
 const explicit=[...String(a.summary??'').matchAll(/\[([^\[\]]+)\]/g),...String(a.nextStep??'').matchAll(/\[([^\[\]]+)\]/g)].flatMap(m=>m[1].split(',').map(id=>id.trim()));
 if(explicit.some(id=>!known.has(id)))return null;
 const missing=[...new Set(explicit.filter(id=>!a.sourceIds.includes(id)))];if(missing.length!==1)return null;
 if((a.candidates??[]).some(c=>!Array.isArray(c.evidenceIds)||c.evidenceIds.some(id=>!known.has(id))))return null;
 const result=structuredClone(original);result.analysis.sourceIds=a.sourceIds.map(id=>id===unknown[0]?missing[0]:id);
 if(new Set(result.analysis.sourceIds).size!==result.analysis.sourceIds.length)return null;
 return {result,from:unknown[0],to:missing[0],basis:'Exact existing bracket citation; redundant sourceIds list only'};
}
