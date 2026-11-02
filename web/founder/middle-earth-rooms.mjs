// The rooms people work in, built after the descriptions in the books: floor plan, walls and furnishings of every house.
// Pure drawing. No data from the server and no server access.
import {HALL} from './middle-earth-3d.mjs';
export const ROUND_R=124;
const {half:S}=HALL;
const TAU=Math.PI*2;
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
function torch(k,g,y=26){k.box(0,y-5,1,1.4,9,3,'#26211a');k.cone(0,y+3,3,2.2,-.1,'#26211a',8);g.cone(0,y+3,3,2,6,'#ff9a3a',7);g.cone(0,y+3,3,1,3.4,'#ffd27a',6);}
function chair(k,x,z,ry=0,wood='#4a3219'){k.local(x,z,ry,()=>{k.box(0,7,0,9,1.2,9,wood);for(const [a,b] of [[-3.6,-3.6],[3.6,-3.6],[-3.6,3.6],[3.6,3.6]])k.box(a,0,b,1,7,1,wood);k.box(0,8,-4,9,12,1,wood);});}
function longTable(k,x,z,w,d,top='#6a4a26',leg='#3f2c18',ry=0){k.local(x,z,ry,()=>{k.box(0,12,0,w,1.8,d,top);k.box(0,10,0,w-5,1.6,d-5,leg);for(const a of [-1,1]){k.box(a*(w/2-4),0,0,2.6,10,d-6,leg);}k.box(0,4,0,w-8,1.4,1.4,leg);});}
function papers(k,x,y,z,n=4){for(let i=0;i<n;i++)k.box(x+(i%3)*5-5,y+(i%2)*.3,z+(i%2)*3,4.4,.3,6,'#d8cfae',i*.3);}
function candles(k,g,x,y,z){k.column(x,y,z,1.8,.5,'#7a6a4a',10);for(const [a,b] of [[0,0],[1.4,.6],[-1.2,.8]]){k.column(x+a,y+.5,z+b,.45,3+Math.abs(a),'#d8cfae',6);g.ball(x+a,y+4.2+Math.abs(a),z+b,.6,'#ffd27a');}}
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
 treasury:{round:true,wall:'#55503f',trim:'#34302a',height:64,segments:10,rough:true},
 council:{round:true,wall:'#39352a',trim:'#22261a',height:56,segments:10,rough:true},
 // Amon Sûl: a broken ring, open to the sky.
 scouts:{round:true,wall:'#79745f',trim:'#58543f',height:34,segments:12,ruin:true},
 // Caras Galadhon: a talan high in the tree, only a white rail around it.
 lorien:{round:true,wall:'#dcdccb',trim:'#b5b6a2',height:13,segments:14,rail:true},
 // Osgiliath: the round Dome of Stars.
 observatory:{round:true,wall:'#a8a58f',trim:'#7c796a',height:58,segments:10,arches:true},
 // Rivendell and Minas Tirith keep long straight halls with pillars.
 library:{round:false,wall:'#dad2b8',trim:'#a99468',height:62},
 gate:{round:false,wall:'#dedbcd',trim:'#a7a496',height:62},
};

