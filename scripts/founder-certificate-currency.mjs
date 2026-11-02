const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
/** Source-file comparison only. Neither running-code attestation nor permission. */
export function projectCertificateCurrency(certificates,currentRevision){
 if(!Array.isArray(certificates)||certificates.length>2048)throw Error('Invalid certificate bounds');
 return certificates.map(c=>{
  const passed=c?.status==='passed'&&c.scope==='offline-synthetic'&&hex(c.revision)&&c.finishedRevision===c.revision&&c.exitCode===0&&Number.isSafeInteger(c.tests)&&c.tests>0&&c.tests<=1000000&&c.passed===c.tests&&[c.failed,c.skipped,c.cancelled,c.todo].every(n=>n===0);
  const currency=!passed?'not-passed':!hex(currentRevision)?'not-rechecked':currentRevision===c.revision?'current':'stale';
  return {...c,currency};
 });
}
