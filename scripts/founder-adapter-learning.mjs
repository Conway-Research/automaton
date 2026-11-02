import {digest,bounded} from './founder-restoration-integrity.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
export function planAdapterWork({source,rootTaskId,budget}){
 if(!bounded(source?.id)||!bounded(rootTaskId)||budget?.active!==true||budget.entriesComplete===false||!Number.isSafeInteger(budget.rootRemainingRappen)||budget.rootRemainingRappen<50)return {tasks:[],blocker:'same-family-budget-required'};
 return {tasks:['inspect-existing-interface','draft-adapter','verify-adapter-offline'].map((kind,i)=>({id:'adapter-'+digest([source.id,rootTaskId,kind]).slice(0,24),rootTaskId,kind,sourceId:source.id,maxCostRappen:i===1?50:0,liveAuthorized:false})),blocker:null};
}
export async function certifyAdapterCandidate({sourceId,files,sandbox,assertActive}){
 assertActive();if(!bounded(sourceId)||sandbox?.available!==true||typeof sandbox.run!=='function'||sandbox.network!=='none'||sandbox.hostMounts!==false||!/^sha256:[a-f0-9]{64}$/.test(sandbox.image??''))return {passed:false,blocker:'certified-offline-sandbox-required',liveAuthorized:false};
 const testFile=f=>/\.test\.(?:mjs|js|cjs)$/.test(f.path);
 if(!Array.isArray(files)||!files.length||files.length>10||files.some(f=>!f||typeof f.path!=='string'||f.path.length>200||!/^[-\w.]+\.(?:mjs|js|cjs)$/.test(f.path)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(f.path)||typeof f.content!=='string'||f.content.includes('\0'))||new Set(files.map(f=>f.path.toLowerCase())).size!==files.length||!files.some(testFile)||!files.some(f=>!testFile(f))||Buffer.byteLength(JSON.stringify(files))>262144)return {passed:false,blocker:'bounded-adapter-source-required',liveAuthorized:false};
 const admitted=files.map(({path,content})=>({path,content})),identity=sandbox.image,original=digest(files),admittedDigest=digest(admitted),filesDigest=sandbox.filesDigest??profileFilesDigest,exact=filesDigest(admitted);
 const result=await sandbox.run(admitted);assertActive();
 if(original!==digest(files)||admittedDigest!==digest(admitted)||sandbox.image!==identity||sandbox.available!==true||sandbox.network!=='none'||sandbox.hostMounts!==false||result?.passed!==true||!Number.isSafeInteger(result.tests)||result.tests<1||result.sourceDigest!==exact||result.image!==identity||result.network!=='none'||result.hostMounts!==false)return {passed:false,blocker:'exact-independent-adapter-tests-required',liveAuthorized:false};
 return {passed:true,state:'offline-verified',sourceId,digest:exact,image:identity,liveAuthorized:false,requiredNextEvidence:['official-interface','existing-account-rights','source-transport-policy','fresh-read-certification']};
}
