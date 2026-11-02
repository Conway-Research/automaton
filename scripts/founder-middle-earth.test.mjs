import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startFounderDashboard} from './founder-dashboard.mjs';
import {stations,HUB,stationForKind,stationState,workshopView,observedFlows,previewFlows} from '../web/founder/middle-earth-model.mjs';
import {crews,sitePlaces,wanderers,workstationNames,WORLD,groundAt} from '../web/founder/middle-earth-world.mjs';

const web=name=>fs.readFileSync(new URL('../web/founder/'+name,import.meta.url),'utf8');

test('every place exists in the world with its own workers and a named workstation for each',()=>{
 const names=wanderers.map(w=>w.name);
 for(const s of stations){
  const place=sitePlaces[s.id];
  assert.ok(place&&place.x>0&&place.x<WORLD.w&&place.y>0&&place.y<WORLD.h,s.id);
  assert.ok(groundAt(place.x,place.y+60)>0,s.id+' steht an Land');
  for(const member of crews[s.id]){assert.ok(Math.abs(member.x)<115,member.name+' arbeitet in der Halle');assert.ok(Math.abs((member.y-60)*2.5)<115,member.name+' arbeitet in der Halle');}
  assert.ok(crews[s.id].length>=3,s.id);
  for(const member of crews[s.id]){assert.ok(workstationNames[member.tool],member.name);names.push(member.name);}
 }
 assert.equal(new Set(names).size,names.length);
 assert.deepEqual(wanderers.filter(w=>!w.home).map(w=>w.name),['Gandalf']);
 for(const w of wanderers)if(w.home&&w.home!=='rohan')assert.ok(sitePlaces[w.home],w.name);
 const peoples=new Set(Object.values(crews).flat().map(m=>m.people));
 for(const people of ['uruk','orc','hobbit','dwarf','noldor','galadhrim','silvan','numenorean','gondor','rohirrim','dale'])assert.ok(peoples.has(people),people);
});

test('every task kind recorded so far has a workplace and unknown kinds stay visible as unassigned',()=>{
 for(const kind of ['external-communication','source-reconcile-application','adaptive-history','work-planner','exa-research','research','firecrawl-research','private-analysis','github-orders','adaptive-learning','order-report','order-discovery','finance-report','private-draft','amplitude-metrics','calendar-deadlines','gmail-orders','dealwork-escrow','sofa-research','private-part','code-execution'])assert.ok(stationForKind(kind),kind);
 assert.equal(stations.length,10);
 assert.equal(stationForKind('source-reconcile-application').id,'isengard');
 assert.equal(stationForKind('private-analysis').id,'lorien');
 const titles=stations.map(s=>s.title);for(const place of ['Minen von Moria','Orthanc in Isengart','Minas Tirith','Helms Klamm','Schloss von Bruchtal','Beutelsend in Hobbingen','Lothlórien','Hallen des Thranduil','Erebor und Thal','Osgiliath'])assert.ok(titles.includes(place),place);
 assert.equal(stationForKind('order-report').id,'gate');
 assert.equal(stationForKind('order-build').id,'forge');
 assert.equal(stationForKind('new-kind'),null);
 const view=workshopView({autonomy:{tasks:[{id:'x',kind:'new-kind',status:'queued'}],capabilities:[{kind:'new-kind',status:'blocked'}]}});
 assert.equal(view.unassigned.length,1);assert.equal(view.unassignedCapabilities.length,1);assert.equal(view.totals.waiting,1);
});

test('workplace state follows the reported tasks and never invents activity',()=>{
 assert.equal(stationState({active:1,trouble:3,waiting:1}).code,'working');
 assert.equal(stationState({active:0,trouble:1,waiting:1}).code,'trouble');
 assert.equal(stationState({active:0,trouble:0,waiting:1}).code,'waiting');
 assert.equal(stationState({active:0,trouble:0,waiting:0}).code,'idle');
 const empty=workshopView({});
 assert.deepEqual(empty.stations.map(s=>s.state.code),stations.map(()=>'idle'));
 const view=workshopView({autonomy:{tasks:[{id:'a',kind:'research',status:'running'},{id:'b',kind:'research',status:'failed'},{id:'c',kind:'private-draft',status:'done'}]}});
 const library=view.stations.find(s=>s.id==='library'),forge=view.stations.find(s=>s.id==='forge');
 assert.deepEqual(library.counts,{active:1,waiting:0,trouble:1,done:0});assert.equal(library.state.code,'working');assert.equal(library.working.length,1);
 assert.equal(forge.state.code,'idle');assert.equal(forge.counts.done,1);
});

test('couriers come only from an observed status change between two snapshots',()=>{
 const queued={id:'a',kind:'research',status:'queued',title:'Quelle'};
 assert.deepEqual(observedFlows(null,[queued]),[]);
 assert.deepEqual(observedFlows([queued],[queued]),[]);
 assert.deepEqual(observedFlows([],[{...queued,status:'done'}]),[]);
 assert.deepEqual(observedFlows([queued],[{...queued,status:'running'}]).map(f=>[f.from,f.to]),[[HUB,'library']]);
 const follower={id:'b',kind:'private-draft',status:'queued',dependencies:['a']};
 assert.deepEqual(observedFlows([{...queued,status:'running'},follower],[{...queued,status:'done'},follower]).map(f=>[f.from,f.to,f.reason]),[['library','forge','handover']]);
 assert.deepEqual(observedFlows([{...queued,status:'running'}],[{...queued,status:'done'}]).map(f=>[f.from,f.to,f.reason]),[['library',HUB,'finished']]);
 assert.ok(previewFlows().every(f=>f.reason==='preview'&&f.title.startsWith('Probelauf')));
});

