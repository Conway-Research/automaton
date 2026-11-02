import {createHash} from 'node:crypto';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
/** Conservative whitespace repair; preserve Markdown hard breaks and fenced code. */
export function inspectWriting(content:string,format:'text'|'markdown'){
 if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>100000||!['text','markdown'].includes(format))throw Error('Bounded text or Markdown required');
 const findings:{code:string;line:number}[]=[],lines=content.replace(/\r\n?/g,'\n').split('\n');
 let fence:string|null=null,previousHeading=0;
 const repaired=lines.map((line,i)=>{
  if(format==='markdown'){
   const marker=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
   if(fence){
    // A closing fence cannot have an info string, use a different marker or be too short.
    if(marker&&marker[1][0]===fence[0]&&marker[1].length>=fence.length&&/^[ \t]*$/.test(marker[2]))fence=null;
    return line;
   }
   if(marker&&(marker[1][0]!=='`'||!marker[2].includes('`'))){fence=marker[1];return line;}
   // Preserve possibly indented code rather than applying prose whitespace repairs to it.
   if(/^(?: {4}|\t)/.test(line))return line;
   const heading=line.match(/^(#{1,6})\s+\S/);if(heading){if(previousHeading&&heading[1].length>previousHeading+1)findings.push({code:'heading_level_jump',line:i+1});previousHeading=heading[1].length;}
  }
  if(/[ \t]+$/.test(line)&&!(format==='markdown'&&/[^ ] {2}$/.test(line)))findings.push({code:'trailing_whitespace',line:i+1});
  if(/\b([\p{L}]{2,})\s+\1\b/iu.test(line))findings.push({code:'possible_repeated_word',line:i+1});
  if(/\s+[,.!?;:](?:\s|$)/.test(line))findings.push({code:'space_before_punctuation',line:i+1});
  return format==='markdown'&&/[^ ] {2,}$/.test(line)?line.replace(/ {3,}$/,'  '):line.replace(/[ \t]+$/,'');
 });
 if(fence)findings.push({code:'unclosed_code_fence',line:lines.length});
 const corrected=repaired.join('\n');
 return {sourceDigest:hash(content),correctedDigest:hash(corrected),findings:findings.slice(0,100),findingsTruncated:findings.length>100,corrected,changed:corrected!==content,
  languageStatus:'not_checked',limitation:'Conservative formatting repair only. Repeated words/punctuation are suggestions, not automatic semantic changes. Spelling and grammar require a language checker. Markdown rendering is not visually verified.'};
}
/** Operator-selected local LanguageTool only: never send product text to a public service. */
export async function checkLocalLanguage(content:string,language:string,endpoint:string|undefined,request:typeof fetch=fetch){
 if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>20000||!['de-CH','de-DE','en-US','en-GB','fr','it'].includes(language))throw Error('Bounded text and supported explicit language required');
 if(!endpoint)return {status:'unavailable',matches:[],sourceDigest:hash(content),reason:'Local language checker not configured'};
 const url=new URL(endpoint);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/v2/check'||url.search||url.hash)throw Error('Language checker must be an explicit loopback /v2/check endpoint');
 try{
  const response=await request(url.toString(),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({text:content,language})});
  if(!response.ok||!response.body)throw Error();
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144)throw Error();parts.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
  const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(!Array.isArray(data.matches)||data.matches.length>100||data.warnings?.incompleteResults===true)throw Error();
  const matches=data.matches.map((m:any)=>{
   if(!Number.isInteger(m.offset)||!Number.isInteger(m.length)||m.offset<0||m.length<1||m.offset+m.length>content.length||typeof m.rule?.id!=='string'||m.rule.id.length>100||!Array.isArray(m.replacements))throw Error();
   return {offset:m.offset,length:m.length,ruleId:m.rule.id,replacements:m.replacements.slice(0,3).map((r:any)=>{if(typeof r.value!=='string'||r.value.length>200)throw Error();return r.value;})};
  });
  return {status:matches.length?'corrections_required':'checked_no_findings',matches,sourceDigest:hash(content),limitation:'No reported findings is not proof of flawless language or factual correctness. Recheck every corrected version.'};
 }catch{return {status:'unavailable',matches:[],sourceDigest:hash(content),reason:'Local checker failed or returned incomplete/invalid results'};}
}