export const roomInteriors={
 messengers(k,g){
  // Plank floor, wainscot and low ceiling beams.
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#70512c',40);for(let i=-11;i<=11;i++)k.box(i*11,.1,0,.5,.12,Math.sqrt(Math.max(0,ROUND_R*ROUND_R-i*i*121))*2-6,'#3f2c18');
  for(let i=0;i<28;i++){const a=i/28*TAU;atWall(k,a,ROUND_R-7,()=>{k.box(0,0,0,23,20,1.4,'#5e4322');k.box(0,20,.8,25,1.6,2,'#3f2c18');k.box(11.5,0,.6,1.4,20,1.2,'#3f2c18');});}
  for(let i=0;i<6;i++){const a=-1.4+i*.56;atWall(k,a,ROUND_R-30,()=>k.box(0,44,0,4,3.2,50,'#3f2c18'));}
  // Round green door, round window, the study with its pigeon-holes.
  atWall(k,-1.25,ROUND_R-7,()=>{k.disc(0,23,.8,21,2,'#3f2c18');k.disc(0,23,1.6,18,1.4,'#2d5a33');k.ball(0,23,2.6,1.5,'#c9962d');for(let i=-3;i<=3;i++)k.box(i*5,6,2.3,.4,34-Math.abs(i)*2,.3,'#234a2a');});
  atWall(k,-.55,ROUND_R-7,()=>{k.disc(0,32,.8,15,2,'#3f2c18');g.disc(0,32,2,12.5,.4,'#a9d6ec');k.box(0,31.5,2.3,25,1,.4,'#3f2c18');k.box(0,20,2.3,1,24,.4,'#3f2c18');});
  atWall(k,.15,ROUND_R-8,()=>{k.box(0,8,0,68,38,6,'#55391c');for(let r=0;r<4;r++)for(let c=0;c<9;c++){k.box(-30+c*7.6,10+r*8.8,2.6,6.8,8,1.4,'#20160c');if((r*5+c*3)%4)k.box(-30+c*7.6,11.5+r*8.8,3.4,5.4,3.6+(c%2),.5,'#d8cfae');}k.box(0,0,0,70,8,7,'#3f2c18');});
  // The hearth with its mantel, a kettle on the fire.
  atWall(k,.95,ROUND_R-8,()=>{k.box(0,0,0,48,34,8,'#6e675a');k.box(0,0,4.2,30,22,.5,'#14100c');k.box(0,34,2,54,3,12,'#3f2c18');g.cone(-5,0,5,6,12,'#ff8a2a',7);g.cone(5,0,5,5,10,'#ffb23a',7);g.cone(0,0,5,3,14,'#ffd27a',6);k.ball(0,17,5,4.6,'#26211a');k.box(0,38,3,5,3,3,'#c9962d');candles(k,g,-18,37,3);candles(k,g,18,37,3);});
  atWall(k,1.65,ROUND_R-8,()=>{bookcase(k,44,36,2,'#55391c');});
  atWall(k,-1.9,ROUND_R-8,()=>{k.box(0,0,0,40,4,10,'#55391c');for(let r=0;r<3;r++){k.box(0,14+r*11,2,42,1.2,9,'#55391c');for(let c=0;c<6;c++)k.column(-16+c*6.4,15.2+r*11,3,2.4,4+(c%3),seededColor(['#a07f4c','#7c4a2c','#6f7a3a','#d8cfae'],c+r),8);}});
  rugRound(k,0,46,42,'#6e2f1c','#a0702a');
  longTable(k,10,-62,62,24);for(const x of [-14,6,26])chair(k,x,-44,3.14,'#55391c');chair(k,34,-78,0);papers(k,-4,13.9,-62,6);for(const [x,z] of [[22,-64],[34,-58]])k.column(x,13.9,z,2,4,'#7c6a4a',10);k.ball(4,16,-68,3,'#b0702a');
  for(const a of [-.9,.6])for(const r of [60]){const x=Math.sin(a)*r,z=-Math.cos(a)*r;k.column(x,36,z,.3,8,'#26211a',6);g.ball(x,34,z,2.2,'#ffd98a');}
 },
 isengard(k,g){
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#141417',40);for(let i=0;i<8;i++){const a=i/8*TAU+.39;k.box(Math.sin(a)*60,.1,-Math.cos(a)*60,.6,.14,120,'#2c2c31',-a);}for(const f of [.45,.92])for(let i=0;i<40;i++){const a=i/40*TAU;k.box(Math.sin(a)*ROUND_R*f,.1,-Math.cos(a)*ROUND_R*f,.6,.14,ROUND_R*f*TAU/38,'#2c2c31',Math.PI-a);}
  // Eight black columns, with the forges in the pit at the back.
  for(let i=0;i<8;i++){const a=i/8*TAU+.39;const x=Math.sin(a)*(ROUND_R-14),z=-Math.cos(a)*(ROUND_R-14);if(z<60)column(k,x,z,5,62,'#0d0d10','#1f1f24',3);}
  k.column(0,0,-82,26,4,'#0c0c0e',20);g.column(0,3.4,-82,22,.8,'#ff6a1a',20);g.column(0,3.8,-82,13,.5,'#ffc23a',16);
  g.box(-62,.3,-30,62,.3,6,'#ff6a1a',.9);g.box(62,.3,-30,62,.3,6,'#ff6a1a',-.9);
  atWall(k,0,ROUND_R-8,()=>{k.box(0,8,0,34,50,1,'#101014');k.box(-7,22,.8,3,22,.4,'#e7e7df');k.box(-2.4,24,.8,3,26,.4,'#e7e7df');k.box(2.4,24,.8,3,24,.4,'#e7e7df');k.box(7,22,.8,3,18,.4,'#e7e7df');k.box(0,14,.8,16,12,.4,'#e7e7df');});
  for(const a of [-.8,.8])atWall(k,a,ROUND_R-10,()=>{k.box(0,0,0,30,44,12,'#26262a');k.box(0,0,6.4,18,22,.6,'#0b0908');g.box(0,2,6.8,13,14,.3,'#ff7a2a');k.column(0,44,0,4,18,'#1b1b1f',8);});
  for(let i=0;i<14;i++){const a=1.2+i*.11;const x=Math.sin(a)*(ROUND_R-14),z=-Math.cos(a)*(ROUND_R-14);k.box(x,i*3.4,z,14,3.4,10,'#232327',-a);}
  for(let i=0;i<5;i++){k.column(-40+i*20,44,-48,.5,18,'#54565a',6);k.ball(-40+i*20,42,-48,1.8,'#54565a');}
  longTable(k,-52,-74,32,14,'#26262a','#141417',.5);papers(k,-52,13.9,-74,5);
  for(let i=0;i<6;i++)crate(k,-92+(i%3)*11,-42+Math.floor(i/3)*11,10);barrel(k,92,-46);barrel(k,82,-56);
  k.box(0,0,-112,40,24,14,'#0d0d10');k.ball(0,28,-112,5.4,'#0e1a2c');g.ball(0,28,-108,2.6,'#ff6a1a');
 },
 library(k,g){
  squareFloor(k,'#c9bf9f');for(let i=-4;i<=4;i++){k.box(i*26,.08,0,.5,.12,S*2,'#9c8f6e');k.box(0,.08,i*26,S*2,.12,.5,'#9c8f6e');}
  // A row of tall arched windows looking onto the falls; shelves along the west wall; slender columns.
  for(let i=0;i<5;i++)k.local(-88+i*44,-S+2,0,()=>{archedWindow(k,g,24,34,i===2?'#d8c27a':'#8fb8cc');});
  for(let i=0;i<4;i++)k.local(-S+2,-78+i*42,Math.PI/2,()=>bookcase(k,38,50,i*3,'#4a3219'));
  for(let i=0;i<4;i++)k.local(S-2,-78+i*42,-Math.PI/2,()=>bookcase(k,38,50,i*2+1,'#4a3219'));
  for(const [x,z] of [[-66,-84],[-22,-84],[22,-84],[66,-84],[-84,-30],[84,-30],[-84,26],[84,26]]){column(k,x,z,3.6,62,'#ece6cf','#b5a578',2);ivy(k,x,z,3.6,50,x*.1+z*.03);}
  rugRect(k,0,48,88,60,'#27465e','#a0863e');
  longTable(k,0,-60,70,28,'#6a4a26','#3f2c18');papers(k,-14,13.9,-60,7);candles(k,g,18,13.9,-66);candles(k,g,-26,13.9,-66);k.box(6,13.9,-58,12,2.4,9,'#5e2a20');chair(k,-14,-40,3.14);chair(k,14,-40,3.14);
  // The shards of Narsil on their stand, and an armillary sphere.
  k.box(-96,0,84,18,9,14,'#ece6cf');k.box(-96,9,84,20,1.2,16,'#a99468');k.box(-100,10.2,84,1.4,.4,9,'#c9ced4',.3);k.box(-92,10.2,82,1.4,.4,7,'#c9ced4',1);k.box(-96,10.2,88,1.2,.4,6,'#c9ced4',2);
  k.column(96,0,84,1.8,16,'#6a4a22',8);k.column(96,0,84,5,1.4,'#3f2c18',12);for(const [rx,rz] of [[Math.PI/2,0],[0,Math.PI/2],[Math.PI/2,1]])k.add(k.torus(9,.4),96,24,84,1,1,1,'#c9962d',0,rx,rz);k.ball(96,24,84,3,'#27465e');
 },
 lorien(k,g){
  // A talan: pale planks around the trunk, lamps in the branches, the silver basin of the Mirror.
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#b5b09a',40);for(let i=-11;i<=11;i++)k.box(i*11,.1,0,.4,.1,Math.sqrt(Math.max(0,ROUND_R*ROUND_R-i*i*121))*2-6,'#8f8d78');
  k.cyl(0,0,-118,16,30,110,'#c9ccbc',12);for(let i=0;i<6;i++){const a=i*1.05;k.box(Math.cos(a)*26,0,-118+Math.sin(a)*22,28,6,8,'#b5b7a6',a);}
  for(let i=0;i<9;i++){const a=2.4+i*.28;k.box(Math.sin(a)*40,i*5,-118-Math.cos(a)*40,16,1.4,8,'#dcdccb',-a);}
  k.cyl(-20,0,-58,17,10,12,'#c9c9b8',18);k.column(-20,12,-58,17.4,1,'#e8e8da',18);k.column(-20,13,-58,15,.4,'#8cd4ec',18);g.column(-20,13.3,-58,9,.2,'#d7f4ff',16);k.box(-20,0,-58,7,3,7,'#a9ab9a');k.box(10,0,-44,3,16,1,'#a9ab9a');
  longTable(k,62,-62,40,18,'#cfcfba','#a9ab9a',-.5);papers(k,62,13.9,-62,5);chair(k,44,-46,2.6,'#a9ab9a');
  for(let i=0;i<10;i++){const a=-1.5+i*.33;const x=Math.sin(a)*(ROUND_R-14),z=-Math.cos(a)*(ROUND_R-14);k.column(x,0,z,.6,38+(i%3)*8,'#b5b7a6',6);g.ball(x,38+(i%3)*8,z,2,'#fff6c4');}
  for(let i=0;i<44;i++){const a=i*2.399,r=10+i*2.3;k.box(Math.cos(a)*r,.25,Math.sin(a)*r,3.4,.2,2,i%2?'#d8bb42':'#a98f2a',a);}
 },
 council(k,g){
  discFloor(k,'#2f2a1e');for(let i=0;i<70;i++){const a=i*2.399,r=8+i*1.55;k.box(Math.cos(a)*r,.2,Math.sin(a)*r,4,.2,2.4,['#4a4322','#5a3a1c','#39451f'][i%3],a);}
  // Great roots hold up the hall; lanterns of the Woodland Realm hang among them.
  for(let i=0;i<7;i++){const a=-1.5+i*.5,x=Math.sin(a)*(ROUND_R-20),z=-Math.cos(a)*(ROUND_R-20);k.cyl(x,0,z,5,11,56,'#3f2f1e',7);for(let j=0;j<6;j++){const b=j*1.05;k.add(k.cylinder(.3,1,1),x+Math.cos(b)*10,3,z+Math.sin(b)*10,4,8,4,'#3a2b1a',b,1.1*Math.sin(b),1.1*Math.cos(b));}k.ball(x,50,z,11,'#25371f');}
  for(const [x,z,h] of [[-64,-50,30],[-24,-74,34],[24,-74,28],[64,-50,32],[-80,0,30],[80,0,34],[-40,-20,38],[40,-20,38]]){k.column(x,h,z,.25,56-h,'#8f9a6a',5);k.column(x,h-2,z,2,.3,'#6a6a3a',8);g.ball(x,h-4,z,2.2,'#d8f27a');}
  // The king's seat with its antlers, the wine cellar and the great map table.
  atWall(k,.6,ROUND_R-14,()=>{k.box(0,0,0,30,6,24,'#3f2f1e');k.box(0,6,-6,18,30,4,'#4a3a26');k.box(0,6,0,16,5,12,'#55432c');for(const a of [-1,1]){for(let i=0;i<4;i++)k.add(k.cylinder(.3,.9,1),a*(8+i*3),38+i*5,-6,1,14,1,'#c9bfa0',0,0,a*(.4+i*.25));}});
  atWall(k,-1.05,ROUND_R-10,()=>{k.box(0,0,0,76,3,14,'#2a2118');for(let r=0;r<2;r++)for(let c=0;c<5;c++){k.add(k.cylinder(6.4,6.4,12),-28+c*14,10+r*13,3,1,1,1,'#55391c',0,Math.PI/2);k.add(k.cylinder(6.8,6.8,1),-28+c*14,10+r*13,8,1,1,1,'#26211a',0,Math.PI/2);k.disc(-28+c*14,10+r*13,9,5.6,.4,'#6a4a26');}});
  longTable(k,-6,-54,64,30,'#4a3a26','#2a2118');k.box(-6,13.9,-54,50,.3,22,'#c9bf96');k.box(-16,14.2,-54,30,.2,1,'#4f7f9b',.2);for(const [a,b] of [[-20,-60],[2,-50],[14,-58]])g.ball(a,15,b,1,'#d8f27a');chair(k,-28,-34,3.14,'#2a2118');chair(k,10,-34,3.14,'#2a2118');
 },
 forge(k,g){
  // Khazad-dûm: columns carved like trees, rails for the ore, the great forge and the tomb of Balin.
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#2f2c28',40);for(let i=-4;i<=4;i++)k.box(i*26,.08,0,.4,.1,190-Math.abs(i)*22,'#1b1a18');for(let i=-4;i<=4;i++)k.box(0,.08,i*26,190-Math.abs(i)*22,.1,.4,'#1b1a18');
  for(const [x,z] of [[-92,-44],[-54,-86],[-6,-100],[106,-14],[-104,10]]){column(k,x,z,7,66,'#3a3733','#26241f',4);for(let a=0;a<4;a++)k.add(k.cylinder(.8,3,1),x+Math.sin(a*1.57)*8,60,z+Math.cos(a*1.57)*8,1,12,1,'#3a3733',0,Math.cos(a*1.57)*.7,-Math.sin(a*1.57)*.7);}
  for(let i=-5;i<=5;i++)k.box(i*20,.2,62,1.6,.5,18,'#3f2c18');for(const z of [55,69])k.box(0,.7,z,226,.7,1.1,'#54565a');
  k.local(-54,62,0,()=>{k.box(0,3,0,26,12,16,'#3a342c');k.box(0,14,0,22,4,12,'#55524c');for(const [a,b] of [[-9,8],[9,8],[-9,-8],[9,-8]])k.add(k.cylinder(3,3,1.6),a,3,b,1,1,1,'#1b1a18',0,Math.PI/2);for(let i=0;i<5;i++)g.ball(-7+i*3.4,18.4,(i%3)*3-3,.8,'#e4b24a');});
  atWall(k,-.86,ROUND_R-14,()=>{k.box(0,0,0,70,58,18,'#26241f');k.box(0,0,9.6,46,28,.6,'#0d0a08');g.cone(-14,0,10,10,16,'#ff8a2a',7);g.cone(14,0,10,9,18,'#ff8a2a',7);g.cone(0,0,10,13,24,'#ffc23a',7);k.box(0,28,8,52,4,10,'#3a3733');k.column(0,58,0,6,34,'#26241f',8);});
  g.box(-40,.4,-56,44,.3,8,'#f0641a',.86);g.box(-40,.7,-56,38,.2,3,'#ffc23a',.86);
  k.local(-96,40,1.57,()=>{k.box(0,0,0,30,12,16,'#b3b0a0');k.box(0,12,0,33,1.6,19,'#8f8c7e');for(let i=0;i<3;i++)k.box(-7+i*7,13.6,3,4.6,.2,2,'#26211a');k.box(0,13.6,-3,10,.8,7,'#5e2a20');});
  atWall(k,-.1,ROUND_R-8,()=>{for(let r=0;r<3;r++){k.box(0,14+r*13,1,62,1.2,2,'#3f2c18');for(let c=0;c<9;c++)k.box(-28+c*7,1.2+14+r*13-11,1.6,2.2,10,.5,c%2?'#8d9096':'#b6bcc3');}});
  k.column(78,0,-92,5,14,'#3f2c18',8);for(const [x,z] of [[-20,-72],[10,-84],[60,-96]]){g.ball(x,5,z,.9,'#8ce0ff');}
 },
 treasury(k,g){
  discFloor(k,'#403a2c');for(let i=0;i<110;i++){const a=i*2.399,r=6+i*1;k.column(Math.cos(a)*r,.05,Math.sin(a)*r,1.4,.25,'#c9962d',8);}
  for(const [x,z] of [[-84,-66],[84,-66],[-112,-6],[112,-6]]){column(k,x,z,9,66,'#5f5a48','#c9962d',3);}
  // Heaps of gold under the arch of the hall, and the Arkenstone above them.
  for(const [x,z,r] of [[-48,-84,34],[44,-88,38],[-92,-34,24],[96,-30,22],[0,-100,30]]){k.hill(x,-.5,z,r,.6,'#c9962d',Math.abs(x)+1);k.hill(x+4,-.5,z+3,r*.7,.6,'#deb04a',Math.abs(z));for(let i=0;i<16;i++){const a=i*2.4;{const f=.3+(i%4)*.18;k.column(x+Math.cos(a)*r*f,r*.6*Math.sqrt(1-f*f)-.2,z+Math.sin(a)*r*f,1.9,.5,'#ffdc7a',8);}}for(let i=0;i<3;i++)k.box(x-8+i*8,r*.2,z+r*.4,5,3,3,'#a9812c',i);}
  k.box(0,0,-62,20,22,20,'#5f5a48');k.box(0,22,-62,24,2,24,'#c9962d');k.add(k.octa(5),0,31,-62,1,1.3,1,'#dff4ff');g.ball(0,31,-62,2.2,'#ffffff');
  chest(k,-30,-44,.3);chest(k,34,-48,-.3);chest(k,-70,-8,1.1);
  longTable(k,0,72,60,24,'#5e4322','#3a2a18');k.box(-8,13.9,72,30,1,16,'#d8cfae');k.box(16,13.9,72,6,5,6,'#c9962d');candles(k,g,-24,13.9,76);for(let i=0;i<5;i++)k.column(22,13.9+i*.6,64,2.4,.5,'#ffdc7a',8);
 },
 scouts(k,g){
  discFloor(k,'#5e5a48');for(let i=0;i<60;i++){const a=i*2.399,r=8+i*1.8;k.box(Math.cos(a)*r,.1,Math.sin(a)*r,5+(i%4)*2,.3,4+(i%3)*2,'#6d6854',a);}
  // Rangers camp in the ring of the old watchtower: fire, bedrolls, the map on a fallen block, the beacon.
  k.box(-6,0,-72,62,12,28,'#6d6854');k.box(-6,12,-72,50,.4,20,'#c9bf96');k.box(-14,12.4,-72,28,.2,.8,'#4f7f9b',.3);for(const [a,b] of [[-20,-76],[4,-68],[14,-78]])g.ball(a,13,b,.8,'#ff4a1a');
  for(const [x,z] of [[64,-58],[-70,-40],[-90,6],[92,-8],[40,-92]])k.rock(x,3,z,9+Math.abs(x%5),6,8,'#6c675e',Math.abs(x));
  for(let i=0;i<9;i++){const a=i*.7;k.box(44+Math.cos(a)*11,.8,-24+Math.sin(a)*11,8,1.6,1.6,'#2e2519',a);k.ball(44+Math.cos(a)*16,1.6,-24+Math.sin(a)*16,2.2,'#55524c');}g.cone(44,0,-24,6,14,'#ff8a2a',7);g.cone(44,0,-24,3,9,'#ffd27a',6);k.column(38,0,-30,.5,16,'#26211a');k.box(44,14,-30,14,.5,.5,'#26211a');
  for(const [x,z,r] of [[-84,50,.4],[-54,74,-.3],[84,58,1.1]]){k.local(x,z,r,()=>{k.box(0,.2,0,24,1.4,11,'#3b4a2e');k.add(k.cylinder(3,3,11),-11,3,0,1,1,1,'#55472c',0,Math.PI/2);});}
  atWall(k,.2,ROUND_R-14,()=>{k.column(0,0,0,2.6,44,'#3f2c18',8);k.column(0,44,0,6,6,'#26211a',8);g.cone(0,50,0,5,10,'#ff9a3a',7);});
  atWall(k,1.2,ROUND_R-12,()=>{k.box(0,0,0,20,12,10,'#6a4a26');k.box(0,12,0,4,6,4,'#3f2c18');k.column(-14,0,0,.5,30,'#4a3219',6);k.column(-10,0,0,.5,28,'#4a3219',6);});
 },
 observatory(k,g){
  // The Dome of Stars: a starred floor, the great palantír, and the walls hung with charts of the markets.
  k.column(0,-1.2,0,ROUND_R-2,1.3,'#3b3a35',40);for(let i=0;i<8;i++){const a=i/8*TAU;k.box(Math.sin(a)*46,.1,-Math.cos(a)*46,3-i%2,.12,92,'#b5a578',-a);}for(const f of [.4,.78])for(let i=0;i<40;i++){const a=i/40*TAU;k.box(Math.sin(a)*ROUND_R*f,.1,-Math.cos(a)*ROUND_R*f,.5,.12,ROUND_R*f*TAU/38,'#b5a578',Math.PI-a);}for(let i=0;i<36;i++){const a=i*2.399,r=10+i*3;g.ball(Math.cos(a)*r,.3,Math.sin(a)*r,.45,'#fff8dc');}
  k.column(0,0,-72,20,3,'#5c584d',18);k.column(0,3,-72,14,3,'#7c796a',18);k.cyl(0,6,-72,4.4,8,16,'#b9b6a4',12);k.cyl(0,22,-72,9,4.4,4,'#b9b6a4',12);k.ball(0,36,-72,12,'#0e1a2c');k.ball(-4,40,-68,3.6,'#34557c');g.ball(0,36,-60,3,'#ff8a2a');
  const chart=(a,seed)=>atWall(k,a,ROUND_R-8,()=>{k.box(0,10,0,46,36,1.4,'#efe4c8');k.box(0,8,-.2,50,40,1,'#1a2233');let y=20;for(let i=0;i<10;i++){const h=3+((i*seed)%7)*2.2,up=(i*seed)%3!==0;k.box(-19+i*4.2,y,.9,2.4,h,.3,up?'#2f7a4a':'#a02a14');k.box(-19+i*4.2,y-1.4,.9,.4,h+2.8,.2,'#26211a');y+=up?1.4:-.8;}});
  chart(-.75,5);chart(.75,7);chart(-1.55,3);
  atWall(k,1.5,ROUND_R-8,()=>bookcase(k,50,46,3,'#3f2c18'));atWall(k,0,ROUND_R-8,()=>{k.box(0,12,0,40,34,1,'#0b1430');for(let i=0;i<24;i++)k.ball(-18+((i*29)%37),15+((i*17)%29),.8,.45,'#fff8dc');});
  k.add(k.cylinder(3.4,3.4,56),-74,34,-44,1,1,1,'#c9962d',.9,0,-.72);k.column(-82,0,-50,.9,28,'#3f2c18');k.column(-66,0,-38,.9,28,'#3f2c18');k.column(-74,0,-44,4,1.4,'#3f2c18',10);
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
  for(let i=0;i<3;i++)k.local(-S+2,-54+i*44,Math.PI/2,()=>bookcase(k,36,50,i*2,'#26211a'));for(let i=0;i<3;i++)k.local(S-2,-54+i*44,-Math.PI/2,()=>archedWindow(k,g,22,32,'#a9c6d6','#cfccbd'));
  longTable(k,-52,-10,28,16,'#3a2a1c','#20160c',1.57);papers(k,-52,13.9,-10,5);
  for(const x of [-30,30]){k.column(x,0,-56,1.6,26,'#a7a496',8);k.column(x,26,-56,4,1,'#26211a',8);g.cone(x,27,-56,3,9,'#ff9a3a',7);}
 },
};

