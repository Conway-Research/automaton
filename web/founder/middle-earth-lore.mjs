// What lives in the stories: Ents, the Witch-king on his winged beast, the Watcher in the Water, the rooms of the Dark Tower and the treasures of every house.
// Pure drawing and walking. No data from the server and no server access.
import {THREE as T,Kit,glowing,makeFigure,worldDay} from './middle-earth-3d.mjs';

const TAU=Math.PI*2;
const lit=k=>{const m=k.mesh(glowing);m.castShadow=false;m.receiveShadow=false;return m;};
const wing=(k,a,b,c,color)=>{const t=new T.Color(color),u=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),v=new T.Vector3(c[0]-a[0],c[1]-a[1],c[2]-a[2]),n=u.cross(v).normalize();for(const [p,s] of [[a,1],[b,1],[c,1],[a,-1],[c,-1],[b,-1]]){k.pos.push(p[0],p[1],p[2]);k.nor.push(n.x*s,n.y*s,n.z*s);k.col.push(t.r,t.g,t.b);}};

// ---- A cut that sinks from the top down. What faces the viewer goes, what lies behind stays: as with the houses, only taller ----
export function reveal(material){
 const before=material.onBeforeCompile,key=material.customProgramCacheKey,u=material.userData.reveal={dir:{value:new T.Vector2(0,1)},sill:{value:1e6}};
 material.onBeforeCompile=function(shader,renderer){
  before?.call(this,shader,renderer);
  Object.assign(shader.uniforms,{revealDir:u.dir,revealSill:u.sill});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRevP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRevP=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRevP;uniform vec2 revealDir;uniform float revealSill;').replace('#include <map_fragment>',`
   if(vRevP.y>revealSill-14.){float rag=sin(vRevP.x*.31+vRevP.z*.27)*sin(vRevP.x*.13-vRevP.z*.19+vRevP.y*.21);if(dot(vRevP.xz,revealDir)>4.+rag*7.&&vRevP.y>revealSill+rag*9.)discard;}
   #include <map_fragment>`);
 };
 material.customProgramCacheKey=function(){return (key?key.call(this):'')+'|reveal';};
 return material;
}
export const setReveal=(material,x,z,sill)=>{const u=material.userData.reveal;u.dir.value.set(x,z);u.sill.value=sill;};
// The rock the tower stands on is hollow inside its walls, so the gate hall floor lies open instead of under the crag.
export function hollowCore(material,radius,floor){
 const before=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,renderer){
  before?.call(this,shader,renderer);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vHollowP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvHollowP=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vHollowP;').replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
   if(vHollowP.y>${floor.toFixed(1)}&&length(vHollowP.xz)<${radius.toFixed(1)})discard;`);
 };
 material.customProgramCacheKey=function(){return (key?key.call(this):'')+'|hollow';};
 return material;
}
// The great rent in the flank of Mount Doom: a jagged V towards the south-east, deepest in its middle. Land, road and the rock behind share it.
export const rentGlsl='float doomRent(vec3 p,vec4 h){vec2 d=p.xz-h.xy;if(length(d)>h.z)return 0.;float rag=sin(p.x*.19+p.z*.23)*sin(p.x*.07-p.z*.11);return p.y>h.w+rag*2.5?1.:0.;}';
export function holeCut(material,hole){
 const before=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,renderer){
  before?.call(this,shader,renderer);
  shader.uniforms.landHole=hole;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vHoleP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvHoleP=(modelMatrix*vec4(position,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vHoleP;uniform vec4 landHole;'+rentGlsl).replace('#include <map_fragment>',`
   if(doomRent(vHoleP,landHole)>.5)discard;
   #include <map_fragment>`);
 };
 material.customProgramCacheKey=function(){return (key?key.call(this):'')+'|hole';};
 return material;
}

// ---- Free ways through a room. Whatever stands on the floor at a walker's height blocks; the way is searched around it ----
export function walkGrid(pos,inRoom){
 const cell=4,half=212,n=106,taken=new Uint8Array(n*n),at=(x,z)=>[Math.floor((x+half)/cell),Math.floor((z+half)/cell)];
 for(let i=0;i+8<pos.length;i+=9){
  const ax=pos[i],ay=pos[i+1],az=pos[i+2],bx=pos[i+3],by=pos[i+4],bz=pos[i+5],cx=pos[i+6],cy=pos[i+7],cz=pos[i+8];
  if(Math.max(ay,by,cy)<3||Math.min(ay,by,cy)>26)continue;
  const [u0,v0]=at(Math.min(ax,bx,cx),Math.min(az,bz,cz)),[u1,v1]=at(Math.max(ax,bx,cx),Math.max(az,bz,cz)),small=u1-u0<2&&v1-v0<2,area=(bx-ax)*(cz-az)-(cx-ax)*(bz-az);
  for(let v=Math.max(0,v0);v<=Math.min(n-1,v1);v++)for(let u=Math.max(0,u0);u<=Math.min(n-1,u1);u++){
   if(!small&&Math.abs(area)>1e-6){const px=-half+(u+.5)*cell,pz=-half+(v+.5)*cell,s=((bx-px)*(cz-pz)-(cx-px)*(bz-pz))/area,t=((cx-px)*(az-pz)-(ax-px)*(cz-pz))/area,m=cell/Math.sqrt(Math.abs(area));if(s<-m||t<-m||s+t>1+m)continue;}
   taken[v*n+u]=1;
  }
 }
 const blocked=new Uint8Array(n*n);
 for(let v=0;v<n;v++)for(let u=0;u<n;u++){const x=-half+(u+.5)*cell,z=-half+(v+.5)*cell;let b=!inRoom(x,z);for(let a=-1;a<=1&&!b;a++)for(let c=-1;c<=1&&!b;c++){const q=v+a,w=u+c;if(q>=0&&q<n&&w>=0&&w<n&&taken[q*n+w])b=true;}blocked[v*n+u]=b?1:0;}
 return {cell,half,n,blocked};
}
const cellOf=(g,x,z)=>[Math.max(0,Math.min(g.n-1,Math.floor((x+g.half)/g.cell))),Math.max(0,Math.min(g.n-1,Math.floor((z+g.half)/g.cell)))];
const nearestFree=(g,x,z,reach=10)=>{const [u,v]=cellOf(g,x,z);for(let r=0;r<=reach;r++)for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++){if(Math.max(Math.abs(a),Math.abs(b))!==r)continue;const q=v+a,w=u+b;if(q>=0&&q<g.n&&w>=0&&w<g.n&&!g.blocked[q*g.n+w])return [w,q];}return null;};
const clearLine=(g,a,b)=>{const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);for(let i=0;i<=steps;i++){const u=Math.round(a[0]+(b[0]-a[0])*i/steps),v=Math.round(a[1]+(b[1]-a[1])*i/steps);if(g.blocked[v*g.n+u])return false;}return true;};
// Room coordinates in, room coordinates out. Null when no free way exists: then the worker stays at the bench.
export function wayIn(g,from,to){
 const a=nearestFree(g,from.x,from.z),b=nearestFree(g,to.x,to.z);if(!a||!b)return null;
 const n=g.n,seen=new Int32Array(n*n).fill(-1),start=a[1]*n+a[0],goal=b[1]*n+b[0];seen[start]=start;const queue=[start];
 for(let i=0;i<queue.length&&seen[goal]<0;i++){const q=queue[i],u=q%n,v=(q-u)/n;for(const [c,d] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const w=u+c,y=v+d;if(w<0||y<0||w>=n||y>=n)continue;const o=y*n+w;if(seen[o]>=0||g.blocked[o])continue;if(c&&d&&(g.blocked[v*n+w]||g.blocked[y*n+u]))continue;seen[o]=q;queue.push(o);}}
 if(seen[goal]<0)return null;
 const line=[];for(let q=goal;;q=seen[q]){line.unshift([q%n,(q-q%n)/n]);if(q===start)break;}
 const short=[line[0]];for(let i=0;i<line.length-1;){let j=line.length-1;while(j>i+1&&!clearLine(g,line[i],line[j]))j--;short.push(line[j]);i=j;}
 return short.map(([u,v])=>({x:-g.half+(u+.5)*g.cell,z:-g.half+(v+.5)*g.cell}));
}

