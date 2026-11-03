// The sky over Middle-earth: dome, sun, moon and stars, clouds and what falls from them, and the gaze of the Eye.
// Pure drawing. No data from the server and no server access.
import {THREE as T,Kit,solid,flameSheet,nightFlames} from './middle-earth-3d.mjs';
import {WEATHER,ZONES} from './middle-earth-time.mjs';

const smooth=(a,b,x)=>{const k=Math.max(0,Math.min(1,(x-a)/(b-a)));return k*k*(3-2*k);};

export function buildDome(){
 const uniforms={sunDir:{value:new T.Vector3(0,1,0)},moonDir:{value:new T.Vector3(0,1,0)},zenith:{value:new T.Color()},horizon:{value:new T.Color()},night:{value:0},golden:{value:0},cover:{value:0},time:{value:0}};
 const mesh=new T.Mesh(new T.SphereGeometry(1,48,24),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,depthTest:false,fog:false,uniforms,
  vertexShader:'varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p;}',
  fragmentShader:`varying vec3 vD;uniform vec3 sunDir;uniform vec3 moonDir;uniform vec3 zenith;uniform vec3 horizon;uniform float night;uniform float golden;uniform float cover;uniform float time;
  float h31(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
  void main(){vec3 d=normalize(vD);float up=max(d.y,0.);vec3 c=mix(horizon,zenith,pow(up,.52));
   float toSun=max(dot(d,sunDir),0.);c+=horizon*pow(toSun,6.)*golden*.75;c+=vec3(1.,.9,.72)*pow(toSun,64.)*.5*(1.-night);c+=vec3(1.5,1.3,1.05)*smoothstep(.9994,.9997,toSun)*6.*(1.-night)*(1.-cover*.8);
   float toMoon=max(dot(d,moonDir),0.);c+=vec3(.5,.56,.72)*pow(toMoon,180.)*.45*night;float disc=smoothstep(.9990,.9994,toMoon);c=mix(c,vec3(1.5,1.55,1.68),disc*night*(1.-cover*.7));
   vec3 g=floor(d*210.);float star=step(.9965,h31(g));float twinkle=.55+.45*sin(time*2.+h31(g+3.)*60.);c+=vec3(.95,.97,1.1)*star*twinkle*night*smoothstep(.02,.28,d.y)*(1.-cover*.85)*.85;
   c=mix(c,vec3(dot(c,vec3(.33)))*.72,cover*.55);
   gl_FragColor=vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`}));
 mesh.renderOrder=-20;mesh.frustumCulled=false;mesh.scale.setScalar(52000);return {mesh,uniforms};
}