function ivy(k,x,z,r,h,seed=0){
 const path=[];for(let t=0;t<=12;t++){const a=t*.8+seed;path.push([x+Math.sin(a)*(r+.5),2+t/12*h,z+Math.cos(a)*(r+.5),.34]);}k.limb(path,'#3a2f1c',5);
 for(let i=0;i<30;i++){const t=i/30,a=t*9.6+seed+(i%3)*.5,out=r+.8+(i%2)*.6;k.add(k.octa(1),x+Math.sin(a)*out,2+t*h,z+Math.cos(a)*out,1.8,1,1.8,i%3?'#3f5f36':'#54763f',i*1.3);}
}
function hangingLamp(k,g,x,z,top,drop,color='#ffd98a',r=2.2){k.column(x,top-drop,z,.25,drop,'#26211a',5);k.column(x,top-drop-.6,z,r+.8,.6,'#26211a',8);g.ball(x,top-drop-1.8,z,r,color);k.cone(x,top-drop-4.4,z,r+.5,.1,'#26211a',8);}
function gear(k,r,color,y=24){k.disc(0,y,1.5,r,2.4,color);k.disc(0,y,2.8,r*.3,1,'#54565a');for(let i=0;i<12;i++){const a=i/12*TAU;k.add(k.cube(),Math.cos(a)*(r+1.2),y+Math.sin(a)*(r+1.2),1.5,3,3,2.4,color,0,0,a);}for(let i=0;i<4;i++){const a=i/4*TAU+.4;k.add(k.cube(),Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,2.9,r*.7,1.8,.6,'#26262a',0,0,a);}}
function flagstones(k,color,r=ROUND_R-3,n=70){for(let i=0;i<n;i++){const a=i*2.399,d=Math.sqrt((i+.5)/n)*r*.97,s=7+(i%4)*2.6;k.box(Math.cos(a)*d,.05,Math.sin(a)*d,s*1.4,.16,s,color,a*.6);}}
function runeBand(k,w,y,color){k.box(0,y,1,w,5,1,'#2a2824');for(let i=0;i<Math.floor(w/4);i++){const x=-w/2+2+i*4;k.box(x,y+.8,1.6,.6,3.4,.3,color);if(i%2)k.add(k.cube(),x+1,y+2.6,1.6,.5,2.2,.3,color,0,0,.7);}}

