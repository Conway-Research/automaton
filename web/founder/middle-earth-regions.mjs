// What makes each region of the 3D Middle-earth itself: landmarks, mood, close-up details and the Balrog of Moria.
// Pure drawing. No data from the server and no server access.
import * as T from './vendor/three.module.min.js';
import {Kit,solid,glowing,HALL} from './middle-earth-3d.mjs';
const {half:S,height:H}=HALL;
const crate=(k,x,z,s=10)=>{k.box(x,0,z,s,s,s,'#8a6636');k.box(x,s*.45,z,s+.3,1,s+.3,'#5e4322');};
const barrel=(k,x,z)=>{k.column(x,0,z,5,13,'#6a4a22');k.column(x,3,z,5.2,.8,'#2f2010');k.column(x,9,z,5.2,.8,'#2f2010');k.column(x,13,z,4.6,.3,'#a57f46');};
const table=(k,x,z,w,d,color='#94703f')=>{k.box(x,12,z,w,2,d,color);for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]])k.column(x+a*(w/2-2),0,z+b*(d/2-2),1.2,12,'#5e4322');};
const rock=(k,x,z,r,color='#6c675e')=>{k.rock(x,r*.3,z,r,r*.72,r*.9,color,Math.abs(Math.round(x*7+z))+1);};
const lantern=(k,g,x,z,h=20)=>{k.column(x,0,z,.8,h,'#3a2a16');g.ball(x,h+2,z,2.2,'#ffe9a8');};
const stones=(k,n,R,color,y=0)=>{for(let i=0;i<n;i++){const a=i/n*6.283,s=2+(i*7%5)*.7;k.box(Math.cos(a)*(R+(i%3)*5),y,Math.sin(a)*(R+(i%3)*5),s*2,s,s*1.6,color,a);}};
const pine=(k,x,z,s=1,c='#1f4a2c')=>{k.column(x,0,z,2*s,10*s,'#3a2a18',6);k.cone(x,8*s,z,12*s,22*s,c,7);k.cone(x,20*s,z,8*s,18*s,'#2a6036',7);};
// A dark doorway set into the south side of a covering shape.
const gateway=(k,g,w,h,z,stone,light)=>{k.box(-w/2-4,0,z,8,h,10,stone);k.box(w/2+4,0,z,8,h,10,stone);k.box(0,h,z,w+16,8,10,stone);k.box(0,0,z-1,w,h,6,'#0d0c0a');if(light)g.box(0,0,z+2.2,w*.7,h*.7,.5,light);};

