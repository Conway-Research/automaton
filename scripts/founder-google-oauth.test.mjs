import test from 'node:test';import assert from 'node:assert/strict';
import {createGoogleConsent,exchangeGoogleCode,refreshGoogleAccess} from './founder-google-oauth.mjs';

test('new send consent preserves the existing approved workspace and an omitted refresh token',async()=>{
 const pending=createGoogleConsent({clientId:'test.apps.googleusercontent.com',port:43127,purpose:'order-replies'});
 const previousAccess={provider:'google',billingEnabled:false,refreshToken:'old-refresh',scope:{account:'numaronia@gmail.com',labelId:'Label_jobs',folderId:'existing-folder'}};
 const request=async u=>Response.json(u.includes('/token')?{access_token:'new-access',expires_in:3600,scope:pending.scopes.join(' ')}:{email:'numaronia@gmail.com',email_verified:true});
 const result=await exchangeGoogleCode({pending,previousAccess,callback:`${pending.redirectUri}?state=${pending.state}&code=fake`,clientSecret:'fake',request});
 assert.equal(result.refreshToken,'old-refresh');assert.equal(result.scope.labelId,'Label_jobs');assert.equal(result.scope.folderId,'existing-folder');assert.ok(result.scope.granted.includes('https://www.googleapis.com/auth/gmail.send'));
});
test('order-reply setup explicitly requests only additional gmail.send; ordinary consent stays read-only',()=>{
 const base={clientId:'test.apps.googleusercontent.com',port:43127};
 const read=createGoogleConsent(base),send=createGoogleConsent({...base,purpose:'order-replies'});
 assert.ok(!read.scopes.includes('https://www.googleapis.com/auth/gmail.send'));
 assert.deepEqual(send.scopes.filter(s=>!read.scopes.includes(s)),['https://www.googleapis.com/auth/gmail.send']);
 assert.throws(()=>createGoogleConsent({...base,purpose:'full-mailbox'}));
});
test('consent uses PKCE, exact business account and bounded scopes',()=>{
 const x=createGoogleConsent({clientId:'test.apps.googleusercontent.com',port:43127});const u=new URL(x.url);
 assert.equal(u.hostname,'accounts.google.com');assert.equal(u.searchParams.get('login_hint'),'numaronia@gmail.com');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('access_type'),'offline');assert.ok(!u.searchParams.get('scope').includes('gmail.send'));assert.equal(x.verifier.length,64);
});
test('refresh preserves approved workspace and refresh token without expanding scopes',async()=>{
 const access={provider:'google',billingEnabled:false,credential:'old',refreshToken:'private-refresh',scope:{account:'numaronia@gmail.com',labelId:'Label_1',folderId:'own-folder'}};
 let calls=0;const refreshed=await refreshGoogleAccess({access,client:{client_id:'id',client_secret:'secret'},request:async(u,o)=>{calls++;assert.equal(u,'https://oauth2.googleapis.com/token');assert.equal(new URLSearchParams(o.body).get('scope'),null);return Response.json({access_token:'renewed',expires_in:3600});}});
 assert.equal(calls,1);assert.deepEqual(refreshed.scope,access.scope);assert.equal(refreshed.refreshToken,access.refreshToken);assert.equal(refreshed.credential,'renewed');
});
test('wrong OAuth state stops before network; wrong account never persists credentials',async()=>{
 const pending=createGoogleConsent({clientId:'test.apps.googleusercontent.com',port:43127});let calls=0;
 const request=async u=>{calls++;return Response.json(u.includes('token')?{access_token:'private-test-token',refresh_token:'refresh',expires_in:3600,scope:pending.scopes.join(' ')}:{email:'other@example.com',email_verified:true});};
 await assert.rejects(exchangeGoogleCode({pending,callback:'http://127.0.0.1:43127/oauth/callback?state=wrong&code=x',clientSecret:'test',request}),/callback/);assert.equal(calls,0);
 await assert.rejects(exchangeGoogleCode({pending,callback:`${pending.redirectUri}?state=${pending.state}&code=x`,clientSecret:'test',request}),/account/);assert.equal(calls,2);
});