// Weather lives in zones. Each zone carries its own clouds and rain curtains; what falls close to the camera follows the zone under it.
export function buildWeather(puff,centres){
 const group=new T.Group(),zones=new Map();
 const streak=(()=>{const n=document.createElement('canvas');n.width=64;n.height=256;const c=n.getContext('2d'),g=c.createLinearGradient(0,0,0,256);g.addColorStop(0,'#ffffff00');g.addColorStop(.25,'#ffffff55');g.addColorStop(.8,'#ffffff33');g.addColorStop(1,'#ffffff00');c.fillStyle=g;for(let i=0;i<34;i++){c.globalAlpha=.25+((i*37)%10)/14;c.fillRect((i*19)%64,(i*53)%40,1+(i%2),160+(i*29)%90);}const t=new T.CanvasTexture(n);return t;})();
 for(const [id,c] of Object.entries(centres)){
  const clouds=[],curtains=[];
  for(let i=0;i<9;i++){const a=i*2.399+id.length,r=90+i*62,s=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#ffffff',transparent:true,opacity:0,depthWrite:false,fog:false}));s.position.set(c.x+Math.cos(a)*(r+120),760+(i%3)*60,c.y+Math.sin(a)*(r+120)*.8);const w=300+(i%4)*90;s.scale.set(w,w*.36,1);s.renderOrder=6;group.add(s);clouds.push({s,a,r,x:s.position.x,z:s.position.z});}
  for(let i=0;i<4;i++){const a=i*1.7+id.length,r=120+i*80,s=new T.Sprite(new T.SpriteMaterial({map:streak,color:'#b8c6d2',transparent:true,opacity:0,depthWrite:false,fog:false}));s.position.set(c.x+Math.cos(a)*r,320,c.y+Math.sin(a)*r*.8);s.scale.set(330,520,1);s.renderOrder=5;group.add(s);curtains.push(s);}
  zones.set(id,{id,c,clouds,curtains,cover:0,fall:0,kind:'clear'});
 }
 // Close up, drops, flakes and ash fall in a box around the view; a small program moves them, so thousands cost almost nothing.
 const COUNT=2400,pos=new Float32Array(COUNT*3),seed=new Float32Array(COUNT);{let s=1234;const r=()=>(s=(s*16807)%2147483647)/2147483647;for(let i=0;i<COUNT;i++){pos[i*3]=r();pos[i*3+1]=r();pos[i*3+2]=r();seed[i]=r();}}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('seed',new T.BufferAttribute(seed,1));
 const u={time:{value:0},box:{value:new T.Vector3(900,520,900)},at:{value:new T.Vector3()},speed:{value:520},sway:{value:0},size:{value:30},streak:{value:1},tone:{value:new T.Color('#c4d2dd')},alpha:{value:0}};
 const fall=new T.Points(geo,new T.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:u,
  vertexShader:`attribute float seed;uniform float time;uniform vec3 box;uniform vec3 at;uniform float speed;uniform float sway;uniform float size;varying float vS;void main(){vS=seed;vec3 p=position*box;p.y=box.y-mod(p.y+time*speed*(.8+seed*.4),box.y);p.x+=sin(time*.7+seed*40.)*sway;p.z+=cos(time*.5+seed*31.)*sway;p.xz=mod(p.xz-at.xz,box.xz)-box.xz*.5+at.xz;p.y+=at.y;vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(size*260./-mv.z,1.,46.);}`,
  fragmentShader:`uniform float streak;uniform vec3 tone;uniform float alpha;varying float vS;void main(){vec2 q=gl_PointCoord-.5;float a=streak>.5?(1.-smoothstep(.015,.05,abs(q.x)))*(1.-smoothstep(.2,.5,abs(q.y))):1.-smoothstep(.16,.5,length(q));if(a<.02)discard;gl_FragColor=vec4(tone,a*alpha*(.55+.45*vS));
   #include <colorspace_fragment>
  }`}));
 fall.frustumCulled=false;fall.visible=false;fall.renderOrder=7;group.add(fall);
 const looks={rain:{speed:640,sway:0,size:34,streak:1,tone:'#b9c9d6',alpha:.55},snow:{speed:62,sway:18,size:9,streak:0,tone:'#f2f6fa',alpha:.85},ash:{speed:34,sway:26,size:7,streak:0,tone:'#3a322c',alpha:.8}};
 let current=null,strength=0;
 return {group,zones,
  step(dt,time,cam,groundY,light,dim,kinds,zoneHere){
   const near=smooth(1500,750,cam.d),far=smooth(980,1500,cam.d),k=Math.min(1,dt*.5);
   for(const z of zones.values()){
    const w=WEATHER[kinds[z.id]??'clear'];z.kind=kinds[z.id]??'clear';z.cover+=(w.cover-z.cover)*k;z.fall+=((w.fall?1:0)-z.fall)*k;
    const dark=(.22+.78*light.day),grey=1-z.cover*.5,sunset=light.golden;
    z.clouds.forEach((q,i)=>{q.x+=dt*(4+(i%3));const span=q.r*1.25+160;let dx=q.x-z.c.x;if(dx>span){q.x=z.c.x-span;dx=-span;}q.s.position.x=q.x;q.s.material.opacity=Math.min(.26,Math.max(0,z.cover*(i<2+z.cover*7?1:0)*.34)*(1-smooth(span*.72,span,Math.abs(dx))))*far;q.s.visible=q.s.material.opacity>.004;q.s.material.color.setRGB((grey+sunset*.35)*dark,(grey+sunset*.06)*dark,(grey-sunset*.12)*dark);});
    // Seen from straight above the falling veils would only be flat sheets, so they fade out as the view tips over.
    const upright=1-smooth(.98,1.22,cam.pitch??0);for(const s of z.curtains){s.material.opacity=z.fall*.12*far*dark*upright*(z.kind==='snow'?.75:1);s.visible=s.material.opacity>.004;}
   }
   const zone=zones.get(zoneHere),w=WEATHER[zone?.kind??'clear'],look=w.fall?looks[w.fall]:null;
   if(look&&look!==current&&strength<.03){current=look;u.speed.value=look.speed;u.sway.value=look.sway;u.size.value=look.size;u.streak.value=look.streak;u.tone.value.set(look.tone);}
   strength+=((look&&look===current?1:0)-strength)*Math.min(1,dt*.9);
   fall.visible=strength*near>.01&&!dim;
   if(fall.visible){u.time.value=time;u.at.value.set(cam.x,groundY,cam.y);const span=Math.max(520,cam.d*1.1);u.box.value.set(span,Math.max(300,cam.d*.62),span);u.alpha.value=(current?.alpha??0)*strength*near*(.34+.66*light.day);}
  }};
}

