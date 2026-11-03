// The rooms people work in, built after the descriptions in the books: floor plan, walls and furnishings of every house.
// Pure drawing. No data from the server and no server access.
import {HALL,fireAt} from './middle-earth-3d.mjs';
import {orthancStand,osgiliathStand,narsilInto,smaugInto,arkenstoneStand} from './middle-earth-places.mjs';
import {houseRelics} from './middle-earth-lore.mjs';
export const ROUND_R=124;
const {half:S}=HALL;
const TAU=Math.PI*2;
const HALL_ROOTS=[-1.5,-.5,0,1,1.5];
// Angle 0 is the north of a room, angles grow clockwise. Things placed this way look into the room.
const atWall=(k,a,r,build)=>k.local(Math.sin(a)*r,-Math.cos(a)*r,-a,build);
const seededColor=(list,i)=>list[((i*7)+(i>>1))%list.length];
const BOOKS=['#5e2a20','#27465e','#37562f','#6f5a22','#4a2848','#3a2a1c','#7a6a4a'];

function bookcase(k,w,h,seed=0,wood='#3f2c18'){
 k.box(0,0,0,w,h,10,wood);k.box(0,h,1,w+3,2.4,13,wood);k.box(0,0,1,w+2,4,12,wood);
 const rows=Math.max(3,Math.floor(h/9.4));
 for(let r=0;r<rows;r++){const y=4.6+r*9.2;k.box(0,y-.6,3,w-2,1,8,wood);let x=-w/2+2,i=seed+r*3;while(x<w/2-2.4){const t=1.3+(i%3)*.45,bh=5.2+(i%4)*.7;k.box(x+t/2,y,4.2,t,bh,6,seededColor(BOOKS,i));x+=t+.15;i++;}}
}
function archedWindow(k,g,w,h,glass,stone='#c9c1a8'){
 k.box(-w/2-2,10,1,3.4,h,5,stone);k.box(w/2+2,10,1,3.4,h,5,stone);k.box(0,8,1.6,w+9,3,6,stone);
 g.box(0,11,.3,w,h-2,.5,glass);k.box(0,11,.9,1,h-2,.6,'#2a2620');for(const f of [.33,.66])k.box(0,11+(h-2)*f,.9,w,1,.6,'#2a2620');
 k.disc(0,10+h,0.8,w/2+3.4,5,stone);g.disc(0,10+h,.9,w/2-.2,.5,glass);k.box(0,10+h,1.4,1,w/2,.6,'#2a2620');
}
function pilaster(k,w,h,stone,cap){k.box(0,0,1,w,h,4,stone);k.box(0,0,1.4,w+3,4,5,cap??stone);k.box(0,h-3,1.4,w+3,3,5,cap??stone);}
function column(k,x,z,r,h,stone,cap,bands=0){k.column(x,0,z,r+2.4,3,cap??stone,14);k.column(x,3,z,r,h-7,stone,14);k.cyl(x,h-5,z,r+2.6,r,4,cap??stone,14);k.column(x,h-1,z,r+3.2,1.2,cap??stone,14);for(let i=1;i<=bands;i++)k.column(x,3+i*(h-7)/(bands+1),z,r+.4,.8,cap??stone,14);}
function banner(k,w,h,cloth,mark,y=10){k.box(0,y+h,1,w+4,1.2,1.2,'#26211a');k.box(0,y,.8,w,h,.5,cloth);if(mark)k.box(0,y+h*.2,1.1,w*.3,h*.55,.3,mark);}
function torch(k,g,y=26){k.box(0,y-5,1,1.4,9,3,'#26211a');k.cone(0,y+3,3,2.2,-.1,'#26211a',8);g.lamp(0,y+4.4,3,2);}
function chair(k,x,z,ry=0,wood='#4a3219'){k.local(x,z,ry,()=>{k.box(0,7,0,9,1.2,9,wood);for(const [a,b] of [[-3.6,-3.6],[3.6,-3.6],[-3.6,3.6],[3.6,3.6]])k.box(a,0,b,1,7,1,wood);k.box(0,8,-4,9,12,1,wood);});}
function longTable(k,x,z,w,d,top='#6a4a26',leg='#3f2c18',ry=0){k.local(x,z,ry,()=>{k.box(0,12,0,w,1.8,d,top);k.box(0,10,0,w-5,1.6,d-5,leg);for(const a of [-1,1]){k.box(a*(w/2-4),0,0,2.6,10,d-6,leg);}k.box(0,4,0,w-8,1.4,1.4,leg);});}
function papers(k,x,y,z,n=4){for(let i=0;i<n;i++)k.box(x+(i%3)*5-5,y+(i%2)*.3,z+(i%2)*3,4.4,.3,6,'#d8cfae',i*.3);}
function candles(k,g,x,y,z){k.column(x,y,z,1.8,.5,'#7a6a4a',10);for(const [a,b] of [[0,0],[1.4,.6],[-1.2,.8]]){k.column(x+a,y+.5,z+b,.45,3+Math.abs(a),'#d8cfae',6);g.lamp(x+a,y+4.2+Math.abs(a),z+b,.6);}}
// Armour on its stand: a dwarven harness, or a shirt of mithril that glitters by itself.
function armorStand(k,g,x,z,ry,mithril){k.local(x,z,ry,()=>{k.column(0,0,0,6,1.4,'#2a2118',10);k.column(0,1.4,0,.8,24,'#3a2a18',6);const c=mithril?'#e6edf4':'#8d9096';k.box(0,14,0,11,12,5,c);k.box(0,10.5,0,12,3.5,5.4,c);for(const s of [-1,1]){k.box(s*7.4,20,0,4,6,5,c);k.box(s*7.6,13.4,0,3,7,4,c);}k.box(0,24,0,3.4,2,3.4,'#3a2a18');if(mithril){for(let i=0;i<16;i++)g.ball(-4.6+(i*7)%10,10.5+(i*5)%13,2.7,.32,'#f4fbff');k.box(0,8.6,2.6,12,1,.4,'#e6edf4');}else{k.ball(0,28.6,0,4.2,'#9a9da3',1);k.box(0,25.6,2.8,1,4,.6,'#8d9096');for(const s of [-1,1])k.cone(s*4.4,30,0,.8,4,'#c9962d',5);k.box(0,8.8,2.6,12,1.4,.4,'#c9962d');}});}
// A rack of dwarven arms: axes, swords and a war hammer.
function weaponRack(k,x,z,ry){k.local(x,z,ry,()=>{k.box(0,0,0,32,2,8,'#3a2a18');k.box(0,22,-3,32,2,2,'#3a2a18');for(const s of [-1,1])k.box(s*15,0,-3,2,24,2,'#3a2a18');for(let i=0;i<6;i++){const x=-12.5+i*5;if(i%3===0){k.box(x,2,0,.8,26,.8,'#5a4028');k.box(x+2,21,0,4.6,5.4,.5,'#b6bcc3');k.box(x+4.2,21,0,.6,5.4,.6,'#d8dde3');}else if(i%3===1){k.box(x,2,0,1.6,2,.8,'#c9962d');k.box(x,4,0,.6,22,1.8,'#c3c9d0');k.box(x,4,0,3.6,.8,1,'#c9962d');}else{k.box(x,2,0,.8,24,.8,'#5a4028');k.box(x,24,0,4,3.6,3.6,'#8d9096');}}});}
// A heap of the hoard in detail: loose coins lying every way, cups, a crown and stones.
function hoard(k,g,x,z,r,seed){let s=seed;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;for(let i=0;i<46;i++){const a=rnd()*6.283,f=Math.sqrt(rnd())*.96,cx=x+Math.cos(a)*r*f,cz=z+Math.sin(a)*r*f,y=r*.6*Math.sqrt(Math.max(0,1-f*f))-.1;k.add(k.cylinder(1,1,1,10),cx,y,cz,1.3,.28,1.3,rnd()>.5?'#ffd25a':'#e0a838',rnd()*6.3,(rnd()-.5)*1.2,(rnd()-.5)*1.2);}
 for(let i=0;i<3;i++){const a=rnd()*6.283,f=.3+rnd()*.5,cx=x+Math.cos(a)*r*f,cz=z+Math.sin(a)*r*f,y=r*.6*Math.sqrt(1-f*f)-.4;k.column(cx,y,cz,1.6,.5,'#c9962d',10);k.column(cx,y+.5,cz,.4,3,'#c9962d',6);k.cyl(cx,y+3.5,cz,.8,2,3,'#deb04a',10);}
 {const a=rnd()*6.283,f=.4,cx=x+Math.cos(a)*r*f,cz=z+Math.sin(a)*r*f,y=r*.6*Math.sqrt(1-f*f)-.2;k.column(cx,y,cz,3,1.2,'#deb04a',14);for(let i=0;i<7;i++){const b=i/7*6.283;k.cone(cx+Math.cos(b)*2.6,y+1.2,cz+Math.sin(b)*2.6,.6,2.4,'#deb04a',4);}g.ball(cx,y+1.6,cz+2.8,.5,'#ff3a4a');}
 for(let i=0;i<6;i++){const a=rnd()*6.283,f=rnd()*.8,y=r*.6*Math.sqrt(1-f*f);g.ball(x+Math.cos(a)*r*f,y+.2,z+Math.sin(a)*r*f,.6,['#ff3a4a','#3ac8ff','#5aff8a','#ffffff'][i%4]);}}
function chest(k,x,z,ry=0){k.local(x,z,ry,()=>{k.box(0,0,0,16,9,10,'#55351a');k.add(k.cylinder(1,1,1),0,9,0,5,16,5,'#603c1e',0,0,Math.PI/2);for(const a of [-5,5])k.box(a,0,5.1,1.2,12,.4,'#7a6a4a');k.box(0,6,5.2,2.6,3,.4,'#c9962d');});}
function barrel(k,x,z,h=13,r=5){k.cyl(x,h*.5,z,r*.86,r,h*.5,'#55391c',12);k.cyl(x,0,z,r,r*.86,h*.5,'#55391c',12);k.column(x,h*.2,z,r*1.02,.8,'#26211a',12);k.column(x,h*.74,z,r*1.02,.8,'#26211a',12);k.column(x,h,z,r*.8,.3,'#6a4a26',12);}
function crate(k,x,z,s=10){k.box(x,0,z,s,s,s,'#6a4a26');k.box(x,s*.46,z,s+.3,.9,s+.3,'#3f2c18');k.box(x,0,z,s+.2,.9,s+.2,'#3f2c18');}

// Floors
function discFloor(k,color,lines=null,n=12,r=ROUND_R-2){k.column(0,-1.2,0,r,1.3,color,40);if(lines){for(let i=0;i<n;i++){k.box(Math.sin(i/n*TAU)*r/2,.1,-Math.cos(i/n*TAU)*r/2,.5,.12,r,lines,-i/n*TAU);}for(const f of [.3,.6,.9]){for(let i=0;i<36;i++){const a=i/36*TAU;k.box(Math.sin(a)*r*f,.1,-Math.cos(a)*r*f,.5,.12,r*f*TAU/34,lines,Math.PI/2-a+Math.PI/2);}}}}
function squareFloor(k,color){k.box(0,-1.2,0,S*2+4,1.3,S*2+4,color);}

