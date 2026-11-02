// Explicit operator diagnostic, independent of scheduler; never starts/stops services or writes budgets.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),reportFile=new URL('artifacts/founder-repair-20261015/firecrawl-keyless-local-check.json',root);
const power=()=>JSON.parse(fs.readFileSync(new URL('artifacts/founder-integration-20261012/power-state.jsonl',root),'utf8').trim().split(/\r?\n/).at(-1));
const report={at:new Date().toISOString(),mode:'official-keyless-free',endpoint:'https://api.firecrawl.dev/v2/scrape',target:'https://docs.firecrawl.dev/rate-limits',success:false,budgetsModified:false,powerModified:false,restartPerformed:false};
try{
 if(power().enabled!==true)throw Error('Numaron is OFF; diagnostic will not perform provider work');
 const response=await fetch(report.endpoint,{method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json'},body:JSON.stringify({url:report.target,formats:['markdown'],onlyMainContent:true,proxy:'basic',timeout:20000})});
 report.httpStatus=response.status;
 if(!response.ok){await response.body?.cancel();throw Error(`Firecrawl HTTP ${response.status}; no fallback or retry`);}
 if(!response.body)throw Error('Empty response');const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>250000)throw Error('Response too large');chunks.push(r.value);}}finally{await reader.cancel();}
 const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(result.success!==true||typeof result.data?.markdown!=='string'||!result.data.markdown.trim())throw Error('No usable page returned');
 if(result.data.metadata?.statusCode&&result.data.metadata.statusCode!==200)throw Error('Target page did not return HTTP 200');
 report.success=true;report.markdownCharacters=result.data.markdown.length;report.powerStillOn=power().enabled===true;
}catch(error){report.error=error.cause?.code??error.message;process.exitCode=1;}
fs.mkdirSync(new URL('artifacts/founder-repair-20261015/',root),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,reportFile:fileURLToPath(reportFile)},null,2));
