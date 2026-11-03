import http from 'node:http';
import {createSecurityAudit} from './founder-security-audit.mjs';

import fs from 'node:fs';

import path from 'node:path';

import {fileURLToPath} from 'node:url';

import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

import {spawn} from 'node:child_process';

import {boundedReader,readFounderReports} from './founder-operations.mjs';
import {createAmplitudeReader} from './founder-amplitude.mjs';

import {reviewState} from './trade-review.mjs';
import {readTradingHistory} from './founder-trading-history.mjs';



function tradeReview(){

 try {

  const report=JSON.parse(readFixed(root,'artifacts/mt5-order-preparation-20261012/clock-adjusted.json'));

  return {gate:reviewState(null),proposal:null,report};

 } catch {return {gate:reviewState(null),proposal:null,report:null};}

}



const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const hash=b=>createHash('sha256').update(b).digest('hex');

const equal=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

// An explicit allowlist, never a filesystem browser or an executable artifact host.

export const catalogue=[

 {id:'angebotscheck-v1',title:'Angebotscheck',kind:'Produkt',description:'Arbeitsvorlage zur Prüfung kleiner digitaler Projekte. Nachfrage und Verkaufspreis sind noch unvalidiert.',file:'products/angebotscheck-v1.md',format:'Markdown'},

 {id:'specula1',title:'API-Konfiguration · Regressionstests',kind:'Lieferung',description:'Eingereichter Testumfang. Der lokale Bericht ist kein aktueller Abnahme- oder Zahlungsnachweis.',file:'artifacts/specula1-delivery-20261009/completion.json',url:'https://github.com/Specula-Labs/specula-api/pull/12',format:'Prüfbericht'},

 {id:'specula9',title:'Abhängigkeiten · Bereinigung',kind:'Lieferung',description:'Bereinigung direkter Abhängigkeiten und dotenv-Regressionstests.',file:'artifacts/specula9-delivery-20261009/completion.json',url:'https://github.com/Specula-Labs/specula-api/pull/23',format:'Prüfbericht'},

 {id:'signpost26',title:'Bindings · Normalisierung',kind:'Lieferung',description:'Normalisierungstests. Vollständige Rust-/WASM-CI war lokal nicht abgenommen.',file:'artifacts/signpost26-delivery-20261009/completion.json',url:'https://github.com/Signpost-Labs/signpost-contracts/pull/118',format:'Prüfbericht'},

 {id:'signpost68',title:'WASM · Fehlerbehandlung',kind:'Lieferung',description:'Optimiererfehler und veraltete Artefakte sicher behandeln.',file:'artifacts/signpost68-delivery-20261009/completion.json',url:'https://github.com/Signpost-Labs/signpost-contracts/pull/119',format:'Prüfbericht'},

 {id:'signpost65',title:'CLI · Argumentvalidierung',kind:'Lieferung',description:'Validierung der sample-/tables-Argumente.',file:'artifacts/signpost65-delivery-20261009/completion.json',url:'https://github.com/Signpost-Labs/signpost-contracts/pull/120',format:'Prüfbericht'},

 {id:'presago',title:'Frontend · Asset- und HTML-Prüfung',kind:'Lieferung',description:'Lokale Asset-Auflösung und HTML-ID-Regressionen.',file:'artifacts/presago-validator-delivery-20261009/completion.json',url:'https://github.com/Presago-Labs/presago/pull/115',format:'Prüfbericht'},

];

