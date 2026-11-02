import {transformProtectedJson,writeNewProtectedIdentity} from './protected-json.js';

type SyntheticOrRealIdentity={chainType:'evm'|'solana';createdAt:string;privateKey?:string;secretKey?:string};
function validate(value:unknown):asserts value is SyntheticOrRealIdentity {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid recovery identity');
 const v=value as SyntheticOrRealIdentity,key=v.chainType==='evm'?'privateKey':'secretKey';
 if(!['evm','solana'].includes(v.chainType)||Object.keys(v).sort().join(',')!==['chainType','createdAt',key].sort().join(',')||
  typeof v.createdAt!=='string'||!Number.isFinite(Date.parse(v.createdAt))||typeof v[key]!=='string'||!v[key]!.length||v[key]!.length>4096)
  throw Error('Invalid recovery identity');
}
/** Account-bound recovery building block only. No file discovery, automatic
 * backups, key generation, cloud export or registration as an agent tool.
 * CurrentUser DPAPI cannot recover after losing that Windows account. */
export function encodeIdentityRecovery(value:unknown):string {
 validate(value);
 const protectedValue=transformProtectedJson({password:JSON.stringify(value)},'protect');
 return JSON.stringify({version:1,protection:'windows-dpapi-current-user',payload:protectedValue.password});
}
export function restoreIdentityRecovery(envelope:string,newFile:string):void {
 let value:unknown;
 try{
  if(typeof envelope!=='string'||envelope.length>32768)throw Error();
  const parsed=JSON.parse(envelope);
  if(!parsed||Object.keys(parsed).sort().join(',')!=='payload,protection,version'||parsed.version!==1||parsed.protection!=='windows-dpapi-current-user'||
   typeof parsed.payload!=='string'||!parsed.payload.startsWith('obolus-dpapi:v1:'))throw Error();
  value=JSON.parse(transformProtectedJson({password:parsed.payload},'unprotect').password);validate(value);
 }catch{throw Error('Identity recovery rejected');}
 // Exclusive, protected creation. Existing identities are never read/replaced.
 writeNewProtectedIdentity(newFile,value);
}