// A second pass through every room: the things people actually live and work with.
const roomDetails={
 messengers(k,g){
  // Armchair and footstool by the fire, cloaks by the door, the pantry's pans, a hand-drawn map.
  atWall(k,.68,ROUND_R-44,()=>{k.box(0,0,0,15,7,14,'#6e2f1c');k.box(0,7,-6,15,14,3,'#7a3820');for(const s of [-1,1])k.box(s*7,7,0,2.6,5,14,'#5e2818');k.box(0,0,13,9,4.4,7,'#6e2f1c');});
  for(let i=0;i<4;i++)atWall(k,-1.66+i*.06,ROUND_R-8,()=>{k.box(0,30,.8,1,1,3,'#26211a');if(i%2===0)k.limb([[0,30,2.2,1.5],[0,24,2.6,2.8],[0,14,2.8,3.6]],i?'#54602f':'#7a3a28',8);});
  atWall(k,-1.9,ROUND_R-9,()=>{k.box(0,47,3,44,1,1,'#26211a');for(let i=0;i<5;i++){k.column(-16+i*8,43,3,.2,4,'#26211a',4);k.dome(-16+i*8,39,3,2.8+(i%2),i%2?'#7a4a24':'#54565a',-.7);}});
  atWall(k,-.28,ROUND_R-8,()=>{k.box(0,22,.9,17,21,.4,'#c9b98c');k.box(0,21.4,.7,18.4,22.2,.3,'#3f2c18');for(const [a,b,c] of [[-4,28,.8],[3,32,-.5],[0,26,.2],[5,27,1]])k.add(k.cube(),a,b,1.2,6,.4,.2,'#5a4a2c',0,0,c);k.box(-3,35,1.2,3,.5,.2,'#8f2a1a');});
  atWall(k,2.45,ROUND_R-14,()=>{k.box(0,0,0,34,9,11,'#55391c');k.box(0,9,.4,36,1.2,12,'#3f2c18');k.box(-8,10,1,7,3,5,'#7a3820');k.column(9,10,1,2.6,5,'#6a7a4a',8);});
  atWall(k,-2.5,ROUND_R-14,()=>{barrel(k,-10,0,16,6);barrel(k,5,2,14,5.4);crate(k,20,1,11);});
  hangingLamp(k,g,0,-22,44,6);
 },
 isengard(k,g){
  // Saruman's iron machinery, his books and rows of pikes: a workshop of war behind the polished stone.
  atWall(k,.4,ROUND_R-9,()=>{gear(k,14,'#3a3a40',28);k.local(-15,0,0,()=>gear(k,8,'#2c2c31',16));k.box(0,0,0,40,8,8,'#1f1f24');});
  atWall(k,-.42,ROUND_R-8,()=>bookcase(k,34,50,5,'#141417'));
  atWall(k,1.15,ROUND_R-10,()=>{k.box(0,0,0,48,2,8,'#26211a');k.box(0,26,-1,48,2,3,'#26211a');for(let i=0;i<10;i++)k.column(-20+i*4.4,0,1,.5,38,'#3a3a40',5);for(let i=0;i<10;i++)k.cone(-20+i*4.4,38,1,1.1,5,'#7c7f84',4);});
  for(let i=0;i<9;i++){k.box(-40+i*10,0,-104,6,1,6,'#26262a',i);}
  for(let c=0;c<3;c++)for(let i=0;i<8;i++){const x=[-26,0,26][c];k.box(x,62-i*4.2,-82,i%2?1:2.2,3.4,i%2?2.2:1,'#3a3a40');}
  k.column(0,28,-82,30,.8,'#26262a',24);
 },
 library(k,g){
  // Window seats, urns with climbing plants, lanterns under the ceiling and a star of inlaid brass.
  for(let i=0;i<5;i++){const x=-88+i*44;k.box(x,0,-S+11,30,6,10,'#d8d0b6');k.box(x,6,-S+11,31,1,11,'#27465e');}
  for(const [x,z] of [[-102,-98],[102,-98]]){k.cyl(x,0,z,7,4,12,'#b5a578',12);k.column(x,12,z,7.6,1,'#8f8058',12);k.canopy(x,22,z,11,['#3f5f36','#54763f'],Math.abs(x),.9);}
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
  atWall(k,.98,ROUND_R-14,()=>{k.box(0,0,0,16,16,10,'#3f2f1e');k.box(0,16,0,18,1.2,12,'#55432c');for(let i=0;i<7;i++)k.add(k.octa(1.1),-5+((i*3)%10),18.4+(i%3)*.8,-1+(i%3)*1.6,1,1.3,1,'#e8f2f4',i);g.ball(0,18.6,0,.9,'#ffffff');});
  for(const [x,z] of [[-30,-66],[6,-48],[16,-62]]){k.column(x,13.9,z,.9,.3,'#c9962d',8);k.cyl(x,14.2,z,1.3,.3,2.4,'#c9962d',8);k.column(x,16.4,z,1,.25,'#5a1020',8);}
  for(let i=0;i<8;i++){const a=-1.3+i*.37,r=ROUND_R-30-(i%3)*10,x=Math.sin(a)*r,z=-Math.cos(a)*r;k.limb([[x,56,z,.45],[x+1.5,46-(i%3)*4,z+1,.35],[x,34-(i%4)*5,z,.15]],'#3f4f26',5);}
  for(let i=0;i<16;i++){const a=i*2.399,r=96+(i%4)*5,x=Math.cos(a)*r,z=Math.sin(a)*r;if(z>30)continue;k.column(x,0,z,.5,2.6,'#c9bfa0',5);k.dome(x,2.4,z,2.4+(i%3)*.5,i%3?'#b09a68':'#c98a3a',.5);}
 },
 forge(k,g){
  // Flagstones, carved rune bands, bellows at the great forge, chains and the anvil's tools.
  flagstones(k,'#38352f');
  atWall(k,-.86,ROUND_R-36,()=>{k.local(26,6,0,()=>{k.limb([[0,4,-6,1.8],[0,8,0,7],[0,8.5,6,7],[0,8,13,1.2]],'#3f2c18',10);k.box(0,0,3,10,4,16,'#26211a');});});
  for(const a of [.32,.62,-.42,1.02])atWall(k,a,ROUND_R-7,()=>{runeBand(k,30,44,'#c7e6f2');runeBand(k,30,12,'#8d9096');});
  atWall(k,.47,ROUND_R-8,()=>{k.box(0,0,.6,26,40,1.4,'#17151a');k.box(-15,0,.8,4,44,2.4,'#55524c');k.box(15,0,.8,4,44,2.4,'#55524c');k.box(0,40,.8,34,5,2.4,'#55524c');k.box(0,45,.8,24,5,2.4,'#55524c');k.box(0,50,.8,12,4,2.4,'#55524c');});
  for(const [x,z] of [[-30,-92],[30,-96]])for(let i=0;i<7;i++)k.box(x,62-i*4.2,z,i%2?1:2.2,3.4,i%2?2.2:1,'#54565a');
  atWall(k,1.6,ROUND_R-14,()=>{for(let i=0;i<3;i++){k.box(-20+i*20,0,0,16,11,14,'#3a342c');for(let c=0;c<4;c++)k.rock(-24+i*20+c*2.6,11+(c%2),c%3-1,3.2,2.6,3,'#66625a',c+i);}});
 },
 treasury(k,g){
  // The accounts: ledgers, scales, an abacus; gold-bound doors of carved stone in the walls.
  flagstones(k,'#4c4534',ROUND_R-3,50);
  k.column(30,13.9,76,3.6,.6,'#c9962d',12);k.column(30,14.5,76,.5,10,'#c9962d',6);k.box(30,24,76,14,.5,.8,'#c9962d');for(const s of [-1,1]){k.column(30+s*6,20,76,2.2,.3,'#deb04a',10);for(const q of [-1,1])k.box(30+s*6+q*1.2,20.3,76,.15,3.8,.15,'#c9962d');}
  k.box(-18,13.9,62,16,.8,8,'#3f2c18');for(let r=0;r<4;r++){k.box(-18,15,59.5+r*1.7,15,.3,.3,'#c9962d');for(let i=0;i<5;i++)k.ball(-23+((i*3+r)%10),15,59.5+r*1.7,.55,'#5e2a20');}
  atWall(k,1.05,ROUND_R-8,()=>bookcase(k,40,50,4,'#2a2118'));
  for(const a of [-.34,.34])atWall(k,a,ROUND_R-7,()=>{k.box(0,0,.5,24,40,1.2,'#2a1d0c');for(const s of [-1,1]){k.box(s*14,0,.8,5,46,2.6,'#6f6a58');k.box(s*14,46,.8,7,3,3.2,'#c9962d');}k.box(0,40,.8,30,6,2.6,'#6f6a58');k.box(0,41,1.5,22,3,.4,'#c9962d');k.box(0,18,1.4,3,3,.5,'#c9962d');});
  for(const [x,z] of [[-48,-30],[48,-30]]){k.column(x,0,z,1.2,28,'#c9962d',8);k.cyl(x,28,z,3,1.2,3,'#c9962d',8);g.cone(x,30.6,z,2.4,7,'#ffb23a',7);}
 },
 scouts(k,g){
  // Packs and a cooking pot by the fire, a lean-to of cloth over the sleepers.
  k.column(44,8,-24,.25,8,'#26211a',4);k.dome(44,7.4,-24,3.8,'#26211a',-.8);
  for(const [x,z] of [[64,-36],[20,-44]]){k.limb([[x,0,z,3.6],[x,4,z,4.2],[x,8,z,3.4],[x,11,z,1.8]],'#54502e',8);k.box(x,11,z,4,1.2,4,'#3a2a1a');}
  k.local(-70,62,.2,()=>{k.gable(0,0,0,34,44,16,'#3a4530',Math.PI/2);});
  for(let i=0;i<4;i++)k.column(-20+i*9,0,-96-(i%2)*4,.6,20,'#3a2a18',5);
 },
 observatory(k,g){
  // Instruments of the watchers: a railing around the great stone, an astrolabe, a globe, lamps from above.
  for(let i=0;i<10;i++){const a=i/10*TAU;k.column(Math.sin(a)*26,0,-72-Math.cos(a)*26,.7,13,'#c9962d',6);if(i<10)k.box(Math.sin(a+.31)*25.2,13,-72-Math.cos(a+.31)*25.2,16.6,.7,.7,'#c9962d',-a-.31+Math.PI/2);}
  k.column(92,0,44,4.6,1.4,'#3f2c18',12);k.column(92,1,44,.9,18,'#3f2c18',8);k.ball(92,26,44,7.4,'#274887');for(let i=0;i<9;i++)k.box(92+Math.cos(i*2.1)*7,24+(i%5)*.9,44+Math.sin(i*2.1)*7,2.6,.2,1.8,'#a08a54',i);k.add(k.torus(8.4,.3),92,26,44,1,1,1,'#c9962d');
  k.column(-96,0,40,1.2,20,'#3f2c18',8);for(const [rx,rz] of [[Math.PI/2,0],[.6,.4],[1.2,1]])k.add(k.torus(7.4,.3),-96,27,40,1,1,1,'#c9962d',0,rx,rz);
  for(const [x,z] of [[-46,-20],[46,-20],[-46,30],[46,30]])hangingLamp(k,g,x,z,56,14,'#ffd98a',1.8);
 },
 gate(k,g){
  // Torches on the pillars, racks of sealed records, the guard's spears and a brazier either side of the throne.
  for(const x of [-74,74])for(const z of [-44,44])k.local(x+(x<0?5.4:-5.4),z,x<0?Math.PI/2:-Math.PI/2,()=>torch(k,g,30));
  for(const x of [-44,44]){k.column(x,0,-84,3,1,'#26211a',10);k.column(x,1,-84,.8,16,'#26211a',8);k.cyl(x,17,-84,5,2,3,'#26211a',10);g.cone(x,20,-84,4,10,'#ff9a3a',8);g.cone(x,20,-84,2,6,'#ffd27a',7);}
  k.local(-100,70,Math.PI/2,()=>{longTable(k,0,0,30,12,'#3a2a1c','#20160c');for(let i=0;i<6;i++){k.add(k.cylinder(1.2,1.2,1),-11+i*4.4,14.8,0,1,10,1,'#d8cfae',0,Math.PI/2);k.column(-11+i*4.4,14.2,5,.8,.5,'#7a1a12',6);}});
  for(let i=0;i<5;i++)k.column(100,0,-104+i*3.4,.4,44,'#3a2a18',5),k.cone(100,44,-104+i*3.4,1,5,'#c9ced4',4);
 },
};
function rugRound(k,x,z,r,a,b){k.column(x,.1,z,r,.3,a,28);k.column(x,.2,z,r-4,.3,b,28);k.column(x,.3,z,r-7,.3,a,28);}
function rugRect(k,x,z,w,d,a,b){k.box(x,.1,z,w,.3,d,a);k.box(x,.2,z,w-5,.3,d-5,b);k.box(x,.3,z,w-9,.3,d-9,a);}

