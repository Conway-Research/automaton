import{parentPort,workerData}from'node:worker_threads';
import path from 'node:path';
import {resolveProtectedCredential} from './founder-local-credential-path.mjs';
try{
 const {operation,options}=workerData;let value;
 if(operation==='service'){const{readServiceAccess}=await import('./founder-service-access.mjs');value=readServiceAccess(options.provider,{directory:options.directory});}
 else if(operation==='dealwork'){const{readDealworkAccess}=await import('./founder-dealwork-escrow.mjs');value=readDealworkAccess({file:resolveProtectedCredential('Obolus/DealworkCredentials/primary.dpapi')});}
 else if(['google-access','google-client','google-save'].includes(operation)){process.env.LOCALAPPDATA=path.dirname(path.dirname(resolveProtectedCredential('Numaron/google-access.dpapi')));const{googleLocalCredentialOperation}=await import('./founder-google-access.mjs');value=googleLocalCredentialOperation(operation,options.value);}
 else throw Error('Unsupported operation');
 parentPort.postMessage({ok:true,value});
}catch{parentPort.postMessage({ok:false});}
