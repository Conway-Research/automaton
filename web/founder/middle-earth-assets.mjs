// Real surfaces, sky and scanned models (all CC0, see assets/middle-earth/LICENSES.md).
// Files come only from this dashboard's own folder. Nothing is sent anywhere.
import * as T from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {RGBELoader} from './vendor/RGBELoader.js';
import {clone as cloneRigged} from './vendor/SkeletonUtils.js';
import {Kit,solid,peoples,toolPositions} from './middle-earth-3d.mjs';
const ROOT='/assets/middle-earth/';

async function loadTexture(name,srgb){
 const response=await fetch(`${ROOT}textures/${name}.jpg`,{credentials:'same-origin'});if(!response.ok)throw Error(name);
 const bitmap=await createImageBitmap(await response.blob());
 const t=new T.Texture(bitmap);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.flipY=false;t.needsUpdate=true;return t;
}
const SURFACES=['rock','ground','grass','bricks','stone','wood','bark','metal','marble','thatch'];
export async function loadSurfaces(){
 const out={};
 const lifts={rock:3.6,ground:3,bark:3.4,metal:2.6,bricks:2.5,stone:2.4,wood:2.3,grass:3.2,thatch:2.6,marble:1.3};
 await Promise.all(SURFACES.map(async name=>{out[name]={map:await loadTexture(name+'_color',true),normalMap:await loadTexture(name+'_normal',false),lift:lifts[name]};}));
 return out;
}
export const loadSky=()=>new RGBELoader().loadAsync(`${ROOT}sky/qwantani_dusk_2.hdr`);