function readFixed(base,relative,max=1048576){

 const resolved=path.resolve(base,relative),rel=path.relative(base,resolved);

 if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Path rejected');

 let current=base;

 if(fs.lstatSync(current).isSymbolicLink())throw Error('Link rejected');

 for(const part of rel.split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Link rejected');}

 const s=fs.statSync(resolved);if(!s.isFile()||s.size>max)throw Error('File unavailable');

 const b=fs.readFileSync(resolved);if(b.length>max)throw Error('File too large');return b;

}

export function createFounderStore(base=root,operations){

 const reviews=operations?.reviews()??new Map(),audit=[];

 function item(entry){try{const b=readFixed(base,entry.file);const digest=hash(b);return {...entry,file:undefined,available:true,digest,reviewed:reviews.get(entry.id)===digest};}catch{return {...entry,file:undefined,available:false,reviewed:false};}}

 return {

  snapshot(){return {at:new Date().toISOString(),liveReady:false,productionAccepted:false,controller:'Nicht verbunden',controllerDetail:'Keine aktuelle Controller-Telemetrie. Start, Pause und Fortsetzen sind nicht angebunden.',products:catalogue.map(item),audit:operations?.snapshot().audit??[...audit],operations:operations?.snapshot(),reports:readFounderReports(base),reviewPersistence:operations?'Dauerhaft gespeichert; an die geprüfte Dateiversion gebunden.':'Nur diese Sitzung',gates:[['private_interface','Diese lokale Oberfläche ist keine unabhängige Sicherheitsabnahme.'],['payout_capital_pipeline','Authentifizierter Zahlungsabgleich fehlt.'],['autonomous_business_cycle','Produktionsabnahme eines konkreten Geschäftsablaufs fehlt.'],['shell_isolation','Unabhängige Abnahme des Ausführungsbackends fehlt.'],['live_trading','Deaktiviert; kein Handelskapital freigegeben.']]};},

  task(input){if(!operations)throw Error('Persistence unavailable');operations.task(input);return this.snapshot();},

  document(id){const e=catalogue.find(x=>x.id===id);if(!e)throw Error('Unknown product');return readFixed(base,e.file);},

  review(input){if(!input||Object.keys(input).sort().join(',')!=='digest,id'||typeof input.id!=='string'||typeof input.digest!=='string')throw Error('Invalid review');const e=catalogue.find(x=>x.id===input.id);if(!e)throw Error('Unknown product');const current=item(e);if(!current.available||current.digest!==input.digest)throw Error('Document changed');if(reviews.get(e.id)!==current.digest){operations?.review(e.id,current.digest,e.title);reviews.set(e.id,current.digest);audit.push({at:new Date().toISOString(),title:e.title,action:'Inhalt lokal geprüft',digest:current.digest});}return this.snapshot();},

 };

}

export async function startFounderDashboard({store=createFounderStore(),port=0,readSourceOverview,readTrading,readCoinbase,readStripe,readFinance,readUsage=createAmplitudeReader(),tradeJournal,tradeRadar,tradingEngine,longHistory,autonomy,ledger,costImport,billing,power,referenceAdmin,now=Date.now,sessionMs=8*60*60*1000,loginFile,historyRoot=root,auditFile}={}){

 const poweredRead=read=>read?()=>power&&!power.isOn()?Promise.resolve({status:'powered-off'}):read():undefined;
 let financeCache,financeCacheAt=0;const finance=boundedReader(readFinance?async()=>{if(power&&!power.isOn())return {status:'powered-off'};if(financeCache&&Date.now()-financeCacheAt<300000)return financeCache;const report=await readFinance();if(['connected','reconciled-provider','partial'].includes(report?.status)&&Array.isArray(report.transactions)){financeCache=report;financeCacheAt=Date.now();}return report;}:undefined);

 const stripe=boundedReader(poweredRead(readStripe)),coinbase=boundedReader(poweredRead(readCoinbase)),trading=boundedReader(poweredRead(readTrading));
 const usage=boundedReader(poweredRead(readUsage));

 let bootstrap=randomBytes(32).toString('hex');
 const sessions=new Map();

 if(!Number.isSafeInteger(sessionMs)||sessionMs<1)throw Error('Invalid session lifetime');
 let origin='',cookieName='';
 const pruneSessions=()=>{const at=now();for(const [key,value] of sessions)if(at>value.expires)sessions.delete(key);};
 const saveLogin=()=>{if(!loginFile)return;fs.mkdirSync(path.dirname(loginFile),{recursive:true,mode:0o700});if(fs.lstatSync(path.dirname(loginFile)).isSymbolicLink()||fs.existsSync(loginFile)&&fs.lstatSync(loginFile).isSymbolicLink())throw Error('Login file link rejected');const tmp=loginFile+'.'+randomBytes(8).toString('hex')+'.new';fs.writeFileSync(tmp,JSON.stringify({pid:process.pid,url:origin,loginUrl:`${origin}/#${bootstrap}`,createdAt:new Date(now()).toISOString()}),{mode:0o600,flag:'wx'});fs.renameSync(tmp,loginFile);};
 const setCookie=(res,session)=>res.setHeader('Set-Cookie',`${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.ceil(sessionMs/1000)}`);

 const assets=new Map([['/reference-admin.css',['reference-admin.css','text/css; charset=utf-8']],['/reference-admin',['reference-admin.html','text/html; charset=utf-8']],['/reference-admin.mjs',['reference-admin.mjs','text/javascript; charset=utf-8']],['/capability-evidence.mjs',['capability-evidence.mjs','text/javascript; charset=utf-8']],['/fonts/Manrope-Variable.ttf',['fonts/Manrope-Variable.ttf','font/ttf']],['/', ['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/model.mjs',['model.mjs','text/javascript; charset=utf-8']],['/interaction.mjs',['interaction.mjs','text/javascript; charset=utf-8']],['/trading.mjs',['trading.mjs','text/javascript; charset=utf-8']],['/long-history.mjs',['long-history.mjs','text/javascript; charset=utf-8']],['/learning.mjs',['learning.mjs','text/javascript; charset=utf-8']],['/finance-refresh.mjs',['finance-refresh.mjs','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/middle-earth.css',['middle-earth.css','text/css; charset=utf-8']],['/middle-earth.mjs',['middle-earth.mjs','text/javascript; charset=utf-8']],['/middle-earth-model.mjs',['middle-earth-model.mjs','text/javascript; charset=utf-8']],['/middle-earth-world.mjs',['middle-earth-world.mjs','text/javascript; charset=utf-8']],['/middle-earth-3d.mjs',['middle-earth-3d.mjs','text/javascript; charset=utf-8']],['/middle-earth-regions.mjs',['middle-earth-regions.mjs','text/javascript; charset=utf-8']],['/vendor/three.module.min.js',['vendor/three.module.min.js','text/javascript; charset=utf-8']]]);

 // The Middle-earth files are found by walking their own folder, so no outside path can get in.
 const assetTypes={'.jpg':'image/jpeg','.png':'image/png','.hdr':'application/octet-stream','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.bin':'application/octet-stream','.md':'text/plain; charset=utf-8'};
 const walkAssets=relative=>{const full=path.join(root,'web/founder',relative);if(!fs.existsSync(full))return;for(const entry of fs.readdirSync(full,{withFileTypes:true})){const next=relative+'/'+entry.name;if(entry.isDirectory())walkAssets(next);else if(entry.isFile()&&assetTypes[path.extname(entry.name).toLowerCase()])assets.set('/'+encodeURI(next),[next,assetTypes[path.extname(entry.name).toLowerCase()]]);}};
 walkAssets('assets/middle-earth');
 for(const name of ['GLTFLoader','RGBELoader','SkeletonUtils','BufferGeometryUtils'])assets.set(`/vendor/${name}.js`,[`vendor/${name}.js`,'text/javascript; charset=utf-8']);
 assets.set('/command-palette.mjs',['command-palette.mjs','text/javascript; charset=utf-8']);
 assets.set('/middle-earth-assets.mjs',['middle-earth-assets.mjs','text/javascript; charset=utf-8']);
 assets.set('/middle-earth-rooms.mjs',['middle-earth-rooms.mjs','text/javascript; charset=utf-8']);
 assets.set('/middle-earth-places.mjs',['middle-earth-places.mjs','text/javascript; charset=utf-8']);
 assets.set('/middle-earth-lore.mjs',['middle-earth-lore.mjs','text/javascript; charset=utf-8']);
 assets.set('/middle-earth-time.mjs',['middle-earth-time.mjs','text/javascript; charset=utf-8']);
 assets.set('/middle-earth-sky.mjs',['middle-earth-sky.mjs','text/javascript; charset=utf-8']);

 const securityAudit=createSecurityAudit({file:auditFile,knownRoutes:[...assets.keys(),...["/api/task","/api/session","/api/reference-admin","/api/reference-admin/prepare","/api/reference-admin/approve","/api/reference-admin/withdraw","/api/reference-admin/protocol","/api/source-overview","/api/capability-evidence","/api/trading/history","/api/power","/api/finance/snapshot","/api/snapshot","/api/job/retry","/api/job/sight-inspection","/api/archive","/api/capabilities","/api/communication/status","/api/learning/snapshot","/api/long-history/snapshot","/api/long-history/lessons","/api/long-history/control","/api/trading/control","/api/control","/api/cost-import","/api/finance","/api/review"]],now});
 const server=http.createServer(async(req,res)=>{
  const requestAudit={event:req.url?.split(/[?#]/,1)[0]==='/api/session'?'login':'http',requestId:randomBytes(16).toString('hex'),method:req.method,route:req.url,reason:'ok',authenticated:false,peer:['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)?'loopback':'other'};
  if(auditFile&&typeof res.once==='function'){
   let recorded=false;const record=aborted=>{if(recorded)return;recorded=true;securityAudit.record({...requestAudit,status:aborted?0:res.statusCode,reason:aborted?'aborted':requestAudit.reason});};
   res.once('finish',()=>record(false));res.once('close',()=>record(!res.writableFinished));
  }

  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');

  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");

  const json=(status,data,reason)=>{requestAudit.reason=reason??(status<400?'ok':status===401?'unauthenticated':status===403?'forbidden':status===413?'too-large':status>=500?'server-error':'invalid-request');res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};

  // External launch links may navigate to the public login shell. Never extend
  // this exception to APIs, assets, framed documents, or requests with a foreign Origin.
  const loginNavigation=req.method==='GET'&&req.url==='/'&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document'&&req.headers['sec-fetch-user']==='?1';
  if(req.headers.host!==new URL(origin).host||(req.headers['sec-fetch-site']==='cross-site'&&!loginNavigation)||req.headers.origin&&req.headers.origin!==origin){json(403,{error:'Zugriff verweigert.'},'origin-host');return;}

  if(req.method==='GET'&&assets.has(req.url)){const [file,type]=assets.get(req.url);res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(path.join(root,'web/founder',file)));return;}


  try{

   let body;

   if(req.method==='POST'){

    if(req.headers.origin!==origin||req.headers['content-type']!=='application/json'){json(403,{error:'Ursprung oder Format abgewiesen.'},'origin-format');return;}

    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>(req.url==='/api/task'?8192:2048)){json(413,{error:'Eingabe zu groß.'});return;}chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString());

   }

   const auditCookie=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   const priorSession=sessions.get(auditCookie),expired=!!priorSession&&now()>priorSession.expires;
   pruneSessions();
   const cookie=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   const existing=sessions.get(cookie);
   if(existing){requestAudit.authenticated=true;requestAudit.sessionRef=existing.auditId;}
   if(req.method==='POST'&&req.url==='/api/session'){

    if(!equal(body?.token,bootstrap)){json(403,{error:'Anmeldung erforderlich.'},'invalid-bootstrap');return;}

    // A launcher reopening in the same browser must preserve other tabs' CSRF.
    // Independent status clients receive independent cookies and cannot revoke it.
    if(!existing&&sessions.size>=256){json(429,{error:'Zu viele aktive Anmeldungen. Bitte ein bestehendes Dashboardfenster verwenden oder später erneut versuchen.'},'too-many-sessions');return;}
    const session=existing?cookie:randomBytes(32).toString('hex');
    const state=existing??{csrf:randomBytes(32).toString('hex'),expires:now()+sessionMs,auditId:randomBytes(16).toString('hex')};
    bootstrap=randomBytes(32).toString('hex');saveLogin();
    state.expires=now()+sessionMs;sessions.set(session,state);requestAudit.authenticated=true;requestAudit.sessionRef=state.auditId;setCookie(res,session);json(200,{csrf:state.csrf});return;

   }

   if(!existing){json(401,{error:'Bitte über den persönlichen numaron-Launcher erneut anmelden. Kein Dienstneustart nötig.'},expired?'session-expired':'unauthenticated');return;}
   existing.expires=now()+sessionMs;setCookie(res,cookie);
   const csrf=existing.csrf;
   if(req.url==='/api/reference-admin'||req.url.startsWith('/api/reference-admin/')){
    if(!referenceAdmin){json(503,{error:'Referenzverwaltung ist nicht eingerichtet.'});return;}
    if(req.method==='GET'&&req.url==='/api/reference-admin'){try{json(200,{...referenceAdmin.snapshot(),csrf});}catch{json(503,{error:'Lokale Nachweise sind nicht verfuegbar.'});}return;}
    if(req.method!=='POST'||!equal(req.headers['x-obolus-csrf'],csrf)){json(403,{error:'Sicherheitspruefung fehlgeschlagen.'});return;}
    const action=new Map([['/api/reference-admin/prepare','prepare'],['/api/reference-admin/approve','approve'],['/api/reference-admin/withdraw','withdraw'],['/api/reference-admin/protocol','protocol']]).get(req.url);
    if(!action){json(404,{error:'Unbekannte Verwaltungsaktion.'});return;}
    try{json(200,referenceAdmin[action](body,cookie));}catch{json(409,{error:'Aktion blockiert. Stand aktualisieren und Eingaben, Freigabe sowie OFF-Zustand pruefen.'});}return;
   }
   if(req.method==='GET'&&req.url==='/api/source-overview'){
    try{if(typeof readSourceOverview!=='function')throw Error();json(200,await readSourceOverview());}
    catch{json(503,{error:'Lokaler Quellenstand nicht verf�gbar.'});}return;
   }
   if(req.method==='GET'&&req.url==='/api/capability-evidence'){
    if(typeof autonomy?.capabilityEvidence!=='function'){json(503,{error:'Capability evidence unavailable'});return;}
    json(200,autonomy.capabilityEvidence());return;
   }

   if(req.method==='GET'&&req.url==='/api/trading/history'){json(200,{tradingHistory:readTradingHistory(historyRoot),csrf});return;}
   if(power&&req.method==='GET'&&req.url==='/api/power'){json(200,{power:power.snapshot(),csrf});return;}
   if(power&&req.method==='POST'&&req.url==='/api/power'&&equal(req.headers['x-obolus-csrf'],csrf)){
    if(body?.enabled===true&&(body.intent!=='founder-start-confirmed'||Object.keys(body).sort().join(',')!=='enabled,intent,revision')){json(403,{error:'Start nur über den bewusst bestätigten Einschalter.'});return;}
    const command=body?.enabled===true?{enabled:true,revision:body.revision}:body;
    json(200,{power:power.control(command,{route:'/api/power',sessionId:existing.auditId}),csrf});return;
   }

   if(req.method==='GET'&&req.url==='/api/finance/snapshot'){
    const latest=await finance();
    const available=['connected','reconciled-provider','partial'].includes(latest.status)&&Array.isArray(latest.transactions);
    const report=available?latest:financeCache??null;
    const budget=typeof autonomy?.budgetSnapshot==='function'?autonomy.budgetSnapshot():autonomy?.snapshot().budget;
    json(200,{at:new Date().toISOString(),financeReport:report,financeLedger:ledger?.snapshot(report,budget),billing:billing?.snapshot(),costImport:costImport?.snapshot(),financeBudget:budget,financeStatus:{reportAvailable:available,reportObservedAt:report?.observedAt??null,reportCheckedAt:financeCacheAt?new Date(financeCacheAt).toISOString():null,reason:available?null:latest.reason??latest.status},csrf});return;
   }

   if(req.method==='GET'&&req.url==='/api/snapshot'){const [mt5,cb,st,fr,usageReport]=await Promise.all([trading(),coinbase(),stripe(),finance(),usage()]);let journalStatus='not-configured';if(tradeJournal){try{if(mt5.status==='connected')tradeJournal.observe(mt5);journalStatus='available';}catch{journalStatus='write-failed';}}const autonomous=autonomy?.snapshot();if(autonomous)autonomous.tasks=autonomous.tasks.map(t=>{let context=null;for(const id of t.dependencies??[]){try{const prior=autonomy.result(id);context=prior.analysis?.summary?.slice(0,400)??null;if(context)break;}catch{}}return {...t,context};});let financeReport=null;for(const t of (autonomous?.tasks??[]).filter(t=>t.kind==='finance-report'&&t.status==='done').sort((a,b)=>b.updated_ms-a.updated_ms)){try{financeReport=autonomy.result(t.id);break;}catch{}}if(['connected','reconciled-provider','partial'].includes(fr.status)&&Array.isArray(fr.transactions))financeReport=fr;json(200,{...store.snapshot(),usage:usageReport,financeReport,costImport:costImport?.snapshot(),billing:billing?.snapshot(),financeLedger:ledger?.snapshot(financeReport,autonomous?.budget),autonomy:autonomous,trading:mt5,coinbase:cb,stripe:st,tradeRadar:tradeRadar?.snapshot()??null,tradingEngine:tradingEngine?.snapshot()??null,longHistory:longHistory?.snapshot()??null,learning:autonomy?.learningSnapshot?.()??null,tradeReview:tradeJournal?{...tradeJournal.snapshot(),journalStatus}:tradeReview(),csrf});return;}

   if(autonomy&&req.method==='POST'&&req.url==='/api/job/sight-inspection'&&equal(req.headers['x-obolus-csrf'],csrf)){json(200,{inspection:autonomy.recordSightInspection(body),csrf});return;}
   if(autonomy&&req.method==='POST'&&req.url==='/api/job/retry'&&equal(req.headers['x-obolus-csrf'],csrf)){json(200,{autonomy:autonomy.retry(body),csrf});return;}

   if(autonomy&&req.method==='GET'&&req.url.split('?')[0]==='/api/archive'){
    const query=new URL(req.url,'http://localhost').searchParams;
    if([...query.keys()].some(k=>!['limit','cursor'].includes(k))||query.getAll('limit').length>1||query.getAll('cursor').length>1){json(400,{error:'Ungültige Archivabfrage.'});return;}
    json(200,{archive:autonomy.archive({limit:query.has('limit')?Number(query.get('limit')):25,cursor:query.get('cursor')}),csrf});return;
   }
   if(autonomy&&req.method==='GET'&&req.url==='/api/capabilities'){json(200,autonomy.snapshot().capabilities);return;}
   if(autonomy&&req.method==='GET'&&req.url==='/api/communication/status'){json(200,{communication:autonomy.communicationStatus?.()??{available:false,reason:'Local communication status unavailable'}});return;}

   if(autonomy&&req.method==='GET'&&/^\/api\/results\/[a-zA-Z0-9_-]{1,100}$/.test(req.url)){json(200,autonomy.result(req.url.slice(13)));return;}

   if(req.method==='GET'&&req.url==='/api/learning/snapshot'){json(200,{learning:autonomy?.learningSnapshot?.()??null,csrf});return;}
   if(longHistory&&req.method==='GET'&&req.url==='/api/long-history/snapshot'){json(200,{longHistory:longHistory.snapshot(),marketContext:tradingEngine?.contextSnapshot?.()??null,csrf});return;}
   if(longHistory&&req.method==='GET'&&req.url==='/api/long-history/lessons'){json(200,longHistory.lessons());return;}
   if(longHistory&&req.method==='GET'&&/^\/api\/long-history\/reports\/[a-zA-Z0-9_-]{1,100}$/.test(req.url)){json(200,longHistory.report(req.url.slice('/api/long-history/reports/'.length)));return;}
   if(longHistory&&req.method==='POST'&&req.url==='/api/long-history/control'&&equal(req.headers['x-obolus-csrf'],csrf)){
    if(power&&!power.isOn()&&body?.action==='resume'){json(409,{error:'Bitte Numaron zuerst einschalten.'});return;}
    if(!body||Object.keys(body).length!==1||!['pause','resume','stop'].includes(body.action)){json(400,{error:'Unbekannte Forschungsaktion.'});return;}
    const result=longHistory.control(body.action);json(200,{longHistory:result,csrf});if(body.action==='resume')void longHistory.tick?.().catch(()=>{});return;
   }

   if(tradingEngine&&req.method==='POST'&&req.url==='/api/trading/control'&&equal(req.headers['x-obolus-csrf'],csrf)){json(200,{tradingEngine:tradingEngine.control(body),csrf});return;}

   if(autonomy&&req.method==='POST'&&req.url==='/api/control'&&equal(req.headers['x-obolus-csrf'],csrf)){if(power&&['stop','emergency-stop'].includes(body?.action)){json(200,{power:power.control({enabled:false,revision:power.snapshot().revision}),csrf});return;}if(power&&!power.isOn()){json(409,{error:'Numaron ist ausgeschaltet. Bitte den gemeinsamen Einschalter verwenden.'});return;}json(200,{autonomy:autonomy.control(body),csrf});return;}

   if(req.method==='GET'&&/^\/product\/[a-z0-9-]+$/.test(req.url)){const id=req.url.slice(9);const b=store.document(id);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`inline; filename="${id}.txt"`});res.end(b);return;}

   if(req.method==='POST'&&req.url==='/api/task'&&equal(req.headers['x-obolus-csrf'],csrf)){json(200,{...store.task(body),csrf});return;}

   if(costImport&&req.method==='POST'&&req.url==='/api/cost-import'&&equal(req.headers['x-obolus-csrf'],csrf)){costImport.resolve(body);json(200,{costImport:costImport.snapshot(),csrf});return;}
   if(ledger&&req.method==='POST'&&req.url==='/api/finance'&&equal(req.headers['x-obolus-csrf'],csrf)){financeCacheAt=0;const report=await finance();json(200,{financeLedger:ledger.apply(body,report,autonomy?.snapshot().budget),csrf});return;}

   if(req.method==='POST'&&req.url==='/api/review'&&equal(req.headers['x-obolus-csrf'],csrf)){json(200,{...store.review(body),csrf});return;}

   json(403,{error:'Aktion nicht freigegeben.'});

  }catch{json(409,{error:'Nicht übernommen. Dokument oder Eingabe prüfen und Ansicht aktualisieren.'});}

 });

 server.requestTimeout=5000;server.headersTimeout=5000;

 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;cookieName='numaron_founder_'+server.address().port;
 try{saveLogin();}catch(e){await new Promise(resolve=>server.close(resolve));throw e;}

 return {url:origin,loginUrl:`${origin}/#${bootstrap}`,auditStatus:()=>securityAudit.status(),close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();})};

}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){

 const open=process.argv.length===3&&process.argv[2]==='--open'&&process.platform==='win32';

 if(process.argv.length!==2&&!open)throw Error('Only --open on Windows is accepted');

 const ui=await startFounderDashboard();

 if(open){const browser=spawn('explorer.exe',[ui.loginUrl],{windowsHide:true,stdio:'ignore'});browser.on('error',()=>process.stderr.write('Browser could not open. Restart without --open to obtain a personal link.\n'));browser.unref();process.stdout.write(`Founder Studio opened in your default browser: ${ui.url}\n`);}

 else process.stdout.write(ui.loginUrl+'\n');

 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void ui.close();});

}