export const roomPlans={
 // Beutelsend: panelled wood, round windows and a round green door, a low warm room.
 messengers:{round:true,wall:'#8f6a3c',trim:'#4a331b',height:52,segments:10},
 // Orthanc: black polished stone, no joints, narrow slits.
 isengard:{round:true,wall:'#1b1b1f',trim:'#0c0c0f',height:62,segments:10,slits:true},
 // Moria and Erebor: halls hewn out of the living rock.
 forge:{round:true,wall:'#44413c',trim:'#2a2824',height:64,segments:10,rough:true},
 treasury:{round:true,wall:'#55503f',trim:'#34302a',height:64,segments:14,rough:true,radius:162,back:-37},
 council:{round:true,wall:'#4a3a26',trim:'#2a2118',height:13,segments:14,rail:true},
 // The Hornburg: old stone of Númenor, rough with age.
 scouts:{round:true,wall:'#7a7666',trim:'#5c5848',height:58,segments:10},
 // Caras Galadhon: a talan high in the tree, only a white rail around it.
 lorien:{round:true,wall:'#dcdccb',trim:'#b5b6a2',height:13,segments:14,rail:true},
 // Osgiliath: the round Dome of Stars.
 observatory:{round:true,wall:'#a8a58f',trim:'#7c796a',height:58,segments:10,arches:true},
 // Rivendell and Minas Tirith keep long straight halls with pillars.
 library:{round:false,wall:'#e8e0c8',trim:'#c9a458',height:62,colonnade:true},
 gate:{round:false,wall:'#dedbcd',trim:'#a7a496',height:62},
};

