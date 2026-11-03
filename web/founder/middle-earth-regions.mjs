// What makes each region of the 3D Middle-earth itself: landmarks, mood, close-up details and the Balrog of Moria.
// Pure drawing. No data from the server and no server access.
import * as T from './vendor/three.module.min.js';
import {Kit,solid,glowing,HALL,fireAt} from './middle-earth-3d.mjs';
import {buildingDetail} from './middle-earth-places.mjs';
const {half:S,height:H}=HALL;
const crate=(k,x,z,s=10)=>{k.box(x,0,z,s,s,s,'#8a6636');k.box(x,s*.45,z,s+.3,1,s+.3,'#5e4322');};
const barrel=(k,x,z)=>{k.column(x,0,z,5,13,'#6a4a22');k.column(x,3,z,5.2,.8,'#2f2010');k.column(x,9,z,5.2,.8,'#2f2010');k.column(x,13,z,4.6,.3,'#a57f46');};
const table=(k,x,z,w,d,color='#94703f')=>{k.box(x,12,z,w,2,d,color);for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]])k.column(x+a*(w/2-2),0,z+b*(d/2-2),1.2,12,'#5e4322');};
const rock=(k,x,z,r,color='#6c675e')=>{k.rock(x,r*.3,z,r,r*.72,r*.9,color,Math.abs(Math.round(x*7+z))+1);};
const lantern=(k,g,x,z,h=20)=>{k.column(x,0,z,.8,h,'#3a2a16');g.lamp(x,h+2,z,2.2);};
const stones=(k,n,R,color,y=0)=>{for(let i=0;i<n;i++){const a=i/n*6.283,s=2+(i*7%5)*.7;k.box(Math.cos(a)*(R+(i%3)*5),y,Math.sin(a)*(R+(i%3)*5),s*2,s,s*1.6,color,a);}};
const pine=(k,x,z,s=1,c='#1f4a2c')=>{k.column(x,0,z,2*s,10*s,'#3a2a18',6);k.cone(x,8*s,z,12*s,22*s,c,7);k.cone(x,20*s,z,8*s,18*s,'#2a6036',7);};
// A dark doorway set into the south side of a covering shape.
const gateway=(k,g,w,h,z,stone,light)=>{k.box(-w/2-4,0,z,8,h,10,stone);k.box(w/2+4,0,z,8,h,10,stone);k.box(0,h,z,w+16,8,10,stone);k.box(0,0,z-1,w,h,6,'#0d0c0a');if(light)g.box(0,0,z+2.2,w*.7,h*.7,.5,light);};

// Beeches and birches of the valley of Rivendell; their leaf crowns are in regionLeaves.
const bruchtalTrees=[[-270,-110,1.5],[-40,-312,1.9],[70,-265,1.6],[150,-230,1.4],[-260,-50,1.4],[-235,70,1.3],[240,-170,1.5],[245,20,1.3],[-215,160,1.2]];
// An open elven rotunda: slender columns under a green copper dome.
const rotunda=(k,g,x,z,r,h,pale)=>{k.column(x,0,z,r+2,2.2,pale,14);for(let i=0;i<8;i++){const a=i*.785;k.column(x+Math.cos(a)*r,2,z+Math.sin(a)*r,.9,h,pale,8);}k.column(x,h+2,z,r+1.4,1.6,'#c9a24a',14);k.dome(x,h+3.6,z,r+1,'#6f8a6a',.7);k.cone(x,h+3.6+r*.7,z,1.2,7,'#c9a24a',8);g.lamp(x,h-2,z,1.7);};
// Landmarks stand behind the hall and name a region from far away.
// A proper house: stone footing, timbered walls, pitched roof, door, windows and chimney.
function house(k,g,x,z,w,d,h,wall,roof,ry=0,frame='#3a2a18'){
 k.local(x,z,ry,()=>{
  k.box(0,-10,0,w+1.4,13,d+1.4,'#5f5a4d');k.box(0,3,0,w,h-3,d,wall);
  for(const a of [-1,1]){k.box(a*(w/2-.4),3,d/2+.1,1.3,h-3,.5,frame);k.box(a*(w/2-.4),3,-d/2-.1,1.3,h-3,.5,frame);}
  k.box(0,h*.62,d/2+.15,w,1,.4,frame);k.box(0,h-1,d/2+.15,w,1,.4,frame);k.box(0,h*.62,-d/2-.15,w,1,.4,frame);
  k.box(0,0,d/2+.2,w*.2,h*.56,.6,'#2a1d10');
  for(const a of [-1,1]){k.box(a*w*.3,h*.26,d/2+.25,w*.15,h*.22,.3,frame);g.box(a*w*.3,h*.28,d/2+.4,w*.11,h*.17,.2,'#e8c678');}
  k.gable(0,h,0,w+2.4,d+3,h*.62,roof,0);
  k.box(w*.24,h,-d*.2,3.2,h*.75,3.2,'#4b4640');
 });
}
export const landmarks={
 // Helm's Deep: the gorge closes behind the fortress, the Deeping Wall runs from the keep across to the cliff.
 scouts(k,g,fx){const stone='#837f6e';for(const [x,z,sx,sy,sz,seed] of [[-110,-170,52,170,60,1],[-130,-245,90,200,55,2],[110,-265,150,220,60,3],[250,-90,60,200,62,1]])k.crag(x,0,z,sx,sy,sz,'#4c4d4b',seed);k.box(222,0,18,146,32,15,stone);for(let i=0;i<20;i++)k.box(153+i*7.2,32,25,4.4,4.5,2.6,'#9a9684');k.box(222,31,14,146,1.5,8,'#716d5e');for(let i=0;i<6;i++)k.box(168+i*25,0,27,7,22,4,'#716d5e');arch(k,222,0,26,16,15,'#14120f',.8);k.box(222,1,26.5,12,1,.4,'#54565a');for(let i=0;i<5;i++)k.box(217+i*2.5,1,26.8,.7,10,.5,'#3a3c40');fx.smoke.push([14,H+56,-10]);},
 // Isengard: the black tower of Orthanc in the ring of stone, fires and smoke from the pits.
 isengard(k,g,fx){
  for(let i=0;i<64;i++){const t=i/64*6.283,gate=Math.abs(Math.atan2(Math.sin(t),Math.cos(t)))<.2;if(gate)continue;const x=Math.sin(t)*232,z=Math.cos(t)*232;k.box(x,0,z,24.4,26,10,'#2f2d2c',t);k.box(x,26,z,24.4,2,13,'#242322',t);if(i%2)k.box(x,28,z,6,5,4,'#2f2d2c',t);}for(const s of [-1,1]){k.column(s*50,0,228,13,48,'#2a2827',8);k.cone(s*50,48,228,14,14,'#1d1c1b',8);}
  for(const [x,z] of [[-180,-120],[180,-120],[-210,20],[210,20]]){k.column(x,0,z,12,70,'#2c2a26',8);k.column(x,70,z,14,5,'#17150f',8);fx.smoke.push([x,76,z]);g.column(x,0,z+13,6,14,'#d85a1a');}
  for(let i=0;i<6;i++){const a=i*1.05;if(Math.hypot(Math.cos(a)*205,Math.sin(a)*205*.6-40)<160)continue;k.box(Math.cos(a)*205,0,Math.sin(a)*205*.6-40,30,3,14,'#26231e',a);}
  fx.embers.push([0,10,-160]);
 },
 // Rivendell: pale houses on terraces in the deep valley, falling waters behind them.
 library(k,g,fx){
  for(const [x,z,h] of [[-120,-170,34],[-46,-205,50],[46,-205,50],[120,-170,34]]){k.box(x,0,z,44,h,38,'#e3d8b8');k.box(x,h,z,54,1.2,48,'#b8954f');swept(k,x,h+1.2,z,58,52,46,'#8f6747','#c9a458');for(let i=0;i<5;i++){k.column(x-20+i*10,0,z+21,1.1,h-2,'#f0e8d0',8);lancet(k,x-15+i*7.5,h*.42,z+19.4,4.4,h*.38,'#3a3226','#b8954f');}g.lamp(x,h*.5,z+22,1.4);}
  const pale='#e9e2cb';
  // The river comes down over low mossy ledges into the valley, not from a mountain.
  for(const [x,z,r,c] of [[150,-322,26,'#5c6450'],[208,-326,30,'#565e4c'],[178,-352,36,'#60684f'],[126,-346,22,'#535b48'],[232,-354,26,'#596149']])rock(k,x,z,r,c);
  for(const [x,y,z,w,h] of [[176,0,-312,15,14,3],[178,12,-326,11,14,3],[176,24,-338,8,14,3]])k.box(x,y,z,w,h,2.4,'#cfe2e8');fx.spray.push([176,5,-302]);
  // Two arched footbridges to the far bank, and the rotundas of the terraces.
  // Each bridge is one rigid arch from bank to bank: the valley drops under it, so its pieces must not settle one by one.
  for(const [z,a,b] of [[-60,146,238],[92,138,226]]){const gr=k.ground,lift=x=>gr?gr(x,z):0,ya=lift(a),yb=lift(b),n=22,arc=t=>ya+(yb-ya)*t+1+Math.sin(t*Math.PI)*16;k.ground=null;for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n,x=a+(b-a)*(t0+t1)/2,y=(arc(t0)+arc(t1))/2,dx=(b-a)/n,dy=arc(t1)-arc(t0),len=Math.hypot(dx,dy)+.5,tilt=Math.atan2(dy,dx),m=Math.abs(.5-(t0+t1)/2);k.add(k.cube(),x,y-.5,z,len,1,7.4,pale,0,0,tilt);k.add(k.cube(),x,y-2.4-m*3,z,len,2.8+m*6,5,pale,0,0,tilt);for(const s of [-1,1]){k.add(k.cube(),x,y+1.8,z+s*3.4,len,.5,.5,'#c9a24a',0,0,tilt);if(i%2===0)k.column(x,y,z+s*3.4,.26,1.9,pale,5);}}for(const [x,y] of [[a,ya],[b,yb]]){k.box(x,y-6,z,8,7,10,pale);for(const s of [-1,1])k.column(x,y,z+s*4,.9,9,pale,8);}k.ground=gr;for(const x of [a,b])g.lamp(x,10,z+4,1.3);}
  rotunda(k,g,252,-60,13,20,pale);rotunda(k,g,-188,-96,15,22,pale);rotunda(k,g,-176,52,12,18,pale);rotunda(k,g,240,92,11,17,pale);
  // Terraces of pale stone stepping away from the castle, with lamps along their edges.
  for(const [x,z,w,d] of [[-186,-96,70,70],[-176,52,56,56]]){k.box(x,0,z,w,1.6,d,'#bdb69e');for(const s of [-1,1])for(const t of [-1,1]){k.column(x+s*w/2,1.6,z+t*d/2,.5,9,'#6a5a3c',6);g.lamp(x+s*w/2,11.4,z+t*d/2,1);}}
  // Waterfalls fall from mossy cliffs right beside the terraces, over three ledges into clear pools.
  const fall=(x,z,h,ry)=>{const c=Math.cos(ry),n=Math.sin(ry),P=(a,b)=>[x+a*c+b*n,z-a*n+b*c];for(const [a,b,w,col,seed] of [[0,-4,24,'#7d8270',3],[-22,-6,18,'#747a66',5],[22,-7,19,'#80856f',7]]){const [px,pz]=P(a,b);k.rock(px,h*.5,pz,w,h*.55,11,col,seed);}for(const [a,b,r,col] of [[-24,-4,24,'#5c6450'],[24,-6,26,'#565e4c'],[0,-20,32,'#60684f'],[-14,-14,20,'#535b48'],[16,-16,22,'#596149']]){const [px,pz]=P(a,b);rock(k,px,pz,r,col);}for(const [a,b] of [[-14,-2],[12,-3],[-4,-6]]){const [px,pz]=P(a,b);k.ball(px,h+1,pz,7,'#5f8a3e',.5);}
   for(let j=0;j<3;j++){const top=h*(1-j/3),bot=h*(1-(j+1)/3),w=26-j*3,[px,pz]=P(0,11.6+j*5);k.box(px,bot,pz,w,top-bot+1,2.2,'#cfe2e8',ry);const [qx,qz]=P(0,12.9+j*5);g.box(qx,bot,qz,w*.45,top-bot+1,.6,'#e8f6fb',ry);const [lx,lz]=P(0,10+j*5);k.box(lx,bot-1.4,lz,w+6,2.4,6,'#7d8270',ry);}
   const [ox,oz]=P(0,30),lift=(x,z)=>k.ground?k.ground(x,z):0;k.column(ox,-6,oz,17.5,8.4,'#6f6a5c',24);k.column(ox,2,oz,16,.8,'#3f7f96',24);k.column(ox,2,oz,10,.9,'#cfe2e8',20);for(let i=0;i<12;i++){const t=i*.52-.3;k.ball(ox+Math.sin(t+ry)*17.5,.6,oz+Math.cos(t+ry)*17.5,2.4,'#8a8a7c',.5);}fx.spray.push([ox,5+lift(ox,oz),oz]);const [mx,mz]=P(0,18);fx.spray.push([mx,h*.4+lift(mx,mz),mz]);};
  fall(-186,-200,100,0);fall(-222,0,86,-Math.PI/2);fall(-104,-270,92,0);
  // Brooks run from the pools between mossy stones to the river west of the valley; the northern pool spills into the next one.
  const brook=(pts,drop)=>{const n=pts.length-1;for(let i=0;i<n;i++){const [ax,az]=pts[i],[bx,bz]=pts[i+1];for(let j=0;j<8;j++){const t0=j/8,t1=(j+1)/8,w=Math.sin((i*4+j)*1.3)*1.6,x0=ax+(bx-ax)*t0,z0=az+(bz-az)*t0,x1=ax+(bx-ax)*t1,z1=az+(bz-az)*t1,dx=x1-x0,dz=z1-z0,len=Math.hypot(dx,dz),ry=Math.atan2(dx,dz),mx=(x0+x1)/2+Math.cos(ry)*w,mz=(z0+z1)/2-Math.sin(ry)*w,f=(i*8+j+.5)/(n*8),y=-2-drop*f*f;k.box(mx,y,mz,9,4,len+1.4,'#3f7f96',ry);k.box(mx,y+.15,mz,3.4,4,len+1.4,'#cfe2e8',ry);for(const s of [-1,1])if((i*8+j)%3===(s>0?0:1))k.ball(mx+Math.cos(ry)*s*6.2,y+2.2,mz-Math.sin(ry)*s*6.2,1.6+((i+j)%3)*.5,(i+j)%2?'#8a8a7c':'#6f8a52',.55);}}};
  brook([[-112,-232],[-148,-222],[-170,-200],[-184,-186]],0);brook([[-200,-164],[-232,-150],[-258,-147],[-288,-144]],2);brook([[-266,0],[-284,3],[-298,5],[-310,2]],2);
  for(const [x,z,s] of bruchtalTrees){k.cyl(x,0,z,1.5*s,3.2*s,42*s,'#54483a',8);for(const [a,len] of [[.7,14],[3,13],[5,14]])k.limb([[x,28*s,z,1.5*s],[x+Math.cos(a)*len*s,42*s,z+Math.sin(a)*len*s,.4*s]],'#54483a',5);}
 },
 // Lothlórien: mallorn giants carrying the talans, lamps in the golden leaves.
 lorien(k,g,fx){for(const [x,z,s] of [[-110,-150,1.8],[0,-200,2.6],[120,-160,2],[-180,-70,1.5],[200,-40,1.5]]){k.cyl(x,0,z,5*s,11*s,120*s,'#c8d4e2',10);k.canopy(x,124*s,z,27*s,['#e2cc5e','#f0dc78','#d4bc4c'],Math.round(x+z)&255||1,.55);for(const [a,len] of [[.5,30],[2.6,28],[4.6,31]])k.limb([[x,98*s,z,3*s],[x+Math.cos(a)*len*.55*s,110*s,z+Math.sin(a)*len*.55*s,2*s],[x+Math.cos(a)*len*s,122*s,z+Math.sin(a)*len*s,.5*s]],'#bcc8d6',6);k.column(x,84*s,z,15*s,1.6,'#b9b59a',14);for(let i=0;i<34;i++){const f=i/34,t=f*4.2*6.283,r=(11-f*6)*s+1.6,sy=f*84*s;k.box(x+Math.cos(t)*r,sy,z+Math.sin(t)*r,3.4*s,.5,1.5*s,'#ece9d8',Math.PI/2-t);if(i%6===0)k.column(x+Math.cos(t)*(r+1.4*s),sy,z+Math.sin(t)*(r+1.4*s),.2,3.2,'#d8d0a8',4);}for(let i=0;i<10;i++){const a=i*.628;k.column(x+Math.cos(a)*14*s,85.6*s,z+Math.sin(a)*14*s,.5,5,'#d8d0a8',5);}for(let i=0;i<6;i++){const a=i*1.05;g.lamp(x+Math.cos(a)*13*s,92*s,z+Math.sin(a)*13*s,1.5);}fx.leaves.push([x,120*s,z]);}
  // A bright, fruitful paradise below the trees: meadows of golden elanor and white niphredil, fruit on low boughs and the silver basin of the Mirror.
  for(let i=0;i<620;i++){const a=i*2.399,r=128+(i*53%118),x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(x)<30&&z>0)continue;if(Math.hypot(x+92,z+84)<26||Math.hypot(x-88,z+92)<26||Math.hypot(x+96,z-84)<24||Math.hypot(x-94,z-88)<26||Math.hypot(x,z+20)<52)continue;k.column(x,0,z,.6,7,'#6a9a3a',3);k.ball(x,.8,z,3.4,'#5fb03a',.45);k.add(k.octa(1),x,7.4,z,7.6,2.2,7.6,['#ffd400','#ffffff','#ff8fb8','#8ab8ff','#ffc800','#b47cff','#ff6a5a','#fff2a0'][i%8],a);if(i%2)k.ball(x+2,.4,z+1,2.2,'#7ab048',.4);}
  for(const [x,z] of [[-150,-10],[150,-20],[-130,60],[136,56],[-196,40],[196,30],[-60,-160],[64,-168]]){k.cyl(x,0,z,1.6,2.2,14,'#8a7a5a',8);k.canopy(x,18,z,9,['#7aa04a','#8ab456','#6a9a40'],Math.abs(x+z)+3,.6);for(let j=0;j<7;j++){const t=j*.9;k.ball(x+Math.cos(t)*7,15+(j%3)*2,z+Math.sin(t)*7,1,j%2?'#e8a030':'#d0583a');}for(let j=0;j<10;j++){const t=j*.63;k.ball(x+Math.cos(t)*8.6,19+(j%4)*1.6,z+Math.sin(t)*8.6,1.3,j%2?'#fde4ec':'#ffffff',.7);}}
  for(let i=0;i<24;i++){const a=i*2.399,r=140+(i*41%80);g.ball(Math.cos(a)*r,10+(i*7%26),Math.sin(a)*r,.45,'#fff4c0');}
  {const mx=-128,mz=112;for(let i=0;i<5;i++)k.box(mx,0,mz+18+i*3,20-i*1.4,i*.6+.6,3,'#e4e2cf');k.column(mx,0,mz,9,.8,'#e4e2cf',20);k.cyl(mx,.8,mz,2,3,9,'#e0e6ec',12);k.cyl(mx,9.8,mz,7,2.6,2.6,'#d8dcc8',20);k.column(mx,12,mz,6.4,.2,'#bfe2f4',20);g.ball(mx,12.6,mz,1.2,'#eaf8ff');k.column(mx+5,0,mz-6,.4,12,'#e0e6ec',6);k.add(k.cylinder(.4,1.6,4,8),mx+5,12,mz-6,1,1,1,'#d8dcc8',0,0,-.5);}
  for(let i=0;i<14;i++){const a=i*.45+.2,r=170,x=Math.cos(a)*r*.9,z=-20+Math.sin(a)*r*.6;if(Math.hypot(x,z)<132)continue;k.column(x,0,z,.4,9,'#e4e2cf',6);k.limb([[x,9,z,.35],[x+1.6,11.4,z,.25],[x+2.4,10.6,z,.12]],'#c4b050',4);g.lamp(x+2.4,9.6,z,1);}
 },
 // Mirkwood: the cave gate of the Woodland Realm under the dark canopy, cobwebs between the trees.
 council(k,g){for(const [x,z] of [[-232,-104],[232,-104],[-294,14],[-150,-170],[0,-196],[150,-170]]){k.cyl(x,0,z,6,10,58,'#2a2118',7);k.canopy(x,66,z,24,['#102418','#13291b','#0f2016'],Math.round(x*3+z)&255||1);}},
 // Moria: the mountain with the Doors of Durin, glowing with their star and trees.
 forge(k,g,fx){for(const [a,b,sx,sy,seed] of [[-110,-250,90,92,1],[110,-250,90,98,2],[0,-270,130,124,3]])k.crag(a,0,b,sx,sy,50,'#7f7a70',seed);fx.embers.push([0,6,-110]);},
 // Minas Tirith: seven white tiers, the great prow and the Tower of Ecthelion with its banner.
 gate(k,g){for(let i=0;i<11;i++){const a=-2.8+i*.56,hx=Math.cos(a)*222,hz=Math.sin(a)*(Math.sin(a)<0?214:180);if(Math.abs(hx)<82&&hz>0||![5,6,7].includes(i))continue;house(k,g,hx,hz,36,28,24+(i%3)*8,'#cbc8ba','#54524c',-a+1.57,'#8f8c80');}},
 // Hobbiton: round doors in the green hills, gardens, chimneys, the party tree.
 messengers(k,g,fx){for(const [x,z,r,door] of [[-216,58,46,'#2f6a3a'],[232,62,48,'#a02a14'],[-296,-60,44,'#8a6f22'],[288,-46,46,'#2f5a7a'],[-306,148,40,'#7a3a6a'],[306,136,42,'#c9962d']])smial(k,g,fx,x,z,r,door);k.cyl(-40,0,-205,5,9,44,'#4a3218',8);k.canopy(-40,58,-205,22,['#26401f','#2d4a26'],7);},
 // Erebor: the Lonely Mountain with its great gate and the town of Dale at its foot.
 treasury(k,g,fx){for(const [a,b,sx,sy,seed] of [[-100,-262,88,96,1],[100,-262,88,90,2],[0,-280,130,132,3]])k.crag(a,0,b,sx,sy,50,'#837d6e',seed);for(const [x,z,s,r] of [[-208,-58,1,.2],[-240,40,.9,-.3],[208,-58,1,-.2],[240,30,.9,.4],[-224,-10,.8,.5],[224,-20,.8,-.5],[-264,104,.9,0],[236,84,.85,.3]]){house(k,g,x,z,34*s,28*s,22*s,'#a89878','#5e3324',r);fx.smoke.push([x+8*s,44*s,z-6*s]);}},
 // Osgiliath: the ruined city on the Anduin, broken domes and arches.
 observatory(k,g){k.box(0,0,-235,120,44,70,'#a9a692');k.dome(0,44,-235,50,'#c5c2ae');for(let i=0;i<9;i++)if(Math.abs(-160+i*40)>120)k.column(-160+i*40,0,-130+(i%2)*20,6,20+(i*7%5)*14,'#b9b6a4',8);for(const [x,z] of [[-192,-40],[170,-50]]){k.box(x,0,z,14,34,14,'#9c9a88');k.box(x+36,0,z,14,28,14,'#8f8d7c');k.box(x+18,26,z,50,6,14,'#9c9a88');k.rock(x<0?x-22:x+60,0,z,14,8,10,'#8a8775',Math.abs(x));}for(let i=0;i<14;i++){const x=-190+(i*29)%380,z=-200+(i*17)%90;if(Math.hypot(x,z)<176)continue;k.box(x,0,z,8+(i%4)*4,4+(i%3)*2,7,'#8a8775',i);}},
};

