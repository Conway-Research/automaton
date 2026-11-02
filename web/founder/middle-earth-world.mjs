// The land of the Middle-earth desktop: places, people, terrain, rivers, roads and forests.
// Pure data and painting. No data from the server and no server access.
export const WORLD={w:2800,h:1750};
export const HUB_SITE={x:1400,y:800,r:210};
// Order runs clockwise, as the road does. Mordor stays in the middle because the eye is the centre of Numaron.
export const sitePlaces={scouts:{x:570,y:360,elev:.6},library:{x:1120,y:290,elev:.42},forge:{x:1680,y:300,elev:.56},treasury:{x:2240,y:400,elev:.5},council:{x:2460,y:830,elev:.47},lorien:{x:2230,y:1220,elev:.46},gate:{x:1650,y:1300,elev:.52},observatory:{x:1120,y:1310,elev:.42},isengard:{x:560,y:1240,elev:.45},messengers:{x:340,y:820,elev:.46}};
export const mountDoom={x:1960,y:760};
export const rohan={x:790,y:1120};

export const workstationNames={hammer:'Amboss',chisel:'Werkbank',quill:'Schreibpult',scroll:'Aktenpult',book:'Lesepult',pick:'Erzhaufen',sack:'Materiallager',scale:'Prüfwaage',seal:'Siegeltisch',staff:'Sternenpodest',compass:'Kartentisch',bow:'Spähposten',coin:'Zähltisch',letter:'Postregal',ladle:'Wasserbecken',sword:'Waffenständer'};
// Offsets are relative to the settlement centre. Everybody has a place of their own.
export const crews={
 scouts:[{name:'Halbarad',people:'ranger',x:-70,y:44,tool:'compass',action:'liest die Karte'},{name:'Madril',people:'ranger',x:10,y:66,tool:'quill',action:'markiert Quellen'},{name:'Anborn',people:'ranger',x:88,y:40,tool:'bow',action:'hält Ausschau'}],
 isengard:[{name:'Uglúk',people:'uruk',x:-84,y:50,tool:'hammer',action:'treibt an'},{name:'Mauhúr',people:'uruk',x:-18,y:74,tool:'pick',action:'gleicht ab'},{name:'Snaga',people:'orc',x:50,y:62,tool:'sack',action:'schleppt Akten'},{name:'Gorbag',people:'orc',x:106,y:38,tool:'pick',action:'bricht auf'}],
 library:[{name:'Elrond',people:'noldor',x:-68,y:46,tool:'book',action:'liest Quellen'},{name:'Erestor',people:'noldor',x:6,y:68,tool:'quill',action:'hält Belege fest'},{name:'Glorfindel',people:'noldor',x:84,y:44,tool:'scroll',action:'vertieft Fundstellen'}],
 lorien:[{name:'Galadriel',people:'galadhrim',x:-64,y:52,tool:'ladle',action:'prüft im Spiegel'},{name:'Celeborn',people:'galadhrim',x:14,y:74,tool:'scroll',action:'wägt Chancen'},{name:'Haldir',people:'galadhrim',x:90,y:40,tool:'bow',action:'stellt Gegenfragen'}],
 council:[{name:'Thranduil',people:'silvan',x:-70,y:52,tool:'staff',action:'bestimmt den Kurs'},{name:'Galion',people:'silvan',x:4,y:76,tool:'compass',action:'zerlegt das Vorhaben'},{name:'Feren',people:'silvan',x:80,y:50,tool:'scroll',action:'begrenzt den Umfang'}],
 forge:[{name:'Balin',people:'dwarf',x:-92,y:50,tool:'hammer',action:'schmiedet'},{name:'Ori',people:'dwarf',x:-26,y:76,tool:'chisel',action:'prüft den Rohling'},{name:'Óin',people:'dwarf',x:44,y:64,tool:'hammer',action:'facht die Esse an'},{name:'Flói',people:'dwarf',x:106,y:42,tool:'sack',action:'bringt Material'}],
 gate:[{name:'Denethor',people:'gondor',x:-78,y:60,tool:'seal',action:'siegelt Freigaben'},{name:'Beregond',people:'gondor',x:4,y:82,tool:'scale',action:'wägt das Ergebnis'},{name:'Imrahil',people:'gondor',x:84,y:58,tool:'scroll',action:'liest Prüfbericht'}],
 messengers:[{name:'Bilbo',people:'hobbit',x:-86,y:48,tool:'letter',action:'liest Antworten'},{name:'Rosie',people:'hobbit',x:-26,y:72,tool:'sack',action:'packt die Post'},{name:'Merry',people:'hobbit',x:42,y:70,tool:'letter',action:'sortiert Fristen'},{name:'Pippin',people:'hobbit',x:102,y:44,tool:'quill',action:'führt den Kalender'}],
 treasury:[{name:'Dáin',people:'dwarf',x:-74,y:54,tool:'coin',action:'gleicht Zahlungen ab'},{name:'Glóin',people:'dwarf',x:2,y:78,tool:'quill',action:'führt das Hauptbuch'},{name:'Bard',people:'dale',x:82,y:50,tool:'book',action:'sammelt Kennzahlen'}],
 observatory:[{name:'Elendil',people:'numenorean',x:-72,y:52,tool:'compass',action:'wertet Reihen aus'},{name:'Isildur',people:'numenorean',x:6,y:76,tool:'book',action:'hält Lehren fest'},{name:'Anárion',people:'numenorean',x:84,y:50,tool:'quill',action:'vergleicht Läufe'}],
};
// The best-known figures stay where they belong; only Gandalf travels everywhere. They are scenery and never stand for real work.
export const wanderers=[
 {name:'Gandalf',people:'wizard',tool:'staff',home:null},{name:'Frodo',people:'hobbit',tool:'letter',home:'messengers'},{name:'Sam',people:'hobbit',tool:'sack',home:'messengers'},
 {name:'Aragorn',people:'ranger',tool:'sword',home:'scouts'},{name:'Arwen',people:'noldor',tool:'book',home:'library'},{name:'Legolas',people:'silvan',tool:'bow',home:'council'},{name:'Gimli',people:'dwarf',tool:'hammer',home:'treasury'},
 {name:'Boromir',people:'gondor',tool:'sword',home:'gate'},{name:'Faramir',people:'gondor',tool:'bow',home:'observatory'},{name:'Saruman',people:'whitewizard',tool:'staff',home:'isengard'},{name:'Gollum',people:'gollum',tool:'coin',home:'forge'},
 {name:'Éowyn',people:'rohirrim',tool:'sword',home:'rohan'},{name:'Théoden',people:'rohirrim',tool:'sword',home:'rohan'},
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
 {x:P.scouts.x,y:P.scouts.y,r:380,low:[96,98,66],high:[78,78,58]},{x:P.library.x,y:P.library.y,r:300,low:[58,88,52],high:[46,72,50]},{x:P.forge.x,y:P.forge.y,r:300,low:[76,74,68],high:[58,56,54]},{x:P.treasury.x,y:P.treasury.y,r:330,low:[88,88,70],high:[70,70,60]},
 {x:P.council.x,y:P.council.y,r:320,low:[26,44,30],high:[18,34,26]},{x:P.lorien.x,y:P.lorien.y,r:370,low:[122,112,56],high:[100,94,50]},{x:P.gate.x,y:P.gate.y,r:320,low:[104,110,80],high:[92,98,78]},{x:P.observatory.x,y:P.observatory.y,r:330,low:[104,108,70],high:[86,90,62]},
 {x:P.isengard.x,y:P.isengard.y,r:300,low:[56,52,44],high:[40,38,34]},{x:P.messengers.x,y:P.messengers.y,r:360,low:[84,128,58],high:[70,112,50]},{x:rohan.x,y:rohan.y,r:320,low:[148,134,82],high:[126,114,70]},{x:HUB_SITE.x,y:HUB_SITE.y,r:480,low:[44,32,28],high:[26,20,20]},
];

