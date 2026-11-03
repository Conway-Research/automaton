// The land of the Middle-earth desktop: places, people, terrain, rivers, roads and forests.
// Pure data and painting. No data from the server and no server access.
export const WORLD={x:-448,y:-256,w:3696,h:2310};
// Halls and everything around them stand a quarter larger than their plans, so rooms have air and people look small in them.
export const SITE={scale:1.25,offset:75};
const R=SITE.scale,O=SITE.offset;
export const HUB_SITE={x:1400,y:800,r:210};
// Order runs clockwise, as the road does. Mordor stays in the middle because the eye is the centre of Numaron.
export const sitePlaces={isengard:{x:304,y:219,elev:.5},gate:{x:2509,y:272,elev:.42},forge:{x:1770,y:140,elev:.56},treasury:{x:1030,y:127,elev:.5},council:{x:2496,y:1354,elev:.46},lorien:{x:2985,y:905,elev:.47},scouts:{x:1730,y:1460,elev:.52},messengers:{x:1030,y:1473,elev:.46},library:{x:291,y:1381,elev:.42},observatory:{x:6,y:800,elev:.46}};
// The Grey Havens lie on the western sea below Rivendell, where the last road of the elves ends.
export const haven={x:-110,y:1960};
export const hallOf=id=>({x:sitePlaces[id].x,y:sitePlaces[id].y+O});
export const mountDoom={x:1960,y:760};
// The Black Gate, the entrance of Mordor, stands open to the south in the ring of mountains.
export const morannon={x:1320,y:1182};
export const rohan={x:595,y:1222};
// The dark mere before the Doors of Durin, beside the road.
export const mere={x:1865,y:425,a:74,b:58,level:.516};

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
 {name:'Aragorn',people:'ranger',tool:'sword',home:'scouts'},{name:'Arwen',people:'noldor',tool:'book',home:'library'},{name:'Legolas',people:'silvan',tool:'bow',home:'council'},{name:'Gimli',people:'dwarf',tool:'axe',home:'treasury'},
 {name:'Boromir',people:'gondor',tool:'sword',home:'gate'},{name:'Faramir',people:'gondor',tool:'bow',home:'observatory'},{name:'Saruman',people:'whitewizard',tool:'blackstaff',home:'isengard'},{name:'Gollum',people:'gollum',tool:'coin',home:'forge'},
 {name:'Éowyn',people:'rohirrim',tool:'sword',home:'scouts'},{name:'Théoden',people:'rohirrim',tool:'sword',home:'scouts'},
];

// Who means what to whom. A figure goes to the other one and they speak; all of it is scenery and says nothing about real work.
export const bonds=[
 {a:'Frodo',b:'Sam',tone:'warm'},
 {a:'Gandalf',b:'Frodo',tone:'warm'},
 {a:'Gandalf',b:'Saruman',tone:'hostile'},
 {a:'Gandalf',b:'Aragorn',tone:'warm'},
 {a:'Gandalf',b:'Théoden',tone:'warm'},
 {a:'Gollum',b:'Frodo',tone:'wary'},
 {a:'Sam',b:'Gollum',tone:'hostile'},
 {a:'Aragorn',b:'Arwen',tone:'warm'},
 {a:'Aragorn',b:'Boromir',tone:'warm'},
 {a:'Aragorn',b:'Éowyn',tone:'warm'},
 {a:'Éowyn',b:'Théoden',tone:'warm'},
 {a:'Boromir',b:'Faramir',tone:'warm'},
 {a:'Legolas',b:'Gimli',tone:'warm'},
 {a:'Legolas',b:'Aragorn',tone:'warm'},
 {a:'Gimli',b:'Aragorn',tone:'warm'},
];
// Friends and rivals also seek each other out in the halls, whenever the one at home has nothing real to do. Scenery as well.
export const hallVisits=[
 {guest:'Frodo',host:'Bilbo',tone:'warm'},
 {guest:'Sam',host:'Rosie',tone:'warm'},
 {guest:'Gandalf',host:'Bilbo',tone:'warm'},
 {guest:'Gandalf',host:'Elrond',tone:'warm'},
 {guest:'Gandalf',host:'Galadriel',tone:'warm'},
 {guest:'Gandalf',host:'Denethor',tone:'wary'},
 {guest:'Aragorn',host:'Elrond',tone:'warm'},
 {guest:'Aragorn',host:'Denethor',tone:'wary'},
 {guest:'Aragorn',host:'Gamling',tone:'warm'},
 {guest:'Arwen',host:'Elrond',tone:'warm'},
 {guest:'Legolas',host:'Thranduil',tone:'wary'},
 {guest:'Gimli',host:'Dáin',tone:'warm'},
 {guest:'Gimli',host:'Glóin',tone:'warm'},
 {guest:'Gimli',host:'Balin',tone:'warm'},
 {guest:'Boromir',host:'Denethor',tone:'warm'},
 {guest:'Faramir',host:'Denethor',tone:'wary'},
 {guest:'Saruman',host:'Uglúk',tone:'wary'},
 {guest:'Théoden',host:'Háma',tone:'warm'},
 {guest:'Éowyn',host:'Gamling',tone:'warm'},
];
// Colleagues in the same hall talk while nothing real keeps them busy.

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
 {x:P.scouts.x,y:P.scouts.y,r:475,low:[92,92,62],high:[74,74,58]},{x:P.library.x,y:P.library.y,r:450,low:[50,84,44],high:[66,86,40]},{x:P.forge.x,y:P.forge.y,r:375,low:[62,60,58],high:[46,45,44]},{x:P.treasury.x,y:P.treasury.y,r:412,low:[76,74,60],high:[58,56,50]},
 {x:P.council.x,y:P.council.y,r:330,low:[20,34,24],high:[14,26,20]},{x:P.lorien.x,y:P.lorien.y,r:462,low:[112,100,48],high:[90,84,44]},{x:P.gate.x,y:P.gate.y,r:400,low:[88,92,72],high:[76,80,68]},{x:P.observatory.x,y:P.observatory.y,r:412,low:[80,82,60],high:[64,66,52]},
 {x:P.isengard.x,y:P.isengard.y,r:375,low:[44,40,34],high:[30,28,26]},{x:P.messengers.x,y:P.messengers.y,r:450,low:[72,116,50],high:[60,100,44]},{x:rohan.x,y:rohan.y,r:400,low:[128,116,74],high:[106,96,62]},{x:HUB_SITE.x,y:HUB_SITE.y,r:480,low:[62,46,38],high:[42,32,28]},
];

