/** Preserve observed execution facts, never infer successful output from null. */
export function enrichExecutionFeedback(feedback,verification,filesDigest){
 if(!feedback||!verification||verification.filesDigest!==filesDigest||feedback.filesDigest!==filesDigest)throw Error('Exact current verified source required for execution evidence');
 return {...feedback,examples:(feedback.examples??[]).slice(0,8).map(example=>{
  const check=(verification.checks??[]).find(c=>c.id===example.id);
  if(!check||JSON.stringify(check.feedback??{})!==JSON.stringify(example.feedback??{}))throw Error('Exact matching execution check required');
  return {...example,...(Number.isInteger(check.exitCode)?{exitCode:check.exitCode}:{}),...(check.execution?{execution:check.execution}:{}),...(check.notRun?{notRun:true}:{})};
 })};
}
export function executionObservations(checks){
 return checks.filter(c=>!c.notRun&&typeof c.id==='string'&&c.feedback).slice(0,6).map(c=>{
  const raw=c.feedback.rawOutput,captured=typeof raw==='string',e=c.execution;
  if(e){
   if(e.schema!=='captured-process-output-v1'||!['valid-json','empty','invalid-json'].includes(e.stdoutStatus)||!Number.isSafeInteger(e.stdoutLength)||e.stdoutLength<0||typeof e.stdoutPreview!=='string'||e.stdoutPreview.length>600||e.stdoutPreview.length>e.stdoutLength||typeof e.stdoutTruncated!=='boolean'||e.stdoutTruncated!==(e.stdoutLength>e.stdoutPreview.length)||(e.stdoutStatus==='empty'&&e.stdoutLength!==0))throw Error('Exact bounded process output observation required');
   return {caseId:c.id,exitCode:Number.isInteger(c.exitCode)?c.exitCode:null,...e};
  }
  // Historical rawOutput is a suffix captured only after parse failure. It is
  // not safe to parse it again or claim its length is the full process output.
  return {caseId:c.id,exitCode:Number.isInteger(c.exitCode)?c.exitCode:null,stdoutStatus:captured?(raw.length===0?'empty':'unparsed-preview'):'not-captured',...(captured?{stdoutLength:raw.length===0?0:null,stdoutPreviewLength:raw.length,stdoutPreview:raw.slice(0,600)}:{})};
 });
}
