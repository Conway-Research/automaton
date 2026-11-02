// Startup observation only. Never turns Numaron on or weakens its OFF guard.
export function watchFounderStartup({child,healthMatches,canStop,onState,setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=45000}){
 let finished=false;
 const dispose=()=>{if(finished)return;finished=true;clearTimer(timer);child.removeListener('message',message);};
 const message=value=>{if(value!=='ready'||finished)return;let valid=false;try{valid=healthMatches(child.pid)===true;}catch{}if(!valid){onState('startup-evidence-mismatch',{reason:'matching-runtime-health-missing'});return;}dispose();onState('running');};
 const timer=setTimer(()=>{if(finished)return;let allowed=false;try{allowed=canStop()===true;}catch{}if(allowed)dispose();onState('startup-timeout',{reason:'ready-handshake-missing',interruptionBlocked:!allowed});if(allowed)child.kill();},timeoutMs);
 child.on('message',message);child.once('exit',dispose);return dispose;
}
