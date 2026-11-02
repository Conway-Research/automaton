// The land of the Middle-earth desktop: places, people, terrain, rivers, roads and forests.
// Pure data and painting. No data from the server and no server access.
export const WORLD={w:2800,h:1750};
export const HUB_SITE={x:1400,y:800,r:210};
// Order runs clockwise, as the road does. Mordor stays in the middle because the eye is the centre of Numaron.
export const sitePlaces={isengard:{x:570,y:360,elev:.5},library:{x:1120,y:290,elev:.42},forge:{x:1680,y:300,elev:.56},treasury:{x:2240,y:400,elev:.5},council:{x:2460,y:830,elev:.47},lorien:{x:2230,y:1220,elev:.46},gate:{x:1650,y:1300,elev:.52},observatory:{x:1120,y:1310,elev:.42},scouts:{x:560,y:1240,elev:.47},messengers:{x:340,y:820,elev:.46}};
export const mountDoom={x:1960,y:760};
export const rohan={x:790,y:1120};

export const workstationNames={hammer:'Amboss',chisel:'Werkbank',quill:'Schreibpult',scroll:'Aktenpult',book:'Lesepult',pick:'Erzhaufen',sack:'Materiallager',scale:'Prüfwaage',seal:'Siegeltisch',staff:'Sternenpodest',compass:'Kartentisch',bow:'Spähposten',coin:'Zähltisch',letter:'Postregal',ladle:'Wasserbecken',sword:'Waffenständer'};
// Offsets are relative to the settlement centre. Everybody has a place of their own.
export const crews={
 scouts:[{name:'Gamling',people:'rohirrim',x:-70,y:44,tool:'compass',action:'liest die Karte'},{name:'Háma',people:'rohirrim',x:20,y:65.6,tool:'quill',action:'markiert Quellen'},{name:'Erkenbrand',people:'rohirrim',x:74,y:41.6,tool:'bow',action:'hält Ausschau'}],
 isengard:[{name:'Uglúk',people:'uruk',x:-85,y:59.6,tool:'hammer',action:'treibt an'},{name:'Mauhúr',people:'uruk',x:20,y:74,tool:'pick',action:'gleicht ab'},{name:'Snaga',people:'orc',x:56,y:51.2,tool:'sack',action:'schleppt Akten'},{name:'Gorbag',people:'orc',x:26,y:41.6,tool:'pick',action:'bricht auf'}],
 library:[{name:'Elrond',people:'noldor',x:-67,y:36.8,tool:'book',action:'liest Quellen'},{name:'Erestor',people:'noldor',x:14,y:68,tool:'quill',action:'hält Belege fest'},{name:'Glorfindel',people:'noldor',x:74,y:39.2,tool:'scroll',action:'vertieft Fundstellen'}],
 lorien:[{name:'Galadriel',people:'galadhrim',x:-64,y:52.4,tool:'ladle',action:'prüft im Spiegel'},{name:'Celeborn',people:'galadhrim',x:14,y:74,tool:'scroll',action:'wägt Chancen'},{name:'Haldir',people:'galadhrim',x:83,y:48.8,tool:'bow',action:'stellt Gegenfragen'}],
 council:[{name:'Thranduil',people:'silvan',x:-67,y:52.4,tool:'staff',action:'bestimmt den Kurs'},{name:'Galion',people:'silvan',x:17,y:76.4,tool:'compass',action:'zerlegt das Vorhaben'},{name:'Feren',people:'silvan',x:53,y:50,tool:'scroll',action:'begrenzt den Umfang'}],
 forge:[{name:'Balin',people:'dwarf',x:-79,y:54.8,tool:'hammer',action:'schmiedet'},{name:'Ori',people:'dwarf',x:23,y:76.4,tool:'chisel',action:'prüft den Rohling'},{name:'Óin',people:'dwarf',x:44,y:50,tool:'hammer',action:'facht die Esse an'},{name:'Flói',people:'dwarf',x:8,y:34.4,tool:'sack',action:'bringt Material'}],
 gate:[{name:'Denethor',people:'gondor',x:-46,y:64.4,tool:'seal',action:'siegelt Freigaben'},{name:'Beregond',people:'gondor',x:14,y:82.4,tool:'scale',action:'wägt das Ergebnis'},{name:'Imrahil',people:'gondor',x:83,y:50,tool:'scroll',action:'liest Prüfbericht'}],
 messengers:[{name:'Bilbo',people:'hobbit',x:-85,y:47.6,tool:'letter',action:'liest Antworten'},{name:'Rosie',people:'hobbit',x:-49,y:71.6,tool:'sack',action:'packt die Post'},{name:'Merry',people:'hobbit',x:41,y:70.4,tool:'letter',action:'sortiert Fristen'},{name:'Pippin',people:'hobbit',x:77,y:56,tool:'quill',action:'führt den Kalender'}],
 treasury:[{name:'Dáin',people:'dwarf',x:-67,y:63.2,tool:'coin',action:'gleicht Zahlungen ab'},{name:'Glóin',people:'dwarf',x:14,y:77.6,tool:'quill',action:'führt das Hauptbuch'},{name:'Bard',people:'dale',x:47,y:52.4,tool:'book',action:'sammelt Kennzahlen'}],
 observatory:[{name:'Elendil',people:'numenorean',x:-61,y:52.4,tool:'compass',action:'wertet Reihen aus'},{name:'Isildur',people:'numenorean',x:14,y:76.4,tool:'book',action:'hält Lehren fest'},{name:'Anárion',people:'numenorean',x:47,y:58.4,tool:'quill',action:'vergleicht Läufe'}],
};
// The best-known figures stay where they belong; only Gandalf travels everywhere. They are scenery and never stand for real work.
export const wanderers=[
 {name:'Gandalf',people:'wizard',tool:'staff',home:null},{name:'Frodo',people:'hobbit',tool:'letter',home:'messengers'},{name:'Sam',people:'hobbit',tool:'sack',home:'messengers'},
 {name:'Aragorn',people:'ranger',tool:'sword',home:'scouts'},{name:'Arwen',people:'noldor',tool:'book',home:'library'},{name:'Legolas',people:'silvan',tool:'bow',home:'council'},{name:'Gimli',people:'dwarf',tool:'hammer',home:'treasury'},
 {name:'Boromir',people:'gondor',tool:'sword',home:'gate'},{name:'Faramir',people:'gondor',tool:'bow',home:'observatory'},{name:'Saruman',people:'whitewizard',tool:'staff',home:'isengard'},{name:'Gollum',people:'gollum',tool:'coin',home:'forge'},
 {name:'Éowyn',people:'rohirrim',tool:'sword',home:'scouts'},{name:'Théoden',people:'rohirrim',tool:'sword',home:'scouts'},
];

