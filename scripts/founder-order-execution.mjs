import {binaryManifestFiles} from './founder-binary-artifacts.mjs';
import {inspectStaticWebsite} from './founder-static-website.mjs';
import {contentPackageFiles,checkContentPackage} from './founder-content-package.mjs';
import {validateOrderQualityContract,invoiceQualityFiles,checkOrderQuality} from './founder-order-quality.mjs';
import {verifyContentReview} from './founder-content-worker.mjs';
import {createProfileSandbox} from './founder-profile-sandbox.mjs';
import Database from 'better-sqlite3';
import path from 'node:path';
import {bounded,checkedJSON,digest,orderKey} from './founder-restoration-integrity.mjs';
import {normalizeNativeWork} from './founder-native-work.mjs';
import {selectWorkProfile,profileFilesDigest} from './founder-work-profiles.mjs';
import {openDeliveryJournal,verifyDeliverable} from './founder-order-delivery.mjs';
import {prepareServiceData,prepareSourceReport} from '../src/commerce/service-delivery.ts';

export const orderActionKinds=['qualify','apply','reconcile-application','prepare','work','verify','submit','reconcile-delivery','acceptance','payment'];
const localKinds=new Set(['work','verify']);
const codeProfiles=new Set(['node-js','python','typescript','bash']);
const testPath=(p,profile)=>profile==='bash'?/\.test\.sh$/.test(p):profile==='python'?/(^|\/)tests?\/test[^/]*\.py$/.test(p):/\.test\.(?:[cm]?js|tsx?)$/.test(p);
export function applyProfileChanges(binding,changes,limits={}){
 // Only trusted application composition can opt into a larger reviewed project.
 // A task/source payload never supplies these limits; existing defaults stay exact.
 const maxFiles=limits.maxFiles??8,maxBytes=limits.maxBytes??16000;
 if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>40||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>256000)throw Error('Invalid bounded patch limit');
 if(!Array.isArray(changes)||!changes.length||changes.length>maxFiles||Buffer.byteLength(JSON.stringify(changes))>maxBytes)throw Error('Bounded profile patch required');
 const originals=new Map(binding.files.map(f=>[f.path,f])),result=new Map(originals);let implementation=false,regression=false;const seen=new Set();
 for(const f of changes){if(seen.has(f.path))throw Error('Duplicate patch');seen.add(f.path);const old=originals.get(f.path);
  if(old?.content===f.content)throw Error('Unchanged patch');
  if(codeProfiles.has(binding.profileId)){
   const support=/(^|\/)(test|tests|spec|specs|fixtures|__tests__)(\/|$)|(?:config|setup|harness|assertion|helper|fixture)/i.test(f.path);
   if(old&&(support||testPath(f.path,binding.profileId))||!old&&!testPath(f.path,binding.profileId))throw Error('Original tests/support preserved; new regression required');
   const ext=binding.profileId==='bash'?/\.sh$/:binding.profileId==='python'?/\.py$/:binding.profileId==='typescript'?/\.(?:tsx?|[cm]?js)$/:/\.[cm]?js$/;
   if(!ext.test(f.path))throw Error('Implementation type outside profile');old?implementation=true:regression=true;
  }else if(binding.profileId==='workflow-metadata'){
   if(!binding.allowedChanges?.includes(f.path)||!old)throw Error('Exact workflow scope required');
   // Metadata-only evidence cannot authorize executable CI changes. Keep all
   // structural lines exact; richer workflow work needs a separate CI verifier.
   const structure=text=>text.split(/\r?\n/).filter(line=>!/^\s*(?:name|description)\s*:/.test(line));
   if(digest(structure(old.content))!==digest(structure(f.content))||/\$\{\{/.test(f.content))throw Error('Executable workflow changes require reviewed CI verification');implementation=true;
  }else throw Error('Unsupported generated profile');
  result.set(f.path,{path:f.path,content:f.content});
 }
 if(!implementation||codeProfiles.has(binding.profileId)&&!regression)throw Error('Implementation and new regression required');
 return [...result.values()];
}
function dataFiles(binding){
 if(binding.profileId==='reviewed-binary')return binaryManifestFiles(binding);
 if(binding.profileId==='structured-data'){
  if(binding.qualityContract!==undefined)return invoiceQualityFiles(binding);
  const r=prepareServiceData(binding.data?.rows,binding.data?.contract);if(r.status!=='prepared')throw Error('Data contract needs review');
  return [{path:'delivery.csv',content:r.csv}];
 }
 if(binding.profileId==='source-report'){
  const r=prepareSourceReport(binding.report?.sources,binding.report?.claims,binding.report?.now,binding.report?.maxAgeMs);
  if(r.status!=='citation_matched')throw Error('Report citation contract failed');return [{path:'report.json',content:JSON.stringify(r)}];
 }
 return null;
}
/** Trusted source implementations and worker functions are supplied by application
 * composition, never loaded/evaluated from a task, candidate or platform text. */
export function openOrderExecution({directory,isEnabled,options={},sources=[]}){
 const evidenceMaxBytes=options.evidenceMaxBytes??256000;
 if(!Number.isSafeInteger(evidenceMaxBytes)||evidenceMaxBytes<256000||evidenceMaxBytes>1200000)throw Error('Invalid project evidence limit');
 const projectJSON=value=>checkedJSON(value,evidenceMaxBytes);
 options={...options,sandboxes:{...options.sandboxes}};for(const runtime of options.runtimes??[]){if(options.sandboxes[runtime.profileId])throw Error('Duplicate profile runtime');options.sandboxes[runtime.profileId]=createProfileSandbox({runtime,process:options.process});}
 const contracts=options.sources??sources,ids=new Set();
 for(const c of contracts){if(!bounded(c.sourceId)||ids.has(c.sourceId)||!bounded(c.evidenceRef,2000)||typeof c.verify!=='function')throw Error('Unique reviewed source contract required');ids.add(c.sourceId);}
 const db=new Database(path.join(directory,'products.db'));db.pragma('busy_timeout=5000');
 db.exec('CREATE TABLE IF NOT EXISTS restoration_products(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS restoration_review_artifacts(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,payload TEXT NOT NULL)');
 const journal=openDeliveryJournal(path.join(directory,'delivery-journal.db'));
 const active=ctx=>{if(!isEnabled())throw Error('Order execution OFF');ctx.assertActive();};
 const refreshConfirmed=async(o,ctx)=>{if(options.requireConfirmedFundedOrders!==true)return;if(!isEnabled())throw Error('Order execution OFF');(ctx.assertFundingRefreshActive??ctx.assertActive)();const authority=options.confirmedWorkAuthority;if(typeof authority?.refresh!=='function')throw Error('Confirmed customer-work authority unavailable');await authority.refresh(o,ctx);active(ctx);if(authority.allows(o)!==true)throw Error('Confirmed customer-work authority changed');};
 const identity=o=>digest([orderKey(o),o.sourceRevision]);
 const get=o=>{const r=db.prepare('SELECT payload FROM restoration_products WHERE id=?').get(identity(o));return r?JSON.parse(r.payload):null;};
 const save=(o,value)=>{db.prepare('INSERT INTO restoration_products VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(identity(o),JSON.stringify(projectJSON(value)));};
 const contract=o=>{const c=contracts.find(x=>x.sourceId===o.sourceId);if(!c)throw Error('Reviewed source adapter missing');return c;};
 const sandboxFor=b=>{const s=options.sandboxes?.[b.profileId],r=s?.certification;if(!s?.available||!r)throw Error('Certified offline profile runtime required');const selected=selectWorkProfile({order:b,files:b.files,runtimes:[r]});if(selected.blockers.length)throw Error(selected.blockers.join(','));return s;};
 const admitFiles=(binding,files)=>{const s=options.sandboxes?.[binding.profileId];const selected=selectWorkProfile({order:binding,files,runtimes:s?.certification?[s.certification]:[]});if(selected.blockers.some(x=>x!=='certified-offline-runtime-required'))throw Error('Profile file admission failed');return selected.admittedFiles;};
 async function remote(kind,c,ctx,extra={}){active(ctx);if(typeof c.methods?.[kind]!=='function')throw Error('Official source operation unavailable: '+kind);const r=await c.methods[kind]({...ctx,...extra});active(ctx);if(c.verify(kind,r,ctx.order)!==true)throw Error('Independent source outcome required');return projectJSON(r);}
 const adapters=Object.fromEntries(orderActionKinds.map(kind=>[kind,{
  qualityProfilesForSource(sourceId){const c=contracts.find(c=>c.sourceId===sourceId);if(!c||!['work','verify','submit'].includes(kind)||!c.profiles?.length||typeof c.methods?.prepare!=='function')return [];return [...(c.profiles.includes('content-repurpose')?['content-package-structural-v1']:[]),...(c.profiles.includes('structured-data')&&c.qualityProfiles?.includes('invoice-reconciliation-v1')&&typeof c.validateQualityContract==='function'?['invoice-reconciliation-v1']:[])];},
  sourceIds:contracts.filter(c=>localKinds.has(kind)?c.profiles?.length>0&&typeof c.methods?.prepare==='function':typeof c.methods?.[kind]==='function').map(c=>c.sourceId),
  maxCostRappen:kind==='work'?(options.generate?(options.generate.maxCostRappen??0):(options.generateContent?.maxCostRappen??0)):0,providerTracked:kind==='work'&&(options.generate?options.generate.providerTracked===true:options.generateContent?.providerTracked===true),get accessRevision(){return kind==='work'?options.generate?.accessRevision:null;},
  async execute(ctx){active(ctx);const o=ctx.order,c=contract(o);let product=get(o);if(['prepare','work','verify','submit'].includes(kind))await refreshConfirmed(o,ctx);
   if(kind==='prepare'){
    const outcome=await remote(kind,c,ctx);if(outcome.confirmed!==true)return outcome;
    const b=projectJSON({...outcome.binding,rootTaskId:o.rootTaskId,sourceRevision:o.sourceRevision,...(o.funding?{funding:o.funding}:{}),...(o.paymentAuthorization?{paymentAuthorization:o.paymentAuthorization,...(o.paymentTerms?{paymentTerms:o.paymentTerms}:{})}:{})});if(digest(orderKey(b))!==digest(orderKey(o)))throw Error('Prepared source owner binding mismatch');
    if(typeof c.validatePreparedBinding==='function'&&c.validatePreparedBinding(b)!==true)throw Error('Prepared agreement differs from persisted payment terms');
    const normalized=normalizeNativeWork(b,{profiles:c.profiles??[],paymentAuthority:options.paymentAuthority});if(normalized.blockers.length)throw Error(normalized.blockers.join(','));
    validateOrderQualityContract(b,c);active(ctx);if(b.profileId==='product-images'){if(!options.productImages)throw Error('Product image capability missing');options.productImages.validate(b);}
    if(b.profileId==='office-generation'){if(typeof c.prepareOffice!=='function')throw Error('Office preparation unavailable');await c.prepareOffice(o,ctx);active(ctx);}
    if(!['structured-data','source-report','content-repurpose','reviewed-binary','office-generation','product-images'].includes(b.profileId)){b.files=admitFiles(b,b.files);sandboxFor(b);}
    if(product&&digest(product.binding)!==digest(b))throw Error('Prepared revision changed; source review required');
    await refreshConfirmed(o,ctx);save(o,product??{binding:b,stage:'prepared'});return {confirmed:true};
   }
   if(['work','verify','submit','reconcile-delivery'].includes(kind)&&!product)throw Error('Persisted prepared work required');
   if(['work','verify','submit'].includes(kind)){
    const checked=normalizeNativeWork({...product.binding,...(o.paymentAuthorization?{paymentAuthorization:o.paymentAuthorization}:{})},{profiles:c.profiles??[],paymentAuthority:options.paymentAuthority});
    if(checked.blockers.length)throw Error(checked.blockers.join(','));
    validateOrderQualityContract(product.binding,c);active(ctx);
   }
   if(kind==='work'){
    if(typeof c.beforeWork==='function'){if(await c.beforeWork(checkedJSON(product),ctx)!==true)throw Error('Current work authority required');active(ctx);}
    if(product.binding.profileId==='office-generation'&&['worked','verified'].includes(product.stage)){const existing=await c.readOfficeResult(o,ctx);active(ctx);if(existing.productDigest!==product.digest)throw Error('Stored Office result changed');}
    if(['worked','verified'].includes(product.stage)&&product.digest===digest({files:product.files})){checkOrderQuality(product,c);active(ctx);return {confirmed:true,costReceipt:{actualCostRappen:0,evidenceRef:'local:'+ctx.grant.reservationId}};}
    let files=dataFiles(product.binding),costReceipt=null,contentResult=null,imageResult=null;
    if(product.binding.profileId==='office-generation'){if(typeof c.generateOffice!=='function')throw Error('Office generation unavailable');const generated=await c.generateOffice(o,ctx);active(ctx);files=binaryManifestFiles({...generated,deliveryProtocol:'mixed-files-v1'});if(generated.productDigest!==digest({files}))throw Error('Generated Office product changed');}
    if(product.binding.profileId==='product-images'){const generated=await options.productImages.generate(checkedJSON(product.binding),ctx);active(ctx);files=generated.files;imageResult=generated.imageResult;}
    if(product.binding.profileId==='content-repurpose'){if(typeof options.generateContent!=='function')throw Error('Content generator unavailable');contentResult=await options.generateContent({...ctx,binding:projectJSON(product.binding)});active(ctx);if(!checkContentPackage({brief:product.binding.contentBrief,package:contentResult.package}).passed)throw Error('Content formal checks failed');if(await c.beforeWork?.(projectJSON(product),ctx)!==true)throw Error('Current content authority required');files=contentPackageFiles(contentResult.package);costReceipt=contentResult.costReceipt;}
    if(files&&!contentResult&&ctx.grant?.reservationId)costReceipt={actualCostRappen:0,evidenceRef:'local:'+ctx.grant.reservationId};
    if(product.binding.profileId==='static-website'){
     sandboxFor(product.binding);if(typeof options.generateWebsite!=='function')throw Error('Bounded website worker unavailable');
     if((options.generateWebsite.maxCostRappen??0)!==0||options.generateWebsite.providerTracked===true)throw Error('Offline zero-cost website worker required');
     const generated=await options.generateWebsite({...ctx,binding:projectJSON(product.binding)});active(ctx);
     files=generated?.files;costReceipt=generated?.costReceipt??null;
     if(costReceipt?.actualCostRappen!==0)throw Error('Exact zero-cost website receipt required');
     if(!inspectStaticWebsite(files).passed)throw Error('Static website structural checks failed');
    }
    if(!files){sandboxFor(product.binding);if(typeof options.generate!=='function')throw Error('Bounded format worker unavailable');const generated=await options.generate({...ctx,binding:projectJSON(product.binding)});active(ctx);costReceipt=generated?.costReceipt??null;files=applyProfileChanges(product.binding,generated?.changes,options.patchLimits);}
    files=admitFiles(product.binding,files);const worked={...product,files,digest:digest({files}),stage:'worked',...(imageResult?{imageResult}:{}),...(contentResult?{package:contentResult.package,generationRunId:contentResult.generationRunId}:{})};
    const qualityCheck=checkOrderQuality(worked,c);active(ctx);await refreshConfirmed(o,ctx);save(o,{...worked,...(qualityCheck?{qualityCheck}:{})});return {confirmed:true,...(costReceipt?{costReceipt}:{})};
   }
   if(kind==='verify'){
    const qualityCheck=checkOrderQuality(product,c,{requireReview:true});active(ctx);
    if(product.binding.profileId==='product-images'&&await options.productImages?.verify(product,ctx)!==true)throw Error('Image export awaits exact independent visual review');
    if(product.binding.profileId==='office-generation'&&await c.verifyProduct(product,{...ctx,order:o})!==true)throw Error('Office package awaits current release and specialist review');
    if(product.stage==='verified'&&product.verification?.passed===true&&product.verification.digest===digest({files:product.files}))return {confirmed:true,verification:product.verification};
    if(product.stage!=='worked'||!product.files||product.digest!==digest({files:product.files}))throw Error('Exact worked product required');
    const verification=await verifyDeliverable({order:{...o,scopeDigest:product.binding.scopeDigest},result:{files:product.files},maxBytes:evidenceMaxBytes,verifier:async()=>{
     const b=product.binding;let passed=false,coverage='declared-contract';
     const officeResult=b.profileId==='office-generation'?await c.readOfficeResult(o,ctx):null;
     const deterministic=b.profileId==='product-images'?binaryManifestFiles(product.imageResult):officeResult?binaryManifestFiles({...officeResult,deliveryProtocol:'mixed-files-v1'}):b.profileId==='content-repurpose'&&product.package?contentPackageFiles(product.package):dataFiles(b);
     if(deterministic){passed=digest(deterministic)===digest(product.files)&&(b.profileId!=='content-repurpose'||checkContentPackage({brief:b.contentBrief,package:product.package}).passed&&verifyContentReview(product,product.review))&&typeof c.verifyProduct==='function'&&await c.verifyProduct(product,{...ctx,order:o})===true;}
     else{
      const s=sandboxFor(b),run=async files=>{active(ctx);const r=await s.run(files,{signal:ctx.signal,assertActive:ctx.assertActive});active(ctx);const expected=(s.filesDigest??profileFilesDigest)(files);if(r.sourceDigest!==expected||r.image!==s.image||r.network!=='none'||r.hostMounts!==false||!Number.isSafeInteger(r.tests)||r.tests<1)throw Error('Exact isolated run evidence required');return r;};
      const before=await run(b.files),after=await run(product.files);
      if(codeProfiles.has(b.profileId)){const added=product.files.filter(f=>!b.files.some(x=>x.path===f.path));const regression=await run([...b.files,...added]);passed=before.passed===true&&after.passed===true&&regression.passed===false;}
      else if(b.profileId==='static-website'){coverage='static-structure-and-independent-visual';passed=before.passed===true&&after.passed===true&&inspectStaticWebsite(product.files).passed;}
      else{coverage='metadata-only';passed=b.metadataOnlyAccepted===true&&before.passed===true&&after.passed===true;}
     }
     if(!deterministic)passed=passed&&typeof c.verifyProduct==='function'&&await c.verifyProduct(product,{...ctx,order:o})===true;
     active(ctx);return {passed,evidenceRefs:passed?['offline-profile:'+product.digest+':'+coverage]:[]};
    }},ctx);
    if(!verification.passed)throw Error('Independent product verification failed');await refreshConfirmed(o,ctx);save(o,{...product,verification,stage:'verified',...(qualityCheck?{qualityCheck}:{})});return {confirmed:true,verification};
   }
   if(kind==='submit'||kind==='reconcile-delivery'){
    if(product.stage!=='verified'||product.digest!==o.verification?.digest||product.digest!==digest({files:product.files}))throw Error('Exact current verified product required');
    if(kind==='submit'){checkOrderQuality(product,c,{requireReview:true});active(ctx);if(product.binding.profileId==='product-images'&&await options.productImages?.verify(product,ctx)!==true)throw Error('Current image review required before submission');}
    const id=journal.prepare(o,product.digest,o.sourceRevision),intent=journal.snapshot().find(x=>x.id===id);
    if(kind==='reconcile-delivery'&&intent.status==='prepared'&&o.pendingDeliveryJournalId===id)return {confirmed:false,dispatchNotStarted:true,deliveryIntent:id};
    if(kind==='submit'){if(intent.status!=='prepared')throw Error('Existing delivery requires reconciliation');active(ctx);journal.markSent(id,{status:'unknown'});}
    const outcome=await remote(kind,c,ctx,{product:projectJSON({files:product.files,digest:product.digest,profileId:product.binding.profileId,contractDigest:product.binding.workContractDigest??null}),deliveryIntent:id});
    if(outcome.confirmed===true){journal.reconcile(id,outcome.delivery);return {...outcome,remoteId:outcome.delivery.remoteId};}return {...outcome,confirmed:false};
   }
   return remote(kind,c,ctx,product?{product:{contractDigest:product.binding.workContractDigest??null}}:{});
  },verify:r=>r&&typeof r.confirmed==='boolean'
 }]));
 adapters.submit.prepareDispatch=ctx=>{active(ctx);const o=ctx.order,p=get(o);if(p?.stage!=='verified'||p.digest!==o.verification?.digest||p.digest!==digest({files:p.files}))throw Error('Exact verified delivery preflight required');checkOrderQuality(p,contract(o),{requireReview:true});active(ctx);return journal.prepare(o,p.digest,o.sourceRevision);};
 adapters['reconcile-delivery'].canResume=(order,outcome)=>{const intent=journal.snapshot().find(r=>r.id===outcome.deliveryIntent);return !!(intent&&intent.status==='prepared'&&intent.id===order.pendingDeliveryJournalId&&intent.revision===order.sourceRevision&&intent.digest===order.verification?.digest);};
 const contentReviewAdapter={maxCostRappen:50,providerTracked:true,retrySafe:false,autoRetrySafe:false,get available(){return options.reviewContent?.available!==false&&typeof options.reviewContent?.execute==='function';},get accessRevision(){return options.reviewContent?.accessRevision;},async execute(ctx){active(ctx);const o=ctx.order,p=get(o),c=contract(o);if(ctx.grant?.maxCostRappen!==50||!ctx.grant?.reservationId||p?.binding.profileId!=='content-repurpose'||p.digest!==ctx.task?.input?.productDigest||p.digest!==digest({files:p.files}))throw Error('Exact budgeted content review required');await refreshConfirmed(o,ctx);if(await c.beforeWork?.(checkedJSON(p),ctx)!==true)throw Error('Current review authority required');active(ctx);if(verifyContentReview(p,p.review))return {kind:'ugig-content-review',review:p.review,costReceipt:{actualCostRappen:0,evidenceRef:'local:'+ctx.grant.reservationId}};if(!options.reviewContent?.execute)throw Error('Independent content reviewer unavailable');const result=await options.reviewContent.execute({...ctx,product:checkedJSON(p)});const rawReview=projectJSON({schema:'received-untrusted-content-review-v1',productDigest:p.digest,result,trustedCommit:false});db.prepare('INSERT OR IGNORE INTO restoration_review_artifacts VALUES(?,?,?)').run(digest([identity(o),p.digest,rawReview]),identity(o),JSON.stringify(rawReview));active(ctx);if(await c.beforeWork?.(checkedJSON(p),ctx)!==true||!verifyContentReview(p,result.review))throw Error('Independent review or current authority failed');active(ctx);await refreshConfirmed(o,ctx);save(o,{...p,review:result.review});return result;},verify:r=>r?.kind==='ugig-content-review'&&r.review?.verdict==='pass'};
 return {adapters,contracts,contentReviewAdapter,runtimeEvidenceFor(o){const b=get(o)?.binding??o,s=options.sandboxes?.[b.profileId],r=s?.certification;if(b.profileId!==o.profileId||s?.available!==true||r?.verified!==true||r.isolated!==true||r.network!=='none'||r.hostMounts!==false||r.profileId!==o.profileId||!r.evidenceRef)return null;return {profileId:b.profileId,runtimeDigest:digest(r)};},inspectOfficeServicePlan:(order,document)=>{const c=contract(order);if(typeof c.inspectOfficeServicePlan!=='function')throw Error('Office plan preparation unavailable');return c.inspectOfficeServicePlan(document,{gig:order.gigId,applicationId:order.applicationId,conversationId:order.conversationId,profile:order.workKind});},readContentProduct:o=>{const p=get(o);return p?.binding.profileId==='content-repurpose'?checkedJSON(p):null;},
  async refreshReadiness(ctx,orders=[]){active(ctx);const profiles=new Set();for(const o of orders.filter(o=>['assigned','prepared','worked','verified'].includes(o.state)&&o.termsVerified===true)){const b=get(o)?.binding;if(b?.profileId)profiles.add(b.profileId);else if(o.profileId)profiles.add(o.profileId);else for(const p of contracts.find(c=>c.sourceId===o.sourceId)?.profiles??[])profiles.add(p);}
   const candidates=[...profiles].map(p=>options.sandboxes[p]).filter(Boolean);if(orders.some(o=>['assigned','prepared','worked','verified'].includes(o.state)&&o.termsVerified===true&&contracts.some(c=>c.sourceId===o.sourceId&&c.needsAdapter)))candidates.push(options.learning?.sandbox);
   for(const sandbox of candidates.filter(Boolean)){active(ctx);if(!sandbox.available&&typeof sandbox.probe==='function')await sandbox.probe(ctx);active(ctx);}},
  async refreshRegistrations({store,assertActive,signal}){const ctx={assertActive,signal};active(ctx);let count=0;for(const c of contracts){if(typeof c.registrations!=='function')continue;const rows=await c.registrations(ctx);active(ctx);if(!Array.isArray(rows)||rows.length>100)throw Error('Bounded source registrations required');for(const r of rows){active(ctx);if(c.verifyRegistration?.(r)!==true||r.sourceId!==c.sourceId)throw Error('Trusted own registration evidence required');if(store.register(r))count++;}}return count;},
  snapshot(){return {productImages:options.productImages?.status()??{profileId:'product-images',ready:false,blocker:'Image capability not configured'},products:db.prepare('SELECT count(*) n FROM restoration_products').get().n,receivedReviewArtifacts:db.prepare('SELECT count(*) n FROM restoration_review_artifacts').get().n,deliveries:journal.snapshot(),sources:contracts.map(c=>({sourceId:c.sourceId,operations:Object.keys(c.methods??{}),blocker:c.blocker??null,legacyExecution:c.legacyExecution??null}))};},
  close(){for(const c of contracts)c.close?.();journal.close();db.close();}
 };
}
