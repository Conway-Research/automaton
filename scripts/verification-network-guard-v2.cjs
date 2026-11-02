// Verification transport guard, not a production sandbox. Replaces the first guard for new runs: net.connect and
// http hand Socket.connect a normalized array, which the first guard read as "no host" and let through for raw IPs.
// Local test servers remain possible; external TCP, UDP and DNS, and local pipes or sockets, are rejected.
const net=require('node:net'),dns=require('node:dns'),dgram=require('node:dgram');
const denied=what=>Error('Verification external '+what+' denied');
const local=host=>['localhost','127.0.0.1','::1','[::1]'].includes(host||'localhost');
const connect=net.Socket.prototype.connect,lookup=dns.lookup;
net.Socket.prototype.connect=function(...args){
 const first=Array.isArray(args[0])?args[0][0]:args[0];
 const path=first&&typeof first==='object'?first.path:typeof first==='string'&&!/^\d+$/.test(first)?first:null;
 const host=first&&typeof first==='object'?first.host:typeof args[1]==='string'?args[1]:'localhost';
 if(path||!local(host))throw denied('transport');
 return connect.apply(this,args);
};
for(const method of ['send','connect']){
 const original=dgram.Socket.prototype[method];
 dgram.Socket.prototype[method]=function(...args){
  if(args.some(a=>typeof a==='string'&&!local(a))||!args.some(a=>typeof a==='string'))throw denied('datagram');
  return original.apply(this,args);
 };
}
dns.lookup=function(host,...args){if(!local(host))throw denied('DNS');return lookup.call(this,host,...args);};
const lookupAsync=dns.promises.lookup;
dns.promises.lookup=async(host,...args)=>{if(!local(host))throw denied('DNS');return lookupAsync(host,...args);};
const queries=['resolve','resolve4','resolve6','resolveAny','resolveCaa','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse'];
for(const holder of [dns,dns.promises,dns.Resolver.prototype,dns.promises.Resolver.prototype])for(const name of queries)holder[name]=()=>{throw denied('DNS');};
require('node:module').syncBuiltinESMExports();