// The gaze of the Eye: a searing shaft of light that widens with distance, hangs with dust and stops at whatever it meets.
export function buildGaze(puff){
 const group=new T.Group(),u={time:{value:0},reach:{value:1000}};
 const shaft=(radiusBias,alpha,heat)=>{const geo=new T.CylinderGeometry(1,1,1,32,24,true).translate(0,.5,0);return new T.Mesh(geo,new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,fog:false,uniforms:{...u,alpha:{value:alpha},heat:{value:heat},bias:{value:radiusBias}},
  vertexShader:`varying float vL;varying vec3 vN;varying vec3 vV;varying vec3 vW;uniform float reach;uniform float bias;void main(){vL=position.y;float w=mix(bias,1.,pow(position.y,.82));vec3 p=vec3(position.x*w,position.y,position.z*w);vec4 world=modelMatrix*vec4(p,1.);vW=world.xyz;vN=normalize(mat3(modelMatrix)*vec3(normal.x,0.,normal.z));vV=cameraPosition-world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
  fragmentShader:`varying float vL;varying vec3 vN;varying vec3 vV;varying vec3 vW;uniform float time;uniform float alpha;uniform float heat;
  float h(vec3 p){p=fract(p*.3183+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
  void main(){float face=abs(dot(normalize(vN),normalize(vV)));float soft=pow(face,2.4);float dust=.72+.5*n(vW*.024+vec3(0.,-time*.5,time*.22))*n(vW*.07+vec3(time*.3,0.,0.));float fall=mix(1.,.34,vL)*smoothstep(0.,.015,vL)*smoothstep(1.,.965,vL);vec3 c=mix(vec3(1.5,.46,.08),vec3(2.5,1.95,1.25),heat*soft);gl_FragColor=vec4(c,soft*alpha*dust*fall);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`}));};
 const wide=shaft(.08,.15,.15),core=shaft(.05,.42,1);for(const m of [wide,core]){m.frustumCulled=false;m.renderOrder=8;group.add(m);}
 // Where it lands, the ground burns white.
 const spot=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#ffc27a',transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending,fog:false})),pool=new T.Mesh(new T.CircleGeometry(1,40).rotateX(-Math.PI/2),new T.MeshBasicMaterial({map:puff,color:'#ffb060',transparent:true,opacity:.75,depthWrite:false,blending:T.AdditiveBlending,fog:false}));pool.renderOrder=7;spot.renderOrder=9;
 const glow=new T.PointLight('#ffb368',0,340,1.2);group.add(spot,pool,glow);
 const up=new T.Vector3(0,1,0),dir=new T.Vector3();
 group.visible=false;
 return {group,aim(from,to,time,open){
  group.visible=open;if(!open){glow.intensity=0;return;}
  dir.subVectors(to,from);const reach=dir.length()||1;dir.divideScalar(reach);u.time.value=time;
  const far=Math.max(36,reach*.058);
  wide.position.copy(from);wide.quaternion.setFromUnitVectors(up,dir);wide.scale.set(far,reach,far);
  core.position.copy(from);core.quaternion.setFromUnitVectors(up,dir);core.scale.set(far*.36,reach,far*.36);
  spot.position.copy(to).addScaledVector(dir,-6);spot.scale.setScalar(far*2.4);
  pool.position.set(to.x,to.y+1.5,to.z);pool.scale.setScalar(far*1.7);
  glow.position.copy(to).addScaledVector(dir,-34);glow.intensity=2600;
 }};
}

// A black horse under one of the Nine. Forward is +z, like the figures.
export function buildRider(makeFigure){
 const root=new T.Group(),body=new T.Group(),k=new Kit(),coat='#141112',shine='#211c1d',mane='#060506',iron='#2a2a30',cloth='#101016',hide=new T.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.12});
 root.add(body);
 // Quarters, a deep barrel, withers and chest: a horse is heavy behind and deep in front.
 k.limb([[0,24,-17,3.6],[0,24.6,-14,6.2],[0,24.4,-8,7.1],[0,23.2,-1,7.2],[0,23.2,6,7.1],[0,24.4,11,6.2],[0,24.6,15,4]],coat,14);
 k.limb([[0,29.6,-14,3.4],[0,30.4,-9,3],[0,29.2,-2,2.8],[0,29.4,5,3],[0,31,10,3]],shine,9);
 for(const s of [-1,1]){k.limb([[s*4,26,-13,4.8],[s*5,20,-14,4.2],[s*4.6,16,-16,3]],coat,9);k.limb([[s*4,27,11,3.8],[s*4.8,20,13,3.5],[s*4.2,16,13.6,2.7]],coat,9);}
 // Saddle, black barding and a torn cloth hanging over the flanks.
 k.limb([[0,31,-5,3.6],[0,31.6,0,3.6],[0,31.8,3,3.2]],'#1c1b22',9);k.box(0,31.6,-6.2,7,3,1,'#17161c');k.box(0,31.8,3.8,7,3.2,1,'#17161c');
 for(const s of [-1,1])for(let i=0;i<8;i++){const z=-15+i*4.1;k.limb([[s*6.6,29,z,.7],[s*7.6,21-(i%3)*2,z+.4,.6],[s*7.2,14-(i%2)*3,z+.8,.08]],'#17161c',5);}
 for(const [a,b] of [[-5,17],[0,18.4],[5,17]])k.limb([[a*.3,29,b-1,.8],[a,23,b+1,.8],[a,17,b+.6,.1]],'#17161c',5);
 body.add(k.mesh(hide));
 // Neck and head turn as one at the base of the neck, so the head can nod with the stride.
 const neck=new T.Group(),n=new Kit();neck.position.set(0,28,13);
 n.limb([[0,-2,-1,5.4],[0,2,1.6,4.6],[0,7,4.6,3.5],[0,12,7,2.8],[0,15.4,8.4,2.3]],coat,12);
 n.limb([[0,16.4,8,2.2],[0,15.8,11,2.5],[0,13.8,14.6,1.9],[0,11.6,18,1.35],[0,10.4,19.8,1.15]],coat,10);n.ball(0,14.2,10.6,2.5,shine);
 for(const s of [-1,1]){n.cone(s*1.25,17.8,8.4,.62,3.1,coat,5,s*.2);n.ball(s*1.9,15.4,12.6,.4,'#3a1208');n.ball(s*.72,10.5,19.9,.26,'#020202');n.limb([[s*1.8,15,10,.16],[s*1.8,12,15,.16],[s*1.2,11,18,.14]],iron,3);}
 n.limb([[0,10.7,17,1.42],[0,10.7,19,1.42]],iron,8);n.ball(0,17.6,10.6,1.1,iron);n.cone(0,18,11,.5,3.4,iron,4);
 for(let i=0;i<9;i++){const f=i/8,y=-1+f*18,z=-2.6+f*10.4;n.limb([[(i%2?.9:-.9),y,z,.8],[(i%2?2.8:-2.8),y-3,z-1.8,.6],[(i%2?3.8:-3.8),y-7,z-1.2,.07]],mane,4);}n.limb([[0,17.8,9,.7],[.3,15.4,12,.6],[.2,13.4,13.4,.08]],mane,4);
 neck.add(n.mesh(hide));body.add(neck);
 const tail=new T.Group(),tk=new Kit();tail.position.set(0,28,-18);tk.limb([[0,0,0,1.5],[0,-3,-3,1.6],[0,-10,-5,1.5],[0,-18,-5.5,.9],[0,-24,-5,.08]],mane,7);for(const s of [-1,1])tk.limb([[s*.5,-4,-3.4,.7],[s*1.5,-13,-6.4,.6],[s*1.2,-21,-6.6,.06]],mane,4);tail.add(tk.mesh(hide));body.add(tail);
 // Four legs with their true joints. A foreleg bends forward at the knee, a hind leg backward at the hock.
 const limb=(x,z,hind)=>{const hip=new T.Group(),joint=new T.Group(),u=new Kit(),l=new Kit();hip.position.set(x,18,z);
  if(hind){u.limb([[0,0,0,2.7],[0,-4,-1.6,1.9],[0,-8,-3.6,1.15]],coat,8);joint.position.set(0,-8.4,-3.8);l.ball(0,0,-.2,1.1,shine);l.limb([[0,0,0,.95],[0,-4,.8,.72],[0,-7,1,.68]],coat,7);}
  else{u.limb([[0,0,0,2.5],[0,-4.4,.5,1.6],[0,-8.4,.5,1.05]],coat,8);joint.position.set(0,-8.6,.5);l.ball(0,0,.15,1.08,shine);l.limb([[0,0,0,.85],[0,-4,0,.66],[0,-7,.1,.66]],coat,7);}
  l.ball(0,-7.4,.2,.92,shine);l.limb([[0,-7.6,.3,.82],[0,-8.5,.8,.92]],coat,6);l.cyl(0,-9.8,1,1.02,1.32,1.3,'#0a0808',9);
  joint.add(l.mesh(hide));hip.add(u.mesh(hide),joint);body.add(hip);return {hip,joint,hind};};
 // A canter: hind legs first, the foreleg last, the back rocking with it.
 const legs=[[limb(-3.7,-14,true),0],[limb(3.7,-14,true),.55],[limb(-3.2,13,false),1.5],[limb(3.2,13,false),2.25]];
 const rider=makeFigure('nazgul','sword');rider.position.set(0,26.5,-.8);rider.userData.pose?.(0,0,false);rider.scale.setScalar(.88);body.add(rider);
 {const r=new Kit();for(const s of [-1,1]){r.limb([[s*3,33,-1,2],[s*7.4,27,1,1.6],[s*7.6,20,-.6,1.2]],cloth,7);r.box(s*7.6,17.6,-.2,2,1.8,4.2,'#0a0a0c');}r.limb([[-2.6,36,5,.25],[0,37,10,.2],[2.6,34,16,.2]],iron,3);body.add(r.mesh(hide));}
 root.traverse(q=>{if(q.isMesh)q.castShadow=true;});
 return {root,step(phase,speed){const go=Math.min(1,speed/20);for(const [l,o] of legs){const w=phase+o,sw=Math.sin(w);if(l.hind){l.hip.rotation.x=(sw*.58+.08)*go;l.joint.rotation.x=-(.28+Math.max(0,-Math.cos(w))*1.05)*go;}else{l.hip.rotation.x=(sw*.62-.08)*go;l.joint.rotation.x=Math.max(0,Math.cos(w))*1.25*go;}}body.position.y=Math.abs(Math.sin(phase+.8))*1.3*go;body.rotation.x=Math.sin(phase+.8)*.055*go;neck.rotation.x=Math.sin(phase+2.2)*.09*go+.03;tail.rotation.x=Math.sin(phase*.5)*.1+.28*go;}};
}

// Warm pools of lamp light at night around every place, and along the roads.
export function buildNightLamps(puff,points){
 // Iron poles along the ways, each with a real flame after dark; blue-white in the elven lands.
 const poles=new Kit(),m=flameSheet(points.map(q=>[q.x,q.y+3,q.z,3,12,q.cool?1:0]),nightFlames());for(const q of points){poles.column(q.x,q.y-12,q.z,.7,14,'#1e1b18',6);poles.column(q.x,q.y+1.6,q.z,2,.7,'#1e1b18',8);}m.userData.poles=poles.mesh(solid);return m;
}
export {ZONES};