export const roomInteriors={
 messengers(k,g){
  // Plank floor, wainscot and low ceiling beams.
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#70512c',40);for(let i=-11;i<=11;i++)k.box(i*11,.1,0,.5,.12,Math.sqrt(Math.max(0,ROUND_R*ROUND_R-i*i*121))*2-6,'#3f2c18');
  for(let i=0;i<28;i++){const a=i/28*TAU;atWall(k,a,ROUND_R-7,()=>{k.box(0,0,0,23,20,1.4,'#5e4322');k.box(0,20,.8,25,1.6,2,'#3f2c18');k.box(11.5,0,.6,1.4,20,1.2,'#3f2c18');});}
  for(let i=0;i<6;i++){const a=-1.4+i*.56;atWall(k,a,ROUND_R-30,()=>k.box(0,44,4.5,4,3.2,41,'#3f2c18'));}
  // Round green door, round window, the study with its pigeon-holes.
  atWall(k,-1.25,ROUND_R-7,()=>{k.disc(0,23,.8,21,2,'#3f2c18');k.disc(0,23,1.6,18,1.4,'#2d5a33');k.ball(0,23,2.6,1.5,'#c9962d');for(let i=-3;i<=3;i++)k.box(i*5,6,2.3,.4,34-Math.abs(i)*2,.3,'#234a2a');});
  atWall(k,-.55,ROUND_R-7,()=>{k.disc(0,32,.8,15,2,'#3f2c18');g.disc(0,32,2,12.5,.4,'#5f8ea0');k.box(0,31.5,2.3,25,1,.4,'#3f2c18');k.box(0,20,2.3,1,24,.4,'#3f2c18');});
  atWall(k,.15,ROUND_R-8,()=>{k.box(0,8,0,68,38,6,'#55391c');for(let r=0;r<4;r++)for(let c=0;c<9;c++){k.box(-30+c*7.6,10+r*8.8,2.6,6.8,8,1.4,'#20160c');if((r*5+c*3)%4)k.box(-30+c*7.6,11.5+r*8.8,3.4,5.4,3.6+(c%2),.5,'#d8cfae');}k.box(0,0,0,70,8,7,'#3f2c18');});
  // The hearth with its mantel, a kettle on the fire.
  atWall(k,.95,ROUND_R-8,()=>{hearth(k,g,48,32,'#6e675a','#4c463c','#3f2c18',50);k.limb([[0,21,1,.3],[0,20,4,.3],[0,18.4,5,.3]],'#26211a',4);k.ball(0,14.6,5,3.6,'#26211a');k.box(0,18,5,3.2,1.2,3.2,'#26211a');k.box(0,35.1,5,5,3,3,'#c9962d');candles(k,g,-18,35.1,5);candles(k,g,18,35.1,5);});
  atWall(k,1.65,ROUND_R-8,()=>{bookcase(k,44,36,2,'#55391c');});
  // The kitchen: a black range with a fire in it, the dresser of plates, hams and herbs under the beams, bread, cheese and apples on the board.
  atWall(k,2.35,ROUND_R-8,()=>{k.box(0,0,0,34,16,12,'#2a2622');k.box(0,16,0,36,1.4,13,'#3a3530');g.box(0,3,6.2,12,7,.3,'#ff8a3a');k.box(0,2.4,6.3,14,9,.3,'#1a1714');for(const s of [-1,1]){k.column(s*9,17.4,2,3.4,3,'#2c2a28',10);k.cyl(s*9,20.4,2,3.6,3.2,1,'#3a3836',10);}k.limb([[9,24,2,.3],[11,26,2,.3],[12,24,2,.3]],'#2c2a28',4);k.box(0,17.4,-4,30,26,3,'#4c463c');k.column(0,43,-4,4,10,'#4c463c',8);});
  atWall(k,2.85,ROUND_R-8,()=>{k.box(0,0,0,40,18,10,'#5e4322');k.box(0,18,0,42,1.4,11,'#3f2c18');k.box(0,19.4,-3,40,22,2,'#55391c');for(let r=0;r<2;r++){k.box(0,26+r*9,-1,40,1,5,'#3f2c18');for(let c=0;c<7;c++)k.disc(-15+c*5,30+r*9,.6,2.2,.4,c%2?'#d8cfae':'#5f8ea0');}for(let c=0;c<5;c++)k.column(-14+c*7,19.4,3,1.6,4,seededColor(['#8a5a2a','#a07f4c','#6f7a3a'],c),8);for(let c=0;c<3;c++)k.box(-12+c*12,4,5.3,9,9,.4,'#4a331b');});
  {const kx=Math.sin(2.6)*(ROUND_R-40),kz=-Math.cos(2.6)*(ROUND_R-40);k.local(kx,kz,2.6,()=>{k.box(0,0,0,30,12.6,16,'#6a4a26');k.box(0,12.6,0,32,1.3,18,'#7a5530');k.ball(-8,15.6,0,3.4,'#c9a060',.6);k.box(4,13.9,-2,6,3,4,'#e8c94a');for(let i=0;i<5;i++)k.ball(9+(i%2)*2,14.9,2-i*1.2,1.1,i%2?'#b8402a':'#7a9a3a');k.column(-1,13.9,4,2.4,.6,'#d8cfae',10);g.lamp(0,22,0,1.2);for(const s of [-1,1])k.box(s*20,0,0,5,7,12,'#55391c');});
   for(let i=0;i<4;i++){const a=2.2+i*.22,r=ROUND_R-24;k.column(Math.sin(a)*r,40,-Math.cos(a)*r,.2,6,'#26211a',4);k.ball(Math.sin(a)*r,37,-Math.cos(a)*r,2.4,i%2?'#8a3a24':'#5d7a3a',1.6);}}
  // More warm light: lanterns under the beams and candles in the window.
  for(const [x,z] of [[-40,-40],[40,-40],[-40,30],[40,30],[0,-70],[60,70]])hangingLamp(k,g,x,z,48,8,'#ffcf86',2.6);
  atWall(k,-1.9,ROUND_R-8,()=>{k.box(0,0,0,40,4,10,'#55391c');for(let r=0;r<2;r++){k.box(0,14+r*11,2,42,1.2,9,'#55391c');for(let c=0;c<6;c++)k.column(-16+c*6.4,15.2+r*11,3,2.4,4+(c%3),seededColor(['#a07f4c','#7c4a2c','#6f7a3a','#d8cfae'],c+r),8);}});
  rugRound(k,0,46,42,'#6e2f1c','#a0702a');
  longTable(k,10,-62,62,24);for(const x of [-14,10,34])chair(k,x,-44,3.14,'#55391c');for(const x of [-14,10,34])chair(k,x,-80,0,'#55391c');papers(k,-4,13.9,-62,6);for(const [x,z] of [[22,-66],[36,-66]])k.column(x,13.9,z,2,4,'#7c6a4a',10);k.ball(4,16,-68,3,'#b0702a');
  for(const a of [-.9,.6])for(const r of [60]){const x=Math.sin(a)*r,z=-Math.cos(a)*r;k.column(x,36,z,.3,8,'#26211a',6);g.lamp(x,34,z,2.2);}
 },
 isengard(k,g){
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#141417',40);for(let i=0;i<8;i++){const a=i/8*TAU+.39;k.box(Math.sin(a)*60,.1,-Math.cos(a)*60,.6,.14,120,'#2c2c31',-a);}for(const f of [.45,.92])for(let i=0;i<40;i++){const a=i/40*TAU;k.box(Math.sin(a)*ROUND_R*f,.1,-Math.cos(a)*ROUND_R*f,.6,.14,ROUND_R*f*TAU/38,'#2c2c31',Math.PI-a);}
  // Eight black columns, with the forges in the pit at the back.
  for(let i=0;i<8;i++){const a=i/8*TAU+.39;const x=Math.sin(a)*(ROUND_R-14),z=-Math.cos(a)*(ROUND_R-14);if(z<60)column(k,x,z,5,62,'#0d0d10','#1f1f24',3);}
  k.column(0,0,-70,22,4,'#0c0c0e',20);g.column(0,3.4,-70,18,.8,'#ff6a1a',20);g.column(0,3.8,-70,11,.5,'#ffc23a',16);
  g.box(-62,.3,-30,62,.3,6,'#ff6a1a',.9);g.box(62,.3,-30,62,.3,6,'#ff6a1a',-.9);
  atWall(k,0,ROUND_R-8,()=>{k.box(0,8,0,34,50,1,'#101014');k.box(-7,22,.8,3,22,.4,'#e7e7df');k.box(-2.4,24,.8,3,26,.4,'#e7e7df');k.box(2.4,24,.8,3,24,.4,'#e7e7df');k.box(7,22,.8,3,18,.4,'#e7e7df');k.box(0,14,.8,16,12,.4,'#e7e7df');});
  for(const a of [-.8,.8])atWall(k,a,ROUND_R-10,()=>{k.box(0,0,0,30,44,12,'#26262a');k.box(0,0,6.4,18,22,.6,'#0b0908');g.box(0,2,6.8,13,14,.3,'#ff7a2a');k.column(0,44,0,4,18,'#1b1b1f',8);});
  for(let i=0;i<14;i++){const a=2.18+i*.045;const x=Math.sin(a)*(ROUND_R-12),z=-Math.cos(a)*(ROUND_R-12);k.box(x,i*3.4,z,14,3.4,10,'#232327',-a);}
  longTable(k,-26,-32,32,14,'#26262a','#141417',.5);papers(k,-26,13.9,-32,5);
  for(let i=0;i<6;i++)crate(k,-88+(i%3)*11,-46+Math.floor(i/3)*11,10);barrel(k,88,-30);barrel(k,94,-18);
  orthancStand(k,0,0);
 },
 library(k,g){
  squareFloor(k,'#c9bf9f');for(let i=-4;i<=4;i++){k.box(i*26,.08,0,.5,.12,S*2,'#9c8f6e');k.box(0,.08,i*26,S*2,.12,.5,'#9c8f6e');}
  // A row of tall arched windows looking onto the falls; shelves along the west wall; slender columns.
  for(let i=0;i<5;i++)k.local(-88+i*44,-S+2,0,()=>{archedWindow(k,g,24,34,i===2?'#d8c27a':'#8fb8cc');});
  for(let i=0;i<3;i++)k.local(-S+6,-78+i*42,Math.PI/2,()=>bookcase(k,38,50,i*3,'#4a3219'));
  for(let i=0;i<3;i++)k.local(S-6,-78+i*42,-Math.PI/2,()=>bookcase(k,38,50,i*2+1,'#4a3219'));
  for(const [x,z] of [[-66,-84],[-22,-84],[22,-84],[66,-84],[-84,-30],[84,-30],[-84,26],[84,26]]){column(k,x,z,3.6,62,'#ece6cf','#b5a578',2);ivy(k,x,z,3.6,50,x*.1+z*.03);}
  rugRect(k,0,48,88,60,'#27465e','#a0863e');
  longTable(k,0,-60,70,28,'#6a4a26','#3f2c18');papers(k,-14,13.9,-60,7);candles(k,g,18,13.9,-66);candles(k,g,-26,13.9,-66);k.box(6,13.9,-58,12,2.4,9,'#5e2a20');chair(k,-14,-40,3.14);chair(k,14,-40,3.14);
  // The shards of Narsil in an alcove of the west wall, out of every way and in front of no bench; and an armillary sphere.
  narsilInto(k,g,-84,72,Math.PI/2);
  k.column(96,0,84,1.8,16,'#6a4a22',8);k.column(96,0,84,5,1.4,'#3f2c18',12);for(const [rx,rz] of [[Math.PI/2,0],[0,Math.PI/2],[Math.PI/2,1]])k.add(k.torus(9,.4),96,24,84,1,1,1,'#c9962d',0,rx,rz);k.ball(96,24,84,3,'#27465e');
 },
 lorien(k,g){
  // A talan: pale planks around the trunk, lamps in the branches, the silver basin of the Mirror.
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#b5b09a',40);for(let i=-11;i<=11;i++)k.box(i*11,.1,0,.4,.1,Math.sqrt(Math.max(0,ROUND_R*ROUND_R-i*i*121))*2-6,'#8f8d78');
  k.cyl(0,0,-118,16,30,110,'#c9ccbc',12);for(let i=0;i<6;i++){const a=i*1.05;k.box(Math.cos(a)*26,0,-118+Math.sin(a)*22,28,6,8,'#b5b7a6',a);}
  for(let i=0;i<9;i++){const a=2.4+i*.28;k.box(Math.sin(a)*40,i*5,-118-Math.cos(a)*40,16,1.4,8,'#dcdccb',-a);}
  k.cyl(-20,0,-58,17,10,12,'#c9c9b8',18);k.column(-20,12,-58,17.4,1,'#e8e8da',18);k.column(-20,13,-58,15,.4,'#8cd4ec',18);g.column(-20,13.3,-58,9,.2,'#d7f4ff',16);k.box(-20,0,-58,7,3,7,'#a9ab9a');k.box(10,0,-44,3,16,1,'#a9ab9a');
  longTable(k,62,-62,40,18,'#cfcfba','#a9ab9a',-.5);papers(k,62,13.9,-62,5);chair(k,44,-46,2.6,'#a9ab9a');
  for(let i=0;i<10;i++){const a=-1.5+i*.33;const x=Math.sin(a)*(ROUND_R-14),z=-Math.cos(a)*(ROUND_R-14);if(Math.hypot(x,z+118)<40)continue;k.column(x,0,z,.6,38+(i%3)*8,'#b5b7a6',6);g.lamp(x,38+(i%3)*8,z,2);}
  for(let i=0;i<44;i++){const a=i*2.399,r=10+i*2.3;k.box(Math.cos(a)*r,.25,Math.sin(a)*r,3.4,.2,2,i%2?'#d8bb42':'#a98f2a',a);}
 },
 council(k,g){
  discFloor(k,'#2f2a1e');for(let i=0;i<70;i++){const a=i*2.399,r=8+i*1.55;k.box(Math.cos(a)*r,.2,Math.sin(a)*r,4,.2,2.4,['#4a4322','#5a3a1c','#39451f'][i%3],a);}
  // Great roots hold up the hall; lanterns of the Woodland Realm hang among them.
  for(const a of HALL_ROOTS){const x=Math.sin(a)*(ROUND_R-20),z=-Math.cos(a)*(ROUND_R-20);k.cyl(x,0,z,5,11,56,'#3f2f1e',7);for(let j=0;j<6;j++){const b=j*1.05;k.add(k.cylinder(.3,1,1),x+Math.cos(b)*10,3,z+Math.sin(b)*10,4,8,4,'#3a2b1a',b,1.1*Math.sin(b),1.1*Math.cos(b));}k.ball(x,50,z,11,'#25371f');}
  for(const [x,z,h] of [[-64,-50,30],[-24,-74,34],[24,-74,28],[64,-50,32],[-80,0,30],[80,0,34],[-40,-20,38],[40,-20,38]]){k.column(x,0,z,.45,16,'#3a2b1a',6);k.limb([[x,16,z,.4],[x+3,19,z,.3],[x+4,18,z,.15]],'#3a2b1a',4);k.column(x+4,14.4,z,.9,.3,'#6a5236',8);g.lamp(x+4,16.4,z,1.4);}
  // The king's seat with its antlers, the wine cellar and the great map table.
  atWall(k,.6,ROUND_R-14,()=>{k.box(0,0,0,30,6,24,'#3f2f1e');k.box(0,6,-6,18,30,4,'#4a3a26');k.box(0,6,0,16,5,12,'#55432c');for(const a of [-1,1]){for(let i=0;i<4;i++)k.add(k.cylinder(.3,.9,1),a*(8+i*3),38+i*5,-6,1,14,1,'#c9bfa0',0,0,a*(.4+i*.25));}});
  atWall(k,-1.05,ROUND_R-13,()=>{k.box(0,0,0,76,3,14,'#2a2118');for(let r=0;r<2;r++)for(let c=0;c<5;c++){k.add(k.cylinder(6.4,6.4,12),-28+c*14,10+r*13,3,1,1,1,'#55391c',0,Math.PI/2);k.add(k.cylinder(6.8,6.8,1),-28+c*14,10+r*13,8,1,1,1,'#26211a',0,Math.PI/2);k.disc(-28+c*14,10+r*13,9,5.6,.4,'#6a4a26');}});
  longTable(k,-6,-54,64,30,'#4a3a26','#2a2118');k.box(-6,13.9,-54,50,.3,22,'#c9bf96');k.box(-16,14.2,-54,30,.2,1,'#4f7f9b',.2);for(const [a,b] of [[-20,-60],[2,-50],[14,-58]])g.lamp(a,15,b,1);chair(k,-28,-34,3.14,'#2a2118');chair(k,10,-34,3.14,'#2a2118');
 },
 forge(k,g){
  // Khazad-dûm: columns carved like trees, rails for the ore, the great forge and the tomb of Balin.
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#2f2c28',40);for(let i=-4;i<=4;i++)k.box(i*26,.08,0,.4,.1,190-Math.abs(i)*22,'#1b1a18');for(let i=-4;i<=4;i++)k.box(0,.08,i*26,190-Math.abs(i)*22,.1,.4,'#1b1a18');
  for(const [x,z] of [[-95,-31],[-44,-90],[2,-100],[98,-44],[-104,10]]){column(k,x,z,7,66,'#3a3733','#26241f',4);for(let a=0;a<4;a++)k.add(k.cylinder(.8,3,1),x+Math.sin(a*1.57)*8,60,z+Math.cos(a*1.57)*8,1,12,1,'#3a3733',0,Math.cos(a*1.57)*.7,-Math.sin(a*1.57)*.7);}
  for(let i=-5;i<=5;i++)k.box(i*20,.2,62,1.6,.5,18,'#3f2c18');for(const z of [55,69])k.box(0,.7,z,226,.7,1.1,'#54565a');
  k.local(-54,62,0,()=>{k.box(0,3,0,26,12,16,'#3a342c');k.box(0,14,0,22,4,12,'#55524c');for(const [a,b] of [[-9,8],[9,8],[-9,-8],[9,-8]])k.add(k.cylinder(3,3,1.6),a,3,b,1,1,1,'#1b1a18',0,Math.PI/2);for(let i=0;i<5;i++)g.lamp(-7+i*3.4,18.4,(i%3)*3-3,.8);});
  atWall(k,-.86,ROUND_R-14,()=>{k.box(0,0,0,52,58,18,'#26241f');k.box(0,0,9.6,46,28,.6,'#0d0a08');fire(g,-12,0,10,7,18);fire(g,12,0,10,7,20);fire(g,0,0,11,8,25);k.box(0,28,8,52,4,10,'#3a3733');k.column(0,58,0,6,34,'#26241f',8);});
  g.box(-40,.4,-56,44,.3,8,'#f0641a',.86);g.box(-40,.7,-56,38,.2,3,'#ffc23a',.86);
  k.local(-96,40,1.57,()=>{k.box(0,0,0,30,12,16,'#b3b0a0');k.box(0,12,0,33,1.6,19,'#8f8c7e');for(let i=0;i<3;i++)k.box(-7+i*7,13.6,3,4.6,.2,2,'#26211a');k.box(0,13.6,-3,10,.8,7,'#5e2a20');});
  atWall(k,-.02,ROUND_R-8,()=>{for(let r=0;r<3;r++){k.box(0,14+r*13,1,62,1.2,2,'#3f2c18');for(let c=0;c<9;c++)k.box(-28+c*7,1.2+14+r*13-11,1.6,2.2,10,.5,c%2?'#8d9096':'#b6bcc3');}});
  k.column(66,0,-82,5,14,'#3f2c18',8);for(const [x,z] of [[-20,-72],[10,-84],[60,-96]]){g.ball(x,5,z,.9,'#8ce0ff');}
  // Mithril of Moria and the arms of Durin's folk.
  armorStand(k,g,82,28,-.8,true);armorStand(k,g,104,6,-1.2,false);weaponRack(k,70,52,-.5);
 },
 treasury(k,g){
  // The great hall runs deep into the mountain, so the dragon lies at his full length with room to spare.
  k.local(0,-37,0,()=>discFloor(k,'#403a2c',null,12,160));for(let i=0;i<150;i++){const a=i*2.399,r=6+i*.98,z0=-37;k.column(Math.cos(a)*r,.05,z0+Math.sin(a)*r,1.4,.25,'#c9962d',8);}
  for(const [x,z] of [[-146,-30],[146,-40],[-112,-128],[112,-128],[-48,-178],[48,-178],[-130,34]]){column(k,x,z,9,66,'#5f5a48','#c9962d',3);}
  // Heaps of gold under the arch of the hall, and the Arkenstone above them.
  for(const [x,z,r] of [[-48,-84,34],[44,-88,38],[-92,-34,24],[94,-44,16],[0,-100,30]]){k.hill(x,-.5,z,r,.6,'#c9962d',Math.abs(x)+1);k.hill(x+4,-.5,z+3,r*.7,.6,'#deb04a',Math.abs(z));for(let i=0;i<16;i++){const a=i*2.4;{const f=.3+(i%4)*.18;k.column(x+Math.cos(a)*r*f,r*.6*Math.sqrt(1-f*f)-.2,z+Math.sin(a)*r*f,1.9,.5,'#ffdc7a',8);}}for(let i=0;i<3;i++)k.box(x-8+i*8,r*.2,z+r*.4,5,3,3,'#a9812c',i);}
  for(const [x,z,r] of [[-48,-84,34],[44,-88,38],[-92,-34,24],[94,-44,16],[0,-100,30]])hoard(k,g,x,z,r,Math.abs(x*7+z)+11);
  arkenstoneStand(k,3,-30);
  // The armoury of the kings under the mountain: harness, mithril and racks of arms.
  armorStand(k,g,-100,70,.7,false);armorStand(k,g,-118,52,.9,true);armorStand(k,g,100,62,-.7,true);weaponRack(k,118,30,-1.2);weaponRack(k,-84,86,.4);
  chest(k,-32,-44,.3);chest(k,38,-40,-.3);chest(k,-70,-8,1.1);
  longTable(k,0,72,60,24,'#5e4322','#3a2a18');k.box(-5,13.9,74,26,1,16,'#d8cfae');k.box(16,13.9,72,6,5,6,'#c9962d');candles(k,g,-24,13.9,76);for(let i=0;i<5;i++)k.column(22,13.9+i*.6,64,2.4,.5,'#ffdc7a',8);
 },
 scouts(k,g){
  // The hall of the Hornburg: worn flagstones, a fire in its ring of stone, the horses of Rohan on green banners, the shields of the Westfold.
  discFloor(k,'#5e5a4c');flagstones(k,'#6d6854');
  for(const [x,z] of [[-46,-78],[46,-78]])column(k,x,z,6,56,'#716d5e','#8a8674',2);
  longTable(k,0,-72,54,18,'#5e4322','#3a2a18');k.box(0,13.9,-72,40,.3,12,'#c9bf96');k.box(-8,14.2,-72,20,.2,.8,'#4f7f9b',.2);candles(k,g,14,13.9,-76);
  k.column(0,0,10,13,1.6,'#54503f',18);for(let i=0;i<14;i++){const a=i/14*TAU;k.box(Math.sin(a)*12,1.2,10+Math.cos(a)*12,4,1.6,3,'#6d6854',a);}fire(g,0,1.6,10,6,16);
  for(const a of [-.62,.62])atWall(k,a,ROUND_R-8,()=>{k.box(0,44,1,30,1.2,1.2,'#26211a');k.box(0,12,.8,26,32,.5,'#2f5a30');k.box(0,8,.8,26,4,.5,'#c9a23c');k.box(0,26,1.1,12,7,.3,'#e8e4d4');k.box(5,32,1.1,3.4,7,.3,'#e8e4d4');for(const s of [-5,-2,2,5])k.box(s,19,1.1,1.2,7,.3,'#e8e4d4');});
  for(const a of [-1.5,-1.15,1.15,1.5])atWall(k,a,ROUND_R-7,()=>{k.add(k.cylinder(1,1,1,16),0,30,1,7,.8,7,a<0?'#2f5a30':'#7a3a28',0,Math.PI/2);k.ball(0,30,1.6,1.8,'#c9a23c',.5);k.box(-1,14,1,1.2,12,.6,'#c5cbd2');});
  atWall(k,0,ROUND_R-9,()=>{k.box(0,0,0,26,6,14,'#6d6854');k.box(0,6,-2,16,4,8,'#4a3219');k.box(0,10,-5.4,16,22,1.6,'#4a3219');k.box(0,32,-5.4,20,3,2,'#c9a23c');});
  atWall(k,.28,ROUND_R-7,()=>{k.box(-5,34,.5,1,6,1,'#26211a');k.box(5,34,.5,1,6,1,'#26211a');k.limb([[-10,30,1.2,.7],[-2,33,1.4,1.1],[6,32,1.4,1.8],[11,29,1.3,2.6]],'#d8cfae',8);});
  atWall(k,2.25,ROUND_R-10,()=>{barrel(k,-12,0,14,5.4);barrel(k,2,2,14,5.4);crate(k,16,1,11);});
  atWall(k,-2.25,ROUND_R-9,()=>{k.box(0,0,0,30,5,10,'#b39a4a');for(let i=0;i<7;i++)k.ball(-11+i*3.6,6,(i%2)*2-1,2.8,'#c9ad5a',.7);});
  for(const [x,z] of [[-46,-22],[46,-22]])hangingLamp(k,g,x,z,54,12,'#ffd08a');
  // The fire warms a long bench; spears wait in their rack, helms and mail on the stand, as before the battle.
  for(const s of [-1,1]){k.local(s*30,50,s*.7,()=>{k.box(0,0,0,30,5,6,'#4a3219');k.box(0,5,0,32,1,7,'#5e4322');});}
  atWall(k,-.92,ROUND_R-9,()=>{k.box(0,0,0,34,2,6,'#3a2a18');k.box(0,24,-1,34,2,3,'#3a2a18');for(let i=0;i<8;i++){k.column(-14+i*4,0,1,.5,34,'#4a3219',5);k.cone(-14+i*4,34,1,1,5,'#b4b6b0',4);}});
  atWall(k,.92,ROUND_R-9,()=>{for(const x of [-10,10]){k.column(x,0,0,.9,24,'#3a2a18',6);k.box(x,24,0,8,1,1,'#3a2a18');k.limb([[x,23,.6,4.2],[x,14,.6,4.8],[x,5,.6,4.4]],'#8d9096',8);k.dome(x,26,0,3.2,'#b4b6b0',1.1);}});
 },
 observatory(k,g){
  // The Dome of Stars: a starred floor, the great palantír, and the walls hung with charts of the markets.
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#3b3a35',40);for(let i=0;i<8;i++){const a=i/8*TAU;k.box(Math.sin(a)*46,.1,-Math.cos(a)*46,3-i%2,.12,92,'#b5a578',-a);}for(const f of [.4,.78])for(let i=0;i<40;i++){const a=i/40*TAU;k.box(Math.sin(a)*ROUND_R*f,.1,-Math.cos(a)*ROUND_R*f,.5,.12,ROUND_R*f*TAU/38,'#b5a578',Math.PI-a);}for(let i=0;i<36;i++){const a=i*2.399,r=10+i*3;g.ball(Math.cos(a)*r,.3,Math.sin(a)*r,.45,'#fff8dc');}
  k.column(0,0,0,20,3,'#5c584d',18);k.column(0,3,0,14,3,'#7c796a',18);k.cyl(0,6,0,4.4,8,16,'#b9b6a4',12);k.cyl(0,22,0,9,4.4,4,'#b9b6a4',12);osgiliathStand(k,0,0);
  const chart=(a,seed)=>atWall(k,a,ROUND_R-8,()=>{k.box(0,10,0,46,36,1.4,'#efe4c8');k.box(0,8,-.2,50,40,1,'#1a2233');let y=20;for(let i=0;i<10;i++){const h=3+((i*seed)%7)*2.2,up=(i*seed)%3!==0;k.box(-19+i*4.2,y,.9,2.4,h,.3,up?'#2f7a4a':'#a02a14');k.box(-19+i*4.2,y-1.4,.9,.4,h+2.8,.2,'#26211a');y+=up?1.4:-.8;}});
  chart(-.75,5);chart(.75,7);chart(-1.55,3);
  atWall(k,1.5,ROUND_R-8,()=>bookcase(k,50,46,3,'#3f2c18'));atWall(k,0,ROUND_R-8,()=>{k.box(0,12,0,40,34,1,'#0b1430');for(let i=0;i<24;i++)k.ball(-18+((i*29)%37),15+((i*17)%29),.8,.45,'#fff8dc');});
  longTable(k,66,-44,44,20,'#55391c','#3f2c18',-.8);papers(k,66,13.9,-44,5);candles(k,g,76,13.9,-52);chair(k,52,-28,2.3);
 },
 gate(k,g){
  // The Tower Hall: black marble pillars, the kings in stone, the empty throne, the Steward's chair at its foot.
  squareFloor(k,'#c9c6b6');for(let u=-5;u<5;u++)for(let v=-5;v<5;v++)if((u+v)&1)k.box((u+.5)*23,.08,(v+.5)*23,23,.14,23,'#3c3a36');
  for(const x of [-74,74])for(const z of [-88,-44,0,44]){column(k,x,z,5.4,62,'#17181c','#a7a496',2);}
  k.box(0,0,12,36,.3,S*2-34,'#15161d');k.box(0,.3,12,30,.2,S*2-40,'#20222c');
  k.box(0,0,-96,70,5,30,'#a7a496');k.box(0,5,-98,50,4,24,'#bcb9aa');k.box(0,9,-104,34,3,14,'#ded9c8');
  k.box(0,12,-106,22,8,10,'#15161d');k.box(0,20,-110,22,36,3,'#15161d');k.cone(0,56,-110,12,14,'#a7a496',5);for(const a of [-11,11])k.box(a,20,-106,2,10,10,'#17181c');
  k.box(0,5,-72,14,8,12,'#26262a');k.box(0,13,-77,14,18,2,'#26262a');
  // The White Tree in cloth on the wall behind, and the keepers of the records to either side.
  for(const x of [-52,52])k.local(x,-S+2,0,()=>{k.box(0,12,.6,34,44,.6,'#15161d');k.box(0,18,1,1.2,28,.3,'#ece9dc');for(const [h,w] of [[26,10],[32,13],[38,9]]){k.add(k.cube(),-w/2,h,1,w,.8,.3,'#ece9dc',0,0,.55);k.add(k.cube(),w/2,h,1,w,.8,.3,'#ece9dc',0,0,-.55);}for(let i=0;i<7;i++)k.ball(-9+i*3,48-(i%2)*2,1,.7,'#ece9dc');});
  for(let i=0;i<3;i++)k.local(-S+6,-54+i*44,Math.PI/2,()=>bookcase(k,36,50,i*2,'#26211a'));for(let i=0;i<3;i++)k.local(S-2,-54+i*44,-Math.PI/2,()=>archedWindow(k,g,22,32,'#a9c6d6','#cfccbd'));
  longTable(k,-52,-10,28,16,'#3a2a1c','#20160c',1.57);papers(k,-52,13.9,-10,5);
  for(const x of [-30,30]){k.column(x,0,-56,1.6,26,'#a7a496',8);k.column(x,26,-56,4,1,'#26211a',8);fire(g,x,27,-56,2.6,10);}
 },
};

