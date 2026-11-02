import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {digest} from './founder-restoration-integrity.mjs';
import {openEvidenceStore} from './founder-evidence-store.mjs';
import {projectCertificateCurrency} from './founder-certificate-currency.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=s=>createHash('sha256').update(s).digest('hex');
export function checkCertificateCurrency(certificate,base=root){
 if(projectCertificateCurrency([certificate],undefined)[0].currency==='not-passed')return 'not-passed';
 return projectCertificateCurrency([certificate],fingerprintSources(base).revision)[0].currency;
}
export function summarizeTestRun({output,exitCode,signal=null}){
 const result={tests:0,passed:0,failed:0,skipped:0,cancelled:0,todo:0,exitCode:Number.isInteger(exitCode)&&exitCode>=0&&exitCode<=255?exitCode:null,status:'failed'};
 let valid=typeof output==='string'&&Buffer.byteLength(output)<=4000000;
 for(const [key,label] of Object.entries({tests:'tests',passed:'pass',failed:'fail',skipped:'skipped',cancelled:'cancelled',todo:'todo'})){
  const matches=typeof output==='string'?[...output.matchAll(new RegExp('^# '+label+' (\\d+)\\r?$','gm'))]:[];
  if(matches.length!==1||!Number.isSafeInteger(Number(matches[0]?.[1]))||Number(matches[0]?.[1])>1000000)valid=false;
  else result[key]=Number(matches[0][1]);
 }
 if(valid&&!signal&&exitCode===0&&result.tests>0&&result.tests===result.passed&&!result.failed&&!result.skipped&&!result.cancelled&&!result.todo)result.status='passed';
 return result;
}
// Fixed local source roots only; production state and credentials are excluded.
export function fingerprintSources(base=root){
 const rows=[];let total=0;
 const add=relative=>{const full=path.join(base,relative),s=fs.lstatSync(full);if(s.isSymbolicLink())throw Error('Fingerprint link rejected');if(!s.isFile())throw Error('Fingerprint requires regular file');total+=s.size;if(total>100000000||rows.length>=10000)throw Error('Fingerprint bounds exceeded');rows.push({path:relative.replaceAll('\\','/'),sha256:sha(fs.readFileSync(full))});};
 const walk=relative=>{const full=path.join(base,relative);if(fs.lstatSync(full).isSymbolicLink())throw Error('Fingerprint link rejected');for(const d of fs.readdirSync(full,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(['node_modules','dist','__pycache__','.git'].includes(d.name))continue;const p=path.join(relative,d.name);if(d.isSymbolicLink())throw Error('Fingerprint link rejected');if(d.isDirectory())walk(p);else if(/\.(?:mjs|cjs|js|ts|tsx|py|ps1|json|sh|html|css|yaml|yml|toml)$/.test(d.name)&&(!d.name.includes('credentials')||/\.(?:mjs|cjs|js|ts|tsx|py|ps1|sh)$/.test(d.name)))add(p);}};
 for(const folder of ['scripts','src','web','packages'])if(fs.existsSync(path.join(base,folder)))walk(folder);
 for(const file of ['package.json','package-lock.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','tsconfig.tests.json'])if(fs.existsSync(path.join(base,file)))add(file);
 rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);if(!rows.length)throw Error('Empty fingerprint');return {revision:digest(rows),files:rows.length,manifest:rows};
}
export async function certifyOffline({store}){
 const before=fingerprintSources(),startedAt=Date.now();
 const args=['--require','./scripts/verification-network-guard.cjs','--import','./scripts/founder-offline-test-guard.mjs','--import','tsx','--test','--test-reporter=tap','scripts/founder-capability-evidence.test.mjs','scripts/founder-certificate-currency.test.mjs','scripts/founder-runtime.test.mjs','scripts/founder-multilanguage-order.test.mjs','scripts/founder-restoration-boundaries.test.mjs','scripts/founder-code-sandbox.test.mjs','scripts/founder-profile-sandbox.test.mjs','scripts/founder-code-execution.test.mjs','scripts/founder-capability-integration.test.mjs','scripts/founder-lifecycle-acceptance.test.mjs','scripts/founder-evidence-store.test.mjs','scripts/founder-evidence-restore.test.mjs','scripts/founder-certify-offline.test.mjs','scripts/founder-restoration-runtime.test.mjs','scripts/founder-order-accountability.test.mjs','scripts/founder-budget.test.mjs','scripts/founder-budget-projection.test.mjs','scripts/founder-retry-projection.test.mjs','scripts/founder-dashboard.test.mjs','scripts/founder-controller.test.mjs','scripts/founder-sight-inspection.test.mjs','scripts/founder-missing-capability-learning.test.mjs','scripts/founder-adapter-learning-proof.test.mjs','scripts/founder-adapter-learning-authority.test.mjs','scripts/founder-delivery.test.mjs','scripts/founder-payment-runtime.test.mjs','scripts/founder-order-runtime.test.mjs','scripts/founder-ui.test.mjs','scripts/numaron-monitor-overview.test.mjs','scripts/numaron-monitor-data.test.mjs','scripts/founder-source-overview.test.mjs','scripts/founder-research-report.test.mjs','scripts/founder-research-followup.test.mjs','scripts/founder-archive-ui.test.mjs','scripts/founder-interaction.test.mjs','scripts/founder-health-ui.test.mjs','scripts/founder-content-package.test.mjs','scripts/founder-quality-profiles.test.mjs','scripts/founder-quality-bindings.test.mjs','scripts/founder-reference-approvals.test.mjs','scripts/founder-reference-validation.test.mjs','scripts/founder-ugig-office-report.test.mjs','scripts/founder-ugig-office-review-identity.test.mjs','scripts/founder-ugig-office-visual-workflow.test.mjs','scripts/founder-docx-visual-evidence.test.mjs','scripts/founder-ugig-office-visual-boundary.test.mjs','scripts/founder-reference-admin.test.mjs','scripts/founder-reference-composition.test.mjs','scripts/founder-production-order-bindings.test.mjs','scripts/founder-order-execution.test.mjs','scripts/founder-marketplace-work-source.test.mjs','scripts/founder-ugig-completion.test.mjs','scripts/founder-ugig-pilot.integration.test.mjs','scripts/founder-content-worker.test.mjs','scripts/founder-supervisor-state.test.mjs','scripts/founder-supervisor-events.test.mjs','scripts/founder-maintenance-restart.test.mjs','scripts/founder-ugig-sol-settlement.test.mjs','scripts/founder-office-service-plan.test.mjs','scripts/founder-office-portfolio.test.mjs','scripts/founder-office-capability-binding.test.mjs','scripts/founder-office-plan-gaps.test.mjs','scripts/founder-office-canonical-minutes.test.mjs','scripts/founder-office-phases.test.mjs','scripts/founder-office-deadline.test.mjs','scripts/founder-office-consistency.test.mjs','scripts/founder-office-commercial.test.mjs','scripts/founder-office-versions.test.mjs','scripts/founder-office-capacity.test.mjs'];
 const execution=await new Promise((resolve,reject)=>{
  const env=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','TEMP','TMP','WINDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',size=0,overflow=false;
  const collect=b=>{size+=b.length;if(size>4000000){overflow=true;child.kill();}else output+=b.toString('utf8');};child.stdout.on('data',collect);child.stderr.on('data',collect);
  const timer=setTimeout(()=>child.kill(),120000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',(exitCode,signal)=>{clearTimeout(timer);resolve({output,exitCode,signal:overflow?'overflow':signal});});
 });
 const after=fingerprintSources(),summary=summarizeTestRun(execution);
 const certificate={suite:'founder-quality-v2',revision:before.revision,finishedRevision:after.revision,startedAt,finishedAt:Date.now(),...summary,outputDigest:sha(execution.output),nodeVersion:process.version,scope:'offline-synthetic'};
 if(before.revision!==after.revision)certificate.status='invalidated';
  const oldFiles=new Map(before.manifest.map(r=>[r.path,r.sha256])),newFiles=new Map(after.manifest.map(r=>[r.path,r.sha256]));
 const changedPaths=[...new Set([...oldFiles.keys(),...newFiles.keys()])].filter(p=>oldFiles.get(p)!==newFiles.get(p)).sort();
 const id=store.recordCertificate(certificate);return {id,...certificate,files:before.files,changedFileCount:changedPaths.length,changedPaths:changedPaths.slice(0,50)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2];if(!file||process.argv.length!==3)throw Error('Usage: node scripts/founder-certify-offline.mjs <development-evidence.db>');
 const target=path.resolve(file),relative=path.relative(path.join(root,'outputs'),target);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Certificate output must be under workspace outputs');
 const store=openEvidenceStore({file:target});try{const result=await certifyOffline({store});process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.status!=='passed')process.exitCode=1;}finally{store.close();}
}