// Where painted crowns sit on the great trees of a region: outside, and over a hall (those thin out when zooming in).
export const regionLeaves={
 library:{kind:'gold',outside:bruchtalTrees.map(([x,z,s])=>[x,48*s,z,22*s]),roof:[]},
 lorien:{kind:'gold',outside:[[-110,-150,1.8],[0,-200,2.6],[120,-160,2],[-180,-70,1.5],[200,-40,1.5]].map(([x,z,s])=>[x,128*s,z,33*s]),roof:[[-70,-70,62],[70,-70,66],[-70,70,60],[70,70,58],[0,0,76],[0,-100,48],[-100,0,48],[100,0,48],[0,100,46]].map(([x,z,r])=>[x,H+40,z,r*1.02])},
 council:{kind:'dark',outside:[[-232,-104],[232,-104],[-262,14],[-150,-170],[0,-196],[150,-170]].map(([x,z])=>[x,70,z,32]),roof:[[-70,-70,62],[70,-70,66],[-70,70,60],[70,70,58],[0,0,76],[0,-100,48],[-100,0,48],[100,0,48],[0,100,46]].map(([x,z,r])=>[x,H+34,z,r*1.02])},
 messengers:{kind:'oak',outside:[[-40,62,-205,36]],roof:[[-30,104,-40,23],[-92,S*.85,S*1.3,14],[94,S*.85,S*1.28,15],[-132,S*.85,S*1.02,17],[136,S*.85,S*.98,16]].map(([x,y,z,r],i)=>i?[x,r*.8,z,r]:[x,y,z,r])},
};
// Parts that several buildings share.
// A pointed window: dark opening under two curved golden ribs meeting at the top.
const lancet=(k,x,y,z,w,h,dark,rib)=>{k.box(x,y,z,w,h*.72,.6,dark);k.gable(x,y+h*.72,z-.3,w,.6,h*.28,dark);k.limb([[x-w/2,y+h*.7,z+.6,.34],[x-w*.32,y+h*.88,z+.6,.28],[x,y+h,z+.6,.2]],rib,4);k.limb([[x+w/2,y+h*.7,z+.6,.34],[x+w*.32,y+h*.88,z+.6,.28],[x,y+h,z+.6,.2]],rib,4);};
// An elven tower: thin shaft, balcony on brackets, lantern storey and a cap that sweeps to a needle.
// A shingled roof with the elven curve: steep at the ridge, flaring gently at the eaves, with ribs on its hips and even battens.
const swept=(k,x,y,z,w,d,h,color,rib,ridge=false)=>{const levels=14,f=t=>Math.pow(1-t,1.55)*.94+.06,tip=ridge?.0:0,course='#'+new T.Color(color).multiplyScalar(.86).getHexString();for(let i=0;i<levels;i++){const a=i/levels,b=(i+1)/levels,ra=f(a),rb=i===levels-1?tip+.02:f(b);k.add(new T.CylinderGeometry(rb/ra,1,1,4,1,false).toNonIndexed(),x,y+a*h+(b-a)*h/2,z,w*ra*.7071,(b-a)*h,ridge?d*ra*.7071+(1-ra)*d*.5:d*ra*.7071,i%2?course:color,Math.PI/4);}if(!rib)return;
 // The eaves turn up at every corner in a slender curl, a fascia runs under them, and gilded ribs follow the hips up to a finial.
 for(const q of [-1,1])for(const e of [-1,1])k.limb([[x+q*w*.47,y+.4,z+e*d*.47,.6],[x+q*w*.53,y+1.4,z+e*d*.53,.42],[x+q*w*.58,y+3.6,z+e*d*.58,.24],[x+q*w*.59,y+6,z+e*d*.59,.08]],rib,5);
 for(const q of [-1,1]){k.box(x,y-.6,z+q*d*.47,w*.94,1.2,.8,rib);k.box(x+q*w*.47,y-.6,z,.8,1.2,d*.94,rib);}
 for(const q of [-1,1])for(const e of [-1,1]){const line=[];for(let i=0;i<=levels;i++){const t=i/levels,r=f(t);line.push([x+q*w*.5*r,y+t*h+.25,z+e*d*.5*r,i<levels?.5:.12]);}k.limb(line,rib,4);}
 k.ball(x,y+h,z,1.3,rib);k.cone(x,y+h+.8,z,.6,h*.3,rib,6);};

const elfTower=(k,g,x,z,r,h,wall,cap,trim)=>{k.column(x,0,z,r,h,wall,14);for(const q of [.34,.58])k.column(x,h*q,z,r+.6,1,trim,14);k.column(x,h*.78,z,r+3.4,1.4,trim,14);for(let i=0;i<10;i++){const a=i*.628;k.column(x+Math.cos(a)*(r+3),h*.78+1.4,z+Math.sin(a)*(r+3),.3,4,wall,5);k.limb([[x+Math.cos(a)*r,h*.72,z+Math.sin(a)*r,.45],[x+Math.cos(a)*(r+3),h*.78,z+Math.sin(a)*(r+3),.25]],trim,4);}g.lamp(x,h*.78+4,z+r+2.6,1);k.column(x,h,z,r*.78,10,wall,12);for(let i=0;i<6;i++){const a=i*1.047;k.box(x+Math.cos(a)*r*.78,h+2,z+Math.sin(a)*r*.78,2,6,.6,'#2c2a24',Math.PI/2-a);}k.column(x,h+10,z,r+1.4,.9,trim,14);k.cone(x,h+10.9,z,r+1.4,r*1.1,cap,14);k.cone(x,h+10.9+r*.95,z,r*.55,r*2.6,cap,12);k.cone(x,h+10.9+r*3.3,z,.5,6,trim,6);};
const arch=(k,x,y,z,w,h,color,thick=.8)=>{k.box(x,y,z,w,h-w/2,thick,color);k.disc(x,y+h-w/2,z,w/2,thick,color);};
const spire=(k,x,z,r,h,wall,top,band='#a99468')=>{k.column(x,0,z,r,h,wall,14);k.cone(x,h,z,r+3,r*3.4,top,14);k.column(x,h-12,z,r+1.2,1.6,band,14);k.column(x,h*.55,z,r+.7,1.2,band,14);for(let i=0;i<4;i++){const a=i*1.57+.78;k.box(x+Math.cos(a)*r,h*.72,z+Math.sin(a)*r,2,8,2,'#26241f',a);}};
// A carved stone gate on the south side of a mountain or hill, standing proud of the rock.
const stoneGate=(k,z,w,h,stone,inner)=>{k.box(0,0,z-16,w+40,h+18,30,stone);for(const s of [-1,1]){k.box(s*(w/2+7),0,z,12,h+4,10,stone);k.column(s*(w/2+7),h+4,z,7,5,stone,8);}k.box(0,h+3,z,w+30,8,12,stone);k.box(0,h+11,z-1,w+14,5,9,stone);arch(k,0,0,z+.2,w,h,inner,1);for(let i=0;i<5;i++)k.box(0,i*.9,z+7+(4-i)*3.4,w+32-i*5,.9,4,stone);};
// A dwarf king carved from the mountain beside the gate.
const dwarfStatue=(k,x,z,h,stone)=>{const q=h/100,deep='#7a7564',gold='#c9962d';
 // A dwarf king carved from the cliff: broad robed body and rounded shoulders, a helm with nose-guard, a beard in long locks, both hands on the great axe.
 k.box(x,0,z,50*q,8*q,38*q,deep);k.limb([[x,8*q,z,23*q],[x,40*q,z,23*q],[x,64*q,z,25*q],[x,76*q,z,14*q]],stone,14);k.box(x-22*q,44*q,z+18*q,44*q,3.4*q,3*q,gold);
 for(const s of [-1,1]){k.limb([[x+s*25*q,70*q,z,12*q],[x+s*30*q,52*q,z+3*q,9*q],[x+s*12*q,38*q,z+18*q,6.5*q]],stone,10);k.ball(x+s*8*q,38*q,z+20*q,6*q,deep);k.limb([[x+s*24*q,78*q,z,6*q],[x+s*29*q,74*q,z,9*q],[x+s*31*q,66*q,z,6*q]],deep,8);}
 k.ball(x,84*q,z+1*q,11*q,stone);k.dome(x,88*q,z+1*q,12.4*q,deep);k.box(x,86*q,z+12*q,2.6*q,8*q,1.4*q,gold);k.column(x,87*q,z+1*q,12.6*q,1.4*q,gold,14);k.cone(x,99*q,z+1*q,3*q,7*q,gold,8);
 for(let i=0;i<7;i++){const w=20-i*2.4;for(const c of [-1,0,1])k.limb([[x+c*w*.34*q,(78-i*5)*q,z+(12+i*.8)*q,w*.19*q],[x+c*w*.3*q,(73-i*5)*q,z+(12.6+i*.8)*q,w*.17*q]],i%2?stone:deep,6);}
 k.column(x,0,z+22*q,2*q,74*q,deep,8);for(const s of [-1,1]){k.box(x+s*11*q,54*q,z+22*q,19*q,15*q,1.8*q,'#9a9582');k.box(x+s*21*q,51*q,z+22*q,2*q,21*q,2.2*q,gold);}k.cone(x,74*q,z+22*q,3*q,5*q,gold,6);};

// The White Tree: one gnarled trunk forking again and again, drawn by a fixed seed so it never changes.
const whiteTree=(k,x,y,z,h)=>{let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647,wood='#efece2',flower='#ffffff';
 const grow=(px,py,pz,ang,lean,len,r,depth)=>{const nx=px+Math.sin(ang)*Math.sin(lean)*len,ny=py+Math.cos(lean)*len,nz=pz+Math.cos(ang)*Math.sin(lean)*len;k.limb([[px,py,pz,r],[(px+nx)/2+(rnd()-.5)*len*.34,(py+ny)/2,(pz+nz)/2+(rnd()-.5)*len*.34,r*.84],[nx,ny,nz,r*.62]],wood,depth>2?7:5);
  if(depth<=1)for(let i=0;i<5+depth*3;i++)k.ball(nx+(rnd()-.5)*3.4,ny+(rnd()-.5)*2.4,nz+(rnd()-.5)*3.4,.26+rnd()*.26,flower);
  if(depth===0)return;const n=depth>2?3:rnd()>.45?3:2;for(let i=0;i<n;i++)grow(nx,ny,nz,ang+(i-(n-1)/2)*1.32+(rnd()-.5)*.8,Math.min(1.46,lean+.26+rnd()*.26),len*.74,r*.62,depth-1);};
 for(let i=0;i<5;i++){const a=i*1.257+.3;k.limb([[x+Math.sin(a)*1.4,y+2.6,z+Math.cos(a)*1.4,1.2],[x+Math.sin(a)*3.4,y+.6,z+Math.cos(a)*3.4,.7],[x+Math.sin(a)*5.2,y,z+Math.cos(a)*5.2,.2]],wood,5);}
 grow(x,y,z,.4,.1,h*.32,h*.066,4);};
// A guard of the Citadel, black and silver, the winged helm and the tall spear.
const citadelGuard=(k,x,y,z,ry)=>{k.local(x,z,ry,()=>{for(const s of [-1,1]){k.box(s*.8,y,0,1.2,3.6,1.3,'#15161c');k.box(s*1.3,y+6.2,.9,.14,.14,.14,'#15161c');k.box(s*2,y+3.7,0,.9,3.4,1,'#20222c');k.add(k.cube(),s*1.3,y+9.4,-.1,.14,1.8,1.1,'#ece9de',0,0,s*-.5);}k.box(0,y+3.6,0,3.2,3.7,1.8,'#20222c');k.box(0,y+1.6,-1,3.2,5.6,.4,'#0e0f14');k.box(0,y+4.6,.94,.26,1.8,.1,'#e8e8e0');for(const q of [-1,1])k.add(k.cube(),q*.34,y+5.6,.94,.7,.14,.1,'#e8e8e0',0,0,q*.5);k.column(0,y+7.3,0,.5,.6,'#d9b18e',6);k.ball(0,y+8.4,0,1,'#d9b18e');k.dome(0,y+8.5,0,1.22,'#c9ccd0');k.limb([[2.4,y,.4,.13],[2.4,y+13,.4,.11]],'#3a2a18',4);k.cone(2.4,y+13,.4,.3,1.7,'#d8d8d0',4);});};