function ivy(k,x,z,r,h,seed=0){
 const path=[];for(let t=0;t<=12;t++){const a=t*.8+seed;path.push([x+Math.sin(a)*(r+.5),2+t/12*h,z+Math.cos(a)*(r+.5),.34]);}k.limb(path,'#3a2f1c',5);
 for(let i=0;i<30;i++){const t=i/30,a=t*9.6+seed+(i%3)*.5,out=r+.8+(i%2)*.6;k.add(k.octa(1),x+Math.sin(a)*out,2+t*h,z+Math.cos(a)*out,1.8,1,1.8,i%3?'#3f5f36':'#54763f',i*1.3);}
}
// Tongues of fire around a bright heart, never one solid cone.
function fire(g,x,y,z,r,h){g.column(x,y,z,r*.8,.35,'#ff5a14',10);for(const [a,b] of [[.5,.3],[-.55,.2],[.1,-.55],[-.2,.5]])g.ball(x+a*r,y+.5,z+b*r,r*.16,'#ffb24a');fireAt(g,x,y+.3,z,r,h);}
// A true hearth: an arched opening in a stone breast, soot behind it, iron dogs and logs, a mantel on corbels.
function hearth(k,g,w,h,stone,shade,wood,breast=0){
 const open=w*.6,high=h*.66,side=(w-open)/2;
 if(breast)k.box(0,h,0,w*.82,breast-h,9,stone);
 for(const s of [-1,1]){k.box(s*(open+side)/2,0,5,side,h,14,stone);for(let i=0;i<4;i++)k.box(s*(open+side)/2,3+i*h/4,12.1,side+.5,.5,.4,shade);k.box(s*(open/2+.5),0,11.8,1,high,.6,shade);}
 k.box(0,high,5,open+1,h-high,14,stone);k.box(0,0,-1.2,open+2,h,1.6,'#120e0b');k.box(0,0,5,open,.5,12,'#191410');
 for(let i=0;i<7;i++){const a=(i+.5)/7*Math.PI,x=Math.cos(a)*(open/2+1.4),y=high-open*.28+Math.sin(a)*open*.42;k.box(x,y,11.7,open/6,3,1.2,i===3?stone:shade,0);}
 g.box(0,high*.12,-.2,open*.72,high*.5,.2,'#6e2108');g.box(0,.5,4.6,open*.74,.25,8,'#ff5a14');
 for(const s of [-1,1]){k.box(s*open*.3,.5,5,.9,3.4,9,'#26211a');k.ball(s*open*.3,4.2,9.6,.9,'#2e2a24');k.box(s*open*.3,.5,1.4,.9,6,.9,'#26211a');}
 for(const [a,b,c,d] of [[-.34,3,.34,3.6],[-.3,4.4,.3,6.2],[-.28,5.6,.26,3]])k.limb([[a*open,2.7+(c>.3?1:0),b,1.35],[c*open,2.9,d,1.15]],'#2c1a0d',7);
 fire(g,0,2.6,4.6,open*.26,high*.82);
 k.box(0,h,6,w+8,2.2,16,wood);k.box(0,h+2.2,6,w+11,.9,17.5,wood);for(const s of [-1,1])k.box(s*(w/2-2),h-5,11,3,5,5,wood);
 k.box(0,0,17,w+10,.6,9,shade);
}
function hangingLamp(k,g,x,z,top,drop,color='#ffd98a',r=2.2){k.column(x,top-drop,z,.25,drop,'#26211a',5);k.column(x,top-drop-.6,z,r+.8,.6,'#26211a',8);g.lamp(x,top-drop-1.4,z,r);k.cone(x,top-drop-4.4,z,r+.5,.1,'#26211a',8);}
function gear(k,r,color,y=24){k.disc(0,y,1.5,r,2.4,color);k.disc(0,y,2.8,r*.3,1,'#54565a');for(let i=0;i<12;i++){const a=i/12*TAU;k.add(k.cube(),Math.cos(a)*(r+1.2),y+Math.sin(a)*(r+1.2),1.5,3,3,2.4,color,0,0,a);}for(let i=0;i<4;i++){const a=i/4*TAU+.4;k.add(k.cube(),Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,2.9,r*.7,1.8,.6,'#26262a',0,0,a);}}
function flagstones(k,color,r=ROUND_R-3,n=70){for(let i=0;i<n;i++){const a=i*2.399,d=Math.sqrt((i+.5)/n)*r*.97,s=7+(i%4)*2.6;k.box(Math.cos(a)*d,.05,Math.sin(a)*d,s*1.4,.16,s,color,a*.6);}}
function runeBand(k,w,y,color){k.box(0,y,1,w,5,1,'#2a2824');for(let i=0;i<Math.floor(w/4);i++){const x=-w/2+2+i*4;k.box(x,y+.8,1.6,.6,3.4,.3,color);if(i%2)k.add(k.cube(),x+1,y+2.6,1.6,.5,2.2,.3,color,0,0,.7);}}

