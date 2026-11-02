// Read-only readiness view for taking the Founder version online. Reads no secrets, starts nothing, changes nothing.
// Exit 0 only when no blocker is left. It never switches anything: the start stays Patrice's own button.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const expiry=(text,name)=>{const m=new RegExp(`const ${name}=Date\\.parse\\('([^']+)'\\)`).exec(text);return m?Date.parse(m[1]):null;};
const readText=file=>{try{return fs.readFileSync(file,'utf8');}catch{return null;}};
const readJson=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
const newest=(dir,after)=>{const found=[];const walk=d=>{let entries;try{entries=fs.readdirSync(d,{withFileTypes:true});}catch{return;}for(const e of entries){const f=path.join(d,e.name);if(e.isDirectory()){if(!['node_modules','scripts','vendor','assets'].includes(e.name))walk(f);}else if(e.isFile()&&fs.statSync(f).mtimeMs>after)found.push(f);}};walk(dir);return found;};
export function goLiveChecks({root,now=Date.now()}){
 const runtime=path.join(root,'artifacts/founder-integration-20261012'),checks=[],add=(id,state,detail)=>checks.push({id,state,detail});
 const lines=(readText(path.join(runtime,'power-state.jsonl'))??'').trim().split(/\r?\n/).filter(Boolean);let power=null;try{power=JSON.parse(lines.at(-1));}catch{}
 add('power-off',power?.enabled===false?'ok':'blocker',power?`enabled=${power.enabled}, Revision ${power.revision}`:'Betriebszustand nicht lesbar');
 const worker=readText(path.join(root,'scripts/founder-worker.mjs'))??'',connectors=readText(path.join(root,'scripts/founder-connectors.mjs'))??'';
 for(const [id,text,name,what] of [['model-price',worker,'PRICE_EXPIRES','Modellpreis des Workers'],['read-source-policy',connectors,'EXPIRES','Bedingungen der Lesequellen']]){const until=expiry(text,name);add(id,until!==null&&until>now?'ok':'blocker',until===null?`${what}: Frist nicht gefunden`:`${what}: gültig bis ${new Date(until).toISOString().slice(0,10)}`);}
 const sofa=expiry(connectors,'SOFA_EXPIRES');add('sofa-policy',sofa!==null&&sofa>now?'ok':'open',sofa===null?'SOFA-Frist nicht gefunden':`SOFA gültig bis ${new Date(sofa).toISOString().slice(0,10)}; ohne sie arbeitet Numaron ohne diese Quelle`);
 const maintenance=path.join(runtime,'maintenance'),loaded=readJson(path.join(maintenance,'loaded.json')),pending=readJson(path.join(maintenance,'pending.json'));
 const loadedAt=Date.parse(loaded?.completedAt??''),changed=Number.isFinite(loadedAt)?[...newest(path.join(root,'web/founder'),loadedAt),...fs.readdirSync(path.join(root,'scripts')).filter(n=>/^founder-.*\.(mjs|ps1)$/.test(n)&&!n.includes('.test.')).map(n=>path.join(root,'scripts',n)).filter(f=>fs.statSync(f).mtimeMs>loadedAt)]:[];
 add('source-loaded',!Number.isFinite(loadedAt)?'blocker':changed.length?'blocker':'ok',!Number.isFinite(loadedAt)?'Kein Übernahmenachweis':changed.length?`${changed.length} Dateien neuer als der geladene Stand; Apply braucht Patrices Freigabe`:`Geladener Batch ${loaded.batchId} ist aktuell`);
 add('maintenance-batch',pending?'open':'ok',pending?`Vorgemerkter Batch ${pending.batchId}: nicht geladen`:'Kein offener Batch');
 return {at:new Date(now).toISOString(),ready:!checks.some(c=>c.state==='blocker'),checks};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=goLiveChecks({root:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')});
 console.log(JSON.stringify(report,null,1));process.exitCode=report.ready?0:1;
}