// The closed building, which melts away while zooming in. Each covers the hall in its region's way.
export const roofs={
 // The Hornburg: a fortress grown from a spur of the gorge. Old curved walls in tiers on bare rock, the steep great hall, the tower above them.
 scouts(k){const stone='#a2a6a4',dark='#716d5e',light='#b4b6b0',rockC='#6d6c66',R=S*1.3;
  // The spur of the mountain carries it all, breaking through at the shoulders and behind.
  k.crag(0,-8,-58,R*1.2,46,R*.98,rockC,1);for(const [x,z,sx,sy,sz,seed] of [[-142,-34,44,50,70,2],[-118,-112,66,74,56,3],[132,-92,50,64,62,1],[20,-152,92,70,40,2]])k.crag(x,-4,z,sx,sy,sz,rockC,seed);
  // The outer wall, leaning on a battered footing, curved like the film's great sweep.
  k.cyl(0,-2,0,R+1,R+9,12,dark,36);k.cyl(0,-2,0,R,S*1.38,H+6,stone,36);k.column(0,H+2,0,R+1.5,2,light,36);for(let i=0;i<40;i++){const a=i/40*6.283;k.box(Math.sin(a)*(R+.5),H+4,Math.cos(a)*(R+.5),6,4.5,3,light,a);}for(let i=0;i<16;i++){const a=(i+.5)/16*6.283;if(a<.55||a>5.73)continue;k.add(k.cylinder(3,5.5,H-6,6),Math.sin(a)*(R+3),(H-6)/2,Math.cos(a)*(R+3),1,1,1,dark);}k.column(0,H+2,0,R-3,1.2,dark,36);
  // The second wall, then the high terrace behind the hall.
  k.cyl(0,H+4,-16,S*.76,S*.86,28,stone,28);for(let i=0;i<26;i++){const a=i/26*6.283;k.box(Math.sin(a)*S*.76,H+32,-16+Math.cos(a)*S*.76,5,4,2.6,light,a);}
  k.cyl(-8,H+30,-48,S*.42,S*.46,20,stone,20);for(let i=0;i<16;i++){const a=i/16*6.283;k.box(-8+Math.sin(a)*S*.42,H+50,-48+Math.cos(a)*S*.42,5,3.6,2.4,light,a);}
  // The great hall under a steep roof with a gilded ridge, carved gable boards crossing at its peak.
  k.box(14,H+32,-10,58,22,40,'#a0a09a');k.gable(14,H+54,-10,64,46,26,'#5c4728');k.box(14,H+80,-10,1.6,1.6,48,'#c9a23c');for(let i=0;i<5;i++)k.box(-10+i*12,H+37,10.2,3.2,9,.5,'#23211c');for(const s of [-1,1])k.limb([[14+s*30,H+55,13.4,.8],[14+s*8,H+78,13.4,.6],[14-s*3,H+88,13.4,.3]],'#c9a23c',5);
  // The tower: thick at its foot, a corbelled head, a slim stair turret on its flank and the white horse flying over it.
  k.cyl(-44,H+32,-52,15,23,96,stone,16);k.cyl(-44,H+120,-52,18,15,6,light,16);k.column(-44,H+126,-52,18,3,light,16);for(let i=0;i<14;i++){const a=i/14*6.283;k.box(-44+Math.sin(a)*17.5,H+129,-52+Math.cos(a)*17.5,4,4.5,3,light,a);}for(const h of [52,76,100])k.box(-44,H+h,-33.2,3,10,.8,'#23211c');
  k.column(-61,H+32,-44,5.4,110,stone,10);k.column(-61,H+142,-44,6.4,2,light,10);k.cone(-61,H+144,-44,6.6,13,'#54483a',10);for(const h of [58,82,106])k.box(-61,H+h,-38.5,1.4,5,.5,'#23211c');
  k.column(-44,H+129,-52,.7,30,'#3a2a18',6);k.box(-33,H+144,-52,20,12,.6,'#2f5a30');k.box(-33,H+147,-51.6,9,4,.3,'#e8e4d4');k.box(-29,H+150,-51.6,2.4,4,.3,'#e8e4d4');},
 // The foot of Orthanc: black many-sided rock rising into four horns.
 isengard(k){const P=H+300,coal='#3a3a44',slate='#44444f';k.cyl(0,-2,0,S*1.26,S*1.46,H+10,'#3c3c43',12);k.cyl(0,H+8,0,S*.46,S*.74,44,coal,8,Math.PI/8);k.cyl(0,H+52,0,S*.35,S*.46,P-H-52,coal,8,Math.PI/8);
  // Four great piers run from the foot to the crown and grow into its horns, sheer faces and blade-thin ribs between them.
  for(let i=0;i<4;i++){const a=i/4*6.283+.785,c=Math.cos(a),n=Math.sin(a),px=c*S*.45,pz=n*S*.45;k.cyl(c*S*.5,H+8,n*S*.5,S*.12,S*.21,P-H-8,slate,6);k.limb([[px,P-14,pz,S*.125],[px*1.16,P+34,pz*1.16,S*.095],[px*1.2,P+74,pz*1.2,S*.06],[px*1.06,P+112,pz*1.06,S*.03],[px*.8,P+146,pz*.8,.3]],'#3d3d48',7);for(const s of [-1,1]){const b=a+s*.42;k.limb([[Math.cos(b)*S*.47,P-6,Math.sin(b)*S*.47,S*.045],[Math.cos(b)*S*.54,P+26,Math.sin(b)*S*.54,S*.028],[Math.cos(b)*S*.5,P+58,Math.sin(b)*S*.5,.25]],'#3d3d48',6);}}
  for(let i=0;i<8;i++){const a=(i+.5)/8*6.283;k.box(Math.cos(a)*S*.42,H+52,Math.sin(a)*S*.42,S*.09,P-H-54,3,'#4c4c58',-a);for(const f of [.24,.5,.76])k.box(Math.cos(a)*S*.44,H+52+(P-H-52)*f,Math.sin(a)*S*.44,S*.14,3,S*.22,'#1f1f25',-a);}
  for(let i=0;i<16;i++){const a=i*1.1+.3,r=S*.47;k.box(Math.cos(a)*r,H+70+i*14,Math.sin(a)*r,3,7,3,'#a06a24',-a);}
  // The summit: a bare black floor marked with the ring and the rays, open to the storm. Here Gandalf was held.
  k.column(0,P-6,0,S*.56,6,'#1b1b20',8);k.column(0,P,0,S*.5,.8,'#5a5a66',8);k.column(0,P+.8,0,S*.34,.25,'#22222a',24);k.column(0,P+1,0,S*.3,.25,'#5a5a66',24);for(let i=0;i<8;i++){const a=i/8*6.283;k.box(Math.cos(a)*S*.4,P+.8,Math.sin(a)*S*.4,S*.2,.25,1.5,'#22222a',-a);}
  for(let i=0;i<24;i++){if(i%6===3)continue;const a=i/24*6.283;k.box(Math.cos(a)*S*.52,P,Math.sin(a)*S*.52,3,2.2,S*.09,'#17171c',-a);}
  {const x=S*.24,z=S*.2;k.limb([[x,P+1,z,3.1],[x,P+5,z,2.6],[x,P+10,z,1.9],[x,P+13.5,z,1.5]],'#7a7f86',8);k.ball(x,P+15,z,1.5,'#c9a98c');k.limb([[x,P+14,z+1.2,.9],[x,P+11,z+1.5,.8],[x,P+8.5,z+1.3,.15]],'#e4e4dc',5);k.column(x,P+15.8,z,3,.3,'#6e737a',10);k.cone(x,P+16.1,z,1.7,5.6,'#6e737a',8);k.limb([[x-2,P+12,z,.6],[x-3,P+9,z+.8,.5],[x-2.6,P+7,z+1.2,.45]],'#7a7f86',5);k.limb([[x+2,P+12,z,.6],[x+3,P+9,z+.8,.5],[x+2.6,P+7,z+1.2,.45]],'#7a7f86',5);}
 },
 // Imladris is not one roof: pale houses on terraces, pavilions under low swept roofs, open galleries, thin towers and bridges between them.
 library(k,g){const stone='#e3d8b8',pale='#f0e8d0',tile='#8f6747',shade='#7a5a3e',trim='#c9a458',dark='#3a3226';
  const pavilion=(x,z,w,d,h,y=H+12)=>{k.box(x,y,z,w,h,d,stone);k.box(x,y+h,z,w+4,1,d+4,trim);swept(k,x,y+h+1,z,w+12,d+12,34,tile,trim);const n=Math.max(2,Math.round(w/8)),m=Math.max(2,Math.round(d/8));for(let i=0;i<n;i++){const t=(i+.5)/n-.5;lancet(k,x+t*w,y+2.4,z+d/2+.3,w/n*.56,h*.72,dark,trim);k.local(x+t*w,z-d/2-.3,Math.PI,()=>lancet(k,0,y+2.4,0,w/n*.56,h*.72,dark,trim));}for(let i=0;i<m;i++){const t=(i+.5)/m-.5;for(const fx of [-1,1])k.local(x+fx*(w/2+.3),z+t*d,fx*1.5708,()=>lancet(k,0,y+2.4,0,d/m*.56,h*.72,dark,trim));}};
  // The stone body carries an open terrace with a pierced parapet instead of a great roof.
  k.box(0,H+2,0,S*2+8,8,S*2+8,stone);k.box(0,H+10,0,S*2+26,1.6,S*2+26,trim);k.box(0,H+11.6,0,S*2+22,.7,S*2+22,'#d9cfb2');for(const [ax,az,n] of [[1,0,27],[0,1,27]])for(const q of [-1,1])for(let i=0;i<n;i++){const t=(i-(n-1)/2)*9.4,x=ax?q*(S+12):t,z=ax?t:q*(S+12);k.column(x,H+12.3,z,.34,3.4,pale,5);}for(const q of [-1,1]){k.box(q*(S+12),H+15.7,0,.8,.5,S*2+24,trim);k.box(0,H+15.7,q*(S+12),S*2+24,.5,.8,trim);}
  // The Hall of Fire in the middle under one great roof sweeping up to a slim lantern.
  k.box(0,H+12,S*.05,S*.9,40,S*1.05,stone);k.box(0,H+52,S*.05,S*1.0,1.4,S*1.15,trim);swept(k,0,H+53.4,S*.05,S*1.12,S*1.27,78,tile,trim);k.column(0,H+131,S*.05,3.4,6,pale,8);k.cone(0,H+137,S*.05,4.6,7,shade,8);k.cone(0,H+143,S*.05,.9,12,trim,8);
  for(let i=-3;i<=3;i++){const x=i*S*.12,z=S*.05+S*.53;lancet(k,x,H+27,z,10,20,dark,trim);}
  // The south front: an arcade of slender columns under pointed ribs, a gallery walking along its top.
  for(let i=-6;i<=6;i++){const x=i*17;k.column(x+8.5,H-5,S+5.4,1.1,17,pale,8);arch(k,x,H,S+4.8,8.8,10,'#2c2a24',.5);if(i<6)for(const s of [-1,1])k.limb([[x+8.5,H+11,S+6,.7],[x+8.5+s*5,H+15,S+6,.5],[x+8.5+s*8.5,H+20,S+6,.25]],trim,5);}
  k.box(0,H+21,S+6.5,S*2+6,1.2,3,trim);for(let i=-19;i<=19;i++)k.column(i*6,H+22.2,S+7.4,.35,4,pale,5);k.box(0,H+26.4,S+7.4,S*2+6,.5,1,trim);
  // Pairs of equal houses to either side of the hall, joined to it by low roofed galleries.
  for(const s of [-1,1]){for(const [z,d,h] of [[S*.62,36,18],[-S*.06,46,22],[-S*.72,32,26]])pavilion(s*S*.74,z,42,d,h);for(const z of [S*.46,-S*.2]){k.box(s*S*.59,H+12,z,S*.3,14,14,stone);k.box(s*S*.59,H+26,z,S*.3,.8,17,trim);swept(k,s*S*.59,H+26.8,z,S*.3+2,18,11,tile,null,true);for(let i=0;i<4;i++)lancet(k,s*(S*.48+i*S*.075),H+14,z+7.2,4.6,9,dark,trim);}}
  pavilion(0,-S*.76,36,26,18);
  // Trees grow on the terraces between the houses and ivy falls over the parapet, so the house lies in the valley's green.
  for(const [x,z,s] of [[-42,S*.86,1],[42,S*.86,1.1],[-52,-S*.9,.9],[52,-S*.9,.95]]){k.cyl(x,H+10,z,1.8*s,2.6*s,16*s,'#7a6a4e',8);k.canopy(x,H+26*s+8,z,12*s,['#5f8a3e','#6f9a46','#e2cc5e'],Math.abs(x+z)+7,.75);}
  for(let i=0;i<22;i++){const q=i%4,t=(i*37%100)/100-.5,x=q<2?t*S*2:(q===2?-1:1)*(S+13),z=q<2?(q?-1:1)*(S+13):t*S*2;k.limb([[x,H+10,z,.6],[x,H+2,z,.5],[x,H-6-(i%3)*5,z,.3]],'#4f7a36',4);k.ball(x,H+4-(i%3)*3,z,1.6,'#5f8a3e',.6);}
  // Round towers, thin as trees, with balconies and lanterns.
  for(const [a,b,r,h] of [[-S,-S,8,104],[S,-S,8,104],[-S,S,8,94],[S,S,8,94],[0,-S*.98,7,205]])elfTower(k,g,a,b,r,h,pale,tile,trim);
 },
 // Caras Galadhon: silver mallorn giants, white stairs winding up them, curved flets with pointed ribs, bridges and hanging lamps.
 lorien(k,g){const bark='#c2cedc',bright='#e0e6ec',groove='#9eaab8',gold='#c4b050';
  const giant=(a,b,w,h)=>{k.cyl(a,0,b,w*.8,w*1.3,h,bark,14);for(let i=0;i<9;i++){const t=i/9*6.283,c=Math.cos(t),n=Math.sin(t),r=w*1.31;k.limb([[a+c*r,1,b+n*r,w*.09],[a+c*r*.86,h*.3,b+n*r*.86,w*.07],[a+c*r*.66,h*.97,b+n*r*.66,w*.04]],groove,4);k.limb([[a+c*r*.86,18,b+n*r*.86,w*.3],[a+c*r*1.3,5,b+n*r*1.3,w*.18],[a+c*r*1.8,0,b+n*r*1.8,w*.08]],bark,6);}};
  const flet=(x,z,r,y,h)=>{k.column(x,y-1.4,z,r,1.4,'#b7a878',20);for(let i=0;i<8;i++){const t=i/8*6.283,c=Math.cos(t),n=Math.sin(t);k.limb([[x+c*r,y,z+n*r,.5],[x+c*r*1.03,y+h*.56,z+n*r*1.03,.42],[x+c*r*.58,y+h*.92,z+n*r*.58,.28],[x,y+h*1.08,z,.1]],bright,5);}k.column(x,y+h*.42,z,r+.3,.4,gold,20);k.cone(x,y+h*1.06,z,.5,4,'#c9a24a',6);};
  giant(-92,-84,15,H+60);giant(88,-92,14,H+60);giant(-96,84,13,H+60);giant(94,88,14,H+60);giant(0,-20,34,H+70);
  // The stair that winds up the great tree, with a white rail.
  for(let i=0;i<26;i++){const a=i*.5,y=4+i*3.6,x=Math.cos(a)*50,z=-20+Math.sin(a)*50;k.box(x,y,z,14,1.2,6,'#b8ba9e',-a);if(i%2)k.column(Math.cos(a)*56,y+1.2,-20+Math.sin(a)*56,.3,5,bright,4);}
  // The great ring of the hall, carried on the trees.
  k.column(0,H+6,-20,S*1.18,2.6,'#b7a878',40);for(let i=0;i<24;i++){const a=i/24*6.283;k.column(Math.cos(a)*S*1.15,H+8,-20+Math.sin(a)*S*1.15,.8,7,'#d8d0a8',6);}
  // Flets on every tree and the lady's own over the middle.
  for(const [x,z,r] of [[-92,-84,26],[88,-92,25],[-96,84,24],[94,88,25]])flet(x,z,r,H+9,24);flet(0,-20,58,H+9,34);
  // Slender bridges swing between them, lamps hanging under the crossing.
  for(const [ax,az,bx,bz] of [[-70,-72,-46,-44],[68,-82,46,-42],[-74,74,-40,24],[72,78,40,24]]){const mx=(ax+bx)/2,mz=(az+bz)/2;k.limb([[ax,H+9,az,1],[mx,H+5,mz,.8],[bx,H+9,bz,1]],bright,5);for(const q of [-1,1]){const dx=(bz-az),dz=-(bx-ax),l=Math.hypot(dx,dz),ox=q*dx/l*1.6,oz=q*dz/l*1.6;k.limb([[ax+ox,H+13,az+oz,.2],[mx+ox,H+9,mz+oz,.16],[bx+ox,H+13,bz+oz,.2]],gold,3);}k.column(mx,H-3,mz,.12,8,gold,3);g.lamp(mx,H-4,mz,1.4);}
  for(const [a,b,r,col] of [[-70,-70,62,'#a8912e'],[70,-70,66,'#9c872b'],[-70,70,60,'#b39a33'],[70,70,58,'#a8912e'],[0,0,76,'#b89f36'],[0,-100,48,'#94802a'],[-100,0,48,'#9c872b'],[100,0,48,'#b39a33'],[0,100,46,'#c0a83e']])k.canopy(a,H+50,b,r*.66,['#e0c858','#eed874','#d2b84a'],Math.abs(a+b*2)+11,.45);
 },
 // The Woodland Realm as a dark forest paradise: great black beeches carry flets, stairs and swinging bridges under a deep green roof,
 // lit only by the warm amber lanterns of the wood-elves. It is the gloomy twin of Lothlórien.
 council(k,g){const bark='#3a3226',dark='#2b241b',groove='#231d16',plank='#5a4630',rope='#7a6a4a',amber='#d08a3a';
  const giant=(a,b,w,h)=>{k.cyl(a,0,b,w*.8,w*1.3,h,bark,12);for(let i=0;i<7;i++){const t=i/7*6.283+.3,c=Math.cos(t),n=Math.sin(t),r=w*1.31;k.limb([[a+c*r,1,b+n*r,w*.09],[a+c*r*.86,h*.4,b+n*r*.86,w*.07],[a+c*r*.7,h*.95,b+n*r*.7,w*.04]],groove,4);k.limb([[a+c*r*.86,16,b+n*r*.86,w*.32],[a+c*r*1.4,4,b+n*r*1.4,w*.18],[a+c*r*2,0,b+n*r*2,w*.08]],dark,6);k.limb([[a+c*r*.9,h*.62,b+n*r*.9,w*.16],[a+c*r*1.7,h*.74,b+n*r*1.7,w*.1],[a+c*r*2.3,h*.8,b+n*r*2.3,w*.04]],dark,5);}};
  const flet=(x,z,r,y)=>{k.column(x,y-1.4,z,r,1.4,plank,18);for(let i=0;i<14;i++){const t=i/14*6.283;k.column(x+Math.cos(t)*r,y,z+Math.sin(t)*r,.35,5,'#4a3a26',5);}k.column(x,y+5,z,r+.2,.4,'#6a5236',18);};
  giant(-92,-84,15,H+52);giant(88,-92,14,H+52);giant(-96,84,13,H+52);giant(94,88,14,H+52);giant(0,-20,30,H+60);
  // The wooden stair that winds up the king's tree, a lantern on every fourth step.
  for(let i=0;i<26;i++){const a=i*.5,y=4+i*3.6,x=Math.cos(a)*46,z=-20+Math.sin(a)*46;k.box(x,y,z,13,1.2,6,plank,-a);if(i%2)k.column(Math.cos(a)*52,y+1.2,-20+Math.sin(a)*52,.3,5,rope,4);}
  // The great ring of the hall, carried on the trees, with carved posts.
  k.column(0,H+6,-20,S*1.18,2.6,plank,36);for(let i=0;i<24;i++){const a=i/24*6.283;k.column(Math.cos(a)*S*1.15,H+8,-20+Math.sin(a)*S*1.15,.8,7,'#6a5236',6);}
  for(const [x,z,r] of [[-92,-84,24],[88,-92,23],[-96,84,22],[94,88,23]])flet(x,z,r,H+9);
  // Rope bridges sag between the flets, a lantern swinging under each crossing.
  for(const [ax,az,bx,bz] of [[-70,-72,-46,-44],[68,-82,46,-42],[-74,74,-40,24],[72,78,40,24]]){const mx=(ax+bx)/2,mz=(az+bz)/2;k.limb([[ax,H+9,az,1],[mx,H+4,mz,.8],[bx,H+9,bz,1]],plank,5);for(const q of [-1,1]){const dx=(bz-az),dz=-(bx-ax),l=Math.hypot(dx,dz),ox=q*dx/l*1.6,oz=q*dz/l*1.6;k.limb([[ax+ox,H+13,az+oz,.2],[mx+ox,H+8,mz+oz,.16],[bx+ox,H+13,bz+oz,.2]],rope,3);}}
  // Glowing toadstools, fireflies and moss among the roots: the only bright colour under the dark roof.
  for(let i=0;i<16;i++){const a=i*2.399,r=134+(i*37%60),x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(x)<34&&z>0)continue;k.column(x,0,z,.5,2+(i%3),'#cfc6a8',5);k.ball(x,2.4+(i%3),z,1.8,i%4?'#a8b890':'#c89a5a',.45);}
  for(let i=0;i<10;i++){const a=i*1.7,r=136+(i*23%60);g.ball(Math.cos(a)*r,14+(i*7%24),Math.sin(a)*r,.35,'#d8ff9a');}
  for(const [a,b,r] of [[-70,-70,62],[70,-70,66],[-70,70,60],[70,70,58],[0,0,76],[0,-100,48],[-100,0,48],[100,0,48],[0,100,46]])k.canopy(a,H+44,b,r*.66,['#16301d','#1c3a22','#122a19'],Math.abs(a+b*2)+11,.45);
  // The Forest River runs in front of the realm.
  k.box(0,-.6,S*1.52,430,.9,15,'#2f6a7e');for(const q of [-1,1])for(let i=0;i<22;i++){const x=-210+i*20;if(Math.abs(x)<16)continue;k.rock(x,.2,S*1.52+q*(9+(i%3)),4+(i%3)*1.6,1.6+(i%2),3,'#3a382e',i);}},
 // Moria's west gate has no porch: the Doors are drawn flat on a sheer grey cliff, a stair worn into the rock beside them, two hollies standing guard.
 forge(k){const face='#6f6a60',z=S*1.2,dark='#5c574f',light='#7f7a70';k.crag(0,0,-46,S*1.78,126,S*1.66,'#7f7a70',1);k.crag(-70,62,-50,70,74,70,'#858076',2);k.crag(70,54,-40,62,64,64,'#7a756b',3);for(const a of [-1,1])k.crag(a*128,0,40,54,78,70,'#7a756b',a>0?2:3);
  // The cliff: one wall, split by long vertical cracks and ledges, its top broken into crags.
  k.box(0,0,z-14,296,118,28,face);for(let i=0;i<46;i++){const x=-146+i*6.5;if(Math.abs(x)<34)continue;const w=3+(i*7%5)*1.1,h=46+(i*13%9)*8.4;k.box(x,0,z+.3+(i%3)*.5,w,h,1.4,[dark,light,face,'#66625a'][i%4]);}for(const [y,x,w] of [[34,-104,70],[58,96,88],[82,-96,92],[96,108,56]])k.box(x,y,z+1.5,w,1.8,3,dark);
  for(let i=0;i<9;i++){const x=-136+i*34;k.crag(x,108+(i*5%3)*7,z-16,26+(i%3)*6,22+(i*7%4)*7,18,face,i);}
  // The opening itself: nothing but a dark, close-fitted panel in the wall, under a shallow relief.
  k.box(0,0,z+.2,50,44,1,'#121116');k.disc(0,44,z+.2,25,1,'#121116');
  for(let i=0;i<=16;i++){const a=i/16*3.1416;k.box(Math.cos(a)*29,44+Math.sin(a)*29,z+.8,5.4,3.4,1.6,dark,0);}for(const s of [-1,1])k.box(s*29,0,z+.8,5.4,44,1.6,dark);
  // The stair up the cliff's west side, its upper flights fallen away.
  for(let i=0;i<14;i++){if(i===9||i===10)continue;k.box(-62-i*5.4,i*5,z+3.6,7,5,6,light);}
  // The holly trees of the Elves, dark and old, far taller than the doors.
  for(const s of [-1,1]){k.limb([[s*44,0,z+12,4.2],[s*45,24,z+12,3.2],[s*43,50,z+11,2.2],[s*46,74,z+10,1]],'#2c2118',8);for(const [o,y] of [[10,46],[-8,56],[12,66]])k.limb([[s*44,y-14,z+11,1.5],[s*(44+o),y,z+12,.3]],'#2c2118',5);k.canopy(s*45,74,z+10,22,['#14301f','#1c3a26','#24492b'],s>0?4:9,1);}
  for(const a of [-1,1]){k.box(a*16,6,z+1.5,1,44,.5,'#c7e6f2');k.box(a*9,12,z+1.5,.7,28,.5,'#c7e6f2');}k.ball(0,50,z+1.6,3,'#e8f6fb',.6);k.box(0,40,z+1.5,30,.8,.5,'#c7e6f2');},
 // Minas Tirith: seven white rings cut by the great keel of rock, which rises like a ship's prow from over the gate to the citadel, and the Tower of Ecthelion above all.
 gate(k,g){const rings=[[1.46,H+2],[1.22,34],[1.02,34],[.86,34],[.72,34],[.58,34],[.44,34]];let y=-2;rings.forEach(([r,h],t)=>{const R=S*r,next=rings[t+1];k.column(0,y,0,R,h,'#d8d5c8',40);k.column(0,y+h-2,0,R+2,3,'#e6e3d6',40);const crest=Math.round(R/3.2);for(let i=0;i<crest;i++){const a=i/crest*6.283;k.box(Math.sin(a)*(R+.8),y+h+1,Math.cos(a)*(R+.8),3,3,2.4,'#cfccbe',a);}const towers=Math.max(4,Math.round(R/20));for(let i=0;i<towers;i++){const a=(i+.5)/towers*6.283;k.column(Math.sin(a)*(R+2),y,Math.cos(a)*(R+2),5,h+9,'#e0ddd0',10);k.cone(Math.sin(a)*(R+2),y+h+9,Math.cos(a)*(R+2),6,8,'#7c8087',10);}for(let q=7;q<h-3;q+=7)k.column(0,y+q,0,R+.22,.5,'#c2bfb0',40);
   {const n=Math.round(R*6.283/11);for(let i=0;i<n;i++){const a=(i+.5)/n*6.283;if(Math.abs(Math.sin(a))<.16&&Math.cos(a)>0)continue;for(const v of [.38,.68]){if((i+Math.round(v*9)+t)%3===0)continue;k.box(Math.sin(a)*(R+.15),y+h*v+((i*3+t)%2)*1.5,Math.cos(a)*(R+.15),1.7,4,.7,'#2a2a30',a);}}const m=Math.round(R*6.283/26);for(let i=0;i<m;i++){const a=(i+.25)/m*6.283;if(Math.abs(Math.sin(a))<.16&&Math.cos(a)>0)continue;k.box(Math.sin(a)*(R+.7),y+1,Math.cos(a)*(R+.7),2.4,h-4,1.6,'#e4e1d4',a);}}
   // Each wall has its one gate, turned alternately to either side of the rock, as the road climbs in loops.
   if(t>0){const a0=t%2?1.05:-1.05;k.local(Math.sin(a0)*R,Math.cos(a0)*R,a0,()=>{k.box(0,y,1.2,22,h*.72,2.6,'#e8e5d8');k.box(0,y+h*.72,1.2,26,2,3.4,'#cfccbe');arch(k,0,y,2.7,10,14,'#17181c',.8);for(const s of [-1,1]){k.column(s*12,y,1.4,3,h+6,'#efece0',10);k.cone(s*12,y+h+6,1.4,3.6,6,'#7c8087',10);}});}
   // Two rows of tall, narrow houses to a terrace, with a street before each and windows, doors and chimneys.
   if(next){const roofs=['#55575c','#62605a','#4c4e54'],walls=['#cac7b9','#bdbaac','#d2cfc2'],house=(r,count,row)=>{for(let i=0;i<count;i++){const a=(i+row*.5)/count*6.283;if(a<.2||a>6.08)continue;const q=(i*7+t*3+row)%5,w=9+q,tall=(row?12:7)+(i*3%4)*2.4,hx=Math.sin(a)*r,hz=Math.cos(a)*r,tx=Math.cos(a),tz=-Math.sin(a),fx=Math.sin(a)*(r+4.15),fz=Math.cos(a)*(r+4.15);k.box(hx,y+h,hz,w,tall,8,walls[i%3],a);k.gable(hx,y+h+tall,hz,w+1.4,9.4,5,roofs[i%2],a);for(const s of [-1,1])k.box(fx+tx*s*w*.24,y+h+tall*.58,fz+tz*s*w*.24,1.5,2.8,.3,'#2a2a30',a);if(!row)k.box(fx,y+h,fz,2,4,.3,'#3a2c20',a);k.box(hx-tx*w*.3,y+h+tall+1.5,hz-tz*w*.3,1.4,6,1.4,'#8f8c80',a);}};house((R+S*next[0])/2,Math.floor((R+S*next[0])/2*6.283/15),0);{const r=S*next[0]+5.5;house(r,Math.floor(r*6.283/17),1);}}y+=h;});k.column(0,y,0,S*.44-.5,5,'#ece9dc',48);
  // The keel: a wedge that widens towards the mountain and ends in a blade over the gate.
  {const tip=S*1.5,base=84,tall=y+5-base,wedge=new T.Shape();wedge.moveTo(-S*.24,-S*.1);wedge.lineTo(S*.24,-S*.1);wedge.lineTo(0,-tip);wedge.closePath();// As in the film the prow leans forward: low down it stays within the second wall, at the top it reaches out over the gate in a long curve.
   const front=f=>S*1.24+(tip-S*1.24)*Math.pow(f,1.35),rows=14,v=[],quad=(a,b,c,d)=>v.push(...a,...b,...c,...a,...c,...d),edge=[];for(let j=0;j<rows;j++){const f0=j/rows,f1=(j+1)/rows,y0=base+tall*f0,y1=base+tall*f1,L0=[-S*.24,y0,S*.1],L1=[-S*.24,y1,S*.1],R0=[S*.24,y0,S*.1],R1=[S*.24,y1,S*.1],T0=[0,y0,front(f0)],T1=[0,y1,front(f1)];quad(L0,T0,T1,L1);quad(T0,R0,R1,T1);if(j===0)v.push(...L0,...R0,...T0);edge.push([0,y0,front(f0)+.4,1.1]);}edge.push([0,base+tall,tip+.4,1.1]);const solid=new T.BufferGeometry();solid.setAttribute('position',new T.Float32BufferAttribute(v,3));solid.computeVertexNormals();k.add(solid,0,0,0,1,1,1,'#dedbcd');k.limb(edge,'#efece0',6);
   // The sharp terrace at its head: the walk Denethor runs, narrowing to the point, under a white parapet.
   {const top=y+5,half=z=>(tip-z)/(tip+S*.1)*S*.24,deck=new T.Shape();deck.moveTo(-S*.235,-S*.1);deck.lineTo(S*.235,-S*.1);deck.lineTo(0,-tip+1);deck.closePath();const flat=new T.ExtrudeGeometry(deck,{depth:.5,bevelEnabled:false}).toNonIndexed();flat.rotateX(-Math.PI/2);k.add(flat,0,top-.2,0,1,1,1,'#efece0');for(let i=0;i<30;i++){const z0=S*.42+i*S*.036;for(const s of [-1,1])k.box(s*(half(z0)-.5),top,z0,1,2.2,1.4,'#f4f2e6');}k.column(0,top,tip-4,.7,9,'#e8e5d8',8);k.box(0,top+9,tip-4,3,.7,3,'#a99468');for(let z0=S*.5;z0<tip-8;z0+=S*.075)k.box(0,top+.32,z0,Math.max(2,half(z0)*2-2.4),.06,.34,'#cfccbe');for(const s of [-1,0,1])for(let z0=S*.5;z0<tip-20;z0+=S*.15)k.box(s*Math.max(0,half(z0)*.5),top+.32,z0+S*.0375,.3,.06,S*.075,'#cfccbe');}}
  // The Court of the Fountain: pale flagstones within a balustrade, open towards the prow.
  {const top=y+5,R7=S*.44-1.2;for(const [r,c] of [[R7,'#e6e3d6'],[R7-4,'#dad7c9'],[R7-5,'#e8e5d8']])k.column(0,top+(R7-r)*.004,0,r,.25,c,48);k.box(0,top+.2,24,10,.2,48,'#f0ede2');for(let i=0;i<44;i++){const a=i/44*6.283;if(Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))<.52)continue;k.column(Math.sin(a)*R7,top,Math.cos(a)*R7,.5,2.6,'#f4f2e6',6);if(i%2===0)k.box(Math.sin(a)*R7,top+2.6,Math.cos(a)*R7,1.2,.5,7,'#efece0',a+Math.PI/2);}
   // The Hall of Kings across the back of the court, pillared, its doors black and tall; the tower rises right behind it.
   k.box(0,top,-13,52,30,20,'#e6e3d6');k.gable(0,top+30,-13,54,22,8,'#55575c');k.box(0,top+30,-2.4,54,2,1.4,'#efece0');for(let i=0;i<8;i++){const x=-24.5+i*7;k.column(x,top,-1.6,1.3,28,'#f4f2e6',10);k.column(x,top+27,-1.6,1.9,1.4,'#e0ddd0',10);k.column(x,top,-1.6,1.9,1,'#e0ddd0',10);}for(let i=0;i<4;i++)k.box(0,top+i*.4,1+i*-1.2+3.6,40-i*3,.4,1.4,'#ece9dc');k.box(0,top+.4,-2.9,8,17,.5,'#17181c');k.box(0,top+17.4,-2.8,10,1,.6,'#a99468');for(const s of [-1,1]){k.box(s*2,top+.4,-2.6,.2,17,.2,'#a99468');k.column(s*34,top,-16,5,38,'#e0ddd0',12);k.cone(s*34,top+38,-16,6,12,'#7c8087',12);}
   // The White Tree of Gondor over its round fountain: gnarled white limbs and the first blossoms, guarded in silence.
   k.column(0,top,22,15,.6,'#f0ede2',32);k.column(0,top+.3,22,13.6,.7,'#c9c6b6',32);k.column(0,top+.6,22,12.6,.55,'#6fa6c0',32);k.column(0,top+.6,22,6.8,.9,'#dad7c9',24);k.column(0,top+.8,22,5.8,.8,'#3a4a2c',24);for(let i=0;i<8;i++){const a=i*.785+.39;k.limb([[Math.sin(a)*9.8,top+1,22+Math.cos(a)*9.8,.26],[Math.sin(a)*9.5,top+3.4,22+Math.cos(a)*9.5,.1],[Math.sin(a)*9,top+1.2,22+Math.cos(a)*9,.05]],'#e6f2f8',4);}whiteTree(k,0,top+1.4,22,34);
   for(const [x,z,ry] of [[-17,14,1.2],[17,14,-1.2],[-17,32,1.9],[17,32,-1.9],[-6,4.6,.2],[6,4.6,-.2],[-13,50,1.57],[13,50,-1.57]])citadelGuard(k,x,top,z,ry);
   // Flagstone joints across the court, stone benches and lamps along its edge, colonnades running out from the hall.
   for(let i=0;i<20;i++){const a=i/20*6.283,mid=(20+R7-6)/2;k.box(Math.sin(a)*mid,top+.3,Math.cos(a)*mid,.28,.06,R7-26,'#cfccbe',a);}for(const r of [26,36,46]){const n=Math.round(r*.9);for(let i=0;i<n;i++){const a=i/n*6.283;k.box(Math.sin(a)*r,top+.3,Math.cos(a)*r,r*6.283/n*.86,.06,.28,'#cfccbe',a);}}
   for(const s of [-1,1]){for(const z of [12,34]){k.box(s*36,top,z,3,1.8,10,'#efece0');k.box(s*36,top+1.8,z,4,.5,12,'#e0ddd0');}for(const z of [2,24,44]){k.column(s*42,top,z,.45,8,'#2c2d32',6);k.box(s*42,top+8,z,1.6,.4,1.6,'#2c2d32');g.lamp(s*42,top+9.6,z,1.1);}
    for(let i=0;i<6;i++){const a=s*(1.82+i*.15),next=s*(1.82+(i+1)*.15),r=R7-2;k.column(Math.sin(a)*r,top,Math.cos(a)*r,.9,13,'#f4f2e6',8);k.column(Math.sin(a)*r,top+12.6,Math.cos(a)*r,1.4,.8,'#e0ddd0',8);if(i<5)k.box(Math.sin((a+next)/2)*r,top+13.4,Math.cos((a+next)/2)*r,r*.15+1.4,1.6,2.4,'#e8e5d8',(a+next)/2+Math.PI/2);}
    // Kings of old in stone beside the steps, and the black banners of the Stewards.
    k.box(s*27,top,4,6,2,6,'#e0ddd0');k.column(s*27,top+2,4,1.9,9,'#dedbcd',10);k.ball(s*27,top+13,4,1.5,'#dedbcd');k.column(s*27,top+11,4,1,1.4,'#dedbcd',8);k.box(s*27,top+5,5.4,.8,5,.6,'#a99468');
    for(const x of [10.5,24.5]){k.box(s*x,top+13,-.6,3.4,12,.25,'#15161d');k.box(s*x,top+18,-.42,1.1,3.4,.2,'#e6e3d6');}
    // The hall's flanks with tall windows and small houses of the household behind it.
    for(let i=0;i<4;i++)k.local(s*26.1,-21+i*5.2,s*1.5708,()=>{k.box(0,top+8,.1,2,13,.3,'#26272c');k.box(0,top+21,.1,3,.8,.5,'#efece0');});
    k.box(s*18,top,-30,20,16,14,'#dad7c9');k.gable(s*18,top+16,-30,22,16,6,'#55575c');for(const x of [-5,5])k.box(s*18+x,top+6,-22.8,2,5,.3,'#26272c');}
   for(let i=0;i<26;i++)k.box(-25+i*2,top+28.2,-2.2,1,1,.5,'#d3cfbf');k.box(0,top+37.5,-2.4,8,3,.6,'#a99468');}
  // The Tower of Ecthelion: slim as a blade and very tall, ribbed, with a gallery under its gilt point.
  {const tz=-27;k.cyl(0,y,tz,8.4,12,150,'#e8e5d8',16);for(let i=0;i<8;i++){const a=i/8*6.283;k.limb([[Math.cos(a)*12.2,y,tz+Math.sin(a)*12.2,1],[Math.cos(a)*10.4,y+75,tz+Math.sin(a)*10.4,.8],[Math.cos(a)*8.7,y+148,tz+Math.sin(a)*8.7,.6]],'#f4f2e6',5);}for(const h of [46,92,128])k.column(0,y+h,tz,12-h*.024,1.2,'#d3cfbf',16);for(let i=0;i<26;i++){const a=i*.85,hh=10+i*5,r=12.1-hh*.0245;k.box(Math.cos(a)*r,y+hh,tz+Math.sin(a)*r,1,3.4,.4,'#2a2a30',Math.PI/2-a);}for(const hh of [92]){k.column(0,y+hh,tz,13,.8,'#e0ddd0',16);for(let i=0;i<14;i++){const a=i/14*6.283;k.column(Math.cos(a)*12.6,y+hh+.8,tz+Math.sin(a)*12.6,.25,2.6,'#f4f2e6',5);}}k.cyl(0,y+150,tz,11,8.4,6,'#ece9dc',16);k.column(0,y+156,tz,11.6,1.4,'#a99468',16);for(let i=0;i<12;i++){const a=i/12*6.283;k.column(Math.cos(a)*10.6,y+157.4,tz+Math.sin(a)*10.6,.5,8,'#f4f2e6',5);}k.column(0,y+157,tz,7,9,'#e8e5d8',12);k.cone(0,y+166,tz,10.6,34,'#c9c6b6',16);k.cone(0,y+196,tz,3,14,'#d7b35a',8);k.column(0,y+208,tz,.6,22,'#15161d');k.box(8.5,y+218,tz,16,10,.5,'#15161d');}},
 messengers(k,g){const z=S*1.47,green='#5d8a42',wood='#54391c',stone='#8a8270',wall='#7c6c4c';const rise=(x,zz)=>{const q=1-(x*x+(zz+6)*(zz+6))/(S*S*2.25);return q>0?-3+S*1.5*.62*Math.sqrt(q):0;};k.cyl(0,-3,0,128,140,70,green,44);k.hill(0,-3,-6,S*1.5,.62,green,1);k.hill(-S*.8,-3,-S*.5,S*.78,.52,'#648f46',2);k.hill(S*.84,-3,-S*.42,S*.72,.54,'#587f3e',0);
  // Bag End's roof is the Hill itself: uneven turf and hedges, wild flowers, brick chimneys that smoke through the grass, one old tree on the crest.
  {let seed=71;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;for(let i=0;i<26;i++){const a=rnd()*6.283,r=rnd()*S*1.25,x=Math.cos(a)*r,zz=-6+Math.sin(a)*r;if(zz>S*.92&&Math.abs(x)<70)continue;k.hill(x,rise(x,zz)-4,zz,12+rnd()*22,.34+rnd()*.2,['#5d8a42','#6a9648','#527c3a','#74a04e','#4e7638'][i%5],i);}
   for(let i=0;i<190;i++){const a=rnd()*6.283,r=Math.sqrt(rnd())*S*1.34,x=Math.cos(a)*r,zz=-6+Math.sin(a)*r;if(zz>S*1.02&&Math.abs(x)<70)continue;const y=rise(x,zz);if(i%3===0)k.ball(x,y+.6,zz,.8+rnd()*.6,['#e8d34a','#f2f2ea','#c75ea0','#d9543a','#7c5fb0'][i%5]);else k.limb([[x,y-.5,zz,1.3],[x+rnd()*1.6-.8,y+3,zz+rnd()*1.6-.8,.9],[x+rnd()*2-1,y+5.4,zz+rnd()*2-1,.08]],i%2?'#46703a':'#7ca24e',4);}
   for(const [a,b,c] of [[-1.15,-.1,8],[-.15,.95,6],[1.9,2.9,7]])for(let t=a;t<b;t+=.11){const x=Math.cos(t)*S*1.0,zz=-6+Math.sin(t)*S*1.0;k.canopy(x,rise(x,zz)+c*.5,zz,c*.8,['#2f5a2a','#37642e'],Math.round(t*100)+200,.8);}}
  for(const [x,zz,h,w] of [[46,-30,26,5.4],[-62,-12,20,4.6]]){const y=rise(x,zz)-5;k.box(x,y,zz,w*2,h,w*2,'#8a5238');for(let c=2;c<h;c+=3.2)k.box(x,y+c,zz,w*2+.3,.34,w*2+.3,'#6e6452');k.box(x,y+h,zz,w*2+2,1.4,w*2+2,'#5e5442');for(const s of [-1,1]){k.column(x+s*w*.46,y+h+1.4,zz,w*.34,5,'#a0623a',8);g.column(x+s*w*.46,y+h+6.3,zz,w*.2,.2,'#2a1408',8);}}
  // The door sits in a shoulder of turf; a curved dry-stone wall holds the hill back to either side.
  k.hill(0,-1,z-36,38,1.35,green,2);
  for(const s of [-1,1])for(let i=0;i<8;i++){const x=s*(27+i*10.5),zz=z-2-i*i*.62,h=21-i*1.5;k.box(x,0,zz,11.4,h,6,wall,s*i*.1);for(let c=0;c<3;c++)k.box(x,3+c*6,zz+3.05,11.2,.5,.3,'#5e5238',s*i*.1);k.hill(x,h-1,zz-2,8,.5,'#587f3e',i);}
  for(const s of [-1,1]){k.add(k.torus(7.6,1),s*46,10.5,z-1,1,1,1,wood);k.disc(s*46,10.5,z-1.8,7.4,1.6,wood);g.disc(s*46,10.5,z-.8,6.4,.3,'#f0d67c');k.box(s*46,10.2,z-.4,13,.7,.4,wood);k.box(s*46,4.2,z-.4,.7,13,.4,wood);}
  // The landing the door opens onto, with low steps down to the path.
  k.box(0,0,z+4,54,4,20,stone);for(let i=-2;i<=2;i++)k.box(i*10,4,z+4,.3,.08,20,'#6a6250');k.box(0,0,z+17,40,2.6,6,stone);k.box(0,0,z+22,46,1.3,6,stone);
  k.add(k.torus(23,2.2),0,23.5,z+2.2,1,1,1,wall);k.add(k.torus(20.8,1.9),0,23.5,z+3.4,1,1,1,wood);k.disc(0,23.5,z+2.4,20,2,'#3a2a18');k.disc(0,23.5,z+3.2,19,1.4,'#2f7a3e');for(let i=-4;i<=4;i++)k.box(i*3.9,23.5-Math.sqrt(361-i*i*15.2),z+4,.35,2*Math.sqrt(361-i*i*15.2),.2,'#234a2a');k.ball(0,23.5,z+4.9,1.7,'#e4b24a');k.disc(0,23.5,z+4.1,2.8,.3,'#c9962d');
  for(let i=0;i<34;i++){const a=(i-17)/17,x=a*118;if(Math.abs(x)<34)continue;const zz=S*1.54-Math.abs(a)*a*a*12-Math.abs(a)*26,c=['#b8503a','#c9ad45','#a85a90','#e4e4dc','#7c5fb0'][i%5];k.ball(x,2.2,zz,1.8+(i%3)*.5,c);k.ball(x+2.4,1.6,zz+2,1.3,'#3e6c36');}
  for(let i=0;i<26;i++){const a=(i-13)/13;if(Math.abs(a)<.12||Math.abs(a)>.55)continue;k.box(a*150,0,S*1.72-Math.abs(a)*40,1,7,1,'#6a4f2a');if(Math.abs(a+.0385)<.54&&Math.abs(a+.0385)>.13)k.box((a+.0385)*150,5,S*1.72-Math.abs(a+.0385)*40,11.5,.8,.8,'#6a4f2a',-Math.sign(a)*.25);}
  for(const [x,zz,r] of [[-92,S*1.3,12],[94,S*1.28,13],[-132,S*1.02,15],[136,S*.98,14]]){k.canopy(x,r*.7,zz,r*.6,['#26401f','#2d4a26'],Math.abs(x)+3,.75);}k.limb([[-30,S*.46+14,-40,4.6],[-29,S*.46+36,-39,3],[-31,S*.46+56,-41,1.8]],'#54391c',8);for(const [a,b,c,r] of [[-30,62,-40,24],[-46,54,-30,15],[-14,56,-52,16],[-34,70,-58,14],[-22,74,-24,13]])k.canopy(a,S*.46+b-4,c,r,['#26401f','#2d4a26','#335a2c'],Math.abs(a+c)+5,.8);},
 // Erebor stands alone: one great bare peak behind the carved front, snow on its head, spurs running down either side of the gate.
 treasury(k){const rock='#837d6e',high='#79746a',snow='#e6e9ec';k.crag(0,0,-46,S*1.78,132,S*1.66,rock,1);for(const a of [-1,1])k.crag(a*96,0,44,76,70,66,'#7f7969',a>0?2:3);k.crag(60,66,-46,68,66,68,'#8a8474',2);
  k.crag(0,70,-130,S*1.72,190,S*1.18,high,3);k.crag(-16,210,-142,S*1.06,150,S*.86,high,2);k.crag(10,330,-150,S*.58,96,S*.5,'#716c63',1);k.crag(8,404,-152,S*.28,46,S*.24,'#6c675f',3);
  // Snow in the high gullies and on the crown.
  k.crag(8,420,-152,S*.2,34,S*.18,snow,3);k.crag(4,374,-146,S*.36,26,S*.3,snow,1);for(const [x,y,z,sx,sy,sz,seed] of [[-52,332,-122,16,34,8,2],[50,322,-116,14,38,8,3],[-20,342,-104,10,26,8,1],[30,352,-110,8,22,7,2]])k.crag(x,y,z,sx,sy,sz,snow,seed);
  for(const s of [-1,1])k.crag(s*S*.98,120,-84,S*.46,110,S*.5,high,s>0?1:2);},
 // Osgiliath: the Dome of Stars half fallen, its shards lying where they dropped, and the great bridge over the Anduin broken in the middle.
 observatory(k){const pale='#c5c2ae',worn='#a9a692';k.cyl(0,-2,0,S*1.1,S*1.2,H+4,worn,36);k.cyl(0,H+2,0,S*1.0,S*1.06,16,pale,36);for(let i=0;i<24;i++){const a=i/24*6.283;if(i>=2&&i<=5)continue;k.box(Math.sin(a)*S*1.04,H+6,Math.cos(a)*S*1.04,7,12,1,'#2c2a24',a);k.column(Math.sin(a+.13)*S*1.05,H+2,Math.cos(a+.13)*S*1.05,2,16,'#d4d1be',8);}k.add(new T.SphereGeometry(1,30,12,2.1,4.5,0,Math.PI/2).toNonIndexed(),0,H+18,0,S*.97,S*.64,S*.97,pale);for(let i=0;i<16;i++){const a=i/16*6.283,pts=[];const broken=i>=1&&i<=4?.3+(i%3)*.22:1;for(let t=0;t<=6;t++){const f=t/6*broken*1.5708;pts.push([Math.sin(a)*Math.cos(f)*S*.985,H+18+Math.sin(f)*S*.66,Math.cos(a)*Math.cos(f)*S*.985,2.6]);}k.limb(pts,'#8f8c7c',6);}k.column(0,H+18+S*.64,0,14,10,worn,12);k.dome(0,H+28+S*.64,0,14,pale,.8);for(let i=1;i<12;i++){const a=i/12*6.283,h=i%3===1?H*.5+(i*7%5)*5:H+22;k.column(Math.sin(a)*S*1.32,0,Math.cos(a)*S*1.32,6.5,h,'#d4d1be',12);if(i%3!==1){k.column(Math.sin(a)*S*1.32,h,Math.cos(a)*S*1.32,8.5,3,'#c5c2ae',12);if(i%3===2){const m=a+.2618,c=S*1.32*Math.cos(.2618);k.box(Math.sin(m)*c,h+3,Math.cos(m)*c,2*S*1.32*Math.sin(.2618)+16,6,12,'#c5c2ae',m);}}}for(let i=0;i<14;i++){const a=i*2.399;k.crag(Math.sin(a)*S*(1.05+(i%4)*.1),0,S*.2+Math.cos(a)*S*(.4+(i%3)*.32),6+(i%3)*3,4+(i%4)*2,6,'#a9a692',i);}arch(k,0,0,S*1.21,36,46,'#2c2a24',1.4);
  // Shards of the dome on the broken side of the drum, a fallen length of cornice among them.
  for(const [a,r,y,sx,sy,sz] of [[.5,1.2,2,18,7,11],[.78,1.3,2,12,9,8],[1.08,1.22,3,22,6,12],[1.32,1.34,2,10,6,8]])k.rock(Math.sin(a)*S*r,y,Math.cos(a)*S*r,sx,sy,sz,'#b9b6a4',Math.round(a*10));k.add(k.cube(),S*1.26,2.2,S*.28,34,5,9,pale,.5,0,.06);
  // The bridge of the old city, pier by pier, with the gap the war tore in it.
  for(let i=0;i<4;i++){const x=136+i*42;k.box(x,0,-85,13,34,16,worn);k.box(x,0,-85,17,6,20,'#8f8c7c');for(const s of [-1,1])k.cone(x,0,-85+s*9,4,10,'#8f8c7c',4);if(i===2||i===3)continue;k.limb([[x+6,28,-85,2.4],[x+21,38,-85,2.4],[x+36,28,-85,2.4]],worn,6);k.box(x+21,38,-85,44,5,14,pale);for(const s of [-1,1])for(let c=0;c<6;c++)k.box(x+1+c*8,43,-85+s*6.4,2.4,3+(c%2)*1.6,1.2,pale);}k.box(136+2*42+10,34,-85,18,5,14,pale);k.rock(136+3*42-14,2,-85,11,5,8,pale,3);k.rock(136+2*42+27,2,-92,7,3,6,pale,2);},
};

