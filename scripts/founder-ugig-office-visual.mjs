import {officeLayoutRequirements} from './founder-ugig-office-layout.mjs';
import {readOfficeFile} from './founder-ugig-office-evidence.mjs';
import {prepareDocxSpecialistReview} from './founder-docx-visual-evidence.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {spawn,execFile} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {digest,checkedJSON} from './founder-restoration-integrity.mjs';
import {sha256} from './founder-binary-artifacts.mjs';
import {officeGenerationKey,officeMust as must} from './founder-ugig-office-contract.mjs';
const engine=fileURLToPath(new URL('./ugig_docx_visual.py',import.meta.url));

// Stop only the owned renderer process tree. No service/supervisor operations.
function execute(python,args,options,signal){return new Promise((resolve,reject)=>{
 const child=spawn(python,args,{...options,stdio:['ignore','ignore','pipe'],windowsHide:true,detached:process.platform!=='win32'});
 let reason,killPending=Promise.resolve(),diagnostic="";child.stderr.on("data",b=>{diagnostic=(diagnostic+b.toString()).slice(-4096);});
 const stop=()=>{if(reason)return;reason=Error('Office visual: cancelled or timed out');
  if(child.pid&&process.platform==='win32')killPending=new Promise(done=>execFile(path.join(process.env.SYSTEMROOT??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000},()=>{child.kill();done();}));
  else if(child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
 };
 const timer=setTimeout(stop,240000);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
 child.once('error',e=>{clean();reject(e);});child.once('close',async code=>{clean();await killPending;if(reason)reject(reason);else if(code===0||code===2)resolve();else reject(Error('Office visual: renderer failed: '+diagnostic));});
});}
function read(file,max){const st=fs.lstatSync(file);must(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size>0&&st.size<=max,'visual evidence file');return fs.readFileSync(file);}
function safeDirectory(dir){let p=path.resolve(dir);for(;;){if(fs.existsSync(p))must(!fs.lstatSync(p).isSymbolicLink(),'visual linked directory');const parent=path.dirname(p);if(parent===p)break;p=parent;}}

export function createOfficeVisualInspector({base,runtime,artifactStore,isEnabled,authorize,specBytes,run=execute}){
 const config=structuredClone(runtime),specification=Buffer.from(specBytes);
 const active=ctx=>{must(isEnabled()===true&&!ctx?.signal?.aborted,'visual OFF or cancelled');ctx?.assertActive?.();};
 return {async read(proof,agreement,result,ctx={}){
  active(ctx);const a=checkedJSON(agreement),r=checkedJSON(result),p=checkedJSON(proof);
  const expectedPages=officeLayoutRequirements(a,specification);
  must(p.expectedPages!==undefined&&p.layoutDigest===digest(expectedPages)&&digest(p.expectedPages)===digest(expectedPages),'saved layout binding');
  must(a.privacy==='public'&&a.processing?.approved===true,'visual public processing permission');
  must(await authorize(a,r,ctx)===true,'visual current work authority');active(ctx);
  must(/^[a-f0-9-]{36}$/.test(p.evidenceId)&&p.agreementDigest===digest(a)&&p.generationKey===officeGenerationKey(a)&&p.generationKey===r.generationKey&&p.productDigest===r.productDigest&&p.packageDigest===r.packageDigest,'saved visual binding');
  must(sha256(readOfficeFile(config.soffice,64*1024*1024))===config.rendererSha256,'visual renderer changed');
  const artifact=r.binaryArtifacts.find(b=>b.name==='delivery.docx');must(artifact&&artifact.sha256===p.inputSha256,'saved visual input');
  const dir=path.join(base,'artifacts/founder-autonomy-20261013/ugig-office-visual',p.evidenceId);
  must(digest(JSON.parse(readOfficeFile(path.join(dir,'binding.json'),256000)))===digest(p),'saved visual binding changed');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-visual-read-'));
  try{const source=path.join(temp,'input.docx');fs.writeFileSync(source,artifactStore.read(artifact),{flag:'wx',mode:0o600});
   const review=prepareDocxSpecialistReview({agreement:a,product:r,expectedPages,source,directory:dir,reportDigest:p.reportSha256,rendererDigest:config.rendererSha256});
   must(digest(review)===p.specialistReviewDigest&&digest(p.specialistReview)===digest(review)&&digest(JSON.parse(readOfficeFile(path.join(dir,'specialist-review.json'),256000)))===digest(review),'saved specialist review changed');
   must(p.geometryPassed===review.evidence.geometryPassed&&digest(p.issues)===digest(review.evidence.issues)&&p.deliveryReady===false&&p.independentlyVerified===false&&p.visualReviewRequired===true,'saved visual flags');
   must(digest(fs.readdirSync(dir).sort())===digest(['binding.json','specialist-review.json','report.json','input.pdf',...review.evidence.pages.map(x=>x.image)].sort()),'saved visual inventory');
   must(await authorize(a,r,ctx)===true,'visual current work authority');active(ctx);return p;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
 },async inspect(agreement,result,ctx={}){
  active(ctx);must(config&&['python','soffice','poppler'].every(k=>typeof config[k]==='string'&&path.isAbsolute(config[k]))&&/^[a-f0-9]{64}$/.test(config.rendererSha256),'explicit visual runtime');
  must(typeof ctx.grant?.reservationId==='string'&&ctx.grant.reservationId.length>0,'visual budget reservation');
  const a=checkedJSON(agreement),r=checkedJSON(result),expectedPages=officeLayoutRequirements(a,specification);
  must(['document-cleanup','support-templates'].includes(a.workKind)&&a.privacy==='public'&&a.processing?.approved===true,'visual public processing permission');
  must(r.generationKey===officeGenerationKey(a),'visual generation binding');
  const binaries=r.binaryArtifacts.filter(b=>b.name.endsWith('.docx'));must(binaries.length===1,'one generated DOCX required');const artifact=binaries[0];
  const binding={schema:'numaron-office-visual-binding-v1',layoutDigest:digest(expectedPages),expectedPages,agreementDigest:digest(a),generationKey:r.generationKey,productDigest:r.productDigest,packageDigest:r.packageDigest,inputSha256:artifact.sha256,workKind:a.workKind};
  const authority=async()=>{active(ctx);must(await authorize(a,r,ctx)===true,'visual current work authority');active(ctx);};
  await authority();const bytes=artifactStore.read(artifact);must(sha256(bytes)===binding.inputSha256,'visual exact input');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-office-visual-'));
  try{
   const source=path.join(temp,'input.docx'),out=path.join(temp,'out'),cfg=path.join(temp,'config.json');
   fs.writeFileSync(source,bytes,{flag:'wx',mode:0o600});
   fs.writeFileSync(cfg,JSON.stringify({source,output:out,expectedPages,permission:{privacy:'public',customerApproved:true,workKind:a.workKind,inputSha256:artifact.sha256},soffice:config.soffice,rendererSha256:config.rendererSha256,poppler:config.poppler}),{flag:'wx',mode:0o600});
   // Fixed trusted module path; isolated Python cannot import from the job cwd.
   const wrapper='import runpy,sys;sys.path.insert(0,sys.argv[1]);sys.argv=[sys.argv[2],"--config",sys.argv[3]];runpy.run_path(sys.argv[0],run_name="__main__")';
   await authority();await run(config.python,['-I','-c',wrapper,path.dirname(engine),engine,cfg],{cwd:temp,env:{SYSTEMROOT:process.env.SYSTEMROOT??'C:\\Windows',TEMP:os.tmpdir(),TMP:os.tmpdir(),PYTHONUTF8:'1'}},ctx.signal);
   await authority();must(sha256(artifactStore.read(artifact))===artifact.sha256,'visual input changed');
   const reportBytes=read(path.join(out,'report.json'),10*1024*1024),report=JSON.parse(reportBytes);
   must(report.schema==='numaron-docx-visual-v1'&&report.inputSha256===artifact.sha256&&report.workKind===a.workKind&&report.rendererSha256===config.rendererSha256,'visual report binding');
   must(report.independentlyVerified===false&&report.deliveryReady===false&&report.visualReviewRequired===true&&Array.isArray(report.issues)&&report.issues.every(i=>typeof i==='string')&&report.geometryPassed===(report.issues.length===0),'visual review flags');
   must(Array.isArray(report.pages)&&report.pages.length>0&&report.pages.length<=30,'visual page count');
   const files=new Map([['report.json',reportBytes],['input.pdf',read(path.join(out,'input.pdf'),25*1024*1024)]]);
   must(sha256(files.get('input.pdf'))===report.pdfSha256,'visual PDF hash');
   report.pages.forEach((p,i)=>{must(p.page===i+1&&p.image===`page-${i+1}.png`,'visual page identity');const b=read(path.join(out,p.image),12*1024*1024);must(sha256(b)===p.imageSha256,'visual page hash');files.set(p.image,b);});
   must(digest([...fs.readdirSync(out)].sort())===digest([...files.keys()].sort()),'visual output inventory');
   const specialistReview=prepareDocxSpecialistReview({agreement:a,product:r,expectedPages,source,directory:out,reportDigest:sha256(reportBytes),rendererDigest:config.rendererSha256});
   await authority();
   const root=path.join(base,'artifacts/founder-autonomy-20261013/ugig-office-visual');safeDirectory(root);fs.mkdirSync(root,{recursive:true});
   const evidenceId=randomUUID(),staging=path.join(root,'.pending-'+evidenceId),target=path.join(root,evidenceId);
   const proof={...binding,evidenceId,specialistReview,specialistReviewDigest:digest(specialistReview),reportSha256:sha256(reportBytes),geometryPassed:report.geometryPassed,issues:report.issues,independentlyVerified:false,deliveryReady:false,visualReviewRequired:true};
   fs.mkdirSync(staging);
   try{
    for(const [name,b] of files){active(ctx);fs.writeFileSync(path.join(staging,name),b,{flag:'wx',mode:0o600});}
    fs.writeFileSync(path.join(staging,'specialist-review.json'),JSON.stringify(specialistReview,null,2),{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(staging,'binding.json'),JSON.stringify(proof,null,2),{flag:'wx',mode:0o600});
    await authority();active(ctx);
    must(digest(prepareDocxSpecialistReview({agreement:a,product:r,expectedPages,source,directory:staging,reportDigest:proof.reportSha256,rendererDigest:config.rendererSha256}))===proof.specialistReviewDigest,'staged specialist evidence changed');
    must(digest(JSON.parse(readOfficeFile(path.join(staging,'specialist-review.json'),256000)))===proof.specialistReviewDigest,'staged specialist request changed');
    must(digest(JSON.parse(readOfficeFile(path.join(staging,'binding.json'),256000)))===digest(proof),'staged binding changed');
    must(digest(fs.readdirSync(staging).sort())===digest([...files.keys(),'specialist-review.json','binding.json'].sort()),'staged inventory changed');
    fs.renameSync(staging,target);}finally{fs.rmSync(staging,{recursive:true,force:true});}
   return proof;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
 }};
}