// ---- Ents: old trees that walk ----
export function buildEnt(material,{height=1,seed=1,beard=false,crown=['#4b6a2c','#3c5a26','#5e7a34'],bark='#4a3a28',deep='#2c2218'}={}){
 const root=new T.Group(),body=new T.Group(),k=new Kit(),g=new Kit();let s=seed*7919+13;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
 // The trunk, ridged with bark, grown with moss.
 k.limb([[0,24,0,8.4],[.6,36,0,9.6],[0,50,-.6,9.2],[-.5,62,0,7.8],[0,72,.4,6.4]],bark,14);
 for(let i=0;i<20;i++){const a=i/20*TAU+rnd()*.2;k.limb([[Math.sin(a)*8.5,24,Math.cos(a)*8.5,1.1],[Math.sin(a+.12)*9.6,38+rnd()*4,Math.cos(a+.12)*9.6,.9],[Math.sin(a-.1)*9.4,52,Math.cos(a-.1)*9.4,.8],[Math.sin(a)*6.6,70,Math.cos(a)*6.6,.5]],i%3?deep:bark,4);}
 for(let i=0;i<14;i++){const a=rnd()*TAU,y=28+rnd()*38;k.ball(Math.sin(a)*9,y,Math.cos(a)*9,1.6+rnd()*2,i%2?'#47602c':'#39502a',.55);}
 // A long face in the bark: heavy brows, eyes of slow amber, a knot of a nose and a crack of a mouth.
 for(const q of [-1,1]){k.limb([[q*.8,69,6.1,1.4],[q*3.2,70.4,6,1.2],[q*5.6,70,4.4,.5]],deep,6);g.ball(q*2.9,66.8,6.4,.95,'#e8a82a');g.ball(q*2.9,66.8,7.1,.38,'#1a0e04');}
 k.limb([[0,67.5,7,1],[.1,63,8.2,1.3],[0,61.2,7.6,.7]],bark,6);k.box(0,56.6,6.9,6.4,1.1,1.2,'#120c07');
 if(beard)for(let i=0;i<12;i++){const a=-.9+i*.16,x=Math.sin(a)*6.4,z=Math.cos(a)*6.4;k.limb([[x,56,z,.8],[x*1.1,47-rnd()*4,z+.8,.6],[x*.9,36-rnd()*9,z+.4,.14]],i%2?'#55653a':'#6a6a48',4);}
 // Boughs instead of hair.
 for(let i=0;i<10;i++){const a=i/10*TAU+rnd()*.4,lean=7+rnd()*9,tip=[Math.sin(a)*lean*1.8,88+rnd()*14,Math.cos(a)*lean*1.8];k.limb([[Math.sin(a)*3,70,Math.cos(a)*3,2.4],[Math.sin(a)*lean,80+rnd()*5,Math.cos(a)*lean,1.5],[...tip,.5]],bark,6);k.canopy(tip[0],tip[1]+1,tip[2],8+rnd()*5,crown,seed+i,.82);}
 const main=k.mesh(material);main.castShadow=true;body.add(main,lit(g));root.add(body);
 const limb=(x,y,build)=>{const pivot=new T.Group(),q=new Kit();pivot.position.set(x,y,0);build(q);const m=q.mesh(material);m.castShadow=true;pivot.add(m);return pivot;};
 const legs=[-1,1].map(q=>{const p=limb(q*6.2,27,c=>{c.limb([[0,2,0,6],[q*.5,-12,.4,4.8],[q*.8,-22,1,4.2],[q*.8,-27,2,5]],bark,10);for(let i=0;i<7;i++){const a=-1.4+i*.47,dx=Math.sin(a),dz=Math.cos(a);c.limb([[dx*2.4+q*.8,-24,dz*2.4+2,2],[dx*7+q*.8,-26,dz*7+2,1.4],[dx*12+q*.8,-27,dz*12+2,.3]],i%2?bark:deep,5);}});root.add(p);return p;});
 const arms=[-1,1].map(q=>{const p=limb(q*9.4,62,c=>{c.limb([[0,2,0,3.8],[q*5,-14,2,3],[q*7,-27,5,2.3],[q*7.5,-36,8,1.5]],bark,8);for(let i=0;i<5;i++){const a=-.8+i*.4;c.limb([[q*7.5,-36,8,1],[q*7.5+Math.sin(a)*4,-43,9+Math.cos(a)*3,.6],[q*7.5+Math.sin(a)*7,-50,10+Math.cos(a)*5,.12]],deep,4);}for(let i=0;i<3;i++)c.canopy(q*(3+i*2),-6-i*11,3+i,3.4,crown,seed+20+i,.8);});body.add(p);return p;});
 root.scale.setScalar(height);
 return {root,step(phase,walking){const swing=walking?Math.sin(phase):0;legs[0].rotation.x=swing*.44;legs[1].rotation.x=-swing*.44;arms[0].rotation.x=-swing*.34;arms[1].rotation.x=swing*.34;body.rotation.z=swing*.028;body.position.y=walking?Math.abs(Math.cos(phase))*1.4:0;}};
}