// A smial: door, windows and chimney look out over the open green towards the lane, with a path of flat stones leading there.
const smial=(k,g,fx,x,z,r,door)=>{const ry=Math.atan2(-x,212-z),c=Math.cos(ry),n=Math.sin(ry),front=r*.97,cy=r*.34;
 k.local(x,z,ry,()=>{k.hill(0,0,0,r,.92,'#5d8a42',Math.abs(x));k.box(0,0,front-7,r*.92,cy*2+6,12,'#7c6c4c');k.box(0,cy*2+6,front-8,r*1.02,1.6,14,'#54391c');k.hill(0,cy*2+7,front-12,r*.56,.42,'#5d8a42',2);k.add(k.torus(r*.27,1.3),0,cy+1,front+.6,1,1,1,'#54391c');k.disc(0,cy+1,front,r*.26,1.6,door);for(let i=-2;i<=2;i++)k.box(i*r*.095,cy+1-r*.2,front+1,.3,r*.4-Math.abs(i)*r*.04,.2,'#22301f');k.ball(0,cy+1,front+1.5,1.2,'#e4b24a');for(const s of [-1,1]){k.disc(s*r*.56,cy+3,front-.8,r*.13,1.5,'#54391c');g.disc(s*r*.56,cy+3,front+.1,r*.1,.3,'#f0d67c');k.box(s*r*.56,cy+3-.3,front+.4,r*.2,.5,.3,'#54391c');k.box(s*r*.56,cy+3-r*.1,front+.4,.5,r*.2,.3,'#54391c');k.ball(s*r*.86,3,front-4,4,'#3e6c36',.8);k.ball(s*r*.82,6,front-3,1.2,'#b8503a');}k.box(0,0,front+4,r*.72,1.2,8,'#8a8270');k.box(0,0,front+9.5,r*.56,.6,5,'#8a8270');{const sill=cy+1-r*.26;k.box(0,0,front+1.6,r*.42,sill,3.4,'#9a9280');k.box(0,0,front+4.6,r*.5,sill*.5,3.2,'#8a8270');}k.column(r*.4,r*.62,-r*.2,3,18,'#9a7a4a',6);k.column(r*.4,r*.62+18,-r*.2,3.8,1.6,'#5e5442',6);});
 fx.smoke.push([x+c*r*.4-n*r*.2,r*.62+19,z-n*r*.4-c*r*.2]);
 const dx=x+n*(front+12),dz=z+c*(front+12),tx=x>0?12:-12,tz=226,len=Math.hypot(tx-dx,tz-dz),steps=Math.floor(len/9);for(let i=0;i<=steps;i++){const t=i/Math.max(1,steps),a=i*1.7;k.box(dx+(tx-dx)*t+Math.sin(a)*1.2,0,dz+(tz-dz)*t+Math.cos(a)*1.2,6+(i%3),.5,4.6+(i%2),'#8a8270',a);}};