// ---- noise ----
const perm=new Uint8Array(512);{let seed=20261102;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;const p=[...Array(256).keys()];for(let i=255;i>0;i--){const j=Math.floor(rnd()*(i+1));[p[i],p[j]]=[p[j],p[i]];}for(let i=0;i<512;i++)perm[i]=p[i&255];}
const smooth=t=>t*t*(3-2*t);
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),u=smooth(x-xi),v=smooth(y-yi),X=xi&255,Y=yi&255,a=perm[perm[X]+Y],b=perm[perm[X+1]+Y],c=perm[perm[X]+Y+1],d=perm[perm[X+1]+Y+1];return ((a+(b-a)*u)+((c+(d-c)*u)-(a+(b-a)*u))*v)/255;}
const fbm=(x,y,oct=5)=>{let s=0,a=.5,f=1;for(let i=0;i<oct;i++){s+=vnoise(x*f,y*f)*a;a*=.5;f*=2.03;}return s/(1-Math.pow(.5,oct));};
const ridge=(x,y)=>{let s=0,a=.55,f=1;for(let i=0;i<4;i++){s+=(1-Math.abs(vnoise(x*f,y*f)*2-1))*a;a*=.5;f*=2.1;}return s;};
const gauss=(d,r)=>Math.exp(-(d*d)/(r*r));
const GX=[1,-1,0,0,.7071,-.7071,.7071,-.7071],GY=[0,0,1,-1,.7071,.7071,-.7071,-.7071];
function gnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,X=xi&255,Y=yi&255,u=smooth(fx),v=smooth(fy),a=perm[perm[X]+Y]&7,b=perm[perm[X+1]+Y]&7,c=perm[perm[X]+Y+1]&7,d=perm[perm[X+1]+Y+1]&7,n0=GX[a]*fx+GY[a]*fy,n1=GX[b]*(fx-1)+GY[b]*fy,n2=GX[c]*fx+GY[c]*(fy-1),n3=GX[d]*(fx-1)+GY[d]*(fy-1),t=n0+(n1-n0)*u;return (t+((n2+(n3-n2)*u)-t)*v)*1.5;}
// Sharp ridges and smooth valleys, as water and ice carve real mountains.
function peaks(x,y){const wx=x+(vnoise(x/190+11,y/190+5)-.5)*170,wy=y+(vnoise(x/170+3,y/170+23)-.5)*170;let s=0,a=1,w=1,f=1/310,n=0;for(let i=0;i<6;i++){let r=1-Math.abs(gnoise(wx*f,wy*f));r=r<0?0:r*r;r*=w;w=Math.min(1,r*2.4);s+=r*a;n+=a;a*=.52;f*=2.07;}return Math.min(1.25,s/n*2.1);}
const sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const hypot=Math.hypot;
const P=sitePlaces;

// Natural, muted colours of the lands. Each one fades out with distance, so they run into each other.
const lands=[
 {x:P.scouts.x,y:P.scouts.y,r:380,low:[116,112,66],high:[92,88,62]},{x:P.library.x,y:P.library.y,r:300,low:[58,88,52],high:[46,72,50]},{x:P.forge.x,y:P.forge.y,r:300,low:[76,74,68],high:[58,56,54]},{x:P.treasury.x,y:P.treasury.y,r:330,low:[88,88,70],high:[70,70,60]},
 {x:P.council.x,y:P.council.y,r:320,low:[26,44,30],high:[18,34,26]},{x:P.lorien.x,y:P.lorien.y,r:370,low:[122,112,56],high:[100,94,50]},{x:P.gate.x,y:P.gate.y,r:320,low:[104,110,80],high:[92,98,78]},{x:P.observatory.x,y:P.observatory.y,r:330,low:[104,108,70],high:[86,90,62]},
 {x:P.isengard.x,y:P.isengard.y,r:300,low:[56,52,44],high:[40,38,34]},{x:P.messengers.x,y:P.messengers.y,r:360,low:[84,128,58],high:[70,112,50]},{x:rohan.x,y:rohan.y,r:320,low:[148,134,82],high:[126,114,70]},{x:HUB_SITE.x,y:HUB_SITE.y,r:480,low:[44,32,28],high:[26,20,20]},
];

