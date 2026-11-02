/** A complete test summary is necessary, not proof of independent correctness. */
export function completeTestSummary(stdout,exitCode){
 const counts={};let complete=typeof stdout==='string'&&stdout.length<=100000;
 for(const key of ['tests','pass','fail','cancelled','skipped','todo']){
  const rows=[...String(stdout??'').matchAll(new RegExp('^# '+key+' (\\d+)\\r?$','gm'))],value=Number(rows[0]?.[1]);
  if(rows.length!==1||!Number.isSafeInteger(value)||value<0||value>1000000)complete=false;
  counts[key]=value;
 }
 return {tests:Number.isSafeInteger(counts.tests)?counts.tests:0,passed:exitCode===0&&complete&&counts.tests>0&&counts.pass===counts.tests&&!counts.fail&&!counts.cancelled&&!counts.skipped&&!counts.todo};
}