const flameOn=(g,x,y,z,r,h)=>{fireAt(g,x,y,z,r,h);};
const stair=(k,z,n,w,rise,run,color)=>{for(let i=0;i<n;i++)k.box(0,i*rise,z+(n-1-i)*run,w-i*1.4,rise+.2,run+.5,color);};
// Every entrance stands free at the south, facing the road that leads to it.
const entrances={
 // Orthanc: a great black stair and a pointed iron portal, the balcony above it, the White Hand to either side.
 isengard(k,g){const black='#3a3a42',iron='#23242a',z=172;stair(k,z,9,50,1.7,3.4,black);k.box(0,14,z-5,62,4,16,black);
  for(const s of [-1,1]){k.box(s*24,18,z-3,10,62,10,black);k.cone(s*24,80,z-3,7.4,26,iron,4,.78);k.box(s*18,18,z-1,2,46,2,'#55555e');k.local(s*11,z+3,s*.95,()=>{k.box(0,18,0,14,52,1.6,iron);for(let i=0;i<5;i++)k.box(0,22+i*10,.9,13,.8,.5,'#4a4b52');});
   k.box(s*42,18,z-6,16,44,1,'#141418');k.box(s*42,27,z-5.4,8,9,.3,'#e7e7df');for(let i=0;i<4;i++)k.box(s*42-4.2+i*2.8,36,z-5.4,1.8,9+(i%3)*2,.3,'#e7e7df');k.box(s*42+5,30,z-5.4,1.6,7,.3,'#e7e7df',0);
   k.column(s*31,0,z+27,3,13,iron,8);k.cyl(s*31,13,z+27,5,3,3,iron,8);flameOn(g,s*31,15,z+27,3.2,12);}
  k.box(0,18,z-5,36,54,1.4,'#08080a');g.box(0,18,z-4.2,26,3,.3,'#7a2a10');for(let i=0;i<5;i++)k.cone(-14+i*7,72,z-5,3,8+(i%2)*7,iron,4);k.box(0,86,z-2,44,3,14,black);for(let i=0;i<9;i++)k.column(-18+i*4.5,89,z+4,.6,6,iron,5);k.box(0,95,z+4,40,.8,.8,iron);},
 // The house of Elrond: slender pillars that grow and meet like branches, gilded leaves, water running in stone basins.
 library(k,g){const pale='#ece6d2',z=124;stair(k,z,4,40,1.2,2.4,pale);for(const s of [-1,1]){k.box(s*19,0,z+2,9,3,9,'#d8d0b6');k.limb([[s*19,2,z+2,2.4],[s*19,28,z+2,1.9],[s*17,48,z+2,1.5],[s*9,64,z+2,1],[0,72,z+2,.5]],pale,8);k.limb([[s*19,30,z+2,1],[s*25,42,z+3,.8],[s*23,54,z+3,.5],[s*15,58,z+3,.2]],pale,6);k.limb([[s*17,40,z+2,.8],[s*10,47,z+3,.6],[s*4,48,z+3,.3]],'#c9a24a',6);for(let i=0;i<9;i++){const t=i/8;k.add(k.octa(1),s*(19-t*17),24+t*44,z+3.4,1.5,2.6,.5,i%2?'#c9a24a':'#b08a3a',i);}
   k.cyl(s*34,0,z+10,8,5,5,pale,14);k.column(s*34,5,z+10,8.3,.7,'#d8d0b6',14);g.column(s*34,5.2,z+10,7,.3,'#bfe3ef',14);k.column(s*34,5,z+10,1,7,pale,8);g.lamp(s*34,13,z+10,1.3);
   k.column(s*27,0,z+14,.8,16,'#c9a24a',6);g.lamp(s*27,17.4,z+14,1.5);}
  arch(k,0,0,z-2,26,48,'#23211c',1);for(let i=0;i<7;i++){const a=i/6*3.1416;k.box(Math.cos(a)*14,35+Math.sin(a)*14,z-1.4,2,2,.8,'#c9a24a',0);}},
 // Caras Galadhon: a white gate of living wood, a swan on its crown, lamps hanging in the arch.
 lorien(k,g){const white='#e4e2cf',z=138;stair(k,z-2,3,44,1,2.6,'#d8d4bc');for(const s of [-1,1]){k.limb([[s*20,0,z,3.4],[s*19,18,z,2.6],[s*19,38,z,2],[s*14,54,z,1.4],[s*5,62,z,.9],[0,64,z,.5]],white,9);k.limb([[s*19,14,z,1.2],[s*29,26,z,.9],[s*30,38,z,.6],[s*25,44,z,.2]],white,6);k.canopy(s*30,46,z,10,['#a08c32','#b89f38'],s>0?3:5,.6);for(const h of [34,46])g.lamp(s*14,h,z+1,1.5);k.column(s*14,36,z+1,.2,10,'#b89f38',4);}
  k.limb([[-9,67,z,1.1],[0,66,z,1.8],[9,68,z,1],[12,74,z,.8],[10,79,z,.5]],white,8);k.cone(9,78,z,.6,2,'#c9a24a',5);},
 // The Woodland Realm: great doors of stone in the rock, beech roots above, a footbridge over the Forest River.
 // The way into the Woodland Realm: no door, only two old beeches that bow towards each other over the path, lanterns hanging from their arch.
 council(k,g){const z=150;for(const s of [-1,1]){k.limb([[s*30,0,z+6,6.4],[s*29,22,z+6,5.4],[s*25,44,z+6,4.4],[s*17,60,z+6,3.4],[s*6,68,z+6,2.4],[0,70,z+6,1.6]],'#2b241b',10);for(let i=0;i<4;i++){const a=i*1.57+.5;k.limb([[s*30+Math.cos(a)*5,6,z+6+Math.sin(a)*5,2.6],[s*30+Math.cos(a)*12,1,z+6+Math.sin(a)*12,1.4],[s*30+Math.cos(a)*18,0,z+6+Math.sin(a)*18,.4]],'#231d16',6);}k.limb([[s*28,40,z+6,2],[s*40,52,z+4,1.2],[s*46,62,z,.4]],'#2b241b',6);k.canopy(s*40,62,z,16,['#16301d','#1c3a22'],s>0?5:8,.7);k.column(s*16,44,z+6,.15,16,'#231d16',3);g.lamp(s*16,43,z+6,1.8);}
  for(let i=0;i<4;i++)for(const s of [-1,1])k.limb([[s*5,60,z+6,1.2],[s*(9+i*5),68+i*3,z+7,.9],[s*(11+i*7),76+i*5,z+6,.5],[s*(15+i*7),84+i*6,z+6,.1]],'#c9bfa0',6);k.box(0,56,z+6,14,6,3,'#c9bfa0');
  for(let i=0;i<8;i++){const t=i/7;k.box(0,Math.sin(t*3.1416)*5,z+8+t*17,24,1.4,3,'#4c463a');}for(const s of [-1,1])for(let i=0;i<7;i++){const t=i/6;k.column(s*12,Math.sin(t*3.1416)*5,z+8+t*17,.5,5,'#3a3528',5);}},
 // Moria: the Doors of Durin, their silver lines alight: the holly trees, the star, the crown and the arch of runes.
 forge(k,g){const z=S*1.2+1.7,line='#cfeeff';for(const s of [-1,1]){g.limb([[s*17,6,z,.5],[s*17,28,z,.4],[s*14,46,z,.25]],line,4);for(let i=0;i<5;i++){const y=20+i*6;g.limb([[s*17,y,z,.2],[s*(17-4-i),y+5,z,.14],[s*(17-7-i*.6),y+12,z,.05]],line,3);g.limb([[s*17,y,z,.2],[s*(17+3),y+5,z,.14],[s*(17+4),y+9,z,.05]],line,3);}k.limb([[s*42,0,z+14,2.2],[s*42,20,z+14,1.6],[s*40,32,z+14,.9]],'#3a2a18',7);k.canopy(s*40,38,z+14,14,['#1c3a26','#24492b'],s>0?4:9,.9);for(let i=0;i<4;i++)g.ball(s*(36+i*3),28+i*7,z+18,.5,'#c8402a');}
  for(let i=0;i<=24;i++){const a=i/24*3.1416;g.box(Math.cos(a)*24,44+Math.sin(a)*24,z,1.8,1,.3,line,0);if(i%2===0)g.box(Math.cos(a)*27,44+Math.sin(a)*27,z,.5,1.8,.3,line,a);}g.ball(0,40,z+.3,2.4,'#ffffff',.7);for(let i=0;i<8;i++){const a=i*.785;g.box(Math.cos(a)*3.8,40+Math.sin(a)*3.8,z+.1,.4,3.2,.2,line,0);}
  for(let i=0;i<7;i++){const a=.5+i/6*2.14;g.ball(Math.cos(a)*14,50+Math.sin(a)*10,z,.55,'#ffffff');}k.box(0,10,z,10,5,.3,'#26241f');g.box(-2,10,z+.2,1,4,.2,line);g.box(2,10,z+.2,4,1,.2,line);},
 // The Great Gate of Minas Tirith: steel and mithril between two towers, under the prow of the city, the White Tree on black.
 gate(k,g){const z=S*1.46+3,white='#e6e3d6',steel='#3a3d44';k.box(0,0,z+10,66,.5,28,'#cfccbe');for(const s of [-1,1]){k.column(s*40,0,z,15,86,white,14);k.column(s*40,86,z,17,4,'#cfccbe',14);k.cone(s*40,90,z,17,18,'#7c8087',14);for(let i=0;i<10;i++){const a=i/10*6.283;k.box(s*40+Math.cos(a)*16,90,z+Math.sin(a)*16,3,4,3,white,a);}for(const h of [28,50,70]){k.box(s*40,h,z+15,2.4,9,.8,'#26262a');g.box(s*40,h+1,z+15.5,1.6,6,.2,'#e8c678');}
   k.box(s*58,14,z-4,16,58,1,'#15161d');k.box(s*58,30,z-3.4,1,30,.3,'#ece9dc');for(const [h,w] of [[42,6],[50,8],[56,5]])for(const q of [-1,1])k.add(k.cube(),s*58+q*w/2,h,z-3.4,w,.7,.3,'#ece9dc',0,0,q*.55);for(let i=0;i<7;i++)k.ball(s*58-5+i*1.7,61-(i%2),z-3.4,.5,'#ece9dc');
   k.local(s*25,z+8,s*.98,()=>{k.box(0,0,0,23,60,3,steel);for(let i=0;i<5;i++){k.box(0,5+i*12,1.8,21,1.2,.6,'#c9ced4');for(let c=0;c<4;c++)k.ball(-8+c*5.4,9+i*12,1.9,.7,'#c9ced4');}k.box(0,28,1.9,1,30,.4,'#e8eef0');});
   k.column(s*20,0,z+21,.9,18,'#26262a',8);k.cyl(s*20,18,z+21,3.4,1.6,2,'#26262a',8);flameOn(g,s*20,19.6,z+21,2.4,9);}
  k.box(0,62,z,52,14,14,white);k.box(0,0,z-2,46,62,2,'#101116');k.box(0,76,z+2,58,3,12,'#cfccbe');for(let i=0;i<13;i++)k.box(-27+i*4.5,79,z+7,2.6,3,2,white);k.box(0,68,z+7.4,14,5,.5,'#c9962d');},
 // Bag End: the round green door, its brass knob in the middle, lamps on the landing, roses over the arch, the gate and the notice on it.
 messengers(k,g){const z=S*1.47;for(const s of [-1,1]){k.column(s*25,4,z+9,.8,17,'#3a2a18',6);k.box(s*25,21,z+9,4,.6,1.2,'#3a2a18');g.lamp(s*25,19.2,z+9,1.3);k.cyl(s*18,4,z+11,2.8,2,3.5,'#a0623a',8);k.canopy(s*18,9.5,z+11,3.4,['#3e7036','#4c7c3e'],s>0?2:6,.8);k.box(s*11,0,z+29,1,8,1,'#6a4f2a');k.local(s*7,z+29,s*.9,()=>k.box(0,1.4,0,8,4.6,.5,'#7a5a30'));}
  for(let i=0;i<19;i++){const a=(i/18-.5)*3.1;k.ball(Math.sin(a)*25.6,23.5+Math.cos(a)*25.6,z+3.6,1.3,i%3?'#3e6c36':'#b8503a');}
  k.box(14,0,z+29,1,13,1,'#6a4f2a');k.box(14,10,z+29.6,9,5,.4,'#e8dfc4');k.box(14,12.4,z+30,6,.3,.1,'#3a3226');k.box(14,11,z+30,4.4,.3,.1,'#3a3226');
  // A bench for an evening pipe, the letterbox, a rain barrel and a boot scraper.
  k.box(-37,0,z+15,18,5,5,'#6a4f2a');k.box(-37,5,z+12.6,18,5,.8,'#6a4f2a');k.column(32,0,z+25,.7,12,'#6a4f2a',6);k.box(32,12,z+25,6,4.6,5,'#2f6a3a');k.column(40,0,z+7,4,10,'#55391c',10);k.column(40,10,z+7,3.6,.2,'#27465e',10);k.box(10,4,z+15,4,1,.4,'#54565a');},
 // Erebor: the Front Gate as a wall of carved stone. Two kings of Durin's line with their axes, nested frames, a stepped lintel in gold, runes and a paved court with water.
 treasury(k,g){const z=S*1.2,stone='#a39d88',dark='#7f7a68',gold='#c9962d',bright='#ffdc7a',king='#b4ae9a';
  k.box(0,0,z-22,262,152,26,stone);for(let y=8;y<150;y+=11)k.box(0,y,z-8.6,262,.7,.6,dark);
  // The opening: frame within frame, each stepping back.
  for(const [w,h,dz,c] of [[112,110,8,stone],[94,100,5,dark],[78,90,2,stone],[64,82,-1,dark]])for(const s of [-1,1]){k.box(s*w/2,0,z+dz,8,h,8,c);k.box(s*w/2+s*-3.8,4,z+dz+4.2,.8,h-8,.6,gold);k.box(0,h,z+dz,w+8,8,8,c);k.box(0,h+1.6,z+dz+4.2,w+2,.8,.6,gold);}
  k.box(0,0,z-7,58,84,2,'#080604');g.box(0,0,z-5.6,34,48,.3,'#6e3a10');g.box(0,0,z-5.3,18,26,.3,'#c97a22');
  // The door leaves stand open, heavy as cliffs, ribbed with gold.
  for(const s of [-1,1])k.local(s*30,z-3,s*1.25,()=>{k.box(0,0,0,24,80,4,'#3a362c');for(let i=0;i<6;i++){k.box(0,6+i*13,2.2,22,1,.5,gold);for(const q of [-1,1])k.add(k.cube(),q*5,12+i*13,2.2,.8,12,.5,gold,0,0,q*.7);}k.box(0,0,2.2,1.4,80,.5,bright);});
  // The stepped lintel, ever narrower, ending in the sign of the Arkenstone.
  for(let i=0;i<7;i++){const w=128-i*16,y=118+i*9;k.box(0,y,z+1-i*1.4,w,9,12,i%2?stone:dark);k.box(0,y+7.4,z+7.2-i*1.4,w-3,1,.6,gold);}
  for(let i=0;i<31;i++){const x=-45+i*3;k.box(x,106,z+12.4,.7,4.4,.4,bright);if(i%3)k.add(k.cube(),x+1,108,z+12.4,.5,2.8,.4,bright,0,0,i%2?.7:-.7);}
  for(let i=0;i<8;i++)for(const s of [-1,1]){k.add(k.cube(),s*(3+i*4.8),92-i*.4,z+9,1.1,17,1,gold,0,0,s*.72);}
  k.add(k.octa(1),0,186,z-6,5,7,2,'#dff4ff');g.ball(0,186,z-3.4,2.2,'#ffffff');k.limb([[-14,178,z-5,1],[-10,190,z-5,.8],[0,198,z-5,.8],[10,190,z-5,.8],[14,178,z-5,1]],gold,6);
  // The two kings on their plinths, helmed and bearded, hands on the axe.
  for(const s of [-1,1]){const x=s*114,q=1.78,zz=z+12;k.box(x,0,zz,92,12,70,dark);for(let i=0;i<3;i++)k.box(x,12+i*4,zz,84-i*7,4,62-i*6,stone);k.box(x,0,zz+35.4,92,1,.6,gold);dwarfStatue(k,x,zz,178,king);
   for(let i=0;i<6;i++)k.box(x+(i-2.5)*6*q,31,zz+35-i%2,3,3,1,gold);}
  // The paved court, water running in stone channels, great braziers.
  k.box(0,0,z+28,128,1.2,58,'#6f6a58');for(let i=-5;i<=5;i++){k.box(i*12,1.2,z+28,.4,.1,58,'#57534a');}for(let i=0;i<5;i++)k.box(0,1.2,z+4+i*12,128,.1,.4,'#57534a');for(let i=0;i<3;i++)k.box(0,0,z+58+i*4,128-i*8,1.1-i*.3,4,'#6f6a58');
  for(const s of [-1,1]){k.box(s*42,1.2,z+28,7,.4,54,'#55524a');g.box(s*42,1.5,z+28,5.4,.2,52,'#3f7f96');k.column(s*30,1.2,z+44,4,2,dark,10);k.column(s*30,3.2,z+44,1.6,16,'#55524c',8);k.cyl(s*30,19.2,z+44,6.4,2,4,'#55524c',10);flameOn(g,s*30,22.6,z+44,4.4,16);}},
 // Osgiliath: the broken portico of the Dome of Stars, its pediment split, stars of brass over the door.
 observatory(k,g){const z=S*1.21,pale='#d4d1be';stair(k,z+2,5,70,1,2.6,'#b9b6a4');for(const x of [-34,-22,22,34]){k.box(x,5,z+6,10,2,10,'#b9b6a4');k.column(x,7,z+6,3.8,x===34?30:50,pale,14);if(x!==34)k.box(x,57,z+6,10,3,10,'#b9b6a4');}
  k.box(-13,60,z+6,50,8,11,pale);k.box(24,60,z+6,20,8,11,pale,.06);k.rock(36,2,z+20,6,3,5,pale,2);k.rock(42,1.6,z+10,5,2.6,4,pale,3);k.box(30,1,z+22,12,3,7,pale,.5);
  k.gable(-16,68,z+6,44,10,14,'#c5c2ae',Math.PI/2);for(let i=0;i<7;i++){const a=i/6*3.1416;g.lamp(Math.cos(a)*16,26+Math.sin(a)*13,z+1.8,.6);}k.box(-13,64,z+11.8,16,1.6,.5,'#b5a578');},
 // The Great Gate of the Hornburg: oak and iron between two towers at the head of a walled causeway.
 scouts(k,g){const stone='#a2a6a4',z=S*1.38,iron='#2f3134';for(let i=0;i<15;i++){for(const s of [-1,1]){const h=3.4+Math.max(0,(9-i))*.7;k.box(s*15.5,0,z+8+i*5.2,2.4,h,5.4,stone);k.box(s*15.5,h,z+8+i*5.2,2.6,1,1.8,'#b4b6b0');}}
  for(const s of [-1,1]){k.column(s*27,0,z+3,12,74,stone,14);k.column(s*27,74,z+3,14,2.5,'#b4b6b0',14);for(let i=0;i<10;i++){const a=i/10*6.283;k.box(s*27+Math.sin(a)*13.4,76,z+3+Math.cos(a)*13.4,3.4,4,2.8,'#b4b6b0',a);}for(const h of [28,50])k.box(s*27,h,z+14.6,2.2,9,.7,'#23211c');k.local(s*12,z+9,s*.95,()=>{k.box(0,0,0,12,34,1.8,'#4a3219');for(let i=0;i<4;i++)k.box(0,4+i*9,1,11,1,.5,iron);for(let i=0;i<8;i++)k.ball(-4+(i%2)*8,6+Math.floor(i/2)*9,1.3,.5,'#54565a');});k.column(s*22,0,z+36,.9,16,'#3a2a18',8);k.cyl(s*22,16,z+36,3.4,1.6,2,iron,8);flameOn(g,s*22,17.6,z+36,2.6,9);}
  k.box(0,36,z+4,32,40,9,stone);k.box(0,0,z+1,18,38,1.4,'#100e0c');k.box(0,76,z+4,34,4,9,'#b4b6b0');for(let i=0;i<7;i++)k.box(-15+i*5,80,z+7,3,3.4,2,'#b4b6b0');k.box(0,52,z+8.6,14,16,.5,'#2f5a30');k.box(0,57,z+9,7,5,.3,'#e8e4d4');k.box(3,61,z+9,2,5,.3,'#e8e4d4');k.box(-3,54,z+9,1,4,.3,'#e8e4d4');k.box(3,54,z+9,1,4,.3,'#e8e4d4');},
};
for(const id of Object.keys(entrances)){const base=roofs[id];roofs[id]=(k,g=k)=>{base(k,g);entrances[id](k,g);buildingDetail[id]?.(k,g);};}

