// Independent, deterministic AVV observation. No model, mail mutation, signature or DNS APIs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readLocalCredential} from './founder-local-access.mjs';
import {refreshGoogleAccess} from './founder-google-oauth.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fail=code=>Object.assign(Error(code),{code});
export async function gmailRead(relative,token,request=fetch){
 if(!/^(profile|messages\?[^\r\n]*|messages\/[A-Za-z0-9_-]+\?format=full)$/.test(relative))throw fail('mail-path');
 const r=await request('https://gmail.googleapis.com/gmail/v1/users/me/'+relative,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw fail('gmail-http-'+r.status);
 const reader=r.body.getReader(),chunks=[];let size=0;
 try{for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>2000000)throw fail('mail-size');chunks.push(v.value);}}finally{await reader.cancel();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function partsText(p){return (p?.body?.data?Buffer.from(p.body.data,'base64url').toString('utf8'):'')+(p?.parts??[]).map(partsText).join('\n');}
export async function collectMail(read){
 if((await read('profile')).emailAddress!=='numaronia@gmail.com')throw fail('mail-account');
 const q='in:anywhere after:2026/10/17 to:info@numaron.ch {zohosign "data processing" "Datenverarbeitungszusatz" "Datenverarbeitungsvereinbarung"}';
 let page='',count=0;const ids=new Set(),invitations=[];
 do{
  if(++count>10)throw fail('mail-pagination');
  const r=await read('messages?'+new URLSearchParams({q,maxResults:'100',includeSpamTrash:'true',...(page?{pageToken:page}:{})}));
  if(r.messages!==undefined&&!Array.isArray(r.messages))throw fail('mail-response');
  for(const m of r.messages??[]){if(!/^[A-Za-z0-9_-]+$/.test(m.id))throw fail('mail-response');ids.add(m.id);}
  page=r.nextPageToken??'';if(typeof page!=='string')throw fail('mail-response');
 }while(page);
 for(const id of ids){
  const message=await read('messages/'+id+'?format=full');
  const h=n=>(message.payload?.headers??[]).filter(x=>x.name.toLowerCase()===n).map(x=>x.value).join(' ');
  const from=h('from'),to=h('to'),subject=h('subject'),sender=from.match(/(?:<|\s|^)([^<>\s]+@[^<>\s]+)>?/)?.[1]?.toLowerCase()??'';
  const domain=sender.split('@')[1];
  if(!['zohosign.eu','zohosign.com','zoho.eu','zoho.com','zohocorp.com','zohocorp.eu','zohoaccounts.eu'].some(d=>domain===d||domain?.endsWith('.'+d)))continue;
  if(!/(?:^|[<\s,])info@numaron\.ch(?:>|\s|,|$)/i.test(to))continue;
  const text=subject+' '+(message.snippet??'')+' '+partsText(message.payload);
  if(!/data processing|\bDPA\b|datenverarbeit|\bAVV\b/i.test(text)||!/sign|unterzeich|unterschrift|review document|dokument prüfen/i.test(text))continue;
  invitations.push({id,subject:subject.slice(0,200),sender,receivedAt:Number(message.internalDate)||null,kind:'signature-invitation-candidate'});
 }
 return invitations;
}
export function classifyDpa(text,url=''){
 if(/\/signin|\/relogin/.test(url)||/Anmelden zum Zugriff|Sign in to your account|Sign in to Zoho/i.test(text))return {status:'login-required'};
 if(!/Datenverarbeitungszusatz|Data Processing Addendum/i.test(text))return {status:'unrecognized'};
 if(/Abgelehnt|Rejected/i.test(text))return {status:'rejected'};
 if(/Ausstehende Signaturen|Pending signatures?/i.test(text))return {status:'pending-signatures'};
 if(/Vollständig unterzeichnet|Signing completed|Signed successfully/i.test(text))return {status:'signed-observed'};
 return {status:'unrecognized'};
}
export function nextAlerts(previous,result){
 const state={...previous,seen:[...(previous.seen??[])]},alerts=[];const seen=new Set(state.seen);
 const add=(key,title,text)=>{if(seen.has(key))return;seen.add(key);alerts.push({key,title,text});};
 if(result.mail.status==='ok')for(const m of result.mail.invitations)add('mail:'+m.id,'Zoho-AVV: Einladung eingegangen','Eine passende Signatur-Einladung fuer info@numaron.ch liegt vor. Bitte vor einer Unterschrift pruefen.');
 else add('error:'+result.mail.status,'Zoho-AVV: Mailpruefung benoetigt Hilfe',result.mail.status);
 const status=result.zoho.status;
 if(['pending-signatures','rejected','signed-observed'].includes(status)){
  if(state.dpaStatus&&state.dpaStatus!==status)add('dpa:'+status,'Zoho-AVV: Status geaendert',status);
  state.dpaStatus=status;
 }else add('error:'+status,'Zoho-AVV: Statuspruefung benoetigt Hilfe',status);
 state.seen=[...seen];return {state,alerts};
}
async function mailRun(){
 try{
  let access=await readLocalCredential('google-access');
  if(access?.scope?.account!=='numaronia@gmail.com'||access.billingEnabled!==false||!access.scope.granted?.includes('https://www.googleapis.com/auth/gmail.readonly'))throw fail('gmail-access-required');
  if(access.expiresAt<Date.now()+120000)access=await refreshGoogleAccess({access,client:await readLocalCredential('google-client')});
  return {status:'ok',checkedAt:new Date().toISOString(),invitations:await collectMail(p=>gmailRead(p,access.credential))};
 }catch(e){return {status:/^(gmail-|mail-)/.test(e.code??'')?e.code:'gmail-access-required',checkedAt:null};}
}
async function zohoRun(){
 let context;
 try{
  const runtime=path.join(process.env.LOCALAPPDATA,'Numaron/PlaywrightMCP');
  const {chromium}=createRequire(path.join(runtime,'package.json'))('playwright');
  // Zoho reauthenticates this session in headless mode. Use the ordinary browser;
  // do not spoof its identity or bypass authentication/security checks.
  context=await chromium.launchPersistentContext(path.join(runtime,'profile-cloudflare-brave'),{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:false,args:['--start-minimized'],chromiumSandbox:true,timeout:30000,serviceWorkers:'block',acceptDownloads:false});
  // Page scripts cannot submit DPA requests/signatures. Reads only, including subresources.
  await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();
  await page.goto('https://accounts.zoho.eu/home#privacy/myc?20120553244',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByText(/Ausstehende Signaturen|Pending signatures?|Anmelden zum Zugriff|Sign in to|Abgelehnt|Rejected|Vollständig unterzeichnet|Signing completed/i).first().waitFor({timeout:20000}).catch(()=>{});
  const text=await page.locator('body').innerText({timeout:10000});
  const result=classifyDpa(text,page.url());
  if(result.status==='login-required')return {...result,checkedAt:null};
  if(!/info@numaron\.(ch|com)/i.test(text))return {status:'account-unconfirmed',checkedAt:null};
  return {...result,checkedAt:['pending-signatures','rejected','signed-observed'].includes(result.status)?new Date().toISOString():null};
 }catch(e){return {status:/ProcessSingleton|SingletonLock|user data directory.*in use|already in use/i.test(e.message)?'profile-busy':'zoho-unavailable',checkedAt:null};}
 finally{await context?.close().catch(()=>{});}
}
export function atomicJSON(file,value){const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
async function run(){
 if(process.env.NUMARON_AVV_LOCK_HELD!=='1')throw fail('Start only through start-numaron-avv-monitor.ps1');
 const directory=path.join(process.env.LOCALAPPDATA,'Numaron/AVVMonitor');fs.mkdirSync(directory,{recursive:true});
 const config=JSON.parse(fs.readFileSync(path.join(directory,'config.json'),'utf8'));
 if(config.enabled!==true||config.owner!=='local'||config.version!==1)throw fail('Monitor disabled');
 const stateFile=path.join(directory,'state.json');let prior={seen:[],dpaStatus:'pending-signatures'};
 try{prior=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw fail('Invalid monitor state');}
 if(process.env.NUMARON_AVV_CHECK_NOW!=='1'&&prior.lastRunAt&&Date.now()-Date.parse(prior.lastRunAt)<50*60000){console.log('AVV monitor: duplicate interval skipped');return;}
 const startedAt=new Date().toISOString();atomicJSON(path.join(directory,'health.json'),{status:'running',startedAt});
 const [mail,zoho]=await Promise.all([mailRun(),zohoRun()]);
 const {state,alerts}=nextAlerts(prior,{mail,zoho});
 let journal=[];const journalFile=path.join(directory,'alerts.json');
 try{journal=JSON.parse(fs.readFileSync(journalFile,'utf8'));if(!Array.isArray(journal))throw fail('Invalid alert journal');}catch(e){if(e.code!=='ENOENT')throw e;}
 // Durable alert journal before deduplication state: crash cannot silently discard an alert.
 for(const a of alerts)if(!journal.some(x=>x.key===a.key))journal.push({...a,at:new Date().toISOString()});
 atomicJSON(journalFile,journal);atomicJSON(stateFile,{...state,lastRunAt:startedAt});
 const health={status:mail.status==='ok'&&zoho.checkedAt?'ok':'attention-required',startedAt,finishedAt:new Date().toISOString(),mail,zoho,modelCalls:0,mailMutations:0,signatures:0};
 atomicJSON(path.join(directory,'health.json'),health);
 console.log(JSON.stringify({status:health.status,mail:mail.status,zoho:zoho.status,newAlerts:alerts.length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(e=>{console.error(JSON.stringify({error:e.code??e.message,path:e.path??null,localAppData:process.env.LOCALAPPDATA??null}));process.exitCode=1;});
