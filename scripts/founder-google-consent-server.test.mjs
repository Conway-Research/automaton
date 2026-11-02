import test from 'node:test';import assert from 'node:assert/strict';
import {startGoogleConsentServer} from './founder-google-consent-server.mjs';
test('manual consent is loopback only, wrong state never exchanges, and successful credentials are saved once',async()=>{
 let calls=0,saved=0;const value={scope:{account:'numaronia@gmail.com',granted:['https://www.googleapis.com/auth/gmail.send']}};
 const server=await startGoogleConsentServer({client:{client_id:'test.apps.googleusercontent.com',client_secret:'private'},previousAccess:{scope:{folderId:'preserved'}},exchange:async x=>{calls++;assert.equal(x.previousAccess.scope.folderId,'preserved');return value;},save:async x=>{saved++;assert.equal(x,value);}});
 try{const page=await fetch(server.url);const html=await page.text();assert.match(html,/accounts.google.com/);assert.doesNotMatch(html,/private/);const target=new URL(html.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&'));const redirect=target.searchParams.get('redirect_uri');
 const wrong=await fetch(redirect+'?state=wrong&code=fake');assert.equal(wrong.status,400);assert.equal(calls,0);assert.equal(saved,0);
 const callback=redirect+'?state='+target.searchParams.get('state')+'&code=fake';const result=await fetch(callback);assert.equal(result.status,200);assert.match(await result.text(),/gespeichert/);assert.equal(calls,1);assert.equal(saved,1);
 }finally{await server.close();}
});
test('cancelled or failed authorization leaves existing credentials unchanged',async()=>{
 let writes=0;const server=await startGoogleConsentServer({client:{client_id:'test.apps.googleusercontent.com',client_secret:'private'},exchange:async()=>{throw Error('provider details must not leak');},save:async()=>{writes++;}});
 try{const html=await(await fetch(server.url)).text(),auth=new URL(html.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&'));const result=await fetch(auth.searchParams.get('redirect_uri')+'?state='+auth.searchParams.get('state')+'&error=access_denied');assert.equal(result.status,400);assert.doesNotMatch(await result.text(),/provider details/);assert.equal(writes,0);}finally{await server.close();}
});
