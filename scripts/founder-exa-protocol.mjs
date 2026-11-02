export function exaFailure(code){const error=Error('Exa '+code);error.diagnostic={code};return error;}
export function exaResult(text){
 let obj;try{obj=JSON.parse(text);}catch{
  const events=text.replace(/\r\n/g,'\n').split(/\n\n+/);
  for(const event of events){try{const candidate=JSON.parse(event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n'));if(candidate.id===1){obj=candidate;break;}}catch{}}
 }
 if(obj?.error||obj?.result?.isError)throw exaFailure('service_tool_error');
 if(!obj?.result||obj.id!==1)throw exaFailure('service_invalid_response');return obj.result;
}
export function exaSources(result){
 const rows=value=>{const list=Array.isArray(value)?value:value?.results;return Array.isArray(list)?list.filter(r=>typeof r?.url==='string').map(r=>({url:r.url,claim:[r.title,r.text,r.summary,...(Array.isArray(r.highlights)?r.highlights:[])].filter(x=>typeof x==='string').join('\n')})):[];};
 const structured=rows(result.structuredContent);if(structured.length)return structured;
 const out=[];for(const block of result.content??[]){if(block.type!=='text'||typeof block.text!=='string')continue;
  try{const parsed=rows(JSON.parse(block.text));if(parsed.length){out.push(...parsed);continue;}}catch{}
  for(const section of block.text.split(/(?=^Title:)/m)){const url=section.match(/^URL:\s*(https:\/\/[^\s]+)\s*$/m)?.[1];if(url)out.push({url,claim:section});}
 }
 return out;
}