// A second pass through every room: the things people actually live and work with.
const roomDetails={
 messengers(k,g){
  // Armchair and footstool by the fire, cloaks by the door, the pantry's pans, a hand-drawn map.
  // Two armchairs turned to the fire.
  {const fx=Math.sin(.95)*ROUND_R*.94,fz=-Math.cos(.95)*ROUND_R*.94;for(const [x,z,stool] of [[77,-33,true],[57,-62,false]])k.local(x,z,Math.atan2(fx-x,fz-z),()=>{for(const [a,b] of [[-6,-5],[6,-5],[-6,5],[6,5]])k.box(a,0,b,1.4,2.4,1.4,'#2c1d0e');k.box(0,2.4,0,14.6,5,13.4,'#6e2f1c');k.box(0,7.4,1,12,1.8,10.6,'#8f3c24');k.box(0,7.4,-6,14.6,14,2.8,'#7a3820');k.box(0,21,-6,11,2.2,2.8,'#7a3820');for(const s of [-1,1]){k.box(s*7.2,7.4,-.5,2.4,5,13,'#5e2818');k.limb([[s*7.2,12.6,-6,1.3],[s*7.2,12.8,5.8,1.3]],'#5e2818',7);k.box(s*7.2,7.4,-6,2.8,15,3,'#6e3220');}if(stool){k.box(0,1.2,15,9,3,7,'#55391c');k.box(0,4.2,15,9.6,1.2,7.6,'#8f3c24');}});}
  for(let i=0;i<4;i++)atWall(k,-1.66+i*.06,ROUND_R-8,()=>{k.box(0,30,.8,1,1,3,'#26211a');if(i%2===0)k.limb([[0,30,2.2,1.5],[0,24,2.6,2.8],[0,14,2.8,3.6]],i?'#54602f':'#7a3a28',8);});
  atWall(k,-1.9,ROUND_R-9,()=>{k.box(0,47,3,44,1,1,'#26211a');for(let i=0;i<5;i++){k.column(-16+i*8,43,3,.2,4,'#26211a',4);k.dome(-16+i*8,39,3,2.8+(i%2),i%2?'#7a4a24':'#54565a',-.7);}});
  atWall(k,-.28,ROUND_R-8,()=>{k.box(0,22,.9,17,21,.4,'#c9b98c');k.box(0,21.4,.7,18.4,22.2,.3,'#3f2c18');for(const [a,b,c] of [[-4,28,.8],[3,32,-.5],[0,26,.2],[5,27,1]])k.add(k.cube(),a,b,1.2,6,.4,.2,'#5a4a2c',0,0,c);k.box(-3,35,1.2,3,.5,.2,'#8f2a1a');});
  atWall(k,2.45,ROUND_R-14,()=>{k.box(0,0,0,34,9,11,'#55391c');k.box(0,9,.4,36,1.2,12,'#3f2c18');k.box(-8,10,1,7,3,5,'#7a3820');k.column(9,10,1,2.6,5,'#6a7a4a',8);});
  barrel(k,-104,-14,14,5);barrel(k,-108,6,14,5);
  atWall(k,-2.5,ROUND_R-14,()=>{barrel(k,-10,0,16,6);barrel(k,5,2,14,5.4);crate(k,20,1,11);});
  hangingLamp(k,g,0,-22,44,6);
 },
 isengard(k,g){
  // Saruman's iron machinery, his books and rows of pikes: a workshop of war behind the polished stone.
  atWall(k,-1.57,ROUND_R-9,()=>{gear(k,14,'#3a3a40',28);k.local(-15,0,0,()=>gear(k,8,'#2c2c31',16));k.box(0,0,0,40,8,8,'#1f1f24');});
  atWall(k,-2.35,ROUND_R-8,()=>bookcase(k,34,50,5,'#141417'));
  atWall(k,1.57,ROUND_R-10,()=>{k.box(0,0,0,48,2,8,'#26211a');k.box(0,26,-1,48,2,3,'#26211a');for(let i=0;i<10;i++)k.column(-20+i*4.4,0,1,.5,38,'#3a3a40',5);for(let i=0;i<10;i++)k.cone(-20+i*4.4,38,1,1.1,5,'#7c7f84',4);});
 },
 library(k,g){
  // Window seats, urns with climbing plants, lanterns under the ceiling and a star of inlaid brass.
  for(let i=0;i<5;i++){const x=-88+i*44;k.box(x,0,-S+11,30,6,10,'#d8d0b6');k.box(x,6,-S+11,31,1,11,'#27465e');}
  for(const [x,z] of [[-92,-86],[92,-86]]){k.cyl(x,0,z,7,4,12,'#b5a578',12);k.column(x,12,z,7.6,1,'#8f8058',12);k.canopy(x,21,z,8.6,['#3f5f36','#54763f'],Math.abs(x),.9);}
  for(const [x,z] of [[-44,-30],[44,-30],[-44,50],[44,50],[0,10]])hangingLamp(k,g,x,z,60,10,'#ffeab4');
  for(let i=0;i<8;i++){const a=i/8*TAU;k.box(Math.sin(a)*14,.42,48-Math.cos(a)*14,2,.1,26,'#c9a24a',-a);}
  k.local(-96,-6,1.57,()=>{longTable(k,0,0,30,12,'#6a4a26','#3f2c18');for(let i=0;i<6;i++)k.add(k.cylinder(1.2,1.2,1),-11+i*4.4,14.8,0,1,10,1,'#d8cfae',0,Math.PI/2);});
 },
 lorien(k,g){
  // Cushions and a low table on the talan, a harp, bows on their rack.
  for(const [x,z,c] of [[-96,26,'#c9b878'],[-84,42,'#a9a688'],[-104,44,'#dcdcc4']]){k.ball(x,2.2,z,7,c,.34);}k.box(-92,0,62,20,5,11,'#b5b7a6');k.box(-92,5,62,22,.8,13,'#dcdccb');k.column(-96,5.8,62,1.4,3,'#b89a4a',8);
  k.limb([[92,0,60,1.2],[97,14,60,1],[94,28,60,.8],[84,34,60,.6]],'#c9b878',6);k.limb([[92,0,60,1.2],[84,6,60,.8],[80,20,60,.6],[84,34,60,.6]],'#c9b878',6);for(let i=0;i<6;i++)k.box(83+i*2.2,14+i*1.5,60,.15,14-i*1.6,.15,'#e8e8da');
  atWall(k,-1.3,ROUND_R-9,()=>{k.box(0,22,0,34,1,2,'#b5b7a6');k.box(0,14,0,34,1,2,'#b5b7a6');for(const s of [-1,1])k.box(s*16,0,0,1.4,30,1.4,'#b5b7a6');for(let i=0;i<5;i++)k.limb([[-12+i*6,8,1.6,.3],[-14+i*6,18,2.4,.4],[-12+i*6,29,1.6,.2]],'#8f8d78',4);});
 },
 council(k,g){
  // The king's jewels by his seat, wine on the map table, vines hanging from the roof, pale fungus at the roots.
  atWall(k,.3,ROUND_R-14,()=>{k.box(0,0,0,16,16,10,'#3f2f1e');k.box(0,16,0,18,1.2,12,'#55432c');for(let i=0;i<7;i++)k.add(k.octa(1.1),-5+((i*3)%10),18.4+(i%3)*.8,-1+(i%3)*1.6,1,1.3,1,'#e8f2f4',i);g.ball(0,18.6,0,.9,'#ffffff');});
  barrel(k,-100,44,15,5);
  for(const [x,z] of [[-30,-66],[6,-48],[16,-62]]){k.column(x,13.9,z,.9,.3,'#c9962d',8);k.cyl(x,14.2,z,1.3,.3,2.4,'#c9962d',8);k.column(x,16.4,z,1,.25,'#5a1020',8);}
  for(let i=0;i<8;i++){const a=-1.3+i*.37,r=ROUND_R-30-(i%3)*10,x=Math.sin(a)*r,z=-Math.cos(a)*r;k.column(x,0,z,.5,2+(i%3),'#cfc6a8',5);k.ball(x,2.4+(i%3),z,1.8,i%2?'#a8b890':'#c89a5a',.45);}
  for(let i=0;i<16;i++){const a=i*2.399,r=96+(i%4)*5,x=Math.cos(a)*r,z=Math.sin(a)*r;if(z>30||HALL_ROOTS.some(b=>Math.hypot(x-Math.sin(b)*(ROUND_R-20),z+Math.cos(b)*(ROUND_R-20))<20)||Math.hypot(x+Math.sin(1.05)*114,z+Math.cos(1.05)*114)<46)continue;k.column(x,0,z,.5,2.6,'#c9bfa0',5);k.dome(x,2.4,z,2.4+(i%3)*.5,i%3?'#b09a68':'#c98a3a',.5);}
 },
 forge(k,g){
  // Flagstones, carved rune bands, bellows at the great forge, chains and the anvil's tools.
  flagstones(k,'#38352f');
  barrel(k,86,28);barrel(k,104,48);barrel(k,86,44,12,4.6);
  atWall(k,-.86,ROUND_R-36,()=>{k.local(26,6,0,()=>{k.limb([[0,4,-6,1.8],[0,8,0,7],[0,8.5,6,7],[0,8,13,1.2]],'#3f2c18',10);k.box(0,0,3,10,4,16,'#26211a');});});
  for(const a of [.84,1.12,-.46])atWall(k,a,ROUND_R-7,()=>{runeBand(k,30,44,'#c7e6f2');runeBand(k,30,12,'#8d9096');});
  atWall(k,-2.32,ROUND_R-8,()=>hearth(k,g,38,30,'#55524c','#3a3733','#3f2c18',50));
  atWall(k,.47,ROUND_R-8,()=>{k.box(0,0,.6,26,40,1.4,'#17151a');k.box(-15,0,.8,4,44,2.4,'#55524c');k.box(15,0,.8,4,44,2.4,'#55524c');k.box(0,40,.8,34,5,2.4,'#55524c');k.box(0,45,.8,24,5,2.4,'#55524c');k.box(0,50,.8,12,4,2.4,'#55524c');});
  for(const [x,z] of [[-30,-92],[30,-96]])for(let i=0;i<7;i++)k.box(x,62-i*4.2,z,i%2?1:2.2,3.4,i%2?2.2:1,'#54565a');
  atWall(k,1.6,ROUND_R-14,()=>{for(let i=0;i<3;i++){k.box(-20+i*20,0,0,16,11,14,'#3a342c');for(let c=0;c<4;c++)k.rock(-24+i*20+c*2.6,11+(c%2),c%3-1,3.2,2.6,3,'#66625a',c+i);}});
 },
 treasury(k,g){
  // The accounts: ledgers, scales, an abacus; gold-bound doors of carved stone in the walls.
  k.local(0,-37,0,()=>flagstones(k,'#4c4534',158,84));
  k.column(30,13.9,76,3.6,.6,'#c9962d',12);k.column(30,14.5,76,.5,10,'#c9962d',6);k.box(30,24,76,14,.5,.8,'#c9962d');for(const s of [-1,1]){k.column(30+s*6,20,76,2.2,.3,'#deb04a',10);for(const q of [-1,1])k.box(30+s*6+q*1.2,20.3,76,.15,3.8,.15,'#c9962d');}
  k.box(-18,13.9,62,16,.8,8,'#3f2c18');for(let r=0;r<4;r++){k.box(-18,15,59.5+r*1.7,15,.3,.3,'#c9962d');for(let i=0;i<5;i++)k.ball(-23+((i*3+r)%10),15,59.5+r*1.7,.55,'#5e2a20');}
  k.local(0,-37,0,()=>atWall(k,2.35,154,()=>bookcase(k,40,50,4,'#2a2118')));
  for(const a of [-1.15,1.15])k.local(0,-37,0,()=>atWall(k,a,155,()=>{k.box(0,0,.5,24,40,1.2,'#2a1d0c');for(const s of [-1,1]){k.box(s*14,0,.8,5,46,2.6,'#6f6a58');k.box(s*14,46,.8,7,3,3.2,'#c9962d');}k.box(0,40,.8,30,6,2.6,'#6f6a58');k.box(0,41,1.5,22,3,.4,'#c9962d');k.box(0,18,1.4,3,3,.5,'#c9962d');}));
  for(const [x,z] of [[-48,-30],[48,-30]]){k.column(x,0,z,1.2,28,'#c9962d',8);k.cyl(x,28,z,3,1.2,3,'#c9962d',8);g.lamp(x,32.4,z,2.4);}
 },
 scouts(k,g){},
 observatory(k,g){
  // Instruments of the watchers: a railing around the great stone, an astrolabe, a globe, lamps from above.
  for(let i=0;i<10;i++){const a=i/10*TAU;k.column(Math.sin(a)*26,0,-72-Math.cos(a)*26,.7,13,'#c9962d',6);if(i<10)k.box(Math.sin(a+.31)*25.2,13,-72-Math.cos(a+.31)*25.2,16.6,.7,.7,'#c9962d',-(a+.31));}
  k.column(92,0,44,4.6,1.4,'#3f2c18',12);k.column(92,1,44,.9,18,'#3f2c18',8);k.ball(92,26,44,7.4,'#274887');for(let i=0;i<9;i++)k.box(92+Math.cos(i*2.1)*7,24+(i%5)*.9,44+Math.sin(i*2.1)*7,2.6,.2,1.8,'#a08a54',i);k.add(k.torus(8.4,.3),92,26,44,1,1,1,'#c9962d');
  k.column(-96,0,40,1.2,20,'#3f2c18',8);for(const [rx,rz] of [[Math.PI/2,0],[.6,.4],[1.2,1]])k.add(k.torus(7.4,.3),-96,27,40,1,1,1,'#c9962d',0,rx,rz);
  for(const [x,z] of [[-46,-20],[46,-20],[-46,30],[46,30]])hangingLamp(k,g,x,z,56,14,'#ffd98a',1.8);
 },
 gate(k,g){
  // Torches on the pillars, racks of sealed records, the guard's spears and a brazier either side of the throne.
  for(const x of [-74,74])for(const z of [-44,44])k.local(x+(x<0?5.4:-5.4),z,x<0?Math.PI/2:-Math.PI/2,()=>torch(k,g,30));
  for(const x of [-44,44]){k.column(x,0,-84,3,1,'#26211a',10);k.column(x,1,-84,.8,16,'#26211a',8);k.cyl(x,17,-84,5,2,3,'#26211a',10);fire(g,x,20,-84,3.4,12);}
  k.local(-100,70,Math.PI/2,()=>{longTable(k,0,0,30,12,'#3a2a1c','#20160c');for(let i=0;i<6;i++){k.add(k.cylinder(1.2,1.2,1),-11+i*4.4,14.8,0,1,10,1,'#d8cfae',0,Math.PI/2);k.column(-11+i*4.4,14.2,5,.8,.5,'#7a1a12',6);}});
  for(let i=0;i<5;i++)k.column(100,0,-104+i*3.4,.4,44,'#3a2a18',5),k.cone(100,44,-104+i*3.4,1,5,'#c9ced4',4);
  chair(k,-36,-16,-1.57,'#20160c');
 },
};
// A seeing stone set as in the Dark Tower: a ring of gold on its dais with rays of ember, a ring of fire and a ring of gold circling it in the air, a gold collar below it and a brazier either side.
function seeingStone(k,g,x,y,z,r,dais,flames){
 g.add(g.torus(dais+.4,.3),x,2.2,z,1,1,1,'#ffb23a',0,Math.PI/2);for(let i=0;i<12;i++){const a=i/12*TAU;g.box(x+Math.sin(a)*(dais-2.6),2.15,z+Math.cos(a)*(dais-2.6),.3,.15,2,'#ff7a2a',a);}
 g.add(g.torus(r*1.6,.32),x,y,z,1,1,1,'#ff5a12',0,Math.PI/2+.35);g.add(g.torus(r*1.88,.2),x,y,z,1,1,1,'#ffb23a',.9,Math.PI/2-.3);g.add(g.torus(r*1.12,.3),x,y-r*1.05,z,1,1,1,'#c9962d',0,Math.PI/2);
 for(const [fx,fz] of flames){k.cyl(fx,0,fz,1.8,1,y*.32,'#26211a',6);k.cyl(fx,y*.32,fz,3.2,1.8,1.8,'#26211a',8);g.lamp(fx,y*.32+4,fz,2.6);}
}
function statue(k,x,z,ry,stone){k.local(x,z,ry,()=>{k.box(0,0,0,12,6,12,'#a7a496');k.box(0,6,0,8,22,6,stone);k.box(0,28,0,9,4,6.4,stone);k.ball(0,34.6,0,3.4,stone);k.cone(0,37.4,0,3.2,3,'#c9b67a',6);k.box(0,8,4,1,26,1,'#a7a496');k.box(0,32,4.2,2.4,10,.6,'#c9ced4');});}
// A third pass: the richness of the Dark Tower brought to every room, each in its own manner.
const roomGlory={
 messengers(k,g){
  // Paintings of the Shire, a stand of walking sticks by the door, flowers in tubs and the tall clock.
  for(const a of [.55,1.3])atWall(k,a,ROUND_R-7.5,()=>{k.box(0,24,.6,18,14,.8,'#7a5a2a');k.box(0,25.2,1.1,15,11.6,.3,'#7fa6b8');k.box(0,25.2,1.25,15,5,.3,'#5f8a3e');k.ball(a>1?4:-3,31,1.3,1.6,'#e8d27a',.3);k.box(-2,30,1.3,3,2,.3,'#8f6a3c');});
  atWall(k,-.98,ROUND_R-12,()=>{k.cyl(0,0,0,2.8,2.4,10,'#4a3219',10);for(const [a,b] of [[-1,-.6],[.8,.4],[0,1]])k.limb([[a,1,b,.35],[a*1.6,24,b*1.6,.35],[a*1.6+1.4,25,b*1.6,.35]],'#6a4a26',4);});
  for(const a of [-.78,-.36])atWall(k,a,ROUND_R-13,()=>{k.cyl(0,0,0,4,3,6,'#8a4a2a',10);k.ball(0,8,0,4.6,'#4f7a36',.8);for(let i=0;i<7;i++)k.ball(Math.sin(i*2.4)*3.4,9.6+(i%2),Math.cos(i*2.4)*3.4,.9,i%2?'#e85a6a':'#f2d24a');});
  atWall(k,3.1,ROUND_R-9,()=>{k.box(0,0,0,9,40,6,'#55391c');k.box(0,40,0,10,3,7,'#3f2c18');k.disc(0,33,3.2,3.4,.4,'#e8dcc0');k.box(0,33,3.6,.3,2.6,.2,'#26211a');k.box(0,8,3.1,5,18,.3,'#2a1d0c');k.column(0,13,3.4,1.4,.4,'#c9962d',10);k.box(0,17,3.4,.3,9,.3,'#c9962d');});
  for(const [x,z] of [[-20,-62],[30,-60]])candles(k,g,x,13.9,z);
 },
 isengard(k,g){
  // The White Hand on black banners, a ring of silver round the stone, iron lamps on chains, the weapons of his armies.
  for(const a of [-1.2,1.2])atWall(k,a,ROUND_R-7,()=>{k.box(0,52,1,18,1.2,1.2,'#26211a');k.box(0,12,.8,16,40,.5,'#0d0d10');k.box(0,28,1.1,6,6,.3,'#e7e7df');for(let i=0;i<4;i++)k.box(-2.4+i*1.6,33.4,1.1,1,4.6+(i%2),.3,'#e7e7df');k.add(k.cube(),-4.4,29,1.1,1,4,.3,'#e7e7df',0,0,.7);k.box(0,12,1.1,16,2,.3,'#7c7f84');});
  for(const r of [20,26])k.add(k.torus(r,.35),0,.3,0,1,1,1,'#7c7f84',0,Math.PI/2);
  for(const [x,z] of [[-60,40],[60,40],[0,-36]])hangingLamp(k,g,x,z,60,12,'#ffb070',2.4);
  atWall(k,3.0,ROUND_R-12,()=>weaponRack(k,0,0,0));candles(k,g,-14,13.9,-36);
  seeingStone(k,g,0,33,0,8,14,[[-22,10],[22,10]]);
 },
 forge(k,g){
  // Dwarf lamps under the vaults, Durin's door drawn in ithildin, an anvil with a glowing bar, veins of mithril in the rock.
  for(const [x,z] of [[-30,-30],[40,-20],[0,40],[-60,20]])hangingLamp(k,g,x,z,64,14,'#ffd08a',2.4);
  atWall(k,2.9,ROUND_R-7,()=>{k.box(0,0,.4,36,52,1,'#1c1c20');const ith='#cfe8ff';for(const s of [-1,1]){g.box(s*12,4,1.1,.4,30,.3,ith);g.box(s*10,4,1.1,.3,28,.3,ith);}for(let i=0;i<11;i++){const a=(i+.5)/11*Math.PI;g.box(Math.cos(a)*12,34+Math.sin(a)*12,1.1,.4,2.6,.3,ith);}g.box(0,8,1.1,.4,22,.3,ith);for(const s of [-1,1])g.add(g.cube(),s*3,22,1.1,.3,8,.3,ith,0,0,s*.6);for(let i=0;i<7;i++)g.ball(-6+i*2,44-Math.abs(i-3)*.8,1.2,.45,ith);g.ball(0,34,1.2,1.4,ith);});
  k.local(-20,-30,.4,()=>{k.box(0,0,0,6,8,6,'#26241f');k.box(0,8,0,14,3,6,'#3a3733');k.box(8,8.6,0,4,2,4,'#3a3733');g.box(-1,11.1,0,6,.8,1.4,'#ff8a2a');k.limb([[4,11,3,.4],[9,12,6,.4]],'#3f2c18',4);k.box(9,12,6,2,1.4,3,'#54565a');});
  for(const a of [-1.3,-.2,.3,1.9,2.4])atWall(k,a,ROUND_R-5,()=>{for(let i=0;i<5;i++)g.box(-6+i*3,18+((i*7+Math.round(a*10))%30),.6,.3,2+(i%3),.3,'#cfe8ff',i);});
 },
 treasury(k,g){
  // Golden lamps in the vault, a ring of gold round the Arkenstone, tall candelabra and glints all over the hoard.
  for(const [x,z] of [[-60,-60],[60,-60],[0,20],[-90,10],[90,0]])hangingLamp(k,g,x,z,64,16,'#ffc27a',2.6);
  for(const r of [12,16])k.add(k.torus(r,.4),3,.35,-30,1,1,1,'#deb04a',0,Math.PI/2);
  for(const s of [-1,1]){const x=s*30,z=20;k.column(x,0,z,4,1.4,'#c9962d',12);k.column(x,1.4,z,.9,26,'#c9962d',8);for(const o of [-5,0,5]){k.box(x+o,26,z,.6,.6,.6,'#c9962d');k.column(x+o,26.6,z,.5,3,'#e8dcc0',6);g.lamp(x+o,30.4,z,.8);}k.box(x,26,z,11,.8,.8,'#c9962d');}
  for(let i=0;i<30;i++){const a=i*2.399,r=30+((i*29)%90);g.ball(Math.cos(a)*r,.6,-37+Math.sin(a)*r,.4,['#ff3a4a','#3ac8ff','#5aff8a','#ffffff','#ffd25a'][i%5]);}
 },
 council(k,g){
  // Fireflies among the roots, pale lanterns of the Woodland Realm, beds of moss and white flowers.
  for(let i=0;i<54;i++){const a=i*2.399,r=20+((i*37)%96),x=Math.cos(a)*r,z=Math.sin(a)*r;g.ball(x,8+((i*13)%40),z,.35,i%3?'#e8f8b0':'#fff4c0');}
  for(let i=0;i<10;i++){const a=-1.4+i*.31,r=ROUND_R-34,x=Math.sin(a)*r,z=-Math.cos(a)*r;k.column(x,30,z,.2,18,'#3a2b1a',4);k.ball(x,29,z,2.2,'#c9d8a8',1.3);g.ball(x,29,z,1.2,'#f4ffd8');}
  for(let i=0;i<24;i++){const a=i*2.399+.4,r=60+((i*23)%50),x=Math.cos(a)*r,z=Math.sin(a)*r;if(z>30)continue;k.ball(x,.2,z,3+(i%3),'#3f5a2a',.2);k.ball(x+1,.8,z,.7,'#f4f4e8');}
 },
 scouts(k,g){
  // The golden horse of the Eorlingas on a great green cloth, torches either side of the hall, mead cups on the benches, rushes strewn on the floor.
  for(const a of [2.75,-2.75])atWall(k,a,ROUND_R-7,()=>{k.box(0,48,1,28,1.2,1.2,'#26211a');k.box(0,12,.8,24,36,.5,'#2f5a30');k.box(0,12,1,24,3,.4,'#c9a23c');k.box(-2,28,1.1,12,5,.3,'#c9a23c');k.box(-8,23,1.1,1.4,6,.3,'#c9a23c');k.box(4,23,1.1,1.4,6,.3,'#c9a23c');k.add(k.cube(),5,33,1.1,2,7,.3,'#c9a23c',0,0,-.5);k.box(6.4,36,1.1,3,2.4,.3,'#c9a23c');});
  for(const a of [-1.85,1.85,-.42,.42])atWall(k,a,ROUND_R-7,()=>torch(k,g,30));
  for(const s of [-1,1])k.local(s*30,50,s*.7,()=>{for(const o of [-8,0,9]){k.cyl(o,6,0,1.1,.8,2.4,'#c9a23c',8);}});
  for(let i=0;i<60;i++){const a=i*2.399,r=24+((i*31)%86),x=Math.cos(a)*r,z=Math.sin(a)*r;k.box(x,.2,z,.3,.1,4+(i%3),i%2?'#b39a4a':'#8f7a3a',a*1.3);}
 },
 lorien(k,g){
  // Silver lanterns hang from the boughs; elanor and niphredil grow along the rail; the water of the Mirror holds the stars.
  for(let i=0;i<8;i++){const a=i/8*TAU+.2,r=74,x=Math.sin(a)*r,z=-Math.cos(a)*r;if(Math.hypot(x,z+118)<44)continue;k.column(x,40,z,.15,14,'#b5b7a6',4);k.cyl(x,36,z,1.6,1.2,4,'#dcdccb',6);g.lamp(x,37.6,z,1.6);}
  for(let i=0;i<70;i++){const a=i/70*TAU,r=ROUND_R-8-(i%3)*2,x=Math.sin(a)*r,z=-Math.cos(a)*r;if(Math.hypot(x,z+118)<30)continue;k.column(x,0,z,.15,2+(i%2),'#6f9a46',4);g.ball(x,2.4+(i%2),z,.6,i%2?'#ffd84a':'#f4f8ff');}
  for(let i=0;i<9;i++)g.ball(-20+Math.sin(i*2.4)*6,13.6,-58+Math.cos(i*2.4)*6,.3,'#ffffff');
 },
 observatory(k,g){
  // A ring of gilded signs on the floor, a brass telescope aimed at the dome, star lanterns, and the great stone set like the one in the Dark Tower.
  for(let i=0;i<12;i++){const a=i/12*TAU,x=Math.sin(a)*60,z=-Math.cos(a)*60;k.column(x,.1,z,3.2,.2,'#c9962d',12);k.column(x,.2,z,2.2,.2,'#3b3a35',12);k.box(x,.35,z,.4,.1,3,'#c9962d',a+i);}
  k.add(k.torus(60,.4),0,.25,0,1,1,1,'#b5a578',0,Math.PI/2);
  atWall(k,-2.4,ROUND_R-22,()=>{k.cyl(0,0,0,3,2,4,'#3f2c18',8);for(const s of [-1,1])k.limb([[s*2,4,0,.5],[s*1,20,0,.5]],'#3f2c18',4);k.limb([[0,22,-8,1.6],[0,30,6,2.2],[0,34,12,2.6]],'#a08a54',10);k.add(k.torus(2.7,.4),0,34,12,1,1,1,'#c9962d',0,1);});
  for(let i=0;i<8;i++){const a=i/8*TAU+.4,r=86,x=Math.sin(a)*r,z=-Math.cos(a)*r;k.column(x,44,z,.15,12,'#3f2c18',4);g.ball(x,43,z,1.4,'#fff4c8');for(let j=0;j<4;j++)g.box(x,43,z,.2,4.4,.2,'#fff8dc',0);}
  seeingStone(k,g,0,36,0,12,20,[[-30,12],[30,12]]);
 },
 library(k,g){
  // White flowers in silver vases, a lectern with an open book, golden leaves drifting in, silver lamps and candles on tall stands.
  for(const [x,z] of [[-44,-60],[44,-60]]){k.cyl(x,13.9,z,1.6,2.4,5,'#c9ced4',10);for(let i=0;i<6;i++){k.limb([[x,18,z,.15],[x+Math.sin(i)*2.4,23+(i%2),z+Math.cos(i)*2.4,.15]],'#4f7a36',3);k.ball(x+Math.sin(i)*2.4,23.6+(i%2),z+Math.cos(i)*2.4,.9,'#f4f4ec');}}
  k.local(60,10,-.6,()=>{k.column(0,0,0,4,1.2,'#4a3219',10);k.column(0,1.2,0,1,16,'#4a3219',8);k.box(0,17,0,10,1,8,'#4a3219',0);k.box(-2.4,18,0,4.6,.6,6.4,'#efe4c8');k.box(2.4,18,0,4.6,.6,6.4,'#efe4c8');k.box(0,18.2,0,.4,.6,6.4,'#5e2a20');});
  for(let i=0;i<26;i++){const a=i*2.399,r=10+((i*41)%80),x=Math.cos(a)*r,z=Math.sin(a)*r*.9;k.box(x,.25,z,2.2,.1,1.4,i%2?'#d8a83a':'#c98a2a',a);}
  for(const [x,z] of [[-60,30],[60,30],[-60,-30],[60,-30]]){k.column(x,0,z,3,1,'#c9ced4',10);k.column(x,1,z,.6,22,'#c9ced4',6);k.column(x,23,z,2.6,.6,'#c9ced4',10);g.lamp(x,25.4,z,.9);}
 },
 gate(k,g){
  // The kings of old in stone between the pillars, the White Tree in silver on black hangings, gold on the throne and fire bowls along the black road.
  for(const x of [-64,64])for(const z of [-66,-22,22,66])statue(k,x,z,x<0?Math.PI/2:-Math.PI/2,'#d8d4c4');
  for(const x of [-74,74])for(const z of [-88,0])k.local(x+(x<0?5.6:-5.6),z,x<0?Math.PI/2:-Math.PI/2,()=>{k.box(0,22,1,10,30,.5,'#15161d');k.box(0,28,1.3,.6,16,.3,'#ece9dc');for(const [h,w] of [[34,6],[30,8]]){k.add(k.cube(),-w/2,h,1.3,w,.5,.3,'#ece9dc',0,0,.55);k.add(k.cube(),w/2,h,1.3,w,.5,.3,'#ece9dc',0,0,-.55);}for(let i=0;i<5;i++)k.ball(-3+i*1.5,46-(i%2),1.3,.45,'#ece9dc');});
  k.box(0,20.2,-108.4,18,.6,.4,'#c9b67a');k.box(0,40,-108.4,18,.6,.4,'#c9b67a');for(const s of [-1,1])k.box(s*9.2,20,-108.4,.6,20,.4,'#c9b67a');
  for(let i=0;i<4;i++){const z=-50+i*36;for(const s of [-1,1]){k.cyl(s*24,0,z,1.4,.8,10,'#26211a',6);k.cyl(s*24,10,z,2.6,1.4,1.4,'#26211a',8);g.lamp(s*24,13,z,1.8);}}
 },
};
function rugRound(k,x,z,r,a,b){k.column(x,.1,z,r,.3,a,28);k.column(x,.2,z,r-4,.3,b,28);k.column(x,.3,z,r-7,.3,a,28);}
function rugRect(k,x,z,w,d,a,b){k.box(x,.1,z,w,.3,d,a);k.box(x,.2,z,w-5,.3,d-5,b);k.box(x,.3,z,w-9,.3,d-9,a);}

