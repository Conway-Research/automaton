import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const defaultFile=()=>path.join(process.env.LOCALAPPDATA,'Numaron','freelancer-test-access.dpapi');
const fail=message=>{throw Error('Freelancer access: '+message);};
const validToken=t=>typeof t==='string'&&t.length>=20&&t.length<=16000&&!/[\s\u0000-\u001f]/.test(t);
const off=()=>JSON.parse(fs.readFileSync(new URL('../artifacts/founder-integration-20261012/power-state.jsonl',import.meta.url),'utf8').trim().split('\n').at(-1)).enabled===false;
function dpapi(input,decrypt=false){
 const code="Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::"+(decrypt?'Unprotect':'Protect')+"($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))";
 try{return Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{input:Buffer.from(input).toString('base64'),encoding:'utf8',windowsHide:true,timeout:10000,stdio:['pipe','pipe','ignore']}),'base64');}catch{fail('Windows user encryption unavailable');}
}
export function saveFreelancerTestAccess(token,{file=defaultFile(),protect=s=>dpapi(Buffer.from(s)),isOff=off}={}){
 if(!isOff())fail('requires OFF');if(!validToken(token))fail('invalid token');
 const directory=path.dirname(file);fs.mkdirSync(directory,{recursive:true});let current=path.resolve(directory);
 for(;;){if(fs.lstatSync(current).isSymbolicLink())fail('symlink directory');const parent=path.dirname(current);if(parent===current)break;current=parent;}
 if(fs.existsSync(file))fail('existing access is never replaced');
 const value={provider:'freelancer',environment:'test-only',productionEnabled:false,expectedUsername:'Numaron',createdAt:new Date().toISOString(),token};
 const sealed=protect(JSON.stringify(value));if(!Buffer.isBuffer(sealed)||!sealed.length||sealed.includes(token))fail('encryption failed');if(!isOff())fail('requires OFF');
 fs.writeFileSync(file,sealed,{flag:'wx',mode:0o600});return {saved:true,environment:'test-only',productionEnabled:false};
}
export function readFreelancerTestAccess({file=defaultFile(),unprotect=b=>dpapi(b,true).toString('utf8')}={}){
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64000)fail('invalid encrypted file');
 let value;try{value=JSON.parse(unprotect(fs.readFileSync(file)));}catch{fail('encrypted access unreadable');}
 if(value.provider!=='freelancer'||value.environment!=='test-only'||value.productionEnabled!==false||value.expectedUsername!=='Numaron'||!validToken(value.token))fail('invalid test access');return value;
}
export async function verifyFreelancerTestAccess(access,{request=fetch,isOff=off}={}){
 const active=()=>{if(!isOff())fail('requires OFF');};active();
 if(!validToken(access?.token)||access.environment!=='test-only'||access.productionEnabled!==false)fail('test-only credential required');
 async function get(endpoint){active();let r;try{r=await request('https://www.freelancer.com'+endpoint,{method:'GET',headers:{Accept:'application/json','Freelancer-OAuth-V1':access.token},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{fail('read request unavailable');}active();if(!r.ok){await r.body?.cancel();return {http:r.status};}let text='';try{for await(const b of r.body){text+=Buffer.from(b).toString('utf8');if(Buffer.byteLength(text)>64000)fail('bounded response required');}return {http:r.status,data:JSON.parse(text)};}catch{fail('invalid bounded response');}}
 const self=await get('/api/users/0.1/self/');const user=self.data?.result;
 if(self.data?.status!=='success'||!Number.isSafeInteger(user?.id)||user.username!=='Numaron')fail('expected account identity not verified');
 const messages=await get('/api/messages/0.1/threads/?limit=1&offset=0');active();
 return {checkedAt:new Date().toISOString(),identityVerified:true,username:user.username,userId:user.id,selfHttp:self.http,messageHttp:messages.http,messageRead:messages.data?.status==='success',writePermissionsVerified:false,productionEnabled:false,credentialEnvironment:'test-only',providerWrites:0};
}
