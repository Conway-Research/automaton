import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parse} from 'yaml';

// No uploads, provider calls or matched-secret output. Findings are paths,
// offsets and detector names only. A scan cannot prove absence of secrets.
const root=process.cwd(),output=path.resolve(process.argv[2]??'artifacts/security-scan');
if(!output.startsWith(root+path.sep))throw Error('Report directory must be inside workspace');
const files=[],findings=[];
function walk(directory){
 for(const item of fs.readdirSync(directory,{withFileTypes:true})){
  if(item.isSymbolicLink()||['node_modules','dist','.git','artifacts'].includes(item.name))continue;
  const file=path.join(directory,item.name);
  if(item.isDirectory())walk(file);
  else if(!item.name.includes('.backup')&&/\.(ts|js|mjs|cjs|json|ya?ml|html|css|sh|ps1)$/.test(item.name))files.push(file);
 }
}
for(const dir of ['src','packages','scripts','web','.github'])if(fs.existsSync(dir))walk(dir);
for(const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vitest.config.ts','.oxlintrc.json'])if(fs.existsSync(file))files.push(file);
const detectors=[
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{30,}?-----END/g],
 ['provider-token',/\b(?:sk-(?:proj|svcacct)-[A-Za-z0-9_-]{40,}|sk_live_[A-Za-z0-9]{24,}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,})\b/g],
 ['aws-access-key',/\bAKIA[A-Z0-9]{16}\b/g],
];
const scan=(name,text)=>{for(const [detector,pattern] of detectors){pattern.lastIndex=0;for(const match of text.matchAll(pattern))findings.push({path:name,line:text.slice(0,match.index).split('\n').length,detector});}};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inventory=[...new Set(files)].sort().map(file=>{
 const bytes=fs.readFileSync(file);scan(file.replaceAll('\\','/'),bytes.toString());return {path:file.replaceAll('\\','/'),sha256:sha(bytes)};
});
const staged=execFileSync('git',['diff','--cached','--name-only','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of staged){
 if(/(?:^|\/)(?:\.env(?:\.|$)|wallet\.json|automaton\.json)|\.backup|\.(?:pem|key)$/.test(file))findings.push({path:file,detector:'sensitive-staged-path'});
 try{scan('index:'+file,execFileSync('git',['show',':'+file],{encoding:'utf8',maxBuffer:16*1024*1024}));}catch{findings.push({path:file,detector:'staged-content-unreadable'});}
}
const lockBytes=fs.readFileSync('pnpm-lock.yaml'),lock=parse(lockBytes.toString());
const components=Object.entries(lock.packages??{}).map(([key,value])=>{
 const split=key.lastIndexOf('@'),name=key.slice(0,split),version=key.slice(split+1);
 if(split<1||!version)throw Error('Unsupported lockfile package identity');
 const purl=`pkg:npm/${name.replace('@','%40')}@${version}`;
 const integrity=value.resolution?.integrity,hashes=[];
 if(integrity){const [algorithm,encoded]=integrity.split('-');if(['sha512','sha256'].includes(algorithm))hashes.push({alg:algorithm==='sha512'?'SHA-512':'SHA-256',content:Buffer.from(encoded,'base64').toString('hex')});}
 return {type:'library',name,version,'bom-ref':purl,purl,...(hashes.length?{hashes}:{})};
});
if(new Set(components.map(c=>c['bom-ref'])).size!==components.length)throw Error('Duplicate SBOM identity');
const sbom={bomFormat:'CycloneDX',specVersion:'1.6',version:1,metadata:{timestamp:new Date().toISOString(),properties:[{name:'obolus:lockfile:sha256',value:sha(lockBytes)}]},components};
const report={schemaVersion:1,generatedAt:new Date().toISOString(),sourceDigest:sha(JSON.stringify(inventory)),lockfileDigest:sha(lockBytes),files:inventory,
 stagedFiles:staged.length,secretScan:{passed:findings.length===0,findings,limitations:'High-confidence format scan; no guarantee for unknown, obfuscated or split secrets. No raw matches emitted.'},
 sbom:{path:path.join(output,'sbom.cdx.json'),components:components.length,scope:'Complete lockfile package inventory, including development and optional packages',validation:'Required identifiers and unique component references checked locally; not independent schema certification'}};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'sbom.cdx.json'),JSON.stringify(sbom,null,2));fs.writeFileSync(path.join(output,'scan.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({sourceDigest:report.sourceDigest,files:inventory.length,secretFindings:findings.length,sbomComponents:components.length,report:path.join(output,'scan.json')}));
if(findings.length)process.exitCode=1;
