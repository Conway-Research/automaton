import {createHash} from 'node:crypto';
export function canonical(value){
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 throw Error('Invalid evidence value');
}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
export const bounded=(value,max=300)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f]/.test(value);
export function checkedJSON(value,max=256000){const text=canonical(value);if(Buffer.byteLength(text)>max||/"(?:privateKey|secretKey|password|access_token|refresh_token)"\s*:/.test(text)||/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}/.test(text))throw Error('Evidence size or privacy boundary');return JSON.parse(text);}
export function orderKey(key){if(!key||!['sourceId','externalId','ownerId'].every(k=>bounded(key[k])))throw Error('Invalid order identity');return {sourceId:key.sourceId,externalId:key.externalId,ownerId:key.ownerId};}