// Anduin, Bruinen and the Isen run in valleys of their own down to the sea.
const riverCourses=[[[1960,190],[2005,420],[2130,650],[2200,860],[2060,1100],[1950,1300],[1990,1500],[1920,1700],[1960,1980]],[[1360,160],[1370,480],[1110,610],[800,560],[540,650],[200,650],[-260,720]],[[290,1160],[260,1400],[420,1620],[600,1760],[640,2000]]];
const riverLines=riverCourses.map(points=>{const out=[];for(let i=0;i<points.length-1;i++){const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];for(let k=0;k<6;k++){const t=k/6,t2=t*t,t3=t2*t;out.push([.5*(2*b[0]+(c[0]-a[0])*t+(2*a[0]-5*b[0]+4*c[0]-d[0])*t2+(3*b[0]-a[0]-3*c[0]+d[0])*t3),.5*(2*b[1]+(c[1]-a[1])*t+(2*a[1]-5*b[1]+4*c[1]-d[1])*t2+(3*b[1]-a[1]-3*c[1]+d[1])*t3)]);}}out.push(points[points.length-1]);return out;});
const segmentDistance=(x,y,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));return hypot(x-ax-dx*t,y-ay-dy*t);};
function exactRiver(x,y){let best=1e9;for(const line of riverLines)for(let i=0;i<line.length-1;i++){const q=segmentDistance(x,y,line[i][0],line[i][1],line[i+1][0],line[i+1][1]);if(q<best)best=q;}return best;}
let roadSegments=null;
function exactRoad(x,y){
 if(!roadSegments){roadSegments=[];const ring=[...roadLoop,roadLoop[0]];for(let i=0;i<ring.length-1;i++)roadSegments.push([ring[i].x,ring[i].y,ring[i+1].x,ring[i+1].y]);for(const way of spokes)for(let i=0;i<way.length-1;i++)roadSegments.push([way[i].x,way[i].y,way[i+1].x,way[i+1].y]);}
 let best=1e9;for(const s of roadSegments){const q=segmentDistance(x,y,s[0],s[1],s[2],s[3]);if(q<best)best=q;}return best;
}
// Most of the land is far from any road or river, so a coarse map spares the exact measurement.
const coarseMap=exact=>{const cell=40,cols=112,rows=90,cache=new Float32Array(cols*rows).fill(-1);return (x,y,reach)=>{const i=Math.floor((x+800)/cell),j=Math.floor((y+900)/cell);if(i>=0&&j>=0&&i<cols&&j<rows){const o=j*cols+i;if(cache[o]<0)cache[o]=exact(-800+(i+.5)*cell,-900+(j+.5)*cell);if(cache[o]>reach+cell)return 1e9;}else return 1e9;return exact(x,y);};};
const riverDistance=coarseMap(exactRiver),roadDistance=coarseMap(exactRoad);
const SEA=.335;
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
 if(M>.004||ring>.004){const pass=sstep(13,64,roadDistance(x,y,64));if(M>.004){const p=peaks(x*1.3,y*1.3);h+=M*pass*(.12+p*p*.55+p*.55);}if(ring>.004)h+=ring*sstep(7,30,roadDistance(x,y,30))*(.4+peaks(x*2.7+70,y*2.7)*.72+peaks(x*7.3+30,y*7.3+90)*.26);}
 // The Lonely Mountain stands alone; Weathertop is a bare hill and Isengard lies in a ring of rock.
 const erebor=hypot(x-2290,y-20);if(erebor<540){const t=1-erebor/540;h+=1.95*Math.pow(t,1.3)*(.7+peaks(x*1.5+90,y*1.5)*.5);}
 h+=gauss(hypot(x-P.scouts.x,y-P.scouts.y-60),210)*.14;
 h+=gauss(hypot(x-P.isengard.x,y-P.isengard.y-60)-330,30)*.3*sstep(26,80,roadDistance(x,y,80));
 h-=gauss(r,240)*.08;
 // Mount Doom: a real volcano with gullied flanks and an open crater.
 const doom=hypot(x-mountDoom.x,y-mountDoom.y);if(doom<235){const t=1-doom/235,gully=vnoise(Math.atan2(y-mountDoom.y,x-mountDoom.x)*5+20,doom/46);h+=1.22*Math.pow(t,1.62)*(.84+gully*.3+(t<.86?peaks(x*3.6,y*3.6)*.24:.1))*sstep(18,70,roadDistance(x,y,70));if(doom<52)h-=Math.pow(1-doom/52,.6)*.34;}
 // The coast of the western sea and of the bay in the south.
 const west=-70+(vnoise(3.3,y/380+9)-.5)*330+(fbm(1.1,y/120+3,3)-.5)*90,south=1730+(vnoise(x/420+4,7.7)-.5)*240+(fbm(x/120+3,2.2,3)-.5)*90,sea=Math.max(sstep(west+170,west-70,x),sstep(south-170,south+70,y));
 if(sea>0)h=h*(1-sea)+(SEA-.16)*sea;
 for(const place of Object.values(sitePlaces)){const k=sstep(345,232,hypot(x-place.x,y-place.y-60));if(k>0)h=h*(1-k)+place.elev*k;}
 const hubFlat=sstep(335,225,hypot(x-HUB_SITE.x,y-HUB_SITE.y));if(hubFlat>0)h=h*(1-hubFlat)+.44*hubFlat;
 const stream=riverDistance(x+(vnoise(x/46,y/46)-.5)*36,y+(vnoise(x/46+8,y/46+2)-.5)*36,190);
 if(stream<190){
  const valley=sstep(190,16,stream);h=h*(1-valley)+Math.min(h,SEA+.075)*valley;
  const bed=sstep(28,8,stream);if(bed>0)h=h*(1-bed)+(roadDistance(x,y,24)<24?SEA+.012:SEA-.022)*bed;
 }
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
  if(hv<SEA){
   const depth=Math.min(1,(SEA-hv)/.14);r=46-depth*30;g=84-depth*42;b=88-depth*24;
   const shore=Math.max(0,1-(SEA-hv)/.014);r+=shore*90;g+=shore*74;b+=shore*50;
  }else{
   let sum=.12,lr=.12*80,lg=.12*94,lb=.12*58;const lift=Math.min(1,Math.max(0,detail*1.5-.25));
   for(const l of lands){const k=gauss(hypot(wx-l.x,wy-l.y),l.r);sum+=k;lr+=k*(l.low[0]+(l.high[0]-l.low[0])*lift);lg+=k*(l.low[1]+(l.high[1]-l.low[1])*lift);lb+=k*(l.low[2]+(l.high[2]-l.low[2])*lift);}
   r=lr/sum;g=lg/sum;b=lb/sum;
   const tone=.78+patches*.44;r*=tone;g*=tone;b*=tone;
   const beach=Math.max(0,1-(hv-SEA)/.016);r+=(112-r)*beach;g+=(102-g)*beach;b+=(82-b)*beach;
   const grain=(fine-.5)*30;r+=grain;g+=grain;b+=grain*.8;
  }
  px[o]=r;px[o+1]=g;px[o+2]=b;px[o+3]=255;
 }
 c.putImageData(img,0,0);
}