// A soft tiling noise for snow lines, rock bands and the shadows of passing clouds.
function landNoise(){
 const N=256,lattice=(n,seed)=>{let s=seed;const v=new Float32Array(n*n);for(let i=0;i<v.length;i++){s=(s*16807)%2147483647;v[i]=s/2147483647;}return v;},smooth=t=>t*t*(3-2*t),data=new Uint8Array(N*N*4);
 const layers=[[6,1],[12,.5],[24,.25],[48,.125],[96,.06]].map(([n,a],i)=>({n,a,v:lattice(n,991+i*131)}));
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){let sum=0,all=0;for(const l of layers){const fx=x/N*l.n,fy=y/N*l.n,i=Math.floor(fx),j=Math.floor(fy),u=smooth(fx-i),w=smooth(fy-j),at=(a,b)=>l.v[((b+l.n)%l.n)*l.n+(a+l.n)%l.n],t=at(i,j)+(at(i+1,j)-at(i,j))*u,d=at(i,j+1)+(at(i+1,j+1)-at(i,j+1))*u;sum+=(t+(d-t)*w)*l.a;all+=l.a;}const o=(y*N+x)*4,q=Math.max(0,Math.min(255,((sum/all-.5)*1.7+.5)*255));data[o]=data[o+1]=data[o+2]=q;data[o+3]=255;}
 const t=new T.DataTexture(data,N,N);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=t.minFilter=T.LinearFilter;t.needsUpdate=true;return t;
}
// The painted land keeps its colours; rock, scree, snow, relief and light are worked out at every point of the ground.
export function addTerrainDetail(material,surfaces,light,extent,hub){
 const baked=new T.DataTexture(light.data,light.width,light.height,T.RGBAFormat);baked.magFilter=baked.minFilter=T.LinearFilter;baked.flipY=false;baked.needsUpdate=true;
 const time={value:0};material.userData.time=time;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{grassDetail:{value:surfaces.grass.map},rockDetail:{value:surfaces.rock.map},groundDetail:{value:surfaces.ground.map},rockRelief:{value:surfaces.rock.normalMap},landNoise:{value:landNoise()},landLight:{value:baked},landExtent:{value:new T.Vector4(extent.x,extent.y,extent.w,extent.h)},landHub:{value:new T.Vector2(hub.x,hub.y)},landTime:time});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLandP;varying vec3 vLandN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLandP=position;vLandN=normal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec3 vLandP;varying vec3 vLandN;uniform sampler2D grassDetail;uniform sampler2D rockDetail;uniform sampler2D groundDetail;uniform sampler2D rockRelief;uniform sampler2D landNoise;uniform sampler2D landLight;uniform vec4 landExtent;uniform vec2 landHub;uniform float landTime;
   float landMean(vec3 c){return max(.001,dot(c,vec3(.3333)));}`).replace('#include <map_fragment>',`#include <map_fragment>
   vec3 landP=vLandP,landN=normalize(vLandN);
   float big=texture2D(landNoise,landP.xz/2300.).r,mid=texture2D(landNoise,landP.xz/520.).r;
   vec3 side=pow(abs(landN),vec3(5.));side/=side.x+side.y+side.z;
   vec3 rockNear=texture2D(rockDetail,landP.zy/95.).rgb*side.x+texture2D(rockDetail,landP.xz/95.).rgb*side.y+texture2D(rockDetail,landP.xy/95.).rgb*side.z;
   vec3 rockFar=texture2D(rockDetail,landP.zy/430.).rgb*side.x+texture2D(rockDetail,landP.xz/430.).rgb*side.y+texture2D(rockDetail,landP.xy/430.).rgb*side.z;
   vec3 soft=mix(texture2D(groundDetail,landP.xz/66.).rgb,texture2D(grassDetail,landP.xz/44.).rgb,smoothstep(.3,.6,diffuseColor.g-diffuseColor.r*.55));
   vec3 fine=texture2D(groundDetail,landP.xz/15.5).rgb;
   diffuseColor.rgb*=clamp(soft/landMean(soft),.5,1.5)*clamp(fine/landMean(fine),.72,1.28)*(.8+big*.4);
   float mordor=1.-smoothstep(560.,720.,length((landP.xz-landHub)/vec2(1.,.72)));
   float slope=1.-smoothstep(.62,.84,landN.y);
   float scree=smoothstep(170.,320.,landP.y+(mid-.5)*140.);
   float rockAmount=max(slope,scree*.94)*smoothstep(3.,18.,landP.y);
   float bands=.5+.5*sin(landP.y*.045+landMean(rockFar)*5.+big*12.+mid*5.);
   vec3 rockTone=mix(vec3(.1,.1,.102),vec3(.22,.212,.2),bands*.3+mid*.7);
   rockTone=mix(rockTone,vec3(.024,.02,.02)+vec3(.03,.023,.021)*mid,mordor);
   rockTone*=mix(vec3(landMean(rockNear)),rockNear,.4)/landMean(rockNear);rockTone*=clamp(landMean(rockNear)/.2,.55,1.5)*clamp(landMean(rockFar)/.2,.7,1.3);
   float alpine=smoothstep(55.,175.,landP.y+(mid-.5)*70.)*(1.-mordor);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.052,.054,.04)*(.8+big*.5),alpine*.92);
   diffuseColor.rgb=mix(diffuseColor.rgb,rockTone,rockAmount);
   float snowLine=300.+(mid-.5)*150.+(big-.5)*110.;
   float snow=(smoothstep(snowLine,snowLine+60.,landP.y)*smoothstep(.46,.72,landN.y)+smoothstep(snowLine+230.,snowLine+300.,landP.y)*smoothstep(.2,.42,landN.y))*(1.-mordor);snow=min(1.,snow);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.6,.63,.69)*(.88+landMean(fine)*.25),snow);`).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
   vec3 landWorldNormal=landN;
   if(rockAmount>.01){
    vec3 relief=vec3(0.);
    for(int q=0;q<2;q++){float size=q==0?95.:430.,weight=q==0?.5:.75;vec2 a=texture2D(rockRelief,landP.zy/size).xy*2.-1.,b=texture2D(rockRelief,landP.xz/size).xy*2.-1.,c=texture2D(rockRelief,landP.xy/size).xy*2.-1.;relief+=(vec3(0.,a.y,a.x)*side.x+vec3(b.x,0.,b.y)*side.y+vec3(c.x,c.y,0.)*side.z)*weight;}
    landWorldNormal=normalize(landN+relief*rockAmount*(1.-snow*.55));
   }
   normal=normalize((viewMatrix*vec4(landWorldNormal,0.)).xyz);`).replace('#include <aomap_fragment>',`vec4 landBaked=texture2D(landLight,(landP.xz-landExtent.xy)/landExtent.zw);
   float passing=smoothstep(.5,.72,texture2D(landNoise,landP.xz/3100.+vec2(landTime*.0034,landTime*.0021)).r);
   float landSun=landBaked.r*(1.-passing*.5)*mix(1.,.62,mordor);
   reflectedLight.directDiffuse*=landSun;reflectedLight.directSpecular*=landSun;reflectedLight.indirectDiffuse*=landBaked.g*mix(vec3(1.),vec3(.7,.52,.46),mordor);
   totalEmissiveRadiance+=vec3(2.1,.52,.06)*landBaked.b*landBaked.b*(.78+.22*sin(landTime*1.1+landP.x*.021+landP.z*.033));
   #include <aomap_fragment>`);
 };
 material.needsUpdate=true;
}