// The stub of the wall always remains, so a room stays a room when its walls lift away.
export function wallFoot(id,k){
 const plan=roomPlans[id];if(plan.rail||plan.ruin)return;
 if(!plan.round){for(const s of [-1,1]){k.box(0,0,s*(S+1),S*2+10,7,5,plan.trim);k.box(s*(S+1),0,0,5,7,S*2+10,plan.trim);}return;}
 k.local(0,plan.back??0,0,()=>{for(let i=0;i<16;i++)k.arc((plan.radius??ROUND_R)+1.4,9.8,i/16*TAU,(i+1)/16*TAU,0,7,plan.trim);});
}
for(const id of Object.keys(roomInteriors)){const base=roomInteriors[id];roomInteriors[id]=(k,g)=>{base(k,g);roomDetails[id](k,g);roomGlory[id]?.(k,g);houseRelics[id]?.(k,g);};}
// Where a walker may stand at all.
export const roomFloor=(id,x,z)=>{const plan=roomPlans[id];return plan.round?Math.hypot(x,z-(plan.back??0))<(plan.radius??ROUND_R)-7:Math.abs(x)<S-6&&Math.abs(z)<S-6;};

// Where each room's own light comes from: [x,y,z,colour,strength], and how much daylight reaches in.
export const roomLight={
 messengers:{day:.86,lamps:[[89,16,-64,'#ff9440',900],[0,34,-22,'#ffd08a',700]]},
 isengard:{day:.62,lamps:[[0,22,-66,'#ff8a3a',1700],[-50,30,-10,'#ffc08a',1100]]},
 forge:{day:.55,lamps:[[-83,18,-72,'#ff7a2a',1100],[16,38,-6,'#ff8a3e',1500]]},
 treasury:{day:.42,lamps:[[-10,46,-78,'#ffc27a',1250],[10,28,50,'#ffb45a',520]]},
 doom:{day:.12,lamps:[[0,-40,-10,'#ff5a1a',1500],[0,-90,50,'#ff7a2a',700]]},
 tower:{day:.42,lamps:[[0,120,-24,'#ff7a2a',2300],[0,250,-12,'#ff6a1a',1300],[0,44,10,'#ff4a12',1200]]},
 council:{day:.66,lamps:[[-6,34,-20,'#e0f0a8',1300],[40,34,-40,'#ffd08a',800]]},
 observatory:{day:.7,lamps:[[0,36,-50,'#ff9a4a',300],[0,44,10,'#ffd98a',280]]},
 gate:{day:.72,lamps:[[-44,28,-84,'#ff9a4a',360],[44,28,-84,'#ff9a4a',360]]},
 library:{day:.86,lamps:[[0,44,-20,'#ffe2a8',220],[0,44,50,'#ffe2a8',180]]},
 lorien:{day:1,lamps:[[-20,24,-58,'#e8f4ff',520],[60,30,-30,'#fff0b0',420],[-50,30,40,'#fff6d8',360]]},
 scouts:{day:.6,lamps:[[0,22,10,'#ff9a4a',1400],[0,36,-50,'#ffd08a',800]]},
};