// Close-up life outside the halls. Only drawn when the camera is near.
export const closeDetails={
 scouts(k,g){for(const s of [-1,1])for(let i=0;i<10;i++){const x=s*(48+i*24),z=214+(i%2)*9;k.add(k.cube(),x,5,z,1.6,16,1.6,'#4a3a22',0,.6,0);k.add(k.cube(),x+6,4,z,1.4,13,1.4,'#55442a',0,-.5,.3);}crate(k,-92,186,10);barrel(k,-108,190);barrel(k,92,188);lantern(k,g,-58,202);lantern(k,g,58,202);k.box(112,0,192,18,6,10,'#6a4a26');for(let i=0;i<6;i++)k.ball(106+i*2.4,7,190+(i%2)*4,2.6,'#b39a4a',.7);},
 isengard(k,g){for(let i=0;i<10;i++){const x=-180+i*40,z=136+(i%2)*14;k.box(x,0,z,8,3,8,'#3e3a33');k.box(x,3,z,5,9,5,'#54565a');}for(let i=0;i<7;i++){if(i===3)continue;k.column(-170+i*56,0,160,2,8,'#17120e',6);g.column(-170+i*56,1,168,1,1,'#ff6a2a',6);}for(let i=0;i<5;i++)k.box(-100+i*50,0,180,24,1,8,'#2c2822',i*.4);},
 library(k,g){for(let i=0;i<8;i++){if(Math.abs(-150+i*44)<54)continue;k.column(-150+i*44,0,130,2,18,'#f1ebd6',8);k.ball(-150+i*44,20,130,3,'#e4dcc2');}for(let i=0;i<14;i++)if(Math.abs(-180+i*28)>16)k.ball(-180+i*28,3,150+(i%2)*10,2.6,['#d9543a','#ecd98f','#e8e8d2','#c75ea0'][i%4]);},
 lorien(k,g){for(let i=0;i<12;i++){const a=i*.52;if(Math.abs(Math.cos(a)*170)<18&&Math.sin(a)>0)continue;if(Math.hypot(Math.cos(a)*170,60+Math.sin(a)*120)<140)continue;g.lamp(Math.cos(a)*170,10+(i%3)*8,60+Math.sin(a)*120,1.6);}for(let i=0;i<20;i++)k.box(-180+i*18,.2,150+(i%3)*8,5,.3,2.6,'#e2c84e',i);},
 council(k,g){for(let i=0;i<12;i++){if(Math.abs(-180+i*32)<70)continue;if(i===3)continue;k.ball(-180+i*32,4,144+(i%2)*8,4,'#c85a1a',.8);k.column(-180+i*32,0,144+(i%2)*8,1,4,'#efe4c8',6);}for(let i=0;i<10;i++)g.lamp(-160+i*36,16+(i%3)*8,175,.8);},
 forge(k,g){for(let i=0;i<8;i++)if(Math.abs(-180+i*50)>80)rock(k,-180+i*50,155,7,'#5a564e');for(let i=0;i<6;i++){const x=-120+i*48;if(Math.abs(x)<40)continue;rock(k,x-4,175,7,'#5a564e');rock(k,x+5,178,5,'#676258');for(const a of [-1,1])k.column(x+a*9,0,166,.9,17,'#3a2a18',6);k.box(x,17,166,21,1.6,1.6,'#3a2a18');g.lamp(x,14.6,166,1.1);}},
 gate(k,g){for(let i=1;i<7;i++){if(i===1||i===6)continue;k.column(-168+i*48,0,140,4,24,'#ece9dc',10);k.box(-168+i*48,24,140,10,3,10,'#d7d4c6');}for(const a of [-1,1]){k.column(a*150,0,170,.8,40,'#15161d');k.box(a*150+7,32,170,14,8,.4,'#15161d');}},
 messengers(k,g){for(let i=0;i<24;i++){const x=-180+i*15;if(Math.abs(x)<50||Math.abs(x)>60)continue;k.ball(x,2.6,176+(i%3)*7,1.8,['#d9543a','#e8c94a','#c75ea0','#f2f2f2'][i%4]);}
  // Bean rows and cabbages in the gardens, a washing line, pumpkins by the wall.
  for(const s of [-1,1])for(let r=0;r<3;r++){const z=172+r*7;for(let c=0;c<6;c++){const x=s*(64+c*9);k.ball(x,1.6,z,2.1,r%2?'#4c7c3e':'#5d8a42',.7);if(r===1&&c%2===0)k.column(x,0,z-4,.3,13,'#6a4f2a',4);}}
  for(const x of [-138,-96]){k.column(x,0,192,.7,16,'#6a4f2a',6);}k.box(-117,15,192,42,.2,.2,'#d8cfae');for(let i=0;i<5;i++)k.box(-132+i*7.4,8,192,5,7,.2,['#e8e0c8','#8f3b24','#c9ad45','#e8e0c8','#27465e'][i]);
  for(const x of [-68,66,92])k.ball(x,3.4,190,3.4,'#e0a23a',.8);},
 treasury(k,g){for(let i=0;i<7;i++){const x=-210+i*70;if(Math.abs(x)<=150)continue;k.box(x,5,226,28,1.4,12,'#7c5a31');k.box(x,0,226,26,5,1,'#5e4322');for(const a of [-1,1])for(const b of [218,232])k.column(x+a*13,0,b,.8,19,'#4a3219',6);k.gable(x,19,225,31,18,5,['#7a3a28','#35506e','#44603e','#7c6430'][i%4],Math.PI/2);for(let c=0;c<5;c++)k.ball(x-10+c*5,7.6,226,1.5,['#b8503a','#c9ad45','#8a6a3a'][c%3]);}for(const x of [-188,-174,174,188])barrel(k,x,186);lantern(k,g,-74,214);lantern(k,g,74,214);},
 observatory(k,g){for(let i=0;i<12;i++)if(Math.abs(-170+i*30)>60)k.box(-170+i*30,0,148+(i%3)*14,8+(i%3)*5,4+(i%4)*2,8,'#8a8775',i);for(let i=0;i<5;i++)if(i!==2)k.column(-120+i*60,0,175,4,10+(i%3)*10,'#b9b6a4',8);},
};