// A surface for merged building geometry, tinted by its vertex colours.
export function surfaceMaterial(surface,{roughness=.9,transparent=false}={}){
 // The photographed surface carries its own darkness; the lift keeps the building's colour at its intended brightness.
 const lift=surface.lift??2.3;
 return new T.MeshStandardMaterial({color:new T.Color(lift,lift,lift),vertexColors:true,map:surface.map,normalMap:surface.normalMap,normalScale:new T.Vector2(.8,.8),roughness,metalness:.02,transparent});
}

// ---- Scanned models, fetched the first time their region comes near ----
const loader=new GLTFLoader(),cache=new Map();
const loadModel=id=>{if(!cache.has(id))cache.set(id,loader.loadAsync(id.startsWith('props/')?`${ROOT}${id}.gltf`:`${ROOT}models/${id}/${id}.gltf`).then(g=>{g.scene.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});const box=new T.Box3().setFromObject(g.scene);return {scene:g.scene,height:box.max.y-box.min.y||1,width:Math.max(box.max.x-box.min.x,box.max.z-box.min.z)||1,base:box.min.y};}));return cache.get(id);};

export async function placeModels(group,items){
 await Promise.all(items.map(async ([id,x,y,z,h,ry=0,rx=0])=>{
  const m=await loadModel(id),c=m.scene.clone(true),s=Math.min(h/m.height,h*1.5/m.width);c.scale.setScalar(s);c.position.set(x,y-m.base*s,z);c.rotation.set(rx,ry,0);group.add(c);
 }));
}

