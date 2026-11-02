import {execFileSync} from 'node:child_process';
export function inspectProcess(pid){
 if(!Number.isSafeInteger(pid)||pid<1)return {state:'unknown'};
 try{const text=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if($p){[pscustomobject]@{state='alive';birth=$p.CreationDate.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress}else{'{"state":"dead"}'}`],{encoding:'utf8',windowsHide:true,timeout:10000,stdio:['ignore','pipe','ignore']});return JSON.parse(text);}catch{return {state:'unknown'};}
}
