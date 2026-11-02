// Manual setup only. Never imported by the production controller or OFF scheduler.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {createGoogleConsent,exchangeGoogleCode} from './founder-google-oauth.mjs';
export async function startGoogleConsentServer({client,previousAccess,exchange=exchangeGoogleCode,save,timeoutMs=15*60000}={}){
 if(!client?.client_secret||typeof save!=='function')throw Error('Google setup dependencies missing');
 let pending,processing=false,timer;
 const entry='/setup/'+randomBytes(24).toString('hex');
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");res.setHeader('Content-Type','text/plain; charset=utf-8');
  const origin=`http://127.0.0.1:${server.address()?.port}`;
  if(req.method!=='GET'||req.headers.host!==new URL(origin).host||!pending){res.writeHead(404).end('Not found');return;}
  if(req.url===entry){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="de"><meta charset="utf-8"><title>Numaron Google-Freigabe</title><h1>Google-Sendefreigabe für Numaron</h1><p>Konto: numaronia@gmail.com. Ergänzt gmail.send zu den bisherigen Berechtigungen. Es wird keine Nachricht gesendet. Numaron bleibt OFF.</p><p>Bitte den Google-Dialog persönlich prüfen und bestätigen.</p><a href="'+pending.url.replaceAll('&','&amp;')+'">Google-Freigabe öffnen</a></html>');return;}
  let u;try{u=new URL(req.url,origin);}catch{res.writeHead(400).end('Invalid request');return;}
  if(u.pathname!=='/oauth/callback'){res.writeHead(404).end('Not found');return;}
  if(u.searchParams.getAll('state').length!==1||u.searchParams.get('state')!==pending.state){res.writeHead(400).end('Invalid authorization state');return;}
  if(processing){res.writeHead(409).end('Authorization already processing');return;}
  processing=true;
  try{
   const access=await exchange({pending,callback:u.href,clientSecret:client.client_secret,previousAccess});
   if(access?.scope?.account!=='numaronia@gmail.com'||!access.scope.granted?.includes('https://www.googleapis.com/auth/gmail.send'))throw Error('Send grant missing');
   await save(access);
   res.end('Numaron: Google-Sendefreigabe verschlüsselt gespeichert. Keine Nachricht versandt. Numaron bleibt OFF.');
  }catch{res.writeHead(400).end('Numaron: Freigabe nicht gespeichert. Konto und Berechtigungen prüfen. Bestehender Zugang bleibt erhalten.');}
  finally{clearTimeout(timer);server.close();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 pending=createGoogleConsent({clientId:client.client_id,port:server.address().port,purpose:'order-replies'});
 timer=setTimeout(()=>server.close(),timeoutMs);timer.unref();
 return {url:`http://127.0.0.1:${server.address().port}${entry}`,close:()=>{clearTimeout(timer);return new Promise(resolve=>server.close(()=>resolve()));}};
}