function smoothPath(c,points){c.beginPath();c.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length-1;i++){const mx=(points[i][0]+points[i+1][0])/2,my=(points[i][1]+points[i+1][1])/2;c.quadraticCurveTo(points[i][0],points[i][1],mx,my);}const last=points[points.length-1];c.lineTo(last[0],last[1]);}

export const roadLoop=Object.values(sitePlaces).map(q=>({x:q.x,y:q.y+196}));
export const hubGate={x:HUB_SITE.x,y:HUB_SITE.y+150};

function paintRoads(c){
 const ring=[...roadLoop,roadLoop[0],roadLoop[1]].map(q=>[q.x,q.y]);
 for(const [width,color] of [[14,'#00000022'],[10,'#5e5138'],[6,'#7a6b4c']]){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';smoothPath(c,ring);c.stroke();}
}
// Every district has its own winding way to the gate of Barad-dûr, used by the carriers.
export const spokes=roadLoop.map((q,i)=>{const out=[];for(let k=0;k<=12;k++){const s=k/12,bend=Math.sin(s*Math.PI)*(i%2?70:-70)+Math.sin(s*9+i)*Math.sin(s*Math.PI)*16,dx=hubGate.x-q.x,dy=hubGate.y-q.y,len=hypot(dx,dy)||1;let px=q.x+dx*s-dy/len*bend,py=q.y+dy*s+dx/len*bend;
  // The way goes round the volcano, not over it.
  const off=hypot(px-mountDoom.x,py-mountDoom.y);if(off<175&&k>0&&k<12){px=mountDoom.x+(px-mountDoom.x)/(off||1)*175;py=mountDoom.y+(py-mountDoom.y)/(off||1)*175;}out.push({x:px,y:py});}return out;});
function paintSpokes(c){for(const way of spokes)for(const [width,color] of [[8,'#00000020'],[5,'#54482f'],[2.5,'#6f6044']]){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';smoothPath(c,way.map(q=>[q.x,q.y]));c.stroke();}}
function paintFields(c){
 const shire=P.messengers;
 for(let i=0;i<40;i++){
  const a=i*2.399,d=210+i*7,x=shire.x+Math.cos(a)*d,y=shire.y+60+Math.sin(a)*d*.8,w=44+(i%4)*12,h=w*.6;
  if(fieldAt(x,y)<SEA+.03)continue;
  c.save();c.translate(x,y);c.rotate(a*.3);c.fillStyle=['#7c7038','#667436','#566530','#857640'][i%4];c.fillRect(-w/2,-h/2,w,h);c.strokeStyle='#00000018';c.lineWidth=1;for(let k=-w/2;k<w/2;k+=4){c.beginPath();c.moveTo(k,-h/2);c.lineTo(k,h/2);c.stroke();}c.strokeStyle='#39452a';c.lineWidth=1.6;c.strokeRect(-w/2,-h/2,w,h);c.restore();
 }
}
function makeCanvas(w,h){const n=document.createElement('canvas');n.width=w;n.height=h;return n;}
export async function buildWorld(){
 await buildField();await breathe();
 const light=await bakeLight();await breathe();
 const trees=[];
 const raw=makeCanvas(FW-1,FH-1);paintTerrain(raw,FW-1,FH-1);await breathe();
 const land=makeCanvas(EXTENT.w,EXTENT.h),c=land.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(raw,0,0,EXTENT.w,EXTENT.h);
 c.save();c.translate(-EXTENT.x,-EXTENT.y);paintFields(c);paintRoads(c);paintSpokes(c);c.restore();
 const heightOf=fieldAt;
 const nearRoad=(x,y)=>roadLoop.some(q=>hypot(x-q.x,y-q.y)<52)||spokes.some(way=>way.some(q=>hypot(x-q.x,y-q.y)<34));
 for(let y=30;y<WORLD.h-10;y+=13)for(let x=10;x<WORLD.w-10;x+=13){
  const jx=x+(vnoise(x*.7,y*.3)-.5)*22,jy=y+(vnoise(x*.3,y*.7)-.5)*22,hv=heightOf(jx,jy);
  if(hv<SEA+.025||hv>.82||nearRoad(jx,jy))continue;
  // Nothing grows on cliffs.
  if(Math.abs(heightOf(jx+6,jy)-heightOf(jx-6,jy))+Math.abs(heightOf(jx,jy+6)-heightOf(jx,jy-6))>.1)continue;
  if(Object.values(sitePlaces).some(q=>hypot(jx-q.x,jy-q.y-40)<230||(Math.abs(jx-q.x)<300&&jy>q.y&&jy<q.y+560)))continue;
  const hub=hypot(jx-HUB_SITE.x,(jy-HUB_SITE.y)/.72);if(hub<300)continue;
  const density=fbm(jx/170,jy/170,3),d=(q,r)=>hypot(jx-q.x,jy-q.y)<r;
  let kind='oak',need=.54;
  if(hub<540){kind='dead';need=.66;}
  else if(d(P.council,430)){kind='dark';need=.18;}
  else if(d(P.lorien,420)){kind='mallorn';need=.3;}
  else if(d(P.library,330)){kind='pine';need=.36;}
  else if(d(P.isengard,330)){kind='dead';need=.6;}
  else if(d(P.forge,320)){kind='pine';need=.62;}
  else if(d(P.scouts,340)){kind='birch';need=.62;}
  else if(d(P.messengers,430)){kind=vnoise(jx/30,jy/30)>.45?'oak':'birch';need=.58;}
  else if(hypot(jx-rohan.x,jy-rohan.y)<300)continue;
  else if(hv>.6){kind='pine';need=.4;}
  if(density>need+(vnoise(jx/9,jy/9)-.5)*.12)trees.push({x:jx,y:jy,kind,s:.8+vnoise(jx/3,jy/3)*.6,tone:.82+vnoise(jx/5,jy/7)*.36});
 }
 return {land,trees,light};
}