test('districts name the real work areas and report only real work',async()=>{
 const {reportFlows}=await import('../web/founder/middle-earth-model.mjs');
 const names=stations.map(s=>s.district);
 for(const area of ['Forschung','Trading','Bounty Hunting und Aufträge','Produktion','Finanzen','Kommunikation'])assert.ok(names.includes(area),area);
 assert.deepEqual(reportFlows(workshopView({autonomy:{tasks:[{id:'a',kind:'research',status:'queued'}]}})),[]);
 const running=reportFlows(workshopView({autonomy:{tasks:[{id:'a',kind:'research',status:'running',title:'Quelle'}]}}));
 assert.deepEqual(running.map(f=>[f.from,f.to]),[['library',HUB]]);
 const stale=workshopView({tradingEngine:{dataFresh:false}}),fresh=workshopView({tradingEngine:{dataFresh:true}});
 assert.equal(stale.stations.find(s=>s.id==='observatory').state.code,'idle');
 assert.equal(fresh.stations.find(s=>s.id==='observatory').state.code,'working');
 const material=observedFlows([{id:'a',kind:'research',status:'done'},{id:'b',kind:'private-draft',status:'queued',dependencies:['a']}],[{id:'a',kind:'research',status:'done'},{id:'b',kind:'private-draft',status:'running',dependencies:['a']}]);
 assert.deepEqual(material.map(f=>[f.from,f.to,f.reason]),[['library','forge','fetch']]);
});

test('the world is display only and leaves the power guard in its one existing place',()=>{
 for(const name of ['middle-earth.mjs','middle-earth-model.mjs','middle-earth-world.mjs','middle-earth-3d.mjs','middle-earth-regions.mjs','middle-earth-rooms.mjs'])assert.doesNotMatch(web(name),/\bfetch\(|XMLHttpRequest|sendBeacon|\/api\/|\bapi\(|innerHTML|\.click\(\)/,name);
 const app=web('app.js');
 assert.match(app,/if\(turnOn&&!event\?\.isTrusted\)return;/);
 assert.equal(app.match(/founder-start-confirmed/g).length,1);
 const html=web('index.html');
 for(const id of ['middleEarth','powerControls','nextAction','pendingCount','profitTotal','revenueTotal','reactorStatus','deckWindow'])assert.match(html,new RegExp(`id="${id}"`),id);
});

test('every placed model exists and its licence is recorded',async()=>{
 const source=web('middle-earth-assets.mjs'),licence=web('assets/middle-earth/LICENSES.md');
 for(const id of new Set([...source.matchAll(/\['(props\/[A-Za-z_0-9]+)',/g)].map(m=>m[1])))assert.ok(fs.existsSync(new URL(`../web/founder/assets/middle-earth/${id}.gltf`,import.meta.url)),id);
 assert.match(licence,/Quaternius/);
 for(const id of new Set([...source.matchAll(/\['([A-Za-z_0-9]+)',-?[\d.]+,/g)].map(m=>m[1]))){assert.ok(fs.existsSync(new URL(`../web/founder/assets/middle-earth/models/${id}/${id}.gltf`,import.meta.url)),id);assert.ok(licence.includes(id),id);}
});

test('every room has a plan and an interior, with workers inside its walls',()=>{
 const rooms=web('middle-earth-rooms.mjs');
 for(const s of stations){assert.match(rooms,new RegExp(`\\n ${s.id}:\\{`),s.id);assert.match(rooms,new RegExp(`\\n ${s.id}\\(k,g\\)\\{`),s.id);}
 for(const s of stations)for(const m of crews[s.id])assert.ok(Math.hypot(m.x,(m.y-60)*2.5)<122,m.name);
});

test('a failing 3D view cannot take the switch with it',()=>{
 const app=web('app.js');
 assert.doesNotMatch(app,/^import .*middle-earth/m);
 assert.match(app,/import\('\.\/middle-earth\.mjs'\)/);
 assert.ok(fs.existsSync(new URL('../web/founder/vendor/three.LICENSE.txt',import.meta.url)));
});

test('the new assets are served under the unchanged content security policy',async t=>{
 const ui=await startFounderDashboard({store:{snapshot:()=>({}),review:()=>({})},power:{isOn:()=>false,snapshot:()=>({enabled:false,status:'off',revision:1})}});
 t.after(()=>ui.close());
 const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});
 const Cookie=login.headers.get('set-cookie').split(';')[0];
 for(const [file,type] of [['middle-earth.css','text/css'],['middle-earth.mjs','text/javascript'],['middle-earth-model.mjs','text/javascript'],['middle-earth-world.mjs','text/javascript'],['middle-earth-3d.mjs','text/javascript'],['middle-earth-regions.mjs','text/javascript'],['middle-earth-assets.mjs','text/javascript'],['middle-earth-rooms.mjs','text/javascript'],['vendor/GLTFLoader.js','text/javascript'],['assets/middle-earth/textures/rock_color.jpg','image/jpeg'],['assets/middle-earth/models/boulder_01/boulder_01.gltf','model/gltf'],['vendor/three.module.min.js','text/javascript']]){
  const r=await fetch(ui.url+'/'+file,{headers:{Cookie}});
  assert.equal(r.status,200,file);assert.match(r.headers.get('content-type'),new RegExp(type));
  assert.match(r.headers.get('content-security-policy'),/style-src 'self'/);
  await r.text();
 }
});
