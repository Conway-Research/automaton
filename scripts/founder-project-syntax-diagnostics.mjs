const syntaxTypes=new Set(['SyntaxError','IndentationError','TabError']);
const safeFile=file=>typeof file==='string'&&/^[A-Za-z0-9_./-]+\.py$/.test(file)&&!file.split('/').some(p=>p==='.'||p==='..');
export function validateRepairDiagnosticsPolicy(request){if(request.repairDiagnosticsPolicy===undefined)return;if(!['syntax-aware-v2','execution-aware-v3'].includes(request.repairDiagnosticsPolicy)||request.phase!=='repair'||request.repairProtocol!=='inspect-and-patch-v2'||request.repairTools!=='contextual-v1'||request.repairInspection!=='selected-source-only-v1'||!['synthetic','public'].includes(request.privacy)||(request.repairDiagnosticsPolicy==='execution-aware-v3'&&request.privacy!=='synthetic'))throw Error('Exact scoped syntax-aware repair diagnostics policy required');}
export function validSourceSyntaxDiagnostic(value,file){return value?.file===file&&safeFile(file)&&Number.isSafeInteger(value.line)&&value.line>0&&value.line<=10000&&syntaxTypes.has(value.type)&&typeof value.message==='string'&&value.message.length<=400;}
function arrayAt(text,start){let depth=0,string=false,escape=false;for(let i=start;i<text.length;i++){const c=text[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='[')depth++;else if(c===']'&&--depth===0){try{return JSON.parse(text.slice(start,i+1));}catch{return null;}}}return null;}
/** Reads actual bounded diagnostics only; never imports source or fabricates
 * locations from ordinary runtime frames. Default callers remain unchanged. */
export function syntaxSourceExceptions(feedback={}){
 const result=[],seen=new Set(),parts=[String(feedback.log??''),...(feedback.examples??[]).slice(0,8).map(c=>String(c.feedback?.error??''))].map(s=>s.slice(-16384));
 function add(file,line,type,message){
  if(!safeFile(file)||!Number.isSafeInteger(line)||line<1||line>10000||!syntaxTypes.has(type)||typeof message!=='string')return;
  const explicit=message.match(/\(([A-Za-z0-9_./-]+\.py), line (\d+)\)/);if(explicit&&safeFile(explicit[1])){file=explicit[1];line=Number(explicit[2]);if(line<1||line>10000)return;}
  const value={file,line,type,message:message.slice(0,300)},key=JSON.stringify(value);if(!seen.has(key)&&result.length<6){seen.add(key);result.push(value);}
 }
 for(const part of parts){
  for(const text of new Set([part,part.replaceAll('\\"','"')])){
   const marker='NUMARON_SOURCE_EXCEPTIONS ';let from=0,at;
   while((at=text.indexOf(marker,from))>=0){const start=at+marker.length;from=start;let first=start;while(/\s/.test(text[first]??'')&&first<text.length)first++;if(text[first]!=='[')continue;const values=arrayAt(text,first);if(Array.isArray(values))for(const e of values.slice(0,12)){if(typeof e?.file==='string'&&e.file.startsWith('/source/'))add(e.file.slice(8),e.line,e.type,e.message);}}
  }
  let location=null;
  for(const line of part.split(/\r?\n/)){
   if(line.startsWith('Traceback '))location=null;
   const file=line.match(/^\s*File ["']\/source\/([A-Za-z0-9_./-]+\.py)["'], line (\d+)\s*$/);if(file){location={file:file[1],line:Number(file[2])};continue;}
   const error=line.match(/^\s*(SyntaxError|IndentationError|TabError):\s*(.*)$/);if(error){if(location)add(location.file,location.line,error[1],error[2]);location=null;}else if(/^\s*[A-Za-z_][\w.]*(?:Error|Exception):/.test(line))location=null;
  }
 }
 return result;
}
