// Separate, detached host. It never imports or controls the Founder runtime.
import {spawn} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'artifacts/numaron-local-monitor');fs.mkdirSync(dir,{recursive:true});
const log=fs.openSync(path.join(dir,'service.log'),'a');let failures=0;
function launch(){const child=spawn(process.execPath,['scripts/numaron-monitor-daemon.mjs'],{cwd:root,windowsHide:true,stdio:['ignore',log,log]});let finished=false;const finish=code=>{if(finished)return;finished=true;if(code===0){fs.closeSync(log);return;}setTimeout(launch,Math.min(60000,2000*++failures));};child.once('error',()=>finish(1));child.once('exit',finish);}
launch();