// Landmarks stand behind the hall and name a region from far away.
// A proper house: stone footing, timbered walls, pitched roof, door, windows and chimney.
function house(k,g,x,z,w,d,h,wall,roof,ry=0,frame='#3a2a18'){
 k.local(x,z,ry,()=>{
  k.box(0,0,0,w+1.4,3,d+1.4,'#5f5a4d');k.box(0,3,0,w,h-3,d,wall);
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
 scouts(k,g,fx){const stone='#837f6e';for(const [x,z,sx,sy,sz,seed] of [[-110,-190,52,190,70,1],[-140,-300,120,240,70,2],[120,-310,190,260,90,3],[336,-90,92,210,150,1]])k.crag(x,0,z,sx,sy,sz,'#7a7666',seed);k.box(222,0,18,146,32,15,stone);for(let i=0;i<20;i++)k.box(153+i*7.2,32,25,4.4,4.5,2.6,'#9a9684');k.box(222,31,14,146,1.5,8,'#716d5e');for(let i=0;i<6;i++)k.box(168+i*25,0,27,7,22,4,'#716d5e');arch(k,222,0,26,16,15,'#14120f',.8);k.box(222,1,26.5,12,1,.4,'#54565a');for(let i=0;i<5;i++)k.box(217+i*2.5,1,26.8,.7,10,.5,'#3a3c40');fx.smoke.push([14,H+56,-10]);},
 // Isengard: the black tower of Orthanc in the ring of stone, fires and smoke from the pits.
 isengard(k,g,fx){
  for(const [x,z] of [[-180,-120],[180,-120],[-210,20],[210,20]]){k.column(x,0,z,12,70,'#2c2a26',8);k.column(x,70,z,14,5,'#17150f',8);fx.smoke.push([x,76,z]);g.column(x,0,z+13,6,14,'#d85a1a');}
  for(let i=0;i<6;i++){const a=i*1.05;k.box(Math.cos(a)*205,0,Math.sin(a)*205*.6-40,30,3,14,'#26231e',a);}
  fx.embers.push([0,10,-160]);
 },
 // Rivendell: pale houses on terraces in the deep valley, falling waters behind them.
 library(k,g,fx){
  for(const [x,z,h] of [[-110,-150,40],[-40,-190,56],[50,-185,62],[120,-150,40]]){k.box(x,0,z,50,h,44,'#e4dcc2');k.roof(x,h,z,60,54,26,'#8a6f4a');for(let i=0;i<3;i++)k.column(x-18+i*18,0,z+24,2,h-4,'#f1ebd6',8);}
  k.column(30,0,-140,10,120,'#e4dcc2',10);k.cone(30,120,-140,14,50,'#8a6f4a',8);
  for(const x of [-90,0,96]){for(const [a,w] of [[-5,4],[0,7],[5,3.4]])g.box(x+a,0,-226,w,118+Math.abs(a)*3,2,a?'#c9dfe6':'#e6f1f4');g.box(x,0,-205,44,3,30,'#a9c9d4');fx.spray.push([x,6,-200]);}
  k.crag(-170,40,-262,130,170,60,'#6f7270',1);k.crag(170,40,-266,130,160,60,'#696c6a',2);k.crag(0,70,-282,190,210,60,'#6c6f6d',3);
 },
 // Lothlórien: mallorn giants carrying the talans, lamps in the golden leaves.
 lorien(k,g,fx){for(const [x,z,s] of [[-110,-150,1.8],[0,-200,2.6],[120,-160,2],[-200,-40,1.5],[200,-40,1.5]]){k.cyl(x,0,z,5*s,11*s,120*s,'#d9dbc8',10);k.canopy(x,124*s,z,27*s,['#5f5224','#6e5f28','#54481f'],Math.round(x+z)&255||1,.55);for(const [a,len] of [[.5,30],[2.6,28],[4.6,31]])k.limb([[x,98*s,z,3*s],[x+Math.cos(a)*len*.55*s,110*s,z+Math.sin(a)*len*.55*s,2*s],[x+Math.cos(a)*len*s,122*s,z+Math.sin(a)*len*s,.5*s]],'#c9cbb8',6);k.column(x,84*s,z,15*s,1.6,'#b9b59a',14);for(let i=0;i<10;i++){const a=i*.628;k.column(x+Math.cos(a)*14*s,85.6*s,z+Math.sin(a)*14*s,.5,5,'#d8d0a8',5);}for(let i=0;i<6;i++){const a=i*1.05;g.ball(x+Math.cos(a)*13*s,92*s,z+Math.sin(a)*13*s,1.5,'#fff6c4');}fx.leaves.push([x,120*s,z]);}},
 // Mirkwood: the cave gate of the Woodland Realm under the dark canopy, cobwebs between the trees.
 council(k,g){k.crag(0,0,-210,170,110,70,'#5a5546',1);gateway(k,g,44,50,-116,'#3e3020','#c9e46a');for(const [x,z,s] of [[-150,-100,2],[150,-100,2],[-90,-170,2.4],[90,-170,2.4],[-190,0,1.8],[190,0,1.8]]){k.cyl(x,0,z,6*s,10*s,70*s,'#2a2118',7);k.canopy(x,80*s,z,21*s,['#102418','#13291b','#0f2016'],Math.round(x*3+z)&255||1);}for(let i=0;i<6;i++){k.box(-170+i*68,44+(i%2)*10,-60,44,.4,.4,'#d8d8d0',.4*i);k.box(-170+i*68,50,-60,.4,20,.4,'#d8d8d0');}},
 // Moria: the mountain with the Doors of Durin, glowing with their star and trees.
 forge(k,g,fx){for(const [a,b,sx,sy,seed] of [[-110,-170,90,92,1],[110,-170,90,98,2],[0,-190,130,124,3]])k.crag(a,0,b,sx,sy,50,'#7f7a70',seed);k.box(0,0,-140,110,92,18,'#2c2a26');k.box(0,0,-130,76,74,4,'#17151a');for(const x of [-16,16])g.box(x,6,-127.5,1,56,.4,'#bfe9ff');g.box(0,62,-127.5,34,1,.4,'#bfe9ff');g.ball(0,48,-127.5,3,'#ffffff');for(const a of [-1,1])for(let i=0;i<4;i++)g.ball(a*10,14+i*8,-127.5,1.2,'#bfe9ff');fx.embers.push([0,6,-110]);},
 // Minas Tirith: seven white tiers, the great prow and the Tower of Ecthelion with its banner.
 gate(k,g){for(let i=0;i<11;i++){const a=-2.8+i*.56,hx=Math.cos(a)*222,hz=Math.sin(a)*180;if(Math.abs(hx)<82&&hz>0)continue;house(k,g,hx,hz,36,28,24+(i%3)*8,'#cbc8ba','#54524c',-a+1.57,'#8f8c80');}},
 // Hobbiton: round doors in the green hills, gardens, chimneys, the party tree.
 messengers(k,g,fx){for(const [x,z,r,door] of [[-110,-150,56,'#2f6a3a'],[10,-180,74,'#2f6a3a'],[124,-148,54,'#a02a14'],[-210,-60,44,'#8a6f22'],[210,-50,46,'#2f5a7a']]){k.hill(x,0,z,r,.78,'#5d8a42',Math.abs(x));k.disc(x,r*.28,z+r*.9,r*.3,2,'#5d421f');k.disc(x,r*.28,z+r*.94,r*.24,2,door);k.ball(x,r*.28,z+r*.98,1.8,'#e4b24a');k.disc(x-r*.56,r*.3,z+r*.74,r*.13,2,'#f0d67c');k.disc(x+r*.56,r*.3,z+r*.74,r*.13,2,'#f0d67c');k.column(x+r*.4,r*.6,z-r*.2,3,18,'#9a7a4a',6);fx.smoke.push([x+r*.4,r*.6+18,z-r*.2]);}k.cyl(-40,0,-205,5,9,44,'#4a3218',8);k.canopy(-40,58,-205,22,['#26401f','#2d4a26'],7);},
 // Erebor: the Lonely Mountain with its great gate and the town of Dale at its foot.
 treasury(k,g,fx){for(const [a,b,sx,sy,seed] of [[-100,-170,88,96,1],[100,-170,88,90,2],[0,-190,130,132,3]])k.crag(a,0,b,sx,sy,50,'#837d6e',seed);gateway(k,g,62,74,-118,'#6f6a58','#ffb23a');k.box(0,0,-108,120,4,40,'#6f6a58');for(const [x,z,s,r] of [[-180,-60,1,.2],[-150,10,.9,-.3],[180,-60,1,-.2],[160,10,.9,.4],[-220,-10,.8,.5],[220,-20,.8,-.5],[-190,60,.9,0],[196,50,.85,.3]]){house(k,g,x,z,34*s,28*s,22*s,'#a89878','#5e3324',r);fx.smoke.push([x+8*s,44*s,z-6*s]);}},
 // Osgiliath: the ruined city on the Anduin, broken domes and arches.
 observatory(k,g){k.box(0,0,-170,120,44,70,'#a9a692');k.dome(0,44,-170,50,'#c5c2ae');for(let i=0;i<9;i++)k.column(-160+i*40,0,-130+(i%2)*20,6,20+(i*7%5)*14,'#b9b6a4',8);for(const [x,z] of [[-170,-40],[170,-50]]){k.box(x,0,z,14,34,14,'#9c9a88');k.box(x+36,0,z,14,28,14,'#8f8d7c');k.box(x+18,26,z,50,6,14,'#9c9a88');k.rock(x+60,0,z,14,8,10,'#8a8775',x);}for(let i=0;i<14;i++)k.box(-190+(i*29)%380,0,-200+(i*17)%90,8+(i%4)*4,4+(i%3)*2,7,'#8a8775',i);},
};

// Where painted crowns sit on the great trees of a region: outside, and over a hall (those thin out when zooming in).
export const regionLeaves={
 lorien:{kind:'gold',outside:[[-110,-150,1.8],[0,-200,2.6],[120,-160,2],[-200,-40,1.5],[200,-40,1.5]].map(([x,z,s])=>[x,128*s,z,33*s]),roof:[[-70,-70,62],[70,-70,66],[-70,70,60],[70,70,58],[0,0,76],[0,-100,48],[-100,0,48],[100,0,48],[0,100,46]].map(([x,z,r])=>[x,H+40,z,r*1.02])},
 council:{kind:'dark',outside:[[-150,-100,2],[150,-100,2],[-90,-170,2.4],[90,-170,2.4],[-190,0,1.8],[190,0,1.8]].map(([x,z,s])=>[x,84*s,z,34*s]),roof:[[-90,60,1.6],[90,60,1.6],[0,-60,2],[-70,-20,1.4],[70,-20,1.4],[-112,-40,1.5],[112,-48,1.5]].map(([x,z,s])=>[x,68*s,z,36*s])},
 messengers:{kind:'oak',outside:[[-40,62,-205,36]],roof:[[-30,104,-40,23],[-92,S*.85,S*1.3,14],[94,S*.85,S*1.28,15],[-132,S*.85,S*1.02,17],[136,S*.85,S*.98,16]].map(([x,y,z,r],i)=>i?[x,r*.8,z,r]:[x,y,z,r])},
};
// Parts that several buildings share.
const arch=(k,x,y,z,w,h,color,thick=.8)=>{k.box(x,y,z,w,h-w/2,thick,color);k.disc(x,y+h-w/2,z,w/2,thick,color);};
const spire=(k,x,z,r,h,wall,top,band='#a99468')=>{k.column(x,0,z,r,h,wall,14);k.cone(x,h,z,r+3,r*3.4,top,14);k.column(x,h-12,z,r+1.2,1.6,band,14);k.column(x,h*.55,z,r+.7,1.2,band,14);for(let i=0;i<4;i++){const a=i*1.57+.78;k.box(x+Math.cos(a)*r,h*.72,z+Math.sin(a)*r,2,8,2,'#26241f',a);}};
// A carved stone gate on the south side of a mountain or hill, standing proud of the rock.
const stoneGate=(k,z,w,h,stone,inner)=>{k.box(0,0,z-16,w+40,h+18,30,stone);for(const s of [-1,1]){k.box(s*(w/2+7),0,z,12,h+4,10,stone);k.column(s*(w/2+7),h+4,z,7,5,stone,8);}k.box(0,h+3,z,w+30,8,12,stone);k.box(0,h+11,z-1,w+14,5,9,stone);arch(k,0,0,z+.2,w,h,inner,1);for(let i=0;i<5;i++)k.box(0,i*.9,z+7+(4-i)*3.4,w+32-i*5,.9,4,stone);};
// A dwarf king carved from the mountain beside the gate.
const dwarfStatue=(k,x,z,h,stone)=>{const q=h/100;k.box(x,0,z,44*q,12*q,34*q,stone);k.limb([[x,12*q,z,20*q],[x,40*q,z,23*q],[x,66*q,z,24*q],[x,78*q,z,15*q]],stone,12);k.limb([[x,78*q,z+1*q,11*q],[x,88*q,z+2*q,12*q],[x,94*q,z+1*q,8*q]],stone,10);k.cone(x,44*q,z+13*q,12*q,38*q,stone,8);for(const s of [-1,1]){k.limb([[x+s*20*q,70*q,z,8*q],[x+s*26*q,48*q,z+6*q,6*q],[x+s*8*q,38*q,z+18*q,5*q]],stone,8);}k.limb([[x,12*q,z+21*q,2.4*q],[x,50*q,z+21*q,2.4*q]],stone,6);k.box(x-16*q,46*q,z+21*q,32*q,14*q,3*q,stone);k.cone(x,94*q,z+1*q,9*q,12*q,stone,8);};

// The closed building, which melts away while zooming in. Each covers the hall in its region's way.
export const roofs={
 // The Hornburg: a great round wall of old stone, the keep within it and the tower above.
 scouts(k){const stone='#8a8674',dark='#716d5e',R=S*1.3;k.cyl(0,-2,0,R,S*1.38,H+6,stone,32);k.column(0,H+2,0,R+1.5,2,'#9a9684',32);for(let i=0;i<40;i++){const a=i/40*6.283;k.box(Math.sin(a)*(R+.5),H+4,Math.cos(a)*(R+.5),6,4.5,3,'#9a9684',a);}for(let i=0;i<16;i++){const a=(i+.5)/16*6.283;if(a<.55||a>5.73)continue;k.add(k.cylinder(3,5.5,H-6,6),Math.sin(a)*(R+3),(H-6)/2,Math.cos(a)*(R+3),1,1,1,dark);}k.column(0,H+2,0,R-3,1.2,dark,32);
  k.cyl(0,H+4,-16,S*.76,S*.86,28,stone,24);for(let i=0;i<26;i++){const a=i/26*6.283;k.box(Math.sin(a)*S*.76,H+32,-16+Math.cos(a)*S*.76,5,4,2.6,'#9a9684',a);}k.box(14,H+32,-10,58,20,40,'#8f8b79');k.gable(14,H+52,-10,62,44,15,'#6a5230');for(let i=0;i<5;i++){k.box(-10+i*12,H+37,10.2,3.2,9,.5,'#23211c');}k.box(14,H+66,-10,1.6,3,46,'#c9a23c');
  k.cyl(-44,H+32,-52,15,19,96,stone,14);k.column(-44,H+126,-52,18,3,'#9a9684',14);for(let i=0;i<14;i++){const a=i/14*6.283;k.box(-44+Math.sin(a)*17.5,H+129,-52+Math.cos(a)*17.5,4,4.5,3,'#9a9684',a);}for(const h of [52,76,100])k.box(-44,H+h,-33.2,3,10,.8,'#23211c');k.column(-44,H+129,-52,.7,30,'#3a2a18',6);k.box(-33,H+144,-52,20,12,.6,'#2f5a30');k.box(-33,H+147,-51.6,9,4,.3,'#e8e4d4');k.box(-29,H+150,-51.6,2.4,4,.3,'#e8e4d4');},
 // The foot of Orthanc: black many-sided rock rising into four horns.
 isengard(k){k.cyl(0,-2,0,S*1.26,S*1.46,H+10,'#47474e',12);k.cyl(0,H+8,0,S*.54,S*.72,34,'#3e3e44',12);k.cyl(0,H+42,0,S*.42,S*.54,190,'#35353b',12);for(let i=0;i<12;i++){const a=i/12*6.283;k.box(Math.cos(a)*S*.5,H+42,Math.sin(a)*S*.5,10,180,10,'#3c3c42',-a);}k.cyl(0,H+232,0,S*.36,S*.42,70,'#2e2e34',12);for(let i=0;i<4;i++){const a=i/4*6.283+.78;k.cone(Math.cos(a)*S*.27,H+300,Math.sin(a)*S*.27,13,74,'#2c2c31',5);}for(let i=0;i<10;i++){const a=i*1.1+.3;k.box(Math.cos(a)*S*.52,H+70+i*16,Math.sin(a)*S*.52,3.4,8,3.4,'#a06a24',a);}},
 // The house of Elrond: pale stone, tall arched windows, slender towers with slate roofs.
 library(k){const stone='#d8d0b6',pale='#e6dfc8',slate='#4a4a4e';k.box(0,H-4,0,S*2+8,14,S*2+8,stone);k.box(0,H+10,0,S*2+18,2.4,S*2+18,'#a99468');k.gable(0,H+12,0,S*2+18,S*2+24,44,slate);k.gable(0,H+12,S*.28,S*1.15,S*2+14,40,slate,Math.PI/2);for(const z of [S+11.5,-S-11.5])k.box(0,H+13,z,2,40,1,'#a99468');k.box(0,H+50,0,3,3,S*2+18,'#a99468');for(let i=-6;i<=6;i++){const x=i*17;arch(k,x,H-1,S+4.6,12,11,pale,1);arch(k,x,H,S+5.2,8.4,9,'#2c2a24',.6);k.column(x+8.5,H-4,S+5,1.4,16,pale,8);}for(let i=-3;i<=3;i++){if(i===0)continue;k.box(i*26,H+34,S*.6,12,14,12,stone);k.gable(i*26,H+48,S*.6,15,16,10,slate);arch(k,i*26,H+35,S*.6+6.2,7,10,'#2c2a24',.5);}for(const [a,b,r,h] of [[-S,-S,12,126],[S,-S,12,118],[-S,S,14,104],[S,S,14,110],[0,-S*.72,15,164],[-S*.45,-S*.86,9,136],[S*.5,-S*.86,9,128]])spire(k,a,b,r,h,pale,slate);for(const a of [-1,1]){k.box(a*S*.5,H+34,S*.1,S,3,5,stone);for(let i=0;i<5;i++)k.column(a*(S*.12+i*S*.19),H+37,S*.1,.9,8,stone,6);k.box(a*S*.5,H+45,S*.1,S,1.4,6,slate);}},
 lorien(k,g){for(const [a,b,w] of [[-92,-84,15],[88,-92,14],[-96,84,13],[94,88,14]]){k.cyl(a,0,b,w*.62,w,H+60,'#c9cbb8',10);}k.cyl(0,0,-20,24,34,H+70,'#d4d6c4',14);for(let i=0;i<26;i++){const a=i*.5,y=4+i*3.6;k.box(Math.cos(a)*38,y,-20+Math.sin(a)*38,14,1.2,6,'#b8ba9e',-a);}k.column(0,H+6,-20,S*1.18,2.6,'#b7a878',32);for(let i=0;i<24;i++){const a=i/24*6.283;k.column(Math.cos(a)*S*1.15,H+8,-20+Math.sin(a)*S*1.15,.8,7,'#d8d0a8',6);}for(const [a,b,r,col] of [[-70,-70,62,'#a8912e'],[70,-70,66,'#9c872b'],[-70,70,60,'#b39a33'],[70,70,58,'#a8912e'],[0,0,76,'#b89f36'],[0,-100,48,'#94802a'],[-100,0,48,'#9c872b'],[100,0,48,'#b39a33'],[0,100,46,'#c0a83e']])k.canopy(a,H+38,b,r*.66,['#5f5224','#6e5f28','#54481f'],Math.abs(a+b*2)+11,.45);},
 council(k){k.crag(0,0,-30,S*1.76,92,S*1.62,'#5a5546',1);for(const [a,b,s] of [[-90,60,1.6],[90,60,1.6],[0,-60,2],[-70,-20,1.4],[70,-20,1.4],[-112,-40,1.5],[112,-48,1.5]]){k.canopy(a,64*s,b,22*s,['#102418','#13291b','#0f2016'],Math.abs(a*3+b)+5,.62);}stoneGate(k,S*1.3,44,50,'#4c463a','#0d0c0a');for(const a of [-1,1])for(let i=0;i<3;i++)k.limb([[a*(44+i*16),60-i*10,S*1.16,5-i],[a*(36+i*14),40-i*8,S*1.3,4-i*.8],[a*(40+i*16),0,S*1.38,5-i]],'#2a2118',7);},
 forge(k){k.crag(0,0,-46,S*1.78,126,S*1.66,'#7f7a70',1);for(const a of [-1,1])k.crag(a*84,0,52,78,66,70,'#7a756b',a>0?2:3);k.crag(-70,62,-50,70,74,70,'#858076',2);k.crag(70,54,-40,62,64,64,'#7a756b',3);stoneGate(k,S*1.2,50,66,'#6a655a','#121116');for(const a of [-1,1]){k.box(a*16,6,S*1.2+1.5,1,44,.5,'#c7e6f2');k.box(a*9,12,S*1.2+1.5,.7,28,.5,'#c7e6f2');}k.ball(0,50,S*1.2+1.6,3,'#e8f6fb',.6);k.box(0,40,S*1.2+1.5,30,.8,.5,'#c7e6f2');},
 // Minas Tirith itself: seven white rings rising over the hall, the Tower of Ecthelion on top.
 gate(k){const rings=[[1.46,H+2],[1.22,34],[1.02,34],[.84,34],[.66,34],[.48,34],[.32,34]];let y=-2;rings.forEach(([r,h],t)=>{const R=S*r,next=rings[t+1];k.column(0,y,0,R,h,'#d8d5c8',40);k.column(0,y+h-2,0,R+2,3,'#e6e3d6',40);const crest=Math.round(R/3.2);for(let i=0;i<crest;i++){const a=i/crest*6.283;k.box(Math.sin(a)*(R+.8),y+h+1,Math.cos(a)*(R+.8),3,3,2.4,'#cfccbe',a);}const towers=Math.max(4,Math.round(R/20));for(let i=0;i<towers;i++){const a=(i+.5)/towers*6.283;k.column(Math.sin(a)*(R+2),y,Math.cos(a)*(R+2),5,h+9,'#e0ddd0',10);k.cone(Math.sin(a)*(R+2),y+h+9,Math.cos(a)*(R+2),6,8,'#7c8087',10);}if(next){const mid=(R+S*next[0])/2,count=Math.floor(mid*6.283/15);for(let i=0;i<count;i++){const a=i/count*6.283;if(a<.14||a>6.14)continue;const q=(i*7+t*3)%5,w=9+q,tall=7+(i*3%4)*2.4,hx=Math.sin(a)*mid,hz=Math.cos(a)*mid;k.box(hx,y+h,hz,w,tall,8,['#cac7b9','#bdbaac','#d2cfc2'][i%3],a);k.gable(hx,y+h+tall,hz,w+1.4,9.4,5,['#55575c','#62605a','#4c4e54'][i%2],a);}}y+=h;});k.column(0,y,0,S*.3,5,'#ece9dc',24);k.box(0,84,S*.66,15,y-114,S*1.54,'#dedbcd');k.add(new T.BoxGeometry(1,1,1).toNonIndexed(),0,84+(y-114)/2,S*1.42,13,y-114,13,'#e6e3d6',Math.PI/4);for(const [a,b] of [[-20,-14],[20,-14],[-20,14],[20,14]]){k.column(a,y,b,4,26,'#e0ddd0',10);k.cone(a,y+26,b,5,10,'#7c8087',10);}k.box(0,y,10,30,14,18,'#e0ddd0');k.gable(0,y+14,10,32,20,7,'#55575c');k.column(0,y,-8,10,112,'#e8e5d8',14);k.column(0,y+100,-8,11.5,2,'#a99468',14);k.cone(0,y+112,-8,13,26,'#9a9ea3',14);k.column(0,y+138,-8,.7,24,'#15161d');k.box(9,y+150,-8,17,10,.5,'#15161d');k.column(0,y+1,26,.9,8,'#f4f2e6',6);k.canopy(0,y+13,26,6,['#e8e8dc','#d8dcd0'],3,.7);},
 messengers(k){k.hill(0,-3,-6,S*1.5,.56,'#5d8a42',1);k.hill(-S*.7,-3,-S*.5,S*.8,.62,'#648f46',2);k.hill(S*.74,-3,-S*.42,S*.76,.66,'#587f3e',0);const z=S*1.47;k.box(0,0,z-8,62,34,16,'#8a7a58');k.disc(0,18,z+2,19,3,'#54391c');k.disc(0,18,z+3.6,15,2,'#3a8a48');k.ball(0,18,z+5,1.6,'#e4b24a');for(const a of [-1,1]){k.box(a*20,0,z+1,3,31,3,'#54391c');k.disc(a*42,22,z-2,8.5,3,'#54391c');k.disc(a*42,22,z-.6,6.6,1,'#e8d27c');k.box(a*42,21.6,z,13.2,.8,.5,'#54391c');k.box(a*42,15,z,.8,14,.5,'#54391c');}k.box(0,34,z-10,66,2,20,'#54391c');for(let i=0;i<5;i++)k.box(0,i*1.2,z+6+(4-i)*3.6,26+(4-i)*4,1.2,4,'#8a8270');for(const [x,y,h] of [[46,62,24],[-58,56,20],[-S*.72,58,18],[S*.8,62,18]]){k.column(x,y,-20,4,h,'#8a7a5a',8);k.column(x,y+h,-20,5,2.4,'#5e5442',8);}for(let i=0;i<34;i++){const a=(i-17)/17,x=a*118;if(Math.abs(x)<12)continue;const zz=S*1.54-Math.abs(a)*a*a*12-Math.abs(a)*26,c=['#b8503a','#c9ad45','#a85a90','#e4e4dc','#7c5fb0'][i%5];k.ball(x,2.2,zz,1.8+(i%3)*.5,c);k.ball(x+2.4,1.6,zz+2,1.3,'#3e6c36');}for(let i=0;i<26;i++){const a=(i-13)/13;if(Math.abs(a)<.12)continue;k.box(a*150,0,S*1.72-Math.abs(a)*40,1,7,1,'#6a4f2a');if(i<25)k.box((a+.0385)*150,5,S*1.72-Math.abs(a+.0385)*40,11.5,.8,.8,'#6a4f2a',-Math.sign(a)*.25);}for(const [x,zz,r] of [[-92,S*1.3,12],[94,S*1.28,13],[-132,S*1.02,15],[136,S*.98,14]]){k.canopy(x,r*.7,zz,r*.6,['#26401f','#2d4a26'],Math.abs(x)+3,.75);}k.column(-30,70,-40,2.6,24,'#54391c',7);k.canopy(-30,100,-40,13,['#26401f','#2d4a26'],5,.8);},
 treasury(k){k.crag(0,0,-46,S*1.78,132,S*1.66,'#837d6e',1);for(const a of [-1,1])k.crag(a*96,0,44,76,70,66,'#7f7969',a>0?2:3);k.crag(60,66,-46,68,66,68,'#8a8474',2);stoneGate(k,S*1.2,54,70,'#7c7664','#20160a');for(const a of [-1,1])dwarfStatue(k,a*72,S*1.14,120,'#8d8777');arch(k,0,0,S*1.2+1.4,30,40,'#b0781f',.4);},
 observatory(k){const pale='#c5c2ae',worn='#a9a692';k.cyl(0,-2,0,S*1.1,S*1.2,H+4,worn,36);k.cyl(0,H+2,0,S*1.0,S*1.06,16,pale,36);for(let i=0;i<24;i++){const a=i/24*6.283;if(i>=2&&i<=5)continue;k.box(Math.sin(a)*S*1.04,H+6,Math.cos(a)*S*1.04,7,12,1,'#2c2a24',a);k.column(Math.sin(a+.13)*S*1.05,H+2,Math.cos(a+.13)*S*1.05,2,16,'#d4d1be',8);}k.add(new T.SphereGeometry(1,30,12,2.1,4.5,0,Math.PI/2).toNonIndexed(),0,H+18,0,S*.97,S*.64,S*.97,pale);for(let i=0;i<16;i++){const a=i/16*6.283,pts=[];const broken=i>=1&&i<=4?.3+(i%3)*.22:1;for(let t=0;t<=6;t++){const f=t/6*broken*1.5708;pts.push([Math.sin(a)*Math.cos(f)*S*.985,H+18+Math.sin(f)*S*.66,Math.cos(a)*Math.cos(f)*S*.985,2.6]);}k.limb(pts,'#8f8c7c',6);}k.column(0,H+18+S*.64,0,14,10,worn,12);k.dome(0,H+28+S*.64,0,14,pale,.8);for(let i=1;i<12;i++){const a=i/12*6.283,h=i%3===1?H*.5+(i*7%5)*5:H+22;k.column(Math.sin(a)*S*1.32,0,Math.cos(a)*S*1.32,6.5,h,'#d4d1be',12);if(i%3!==1){k.column(Math.sin(a)*S*1.32,h,Math.cos(a)*S*1.32,8.5,3,'#c5c2ae',12);if(i%3===0)k.box(Math.sin(a+.26)*S*1.32,h+3,Math.cos(a+.26)*S*1.32,48,6,12,'#c5c2ae',a+.26+1.57);}}for(let i=0;i<14;i++){const a=i*2.399;k.crag(Math.sin(a)*S*(1.05+(i%4)*.1),0,S*.2+Math.cos(a)*S*(.4+(i%3)*.32),6+(i%3)*3,4+(i%4)*2,6,'#a9a692',i);}arch(k,0,0,S*1.21,36,46,'#2c2a24',1.4);},
};

const flameOn=(g,x,y,z,r,h)=>{for(const [a,b,f,c] of [[0,0,1,'#ff6a1a'],[.7,.5,.72,'#ff7a1a'],[-.6,.6,.8,'#ff8a2a'],[.2,-.75,.66,'#ff9a3a'],[.2,.8,.46,'#ffc23a'],[-.1,.95,.34,'#ffe08a']]){const px=x+a*r,pz=z+b*r,t=h*f;g.limb([[px,y,pz,r*.42],[px+a*.2,y+t*.3,pz+b*.2,r*.5],[px-a*.1,y+t*.65,pz-b*.1,r*.24],[px+a*.15,y+t,pz+b*.15,.04]],c,6);}};
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
   k.cyl(s*34,0,z+10,8,5,5,pale,14);k.column(s*34,5,z+10,8.3,.7,'#d8d0b6',14);g.column(s*34,5.2,z+10,7,.3,'#bfe3ef',14);k.column(s*34,5,z+10,1,7,pale,8);g.ball(s*34,13,z+10,1.3,'#ffeab4');
   k.column(s*27,0,z+14,.8,16,'#c9a24a',6);g.ball(s*27,17.4,z+14,1.5,'#ffeab4');}
  arch(k,0,0,z-2,26,48,'#23211c',1);for(let i=0;i<7;i++){const a=i/6*3.1416;k.box(Math.cos(a)*14,35+Math.sin(a)*14,z-1.4,2,2,.8,'#c9a24a',0);}},
 // Caras Galadhon: a white gate of living wood, a swan on its crown, lamps hanging in the arch.
 lorien(k,g){const white='#e4e2cf',z=138;stair(k,z-2,3,44,1,2.6,'#d8d4bc');for(const s of [-1,1]){k.limb([[s*20,0,z,3.4],[s*19,18,z,2.6],[s*19,38,z,2],[s*14,54,z,1.4],[s*5,62,z,.9],[0,64,z,.5]],white,9);k.limb([[s*19,14,z,1.2],[s*29,26,z,.9],[s*30,38,z,.6],[s*25,44,z,.2]],white,6);k.canopy(s*30,46,z,10,['#a08c32','#b89f38'],s>0?3:5,.6);for(const h of [34,46])g.ball(s*14,h,z+1,1.5,'#fff6c4');k.column(s*14,36,z+1,.2,10,'#b89f38',4);}
  k.limb([[-9,67,z,1.1],[0,66,z,1.8],[9,68,z,1],[12,74,z,.8],[10,79,z,.5]],white,8);k.cone(9,78,z,.6,2,'#c9a24a',5);},
 // The Woodland Realm: great doors of stone in the rock, beech roots above, a footbridge over the Forest River.
 council(k,g){const stone='#5a5546',z=150;for(const s of [-1,1]){k.local(s*25,z+8,s*.9,()=>{k.box(s*0,0,0,23,50,3,'#3a3528');for(let i=0;i<4;i++)k.box(0,6+i*12,1.8,20,1,.6,'#55503e');});k.limb([[s*34,62,z-3,6],[s*30,70,z+2,4.4],[s*20,72,z+3,3],[s*8,70,z+4,1.6]],'#2a2118',7);g.ball(s*30,34,z+8,1.8,'#d8f27a');k.column(s*30,36,z+8,.2,12,'#8f9a6a',4);}
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
 // Bag End: the round green door under the turf, its brass knob and lamp, climbing roses, the gate and the notice on it.
 messengers(k,g){const z=S*1.47;for(const s of [-1,1]){k.column(s*24,0,z+18,.8,17,'#3a2a18',6);k.box(s*24,17,z+18,4,.6,1.2,'#3a2a18');g.ball(s*24,15,z+18,1.3,'#ffe6a0');k.cyl(s*17,0,z+12,2.8,2,3.5,'#a0623a',8);k.canopy(s*17,5.5,z+12,3.4,['#3e7036','#4c7c3e'],s>0?2:6,.8);for(let i=0;i<14;i++){const a=(i/13-.5)*3;k.ball(Math.sin(a)*21*s*.5+s*11,18+Math.cos(a)*19,z+3.4,1.1,i%3?'#3e6c36':'#b8503a');}k.box(s*11,0,z+26,1,8,1,'#6a4f2a');k.local(s*8,z+26,s*.9,()=>k.box(s*0,1.4,0,8,4.6,.5,'#7a5a30'));}
  k.disc(0,18,z+4.8,3.4,.3,'#c9962d');k.box(14,0,z+24,1,13,1,'#6a4f2a');k.box(14,10,z+24.6,9,5,.4,'#e8dfc4');k.box(0,31,z+4,70,1,5,'#3e6c36');},
 // Erebor: the Front Gate in gold and stone, runes across the lintel, fires burning at the feet of the kings.
 treasury(k,g){const z=S*1.2+1.8,stone='#7c7664';k.box(0,72,z-4,76,18,12,stone);for(let i=0;i<5;i++)k.box(-28+i*14,80,z+2.4,10,3,1,'#c9962d');for(let i=0;i<19;i++){k.box(-27+i*3,75,z+2.2,.7,3.4,.4,'#ffdc7a');if(i%3)k.add(k.cube(),-26+i*3,76.5,z+2.2,.5,2.2,.4,'#ffdc7a',0,0,.7);}
  k.limb([[-22,72,z+2,1],[-16,86,z+2,.8],[0,92,z+2,.8],[16,86,z+2,.8],[22,72,z+2,1]],'#c9962d',6);k.add(k.octa(1),0,92,z+2.4,2.8,3.6,1,'#dff4ff');g.ball(0,92,z+3.2,1,'#ffffff');
  for(const s of [-1,1]){k.box(s*33,0,z+2,6,72,5,stone);for(let i=0;i<6;i++)k.box(s*33,5+i*11,z+4.8,7,.8,.8,'#c9962d');k.column(s*40,0,z+15,2.6,1,'#26211a',10);k.column(s*40,1,z+15,1,12,'#55524c',8);k.cyl(s*40,13,z+15,4.4,1.8,3,'#55524c',10);flameOn(g,s*40,15.4,z+15,3.2,12);}
  g.box(0,0,z+.6,16,20,.2,'#a85c18');g.box(0,0,z+.8,9,11,.2,'#e08a2a');},
 // Osgiliath: the broken portico of the Dome of Stars, its pediment split, stars of brass over the door.
 observatory(k,g){const z=S*1.21,pale='#d4d1be';stair(k,z+2,5,70,1,2.6,'#b9b6a4');for(const x of [-34,-22,22,34]){k.box(x,5,z+6,10,2,10,'#b9b6a4');k.column(x,7,z+6,3.8,x===34?30:50,pale,14);if(x!==34)k.box(x,57,z+6,10,3,10,'#b9b6a4');}
  k.box(-13,60,z+6,50,8,11,pale);k.box(24,60,z+6,20,8,11,pale,.06);k.rock(36,2,z+20,6,3,5,pale,2);k.rock(42,1.6,z+10,5,2.6,4,pale,3);k.box(30,1,z+22,12,3,7,pale,.5);
  k.gable(-16,68,z+6,44,10,14,'#c5c2ae',Math.PI/2);for(let i=0;i<7;i++){const a=i/6*3.1416;g.ball(Math.cos(a)*16,26+Math.sin(a)*13,z+1.8,.6,'#fff8dc');}k.box(-13,64,z+11.8,16,1.6,.5,'#b5a578');},
 // The Great Gate of the Hornburg: oak and iron between two towers at the head of a walled causeway.
 scouts(k,g){const stone='#8a8674',z=S*1.38,iron='#2f3134';for(let i=0;i<15;i++){for(const s of [-1,1]){const h=3.4+Math.max(0,(9-i))*.7;k.box(s*15.5,0,z+8+i*5.2,2.4,h,5.4,stone);k.box(s*15.5,h,z+8+i*5.2,2.6,1,1.8,'#9a9684');}}
  for(const s of [-1,1]){k.column(s*27,0,z+3,12,74,stone,14);k.column(s*27,74,z+3,14,2.5,'#9a9684',14);for(let i=0;i<10;i++){const a=i/10*6.283;k.box(s*27+Math.sin(a)*13.4,76,z+3+Math.cos(a)*13.4,3.4,4,2.8,'#9a9684',a);}for(const h of [28,50])k.box(s*27,h,z+14.6,2.2,9,.7,'#23211c');k.local(s*12,z+9,s*.95,()=>{k.box(0,0,0,12,34,1.8,'#4a3219');for(let i=0;i<4;i++)k.box(0,4+i*9,1,11,1,.5,iron);for(let i=0;i<8;i++)k.ball(-4+(i%2)*8,6+Math.floor(i/2)*9,1.3,.5,'#54565a');});k.column(s*22,0,z+36,.9,16,'#3a2a18',8);k.cyl(s*22,16,z+36,3.4,1.6,2,iron,8);flameOn(g,s*22,17.6,z+36,2.6,9);}
  k.box(0,36,z+4,32,40,9,stone);k.box(0,0,z+1,18,38,1.4,'#100e0c');k.box(0,76,z+4,34,4,9,'#9a9684');for(let i=0;i<7;i++)k.box(-15+i*5,80,z+7,3,3.4,2,'#9a9684');k.box(0,52,z+8.6,14,16,.5,'#2f5a30');k.box(0,57,z+9,7,5,.3,'#e8e4d4');k.box(3,61,z+9,2,5,.3,'#e8e4d4');k.box(-3,54,z+9,1,4,.3,'#e8e4d4');k.box(3,54,z+9,1,4,.3,'#e8e4d4');},
};
for(const id of Object.keys(entrances)){const base=roofs[id];roofs[id]=(k,g=k)=>{base(k,g);entrances[id](k,g);};}

