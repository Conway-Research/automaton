import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const scopes=['openid','email','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/drive.file'];
export function createGoogleConsent({clientId,port,purpose='workspace-read'}){
 if(!['workspace-read','order-replies'].includes(purpose))throw Error('Unsupported Google consent purpose');
 const requestedScopes=purpose==='order-replies'?[...scopes,'https://www.googleapis.com/auth/gmail.send']:[...scopes];
 if(!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid OAuth setup');
 const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url'),redirectUri=`http://127.0.0.1:${port}/oauth/callback`;
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:requestedScopes.join(' '),access_type:'offline',prompt:'consent',login_hint:'numaronia@gmail.com',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 return {url:u.href,clientId,state,verifier,redirectUri,scopes:requestedScopes,purpose,expiresAt:Date.now()+15*60000};
}
async function readJson(request,url,options){
 const r=await request(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok||!r.body)throw Error('Google authorization failed');let n=0;const parts=[],reader=r.body.getReader();try{for(;;){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>64000)throw Error('Google response limit');parts.push(v.value);}}finally{await reader.cancel();}return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function exchangeGoogleCode({pending,callback,clientSecret,previousAccess,request=fetch}){
 const u=new URL(callback),expected=new URL(pending.redirectUri),state=u.searchParams.get('state')??'';
 if(Date.now()>pending.expiresAt||u.origin!==expected.origin||u.pathname!==expected.pathname||state.length!==pending.state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(pending.state))||!u.searchParams.get('code')||u.searchParams.has('error'))throw Error('Invalid OAuth callback');
 const token=await readJson(request,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:pending.clientId,client_secret:clientSecret,code:u.searchParams.get('code'),code_verifier:pending.verifier,redirect_uri:pending.redirectUri,grant_type:'authorization_code'}).toString()});
 const previous=previousAccess?.provider==='google'&&previousAccess.billingEnabled===false&&previousAccess.scope?.account==='numaronia@gmail.com'?previousAccess:null;
 const refreshToken=token.refresh_token??previous?.refreshToken;
 if(typeof token.access_token!=='string'||!token.access_token||typeof refreshToken!=='string'||!refreshToken||!Number.isFinite(token.expires_in)||token.expires_in<60||token.expires_in>86400)throw Error('Google token incomplete');
 const granted=new Set(String(token.scope??'').split(' '));if(!pending.scopes.filter(s=>s.startsWith('https://')).every(s=>granted.has(s)))throw Error('Google permissions incomplete');
 const identity=await readJson(request,'https://openidconnect.googleapis.com/v1/userinfo',{method:'GET',headers:{Authorization:`Bearer ${token.access_token}`}});
 if(identity.email!=='numaronia@gmail.com'||identity.email_verified!==true)throw Error('Wrong Google account');
 return {provider:'google',billingEnabled:false,credential:token.access_token,refreshToken,expiresAt:Date.now()+token.expires_in*1000,scope:{...previous?.scope,account:identity.email,labelId:previous?.scope?.labelId??'Label_1',granted:[...granted]}};
}
export async function refreshGoogleAccess({access,client,request=fetch}){
 if(access?.provider!=='google'||access.billingEnabled!==false||access.scope?.account!=='numaronia@gmail.com'||!access.refreshToken||!client?.client_id||!client.client_secret)throw Error('Google refresh setup missing');
 const token=await readJson(request,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,refresh_token:access.refreshToken,grant_type:'refresh_token'}).toString()});
 if(typeof token.access_token!=='string'||!Number.isFinite(token.expires_in)||token.expires_in<60||token.expires_in>86400)throw Error('Google refresh failed');
 return {...access,credential:token.access_token,expiresAt:Date.now()+token.expires_in*1000};
}