// What stands where. Heights are in world units; a person is about 34 tall. Coordinates are inside the district.
export const regionProps={
 library:[['GothicCabinet_01',-100,0,92,40,1.57],['WoodenChair_01',96,0,50,20,-1.57],['lantern_chandelier_01',0,36,10,20],['fern_02',-158,0,120,16],['fern_02',156,0,124,18,1.2],['fern_02',-120,0,150,14,2.2],['moss_01',-140,0,150,4],['props/BookStand',-44,0,-30,16],['props/Book_Stack_1',24,13.9,-52,5],['props/BookGroup_Medium_2',-30,13.9,-56,6],['props/Book_Stack_2',-100,0,60,10]],
 gate:[['gothic_statue',-74,0,-66,48,1.57],['gothic_statue',74,0,-66,48,-1.57],['gothic_statue',-74,0,22,48,1.57],['gothic_statue',74,0,22,48,-1.57],['kite_shield',-96,18,-112,20],['kite_shield',96,18,-112,20],['lantern_chandelier_01',0,38,6,20],['gothic_statue',-150,0,170,46,.3],['gothic_statue',150,0,170,46,-.3],['props/Banner_1',-40,0,-106,50],['props/Banner_1',40,0,-106,50],['props/Scroll_2',-52,13.9,-4,3]],
 forge:[['namaqualand_boulder_02',-92,0,-24,16,.6],['namaqualand_boulder_02',-168,0,130,34,1.2],['namaqualand_boulder_03',170,0,134,30,2.1],['dry_branches_medium_01',-100,0,110,8],['props/Chain_Coil',18,0,-24,7],['props/Pickaxe_Bronze',-30,0,20,14,.6,1.4],['props/Anvil',-48,0,-88,13,.6],['props/Crate_Wooden',84,0,76,13],['props/Cauldron',-86,0,-74,16],['props/Workbench',-20,0,-96,18],['props/Torch_Metal',-98,0,46,30],['props/Torch_Metal',96,0,-30,30]],
 treasury:[['brass_pot_01',-48,14,-72,10],['brass_pot_01',52,16,-74,12,1],['kite_shield',-30,26,-112,22],['kite_shield',30,26,-112,22],['lantern_chandelier_01',0,40,6,20],['namaqualand_boulder_03',-214,0,110,40],['props/Chalice',-12,13.9,70,6],['props/Coin_Pile',-48,0,-58,10],['props/Coin_Pile_2',44,0,-60,12],['props/Coin_Pile',-78,0,-14,9],['props/Coin_Pile_2',78,0,-10,8],['props/Stall_Cart_Empty',0,0,184,34],['props/Chest_Wood',84,0,18,14,-1]],
 council:[['fern_02',-160,0,130,16],['fern_02',-120,0,160,18,1],['fern_02',-60,0,170,15,2],['fern_02',60,0,168,17,.5],['fern_02',130,0,150,19,3],['fern_02',-96,0,70,10,1],['moss_01',-20,0,150,4],['moss_01',40,0,160,4],['dead_tree_trunk',188,0,120,60,1],['dead_tree_trunk_02',-200,0,100,64,2],['props/Crate_Wooden',84,0,62,13],['props/Scroll_1',6,14.2,-46,3],['props/Chalice',-26,13.9,-58,5]],
 messengers:[['brass_pot_01',-2,13.9,-72,7],['lantern_chandelier_01',0,38,-6,18],['fern_02',-170,0,172,14],['fern_02',170,0,170,14,1],['props/Book_Stack_1',26,13.9,-68,5],['props/Scroll_2',-22,13.9,-56,3],['props/Crate_Wooden',96,0,-32,12],['props/Stall_Cart_Empty',-120,0,184,30,.5]],
 scouts:[['namaqualand_boulder_02',-96,0,-62,26,.4],['namaqualand_boulder_03',92,0,-68,28,2],['namaqualand_boulder_02',-150,0,120,30,1],['namaqualand_boulder_02',158,0,110,26,2.6],['mountainside',-210,0,-30,64,1],['dry_branches_medium_01',36,0,-40,8],['fern_02',-90,0,140,13],['props/Crate_Wooden',-58,0,-98,12],['props/Scroll_1',-16,12.4,-68,3],],
 isengard:[['dead_tree_trunk',-168,0,120,66,.6],['dead_tree_trunk_02',172,0,118,60,2.3],['namaqualand_boulder_02',-210,0,-30,30],['dry_branches_medium_01',120,0,170,16],['props/Cauldron',36,0,-96,18],['props/Chain_Coil',-40,0,8,8],['props/Anvil',-30,0,-96,14],['props/Chain_Coil',84,0,8,8,1],['props/Workbench',60,0,-82,16,-.6],['props/Pickaxe_Bronze',40,0,-14,14,1,1.4]],
 lorien:[['fern_02',-150,0,120,20],['fern_02',-100,0,146,18,1],['fern_02',110,0,142,20,2],['fern_02',160,0,110,16,3],['moss_01',-40,0,130,4],['moss_01',60,0,140,4],['props/Scroll_1',60,13.9,-60,3],['props/Chalice',48,13.9,-70,5]],
 observatory:[['marble_bust_01',-84,0,8,22,1.2],['WoodenChair_01',84,0,16,20,-1.2],['namaqualand_boulder_02',-170,0,150,24,.7],['namaqualand_boulder_02',176,0,120,30,1.8],['dry_branches_medium_01',-60,0,170,10],['props/CandleStick_Triple',92,0,-28,22],['props/Chandelier',0,42,-4,18],['props/Book_Stack_2',46,0,-90,10],['props/Scroll_2',60,13.9,-40,3]],
};
export const worldProps=[['horse_statue_01',0,0,0,46,.5]];