// Close-up life outside the halls. Only drawn when the camera is near.
export const closeDetails={
 scouts(k,g){for(const s of [-1,1])for(let i=0;i<10;i++){const x=s*(48+i*24),z=214+(i%2)*9;k.add(k.cube(),x,5,z,1.6,16,1.6,'#4a3a22',0,.6,0);k.add(k.cube(),x+6,4,z,1.4,13,1.4,'#55442a',0,-.5,.3);}crate(k,-92,186,10);barrel(k,-108,190);barrel(k,92,188);lantern(k,g,-58,202);lantern(k,g,58,202);k.box(112,0,192,18,6,10,'#6a4a26');for(let i=0;i<6;i++)k.ball(106+i*2.4,7,190+(i%2)*4,2.6,'#b39a4a',.7);},
 isengard(k,g){for(let i=0;i<10;i++){const x=-180+i*40,z=136+(i%2)*14;k.box(x,0,z,8,3,8,'#3e3a33');k.box(x,3,z,5,9,5,'#54565a');}for(let i=0;i<7;i++){if(i===3)continue;k.column(-170+i*56,0,160,2,8,'#17120e',6);g.column(-170+i*56,1,168,1,1,'#ff6a2a',6);}for(let i=0;i<5;i++)k.box(-100+i*50,0,180,24,1,8,'#2c2822',i*.4);},
 library(k,g){for(let i=0;i<8;i++){k.column(-150+i*44,0,130,2,18,'#f1ebd6',8);k.ball(-150+i*44,20,130,3,'#e4dcc2');}for(let i=0;i<14;i++)if(Math.abs(-180+i*28)>16)k.ball(-180+i*28,3,150+(i%2)*10,2.6,['#d9543a','#ecd98f','#e8e8d2','#c75ea0'][i%4]);},
 lorien(k,g){for(let i=0;i<12;i++){const a=i*.52;if(Math.abs(Math.cos(a)*170)<18&&Math.sin(a)>0)continue;g.ball(Math.cos(a)*170,10+(i%3)*8,60+Math.sin(a)*120,1.6,'#fff6c4');}for(let i=0;i<20;i++)k.box(-180+i*18,.2,150+(i%3)*8,5,.3,2.6,'#e2c84e',i);},
 council(k,g){for(let i=0;i<12;i++){k.ball(-180+i*32,4,150+(i%2)*12,4,'#c85a1a',.8);k.column(-180+i*32,0,150+(i%2)*12,1,4,'#efe4c8',6);}for(let i=0;i<5;i++){const x=-120+i*60;k.box(x,30,130,36,.3,.3,'#d8d8d0',i);k.box(x,34,130,.3,10,.3,'#d8d8d0');k.ball(x,30,130,2.6,'#121212');for(let l=0;l<4;l++)k.box(x+(l-1.5)*2,28,130,.4,3,.4,'#121212');}for(let i=0;i<10;i++)g.ball(-160+i*36,16+(i%3)*8,175,.8,'#d8f27a');},
 forge(k,g){for(let i=0;i<8;i++)rock(k,-180+i*50,140+(i%2)*16,7,'#5a564e');for(let i=0;i<6;i++){const x=-120+i*48;rock(k,x-4,175,7,'#5a564e');rock(k,x+5,178,5,'#676258');for(const a of [-1,1])k.column(x+a*9,0,166,.9,17,'#3a2a18',6);k.box(x,17,166,21,1.6,1.6,'#3a2a18');g.ball(x,14.6,166,1.1,'#e4b24a');}},
 gate(k,g){for(let i=0;i<8;i++){k.column(-168+i*48,0,140,4,24,'#ece9dc',10);k.box(-168+i*48,24,140,10,3,10,'#d7d4c6');}for(const a of [-1,1]){k.column(a*150,0,170,.8,40,'#15161d');k.box(a*150+7,32,170,14,8,.4,'#15161d');}},
 messengers(k,g){for(let i=0;i<14;i++){k.column(-190+i*28,0,140,.8,8,'#7c5a31',6);k.box(-190+i*14,6,140,14,.8,.8,'#7c5a31');}for(let i=0;i<24;i++)k.ball(-180+i*15,2.6,158+(i%3)*8,1.8,['#d9543a','#e8c94a','#c75ea0','#f2f2f2'][i%4]);k.column(0,0,136,1,18,'#6a4a22',6);k.box(0,14,136.8,18,8,.6,'#e8dfc4');for(let i=0;i<4;i++)k.ball(-120+i*70,5,190,3.4,'#e0a23a');},
 treasury(k,g){for(let i=0;i<7;i++){const x=-150+i*50;if(x===0)continue;k.box(x,5,154,28,1.4,12,'#7c5a31');k.box(x,0,154,26,5,1,'#5e4322');for(const a of [-1,1])for(const b of [146,160])k.column(x+a*13,0,b,.8,19,'#4a3219',6);k.gable(x,19,153,31,18,5,['#7a3a28','#35506e','#44603e','#7c6430'][i%4],Math.PI/2);for(let c=0;c<5;c++)k.ball(x-10+c*5,7.6,154,1.5,['#b8503a','#c9ad45','#8a6a3a'][c%3]);}for(let i=0;i<4;i++)barrel(k,-110+i*70,178);lantern(k,g,-60,130);lantern(k,g,60,130);},
 observatory(k,g){for(let i=0;i<12;i++)if(Math.abs(-170+i*30)>22)k.box(-170+i*30,0,140+(i%3)*14,8+(i%3)*5,4+(i%4)*2,8,'#8a8775',i);for(let i=0;i<5;i++)if(i!==2)k.column(-120+i*60,0,175,4,10+(i%3)*10,'#b9b6a4',8);},
};