// Anduin, Bruinen and the Isen run in valleys of their own down to the sea.
const riverCourses=[[[1960,190],[2005,420],[2130,650],[2200,860],[2060,1100],[1950,1300],[1990,1500],[1920,1700],[1960,1980]],[[1360,160],[1370,480],[1110,610],[800,560],[540,650],[200,650],[-260,720]],[[290,1160],[260,1400],[420,1620],[600,1760],[640,2000]]];
const riverLines=riverCourses.map(points=>{const out=[];for(let i=0;i<points.length-1;i++){const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];for(let k=0;k<6;k++){const t=k/6,t2=t*t,t3=t2*t;out.push([.5*(2*b[0]+(c[0]-a[0])*t+(2*a[0]-5*b[0]+4*c[0]-d[0])*t2+(3*b[0]-a[0]-3*c[0]+d[0])*t3),.5*(2*b[1]+(c[1]-a[1])*t+(2*a[1]-5*b[1]+4*c[1]-d[1])*t2+(3*b[1]-a[1]-3*c[1]+d[1])*t3)]);}}out.push(points[points.length-1]);return out;});
const segmentDistance=(x,y,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));return hypot(x-ax-dx*t,y-ay-dy*t);};
function exactRiver(x,y){let best=1e9;for(const line of riverLines)for(let i=0;i<line.length-1;i++){const q=segmentDistance(x,y,line[i][0],line[i][1],line[i+1][0],line[i+1][1]);if(q<best)best=q;}return best;}
let roadSegments=null;
// Most of the land is far from any road or river, so a coarse map spares the exact measurement.
const coarseMap=exact=>{const cell=40,cols=112,rows=90,cache=new Float32Array(cols*rows).fill(-1);return (x,y,reach)=>{const i=Math.floor((x+800)/cell),j=Math.floor((y+900)/cell);if(i>=0&&j>=0&&i<cols&&j<rows){const o=j*cols+i;if(cache[o]<0)cache[o]=exact(-800+(i+.5)*cell,-900+(j+.5)*cell);if(cache[o]>reach+cell)return 1e9;}else return 1e9;return exact(x,y);};};
const riverDistance=coarseMap(exactRiver);
// Roads are looked up in buckets of nearby segments; before they are planned the land simply has none.
let roadBuckets=null,roadsGraded=false,lastRX=NaN,lastRY=NaN,lastRD=1e9,lastRH=0;
function roadDistance(x,y){
 if(!roadBuckets)return 1e9;if(x===lastRX&&y===lastRY)return lastRD;lastRX=x;lastRY=y;let best=1e9,h=0;
 const list=roadBuckets.get(Math.floor(x/120)*100000+Math.floor(y/120));
 if(list)for(const q of list){const dx=q[2]-q[0],dy=q[3]-q[1],t=Math.max(0,Math.min(1,((x-q[0])*dx+(y-q[1])*dy)/(dx*dx+dy*dy||1))),d=hypot(x-q[0]-dx*t,y-q[1]-dy*t);if(d<best){best=d;h=q[4]+(q[5]-q[4])*t;}}
 lastRD=best;lastRH=h;return best;
}
const SEA=.335;
const squareHalls=new Set(['library','gate']);
const places=Object.values(sitePlaces);
function heightAt(x,y){
 let h=.37+fbm(x/430+17,y/430+31)*.3+fbm(x/90+7,y/90+13,3)*.05;
 const dx=x-HUB_SITE.x,dy=(y-HUB_SITE.y)/.72,r=hypot(dx,dy),bendY=(vnoise(x/520+3,1.7)-.5)*240,bendX=(vnoise(2.3,y/520+5)-.5)*300;
 // How much mountain each place carries: the great ranges run on past the edge of the known lands.
 const massif=.3+1.25*sstep(.38,.66,fbm(x/460+41,y/340+7,3));
 let M=gauss(y+210-bendY,250)*(1-.86*gauss(x-2300,330))*massif*.9;
 const ring=gauss(r-530,84)*.72*sstep(150,360,hypot(x-mountDoom.x,y-mountDoom.y));
 M+=gauss(hypot(x-1690,y-30),210)*.8;
 M+=gauss(hypot(x-1120,y-60),190)*.6;
 M+=gauss(hypot(x-640,y-1040),135)*.72;
 M+=gauss(hypot(x-1650,y-1030),120)*.5;
 M+=gauss(x-3950-bendX*3,470)*(1-sstep(1100,1800,y))*massif*1.3;
 M+=gauss(y+1950-bendY*3,540)*massif*1.5;
 // No mountain stands between a place's entrance and the land in front of it.
 let front=0;for(const q of places){const dy=y-q.y-60;if(dy>0&&dy<760){const k=sstep(250,120,Math.abs(x-q.x))*sstep(760,560,dy);if(k>front)front=k;}}
 M*=1-front;const ringHere=ring*(1-front);
 if(M>.004||ringHere>.004){const pass=sstep(13,64,roadDistance(x,y,64));if(M>.004){const p=peaks(x*1.3,y*1.3);h+=M*pass*(.12+p*p*.55+p*.55);}if(ringHere>.004)h+=ringHere*sstep(7,30,roadDistance(x,y,30))*(.4+peaks(x*2.7+70,y*2.7)*.72+peaks(x*7.3+30,y*7.3+90)*.26);}
 // The Lonely Mountain stands alone and Isengard lies in a ring of rock.
 const erebor=hypot(x-2290,y-20);if(erebor<540){const t=1-erebor/540;h+=1.95*Math.pow(t,1.3)*(.7+peaks(x*1.5+90,y*1.5)*.5);}
 h+=gauss(hypot(x-P.isengard.x,y-P.isengard.y-60)-330,30)*.3*sstep(26,80,roadDistance(x,y,80))*(1-sstep(250,130,Math.abs(x-P.isengard.x))*sstep(0,60,y-P.isengard.y-60));
 h-=gauss(r,240)*.08;
 // Mount Doom: a real volcano with gullied flanks and an open crater.
 const doom=hypot(x-mountDoom.x,y-mountDoom.y);if(doom<235){const t=1-doom/235,gully=vnoise(Math.atan2(y-mountDoom.y,x-mountDoom.x)*5+20,doom/46);h+=1.22*Math.pow(t,1.62)*(.84+gully*.3+(t<.86?peaks(x*3.6,y*3.6)*.24:.1))*sstep(18,70,roadDistance(x,y,70));if(doom<52)h-=Math.pow(1-doom/52,.6)*.34;}
 // The coast of the western sea and of the bay in the south.
 const west=-70+(vnoise(3.3,y/380+9)-.5)*330+(fbm(1.1,y/120+3,3)-.5)*90,south=1730+(vnoise(x/420+4,7.7)-.5)*240+(fbm(x/120+3,2.2,3)-.5)*90,sea=Math.max(sstep(west+170,west-70,x),sstep(south-170,south+70,y));
 if(sea>0)h=h*(1-sea)+(SEA-.16)*sea;
 for(const [id,place] of Object.entries(sitePlaces)){
  const px=x-place.x,py=y-place.y-60,d=hypot(px,py),k=sstep(300,178,d);if(k<=0)continue;h=h*(1-k)+place.elev*k;
  // A low bank of earth rises against the walls, so no hall lies on the land like a plate.
  const square=squareHalls.has(id),q=square?Math.max(Math.abs(px),Math.abs(py)):d,inner=square?118:123;
  if(q>inner&&q<inner+70)h+=.021*sstep(inner,inner+6,q)*(1-sstep(inner+6,inner+62,q))*(.55+vnoise(x/24+id.length,y/24)*.9);
 }
 const hubFlat=sstep(335,225,hypot(x-HUB_SITE.x,y-HUB_SITE.y));if(hubFlat>0)h=h*(1-hubFlat)+.44*hubFlat;
 const stream=riverDistance(x+(vnoise(x/46,y/46)-.5)*36,y+(vnoise(x/46+8,y/46+2)-.5)*36,190);
 if(stream<190){
  const valley=sstep(190,16,stream);h=h*(1-valley)+Math.min(h,SEA+.075)*valley;
  const bed=sstep(28,8,stream);if(bed>0)h=h*(1-bed)+(SEA-.022)*bed;
 }
 if(roadsGraded){const d=roadDistance(x,y);if(d<64){const k=sstep(64,11,d);h=h*(1-k)+lastRH*k;}}
 return Math.max(SEA-.2,h);
}
// World height in units above the sea, used by the terrain mesh and everything standing on it.
const HEIGHT=330;
// The painted, shaded part of the world reaches somewhat past the places themselves.
export const EXTENT={x:-400,y:-700,w:3600,h:2800};
const CELL=2.5,FW=Math.round(EXTENT.w/CELL)+1,FH=Math.round(EXTENT.h/CELL)+1;
let field=null;
function fieldAt(x,y){const fx=Math.max(0,Math.min(FW-1.001,(x-EXTENT.x)/CELL)),fy=Math.max(0,Math.min(FH-1.001,(y-EXTENT.y)/CELL)),i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,o=j*FW+i,t=field[o]+(field[o+1]-field[o])*u,b=field[o+FW]+(field[o+FW+1]-field[o+FW])*u;return t+(b-t)*v;}
const inField=(x,y)=>field&&x>=EXTENT.x&&y>=EXTENT.y&&x<=EXTENT.x+EXTENT.w&&y<=EXTENT.y+EXTENT.h;
const groundCache=new Map();
export function groundAt(x,y){
 if(inField(x,y))return (fieldAt(x,y)-SEA)*HEIGHT;
 const key=Math.round(x/4)*100000+Math.round(y/4);let v=groundCache.get(key);if(v===undefined){v=(heightAt(x,y)-SEA)*HEIGHT;groundCache.set(key,v);}return v;
}
const breathe=()=>new Promise(done=>setTimeout(done));
async function buildField(){const out=new Float32Array(FW*FH);for(let j=0;j<FH;j++){for(let i=0;i<FW;i++)out[j*FW+i]=heightAt(EXTENT.x+i*CELL,EXTENT.y+j*CELL);if(j%64===0)await breathe();}field=out;groundCache.clear();}
// Glowing cracks in the plain of Gorgoroth, and the streams running from the crater of Mount Doom.
function lavaAt(x,y){
 let glow=0;const r=hypot(x-HUB_SITE.x,(y-HUB_SITE.y)/.72);
 if(r>170&&r<480)glow=Math.pow(ridge(x/70,y/70)/1.1,9)*(1-r/480)*2.8;
 const doom=hypot(x-mountDoom.x,y-mountDoom.y);
 if(doom<30)glow=1;else if(doom<225){const angle=Math.atan2(y-mountDoom.y,x-mountDoom.x);const wander=angle+(vnoise(angle*3+5,doom/34)-.5)*.5,thread=Math.pow(1-Math.abs(gnoise(wander*1.5+9,doom/330)),52),along=sstep(.3,.62,vnoise(angle*5+11,doom/90));glow=Math.max(glow,thread*along*Math.min(1,(225-doom)/70)*1.7);}
 return Math.min(1,glow);
}
// The low sun's shadows and the darkness of deep valleys, kept in a texture: red is sunlight, green is open sky, blue is lava.
// The worn ground each place stands on, close to the walls.
const siteGround={scouts:[112,106,76],isengard:[58,52,44],library:[112,116,84],lorien:[122,112,62],council:[32,38,26],forge:[70,66,60],gate:[126,122,98],messengers:[92,110,58],treasury:[96,90,72],observatory:[118,114,88]};
export const SUN={x:-.75,y:.72,z:.32};
async function bakeLight(){
 const out=new Uint8Array(FW*FH*4),len=hypot(SUN.x,SUN.z),sx=SUN.x/len,sz=SUN.z/len,rise=SUN.y/len,scale=HEIGHT;
 let top=-1e9;for(let i=0;i<field.length;i++)if(field[i]>top)top=field[i];const topY=(top-SEA)*scale;
 const sum=new Float64Array((FW+1)*(FH+1));for(let j=0;j<FH;j++){let row=0;for(let i=0;i<FW;i++){row+=field[j*FW+i];sum[(j+1)*(FW+1)+i+1]=sum[j*(FW+1)+i+1]+row;}}
 const R=30;
 for(let j=0;j<FH;j++){
  for(let i=0;i<FW;i++){
   const o=j*FW+i,base=(field[o]-SEA)*scale+1.5;let light=1,t=6;
   while(t<1300){const ray=base+t*rise;if(ray>topY)break;const a=Math.round(i+sx*t/CELL),b=Math.round(j+sz*t/CELL);if(a<0||b<0||a>=FW||b>=FH)break;const soft=5+t*.05,gap=(ray-(field[b*FW+a]-SEA)*scale+soft)/soft;if(gap<light){light=gap<0?0:gap;if(light<=0)break;}t*=1.16;t+=2;}
   const x0=Math.max(0,i-R),x1=Math.min(FW,i+R+1),y0=Math.max(0,j-R),y1=Math.min(FH,j+R+1),avg=(sum[y1*(FW+1)+x1]-sum[y0*(FW+1)+x1]-sum[y1*(FW+1)+x0]+sum[y0*(FW+1)+x0])/((x1-x0)*(y1-y0)),open=Math.max(.5,1-Math.max(0,(avg-field[o])*scale)/150);
   out[o*4]=light*255;out[o*4+1]=open*255;out[o*4+2]=lavaAt(EXTENT.x+i*CELL,EXTENT.y+j*CELL)*255;out[o*4+3]=255;
  }
  if(j%64===0)await breathe();
 }
 return {data:out,width:FW,height:FH};
}

