import {capabilityStatus,taskWaitText} from './model.mjs';
import {stations,HUB,workshopView,observedFlows,previewFlows,reportFlows,taskName} from './middle-earth-model.mjs';
import {WORLD,HUB_SITE,sitePlaces,crews,wanderers,workstationNames,roadLoop,hubGate,spokes,mountDoom,rohan,buildWorld,groundAt,EXTENT,SUN} from './middle-earth-world.mjs';
import {THREE as T,Kit,solid,glowing,HALL,crewPoint,makeFigure,buildDistrict,buildHub,buildForest,eyeSprites,smokeTexture} from './middle-earth-3d.mjs';
import {loadSurfaces,loadSky,addTerrainDetail,surfaceMaterial,placeModels,regionProps,worldProps,loadRigs,dressFigure} from './middle-earth-assets.mjs';
import {landmarks,roofs,closeDetails,buildBalrog,buildBlackGate} from './middle-earth-regions.mjs';
import {roomInteriors,roomLight,buildWalls} from './middle-earth-rooms.mjs';
// Display only. The on/off switch stays in renderPower (app.js); this module never talks to the server.
const statusLabels={queued:'wartet',planned:'geplant',running:'in Arbeit',verifying:'wird geprüft',working:'in Arbeit',blocked:'blockiert',failed:'fehlgeschlagen',review:'wartet auf dich',done:'erledigt',cancelled:'abgebrochen'};
const stateColors={working:'#e4b24a',trouble:'#ff7a3c',waiting:'#8cc4dc',idle:'#cfc6ab'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const shorten=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
const dist2=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const roadStop=id=>roadLoop[stations.findIndex(s=>s.id===id)];
const hallCentre=id=>({x:sitePlaces[id].x,y:sitePlaces[id].y+HALL.offset});
const FAR=3300,NEAR=150;
const homeOf=id=>id==='rohan'?rohan:{x:sitePlaces[id].x,y:sitePlaces[id].y+210};

export function createMiddleEarth(host,{openTask}={}){
 let selected=null,hovered=null,view=null,health=null,power=null,previousTasks=null,preview=false,previewTimer=null,ready=false;
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const canvas=el('canvas',undefined,'me-canvas'),labels=el('canvas',undefined,'me-labels');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Mittelerde in 3D: zehn Arbeitsbezirke um das Auge von Numaron. Orte lassen sich auch über die Auswahlliste öffnen.');
 const ctx=labels.getContext('2d');
 const panel=el('div',undefined,'me-panel');panel.setAttribute('aria-live','polite');panel.hidden=true;
 const banner=el('p','Probelauf: nur Darstellung. Es läuft keine echte Arbeit und nichts wird gespeichert.','me-preview-note');banner.hidden=true;
 const loading=el('p','Mittelerde wird erschaffen …','me-loading');
 const tools=el('div',undefined,'me-tools');
 const jump=el('select',undefined,'me-jump');jump.setAttribute('aria-label','Zu einem Ort springen');
 jump.append(new Option('Ort wählen …',''),new Option('Das Auge · Barad-dûr',HUB),...stations.map(s=>new Option(`${s.district} · ${s.title}`,s.id)));
 jump.onchange=()=>{if(jump.value)select(jump.value);};
 const button=(label,title,fn,cls='me-tool')=>{const b=el('button',label,cls);b.type='button';b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;return b;};
 const previewButton=button('▶ Probelauf','Probelauf ansehen, nur Darstellung',()=>setPreview(!preview),'me-tool me-preview');previewButton.setAttribute('aria-pressed','false');
 tools.append(jump,button('+','Hineinzoomen',()=>zoomBy(.72)),button('−','Herauszoomen',()=>zoomBy(1.38)),button('⟲','Nach links drehen',()=>{goal.yaw-=.5;}),button('⟳','Nach rechts drehen',()=>{goal.yaw+=.5;}),button('⌂','Ganz Mittelerde zeigen',()=>select(null)),previewButton);
 const hint=el('p','Ziehen: bewegen · Rechte Maustaste: drehen · Mausrad: zoomen','me-hint');
 const miniWrap=el('div',undefined,'me-mini'),mini=el('canvas');mini.width=280;mini.height=175;mini.setAttribute('aria-hidden','true');miniWrap.append(mini);
 const stage=el('div',undefined,'me-stage');stage.append(canvas,labels,miniWrap,tools,hint,banner,loading,panel);
 host.replaceChildren(stage);

 let renderer;
 try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}
 catch{loading.textContent='3D-Darstellung ist in diesem Browser nicht verfügbar. Alle anderen Bereiche funktionieren weiter.';return {update(){},select(){},setPreview(){}};}
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
 const scene=new T.Scene();scene.background=new T.Color('#8fa6b4');scene.fog=new T.Fog('#bdb1a2',3200,12500);
 const camera=new T.PerspectiveCamera(36,1,10,26000);
 const sky=new T.HemisphereLight('#c3d2dc','#4a4436',.4);scene.add(sky);
 // Two lamps move to whichever room is being looked at, so a world of rooms costs only these two.
 const roomLamps=[new T.PointLight('#ffffff',0,420,1.25),new T.PointLight('#ffffff',0,420,1.25)];scene.add(...roomLamps);let litRoom=null,daylight=1;
 // A low evening sun: long shadows and warm light give the land its depth.
 const sun=new T.DirectionalLight('#ffe6c4',3.1);sun.castShadow=true;sun.shadow.mapSize.set(3072,3072);sun.shadow.bias=-.0006;sun.shadow.normalBias=1.2;scene.add(sun,sun.target);

 // Camera: a point on the ground, distance, turn. The tilt follows the distance, as in a strategy game.
 const home=()=>({x:WORLD.w/2,y:WORLD.h/2-20,d:2880,yaw:0,lift:-.14});
 const cam={...home()},goal={...home()};
 let W=1,H=1,dpr=1;
 function resize(){
  W=stage.clientWidth||1;H=stage.clientHeight||1;dpr=Math.min(2,devicePixelRatio||1);renderer.setPixelRatio(dpr);renderer.setSize(W,H,false);labels.width=W*dpr;labels.height=H*dpr;camera.aspect=W/H;camera.updateProjectionMatrix();
 }
 new ResizeObserver(resize).observe(stage);
 const limit=()=>{goal.d=Math.max(NEAR,Math.min(FAR,goal.d));goal.x=Math.max(-100,Math.min(WORLD.w+100,goal.x));goal.y=Math.max(-100,Math.min(WORLD.h+100,goal.y));};
 function zoomBy(f,at){const before=goal.d;goal.d=Math.max(NEAR,Math.min(FAR,before*f));if(at){const k=1-goal.d/before;goal.x+=(at.x-goal.x)*k;goal.y+=(at.y-goal.y)*k;}limit();}
 const ray=new T.Raycaster(),ndc=new T.Vector2(),groundPlane=new T.Plane(new T.Vector3(0,1,0),-40),hit=new T.Vector3();
 function toWorld(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(ndc,camera);return ray.ray.intersectPlane(groundPlane,hit)?{x:hit.x,y:hit.z}:null;}
 let drag=null,moved=false,pointer=null;
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,gx:goal.x,gy:goal.y,yaw:goal.yaw,lift:goal.lift,rotate:e.button===2||e.shiftKey};moved=false;canvas.setPointerCapture?.(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{
  if(drag){
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;
   if(moved){if(drag.rotate){goal.yaw=drag.yaw-dx*.006;goal.lift=Math.max(-.5,Math.min(.5,drag.lift+dy*.0026));}else{const s=cam.d/H*.68,c=Math.cos(cam.yaw),n=Math.sin(cam.yaw);goal.x=drag.gx-dx*c*s-dy*1.4*n*s;goal.y=drag.gy+dx*n*s-dy*1.4*c*s;limit();}}
  }else{const q=toWorld(e);if(q){pointer=q;hovered=pick(q);canvas.style.cursor=hovered?'pointer':'grab';}}
 });
 canvas.addEventListener('pointerup',e=>{if(!moved&&e.button===0){const q=toWorld(e);const found=q&&pick(q);if(found)select(found);}drag=null;});
 canvas.addEventListener('pointerleave',()=>{hovered=null;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?.87:1.15,toWorld(e));},{passive:false});
 host.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected)select(null);});
 const miniMove=e=>{const r=mini.getBoundingClientRect();goal.x=(e.clientX-r.left)/r.width*WORLD.w;goal.y=(e.clientY-r.top)/r.height*WORLD.h;limit();};
 mini.addEventListener('pointerdown',e=>{miniMove(e);mini.setPointerCapture?.(e.pointerId);});
 mini.addEventListener('pointermove',e=>{if(e.buttons)miniMove(e);});

 function pick(q){
  if(Math.hypot(q.x-HUB_SITE.x,q.y-HUB_SITE.y)<180)return HUB;
  for(const s of stations){const c=hallCentre(s.id);if(Math.abs(q.x-c.x)<HALL.half+14&&Math.abs(q.y-c.y)<HALL.half+14)return s.id;}
  return null;
 }
 function select(id){
  selected=id;jump.value=id??'';host.dataset.focused=id?'true':'false';panel.hidden=!id;
  if(id){
   const c=id===HUB?{x:HUB_SITE.x,y:HUB_SITE.y}:hallCentre(id),shift=W>=1000?205:0;
   goal.d=id===HUB?1500:Math.max(500,620*(H<700?1.2:1));goal.yaw=cam.yaw;
   const s=goal.d/H*.68,co=Math.cos(goal.yaw),si=Math.sin(goal.yaw);goal.x=c.x+shift*s*co;goal.y=c.y-shift*s*si;limit();renderPanel();
  }else Object.assign(goal,home());
 }

 // ---- Panel ----
 function chip(label,code){const c=el('span',label,'me-chip');if(code)c.dataset.state=code;return c;}
 function panelHead(kicker,title){const close=button('×','Zurück zu ganz Mittelerde',()=>select(null),'me-close');panel.replaceChildren(close,el('span',kicker,'me-kicker'),el('h3',title));}
 function renderEye(){
  panelHead('Der Zusammenlauf','Das Auge von Numaron');
  panel.append(el('p',!power?'Der Betriebszustand ist noch nicht bestätigt.':power.enabled?'Das Auge ist offen: Numaron ist eingeschaltet. In Barad-dûr laufen alle Straßen zusammen, jede Übergabe geht über diese Verteilstation.':'Das Auge ist geschlossen: Numaron ist ausgeschaltet. Es startet keine neue Arbeit, bis du selbst einschaltest.'));
  if(health)panel.append(el('p',health.label,'me-strong'),el('p',health.detail));
  if(view){
   const chips=el('div',undefined,'me-chips');chips.append(chip(`${view.totals.active} in Arbeit`,'working'),chip(`${view.totals.waiting} wartend`,'waiting'),chip(`${view.totals.trouble} mit Hindernis`,'trouble'));panel.append(chips);
   if(health)panel.append(el('p',`${health.capabilityGaps} Fähigkeiten sind gesperrt oder noch ungeprüft.`));
   if(view.unassigned.length||view.unassignedCapabilities.length)panel.append(el('p',`Ohne festen Ort: ${view.unassigned.length} Aufgaben, ${view.unassignedCapabilities.length} Fähigkeiten (${[...new Set([...view.unassigned,...view.unassignedCapabilities].map(x=>x.kind))].slice(0,6).join(', ')}).`));
  }else panel.append(el('p','Die Arbeitsdaten werden geladen.'));
 }
 function renderPanel(){
  if(!selected)return;
  if(selected===HUB||!view)return renderEye();
  const s=view.stations.find(x=>x.id===selected),crew=crews[s.id];
  panelHead(`Bezirk ${s.district} · Schritt ${s.step}`,s.title);
  panel.append(el('p',s.folk,'me-strong'),el('p',s.about));
  const chips=el('div',undefined,'me-chips');chips.append(chip(s.state.label,s.state.code),chip(`${s.counts.active} in Arbeit`),chip(`${s.counts.waiting} wartend`),chip(`${s.counts.trouble} mit Hindernis`),chip(`${s.counts.done} zuletzt erledigt`));panel.append(chips);
  panel.append(el('h4','Wer hier arbeitet'));const list=el('ul',undefined,'me-list');
  crew.forEach((m,i)=>{const t=s.working[i],li=el('li');li.append(el('strong',`${m.name} · ${workstationNames[m.tool]}`),el('span',t?`${m.action}: ${taskName(t)}`:preview?`${m.action} (Probelauf)`:'ruht, keine echte Aufgabe'));list.append(li);});panel.append(list);
  if(s.working.length>crew.length)panel.append(el('p',`und ${s.working.length-crew.length} weitere Aufgaben gleichzeitig.`,'me-muted'));
  panel.append(el('p','Die Arbeiter arbeiten nur, wenn hier eine echte Aufgabe läuft. Dann steht sie als Zettel über dem Kopf. Der Papierstapel am Eingang zeigt wartende Aufgaben, rote Wimpel zeigen Hindernisse, Träger auf der Straße zeigen echte Übergaben. Bekannte Figuren außerhalb der Arbeitsplätze zeigen keine Arbeit an.','me-muted'));
  panel.append(el('h4','Technische Bearbeiter an diesem Ort'));const skills=el('ul',undefined,'me-list');
  for(const kind of s.kinds){const c=s.capabilities.find(x=>x.kind===kind),li=el('li');li.append(el('strong',kind),el('span',c?capabilityStatus(c):'in diesem Stand nicht gemeldet'));if(c?.status==='blocked'&&c.reason)li.append(el('small',c.reason));skills.append(li);}
  panel.append(skills);
  const rank=t=>['running','verifying','working'].includes(t.status)?0:['blocked','failed','review'].includes(t.status)?1:['queued','planned'].includes(t.status)?2:3;
  const shown=[...s.tasks].filter(t=>t.status!=='cancelled').sort((a,b)=>rank(a)-rank(b)||(b.updated_ms??0)-(a.updated_ms??0)).slice(0,8);
  panel.append(el('h4','Aufgaben an diesem Ort'));
  if(!shown.length)panel.append(el('p','Zurzeit liegt hier keine Aufgabe.'));
  else{
   const ul=el('ul',undefined,'me-list');
   for(const t of shown){const li=el('li'),name=openTask?el('button',taskName(t),'me-task'):el('strong',taskName(t));if(openTask){name.type='button';name.onclick=()=>openTask(t);}li.append(name,el('span',`${statusLabels[t.status]??t.status} · ${t.kind}`));if(t.status==='queued')li.append(el('small',taskWaitText(t)));ul.append(li);}
   panel.append(ul);
   const rest=s.tasks.length-shown.length;if(rest>0)panel.append(el('p',`und ${rest} weitere in der Aufgabenliste.`,'me-muted'));
  }
  const more=el('a','Alle Details ansehen →','me-more');more.href=s.link;panel.append(more);
 }

 // ---- Actors. Workers move only for real tasks or the labelled preview; the known figures are scenery. ----
 const actors=[],couriers=[],districts=new Map();
 const addFigure=a=>{a.mesh=makeFigure(a.f.people,a.f.tool);a.mesh.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=false;}});scene.add(a.mesh);return a;};
 const wayToHub=id=>spokes[stations.findIndex(s=>s.id===id)]??[hubGate];
 const setPath=(a,points,speed)=>{a.path=points;a.seg=0;a.speed=speed;a.mode='walk';};
 function stepAlong(a,dt){
  let left=a.speed*dt;
  while(a.path&&left>0){
   const target=a.path[a.seg],d=dist2(a,target);
   if(d<=left){a.x=target.x;a.y=target.y;left-=d;a.seg++;if(a.seg>=a.path.length){a.path=null;return true;}}
   else{const k=left/d,dx=target.x-a.x,dy=target.y-a.y;a.x+=dx*k;a.y+=dy*k;a.heading=Math.atan2(dx,dy);left=0;}
  }
  a.phase+=dt*a.speed*.24;
  return false;
 }
 function updateActor(a,now,dt){
  if(a.kind==='worker'){
   if(a.mode==='walk'){if(stepAlong(a,dt)){if(a.returning){a.returning=false;a.carrying=false;a.mode=a.busy?'work':'rest';a.heading=a.station;a.until=now+9000+Math.random()*9000;}else{a.mode='fetch';a.until=now+1100+Math.random()*1500;}}}
   else if(!a.busy&&a.mode!=='fetch')a.mode='rest';
   else if(a.mode==='rest'){a.mode='work';a.until=now+4000+Math.random()*9000;}
   else if(now>a.until){
    if(a.mode==='fetch'){a.returning=true;a.carrying=true;setPath(a,[a.home],38);}
    else{const c=hallCentre(a.site);setPath(a,[{x:c.x+(Math.random()-.5)*150,y:c.y+(Math.random()-.5)*110}],38);}
   }
  }else{
   if(a.mode==='walk'){if(stepAlong(a,dt)){a.mode='rest';a.until=now+3500+Math.random()*8000;}}
   else if(now>a.until){
    if(a.f.home){const c=homeOf(a.f.home),q={x:c.x+(Math.random()-.5)*230,y:c.y+(Math.random()-.5)*70};setPath(a,[q],a.f.people==='hobbit'||a.f.people==='gollum'?20:26);}
    else{const n=roadLoop.length,next=(a.stop+1+Math.floor(Math.random()*2))%n,path=[];for(let i=a.stop;i!==next;i=(i+1)%n)path.push(roadLoop[(i+1)%n]);setPath(a,path,48);a.stop=next;}
   }
  }
 }
 function sendCourier(start,path,site,title,next=null){
  const member=crews[site]?.[0]??{people:'rohirrim'};
  couriers.push(addFigure({kind:'courier',f:{people:member.people,tool:'letter'},x:start.x,y:start.y,heading:0,phase:0,path:path.slice(1),seg:0,speed:96,mode:'walk',title,next}));
 }
 function dispatch(flow){
  if(couriers.length>=8||reduced())return;
  if(flow.from===HUB)return sendCourier(hubGate,[...wayToHub(flow.to)].reverse(),flow.to,flow.title);
  // A worker of the district carries it along its road to the gate of Barad-dûr, another one takes it on.
  sendCourier(roadStop(flow.from),wayToHub(flow.from),flow.from,flow.title,flow.to===HUB?null:{to:flow.to,title:flow.title});
 }
 const smokePoints=[],smokeParticles=[],particleSources={embers:[],spray:[],leaves:[]},particleSets=[];let smokeMesh=null,eye=null,miniBase=null,balrog=null;

 async function buildScene(){
  const surfaces=await loadSurfaces(),hdr=await loadSky();
  hdr.mapping=T.EquirectangularReflectionMapping;scene.background=hdr;scene.environment=hdr;scene.backgroundIntensity=1;scene.environmentIntensity=.62;
  const plan={scouts:['rock','rock','rock','rock'],isengard:['rock','marble','rock','rock'],library:['stone','marble','marble','stone'],lorien:['bark','wood','marble','grass'],council:['bark','bark','rock','rock'],forge:['rock','stone','rock','rock'],gate:['marble','marble','marble','marble'],messengers:['grass','wood','wood','grass'],treasury:['rock','stone','rock','rock'],observatory:['stone','stone','stone','marble']};
  const materialsFor=id=>{const [outer,floor,wall,roof]=plan[id];return {outside:surfaceMaterial(surfaces[outer]),inside:surfaceMaterial(surfaces[floor]),wall:surfaceMaterial(surfaces[wall]),roof:surfaceMaterial(surfaces[roof])};};
  const world=await buildWorld();
  const texture=new T.CanvasTexture(world.land);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  // One seamless ground: finest around the places, ever coarser towards the horizon.
  const fine=matchMedia('(pointer:coarse)').matches||(navigator.hardwareConcurrency??8)<=4?7.2:3.6,lines=(from,to)=>{const inner=[];for(let v=from;v<=to;v+=fine)inner.push(v);const before=[],after=[];let step=fine,a=from,b=inner[inner.length-1];while(from-a<780){step=Math.min(fine*5,step*1.035);a-=step;b+=step;before.unshift(a);after.push(b);}return [...before,...inner,...after];};
  const xs=lines(-60,WORLD.w+60),zs=lines(-60,WORLD.h+60),NX=xs.length,NZ=zs.length,vertices=new Float32Array(NX*NZ*3),uvs=new Float32Array(NX*NZ*2),order=new Uint32Array((NX-1)*(NZ-1)*6);
  for(let j=0;j<NZ;j++){for(let i=0;i<NX;i++){const o=j*NX+i;vertices[o*3]=xs[i];vertices[o*3+1]=groundAt(xs[i],zs[j]);vertices[o*3+2]=zs[j];uvs[o*2]=(xs[i]-EXTENT.x)/EXTENT.w;uvs[o*2+1]=1-(zs[j]-EXTENT.y)/EXTENT.h;}if(j%48===0)await new Promise(done=>setTimeout(done));}
  {let n=0;for(let j=0;j<NZ-1;j++)for(let i=0;i<NX-1;i++){const a=j*NX+i,b=a+1,c=a+NX,d=c+1;order[n++]=a;order[n++]=c;order[n++]=b;order[n++]=b;order[n++]=c;order[n++]=d;}}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));geometry.setIndex(new T.BufferAttribute(order,1));geometry.computeVertexNormals();
  const landMaterial=new T.MeshStandardMaterial({map:texture,roughness:.95});addTerrainDetail(landMaterial,surfaces,world.light,EXTENT,HUB_SITE);landTime=landMaterial.userData.time;const land=new T.Mesh(geometry,landMaterial);land.receiveShadow=true;land.frustumCulled=false;scene.add(land);
  // Beyond it a plain, coarse ground carries the far ranges to the horizon. It lies a little lower, so the fine ground always wins where they meet.
  {const x0=xs[0],x1=xs[NX-1],z0=zs[0],z1=zs[NZ-1],cell=90,cols=Math.round(20000/cell),rows=Math.round(19000/cell),far=new Float32Array((cols+1)*(rows+1)*3),farUv=new Float32Array((cols+1)*(rows+1)*2),index=[];
   for(let j=0;j<=rows;j++){for(let i=0;i<=cols;i++){const x=-9000+i*cell,z=-9000+j*cell,o=j*(cols+1)+i;far[o*3]=x;far[o*3+1]=groundAt(x,z)-(x>x0-cell&&x<x1+cell&&z>z0-cell&&z<z1+cell?14:0);far[o*3+2]=z;farUv[o*2]=(x-EXTENT.x)/EXTENT.w;farUv[o*2+1]=1-(z-EXTENT.y)/EXTENT.h;if(i<cols&&j<rows&&!(x>x0+cell&&x+cell<x1-cell&&z>z0+cell&&z+cell<z1-cell)){const a=o,b=a+1,c=a+cols+1,d=c+1;index.push(a,c,b,b,c,d);}}if(j%24===0)await new Promise(done=>setTimeout(done));}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(far,3));g.setAttribute('uv',new T.BufferAttribute(farUv,2));g.setIndex(index);g.computeVertexNormals();const horizon=new T.Mesh(g,landMaterial);horizon.frustumCulled=false;scene.add(horizon);}
  // Water with moving ripples, drawn from a generated surface map.
  const ripple=document.createElement('canvas');ripple.width=ripple.height=256;{const c=ripple.getContext('2d'),img=c.createImageData(256,256),H=(x,y)=>Math.sin(x*.098+Math.sin(y*.049)*2)*.5+Math.sin(y*.147+Math.sin(x*.074)*2)*.35+Math.sin((x+y)*.196)*.2;for(let y=0;y<256;y++)for(let x=0;x<256;x++){const nx=H(x+1,y)-H(x-1,y),ny=H(x,y+1)-H(x,y-1),o=(y*256+x)*4;img.data[o]=128+nx*90;img.data[o+1]=128+ny*90;img.data[o+2]=255;img.data[o+3]=255;}c.putImageData(img,0,0);}
  waterNormal=new T.CanvasTexture(ripple);waterNormal.wrapS=waterNormal.wrapT=T.RepeatWrapping;waterNormal.repeat.set(200,180);
  const sea=new T.Mesh(new T.PlaneGeometry(40000,36000),new T.MeshStandardMaterial({color:'#174a60',roughness:.16,metalness:.35,normalMap:waterNormal,normalScale:new T.Vector2(.4,.4),transparent:true,opacity:.9}));sea.rotation.x=-Math.PI/2;sea.position.set(WORLD.w/2,1,WORLD.h/2);sea.receiveShadow=true;scene.add(sea);
  scene.add(buildForest(world.trees,groundAt));
  for(const s of stations){
   const d=buildDistrict(s.id,crews[s.id],{interiors:roomInteriors,buildWalls,landmarks,roofs,closeDetails,materials:{[s.id]:materialsFor(s.id)}}),c=hallCentre(s.id),y=groundAt(c.x,c.y)+2;d.group.position.set(c.x,y,c.y);scene.add(d.group);districts.set(s.id,{...d,id:s.id,c,y,tray:new T.Group()});d.group.add(districts.get(s.id).tray);
   const at=q=>new T.Vector3(c.x+q[0],y+q[1],c.y+q[2]);for(const q of d.fx.smoke)smokePoints.push(at(q));for(const q of d.fx.embers)particleSources.embers.push(at(q));for(const q of d.fx.spray)particleSources.spray.push(at(q));for(const q of d.fx.leaves)particleSources.leaves.push(at(q));
   crews[s.id].forEach((m,index)=>{const p=crewPoint(m),home={x:c.x+p.x,y:c.y+p.z};actors.push(addFigure({kind:'worker',site:s.id,index,f:m,home,x:home.x,y:home.y,heading:Math.PI/2,station:Math.PI/2,phase:Math.random()*6,mode:'rest',until:0,path:null,busy:false,note:''}));});
  }
  // Grass, stones and fallen leaves around every place, each in the colours of its land.
  const litter={scouts:['#7c7a4a','#6d6a44','#8a8a60'],library:['#3e6a36','#4c7a3e','#35602f'],forge:['#34362a','#3f402e','#2c2d24'],treasury:['#46482f','#515336','#3b3d29'],council:['#23391f','#2d4a26','#4a3a1e'],lorien:['#b0962e','#c9a93a','#7f8a3a'],gate:['#6a7a48','#7c8850','#5c6c40'],observatory:['#7c8048','#8a8a54','#6a6e3e'],isengard:['#3a342a','#4a4232','#2c2822'],messengers:['#4f8a3a','#5f9a45','#437a32']};
  const bladeGeometry=new T.ConeGeometry(.42,8,3),pebbleGeometry=new T.IcosahedronGeometry(1,0),matrix=new T.Matrix4(),quat=new T.Quaternion(),scale=new T.Vector3(),pos=new T.Vector3(),color=new T.Color(),yAxis=new T.Vector3(0,1,0);
  for(const [id,tones] of Object.entries(litter)){
   const d=districts.get(id),blades=new T.InstancedMesh(bladeGeometry,new T.MeshStandardMaterial({color:'#ffffff',roughness:1,side:T.DoubleSide}),2600),pebbles=new T.InstancedMesh(pebbleGeometry,new T.MeshStandardMaterial({color:'#ffffff',roughness:.95,flatShading:true}),360);
   let seed=id.length*97;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
   for(let i=0;i<2600+360;i++){
    const a=rnd()*6.283,r=136+rnd()*rnd()*300,x=d.c.x+Math.cos(a)*r,z=d.c.y+Math.sin(a)*r,y=groundAt(x,z)-d.y,tall=i<2600;
    pos.set(x-d.c.x,y+(tall?3:0),z-d.c.y);quat.setFromAxisAngle(yAxis,a*7);const q=(tall?.6+rnd()*.9:.7+rnd()*rnd()*3.4)*(Math.hypot(x-HUB_SITE.x,(z-HUB_SITE.y)/.72)<680||groundAt(x,z)>135?0:1);scale.set(q,tall?q:q*.6,q);matrix.compose(pos,quat,scale);
    color.set(tones[i%tones.length]).multiplyScalar(.75+rnd()*.5);
    if(tall){blades.setMatrixAt(i,matrix);blades.setColorAt(i,color);}else{pebbles.setMatrixAt(i-2600,matrix);color.set('#6c675e').multiplyScalar(.7+rnd()*.5);pebbles.setColorAt(i-2600,color);}
   }
   pebbles.castShadow=true;blades.receiveShadow=true;pebbles.receiveShadow=true;d.closeMesh.add(blades,pebbles);
  }
  const hub=buildHub(surfaceMaterial(surfaces.rock,{roughness:.85})),hubY=groundAt(HUB_SITE.x,HUB_SITE.y)+1;hub.position.set(HUB_SITE.x,hubY,HUB_SITE.y);scene.add(hub);
  sauronBeam=new T.Mesh(new T.ConeGeometry(1,1,18,1,true).translate(0,-.5,0).rotateX(Math.PI),new T.MeshBasicMaterial({color:'#ffb24a',transparent:true,opacity:.1,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending,fog:false}));sauronBeam.visible=false;scene.add(sauronBeam);
  eye=eyeSprites();for(const part of [eye.open,eye.closed,eye.pupil]){part.position.set(HUB_SITE.x,hubY+440,HUB_SITE.y);part.renderOrder=part===eye.pupil?3:2;scene.add(part);}
  const lava=new T.PointLight('#ff6a2a',5.5,1100,1.15);lava.position.set(HUB_SITE.x,hubY+70,HUB_SITE.y+190);scene.add(lava);
  // Mount Doom: a real cone with a burning crater and a dark sky above Mordor.
  const doomFire=new Kit(),dy=Math.max(0,groundAt(mountDoom.x,mountDoom.y));doomFire.column(0,-6,0,34,8,'#ff7a1a');doomFire.column(0,1,0,20,1.4,'#ffd27a');const doomGroup=new T.Group();doomGroup.position.set(mountDoom.x,dy,mountDoom.y);const fireMesh=doomFire.mesh(glowing);fireMesh.castShadow=false;doomGroup.add(fireMesh);scene.add(doomGroup);
  const doomLight=new T.PointLight('#ff5a1a',4,1100,1.2);doomLight.position.set(mountDoom.x,dy+70,mountDoom.y);scene.add(doomLight);
  particleSources.embers.push(new T.Vector3(mountDoom.x,dy+6,mountDoom.y),new T.Vector3(HUB_SITE.x,hubY+40,HUB_SITE.y+60));smokePoints.push(new T.Vector3(mountDoom.x,dy+8,mountDoom.y),new T.Vector3(HUB_SITE.x,hubY+380,HUB_SITE.y));
  const puff=smokeTexture(),ash=[];for(let i=0;i<24;i++){const a=i/24*6.283,r=330+(i%5)*70,sprite=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#241c1a',transparent:true,opacity:.11,depthWrite:false,fog:false}));sprite.scale.set(520,250,1);sprite.position.set(HUB_SITE.x+Math.cos(a)*r,hubY+340+(i%3)*70,HUB_SITE.y+Math.sin(a)*r*.72);scene.add(sprite);ash.push({sprite,a,r});}ashClouds=ash;
  // The column of smoke over Mount Doom, lit red from below and carried away by the wind.
  const rim=groundAt(mountDoom.x+54,mountDoom.y),glowSprite=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#ff6a1a',transparent:true,opacity:.75,depthWrite:false,blending:T.AdditiveBlending,fog:false}));glowSprite.scale.set(240,170,1);glowSprite.position.set(mountDoom.x,rim+24,mountDoom.y);scene.add(glowSprite);
  plume=Array.from({length:30},(_,i)=>{const sprite=new T.Sprite(new T.SpriteMaterial({map:puff,transparent:true,depthWrite:false,fog:false}));scene.add(sprite);return {sprite,k:i/30,base:rim,seed:i*2.399};});
  // The Black Gate stands exactly on the road from the west, where it crosses the mountains of Mordor.
  {const way=spokes[9];let best=1,gap=1e9;const middle=i=>({x:(way[i].x+way[i+1].x)/2,y:(way[i].y+way[i+1].y)/2});for(let i=1;i<way.length-2;i++){const q=middle(i),miss=Math.abs(Math.hypot(q.x-HUB_SITE.x,(q.y-HUB_SITE.y)/.72)-530);if(miss<gap){gap=miss;best=i;}}const q=middle(best),morannon=buildBlackGate(surfaceMaterial(surfaces.rock,{roughness:.85}));morannon.position.set(q.x,Math.max(1,groundAt(q.x,q.y)),q.y);morannon.rotation.y=Math.atan2(way[best+1].x-way[best].x,way[best+1].y-way[best].y);scene.add(morannon);}
  // The Balrog lives in the chasm of Moria.
  {const skin=surfaceMaterial(surfaces.rock,{roughness:.72});skin.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float seam=1.-smoothstep(.012,.034,dot(texture2D(map,vMapUv*3.1).rgb,vec3(.3333)));totalEmissiveRadiance+=vec3(1.5,.38,.05)*seam;`);};balrog=buildBalrog(skin,puff);}const moria=districts.get('forge');balrog.root.position.set(58,.4,-62);balrog.root.scale.setScalar(.72);moria.group.add(balrog.root);
  const addParticles=(sources,count,color,size,texture,move)=>{if(!sources.length)return;const positions=new Float32Array(count*3),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));const points=new T.Points(geometry,new T.PointsMaterial({map:texture,color,size,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));points.frustumCulled=false;scene.add(points);particleSets.push({geometry,sources,move,items:Array.from({length:count},(_,i)=>({at:i%sources.length,k:Math.random(),s:Math.random()*6.28}))});};
  addParticles(particleSources.embers,160,'#ff8a3a',7,puff,(o,p,k,s)=>p.set(o.x+Math.cos(s)*40*k,o.y+k*220,o.z+Math.sin(s)*40*k));
  addParticles(particleSources.spray,60,'#dff1f7',10,puff,(o,p,k,s)=>p.set(o.x+Math.cos(s)*22*k,o.y+Math.sin(k*3.14)*22,o.z+Math.sin(s)*22*k));
  addParticles(particleSources.leaves,80,'#ffd968',7,puff,(o,p,k,s)=>p.set(o.x+Math.cos(s+k*5)*46,o.y-k*210,o.z+Math.sin(s+k*5)*46));
  wanderers.forEach((f,i)=>{const at=(i*3)%roadLoop.length,start=f.home?homeOf(f.home):roadLoop[at];actors.push(addFigure({kind:'wanderer',f,stop:at,x:start.x+(i%3)*24-24,y:start.y,heading:0,phase:i,mode:'rest',until:performance.now()+1500+i*1500,path:null}));});
  const count=Math.max(1,smokePoints.length*6),positions=new Float32Array(count*3);if(smokePoints.length)for(let i=0;i<count;i++)smokeParticles.push({at:i%smokePoints.length,k:Math.random()});
  const smokeGeometry=new T.BufferGeometry();smokeGeometry.setAttribute('position',new T.BufferAttribute(positions,3));
  smokeMesh=new T.Points(smokeGeometry,new T.PointsMaterial({map:smokeTexture(),color:'#4a4640',size:26,transparent:true,opacity:.5,depthWrite:false}));smokeMesh.frustumCulled=false;scene.add(smokeMesh);
  const m=mini.getContext('2d');m.drawImage(world.land,-EXTENT.x,-EXTENT.y,WORLD.w,WORLD.h,0,0,280,175);miniBase=m.getImageData(0,0,280,175);
  const rohanGroup=new T.Group();rohanGroup.position.set(rohan.x,Math.max(2,groundAt(rohan.x,rohan.y)),rohan.y);scene.add(rohanGroup);placeModels(rohanGroup,worldProps).catch(e=>console.error(e));
  loading.remove();ready=true;renderCrew();renderTrays();
  // The 3D world works without them; simple figures simply stay until these have arrived.
  loadRigs().then(all=>{rigMap=all;}).catch(e=>console.error(e));
 }
 const ease=(from,to,k)=>from+(to-from)*k;
 const tilt=d=>.58+Math.min(1,Math.max(0,(d-300)/1800))*.3;
 const projected=new T.Vector3(),beamFrom=new T.Vector3(),beamTo=new T.Vector3();
 const screenOf=(x,y,z)=>{projected.set(x,y,z).project(camera);return projected.z<1?{x:(projected.x+1)/2*W,y:(1-projected.y)/2*H}:null;};
 const pill=(text,x,y,bg,fg,font='600 12px "Palatino Linotype",Georgia,serif')=>{ctx.font=font;const w=ctx.measureText(text).width+12;ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(x-w/2,y-9,w,18,5);ctx.fill();ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y+.5);};
 let ashClouds=[],plume=[],sauronBeam=null,waterNormal=null,landTime=null;
 let rigMap=null,focusY=0,lastFrame=performance.now(),lastMini=0,lastReport=performance.now(),frames=0,frameMark=performance.now();
 function frame(now){
  requestAnimationFrame(frame);
  if(!ready)return;
  frames++;if(now-frameMark>1000){host.dataset.fps=String(Math.round(frames*1000/(now-frameMark)));frames=0;frameMark=now;}
  const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  const k=reduced()?1:1-Math.pow(.003,dt);cam.x=ease(cam.x,goal.x,k);cam.y=ease(cam.y,goal.y,k);cam.d=ease(cam.d,goal.d,k);cam.yaw=ease(cam.yaw,goal.yaw,k);cam.lift=ease(cam.lift,goal.lift,k);
  const pitch=Math.max(.3,tilt(cam.d)+cam.lift);focusY=ease(focusY,Math.max(0,Math.min(150,groundAt(cam.x,cam.y))),k);const groundY=focusY,flat=cam.d*Math.cos(pitch),eyeX=cam.x+Math.sin(cam.yaw)*flat,eyeZ=cam.y+Math.cos(cam.yaw)*flat;
  camera.position.set(eyeX,Math.max(groundY+cam.d*Math.sin(pitch),groundAt(eyeX,eyeZ)+50),eyeZ);
  camera.lookAt(cam.x,groundY,cam.y);camera.updateMatrixWorld();
  // The shadow area follows the view, so shadows stay sharp up close.
  const span=Math.min(2200,Math.max(420,cam.d*1.05));sun.position.set(cam.x+SUN.x*span*2,SUN.y*span*2,cam.y+SUN.z*span*2);sun.target.position.set(cam.x,0,cam.y);Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:10,far:span*4+800});sun.shadow.camera.updateProjectionMatrix();
  if(!reduced()){for(const a of actors)updateActor(a,now,dt);for(let i=couriers.length-1;i>=0;i--){if(stepAlong(couriers[i],dt)){const done=couriers.splice(i,1)[0];done.rich?.dispose();scene.remove(done.mesh);if(done.next)sendCourier(hubGate,[...wayToHub(done.next.to)].reverse(),done.next.to,done.next.title);}}}
  if(!preview&&now-lastReport>32000){lastReport=now;for(const flow of reportFlows(view))dispatch(flow);}
  const t=reduced()?0:now;
  let dressing=1;
  for(const a of [...actors,...couriers]){
   const inside=a.kind==='worker';a.mesh.position.set(a.x,(inside?districts.get(a.site).y:Math.max(2,groundAt(a.x,a.y)))+.3,a.y);a.mesh.rotation.y=a.heading;
   const walking=a.mode==='walk',working=a.mode==='work';
   a.mesh.userData.pose(walking?a.phase:0,walking?Math.sin(a.phase)*.6:working?-1.15+Math.sin(t*.009+(a.index??0)*2)*.95:0,(a.carrying||a.kind==='courier')&&walking);
   // Near the camera the simple figure gives way to a fully animated one.
   const near=rigMap&&Math.hypot(camera.position.x-a.x,camera.position.y-a.mesh.position.y,camera.position.z-a.y)<1250;
   if(near&&!a.rich&&dressing>0){dressing--;a.rich=dressFigure(rigMap,a.f.people,a.f.tool);a.mesh.add(a.rich.group);}
   if(a.rich){const show=Boolean(near);a.rich.group.visible=show;a.mesh.userData.body.visible=!show;if(show)a.rich.play(a.mode,a.speed??0,reduced()?0:dt,(a.carrying||a.kind==='courier')&&walking);}
  }
  // Roofs lift while zooming in; of the walls only those facing the camera go away.
  const closed=Math.max(0,Math.min(1,(cam.d-760)/380));
  for(const d of districts.values()){
   d.roof.visible=closed>.01;d.roof.material.opacity=closed;d.roof.material.depthWrite=closed>.98;
   for(const w of d.walls){const toCam=(camera.position.x-d.c.x)*w.normal.x+(camera.position.z-d.c.y)*w.normal.z,facing=toCam>0,alpha=facing?closed:1;w.mesh.visible=alpha>.01;w.mesh.material.opacity=alpha;w.mesh.material.depthWrite=alpha>.98;}
  }
  // Inside, the room's own fires and lamps take over from the daylight.
  {let nearest=null,best=520;for(const d of districts.values()){const q=Math.hypot(cam.x-d.c.x,cam.y-d.c.y);if(q<best){best=q;nearest=d;}}
   const inside=nearest?1-closed:0,plan=nearest?roomLight[nearest.id]:null,target=plan?1+(plan.day-1)*inside:1;daylight=ease(daylight,target,Math.min(1,dt*3));sun.intensity=3.1*daylight;sky.intensity=.4*daylight;scene.environmentIntensity=.62*(.4+.6*daylight);
   if(nearest!==litRoom&&plan){litRoom=nearest;plan.lamps.forEach(([x,y,z,color],i)=>{roomLamps[i].position.set(nearest.c.x+x,nearest.y+y,nearest.c.y+z);roomLamps[i].color.set(color);});}
   roomLamps.forEach((lamp,i)=>{const strength=plan&&litRoom===nearest?plan.lamps[i][4]:0,flicker=reduced()?1:1+Math.sin(now*.011+i*2)*.07+Math.sin(now*.027+i)*.05;lamp.intensity=strength*inside*flicker;});}
  // Close-up life appears as the camera comes near; far away only the great shapes remain.
  for(const d of districts.values()){const near=Math.hypot(camera.position.x-d.c.x,camera.position.z-d.c.y)<1500&&cam.d<1500;d.closeMesh.visible=near;const inPlace=near&&Math.hypot(cam.x-d.c.x,cam.y-d.c.y)<620;d.props.visible=inPlace;if(inPlace&&!d.propsAsked&&d.id&&regionProps[d.id]){d.propsAsked=true;placeModels(d.props,regionProps[d.id]).catch(e=>console.error(e));}}
  // Up close, a neighbour's tall landmark must not stand between the camera and what is being looked at.
  {const ax=cam.x,ay=cam.y,bx=camera.position.x-ax,by=camera.position.z-ay,len=bx*bx+by*by||1;
   for(const d of districts.values()){const u=Math.max(0,Math.min(1,((d.c.x-ax)*bx+(d.c.y-ay)*by)/len)),gap=Math.hypot(d.c.x-(ax+bx*u),d.c.y-(ay+by*u)),own=Math.hypot(d.c.x-ax,d.c.y-ay)<HALL.half*2;d.outside.visible=cam.d>1100||own||u<.02||gap>420;if(!own&&u>.02&&gap<300&&cam.d<1700)d.roof.visible=false;}}
  if(balrog){const moria=districts.get('forge');balrog.stage.visible=closed<.995&&Math.hypot(cam.x-moria.c.x,cam.y-moria.c.y)<950;if(balrog.stage.visible&&!reduced())balrog.animate(now);}
  if(landTime&&!reduced())landTime.value=now/1000;
  if(waterNormal&&!reduced()){waterNormal.offset.x=now*.000012;waterNormal.offset.y=now*.000008;}
  for(const p of plume){if(!reduced())p.k=(p.k+dt*.016)%1;const q=p.k,w=70+q*420;p.sprite.position.set(mountDoom.x+Math.sin(p.seed)*(14+q*60)+q*q*520,p.base+16+q*680,mountDoom.y+Math.cos(p.seed)*(14+q*60)-q*q*230);p.sprite.scale.set(w,w*.82,1);p.sprite.material.color.setRGB(.5*(1-q)+.11,.2*(1-q)+.09,.09*(1-q)+.085);p.sprite.material.opacity=Math.min(1,q*14)*(1-q)*.62;}
  for(const c of ashClouds){c.a+=dt*.012;c.sprite.position.x=HUB_SITE.x+Math.cos(c.a)*c.r;c.sprite.position.z=HUB_SITE.y+Math.sin(c.a)*c.r*.72;}
  if(!reduced())for(const set of particleSets){const p=set.geometry.attributes.position,v=new T.Vector3();set.items.forEach((it,i)=>{it.k=(it.k+dt*.14)%1;set.move(set.sources[it.at],v,it.k,it.s);p.setXYZ(i,v.x,v.y,v.z);});p.needsUpdate=true;}
  // The eye.
  const open=Boolean(power?.enabled||preview);eye.open.visible=open;eye.pupil.visible=open;eye.closed.visible=!open;sauronBeam.visible=open;
  // While Numaron runs, the eye's gaze falls on what it watches: a carrier, the chosen place, or a slow sweep of the land.
  if(open){const seen=selected&&selected!==HUB?hallCentre(selected):couriers[0]??{x:HUB_SITE.x+Math.cos(now*.00012)*760,y:HUB_SITE.y+Math.sin(now*.00012)*520};beamFrom.copy(eye.open.position);beamTo.set(seen.x,Math.max(2,groundAt(seen.x,seen.y)),seen.y);const reach=beamFrom.distanceTo(beamTo);sauronBeam.position.copy(beamFrom);sauronBeam.scale.set(reach*.05,reach,reach*.05);sauronBeam.lookAt(beamTo);sauronBeam.rotateX(Math.PI/2);}
  if(open){const pulse=1+Math.sin(t*.005)*.04;eye.open.scale.set(250*pulse,250*pulse,1);const look=selected&&selected!==HUB?sitePlaces[selected]:couriers[0]??pointer;const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0);let off=0;if(look){const dx=look.x-HUB_SITE.x,dy=look.y-HUB_SITE.y,d=Math.hypot(dx,dy)||1;off=(dx*right.x+dy*right.z)/d*Math.min(1,d/700)*56;}eye.pupil.position.set(HUB_SITE.x+right.x*off,eye.open.position.y,HUB_SITE.y+right.z*off);}
  if(smokeMesh&&!reduced()&&smokeParticles.length){const p=smokeMesh.geometry.attributes.position;smokeParticles.forEach((s,i)=>{s.k=(s.k+dt*.09)%1;const o=smokePoints[s.at];p.setXYZ(i,o.x+Math.sin(s.k*7+i)*16*s.k,o.y+s.k*170,o.z+Math.cos(s.k*5+i)*10*s.k);});p.needsUpdate=true;}
  renderer.render(scene,camera);
  // Text lies over the picture, so it stays crisp at every distance.
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  for(const s of stations){
   const v=view?.stations.find(x=>x.id===s.id),d=districts.get(s.id),q=screenOf(d.c.x,d.y+(closed>0?HALL.height+90:HALL.height+24),d.c.y-(closed>0?0:HALL.half)),state=preview?'working':v?.state.code??'idle',focus=hovered===s.id||selected===s.id;
   if(!q||q.x<-200||q.x>W+200||q.y<-60||q.y>H+60)continue;
   const label=`${s.district}${cam.d<1300?` · ${s.title}`:''}`;ctx.font='700 14px "Palatino Linotype",Georgia,serif';const w=ctx.measureText(label).width+34;
   ctx.fillStyle=focus?'#2a2210ee':'#0d0e12cc';ctx.strokeStyle=focus?'#e4b24a':'#6d5a2e';ctx.lineWidth=focus?2:1;ctx.beginPath();ctx.roundRect(q.x-w/2,q.y-13,w,26,7);ctx.fill();ctx.stroke();
   ctx.fillStyle=stateColors[state];ctx.beginPath();ctx.arc(q.x-w/2+13,q.y,5,0,7);ctx.fill();
   ctx.fillStyle='#fff3cf';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(label,q.x-w/2+24,q.y+.5);
   if(cam.d<1300||focus){const extra=preview?'Probelauf':v?`${v.state.label}${v.counts.waiting?` · ${v.counts.waiting} wartend`:''}${v.counts.trouble?` · ${v.counts.trouble} Hindernisse`:''}`:'';if(extra)pill(extra,q.x,q.y+23,'#0d0e12b0',stateColors[state],'600 11.5px "Palatino Linotype",Georgia,serif');}
  }
  {const q=screenOf(HUB_SITE.x,groundAt(HUB_SITE.x,HUB_SITE.y)+20,HUB_SITE.y+220);if(q)pill(`Das Auge · Barad-dûr · ${!power?'Zustand wird geprüft':power.enabled?'Auge offen · Numaron an':'Auge zu · Numaron aus'}`,q.x,q.y,hovered===HUB||selected===HUB?'#3a1a0cf2':'#160b08e0','#ffd9a0','700 14px "Palatino Linotype",Georgia,serif');}
  const nearNames=cam.d<1000;
  for(const a of actors){
   if(a.kind==='worker'){
    if(!(a.note||nearNames))continue;
    const y=a.mesh.position.y,q=screenOf(a.x,y+44,a.y);if(!q||q.x<-120||q.x>W+120||q.y<-30||q.y>H+30)continue;
    if(a.note&&closed<1)pill(shorten(a.note,cam.d<650?38:24),q.x,q.y-8,'#f2e6c8f2','#2b2115','700 11.5px "Palatino Linotype",Georgia,serif');
    if(nearNames){const n=screenOf(a.x,y-3,a.y+7);if(n)pill(a.f.name,n.x,n.y,'#0d0e12a8','#fff3cf','600 11px "Palatino Linotype",Georgia,serif');}
   }else if(cam.d<800){const n=screenOf(a.x,a.mesh.position.y+42,a.y);if(n&&n.x>-60&&n.x<W+60&&n.y>-20&&n.y<H+20)pill(a.f.name,n.x,n.y,'#3a2c0ee0','#ffe49a','700 11px "Palatino Linotype",Georgia,serif');}
  }
  for(const a of couriers){const n=screenOf(a.x,a.mesh.position.y+50,a.y);if(n)pill(shorten(a.title,28),n.x,n.y,'#f2e6c8f2','#2b2115','700 11px "Palatino Linotype",Georgia,serif');}
  if(now-lastMini>150&&miniBase){lastMini=now;const m=mini.getContext('2d');m.putImageData(miniBase,0,0);for(const s of stations){const p=sitePlaces[s.id],v=view?.stations.find(x=>x.id===s.id);m.fillStyle=stateColors[preview?'working':v?.state.code??'idle'];m.beginPath();m.arc(p.x/10,p.y/10,3.6,0,7);m.fill();}m.fillStyle=open?'#ff7a1a':'#7a4a22';m.beginPath();m.arc(HUB_SITE.x/10,HUB_SITE.y/10,4.6,0,7);m.fill();m.strokeStyle='#fff3cf';m.lineWidth=1.5;const hw=cam.d*.8*camera.aspect/1.6,hh=cam.d*.62;m.strokeRect((cam.x-hw)/10,(cam.y-hh)/10,hw/5,hh/5);}
 }
 function renderTrays(){
  if(!ready||!view)return;
  const paper=new T.MeshStandardMaterial({color:'#efe4c8'}),flag=new T.MeshStandardMaterial({color:'#d4380f'}),pole=new T.MeshStandardMaterial({color:'#3a2a14'}),sheet=new T.BoxGeometry(9,1,7),cloth=new T.BoxGeometry(8,5,.4),stick=new T.CylinderGeometry(.5,.5,16,6);
  for(const s of view.stations){
   const d=districts.get(s.id);d.tray.clear();
   for(let i=0;i<Math.min(s.counts.waiting,12);i++){const m=new T.Mesh(sheet,paper);m.position.set(-72+(i%4)*11,1+Math.floor(i/4)*1.3,84);m.castShadow=true;d.tray.add(m);}
   for(let i=0;i<Math.min(s.counts.trouble,8);i++){const x=30+(i%4)*11,z=86+Math.floor(i/4)*8;const a=new T.Mesh(stick,pole);a.position.set(x,8,z);const b=new T.Mesh(cloth,flag);b.position.set(x+4,13,z);d.tray.add(a,b);}
  }
 }
 function setPreview(on){
  preview=on;banner.hidden=!on;previewButton.textContent=on?'■ Probelauf':'▶ Probelauf';previewButton.setAttribute('aria-pressed',String(on));host.dataset.preview=String(on);clearInterval(previewTimer);
  renderCrew();renderPanel();
  if(on){let i=0;const flows=previewFlows(),next=()=>dispatch(flows[i++%flows.length]);next();previewTimer=setInterval(next,reduced()?4000:2600);}
 }
 function renderCrew(){
  if(!view)return;
  for(const s of view.stations)for(const a of actors){
   if(a.kind!=='worker'||a.site!==s.id)continue;
   const task=s.working[a.index];a.busy=Boolean(task)||preview;a.note=task?taskName(task):preview?`Probe: ${a.f.action}`:'';
  }
 }
 function update({snapshot,health:nextHealth,power:nextPower}){
  health=nextHealth??health;power=nextPower??power;
  host.dataset.power=power?(power.enabled?'on':'off'):'unknown';
  if(snapshot){
   view=workshopView(snapshot);renderCrew();renderTrays();
   const tasks=snapshot.autonomy?.tasks??null;
   if(ready&&!preview)for(const flow of observedFlows(previousTasks,tasks))dispatch(flow);
   previousTasks=tasks;
  }
  renderPanel();
 }
 resize();requestAnimationFrame(frame);
 // The world is built once, right after the first layout.
 setTimeout(()=>{buildScene().catch(e=>{loading.textContent='Mittelerde konnte nicht aufgebaut werden. Alle anderen Bereiche funktionieren weiter.';console.error(e);});},30);
 return {update,select,setPreview};
}