// The Morannon: two Towers of the Teeth and the iron gate in the pass. Local x runs along the wall, local z along the road.
export function buildBlackGate(material){
 const k=new Kit(),g=new Kit(),black='#4e4640',iron='#2e2925';
 for(const s of [-1,1]){
  k.crag(s*62,0,0,46,52,30,'#544a41',s>0?1:2);
  k.cyl(s*26,0,0,13,19,96,black,10);k.cyl(s*26,96,0,16,13,8,iron,10);k.cone(s*26,104,0,14,44,iron,10);
  for(let i=0;i<4;i++)g.box(s*26,22+i*19,17.2-i*1.4,1.5,6,.5,'#ff7a2a');
  k.box(s*72,0,0,60,48,12,black);for(let i=0;i<7;i++)k.cone(s*(46+i*9),48,0,3.4,12+(i%2)*6,iron,5);
  // The leaves stand open: nothing here keeps a carrier out.
  k.box(s*17,0,6,2,50,16,iron,s*1.1);for(let i=0;i<4;i++)k.cone(s*19,50,2+i*4,1.6,9,iron,5);
 }
 k.box(0,50,0,30,8,12,black);for(let i=0;i<5;i++)k.cone(-12+i*6,58,0,2.6,14,iron,5);
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
 const k=new Kit(),hide='#2a211c',dim='#1f1815';
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
 for(const s of [-1,1]){flame(body,s*16,80,1,10);flame(body,s*26,76,3,7);flame(body,s*44,42,24,8);flame(body,s*15,5,0,13,2.4);}
 for(const f of [[-46,60,32],[-47,76,37],[-47,92,40]])flame(body,f[0],f[1],f[2],7,2.4);
 for(let i=0;i<10;i++){const a=i*2.399,r=10+i*3.6;flame(stage,Math.cos(a)*r,5,Math.sin(a)*r*.82,13+(i%3)*5,2.2);}
 if(puff)for(let i=0;i<10;i++){const m=new T.Sprite(new T.SpriteMaterial({map:puff,color:'#0d0a09',transparent:true,opacity:.42,depthWrite:false,fog:false})),s=i%2?1:-1;m.position.set(s*(18+i*5),78+(i%3)*14-i*2,-16);m.scale.setScalar(30+i*2);body.add(m);shadows.push({m,x:m.position.x,y:m.position.y,phase:i*1.3});}
 const light=new T.PointLight('#ff6a2a',5,340,1.25);light.position.set(0,46,16);root.add(light);
 const animate=t=>{
  const s=t*.001;
  body.rotation.y=Math.sin(s*.4)*.16;body.position.y=-2+Math.sin(s*1.1)*.9;
  wings[0].rotation.y=.3+Math.sin(s*.9)*.14;wings[1].rotation.y=-.3-Math.sin(s*.9)*.14;
  whip.forEach((w,i)=>{w.rotation.z=Math.sin(s*2.1-i*.42)*(.1+i*.012)+(i<4?-.03:.02);w.rotation.y=Math.cos(s*1.3-i*.35)*.12;});
  lava.offset.x=s*.008;lava.offset.y=s*.005;
  for(const f of flames){const n=Math.sin(s*6.1+f.phase)*.5+Math.sin(s*11.3+f.phase*2)*.3,w=f.size*(1+n*.18);f.m.scale.set(w,f.size*f.tall*(1+n*.32),1);f.m.position.set(f.x+Math.sin(s*2.2+f.phase)*.8,f.y+f.size*f.tall*.32,f.z);f.m.material.opacity=.34+n*.16;}
  for(const q of shadows){q.m.position.x=q.x+Math.sin(s*.5+q.phase)*3;q.m.position.y=q.y+Math.sin(s*.37+q.phase)*3;}
  light.intensity=4.6+Math.sin(s*7)*.8+Math.sin(s*13)*.4;
 };
 return {root,stage,animate};
}

// Everything that stands on the ground of a place, so that nothing else grows through it.
export function groundFootprints(id){const k=new Kit(),g=new Kit();k.record=[];landmarks[id](k,g,{smoke:[],embers:[],spray:[],leaves:[]});roofs[id](k,g);closeDetails[id](k,g);return k.record.filter(q=>q[2]-q[0]<620);}