function paintTerrain(canvas,w,h){
 const c=canvas.getContext('2d'),img=c.createImageData(w,h),px=img.data,sx=EXTENT.w/w,sy=EXTENT.h/h;
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){
  const wx=EXTENT.x+i*sx,wy=EXTENT.y+j*sy,hv=fieldAt(wx,wy),o=(j*w+i)*4;
  const detail=fbm(wx/34+50,wy/34+50,3),fine=fbm(wx/6+50,wy/6+50,3),patches=fbm(wx/120+50,wy/120+50,3);
  let r,g,b;
  // Lands run into each other along crooked borders, never along circles.
  const bx=wx+(fbm(wx/260+9,wy/260+4,3)-.5)*240,by=wy+(fbm(wx/260+31,wy/260+17,3)-.5)*240;
  if(hv<SEA){
   const depth=Math.min(1,(SEA-hv)/.14);r=46-depth*30;g=84-depth*42;b=88-depth*24;
   const shore=Math.max(0,1-(SEA-hv)/.014);r+=shore*90;g+=shore*74;b+=shore*50;
  }else{
   let sum=.12,lr=.12*80,lg=.12*94,lb=.12*58;const lift=Math.min(1,Math.max(0,detail*1.5-.25));
   for(const l of lands){const k=gauss(hypot(bx-l.x,by-l.y),l.r);sum+=k;lr+=k*(l.low[0]+(l.high[0]-l.low[0])*lift);lg+=k*(l.low[1]+(l.high[1]-l.low[1])*lift);lb+=k*(l.low[2]+(l.high[2]-l.low[2])*lift);}
   r=lr/sum;g=lg/sum;b=lb/sum;
   const tone=.78+patches*.44;r*=tone;g*=tone;b*=tone;
   const beach=Math.max(0,1-(hv-SEA)/.016);r+=(112-r)*beach;g+=(102-g)*beach;b+=(82-b)*beach;
   for(const id in sitePlaces){const q=sitePlaces[id],px=wx-q.x,py=wy-q.y-60,d=hypot(px,py);if(d>340)continue;const tone=siteGround[id],worn=sstep(165+patches*190,104,d)*.78;r+=(tone[0]-r)*worn;g+=(tone[1]-g)*worn;b+=(tone[2]-b)*worn;const wall=squareHalls.has(id)?Math.max(Math.abs(px),Math.abs(py))-118:d-123,dark=1-.4*sstep(30,0,wall);r*=dark;g*=dark;b*=dark;}
   const grain=(fine-.5)*30;r+=grain;g+=grain;b+=grain*.8;
  }
  px[o]=r;px[o+1]=g;px[o+2]=b;px[o+3]=255;
 }
 c.putImageData(img,0,0);
}