// Anduin, Bruinen and the Isen run in valleys of their own down to the sea.
const riverCourses=[[[2139,-5],[2199,298],[2364,602],[2456,879],[2304,1196],[2192,1460],[2218,1724],[2086,1988],[2139,2358]],[[742,352],[708,480],[608,589],[397,714],[238,727],[120,668],[-52,589],[-184,602],[-791,694]],[[-65,1275],[-105,1592],[106,1882],[344,2067],[397,2384]],[[516,1077],[555,1302],[542,1513],[496,1724],[410,1909],[344,2067]]];
const riverLines=riverCourses.map(points=>{const out=[];for(let i=0;i<points.length-1;i++){const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];for(let k=0;k<6;k++){const t=k/6,t2=t*t,t3=t2*t;out.push([.5*(2*b[0]+(c[0]-a[0])*t+(2*a[0]-5*b[0]+4*c[0]-d[0])*t2+(3*b[0]-a[0]-3*c[0]+d[0])*t3),.5*(2*b[1]+(c[1]-a[1])*t+(2*a[1]-5*b[1]+4*c[1]-d[1])*t2+(3*b[1]-a[1]-3*c[1]+d[1])*t3)]);}}out.push(points[points.length-1]);return out;});
const segmentDistance=(x,y,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));return hypot(x-ax-dx*t,y-ay-dy*t);};
function exactRiver(x,y){let best=1e9;for(const line of riverLines)for(let i=0;i<line.length-1;i++){const q=segmentDistance(x,y,line[i][0],line[i][1],line[i+1][0],line[i+1][1]);if(q<best)best=q;}return best;}
let roadSegments=null;
// Most of the land is far from any road or river, so a coarse map spares the exact measurement.
const coarseMap=exact=>{const cell=40,cols=145,rows=115,cache=new Float32Array(cols*rows).fill(-1);return (x,y,reach)=>{const i=Math.floor((x+1200)/cell),j=Math.floor((y+1400)/cell);if(i>=0&&j>=0&&i<cols&&j<rows){const o=j*cols+i;if(cache[o]<0)cache[o]=exact(-1200+(i+.5)*cell,-1400+(j+.5)*cell);if(cache[o]>reach+cell)return 1e9;}else return 1e9;return exact(x,y);};};
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
 let M=gauss(y+450-bendY,250)*(1-.86*gauss(x-2590,330))*massif*.9;
 // Between the Eye and Minas Tirith the range is broken: the Eye looks straight across at the White City.
 const ring=gauss(r-530,84)*.72*sstep(280,500,hypot(x-1190,y-440))*sstep(150,360,hypot(x-mountDoom.x,y-mountDoom.y))*(1-.45*sstep(950,1130,y))*(1-sstep(190,90,Math.abs(x-morannon.x))*sstep(1020,1120,y));
 M+=gauss(hypot(x-1780,y+200),210)*.8;
 M+=gauss(hypot(x-1030,y+170),190)*.6;
 M+=gauss(x-4300-bendX*3,470)*(1-sstep(1300,2200,y))*massif*1.3;
 M+=gauss(y+2250-bendY*3,540)*massif*1.5;
 // No mountain stands between a place's entrance and the land in front of it.
 let front=0;for(const q of places){const dy=y-q.y-O;if(dy>0&&dy<950){const k=sstep(312,150,Math.abs(x-q.x))*sstep(950,700,dy);if(k>front)front=k;}}
 M*=1-front;const ringHere=ring*(1-front);
 if(M>.004||ringHere>.004){const pass=sstep(13,64,roadDistance(x,y,64));if(M>.004){const p=peaks(x*1.3,y*1.3);h+=M*pass*(.12+p*p*.55+p*.55);}if(ringHere>.004)h+=ringHere*sstep(7,30,roadDistance(x,y,30))*(.4+peaks(x*2.7+70,y*2.7)*.72+peaks(x*7.3+30,y*7.3+90)*.26);}
 // The Lonely Mountain stands alone and Isengard lies in a ring of rock.
 const erebor=hypot(x-2559,y+130);if(erebor<540){const t=1-erebor/540;h+=1.95*Math.pow(t,1.3)*(.7+peaks(x*1.5+90,y*1.5)*.5);}
 h+=gauss(hypot(x-P.isengard.x,y-P.isengard.y-O)-412,38)*.3*sstep(26,80,roadDistance(x,y,80))*(1-sstep(312,162,Math.abs(x-P.isengard.x))*sstep(0,75,y-P.isengard.y-O));
 h-=gauss(r,240)*.08;
 for(const [a,b,w] of [[-537,-375,212],[0,-587,225],[537,-350,212]])h+=gauss(hypot(x-P.library.x-a,y-P.library.y-O-b),w)*.09;
 // Mount Doom: a real volcano with gullied flanks and an open crater.
 const doom=hypot(x-mountDoom.x,y-mountDoom.y);if(doom<235){const t=1-doom/235,gully=vnoise(Math.atan2(y-mountDoom.y,x-mountDoom.x)*5+20,doom/46);h+=1.22*Math.pow(t,1.62)*(.84+gully*.3+(t<.86?peaks(x*3.6,y*3.6)*.24:.1))*sstep(18,70,roadDistance(x,y,70));if(doom<52)h-=Math.pow(1-doom/52,.6)*.34;}
 // The coast of the western sea and of the bay in the south.
 const west=-540+(vnoise(3.3,y/380+9)-.5)*330+(fbm(1.1,y/120+3,3)-.5)*90,south=2041+(vnoise(x/420+4,7.7)-.5)*240+(fbm(x/120+3,2.2,3)-.5)*90,sea=Math.max(sstep(west+170,west-70,x),sstep(south-170,south+70,y));
 if(sea>0)h=h*(1-sea)+(SEA-.16)*sea;
 // The Grey Havens: a level shore with deep water right before the quays.
 {const px=x-haven.x,py=y-haven.y,dist=hypot(px,py);if(dist<430){const t=sstep(30,74,py),k=t>0?sstep(430,250,dist):sstep(360,210,dist);h=h*(1-k)+(.395*(1-t)+(SEA-.14)*t)*k;}}
 for(const [id,place] of Object.entries(sitePlaces)){
  const deep=id==='treasury'?37:0,px=(x-place.x)/R,py=(y-place.y-O)/R+deep,d=hypot(px,py),k=sstep(300,178,d);if(k<=0)continue;h=h*(1-k)+place.elev*k;
  // A low bank of earth rises against the walls, so no hall lies on the land like a plate.
  const square=squareHalls.has(id),q=square?Math.max(Math.abs(px),Math.abs(py)):d,inner=square?118:deep?164:123;
  if(q>inner&&q<inner+70)h+=.021*sstep(inner,inner+6,q)*(1-sstep(inner+6,inner+62,q))*(.55+vnoise(x/24+id.length,y/24)*.9);
 }
 const hubFlat=sstep(335,225,hypot(x-HUB_SITE.x,y-HUB_SITE.y));if(hubFlat>0)h=h*(1-hubFlat)+.44*hubFlat;
 const stream=riverDistance(x+(vnoise(x/46,y/46)-.5)*36,y+(vnoise(x/46+8,y/46+2)-.5)*36,190);
 if(stream<190){
  const breadth=.85+vnoise(x/230+3,y/230+7)*.75,valley=sstep(190,20,stream);h=h*(1-valley)+Math.min(h,SEA+.075)*valley;
  // A low bank steps down to the water, narrow here, wide there, and the bed sinks gently towards the middle.
  const bank=sstep(62*breadth,34*breadth,stream);if(bank>0)h=h*(1-bank)+Math.min(h,SEA+.012+vnoise(x/30,y/30)*.006)*bank;
  const bed=sstep(38*breadth,12*breadth,stream);if(bed>0&&h>SEA-.05)h=h*(1-bed)+(SEA-.024-.012*sstep(16,2,stream))*bed;
 }
 // The ground before every entrance lies level with its hall, so stairs and gates stand on it and no bank cuts through them.
 for(const [id,place] of Object.entries(sitePlaces)){const px=Math.abs(x-place.x)/R,py=(y-place.y-O)/R,door=siteDoors[id];if(px>80||py<96||py>door+62)continue;const k=sstep(80,56,px)*sstep(96,116,py)*sstep(door+62,door+12,py)*sstep(14,46,stream);h=h*(1-k)+(place.elev+.006)*k;}
 if(roadsGraded){const d=roadDistance(x,y);if(d<64){const k=sstep(64,11,d);h=h*(1-k)+lastRH*k;}}
 {const q=hypot((x-mere.x)/mere.a,(y-mere.y)/mere.b);if(q<1.6){const k=sstep(1.55,.98,q);h=h*(1-k)+(mere.level+.012-.05*sstep(.98,.5,q))*k;}}
 return Math.max(SEA-.2,h);
}
// World height in units above the sea, used by the terrain mesh and everything standing on it.
const HEIGHT=330;
// The painted, shaded part of the world reaches somewhat past the places themselves.
export const EXTENT={x:-976,y:-1180,w:4752,h:3696};
const CELL=3.2,FW=Math.round(EXTENT.w/CELL)+1,FH=Math.round(EXTENT.h/CELL)+1;
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
   // Along running water: greener grass, then damp dark earth, then gravel at the very edge. It all fades out softly.
   {const flow=riverDistance(wx+(vnoise(wx/46,wy/46)-.5)*36,wy+(vnoise(wx/46+8,wy/46+2)-.5)*36,150);if(flow<150){const lush=sstep(150,50,flow)*.42*(.6+patches*.7);r+=(r*.72-r)*lush;g+=(g*1.05-g)*lush;b+=(b*.74-b)*lush;const damp=sstep(82,44,flow)*.5*(.55+fine*.7);r+=(58-r)*damp;g+=(56-g)*damp;b+=(38-b)*damp;const wet=Math.max(0,1-(hv-SEA)/.01)*(.45+fine*.75);r+=(126-r)*wet;g+=(118-g)*wet;b+=(100-b)*wet;}}
   for(const id in sitePlaces){const q=sitePlaces[id],px=(wx-q.x)/R,py=(wy-q.y-O)/R,d=hypot(px,py);if(d>340)continue;const tone=siteGround[id],worn=sstep(165+patches*190,104,d)*.78;r+=(tone[0]-r)*worn;g+=(tone[1]-g)*worn;b+=(tone[2]-b)*worn;const wall=squareHalls.has(id)?Math.max(Math.abs(px),Math.abs(py))-118:d-123,dark=1-.4*sstep(30,0,wall);r*=dark;g*=dark;b*=dark;}
   const grain=(fine-.5)*30;r+=grain;g+=grain;b+=grain*.8;
  }
  px[o]=r;px[o+1]=g;px[o+2]=b;px[o+3]=255;
 }
 c.putImageData(img,0,0);
}