// The stub of the wall always remains, so a room stays a room when its walls lift away.
function wallFoot(id,k){
 const plan=roomPlans[id];if(plan.rail||plan.ruin)return;
 if(!plan.round){for(const s of [-1,1]){k.box(0,0,s*(S+1),S*2+10,7,5,plan.trim);k.box(s*(S+1),0,0,5,7,S*2+10,plan.trim);}return;}
 for(let i=0;i<16;i++)k.arc(ROUND_R+1.4,9.8,i/16*TAU,(i+1)/16*TAU,0,7,plan.trim);
}
for(const id of Object.keys(roomInteriors)){const base=roomInteriors[id];roomInteriors[id]=(k,g)=>{base(k,g);roomDetails[id](k,g);wallFoot(id,k);};}

// Where each room's own light comes from: [x,y,z,colour,strength], and how much daylight reaches in.
export const roomLight={
 messengers:{day:.62,lamps:[[89,16,-64,'#ff9440',620],[0,34,-22,'#ffd08a',260]]},
 isengard:{day:.42,lamps:[[0,16,-82,'#ff6a1a',760],[-83,14,-72,'#ff7a2a',380]]},
 forge:{day:.42,lamps:[[-83,18,-72,'#ff7a2a',900],[52,30,-56,'#ff5a1a',760]]},
 treasury:{day:.42,lamps:[[0,34,-70,'#ffc27a',620],[0,24,66,'#ffb45a',340]]},
 council:{day:.6,lamps:[[-6,34,-30,'#d8ec9a',900],[50,34,-50,'#ffd08a',520]]},
 observatory:{day:.7,lamps:[[0,36,-50,'#ff9a4a',300],[0,44,10,'#ffd98a',280]]},
 gate:{day:.72,lamps:[[-44,28,-84,'#ff9a4a',360],[44,28,-84,'#ff9a4a',360]]},
 library:{day:.86,lamps:[[0,44,-20,'#ffe2a8',220],[0,44,50,'#ffe2a8',180]]},
 lorien:{day:.84,lamps:[[-20,24,-58,'#cfeaff',320],[60,30,-30,'#fff0b0',180]]},
 scouts:{day:.8,lamps:[[44,16,-24,'#ff8a3a',520],[-6,30,-72,'#ff7a3a',120]]},
};