// The Morannon: two Towers of the Teeth and the iron gate in the pass. Local x runs along the wall, local z along the road.
// Sauron in his armour. Original shapes: plate, spiked crown, mace and the one ring. About three times the height of an orc.
export function buildSauron(metal){
 // As at the Last Alliance: blue-black plate in overlapping layers, a tall crown of thin blades, a slit for a face, the great mace, the Ring on the mace hand.
 const root=new T.Group(),frame=new T.Group(),body=new Kit(),glow=new Kit(),arm=new Kit(),off=new Kit(),iron='#1c1e24',plate='#2c2f37',edge='#6a6f7a',ember='#ff6a1a';root.add(frame);
 const blade=(k,x,y,z,w,h,d,c,ry=0,rz=0)=>{k.add(k.cube(),x,y+h/2,z,w,h,d,c,ry,0,rz);k.add(k.cylinder(0,1,1,4),x,y+h*1.27,z,w*.72,h*.55,d*.72,c,ry,0,rz);};
 // Legs in two parts, so the knee bends and the armoured foot comes down flat.
 const thigh=[],shin=[];
 for(const s of [0,1]){const hip=new T.Group(),knee=new T.Group(),a1=new Kit(),a2=new Kit();hip.position.set(s?4.2:-4.2,38,0);knee.position.set(0,-17,.6);
  a1.limb([[0,0,0,3],[0,-8,.4,2.7],[0,-17,.2,2.3]],plate,9);for(const y of [-6,-10,-14])a1.column(0,y,.1,2.9-(y+6)*-.04,.8,iron,9);a1.cone(0,-17,1.6,2.3,4.6,edge,5);
  a2.limb([[0,0,0,2.4],[0,-8,-.3,2.5],[0,-17,-.1,1.9]],plate,9);a2.box(0,-13,1.4,2.8,12,1,iron);a2.cone(0,-7.4,2.2,.8,5,edge,4);for(const x of [-2,2])a2.cone(x,-5,-1.8,.6,3.6,edge,4);a2.box(0,-21,1.4,6,3,11,iron);a2.cone(0,-20.4,6.9,2.6,1.8,edge,4,.78);a2.box(0,-20,1.6,4.6,1.4,7,plate);
  knee.add(a2.mesh(metal));hip.add(a1.mesh(metal),knee);frame.add(hip);thigh.push(hip);shin.push(knee);}
 // Waist, ribbed armour and a chest much wider than the hips.
 body.limb([[0,36,0,6],[0,42,0,5.8],[0,49,.3,7.8],[0,57,.6,10],[0,63,.2,9],[0,66,0,6]],plate,12);for(const y of [39,42,45,48])body.column(0,y,0,6.5+(y-39)*.15,1,iron,12);body.column(0,37,0,7,1.8,edge,12);
 for(const s of [-1,1])for(let i=0;i<4;i++){body.add(body.cube(),s*(3+i*.6),51+i*3.4,8.2+i*.2,4.6,2.2,1,i%2?iron:plate,s*.3,.2,s*.2);body.add(body.cube(),s*(3+i*.6),51+i*3.4,-7.4-i*.2,5,2.2,1,i%2?plate:iron,s*-.3,-.2,s*.2);}
 // The long skirt of hanging plates, three rows, reaching below the knees.
 for(let row=0;row<3;row++){const n=12+row*2,top=36-row*7,len=11+row*3,r=7+row*1.1;for(let i=0;i<n;i++){const a=i/n*6.283+row*.2,x=Math.sin(a)*r,z=Math.cos(a)*r;body.add(body.cube(),x,top-len/2,z,3.4,len,.7,row%2?plate:iron,a,Math.cos(a)*-.12,Math.sin(a)*.12);body.cone(x*1.02,top-len-2.6,z*1.02,1.4,2.8,row%2?iron:plate,4,a);}}
 // Pauldrons of layered shells, each carrying rising blades.
 for(const s of [-1,1]){for(let i=0;i<3;i++){const y=64-i*3.2,r=7.4-i*.6;body.limb([[s*(9+i*1.2),y,-3,r*.6],[s*(14+i*.8),y+.8,0,r],[s*(18+i*.4),y-1,2,r*.5]],i%2?plate:iron,10);}for(let i=0;i<6;i++){const f=i/5;blade(body,s*(9+f*11),68-f*2.4,-5+f*9,1.4,7+Math.sin(f*3.14)*9,.5,edge,0,s*-(.1+f*.34));}for(let i=0;i<3;i++)body.cone(s*(19+i),60-i*3,3,.9,5,edge,4);}
 // Neck, helm with cheeks drawn to a point, and a narrow slit with no eyes to see.
 body.column(0,66,0,3.3,3.4,iron,9);body.limb([[0,69,.1,3.4],[0,72.4,.2,4.1],[0,76,0,3.6],[0,79,-.3,2.4]],plate,10);body.limb([[0,70,3,2.4],[0,67,3.8,1.6],[0,64.6,4.2,.3]],plate,7);
 for(const s of [-1,1])body.add(body.cube(),s*.5,72.6,4.1,1.4,1,.5,iron,0,0,s*.3);glow.box(0,73,4.5,3.8,.32,.1,'#7a2408');
 for(let i=0;i<13;i++){const f=(i-6)/6,a=f*1.75,x=Math.sin(a)*3.9,z=Math.cos(a)*3.9-.2,h=10+(1-f*f)*17;blade(body,x,76,z,1,h,.4,i%2?edge:'#4a4e58',a,0,-f*.13);}
 for(let i=0;i<6;i++){const a=2.4+i*.3;blade(body,Math.sin(a)*3.4,76,Math.cos(a)*3.4,.9,8+(i%2)*4,.4,'#4a4e58',a);}
 // The empty hand, its gauntlet a set of long claws.
 const claws=(k,x,y,z,r)=>{k.ball(x,y,z,r,iron);for(const f of [-1,-.35,.35,1])k.limb([[x+f*r*.7,y-r*.2,z+r*.5,r*.32],[x+f*r*.85,y-r*1.1,z+r*1.05,r*.26],[x+f*r*.8,y-r*2.4,z+r*.9,r*.16],[x+f*r*.7,y-r*3.5,z+r*.25,.05]],edge,5);};
 const shoulderL=new T.Group();shoulderL.position.set(-15,62,0);off.limb([[0,0,0,3.4],[-1,-11,.6,2.9],[-1.4,-22,3,2.5]],plate,9);for(const y of [-5,-8,-14,-18])off.column(-.8,y,.6,3.1,.9,iron,9);off.cone(-1.2,-22,-1.2,1.1,6,edge,4);claws(off,-1.6,-25,4,2.7);shoulderL.add(off.mesh(metal));frame.add(shoulderL);
 // The mace hand, the Ring on it, and the great flanged mace.
 arm.limb([[0,0,0,3.4],[1.5,-11,1,2.9],[1,-20,5,2.6]],plate,9);for(const y of [-5,-8])arm.column(.6,y,.4,3.1,.9,iron,9);arm.cone(1.3,-19,.6,1.1,6,edge,4);arm.ball(1,-23,6.4,3,iron);for(const f of [-1,-.33,.33,1])arm.limb([[1+f*2,-25,8.4,.8],[1+f*2,-26.5,8.6,.7],[1+f*1.8,-27,6.4,.4]],edge,5);
 arm.column(.5,-25.4,8.4,.75,.5,'#ffcf5a',8);
 arm.limb([[1,4,-24,.95],[1,-24,6.6,.95],[1,-50,34,1]],iron,7);arm.limb([[1,4,-24,1.4],[1,3,-26,1.8]],edge,6);
 const headAt=[1,-52,36];arm.limb([[headAt[0],headAt[1]+3,headAt[2]-3,2.6],[headAt[0],headAt[1],headAt[2],4.8],[headAt[0],headAt[1]-6,headAt[2]+6,3.8],[headAt[0],headAt[1]-11,headAt[2]+11,1]],iron,8);
 for(let i=0;i<8;i++){const a=i/8*6.283,cx=Math.cos(a),cy=Math.sin(a);arm.add(arm.cube(),headAt[0]+cx*5,headAt[1]-2+cy*3.6,headAt[2]+2+cy*-3.6,cx*cx*8+1,6.5,7,edge,0,a*.0,0);arm.cone(headAt[0]+cx*10,headAt[1]+1+cy*3.6,headAt[2]+4-cy*3.6,1,5,edge,4);}
 const shoulder=new T.Group();shoulder.position.set(15,62,0);shoulder.add(arm.mesh(metal));frame.add(shoulder);frame.add(body.mesh(metal));const lit=glow.mesh(glowing);lit.castShadow=false;lit.receiveShadow=false;frame.add(lit);
 root.traverse(n=>{if(n.isMesh&&n!==lit)n.castShadow=true;});
 // Slow, heavy steps: the whole weight comes down on each foot, and the mace swings with it.
 return {root,animate(step){const a=Math.sin(step),b=-a;thigh[0].rotation.x=a*.34;thigh[1].rotation.x=b*.34;shin[0].rotation.x=Math.max(0,Math.sin(step-1.3))*.62;shin[1].rotation.x=Math.max(0,Math.sin(step+Math.PI-1.3))*.62;frame.position.y=-Math.abs(a)*1.6;frame.rotation.z=a*.03;frame.rotation.y=a*.05;frame.rotation.x=.03;shoulder.rotation.x=.2+b*.09;shoulderL.rotation.x=a*.13;}};
}
export function buildBlackGate(material){
 const k=new Kit(),g=new Kit(),black='#6e6459',iron='#463f39';
 for(const s of [-1,1]){
  k.crag(s*96,0,0,46,52,30,'#544a41',s>0?1:2);
  k.cyl(s*42,0,0,13,19,96,black,10);k.cyl(s*42,96,0,16,13,8,iron,10);k.cone(s*42,104,0,14,44,iron,10);
  for(let i=0;i<4;i++)g.box(s*42,22+i*19,17.2-i*1.4,1.5,6,.5,'#ff7a2a');
  k.box(s*92,0,0,60,48,12,black);for(let i=0;i<7;i++)k.cone(s*(66+i*9),48,0,3.4,12+(i%2)*6,iron,5);
  // The leaves stand open: nothing here keeps a carrier out.
  k.box(s*23,0,-9,2,50,17,iron,s*.5);for(let i=0;i<4;i++)k.cone(s*(21.6+i*1.1),50,-15+i*4,1.6,9,iron,5);
 }
 k.box(0,54,0,60,8,12,black);for(let i=0;i<9;i++)k.cone(-24+i*6,62,0,2.6,14,iron,5);
 const group=new T.Group();group.add(k.mesh(material));const lit=g.mesh(glowing);lit.castShadow=false;lit.receiveShadow=false;group.add(lit);return group;
}