function smoothPath(c,points){c.beginPath();c.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length-1;i++){const mx=(points[i][0]+points[i+1][0])/2,my=(points[i][1]+points[i+1][1])/2;c.quadraticCurveTo(points[i][0],points[i][1],mx,my);}const last=points[points.length-1];c.lineTo(last[0],last[1]);}

// How far south of its hall each entrance ends, and where the great road passes it.
export const siteDoors={scouts:238,isengard:204,library:134,lorien:148,council:174,forge:162,gate:184,messengers:178,treasury:162,observatory:154};
const STOP=262;
const siteStops={observatory:205};
// The cliffs of the Deeping Coomb and the wall between them: no road runs through these.
const helmCliffs=[[-110,-190,105],[-140,-300,150],[120,-310,190],[336,-90,150],[222,18,100]];
export const roadLoop=Object.entries(sitePlaces).map(([id,q])=>({x:q.x,y:q.y+60+(siteStops[id]??STOP)}));
export const hubGate={x:HUB_SITE.x,y:HUB_SITE.y+205};
// Roads are found, not drawn: they keep off buildings and deep water, prefer gentle ground and low passes, and join where they can.
function planRoads(){
 const cell=20,x0=-260,y0=-260,cols=170,rows=110,H=new Float32Array(cols*rows),closed=new Uint8Array(cols*rows),used=new Uint8Array(cols*rows);
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const x=x0+i*cell,y=y0+j*cell,o=j*cols+i,hv=heightAt(x,y);H[o]=hv;
  let shut=hv<SEA-.06||Object.entries(sitePlaces).some(([id,q])=>hypot(x-q.x,y-q.y-60)<Math.min(250,(siteStops[id]??STOP)-14))||helmCliffs.some(([a,b,r])=>hypot(x-P.scouts.x-a,y-P.scouts.y-60-b)<r)||hypot(x-mountDoom.x,y-mountDoom.y)<178||(hypot(x-HUB_SITE.x,y-HUB_SITE.y)<226&&!(y>HUB_SITE.y&&Math.abs(x-HUB_SITE.x)<26));
  closed[o]=shut?1:0;
 }
 const index=q=>Math.max(0,Math.min(rows-1,Math.round((q.y-y0)/cell)))*cols+Math.max(0,Math.min(cols-1,Math.round((q.x-x0)/cell)));
 const search=(from,to)=>{
  const start=index(from),goal=index(to),best=new Float32Array(cols*rows).fill(1e9),back=new Int32Array(cols*rows).fill(-1),heap=[[0,start]];best[start]=0;
  const push=v=>{heap.push(v);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const a=2*i+1,b=a+1;let m=i;if(a<heap.length&&heap[a][0]<heap[m][0])m=a;if(b<heap.length&&heap[b][0]<heap[m][0])m=b;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
  const gx=goal%cols,gy=Math.floor(goal/cols);
  while(heap.length){
   const [,o]=pop();if(o===goal)break;const ox=o%cols,oy=Math.floor(o/cols);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const nx=ox+dx,ny=oy+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;const n=ny*cols+nx;if(closed[n]&&n!==goal&&n!==start)continue;
    const L=dx&&dy?28.28:20,grade=Math.abs(H[n]-H[o])*HEIGHT/L,high=Math.max(0,(H[n]-SEA)*HEIGHT-115)/36,wet=H[n]<SEA+.004?180:0;let c=L*(1+grade*grade*26+high)+wet;if(used[n])c*=.3;
    const total=best[o]+c;if(total<best[n]){best[n]=total;back[n]=o;push([total+hypot(nx-gx,ny-gy)*6,n]);}
   }
  }
  const cells=[];for(let o=goal;o>=0;o=back[o]){cells.push(o);used[o]=1;if(o===start)break;}cells.reverse();
  let line=[from,...cells.filter((_,i)=>i>0&&i<cells.length-1&&i%3===0).map(o=>({x:x0+(o%cols)*cell,y:y0+Math.floor(o/cols)*cell})),to];
  for(let round=0;round<2;round++){const next=[line[0]];for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1];next.push({x:a.x+(b.x-a.x)*.25,y:a.y+(b.y-a.y)*.25},{x:a.x+(b.x-a.x)*.75,y:a.y+(b.y-a.y)*.75});}next.push(line[line.length-1]);line=next;}
  return line;
 };
 const order=roadLoop.map((q,i)=>i).sort((a,b)=>hypot(roadLoop[a].x-hubGate.x,roadLoop[a].y-hubGate.y)-hypot(roadLoop[b].x-hubGate.x,roadLoop[b].y-hubGate.y)),spokes=[];
 for(const i of order)spokes[i]=search(roadLoop[i],hubGate);
 const ring=roadLoop.map((q,i)=>search(q,roadLoop[(i+1)%roadLoop.length]));
 const lanes=Object.fromEntries(Object.entries(sitePlaces).map(([id,q],i)=>{const stop=roadLoop[i],door={x:q.x,y:q.y+60+126},line=[];for(let k=0;k<=6;k++)line.push({x:door.x,y:door.y+(stop.y-door.y)*k/6});return [id,line];}));
 const all=[...spokes,...ring],ways=[...all,...Object.values(lanes)];
 const fill=(heights)=>{const map=new Map();ways.forEach((line,w)=>{for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1],q=[a.x,a.y,b.x,b.y,heights?heights[w][i]:0,heights?heights[w][i+1]:0],x1=Math.floor((Math.min(a.x,b.x)-120)/120),x2=Math.floor((Math.max(a.x,b.x)+120)/120),y1=Math.floor((Math.min(a.y,b.y)-120)/120),y2=Math.floor((Math.max(a.y,b.y)+120)/120);for(let u=x1;u<=x2;u++)for(let v=y1;v<=y2;v++){const key=u*100000+v;if(!map.has(key))map.set(key,[]);map.get(key).push(q);}}});roadBuckets=map;lastRX=NaN;};
 // First the passes open up, then every road is graded to an even walk.
 fill(null);
 const fordAt=(line,i,v)=>{const b=sstep(36,12,riverDistance(line[i].x,line[i].y,36));return Math.max(SEA+.02,v)*(1-b)+(SEA-.012)*b;};
 const heights=ways.map((line,w)=>{
  const raw=line.map(q=>heightAt(q.x,q.y));
  if(w>=all.length){const id=Object.keys(lanes)[w-all.length],end=raw[raw.length-1];return raw.map((_,k)=>{const t=k/(raw.length-1),s=t*t*(3-2*t);return sitePlaces[id].elev*(1-s)+end*s;}).map((v,i)=>fordAt(line,i,v));}
  let row=raw;for(let round=0;round<4;round++)row=row.map((v,i)=>{if(i===0||i===row.length-1)return raw[i];let sum=0,n=0;for(let k=-4;k<=4;k++){const q=row[i+k];if(q!==undefined){sum+=q;n++;}}return sum/n;});
  return row.map((v,i)=>fordAt(line,i,v));
 });
 fill(heights);roadsGraded=true;
 // Wherever a way runs under water it gets a bridge; shared crossings are built once.
 const crossings=[],seen=new Set();
 ways.forEach((line,w)=>{let from=-1;line.forEach((q,i)=>{const wet=heights[w][i]<SEA+.003;if(wet&&from<0)from=i;if(from>=0&&(!wet||i===line.length-1)){const a=line[Math.max(0,from-1)],b=line[i],key=`${Math.round((a.x+b.x)/40)}|${Math.round((a.y+b.y)/40)}`;if(!seen.has(key)){seen.add(key);crossings.push(line.slice(Math.max(0,from-1),i+1));}from=-1;}});});
 return {spokes,ring,lanes,crossings};
}
const network=planRoads();
export const onRoad=(x,y,r=11)=>roadDistance(x,y)<r;
export const spokes=network.spokes,ringPaths=network.ring,lanes=network.lanes,crossings=network.crossings;
function paintRoads(c){
 const ways=[...ringPaths,...spokes],doors=Object.values(lanes);
 c.lineCap='round';c.lineJoin='round';
 for(const [blur,width,color] of [[3,20,'#4f442f33'],[1.4,12,'#5e5139aa'],[.7,7,'#7a6b4ce0']]){c.filter=`blur(${blur}px)`;c.strokeStyle=color;c.lineWidth=width;for(const way of ways){smoothPath(c,way.map(q=>[q.x,q.y]));c.stroke();}c.lineWidth=width*1.15;for(const way of doors){smoothPath(c,way.map(q=>[q.x,q.y]));c.stroke();}}
 c.filter='none';
}
function paintFields(c){
 const shire=P.messengers;
 for(let i=0;i<40;i++){
  const a=i*2.399,d=210+i*7,x=shire.x+Math.cos(a)*d,y=shire.y+60+Math.sin(a)*d*.8,w=44+(i%4)*12,h=w*.6;
  if(fieldAt(x,y)<SEA+.03)continue;
  c.save();c.translate(x,y);c.rotate(a*.3);c.filter='blur(2.2px)';c.globalAlpha=.42;c.fillStyle=['#7c7038','#667436','#566530','#857640'][i%4];c.beginPath();c.roundRect(-w/2,-h/2,w,h,9);c.fill();c.filter='blur(.6px)';c.strokeStyle='#00000022';c.lineWidth=1;for(let k=-w/2+4;k<w/2-2;k+=4){c.beginPath();c.moveTo(k,-h/2+3);c.lineTo(k,h/2-3);c.stroke();}c.globalAlpha=1;c.filter='none';c.restore();
 }
}
function makeCanvas(w,h){const n=document.createElement('canvas');n.width=w;n.height=h;return n;}
// How far the wood keeps from each place, because of the buildings standing around it.
const siteClearing={scouts:300,isengard:300,library:235,lorien:185,council:222,forge:222,gate:300,messengers:230,treasury:270,observatory:245};
// The ground each building really covers, so nothing grows inside it.
const siteFoot={scouts:172,isengard:175,library:136,lorien:140,council:206,forge:206,gate:178,messengers:180,treasury:206,observatory:152};
const siteDressing={scouts:['stone'],isengard:['stone','log'],library:['bush','stone'],lorien:['goldbush'],council:['darkbush','log'],forge:['stone'],gate:['bush','stone'],messengers:['bush'],treasury:['stone'],observatory:['stone','bush']};
export async function buildWorld(){
 await buildField();await breathe();
 const light=await bakeLight();await breathe();
 const trees=[];
 const raw=makeCanvas(FW-1,FH-1);paintTerrain(raw,FW-1,FH-1);await breathe();
 const landScale=matchMedia('(pointer:coarse)').matches?1:1.5,land=makeCanvas(EXTENT.w*landScale,EXTENT.h*landScale),c=land.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(raw,0,0,land.width,land.height);
 c.save();c.scale(landScale,landScale);c.translate(-EXTENT.x,-EXTENT.y);paintFields(c);paintRoads(c);c.restore();
 const heightOf=fieldAt;
 const nearRoad=(x,y)=>roadDistance(x,y)<24;
 for(let y=30;y<WORLD.h-10;y+=13)for(let x=10;x<WORLD.w-10;x+=13){
  const jx=x+(vnoise(x*.7,y*.3)-.5)*22,jy=y+(vnoise(x*.3,y*.7)-.5)*22,hv=heightOf(jx,jy);
  if(hv<SEA+.025||hv>.82||nearRoad(jx,jy))continue;
  // Nothing grows on cliffs.
  if(Math.abs(heightOf(jx+6,jy)-heightOf(jx-6,jy))+Math.abs(heightOf(jx,jy+6)-heightOf(jx,jy-6))>.1)continue;
  if(Object.entries(sitePlaces).some(([id,q])=>hypot(jx-q.x,jy-q.y-60)<siteClearing[id]+(fbm(jx/70,jy/70,2)-.5)*70||(Math.abs(jx-q.x)<105&&jy>q.y&&jy<q.y+420)))continue;
  const hub=hypot(jx-HUB_SITE.x,(jy-HUB_SITE.y)/.72);if(hub<300)continue;
  const density=fbm(jx/170,jy/170,3),d=(q,r)=>hypot(jx-q.x,jy-q.y)<r;
  let kind='oak',need=.54;
  if(hub<540){kind='dead';need=.66;}
  else if(d(P.council,430)){kind='dark';need=.18;}
  else if(d(P.lorien,420)){kind='mallorn';need=.3;}
  else if(d(P.library,330)){kind='pine';need=.36;}
  else if(d(P.isengard,330)){kind='dead';need=.6;}
  else if(d(P.forge,320)){kind='pine';need=.62;}
  else if(d(P.scouts,340)){kind='pine';need=.8;}
  else if(d(P.messengers,430)){kind=vnoise(jx/30,jy/30)>.45?'oak':'birch';need=.58;}
  else if(hypot(jx-rohan.x,jy-rohan.y)<300)continue;
  else if(hv>.6){kind='pine';need=.4;}
  if(density>need+(vnoise(jx/9,jy/9)-.5)*.12){trees.push({x:jx,y:jy,kind,s:.8+vnoise(jx/3,jy/3)*.6,tone:.82+vnoise(jx/5,jy/7)*.36});if(kind!=='dead'&&density>need+.12&&vnoise(jx/2.3,jy/2.3)>.86)trees.push({x:jx+7,y:jy+5,kind:'log',s:.7+vnoise(jx/4,jy/4)*.5,tone:.9});}
  // Bushes and young growth gather at the edge of every wood.
  else if(kind!=='dead'&&density>need-.06&&vnoise(jx/4,jy/4)>.68)trees.push({x:jx,y:jy,kind:kind==='dark'?'darkbush':kind==='mallorn'?'goldbush':'bush',s:.7+vnoise(jx/3,jy/3)*.8,tone:.82+vnoise(jx/5,jy/7)*.36});
 }
 // Bushes and stones gather at the foot of every wall, except before its door.
 for(const [id,q] of Object.entries(sitePlaces))for(let i=0;i<70;i++){const a=i*2.399,r=siteFoot[id]+8+vnoise(i*.7,id.length)*38,dx=Math.cos(a)*r,dy=Math.sin(a)*r;if(Math.abs(dx)<52&&dy>0)continue;const x=q.x+dx,y=q.y+60+dy,kinds=siteDressing[id];if(roadDistance(x,y)<20)continue;trees.push({x,y,kind:kinds[i%kinds.length],s:.55+vnoise(x/3,y/3)*.8,tone:.8+vnoise(x/5,y/7)*.4});}
 // A mallorn never stands alone: stray ones at the edge of the wood are left out.
 const golden=trees.filter(t=>t.kind==='mallorn'),alone=new Set(golden.filter(t=>golden.filter(o=>hypot(o.x-t.x,o.y-t.y)<62).length<5));
 // Great trees keep their distance, so each stands free on its own trunk.
 const kept=[],room={mallorn:52,dark:24};
 for(const t of trees.filter(t=>!alone.has(t))){const r=room[t.kind];if(r&&kept.some(o=>o.kind===t.kind&&hypot(o.x-t.x,o.y-t.y)<r))continue;if(t.kind==='mallorn')t.s*=1.25;kept.push(t);}
 return {land,landScale,trees:kept,light};
}