// ---- Animated people (CC0, see LICENSES.md), used wherever the camera is near enough to see them ----
const RIGS=['Adventurer','Farmer','King','Worker'];
let rigs=null;
export function loadRigs(){
 rigs??=Promise.all(RIGS.map(async name=>{const g=await loader.loadAsync(`${ROOT}figures/${name}.gltf`);g.scene.updateWorldMatrix(true,true);const box=new T.Box3().setFromObject(g.scene);return [name,{name,scene:g.scene,clips:new Map(g.animations.map(c=>[c.name,c])),height:box.max.y-box.min.y,base:box.min.y}];})).then(list=>new Map(list));
 return rigs;
}
// What each colour of the original model becomes.
const roles={
 Adventurer:{Skin:'skin',Green:'top',LightGreen:'under',Grey:'dark',Black:'dark',Eyebrows:'hair',Hair:'hair',Eye:'eye',Brown:'legs',Brown2:'leather',Gold:'trim'},
 Farmer:{Skin:'skin',LightBlue:'top',Brown:'leather',Beige:'legs',Brown2:'leather',Eyebrows:'hair',Red:'under',Eye:'eye'},
 King:{Skin:'skin',Blue:'top',Metal:'metal',Beige:'under',Metal_Dark:'dark',Hair_White:'hair',Gold:'trim',Eye:'eye',DarkBrown:'leather'},
 Worker:{Skin:'skin',Worker_Yellow:'under',Worker_Vest:'top',LightBrown:'legs',Grey:'dark',Black:'dark',Eyebrows:'hair',Moustache:'hair',Eye:'eye',Brown:'leather',Brown2:'leather'},
};
const dress={
 ranger:{rig:'Adventurer',pack:true,under:'#4a4a34',leather:'#3a2a1a'},uruk:{rig:'Adventurer',under:'#23201c',dark:'#17140f',trim:'#55524e'},orc:{rig:'Adventurer',under:'#3a2c1c',dark:'#17140f',trim:'#55524e',crouch:.94},
 noldor:{rig:'Adventurer',robe:true,shaven:true,under:'#c9c2a8',leather:'#54462e',trim:'#b89a4a'},galadhrim:{rig:'Adventurer',robe:true,shaven:true,under:'#dcdcc4',leather:'#a9a688',trim:'#c9b878'},silvan:{rig:'Adventurer',robe:true,shaven:true,under:'#54643a',leather:'#3a2a18',trim:'#8a7a3a'},numenorean:{rig:'Adventurer',robe:true,under:'#c9c2a8',leather:'#2a2a34',trim:'#b89a4a'},
 dwarf:{rig:'King',nohat:'Gold',under:'#5e3a22',metal:'#6c7076',trim:'#b8862e'},gondor:{rig:'King',nohat:'Gold',under:'#2c2e38',metal:'#a9aeb4',trim:'#d8d8cc'},
 hobbit:{rig:'Farmer',nohat:'Brown',top:'#5a4a2a',under:'#7a6a3a',legs:'#c9b890',leather:'#4a3418'},dale:{rig:'Farmer',top:'#4a3a2a',under:'#6a3a24',legs:'#a08a64',leather:'#3a2a18'},rohirrim:{rig:'Adventurer',shaven:true,under:'#6a5a30',trim:'#c9a23c'},
 wizard:{rig:'Adventurer',robe:true,under:'#6c7079',leather:'#54504a',trim:'#6c7079'},whitewizard:{rig:'Adventurer',robe:true,under:'#d8d8d0',leather:'#b8b8b0',trim:'#d8d8d0'},gollum:{rig:'Farmer',nohat:'Brown',top:'#b5b08a',under:'#8d8a6a',legs:'#b5b08a',leather:'#6a6850',crouch:.9},
};
const materials=new Map();
function materialFor(rig,people,base){
 const key=`${rig.name}|${people}|${base.name}`;let m=materials.get(key);if(m)return m;
 const p=peoples[people]??peoples.gondor,d=dress[people]??dress.gondor,role=roles[rig.name][base.name],colors={skin:p.skin,top:d.top??p.body,legs:d.legs??p.legs,hair:p.hair,under:d.under??p.legs,leather:d.leather??'#3a2a18',dark:d.dark??'#1d1a17',metal:d.metal??'#8a8e94',trim:d.trim??'#8a7a4a',eye:'#17120d'};
 m=base.clone();m.color.set(d.shaven&&base.name==='Hair'?p.skin:colors[role]??'#55504a');m.roughness=role==='metal'||role==='trim'?.42:.86;m.metalness=role==='metal'||role==='trim'?.55:0;materials.set(key,m);return m;
}
// Worn things are made once in the figure's own space and then fixed to its bones, so they move with it.
function headGear(k,people,p){
 const beard=(c,len=8,r=2.3)=>k.limb([[0,-.6,2.1,r*.8],[0,-1.8,2.6,r],[0,-1.8-len*.45,2.8,r*.82],[0,-1.8-len*.8,2.5,r*.42],[.2,-1.8-len,2.2,.12]],c,9);
 if(people==='dwarf'){beard(p.hair,8.5,2.9);k.dome(0,1.5,0,3.5,'#7c8086');k.column(0,1.3,0,3.6,.7,'#b8862e');}
 else if(people==='wizard'||people==='whitewizard'){beard(p.hair,9,2.2);k.ball(0,1,-.5,3.1,p.hair);k.limb([[0,.5,-1.6,2.8],[0,-3,-2.2,2.8],[0,-7,-2.4,1.6]],p.hair,9);if(people==='wizard'){k.column(0,2.7,0,5.6,.35,p.body);k.limb([[0,2.8,-.1,3.3],[0,6,-.6,2.5],[.5,9.4,-1.6,1.4],[1.8,11.8,-3,.15]],p.body,10);}}
 else if(people==='gondor'||people==='numenorean'){k.dome(0,1.4,0,3.4,'#c9ced4');for(const s of [-1,1])k.add(k.cube(),s*3.3,4.2,-.4,.4,3.6,2,'#eef0f2',0,0,s*-.4);}
 else if(people==='uruk'){k.dome(0,1.3,0,3.5,'#3a3c40');k.ball(0,3,3,.7,'#ece9de');for(const s of [-1,1])k.cone(s*1.3,-2.4,2.9,.4,1.8,'#e6e0cc',6);}
 else if(people==='orc'){for(const s of [-1,1]){k.cone(s*3.2,-.3,0,1,3.4,p.skin,6);k.cone(s*1.3,-2.4,2.8,.4,1.8,'#e6e0cc',6);}k.cone(0,2.4,-.4,2.3,2.6,p.hair,7);}
 else if(people==='hobbit'){for(const [a,b,c] of [[-2.2,2,0],[0,2.9,.5],[2.2,2,0],[-2.8,.5,-.8],[2.8,.5,-.8],[0,2,-2]])k.ball(a,b,c,1.7,p.hair);}
 else if(people==='noldor'||people==='galadhrim'||people==='silvan'||people==='rohirrim'){k.dome(0,.8,-.2,3.3,p.hair);k.limb([[0,.8,-1.6,3.1],[0,-3,-2.2,3.1],[0,-7,-2.5,2.5],[0,-10.5,-2.4,.7]],p.hair,10);if(people!=='rohirrim')for(const s of [-1,1])k.cone(s*3,-.4,0,.6,2.6,p.skin,6);}
 else if(people==='ranger'){k.dome(0,.8,-.2,3.5,'#2c4427');k.limb([[0,.2,-1.8,3.3],[0,-3,-2.4,3.6],[0,-7,-2.6,4.4]],'#2c4427',10);}
 else if(people==='dale'){k.dome(0,1,0,3.2,p.hair);k.column(0,2.4,0,4.4,.5,'#3c2a1a');beard(p.hair,3.4,1.8);}
 else if(people==='gollum'){for(const s of [-1,1]){k.ball(s*1.2,.2,2.8,1.1,'#dfeef5');k.ball(s*1.2,.2,3.7,.5,'#17120d');}}
}
const fade={Walk:.25,Run:.25,Idle_Neutral:.4,Interact:.35,Sword_Slash:.3};
const swings=new Set(['hammer','pick','chisel','sword']);
export function dressFigure(all,people,tool){
 const d=dress[people]??dress.gondor,p=peoples[people]??peoples.gondor,rig=all.get(d.rig),model=cloneRigged(rig.scene),group=new T.Group(),u=p.h*1.2,tall=30*u,s=tall/rig.height*(d.crouch??1),wide=(p.w??1);
 model.scale.set(s*wide,s,s*wide);model.position.y=-rig.base*s;group.add(model);
 model.traverse(n=>{if(n.isMesh){const part=`${n.name}|${n.parent?.name??''}`;if(d.nohat&&n.material.name===d.nohat&&/_Head/.test(part))n.visible=false;if(d.robe&&/_(Legs|Feet)/.test(part))n.visible=false;const role=roles[rig.name][n.material.name];n.material=materialFor(rig,people,n.material);n.castShadow=role==='top'||role==='legs'||role==='skin';n.receiveShadow=false;n.frustumCulled=false;}if(n.name==='Backpack'&&!d.pack)n.visible=false;});
 group.updateWorldMatrix(true,true);
 const bone=name=>model.getObjectByName(name),at=o=>{const v=new T.Vector3();o.getWorldPosition(v);return v;};
 const worn=(name,build,x=0,y=0,z=0,turn=0)=>{const b=bone(name);if(!b)return null;const k=new Kit();build(k);if(!k.pos.length)return null;const m=k.mesh(solid);m.castShadow=false;m.receiveShadow=false;m.scale.setScalar(u/1.25);const q=at(b);m.position.set(q.x+x,q.y+y,q.z+z);m.rotation.x=turn;b.attach(m);return m;};
 worn('Head',k=>headGear(k,people,p),0,tall*.082,.2);
 if(d.robe){const down=at(bone('Hips')).y/(u/1.25),robe=worn('Hips',k=>{k.cyl(0,-down,0,3.5,5.6,down*1.08,p.body,14);k.column(0,-down,0,5.7,.9,d.leather??'#2a2015',14);k.column(0,0,0,3.7,.7,d.trim??'#8a7a4a',14);});if(robe)robe.castShadow=true;}
 // The arm is brought to rest first, so a tool can simply be stood upright in the hand and then goes where the hand goes.
 const rest=new T.AnimationMixer(model);rest.clipAction(rig.clips.get('Idle_Neutral')).play();rest.update(.01);group.updateWorldMatrix(true,true);
 const hand=toolPositions(tool);
 if(hand.pos.length&&bone('WristR')){let low=Infinity,high=-Infinity;for(let i=1;i<hand.pos.length;i+=3){low=Math.min(low,-hand.pos[i]);high=Math.max(high,-hand.pos[i]);}const grip=low+(high-low)*.22;worn('WristR',k=>{k.pos.push(...hand.pos);k.nor.push(...hand.nor);k.col.push(...hand.col);},0,-grip*u/1.25,.6,Math.PI);}
 rest.stopAllAction();rest.uncacheRoot(model);
 const pack=worn('Chest',k=>{k.box(0,-5,-3.4,8,8,4,'#a07f4c');k.box(0,-1.5,-3.4,8.2,.6,4.2,'#3a2c10');});if(pack)pack.visible=false;
 const mixer=new T.AnimationMixer(model),actions=new Map();
 const action=name=>{if(!actions.has(name)){const a=mixer.clipAction(rig.clips.get(name));a.play();a.enabled=false;actions.set(name,a);}return actions.get(name);};
 let current=null;
 const play=(mode,speed,dt,carry)=>{
  const name=mode==='walk'?(speed>70?'Run':'Walk'):mode==='fetch'?'Interact':mode==='work'?(swings.has(tool)?'Sword_Slash':'Interact'):'Idle_Neutral';
  if(name!==current){const next=action(name);next.enabled=true;next.reset();next.setEffectiveWeight(1);if(current)next.crossFadeFrom(actions.get(current),fade[name]??.3,false);current=name;}
  const a=actions.get(current);a.timeScale=mode==='walk'?Math.max(.5,Math.min(1.8,speed/(speed>70?75:34)/(p.h*.95))):mode==='work'?(swings.has(tool)?.62:.5):1;
  if(pack)pack.visible=Boolean(carry);
  mixer.update(dt);
 };
 const dispose=()=>{mixer.stopAllAction();mixer.uncacheRoot(model);model.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.dispose();});};
 return {group,play,dispose};
}
