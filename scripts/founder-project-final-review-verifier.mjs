import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
import {createProjectBlackBoxVerifier} from './founder-project-blackbox.mjs';
/** Adds independently frozen late review cases to the complete existing
 * syntax/release composition. Original checks and protected tests remain
 * conjunctive; candidate source is never edited by this verifier. */
export function createProjectFinalReviewVerifier({baseVerifier,reviewCases,acceptance,process}){
 if(baseVerifier?.kind!=='isolated-project-syntax-release-v1'||typeof baseVerifier.verify!=='function'||!/^sha256:[a-f0-9]{64}$/.test(baseVerifier.image??'')||!/^[a-f0-9]{64}$/.test(baseVerifier.oracleDigest??''))throw Error('Exact complete original syntax/release verifier required');
 const extra=createProjectBlackBoxVerifier({image:baseVerifier.image,entrypoint:baseVerifier.entrypoint,cases:checkedJSON(reviewCases,160000),acceptance,...(process?{process}:{})});
 if(extra.acceptanceDigest!==baseVerifier.acceptanceDigest)throw Error('Immutable original acceptance must remain identical');
 const policy={version:1,relation:'conjunction-with-all-original-syntax-release-checks',baseOracleDigest:baseVerifier.oracleDigest,reviewOracleDigest:extra.oracleDigest},oracleDigest=digest(policy);
 return {kind:'isolated-project-final-reviewed-release-v1',image:baseVerifier.image,entrypoint:baseVerifier.entrypoint,acceptanceDigest:extra.acceptanceDigest,oracleDigest,strengthensOracleDigest:baseVerifier.oracleDigest,policy,
  async verify(input,ctx={}){
   const primary=await baseVerifier.verify(input,ctx),additional=await extra.verify(input,ctx);
   if(primary.sourceDigest!==additional.sourceDigest)throw Error('Final review and original checks must bind identical source');
   const checks=[...primary.checks,...additional.checks.map(c=>({...c,id:'final-review.'+c.id}))],failedCases=checks.filter(c=>!c.passed).map(c=>c.id),passed=primary.passed===true&&additional.passed===true&&!failedCases.length;
   return {...primary,passed,exitCode:passed?0:1,tests:primary.tests+additional.tests,oracleDigest,checks,failedCases,finalReviewChecks:additional.tests,log:JSON.stringify(checks.filter(c=>!c.passed).map(({mutationResult,...c})=>({...c,...(mutationResult?{mutationResult:{passed:mutationResult.passed,tests:mutationResult.tests,failedCases:mutationResult.failedCases,sourceDigest:mutationResult.sourceDigest}}:{})}))).slice(-16000)};
  }
 };
}