function smoothPath(c,points){c.beginPath();c.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length-1;i++){const mx=(points[i][0]+points[i+1][0])/2,my=(points[i][1]+points[i+1][1])/2;c.quadraticCurveTo(points[i][0],points[i][1],mx,my);}const last=points[points.length-1];c.lineTo(last[0],last[1]);}

// How far south of its hall each entrance ends, and where the great road passes it.
export const siteDoors={scouts:244,isengard:204,library:144,lorien:148,council:178,forge:162,gate:194,messengers:200,treasury:206,observatory:168};
// Sauron's round: from the Black Gate along the foot of the mountains, all the way round the Dark Tower and back.
export const sauronWay=[[1320,1134],[1271,1064],[1218,994],[1197,924],[1204,854],[1218,784],[1246,714],[1302,655],[1372,623],[1442,616],[1512,620],[1582,644],[1645,700],[1680,767],[1666,819],[1610,865],[1540,921],[1470,973],[1407,1015],[1365,1064],[1344,1110],[1320,1134]].map(([x,y])=>({x,y}));
const STOP=262;
const siteStops={messengers:228};
// Rivendell and Osgiliath lie close together; the road between them needs its own gap.
const siteReach={library:205,observatory:225,scouts:215,lorien:190};
// The cliffs behind a place and the walls between them: no road runs through these.
const siteCliffs={scouts:[[-110,-170,85],[-130,-245,110],[110,-265,160],[250,-90,75],[222,18,100],[-250,222,22],[-205,222,22],[-160,222,22],[-115,222,22],[-70,222,22],[70,222,22],[115,222,22],[160,222,22],[205,222,22],[250,222,22],[-28,232,14],[28,232,14],[-145,145,40],[145,145,40]],lorien:[[-180,-70,26],[200,-40,26],[-110,-150,26],[0,-200,34],[120,-160,28]],observatory:[[230,-50,24],[160,168,18],[-160,-180,26],[-190,-200,18],[129,-193,20],[158,-176,18],[187,-159,18],[-140,155,24]],library:[[-186,-96,68],[-176,52,46],[-110,-150,30],[-40,-190,30],[50,-185,30],[120,-150,30],[252,-60,26],[240,-170,18],[240,92,22],[245,20,18],[-260,-50,18],[-235,70,18],[178,-340,92],[-270,-110,18],[-40,-270,18],[70,-265,18],[150,-230,18],[-215,160,18]],messengers:[[-232,58,56],[232,62,58],[-288,-52,54],[288,-46,56],[-306,132,48],[306,136,50],[-40,-205,30]]};
export const roadLoop=Object.entries(sitePlaces).map(([id,q])=>({x:q.x,y:q.y+O+(siteStops[id]??STOP)*R}));
export const hubGate={x:HUB_SITE.x,y:HUB_SITE.y+205};
// Roads are found, not drawn: they keep off buildings and deep water, prefer gentle ground and low passes, and join where they can.
function planRoads(){
 const cell=20,x0=-640,y0=-500,cols=212,rows=154,H=new Float32Array(cols*rows),closed=new Uint8Array(cols*rows),used=new Uint8Array(cols*rows);
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const x=x0+i*cell,y=y0+j*cell,o=j*cols+i,hv=heightAt(x,y);H[o]=hv;
  let shut=hv<SEA-.06||Object.entries(sitePlaces).some(([id,q])=>hypot(x-q.x,y-q.y-O)<(siteReach[id]??Math.min(250,(siteStops[id]??STOP)-14))*R)||Object.entries(siteCliffs).some(([id,cliffs])=>cliffs.some(([a,b,r])=>hypot(x-P[id].x-a*R,y-P[id].y-O-b*R)<r*R))||hypot(x-mountDoom.x,y-mountDoom.y)<178||(y>960&&Math.abs(x-morannon.x)>=26&&Math.abs(hypot(x-HUB_SITE.x,(y-HUB_SITE.y)/.72)-530)<34)||(hypot(x-HUB_SITE.x,y-HUB_SITE.y)<226&&!(y>HUB_SITE.y&&Math.abs(x-HUB_SITE.x)<26))||(hypot(x-morannon.x,y-morannon.y)<96&&Math.abs(x-morannon.x)>=12);
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
    const L=dx&&dy?28.28:20,grade=Math.abs(H[n]-H[o])*HEIGHT/L,high=Math.max(0,(H[n]-SEA)*HEIGHT-115)/36,wet=H[n]<SEA+.004?(used[n]?0:320):0;let c=L*(1+grade*grade*26+high)+wet;if(used[n])c*=.5;else if(beside(nx,ny))c*=1.7;
    const total=best[o]+c;if(total<best[n]){best[n]=total;back[n]=o;push([total+hypot(nx-gx,ny-gy)*6,n]);}
   }
  }
  const cells=[];for(let o=goal;o>=0;o=back[o]){cells.push(o);used[o]=1;if(o===start)break;}cells.reverse();
  return {from,to,cells};
 };
 const beside=(x,y)=>{for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++){const i=x+u,j=y+v;if((u||v)&&i>=0&&j>=0&&i<cols&&j<rows&&used[j*cols+i])return true;}return false;};
 const order=roadLoop.map((q,i)=>i).sort((a,b)=>hypot(roadLoop[a].x-hubGate.x,roadLoop[a].y-hubGate.y)-hypot(roadLoop[b].x-hubGate.x,roadLoop[b].y-hubGate.y)),spokes=[];
 for(const i of order)spokes[i]=search(roadLoop[i],hubGate);
 const ring=roadLoop.map((q,i)=>search(q,roadLoop[(i+1)%roadLoop.length]));
 const lanes=Object.fromEntries(Object.entries(sitePlaces).map(([id,q],i)=>{const stop=roadLoop[i],door={x:q.x,y:q.y+O+126*R},line=[];for(let k=0;k<=6;k++)line.push({x:door.x,y:door.y+(stop.y-door.y)*k/6});return [id,line];}));
 const shore=search(roadLoop[Object.keys(sitePlaces).indexOf('library')],{x:haven.x,y:haven.y-74});
 // Shared stretches between junctions are straightened once, so roads that meet stay one road.
 const found=[...spokes,...ring,shore],links=new Map(),link=(a,b)=>{if(!links.has(a))links.set(a,new Set());links.get(a).add(b);};
 for(const r of found)for(let i=0;i<r.cells.length-1;i++){link(r.cells[i],r.cells[i+1]);link(r.cells[i+1],r.cells[i]);}
 const ends=new Set(found.flatMap(r=>[r.cells[0],r.cells[r.cells.length-1]]));
 const at=o=>({x:x0+(o%cols)*cell,y:y0+Math.floor(o/cols)*cell});
 const sees=(piece,i,j)=>{
  const a=at(piece[i]),b=at(piece[j]),len=hypot(b.x-a.x,b.y-a.y),steps=Math.ceil(len/10);let crossed=false;
  for(let k=i;k<=j;k++)if(H[piece[k]]<SEA+.004)crossed=true;
  for(let k=i+1;k<j;k++){const q=at(piece[k]),t=Math.max(0,Math.min(1,((q.x-a.x)*(b.x-a.x)+(q.y-a.y)*(b.y-a.y))/(len*len||1)));if(hypot(q.x-a.x-(b.x-a.x)*t,q.y-a.y-(b.y-a.y)*t)>46)return false;}
  for(let s=1;s<steps;s++){const t=s/steps,o=index({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});if(closed[o]||(!crossed&&H[o]<SEA+.004)||Math.abs(H[o]-(H[piece[i]]*(1-t)+H[piece[j]]*t))*HEIGHT>9)return false;}
  return true;
 };
 const straighten=piece=>{
  const keep=[0];for(let i=0;i<piece.length-1;){let j=Math.min(piece.length-1,i+24);while(j>i+1&&!sees(piece,i,j))j--;keep.push(j);i=j;}
  let line=keep.map(k=>at(piece[k]));
  for(let round=0;round<2;round++){const next=[line[0]];for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1];next.push({x:a.x+(b.x-a.x)*.25,y:a.y+(b.y-a.y)*.25},{x:a.x+(b.x-a.x)*.75,y:a.y+(b.y-a.y)*.75});}next.push(line[line.length-1]);line=next;}
  return line;
 };
 const pieces=new Map();
 const settle=r=>{
  const out=[r.from];let piece=[r.cells[0]];
  const close=()=>{const key=piece.join(','),back=[...piece].reverse().join(',');let line=pieces.get(key);if(!line){const rev=pieces.get(back);line=rev?[...rev].reverse():straighten(piece);pieces.set(key,line);}out.push(...line.slice(out.length>1?1:0));};
  for(let i=1;i<r.cells.length;i++){piece.push(r.cells[i]);if(i===r.cells.length-1||ends.has(r.cells[i])||links.get(r.cells[i]).size!==2){close();piece=[r.cells[i]];}}
  out.push(r.to);
  // The exact start and end replace the nearest cell centres when they are close.
  if(out.length>2&&hypot(out[1].x-out[0].x,out[1].y-out[0].y)<cell)out.splice(1,1);
  if(out.length>2&&hypot(out[out.length-2].x-out[out.length-1].x,out[out.length-2].y-out[out.length-1].y)<cell)out.splice(out.length-2,1);
  return out;
 };
 for(const list of [spokes,ring])list.forEach((r,i)=>{list[i]=settle(r);});
 const shoreLine=settle(shore);
 const all=[...spokes,...ring,shoreLine],ways=[...all,...Object.values(lanes)];
 const fill=(heights)=>{const map=new Map();ways.forEach((line,w)=>{for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1],q=[a.x,a.y,b.x,b.y,heights?heights[w][i]:0,heights?heights[w][i+1]:0],x1=Math.floor((Math.min(a.x,b.x)-120)/120),x2=Math.floor((Math.max(a.x,b.x)+120)/120),y1=Math.floor((Math.min(a.y,b.y)-120)/120),y2=Math.floor((Math.max(a.y,b.y)+120)/120);for(let u=x1;u<=x2;u++)for(let v=y1;v<=y2;v++){const key=u*100000+v;if(!map.has(key))map.set(key,[]);map.get(key).push(q);}}});roadBuckets=map;lastRX=NaN;};
 // First the passes open up, then every road is graded to an even walk.
 fill(null);
 const fordAt=(line,i,v)=>{const b=sstep(58,24,riverDistance(line[i].x,line[i].y,58));return Math.max(SEA+.02,v)*(1-b)+(SEA-.012)*b;};
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
 return {spokes,ring,lanes,crossings,shore:shoreLine};
}
const network=planRoads();
export const onRoad=(x,y,r=11)=>roadDistance(x,y)<r;
export const spokes=network.spokes,ringPaths=network.ring,lanes=network.lanes,crossings=network.crossings,havenWay=network.shore;
function paintRoads(c){
 const ways=[...ringPaths,...spokes,havenWay],doors=Object.values(lanes);
 c.lineCap='round';c.lineJoin='round';
 for(const [blur,width,color] of [[3,20,'#4f442f33'],[1.4,12,'#5e5139aa'],[.7,7,'#7a6b4ce0']]){c.filter=`blur(${blur}px)`;c.strokeStyle=color;c.lineWidth=width;for(const way of ways){smoothPath(c,way.map(q=>[q.x,q.y]));c.stroke();}c.lineWidth=width*1.15;for(const way of doors){smoothPath(c,way.map(q=>[q.x,q.y]));c.stroke();}}
 c.filter='none';
}
function paintFields(c){
 const shire=P.messengers;
 for(let i=0;i<40;i++){
  const a=i*2.399,d=(230+i*7)*R,x=shire.x+Math.cos(a)*d,y=shire.y+O+Math.sin(a)*d*.8,w=44+(i%4)*12,h=w*.6;
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
export const mereY=()=>(mere.level+.004-SEA)*HEIGHT;
// Where each river runs: distance along it, offset across it and how much of it is river. The water streams with these.
// Walking the banks of every river, for the stones and reeds growing there.
export const riverBanks=()=>riverLines.flatMap(line=>line.slice(0,-1).map((q,i)=>{const b=line[i+1],len=hypot(b[0]-q[0],b[1]-q[1])||1;return {x:q[0],y:q[1],nx:-(b[1]-q[1])/len,ny:(b[0]-q[0])/len,len};}));
export function riverFlow(){const w=1024,h=800,data=new Float32Array(w*h*4),best=new Float32Array(w*h).fill(1e9),sx=w/EXTENT.w,sy=h/EXTENT.h,reach=66;
 for(const line of riverLines){let run=0;for(let i=0;i<line.length-1;i++){const [ax,ay]=line[i],[bx,by]=line[i+1],dx=bx-ax,dy=by-ay,len=hypot(dx,dy)||1,i0=Math.max(0,Math.floor((Math.min(ax,bx)-reach-EXTENT.x)*sx)),i1=Math.min(w-1,Math.ceil((Math.max(ax,bx)+reach-EXTENT.x)*sx)),j0=Math.max(0,Math.floor((Math.min(ay,by)-reach-EXTENT.y)*sy)),j1=Math.min(h-1,Math.ceil((Math.max(ay,by)+reach-EXTENT.y)*sy));
  for(let j=j0;j<=j1;j++)for(let q=i0;q<=i1;q++){const x=EXTENT.x+(q+.5)/sx,y=EXTENT.y+(j+.5)/sy,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(len*len))),gap=hypot(x-ax-dx*t,y-ay-dy*t),o=j*w+q;if(gap<reach&&gap<best[o]){best[o]=gap;data[o*4]=run+t*len;data[o*4+1]=((x-ax)*dy-(y-ay)*dx)/len;data[o*4+2]=1-Math.max(0,Math.min(1,(gap-22)/24));data[o*4+3]=1;}}
  run+=len;}}
 return {data,width:w,height:h};}