// Thick walls in pieces, so that whichever part faces the camera can lift away.
export function buildWalls(id,makeKit){
 const plan=roomPlans[id],h=plan.height,out=[];
 if(!plan.round){
  for(const [axis,sign] of [['x',-1],['x',1],['z',-1],['z',1]]){
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
  const a0=i/n*TAU,a1=(i+1)/n*TAU,mid=(a0+a1)/2,r=ROUND_R;
  out.push({mesh:makeKit(k=>{
   const height=plan.ruin?h*(.35+(((i*7)%5)/5)*.75):h,seg=(a,b,y,hh,R,t,c)=>k.arc(R,t,a,b,y,hh,c);
   if(plan.rail){seg(a0,a1,10,2,r,3,plan.wall);seg(a0,a1,0,1.2,r,5,plan.trim);k.column(Math.sin(a0)*r,0,-Math.cos(a0)*r,1.4,12,plan.trim,8);k.ball(Math.sin(a0)*r,12.6,-Math.cos(a0)*r,1.8,plan.wall);return;}
   seg(a0,a1,0,height,r,plan.ruin?10:6,plan.wall);seg(a0,a1,0,4,r+1,9,plan.trim);
   if(!plan.ruin)seg(a0,a1,height-4,4,r+1,9,plan.trim);
   if(plan.rough)for(let j=0;j<7;j++){const a=a0+(a1-a0)*(j+.5)/7;k.rock(Math.sin(a)*(r-5),6+((j*11+i*5)%10)*5,-Math.cos(a)*(r-5),9+(j%3)*3,8+(j%4)*3,6,plan.wall,i*7+j);}
   if(plan.slits){const x=Math.sin(mid)*(r-3),z=-Math.cos(mid)*(r-3);k.box(x,26,z,3,20,2,'#3a2410',-mid);}
   if(plan.arches){const x=Math.sin(mid)*(r-3.4),z=-Math.cos(mid)*(r-3.4);k.box(x,12,z,26,28,1.4,'#3a3b3c',-mid);k.disc(x,40,z,13,1.4,'#3a3b3c');}
   if(!plan.ruin){const x=Math.sin(a0)*(r-3),z=-Math.cos(a0)*(r-3);k.box(x,0,z,6,height,6,plan.trim,-a0);}
  }),normal:[Math.sin(mid),-Math.cos(mid)]});
 }
 return out;
}