const flameTexture=()=>{const n=document.createElement('canvas');n.width=64;n.height=128;const c=n.getContext('2d'),f=c.createRadialGradient(32,88,2,32,84,36);f.addColorStop(0,'#fff0b0ff');f.addColorStop(.3,'#ffb030ee');f.addColorStop(.62,'#f0500f99');f.addColorStop(1,'#a0200000');c.fillStyle=f;c.beginPath();c.moveTo(32,2);c.bezierCurveTo(44,40,64,62,62,92);c.bezierCurveTo(60,118,4,118,2,92);c.bezierCurveTo(0,62,20,40,32,2);c.fill();const t=new T.CanvasTexture(n);t.colorSpace=T.SRGBColorSpace;return t;};
const lavaTexture=()=>{const n=document.createElement('canvas');n.width=n.height=256;const c=n.getContext('2d');c.fillStyle='#e8540f';c.fillRect(0,0,256,256);let s=4711;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;for(let i=0;i<60;i++){c.fillStyle=i%3?'#2a120a':'#120806';c.beginPath();const x=rnd()*256,y=rnd()*256,r=6+rnd()*22;c.moveTo(x+r,y);for(let a=1;a<9;a++)c.lineTo(x+Math.cos(a*.785)*r*(.55+rnd()*.6),y+Math.sin(a*.785)*r*(.55+rnd()*.6));c.fill();}for(let i=0;i<34;i++){c.fillStyle='#ffc44a';c.fillRect(rnd()*256,rnd()*256,2+rnd()*12,1+rnd()*3);}const t=new T.CanvasTexture(n);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;return t;};

// The Balrog of Moria: shadow and flame in the chasm beside the bridge of Khazad-dûm. Scenery only.
export function buildBalrog(skin,puff){
 const root=new T.Group(),stage=new T.Group();root.add(stage);
 const pit=new Kit(),g=new Kit();
 // The chasm: broken rock around a lake of fire, the slender bridge in front.
 for(let i=0;i<20;i++){const a=i/20*6.283,x=Math.cos(a)*(50+(i%3)*4),z=Math.sin(a)*(42+(i%2)*4);pit.crag(x,0,z,8+(i*7%5)*2,5+(i*5%6)*2.4,8+(i*3%4)*2,'#3a3530',i);}
 for(let i=0;i<13;i++){const t=i/12,x=-62+t*124,y=4+Math.sin(t*Math.PI)*12;pit.box(x,y,40,10.4,1.8,6.5,'#4a4640',Math.PI/2*0);pit.box(x,y-2.4,40,10.4,2.4,4,'#37332e');}
 const lava=lavaTexture();lava.repeat.set(1.6,1.4);
 const lake=new T.Mesh(new T.CircleGeometry(1,28),new T.MeshBasicMaterial({map:lava}));lake.rotation.x=-Math.PI/2;lake.scale.set(52,44,1);lake.position.y=.45;stage.add(pit.mesh(skin),lake);
 const body=new T.Group();body.position.set(0,-2,-6);body.scale.setScalar(1.13);stage.add(body);
 const k=new Kit(),hide='#1d1612',dim='#120d0a';
 // Hunched torso, hooves sunk in the fire, arms like a bull's forelegs.
 k.limb([[0,34,-3,11],[0,44,-3,15],[0,58,-1,18],[0,70,3,20],[0,79,7,13],[0,86,11,8]],hide,14);
 for(const s of [-1,1]){
  k.limb([[s*9,42,-2,10],[s*15,30,6,9],[s*17,20,2,6],[s*15,8,-6,4.6],[s*15,1,3,5.6]],hide,10);
  k.limb([[s*14,74,3,10.5],[s*27,70,5,9],[s*36,58,10,6.4],[s*42,46,18,4.6],[s*44,40,23,5]],hide,10);
  for(const f of [-1,0,1])k.limb([[s*(44+f*2),39,24,1.6],[s*(45+f*3.4),34,27+f,1.1],[s*(46+f*4),30,28+f,.2]],dim,5);
  // Long bull's horns, sweeping out and up.
  k.limb([[s*5.5,93,8,3.4],[s*15,98,7,2.8],[s*25,106,10,2.1],[s*30,120,15,1.2],[s*27,134,19,.2]],'#14100e',8);
  k.limb([[s*4,96,7,1.8],[s*9,104,4,1.3],[s*10,113,3,.2]],'#14100e',6);
  // Spines down the back.
  for(let i=0;i<5;i++)k.cone(s*(5+i*.4),48+i*8,-15-(i%2)*2,1.8,8,'#14100e',5);
 }
 // The head: a heavy brow, a long jaw, burning eyes and mouth.
 k.limb([[0,85,11,7.4],[0,91,13,8.6],[0,94,17,7.4],[0,90,24,4.6],[0,86,27,2.6]],hide,10);k.limb([[0,84,14,5],[0,82,21,4],[0,82,26,2.2]],dim,8);
 for(const s of [-1,1]){g.ball(s*4.2,92.6,21.4,1.5,'#fff0a8');g.ball(s*4.4,92.4,21,1.9,'#ff8a2a');}
 g.box(0,84.4,24.6,5,1.2,3,'#ff9a3a');for(const s of [-1,1])k.cone(s*2.4,82.4,26,.5,3,'#d8cfae',5);
 // Charred hide, split by cracks with molten rock shining through.
 const crack=(points,r=.42)=>g.limb(points.map(q=>[q[0],q[1],q[2],r]).concat([[points[points.length-1][0],points[points.length-1][1],points[points.length-1][2],.05]]),'#ff6a18',4);
 {let seed=91;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647,core=[[34,-3,11],[44,-3,15],[58,-1,18],[70,3,20],[79,7,13]],at=y=>{for(let i=0;i<core.length-1;i++)if(y<=core[i+1][0]){const f=(y-core[i][0])/(core[i+1][0]-core[i][0]);return [core[i][1]+(core[i+1][1]-core[i][1])*f,core[i][2]+(core[i+1][2]-core[i][2])*f];}return [core[4][1],core[4][2]];};
  for(let n=0;n<26;n++){let a=rnd()*6.283,y=36+rnd()*34;const line=[];for(let i=0;i<5;i++){const [z,r]=at(y);line.push([Math.sin(a)*r*1.02,y,z+Math.cos(a)*r*1.02]);a+=(rnd()-.5)*.5;y+=2+rnd()*4;}crack(line,.34+rnd()*.3);}
  for(const s of [-1,1]){for(let n=0;n<7;n++){const t=rnd()*.8,f=rnd()*.5,off=s*(rnd()*5-2.5);crack([[s*(14+t*30)+off*.2,74-t*34,3+t*20+3.4],[s*(16+t*30)+off*.3,70-t*34,4+t*20+3],[s*(18+t*30),66-t*34,5+t*20+2.4]],.3+f*.3);}for(let n=0;n<7;n++){const t=rnd(),y=42-t*38;crack([[s*(10+t*6),y,8-t*8],[s*(11+t*6),y-3,8-t*7],[s*(12+t*6)+rnd(),y-7,8-t*6]],.32);}}}
 g.ball(0,62,18.4,2.6,'#ff7a1a');g.ball(0,66,19,1.5,'#ffd27a');
 // Spikes over the shoulders and down the neck, ribs of fire, claws on the knuckles.
 for(const s of [-1,1]){for(let i=0;i<4;i++)k.cone(s*(16+i*3),76+i*1.5,-2-i*2,2.2-i*.3,9-i,'#14100e',5);for(let i=0;i<4;i++)crack([[s*6,48+i*6,16-i*.5],[s*12,47+i*6,13-i*.5],[s*16,45+i*6,8-i*.5]],.36);for(const f of [-1,1])k.cone(s*(43+f*2),36,26+f,.7,4,'#2a1a12',4);}
 for(let i=0;i<6;i++)k.cone(0,90-i*7,4-i*2.4,2.4-i*.25,7,'#14100e',5);
 const bodyMesh=k.mesh(skin),glow=g.mesh(glowing);glow.castShadow=false;glow.receiveShadow=false;body.add(bodyMesh,glow);
 // Wings of shadow: bones, and a torn dark skin between them.
 const wingMaterial=new T.MeshStandardMaterial({color:'#17100c',roughness:.95,side:T.DoubleSide,transparent:true,opacity:.92,depthWrite:true});
 const wing=side=>{
  const w=new T.Group();w.position.set(side*14,80,-8);const bones=new Kit();
  const arm=[[0,0,0,4],[side*20,15,-5,3.2],[side*42,25,-9,2.4]],tips=[[side*72,-2,-10],[side*62,-26,-8],[side*44,-40,-6],[side*24,-44,-4],[side*8,-40,-2]];
  bones.limb(arm,'#17110e',7);bones.limb([[side*42,25,-9,2.2],[side*50,34,-10,1.4],[side*56,44,-12,.2]],'#14100e',5);
  for(const q of tips)bones.limb([[side*42,25,-9,1.8],[(side*42+q[0])/2+side*2,(25+q[1])/2+4,(q[2]-9)/2,1.1],[q[0],q[1],q[2],.25]],'#17110e',5);
  const v=[],knuckle=[side*42,25,-9],root=[0,0,0];const tri=(a,b,c)=>v.push(...a,...b,...c);
  tri(root,knuckle,tips[4]);
  for(let i=0;i<tips.length-1;i++){const a=tips[i],b=tips[i+1],mid=[(a[0]+b[0])/2+side*(i%2?3:-2),(a[1]+b[1])/2+9,(a[2]+b[2])/2];tri(knuckle,a,mid);tri(knuckle,mid,b);}
  const skinGeometry=new T.BufferGeometry();skinGeometry.setAttribute('position',new T.Float32BufferAttribute(v,3));skinGeometry.computeVertexNormals();
  const membrane=new T.Mesh(skinGeometry,wingMaterial);membrane.castShadow=true;w.add(bones.mesh(skin),membrane);body.add(w);return w;
 };
 const wings=[wing(-1),wing(1)];
 // The whip of many thongs and the sword of flame.
 const whip=[];let parent=new T.Group();parent.position.set(44,38,25);parent.rotation.z=-1.1;body.add(parent);
 for(let i=0;i<18;i++){const seg=new T.Group();seg.position.set(i?7:0,0,0);const n=new Kit(),t=1.5*(1-i/20);n.box(3.5,-t/2,0,7.4,t,t,i%3?'#ffb23a':'#ff7a1a');const mesh=n.mesh(glowing);mesh.castShadow=false;seg.add(mesh);parent.add(seg);whip.push(seg);parent=seg;}
 const blade=new Kit();blade.limb([[-44,38,25,2.6],[-46,54,31,2.8],[-47,72,36,2.2],[-47,92,40,1.2],[-46,106,42,.15]],'#ffb23a',6);blade.box(-44,37,23.5,12,1.6,2,'#3a2a1c');const bladeMesh=blade.mesh(glowing);bladeMesh.castShadow=false;body.add(bladeMesh);
 // Living fire, which is drawn last and moves with every frame.
 const map=flameTexture(),flames=[],shadows=[];
 const flame=(owner,x,y,z,size,tall=1.8)=>{const m=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false,blending:T.AdditiveBlending,fog:false}));m.position.set(x,y,z);owner.add(m);flames.push({m,x,y,z,size,tall,phase:flames.length*1.7});};
 for(let i=0;i<9;i++)flame(body,(i%2?-1:1)*(2+i*.7),50+i*6,-12+i*.9,9+(i%3)*3);
 for(const [x,z] of [[-5,10],[0,6],[5,10],[-8,8],[8,8]])flame(body,x,99,z,10,2.2);
 for(let i=0;i<6;i++)flame(body,(i%2?-1:1)*(3+i),92-i*7,2-i*2.4,8,2.2);
 // Fire runs along every bone of the wings and blows from their tips, as in the bridge scene.
 wings.forEach((w,i)=>{const side=i?1:-1;for(const [x,y,z,size] of [[10,8,-2,7],[22,15,-5,8],[34,21,-8,8],[42,25,-9,10],[50,34,-10,7],[57,12,-9,9],[52,0,-9,8],[50,-14,-8,9],[60,-6,-9,7],[70,-2,-10,8],[34,-14,-6,8],[26,-30,-5,8],[44,-34,-6,8],[24,-40,-4,7],[8,-36,-2,7]])flame(w,side*x,y,z,size,2.1);});
 for(const s of [-1,1]){flame(body,s*16,80,1,10);flame(body,s*26,76,3,7);flame(body,s*44,42,24,8);flame(body,s*15,5,0,13,2.4);}
 for(const f of [[-46,60,32],[-47,76,37],[-47,92,40]])flame(body,f[0],f[1],f[2],7,2.4);
 for(let i=0;i<10;i++){const a=i*2.399,r=10+i*3.6;flame(stage,Math.cos(a)*r,5,Math.sin(a)*r*.82,13+(i%3)*5,2.2);}
 if(puff)for(let i=0;i<10;i++){const m=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#0d0a09',transparent:true,opacity:.42,depthWrite:false,fog:false})),s=i%2?1:-1;m.position.set(s*(18+i*5),78+(i%3)*14-i*2,-16);m.scale.setScalar(30+i*2);body.add(m);shadows.push({m,x:m.position.x,y:m.position.y,phase:i*1.3});}
 const light=new T.PointLight('#ff6a2a',5,340,1.25);light.position.set(0,46,16);root.add(light);
 const animate=t=>{
  const s=t*.001;
  // Slow, heavy breathing: the chest swells and the fire in it brightens.
  const breath=Math.sin(s*.85);body.scale.set(1.13*(1+breath*.022),1.13*(1+breath*.01),1.13*(1+breath*.028));
  body.rotation.y=Math.sin(s*.4)*.16;body.position.y=-2+Math.sin(s*1.1)*.9;
  wings[0].rotation.y=.3+Math.sin(s*.9)*.14;wings[1].rotation.y=-.3-Math.sin(s*.9)*.14;
  whip.forEach((w,i)=>{w.rotation.z=Math.sin(s*2.1-i*.42)*(.1+i*.012)+(i<4?-.03:.02);w.rotation.y=Math.cos(s*1.3-i*.35)*.12;});
  lava.offset.x=s*.008;lava.offset.y=s*.005;
  for(const f of flames){const n=Math.sin(s*6.1+f.phase)*.5+Math.sin(s*11.3+f.phase*2)*.3,w=f.size*(1+n*.18);f.m.scale.set(w,f.size*f.tall*(1+n*.32),1);f.m.position.set(f.x+Math.sin(s*2.2+f.phase)*.8,f.y+f.size*f.tall*.32,f.z);f.m.material.opacity=.34+n*.16;}
  for(const q of shadows){q.m.position.x=q.x+Math.sin(s*.5+q.phase)*3;q.m.position.y=q.y+Math.sin(s*.37+q.phase)*3;}
  light.intensity=4.6+breath*.9+Math.sin(s*7)*.8+Math.sin(s*13)*.4;
 };
 return {root,stage,animate};
}

// Everything that stands on the ground of a place, so that nothing else grows through it.
export function groundFootprints(id){const k=new Kit(),g=new Kit();k.record=[];landmarks[id](k,g,{smoke:[],embers:[],spray:[],leaves:[]});roofs[id](k,g);closeDetails[id](k,g);return k.record.filter(q=>q[2]-q[0]<620);}