// ---- The Witch-king on his fell beast: a naked, long-necked thing, a black rider, a crown of spikes and a pale blade ----
export function buildFellBeast(material){
 const root=new T.Group(),k=new Kit(),g=new Kit(),hide='#4a4d4f',dark='#2a2c2e',pale='#6e6e68',horn='#1c1c1e',flesh='#3a3d40';
 const spine=[[0,6,-150,.3],[0,8,-118,1.6],[0,10,-90,3.4],[0,10,-60,6],[0,9,-34,10],[0,10,-8,14.5],[0,12,18,15.5],[0,17,40,11],[0,28,58,7],[0,44,72,5.2],[0,60,90,4.2],[0,68,110,3.6],[0,68,124,3.4]];
 k.limb(spine,hide,14);
 // Ridge of spines and ribs under loose skin.
 for(let i=0;i<spine.length-1;i++){const p=spine[i],q=spine[i+1];for(let c=0;c<3;c++){const t=c/3,x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t,z=p[2]+(q[2]-p[2])*t,r=p[3]+(q[3]-p[3])*t;k.add(k.cylinder(0,1,1,4),x,y+r+r*.25+1,z,r*.14+.5,r*.5+2.4,r*.26+1,dark);}}
 for(let i=0;i<7;i++)for(const s of [-1,1]){const z=-20+i*8;k.limb([[s*5,24,z,.7],[s*14.4,12,z,.8],[s*10,0,z+1,.5]],pale,4);}
 // The head: a long narrow skull, a beak full of teeth, horns swept back.
 const hx=0,hy=68,hz=126;k.add(k.octa(1),hx,hy-1,hz+6,7.4,4.6,9,hide);k.limb([[hx,hy,hz-2,4],[hx,hy+1,hz+7,4.8],[hx,hy,hz+16,3.2],[hx,hy-1.5,hz+27,1.9],[hx,hy-4,hz+35,.5]],hide,10);
 // The lower jaw hangs open and wide, a mouth like a pike's.
 for(const s of [-1,1]){k.limb([[s*5.6,hy-4,hz+1,2.2],[s*5,hy-9,hz+12,1.7],[s*3.2,hy-13,hz+23,1.2],[s*.8,hy-15,hz+30,.6]],dark,7);}k.limb([[0,hy-6,hz+4,3],[0,hy-11,hz+15,2.2],[0,hy-14,hz+27,.7]],dark,7);k.limb([[0,hy-4,hz+4,2.4],[0,hy-7.5,hz+16,1.6]],'#3a1a18',6);
 for(const s of [-1,1]){for(let i=0;i<5;i++)k.limb([[s*(4.5-i*.3),hy+2.4,hz+6-i*3,1],[s*(7.5+i*.3),hy+6+i*.7,hz-1-i*5,.5],[s*(9+i*.2),hy+8+i,hz-9-i*7,.08]],horn,4);k.ball(s*4.1,hy+1.4,hz+12,.7,'#060606');for(let i=0;i<9;i++){const f=i/8;k.add(k.cylinder(0,.42,2.7-f*.6,5),s*(4.8-f*3.6),hy-2.4-f*2.4,hz+6+f*27,1,1,1,'#d8d0b4',0,Math.PI);k.add(k.cylinder(0,.36,2.1-f*.5,5),s*(5-f*3.8),hy-8-f*6.4,hz+7+f*22,1,1,1,'#d8d0b4');}}
  // Hind legs drawn up, talons hanging.
 for(const s of [-1,1]){k.limb([[s*12,4,-12,6],[s*17,-10,-22,4],[s*14,-20,-12,2.4],[s*13,-29,-20,1.6]],hide,8);for(const c of [-1,0,1]){k.limb([[s*13,-29,-20,1],[s*13+c*3,-34,-14,.7],[s*13+c*4,-37,-9,.1]],horn,4);}}
 // The rider: a black robe in tatters, the hood empty, a crown of iron spikes, the pale blade raised.
 k.limb([[0,24,12,5.4],[0,34,14,5.6],[0,44,16,4.8],[0,50,17,3.4]],'#0b0b0f',10);k.limb([[0,50,17,3.4],[0,56,18,4.2],[0,60,17,3.6]],'#08080c',9);k.ball(0,55,20.4,2.9,'#010102');
 // Pointed iron over the hood, the face a void under it; plated shoulders and gauntlets.
 k.limb([[0,57,17.6,4.1],[0,61,17.2,3.9],[0,64,17,2.2]],'#2a2a30',10);for(const s of [-1,1]){k.add(k.cube(),s*2.9,53.6,20.2,1.2,5,.6,'#2a2a30',s*.5,0,s*-.12);k.limb([[s*5.2,47.4,16,3],[s*7.4,47.8,16,3.2],[s*8.6,46.4,16,1.8]],'#26262c',8);for(let i=0;i<3;i++)k.cone(s*(5.6+i*1.5),48.8,14+i*2,.5,4.6,'#4a4a50',4);}
 for(let i=0;i<11;i++){const a=i/11*TAU;k.cone(Math.sin(a)*3.9,59.6,17+Math.cos(a)*3.9,.8,10+(i%2)*6+(Math.cos(a)>.5?4:0),'#55555c',4,a);}k.column(0,58.8,17,4.3,1.6,'#2e2e34',12);
 for(let i=0;i<9;i++){const q=-1+i/4;k.limb([[q*5,46,12,1.6],[q*8,32,1,1.5],[q*11,17,-16,1],[q*10,4,-34,.2]],i%2?'#0b0b0f':'#14141a',5);}
 k.limb([[6,44,18,1.2],[12,50,28,1],[14,60,32,.7]],'#0b0b0f',6);k.limb([[-6,44,18,1.2],[-10,36,26,1],[-8,30,34,.7]],'#0b0b0f',6);
 g.limb([[14,60,32,.9],[15,76,33,1],[16,100,35,.5],[16,110,36,.1]],'#b8d4ff',5);k.add(k.cube(),14,60.6,32,7,.8,1.4,'#3a3a40');
 const mainMesh=k.mesh(material);mainMesh.castShadow=true;root.add(mainMesh,lit(g));
 // Two-jointed wings of bone and torn skin.
 const makeWing=s=>{const inner=new T.Group(),outer=new T.Group();inner.position.set(s*12,22,28);const a=new Kit(),b=new Kit(),elbow=[s*96,18,-10];a.limb([[0,0,0,5],[s*40,14,-2,3.8],[...elbow,2.6]],hide,8);wing(a,[0,-2,-36],[...elbow],[0,0,0],flesh);for(let i=0;i<3;i++){const p=[s*(16+i*26),-3,-62-i*14];wing(a,[0,-2,-36],p,[...elbow],i%2?flesh:'#2c211e');wing(a,i?[s*(16+(i-1)*26),-3,-62-(i-1)*14]:[0,-2,-36],p,[...elbow],flesh);}
  const m=a.mesh(material);m.castShadow=true;inner.add(m);outer.position.set(...elbow);const tips=[[s*152,-4,-8],[s*140,-14,-58],[s*110,-18,-92],[s*72,-18,-110],[s*30,-12,-104]];b.limb([[0,0,0,2.6],[s*60,8,4,1.9],[s*120,4,2,.9],[...tips[0],.15]],hide,6);for(let i=1;i<tips.length;i++)b.limb([[0,0,0,1.5],[tips[i][0]*.55,tips[i][1]*.3+3,tips[i][2]*.55,.9],[...tips[i],.1]],dark,5);for(let i=0;i<tips.length-1;i++){const m1=[(tips[i][0]+tips[i+1][0])*.5*(i===2?.86:.92),(tips[i][1]+tips[i+1][1])*.5,(tips[i][2]+tips[i+1][2])*.5*(i===2?.86:.92)];wing(b,[0,0,0],tips[i],m1,flesh);wing(b,[0,0,0],m1,tips[i+1],i%2?'#2c211e':flesh);}
  b.limb([[s*60,8,4,1],[s*62,18,14,.6],[s*60,22,20,.1]],horn,4);
  const n=b.mesh(material);n.castShadow=true;outer.add(n);inner.add(outer);root.add(inner);return {inner,outer,s};};
 const wings=[makeWing(-1),makeWing(1)];
 return {root,step(t){for(const w of wings){const beat=Math.sin(t*1.5);w.inner.rotation.z=w.s*(.12+beat*.44);w.outer.rotation.z=w.s*(.06+Math.sin(t*1.5-.95)*.46);}}};
}

// ---- The Watcher in the Water, in the dark mere before the Doors of Durin ----
const mereShader=(a,b)=>new T.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{mereDay:worldDay,time:{value:0},centre:{value:new T.Vector2()}},
 vertexShader:'varying vec3 vW;varying vec2 vQ;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vQ=position.xy;gl_Position=projectionMatrix*viewMatrix*w;}',
 fragmentShader:`varying vec3 vW;varying vec2 vQ;uniform float mereDay;uniform float time;uniform vec2 centre;
 float h21(vec2 p){p=fract(p*vec2(.1031,.103));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
 void main(){vec3 view=cameraPosition-vW;float dist=length(view);vec3 V=view/dist;vec2 p=vW.xz,r=p-centre;float rr=length(r)+.001,fade=1./(1.+dist/900.);
  // Long dark swells from the wind, and rings going out from what moves below.
  vec2 g=vec2(.8,.6)*cos(dot(vec2(.8,.6),p)*.09+time*.9)*.1+vec2(-.5,.86)*cos(dot(vec2(-.5,.86),p)*.17+time*1.2)*.07+vec2(.2,-.98)*cos(dot(vec2(.2,-.98),p)*.37+time*1.6)*.045;
  g+=(r/rr)*cos(rr*.34-time*2.4)*.14*exp(-rr*.016);g*=fade+.25;vec3 N=normalize(vec3(-g.x,1.,-g.y));
  float F=.03+.97*pow(1.-max(dot(N,V),0.),5.);vec3 R=reflect(-V,N);R.y=abs(R.y);
  vec3 sky=mix(vec3(.2,.17,.16),vec3(.2,.27,.32),smoothstep(0.,.6,R.y));vec3 c=mix(vec3(.003,.008,.008),sky,F);
  c+=vec3(.9,.72,.5)*pow(max(dot(R,normalize(vec3(.45,.62,.64))),0.),170.)*fade*1.6;
  float slime=smoothstep(.56,.74,vn(p*.07+time*.012))*.16;c+=vec3(.02,.05,.022)*slime;
  float ring=smoothstep(.8,.99,cos(rr*.34-time*2.4+vn(p*.05)*5.))*exp(-rr*.05)*vn(p*.09+time*.05);c+=vec3(.14,.18,.16)*ring*fade;
  float q=length(vQ)+(vn(p*.038+3.)-.5)*.3+(vn(p*.15)-.5)*.09;float edge=smoothstep(.98,.93,q);float lap=smoothstep(.84,.95,q)*(.5+.5*sin(q*70.-time*1.3+vn(p*.2)*8.));c=mix(c,vec3(.2,.24,.2),lap*.2);
  gl_FragColor=vec4(c*mix(.28,1.,mereDay),edge*.97);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`});
