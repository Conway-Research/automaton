/** Text retrieval only. Model-authored Python is never imported or evaluated.
 * The full source remains in the journal; only useful interfaces and exact
 * diagnostic excerpts enter subsequent component prompts.
 */
export function projectSourceContext(files,design,feedback=''){
 const modules=new Set(design.components.filter(c=>c.path.endsWith('.py')).map(c=>c.path.slice(0,-3).replaceAll('/','.')));
 const diagnostic=String(feedback).replaceAll('\\"','"'),locations=new Map();
 for(const match of diagnostic.matchAll(/"file"\s*:\s*"\/source\/([A-Za-z0-9_./-]+)"[^\n]*?"line"\s*:\s*(\d+)/g)){
  if(!files.some(f=>f.path===match[1]))continue;
  const list=locations.get(match[1])??[];if(list.length<3)list.push(Number(match[2]));locations.set(match[1],list);
 }
 return files.filter(f=>f.path.endsWith('.py')).map(file=>{
  const lines=file.content.split('\n'),imports=[],declarations=[],projectAliases=new Set(),calls=[];
  for(const [index,line]of lines.entries()){
   const clean=line.trim();
   if(/^(?:from\s|import\s)/.test(clean)){
    imports.push(clean.slice(0,220));
    const from=clean.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
    if(from)for(const item of from[2].split(',')){const alias=item.trim().match(/^(\w+)(?:\s+as\s+(\w+))?/);if(alias&&(modules.has(from[1])||modules.has(from[1]+'.'+alias[1])))projectAliases.add(alias[2]??alias[1]);}
    const direct=clean.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/);if(direct&&modules.has(direct[1]))projectAliases.add(direct[2]??direct[1].split('.')[0]);
   }
   if(/^\s*(?:async\s+)?(?:def|class)\s/.test(line))declarations.push({line:index+1,text:line.slice(0,240)});
  }
  for(const line of lines){
   const assignment=line.match(/^\s*((?:self\.)?\w+)\s*=\s*(\w+)\s*\(/);if(assignment&&projectAliases.has(assignment[2]))projectAliases.add(assignment[1]);
   if(calls.length<16&&[...projectAliases].some(alias=>line.includes(alias+'(')||line.includes(alias+'.')))calls.push(line.slice(0,240));
  }
  const excerpts=[];
  for(const at of locations.get(file.path)??[]){const start=Math.max(0,at-9),end=Math.min(lines.length,at+8);excerpts.push({startLine:start+1,text:lines.slice(start,end).join('\n').slice(0,3000)});}
  return {path:file.path,lineCount:lines.length,imports:imports.slice(0,24),declarations:declarations.slice(0,64),projectCallExamples:[...new Set(calls)],excerpts};
 });
}