// How deep the water lies everywhere: the sea draws its colour and its surf from this.
export function seaDepth(){const w=1024,h=800,data=new Uint8Array(w*h*4);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const v=fieldAt(EXTENT.x+(i+.5)/w*EXTENT.w,EXTENT.y+(j+.5)/h*EXTENT.h),o=(j*w+i)*4;data[o]=Math.max(0,Math.min(255,(SEA-v)/.16*255));data[o+3]=255;}return {data,width:w,height:h};}
export async function buildWorld(){
 await buildField();await breathe();
 const light=await bakeLight();await breathe();
 const trees=[];
 const raw=makeCanvas(FW-1,FH-1);paintTerrain(raw,FW-1,FH-1);await breathe();
 const landScale=matchMedia('(pointer:coarse)').matches?1:1.2,land=makeCanvas(EXTENT.w*landScale,EXTENT.h*landScale),c=land.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(raw,0,0,land.width,land.height);
 c.save();c.scale(landScale,landScale);c.translate(-EXTENT.x,-EXTENT.y);paintFields(c);paintRoads(c);c.restore();
 const heightOf=fieldAt;
 const nearRoad=(x,y)=>roadDistance(x,y)<24;
 for(let y=WORLD.y+30;y<WORLD.y+WORLD.h-10;y+=16)for(let x=WORLD.x+10;x<WORLD.x+WORLD.w-10;x+=16){
  const jx=x+(vnoise(x*.7,y*.3)-.5)*22,jy=y+(vnoise(x*.3,y*.7)-.5)*22,hv=heightOf(jx,jy);
  if(hv<SEA+.025||hv>.82||nearRoad(jx,jy)||hypot((jx-mere.x)/mere.a,(jy-mere.y)/mere.b)<1.75)continue;
  // Nothing grows on cliffs.
  if(Math.abs(heightOf(jx+6,jy)-heightOf(jx-6,jy))+Math.abs(heightOf(jx,jy+6)-heightOf(jx,jy-6))>.1)continue;
  if(hypot(jx-haven.x,jy-haven.y)<300||Object.entries(sitePlaces).some(([id,q])=>hypot(jx-q.x,jy-q.y-O)<siteClearing[id]*R+(fbm(jx/70,jy/70,2)-.5)*70||(Math.abs(jx-q.x)<131&&jy>q.y&&jy<q.y+525)))continue;
  const hub=hypot(jx-HUB_SITE.x,(jy-HUB_SITE.y)/.72);if(hub<300||hypot(jx-morannon.x,jy-morannon.y)<170)continue;
  const density=fbm(jx/170,jy/170,3),d=(q,r)=>hypot(jx-q.x,jy-q.y)<r*R;
  let kind='oak',need=.54;
  if(hub<540){kind='dead';need=.66;}
  else if(d(P.council,420)){kind='dark';need=.18;}
  else if(d(P.lorien,420)){kind='mallorn';need=.3;}
  else if(d(P.library,420)){kind=vnoise(jx/26,jy/26)>.5?'birch':'oak';need=.32;}
  else if(d(P.observatory,300)){kind='dead';need=.56;}
  else if(d(P.isengard,330)){kind='dead';need=.6;}
  else if(d(P.forge,320)){kind='pine';need=.62;}
  else if(d(P.scouts,340)){kind='pine';need=.8;}
  else if(d(P.messengers,430)){kind=vnoise(jx/30,jy/30)>.45?'oak':'birch';need=.58;}
  else if(hypot(jx-rohan.x,jy-rohan.y)<300)continue;
  else if(hv>.6){kind='pine';need=.4;}
  if(density>need+(vnoise(jx/9,jy/9)-.5)*.12){trees.push({x:jx,y:jy,kind,s:kind==='dark'?1+vnoise(jx/3,jy/3)*.12:.8+vnoise(jx/3,jy/3)*.6,tone:.82+vnoise(jx/5,jy/7)*.36});if(kind!=='dead'&&density>need+.12&&vnoise(jx/2.3,jy/2.3)>.86)trees.push({x:jx+7,y:jy+5,kind:'log',s:.7+vnoise(jx/4,jy/4)*.5,tone:.9});}
  // Bushes and young growth gather at the edge of every wood.
  else if(kind!=='dead'&&density>need-.06&&vnoise(jx/4,jy/4)>.68)trees.push({x:jx,y:jy,kind:kind==='dark'?'darkbush':kind==='mallorn'?'goldbush':'bush',s:.7+vnoise(jx/3,jy/3)*.8,tone:.82+vnoise(jx/5,jy/7)*.36});
 }
 // Bushes and stones gather at the foot of every wall, except before its door.
 for(const [id,q] of Object.entries(sitePlaces))for(let i=0;i<70;i++){const a=i*2.399,r=(siteFoot[id]+8+vnoise(i*.7,id.length)*38)*R,dx=Math.cos(a)*r,dy=Math.sin(a)*r;if(Math.abs(dx)<65&&dy>0)continue;const x=q.x+dx,y=q.y+O+dy,kinds=siteDressing[id];if(roadDistance(x,y)<20||heightOf(x,y)<SEA+.02)continue;trees.push({x,y,kind:hypot(x-HUB_SITE.x,(y-HUB_SITE.y)/.72)<520?'stone':kinds[i%kinds.length],s:.55+vnoise(x/3,y/3)*.8,tone:.8+vnoise(x/5,y/7)*.4});}
 // Pale birches of the elves stand behind the Havens, in the same manner as every other wood.
 for(const [x,z,s] of [[-268,-40,1.15],[-30,-56,1],[34,-54,1.05],[262,-56,1.15],[-140,-108,1.2],[140,-112,1.2],[-238,-96,1],[230,-104,1.05],[-320,-20,1.1],[318,-30,1.1]])trees.push({x:haven.x+x,y:haven.y+z,kind:'birch',s,tone:1.08});
 // A mallorn never stands alone: stray ones at the edge of the wood are left out.
 const golden=trees.filter(t=>t.kind==='mallorn'),alone=new Set(golden.filter(t=>golden.filter(o=>hypot(o.x-t.x,o.y-t.y)<62).length<5));
 // Great trees keep their distance, so each stands free on its own trunk.
 const kept=[],room={mallorn:52,dark:24};
 for(const t of trees.filter(t=>!alone.has(t))){const r=room[t.kind];if(r&&kept.some(o=>o.kind===t.kind&&hypot(o.x-t.x,o.y-t.y)<r))continue;if(t.kind==='mallorn')t.s*=1.25;kept.push(t);}
 return {land,landScale,trees:kept,light};
}
