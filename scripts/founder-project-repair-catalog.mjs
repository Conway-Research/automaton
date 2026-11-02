/** Declaration candidates for constrained model selection, never an execution
 * authority. The existing isolated AST reader must still validate/read the
 * chosen definition. No candidate source is imported or evaluated here.
 * Explicit request versioning keeps historical model payloads unchanged.
 */
function declarationText(text){
 let masked='',quote=null;
 for(let i=0;i<text.length;){
  const c=text[i],space=v=>v==='\n'||v==='\r'?v:' ';
  if(quote){
   if(c==='\\'){masked+=' ';i++;if(i<text.length)masked+=space(text[i++]);continue;}
   if(text.startsWith(quote,i)){masked+=' '.repeat(quote.length);i+=quote.length;quote=null;continue;}
   masked+=space(c);i++;continue;
  }
  if(c==='#'){while(i<text.length&&text[i]!=='\n')masked+=space(text[i++]);continue;}
  if(c==='"'||c==="'"){quote=text.startsWith(c.repeat(3),i)?c.repeat(3):c;masked+=' '.repeat(quote.length);i+=quote.length;continue;}
  masked+=c;i++;
 }
 return masked;
}
export function repairSelectionCatalog(request){
 if(request.repairSelectionCatalog===undefined)return null;
 if(request.repairSelectionCatalog!=='qualified-declarations-v1'||request.phase!=='repair'||request.repairProtocol!=='inspect-and-patch-v2'||request.repairTools!=='contextual-v1'||request.repairInspection!=='selected-source-only-v1'||!Array.isArray(request.files))throw Error('Exact scoped qualified source catalog required');
 const catalog=Object.create(null);let total=0;
 for(const file of request.files){
  const names=[],stack=[];catalog[file.path]=names;
  if(!file.path.endsWith('.py'))continue;
  for(const line of declarationText(file.content).split('\n')){
   const match=line.match(/^([ \t]*)(?:async\s+)?(class|def)\s+([A-Za-z_][A-Za-z0-9_]*)\b/);if(!match)continue;
   const indent=match[1].replaceAll('\t','        ').length;
   while(stack.length&&stack.at(-1).indent>=indent)stack.pop();
   const name=[...stack.filter(s=>s.kind==='class').map(s=>s.name),match[3]].join('.');
   if(!stack.some(s=>s.kind==='def')&&name.length<=100&&total<512&&!names.includes(name)){names.push(name);total++;}
   stack.push({indent,kind:match[2],name:match[3]});
  }
 }
 return catalog;
}
export function validateRepairCatalogSelection(request,selection){
 const catalog=repairSelectionCatalog(request);return catalog===null||Object.hasOwn(catalog,selection.path)&&Array.isArray(selection.symbols)&&selection.symbols.every(name=>catalog[selection.path].includes(name));
}
