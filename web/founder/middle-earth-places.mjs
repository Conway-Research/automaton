// The western sea, the Grey Havens, Mount Doom's road, the rooms below the land and the great treasures of the halls.
// Pure drawing. No data from the server and no server access.
import {THREE as T,Kit,glowing,makeFigure,worldDay,flameSheet,fireAt} from './middle-earth-3d.mjs';

const lit=k=>{const m=k.mesh(glowing);m.castShadow=false;m.receiveShadow=false;return m;};
const litInto=(k,g,x,y,z,r)=>g.lamp(x,y,z,r);
// Two-sided skin between three points, for wings and cloth.
const skin=(k,a,b,c,color)=>{const t=new T.Color(color),u=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),v=new T.Vector3(c[0]-a[0],c[1]-a[1],c[2]-a[2]),n=u.cross(v).normalize();for(const [p,s] of [[a,1],[b,1],[c,1],[a,-1],[c,-1],[b,-1]]){k.pos.push(p[0],p[1],p[2]);k.nor.push(n.x*s,n.y*s,n.z*s);k.col.push(t.r,t.g,t.b);}};

// ---- The sea Frodo crosses: long grey-green swells under a golden evening, thinning into mist in the far west ----
export function seaMaterial(depth,extent,sun,flow){
 const map=new T.DataTexture(depth.data,depth.width,depth.height,T.RGBAFormat);map.magFilter=map.minFilter=T.LinearFilter;map.needsUpdate=true;
 const half=new Uint16Array(flow.data.length);for(let i=0;i<half.length;i++)if(flow.data[i])half[i]=T.DataUtils.toHalfFloat(flow.data[i]);
 const streams=new T.DataTexture(half,flow.width,flow.height,T.RGBAFormat,T.HalfFloatType);streams.magFilter=streams.minFilter=T.LinearFilter;streams.needsUpdate=true;
 const m=new T.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{reflectMap:{value:null},reflectOn:{value:0},viewSize:{value:new T.Vector2(1,1)},seaDay:worldDay,time:{value:0},depthMap:{value:map},streamMap:{value:streams},box:{value:new T.Vector4(extent.x,extent.y,extent.w,extent.h)},sunDir:{value:new T.Vector3(sun.x,sun.y,sun.z).normalize()}},
  vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`varying vec3 vW;uniform sampler2D reflectMap;uniform float reflectOn;uniform vec2 viewSize;uniform float seaDay;uniform float time;uniform sampler2D depthMap;uniform sampler2D streamMap;uniform vec4 box;uniform vec3 sunDir;
  float h21(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
  float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
  vec2 wave(vec2 p,vec2 d,float f,float a,float s){return d*cos(dot(d,p)*f+time*s)*a*f;}
  void main(){
   vec3 view=cameraPosition-vW;float dist=length(view);vec3 V=view/dist;vec2 p=vW.xz;
   // Fine ripples fade with distance long before they could shrink to a single pixel: water never sparkles or flickers.
   float nearA=1./(1.+dist/2400.),nearB=1./(1.+dist/700.),nearC=1./(1.+dist/220.);
   vec2 warp=p+vec2(vn(p*.0021),vn(p.yx*.0023))*210.;
   vec2 uv=(p-box.xy)/box.zw;bool inBox=!(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.);float d=inBox?texture2D(depthMap,uv).r:1.;
   // Rivers: the pattern travels along the course, fast in the middle and slow at the banks.
   vec4 st=inBox?texture2D(streamMap,uv):vec4(0.);float river=st.b*(1.-smoothstep(.16,.42,d));float pace=1.-.5*smoothstep(4.,20.,abs(st.g));float s1=vn(vec2(st.r*.05-time*2.1*pace,st.g*.42)),s2=vn(vec2(st.r*.07-time*3.3*pace,st.g*.42+5.)),s3=vn(vec2(st.r*.024-time*1.2*pace,st.g*.2+9.));
   vec2 g=wave(warp,vec2(.84,.54),.017,8.6,.92)*nearA+wave(warp,vec2(.46,.89),.029,4.6,1.2)*nearA;
   g+=wave(warp,vec2(.98,-.2),.071,1.9,1.7)*nearB+wave(warp,vec2(-.34,.94),.117,1.05,2.2)*nearB;
   g+=wave(warp,vec2(.62,-.78),.27,.34,3.1)*nearC+wave(warp,vec2(-.8,-.6),.43,.16,4.)*nearC;
   g+=vec2(vn(p*.31+vec2(time*.42,-time*.2))-.5,vn(p.yx*.36-vec2(time*.3,time*.46))-.5)*.2*nearC+vec2(vn(p*.9+time*.7)-.5,vn(p.yx*1.05-time*.8)-.5)*.1*nearC;
   float s4=vn(vec2(st.r*.16-time*5.2*pace,st.g*.8+3.));
   g=mix(g,vec2(s1-.5,s2-.5)*.62*nearB+vec2(s3-.5,s1-.5)*.34*nearA+vec2(s4-.5,s2-.5)*.3*nearC,river);
   vec3 N=normalize(vec3(-g.x,1.,-g.y));
   float F=.022+.978*pow(1.-max(dot(N,V),0.),5.);
   vec3 R=reflect(-V,N);R.y=abs(R.y);
   vec3 sky=mix(vec3(.82,.6,.39),vec3(.36,.47,.56),smoothstep(0.,.5,R.y));sky=mix(sky,vec3(1.25,.82,.45),pow(max(dot(normalize(vec3(R.x,R.y*.6,R.z)),sunDir),0.),6.)*.75);
   sky*=mix(vec3(.05,.07,.13),vec3(1.),seaDay);vec3 deep=vec3(.018,.078,.112)*mix(.2,1.,seaDay),shallow=vec3(.07,.235,.232)*mix(.2,1.,seaDay);vec3 body=mix(shallow,deep,smoothstep(.02,.55,d));
   // A river is clear over its bed: pale at the banks, darker in the channel, with long streaks drawn out by the current.
   float bankSide=smoothstep(4.,24.,abs(st.g));body=mix(body,mix(vec3(.03,.13,.15),vec3(.12,.25,.215),bankSide)*mix(.2,1.,seaDay),river);body+=vec3(.05,.085,.08)*smoothstep(.56,.8,vn(vec2(st.r*.022-time*2.7*pace,st.g*.5)))*river*nearB*mix(.2,1.,seaDay);
   float swell=smoothstep(.3,.9,vn(warp*.0052+time*.03));body+=vec3(.012,.028,.028)*swell;
   // The crests of the swells catch the light and run towards the land.
   float crest=.5+.5*cos(dot(vec2(.84,.54),warp)*.017+time*.92);float crestB=.5+.5*cos(dot(vec2(.98,-.2),warp)*.071+time*1.7);body+=vec3(.03,.07,.066)*pow(crest,3.)*nearA+vec3(.02,.05,.046)*pow(crestB,3.)*nearB;
   // From above the mirror is weak, so the slopes of the waves also shade the water itself.
   body+=vec3(.13,.2,.2)*clamp(dot(g,vec2(.7,.6)),-.14,.34);
   vec3 c=mix(body,sky,F);
   // A light mirror image: shores, towers and sky, broken up by the waves.
   if(reflectOn>.002){vec2 su=gl_FragCoord.xy/viewSize,ru=clamp(vec2(su.x,1.-su.y)+g*vec2(.09,.16),.002,.998);c=mix(c,texture2D(reflectMap,ru).rgb,clamp(F*1.1+.13,0.,.58)*reflectOn);}
   float glitter=pow(max(dot(R,sunDir),0.),320.)*nearA*5.;c+=vec3(1.5,1.,.56)*glitter;
   // White water breaks where a long swell and a short one meet, and is carried along with them.
   float crestC=mix(.5,.5+.5*cos(dot(vec2(.62,-.78),warp)*.27+time*3.1),nearC);float caps=smoothstep(.84,.98,crestB*.62+crestC*.38)*smoothstep(.56,.8,vn(warp*.07+vec2(time*.09,-time*.05)))*smoothstep(.08,.3,d)*nearB*1.5;c=mix(c,vec3(.74,.8,.8),clamp(caps*(1.-river),0.,.42));
   // In a river, foam streaks ride on the current and gather along the banks.
   float rush=smoothstep(.66,.9,s1*.55+s2*.45)*nearB*1.05+smoothstep(.6,.95,abs(st.g)/22.)*smoothstep(.45,.75,s2)*.42*nearB;c=mix(c,vec3(.62,.76,.76)*mix(.25,1.,seaDay),clamp(rush*river,0.,.42));
   // The surf where the sea runs up against the land.
   float n=vn(p*.052+time*.05)*.7+vn(p*.14-time*.07)*.3;float line=smoothstep(.1,.015,d)*(.42+.58*sin(d*70.-time*1.3+n*7.))*smoothstep(.34,.62,n);c=mix(c,vec3(.74,.78,.76),clamp(line*(1.-river),0.,.8));
   // Towards the undying lands the air turns to white mist and gold.
   c*=mix(.32,1.,seaDay);float haze=1.-exp(-dist/15000.),west=smoothstep(-500.,-5200.,vW.x);c=mix(c,mix(vec3(.46,.5,.52),vec3(.98,.76,.47),west*.72)*mix(.1,1.,seaDay),clamp(haze+west*.2,0.,1.));
   float a=mix(.5,.985,smoothstep(0.,.18,d))*(1.-smoothstep(26000.,52000.,dist));
   gl_FragColor=vec4(c,a);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 return m;
}
// A low bank of mist over the far water.
export function seaMist(puff,scene){
 const list=[];for(let i=0;i<34;i++){const s=new T.Sprite(new T.SpriteMaterial({map:puff,color:i%3?'#d8c7a4':'#ffdca0',transparent:true,opacity:.2+(i%4)*.05,depthWrite:false,fog:false}));const a=i*.31,x=-1500-(i%7)*760,z=800+Math.sin(a*2.3)*2600+(i-17)*190;s.scale.set(2200+(i%5)*700,300+(i%3)*150,1);s.position.set(x,90+(i%4)*40,z);scene.add(s);list.push({s,x,z,a});}
 return list;
}

// ---- The Grey Havens ----
// A hull of long white strakes, the swan's neck rising from the bow, carved wings along the sides, one great sail.
function shipInto(k,g,L,B,H){
 const pearl='#e9e6da',silver='#c7ccd0',shade='#b9b7aa',gold='#c9a84e';
 const beam=(t,level)=>B*Math.pow(Math.max(0,1-Math.pow(Math.abs(t),2.3)),.7)*Math.sqrt(Math.max(.03,level));
 const rise=t=>Math.pow(Math.abs(t),3)*H*(t>0?1.7:1.35);
 for(const s of [-1,1])for(let j=0;j<=8;j++){const lv=j/8,pts=[];for(let i=0;i<=20;i++){const t=-1+i/10;pts.push([s*beam(t,lv),lv*H+rise(t)*(.35+lv*.65),t*L,j===8?1.25:1.05]);}k.limb(pts,j===8?silver:j%3===0?shade:pearl,5);}
 // Keel, deck and rail.
 {const pts=[];for(let i=0;i<=20;i++){const t=-1+i/10;pts.push([0,rise(t)*.35-1.4,t*L,1.5]);}k.limb(pts,shade,6);}
 for(let i=-8;i<=8;i++){const t=i/9;k.box(0,H*.72+rise(t)*.5,t*L,beam(t,.8)*2,1,L/9.4,'#c9c3ae');}
 for(const s of [-1,1])for(let i=-7;i<=7;i++){const t=i/9;k.column(s*beam(t,1),H+rise(t),t*L,.4,5,silver,5);if(i%2===0)litInto(k,g,s*beam(t,1),H+rise(t)+6,t*L,.9);}
 // Carved feathers of the wings along each side of the bow.
 for(const s of [-1,1])for(let i=0;i<13;i++){const z=L*.58-i*L*.09,sp=beam(z/L,.74)+.8,y=H*.62+i*.42;k.limb([[s*sp,y,z,1.5],[s*(sp+.9),y+1.6,z-L*.08,1.1],[s*(sp+.5),y+1.2+i*.2,z-L*.18,.2]],i%2?pearl:silver,5);}
 // The swan: a long proud neck, head and golden beak.
 const nb=L*.98;k.limb([[0,H*.95,nb-3,3.6],[0,H*1.45,nb+6,3.2],[0,H*2.05,nb+7,2.5],[0,H*2.55,nb+1,2],[0,H*2.86,nb-1,1.9],[0,H*2.98,nb+3,2.1],[0,H*2.92,nb+7,1.3]],pearl,12);k.add(k.cylinder(0,.95,4.4,8),0,H*2.9,nb+9.4,1,1,1,gold,0,Math.PI/2);for(const s of [-1,1])k.ball(s*1.5,H*3,nb+4.2,.44,'#17120d');
 for(const s of [-1,1])for(let i=0;i<7;i++){const y=H*1.2+i*H*.25;k.limb([[s*1.2,y,nb+2-i*.2,1],[s*4.5,y+1.6,nb-5-i,.7],[s*6,y+2,nb-11-i,.1]],pearl,4);}
 // The stern curls up like a tail.
 k.limb([[0,H*.8,-L*.97,3],[0,H*1.5,-L*1.03,2.4],[0,H*2.2,-L*1.02,1.6],[0,H*2.6,-L*.94,.9],[0,H*2.5,-L*.87,.25]],pearl,9);
 // Stern cabin with little roof and lamps.
 k.box(0,H*.8,-L*.6,B*.8,H*.72,L*.24,'#ded9c8');for(const s of [-1,1]){k.box(s*B*.4,H*.92,-L*.6,.5,H*.34,L*.18,'#3a3a44');}k.roof(0,H*1.52,-L*.6,B*.98,L*.3,H*.3,silver);g.lamp(0,H*1.92,-L*.6,1.4);k.column(0,H*1.52,-L*.6,.4,H*.32,gold,5);
 // Mast and yard.
 k.column(0,H*.72,L*.1,1.5,H*5.2,'#c9c3ae',10);k.add(k.cylinder(.8,.8,1,8),0,H*5,L*.1,1,B*2.8,1,'#c9c3ae',0,0,Math.PI/2);litInto(k,g,0,H*5.92,L*.1,1.3);for(const s of [-1,1])k.limb([[0,H*5.6,L*.1,.12],[s*B*.8,H*2.5,L*.42,.1],[s*B*.92,H*1.05,L*.62,.1]],silver,4);
}
function sail(width,height){
 const g=new T.PlaneGeometry(width,height,12,12),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)/width*2,y=p.getY(i)/height*2;p.setZ(i,(1-x*x)*(1-y*y*.7)*width*.2);p.setX(i,p.getX(i)*(1-(y+1)*.03));}g.computeVertexNormals();
 return new T.Mesh(g,new T.MeshStandardMaterial({color:'#efe9d8',emissive:'#6a5f48',emissiveIntensity:.25,roughness:.78,side:T.DoubleSide}));
}
export function buildHaven(stoneMaterial,woodMaterial){
 const group=new T.Group(),k=new Kit(),g=new Kit();g.elven=true;const white='#dcd9cb',pale='#c9c6b6',dark='#8f8d80',copper='#6f8a7c',gold='#c9a84e';
 // Sea wall and quay along the shore.
 k.box(0,-26,12,620,28,44,dark);k.box(0,0,6,620,1.4,58,pale);for(let i=-30;i<=30;i++)k.box(i*10,1.4,36,.4,.1,1.6,dark);
 // The great pier running into the deep water, on tall curved arches.
 k.box(0,0,110,44,2.4,190,white);for(const s of [-1,1]){k.box(s*22,2.4,110,1.6,3.8,190,pale);for(let i=0;i<9;i++){const z=26+i*22;k.column(s*17,-30,z,4.5,30,dark,10);k.limb([[s*17,-20,z,2.4],[s*17,-5,z+11,1.8],[s*17,-20,z+22,2.4]],pale,6);k.column(s*22,6,z,.6,18,white,6);k.cyl(s*22,24,z,2.4,.6,3,gold,8);litInto(k,g,s*22,28.4,z,1.5);}}
 // Elven arch at the start of the pier: two trunks that grow towards each other like the crest of a wave.
 for(const s of [-1,1]){k.limb([[s*19,0,34,3.6],[s*20,26,34,2.8],[s*18,52,33,2.2],[s*10,72,31,1.5],[s*1,80,30,.7]],white,9);k.limb([[s*20,20,34,1.4],[s*28,36,35,1],[s*27,50,35,.6],[s*19,56,34,.15]],white,6);k.limb([[s*18,40,34,.7],[s*9,47,34,.5],[s*2,50,34,.2]],gold,5);for(let i=0;i<8;i++){const t=i/7;k.add(k.octa(1),s*(20-t*18),24+t*56,35.4,1.2,2.2,.4,i%2?gold:'#b08a3a',i);}}
 k.ball(0,80,30,2.3,white);litInto(k,g,0,74,31,1.6);
 // Slender towers, boat halls under sweeping roofs and terraces climbing behind the quay.
 const tower=(x,z,r,h)=>{k.column(x,0,z,r+1.6,3,pale,14);k.cyl(x,3,z,r*.86,r,h,white,14);for(const q of [.35,.62])k.column(x,h*q,z,r*.98,.9,gold,14);k.column(x,h+3,z,r+3,1.2,pale,14);for(let i=0;i<8;i++){const a=i*.785;k.column(x+Math.cos(a)*(r+2.4),h+4.2,z+Math.sin(a)*(r+2.4),.3,4,white,5);k.box(x+Math.cos(a)*r*.9,h*.72,z+Math.sin(a)*r*.9,1.4,6,.4,'#26303a',Math.PI/2-a);}k.column(x,h+4,z,r*.76,8,white,12);k.cone(x,h+12,z,r+1.6,r*1.5,copper,14);k.cone(x,h+12+r*1.3,z,r*.5,r*3,copper,10);k.cone(x,h+12+r*4,z,.4,5,gold,6);litInto(k,g,x,h+8,z+r*.8,1);};
 tower(-120,-30,10,126);tower(112,-44,12,158);tower(-210,-6,8,92);tower(214,-16,8,104);tower(0,-110,13,196);
 const hall=(x,z,w,d,h,ry=0)=>k.local(x,z,ry,()=>{k.box(0,0,0,w,h,d,white);for(let i=-3;i<=3;i++){k.column(i*w/7,0,d/2+1.6,1.1,h,pale,8);k.box(i*w/7+w/14,h*.3,d/2+.2,w/10,h*.5,.5,'#2e3640');}k.box(0,h,0,w+8,1.2,d+8,gold);k.roof(0,h+1.2,0,w+12,d+12,h*.5,copper);k.roof(0,h*1.5+1,0,w*.46,d*.46,h*.52,copper);k.cone(0,h*2,0,.7,8,gold,6);});
 hall(-70,-64,84,52,38);hall(72,-70,74,50,34);hall(-190,-82,66,44,30,.28);hall(186,-88,64,42,28,-.28);
 for(let i=0;i<8;i++)k.box(0,i*1.6,-20-i*3.4,84-i*2,1.6,3.8,pale);
 // Boathouse and a slipway with a boat under repair, nets and barrels of the shipwrights.
 k.box(-168,0,36,64,1.6,36,pale);k.limb([[-150,4,20,.8],[-150,8,36,.8],[-150,4,52,.8]],'#6a5a44',4);for(let i=0;i<5;i++){const z=24+i*6;for(const s of [-1,1])k.limb([[-156+s*.4,2,z,.5],[-156+s*(8-Math.abs(i-2)),5,z,.4],[-156+s*(9-Math.abs(i-2)),12,z,.3]],'#c9c3ae',4);}
 for(const [x,z] of [[-184,30],[-192,42],[-178,48]]){k.column(x,1.6,z,4,10,'#6a4a26',10);k.column(x,4,z,4.2,.6,'#3a2a1c',10);k.column(x,8,z,4.2,.6,'#3a2a1c',10);}
 for(let i=0;i<6;i++){k.column(150+i*18,0,20,.7,12,'#6a5a44',5);if(i<5){const pts=[];for(let t=0;t<=4;t++)pts.push([150+i*18+t*4.5,12-Math.sin(t/4*3.14)*4,20,.1]);k.limb(pts,'#8a8a78',3);}}
 // Lamps on the quay.
 for(let i=-6;i<=6;i++){if(Math.abs(i)<2)continue;const x=i*44;k.column(x,0,-6,.8,18,white,6);k.limb([[x,17,-6,.5],[x+2.4,21,-6,.3],[x+4.2,20,-6,.15]],gold,4);litInto(k,g,x+4.2,18.6,-6,1.2);}
 // A low balustrade along the water, open where the pier, the jetties and the slipway meet the quay; bollards and mooring rings below it.
 for(let x=-300;x<=300;x+=6){const gap=Math.abs(x)<42||Math.abs(Math.abs(x)-120)<14||(x>-200&&x<-136);if(gap)continue;k.column(x,1.4,33.4,.55,4.2,white,6);if(x%30===0){k.box(x,1.4,33.4,2.2,6,2.2,pale);k.ball(x,7.8,33.4,1.1,white);}}
 for(const [a,b] of [[-300,-200],[-106,-42],[42,106],[134,300]])if(b-a>4)k.box((a+b)/2,5.6,33.4,b-a,.8,1.4,pale);
 for(let x=-290;x<=290;x+=40){if(Math.abs(x)<30)continue;k.column(x,-6,36,1.6,6,dark,8);k.ball(x,0,36,1.7,dark);}
 // Steps down to the water beside the pier, the quay paved in a pattern of waves.
 for(const s of [-1,1])for(let i=0;i<6;i++)k.box(s*(34+i*0),-i*3.4,36+i*3,12,1.4,3.4,pale);
 for(let i=-14;i<=14;i++){const x=i*20;k.limb([[x-8,1.5,-4,.5],[x-3,1.5,-1,.5],[x+3,1.5,-1,.5],[x+8,1.5,-4,.5]],dark,4);}
 // Crates, coiled rope and amphorae waiting for the voyage beside the pier.
 for(const [x,z,w,h] of [[-44,8,7,6],[-44,0,7,6],[-36,4,6,5],[-44,4,6,5.4]])k.box(x,1.4+(h>5.5&&z===4?6:0),z,w,h,w,'#7a6648');
 for(const [x,z] of [[36,2],[42,-4],[36,-6]]){k.column(x,1.4,z,2.4,.6,'#9a8a62',10);k.column(x,2,z,2,.6,'#8a7a56',10);k.column(x,2.6,z,1.4,.6,'#9a8a62',10);}
 for(const [x,z] of [[52,4],[56,-2],[60,4]]){k.cyl(x,1.4,z,1.2,2.6,5,'#b87a52',8);k.cyl(x,6.4,z,2.6,.8,2.2,'#b87a52',8);}
 // Long silver banners hang from the towers and the gable of the great hall.
 for(const [x,z,h,len] of [[-120,-19,96,40],[112,-31,120,46],[0,-96,150,54],[-210,4,70,30],[214,-7,80,32]]){k.box(x,h-len,z,4.4,len,.3,'#cfd6e0');k.box(x,h-len-2,z,2.2,2.4,.3,'#cfd6e0');k.box(x,h-6,z+.2,3,3,.2,gold);}
 // Stone jetties for the smaller boats.
 for(const [x,w] of [[-120,20],[120,20]]){k.box(x,-1,76,w,2.6,92,pale);for(let i=0;i<4;i++)k.column(x+(i%2?1:-1)*w*.42,-30,40+i*22,2.6,30,dark,8);}
 const stone=k.mesh(stoneMaterial);group.add(stone,lit(g));
 // The ships ride on the water and rock gently.
 const ships=[],place=(x,z,L,B,H,ry,sailed)=>{const q=new T.Group(),sk=new Kit(),sg=new Kit();shipInto(sk,sg,L,B,H);q.add(sk.mesh(woodMaterial),lit(sg));if(sailed){const n=sail(B*2.5,H*3.5);n.position.set(0,H*3.2,L*.1+.9);n.castShadow=true;q.add(n);}q.position.set(x,-19,z);q.rotation.y=ry;group.add(q);ships.push({q,phase:x*.1});};
 place(60,120,92,17,14,0,true);place(-52,116,72,13,11,0,false);place(-162,92,36,7,6,.08,false);place(166,92,36,7,6,-.1,false);
 // The great ship sails: it lies at the pier while it is loaded, puts out to sea and later comes home, turns in the harbour and is warped back to its berth.
 ships[0].voyage=true;
 {const gk=new Kit();gk.box(0,0,0,26,.8,4.4,'#8a7454',0,0,-.26);for(const s of [-1,1])gk.box(0,2.6,s*2,26,.4,.3,'#6a5a44',0,0,-.26);for(let i=0;i<4;i++)gk.box(-9+i*6,.5,0,.5,.4,4.4,'#5e4c34',0,0,-.26);const plank=gk.mesh(woodMaterial);plank.position.set(36,-1.2,120);group.add(plank);group.userData.gangway=plank;}
 // Bales and amphorae on the pier wait to go aboard.
 {const bk=new Kit();for(const [z,c] of [[86,'#7a6648'],[96,'#8a7452'],[142,'#7a6648']]){bk.box(14,2.4,z,7,6,7,c);bk.box(14,8.4,z,6,.6,6,'#5e4c34');}for(const z of [104,110])bk.cyl(12,2.4,z,1.2,2.6,5,'#b87a52',8);group.add(bk.mesh(woodMaterial));}
 group.userData.ships=ships;return group;
}
const VOYAGE=170,ease=t=>t*t*(3-2*t);
// Where the great ship is in its round: at the pier (0-60 s), sailing out, away, coming home bow first, turning, and backing into its berth.
export function voyageAt(s){const c=((s%VOYAGE)+VOYAGE)%VOYAGE;
 if(c<60)return {z:120,ry:0,show:true,docked:true};
 if(c<95){const t=(c-60)/35;return {z:120+Math.pow(t,1.8)*1500,ry:0,show:t<.97};}
 if(c<110)return {z:1620,ry:Math.PI,show:false};
 if(c<135){const t=(c-110)/25;return {z:1620-(1-Math.pow(1-t,2))*1140,ry:Math.PI,show:t>.03};}
 if(c<150)return {z:480,ry:Math.PI*(1+ease((c-135)/15)),show:true};
 return {z:480-ease((c-150)/20)*360,ry:0,show:true};}
export const animateHaven=(group,s)=>{for(const ship of group.userData.ships){const {q,phase}=ship;q.position.y=-19+Math.sin(s*.62+phase)*1.1;q.rotation.z=Math.sin(s*.45+phase)*.018;q.rotation.x=Math.sin(s*.53+phase*1.4)*.012;
 if(ship.voyage){const v=voyageAt(s);q.position.z=v.z;q.rotation.y=v.ry;q.visible=v.show;if(group.userData.gangway)group.userData.gangway.visible=Boolean(v.docked);}}};

// ---- The road up Mount Doom ----
// As in the films a road of black stone winds up the cone to a dark door high on its flank.
// The door looks south-west, high on the cone; the flank to its right has burst open, so door and fire can be seen together.
export const DOOR_TURN=-.75,DOOR_R=120;
export function doomRoad(groundAt,doom,from,material){
 const k=new Kit(),g=new Kit(),black='#8a7d6e',rim='#2a2420',points=[];
 const start=Math.atan2(from.y-doom.y,from.x-doom.x),end=Math.atan2(Math.cos(DOOR_TURN),Math.sin(DOOR_TURN)),n=96;
 // Four clear switchbacks climb the west flank only, well clear of the rent, each leg one terrace higher, then the last leg runs straight to the door.
 const turns=[[start,210],[start-.95,184],[start+.3,158],[start-.95,136],[end,DOOR_R]];let rough=[];
 for(let leg=0;leg<turns.length-1;leg++){const [a0,r0]=turns[leg],[a1,r1]=turns[leg+1],m=Math.round(n/8);for(let i=leg?1:0;i<=m;i++){const t=i/m,a=a0+(a1-a0)*t,r=r0+(r1-r0)*t;rough.push({x:doom.x+Math.cos(a)*r,z:doom.y+Math.sin(a)*r});}}
 // The hairpins are rounded a little, as a cut road would be.
 for(let round=0;round<2;round++){const next=[rough[0]];for(let i=0;i<rough.length-1;i++){const a=rough[i],b=rough[i+1];next.push({x:a.x*.75+b.x*.25,z:a.z*.75+b.z*.25},{x:a.x*.25+b.x*.75,z:a.z*.25+b.z*.75});}next.push(rough[rough.length-1]);rough=next;}
 points.push(...rough);
 const lead=[];for(let i=0;i<=8;i++){const t=i/8;lead.push({x:from.x+(points[0].x-from.x)*t,z:from.y+(points[0].z-from.y)*t});}
 const line=[...lead,...points.slice(1)];let y=-1e9;const heights=line.map(q=>{const h=groundAt(q.x,q.z)+2.5;y=Math.max(y+.6,h);return y;});
 // The road cuts into the flank, so it may stand a little proud of the cone where gullies run under it.
 for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1],len=Math.hypot(b.x-a.x,b.z-a.z),ry=Math.atan2(b.x-a.x,b.z-a.z),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,h=(heights[i]+heights[i+1])/2,tilt=-Math.atan2(heights[i+1]-heights[i],len);k.add(k.cube(),mx,h,mz,22,2.6,len+2,black,ry,tilt);const base=Math.max(0,h-groundAt(mx,mz));if(base>2)k.box(mx,h-base-1,mz,19,base+1,len+1,rim,ry);
  // Low black kerbs with a seam of embers along both edges: the road can be followed by its glow from far away, by day and by night.
  for(const s of [-1,1]){const ox=Math.cos(ry)*s*11,oz=-Math.sin(ry)*s*11;k.add(k.cube(),mx+ox,h+1.6,mz+oz,1.8,3,len+1.4,rim,ry,tilt);g.add(k.cube(),mx+Math.cos(ry)*s*9.6,h+1.45,mz-Math.sin(ry)*s*9.6,.7,.25,len+1.4,'#ff5a12',ry,tilt);}
  if(i%7===3){const s=i%14===3?1:-1,ox=Math.cos(ry)*s*13.4,oz=-Math.sin(ry)*s*13.4;k.column(mx+ox,h,mz+oz,1.3,9,rim,6);k.column(mx+ox,h+9,mz+oz,2.2,1.2,rim,6);g.lamp(mx+ox,h+12,mz+oz,1.8);}}
 // The Sammath Naur as in the film: no gatehouse, only a tall cleft in a black shoulder of rock at the end of the road, with a dull glow far inside it.
 const q=line[line.length-1],Y=heights[heights.length-1],d=new Kit();d.lights=g;
 d.local(q.x+Math.sin(DOOR_TURN)*22,q.z+Math.cos(DOOR_TURN)*22,DOOR_TURN,()=>{
  d.crag(0,Y-26,-58,78,118,40,'#3f372f',2);d.crag(-66,Y-24,-30,34,78,26,'#3a322b',1);d.crag(66,Y-24,-34,38,92,28,'#3c342d',3);d.box(0,Y-2.6,14,40,2.6,60,'#453d35');
  for(const s of [-1,1]){d.limb([[s*29,Y-3,12,11],[s*28,Y+30,12,10],[s*23,Y+62,11,8],[s*13,Y+84,10,6],[s*1,Y+96,9,2.4]],'#2c261f',8);d.limb([[s*44,Y-3,8,12],[s*42,Y+28,7,10],[s*34,Y+62,5,7],[s*24,Y+84,3,1]],'#352e27',7);}
  for(const [x,h,r,z] of [[-42,74,8,-2],[-27,104,6,-8],[-11,122,5,-12],[12,112,5.5,-11],[30,92,6.5,-6],[45,62,7,0],[58,40,6,-3],[-60,44,6,-5]])d.cone(x,Y+6,z,r,h,'#28231d',5,x);
  for(const [x,z,w] of [[-17,14,4],[15,20,5],[-14,32,3.4],[19,34,3],[-9,42,2.4]])d.rock(x,Y+.4,z,w,w*.8,w*1.2,'#37302a',Math.round(w*3));
  d.box(0,Y,8,60,92,2,'#040302');g.box(0,Y,9.4,46,88,.3,'#060302');g.limb([[0,Y,9.8,13],[1,Y+20,9.8,11],[-1,Y+42,9.8,7],[0,Y+68,9.8,.4]],'#8a2408',6);g.limb([[0,Y,10.6,6],[-1,Y+14,10.6,5],[1,Y+30,10.6,3],[0,Y+46,10.6,.3]],'#ff7a1c',6);for(const s of [-1,1])g.limb([[s*19,Y,10.4,1.3],[s*18,Y+30,10.4,1.2],[s*14,Y+58,10.4,1],[s*7,Y+78,10.4,.7],[s*1,Y+88,10.4,.3]],'#ff5a14',5);g.box(0,Y+.2,12,10,.15,28,'#4a1606');
 });d.lights=null;
 const group=new T.Group(),portal=d.mesh(material),glow=lit(g);group.add(k.mesh(material),portal,glow);group.userData.portal=[portal,glow];group.userData.door={x:q.x,y:Y,z:q.z};return group;
}

// ---- Rooms below the land. They live on their own layer and cost nothing until entered ----
const noise=`float h21(vec2 p){p=fract(p*vec2(.1031,.103));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+7.;a*=.5;}return s;}`;
const lavaMaterial=(scale,bright=1)=>new T.ShaderMaterial({uniforms:{time:{value:0}},fog:false,vertexShader:'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vP;uniform float time;${noise}void main(){vec2 p=vP*${scale.toFixed(4)};vec2 w=vec2(fbm(p+time*.03),fbm(p*1.2-time*.025));float crust=fbm(p*1.9+w*3.1);float crack=1.-smoothstep(.0,.16,abs(crust-.5));float hot=smoothstep(.44,.16,crust);vec3 c=mix(vec3(.07,.02,.012),vec3(.85,.13,.02),hot);c=mix(c,vec3(2.2,.72,.1),crack*.62);c+=vec3(1.5,.5,.06)*pow(hot,5.)*.7;gl_FragColor=vec4(c*${bright.toFixed(2)},1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
const onLayer=g=>{g.traverse(n=>n.layers.set(1));return g;};
const embers=(count,R,bottom,top,puff)=>{const pos=new Float32Array(count*3),items=[];for(let i=0;i<count;i++)items.push({a:Math.random()*6.28,r:Math.random()*R,k:Math.random(),s:.05+Math.random()*.09});const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));const p=new T.Points(geo,new T.PointsMaterial({map:puff,color:'#ff9a44',size:9,transparent:true,depthWrite:false,blending:T.AdditiveBlending,fog:false}));p.frustumCulled=false;p.userData.step=dt=>{items.forEach((q,i)=>{q.k=(q.k+dt*q.s)%1;geo.attributes.position.setXYZ(i,Math.cos(q.a+q.k*2)*q.r,bottom+q.k*(top-bottom),Math.sin(q.a+q.k*2)*q.r);});geo.attributes.position.needsUpdate=true;};return p;};

// Sammath Naur: high on the cone the door opens straight onto a bare tongue of rock. Below it the mountain is hollow, down to the fire.
export function buildSammathNaur(rock,shellRock,puff,groundAt,doom,floorY){
 const group=new T.Group(),inner=new T.Group(),k=new Kit(),g=new Kit(),lavaY=52,door=DOOR_R-3,tip=DOOR_R-84;group.position.set(doom.x,0,doom.y);inner.position.y=floorY;inner.rotation.y=DOOR_TURN;group.add(inner);
 const tone=new T.Color(),quadInto=(kit,a,b,d,e,q,centre)=>{const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[d[0]-a[0],d[1]-a[1],d[2]-a[2]],n=new T.Vector3(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]).normalize(),mid=[(a[0]+e[0])/2-centre[0],(a[1]+e[1])/2-centre[1],(a[2]+e[2])/2-centre[2]],flip=n.x*mid[0]+n.y*mid[1]+n.z*mid[2]<0;if(flip)n.negate();tone.set(q);for(const p of flip?[a,d,b,b,d,e]:[a,b,d,b,e,d]){kit.pos.push(p[0],p[1],p[2]);kit.nor.push(n.x,n.y,n.z);kit.col.push(tone.r,tone.g,tone.b);}};
 // The inside of the cone: it follows the mountain just below its skin and widens like a bell towards the fire.
 {const c=new Kit(),hot=new Kit(),n=84,rim=[214,200,186,172,158,144,130,116,102,88,74,60],at=(i,j)=>{const a=j/n*6.283,bump=Math.sin(a*7+i*1.3)*3+Math.sin(a*17+i*2.1)*1.6,r=rim[i]-Math.abs(bump),x=Math.sin(a)*r,z=Math.cos(a)*r;return [x,Math.max(lavaY-6,groundAt(doom.x+x,doom.y+z)-18-Math.abs(bump)*1.6),z];};
  for(let j=0;j<n;j++){const a=j/n*6.283,b=(j+1)/n*6.283;quadInto(c,[Math.sin(a)*216,lavaY-40,Math.cos(a)*216],[Math.sin(b)*216,lavaY-40,Math.cos(b)*216],at(0,j),at(0,j+1),'#5e2a14',[0,300,0]);for(let i=0;i<rim.length-1;i++)quadInto(c,at(i,j),at(i,j+1),at(i+1,j),at(i+1,j+1),[['#5a3322','#4b2c1e','#61382a'],['#3f2a20','#35241c','#463025'],['#2c1f19','#241a15','#31231c']][Math.min(2,i>>2)][(i*3+j*5)%3],[0,300,0]);}
  // Lava runs down the wall.
  for(let i=0;i<11;i++){const a=i/11*6.283+.3,dx=Math.sin(a),dz=Math.cos(a),line=[];for(let q=6+(i%3);q>=0;q--){const r=rim[q]-3;line.push([dx*r,Math.max(lavaY,groundAt(doom.x+dx*r,doom.y+dz*r)-20),dz*r,.9+(6-Math.min(6,q))*.34]);}hot.limb(line,i%2?'#ff7a1a':'#ff5a14',5);}
  // Great ribs of rock run up the wall into the dark, jagged teeth hang from the roof: a cavern, not a smooth bell.
  for(let i=0;i<30;i++){const a=i*.2094+Math.sin(i*2.3)*.09,dx=Math.sin(a),dz=Math.cos(a),line=[];for(let q=0;q<=9;q+=(i%3)+1){const r=rim[q]-5-(i*7+q*3)%9;line.push([dx*r+dz*Math.sin(q*1.7+i)*4,Math.max(lavaY-4,groundAt(doom.x+dx*r,doom.y+dz*r)-20),dz*r-dx*Math.sin(q*1.7+i)*4,6+(i*5+q*2)%8]);}if(line.length>1)c.limb(line,['#2d1f18','#38261c','#241914'][i%3],6);}
  for(let i=0;i<34;i++){const a=i*2.399,r=44+(i*37%60),x=Math.sin(a)*r,z=Math.cos(a)*r,top=groundAt(doom.x+x,doom.y+z)-14,len=22+(i*13%46);c.limb([[x,top+6,z,5+(i%4)*1.8],[x+2,top-len*.55,z-1,2.4+(i%3)*.5],[x+1,top-len,z,.2]],'#231812',5);}
  {const under=new T.Mesh(new T.RingGeometry(205,285,64),new T.MeshBasicMaterial({color:'#0d0806'}));under.rotation.x=-Math.PI/2;under.position.y=lavaY-38;group.add(under);}
  const shell=c.mesh(shellRock);shell.castShadow=false;shell.frustumCulled=false;group.add(shell);group.userData.shell=shell;group.add(lit(hot));}
 // The tongue is one piece of rock: a narrow ledge from the door, breaking off in a point over the abyss, far short of the opposite wall.
 const tongueX=t=>Math.sin(t*2.6)*4;
 {const N=40,ring=(i)=>{const t=i/N,z=door+(tip-door)*t,x=tongueX(t),w=(1-Math.pow(t,1.3))*10+3.2,bite=i===N?.25:1,edge=s=>w*bite*(1+.1*Math.sin(i*.7+s*2)+.05*Math.sin(i*1.7+s)),d=(7+(1-t)*22)*bite;return [[x-edge(1),-.9,z],[x-w*.5,Math.sin(i*2.3)*.18,z],[x+w*.5,Math.sin(i*1.7)*.18,z],[x+edge(2),-.9,z],[x+w*.74,-d*.55,z],[x,-d,z],[x-w*.74,-d*.55,z]];};
  const looks=['#8a7564','#7c6858','#94806e'],below=['#30241d','#2a1f19','#35281f'];for(let i=0;i<N;i++){const a=ring(i),b=ring(i+1),mid=[(a[5][0]+b[5][0])/2,(a[1][1]-6),(a[5][2]+b[5][2])/2];for(let s=0;s<7;s++){const n=(s+1)%7;quadInto(k,a[s],a[n],b[s],b[n],s<3?looks[(i+s)%3]:below[(i+s)%3],mid);}}
  // Loose stones on the edges and the jagged break at the tip, never in rows.
  for(const [t,s,w] of [[.08,-1,7],[.15,1,8],[.27,-1,5],[.42,1,4.4],[.58,-1,3.6],[.76,1,2.8],[.9,-1,2.2],[.97,1,1.8]]){const z=door+(tip-door)*t,x=tongueX(t)+s*((1-Math.pow(t,1.3))*10+2.6)*.92;k.rock(x,.3,z,w*.5,w*.42,w*.7,'#4a3c32',Math.round(t*20)+1);}
  k.rock(tongueX(1)-1,.8,tip+1,1.6,2.8,1.5,'#4d3f35',3);k.rock(tongueX(1)+2,.6,tip+3,1.2,2,1.2,'#4d3f35',4);}
 // It grows out of a great pier in the wall, with one bent root of stone beneath it.
 {const drop=lavaY-floorY-4;k.limb([[0,drop,door+2,46],[2,drop*.62,door-2,34],[1,drop*.26,door-6,24],[0,-16,door-10,14],[0,-3,door-14,7]],'#2c211b',14);k.limb([[-14,drop,door-34,24],[-8,drop*.6,door-36,13],[-2,drop*.26,door-40,8],[1,-14,door-46,5],[1,-4,door-52,2.4]],'#2a1f19',10);}
 // The cleft from within: raw black rock around a tall sliver of the dull red day outside, as Frodo saw it.
 const c=new Kit(),cg=new Kit();c.crag(0,-14,door+8,60,92,14,'#201814',2);for(const s of [-1,1]){c.limb([[s*14,-3,door-1,8],[s*12,20,door-1,7],[s*9,42,door,5.4],[s*4,60,door,3.6],[s*.6,72,door,1.4]],'#15110e',8);c.limb([[s*28,-6,door-4,10],[s*24,26,door-5,8],[s*16,62,door-3,5],[s*8,84,door-1,1]],'#1b1511',7);}
 c.box(0,-2,door+7,28,76,3,'#040302');cg.box(0,0,door+5,8,46,.3,'#a83a10');cg.box(0,1,door+4.7,4,30,.3,'#ff9a4a');{const m=c.mesh(rock),l=lit(cg),w=new T.Group();w.add(m,l);w.visible=false;inner.add(w);group.userData.cleft=w;}
 for(let i=0;i<4;i++)k.box(0,-1.6+i*.3,door-3+i*1.4,15+i,.5,1.6,'#3a2e26');
 inner.add(k.mesh(rock),lit(g));
 // The fire below: a lake of molten rock and flames that climb the abyss past the tongue.
 const lava=lavaMaterial(.03,.42),lake=new T.Mesh(new T.CircleGeometry(218,56),lava);lake.rotation.x=-Math.PI/2;lake.position.y=lavaY;group.add(lake);
 const spots=[];for(let i=0;i<14;i++){const a=i*2.399,r=24+i*12;spots.push([Math.cos(a)*r,lavaY,Math.sin(a)*r-20,4+(i%4)*2,10+(i%5)*6]);}group.add(flameSheet(spots));
 {const cut=floorY+14,face=new Kit(),n=120,edgeAt=(a,skin)=>{for(let r=235;r>30;r-=2){const x=Math.sin(a)*r,z=Math.cos(a)*r;if(groundAt(doom.x+x,doom.y+z)-skin>=cut)return r;}return 30;};for(let j=0;j<n;j++){const a=j/n*6.283,b=(j+1)/n*6.283,ro=edgeAt(a,0)+3,ri=edgeAt(a,18)-3,so=edgeAt(b,0)+3,si=edgeAt(b,18)-3,y=cut-.6,q=['#3a2c23','#31251e','#413228'][j%3];quadInto(face,[Math.sin(a)*ri,y,Math.cos(a)*ri],[Math.sin(b)*si,y,Math.cos(b)*si],[Math.sin(a)*ro,y,Math.cos(a)*ro],[Math.sin(b)*so,y,Math.cos(b)*so],q,[Math.sin(a)*ri,y-50,Math.cos(a)*ri]);}const rim=face.mesh(rock);rim.visible=false;rim.frustumCulled=false;group.add(rim);group.userData.rim=rim;group.userData.cut=cut;}
 const flames=[];{const f=new T.SpriteMaterial({map:puff,color:'#ff6a1a',transparent:true,opacity:.3,depthWrite:false,blending:T.AdditiveBlending,fog:false});for(let i=0;i<12;i++){const s=new T.Sprite(f.clone()),a=i*2.399,r=24+i*12;s.position.set(Math.cos(a)*r,lavaY,Math.sin(a)*r-20);group.add(s);flames.push({s,k:i/12});}}
 const sparks=embers(260,170,lavaY,floorY+50-lavaY,puff);group.add(sparks);
 group.userData.stage={inner,door,tip,lavaDrop:lavaY-floorY,lineAt:z=>{const t=(door-z)/(door-tip);return tongueX(Math.max(0,Math.min(1,t)));},flare:0};
 const fireLight=new T.PointLight('#ff6d24',0,1100,1.05);fireLight.position.set(doom.x,lavaY+120,doom.y);group.userData.light=fireLight;{const over=new T.PointLight('#ffb27a',0,340,1.2),at=door-(door-tip)*.5;over.position.set(Math.sin(DOOR_TURN)*at,floorY+78,Math.cos(DOOR_TURN)*at);group.add(over);group.userData.over=over;}
 group.visible=false;
 group.userData.step=(dt,s)=>{lava.uniforms.time.value=s;sparks.userData.step(dt);for(const f of flames){f.k=(f.k+dt*.07)%1;const q=f.k,w=60+q*150;f.s.position.y=lavaY+q*(floorY-lavaY+40);f.s.scale.set(w,w*1.7,1);f.s.material.opacity=(1-q)*(.3+group.userData.stage.flare*.5);}};
 return group;
}

// The pits under Barad-dûr: orcs grow in sacs of mud and are torn out, armed and driven off.
export function buildOrcPits(rock,puff){
 const group=new T.Group(),k=new Kit(),g=new Kit(),black='#2c2724',iron='#2a2826',mud='#2d2319',steel='#54514c',R=330;
 // Floor, walls of cut black stone, buttresses with fire behind grilles.
 k.column(0,-2,0,R+40,2,'#1d1916',48);for(let i=0;i<60;i++){const a=i*2.399,r=Math.sqrt((i+.5)/60)*R;k.box(Math.cos(a)*r,0,Math.sin(a)*r,26+(i%3)*8,.3,18+(i%4)*5,'#262119',a);}
 const wall=(a,h)=>{const x=Math.sin(a)*R,z=Math.cos(a)*R;k.box(x,0,z,2*R*Math.sin(Math.PI/28)+3,h,22,black,a);};
 for(let i=0;i<28;i++){const a=i/28*6.283;wall(a,170);if(i%2===0){const x=Math.sin(a)*(R-12),z=Math.cos(a)*(R-12);k.box(x,0,z,16,180,18,'#24201c',a);k.cone(x,180,z,11,32,iron,5,a);k.local(x*.95,z*.95,a+Math.PI,()=>{k.box(0,54,6,12,24,1,iron);for(let b=0;b<5;b++)k.box(-4.8+b*2.4,54,6.8,.6,24,.6,iron);g.box(0,55,6.2,10,20,.4,'#ff6a1a');});}}
 for(let i=0;i<14;i++){const a=i/14*6.283,r=R+80;k.crag(Math.sin(a)*r,160,Math.cos(a)*r,170,160,110,'#1c1815',i);}
 // Black columns holding a dark vault of iron and chains.
 for(let i=0;i<10;i++){const a=(i+.5)/10*6.283,x=Math.sin(a)*205,z=Math.cos(a)*205;k.cyl(x,0,z,12,18,210,black,8);for(let t=0;t<4;t++){k.column(x,30+t*46,z,18-t,2.2,iron,8);}for(let c=0;c<3;c++)g.box(x+Math.sin(a+c)*15,20+c*50,z+Math.cos(a+c)*15,1.1,12,1.1,'#ff5a14');for(let c=0;c<7;c++)k.box(x*(1-c/8.5),210+Math.sin(c/7*3.14)*-30,z*(1-c/8.5),c%2?1.4:3,3.4,c%2?3:1.4,iron);}
 // The pool of birth in the middle: black mud, a ring of stone, roots that feed the sacs.
 k.column(0,0,0,128,3,'#3a332b',40);k.column(0,3,0,122,.6,'#27221c',40);for(let i=0;i<24;i++){const a=i/24*6.283;k.box(Math.sin(a)*126,3,Math.cos(a)*126,18,2.6,10,'#47403a',a);}
 const pool=new T.Mesh(new T.CircleGeometry(120,44),new T.MeshStandardMaterial({color:'#20170f',roughness:.28,metalness:.22}));pool.rotation.x=-Math.PI/2;pool.position.y=3.8;group.add(pool);
 const sacs=[],sacMat=new T.MeshStandardMaterial({color:'#4a3620',emissive:'#301606',emissiveIntensity:.4,roughness:.62,transparent:true,opacity:.8,depthWrite:false});
 const sacAt=(x,y,z,s)=>{const m=new T.Mesh(new T.SphereGeometry(1,18,14),sacMat);m.position.set(x,y,z);m.scale.set(s*.66,s,s*.66);group.add(m);k.limb([[x*1.04,3,z*1.04,s*.28],[x,y-s*.6,z,s*.14],[x,y-s*.9,z,s*.1]],mud,7);
  // The curled body waiting inside.
  k.limb([[x,y+s*.05,z,s*.24],[x+s*.12,y-s*.25,z+s*.06,s*.3],[x+s*.04,y-s*.55,z+s*.14,s*.2]],'#3f4a2c',8);k.ball(x-s*.06,y+s*.36,z+s*.1,s*.2,'#4a5733');k.limb([[x+s*.16,y-s*.1,z+s*.12,s*.09],[x+s*.26,y-s*.42,z+s*.2,s*.07]],'#3f4a2c',6);sacs.push({m,s,phase:x*.17+z*.11});};
 for(let i=0;i<22;i++){const a=i*2.399,r=38+Math.sqrt(i)*18;sacAt(Math.cos(a)*r,11+(i%3)*3,Math.sin(a)*r,10+(i%4)*2);}
 for(let i=0;i<14;i++){const a=i*.449,x=Math.cos(a)*146,z=Math.sin(a)*146;sacAt(x,15+(i%2)*4,z,10+(i%3)*2);for(let c=0;c<6;c++){k.limb([[x+Math.cos(a+c)*14,3,z+Math.sin(a+c)*14,1.6],[x+Math.cos(a+c)*8,14,z+Math.sin(a+c)*8,1],[x,22,z,.4]],mud,5);}}
 // Hanging ones, on roots from the vault.
 for(let i=0;i<8;i++){const a=i*.785+.3,r=82,x=Math.cos(a)*r,z=Math.sin(a)*r;k.limb([[x,210,z,3],[x+4,120,z-3,1.8],[x,66,z,.8]],mud,6);const m=new T.Mesh(new T.SphereGeometry(1,16,12),sacMat);m.position.set(x,46,z);m.scale.set(11,20,11);group.add(m);sacs.push({m,s:20,phase:i});k.ball(x,50,z,3.8,'#3f4a2c');k.limb([[x,45,z,5],[x,34,z,3.6]],'#3f4a2c',6);}
 // Forges, iron cages, weapon racks, a slave driver's stand, a banner with the eye.
 for(let i=0;i<4;i++){const a=.55+i*1.57;k.local(Math.sin(a)*268,Math.cos(a)*268,a+Math.PI,()=>{k.box(0,0,0,60,44,28,'#1f1b18');k.box(0,0,14.4,36,26,.6,'#060504');g.box(0,1,14.8,28,20,.4,'#ff6a1a');g.box(0,3,15,16,12,.4,'#ffc23a');k.box(0,44,0,20,60,14,'#191613');k.column(-34,0,24,6.4,8,'#3f2c18',10);k.box(-34,8,24,10,3.6,16,iron);k.box(32,0,24,16,12,22,'#2a2520');k.box(32,12,24,18,2,8,steel);for(let s=0;s<7;s++){k.box(-20+s*7,0,38,.9,34,.9,'#3a2a18');k.cone(-20+s*7,34,38,1.8,6,steel,4);}});}
 for(let i=0;i<3;i++){const a=1.15+i*1.57,x=Math.sin(a)*258,z=Math.cos(a)*258;k.local(x,z,a,()=>{k.box(0,0,0,48,3,48,iron);k.box(0,60,0,48,3,48,iron);for(let u=-3;u<=3;u++)for(const s of [-1,1]){k.box(u*7.8,3,s*24,1,57,1,iron);k.box(s*24,3,u*7.8,1,57,1,iron);}});}
 k.local(0,-244,0,()=>{k.box(0,0,0,76,14,44,'#25211d');k.box(0,14,-6,38,10,24,'#2e2925');for(const s of [-1,1]){k.column(s*32,14,10,1.6,44,iron,6);k.cone(s*32,58,10,3,12,steel,5);}k.box(0,60,-16,62,1.6,1.6,iron);k.box(0,10,-16.4,56,50,.6,'#20100c');g.box(-.5,34,-16,30,12,.3,'#c9320a');g.box(-.5,38,-15.8,10,4,.3,'#ffb23a');g.box(-.5,36,-15.7,1.2,8,.3,'#050302');});
 group.add(k.mesh(rock),lit(g));
 // Mud bubbling, smoke along the vault.
 const bubbles=[];for(let i=0;i<8;i++){const m=new T.Mesh(new T.SphereGeometry(1,10,8),new T.MeshStandardMaterial({color:'#2c2015',roughness:.2}));m.position.set(Math.cos(i*1.9)*(30+i*11),3.9,Math.sin(i*1.9)*(30+i*11));group.add(m);bubbles.push({m,phase:i*1.13});}
 for(let i=0;i<10;i++){const s=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#1c1410',transparent:true,opacity:.36,depthWrite:false,fog:false}));s.position.set(Math.cos(i*.63)*190,180+(i%3)*30,Math.sin(i*.63)*190);s.scale.setScalar(320);group.add(s);}
 const sparks=embers(120,300,4,220,puff);group.add(sparks);
 // New-born orcs claw out of the pool, are armed at the forges and march away; the overseers stand with their whips.
 const out=[];for(let i=0;i<9;i++){const f=makeFigure(i%4===3?'uruk':'orc',i%2?'pick':'sword');f.traverse(n=>{if(n.isMesh)n.castShadow=false;});group.add(f);out.push({f,k:i/9,a:i*2.399,to:.55+(i%4)*1.57});}
 for(const [x,z,h] of [[-152,44,1.2],[148,70,-1.4],[44,-160,0],[-70,152,2.9],[0,-224,0],[30,-224,0],[-30,-224,0]]){const f=makeFigure('uruk','sword');f.position.set(x,z<-200?14:0,z);f.rotation.y=h;f.traverse(n=>{if(n.isMesh)n.castShadow=false;});f.userData.pose(0,0,false);group.add(f);}
 const lights=[[0,60,0,'#ffa060',800],[220,70,110,'#ff6a1a',1000],[-220,70,110,'#ff6a1a',1000],[0,70,-230,'#ff5a1a',1000]].map(([x,y,z,c,i])=>{const l=new T.PointLight(c,i,800,1.05);l.position.set(x,y,z);group.add(l);return l;});
 const shine=new T.PointLight('#c9d8ff',170,700,1.1);shine.position.set(0,190,120);group.add(shine);
 onLayer(group);
 group.userData={focus:{x:0,y:18,z:0},dMin:110,dMax:285,d:270,yaw:.5,pitch:.34,fog:['#120a07',600,1700],ambient:'#6a3a22',
  step(dt,s){sparks.userData.step(dt);for(const q of sacs){const b=1+Math.sin(s*1.1+q.phase)*.025;q.m.scale.set(q.s*.66*b,q.s*b,q.s*.66*b);}
   for(const q of bubbles){const v=(s*.32+q.phase)%1,r=v*5.4;q.m.scale.setScalar(Math.max(.01,r));q.m.visible=v<.92;}
   for(const q of out){q.k=(q.k+dt*.028)%1;const t=q.k,from={x:Math.cos(q.a)*(40+q.a*2)%110,z:Math.sin(q.a)*(40+q.a*2)%110},rim={x:Math.sin(q.to)*150,z:Math.cos(q.to)*150},gate={x:Math.sin(q.to)*232,z:Math.cos(q.to)*232};let x,y,z;if(t<.14){const u=t/.14;x=from.x;z=from.z;y=-30+u*34;}else if(t<.42){const u=(t-.14)/.28;x=from.x+(rim.x-from.x)*u;z=from.z+(rim.z-from.z)*u;y=Math.sin(u*3.14)*5+4*(1-u);}else if(t<.72){const u=(t-.42)/.3;x=rim.x+(gate.x-rim.x)*u;z=rim.z+(gate.z-rim.z)*u;y=0;}else{const u=(t-.72)/.28;x=gate.x;z=gate.z;y=0;q.f.visible=u<.8;}if(t<.72)q.f.visible=true;q.f.position.set(x,y,z);q.f.rotation.y=Math.atan2(gate.x-from.x,gate.z-from.z);q.f.userData.pose(t*180,t>.14?Math.sin(t*180)*.5:-1.5,false);}
   lights.forEach((l,i)=>{l.intensity=(i?1000:800)*(1+Math.sin(s*5+i)*.06+Math.sin(s*11+i*3)*.04);});}};
 return group;
}

// ---- Treasures inside the halls ----
const clawed=(k,x,y,z,r,c,n=4)=>{for(let i=0;i<n;i++){const a=i/n*6.283+.4;k.limb([[x+Math.cos(a)*r*.6,y-r*.92,z+Math.sin(a)*r*.6,r*.1],[x+Math.cos(a)*r*1.12,y-r*.36,z+Math.sin(a)*r*1.12,r*.09],[x+Math.cos(a)*r*1.05,y+r*.32,z+Math.sin(a)*r*1.05,r*.03]],c,5);}};
// Plinths for the seeing stones.
export function orthancStand(k,x,z){k.column(x,0,z,14,2,'#101013',12);k.cyl(x,2,z,5,9,4,'#17171b',10);k.cyl(x,6,z,3.4,5,16,'#101013',10);k.cyl(x,22,z,7.2,3.4,3,'#17171b',10);clawed(k,x,33,z,7.6,'#26262b',6);}
export function osgiliathStand(k,x,z){clawed(k,x,36,z,12.2,'#a08a54',6);for(let i=0;i<8;i++){const a=i*.785;k.box(x+Math.sin(a)*17,6,z+Math.cos(a)*17,3,.3,1,'#b5a578',a);}}

// The hall of the shards: a stone maiden holds out the broken sword on a carved tray, the great painting of Isildur behind her.
export function narsilInto(k,g,x,z,ry){k.local(x,z,ry,()=>{
 const stone='#d7d1bb',shade='#b5ae97',gold='#b8954f',steel='#c5ccd2',cloth='#4a1f22';
 // Alcove: stepped floor, two slender columns, a pointed arch.
 for(let i=0;i<3;i++)k.box(0,i*1.3,-6-i*1.5,62-i*7,1.3,42-i*3,i%2?shade:stone);
 for(const s of [-1,1]){k.column(s*27,4,-20,1.8,56,stone,10);k.limb([[s*27,60,-20,1.8],[s*20,72,-20,1.3],[s*8,82,-20,.9],[0,86,-20,.5]],stone,7);k.limb([[s*27,44,-20,.7],[s*18,50,-19.2,.5],[s*12,48,-19.2,.2]],gold,5);hanging(k,g,s*19,-6,62,10);}
 // The painting: Isildur before the black shape of Sauron, in a gold frame.
 k.box(0,8,-24,52,62,1.4,gold);k.box(0,10,-23.2,48,58,.4,'#7a6a52');k.box(0,10,-22.9,48,18,.3,'#5e4a36');k.box(0,40,-22.8,48,28,.2,'#b58a52');
 k.limb([[8,14,-22.3,5],[8,30,-22.3,5.4],[9,44,-22.3,4.4],[10,56,-22.3,3.2]],'#141214',7);for(let i=0;i<7;i++){const a=i*.42-1.2;k.limb([[10+Math.sin(a)*2.4,57,-22.2,.5],[10+Math.sin(a)*4,63,-22.2,.08]],'#141214',4);}k.limb([[14,48,-22.2,1.6],[20,56,-22.2,1.2],[23,64,-22.2,1]],'#141214',6);k.ball(23.6,66,-22.1,2.3,'#141214');g.ball(5.8,38,-22,.8,'#ffd27a');
 k.limb([[-10,12,-22.4,2.4],[-11,22,-22.4,3],[-11,30,-22.4,2.2]],'#3d3f48',6);k.ball(-11,33,-22.3,1.8,'#c9b08a');k.limb([[-9,27,-22.2,.8],[-4,33,-22.2,.6],[.8,39,-22.1,.3]],'#c9ced4',5);
 // The maiden: robe in long folds, veiled head, arms held out.
 k.limb([[0,4,-4,8.2],[0,14,-4,6.2],[0,26,-4,4.6],[0,38,-4,4.2],[0,44,-4,3]],stone,12);for(let i=0;i<9;i++){const a=i*.698;k.limb([[Math.sin(a)*7.9,4.4,-4+Math.cos(a)*7.9,.8],[Math.sin(a)*5.2,20,-4+Math.cos(a)*5.2,.55],[Math.sin(a)*4.3,36,-4+Math.cos(a)*4.3,.3]],shade,4);}
 k.column(0,44,-4,1.4,3,stone,8);k.ball(0,50,-4,3.1,stone,1.14);k.limb([[0,53.4,-5,3.1],[0,50,-7,3.6],[0,42,-7.4,4],[0,34,-7,3]],shade,9);
 for(const s of [-1,1])k.limb([[s*4.2,42,-4,1.5],[s*6.2,35,-1,1.2],[s*6.4,30,3,1],[s*5.4,28.6,6,.9]],stone,7);
 // The tray, shaped like a leaf, with the cloth on it.
 for(const [q,r] of [[3,5],[7,9],[13,12.6],[19,10],[24,6.4],[28,3]])k.ball(0,28,q,r,stone,.1);for(const [q,r] of [[6,7.4],[13,10.8],[19,8.2],[23,5]])k.ball(0,29.4,q,r,cloth,.05);for(let i=0;i<8;i++){const a=i*.785;k.add(k.octa(1),Math.sin(a)*11.8,29,14+Math.cos(a)*11,1.2,.6,1.8,gold,a);}
 // Narsil: the hilt with a short stump of blade, and the broken pieces laid in order.
 const y=31.8;k.limb([[-1.5,y,3.4,.65],[-1.3,y,7.5,.55],[-1.2,y,10,.8]],'#40281a',6);k.ball(-1.5,y,2.6,1.1,gold);k.limb([[-6.8,y,12,.25],[-4,y,10.5,.5],[-1.2,y,10.2,.7],[1.6,y,10.5,.5],[4.4,y,12,.25]],gold,6);
 const shard=(a,b,w0,w1,turn=0)=>{const len=b-a,m=(a+b)/2;k.limb([[-1.2,y-.1,a,w0],[-1.2,y-.1,m,(w0+w1)/2],[-1.2+turn,y-.1,b,w1]],steel,4);g.limb([[-1.2,y+.28,a,.1],[-1.2+turn,y+.28,b,.06]],'#eaf2f6',3);};
 shard(11,15,1,.9);shard(15.8,21,.86,.7,.3);shard(21.6,26.4,.68,.48,-.2);shard(27,30.6,.42,.05,.15);
 // Candles to either side.
 for(const s of [-1,1]){k.column(s*21,3.9,6,.8,12,gold,6);k.cyl(s*21,15.9,6,2,.6,1.2,gold,8);k.column(s*21,17,6,.8,3,'#efe8d6',6);litInto(k,g,s*21,21,6,.8,'#ffd98a');}
});}
const hanging=(k,g,x,z,top,drop)=>{k.column(x,top-drop,z,.2,drop,'#6a5a3c',5);k.cyl(x,top-drop-2,z,1.8,.6,2,'#b8954f',8);litInto(k,g,x,top-drop-2.6,z,1.1,'#ffe9a8');};

// Smaug, curled on the gold along the back of the hall, head raised towards the Arkenstone.
export function smaugInto(k,g){
 const hide='#4a2018',dark='#2a120e',belly='#c8642a',horn='#1a120e',membrane='#36160f';
 // Body and tail follow the wall: tail tip at the east, chest at the west, neck curving back into the room.
 const spine=[[108,5,-18,.8],[106,5.4,-38,2.2],[102,6,-58,4],[94,7,-74,6],[78,9,-90,8.4],[58,12,-99,11],[34,16,-104,14],[8,19,-105,17],[-18,21,-102,18.6],[-44,22,-92,19],[-66,23,-76,17],[-76,27,-58,12.5],[-74,33,-42,10],[-62,41,-30,8],[-46,47,-26,6.6],[-34,48,-31,5.8],[-22,44,-38,5.4]];
 k.limb(spine,hide,16);
 // Belly plates, seen where the coils lift from the gold.
 for(let i=2;i<spine.length-1;i++){const p=spine[i],q=spine[i+1],n=8;for(let c=0;c<n;c++){const t=c/n,x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t,z=p[2]+(q[2]-p[2])*t,r=p[3]+(q[3]-p[3])*t,dx=q[0]-p[0],dz=q[2]-p[2],l=Math.hypot(dx,dz)||1,ox=dz/l,oz=-dx/l,side=i<11?-1:1;k.add(k.cube(),x+ox*side*r*.72,y-r*.55,z+oz*side*r*.72,r*.8,.7,3.4,belly,Math.atan2(dx,dz));}}
 // Scales in rows and the ridge of plates on the back.
 for(let i=1;i<spine.length-1;i++){const p=spine[i],q=spine[i+1],n=7;for(let c=0;c<n;c++){const t=c/n,x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t,z=p[2]+(q[2]-p[2])*t,r=p[3]+(q[3]-p[3])*t,ry=Math.atan2(q[0]-p[0],q[2]-p[2]);k.add(k.cylinder(0,1,1,4),x,y+r*1.08+r*.18,z,r*.14+.3,r*.42+1,r*.3+.7,dark,ry);for(let s=0;s<6;s++){const a=s/6*3.14+(c%2)*.26,cx=Math.cos(a),cy=Math.sin(a),dx=q[2]-p[2],dz=-(q[0]-p[0]),l=Math.hypot(dx,dz)||1;k.add(k.octa(1),x+dx/l*cx*r*.98,y+cy*r*.98,z+dz/l*cx*r*.98,Math.max(.5,r*.1),Math.max(.5,r*.1),Math.max(.8,r*.16),s%2?hide:dark,ry);}}}
 // The tail ends in a spade.
 k.limb([[108,5,-18,.8],[111,5,-8,2.6],[109,5,0,1.6],[106,5,6,.2]],dark,6);
 // Legs and claws, gripping the hoard.
 const leg=(x,z,fx,fz,r)=>{k.limb([[x,24,z,r],[x+(fx-x)*.4,16,z+(fz-z)*.4,r*.72],[x+(fx-x)*.75,8,z+(fz-z)*.75,r*.46],[fx,3,fz,r*.5]],hide,10);for(const c of [-1,0,1]){const a=Math.atan2(fx-x,fz-z)+c*.5;k.limb([[fx,3,fz,r*.26],[fx+Math.sin(a)*r*.8,2,fz+Math.cos(a)*r*.8,r*.16],[fx+Math.sin(a)*r*1.3,.4,fz+Math.cos(a)*r*1.3,.1]],horn,5);}};
 // Only two hind legs: Smaug of the films is a wyvern. He stands on the wrists of his folded wings.
 leg(50,-98,60,-76,11);leg(82,-88,92,-62,9);
 const wingArm=(shoulder,elbow,wrist,r)=>{k.limb([[...shoulder,r*1.2],[(shoulder[0]+elbow[0])/2,(shoulder[1]+elbow[1])/2+2,(shoulder[2]+elbow[2])/2,r],[...elbow,r*.72]],hide,10);k.limb([[...elbow,r*.72],[(elbow[0]+wrist[0])/2,(elbow[1]+wrist[1])/2,(elbow[2]+wrist[2])/2,r*.62],[...wrist,r*.55]],hide,10);for(const c of [-1,-.4,.4,1]){const a=Math.atan2(wrist[0]-elbow[0],wrist[2]-elbow[2])+c*.8;k.limb([[...wrist,r*.3],[wrist[0]+Math.sin(a)*r*1.3,2.4,wrist[2]+Math.cos(a)*r*1.3,r*.2],[wrist[0]+Math.sin(a)*r*2.2,.5,wrist[2]+Math.cos(a)*r*2.2,.08]],horn,5);}k.limb([[...wrist,r*.3],[wrist[0],wrist[1]+r*1.2,wrist[2]+r*.3,r*.2],[wrist[0],wrist[1]+r*2,wrist[2]+r*1.2,.08]],horn,4);};
 wingArm([-48,34,-96],[-57,88,-94],[-92,5,-64],8);wingArm([-10,38,-108],[28,84,-106],[20,5,-78],7.4);
 // The leathery skin of the wing spans from arm to flank, so the arms read as the leading edge of great wings, not as posts.
 for(const [sh,el,wr,fl,hip] of [[[-48,34,-96],[-57,88,-94],[-92,5,-64],[-70,14,-84],[-40,18,-100]],[[-10,38,-108],[28,84,-106],[20,5,-78],[2,14,-98],[30,16,-104]]]){skin(k,sh,el,hip,membrane);skin(k,el,wr,fl,membrane);skin(k,el,fl,hip,membrane);for(const t of [.3,.55,.8])k.limb([[el[0],el[1],el[2],.9],[el[0]+(fl[0]-el[0])*t+(wr[0]-fl[0])*(1-t)*.5,el[1]+(fl[1]-el[1])*t,el[2]+(fl[2]-el[2])*t+(wr[2]-fl[2])*(1-t)*.5,.35]],dark,4);}
 // Wings folded on the back, their bones spread over the wall.
 for(const [root,tip] of [[[-30,48,-106],[[-98,84,-58],[-84,98,-84],[-56,102,-104],[-24,94,-116],[6,74,-118]]],[[6,44,-108],[[62,92,-100],[34,106,-110],[4,102,-118],[-20,86,-120]]]]){const knee=[root[0]+(tip[0][0]-root[0])*.4,root[1]+40,root[2]+(tip[0][2]-root[2])*.25];k.limb([[...root,4.2],[(root[0]+knee[0])/2,root[1]+24,(root[2]+knee[2])/2,3],[...knee,2.4]],dark,8);for(let i=0;i<tip.length;i++){const q=tip[i];k.limb([[...knee,1.8],[(knee[0]+q[0])/2,(knee[1]+q[1])/2+3,(knee[2]+q[2])/2,1],[q[0],q[1],q[2],.25]],dark,5);if(i<tip.length-1)skin(k,knee,q,tip[i+1],membrane);}skin(k,root,knee,tip[tip.length-1],membrane);k.cone(knee[0],knee[1],knee[2],1.8,9,horn,5);}
 // The head: long jaws, frill and horns, a throat full of fire.
 const hx=-22,hy=44,hz=-38;k.limb([[hx,hy,hz,5.6],[hx+4,hy+1,hz+6,6.2],[hx+8,hy+.6,hz+13,5],[hx+12,hy-1,hz+21,3.4],[hx+15,hy-2,hz+27,2]],hide,12);
 k.limb([[hx+1,hy-4.5,hz+2,3.8],[hx+6,hy-7,hz+11,3],[hx+11,hy-7.6,hz+20,2],[hx+14,hy-7.2,hz+26,1]],dark,10);
 for(const s of [-1,1]){const ox=s*.8,oz=s*-.55;
  k.limb([[hx+ox*5,hy+4,hz+oz*5-1,1.8],[hx+ox*9,hy+11,hz+oz*9-8,1.3],[hx+ox*10,hy+19,hz+oz*10-16,.7],[hx+ox*8,hy+25,hz+oz*8-24,.1]],horn,7);
  k.limb([[hx+ox*6,hy+.5,hz+oz*6-1,1],[hx+ox*12,hy+3,hz+oz*12-6,.7],[hx+ox*15,hy+7,hz+oz*15-11,.1]],horn,5);
  for(let i=0;i<5;i++)k.limb([[hx+ox*6,hy-2-i*1.1,hz+oz*6-2,.8],[hx+ox*(11+i),hy-4-i*1.6,hz+oz*(11+i)-5,.5],[hx+ox*(15+i),hy-6-i*2.4,hz+oz*(15+i)-8,.08]],dark,4);
  // Eye under a heavy brow.
  k.limb([[hx+ox*4+3,hy+5.2,hz+oz*4+7,1.4],[hx+ox*4.2+6,hy+4.8,hz+oz*4.2+12,1],[hx+ox*3+9,hy+3,hz+oz*3+17,.3]],dark,6);g.ball(hx+ox*5.4+5,hy+3.2,hz+oz*5.4+10,1.25,'#ffb01a',.86);g.ball(hx+ox*5.9+5.2,hy+3.2,hz+oz*5.9+10.4,.4,'#120600',1.5);
  // Teeth along both jaws.
  for(let i=0;i<7;i++){const f=i/6,x=hx+6+f*8.5+ox*(3.4-f*1.2),z=hz+9+f*16+oz*(3.4-f*1.2);k.add(k.cylinder(0,.42,2.2,5),x,hy-3.8-f*2,z,1,1,1,'#e8e0c4',0,Math.PI);k.add(k.cylinder(0,.36,1.8,5),x,hy-6-f*2,z,1,1,1,'#e8e0c4');}
  k.ball(hx+ox*1.2+14.4,hy-.7,hz+oz*1.2+26,.4,'#120600');
 }
 g.limb([[hx+4,hy-3.6,hz+6,2.4],[hx+9,hy-4.4,hz+15,2],[hx+13,hy-5,hz+23,.6]],'#ff6a12',6);
 // Fire shines through the scales of the throat and chest.
 for(let i=7;i<spine.length-1;i++){const p=spine[i],q=spine[i+1],heat=Math.min(1,(i-6)/4);for(let c=0;c<7;c++){const t=c/7,x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t,z=p[2]+(q[2]-p[2])*t,r=p[3]+(q[3]-p[3])*t,dx=q[0]-p[0],dz=q[2]-p[2],l=Math.hypot(dx,dz)||1,ox=dz/l,oz=-dx/l,side=i<11?-1:1;for(const w of [-.5,0,.5])g.add(g.octa(1),x+ox*side*r*(.74+.08*Math.abs(w)*-1)+(dx/l)*w*r*.2,y-r*.6-Math.abs(w)*r*.2,z+oz*side*r*.74+(dz/l)*w*r*.2,Math.max(.5,r*.14*heat),.45,Math.max(.8,r*.2),c%2?'#ff7a1a':'#ffb24a',Math.atan2(dx,dz));}}
}
// The plinth of the King's Jewel, in steps of gold and black stone.
export function arkenstoneStand(k,x,z){k.column(x,0,z,17,3,'#39352a',8);k.column(x,3,z,12.6,3,'#c9962d',8);k.cyl(x,6,z,4,8,14,'#2c2a24',8);k.cyl(x,20,z,8,4,3,'#c9962d',8);clawed(k,x,31,z,6.6,'#deb04a',5);for(let i=0;i<8;i++){const a=i*.785;k.box(x+Math.sin(a)*9.4,3.4,z+Math.cos(a)*9.4,3,.8,1,'#ffdc7a',a);}}

// Whatever must shine by itself: seeing stones and the Arkenstone. They live with the rooms and fade with them.
export const roomJewels={
 isengard:[{kind:'palantir',x:0,y:33,z:0,r:8}],
 observatory:[{kind:'palantir',x:0,y:36,z:0,r:12}],
 treasury:[{kind:'arkenstone',x:3,y:31.5,z:-30,r:6.4}],
 messengers:[{kind:'ring',x:-14,y:15.6,z:-68,r:2.3}],
 lorien:[{kind:'phial',x:42,y:21,z:-84,r:2.2}],
};
const ringShader=()=>new T.ShaderMaterial({transparent:true,uniforms:{time:{value:0},fade:{value:0}},vertexShader:'varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=position;vec4 m=modelViewMatrix*vec4(position,1.);vV=normalize(-m.xyz);gl_Position=projectionMatrix*m;}',
 fragmentShader:`varying vec3 vN;varying vec3 vV;varying vec3 vP;uniform float time;uniform float fade;
 void main(){vec3 n=normalize(vN),v=normalize(vV);vec3 h=normalize(vec3(-.4,.8,.45));float spec=pow(max(dot(n,normalize(h+v)),0.),60.),band=pow(1.-max(dot(n,v),0.),2.);vec3 c=mix(vec3(.72,.46,.1),vec3(1.5,1.05,.36),.5+.5*n.y)+vec3(2.2,1.7,.9)*spec+vec3(.5,.34,.08)*band;
 float a=atan(vP.y,vP.x);float glyph=step(.62,fract(a*9.+sin(a*23.)*.4))*step(.3,fract(a*31.));c+=vec3(1.9,.5,.06)*glyph*(.42+.3*sin(time*1.4));gl_FragColor=vec4(c,fade);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
const palantirShader=()=>new T.ShaderMaterial({transparent:true,uniforms:{time:{value:0},fade:{value:0}},vertexShader:'varying vec3 vN;varying vec3 vP;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vP=position;vec4 m=modelViewMatrix*vec4(position,1.);vV=normalize(-m.xyz);gl_Position=projectionMatrix*m;}',
 fragmentShader:`varying vec3 vN;varying vec3 vP;varying vec3 vV;uniform float time;uniform float fade;${noise}
 void main(){vec3 n=normalize(vN),v=normalize(vV);float rim=pow(1.-max(dot(n,v),0.),3.2);vec2 p=vP.xy+vP.z*.6;vec2 w=vec2(fbm(p*2.2+time*.08),fbm(p*2.6-time*.06));float smoke=fbm(p*2.8+w*2.6+time*.05);
 vec3 c=vec3(.006,.009,.016);c+=vec3(.05,.09,.16)*smoke*smoke*1.5;
 float core=smoothstep(.72,.06,length(vP.xy*vec2(1.,1.4)+vec2(sin(time*.2)*.07,0.)));float fire=core*smoothstep(.38,.75,smoke+core*.3);c+=vec3(1.7,.44,.04)*fire*(.8+.2*sin(time*1.7));c+=vec3(2.6,1.2,.3)*pow(core,6.)*.32;
 // Polished glass: a window of sky, a hard spark and a pale rim.
 vec3 h=normalize(vec3(-.45,.8,.55));float spec=pow(max(dot(n,normalize(h+v)),0.),190.);c+=vec3(1.5)*spec;c+=vec3(.44,.54,.68)*smoothstep(.9,1.,n.y*.52+n.x*-.22+.42)*.32;c+=vec3(.2,.26,.38)*rim;
 gl_FragColor=vec4(c,fade);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
const arkenShader=()=>new T.ShaderMaterial({transparent:true,uniforms:{time:{value:0},fade:{value:0}},vertexShader:'varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=position;vec4 m=modelViewMatrix*vec4(position,1.);vV=normalize(-m.xyz);gl_Position=projectionMatrix*m;}',
 fragmentShader:`varying vec3 vN;varying vec3 vV;varying vec3 vP;uniform float time;uniform float fade;
 void main(){vec3 n=normalize(vN);float f=dot(n,normalize(vV));vec3 fire=.6+.4*cos(6.283*(vec3(0.,.33,.67)+f*1.8+dot(n,vec3(.5,.7,.3))*2.+time*.08));vec3 c=mix(vec3(2.5,2.6,2.8),fire*2.6,.5);c*=.72+.56*pow(abs(sin(dot(n,vec3(7.,9.,5.)))),3.);gl_FragColor=vec4(c,fade);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
export function makeJewel(j,puff){
 const group=new T.Group();group.position.set(j.x,j.y,j.z);let mat,halo=null;
 if(j.kind==='palantir'){mat=palantirShader();group.add(new T.Mesh(new T.SphereGeometry(j.r,48,36),mat));}
 else if(j.kind==='ring'){mat=ringShader();const band=new T.Mesh(new T.TorusGeometry(j.r,j.r*.2,16,56),mat);band.rotation.x=1.46;group.add(band);halo=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#ffb24a',transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));halo.scale.setScalar(j.r*6.4);group.add(halo);}
 else if(j.kind==='phial'){mat=arkenShader();const glass=new T.Mesh(new T.SphereGeometry(j.r,20,16),mat);glass.scale.y=1.32;group.add(glass);halo=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#cfeaff',transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));halo.scale.setScalar(j.r*11);group.add(halo);}
 else{mat=arkenShader();const gem=new T.Mesh(new T.IcosahedronGeometry(j.r,1).toNonIndexed(),mat);gem.geometry.computeVertexNormals();gem.scale.y=1.3;group.add(gem);halo=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#dfeeff',transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));halo.scale.setScalar(j.r*8);group.add(halo);}
 group.visible=false;
 return {group,step(open,s){group.visible=open>.02;mat.uniforms.time.value=s;mat.uniforms.fade.value=Math.min(1,open*1.6);if(halo){halo.material.opacity=Math.min(1,open*1.6)*(.42+Math.sin(s*1.3)*.08);group.rotation.y=s*.15;}}};
}

// ---- A last pass of masonry over every house: what the eye reads as craftsmanship ----
const lamp=(k,g,x,y,z,h=14,c='#ffe6a0')=>{k.column(x,y,z,.5,h,'#3a2a16',6);k.cyl(x,y+h,z,1.5,.5,1.4,'#3a2a16',6);litInto(k,g,x,y+h+1.8,z,1.2,c);};
const rohanBanner=(k,x,y,z,w=9,h=20,ry=0)=>k.local(x,z,ry,()=>{k.column(0,y,0,.5,h+14,'#3a2a18',6);k.box(w/2,y+h-3,.2,w,h*.74,.4,'#2f5a30');k.box(w/2,y+h+1,.5,w*.5,h*.24,.3,'#e8e4d4');k.box(w*.7,y+h+8,.5,w*.16,h*.2,.3,'#e8e4d4');});
export const buildingDetail={
 // Helm's Deep: courses of old stone, buttresses, galleries, stairs, stables, banners and engines of war.
 scouts(k,g){const S=115,H=58,R=S*1.3,stone='#a2a6a4',dark='#7f8483',light='#b4b6b0',wood='#4a3219';
  // Coursed masonry: single blocks standing a little proud, and heavy piers the wall leans on.
  for(let i=0;i<340;i++){const a=.42+(i*.618%1)*5.44,y=2+(i*37%53),x=Math.sin(a)*(R+.45),z=Math.cos(a)*(R+.45);k.box(x,y,z,7+(i%4)*2.4,3.2+(i%2)*1.2,.7,['#8f9493','#a9adaa','#7c8180','#b7b9b3'][i%4],a);}
  for(let i=0;i<14;i++){const a=.6+i/13*5.08,x=Math.sin(a)*(R+3),z=Math.cos(a)*(R+3);k.box(x,0,z,13,H*.66,6,stone,a);k.box(Math.sin(a)*(R+5),0,Math.cos(a)*(R+5),17,9,6,dark,a);k.box(x,H*.66,z,14,1.8,7,light,a);}
  for(let y=6;y<H;y+=7.5)k.column(0,y,0,R+.5+((y|0)%3)*.14,.9,y%2<1?dark:'#8f9493',32);
  for(let i=0;i<24;i++){const a=i/24*6.283;if(a<.5||a>5.78)continue;const x=Math.sin(a)*(R+1.8),z=Math.cos(a)*(R+1.8);k.box(x,H*.3,z,2.6,5.4,1,'#23211c',a);if(i%3===0){k.box(x,H-8,z,12,2,4,wood,a);for(const s of [-1,1])k.box(x+Math.cos(a)*s*5,H-13,z-Math.sin(a)*s*5,.9,5,.9,wood,a);}}
  // Second ring inside the first and the courtyards of the keep.
  k.column(0,H+7,-16,S*.98,.8,dark,28);for(let i=0;i<7;i++){k.box(44,H+7+i*3,-52-i*5,14,3,5,light);}
  for(let i=0;i<6;i++){const a=.7+i*.84,x=Math.sin(a)*(S*.8),z=-16+Math.cos(a)*(S*.8);k.column(x,H+4,z,7,40,stone,10);k.column(x,H+44,z,8.6,2,light,10);k.cone(x,H+46,z,9,12,'#54483a',10);k.box(x,H+24,z+6.6,1.6,6,.5,'#23211c');}
  // The tall keep: more windows and the great hall's timbers.
  for(const h of [28,40,64,88,112]){k.column(-44,H+h,-52,15.5+(112-h)*.03,1,dark,14);}for(let i=0;i<6;i++){const a=i*1.047;k.box(-44+Math.sin(a)*14.6,H+40+i*14,-52+Math.cos(a)*14.6,2.2,7,.7,'#23211c',a);}
  for(let i=0;i<7;i++)k.box(-16+i*10.6,H+33,10.5,1.2,20,.7,wood);k.box(14,H+53,10.5,62,1.2,1,'#c9a23c');
  // Stables and a hayloft in the outer yard, a well, a smithy, crates for the siege.
  rohanBanner(k,-60,H+6,R*.42,8,16);rohanBanner(k,60,H+6,R*.42,8,16);rohanBanner(k,-44,H+132,-40,7,12,.2);
  // Banners on the Deeping Wall and a ballista above the culvert.
  for(let i=0;i<6;i++)rohanBanner(k,160+i*26,36,22,6,14);
  k.local(222,18,0,()=>{k.box(0,36,1,8,2,12,wood);k.box(0,38,4,1.2,1.2,16,wood);k.add(k.cube(),0,39,8,18,.8,.8,wood);for(const s of [-1,1])k.limb([[s*9,39,8,.3],[s*4,39,0,.1]],'#d8cfae',3);});
  for(let i=0;i<20;i++)k.box(153+i*7.2,0,11+(i%2),6.4,3+(i%3),3,dark);for(let i=0;i<6;i++){const x=168+i*25;k.box(x,28,9.5,4,3,6,light);for(let s=0;s<6;s++)k.box(x+12,s*5,6+s*1,6,5,6,dark);}
  // The ramp up to the gate: buttressed, with sentries' lamps and drain-holes.
  for(let i=0;i<8;i++)for(const s of [-1,1]){const z=S*1.38+10+i*10;k.box(s*18,0,z,3,4+Math.max(0,8-i)*.7,3,dark);if(i%3===1)lamp(k,g,s*15.5,4.4+Math.max(0,9-i*2)*.7,z,10,'#ffc27a');}
  // A horse at the trough and bundles of arrows are in the yard details.
  for(let i=0;i<6;i++){const x=-130+i*14;k.box(x,0,S*1.5,10,8+(i%3),8,'#b39a4a',i*.2);}
 },
 isengard(k,g){const S=115,H=58;for(let i=0;i<24;i++){const a=i/24*6.283;k.box(Math.cos(a)*S*1.34,0,Math.sin(a)*S*1.34,3,H*.86,5,'#2a2a2f',-a);}
  for(const y of [22,44,H])k.column(0,y,0,S*1.34-y*.34+3,1.4,'#55555e',12);
  },
 library(k,g){const S=115,H=58,pale='#f0e8d0',trim='#b8954f';
  for(let i=-7;i<=7;i++){if(Math.abs(i)<2)continue;for(const s of [-1,1]){k.limb([[i*15,H+10,s*(S+12),.5],[i*15+7.5,H+16,s*(S+12),.3],[i*15+15,H+10,s*(S+12),.5]],trim,4);}k.box(i*15,H-4,-S-4,8,12,1,'#3a3226');}
  for(let i=-6;i<=6;i++){k.box(-S-4,H-4,i*16,1,12,8,'#3a3226');k.box(S+4,H-4,i*16,1,12,8,'#3a3226');g.box(-S-4.6,H,i*16,.2,4,3,'#ffe6a8');g.box(S+4.6,H,i*16,.2,4,3,'#ffe6a8');}
  for(const [x,z] of [[-S-34,S-10],[S+34,S-10],[-S-30,-S+6],[S+30,-S+10]]){k.cyl(x,0,z,6,4,10,pale,12);k.canopy(x,18,z,10,['#3f5f36','#54763f'],Math.abs(x)+1,.9);}
  for(let i=0;i<6;i++){const x=-60+i*24;k.limb([[x,0,S+24,.5],[x+1,14,S+24,.4]],trim,4);litInto(k,g,x+1,15.4,S+24,1.1);}},
 lorien(k,g){const S=115,H=58;for(let i=0;i<30;i++){const a=i*.21,r=S*.82,y=8+i*3.6;k.box(Math.cos(a)*r,y,-20+Math.sin(a)*r,12,.9,5,'#d8d4bc',-a);if(i%3===0){k.column(Math.cos(a)*(r+4),y,-20+Math.sin(a)*(r+4),.3,6,'#c9b878',5);litInto(k,g,Math.cos(a)*(r+4),y+6.8,-20+Math.sin(a)*(r+4),.9,'#fff6c4');}}
  for(const [x,z,r] of [[-92,-84,16],[88,-92,15],[-96,84,14],[94,88,15]]){k.column(x,H+6,z,r+10,1.4,'#c9c6a8',16);for(let i=0;i<12;i++){const a=i*.524;k.column(x+Math.cos(a)*(r+9),H+7.4,z+Math.sin(a)*(r+9),.4,6,'#d8d0a8',5);}litInto(k,g,x,H+16,z,1.5,'#fff6c4');}},
 council(k,g){const S=115;for(let i=0;i<18;i++){const a=i*.35-.6,x=Math.cos(a)*S*1.3,z=-30+Math.sin(a)*S*1.3;k.limb([[x,24,z,4],[x*1.1,10,z*1.05,3],[x*1.18,0,z*1.08,3.6]],'#2a2118',6);}
  for(let i=0;i<12;i++){const x=-110+i*20,z=S*1.18+(i%2)*4,h=10+(i%3)*3;if(Math.abs(x)<40)continue;k.column(x,0,z,.45,h,'#2b241b',6);k.limb([[x,h,z,.4],[x+2.4,h+2.4,z,.3]],'#2b241b',4);litInto(k,g,x+2.4,h+1.2,z,1,'#ffc878');}},
 forge(k,g){const S=115;for(let i=0;i<8;i++){const x=-70+i*20;k.box(x,0,S*1.28,8,4+(i%3),6,'#6a655a',i*.3);}for(const s of [-1,1]){for(let i=0;i<4;i++){k.column(s*(46+i*18),0,S*1.14,2.4,48-i*7,'#6a655a',8);k.cyl(s*(46+i*18),48-i*7,S*1.14,4,2.4,2,'#6a655a',8);}}
  for(let i=0;i<9;i++){k.box(-40+i*10,70,S*1.2+1,.7,4,.4,'#8cc6e2');}},
 gate(k,g){const S=115;for(let i=0;i<5;i++)k.add(k.cube(),0,70+i*28,S*1.2-i*12,20-i,1.4,6,'#bdbaac');for(let t=0;t<7;t++){const r=S*[1.46,1.22,1.02,.86,.72,.58,.44][t],y=[0,60,94,128,162,196,230][t];for(let i=0;i<14;i++){const a=i/14*6.283;g.box(Math.sin(a)*(r+.6),y+18,Math.cos(a)*(r+.6),1,2.8,.6,'#ffd98a',a);}}},
 messengers(k,g){},
 treasury(k,g){const S=115;for(let i=0;i<7;i++)k.box(-90+i*30,0,S*1.5+i%2,18,3+(i%3),9,'#7c7664',i*.3);},
 observatory(k,g){const S=115;for(let i=0;i<20;i++){const a=i/20*6.283;k.limb([[Math.sin(a)*(S*1.28),0,Math.cos(a)*(S*1.28),.8],[Math.sin(a)*(S*1.3),14+(i%5)*3,Math.cos(a)*(S*1.3),.5]],'#4f6a3a',4);}for(let i=0;i<6;i++){const a=(i+.5)/6*3.14-1.57;k.box(Math.sin(a)*S*1.12,H_O,Math.cos(a)*S*1.12,4,3,1,'#b5a578',a);}},
};
const H_O=70;
