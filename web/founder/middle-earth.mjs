import {capabilityStatus,taskWaitText} from './model.mjs';
import {stations,HUB,workshopView,observedFlows,reportFlows,taskName,workTalks} from './middle-earth-model.mjs';
import {siteDoors,mere,mereY,riverFlow,riverBanks,sauronWay,morannon,WORLD,SITE,hallOf,haven,HUB_SITE,sitePlaces,crews,wanderers,bonds,hallVisits,workstationNames,roadLoop,ringPaths,lanes,crossings,hubGate,spokes,mountDoom,rohan,buildWorld,groundAt,onRoad,seaDepth,EXTENT,SUN} from './middle-earth-world.mjs';
import {flameClock,THREE as T,Kit,solid,glowing,HALL,crewPoint,makeFigure,peoples,buildDistrict,buildHub,buildForest,forestTime,worldDay,leafCrowns,viewClear,eyeSprites,smokeTexture} from './middle-earth-3d.mjs';
import {zurichClock,atZurichHour,sunOverZurich,phaseOf,phaseLabel,phaseHours,lightAt,weatherIn,WEATHER,ZONES,PHASES} from './middle-earth-time.mjs';
import {buildDome,buildWeather,buildGaze,buildRider,buildNightLamps} from './middle-earth-sky.mjs';
import {filmPass,loadSurfaces,loadSky,addTerrainDetail,surfaceMaterial,blendIntoLand,cutaway,setCut,keepWhole,placeModels,regionProps,worldProps,loadRigs,dressFigure} from './middle-earth-assets.mjs';
import {landmarks,roofs,closeDetails,buildBalrog,buildBlackGate,buildSauron,regionLeaves,groundFootprints} from './middle-earth-regions.mjs';
import {roomInteriors,roomLight,roomFloor,buildWalls,wallFoot} from './middle-earth-rooms.mjs';
import {reveal,setReveal,holeCut,walkGrid,wayIn,buildEnt,buildFellBeast,buildMere,flowTime,flowMaterial,towerInside,towerFolk,ringForge} from './middle-earth-lore.mjs';
import {seaMaterial,seaMist,buildHaven,animateHaven,doomRoad,DOOR_TURN,DOOR_R,buildSammathNaur,buildOrcPits,roomJewels,makeJewel,smaugInto} from './middle-earth-places.mjs';
// Display only. The on/off switch stays in renderPower (app.js); this module never talks to the server.
const statusLabels={queued:'wartet',planned:'geplant',running:'in Arbeit',verifying:'wird geprüft',working:'in Arbeit',blocked:'blockiert',failed:'fehlgeschlagen',review:'wartet auf dich',done:'erledigt',cancelled:'abgebrochen'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const dist2=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hallCentre=hallOf,RS=SITE.scale;
const NEAR=150;
const homeOf=id=>id==='rohan'?rohan:{x:sitePlaces[id].x,y:hallOf(id).y+212*RS};
// Places to look at, which stand for no work at all. The mountain and the tower open as the camera comes near, like the houses; only the pits lie so deep that a soft dissolve leads down.
const scenes={
 haven:{title:'Die Grauen Anfurten',kicker:'Schauplatz am westlichen Meer',about:'Der Hafen der Elben unterhalb von Bruchtal. Hier liegt das Schwanenschiff, mit dem die Letzten über das Meer in die Unsterblichen Lande fahren. Ein Weg führt von Bruchtal hierher.',d:760},
 doom:{title:'Der Schicksalsberg',kicker:'Schauplatz in Mordor',about:'Eine Straße aus schwarzem Stein führt in Kehren zur hohen Felsspalte von Sammath Naur. Tief drinnen glüht das Feuer. Zoome hinein, dann öffnet sich der Berg wie die anderen Hallen.',d:352,yaw:-.75,lift:-.42,go:'naur',enter:'Ins Innere des Berges'},
 ents:{title:'Baumbart und die Ents',kicker:'Hirten der Bäume',about:'Bei Isengart und im Düsterwald ziehen die Ents langsam durch den Wald, ihre Kronen wiegen sich bei jedem Schritt. Wählst du diesen Ort, führt dich der Blick zu Baumbart. Reine Szenerie.',d:380},
 mere:{title:'Der See vor Moria',kicker:'Vor dem Westtor',about:'Das schwarze Wasser vor den Toren. Nichts regt sich an der Oberfläche, bis die langen Arme des Wächters aus der Tiefe auftauchen. Reine Szenerie.',d:400,yaw:-1.25},
 tower:{title:'Der Turm von Barad-dûr',kicker:'Im Inneren des Dunklen Turms',about:'Zoomst du heran, öffnet sich der Turm Stockwerk um Stockwerk: Torhalle mit Essen und Kriegskarte, der schwarze Thron, die Kammer des Sehenden Steins und oben der Ring, der das Feuer zum Auge führt. Reine Szenerie.',d:760,go:'pits',enter:'Hinab in die Gruben'},
 pits:{title:'Die Gruben von Barad-dûr',kicker:'Schauplatz unter dem Dunklen Turm',about:'Tief unter dem Turm wachsen neue Orks in Säcken aus Schlamm heran, werden herausgerissen, bewaffnet und abgeführt. Reine Szenerie.',inner:'pits',enter:'Hinabsteigen'},
 naur:{title:'Sammath Naur',kicker:'Im Inneren des Schicksalsbergs',about:'Die Felszunge über dem Feuer und ihre Kante, von der Gollum stürzt. Hier spielt sich das Ende der Reise ab: Frodo, Sam und Gollum, immer wieder von vorn. Reine Szenerie.',d:235,yaw:.82,lift:.3},
 citadel:{title:'Der Hof der Fontäne',kicker:'Siebte Ebene von Minas Tirith',about:'Der Hof vor der Halle der Könige mit dem Weißen Baum und der schmale Bug über der Stadt. Manchmal rennt hier Denethor brennend aus der Halle. Reine Szenerie.',d:280,yaw:.3,lift:-.22},
 orthanc:{title:'Die Spitze von Orthanc',kicker:'Hoch über Isengart',about:'Die blanke Plattform zwischen den vier Hörnern des Turms, offen für Wind und Regen. Hier hielt Saruman Gandalf gefangen. Reine Szenerie.',d:560,yaw:.7,lift:.34},
};

export function createMiddleEarth(host,{openTask}={}){
 const workLine=new Map(),namedCache=new Map();let lineUsed=0,pinned=null,following=false,actsFor=null,nextMeeting=4000,nextVisit=6000,nextChat=2000,lastLife=0;
 let selected=null,hovered=null,view=null,health=null,power=null,previousTasks=null,preview=false,previewTimer=null,ready=false;
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const canvas=el('canvas',undefined,'me-canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Mittelerde in 3D: zehn Arbeitsbezirke um das Auge von Numaron. Alle Orte lassen sich auch über die Legende öffnen.');
 const workLayer=el('div',undefined,'me-work-layer'),workTags=[];let crewRows=[],lineRow=null,lastRows=0;
 const panel=el('div',undefined,'me-panel');panel.setAttribute('aria-live','polite');panel.hidden=true;
 const banner=el('p','Probelauf: nur Darstellung. Es läuft keine echte Arbeit und nichts wird gespeichert.','me-preview-note');banner.hidden=true;
 const loading=el('p','Mittelerde wird erschaffen …','me-loading');
 const tools=el('div',undefined,'me-tools');

 const button=(label,title,fn,cls='me-tool')=>{const b=el('button',label,cls);b.type='button';b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;return b;};
 const previewButton=button('▶ Probelauf','Probelauf ansehen, nur Darstellung',()=>setPreview(!preview),'me-tool me-preview');previewButton.setAttribute('aria-pressed','false');
 tools.append(button('+','Hineinzoomen',()=>zoomBy(.72)),button('−','Herauszoomen',()=>zoomBy(1.38)),button('⟲','Nach links drehen',()=>{goal.yaw-=.5;}),button('⟳','Nach rechts drehen',()=>{goal.yaw+=.5;}),button('⌂','Ganz Mittelerde zeigen',()=>select(null)),previewButton);
 const personCard=el('div',undefined,'me-person'),personKicker=el('small',''),personName=el('strong',''),personText=el('p',''),personSteps=el('ol'),personActs=el('div',undefined,'me-person-acts'),personBar=el('i',undefined,'me-bar'),personFill=el('u');personCard.hidden=true;personBar.append(personFill);for(const t of ['Material holen','Zur Werkbank tragen','Bearbeiten','Ablegen und weitergeben'])personSteps.append(el('li',t));personCard.append(button('×','Schließen',()=>{pinned=null;renderPerson();},'me-person-close'),personKicker,personName,personText,personSteps,personBar,personActs);
 const hint=el('p','Ziehen: bewegen · Rechte Maustaste: drehen · Mausrad: zoomen','me-hint');
 // The legend: every place at a glance, with its state. A click goes there, as does a click on the place itself.
 const legend=el('nav',undefined,'me-legend');legend.setAttribute('aria-label','Orte in Mittelerde');
 const legendToggle=el('button','Orte','me-legend-toggle');legendToggle.type='button';legendToggle.setAttribute('aria-expanded','false');legendToggle.onclick=()=>{const open=legend.dataset.open!=='true';legend.dataset.open=String(open);legendToggle.setAttribute('aria-expanded',String(open));};
 const legendRows=new Map(),legendList=el('div',undefined,'me-legend-list');let listHover=null;
 const legendRow=(id,title,sub)=>{const b=el('button',undefined,'me-row'),text=el('span',undefined,'me-row-text');b.type='button';b.dataset.place=id;text.append(el('strong',title),el('small',sub));const dot=el('i',undefined,'me-dot'),count=el('em',undefined,'me-count');b.append(dot,text,count);b.onclick=()=>{listHover=null;select(id);if(matchMedia('(max-width:760px)').matches){legend.dataset.open='false';legendToggle.setAttribute('aria-expanded','false');}};if(matchMedia('(hover:hover)').matches){b.onmouseenter=()=>{listHover=id;};b.onmouseleave=()=>{listHover=null;};}b.onfocus=()=>{if(b.matches(':focus-visible'))listHover=id;};b.onblur=()=>{listHover=null;};legendRows.set(id,{b,dot,count});legendList.append(b);};
 legendList.append(el('h3','Betriebe'));
 legendRow(HUB,'Das Auge','Barad-dûr · Zentrale');
 for(const s of stations)legendRow(s.id,s.title,s.district);
 legendList.append(el('h3','Schauplätze'));
 legendRow('haven',scenes.haven.title,'Hafen am Meer');legendRow('doom',scenes.doom.title,'Aufstieg und Tor');legendRow('naur',scenes.naur.title,'Im Berg');legendRow('orthanc',scenes.orthanc.title,'Gandalfs Plattform');legendRow('citadel',scenes.citadel.title,'Minas Tirith, Weißer Baum');legendRow('tower',scenes.tower.title,'Innenraum');legendRow('mere',scenes.mere.title,'Der Wächter im Wasser');legendRow('ents',scenes.ents.title,'Im Wald');legendRow('pits',scenes.pits.title,'Ork-Schöpfung');
 legend.append(legendList);
 const tip=el('div',undefined,'me-tip');tip.hidden=true;const tipKicker=el('span',undefined,'me-tip-kicker'),tipTitle=el('strong'),tipText=el('p'),tipState=el('small');tip.append(tipKicker,tipTitle,tipText,tipState);
 const veil=el('div',undefined,'me-veil');
 // The clock of the world: the real time in Zürich. Every other moment of the day can be looked at for a while.
 const clock=el('div',undefined,'me-clock'),clockButton=el('button',undefined,'me-clock-face'),clockTime=el('strong','--:--'),clockPhase=el('span',''),clockWeather=el('small',''),clockPanel=el('div',undefined,'me-clock-panel');clockButton.type='button';clockButton.setAttribute('aria-expanded','false');clockButton.setAttribute('aria-label','Tageszeit und Wetter in Mittelerde');clockButton.append(clockTime,clockPhase,clockWeather);clockPanel.hidden=true;
 const hourSlider=el('input');hourSlider.type='range';hourSlider.min='0';hourSlider.max='24';hourSlider.step='.25';hourSlider.setAttribute('aria-label','Tageszeit ansehen');const liveButton=el('button','Live · Zürich','me-clock-live');liveButton.type='button';const phaseChips=el('div',undefined,'me-clock-chips');
 for(const p of PHASES){const b=el('button',p.label,'me-clock-chip');b.type='button';b.dataset.phase=p.id;b.onclick=()=>{timePreview=phaseHours(new Date())[p.id];hourSlider.value=String(timePreview);};phaseChips.append(b);}
 hourSlider.oninput=()=>{timePreview=Number(hourSlider.value)%24;};liveButton.onclick=()=>{timePreview=null;};clockButton.onclick=()=>{clockPanel.hidden=!clockPanel.hidden;clockButton.setAttribute('aria-expanded',String(!clockPanel.hidden));};
 clockPanel.append(phaseChips,hourSlider,liveButton);clock.append(clockButton,clockPanel);
 const stage=el('div',undefined,'me-stage');stage.append(canvas,workLayer,tools,hint,banner,loading,legendToggle,legend,clock,tip,veil,personCard,panel);
 host.replaceChildren(stage);

 let renderer;
 try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}
 catch{loading.textContent='3D-Darstellung ist in diesem Browser nicht verfügbar. Alle anderen Bereiche funktionieren weiter.';return {update(){},select(){},setPreview(){}};}
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
 const film=filmPass(renderer);if(film)glowing.color.setScalar(1.8);
 const scene=new T.Scene();scene.background=new T.Color('#8fa6b4');scene.fog=new T.Fog('#7a7674',4000,15000);
 const camera=new T.PerspectiveCamera(36,1,10,60000);
 const sky=new T.HemisphereLight('#b4bcc4','#5a5952',.32);scene.add(sky);
 // Two lamps move to whichever room is being looked at, so a world of rooms costs only these two.
 const roomLamps=[0,1,2].map(()=>new T.PointLight('#ffffff',0,525,1.25));scene.add(...roomLamps);let litRoom=null,daylight=1;
 // Rivendell's homely house: three warm pools of lamplight over the valley that wake only at night.
 const homely=[[0,175,60],[0,-160,70],[0,0,190]].map(([a,b,up])=>{const c=hallCentre('library'),x=c.x+a*RS,z=c.y+b*RS,l=new T.PointLight('#ffb25a',0,760,1);l.position.set(x,groundAt(x,z)+up,z);scene.add(l);return l;});
 // At sunrise a golden light comes over the eastern rim of Rivendell and gilds roofs, towers and falls.
 const dawnGlow=(()=>{const c=hallCentre('library'),x=c.x+280*RS,z=c.y-80*RS,l=new T.PointLight('#ffbe5c',0,1300,1);l.position.set(x,groundAt(x,z)+260,z);scene.add(l);return l;})();
 // A low evening sun: long shadows and warm light give the land its depth.
 const sun=new T.DirectionalLight('#ffdcb0',2.7);sun.castShadow=true;sun.shadow.mapSize.setScalar(matchMedia('(pointer:coarse)').matches?2048:4096);sun.shadow.bias=-.0006;sun.shadow.normalBias=1.2;scene.add(sun,sun.target);

 // Camera: a point on the ground, distance, turn. The tilt follows the distance, as in a strategy game.
 // The whole land fits, whatever the window's shape: narrow windows simply stand further back.
 const home=()=>({x:WORLD.x+WORLD.w/2,y:WORLD.y+WORLD.h/2-20,d:Math.max(3700,Math.min(7000,WORLD.w*1.02/(.65*(stage.clientWidth||16)/(stage.clientHeight||9)))),yaw:0,lift:-.14});
 const farD=()=>home().d*1.16;
 const cam={...home()},goal={...home()};
 let W=1,H=1,dpr=1,renderScale=null,slowWindows=0,frameTotal=0,frameCount=0;
 function resize(){
  W=stage.clientWidth||1;H=stage.clientHeight||1;dpr=Math.min(2,devicePixelRatio||1);renderScale??=matchMedia('(pointer:coarse)').matches?dpr:Math.max(1.35,dpr);renderer.setPixelRatio(renderScale);renderer.setSize(W,H,false);film?.setSize(W*renderScale,H*renderScale);camera.aspect=W/H;camera.updateProjectionMatrix();
 }
 new ResizeObserver(resize).observe(stage);
 {const bar=document.getElementById('hud');if(bar)new ResizeObserver(()=>host.style.setProperty('--hud',`${bar.offsetHeight}px`)).observe(bar);}
 const limit=()=>{if(inner)return;goal.d=Math.max(NEAR,Math.min(farD(),goal.d));goal.x=Math.max(WORLD.x-160,Math.min(WORLD.x+WORLD.w+160,goal.x));goal.y=Math.max(WORLD.y+180,Math.min(WORLD.y+WORLD.h+160,goal.y));};
 function zoomBy(f,at){
  if(inner){const u=inner.userData;if(f>1&&goal.d>=u.dMax*.99){leaveInner();return;}goal.d=Math.max(u.dMin,Math.min(u.dMax,goal.d*f));return;}
  const before=goal.d;goal.d=Math.max(NEAR,Math.min(farD(),before*f));if(at){const k=1-goal.d/before;goal.x+=(at.x-goal.x)*k;goal.y+=(at.y-goal.y)*k;}limit();
  // Zooming right up to a door leads through it.
  if(f<1&&before<=NEAR*1.25&&cam.d<NEAR*1.8&&Math.hypot(cam.x-hubGate.x,cam.y-hubGate.y)<200)enterInner('pits');
 }
 const ray=new T.Raycaster(),ndc=new T.Vector2(),groundPlane=new T.Plane(new T.Vector3(0,1,0),-40),hit=new T.Vector3();
 function toWorld(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(ndc,camera);return ray.ray.intersectPlane(groundPlane,hit)?{x:hit.x,y:hit.z}:null;}
 let drag=null,moved=false,pointer=null;
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,gx:goal.x,gy:goal.y,yaw:goal.yaw,lift:goal.lift,rotate:inner||e.button===2||e.shiftKey};moved=false;canvas.setPointerCapture?.(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{
  if(drag){
   const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;
   if(moved){if(drag.rotate){goal.yaw=drag.yaw-dx*.006;goal.lift=Math.max(-.5,Math.min(.5,drag.lift+dy*.0026));}else{const s=cam.d/H*.68,c=Math.cos(cam.yaw),n=Math.sin(cam.yaw);goal.x=drag.gx-dx*c*s-dy*1.4*n*s;goal.y=drag.gy+dx*n*s-dy*1.4*c*s;limit();}}
  }else if(!inner){const q=toWorld(e);if(q)pointer=q;mouse={x:e.clientX-canvas.getBoundingClientRect().left,y:e.clientY-canvas.getBoundingClientRect().top};hoverFigure=figureAt(mouse.x,mouse.y);hovered=pickAt(mouse.x,mouse.y);canvas.style.cursor=hovered?'pointer':'grab';}
 });
 canvas.addEventListener('pointerup',e=>{if(!moved&&e.button===0&&!inner){const r=canvas.getBoundingClientRect(),who=figureAt(e.clientX-r.left,e.clientY-r.top);pinned=who;renderPerson();if(!who){const found=pickAt(e.clientX-r.left,e.clientY-r.top);if(found)select(found);}}drag=null;});
 canvas.addEventListener('pointerleave',()=>{hovered=null;hoverFigure=null;mouse=null;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();const step=cam.d<900?.93:.87;zoomBy(e.deltaY<0?step:1/step,toWorld(e));},{passive:false});
 host.addEventListener('keydown',e=>{if(e.key==='Escape'){if(inner)leaveInner();else if(selected)select(null);}});

 // A place under the pointer, measured on the screen, so a tall tower can be hit wherever it is seen.
 function pickAt(px,py){
  let best=null,gap=1e9;const test=(id,x,y,z,r)=>{const m=screenOf(x,y,z);if(!m)return;const a=r/Math.hypot(camera.position.x-x,camera.position.y-y,camera.position.z-z)*H*1.54,d=Math.hypot(px-m.x,py-m.y)/a;if(d<1&&d<gap){gap=d;best=id;}};
  for(const d of districts.values())test(d.id,d.c.x,d.y+50,d.c.y,HALL.half*RS*1.2);
  if(ready){test(HUB,HUB_SITE.x,groundAt(HUB_SITE.x,HUB_SITE.y)+170,HUB_SITE.y,200);test('doom',mountDoom.x,190,mountDoom.y,200);test('haven',haven.x,20,haven.y+60,250);}
  return best;
 }
 function figureAt(px,py){if(cam.d>1000)return null;let best=null,gap=26;for(const a of [...actors,...couriers]){if(!a.mesh.visible)continue;const q=screenOf(a.x,a.mesh.position.y+16,a.y);if(!q)continue;const d=Math.hypot(px-q.x,py-q.y);if(d<gap){gap=d;best=a;}}return best;}
 function select(id){
  if(id==='pits'){enterInner(id);return;}
  if(inner)leaveInner(true);
  selected=id;mouse=null;host.dataset.focused=id?'true':'false';panel.hidden=!id;for(const [key,row] of legendRows)key===id?row.b.setAttribute('aria-current','true'):row.b.removeAttribute('aria-current');
  if(id){
   const scene=scenes[id],c=id===HUB?{x:HUB_SITE.x,y:HUB_SITE.y}:id==='haven'?{x:haven.x,y:haven.y+60}:id==='doom'?{x:mountDoom.x+Math.sin(DOOR_TURN)*DOOR_R,y:mountDoom.y+Math.cos(DOOR_TURN)*DOOR_R}:id==='naur'?{x:mountDoom.x+Math.sin(DOOR_TURN)*(DOOR_R-48),y:mountDoom.y+Math.cos(DOOR_TURN)*(DOOR_R-48)}:id==='orthanc'?hallCentre('isengard'):id==='citadel'?{x:hallCentre('gate').x,y:hallCentre('gate').y+30*RS}:id==='tower'?{x:HUB_SITE.x,y:HUB_SITE.y-20}:id==='mere'?{x:mere.x,y:mere.y}:id==='ents'?{x:ents[0]?.x??HUB_SITE.x,y:ents[0]?.y??HUB_SITE.y}:hallCentre(id),shift=W>=1000?-80:0;
   goal.d=id===HUB?1500:scene?.d??(id==='treasury'?660:475);goal.yaw=scene?.yaw??(id==='council'?.1:cam.yaw);goal.lift=id===HUB?-.24:scene?.lift??Math.max(-.14,goal.lift);
   const s=goal.d/H*.68,co=Math.cos(goal.yaw),si=Math.sin(goal.yaw);goal.x=c.x+shift*s*co;goal.y=c.y-shift*s*si;limit();renderPanel();
  }else Object.assign(goal,home());
 }
 // ---- Rooms below the land. The veil closes, the camera is there, the veil opens. ----
 const innerRooms=new Map();let inner=null,outerCam=null,innerTimer=null,doomDoor=null,puffTexture=null,rockSurface=null;
 const swapVeil=fn=>{veil.dataset.on='true';clearTimeout(innerTimer);innerTimer=setTimeout(()=>{fn();requestAnimationFrame(()=>requestAnimationFrame(()=>{veil.dataset.on='false';}));},reduced()?0:560);};
 function roomFor(id){if(innerRooms.has(id))return innerRooms.get(id);const room=buildOrcPits(rockSurface,puffTexture),u=room.userData,glow=new T.HemisphereLight(u.ambient,'#2a140a',5);glow.layers.set(1);room.add(glow);const deep=-15000;room.position.set(0,deep,0);u.focus={x:u.focus.x,y:u.focus.y+deep,z:u.focus.z};scene.add(room);innerRooms.set(id,room);return room;}
 function enterInner(id){
  if(!ready||inner?.userData.id===id)return;
  swapVeil(()=>{const room=roomFor(id),u=room.userData;u.id=id;if(inner)inner.visible=false;room.visible=true;if(!inner)outerCam={cam:{...cam},goal:{...goal},selected,fog:[scene.fog.color.getHex(),scene.fog.near,scene.fog.far],background:scene.background,env:scene.environmentIntensity};inner=room;hovered=null;
   scene.background=new T.Color('#050302');scene.environmentIntensity=.1;scene.fog.color.set(u.fog[0]);scene.fog.near=u.fog[1];scene.fog.far=u.fog[2];camera.layers.set(1);
   Object.assign(cam,{d:u.d*1.1,yaw:u.yaw,lift:0});Object.assign(goal,{d:u.d,yaw:u.yaw,lift:0});
   selected=id;host.dataset.focused='true';host.dataset.inner=id;panel.hidden=false;for(const [key,row] of legendRows)key===id?row.b.setAttribute('aria-current','true'):row.b.removeAttribute('aria-current');renderPanel();});
 }
 function leaveInner(quiet){
  if(!inner)return;const back=outerCam;const leave=()=>{inner.visible=false;inner=null;camera.fov=36;camera.layers.set(0);Object.assign(cam,back.cam);scene.background=back.background;scene.environmentIntensity=back.env;scene.fog.color.set(back.fog[0]);scene.fog.near=back.fog[1];scene.fog.far=back.fog[2];delete host.dataset.inner;if(!quiet){Object.assign(goal,back.goal);selected=null;host.dataset.focused='false';panel.hidden=true;for(const row of legendRows.values())row.b.removeAttribute('aria-current');}};
  if(quiet)leave();else swapVeil(leave);
 }

 // ---- Panel ----
 function chip(label,code){const c=el('span',label,'me-chip');if(code)c.dataset.state=code;return c;}
 function panelHead(kicker,title){const close=button('×','Schließen',()=>{if(inner)leaveInner();else select(null);},'me-close');panel.replaceChildren(close,el('span',kicker,'me-kicker'),el('h3',title));}
 function renderScene(id){const q=scenes[id];panelHead(q.kicker,q.title);panel.append(el('p',q.about));if(inner){panel.append(button('← Zurück nach Mittelerde','Zurück nach Mittelerde',()=>leaveInner(),'me-go'));}else if(q.inner)panel.append(button(`${q.enter} →`,q.enter,()=>enterInner(q.inner),'me-go'));else if(q.go)panel.append(button(`${q.enter} →`,q.enter,()=>select(q.go),'me-go'));}
 function renderEye(){
  panelHead('Der Zusammenlauf','Das Auge von Numaron');
  panel.append(el('p',!power?'Der Betriebszustand ist noch nicht bestätigt.':power.enabled?'Das Auge ist offen: Numaron ist eingeschaltet. In Barad-dûr laufen alle Straßen zusammen, jede Übergabe geht über diese Verteilstation.':'Das Auge ist geschlossen: Numaron ist ausgeschaltet. Es startet keine neue Arbeit, bis du selbst einschaltest.'));
  if(health)panel.append(el('p',health.label,'me-strong'),el('p',health.detail));
  if(view){
   const chips=el('div',undefined,'me-chips');chips.append(chip(`${view.totals.active} in Arbeit`,'working'),chip(`${view.totals.waiting} wartend`,'waiting'),chip(`${view.totals.trouble} mit Hindernis`,'trouble'));panel.append(chips);
   if(health)panel.append(el('p',`${health.capabilityGaps} Fähigkeiten sind gesperrt oder noch ungeprüft.`));
   if(view.unassigned.length||view.unassignedCapabilities.length)panel.append(el('p',`Ohne festen Ort: ${view.unassigned.length} Aufgaben, ${view.unassignedCapabilities.length} Fähigkeiten (${[...new Set([...view.unassigned,...view.unassignedCapabilities].map(x=>x.kind))].slice(0,6).join(', ')}).`));
  }else panel.append(el('p','Die Arbeitsdaten werden geladen.'));
  panel.append(button('Die Gruben unter dem Turm ansehen →','Die Gruben von Barad-dûr betreten',()=>enterInner('pits'),'me-go'));
 }
 function renderPanel(){
  if(!selected)return;
  if(scenes[selected])return renderScene(selected);
  if(selected===HUB||!view)return renderEye();
  const s=view.stations.find(x=>x.id===selected),crew=crews[s.id];
  panelHead(`Bezirk ${s.district} · Schritt ${s.step}`,s.title);
  panel.append(el('p',s.folk,'me-strong'),el('p',s.about));
  const chips=el('div',undefined,'me-chips');chips.append(chip(s.state.label,s.state.code),chip(`${s.counts.active} in Arbeit`),chip(`${s.counts.waiting} wartend`),chip(`${s.counts.trouble} mit Hindernis`),chip(`${s.counts.done} zuletzt erledigt`));panel.append(chips);
  panel.append(el('h4','Wer hier arbeitet'));const list=el('ul',undefined,'me-list');
  crewRows=[];lineRow=null;if(preview){lineRow=el('p','','me-line');panel.append(lineRow);}
  crew.forEach((m,i)=>{const t=s.working[i],li=el('li'),a=actors.find(x=>x.kind==='worker'&&x.site===s.id&&x.index===i),who=el('button',`${m.name} · ${workstationNames[m.tool]}`,'me-task'),state=el('span',''),bar=el('i',undefined,'me-bar'),fill=el('u');who.type='button';who.title='Diese Figur verfolgen';who.onclick=()=>{pinned=a;renderPerson();};bar.append(fill);li.append(who,state,bar);list.append(li);crewRows.push({a,m,state,bar,fill,t});});panel.append(list);renderRows();
  if(s.working.length>crew.length)panel.append(el('p',`und ${s.working.length-crew.length} weitere Aufgaben gleichzeitig.`,'me-muted'));
  const signs=el('details');signs.append(el('summary','Was die Zeichen bedeuten'),el('p','Papierstapel am Eingang zeigen wartende Aufgaben, rote Wimpel Hindernisse, Träger auf der Straße echte Übergaben. Arbeiter arbeiten nur, wenn hier eine echte Aufgabe läuft.','me-muted'));panel.append(signs);
  const tech=el('details');tech.append(el('summary','Technische Bearbeiter an diesem Ort'));const skills=el('ul',undefined,'me-list');
  for(const kind of s.kinds){const c=s.capabilities.find(x=>x.kind===kind),li=el('li');li.append(el('strong',kind),el('span',c?capabilityStatus(c):'in diesem Stand nicht gemeldet'));if(c?.status==='blocked'&&c.reason)li.append(el('small',c.reason));skills.append(li);}
  tech.append(skills);panel.append(tech);
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
 let talks=[];
 const spoken=(bond,who)=>{const t=talks.find(q=>q.station===who?.f.home&&performance.now()-(q.told??-1e9)>45000);if(t)t.told=performance.now();return {...bond,lines:t?t.lines:[]};};
 const addFigure=a=>{a.mesh=makeFigure(a.f.people,a.f.tool);a.mesh.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=false;}});scene.add(a.mesh);return a;};
 const wayToHub=id=>{const i=Object.keys(sitePlaces).indexOf(id);return i<0?[hubGate]:[...lanes[id],...spokes[i]];};
 // The riders turn in the lane well before the door; they never ride into a house.
 const riderWay=id=>{const i=Object.keys(sitePlaces).indexOf(id);if(i<0)return [hubGate];const hall=hallOf(id),door=(siteDoors[id]??126)+30,lane=lanes[id].filter(p=>(p.y-hall.y)/RS>=door);return [...(lane.length?lane:[lanes[id][lanes[id].length-1]]),...spokes[i]];};
 // No Nazgûl rides into Lothlórien or Rivendell: Galadriel's realm and Elrond's valley stay closed to the riders.
 const riderSites=Object.keys(sitePlaces).filter(id=>id!=='lorien'&&id!=='library');
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
 const turnTo=(from,to,k)=>{let d=(to-from+Math.PI)%(Math.PI*2);if(d<0)d+=Math.PI*2;return from+(d-Math.PI)*Math.min(1,k);};
 const bridgeSpans=[];
 // Standing height of anyone on the roads: the deck where a bridge carries the way, otherwise the land.
 const walkHeight=(x,y)=>{for(const {spots,box} of bridgeSpans){if(x<box[0]||y<box[1]||x>box[2]||y>box[3])continue;let best=null,gap=11*11;for(const q of spots){const d=(q.x-x)**2+(q.y-y)**2;if(d<gap){gap=d;best=q;}}if(best)return best.h;}
  // On the Havens the folk walk on the paved quay and out along the pier, not on the sea bed below it.
  if(havenGroup){const lx=x-haven.x,lz=y-haven.y,base=havenGroup.position.y;if(Math.abs(lx)<22&&lz>=30&&lz<205)return base+2.4;if(Math.abs(lx)<175&&lz>-22&&lz<36)return base+1.4;}
  return Math.max(1.9,groundAt(x,y));};
 let standing=[];
 const blocked=(x,y)=>groundAt(x,y)<4||standing.some(({c,boxes})=>{const u=x-c.x,v=y-c.y;return Math.hypot(u,v)<800&&boxes.some(q=>u>q[0]-5&&u<q[2]+5&&v>q[1]-5&&v<q[3]+5);});
 const clearWalk=(a,q)=>{const n=Math.ceil(Math.hypot(q.x-a.x,q.y-a.y)/10);for(let i=1;i<=n;i++)if(blocked(a.x+(q.x-a.x)*i/n,a.y+(q.y-a.y)*i/n))return false;return true;};
 const homePosts=[[-100,-14],[-36,14],[36,-14],[100,14]];
 const workerWay=a=>{const d=districts.get(a.site),home={x:(a.home.x-d.c.x)/RS,z:(a.home.y-d.c.y)/RS},line=wayIn(d.grid,home,{x:home.x*.55,z:home.z<12?46:-12});if(!line||line.length<2)return null;const world=line.map(q=>({x:d.c.x+q.x*RS,y:d.c.y+q.z*RS}));return {out:world,back:[...world].reverse().concat(a.home)};};
 function updateActor(a,now,dt){
  if(a.kind==='patrol'){if(a.alertUntil>now||a.bowUntil>now){a.heldMode??=a.mode;a.mode=a.bowUntil>now?'bow':'guard';if(a.alertAt)a.heading=Math.atan2(a.alertAt.x-a.x,a.alertAt.y-a.y);return;}if(a.heldMode){a.mode=a.heldMode;a.heldMode=null;}
   if(a.chores){if(a.path){if(stepAlong(a,dt)){const c=a.chores[a.step];a.mode=c[2];a.heading=c[3];a.until=now+c[4];a.carrying=false;}return;}if(now>=a.until){a.step=(a.step+1)%a.chores.length;const c=a.chores[a.step];a.carrying=Boolean(c[5]);setPath(a,[{x:haven.x+c[0],y:haven.y+c[1]}],a.pace);}return;}if(a.route.length>1&&stepAlong(a,dt)||!a.path&&a.route.length>1)setPath(a,a.route,a.pace);return;}
  if(a.kind==='worker'){
   // From start to finish: fetch the material, carry it to the bench, work it, set the result down and hand it on.
   if(a.mode==='walk'){if(stepAlong(a,dt)){if(a.returning){a.returning=false;a.carrying=false;a.heading=a.station;if(a.busy)startBench(a);else{a.mode='rest';a.stage=-1;}}else{a.mode='fetch';a.until=now+1500;a.stage=0;}}}
   else if(a.mode==='fetch'){if(now>a.until){a.returning=true;a.carrying=true;a.stage=1;setPath(a,a.way.back,38);}}
   else if(a.mode==='work'){if(!a.busy){a.mode='rest';a.stage=-1;a.progress=0;}else{a.progress=Math.min(1,a.progress+dt*1000/a.workFor);if(a.progress>=1)finishPiece(a,now);}}
   else if(!a.busy){a.stage=-1;if(a.chat){if(now>a.chat.until){a.chat=null;a.mode='rest';a.heading=a.station;}else{a.mode='talk';a.heading=Math.atan2(a.chat.other.x-a.x,a.chat.other.y-a.y);}}}
   else if(now>a.until){a.chat=null;beginPiece(a,now);}
  }else{
   if(living(a,now,dt))return;
   if(a.f.name==='Sam'&&!a.visit&&!namedActor('Frodo').visit&&a.mode!=='walk'&&now>a.until){const lead=namedActor('Frodo'),d=Math.hypot(lead.x-a.x,lead.y-a.y);if(d>48){const k=(d-30)/d;setPath(a,[{x:a.x+(lead.x-a.x)*k,y:a.y+(lead.y-a.y)*k}],d>160?44:26);a.until=now+900;return;}}
   if(a.mode==='walk'){if(stepAlong(a,dt)){a.mode='rest';a.until=now+6500;}}
   else if(now>a.until){
    if(a.f.home){const c=homeOf(a.f.home);a.post=(a.post+1)%homePosts.length;const q={x:c.x+homePosts[a.post][0],y:c.y+homePosts[a.post][1]+a.lane};if(clearWalk(a,q))setPath(a,[q],a.f.people==='hobbit'||a.f.people==='gollum'?20:26);else a.until=now+1500;}
    else{const n=roadLoop.length,next=(a.stop+1)%n,path=[];for(let i=a.stop;i!==next;i=(i+1)%n)path.push(...ringPaths[i]);setPath(a,path,48);a.stop=next;}
   }
  }
 }
 const STAGES=['holt Material','trägt es zur Werkbank','an der Werkbank','legt das Ergebnis ab und gibt es weiter'];
 const startBench=a=>{a.mode='work';a.stage=2;a.progress=0;a.workFor=12000+Math.random()*7000;};
 function beginPiece(a,now){
  if(preview){const q=workLine.get(a.site);if(!q?.inbox){a.until=now+1200;a.stage=-1;a.progress=0;return;}q.inbox--;a.piece=true;renderTrays();}
  a.way??=workerWay(a)||0;a.progress=0;
  if(a.way){a.stage=0;setPath(a,a.way.out,38);}else startBench(a);
 }
 // A finished piece stays on the pile and a messenger takes the result on to the next district. Only the labelled preview counts pieces itself.
 function finishPiece(a,now){
  a.mode='rest';a.stage=3;a.until=now+2200;a.progress=1;
  if(!preview||!a.piece)return;a.piece=false;
  const q=workLine.get(a.site),order=[...stations].sort((x,y)=>x.step-y.step),i=order.findIndex(s=>s.id===a.site),s=order[i],to=order[(i+1)%order.length];
  // A delivery is shared out among the whole crew; only when each has done their part does the result move on.
  q.made++;renderTrays();renderLegend();
  if(q.made%crews[a.site].length)return;
  if(i===order.length-1){lineUsed++;receive(to.id);}else dispatch({from:s.id,to:to.id,title:`Probelauf: ${s.verb} fertig, weiter nach ${to.title}`,piece:true});
 }
 function receive(site){const q=workLine.get(site);if(q&&preview){q.inbox+=crews[site].length;renderTrays();}}
 // ---- Life among the known figures: they seek each other out, greet, talk, quarrel, hide and stand their ground. All scenery. ----
 const namedActor=n=>{let a=namedCache.get(n);if(!a){a=actors.find(x=>x.f?.name===n&&x.kind!=='patrol');if(a)namedCache.set(n,a);}return a;};
 const siteIndex=a=>a.f.home?Object.keys(sitePlaces).indexOf(a.f.home):a.stop;
 function routeBetween(a,b){
  const end={x:b.x+(a.x<b.x?-19:19),y:b.y+6};if(Math.hypot(a.x-b.x,a.y-b.y)<320)return [end];
  const n=roadLoop.length,i=siteIndex(a),j=siteIndex(b),up=(j-i+n)%n,path=[];
  if(i<0||j<0||i===j)return [end];
  if(up<=n-up)for(let k=i;k!==j;k=(k+1)%n)path.push(...ringPaths[k]);else for(let k=i;k!==j;k=(k-1+n)%n)path.push(...[...ringPaths[(k-1+n)%n]].reverse());
  path.push(end);return path;
 }
 const stopMeeting=a=>{const m=a.meet;if(!m)return;a.meet=null;if(m.other.meet?.other===a){m.other.meet=null;if(m.other.mode!=='walk')m.other.mode='rest';}};
 function startMeeting(a,b,bond,now=performance.now()){
  stopMeeting(a);stopMeeting(b);a.hideUntil=a.guardUntil=b.hideUntil=b.guardUntil=0;
  a.meet={other:b,bond,state:'go',first:a};b.meet={other:a,bond,state:'wait',first:a};b.path=null;b.mode='rest';
  setPath(a,routeBetween(a,b),a.f.people==='hobbit'||a.f.people==='gollum'?30:a.f.people==='dwarf'?34:44);
  if(pinned===a||pinned===b)renderPerson();
 }
 const beginTalk=(a,now)=>{const m=a.meet,b=m.other,until=now+Math.max(7000,m.bond.lines.length*3400);a.path=null;if(m.visit){m.state='talk';m.since=now;m.until=until;if(!b.busy&&!b.chat){b.chat={other:a,until,since:now,lines:[],first:a};b.heading=Math.atan2(a.x-b.x,a.y-b.y);}}else for(const q of [a,b]){q.meet.state='talk';q.meet.since=now;q.meet.until=until;}};
 function endTalk(a,now){
  const m=a.meet,b=m.other,hostile=m.bond.tone==='hostile';a.meet=null;a.mode='rest';a.until=now+2500+Math.random()*3000;
  if(m.visit){const back=a.visit.leave;a.visit.leaving=true;setPath(a,back,a.f.people==='hobbit'||a.f.people==='gollum'?26:34);return;}
  if(a.f.name==='Gollum'&&hostile){const away=Math.atan2(a.x-b.x,a.y-b.y);setPath(a,[{x:a.x+Math.sin(away)*90,y:a.y+Math.cos(away)*90}],62);}
  else if(m.first===a){if(a.f.home&&Math.hypot(a.x-homeOf(a.f.home).x,a.y-homeOf(a.f.home).y)>320){setPath(a,routeBetween(a,{x:homeOf(a.f.home).x,y:homeOf(a.f.home).y,f:{home:a.f.home},stop:0}),36);}else if(!a.f.home)a.stop=siteIndex(b)>=0?siteIndex(b):a.stop;}
 }
 // Returns true while the figure is occupied by someone or something else.
 function living(a,now,dt){
  if(a.hideUntil>now){a.mode='hide';if(a.enemy)a.heading=Math.atan2(a.x-a.enemy.x,a.y-a.enemy.y);return true;}
  if(a.guardUntil>now){a.mode='guard';if(a.enemy)a.heading=Math.atan2(a.enemy.x-a.x,a.enemy.y-a.y);return true;}
  const m=a.meet;if(!m){if(a.mode==='hide'||a.mode==='guard'||a.mode==='talk'||a.mode==='greet'){a.mode='rest';a.until=Math.max(a.until,now+1800);}return false;}
  const b=m.other;
  if(m.state==='go'){a.mode='walk';if(stepAlong(a,dt)||Math.hypot(a.x-b.x,a.y-b.y)<24){beginTalk(a,now);}return true;}
  if(m.state==='wait'){a.mode='rest';a.heading=Math.atan2(b.x-a.x,b.y-a.y);return true;}
  a.heading=Math.atan2(b.x-a.x,b.y-a.y);
  a.mode=m.bond.tone==='warm'&&now-m.since<1500?'greet':'talk';
  if(now>m.until)endTalk(a,now);
  return true;
 }
 const lifeText=a=>{if(a.hideUntil>performance.now())return 'Versteckt sich vor dem Feind.';if(a.guardUntil>performance.now())return 'Stellt sich dem Feind.';const m=a.meet;if(m)return m.state==='go'?`Unterwegs zu ${m.other.f.name}.`:m.state==='wait'?`Erwartet ${m.other.f.name}.`:`Spricht mit ${m.other.f.name}.`;return a.f.home?'Ist in der Nähe seiner Heimat unterwegs.':'Reist durch Mittelerde.';};
 const FIGHTERS=new Set(['Aragorn','Boromir','Faramir','Legolas','Gimli','Éowyn','Théoden','Gandalf']),HIDERS=new Set(['Frodo','Sam','Gollum']);
 function lifeTick(now){
  if(reduced()||!ready)return;
  const walkers=actors.filter(a=>a.kind==='wanderer'),patrols=actors.filter(a=>a.kind==='patrol');
  const dark=[...riders.map(r=>({x:r.x,y:r.y,far:170})),...(sauron?[{x:sauron.x,y:sauron.y,far:240}]:[])];
  for(const a of walkers){
   const name=a.f.name,fight=FIGHTERS.has(name),hide=HIDERS.has(name);if(!fight&&!hide)continue;
   let foe=null,gap=1e9;for(const q of dark){const d=Math.hypot(q.x-a.x,q.y-a.y);if(d<q.far&&d<gap){gap=d;foe=q;}}
   if(!foe&&fight)for(const q of patrols){const d=Math.hypot(q.x-a.x,q.y-a.y);if(d<100&&d<gap){gap=d;foe=q;}}
   if(!foe)continue;
   a.enemy=foe;if(hide)a.hideUntil=now+2600;else a.guardUntil=now+2600;
  }
  for(const q of patrols){
   if(sauron&&Math.hypot(sauron.x-q.x,sauron.y-q.y)<150){q.bowUntil=now+1200;continue;}
   for(const a of walkers)if(FIGHTERS.has(a.f.name)&&Math.hypot(a.x-q.x,a.y-q.y)<90){q.alertUntil=now+1800;q.alertAt=a;break;}
  }
  if(now>nextMeeting){nextMeeting=now+7000+Math.random()*7000;
   const free=a=>a&&!a.meet&&!a.visit&&a.mode==='rest'&&!a.path&&!(a.hideUntil>now)&&!(a.guardUntil>now),open=bonds.filter(b=>{const x=namedActor(b.a),y=namedActor(b.b);return free(x)&&free(y)&&now-(b.last??-1e9)>90000;});
   if(open.length){const b=open[Math.floor(Math.random()*open.length)];b.last=now;startMeeting(namedActor(b.a),namedActor(b.b),spoken(b,namedActor(b.a)),now);}
  }
  if(now>nextVisit){nextVisit=now+9000+Math.random()*9000;
   const free=a=>a&&!a.meet&&!a.visit&&a.mode==='rest'&&!a.path&&!(a.hideUntil>now)&&!(a.guardUntil>now),open=hallVisits.filter(v=>{const g=namedActor(v.guest),h=namedActor(v.host);return free(g)&&h&&!h.busy&&!h.chat&&h.mode==='rest'&&now-(v.last??-1e9)>120000;}).sort((p,q)=>{const near=v=>{const g=namedActor(v.guest),h=namedActor(v.host);return Math.hypot(g.x-h.x,g.y-h.y)+Math.random()*700;};return near(p)-near(q);});
   const handover=talks.map(t=>{if(!t.handover||now-(t.told??-1e9)<120000)return null;const g=actors.find(a=>a.kind==='wanderer'&&a.f.home===t.from&&free(a)),h=actors.find(a=>a.kind==='worker'&&a.site===t.station&&!a.busy&&!a.chat&&a.mode==='rest');return g&&h?{t,g,h}:null;}).find(Boolean);
   if(handover){handover.t.told=now;startVisit(handover.g,handover.h,{tone:'warm',lines:handover.t.handover},now);}else if(open.length){const v=open[0];v.last=now;startVisit(namedActor(v.guest),namedActor(v.host),spoken(v,namedActor(v.guest)),now);}
  }
  if(now>nextChat){nextChat=now+3500+Math.random()*4000;
   const idle=site=>actors.filter(a=>a.kind==='worker'&&a.site===site&&!a.busy&&a.mode==='rest'&&!a.chat),open=talks.filter(t=>districts.get(t.station)?.open>.2&&idle(t.station).length>1&&now-(t.told??-1e9)>45000);
   if(open.length){const t=open[0],[x,y]=idle(t.station),until=now+9000;t.told=now;x.chat={other:y,until,since:now,lines:t.lines,first:x};y.chat={other:x,until,since:now,lines:t.lines,first:x};}
  }
 }
 // The end of the Quest on the tongue of rock, played out for whoever looks in. Scenery only.
 let naurCast=null,naurClock=0,naurLine=null,ringGlow=null;
 const castMember=(name,people,tool,home)=>{const root=makeFigure(people,tool??'letter');root.scale.setScalar(.48);root.traverse(n=>{if(n.isMesh)n.castShadow=false;});home.add(root);return {name,people,tool,root,rich:null,mode:'rest',speed:0};};
 const NAUR_LINES=[[29,36,'sam','Dort ist das Feuer, Herr Frodo! Wirf ihn hinein!'],[37,44,'frodo','Nein. Ich tue es nicht. Er gehört mir.'],[51,55.6,'gollum','Mein! Mein Schatz!'],[62,68,'sam','Es ist vorbei. Nimm meine Hand!']];
 function naurStep(now,dt){
  const S=naurRoom.userData.stage;S.flare=Math.max(0,S.flare-dt*.5);
  if(doomOpen<.25){if(naurCast)for(const c of Object.values(naurCast))c.root.visible=false;naurClock=0;naurLine=null;if(ringGlow)ringGlow.visible=false;return;}
  if(!naurCast){naurCast={frodo:castMember('Frodo','hobbit',null,S.inner),sam:castMember('Sam','hobbit',null,S.inner),gollum:castMember('Gollum','gollum',null,S.inner)};ringGlow=new T.Sprite(new T.SpriteMaterial({map:puffTexture,color:'#ffd27a',transparent:true,depthWrite:false,blending:T.AdditiveBlending,fog:false}));ringGlow.scale.set(5,5,1);S.inner.add(ringGlow);}
  naurClock=(naurClock+dt)%84;const t=naurClock,{door,tip}=S,span=(a,b)=>Math.max(0,Math.min(1,(t-a)/(b-a))),edge=tip+5,{frodo,sam,gollum}=naurCast;
  const put=(c,z,mode,heading,shown=true,y=0,side=0,speed=0)=>{c.root.visible=shown;if(!shown)return;c.root.position.set(S.lineAt(z)+side,y+.1,z);c.mode=mode;c.speed=speed;c.root.rotation.y=heading;};
  // Frodo walks out to the point, stops, turns to the others, vanishes with the Ring on and is fought for it.
  if(t<26)put(frodo,door-4+(edge-door+4)*span(2,26),t<2?'rest':'walk',Math.PI,true,0,0,24);
  else if(t<37)put(frodo,edge,'rest',Math.PI);
  else if(t<45)put(frodo,edge,'talk',0);
  else if(t<49)put(frodo,edge,'rest',0,false);
  else if(t<56)put(frodo,edge,'talk',Math.sin(t*5)*.5);
  else if(t<64)put(frodo,edge,'hide',.3);
  else put(frodo,edge+(door-4-edge)*span(66,83),t<66?'rest':'walk',0,t<83,0,0,20);
  // Sam follows, calls to him and is struck down, then pulls him back.
  const samStop=edge+22;
  if(t<28)put(sam,door-4+(samStop-door+4)*span(6,28),t<6?'rest':'walk',Math.PI,t>=5,0,0,24);
  else if(t<43)put(sam,samStop,t>29&&t<36?'talk':'rest',Math.PI);
  else if(t<58)put(sam,samStop,'hide',Math.PI,true,0,-2.4);
  else if(t<62)put(sam,samStop+(edge+7-samStop)*span(58,62),'walk',Math.PI,true,0,0,30);
  else if(t<66)put(sam,edge+7,'talk',Math.PI);
  else put(sam,edge+7+(door-4-edge-7)*span(66,83),'walk',0,t<83,0,0,20);
  // Gollum creeps in behind them, leaps at the empty air and goes over the edge with his prize.
  if(t<31)gollum.root.visible=false;
  else if(t<46)put(gollum,door-4+(edge+6-door+4)*span(31,46),'hide',Math.PI,true,0,0,14);
  else if(t<56)put(gollum,edge+3+Math.sin(t*6)*.6,'talk',Math.PI);
  else if(t<61){const q=span(56,60.4),y=2.8-q*q*(2.8-S.lavaDrop);put(gollum,edge-3-q*14,'rest',Math.PI+q*7,q<1,y);if(q>=1&&S.flare<.5)S.flare=1;}
  else gollum.root.visible=false;
  // The Ring glints on Frodo's hand until it is lost.
  {const holder=t>=33&&t<45?frodo:t>=52&&t<60.4?gollum:null;ringGlow.visible=Boolean(holder&&holder.root.visible);if(holder){ringGlow.position.copy(holder.root.position);ringGlow.position.y+=11;}}
  const line=NAUR_LINES.find(l=>t>=l[0]&&t<l[1]);naurLine=line?{who:naurCast[line[2]],text:line[3]}:null;
  for(const c of Object.values(naurCast)){if(!c.rich&&rigMap){c.rich=dressFigure(rigMap,c.people,c.tool,c.name);c.root.add(c.rich.group);}if(c.rich&&c.root.visible){c.rich.group.visible=true;c.root.userData.body.visible=false;c.rich.play(c.mode,c.speed,reduced()?0:dt,false,c===gollum?'hostile':'warm');}else if(c.root.visible)c.root.userData.pose?.(c.mode==='walk'?now*.012:0,0,false);}
 }
 // Now and then Denethor runs ablaze from the Hall of Kings past the White Tree, along the prow and over the point.
 let pyre=null,pyreAt=performance.now()+45000,pyreClock=-1;
 const DENETHOR_WAY=[[0,-2],[17,8],[17,38],[0,56],[0,168]];
 function denethorStep(now,dt){
  const d=districts.get('gate'),c=d.c,close=Math.hypot(cam.x-c.x,cam.y-c.y)<900&&cam.d<1500&&d.open<.15;
  if(pyreClock<0){if(now<pyreAt||!close||reduced()||!puffTexture)return;pyreClock=0;}
  if(!pyre){const root=makeFigure('gondor','seal');root.scale.setScalar(.42);root.traverse(n=>{if(n.isMesh)n.castShadow=false;});const flames=[];for(let i=0;i<16;i++){const s=new T.Sprite(new T.SpriteMaterial({map:puffTexture,color:i%3?'#ff4a0a':'#ffa41e',transparent:true,depthWrite:false,fog:false}));root.add(s);flames.push(s);}const light=new T.PointLight('#ff7a2a',600,240,1.5);light.position.y=16;root.add(light);scene.add(root);pyre={root,flames,light};}
  pyreClock+=dt;let left=pyreClock*13*RS,x=DENETHOR_WAY[0][0],z=DENETHOR_WAY[0][1],ry=0,done=true;
  for(let i=0;i<DENETHOR_WAY.length-1;i++){const a=DENETHOR_WAY[i],b=DENETHOR_WAY[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1])*RS;ry=Math.atan2(b[0]-a[0],b[1]-a[1]);if(left<len){const f=left/len;x=a[0]+(b[0]-a[0])*f;z=a[1]+(b[1]-a[1])*f;done=false;break;}left-=len;x=b[0];z=b[1];}
  const top=d.y+(CITADEL_TOP+.3)*RS;let y=top,fall=0;if(done){fall=left/(13*RS);y=top+fall*14-fall*fall*38;z+=fall*14/RS;}
  if(y<d.y+40){pyre.root.visible=false;pyreClock=-1;pyreAt=now+120000+Math.random()*120000;return;}
  pyre.root.visible=true;pyre.root.position.set(c.x+x*RS,y,c.y+z*RS);pyre.root.rotation.y=ry;pyre.root.rotation.x=done?fall*1.4:0;pyre.root.userData.pose?.(pyreClock*16,Math.sin(pyreClock*16)*.9,false);
  pyre.flames.forEach((s,i)=>{const q=(pyreClock*1.7+i/16)%1,w=(40+Math.sin(i*2.4)*10)*(1-q*.6);s.position.set(Math.sin(i*2.1+pyreClock*5)*8,6+q*52,Math.cos(i*1.7+pyreClock*6)*8-q*14);s.scale.set(w,w*1.5,1);s.material.opacity=Math.min(1,(1-q)*1.8);});pyre.light.intensity=520+Math.sin(pyreClock*23)*120;
 }
 // A guest calls on someone in their hall: down the road, through the door and across the floor to them.
 function startVisit(guest,host,visit,now){
  const site=host.site,d=districts.get(site),c=d.c,home=homeOf(site),out=[];
  const local=(x,z)=>({x:c.x+x*RS,y:c.y+z*RS}),doorZ=d.doorZ??104,from={x:0,z:doorZ},near={x:(host.x-c.x)/RS+((host.x-c.x)>0?-14:14),z:(host.y-c.y)/RS+6};
  const inside=wayIn(d.grid,from,near)?.map(q=>local(q.x,q.z))??[local(near.x,near.z)];
  const toDoor=Math.hypot(guest.x-c.x,guest.y-c.y)<420?[home]:routeBetween(guest,{x:home.x,y:home.y,f:{home:site},stop:0});
  out.push(...toDoor,local(0,doorZ+40),local(0,doorZ),...inside);
  stopMeeting(guest);guest.hideUntil=guest.guardUntil=0;guest.visit={site,leave:[local(0,doorZ),local(0,doorZ+40),home]};guest.inHall=false;
  guest.meet={other:host,bond:visit,state:'go',first:guest,visit:true};setPath(guest,out,guest.f.people==='hobbit'||guest.f.people==='gollum'?30:guest.f.people==='dwarf'?34:44);
  if(pinned===guest)renderPerson();
 }
 const sayTags=[];
 function sayFor(i){if(sayTags[i])return sayTags[i];const box=el('div','','me-say');workLayer.append(box);return sayTags[i]={box,text:''};}
 function renderSpeech(now){
  let used=0;
  const show=(speaker,line)=>{if(!speaker.mesh.visible||used>=8)return;const q=screenOf(speaker.x,speaker.mesh.position.y+(peoples[speaker.f.people]?.h??1)*46,speaker.y);if(!q||q.x<0||q.y<0||q.x>W||q.y>H)return;const t=sayFor(used++),text=`${speaker.f.name}: ${line}`;if(t.text!==text){t.text=text;t.box.textContent=text;}t.box.hidden=false;t.box.style.transform=`translate3d(${Math.round(q.x)}px,${Math.round(q.y)}px,0) translate(-50%,-100%)`;};
  if(!inner&&cam.d<1300)for(const a of actors){
   if(a.kind==='wanderer'&&a.meet?.state==='talk'&&a.meet.first===a){const lines=a.meet.bond.lines,i=Math.min(lines.length-1,Math.floor((now-a.meet.since)/3400));if(lines.length)show(i%2?a.meet.other:a,lines[i]);}
   else if(a.chat&&a.chat.first===a&&districts.get(a.site).open>=.6){const i=Math.min(a.chat.lines.length-1,Math.floor((now-a.chat.since)/4200));if(a.chat.lines.length)show(i%2?a.chat.other:a,a.chat.lines[i]);}
   else if(a.kind==='wanderer'&&a.hideUntil>now&&a.f.name==='Sam')show(a,'Runter, Herr Frodo!');
  }
  if(naurLine&&doomOpen>.5){const w=naurLine.who.root.getWorldPosition(new T.Vector3()),q=screenOf(w.x,w.y+18,w.z);if(q){const t=sayFor(used++),text=`${naurLine.who.name}: ${naurLine.text}`;if(t.text!==text){t.text=text;t.box.textContent=text;}t.box.hidden=false;t.box.style.transform=`translate3d(${Math.round(q.x)}px,${Math.round(q.y)}px,0) translate(-50%,-100%)`;}}
  for(let i=used;i<sayTags.length;i++)sayTags[i].box.hidden=true;
 }
 function sendCourier(start,path,site,title,next=null,piece=false){
  const member=crews[site]?.[0]??{people:'rohirrim'};
  couriers.push(addFigure({kind:'courier',site,piece,f:{people:member.people,tool:'letter'},x:start.x,y:start.y,heading:0,phase:0,path:path.slice(1),seg:0,speed:96,mode:'walk',title,next}));
 }
 function dispatch(flow){
  if(couriers.length>=8||reduced()){if(flow.piece)receive(flow.to);return;}
  if(flow.from===HUB)return sendCourier(hubGate,[...wayToHub(flow.to)].reverse(),flow.to,flow.title,null,flow.piece);
  // A worker of the district carries it along its road to the gate of Barad-dûr, another one takes it on.
  const way=wayToHub(flow.from);sendCourier(way[0],way,flow.from,flow.title,flow.to===HUB?null:{to:flow.to,title:flow.title,piece:flow.piece});
 }
 let sauron=null,smith=null;const landAir=[],smokePoints=[],smokeParticles=[],particleSources={embers:[],spray:[],leaves:[]},particleSets=[];let smokeMesh=null,eye=null,balrog=null,sea=null,havenGroup=null;

 async function buildScene(){
  const surfaces=await loadSurfaces(),hdr=await loadSky();
  hdr.mapping=T.EquirectangularReflectionMapping;scene.background=null;scene.environment=hdr;scene.environmentIntensity=.5;dome=buildDome();scene.add(dome.mesh);
  const plan={scouts:['stone','stone','stone','stone'],isengard:['rock','marble','rock','rock'],library:['stone','marble','marble','stone'],lorien:['bark','wood','marble','grass'],council:['bark','bark','rock','bark'],forge:['rock','stone','rock','rock'],gate:['marble','marble','marble','marble'],messengers:['grass','wood','wood','grass'],treasury:['rock','stone','rock','rock'],observatory:['stone','stone','stone','marble']};
  const materialsFor=id=>{const [outer,floor,wall,roof]=plan[id];const grown=(name,reach)=>blendIntoLand(surfaceMaterial(surfaces[name]),texture,EXTENT,reach);return {outside:Object.assign(cutaway(grown(outer,22)),{transparent:true}),inside:cutaway(surfaceMaterial(surfaces[floor])),wall:cutaway(grown(wall,12)),roof:cutaway(grown(roof,20))};};
  // Thranduil's halls lie under the dark wood: old dark bark in front, moss and leaf mould over them.
  const shade={council:{roof:'#b4c09c'}};
  const world=await buildWorld();
  const texture=new T.CanvasTexture(world.land);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  // One seamless ground: finest around the places, ever coarser towards the horizon.
  const fine=matchMedia('(pointer:coarse)').matches||(navigator.hardwareConcurrency??8)<=4?9:4.6,lines=(from,to)=>{const run=[];for(let v=from;v<=to;v+=fine)run.push(v);const before=[],after=[];let step=fine,a=from,b=run[run.length-1];while(from-a<780){step=Math.min(fine*5,step*1.035);a-=step;b+=step;before.unshift(a);after.push(b);}return [...before,...run,...after];};
  const xs=lines(WORLD.x-60,WORLD.x+WORLD.w+60),zs=lines(WORLD.y-60,WORLD.y+WORLD.h+60),NX=xs.length,NZ=zs.length,vertices=new Float32Array(NX*NZ*3),uvs=new Float32Array(NX*NZ*2),order=new Uint32Array((NX-1)*(NZ-1)*6);
  for(let j=0;j<NZ;j++){for(let i=0;i<NX;i++){const o=j*NX+i;vertices[o*3]=xs[i];vertices[o*3+1]=groundAt(xs[i],zs[j]);vertices[o*3+2]=zs[j];uvs[o*2]=(xs[i]-EXTENT.x)/EXTENT.w;uvs[o*2+1]=1-(zs[j]-EXTENT.y)/EXTENT.h;}if(j%48===0)await new Promise(done=>setTimeout(done));}
  {let n=0;for(let j=0;j<NZ-1;j++)for(let i=0;i<NX-1;i++){const a=j*NX+i,b=a+1,c=a+NX,d=c+1;order[n++]=a;order[n++]=c;order[n++]=b;order[n++]=b;order[n++]=c;order[n++]=d;}}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));geometry.setIndex(new T.BufferAttribute(order,1));geometry.computeVertexNormals();
  const landMaterial=new T.MeshStandardMaterial({map:texture,roughness:.95});addTerrainDetail(landMaterial,surfaces,world.light,EXTENT,HUB_SITE);landTime=landMaterial.userData.time;landHole=landMaterial.userData.hole;landHole.value.set(mountDoom.x,mountDoom.y,0,170);landBake=landMaterial.userData.bake;const land=new T.Mesh(geometry,landMaterial);land.receiveShadow=true;land.frustumCulled=false;land.renderOrder=2;scene.add(land);
  // Beyond it a plain, coarse ground carries the far ranges to the horizon. It lies a little lower, so the fine ground always wins where they meet.
  {const x0=xs[0],x1=xs[NX-1],z0=zs[0],z1=zs[NZ-1],cell=90,cols=Math.round(22000/cell),rows=Math.round(21000/cell),far=new Float32Array((cols+1)*(rows+1)*3),farUv=new Float32Array((cols+1)*(rows+1)*2),index=[];
   for(let j=0;j<=rows;j++){for(let i=0;i<=cols;i++){const x=-10000+i*cell,z=-10000+j*cell,o=j*(cols+1)+i;far[o*3]=x;far[o*3+1]=groundAt(x,z)-(x>x0-cell&&x<x1+cell&&z>z0-cell&&z<z1+cell?14:0);far[o*3+2]=z;farUv[o*2]=(x-EXTENT.x)/EXTENT.w;farUv[o*2+1]=1-(z-EXTENT.y)/EXTENT.h;if(i<cols&&j<rows&&!(x>x0+cell&&x+cell<x1-cell&&z>z0+cell&&z+cell<z1-cell)){const a=o,b=a+1,c=a+cols+1,d=c+1;index.push(a,c,b,b,c,d);}}if(j%24===0)await new Promise(done=>setTimeout(done));}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(far,3));g.setAttribute('uv',new T.BufferAttribute(farUv,2));g.setIndex(index);g.computeVertexNormals();const horizon=new T.Mesh(g,landMaterial);horizon.frustumCulled=false;horizon.renderOrder=2;scene.add(horizon);}
  // The great western sea, all the way to the horizon.
  sea=new T.Mesh(new T.PlaneGeometry(240000,240000),seaMaterial(seaDepth(),EXTENT,SUN,riverFlow()));sea.rotation.x=-Math.PI/2;sea.position.set(WORLD.x+WORLD.w/2,1,WORLD.y+WORLD.h/2);sea.renderOrder=-1;sea.frustumCulled=false;scene.add(sea);
  // Nothing grows through a building, a wall or a stall.
  standing=Object.keys(sitePlaces).map(id=>{const c=hallCentre(id);return {c,boxes:groundFootprints(id).map(q=>q.map(v=>v*RS))};});const free=t=>!standing.some(({c,boxes})=>{const x=t.x-c.x,z=t.y-c.y,m=t.kind==='stone'||/bush/.test(t.kind)?3:11;return Math.hypot(x,z)<800&&boxes.some(q=>x>q[0]-m&&x<q[2]+m&&z>q[1]-m&&z<q[3]+m);});
  // Nothing grows in front of a door or along the way to it, so every entrance can be seen and reached.
  const doorClear=t=>!Object.keys(sitePlaces).some(id=>{const c=hallCentre(id),x=t.x-c.x,z=t.y-c.y,reach=(id==='treasury'?162:124)*RS;if(z>reach*.25&&z<reach+560&&Math.abs(x)<reach*.62+Math.max(0,z-reach)*.28)return true;return lanes[id].some((q,i,all)=>{const b=all[i+1];if(!b)return false;const dx=b.x-q.x,dy=b.y-q.y,f=Math.max(0,Math.min(1,((t.x-q.x)*dx+(t.y-q.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(t.x-q.x-dx*f,t.y-q.y-dy*f)<34;});});
  const bridgeSight=crossings.map(l=>l[Math.floor(l.length/2)]),bridgeClear=t=>/bush|stone/.test(t.kind)||!bridgeSight.some(q=>Math.hypot(t.x-q.x,t.y-q.y)<105),gateSight=hallCentre('gate'),gateClear=t=>t.kind!=='mallorn'||t.x>gateSight.x+420+(t.y-gateSight.y)*.1||t.y<gateSight.y;
  scene.add(buildForest(world.trees.filter(t=>gateClear(t)&&bridgeClear(t)&&free(t)&&doorClear(t)&&!onRoad(t.x,t.y,/bush|stone/.test(t.kind)?11:24)&&Math.hypot(t.x-mountDoom.x,t.y-mountDoom.y)>245&&Math.hypot(t.x-2139,t.y)>70&&Math.hypot(t.x-(sitePlaces.library.x+176*SITE.scale),t.y-(sitePlaces.library.y+SITE.offset-322*SITE.scale))>110&&(t.kind==='dead'||t.kind==='stone'||Math.hypot(t.x-HUB_SITE.x,(t.y-HUB_SITE.y)/.72)>505)),groundAt));
  // The mountain river wells up from under fallen boulders at the head of its gorge.
  {const k=new Kit();for(const [x,z,sx,sy,sz,c] of [[2139,-24,34,22,28,'#7d7f70'],[2108,-8,22,15,20,'#727565'],[2172,-10,24,16,20,'#7a7c6c'],[2124,-44,18,12,16,'#6c6f60'],[2160,-42,20,13,16,'#76786a'],[2094,18,14,9,12,'#6f7264'],[2186,20,15,10,12,'#74776a']])k.rock(x,groundAt(x,z)+sy*.4,z,sx,sy,sz,c,Math.round(x+z));for(const [x,z,r] of [[2136,-32,12],[2110,-14,8],[2170,-18,8]])k.ball(x,groundAt(x,z)+r*1.6,z,r,'#5f8a3e',.55);const m=k.mesh(solid);m.castShadow=m.receiveShadow=true;scene.add(m);}
  const flowWater=flowMaterial();
  for(const s of stations){
   const c=hallCentre(s.id),y=groundAt(c.x,c.y)+2,settle=(x,z)=>{const r=Math.hypot(x,z);if(r<128)return 0;const k=Math.min(1,(r-128)/48);return Math.max(-90,Math.min(46,(groundAt(c.x+x*RS,c.y+z*RS)-y+2)/RS))*k*k*(3-2*k);},d=buildDistrict(s.id,crews[s.id],{interiors:roomInteriors,cutaway,buildWalls,footing:wallFoot,landmarks,roofs,closeDetails,ground:settle,walkGrid,floor:roomFloor,flow:()=>flowWater,materials:{[s.id]:(m=>{for(const [part,tone] of Object.entries(shade[s.id]??{}))m[part].color.set(tone);return m;})(materialsFor(s.id))}});d.group.position.set(c.x,y,c.y);d.group.scale.setScalar(RS);scene.add(d.group);districts.set(s.id,{...d,id:s.id,c,y,settle,tray:new T.Group(),jewels:[]});d.group.add(districts.get(s.id).tray);
   const at=q=>new T.Vector3(c.x+q[0]*RS,y+q[1]*RS,c.y+q[2]*RS);for(const q of d.fx.smoke)smokePoints.push(at(q));for(const q of d.fx.embers)particleSources.embers.push(at(q));for(const q of d.fx.spray)particleSources.spray.push(at(q));for(const q of d.fx.leaves)particleSources.leaves.push(at(q));
   crews[s.id].forEach((m,index)=>{const p=crewPoint(m),home={x:c.x+p.x*RS,y:c.y+p.z*RS};actors.push(addFigure({kind:'worker',site:s.id,index,f:m,home,x:home.x,y:home.y,heading:Math.PI/2,station:Math.PI/2,phase:Math.random()*6,mode:'rest',until:0,path:null,busy:false,note:'',stage:-1,progress:0}));});
  }
  // Great trees wear painted crowns; those over a hall thin out leaf by leaf when zooming in.
  for(const [id,plan] of Object.entries(regionLeaves)){const d=districts.get(id);d.outside.add(leafCrowns(plan.kind,plan.outside));const over=leafCrowns(plan.kind,plan.roof);d.roof.add(over);roofLeaves.push({d,material:over.material});}
  // Stone bridges carry the roads across the rivers.
  // Every crossing is a stone bridge: it starts level with the road on each bank, rises in a shallow arc over the water and stands on piers in the river bed.
  {const stone=new Kit(),wood=new Kit(),lamps=[];
   const manners={messengers:{deck:'#b3a98e',wall:'#98917a',rail:'stone',W:13},library:{deck:'#e8e0c8',wall:'#d6ceb4',rail:'elven',W:12},lorien:{deck:'#ece8d6',wall:'#d6d2bb',rail:'elven',W:11},council:{deck:'#7a5f40',wall:'#56432e',rail:'wood',W:12,timber:true},scouts:{deck:'#86693f',wall:'#604c30',rail:'wood',W:13,timber:true},gate:{deck:'#d6d3c6',wall:'#c0bcad',rail:'stone',W:15},observatory:{deck:'#c6c0aa',wall:'#aaa591',rail:'stone',W:15},forge:{deck:'#8a857a',wall:'#6b675c',rail:'stone',W:13},treasury:{deck:'#aca692',wall:'#8a8572',rail:'stone',W:14},isengard:{deck:'#56534d',wall:'#403e38',rail:'stone',W:13}},manner=x=>manners[Object.keys(sitePlaces).map(id=>[id,hallCentre(id)]).sort((p,q)=>Math.hypot(p[1].x-x.x,p[1].y-x.y)-Math.hypot(q[1].x-x.x,q[1].y-x.y))[0][0]];
   // Roads that meet at the water share one bridge.
   const middle=l=>l[Math.floor(l.length/2)],kept=[];for(const line of [...crossings].sort((p,q)=>q.length-p.length))if(!kept.some(l=>Math.hypot(middle(l).x-middle(line).x,middle(l).y-middle(line).y)<80))kept.push(line);
   for(const full of kept){const line=[full[0],full[full.length-1]];let total=0;const lengths=line.slice(1).map((q,i)=>{const d=Math.hypot(q.x-line[i].x,q.y-line[i].y);total+=d;return d;});if(total<4)continue;
    const look=manner(line[Math.floor(line.length/2)]),k=look.timber?wood:stone,W=look.W,from=Math.max(1.9,groundAt(line[0].x,line[0].y))+.3,to=Math.max(1.9,groundAt(line[line.length-1].x,line[line.length-1].y))+.3,rise=Math.max(5,Math.min(30,total*.17)),n=Math.max(8,Math.ceil(total/4)),spanLen=total<92?total:Math.max(40,Math.min(62,total/Math.round(total/50))),spots=[];
    for(let i=0,seg=0,walked=0;i<=n;i++){const want=total*i/n;while(seg<lengths.length-1&&walked+lengths[seg]<want){walked+=lengths[seg];seg++;}const f=(want-walked)/(lengths[seg]||1),t=i/n,x=line[seg].x+(line[seg+1].x-line[seg].x)*f,y=line[seg].y+(line[seg+1].y-line[seg].y)*f;spots.push({x,y,h:Math.max(from+(to-from)*t+Math.sin(t*Math.PI)*rise,Math.max(1.9,groundAt(x,y))+.35),along:want});}
    bridgeSpans.push({spots,box:[Math.min(...spots.map(q=>q.x))-12,Math.min(...spots.map(q=>q.y))-12,Math.max(...spots.map(q=>q.x))+12,Math.max(...spots.map(q=>q.y))+12]});
    const side=(q,ry,s,up)=>[q.x+Math.cos(ry)*s*(W/2-.5),q.h+up,q.y-Math.sin(ry)*s*(W/2-.5)];
    for(let i=0;i<spots.length-1;i++){const a=spots[i],b=spots[i+1],mx=(a.x+b.x)/2,mz=(a.y+b.y)/2,len=Math.hypot(b.x-a.x,b.y-a.y)+.5,ry=Math.atan2(b.x-a.x,b.y-a.y),rx=-Math.atan2(b.h-a.h,len),lean=(()=>{const e=new T.Euler().setFromQuaternion(new T.Quaternion().setFromEuler(new T.Euler(rx,ry,0,'YXZ')),'XYZ');return [e.y,e.x,e.z];})(),h=(a.h+b.h)/2,along=(a.along+b.along)/2,u=Math.abs(((along/spanLen)%1)-.5)*2,land=Math.max(Math.min(groundAt(mx,mz),1)-3,groundAt(mx,mz)-1.5);
     k.add(k.cube(),mx,h-.35,mz,W,.7,len,look.deck,...lean);
     if(look.timber){k.add(k.cube(),mx,h-1.2,mz,W-1.5,1,len,look.wall,...lean);if(i%2===0)k.add(k.cube(),mx,h-.1,mz,W+.6,.32,1,'#4f3d29',...lean);}
     // A true arch: the wall comes down to the springing at each pier and leaves the water free in the middle of the span.
     else{const soffit=Math.min(h-1.7,land+Math.max(0,h-land)*(1-Math.pow(1-u,2.4))*.98+Math.max(0,h-land-2)*(1-u)*.72);k.add(k.cube(),mx,(h-.7+soffit)/2,mz,W-.6,Math.max(.9,h-.7-soffit),len,look.wall,...lean);for(const q of [-1,1])k.add(k.cube(),mx+Math.cos(ry)*q*(W/2-.1),soffit-.2,mz-Math.sin(ry)*q*(W/2-.1),.8,1.1,len,look.deck,...lean);}
     for(const q of [-1,1]){const px=mx+Math.cos(ry)*q*(W/2-.5),pz=mz-Math.sin(ry)*q*(W/2-.5);
      if(look.rail==='stone'){k.add(k.cube(),px,h+.9,pz,.9,1.8,len,look.wall,...lean);k.add(k.cube(),px,h+1.95,pz,1.3,.32,len,look.deck,...lean);}
      else if(look.rail==='wood'){k.add(k.cube(),px,h+2.6,pz,.5,.5,len,look.wall,...lean);k.add(k.cube(),px,h+1.3,pz,.3,.3,len,look.wall,...lean);if(i%2===0)k.column(px,h-.2,pz,.32,3.1,look.wall,6);}
      else if(i%2===0)k.column(px,h,pz,.2,2.4,look.deck,6);}
    }
    // The railing of an elven bridge is one slender curve from bank to bank.
    if(look.rail==='elven')for(const q of [-1,1])k.limb(spots.map((p,i)=>{const nx=spots[Math.min(spots.length-1,i+1)],ov=spots[Math.max(0,i-1)];return [...side(p,Math.atan2(nx.x-ov.x,nx.y-ov.y),q,2.5),.26];}),look.deck,5);
    // Posts on both banks: newels of stone, carved poles, or a slim elven finial carrying a light.
    for(const end of [spots[0],spots[spots.length-1]]){const other=end===spots[0]?spots[1]:spots[spots.length-2],ry=Math.atan2(other.x-end.x,other.y-end.y);for(const q of [-1,1]){const [x,y,z]=side(end,ry,q,0);if(look.rail==='stone'){k.box(x,y-3,z,2.8,6.4,2.8,look.wall,ry);k.box(x,y+3.4,z,3.4,.6,3.4,look.deck,ry);k.cone(x,y+4,z,1.6,1.6,look.deck,4,Math.PI/4+ry);}else if(look.rail==='wood'){k.column(x,y-2,z,.8,7,look.wall,7);k.cone(x,y+5,z,.9,1.5,look.deck,7);}else{k.column(x,y-1,z,.5,7,look.deck,8);k.ball(x,y+6.4,z,.9,look.deck);lamps.push([x,y+7.6,z]);}}}
    const piers=Math.round(total/spanLen);for(let p=1;p<piers;p++){const q=spots[Math.round(p/piers*n)],bed=Math.min(groundAt(q.x,q.y),1)-3,next=spots[Math.min(n,Math.round(p/piers*n)+1)],ry=Math.atan2(next.x-q.x,next.y-q.y),top=q.h-1.4;if(top-bed<4)continue;if(look.timber){for(const s of [-1,1])for(const f of [-1,1])k.limb([[q.x+Math.cos(ry)*s*(W/2-1)+Math.sin(ry)*f*1.6,bed,q.y-Math.sin(ry)*s*(W/2-1)+Math.cos(ry)*f*1.6,.7],[q.x+Math.cos(ry)*s*(W/2-1.6),top,q.y-Math.sin(ry)*s*(W/2-1.6),.55]],look.wall,6);continue;}
     k.box(q.x,bed,q.y,W+1,top-bed,5,look.wall,ry);for(const s of [-1,1])k.limb([[q.x+Math.cos(ry)*s*(W/2+.5),bed,q.y-Math.sin(ry)*s*(W/2+.5),2.5],[q.x+Math.cos(ry)*s*(W/2+.5),Math.min(top,bed+6),q.y-Math.sin(ry)*s*(W/2+.5),2.2],[q.x+Math.cos(ry)*s*(W/2+.5),Math.min(top,bed+8.5),q.y-Math.sin(ry)*s*(W/2+.5),.2]],look.wall,8);}
   }
   if(stone.pos.length)scene.add(stone.mesh(surfaceMaterial(surfaces.stone)));if(wood.pos.length)scene.add(wood.mesh(surfaceMaterial(surfaces.wood)));
   // The banks: stones half in the water, tufts of reed, none of them in the way of a road or a building.
   const banks=new Kit();let stepBank=0;for(const q of riverBanks()){stepBank+=q.len;if(stepBank<46)continue;stepBank=0;const seed=Math.abs(Math.sin(q.x*.37+q.y*.11)*997);for(const s of [-1,1]){const off=26+(seed*s+40)%24,x=q.x+q.nx*s*off,z=q.y+q.ny*s*off,ground=groundAt(x,z),spot={x,y:z,kind:'stone'};if(ground>11||ground<-2||onRoad(x,z,24)||!free(spot)||!doorClear(spot))continue;const pick=Math.floor(seed+s)%3;if(pick===0){const r=2.2+seed%3.4;banks.rock(x,ground+r*.2,z,r,r*.6,r*.84,'#79766a',Math.round(seed)+s+2);}else if(pick===1)for(let i=0;i<7;i++){const a=i*2.4+seed,d=.8+i*.75;banks.cone(x+Math.cos(a)*d,ground-.3,z+Math.sin(a)*d,.32,5+((seed+i*3)%4.5),i%3?'#6f7f3c':'#8b8a48',5);}else{const r=1.3+seed%1.8;banks.rock(x,ground+r*.2,z,r,r*.55,r*.8,'#8a8678',Math.round(seed)+s+7);banks.rock(x+r*2.1,ground,z+r*.8,r*.7,r*.4,r*.6,'#6f6c61',Math.round(seed)+s+3);}}}
   if(banks.pos.length){const m=banks.mesh(solid);m.receiveShadow=true;scene.add(m);}
   for(const [x,y,z] of lamps){const m=new T.Mesh(new T.SphereGeometry(.7,8,6),glowing);m.position.set(x,y,z);scene.add(m);}
  }
  // Grass, stones and fallen leaves around every place, each in the colours of its land.
  const litter={scouts:['#7c7a4a','#6d6a44','#8a8a60'],library:['#3e6a36','#4c7a3e','#35602f'],forge:['#34362a','#3f402e','#2c2d24'],treasury:['#46482f','#515336','#3b3d29'],council:['#23391f','#2d4a26','#4a3a1e'],lorien:['#d8c050','#9ccc5a','#f0e6c0'],gate:['#6a7a48','#7c8850','#5c6c40'],observatory:['#7c8048','#8a8a54','#6a6e3e'],isengard:['#3a342a','#4a4232','#2c2822'],messengers:['#4f8a3a','#5f9a45','#437a32']};
  const bladeGeometry=new T.ConeGeometry(.42,3.1,3);{const up=bladeGeometry.attributes.normal;for(let i=0;i<up.count;i++)up.setXYZ(i,0,1,0);}const pebbleGeometry=new T.IcosahedronGeometry(1,0),matrix=new T.Matrix4(),quat=new T.Quaternion(),scale=new T.Vector3(),pos=new T.Vector3(),color=new T.Color(),yAxis=new T.Vector3(0,1,0);
  for(const [id,tones] of Object.entries(litter)){
   const d=districts.get(id),blades=new T.InstancedMesh(bladeGeometry,new T.MeshStandardMaterial({color:'#ffffff',roughness:1,side:T.DoubleSide}),2600),pebbles=new T.InstancedMesh(pebbleGeometry,new T.MeshStandardMaterial({color:'#ffffff',roughness:.95,flatShading:true}),360);
   let seed=id.length*97;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
   for(let i=0;i<2600+360;i++){
    const a=rnd()*6.283,r=(136+rnd()*rnd()*300)*RS,x=d.c.x+Math.cos(a)*r,z=d.c.y+Math.sin(a)*r,y=(groundAt(x,z)-d.y)/RS,tall=i<2600;
    pos.set((x-d.c.x)/RS,y+(tall?1.2:0),(z-d.c.y)/RS);quat.setFromAxisAngle(yAxis,a*7);const q=(tall?.6+rnd()*.9:.7+rnd()*rnd()*3.4)*(Math.hypot(x-HUB_SITE.x,(z-HUB_SITE.y)/.72)<680||groundAt(x,z)>135||onRoad(x,z)?0:1);scale.set(q,tall?q:q*.6,q);matrix.compose(pos,quat,scale);
    color.set(tones[i%tones.length]).multiplyScalar(.75+rnd()*.5);
    if(tall){blades.setMatrixAt(i,matrix);blades.setColorAt(i,color);}else{pebbles.setMatrixAt(i-2600,matrix);color.set('#6c675e').multiplyScalar(.7+rnd()*.5);pebbles.setColorAt(i-2600,color);}
   }
   pebbles.castShadow=true;blades.receiveShadow=true;pebbles.receiveShadow=true;d.closeMesh.add(pebbles);d.group.add(blades);blades.visible=false;d.blades=blades;
  }
  // The Grey Havens with their swan ships, and the road up Mount Doom.
  puffTexture=smokeTexture();rockSurface=surfaceMaterial(surfaces.rock,{roughness:.86});
  havenGroup=buildHaven(surfaceMaterial(surfaces.marble,{roughness:.62}),surfaceMaterial(surfaces.wood,{roughness:.55}));havenGroup.position.set(haven.x,groundAt(haven.x,haven.y-20),haven.y);scene.add(havenGroup);
  {const road=doomRoad(groundAt,mountDoom,{x:1640,y:767},holeCut(surfaceMaterial(surfaces.rock,{roughness:.9}),landHole));doomDoor=road.userData.door;doomPortal=road.userData.portal;scene.add(road);{const s=new T.Sprite(new T.SpriteMaterial({map:puffTexture,color:'#ff6a1a',transparent:true,opacity:.34,depthWrite:false,blending:T.AdditiveBlending,fog:false}));s.scale.set(64,120,1);s.position.set(doomDoor.x+Math.sin(DOOR_TURN)*20,doomDoor.y+30,doomDoor.z+Math.cos(DOOR_TURN)*20);scene.add(s);doomPortal.push(s);doorSprite=s;s.position.add(new T.Vector3(Math.sin(DOOR_TURN)*12,0,Math.cos(DOOR_TURN)*12));const fill=new T.PointLight('#ff8a4a',720,300,1.3);doorFill=fill;fill.position.set(doomDoor.x+Math.sin(DOOR_TURN)*60,doomDoor.y+60,doomDoor.z+Math.cos(DOOR_TURN)*60);scene.add(fill);doomPortal.push(fill);}
   shellRock=holeCut(Object.assign(surfaceMaterial(surfaces.rock,{roughness:.92}),{side:T.DoubleSide}),landHole);DOOM_FLOOR=doomDoor.y;naurRoom=buildSammathNaur(rockSurface,shellRock,puffTexture,groundAt,mountDoom,DOOM_FLOOR);scene.add(naurRoom,naurRoom.userData.light);}
  // The dark mere before the gate of Moria, and what lives in it.
  mereGroup=buildMere(mere,puffTexture,groundAt,mereY());mereGroup.position.set(mere.x,mereY(),mere.y);scene.add(mereGroup);
  // Smaug lies on his own, so he can breathe: his flanks rise and fall and the fire in his chest glows with each breath.
  {const d=districts.get('treasury'),sk=new Kit(),sg=new Kit();smaugInto(sk,sg);const pivot=new T.Group();pivot.position.set(10,0,-62);pivot.userData.size=1.14;pivot.scale.setScalar(1.14);const body=sk.mesh(d.interior.material);body.position.set(-10,0,62);pivot.add(body);if(sg.pos.length&&d.glow){const heat=d.glow.material.clone();heat.userData={};heat.onBeforeCompile=d.glow.material.onBeforeCompile;heat.customProgramCacheKey=d.glow.material.customProgramCacheKey;const glow=sg.mesh(heat);glow.castShadow=false;glow.receiveShadow=false;glow.position.copy(body.position);pivot.add(glow);d.dragonHeat=heat;}d.interior.add(pivot);d.dragon=pivot;}
  for(const [id,list] of Object.entries(roomJewels)){const d=districts.get(id);for(const j of list){const jewel=makeJewel(j,puffTexture);d.group.add(jewel.group);d.jewels.push(jewel);}}
  seaMist(puffTexture,scene);
  // Each elf of the Havens has a round of work: [x, z, what, facing, how long, carrying on the way there].
  const havenWork=[
   ['Círdan','noldor','staff',[[-30,-12,'rest',0,9000],[0,22,'rest',0,8000],[96,10,'rest',.4,7000],[-90,8,'rest',-.3,7000]]],
   ['Schiffbauer','noldor','hammer',[[-120,22,'work',0,12000],[-136,24,'work',0,10000],[-104,18,'fetch',-1.2,2500]]],
   // Porters load the great ship: from the storehouse across the quay, along the pier and over the gangway, then back for the next bale.
   ['Träger','galadhrim','sack',[[-70,-30,'fetch',3.14,2600],[14,30,'fetch',0,1200,true],[16,112,'fetch',1.57,2200,true],[16,60,'rest',3.14,900]]],
   ['Träger','noldor','sack',[[16,128,'fetch',1.57,2400],[14,40,'fetch',3.14,1200,true],[90,-36,'fetch',3.14,2600,true],[40,10,'rest',0,900]]],
   ['Lotse','noldor','compass',[[14,180,'work',0,9000],[14,150,'work',1.57,6000]]],
   // A merchant weighs and sells what the ships bring; the scribe writes every bale into the ledger.
   ['Händlerin','galadhrim','scale',[[-30,8,'work',0,11000],[-38,4,'work',.6,7000]]],
   ['Schreiber','noldor','scroll',[[8,92,'work',1.57,9000],[-24,12,'work',.6,7000]]],
  ];
  for(const [name,people,tool,chores] of havenWork){const [x,z,mode,heading]=chores[0];actors.push(addFigure({kind:'patrol',f:{name,people,tool},route:[],pace:15,chores,step:0,x:haven.x+x,y:haven.y+z,heading,phase:0,mode,path:null,until:performance.now()+chores[0][4]*Math.random()}));}
  towerParts=[reveal(Object.assign(surfaceMaterial(surfaces.rock,{roughness:.85}),{side:T.DoubleSide})),reveal(glowing.clone()),reveal(surfaceMaterial(surfaces.rock,{roughness:.8})),reveal(glowing.clone())];
  const hub=buildHub(surfaceMaterial(surfaces.rock,{roughness:.85}),towerParts[0],towerParts[1]),hubY=groundAt(HUB_SITE.x,HUB_SITE.y)+1;hub.position.set(HUB_SITE.x,hubY,HUB_SITE.y);scene.add(hub);towerY=hubY;
  {const k=new Kit(),g=new Kit();towerInside(k,g);towerRoom=new T.Group();const rooms=k.mesh(towerParts[2]);rooms.castShadow=false;const fires=g.mesh(towerParts[3]);fires.castShadow=false;fires.receiveShadow=false;towerRoom.add(rooms,fires);towerGuards=towerFolk(towerRoom);towerRoom.visible=false;hub.add(towerRoom);}
  sauronBeam=buildGaze(puffTexture);scene.add(sauronBeam.group);
  eye=eyeSprites();if(film)eye.closed.material.color.setScalar(1.25);for(const part of [eye.open,eye.closed]){part.position.set(HUB_SITE.x,hubY+652,HUB_SITE.y);part.renderOrder=2;scene.add(part);}eyeLight=new T.PointLight('#ff7a22',0,560,1.1);eyeLight.position.set(HUB_SITE.x,hubY+652,HUB_SITE.y+40);scene.add(eyeLight);
  const lava=new T.PointLight('#ff6a2a',5.5,1100,1.15);lava.position.set(HUB_SITE.x,hubY+70,HUB_SITE.y+190);scene.add(lava);
  // Mount Doom: a real cone with a burning crater and a dark sky above Mordor.
  const dy=Math.max(0,groundAt(mountDoom.x,mountDoom.y));
  const doomLight=new T.PointLight('#ff5a1a',4,1100,1.2);doomLight.position.set(mountDoom.x,dy+70,mountDoom.y);scene.add(doomLight);
  particleSources.embers.push(new T.Vector3(mountDoom.x,dy+6,mountDoom.y),new T.Vector3(HUB_SITE.x,hubY+40,HUB_SITE.y+60));smokePoints.push(new T.Vector3(mountDoom.x,dy+8,mountDoom.y),new T.Vector3(HUB_SITE.x,hubY+380,HUB_SITE.y));
  const puff=smokeTexture(),ash=[];for(let i=0;i<24;i++){const a=i/24*6.283,r=330+(i%5)*70,sprite=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#241c1a',transparent:true,opacity:.11,depthWrite:false,fog:false}));sprite.scale.set(520,250,1);sprite.position.set(HUB_SITE.x+Math.cos(a)*r,hubY+340+(i%3)*70,HUB_SITE.y+Math.sin(a)*r*.72);scene.add(sprite);ash.push({sprite,a,r});}ashClouds=ash;
  // The column of smoke over Mount Doom, lit red from below and carried away by the wind.
  const rim=groundAt(mountDoom.x+54,mountDoom.y),glowSprite=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#ff6a1a',transparent:true,opacity:.75,depthWrite:false,blending:T.AdditiveBlending,fog:false}));glowSprite.scale.set(240,170,1);glowSprite.position.set(mountDoom.x,rim+24,mountDoom.y);scene.add(glowSprite);
  plume=Array.from({length:30},(_,i)=>{const sprite=new T.Sprite(new T.SpriteMaterial({map:puff,transparent:true,depthWrite:false,fog:false}));scene.add(sprite);return {sprite,k:i/30,base:rim,seed:i*2.399};});
  // The Black Gate stands exactly on the road from the west, where it crosses the mountains of Mordor.
  {const blackGate=buildBlackGate(surfaceMaterial(surfaces.rock,{roughness:.85}));blackGate.position.set(morannon.x,Math.max(1,groundAt(morannon.x,morannon.y)),morannon.y);blackGate.scale.setScalar(1.7);scene.add(blackGate);
   for(const s of [-1,1]){const fire=new T.PointLight('#ff7a2a',12,620,1.15);fire.position.set(morannon.x+s*90,blackGate.position.y+70,morannon.y+70);scene.add(fire);}
   const armour=new T.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.72});const lord=buildSauron(armour);lord.root.scale.setScalar(1.3);scene.add(lord.root);const presence=new T.PointLight('#ff9a4a',7,260,1.3);presence.position.set(0,92,34);lord.root.add(presence);
   // For twelve minutes of every half hour he leaves the road and works at the ring forge in the lowest hall of Barad-dûr.
   smith=buildSauron(armour);smith.root.scale.setScalar(.42);smith.root.position.set(ringForge.x+17*Math.sin(ringForge.turn),26,ringForge.z+17*Math.cos(ringForge.turn));smith.root.rotation.y=ringForge.turn+Math.PI;smith.root.traverse(n=>{if(n.isMesh)n.castShadow=false;});towerRoom.add(smith.root);
   const march=sauronWay;sauron={...lord,x:march[0].x,y:march[0].y,heading:2.8,phase:0,path:march.slice(1),seg:0,speed:17,route:march};
   const rounds=[[{x:1180,y:990},{x:1120,y:900},{x:1130,y:800},{x:1200,y:760},{x:1225,y:830},{x:1225,y:910}],[{x:1625,y:985},{x:1705,y:900},{x:1722,y:780},{x:1642,y:705},{x:1600,y:820}],[{x:1270,y:1060},{x:1200,y:1010},{x:1225,y:950},{x:1300,y:1000}],[{x:1480,y:990},{x:1530,y:960},{x:1590,y:935},{x:1540,y:985}]];
   rounds.forEach((round,r)=>{for(let i=0;i<7;i++){const from=(i*2)%round.length,route=[...round.slice(from),...round.slice(0,from)],start=route[0];actors.push(addFigure({kind:'patrol',f:{name:'Ork',people:i%3===2?'uruk':'orc',tool:i%3===2?'sword':'pick'},route,pace:21+(i%3)*2,x:start.x+i*7,y:start.y+i*5,heading:0,phase:i,mode:'walk',path:null,until:0}));}});
   // Eight of the Nine ride the roads of all Middle-earth on their black horses, from one place to the next by way of the Dark Tower.
   {const ids=riderSites;for(let i=0;i<8;i++){const r=buildRider(makeFigure);scene.add(r.root);const go=[...riderWay(ids[i%ids.length])].reverse(),from=Math.floor(go.length*((i*.37)%1));riders.push({...r,x:go[from].x,y:go[from].y,heading:0,phase:i*1.7,path:go.slice(from+1),seg:0,speed:44+(i%3)*5,next:(i*3+1)%ids.length,out:true});}}
   // Above them the Witch-king rides his winged beast around the land of shadow.
   fell=buildFellBeast(new T.MeshStandardMaterial({vertexColors:true,roughness:.68,metalness:.12,side:T.DoubleSide}));fell.root.scale.setScalar(.62);fell.a=1;fell.h=470;scene.add(fell.root);
   for(const [x,y,h] of [[-18,16,0],[18,16,0],[-34,20,0],[34,20,0]])actors.push(addFigure({kind:'patrol',f:{name:'Uruk',people:'uruk',tool:'sword'},route:[],pace:0,x:morannon.x+x,y:morannon.y+y,heading:h,phase:0,mode:'rest',path:null,until:0}));
   for(const [x,y] of [[-30,-8],[30,-8]])actors.push(addFigure({kind:'patrol',f:{name:'Uruk',people:'uruk',tool:'sword'},route:[],pace:0,x:hubGate.x+x,y:hubGate.y+y,heading:0,phase:0,mode:'rest',path:null,until:0}));}
  // Ents walk the deep wood and the ring of Isengard, where the trees were felled.
  {const barkSkin=surfaceMaterial(surfaces.bark,{roughness:.92}),circle=(c,r,n,turn)=>{const out=[];for(let i=0;i<n;i++){const a=turn+i/n*6.283;let got=null;for(const extra of [0,24,-24,48,-48,72]){const x=c.x+Math.cos(a)*(r+extra),y=c.y+Math.sin(a)*(r+extra);if(!blocked(x,y)&&groundAt(x,y)>6){got={x,y};break;}}if(got)out.push(got);}return out;};
   const walkers=[['isengard',335,1.28,true],['isengard',355,1,false],['isengard',345,1.1,false],['isengard',370,.96,false],['council',370,1.2,true],['council',400,1,false],['council',350,1.08,false],['council',430,.94,false],['lorien',420,1,false]];
   walkers.forEach(([id,r,height,beard],i)=>{const c=hallCentre(id),route=circle(c,r,14,i*1.55+.4);if(route.length<5)return;const e=buildEnt(barkSkin,{height,seed:i+2,beard,crown:id==='lorien'?['#b4a648','#c4b250','#8f9a4c']:id==='council'?['#2d4a26','#23391f','#3f5a2a']:['#4b6a2c','#3c5a26','#6a6a2c']});scene.add(e.root);route.push(route[0]);ents.push({...e,x:route[0].x,y:route[0].y,heading:0,phase:i,path:route.slice(1),seg:0,speed:7.5+(i%3),route});});}
  // The Balrog lives in the chasm of Moria.
  {const skin=surfaceMaterial(surfaces.rock,{roughness:.72});skin.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float seam=1.-smoothstep(.012,.034,dot(texture2D(map,vMapUv*3.1).rgb,vec3(.3333)));totalEmissiveRadiance+=vec3(1.5,.38,.05)*seam;`);};balrog=buildBalrog(skin,puff);}const moria=districts.get('forge');balrog.root.position.set(58,.4,-62);balrog.root.scale.setScalar(.72);moria.group.add(balrog.root);
  {const air={scouts:['#9aa6ad',.16],library:['#e8efe0',.2],forge:['#6a6660',.14],treasury:['#a8875e',.1],council:['#2c4030',.28],lorien:['#fff4cc',.1],gate:['#c3c7c8',.1],messengers:['#f3e6c0',.08],observatory:['#b8bcae',.2],isengard:['#2b2622',.26]};for(const [id,[color,strength]] of Object.entries(air)){const c=hallCentre(id);for(let i=0;i<9;i++){const a=i*2.399,r=(170+i*30)*RS,x=c.x+Math.cos(a)*r,z=c.y+Math.sin(a)*r,sprite=new T.Sprite(new T.SpriteMaterial({map:puff,color,transparent:true,opacity:strength,depthWrite:false}));sprite.scale.set(460,90,1);sprite.position.set(x,Math.max(4,groundAt(x,z))+24,z);scene.add(sprite);landAir.push({sprite,strength});}}}
  const addParticles=(sources,count,color,size,texture,move)=>{if(!sources.length)return;const positions=new Float32Array(count*3),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));const points=new T.Points(geometry,new T.PointsMaterial({map:texture,color,size,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));points.frustumCulled=false;scene.add(points);particleSets.push({geometry,sources,move,items:Array.from({length:count},(_,i)=>({at:i%sources.length,k:Math.random(),s:Math.random()*6.28}))});};
  addParticles(particleSources.embers,160,'#ff8a3a',7,puff,(o,p,k,s)=>p.set(o.x+Math.cos(s)*40*k,o.y+k*220,o.z+Math.sin(s)*40*k));
  addParticles(particleSources.spray,60,'#dff1f7',10,puff,(o,p,k,s)=>p.set(o.x+Math.cos(s)*22*k,o.y+Math.sin(k*3.14)*22,o.z+Math.sin(s)*22*k));
  addParticles(particleSources.leaves,80,'#ffd968',7,puff,(o,p,k,s)=>p.set(o.x+Math.cos(s+k*5)*46,o.y-k*210,o.z+Math.sin(s+k*5)*46));
  wanderers.forEach((f,i)=>{const at=(i*3)%roadLoop.length,start=f.home?homeOf(f.home):roadLoop[at],side=f.home?(i%2?1:-1)*(28+(i%3)*14):0;let startY=start.y;if(f.home)for(let t=0;t<14&&blocked(start.x+side,startY);t++)startY+=t%2?-12*(t+1):12*(t+1);actors.push(addFigure({kind:'wanderer',f,stop:at,post:i%4,lane:(i%3)*16-16,x:start.x+side,y:startY,heading:0,phase:i,mode:'rest',until:performance.now()+1500+i*1500,path:null}));});
  const count=Math.max(1,smokePoints.length*6),positions=new Float32Array(count*3);if(smokePoints.length)for(let i=0;i<count;i++)smokeParticles.push({at:i%smokePoints.length,k:Math.random()});
  const smokeGeometry=new T.BufferGeometry();smokeGeometry.setAttribute('position',new T.BufferAttribute(positions,3));
  smokeMesh=new T.Points(smokeGeometry,new T.PointsMaterial({map:smokeTexture(),color:'#4a4640',size:26,transparent:true,opacity:.5,depthWrite:false}));smokeMesh.frustumCulled=false;scene.add(smokeMesh);
  const rohanGroup=new T.Group();{let near=roadLoop[0],gap=1e9;for(const way of [...ringPaths,...spokes])for(const q of way){const d=Math.hypot(q.x-rohan.x,q.y-rohan.y);if(d<gap){gap=d;near=q;}}const len=gap||1,x=near.x+(rohan.x-near.x)/len*42,y=near.y+(rohan.y-near.y)/len*42;rohanGroup.position.set(x,Math.max(2,groundAt(x,y)),y);}scene.add(rohanGroup);placeModels(rohanGroup,worldProps).catch(e=>console.error(e));
  // The light and leaf programs are prepared while the loading note still shows, so the first picture does not freeze.
  naurRoom.visible=towerRoom.visible=true;renderer.setRenderTarget(film?.main??null);await Promise.race([renderer.compileAsync(scene,camera).catch(()=>{}),new Promise(done=>setTimeout(done,6000))]);renderer.setRenderTarget(null);naurRoom.visible=towerRoom.visible=false;
  {const centres={mordor:{x:HUB_SITE.x,y:HUB_SITE.y},haven:{x:haven.x,y:haven.y}};for(const d of districts.values())centres[d.id]=d.c;weather=buildWeather(puffTexture,centres);scene.add(weather.group);weatherCentres=centres;}
  {const points=[];for(const id of Object.keys(sitePlaces)){const elven=id==='lorien'||id==='council',way=lanes[id];const put=(x,z,up)=>{if(!onRoad(x,z,24))points.push({x,y:groundAt(x,z)+up,z,cool:elven});};way.forEach((q,i)=>{if(i%3===0&&i>1){const b=way[Math.min(way.length-1,i+1)],a=way[i-1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;for(const s of [-1,1])put(q.x-dy/len*s*30,q.y+dx/len*s*30,9);}});const c=hallCentre(id);for(let i=0;i<8;i++){const a=i/8*6.283,r=200*RS;if(Math.sin(a)>.5)continue;put(c.x+Math.cos(a)*r,c.y+Math.sin(a)*r,14);}}nightLamps=buildNightLamps(puffTexture,points);scene.add(nightLamps,nightLamps.userData.poles);}
  // What hangs in the air darkens with the day; the glowing things and the Eye keep their own light.
  scene.traverse(n=>{if((n.isSprite||n.isPoints)&&n.material.blending===T.NormalBlending&&n.material.color&&n!==eye.closed&&!weather.group.children.includes(n))dimmed.push({m:n.material,base:n.material.color.clone()});});
  for(const d of districts.values()){d.group.updateMatrixWorld(true);const box=new T.Box3();for(const part of [d.outside,d.roof,...d.walls.map(w=>w.mesh)])box.expandByObject(part);gazeWalls.push(box);}gazeWalls.push(new T.Box3().setFromObject(havenGroup));
  loading.remove();ready=true;renderCrew();renderTrays();
  // The 3D world works without them; simple figures simply stay until these have arrived.
  loadRigs().then(all=>{rigMap=all;}).catch(e=>console.error(e));
 }
 const ease=(from,to,k)=>from+(to-from)*k;
 const smooth=(a,b,x)=>{const k=Math.max(0,Math.min(1,(x-a)/(b-a)));return k*k*(3-2*k);};
 const tilt=d=>.58+smooth(300,2700,d)*.3+smooth(950,450,d)*.24;
 const viewProjection=new T.Matrix4(),viewFrustum=new T.Frustum(),figureBounds=new T.Sphere(new T.Vector3(),46),projected=new T.Vector3(),beamFrom=new T.Vector3(),beamTo=new T.Vector3();
 const screenOf=(x,y,z)=>{projected.set(x,y,z).project(camera);return projected.z<1?{x:(projected.x+1)/2*W,y:(1-projected.y)/2*H}:null;};

 const CITADEL_TOP=267;let doorSprite=null,doorFill=null,doomPortal=[],DOOM_FLOOR=380,peakOn=false,citadelOn=false;const doomParts=[],ents=[],riders=[],dimmed=[],gazeWalls=[];let dome=null,weather=null,weatherCentres=null,nightLamps=null,landBake=null,timePreview=null,shownHour=null,skyLight=null,skyPhase=null,kinds={},kindsAt=0,zoneHere='',flash=0,gazeAt=null,fell=null,landHole=null,shellRock=null,naurRoom=null,mereGroup=null,towerParts=[],towerRoom=null,towerGuards=[],towerY=0,doomOpen=0,towerOpen=0;
 let mouse=null,hoverFigure=null,shadowSpan=3200,eyeLight=null,eyeFloor=0,roofLeaves=[],ashClouds=[],plume=[],sauronBeam=null,landTime=null;
 let skyStamp=0,rigMap=null,focusY=0,lastFrame=performance.now(),lastReport=performance.now(),frames=0,frameMark=performance.now();
 function frame(now){
  requestAnimationFrame(frame);
  if(!ready)return;
  frames++;if(now-frameMark>1000){host.dataset.fps=String(Math.round(frames*1000/(now-frameMark)));frames=0;frameMark=now;}
  const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  // The sharpness settles once and for all: changing it back and forth would make the whole picture jump.
  frameTotal+=dt;frameCount++;if(frameTotal>2){slowWindows=frameTotal/frameCount>.03?slowWindows+1:0;frameTotal=0;frameCount=0;if(slowWindows>=3&&renderScale>1){slowWindows=0;renderScale=Math.max(1,renderScale-.15);resize();}}
  const k=reduced()?1:1-Math.pow(.012,dt);cam.x=ease(cam.x,goal.x,k);cam.y=ease(cam.y,goal.y,k);cam.d=ease(cam.d,goal.d,k);cam.yaw=ease(cam.yaw,goal.yaw,k);cam.lift=ease(cam.lift,goal.lift,k);
  if(inner){const u=inner.userData,p=Math.max(.04,Math.min(1.15,u.pitch+cam.lift)),f=u.focus,flat=cam.d*Math.cos(p);camera.position.set(f.x+Math.sin(cam.yaw)*flat,f.y+cam.d*Math.sin(p),f.z+Math.cos(cam.yaw)*flat);camera.lookAt(f.x,f.y,f.z);camera.fov=58;camera.near=Math.max(4,cam.d*.02);camera.updateProjectionMatrix();camera.updateMatrixWorld();if(!reduced())u.step(dt,now/1000);tip.hidden=true;if(film)film.render(scene,camera);else renderer.render(scene,camera);return;}
  // The mountain and the tower open with the zoom, without a break: the nearer the camera, the further the cut has sunk.
  doomOpen=smooth(420,260,Math.hypot(cam.x-mountDoom.x,cam.y-mountDoom.y))*(selected==='doom'?smooth(300,220,cam.d):smooth(640,430,cam.d));if(landHole){const cut=naurRoom?.userData.cut??DOOM_FLOOR+14;landHole.value.set(mountDoom.x,mountDoom.y,doomOpen>.001?262:0,ease(DOOM_FLOOR+320,cut,doomOpen));if(naurRoom){naurRoom.userData.rim.visible=doomOpen>.97;naurRoom.userData.cleft.visible=doomOpen>.5;}}towerOpen=smooth(340,190,Math.hypot(cam.x-HUB_SITE.x,cam.y-HUB_SITE.y))*smooth(1200,800,cam.d);
  const pitch=Math.max(.3,tilt(cam.d)+cam.lift);cam.pitch=pitch;peakOn=selected==='orthanc'&&Math.hypot(cam.x-hallCentre('isengard').x,cam.y-hallCentre('isengard').y)<260;citadelOn=selected==='citadel'&&Math.hypot(cam.x-hallCentre('gate').x,cam.y-hallCentre('gate').y)<320;const doorOn=selected==='doom'&&doomOpen<.02&&Math.hypot(cam.x-doomDoor.x,cam.y-doomDoor.z)<320;focusY=ease(focusY,doorOn?DOOM_FLOOR+40:citadelOn?districts.get('gate').y+CITADEL_TOP*RS:peakOn?groundAt(hallCentre('isengard').x,hallCentre('isengard').y)+358*RS:selected===HUB&&cam.d>1200&&Math.hypot(cam.x-HUB_SITE.x,cam.y-HUB_SITE.y)<320?groundAt(HUB_SITE.x,HUB_SITE.y)+340:Math.max(0,Math.min(460,ease(ease(groundAt(cam.x,cam.y),DOOM_FLOOR-6,doomOpen),towerY+150,towerOpen))),k);const groundY=focusY,flat=cam.d*Math.cos(pitch),eyeX=cam.x+Math.sin(cam.yaw)*flat,eyeZ=cam.y+Math.cos(cam.yaw)*flat;
  eyeFloor=ease(eyeFloor,ease(groundAt(eyeX,eyeZ)+50,DOOM_FLOOR+60,doomOpen*smooth(250,210,Math.hypot(eyeX-mountDoom.x,eyeZ-mountDoom.y))),k);camera.position.set(eyeX,Math.max(groundY+cam.d*Math.sin(pitch),eyeFloor),eyeZ);
  // Close to the mountain the view passes through its skin into the cavern and turns around the tongue of rock.
  {for(const part of doomPortal)part.visible=doomOpen<.5;const cave=doomOpen*doomOpen*(3-2*doomOpen),mx=mountDoom.x+Math.sin(DOOR_TURN)*(DOOR_R-48),mz=mountDoom.y+Math.cos(DOOR_TURN)*(DOOR_R-48);let lookX=cam.x,lookY=groundY,lookZ=cam.y;
   if(cave>0&&goal.d<cam.d-1){const pull=Math.min(1,dt*2.2)*cave;goal.x+=(mx-goal.x)*pull;goal.y+=(mz-goal.y)*pull;}
   camera.lookAt(lookX,lookY,lookZ);camera.near=ease(Math.max(10,cam.d*.12),3,cave);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
  applySky(now,dt);if(doorSprite){const n=skyLight?.night??0;doorSprite.material.opacity=.34+.42*n;doorFill.intensity=720+1700*n;}film?.setNight?.((skyLight?.night??0)*(1-.85*smooth(620,300,Math.hypot(cam.x-doomDoor.x,cam.y-doomDoor.z))*smooth(900,500,cam.d)));
  // The shadow area follows the view, so shadows stay sharp up close.
  shadowSpan=cam.d>shadowSpan*1.25?Math.min(3200,shadowSpan*2):cam.d<shadowSpan*.5?Math.max(650,shadowSpan/2):shadowSpan;const span=shadowSpan,texel=span*2/sun.shadow.mapSize.x,sx=Math.round(cam.x/texel/4)*texel*4,sz=Math.round(cam.y/texel/4)*texel*4;sun.position.set(sx+skyLight.dir.x*span*2,skyLight.dir.y*span*2,sz+skyLight.dir.z*span*2);sun.target.position.set(sx,0,sz);if(sun.shadow.camera.right!==span){Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:10,far:span*4+800});sun.shadow.camera.updateProjectionMatrix();}
  if(!reduced()){for(const a of actors)updateActor(a,now,dt);for(let i=couriers.length-1;i>=0;i--){if(stepAlong(couriers[i],dt)){const done=couriers.splice(i,1)[0];done.rich?.dispose();scene.remove(done.mesh);if(done.next)sendCourier(hubGate,[...wayToHub(done.next.to)].reverse(),done.next.to,done.next.title,null,done.next.piece);else if(done.piece)receive(done.site);}}}
  if(!preview&&now-lastReport>32000){lastReport=now;for(const flow of reportFlows(view))dispatch(flow);}
  const t=reduced()?0:now;
  let dressing=1;
  viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);viewFrustum.setFromProjectionMatrix(viewProjection);
  for(const a of [...actors,...couriers]){
   if(a.visit){const v=districts.get(a.visit.site),gap=Math.hypot(a.x-v.c.x,a.y-v.c.y);a.inHall=gap<(v.doorZ??104)*RS+6;if(a.visit.leaving&&!a.inHall&&gap>(v.doorZ??104)*RS+24){a.visit=null;a.inHall=false;}}
   const inside=a.kind==='worker'||a.inHall;a.mesh.position.set(a.x,(inside?districts.get(a.kind==='worker'?a.site:a.visit.site).y:walkHeight(a.x,a.y))+.3,a.y);a.face=turnTo(a.face??a.heading,a.heading,dt*7);a.mesh.rotation.y=a.face;
   const walking=a.mode==='walk',working=a.mode==='work';
   a.mesh.userData.pose(walking?a.phase:0,walking?Math.sin(a.phase)*.6:working?-1.15+Math.sin(t*.009+(a.index??0)*2)*.95:0,(a.carrying||a.kind==='courier')&&walking);
   // Near the camera the simple figure gives way to a fully animated one.
   // Whoever is out of sight costs nothing, and only those near the camera are fully animated.
   figureBounds.center.copy(a.mesh.position);const seen=viewFrustum.intersectsSphere(figureBounds)&&(a.kind==='worker'?districts.get(a.site).open>0:!a.inHall||districts.get(a.visit.site).open>0);a.mesh.visible=seen;
   const near=seen&&rigMap&&Math.hypot(camera.position.x-a.x,camera.position.y-a.mesh.position.y,camera.position.z-a.y)<900;
   if(near&&!a.rich&&dressing>0){dressing--;a.rich=dressFigure(rigMap,a.f.people,a.f.tool,a.f.name);a.mesh.add(a.rich.group);}
   if(a.rich){const show=Boolean(near);a.rich.group.visible=show;a.mesh.userData.body.visible=!show;if(show)a.rich.play(a.mode,a.speed??0,reduced()?0:dt,(a.carrying||a.kind==='courier')&&walking,a.meet?.bond.tone);}
  }
  if(now-lastLife>500){lastLife=now;lifeTick(now);}
  if(pinned&&following){goal.x=pinned.x;goal.y=pinned.y;}
  renderSpeech(now);
  renderWork(now);
  // Every hall is a closed building. Only the one being looked at opens, and only when the camera goes in.
  let closed=1;
  for(const d of districts.values()){
   const open=smooth(HALL.half*RS*2.5,HALL.half*RS*1.5,Math.hypot(cam.x-d.c.x,cam.y-d.c.y))*(d.id==='treasury'?smooth(1500,1100,cam.d):d.id==='gate'?smooth(1000,820,cam.d):smooth(1300,850,cam.d))*(peakOn&&d.id==='isengard'||citadelOn&&d.id==='gate'?0:1),toX=camera.position.x-d.c.x,toZ=camera.position.z-d.c.y,len=Math.hypot(toX,toZ)||1;
   d.open=open;closed=Math.min(closed,1-open);
   const roofGone=Math.max(open,d.roofFade??0);d.roof.visible=roofGone<.99;d.roof.castShadow=roofGone<.6;setCut(d.roof.material,0,1,0,roofGone);if(d.portalGlow)setCut(d.portalGlow,0,1,0,roofGone);setCut(d.outside.material,0,1,0,d.landFade??0);d.interior.visible=open>0;for(const jewel of d.jewels)jewel.step(open,now/1000);
   setCut(d.interior.material,toX/len,toZ/len,open);keepWhole(d.interior.material,46);if(d.glow){setCut(d.glow.material,toX/len,toZ/len,open);keepWhole(d.glow.material,46);}if(d.dragonHeat){setCut(d.dragonHeat,toX/len,toZ/len,open);keepWhole(d.dragonHeat,46);}
   for(const w of d.walls){setCut(w.mesh.material,toX/len,toZ/len,open,d.roofFade??0);w.mesh.castShadow=open<.5||(toX*w.normal.x+toZ*w.normal.z)<=0;}
  }
  closed=Math.min(closed,1-doomOpen,1-towerOpen);
  // Mount Doom: the skin of the land melts from the top down, the near half of the cone with it.
  {const near=Math.hypot(cam.x-mountDoom.x,cam.y-mountDoom.y)<2600&&cam.d<4600;naurRoom.visible=near;naurStep(now,dt);naurRoom.userData.light.intensity=near?210+doomOpen*60+naurRoom.userData.stage.flare*2200:0;naurRoom.userData.over.intensity=doomOpen*1500;if(near&&!reduced())naurRoom.userData.step(dt,now/1000);}
  denethorStep(now,dt);
  // The Dark Tower: storey after storey comes into view, down to the gate hall.
  {const on=towerOpen>.002,sill=on?ease(430,32,towerOpen):1e6,x=camera.position.x-HUB_SITE.x,z=camera.position.z-HUB_SITE.y,len=Math.hypot(x,z)||1;for(const m of towerParts)setReveal(m,x/len,z/len,sill);towerRoom.visible=on;if(on)for(const f of towerGuards)f.visible=f.position.x*x/len+f.position.z*z/len<0||f.position.y<sill-40;}
  // Inside, the room's own fires and lamps take over from the daylight.
  {let nearest=null,best=650;for(const d of [...districts.values(),{id:'doom',c:{x:mountDoom.x,y:mountDoom.y},y:DOOM_FLOOR},{id:'tower',c:{x:HUB_SITE.x,y:HUB_SITE.y},y:towerY}]){const q=Math.hypot(cam.x-d.c.x,cam.y-d.c.y);if(q<best){best=q;nearest=d;}}
   const inside=nearest?1-closed:0,plan=nearest?roomLight[nearest.id]:null,target=plan?1+(plan.day-1)*inside:1;daylight=ease(daylight,target,Math.min(1,dt*2));
   const covered=weather?.zones.get(zoneHere)?.cover??0;if(!reduced()&&WEATHER[kinds[zoneHere]]?.lightning&&Math.random()<dt*.11)flash=1;flash=Math.max(0,flash-dt*3.4);
   sun.color.setRGB(...skyLight.color);sun.intensity=skyLight.strength*(1-covered*.3)*daylight;sky.intensity=(skyLight.ambient+flash*.9)*daylight;scene.environmentIntensity=skyLight.env*(.4+.6*daylight);
   if(nearest!==litRoom&&plan){litRoom=nearest;plan.lamps.forEach(([x,y,z,color],i)=>{if(!roomLamps[i])return;roomLamps[i].position.set(nearest.c.x+x*RS,nearest.y+y*RS,nearest.c.y+z*RS);roomLamps[i].color.set(color);});}
   roomLamps.forEach((lamp,i)=>{const strength=plan&&litRoom===nearest?plan.lamps[i]?.[4]??0:0,flicker=reduced()?1:1+Math.sin(now*.011+i*2)*.07+Math.sin(now*.027+i)*.05;lamp.intensity=strength*1.32*inside*flicker;});}
  for(const leaves of roofLeaves)leaves.material.alphaTest=.34+leaves.d.open*.64;
  // Close-up life appears as the camera comes near; far away only the great shapes remain.
  for(const d of districts.values()){const away=Math.hypot(camera.position.x-d.c.x,camera.position.z-d.c.y);d.showClose=d.showClose?away<1320&&cam.d<1120:away<1180&&cam.d<1000;const near=d.showClose;d.closeMesh.visible=true;const grass=near?smooth(900,520,Math.max(cam.d,away*.7)):0;d.blades.visible=grass>.01;d.blades.count=Math.round(2600*grass);d.showProps=d.showProps||(near&&Math.hypot(cam.x-d.c.x,cam.y-d.c.y)<1100);const inPlace=d.showProps;d.props.visible=inPlace;if(inPlace&&!d.propsAsked&&d.id&&regionProps[d.id]){d.propsAsked=true;placeModels(d.props,regionProps[d.id],d.settle).catch(e=>console.error(e));}}
  // Up close, a neighbour's tall landmark must not stand between the camera and what is being looked at.
  {const ax=cam.x,ay=cam.y,bx=camera.position.x-ax,by=camera.position.z-ay,len=bx*bx+by*by||1;
   for(const d of districts.values()){const u=Math.max(0,Math.min(1,((d.c.x-ax)*bx+(d.c.y-ay)*by)/len)),gap=Math.hypot(d.c.x-(ax+bx*u),d.c.y-(ay+by*u)),own=Math.hypot(d.c.x-ax,d.c.y-ay)<HALL.half*RS*2;const fade=Math.min(1,dt*2.5);d.landFade=ease(d.landFade??0,cam.d>1000||own||u<.02||gap>300?0:1,fade);d.roofFade=ease(d.roofFade??0,!own&&u>.02&&gap<240&&cam.d<1000?1:0,fade);d.outside.visible=d.landFade<.99;const up=d.roofFade<.99||d.open>0;if(d.glow)d.glow.visible=up;for(const w of d.walls)w.mesh.visible=up&&(d.id!=='messengers'||d.open>0||(d.roofFade??0)>.01);if(!up)d.props.visible=false;}}
  {const k=Math.max(0,Math.min(1,(cam.d-500)/600));for(const q of landAir){q.sprite.visible=k>0;q.sprite.material.opacity=q.strength*k;}}
  if(smith){const forging=Date.now()/60000%30<12;sauron.root.visible=!forging;smith.root.visible=forging;if(forging&&towerRoom.visible)smith.hammer(now*.0032);}
  if(sauron){if(!reduced()&&stepAlong(sauron,dt)){sauron.path=sauron.route.slice(1);sauron.seg=0;}sauron.root.position.set(sauron.x,walkHeight(sauron.x,sauron.y),sauron.y);sauron.face=turnTo(sauron.face??sauron.heading,sauron.heading,dt*2.4);sauron.root.rotation.y=sauron.face;sauron.animate(sauron.phase);}
  if(balrog){const moria=districts.get('forge');balrog.stage.visible=closed<.995&&Math.hypot(cam.x-moria.c.x,cam.y-moria.c.y)<950;if(balrog.stage.visible&&!reduced())balrog.animate(now);}
  viewClear.a.value.set(cam.x,cam.y);viewClear.b.value.set(camera.position.x,camera.position.z);viewClear.r.value=220*smooth(1620,1180,cam.d);
  if(landTime&&!reduced()){landTime.value=now/1000;forestTime.value=now/1000;}
  {const d=districts.get('treasury');if(d?.dragon&&d.interior.visible&&!reduced()){const b=Math.sin(now*.0009);{const q=d.dragon.userData.size;d.dragon.scale.set(q*(1+b*.014),q*(1+b*.022),q*(1+b*.014));}if(d.dragonHeat?.color)d.dragonHeat.color.setScalar(.8+.2*(b+1)*.5);}}
  if(!reduced()){sea.material.uniforms.time.value=now/1000;animateHaven(havenGroup,now/1000);flowTime.value=now/1000;flameClock.value=now/1000;}
  {const seen=cam.d<1700&&Math.hypot(cam.x-mere.x,cam.y-mere.y)<1500;mereGroup.visible=seen;if(seen&&!reduced())mereGroup.userData.step(now/1000);}
  for(const e of ents){if(!reduced()&&stepAlong(e,dt)){e.path=e.route.slice(1);e.seg=0;}e.root.position.set(e.x,groundAt(e.x,e.y)+1,e.y);e.root.rotation.y=e.heading;e.step(e.phase,true);}
  if(fell){if(!reduced())fell.a+=dt*.052;const x=HUB_SITE.x+Math.cos(fell.a)*790,y=HUB_SITE.y+Math.sin(fell.a)*590;fell.h=ease(fell.h,Math.max(430,groundAt(x,y)+150)+Math.sin(fell.a*5)*22,Math.min(1,dt*.6));fell.root.position.set(x,fell.h,y);fell.root.rotation.set(0,Math.atan2(-Math.sin(fell.a)*790,Math.cos(fell.a)*590),-.2,'YXZ');if(!reduced())fell.step(now/1000);}
  for(const p of plume){if(!reduced())p.k=(p.k+dt*.016)%1;const q=p.k,w=70+q*420;p.sprite.position.set(mountDoom.x+Math.sin(p.seed)*(14+q*60)+q*q*520,p.base+16+q*680,mountDoom.y+Math.cos(p.seed)*(14+q*60)-q*q*230);p.sprite.scale.set(w,w*.82,1);p.sprite.material.color.setRGB(.5*(1-q)+.11,.2*(1-q)+.09,.09*(1-q)+.085);p.sprite.material.opacity=Math.min(1,q*14)*(1-q)*.62*(1-doomOpen*.8);}
  for(const r of riders){if(!reduced()){if(stepAlong(r,dt)){const ids=riderSites;if(r.out){r.path=[...riderWay(ids[r.next%ids.length])];r.path=r.path.length?r.path:[hubGate];r.out=false;}else{r.next=(r.next+3)%ids.length;r.path=[...riderWay(ids[r.next])].reverse();r.out=true;}r.seg=0;}r.phase+=dt*6.2;}r.root.position.set(r.x,walkHeight(r.x,r.y)+.3,r.y);r.face=turnTo(r.face??r.heading,r.heading,dt*3);r.root.rotation.y=r.face;figureBounds.center.copy(r.root.position);r.root.visible=viewFrustum.intersectsSphere(figureBounds);if(r.root.visible)r.step(r.phase,r.speed);}
  for(const c of ashClouds){c.a+=dt*.012;c.sprite.position.x=HUB_SITE.x+Math.cos(c.a)*c.r;c.sprite.position.z=HUB_SITE.y+Math.sin(c.a)*c.r*.72;}
  if(!reduced())for(const set of particleSets){const p=set.geometry.attributes.position,v=new T.Vector3();set.items.forEach((it,i)=>{it.k=(it.k+dt*.14)%1;set.move(set.sources[it.at],v,it.k,it.s);p.setXYZ(i,v.x,v.y,v.z);});p.needsUpdate=true;}
  // The eye.
  const open=Boolean(power?.enabled||preview);eye.open.visible=open;eye.closed.visible=!open;eyeLight.intensity=open?800:0;
  // While Numaron runs, the eye's gaze falls on what it watches: a carrier, the chosen place, or a slow sweep of the land.
  if(open){const seen=selected&&sitePlaces[selected]?hallCentre(selected):couriers[0]??{x:HUB_SITE.x+Math.cos(now*.00012)*760,y:HUB_SITE.y+Math.sin(now*.00012)*520};beamFrom.copy(eye.open.position);gazeAt??={x:seen.x,y:seen.y};{const q=Math.min(1,dt*1.5);gazeAt.x=ease(gazeAt.x,seen.x,q);gazeAt.y=ease(gazeAt.y,seen.y,q);}beamTo.set(gazeAt.x,Math.max(2,groundAt(gazeAt.x,gazeAt.y)),gazeAt.y);gazeStop(beamFrom,beamTo);}sauronBeam.aim(beamFrom,beamTo,now/1000,open);
  if(open){const pulse=1+Math.sin(t*.005)*.015;eye.open.scale.set(215*pulse,215*pulse,1);eye.open.quaternion.copy(camera.quaternion);eye.fire.uniforms.time.value=t*.001;const look=selected&&sitePlaces[selected]?sitePlaces[selected]:couriers[0]??pointer;const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0);let off=0;if(look){const dx=look.x-HUB_SITE.x,dy=look.y-HUB_SITE.y,d=Math.hypot(dx,dy)||1;off=(dx*right.x+dy*right.z)/d*Math.min(1,d/700)*.1;}eye.fire.uniforms.look.value=off;}
  if(smokeMesh&&!reduced()&&smokeParticles.length){const p=smokeMesh.geometry.attributes.position;smokeParticles.forEach((s,i)=>{s.k=(s.k+dt*.09)%1;const o=smokePoints[s.at];p.setXYZ(i,o.x+Math.sin(s.k*7+i)*16*s.k,o.y+s.k*170,o.z+Math.cos(s.k*5+i)*10*s.k);});p.needsUpdate=true;}
  mirrorWater(dt);
  if(film)film.render(scene,camera);else renderer.render(scene,camera);
  // Names and what is done where appear only under the pointer or from the legend.
  renderTip();
 }
// The shaft goes out from the Eye and ends at the first thing in its way: the land, or any building that stands there.
 // A small mirror image of the world, drawn every third frame and only near the ground; if the machine struggles it switches itself off for good.
 const mirror={target:new T.WebGLRenderTarget(640,360,{type:T.HalfFloatType}),camera:new T.PerspectiveCamera(),plane:new T.Plane(),clip:new T.Vector4(),q:new T.Vector4(),look:new T.Vector3(),frame:0,slow:0,off:false};
 function mirrorWater(dt){
  if(!sea)return;const u=sea.material.uniforms;
  if(!document.hidden&&dt<.5)mirror.slow=Math.max(0,mirror.slow+(dt>1/22?dt:-dt));if(mirror.slow>5)mirror.off=true;
  const want=!inner&&!mirror.off&&!reduced()&&cam.d<2200;u.reflectOn.value=ease(u.reflectOn.value,want?1:0,Math.min(1,dt*2));
  if(!want||mirror.frame++%3)return;
  const c=mirror.camera,e=c.projectionMatrix.elements,level=sea.position.y;u.reflectMap.value=mirror.target.texture;renderer.getDrawingBufferSize(u.viewSize.value);
  camera.getWorldDirection(mirror.look).add(camera.position);c.position.set(camera.position.x,2*level-camera.position.y,camera.position.z);c.up.set(0,1,0);c.lookAt(mirror.look.x,2*level-mirror.look.y,mirror.look.z);c.updateMatrixWorld();c.matrixWorldInverse.copy(c.matrixWorld).invert();c.projectionMatrix.copy(camera.projectionMatrix);c.layers.mask=camera.layers.mask;
  // The near plane is tilted onto the water, so nothing below it shows up in the mirror.
  mirror.plane.set(mirror.look.set(0,1,0),-level).applyMatrix4(c.matrixWorldInverse);mirror.clip.set(mirror.plane.normal.x,mirror.plane.normal.y,mirror.plane.normal.z,mirror.plane.constant);
  mirror.q.set((Math.sign(mirror.clip.x)+e[8])/e[0],(Math.sign(mirror.clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);mirror.clip.multiplyScalar(2/mirror.clip.dot(mirror.q));e[2]=mirror.clip.x;e[6]=mirror.clip.y;e[10]=mirror.clip.z+1-.003;e[14]=mirror.clip.w;
  const shadows=renderer.shadowMap.autoUpdate,hide=[sea,weather?.group].filter(Boolean);renderer.shadowMap.autoUpdate=false;for(const n of hide)n.visible=false;renderer.setRenderTarget(mirror.target);renderer.clear();renderer.render(scene,c);renderer.setRenderTarget(null);for(const n of hide)n.visible=true;renderer.shadowMap.autoUpdate=shadows;
 }
 const gazeRay=new T.Ray(),gazeHit=new T.Vector3();
 function gazeStop(from,to){
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,reach=Math.hypot(dx,dy,dz),steps=Math.ceil(reach/10);let end=reach;
  gazeRay.origin.copy(from);gazeRay.direction.set(dx/reach,dy/reach,dz/reach);
  for(const box of gazeWalls){if(gazeRay.intersectBox(box,gazeHit)){const d=gazeHit.distanceTo(from);if(d>4&&d<end)end=d;}}
  for(let i=4;i<=steps;i++){const t=i/steps;if(t*reach>end)break;if(from.y+dy*t<=groundAt(from.x+dx*t,from.z+dz*t)+1){let lo=(i-1)/steps,hi=t;for(let n=0;n<6;n++){const m=(lo+hi)/2;if(from.y+dy*m<=groundAt(from.x+dx*m,from.z+dz*m)+1)hi=m;else lo=m;}end=hi*reach;break;}}
  to.set(from.x+dx/reach*end,from.y+dy/reach*end,from.z+dz/reach*end);
 }
 // Sun, moon, sky and weather. The real clock in Zürich decides; a chosen moment of the day is reached with a quick slide.
 function applySky(now,dt){
  const base=new Date(),real=zurichClock(base),target=timePreview??real.hour;
  shownHour??=target;let gap=target-shownHour;if(gap>12)gap-=24;if(gap<-12)gap+=24;const moving=Math.abs(gap)>.004;
  if(moving)shownHour=(shownHour+Math.sign(gap)*Math.min(Math.abs(gap),dt*Math.max(1.5,Math.abs(gap)*2.2))+24)%24;
  if(!skyLight||moving||now-skyStamp>4000){skyStamp=now;const date=atZurichHour(shownHour,base),s=sunOverZurich(date);skyLight=lightAt(s);skyPhase=phaseOf(s,shownHour);
   const L=skyLight;dome.uniforms.sunDir.value.set(L.sunOnly.x,L.sunOnly.y,L.sunOnly.z);dome.uniforms.moonDir.value.set(L.moonDir.x,L.moonDir.y,L.moonDir.z);dome.uniforms.zenith.value.setRGB(...L.zenith);dome.uniforms.horizon.value.setRGB(...L.horizon);dome.uniforms.night.value=L.night;dome.uniforms.golden.value=L.golden;
   scene.fog.color.setRGB(...L.fog);worldDay.value=L.day;for(const l of homely)l.intensity=L.night*1500;dawnGlow.intensity=(shownHour<12.5?L.golden:0)*2800;sea?.material.uniforms.sunDir.value.set(L.dir.x,L.dir.y,L.dir.z);film?.setNight?.(L.night);
   if(landBake)landBake.value=Math.max(0,Math.min(1,((L.dir.x*SUN.x+L.dir.y*SUN.y+L.dir.z*SUN.z)/Math.hypot(SUN.x,SUN.y,SUN.z)-.86)/.12))*L.day;
   for(const q of dimmed)q.m.color.copy(q.base).multiplyScalar(.14+.86*L.day);
   if(nightLamps){const v=Math.max(0,1-L.day*1.6);nightLamps.material.uniforms.level.value=v;nightLamps.visible=v>.01;}
   document.documentElement.dataset.worldPhase=skyPhase;
   clockTime.textContent=timePreview===null?real.label:`${String(Math.floor(shownHour)).padStart(2,'0')}:${String(Math.floor((shownHour%1)*60)).padStart(2,'0')}`;clockPhase.textContent=phaseLabel(skyPhase);clock.dataset.preview=String(timePreview!==null);liveButton.disabled=timePreview===null;for(const b of phaseChips.children)b.dataset.active=String(b.dataset.phase===skyPhase);if(timePreview===null)hourSlider.value=String(real.hour);
  }
  dome.mesh.position.copy(camera.position);
  if(!weather)return;
  if(now-kindsAt>20000||!kindsAt){kindsAt=now;for(const id of weather.zones.keys())kinds[id]=weatherIn(id,base);}
  {let best=1e12;for(const [id,c] of Object.entries(weatherCentres)){const q=(cam.x-c.x)**2+(cam.y-c.y)**2;if(q<best){best=q;zoneHere=id;}}}
  const here=weather.zones.get(zoneHere);clockWeather.textContent=`${ZONES[zoneHere]?.name??''} · ${WEATHER[kinds[zoneHere]]?.label??''}`;
  dome.uniforms.cover.value=here?.cover??0;dome.uniforms.time.value=now/1000;
  weather.step(dt,now/1000,cam,focusY,skyLight,inner||doomOpen>.4||towerOpen>.4||[...districts.values()].some(d=>d.open>.4),kinds,zoneHere);
 }
 function renderTip(){
  const id=listHover??hovered,person=listHover?null:hoverFigure;
  for(const [key,row] of legendRows)key===id?row.b.setAttribute('data-hover','true'):row.b.removeAttribute('data-hover');
  if(!(id||person)||(!listHover&&!mouse)){tip.hidden=true;return;}
  const key=person?`person|${person.f.name}|${person.note??''}|${person.title??''}|${person.kind==='wanderer'?lifeText(person):''}`:`${id}|${preview}|${power?.enabled}|${view?1:0}`;
  if(tip.dataset.key!==key){tip.dataset.key=key;
   if(person){const courier=person.kind==='courier',worker=person.kind==='worker';tipKicker.textContent=courier?'Unterwegs mit einer Übergabe':worker?stations.find(s=>s.id===person.site).district:'Bewohner von Mittelerde';tipTitle.textContent=person.f.name??'Bote';tipText.textContent=courier?person.title:worker?person.note||`${person.f.action}: ruht, keine echte Aufgabe`:person.kind==='wanderer'?`${lifeText(person)} Anklicken für mehr.`:'Gehört zur Szenerie und zeigt keine Arbeit an.';tipState.textContent=worker&&person.busy?'in Arbeit':'';tip.dataset.state=worker&&person.busy||courier?'working':'idle';}
   else if(id===HUB){tipKicker.textContent='Der Zusammenlauf';tipTitle.textContent='Das Auge · Barad-dûr';tipText.textContent='Hier laufen alle Straßen und jede Übergabe zusammen.';tipState.textContent=!power?'Zustand wird geprüft':preview&&!power.enabled?'Probelauf · Numaron aus':power.enabled?'Auge offen · Numaron an':'Auge zu · Numaron aus';tip.dataset.state=power?.enabled||preview?'working':'idle';}
   else if(scenes[id]){tipKicker.textContent=scenes[id].kicker;tipTitle.textContent=scenes[id].title;tipText.textContent='Ein Ort zum Ansehen, hier läuft keine Arbeit.';tipState.textContent='Klicken zum Hingehen';tip.dataset.state='idle';}
   else{const s=stations.find(x=>x.id===id),v=view?.stations.find(x=>x.id===id);tipKicker.textContent=s.district;tipTitle.textContent=s.title;tipText.textContent=s.about;tipState.textContent=preview?'Probelauf':v?`${v.state.label}${v.counts.waiting?` · ${v.counts.waiting} wartend`:''}${v.counts.trouble?` · ${v.counts.trouble} Hindernisse`:''}`:'';tip.dataset.state=preview?'working':v?.state.code??'idle';}
  }
  tip.hidden=false;const w=tip.offsetWidth,h=tip.offsetHeight;let x,y;
  if(listHover){const row=legendRows.get(listHover).b.getBoundingClientRect(),s=stage.getBoundingClientRect();x=row.left-s.left-w-12;y=row.top-s.top;}else{x=mouse.x+18;y=mouse.y+18;}
  tip.style.transform=`translate3d(${Math.round(Math.max(8,Math.min(W-w-8,x)))}px,${Math.round(Math.max(8,Math.min(H-h-8,y)))}px,0)`;
 }
 // Over everyone at work: who it is, what they are at and how far they have come. Real tasks report no percentage, so none is invented for them.
 function tagFor(i){if(workTags[i])return workTags[i];const box=el('div',undefined,'me-work'),name=el('b',''),bar=el('i',undefined,'me-bar'),fill=el('u');bar.append(fill);box.append(name,bar);workLayer.append(box);return workTags[i]={box,name,bar,fill,text:''};}
 const stageOf=a=>a?a.stage===2?a.f.action:STAGES[a.stage]??'wartet auf Material':'wartet auf Material';
 function renderWork(now){
  let used=0;
  if(!inner)for(const a of actors){
   if(a.kind!=='worker'||!a.busy||!a.mesh.visible||used>=16||districts.get(a.site).open<.6)continue;
   const q=screenOf(a.x,a.mesh.position.y+(peoples[a.f.people]?.h??1)*40,a.y);if(!q||q.x<0||q.y<0||q.x>W||q.y>H)continue;
   const t=tagFor(used++),text=`${a.f.name}: ${stageOf(a)}`;
   if(t.text!==text){t.text=text;t.name.textContent=text;}
   t.bar.dataset.open=String(Boolean(a.real));t.fill.style.width=a.real?'':`${Math.round(a.progress*100)}%`;
   t.box.hidden=false;t.box.style.transform=`translate3d(${Math.round(q.x)}px,${Math.round(q.y)}px,0) translate(-50%,-100%)`;
  }
  for(let i=used;i<workTags.length;i++)workTags[i].box.hidden=true;
  if(now-lastRows>350){lastRows=now;renderRows();if(pinned)renderPerson();}
 }
 function renderRows(){
  if(lineRow){const q=workLine.get(selected);if(q)lineRow.textContent=`Probelauf: ${q.inbox} im Eingang · ${crewRows.filter(r=>r.a?.mode==='work').length} an der Werkbank · ${q.made} Teile fertig · ${lineUsed}-mal ganz durchgelaufen`;}
  for(const r of crewRows){r.a??=actors.find(x=>x.kind==='worker'&&x.site===selected&&x.f===r.m);const a=r.a,t=r.t,text=t?`${r.m.action}: ${taskName(t)}${a?.stage>=0&&a.stage!==2?` · ${STAGES[a.stage]}`:''}`:preview?`${stageOf(a)} (Probelauf)`:'ruht, keine echte Aufgabe';if(r.state.textContent!==text)r.state.textContent=text;r.bar.hidden=!a?.busy;r.bar.dataset.open=String(Boolean(t));r.fill.style.width=t?'':`${Math.round((a?.progress??0)*100)}%`;}
 }
 function renderPerson(){
  personCard.hidden=!pinned;if(!pinned){following=false;actsFor=null;return;}
  const a=pinned,worker=a.kind==='worker',courier=a.kind==='courier',s=worker?stations.find(x=>x.id===a.site):null;
  personKicker.textContent=courier?'Unterwegs mit einer Übergabe':s?`${s.title} · ${s.district}`:'Bewohner von Mittelerde';
  const name=a.f.name??'Bote';if(personName.textContent!==name)personName.textContent=name;
  personText.textContent=courier?a.title:worker?(a.busy?`${a.note}`:a.chat?`Spricht mit ${a.chat.other.f.name}, keine echte Aufgabe`:`${a.f.action}: ruht, keine echte Aufgabe`):`${lifeText(a)} Gehört zur Szenerie, das ist keine Arbeit von Numaron.`;
  if(actsFor!==a){actsFor=a;following=false;personActs.replaceChildren();const follow=button('Folgen','Dieser Figur mit dem Blick folgen',()=>{following=!following;follow.dataset.on=String(following);if(following)goal.d=Math.min(goal.d,320);},'me-person-act');personActs.append(follow);
   if(a.kind==='wanderer')for(const b of bonds){const other=b.a===a.f.name?b.b:b.b===a.f.name?b.a:null,who=other&&namedActor(other);if(who)personActs.append(button(`Zu ${other} schicken`,`${a.f.name} geht zu ${other}`,()=>{b.last=performance.now();startMeeting(a,who,spoken(b,a));},'me-person-act'));}}
  personSteps.hidden=!(worker&&a.busy);personBar.hidden=!(worker&&a.busy);
  if(worker&&a.busy){[...personSteps.children].forEach((li,i)=>{li.dataset.state=a.stage<0?'':i<a.stage?'done':i===a.stage?'now':'';});personBar.dataset.open=String(Boolean(a.real));personFill.style.width=a.real?'':`${Math.round(a.progress*100)}%`;}
 }
 function renderTrays(){
  if(!ready||!view)return;
  const paper=new T.MeshStandardMaterial({color:'#efe4c8'}),flag=new T.MeshStandardMaterial({color:'#d4380f'}),pole=new T.MeshStandardMaterial({color:'#3a2a14'}),sheet=new T.BoxGeometry(9,1,7),cloth=new T.BoxGeometry(8,5,.4),stick=new T.CylinderGeometry(.5,.5,16,6),goods=new T.MeshStandardMaterial({color:'#a07f4c'}),piece=new T.BoxGeometry(8,4,6);
  for(const s of view.stations){
   const d=districts.get(s.id),q=preview?workLine.get(s.id):null,waiting=q?q.inbox:s.counts.waiting,finished=q?q.made:s.counts.done;d.tray.clear();
   for(let i=0;i<Math.min(finished,9);i++){const m=new T.Mesh(piece,goods);m.position.set(-36+(i%3)*9,2+Math.floor(i/3)*4.2,92);m.rotation.y=i*.7;m.castShadow=true;d.tray.add(m);}
   for(let i=0;i<Math.min(waiting,12);i++){const m=new T.Mesh(sheet,paper);m.position.set(-72+(i%4)*11,1+Math.floor(i/4)*1.3,84);m.castShadow=true;d.tray.add(m);}
   for(let i=0;i<Math.min(s.counts.trouble,8);i++){const x=30+(i%4)*11,z=86+Math.floor(i/4)*8;const a=new T.Mesh(stick,pole);a.position.set(x,8,z);const b=new T.Mesh(cloth,flag);b.position.set(x+4,13,z);d.tray.add(a,b);}
  }
 }
 function renderLegend(){for(const s of stations){const row=legendRows.get(s.id),v=view?.stations.find(x=>x.id===s.id);if(!row)continue;row.dot.dataset.state=preview?'working':v?.state.code??'idle';const q=preview?workLine.get(s.id):null,n=q?q.inbox:v?v.counts.active+v.counts.waiting:0;row.count.textContent=n?String(n):'';row.b.title=q?`Probelauf: ${q.inbox} im Eingang, ${q.made} fertig`:v?v.state.label:'';}const eyeRow=legendRows.get(HUB);if(eyeRow){eyeRow.dot.dataset.state=power?.enabled||preview?'working':'idle';}}
 function setPreview(on){
  preview=on;banner.hidden=!on;workLine.clear();lineUsed=0;if(on)for(const s of stations)workLine.set(s.id,{inbox:crews[s.id].length,made:0});for(const a of actors)if(a.kind==='worker')a.piece=false;renderLegend();renderTrays();previewButton.textContent=on?'■ Probelauf':'▶ Probelauf';previewButton.setAttribute('aria-pressed',String(on));host.dataset.preview=String(on);clearInterval(previewTimer);
  renderCrew();renderPanel();
 }
 function renderCrew(){
  if(!view)return;
  for(const s of view.stations)for(const a of actors){
   if(a.kind!=='worker'||a.site!==s.id)continue;
   const task=s.working[a.index];a.busy=Boolean(task)||preview;a.real=Boolean(task);a.note=task?taskName(task):preview?`Probe: ${a.f.action}`:'';
  }
 }
 function update({snapshot,health:nextHealth,power:nextPower}){
  health=nextHealth??health;power=nextPower??power;
  host.dataset.power=power?(power.enabled?'on':'off'):'unknown';
  if(snapshot){
   view=workshopView(snapshot);renderCrew();renderTrays();
   {const seen=new Map(talks.map(t=>[t.key,t.told]));talks=workTalks(snapshot.autonomy?.tasks,snapshot.autonomy?.conversations);for(const t of talks)t.told=seen.get(t.key);}
   const tasks=snapshot.autonomy?.tasks??null;
   if(ready&&!preview)for(const flow of observedFlows(previousTasks,tasks))dispatch(flow);
   previousTasks=tasks;
  }
  renderLegend();renderPanel();
 }
 resize();renderLegend();requestAnimationFrame(frame);
 // The world is built once, right after the first layout.
 setTimeout(()=>{buildScene().catch(e=>{loading.textContent='Mittelerde konnte nicht aufgebaut werden. Alle anderen Bereiche funktionieren weiter.';console.error(e);});},30);
 return {update,select,setPreview};
}
