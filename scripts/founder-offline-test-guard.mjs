// Test-runner preload only. Production entry points never import this module.
const original=globalThis.fetch.bind(globalThis);let blocked=0;
globalThis.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)){
  blocked++;return Promise.reject(Error('Offline tests forbid external fetch requests'));
 }
 return original(input,options);
};
process.on('exit',()=>{if(blocked){process.stderr.write('Offline test guard: '+blocked+' external request attempt(s) blocked.\n');process.exitCode=1;}});
