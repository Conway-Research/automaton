import {readLocalCredential} from './founder-local-access.mjs';
import {startGoogleConsentServer} from './founder-google-consent-server.mjs';
const [client,previousAccess]=await Promise.all([readLocalCredential('google-client'),readLocalCredential('google-access')]);
if(previousAccess?.provider!=='google'||previousAccess.scope?.account!=='numaronia@gmail.com')throw Error('Existing business Google access required');
const setup=await startGoogleConsentServer({client,previousAccess,save:async value=>{
 // Do not overwrite a concurrent sign-in or workspace update.
 const current=await readLocalCredential('google-access');
 if(JSON.stringify(current)!==JSON.stringify(previousAccess))throw Error('Google access changed during consent');
 await readLocalCredential('google-save',{value});
}});
console.log(setup.url);
