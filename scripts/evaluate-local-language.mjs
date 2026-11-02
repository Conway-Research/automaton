import {writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {evaluateLocalLanguage} from '../dist/commerce/language-evaluation.js';
// Explicit standalone local-service check; not part of mocked CI and never starts an agent.
const endpoint=process.env.OBOLUS_LANGUAGE_CHECK_URL;
if(!endpoint)throw Error('Set OBOLUS_LANGUAGE_CHECK_URL to the configured local service first');
const report=await evaluateLocalLanguage(endpoint);
const root=fileURLToPath(new URL('../artifacts/',import.meta.url));mkdirSync(root,{recursive:true});
const file=join(mkdtempSync(join(root,'language-evaluation-')),'report.json');
writeFileSync(file,JSON.stringify({...report,checkedAt:new Date().toISOString(),agentStarted:false},null,2),{flag:'wx'});
console.log(JSON.stringify({file,byLanguage:report.byLanguage,allCasesMatched:report.allCasesMatched,releaseAuthorized:false},null,2));