export function buildMere(mere,puff,groundAt,waterY){
 const onShore=(x,z)=>groundAt(mere.x+x,mere.y+z)-waterY;
 const group=new T.Group(),water=new T.Mesh(new T.CircleGeometry(1,64),mereShader(mere.a,mere.b));water.rotation.x=-Math.PI/2;water.scale.set(mere.a*1.04,mere.b*1.04,1);water.renderOrder=1;group.add(water);
 // Tentacles are drawn once and bent by the graphics card, so that many of them cost almost nothing.
 const time={value:0},skinMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.3,metalness:.08});
 skinMat.onBeforeCompile=shader=>{shader.uniforms.mereTime=time;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 bend;uniform float mereTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
  {float w=bend.x*bend.x;transformed.x+=sin(mereTime*.74+bend.y+bend.x*4.2)*w*15.;transformed.z+=cos(mereTime*.6+bend.y*1.3+bend.x*3.4)*w*13.;transformed.y+=sin(mereTime*.5+bend.y*1.9)*w*9.;}`);};
 skinMat.customProgramCacheKey=()=>'watcher-limb';
 const pos=[],nor=[],col=[],bendAt=[],order=[];let at=0;const tint=new T.Color(),pale=new T.Color('#d8c8a8'),back=new T.Color('#4f5c49'),mid=new T.Color('#7f8468');
 const limb=(x0,z0,dir,reach,tall,r0,phase,arc=.82)=>{const rings=30,sides=10,dx=Math.sin(dir),dz=Math.cos(dir),base=at;for(let i=0;i<=rings;i++){const t=i/rings,y=-8+tall*Math.sin(Math.min(1,t*1.15)*Math.PI*arc)+(arc<1?t*t*tall*.14:-t*12),out=reach*t,r=r0*Math.pow(1-t,.78)+.28,curl=Math.pow(t,3)*reach*.2;const cx=x0+dx*out-dz*curl,cz=z0+dz*out+dx*curl;for(let j=0;j<=sides;j++){const a=j/sides*TAU,ca=Math.cos(a),sa=Math.sin(a),nx=-dz*ca,nz=dx*ca,ny=sa;pos.push(cx+nx*r,y+ny*r,cz+nz*r);nor.push(nx,ny,nz);const under=sa<-.25,row=i%2===0&&j%2===0&&t>.05&&t<.96;tint.copy(under?(row?pale:mid):back).multiplyScalar(.82+.26*Math.sin(i*1.7+j*2.1));if(!under&&(i*3+j*5)%7===0)tint.multiplyScalar(.6);col.push(tint.r,tint.g,tint.b);bendAt.push(t,phase);}}for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){const a=base+i*(sides+1)+j,b=a+1,c=a+sides+1,d=c+1;order.push(a,c,b,b,c,d);}at+=(rings+1)*(sides+1);};
 // A few long arms rise high; the rest only break the surface in loops, here and there across the mere.
 for(let i=0;i<5;i++){const a=i/5*TAU+.5,r=mere.b*.22,dir=a+.5*Math.sin(i*2.7);limb(Math.sin(a)*r*1.2,Math.cos(a)*r,dir,mere.b*(.55+(i%3)*.14),40+(i*17)%24,3.1,i*1.37);}
 for(let i=0;i<11;i++){const a=i*2.399,r=mere.b*(.3+.52*Math.sqrt(i/11)),dir=a+1.2*Math.sin(i*3.1);limb(Math.sin(a)*r*mere.a/mere.b,Math.cos(a)*r,dir,mere.b*(.36+(i%4)*.09),11+(i*7)%14,1.5+(i%3)*.5,i*2.13,1.02);}
 // Thin feelers around the mouth.
 for(let i=0;i<8;i++){const a=i/8*TAU;limb(Math.sin(a)*10,16+Math.cos(a)*7,a*.35,20+(i%3)*5,16+(i%3)*5,1.1,i*2.1);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new T.Float32BufferAttribute(nor,3));geo.setAttribute('color',new T.Float32BufferAttribute(col,3));geo.setAttribute('bend',new T.Float32BufferAttribute(bendAt,2));geo.setIndex(order);
 const limbs=new T.Mesh(geo,skinMat);limbs.frustumCulled=false;limbs.castShadow=true;group.add(limbs);
 // The great head rises and sinks: a blind bulk, a round mouth full of teeth, little eyes in rows.
 const head=new T.Group(),k=new Kit(),g=new Kit();k.ball(0,0,0,19,'#2d352c',.74);k.ball(0,6,-4,15,'#252c25',.7);for(let i=0;i<26;i++){const a=i*2.399,u=Math.cos(i*.73),r=18;k.ball(Math.sin(a)*r*Math.sqrt(1-u*u*.6),u*10+3,Math.cos(a)*r*Math.sqrt(1-u*u*.6),1+(i%3)*.7,i%2?'#39402f':'#1d231e',.6);}
 for(let i=0;i<22;i++){const a=i/22*TAU;k.limb([[Math.sin(a)*12,-1+Math.cos(a)*9,15,1.6],[Math.sin(a)*9,-1+Math.cos(a)*7,18.6,1.1]],'#4a3030',5);}k.add(k.cylinder(7.8,10,4,22),0,-1,16,1,1,1,'#20100f',0,Math.PI/2);k.column(0,-1,14,5,.2,'#060303',14);
 for(let r=0;r<2;r++)for(let i=0;i<20;i++){const a=(i+r*.5)/20*TAU,w=(9.4-r*2.2),x=Math.sin(a)*w,y=-1+Math.cos(a)*w*.8;k.add(k.cylinder(0,.62,3.4-r*.7,5),x,y,17-r,1,1,1,'#ded4b4',0,Math.PI/2-Math.cos(a)*.5,-Math.sin(a)*.55);}
 for(const [x,y,z,r] of [[-9,10,13.5,1.2],[9,10,13.5,1.2],[-5,12.4,14.2,.8],[5,12.4,14.2,.8],[-13,6,11.5,.85],[13,6,11.5,.85]]){g.ball(x,y,z,r,'#d9c23a');g.ball(x,y,z+r*.55,r*.44,'#120c04');}
 const m=k.mesh(new T.MeshStandardMaterial({vertexColors:true,roughness:.26,metalness:.08}));m.castShadow=true;head.add(m,lit(g));head.position.set(0,-2,4);head.scale.setScalar(.6);group.add(head);
 // The shore: broken stone, the stumps of the holly trees, dead reeds.
 {const s=new Kit();for(let i=0;i<46;i++){const a=i*2.399,q=1.02+((i*37)%19)/19*.26,x=Math.sin(a)*mere.a*q,z=Math.cos(a)*mere.b*q,big=i%5===0;s.rock(x,onShore(x,z)-1,z,big?11:3+(i%4)*1.6,big?7:2+(i%3),big?8:3+(i%3)*1.4,i%3?'#4a4a44':'#3a3f36',i+1);}
  for(let i=0;i<70;i++){const a=i*1.13,q=.82+((i*13)%11)/11*.22,x=Math.sin(a)*mere.a*q,z=Math.cos(a)*mere.b*q,h=5+(i%5)*1.6,lean=((i*7)%5-2)*.35;if(Math.sin(i*.61)>.25)continue;{const b=Math.max(-2,onShore(x,z)-1);s.limb([[x,b,z,.34],[x+lean,b+h*.6,z+lean*.5,.22],[x+lean*2.2,b+h,z+lean,.06]],i%3?'#5a5a38':'#6f6a3e',4);}}
  for(const [x,z,h] of [[-1.16,-.3,9],[-1.06,.5,6],[1.1,-.55,8]]){{const b=onShore(x*mere.a,z*mere.b)-1;s.limb([[x*mere.a,b,z*mere.b,3],[x*mere.a,b+h,z*mere.b,2.2]],'#2e261e',7);}}
  const shore=s.mesh(new T.MeshStandardMaterial({vertexColors:true,roughness:.9}));shore.castShadow=true;group.add(shore);}
 // Mist lying on the black water.
 const mist=[];for(let i=0;i<7;i++){const s=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#8a9690',transparent:true,opacity:.09,depthWrite:false,fog:false}));s.position.set(Math.sin(i*2.4)*mere.a*.6,9,Math.cos(i*2.4)*mere.b*.6);s.scale.set(mere.a*.9,16,1);group.add(s);mist.push(s);}
 group.userData.step=s=>{time.value=s;water.material.uniforms.time.value=s;water.material.uniforms.centre.value.set(group.position.x,group.position.z);head.position.y=-2+Math.sin(s*.42)*2.4;head.rotation.y=Math.sin(s*.19)*.5;head.rotation.x=Math.sin(s*.31)*.08;mist.forEach((q,i)=>{q.position.x=Math.sin(i*2.4+s*.03)*mere.a*.6;});};
 return group;
}

// ---- Water that runs: falls, channels and basins. It takes the place of painted boxes of the same colour ----
export const flowTime={value:0};
export const flowMaterial=()=>new T.ShaderMaterial({vertexColors:true,transparent:true,uniforms:{time:flowTime},
 vertexShader:'varying vec3 vW;varying vec3 vN;varying vec3 vC;void main(){vC=color;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*w;}',
 fragmentShader:`varying vec3 vW;varying vec3 vN;varying vec3 vC;uniform float time;
 float h21(vec2 p){p=fract(p*vec2(.1031,.103));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
 void main(){vec3 N=normalize(vN);float across,along;if(abs(N.y)>.6){across=vW.x*.8;along=vW.z-time*16.;}else{across=(vW.x+vW.z)*.9;along=vW.y+time*34.;}
  float a=vn(vec2(across*.34,along*.05)),b=vn(vec2(across*.8+4.,along*.11));float foam=smoothstep(.5,.82,a*.62+b*.38);
  vec3 view=normalize(cameraPosition-vW);float F=pow(1.-max(dot(N,view),0.),4.);vec3 c=mix(vec3(.05,.2,.25),vC,.4)*(.8+a*.5);c=mix(c,vec3(.86,.94,.96),foam*.72);c+=vec3(.26,.3,.3)*F;
  gl_FragColor=vec4(c,.93);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`});

// ---- The Dark Tower, opened: each storey narrower than the one below, the shaft of fire running up to the Eye ----
const floors=[[26,80,'#161110'],[116,57,'#2c2724'],[220,40,'#26211f'],[312,26,'#221d1b']];
// Sauron's ring forge in the gate hall, on the side the tower opens towards: an open bed of embers, the anvil with a glowing ring on it, a quenching trough and his tools.
// It is drawn without the reveal cut, so the floors above never hide it; its hearth faces the side the tower opens towards.
export const ringForge={x:0,z:30,turn:0};
// The One Ring hangs burning in the air above the hearth, turning slowly, with its fiery letters showing.
export function oneRingInto(g){g.add(g.torus(6,.95),0,0,0,1,1,1,'#ffd27a');g.add(g.torus(6,.4),0,0,.8,1,1,1,'#ff5a12');g.add(g.torus(6,.4),0,0,-.8,1,1,1,'#ff5a12');for(let i=0;i<12;i++){const a=i/12*TAU;g.ball(Math.cos(a)*9.4,Math.sin(a)*9.4,0,.4,'#ffb23a');}}
export function ringForgeInto(k,g){
 k.lights=g;k.local(ringForge.x,ringForge.z,ringForge.turn,()=>{
  // It stands on a raised dais of black glass edged with gold, with a brazier on each corner, so the eye goes to it first.
  k.box(0,25.4,-2,42,1.6,42,'#0e0b0a');for(const [x,z,w,d] of [[0,19,42,.5],[0,-23,42,.5],[21,-2,.5,42],[-21,-2,.5,42]])g.box(x,26.9,z,w,.25,d,'#ffb23a');for(const s of [-1,1])for(const t of [-1,1]){k.cyl(s*19,27,-2+t*19,2.4,1.4,7,'#1c1815',8);k.cyl(s*19,34,-2+t*19,3,2.2,1.6,'#3a332e',8);g.lamp(s*19,37,-2+t*19,2.4);}
  // Molten gold runs from the hearth in a channel down to the anvil.
  g.box(0,26.95,-1,1.6,.3,8,'#ffc23a');g.box(0,26.9,-1,3,.2,8,'#ff5a12');
k.box(0,26,-11,26,10,16,'#1c1815');k.box(0,36,-11,28,1.4,18,'#2a2622');g.box(0,36.6,-11,20,.6,11,'#ff5a12');g.box(0,37,-11,12,.6,6,'#ffc23a');for(let i=0;i<9;i++)g.ball(-8+i*2,37.6+(i%3)*.5,-11+((i*5)%7)-3,.9+(i%2)*.5,i%3?'#ff7a2a':'#ffd27a');for(const s of [-1,1])k.box(s*15,26,-11,3,16,3,'#2a2622');
  k.box(0,26,8,5,7,4,'#2a2826');k.box(0,33,8,13,3.2,6,'#3f3c39');k.box(8,33.6,8,4,2,3,'#3f3c39');for(let i=0;i<12;i++){const a=i/12*TAU;g.ball(Math.cos(a)*1.5,36.5,8+Math.sin(a)*1.5,.42,'#ffd27a');}g.ball(0,36.6,8,.5,'#ff8a2a');
  k.box(-17,26,6,9,6,16,'#2a2320');g.box(-17,32.05,6,7.4,.2,14.4,'#5a1206');k.box(16,26,4,10,14,3,'#2a2320');for(const [x,h] of [[12.5,10],[15,12],[17.5,9],[20,11]])k.box(x,40,4.4,.8,h,.8,'#3a3734');});k.lights=null;
}
export function towerInside(k,g){
 const black='#231f1c',iron='#3a3734',steel='#6a6a6c',red='#6a1208';
 // Glows inside a turned frame must turn with it, so the light kit follows each local frame.
 const lit=(x,z,ry,build)=>{k.lights=g;k.local(x,z,ry,build);k.lights=null;};
 for(const [y,r,c] of floors){k.column(0,y-3,0,r,3,c,36);k.column(0,y-3.6,0,r+1.2,.8,iron,36);for(let i=0;i<36;i++){const a=i*2.399,q=Math.sqrt((i+.5)/36)*r*.92;k.box(Math.sin(a)*q,y,Math.cos(a)*q,7,.14,5,'#1a1614',a);}}
 // The shaft: an iron cage around a pillar of fire, broken only by the floors.
 g.column(0,26,0,3.6,350,'#ff6a1a',12);g.column(0,26,0,1.9,350,'#ffd27a',8);for(let y=30;y<376;y+=9){k.column(0,y,0,7.4,.8,iron,12);}for(let i=0;i<8;i++){const a=i/8*TAU;k.column(Math.sin(a)*7.4,26,Math.cos(a)*7.4,.6,350,iron,5);}
 // Stairs winding up inside the wall.
 const stairs=(y0,y1,r0,r1,start)=>{const n=30;for(let i=0;i<n;i++){const t=i/n,a=start+t*TAU*.72,r=r0+(r1-r0)*t;k.box(Math.sin(a)*r,y0+(y1-y0)*t,Math.cos(a)*r,13,1.8,6,'#3a342f',a);}};
 stairs(26,116,78,72,3.95);stairs(116,220,50,36,-1);stairs(220,312,28,20,1);
 // The gate hall: pillars, forges, weapons, the map of the war.
 for(let i=0;i<10;i++){const a=(i+.5)/10*TAU,x=Math.sin(a)*58,z=Math.cos(a)*58;k.cyl(x,26,z,4,5.6,86,black,8);k.column(x,26,z,7,3,iron,8);k.cone(x,104,z,5,8,iron,6);}
 for(let i=0;i<3;i++){const a=2.515+i*.628,x=Math.sin(a)*68,z=Math.cos(a)*68;lit(x,z,a+Math.PI,()=>{k.box(0,26,0,24,24,12,'#1c1815');k.box(0,26,6.2,18,14,.5,'#060403');g.box(0,27,6.5,14,10,.3,'#ff6a1a');g.box(0,28,6.7,8,6,.3,'#ffc23a');k.box(0,50,0,10,34,8,'#191613');});}
 lit(0,-30,0,()=>{k.box(0,26,0,44,11,24,'#2a2320');k.box(0,37,0,47,1.2,27,'#3a2f28');k.box(0,38.2,0,38,.3,20,'#6a5a40');for(const [a,b] of [[-12,-3],[-3,5],[8,-5],[13,4]])g.ball(a,39,b,1,'#ff7a2a');});
 for(let i=0;i<7;i++){const a=-2.3+i*.14;k.box(Math.sin(a)*72,26,Math.cos(a)*72,.8,34,.8,'#3a2a18');k.cone(Math.sin(a)*72,60,Math.cos(a)*72,1.6,6,steel,4);}
 // The floor of the gate hall is the Eye itself: a gold almond of light on black glass, the ring of fire as its iris and the burning shaft as its pupil.
 {const eye=(sign)=>{const n=18;for(let i=0;i<n;i++){const t0=-1+2*i/n,t1=-1+2*(i+1)/n,x0=30*t0,x1=30*t1,z0=sign*10*(1-t0*t0),z1=sign*10*(1-t1*t1),len=Math.hypot(x1-x0,z1-z0);g.box((x0+x1)/2,26.12,(z0+z1)/2,.9,.24,len+.3,'#ffb23a',Math.atan2(x1-x0,z1-z0));}};eye(1);eye(-1);
  g.add(g.torus(11,.8),0,26.2,0,1,1,1,'#b8300a',0,Math.PI/2);g.add(g.torus(8.6,.35),0,26.25,0,1,1,1,'#ffb23a',0,Math.PI/2);for(let i=0;i<24;i++){const a=i/24*TAU;g.box(Math.sin(a)*13.4,26.1,Math.cos(a)*13.4,.3,.2,2.6+(i%3),'#ff7a2a',a);}
  // A ring of fiery letters, as on the One Ring, runs round the Eye wherever the floor is free.
  for(let i=0;i<64;i++){const a=i/64*TAU,x=Math.sin(a)*40,z=Math.cos(a)*40;if(Math.abs(x)<20&&z>0||Math.abs(x)<26&&z<0)continue;const w=[1.4,.5,2.2,.9][i%4],d=[.6,2,.8,1.6][(i*3)%4];g.box(x,26.1,z,w,.2,d,'#ffb23a',a+(i%2)*.5);if(i%3===0)g.ball(x+Math.cos(a)*1.4,26.15,z-Math.sin(a)*1.4,.4,'#ffd27a',.4);}
  // A moat of molten rock between black kerbs closes the floor in, just inside the pillars.
  g.add(g.torus(50,1.1),0,25.6,0,1,1,1,'#7a1804',0,Math.PI/2);g.add(g.torus(50,.32),0,26.6,0,1,1,1,'#e8560e',0,Math.PI/2);for(const r of [47.6,52.4])k.add(k.torus(r,.9),0,26.3,0,1,1,1,'#0c0a09',0,Math.PI/2);
  // Fine cracks of ember run through the black glass.
  for(let i=0;i<46;i++){const a=i*2.399,r=17+((i*37)%28),x=Math.sin(a)*r,z=Math.cos(a)*r;if(Math.abs(x)<19&&z>9||Math.abs(x)<25&&z<-15)continue;g.box(x,26.06,z,.22,.12,3+(i%4)*1.6,i%5?'#8a1c06':'#ff4a12',a*1.7);}}
 // Each pillar carries veins of fire up its inner face and an iron bowl of flame.
 for(let i=0;i<10;i++){const a=(i+.5)/10*TAU,s=Math.sin(a),c=Math.cos(a);for(const [o,h] of [[-1.6,64],[1.4,48]])g.box(s*53.2+c*o,26,c*53.2-s*o,.5,h,.4,'#ff4a12',a);k.box(s*52,70,c*52,3,1.2,5,iron,a);k.cyl(s*50.5,71,c*50.5,3.2,1.6,2.6,iron,8);g.lamp(s*50.5,77,c*50.5,2.2);}
 // A fall of molten rock pours down the eastern wall into a glowing basin.
 {k.box(77,26,0,4,80,16,'#120d0b');for(const [z,w,c] of [[0,9,'#ff5a12'],[0,4,'#ffc23a'],[-3,1.2,'#ffe8a0']])g.box(74.8,26,z,1,76,w,c);for(const [y,z,r] of [[44,-7,4],[62,6,3.4],[82,-6,3.8],[96,5,3]])k.rock(75.5,y,z,r,r*.8,r,'#1a1310',y);g.column(68,26.1,0,8.6,.5,'#ff6a1a',18);g.column(68,26.2,0,5,.5,'#ffc23a',14);k.add(k.torus(8.8,1),68,26.4,0,1,1,1,'#0c0a09',0,Math.PI/2);}
 // Banners of the Lidless Eye hang between the pillars.
 for(const a of [1.885,-1.885,2.2,-2.2]){const x=Math.sin(a)*74,z=Math.cos(a)*74;lit(x,z,a+Math.PI,()=>{k.box(0,58,0,10,40,.5,'#1a0806');k.box(0,98,0,13,1.4,1.4,iron);g.box(0,82,.4,6.4,3.6,.3,'#c0300a');g.box(0,82,.6,2.4,2,.3,'#ffb23a');g.box(0,82,.8,.5,3.6,.3,'#050302');});}
 // The throne room: the black seat on its steps, braziers, banners of the Eye.
 for(let i=0;i<3;i++)k.box(0,116+i*3,-34-i*2,40-i*8,3,20-i*2,i%2?'#2e2a26':'#1d1a17');
 k.box(0,125,-38,16,10,10,'#0b0a09');k.box(0,135,-43,16,44,2.4,'#0b0a09');for(const s of [-1,1]){k.box(s*8,125,-38,2.4,12,10,'#141210');k.cone(s*8,179,-43,2,14,iron,5);k.cone(s*3,179,-43,1.5,9,iron,5);}k.cone(0,179,-43,2.4,18,iron,5);
 for(const s of [-1,1]){k.column(s*26,116,-22,1.4,22,iron,6);k.cyl(s*26,138,-22,5,1.6,3,iron,8);g.lamp(s*26,144,-22,4.4);lit(s*40,-30,-s*.8,()=>{k.box(0,120,0,14,60,.6,'#180a08');g.box(0,150,.4,8,4,.3,'#b52a0a');g.box(0,150,.6,2.6,1.8,.3,'#ffb23a');g.box(0,150,.8,.5,3.6,.3,'#060302');});}
 // The chamber of the seeing stone of Minas Ithil, with shelves of dark records and chains.
 k.column(0,220,-22,7,3,'#141210',10);k.cyl(0,223,-22,2.4,4,10,'#17151a',8);k.cyl(0,233,-22,5,2.4,3,iron,8);g.ball(0,240,-22,5,'#d0480a');g.ball(0,240,-22,3,'#ffb04a');
 for(let i=0;i<5;i++){const a=2+i*.55,x=Math.sin(a)*33,z=Math.cos(a)*33;lit(x,z,a+Math.PI,()=>{k.box(0,220,0,15,46,4,'#1a1613');for(let r=0;r<4;r++){k.box(0,226+r*10,1.8,13,.7,3,'#2a2420');for(let c=0;c<5;c++)k.box(-5+c*2.5,227+r*10,2.2,1.5,6+(c%3),1.8,['#3a1a14','#26221c','#4a4034'][c%3]);}});}
 for(const x of [-30,30])for(let c=0;c<9;c++)k.box(x,300-c*5,-2,c%2?.8:2,4,c%2?2:.8,iron);
 // The top: the great ring that gathers the fire and feeds the horns.
 k.add(k.torus(16,2.2),0,340,0,1,1,1,iron,0,Math.PI/2);k.add(k.torus(11,1.2),0,352,0,1,1,1,'#58504a',0,Math.PI/2);for(let i=0;i<6;i++){const a=i/6*TAU;k.limb([[Math.sin(a)*16,340,Math.cos(a)*16,1.2],[Math.sin(a)*8,330,Math.cos(a)*8,.8],[Math.sin(a)*7,320,Math.cos(a)*7,.8]],iron,5);}g.column(0,312,0,6,60,'#ff5a14',10);
 k.column(0,376,0,36,3,black,24);
 for(let i=0;i<14;i++){const a=i/14*TAU;for(const [y,r] of [[60,84],[150,62],[262,38]]){g.box(Math.sin(a)*r,y,Math.cos(a)*r,.7,8,.7,'#ff6a1a');}}
}
export const towerGuards=[[-34,26,-58,.4,'uruk','sword'],[34,26,-58,-.4,'uruk','sword'],[34,26,-12,.2,'orc','pick'],[-58,26,-16,1.2,'orc','sword'],[-14,116,-20,.3,'uruk','sword'],[14,116,-20,-.3,'uruk','sword'],[-24,116,-4,.8,'orc','sword'],[-10,220,-16,.5,'orc','scroll'],[12,220,-14,-.5,'orc','book']];
export function towerFolk(group){const out=[];for(const [x,y,z,h,p,tool] of towerGuards){const f=makeFigure(p,tool);f.position.set(x,y,z);f.rotation.y=h;f.traverse(n=>{if(n.isMesh)n.castShadow=false;});f.userData.pose(0,0,false);group.add(f);out.push(f);}return out;}

// ---- The treasures of the houses, each where its own story keeps it. All stand clear of the benches and the ways ----
export const houseRelics={
 // Bag End: the Ring in its envelope on the table, the Red Book, Sting above the mantel, Gandalf's mark on the door, fireworks in their crate.
 messengers(k,g){
  k.column(-14,13.9,-68,4.2,.7,'#6e2f1c',14);k.column(-14,14.6,-68,3.2,.3,'#8f3c24',14);k.box(-15.5,13.9,-55,8,.3,6,'#d8cfae',.2);k.box(-15.5,14.2,-55,3,.25,3,'#8f2a1a',.2);
  k.box(29,13.9,-57,10,2.4,7.4,'#7a1f18',-.2);k.box(29,16.3,-57,9.4,.2,6.8,'#d8cfae',-.2);k.box(29,16.5,-57,10,.2,7.4,'#7a1f18',-.2);
  k.local(Math.sin(.95)*116,-Math.cos(.95)*116,-.95,()=>{k.limb([[-15,44,7.8,.45],[0,44,7.8,.4],[12,44,7.8,.14]],'#b8ccd8',4);k.box(-15,42,7.8,1.2,4,1,'#3a2a18');k.box(-15.6,44,7.8,.8,1,5,'#c9962d');});
  k.local(Math.sin(-1.25)*116.4,-Math.cos(-1.25)*116.4,1.25,()=>{for(const [a,b,c,d] of [[-4,28,0,34],[0,34,4,28],[-3,31,3,31]])g.limb([[a,b,3.2,.28],[c,d,3.2,.28]],'#9fd8ff',3);});
  k.box(-96,0,22,15,10,12,'#6a4a26',.5);for(let i=0;i<5;i++){k.cyl(-96-5+i*2.6,10,20+(i%2)*3,1,1.2,8+(i%3)*2,['#8f2a1a','#27465e','#c9962d'][i%3],7);k.cone(-96-5+i*2.6,18+(i%3)*2,20+(i%2)*3,1.3,3,'#d8cfae',6);}
 },
 // Orthanc: the high seat before the stone, the casks of blasting fire, the White Hand.
 isengard(k,g){
  k.local(-58,-70,.72,()=>{for(let i=0;i<3;i++)k.box(0,i*2.6,-i*1.5,30-i*6,2.6,22-i*3,i%2?'#1a1a1f':'#25252b');k.box(0,8,0,14,8,11,'#08080a');k.box(0,16,-5,14,40,2.2,'#08080a');for(const s of [-1,1]){k.box(s*7,8,0,2.2,12,11,'#121216');k.cone(s*7,56,-5,1.6,12,'#3a3a40',4);}k.cone(0,56,-5,2,18,'#3a3a40',4);k.box(0,34,-3.6,4,6,.3,'#e7e7df');k.limb([[13,0,4,.5],[12.4,30,3,.45],[12,52,3,.35]],'#d8d8d0',5);g.ball(12,55,3,1.3,'#dff2ff');});
  for(const [x,z,r] of [[80,34,0],[68,46,1],[82,52,2]]){k.cyl(x,6,z,5,6,6,'#3a2a18',10);k.cyl(x,0,z,6,5,6,'#3a2a18',10);k.column(x,3,z,6,.9,'#141417',10);k.column(x,9,z,6,.9,'#141417',10);k.column(x,12,z,3,.5,'#55391c',8);}k.limb([[80,13,34,.2],[74,16,40,.15],[68,13,46,.2]],'#c9b98c',3);g.ball(74,16.4,40,.7,'#ff9a3a');
 },
 // Rivendell: Thrór's map lies on the table, its moon-letters shining; Vilya rests on a little stand.
 library(k,g){
  k.box(24,13.9,-60,18,.25,13,'#c9b070',.1);k.box(24,14.2,-60,15,.1,10,'#9c7f45',.1);for(const [a,b,c] of [[-5,-2,.4],[0,1,-.3],[4,-3,.8]])k.box(24+a,14.34,-60+b,5,.05,.5,'#3a2a1a',c);for(let i=0;i<8;i++)g.box(18+i*1.7,14.4,-55.6,.9,.05,.5,'#bfe6ff');
  k.column(95,0,-12,3.2,1.2,'#b5a578',10);k.cyl(95,1.2,-12,.9,1.8,15,'#ece6cf',8);k.cyl(95,16.2,-12,2.6,.9,1.6,'#c9a24a',10);k.add(k.torus(1.4,.34),95,19.2,-12,1,1,1,'#ffe39a',0,Math.PI/2);g.ball(95,20.8,-12,.78,'#5a9cff');
 },
 // Lothlórien: elven cloaks with their leaf brooches, lembas in its leaves.
 lorien(k,g){
  for(const [x,z] of [[-30,84],[-6,92],[18,88]]){k.column(x,0,z,1.2,1,'#b5b7a6',8);k.column(x,1,z,.5,26,'#b5b7a6',6);k.box(x,26,z,12,.6,.6,'#b5b7a6');k.limb([[x,25,z,4],[x,14,z,5.5],[x,4,z-.4,6.2]],'#7c8270',8);k.add(k.octa(1),x+1.4,23,z+4,.9,1.4,.3,'#7fb070');}
  k.column(42,0,-84,4,1,'#c9c9b8',10);k.cyl(42,1,-84,.8,1.6,15,'#dcdccb',8);k.cyl(42,16,-84,2.4,.8,1.6,'#c9b878',10);
  k.box(58,0,82,20,6,12,'#b5b7a6');k.box(58,6,82,22,.8,14,'#dcdccb');for(let i=0;i<6;i++){k.box(50+(i%3)*8,6.8,78+(i>2?7:0),6.4,1,6.4,'#c9b878',.3);k.box(50+(i%3)*8,7.8,78+(i>2?7:0),5,.4,5,'#7f8a3a',.3);}
 },
 // Mirkwood: the king's elk in carved wood, his crown of autumn leaves on its stand.
 council(k,g){
  k.local(-68,76,1.1,()=>{k.limb([[0,22,-16,8],[0,24,0,8.4],[0,25,14,7.2]],'#6a4a26',10);k.limb([[0,28,16,4.4],[0,38,24,3.2],[0,44,28,2.8]],'#6a4a26',8);k.limb([[0,45,28,3],[0,44,36,2],[0,42,40,1.2]],'#7a5a30',7);for(const [x,z] of [[-5,-16],[5,-16],[-5,12],[5,12]])k.limb([[x,20,z,2.2],[x,10,z,1.3],[x,0,z,1]],'#55391c',6);for(const s of [-1,1]){k.limb([[s*2,48,27,1],[s*12,60,20,.8],[s*18,76,14,.5],[s*16,92,10,.15]],'#a0815a',6);for(let i=0;i<5;i++){const t=i/4;k.limb([[s*(6+t*12),53+t*22,24-t*11,.5],[s*(14+t*12),64+t*22,27-t*7,.1]],'#a0815a',4);}}});
  k.column(92,0,42,3.4,1.4,'#3f2f1e',10);k.column(92,1.4,42,.9,18,'#4a3a26',8);k.add(k.torus(3.2,.4),92,22,42,1,1,1,'#7a4a1c',0,Math.PI/2);for(let i=0;i<10;i++){const a=i/10*TAU;k.add(k.octa(1),92+Math.sin(a)*3.4,24,42+Math.cos(a)*3.4,.9,2.6,.3,i%2?'#b5702a':'#c9962d',a);}
 },
 // Moria: Balin's tomb with the Book of Mazarbul, the mithril coat, a shaft of light from above.
 forge(k,g){
  k.box(38,0,90,44,4,26,'#b4b2a8');k.box(38,4,90,34,9,16,'#d8d6ca');k.box(38,13,90,37,1.4,19,'#c5c3b6');for(let i=0;i<9;i++)k.box(23+i*3.7,6.6,98.2,1.1,3.6,.2,'#47443e');k.box(38,14.4,90,11,1.2,8,'#3a2a1a');k.box(38,15.6,90,10,.3,7.4,'#d8cfae');k.limb([[33,15.9,88,.1],[43,15.9,91,.1]],'#26211a',3);for(const s of [-1,1])k.limb([[38+s*18,0,104,.8],[38+s*19,3,106,.4]],'#c5c3b6',4);
  for(const [x,z] of [[-2,112],[66,98],[66,76]]){k.rock(x,0,z,5,3,4,'#e0ddcc',x);k.ball(x,4,z,2,'#d8d4c0',.9);}
  k.limb([[6,0,106,.5],[10,5,106,.4],[14,2,108,.3]],'#54565a',4);
  k.column(-40,0,92,5,1.4,'#26211a',10);k.column(-40,1.4,92,1,28,'#26211a',8);k.box(-40,30,92,18,1,1,'#26211a');k.limb([[-40,31,92,6],[-40,20,92,5.4],[-40,9,92,5]],'#dfe9ef',10);for(const s of [-1,1])k.limb([[-40+s*6,29,92,2.6],[-40+s*10,21,92,1.9]],'#dfe9ef',6);k.column(-40,33,92,2.3,1,'#c8dbe6',8);for(let i=0;i<5;i++)k.add(k.torus(5.6-i*.1,.2),-40,12+i*4,92,1,1,1,'#c8dbe6',0,Math.PI/2);
 },
 // Erebor: Thrór's throne of gold under the mountain, the Black Arrow on the windlance of Dale.
 treasury(k,g){
  k.local(120,18,-1.4,()=>{for(let i=0;i<4;i++)k.box(0,i*3,-i*2.2,40-i*7,3,36-i*4,i%2?'#deb04a':'#4c4534');k.box(0,12,-8,20,10,14,'#c9962d');k.box(0,22,-14,20,42,3,'#c9962d');k.box(0,22,-12.4,15,36,.6,'#5e5a4c');for(const s of [-1,1]){k.box(s*11,12,-8,3,18,14,'#ffdc7a');k.cone(s*11,64,-14,3,18,'#ffdc7a',4);}k.cone(0,64,-14,4,28,'#ffdc7a',4);g.lamp(0,52,-12,2.6);for(let i=0;i<6;i++){const y=26+i*5;for(const s of [-1,1])k.box(s*5,y,-12,.4,4,.2,'#ffdc7a');}});
  k.local(72,62,-.8,()=>{k.box(0,0,0,18,6,30,'#3a2a18');k.box(0,6,8,3.6,14,3.6,'#3a2a18');k.box(0,20,8,30,1.4,2,'#2a1d10');k.limb([[-15,20.6,8,.2],[0,20.6,-8,.25],[15,20.6,8,.2]],'#d8cfae',3);k.box(0,20.6,-2,1,1,26,'#2a1d10');k.limb([[0,22,-12,.3],[0,22,8,.28],[0,22,13,.05]],'#0b0b0d',4);k.cone(0,21.6,13,.5,2,'#0b0b0d',4);});
 },
 // Helm's Deep: the Horn of Helm Hammerhand on its oak stand, saddles of the Riddermark.
 scouts(k,g){
  k.box(-56,0,70,22,3,14,'#4a3219');k.box(-64,3,70,2.4,16,10,'#4a3219');k.box(-48,3,70,2.4,16,10,'#4a3219');k.box(-56,18,70,20,1.4,10,'#6d6854');k.limb([[-66,22,70,.6],[-60,21,70,1.1],[-52,22,70,1.9],[-45,25,70,3.2]],'#d8cfae',10);k.column(-61,20,70,1.3,.4,'#c9a23c',8);k.column(-50,20.5,70,2.4,.5,'#c9a23c',10);k.add(k.torus(3.2,.3),-45,25,70,1,1,1,'#c9a23c',Math.PI/2);
  for(let i=0;i<3;i++){const x=32+i*17,z=74-i*5;k.box(x,0,z,2,10,8,'#4a3219');k.box(x,10,z,12,1.4,10,'#4a3219');k.limb([[x-5,12.6,z,1.2],[x,14,z,1.6],[x+5,12.6,z,1.2]],'#6e3f20',6);k.box(x,8,z+3,3,3.4,.3,'#2f5a30');}
 },
 // The Tower Hall: the broken horn of Gondor on the Steward's table, the winged crown awaiting the King, the white tree in leaf-silver.
 gate(k,g){
  k.limb([[-58,14.4,-14,.4],[-53,14.6,-12,.8],[-49,15,-11,1.3]],'#d8cfae',8);k.limb([[-46,14.4,-5,1],[-42,14.8,-5,1.5],[-38,15,-7,2.1]],'#d8cfae',8);k.column(-53,14.3,-12,1,.3,'#ece9dc',8);
  k.column(0,0,-48,4.6,1.2,'#26262a',10);k.column(0,1.2,-48,1.3,20,'#26262a',8);k.column(0,21.2,-48,3,.8,'#a7a496',10);k.dome(0,22,-48,2.9,'#e4e6e6',1.1);k.column(0,22,-48,3.1,.5,'#c9a24a',12);for(const s of [-1,1])for(let i=0;i<4;i++)k.add(k.cube(),s*(3+i*.5),24+i*1.6,-48-i*.3,.4,3.4-i*.3,1.6,'#f3f4f4',0,0,s*-.42);
 },
 // Osgiliath: a fallen king's head from the river, the Star of Elendil on its cushion.
 observatory(k,g){
  k.local(-76,68,.9,()=>{k.ball(0,12,0,12,'#a8a58f',1.15);k.box(0,0,0,26,3,22,'#7c796a');k.limb([[0,8,10,3],[0,6,13,2.2]],'#8f8c78',6);for(const s of [-1,1]){k.box(s*5,15,11,4,1,1.4,'#6a6858');k.column(s*12,20,-2,2,5,'#a8a58f',5);}k.column(0,23,0,12.6,4,'#b5a578',18);for(let i=0;i<9;i++){const a=i/9*TAU;k.cone(Math.sin(a)*11,27,Math.cos(a)*11,2,6-(i%3),'#b5a578',4);}for(let i=0;i<7;i++)k.rock(-16+i*5,0,14+(i%3)*2,3.6,2,2.6,'#8f8c78',i);});
  k.column(96,0,-22,4,1.2,'#5c584d',10);k.column(96,1.2,-22,1.2,17,'#7c796a',8);k.column(96,18,-22,3.6,.8,'#274887',10);k.box(96,18.8,-22,5,1,5,'#274887');g.add(k.octa(1),96,21.6,-22,1.3,1.8,1.3,'#eaf4ff',.7);
 },
};
