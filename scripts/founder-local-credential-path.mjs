import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const allowed=new Set(['Numaron/google-access.dpapi','Numaron/google-client.dpapi','Obolus/DealworkCredentials/primary.dpapi']);
// The desktop app virtualizes native AppData; independent processes need the
// explicit package location. Reuse protected files, never copy plaintext keys.
export function resolveProtectedCredential(relative,{native=path.join(os.homedir(),'AppData/Local'),packaged=path.join(os.homedir(),'AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local')}={}){
 if(!allowed.has(relative))throw Error('Unsupported protected credential');
 for(const root of [packaged,native]){const file=path.join(root,relative);try{const s=fs.lstatSync(file);if(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=64000)return file;}catch{}}
 throw Error('Protected credential unavailable');
}