// Thick walls in pieces, so that whichever part faces the camera can lift away.
// Rivendell has no walls: slender columns carry pointed arches, a low balustrade runs between them and ivy climbs the shafts, so light and air pass through.
function colonnade(k,plan,axis,sign,h){
 const at=(u,d=0)=>axis==='x'?[u,sign*(S+d)]:[sign*(S+d),u],box=(u,y,len,hh,thick,c)=>axis==='x'?k.box(u,y,sign*S,len,hh,thick,c):k.box(sign*S,y,u,thick,hh,len,c),step=19,n=6;
 box(0,0,S*2+10,1.6,12,plan.wall);box(0,h-4,S*2+8,4,6,plan.trim);box(0,h-6.4,S*2+6,2.4,4,plan.wall);
 for(let i=-n;i<=n;i++){const u=i*step,[x,z]=at(u);k.column(x,1.6,z,2.2,1.4,plan.trim,10);k.column(x,3,z,1.5,h-20,plan.wall,10);k.column(x,h-17,z,2.4,1.6,plan.trim,10);
  if(i<n){const pts=[];for(let t=0;t<=8;t++){const f=t/8,up=Math.sin(Math.min(f,1-f)*Math.PI)*.85+(f>.3&&f<.7?.15:0);const [ax,az]=at(u+f*step);pts.push([ax,h-15.4+up*8.6,az,.7]);}k.limb(pts,plan.trim,5);
   const door=sign>0&&axis==='x'&&Math.abs(u+step/2)<step;if(!door)for(let b=1;b<6;b++){const [bx,bz]=at(u+b*step/6);k.column(bx,1.6,bz,.45,8,plan.wall,6);}if(!door)box(u+step/2,9.6,step-3,1,1.6,plan.trim);}
  if((i+7)%3===0){const [vx,vz]=at(u,1.6);k.limb([[vx,2,vz,.5],[vx+.8,14,vz+.6,.4],[vx-.6,26,vz+.4,.35],[vx+.5,h-20,vz+.6,.25]],'#4f7a36',5);for(let l=0;l<5;l++)k.ball(vx+(l%2?.9:-.9),6+l*7,vz+.9,1.6,l%2?'#5f8a3e':'#6f9a46',.6);}}
}
export function buildWalls(id,makeKit){
 const plan=roomPlans[id],h=plan.height,out=[];
 if(!plan.round){
  for(const [axis,sign] of [['x',-1],['x',1],['z',-1],['z',1]]){
   if(plan.colonnade){out.push({mesh:makeKit(k=>colonnade(k,plan,axis,sign,h)),normal:axis==='x'?[0,sign]:[sign,0]});continue;}
   out.push({mesh:makeKit(k=>{
    const long=S*2+6,place=(u,y,len,height,thick,color)=>axis==='x'?k.box(u,y,sign*S,len,height,thick,color):k.box(sign*S,y,u,thick,height,len,color);
    place(0,0,long,h,5,plan.wall);place(0,0,long+1,5,7,plan.trim);place(0,h-5,long+1,5,7,plan.trim);for(let i=-3;i<=3;i++)place(i*38,0,5,h,8,plan.trim);
    if(sign>0&&axis==='x')k.box(0,0,S+1.5,30,38,3,'#26211a');
   }),normal:axis==='x'?[0,sign]:[sign,0]});
  }
  return out;
 }
 const n=plan.segments;
 for(let i=0;i<n;i++){
  const a0=i/n*TAU,a1=(i+1)/n*TAU,mid=(a0+a1)/2,r=plan.radius??ROUND_R;
  out.push({mesh:makeKit(k=>{k.local(0,plan.back??0,0,()=>{
   const height=plan.ruin?h*(.35+(((i*7)%5)/5)*.75):h,seg=(a,b,y,hh,R,t,c)=>k.arc(R,t,a,b,y,hh,c);
   if(plan.rail){seg(a0,a1,10,2,r,3,plan.wall);seg(a0,a1,0,1.2,r,5,plan.trim);k.column(Math.sin(a0)*r,0,-Math.cos(a0)*r,1.4,12,plan.trim,8);k.ball(Math.sin(a0)*r,12.6,-Math.cos(a0)*r,1.8,plan.wall);return;}
   seg(a0,a1,0,height,r,plan.ruin?10:6,plan.wall);seg(a0,a1,0,4,r+1,9,plan.trim);
   if(!plan.ruin)seg(a0,a1,height-4,4,r+1,9,plan.trim);
   if(plan.rough)for(let j=0;j<7;j++){const a=a0+(a1-a0)*(j+.5)/7;k.rock(Math.sin(a)*(r-5),6+((j*11+i*5)%10)*5,-Math.cos(a)*(r-5),9+(j%3)*3,8+(j%4)*3,6,plan.wall,i*7+j);}
   if(plan.slits){const x=Math.sin(mid)*(r-3),z=-Math.cos(mid)*(r-3);k.box(x,26,z,3,20,2,'#3a2410',-mid);}
   if(plan.arches){const x=Math.sin(mid)*(r-3.4),z=-Math.cos(mid)*(r-3.4);k.box(x,12,z,26,28,1.4,'#3a3b3c',-mid);k.disc(x,40,z,13,1.4,'#3a3b3c');}
   if(!plan.ruin){const x=Math.sin(a0)*(r-3),z=-Math.cos(a0)*(r-3);k.box(x,0,z,6,height,6,plan.trim,-a0);}
  });}),normal:[Math.sin(mid),-Math.cos(mid)]});
 }
 return out;
}
