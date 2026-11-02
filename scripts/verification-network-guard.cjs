// Verification transport guard, not a production sandbox. Local test servers
// remain possible; external TCP and DNS are rejected in Node child processes.
const net=require('node:net'),dns=require('node:dns');
const connect=net.Socket.prototype.connect,lookup=dns.lookup;
const local=host=>['localhost','127.0.0.1','::1'].includes(host||'localhost');
net.Socket.prototype.connect=function(...args){
 const first=args[0];
 const host=typeof first==='object'?first.host:typeof args[1]==='string'?args[1]:'localhost';
 if(first&&typeof first==='object'&&first.path||!local(host))throw Error('Verification external transport denied');
 return connect.apply(this,args);
};
dns.lookup=function(host,...args){if(!local(host))throw Error('Verification external DNS denied');return lookup.call(this,host,...args);};
for(const name of ['resolve','resolve4','resolve6','resolveAny','reverse'])dns[name]=()=>{throw Error('Verification DNS denied');};
require('node:module').syncBuiltinESMExports();
