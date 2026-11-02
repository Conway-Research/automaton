import fs from 'node:fs';
import path from 'node:path';
// Local diagnostics only. Never log command arguments, exception text or secrets.
export function recordSupervisorEvent(directory,event,detail={}){
 if(typeof event!=='string'||!/^[a-z-]{1,64}$/.test(event))throw Error('Invalid supervisor event');
 const row={at:new Date().toISOString(),event};
 for(const key of ['supervisorPid','childPid','restarts','code'])if(detail[key]===null||Number.isSafeInteger(detail[key]))row[key]=detail[key];
 for(const key of ['signal','reason'])if(detail[key]===null||typeof detail[key]==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(detail[key]))row[key]=detail[key];
 const file=path.join(directory,'supervisor-events.jsonl');
 if(fs.existsSync(file)&&fs.statSync(file).size>=1024*1024){fs.copyFileSync(file,file+'.previous');fs.truncateSync(file,0);}
 fs.appendFileSync(file,JSON.stringify(row)+'\n');
}
