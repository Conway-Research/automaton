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
 const t=new T.Texture(bitmap);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=16;t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.flipY=false;t.needsUpdate=true;return t;
}
const SURFACES=['rock','ground','grass','bricks','stone','wood','bark','metal','marble','thatch'];
export async function loadSurfaces(){
 const out={};
 const lifts={rock:3.6,ground:3,bark:3.4,metal:2.6,bricks:2.5,stone:2.4,wood:2.3,grass:3.2,thatch:2.6,marble:1.3};
 await Promise.all(SURFACES.map(async name=>{out[name]={map:await loadTexture(name+'_color',true),normalMap:await loadTexture(name+'_normal',false),lift:lifts[name],cool:{stone:1.17,marble:1.01}[name]??1};if(name==='marble')for(const t of [out[name].map,out[name].normalMap])t.repeat.set(4,4);}));
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
// The picture as a film would grade it: glowing light bleeds, shadows turn cool, highlights warm, and the edges fall dark.
export function filmPass(renderer){
 if(matchMedia('(pointer:coarse)').matches||!renderer.extensions.has('EXT_color_buffer_float'))return null;
 const options={type:T.HalfFloatType,depthBuffer:false},main=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:4}),a=new T.WebGLRenderTarget(1,1,options),b=new T.WebGLRenderTarget(1,1,options);
 const quad=new T.Mesh(new T.PlaneGeometry(2,2)),flat=new T.OrthographicCamera(-1,1,1,-1,0,1);quad.frustumCulled=false;
 const shader=(uniforms,body)=>new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;'+body});
 const bright=shader({picture:{value:null},texel:{value:new T.Vector2()}},'uniform sampler2D picture;uniform vec2 texel;vec3 tap(vec2 o){vec3 c=min(texture2D(picture,vUv+o*texel).rgb,vec3(3.5));return c*smoothstep(1.25,2.4,max(c.r,max(c.g,c.b)));}void main(){gl_FragColor=vec4((tap(vec2(-1.,-1.))+tap(vec2(1.,-1.))+tap(vec2(-1.,1.))+tap(vec2(1.,1.)))*.25,1.);}');
 const blur=shader({picture:{value:null},stride:{value:new T.Vector2()}},'uniform sampler2D picture;uniform vec2 stride;void main(){vec3 c=texture2D(picture,vUv).rgb*.227;c+=(texture2D(picture,vUv+stride*1.385).rgb+texture2D(picture,vUv-stride*1.385).rgb)*.316;c+=(texture2D(picture,vUv+stride*3.231).rgb+texture2D(picture,vUv-stride*3.231).rgb)*.07;gl_FragColor=vec4(c,1.);}');
 const finish=shader({picture:{value:main.texture},glow:{value:a.texture},night:{value:0}},`uniform sampler2D picture;uniform sampler2D glow;uniform float night;
  void main(){vec3 c=texture2D(picture,vUv).rgb+texture2D(glow,vUv).rgb*.5;c*=.74+.16*night;c=clamp(c*(2.51*c+.03)/(c*(2.43*c+.59)+.14),0.,1.);
  c=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));
  float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,.86);c*=mix(vec3(.97,.99,1.03),vec3(1.02,1.,.97),smoothstep(.08,.7,l));c=mix(c,c*c*(3.-2.*c),.3);c=mix(c,mix(vec3(l)*vec3(.62,.76,1.12),c,smoothstep(.45,.95,l)),night*.72);
  c*=1.-.28*smoothstep(.42,.9,distance(vUv,vec2(.5)));gl_FragColor=vec4(c,1.);}`);
 const draw=(material,target)=>{quad.material=material;renderer.setRenderTarget(target);renderer.render(quad,flat);};
 let sx=1,sy=1;
 return {main,setNight(v){finish.uniforms.night.value=v;},setSize(w,h){const W=Math.max(1,Math.round(w)),H=Math.max(1,Math.round(h)),qw=Math.max(1,W>>2),qh=Math.max(1,H>>2);main.setSize(W,H);bright.uniforms.texel.value.set(1/W,1/H);a.setSize(qw,qh);b.setSize(qw,qh);sx=1/qw;sy=1/qh;},
  render(scene,camera){renderer.setRenderTarget(main);renderer.render(scene,camera);bright.uniforms.picture.value=main.texture;draw(bright,a);for(const [dx,dy,from,to] of [[sx,0,a,b],[0,sy,b,a]]){blur.uniforms.picture.value=from.texture;blur.uniforms.stride.value.set(dx,dy);draw(blur,to);}draw(finish,null);}};
}
export function addTerrainDetail(material,surfaces,light,extent,hub){
 const baked=new T.DataTexture(light.data,light.width,light.height,T.RGBAFormat);baked.magFilter=baked.minFilter=T.LinearFilter;baked.flipY=false;baked.needsUpdate=true;
 const time={value:0},hole={value:new T.Vector4(0,0,0,1e6)},bake={value:1};material.userData.time=time;material.userData.hole=hole;material.userData.bake=bake;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{grassDetail:{value:surfaces.grass.map},rockDetail:{value:surfaces.rock.map},groundDetail:{value:surfaces.ground.map},rockRelief:{value:surfaces.rock.normalMap},landNoise:{value:landNoise()},landLight:{value:baked},landExtent:{value:new T.Vector4(extent.x,extent.y,extent.w,extent.h)},landHub:{value:new T.Vector2(hub.x,hub.y)},landTime:time,landHole:hole,landBakeAmount:bake});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLandP;varying vec3 vLandN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLandP=position;vLandN=normal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec3 vLandP;varying vec3 vLandN;uniform sampler2D grassDetail;uniform sampler2D rockDetail;uniform sampler2D groundDetail;uniform sampler2D rockRelief;uniform sampler2D landNoise;uniform sampler2D landLight;uniform vec4 landExtent;uniform vec2 landHub;uniform float landTime;uniform vec4 landHole;float doomRent(vec3 p,vec4 h){vec2 d=p.xz-h.xy;if(length(d)>h.z)return 0.;float rag=sin(p.x*.19+p.z*.23)*sin(p.x*.07-p.z*.11);return p.y>h.w+rag*2.5?1.:0.;}uniform float landBakeAmount;
   float landMean(vec3 c){return max(.001,dot(c,vec3(.3333)));}`).replace('#include <map_fragment>',`#include <map_fragment>
   vec3 landP=vLandP,landN=normalize(vLandN);
   // The mountain melts from its top down, as a roof does: what is behind it stands inside.
   if(doomRent(landP,landHole)>.5)discard;
   float big=texture2D(landNoise,landP.xz/2300.).r,mid=texture2D(landNoise,landP.xz/520.).r;
   vec3 side=pow(abs(landN),vec3(5.));side/=side.x+side.y+side.z;
   vec3 rockNear=texture2D(rockDetail,landP.zy/95.).rgb*side.x+texture2D(rockDetail,landP.xz/95.).rgb*side.y+texture2D(rockDetail,landP.xy/95.).rgb*side.z;
   vec3 rockFar=texture2D(rockDetail,landP.zy/430.).rgb*side.x+texture2D(rockDetail,landP.xz/430.).rgb*side.y+texture2D(rockDetail,landP.xy/430.).rgb*side.z;
   vec3 soft=mix(texture2D(groundDetail,landP.xz/66.).rgb,texture2D(grassDetail,landP.xz/44.).rgb,smoothstep(.3,.6,diffuseColor.g-diffuseColor.r*.55));
   vec3 fine=texture2D(groundDetail,landP.xz/15.5).rgb;
   diffuseColor.rgb*=clamp(soft/landMean(soft),.45,1.55)*clamp(fine/landMean(fine),.62,1.38)*(.7+big*.6);
   float mordor=1.-smoothstep(560.,720.,length((landP.xz-landHub)/vec2(1.,.72)));
   float upland=smoothstep(70.,175.,landP.y),slope=1.-smoothstep(mix(.3,.62,upland),mix(.55,.84,upland),landN.y);
   float scree=smoothstep(170.,320.,landP.y+(mid-.5)*140.);
   float rockAmount=max(slope,scree*.94)*smoothstep(3.,18.,landP.y);
   float bands=.5+.5*sin(landP.y*.045+landMean(rockFar)*5.+big*12.+mid*5.);
   vec3 rockTone=mix(vec3(.1,.1,.102),vec3(.22,.212,.2),bands*.3+mid*.7);
   rockTone=mix(rockTone,vec3(.052,.044,.04)+vec3(.05,.04,.034)*mid,mordor);
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
   float landSun=mix(1.,landBaked.r,landBakeAmount)*(1.-passing*.5)*mix(1.,.82,mordor);
   reflectedLight.directDiffuse*=landSun;reflectedLight.directSpecular*=landSun;reflectedLight.indirectDiffuse*=landBaked.g*mix(vec3(1.),vec3(1.,.72,.6),mordor);
   totalEmissiveRadiance+=vec3(2.1,.52,.06)*landBaked.b*landBaked.b*(.78+.22*sin(landTime*1.1+landP.x*.021+landP.z*.033));
   #include <aomap_fragment>`);
 };
 material.needsUpdate=true;
}

// A surface for merged building geometry, tinted by its vertex colours.
export function surfaceMaterial(surface,{roughness=.9,transparent=false}={}){
 // The photographed surface carries its own darkness; the lift keeps the building's colour at its intended brightness.
 const lift=surface.lift??2.3;
 const cool=surface.cool??1;return new T.MeshStandardMaterial({color:new T.Color(lift*(2-cool),lift,lift*cool),vertexColors:true,map:surface.map,normalMap:surface.normalMap,normalScale:new T.Vector2(.8,.8),roughness,metalness:.02,transparent});
}

// Walls take on the ground they stand in: earth and moss climb them unevenly from the foot, so buildings grow out of the land.
export function blendIntoLand(material,land,extent,reach=20){
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{landTint:{value:land},landBox:{value:new T.Vector4(extent.x,extent.y,extent.w,extent.h)},landReach:{value:reach}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vLandSpot;varying float vFootY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFootY=position.y;vLandSpot=(modelMatrix*vec4(position,1.)).xz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vLandSpot;varying float vFootY;uniform sampler2D landTint;uniform vec4 landBox;uniform float landReach;').replace('#include <color_fragment>',`#include <color_fragment>
   {vec2 spot=(vLandSpot-landBox.xy)/landBox.zw;vec3 earth=texture2D(landTint,vec2(spot.x,1.-spot.y)).rgb;float rag=dot(texture2D(map,vMapUv*.31).rgb,vec3(.3333))*2.6;float foot=1.-smoothstep(.5,landReach,vFootY+(rag-.5)*landReach*.55);diffuseColor.rgb=mix(diffuseColor.rgb,earth,foot*.86);}`);
 };
 material.customProgramCacheKey=()=>'land-foot';
 return material;
}

// A building opens without changing its look: the roof melts away from the top down, the wall towards the viewer thins out to a low sill.
export function cutaway(material){
 const before=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,renderer){
  before?.call(this,shader,renderer);
  const u=this.userData.cut??={dir:{value:new T.Vector2(0,1)},open:{value:0},gone:{value:0}};u.keep??={value:0};
  Object.assign(shader.uniforms,{cutDir:u.dir,cutOpen:u.open,cutGone:u.gone,cutKeep:u.keep});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCutP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvCutP=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCutP;uniform vec2 cutDir;uniform float cutOpen;uniform float cutGone;uniform float cutKeep;').replace('#include <map_fragment>',`
   if(cutGone>0.)diffuseColor.a*=1.-smoothstep(0.,.5,cutGone*1.5-(1.-clamp(vCutP.y/150.,0.,1.)));
   if(cutOpen>0.&&length(vCutP.xz)<240.){float rag=sin(vCutP.x*.43+vCutP.z*.37)*sin(vCutP.x*.17-vCutP.z*.23+vCutP.y*.3);float sill=mix(90.,9.+rag*4.,smoothstep(.55,1.,cutOpen));if(dot(vCutP.xz,cutDir)>28.+rag*10.&&vCutP.y>cutKeep){if(vCutP.y>sill)discard;if(vCutP.y>9.)diffuseColor.a*=1.-smoothstep(.1,.75,cutOpen);}}
   #include <map_fragment>`);
 };
 material.customProgramCacheKey=function(){return (key?key.call(this):'')+'|cutaway';};
 return material;
}
export function setCut(material,x,z,open,gone=0){const u=material.userData.cut??={dir:{value:new T.Vector2(0,1)},open:{value:0},gone:{value:0}};u.dir.value.set(x,z);u.open.value=open;u.gone.value=gone;}
// Furniture and everything else up to this height stays whole while the wall in front opens.
export function keepWhole(material,height){const u=material.userData.cut??={dir:{value:new T.Vector2(0,1)},open:{value:0},gone:{value:0}};(u.keep??={value:0}).value=height;}

// ---- Scanned models, fetched the first time their region comes near ----
const loader=new GLTFLoader(),cache=new Map();
const loadModel=id=>{if(!cache.has(id))cache.set(id,loader.loadAsync(id.startsWith('props/')?`${ROOT}${id}.gltf`:`${ROOT}models/${id}/${id}.gltf`).then(g=>{g.scene.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});const box=new T.Box3().setFromObject(g.scene);return {scene:g.scene,height:box.max.y-box.min.y||1,width:Math.max(box.max.x-box.min.x,box.max.z-box.min.z)||1,base:box.min.y};}));return cache.get(id);};

export async function placeModels(group,items,ground){
 await Promise.all(items.map(async ([id,x,y,z,h,ry=0,rx=0])=>{
  const m=await loadModel(id),c=m.scene.clone(true),s=Math.min(h/m.height,h*1.5/m.width);c.scale.setScalar(s);c.position.set(x,y-m.base*s+(ground?ground(x,z):0),z);c.rotation.set(rx,ry,0);group.add(c);
 }));
}

// What stands where. Heights are in world units; a person is about 34 tall. Coordinates are inside the district.
export const regionProps={
 library:[['GothicCabinet_01',102,0,46,40,-1.57],['WoodenChair_01',92,0,12,20,-1.57],['lantern_chandelier_01',0,36,10,20],['fern_02',-158,0,120,16],['fern_02',176,0,116,18,1.2],['fern_02',-124,0,176,14,2.2],['moss_01',-140,0,150,4],['props/BookStand',-44,0,-30,16],['props/Book_Stack_1',24,13.9,-52,5],['props/BookGroup_Medium_2',-30,13.9,-56,6],['props/Book_Stack_2',-92,0,16,10]],
 gate:[['gothic_statue',-74,0,-66,48,1.57],['gothic_statue',74,0,-66,48,-1.57],['gothic_statue',-74,0,22,48,1.57],['gothic_statue',74,0,22,48,-1.57],['kite_shield',-96,18,-112,20],['kite_shield',96,18,-112,20],['lantern_chandelier_01',0,38,6,20],['gothic_statue',-56,0,198,46,.3],['gothic_statue',56,0,198,46,-.3],['props/Scroll_2',-52,13.9,-4,3]],
 forge:[['namaqualand_boulder_02',-112,0,-8,16,.6],['namaqualand_boulder_02',-214,0,176,30,1.2],['namaqualand_boulder_03',214,0,178,26,2.1],['props/Chain_Coil',18,0,-24,7],['props/Pickaxe_Bronze',-30,0,20,14,.6,1.4],['props/Anvil',-26,0,-72,13,.6],['props/Crate_Wooden',84,0,76,13],['props/Cauldron',-46,0,-40,16],['props/Workbench',-20,0,-96,18],['props/Torch_Metal',-80,0,18,30],['props/Torch_Metal',78,0,-20,30]],
 treasury:[['lantern_chandelier_01',0,40,6,20],['namaqualand_boulder_03',-214,0,110,40],['props/Chalice',20,13.9,81,6],['props/Coin_Pile',-52,0,-46,10],['props/Coin_Pile_2',44,0,-60,12],['props/Coin_Pile',-78,0,-14,9],['props/Coin_Pile_2',78,0,-10,8],['props/Stall_Cart_Empty',-214,0,168,34,.4],['props/Chest_Wood',84,0,18,14,-1]],
 council:[['fern_02',-160,0,130,16],['fern_02',-138,0,178,18,1],['fern_02',-60,0,196,15,2],['fern_02',130,0,150,19,3],['fern_02',-96,0,70,10,1],['dead_tree_trunk',188,0,120,60,1],['dead_tree_trunk_02',-200,0,100,64,2],['props/Crate_Wooden',84,0,62,13],['props/Scroll_1',6,14.2,-46,3],['props/Chalice',-26,13.9,-58,5]],
 messengers:[['brass_pot_01',-2,13.9,-72,7],['lantern_chandelier_01',0,38,-6,18],['fern_02',-170,0,172,14],['fern_02',170,0,170,14,1],['props/Book_Stack_1',26,13.9,-68,5],['props/Scroll_2',-22,13.9,-56,3],['props/Crate_Wooden',96,0,-32,12]],
 scouts:[['namaqualand_boulder_02',-196,0,150,30,1],['namaqualand_boulder_02',190,0,120,26,2.6],['namaqualand_boulder_03',-172,0,206,20,2],['dry_branches_medium_01',146,0,206,8],],
 isengard:[['dead_tree_trunk',-218,0,94,66,.6],['dead_tree_trunk_02',172,0,118,60,2.3],['namaqualand_boulder_02',-246,0,-30,30],['dry_branches_medium_01',120,0,170,16],['props/Cauldron',64,0,-56,18],['props/Chain_Coil',-40,0,8,8],['props/Anvil',-14,0,-12,14],['props/Chain_Coil',84,0,8,8,1],['props/Workbench',60,0,-82,16,-.6],['props/Pickaxe_Bronze',40,0,-14,14,1,1.4]],
 lorien:[['fern_02',-150,0,120,20],['fern_02',-100,0,146,18,1],['fern_02',110,0,142,20,2],['fern_02',160,0,110,16,3],['moss_01',-40,0,130,4],['moss_01',60,0,140,4],['props/Scroll_1',60,13.9,-60,3],['props/Chalice',48,13.9,-70,5]],
 observatory:[['marble_bust_01',-84,0,8,22,1.2],['WoodenChair_01',84,0,16,20,-1.2],['namaqualand_boulder_02',-196,0,176,24,.7],['namaqualand_boulder_02',176,0,120,30,1.8],['dry_branches_medium_01',-34,0,198,10],['props/CandleStick_Triple',90,0,-6,22],['props/Chandelier',0,42,-4,18],['props/Book_Stack_2',46,0,-90,10],['props/Scroll_2',60,13.9,-40,3]],
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
 wizard:{rig:'Adventurer',robe:true,under:'#6c7079',leather:'#54504a',trim:'#6c7079'},whitewizard:{rig:'Adventurer',robe:true,under:'#d8d8d0',leather:'#b8b8b0',trim:'#d8d8d0'},gollum:{rig:'Farmer',nohat:'Brown',top:'#b5b08a',under:'#8d8a6a',legs:'#b5b08a',leather:'#6a6850',crouch:.9},nazgul:{rig:'Adventurer',robe:true,under:'#0c0c11',leather:'#08080c',trim:'#1a1a20',metal:'#3a3a40',top:'#0b0b0f',legs:'#08080c'},
};
const materials=new Map();
function materialFor(rig,people,base,p=peoples[people]??peoples.gondor,d=dress[people]??dress.gondor,who=''){
 const key=`${rig.name}|${people}|${who}|${base.name}`;let m=materials.get(key);if(m)return m;
 const role=roles[rig.name][base.name],colors={skin:p.skin,top:d.top??p.body,legs:d.legs??p.legs,hair:p.hair,under:d.under??p.legs,leather:d.leather??'#3a2a18',dark:d.dark??'#1d1a17',metal:d.metal??'#8a8e94',trim:d.trim??'#8a7a4a',eye:'#17120d'};
 m=base.clone();m.color.set(d.shaven&&base.name==='Hair'?p.skin:colors[role]??'#55504a');m.roughness=role==='metal'||role==='trim'?.42:.86;m.metalness=role==='metal'||role==='trim'?.55:0;materials.set(key,m);return m;
}
// Worn things are made once in the figure's own space and then fixed to its bones, so they move with it.
// The named characters as they appear in the films, on top of what their people wear.
const beardOf=(k,c,len=8,r=2.3)=>k.limb([[0,-.6,2.1,r*.8],[0,-1.8,2.6,r],[0,-1.8-len*.45,2.8,r*.82],[0,-1.8-len*.8,2.5,r*.42],[.2,-1.8-len,2.2,.12]],c,9);
const hairLong=(k,c,len=10.5,r=3.1)=>{k.dome(0,.8,-.2,r+.25,c);k.limb([[0,.8,-1.6,r],[0,-3,-2.2,r],[0,-7,-2.5,r*.84],[0,-len,-2.4,.7]],c,10);for(const s of [-1,1])k.limb([[s*2.8,.6,.8,.9],[s*3.1,-3,.7,.8],[s*3,-len*.6,.6,.3]],c,6);};
const curlsOf=(k,c)=>{for(const [a,b,z] of [[-2.2,2,0],[0,2.9,.5],[2.2,2,0],[-2.8,.5,-.8],[2.8,.5,-.8],[0,2,-2],[-1.5,1.4,2],[1.4,1.5,2],[-2.6,-.6,-1.8],[2.6,-.6,-1.8],[0,.2,-3]])k.ball(a,b,z,1.6,c);};
const shaggy=(k,c)=>{k.dome(0,.9,-.2,3.6,c);k.limb([[0,.5,-1.8,3.3],[0,-3,-2.2,3.3],[0,-5.6,-2.2,2]],c,9);for(const s of [-1,1]){k.limb([[s*3,.8,.6,.9],[s*3.5,-2,.5,.8],[s*3.2,-5,.3,.2]],c,5);k.limb([[s*1.6,2.8,2.6,.5],[s*2.8,.8,2.8,.3],[s*3,-1,2.6,.1]],c,4);}};
const circletOf=(k,c,gem)=>{k.column(0,1.8,0,3.5,.32,c,14);if(gem)k.ball(0,2,3.4,.42,gem);};
const ears=(k,c)=>{for(const s of [-1,1])k.cone(s*3,-.4,0,.55,2.8,c,6);};
const dwarfHelm=(k,tone='#7c8086',band='#b8862e')=>{k.dome(0,1.5,0,3.6,tone);k.column(0,1.3,0,3.7,.8,band);k.box(0,-.2,3.4,.6,3,.5,tone);for(const s of [-1,1])k.box(s*3.3,-2.6,.8,.5,4.8,2.8,tone);k.limb([[0,5,-.4,.6],[0,6.6,-1.4,.5],[0,6.4,-3,.1]],band,5);};
const rohanHelm=(k,p)=>{k.dome(0,1.3,-.1,3.6,'#7a6a3c');k.column(0,1.2,0,3.7,.6,'#c9a23c');k.box(0,-.6,3.4,.7,3,.4,'#c9a23c');for(const s of [-1,1])k.box(s*3.3,-2.2,.9,.4,4,2.6,'#7a6a3c');k.limb([[0,4.8,0,.9],[0,6,-2.4,.8],[0,3,-5,.8],[0,-3,-5.6,.5],[0,-8,-5,.1]],'#ece6d6',6);k.limb([[0,.2,-1.8,2.2],[0,-3.6,-2.2,1.8]],p.hair,7);};
const heroes={
 Gandalf:{p:{body:'#6f737b',legs:'#5f6269',hair:'#d8d8d0'},g:{cloak:'#5a5e66',belt:'#3a2f24'},body:k=>{k.limb([[-4.6,2.6,1.6,1],[-3,.6,2.6,.9],[0,0,2.8,.9]],'#3f4f6a',5);k.limb([[4.6,2.6,1.6,1],[3,.6,2.6,.9],[0,0,2.8,.9]],'#3f4f6a',5);}},
 Saruman:{p:{hair:'#ecece4'},head:(k,p)=>{hairLong(k,p.hair,12.5);beardOf(k,p.hair,11,2.4);k.limb([[0,-2,3.5,.5],[0,-7,3.6,.5],[0,-11,3,.1]],'#55524e',5);}},
 Frodo:{p:{hair:'#2a1a10',body:'#6a5a3a'},d:{under:'#d8d2bc',top:'#54452c',legs:'#6a5f42'},g:{cloak:'#5c6452',brooch:'#7fb070',sash:null}},
 Sam:{p:{hair:'#a67a3c'},d:{top:'#5a6a38',under:'#c9b890',legs:'#7a6a44',pack:true},g:{sash:null,belt:'#3a2a18'},body:k=>{k.box(0,-5.4,-3.6,7.4,9,3.8,'#7a5f34');k.limb([[-3.6,0,-4,1],[3.6,0,-4,1]],'#54503c',7);k.column(3.6,-7,-5.8,1.5,.4,'#2a2a2a');}},
 Bilbo:{p:{hair:'#a09a8e'},d:{top:'#7a2e22',under:'#e4dcc4',legs:'#6a5a3a'},g:{sash:null,belt:'#3a2a18'}},
 Rosie:{p:{hair:'#b8843c'},d:{top:'#b86a5a',under:'#ece2c8',legs:'#8a5a3a'},g:{sash:null},head:(k,p)=>{curlsOf(k,p.hair);k.limb([[0,-1,-2.6,2],[0,-5,-2.8,1.6],[0,-7.4,-2.6,.4]],p.hair,7);}},
 Merry:{p:{hair:'#8a5a28'},d:{top:'#3f5a30',under:'#d8ceb0',legs:'#6a5a3a'},g:{sash:null,belt:'#3a2a18'}},
 Pippin:{p:{hair:'#a05f28'},d:{top:'#6a3f28',under:'#c8bc9c',legs:'#55603c'},g:{sash:null,belt:'#3a2a18',cloak:'#4f5a3c'}},
 Aragorn:{p:{hair:'#2a1c12'},d:{top:'#2e2a22',under:'#3f3a2c',leather:'#22180e',legs:'#2a241c'},g:{cloak:'#26231c',belt:'#22180e',brooch:null},head:(k,p)=>{shaggy(k,p.hair);beardOf(k,'#2a1c12',1.4,1.9);}},
 Arwen:{p:{hair:'#17110e',body:'#5a2a44',legs:'#3a1f30'},d:{leather:'#3a1f30',trim:'#b8a8c8'},g:{cloak:'#34284a',brooch:'#c8c8d8'},head:(k,p)=>{hairLong(k,p.hair,12);circletOf(k,'#c8c8d8','#a8d8ff');ears(k,p.skin);}},
 Legolas:{p:{hair:'#e6d9a0',body:'#54644a',legs:'#3a3f30'},d:{robe:false,under:'#54644a',leather:'#3a2f20',legs:'#3f4434',top:'#5a6a50'},g:{cloak:'#5e6a52',brooch:'#c8c8b0',belt:'#3a2f20'},head:(k,p)=>{hairLong(k,p.hair,9);ears(k,p.skin);for(const s of [-1,1])k.limb([[s*3.1,1.8,1.4,.45],[s*3.3,-.5,.4,.4],[s*2.6,-1.4,-2,.3]],p.hair,5);},body:k=>{k.limb([[3,3,-3.6,1.1],[-2,-8,-4.2,1]],'#5a3a1c',7);for(const i of [0,1,2,3])k.limb([[3+i*.3,3,-3.6+i*.15,.14],[4+i*.4,6.4,-3.2+i*.1,.14]],'#d8cfae',3);}},
 Gimli:{p:{hair:'#a0401c',body:'#6a3a20'},head:(k,p)=>{beardOf(k,p.hair,10.5,3.5);for(const s of [-1,1])k.limb([[s*1.8,-3,3,.8],[s*2.1,-8,3.2,.7],[s*1.9,-11,3,.2]],'#b8862e',5);dwarfHelm(k,'#6c7076','#a0793a');k.limb([[0,.6,-2,3],[0,-3.4,-2.6,3]],p.hair,8);}},
 Balin:{p:{hair:'#e8e6dc',body:'#6a2a24'},head:(k,p)=>{beardOf(k,p.hair,10,3);k.dome(0,1,-.2,3.2,p.skin);for(const s of [-1,1])k.ball(s*2.9,-.4,-.4,1.5,p.hair);}},
 Ori:{p:{hair:'#b5622c',body:'#7a6a4a'},head:(k,p)=>{beardOf(k,p.hair,3,1.9);k.dome(0,1.3,-.1,3.5,p.hair);k.limb([[0,.6,-2,3],[0,-2.6,-2.4,2.4]],p.hair,8);}},
 Óin:{p:{hair:'#8a8a84',body:'#5a4a30'},head:(k,p)=>{beardOf(k,p.hair,9,2.7);dwarfHelm(k,'#5c6064','#8a6a2a');}},
 Dáin:{p:{hair:'#b04a1c',body:'#5a3a24'},head:(k,p)=>{beardOf(k,p.hair,8,3.4);k.limb([[-3,-2,3,1],[0,-.8,3.6,1],[3,-2,3,1]],p.hair,7);dwarfHelm(k,'#4c5054','#d8a23c');for(const s of [-1,1])k.limb([[s*3.4,2.4,1,.8],[s*5.4,4,1.4,.6],[s*5.6,6.6,1,.1]],'#e6dcc0',5);}},
 Glóin:{p:{hair:'#a8381c',body:'#7a2e22'},head:(k,p)=>{beardOf(k,p.hair,9,3.2);k.dome(0,1.2,-.1,3.5,p.hair);k.limb([[0,.6,-2,3],[0,-3,-2.5,2.8]],p.hair,8);}},
 Boromir:{p:{hair:'#7a4a24'},d:{nohat:'Gold',under:'#5a2a20',top:'#5a2a20',metal:'#7c8086'},g:{plate:'#7c8086',tabard:'#3a1a18',tree:false,cloak:'#2a1c16',belt:'#3a2a18'},head:(k,p)=>{shaggy(k,p.hair);beardOf(k,p.hair,1.6,1.9);},body:k=>{k.limb([[-5,2.8,-1,2.2],[0,3.6,-1.6,2.6],[5,2.8,-1,2.2]],'#3a2a1c',8);k.add(k.cylinder(1,1,1,18),-1,-1.8,-4.4,5.2,.6,5.2,'#6a4a2a',0,Math.PI/2);k.add(k.cylinder(1,1,1,10),-1,-1.6,-4.8,1.5,.6,1.5,'#c9c9c0',0,Math.PI/2);}},
 Faramir:{p:{hair:'#7a5f30',body:'#3f4a2c'},d:{under:'#3a3a28',top:'#3f4a2c',metal:'#5a5a4a',trim:'#6a5a30'},g:{cloak:'#2f3a24',tabard:'#2a3020',tree:false,plate:'#5a5a4a',belt:'#3a2a18'},head:(k,p)=>{shaggy(k,p.hair);beardOf(k,p.hair,1.2,1.8);},body:k=>{k.limb([[3,3,-3.6,1.1],[-2,-8,-4.2,1]],'#3a2a18',7);}},
 Denethor:{p:{hair:'#8a8a84',body:'#17171d'},d:{under:'#121218',metal:'#3a3a40',trim:'#a8a8a0'},g:{plate:null,cloak:'#101016',tabard:'#101016',tree:true,belt:'#2a2a30'},head:(k,p)=>{hairLong(k,p.hair,6.5);}},
 Éowyn:{p:{hair:'#e0c36a',body:'#d8d4c4',legs:'#a8a490'},d:{robe:true,under:'#d8d4c4',leather:'#8a8a70',trim:'#c9a23c'},g:{cloak:'#3f6a44',brooch:'#d9a93c',plate:null,belt:'#c9a23c'},head:(k,p)=>{hairLong(k,p.hair,12.5);}},
 Théoden:{p:{hair:'#b8a878',body:'#6a5a30'},g:{cloak:'#3f5a34',brooch:'#d9a93c',plate:'#c9a23c'},head:(k,p)=>{hairLong(k,p.hair,8);beardOf(k,p.hair,6,2.2);circletOf(k,'#d9a93c');for(let i=0;i<7;i++){const a=(i-3)*.4;k.cone(Math.sin(a)*3.4,2,Math.cos(a)*3.4,.42,1.8+(i%2),'#d9a93c',4);}}},
 Gamling:{head:(k,p)=>{rohanHelm(k,p);beardOf(k,p.hair,4,2);}},Háma:{head:rohanHelm},Erkenbrand:{p:{hair:'#a8a08a'},head:(k,p)=>{rohanHelm(k,p);beardOf(k,p.hair,6,2.2);}},
 Elrond:{p:{hair:'#1c1815',body:'#5e2a30',legs:'#3a1a20'},d:{trim:'#c9a23c',leather:'#3a1a20',under:'#6a3a40'},g:{cloak:'#3a2430',brooch:'#d8c27a'},head:(k,p)=>{hairLong(k,p.hair,10);circletOf(k,'#c8c8c0','#d8e8ff');ears(k,p.skin);}},
 Glorfindel:{p:{hair:'#e0c878',body:'#c8c0a0',legs:'#8a8468'},g:{cloak:'#a89a70',brooch:'#d8c27a'},head:(k,p)=>{hairLong(k,p.hair,10);ears(k,p.skin);}},
 Galadriel:{p:{hair:'#ecd98f',body:'#f0f0e6',legs:'#c8c8b8'},d:{under:'#f0f0e6',leather:'#d8d8c8',trim:'#e4dcb0'},g:{cloak:'#e8e8dc',brooch:'#bcd8ff'},head:(k,p)=>{hairLong(k,p.hair,13,3.3);for(const s of [-1,1])for(let i=0;i<4;i++)k.ball(s*(2.4+Math.sin(i*2)*.5),-1-i*2.8,-1.6,1,p.hair);circletOf(k,'#e8e0a8');ears(k,p.skin);}},
 Celeborn:{p:{hair:'#e8e8e0',body:'#b8b8ae',legs:'#8a8a80'},g:{cloak:'#8f9488',brooch:'#d8d8c8'},head:(k,p)=>{hairLong(k,p.hair,12);circletOf(k,'#c8c8c0');ears(k,p.skin);}},
 Haldir:{p:{hair:'#d8cf9c',body:'#6f7468',legs:'#50544a'},d:{robe:false,under:'#6f7468',legs:'#50544a',top:'#6f7468',leather:'#3a3a2c'},g:{cloak:'#7c8270',brooch:'#7fb070',belt:'#3a3a2c'},head:(k,p)=>{hairLong(k,p.hair,10);ears(k,p.skin);},body:k=>{k.limb([[3,3,-3.6,1.1],[-2,-8,-4.2,1]],'#6a5a3a',7);}},
 Thranduil:{p:{hair:'#ece6c8',body:'#54503c',legs:'#3a3828'},d:{trim:'#c8c8b0',leather:'#3a3828',under:'#6a6650'},g:{cloak:'#6a6a54',brooch:'#c8c8b0'},head:(k,p)=>{hairLong(k,p.hair,12);ears(k,p.skin);circletOf(k,'#6a5a3a');for(const s of [-1,1]){k.limb([[s*1.6,2.2,.8,.34],[s*3.2,6,.6,.26],[s*4.8,10,-.2,.18],[s*4.4,14,-1,.05]],'#6a5a3a',4);k.limb([[s*2.8,4.8,.6,.2],[s*5.4,6.6,.6,.14],[s*7,9,.4,.04]],'#6a5a3a',4);k.limb([[s*4.2,8.6,0,.16],[s*2.8,12,-.4,.1],[s*2.2,14.4,-.8,.03]],'#6a5a3a',4);k.limb([[s*.6,2.4,1.6,.2],[s*1.2,6,1.2,.14],[s*.8,8.4,.8,.03]],'#6a5a3a',4);}}},
 Bard:{p:{hair:'#1f1610'},d:{top:'#3a342a',under:'#54402c',legs:'#2e2a22'},g:{cloak:'#2e2a22',brooch:null},head:(k,p)=>{shaggy(k,p.hair);beardOf(k,p.hair,1.4,1.8);}},
 Elendil:{p:{hair:'#2a2020'},g:{cloak:'#1c2036'}},
 Círdan:{p:{hair:'#d8d8d0',body:'#5f6e80',legs:'#3f4a58'},g:{cloak:'#44505e',brooch:'#c8d8e8'},head:(k,p)=>{hairLong(k,p.hair,11);beardOf(k,p.hair,8,2);ears(k,p.skin);}},
 Gollum:{head:(k,p)=>{for(const s of [-1,1]){k.ball(s*1.2,.2,2.8,1.2,'#dfeef5');k.ball(s*1.2,.2,3.8,.55,'#3f6a8a');}for(const [x,z] of [[-1.6,-1],[1.2,-1.6],[.2,-2.4],[-.6,-.2]])k.limb([[x,2.6,z,.08],[x*1.4,.4,z-1,.06],[x*1.6,-3,z-1.4,.02]],'#3a3a2c',3);for(const s of [-1,1])k.cone(s*3,-.2,0,.5,1.4,p.skin,5);}},
};
function headGear(k,people,p,h){
 if(h?.head)return h.head(k,p);
 const beard=(c,len,r)=>beardOf(k,c,len,r);
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
 else if(people==='nazgul'){k.dome(0,.2,-.3,4.5,'#07070a',1.25);k.cone(0,4.8,-1,3.4,5,'#07070a',8);k.limb([[0,.2,-2.6,4.2],[0,-4,-3.2,4.6],[0,-9,-3.4,5]],'#0b0b10',9);k.ball(0,-.4,2.7,2.5,'#020203');}
}
// What is worn on the body: cloaks falling from the shoulders, plates, tabards, belts, each people in its own manner.
const garb={ranger:{cloak:'#2c4427',brooch:'#b8b8b0',belt:'#3a2a1a'},noldor:{cloak:'#6e7480',brooch:'#d8c27a'},galadhrim:{cloak:'#7c8270',brooch:'#7fb070'},silvan:{cloak:'#3f5030',brooch:'#b89a4a',belt:'#3a2a18'},rohirrim:{cloak:'#2f5a34',brooch:'#d9a93c',plate:'#8a6a3a',belt:'#54381c'},gondor:{cloak:'#1c1d24',plate:'#b8bcc2',tabard:'#15161d',tree:true,belt:'#2a2a30'},numenorean:{cloak:'#22263a',brooch:'#d8c27a'},dwarf:{plate:'#8d9096',mail:true,belt:'#b8862e'},wizard:{cloak:'#5a5e66'},whitewizard:{cloak:'#e4e4dc'},hobbit:{sash:'#8f3b24'},dale:{cloak:'#4a3424',brooch:'#b89a4a',belt:'#3a2a18'},uruk:{plate:'#3a3c40',strap:'#2a2018',palm:true,belt:'#1d1a17'},orc:{strap:'#3a2a18',belt:'#2a2018'}};
function bodyGear(k,g){
 if(!g)return;
 if(g.cloak){for(let i=0;i<8;i++){const t=i/7,w=8.4+t*3.4;k.box(0,3-i*3.3,-3-t*1.5,w,3.5,.5,g.cloak);for(const s of [-1,1])k.box(s*w*.28,3-i*3.3,-3.3-t*1.5,.5,3.5,.3,'#0c0d0e');}k.box(0,3.2,-.6,8.6,1.2,5,g.cloak);}
 if(g.brooch){k.ball(1.8,2.2,2.5,.75,g.brooch);k.ball(-1.8,2.2,2.5,.75,g.brooch);}
 if(g.plate)for(const s of [-1,1]){k.ball(s*4.7,2.6,0,2.6,g.plate,.62);k.ball(s*5,1.8,0,2.2,g.plate,.5);k.box(s*5.6,.7,-.8,.3,.3,1.6,'#f0f0ea');}
 if(g.tabard){k.box(0,-9,2.3,5.2,12.4,.3,g.tabard);if(g.tree){k.box(0,-7,2.5,.45,6,.1,'#ece9de');for(const s of [-1,1]){k.add(k.cube(),s*.9,-2.8,2.5,.3,2.6,.1,'#ece9de',0,0,s*-.7);k.add(k.cube(),s*.8,-4.4,2.5,.3,2.2,.1,'#ece9de',0,0,s*-.9);}for(const [a,b] of [[0,0],[-1.2,-.6],[1.2,-.6]])k.ball(a,b-.4,2.5,.28,'#ece9de');}}
 if(g.mail)for(let i=0;i<3;i++)k.box(0,-6-i*1.3,2.2,6.8-i*.3,1.2,.4,i%2?'#6c7076':'#7c8086');
 if(g.strap)for(const s of [-1,1])k.add(k.cube(),s*.2,-2.5,2.3,1.1,11,.3,g.strap,0,0,s*.55);
 if(g.palm){k.ball(0,-1.4,2.5,1.1,'#ece9de',.9);for(let i=-2;i<=2;i++)k.box(i*.6,-.4,2.55,.28,1.8-Math.abs(i)*.2,.1,'#ece9de');}
 if(g.belt){k.box(0,-6.6,0,7.8,1.1,5.4,g.belt);k.box(0,-6.8,2.75,1.6,1.5,.3,'#c9a23c');}
 if(g.sash)k.box(0,-3.4,2.45,6.2,4.6,.3,g.sash);
}
const fade={Walk:.25,Run:.25,Idle_Neutral:.4,Idle_Sword:.4,Interact:.35,Sword_Slash:.3,Wave:.3};
// How each people carries itself: leaning, bent knees, sway of the hips, arms held away from the body.
const gaits={gollum:{lean:.62,neck:-.52,bend:1,arms:.1},orc:{lean:.3,neck:-.2,bend:.34,arms:.16,sway:.05},uruk:{lean:.14,neck:-.08,bend:.12,arms:.14,sway:.04},dwarf:{lean:.05,sway:.085,arms:.2},hobbit:{lean:.03,sway:.02},nazgul:{lean:.13,neck:.1},wizard:{lean:.07,neck:.03},ranger:{lean:.04},rohirrim:{lean:.02},gondor:{neck:-.03}};
const X=new T.Vector3(1,0,0),Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1),qa=new T.Quaternion(),qb=new T.Quaternion(),qc=new T.Quaternion(),va=new T.Vector3();
const smoothstep=x=>x*x*(3-2*x);
export function dressFigure(all,people,tool,name){
 const h=heroes[name],d={...(dress[people]??dress.gondor),...h?.d},p={...(peoples[people]??peoples.gondor),...h?.p},rig=all.get(d.rig),model=cloneRigged(rig.scene),group=new T.Group(),u=p.h*1.2,tall=30*u,s=tall/rig.height*(d.crouch??1),wide=(p.w??1);
 model.scale.set(s*wide,s,s*wide);model.position.y=-rig.base*s;group.add(model);
 model.traverse(n=>{if(n.isMesh){const part=`${n.name}|${n.parent?.name??''}`;if(d.nohat&&n.material.name===d.nohat&&/_Head/.test(part))n.visible=false;if(d.robe&&/_(Legs|Feet)/.test(part))n.visible=false;const role=roles[rig.name][n.material.name];n.material=materialFor(rig,people,n.material,p,d,h?name:'');n.castShadow=role==='top'||role==='legs'||role==='skin';n.receiveShadow=false;n.frustumCulled=false;}if(n.name==='Backpack'&&!d.pack)n.visible=false;});
 group.updateWorldMatrix(true,true);
 const bone=name=>model.getObjectByName(name),at=o=>{const v=new T.Vector3();o.getWorldPosition(v);return v;};
 const worn=(name,build,x=0,y=0,z=0,turn=0)=>{const b=bone(name);if(!b)return null;const k=new Kit();build(k);if(!k.pos.length)return null;const m=k.mesh(solid);m.castShadow=false;m.receiveShadow=false;m.scale.setScalar(u/1.25);const q=at(b);m.position.set(q.x+x,q.y+y,q.z+z);m.rotation.x=turn;b.attach(m);return m;};
 worn('Head',k=>headGear(k,people,p,h),0,tall*.082,.2);
 if(d.robe){const down=at(bone('Hips')).y/(u/1.25),robe=worn('Hips',k=>{k.cyl(0,-down,0,3.5,5.6,down*1.08,p.body,14);k.column(0,-down,0,5.7,.9,d.leather??'#2a2015',14);k.column(0,0,0,3.7,.7,d.trim??'#8a7a4a',14);});if(robe)robe.castShadow=true;}
 // The arm is brought to rest first, so a tool can simply be stood upright in the hand and then goes where the hand goes.
 const rest=new T.AnimationMixer(model);rest.clipAction(rig.clips.get('Idle_Neutral')).play();rest.update(.01);group.updateWorldMatrix(true,true);
 const hand=toolPositions(tool);
 const restPitch={sword:-1.25,axe:1.45,hammer:-1.2,pick:-1.2,chisel:-1.2};let held=null;if(hand.pos.length&&bone('WristR')){let low=Infinity,high=-Infinity;for(let i=1;i<hand.pos.length;i+=3){low=Math.min(low,-hand.pos[i]);high=Math.max(high,-hand.pos[i]);}const grip=low+(high-low)*({bow:.5,sword:.1,staff:.28,blackstaff:.28}[tool]??.22),reach=u/1.25,palm=1.7*reach,wrist=bone('WristR'),mesh=worn('WristR',k=>{k.pos.push(...hand.pos);k.nor.push(...hand.nor);k.col.push(...hand.col);},0,0,.6,Math.PI);if(mesh){wrist.updateWorldMatrix(true,false);held={mesh,wrist,grip,pivot:wrist.worldToLocal(at(wrist).add(new T.Vector3(0,-palm,.6)))};}}
 rest.stopAllAction();rest.uncacheRoot(model);
 worn('Chest',k=>{const g={...garb[people],...h?.g};bodyGear(k,g);h?.body?.(k);});
 const pack=worn('Chest',k=>{k.box(0,-5,-3.4,8,8,4,'#a07f4c');k.box(0,-1.5,-3.4,8.2,.6,4.2,'#3a2c10');});if(pack)pack.visible=false;
 const mixer=new T.AnimationMixer(model),actions=new Map();
 const action=name=>{if(!actions.has(name)){const a=mixer.clipAction(rig.clips.get(name));a.play();a.enabled=false;actions.set(name,a);}return actions.get(name);};
 let current=null;
 // Bones are turned around the figure's own axes, on top of the clip: +x bends forward, -x on an arm raises it to the front, +z takes the left arm out.
 const turned=new Map(),known=new Map(),spin=(name,axis,angle)=>{if(!angle)return;let b=known.get(name);if(b===undefined){b=bone(name)??null;known.set(name,b);}if(!b)return;if(!turned.has(b))turned.set(b,b.quaternion.clone());b.parent.getWorldQuaternion(qa).invert();model.getWorldQuaternion(qb);va.copy(axis).applyQuaternion(qb).applyQuaternion(qa);qc.setFromAxisAngle(va,angle);b.quaternion.premultiply(qc);};
 const armR=(u,l,out=0)=>{spin('UpperArmR',X,u);if(out)spin('UpperArmR',Z,-out);spin('LowerArmR',X,l);},armL=(u,l,out=0)=>{spin('UpperArmL',X,u);if(out)spin('UpperArmL',Z,out);spin('LowerArmL',X,l);},bow=(a,n=0)=>{spin('Abdomen',X,a);spin('Head',X,n);};
 const gait=gaits[people]??{},base=model.position.y;let clock=Math.random()*9;
 // Every tool is used the way it is used: a blow falls fast after a slow lift, a pen moves in small strokes, a page is turned now and then.
 const handle=()=>{const t=clock;
  if(tool==='hammer'){const c=(t*.72)%1,up=c<.62?smoothstep(c/.62):c<.72?1-smoothstep((c-.62)/.1):0;spin('Abdomen',X,.2-up*.24);armR(-.12-up*2.45,-.42-up*.95,.08);armL(-.3,-.7,-.04);spin('Head',X,.26);pitch=-.42+up*2.75;}
  else if(tool==='pick'){const c=(t*.5)%1,up=c<.62?smoothstep(c/.62):c<.74?1-smoothstep((c-.62)/.12):0;spin('Abdomen',X,.56-up*.7);armR(-.5-up*2.15,-.25-up*.65,.2);armL(-.5-up*2.15,-.25-up*.65,-.2);spin('Head',X,.18);pitch=-.85+up*3.1;}
  else if(tool==='axe'){const c=(t*.5)%1,up=c<.6?smoothstep(c/.6):c<.72?1-smoothstep((c-.6)/.12):0;spin('Abdomen',X,.42-up*.62);armR(-.6-up*2.05,-.3-up*.5,.2);armL(-.6-up*2.05,-.3-up*.5,-.2);spin('Head',X,.14);pitch=-.5+up*2.85;}
  else if(tool==='sword'){const c=(t*.38)%1,raise=c<.34?smoothstep(c/.34):c<.46?1-smoothstep((c-.34)/.12):0,thrust=c>.56&&c<.86?Math.sin((c-.56)/.3*Math.PI):0;spin('Abdomen',Y,.22-raise*.3+thrust*.42);spin('Abdomen',X,.08-raise*.14+thrust*.2);armR(-.95-raise*1.55+thrust*-.45,-.75-raise*.3+thrust*.65,.1);armL(-.35,-.6,-.12);pitch=.5+raise*1.6-thrust*.5;}
  else if(tool==='chisel'){const tap=Math.max(0,Math.sin(t*7))*.14;bow(.32,.3);armR(-.85-tap,-.8,.05);armL(-.8,-1,-.14);pitch=-.75;}
  else if(tool==='quill'){bow(.26,.3);armR(-.55+Math.sin(t*1.3)*.05,-1.05+Math.sin(t*5)*.07,-.05);spin('WristR',Y,Math.sin(t*7)*.28);armL(-.42,-.95,-.05);}
  else if(tool==='book'||tool==='scroll'||tool==='letter'){const turn=t%6<.7?Math.sin((t%6)/.7*Math.PI):0;bow(.09,.34);armR(-.55,-1.2,-.12);armL(-.55-turn*.2,-1.2+turn*.55,-.12-turn*.3);spin('Head',Y,Math.sin(t*.5)*.08);}
  else if(tool==='compass'){armR(-1.1,-.55,-.12);armL(-.3,-.35);bow(.05,.14);spin('Head',Y,Math.sin(t*.55)*.4);}
  // Coins are taken one by one from the coffer, looked at and set on the stack.
  else if(tool==='coin'){const c=(t*.45)%1,take=c<.3?Math.sin(c/.3*Math.PI):0,look=c>=.3&&c<.6?Math.sin((c-.3)/.3*Math.PI):0,place=c>=.6&&c<.9?Math.sin((c-.6)/.3*Math.PI):0;bow(.3-look*.12,.3-look*.18);armR(-.62-take*.3-look*.55-place*.12,-.95+take*.35-look*.5,-.32+take*.5-place*.28);armL(-.55,-1,-.1+place*.1);spin('WristR',Y,look*.8);spin('Head',Y,-take*.3+place*.2);}
  else if(tool==='sack'){const c=(t*.2)%1,l=Math.sin(c*Math.PI);spin('Abdomen',X,l*.95);spin('Head',X,-l*.3);armR(-.5-l*.5,-.4,.08);armL(-.5-l*.5,-.4,.08);if(gait.bend===undefined){spin('UpperLegL',X,-l*.32);spin('UpperLegR',X,-l*.32);spin('LowerLegL',X,l*.5);spin('LowerLegR',X,l*.5);}}
  else if(tool==='ladle'){const pour=smoothstep(Math.max(0,Math.sin(t*.55)));armR(-1.15-pour*.15,-.45,-.1);tilt=pour*1.1;armL(-.4,-.3);bow(.14,.28);}
  else if(tool==='seal'){const c=(t*.4)%1,up=c<.7?smoothstep(c/.7):c<.82?1-smoothstep((c-.7)/.12):0;bow(.22,.28);armR(-.72-up*.55,-.85-up*.3);armL(-.45,-1,-.05);}
  else if(tool==='scale'){const w=Math.sin(t*.7)*.04;armR(-1.42+w,-.18,-.08);armL(-.3,-.2);spin('Head',Y,-.1);spin('Head',X,-.06);}
  else if(tool==='bow'){const c=(t*.2)%1,draw=c<.5?smoothstep(c/.5):c<.72?1:Math.max(0,1-(c-.72)*12);spin('Abdomen',Y,.36);armR(-1.5,0,.06);armL(-.25-draw*1.2,-.1-draw*1.9,-draw*.42);spin('Head',Y,.32);}
  else if(tool==='staff'||tool==='blackstaff'){armR(-.55,-.72);armL(-.16+Math.sin(t*.5)*.14,-.3-Math.max(0,Math.sin(t*.5))*.7);spin('Head',Y,Math.sin(t*.35)*.3);}
 };
 const bearing=mode=>{
  if(gait.lean)spin('Abdomen',X,gait.lean);if(gait.neck)spin('Neck',X,gait.neck);
  if(gait.bend){const b=gait.bend;for(const s of ['L','R']){spin('UpperLeg'+s,X,-b*.72);spin('LowerLeg'+s,X,b*1.12);spin('Foot'+s,X,-b*.4);}model.position.y=base-tall*b*.11;}
  if(gait.arms){spin('UpperArmL',Z,gait.arms);spin('UpperArmR',Z,-gait.arms);}
  if(mode==='hide'){spin('Abdomen',X,.72);spin('Head',X,-.3);for(const s of ['L','R']){spin('UpperLeg'+s,X,-.9);spin('LowerLeg'+s,X,1.4);spin('Foot'+s,X,-.5);}model.position.y=base-tall*.17;}else if(!gait.bend)model.position.y=base;
  if(mode==='bow'){spin('Abdomen',X,.8);spin('Neck',X,-.2);armR(-.5,-.3);armL(-.5,-.3);}
  if(mode==='guard'){if(tool==='bow')handle();else if(tool==='staff'||tool==='blackstaff')armR(-.9,-.6);else if(tool==='sword'||tool==='axe')handle();else if(held&&restPitch[tool]!==undefined){armR(-1.15,-.75,.12);if(tool==='axe'||tool==='pick')armL(-1.1,-.85,-.12);pitch=tool==='sword'?1.05:1.2;}else armR(-.5,-.55);spin('Abdomen',Y,.2);spin('Head',Y,-.1);}
  if(mode==='talk'){const say=Math.sin(clock*.9),hand=Math.max(0,Math.sin(clock*2.2))*(say>0?1:.2);spin('Head',Y,Math.sin(clock*.6)*.14);spin('Head',X,Math.sin(clock*1.7)*.05);
   if(mood==='hostile'){if(tool==='staff'||tool==='blackstaff')armR(-2.1,-.3,.1);else{armR(-1.25,-.45-hand*.4);if(restPitch[tool]!==undefined)pitch=1.15+hand*.3;}spin('Abdomen',X,.1);armL(-.7-hand*.2,-.8);}
   else if(mood==='wary'){spin('Abdomen',X,.12);armL(-.5,-1.1,-.1);armR(-.5,-1.1,-.1);}
   else{armR(-.36-hand*.42,-.85-hand*.35,-.05);armL(-.12-hand*.14,-.2);}}
  if(mode==='walk'&&current){const a=actions.get(current),clip=a.getClip(),w=a.time/clip.duration*6.283;if(gait.sway){spin('Hips',Z,Math.sin(w)*gait.sway);spin('Chest',Z,-Math.sin(w)*gait.sway*.55);}
   if(tool==='staff'||tool==='blackstaff'){armR(-.42+Math.sin(w)*.16,-.62);}else if(tool==='sack'){armR(-2.5,-1.9,-.14);}else if(tool==='bow'){armR(-.25,-.4);}}
  if(mode==='rest'&&(tool==='staff'||tool==='blackstaff'))armR(-.4,-.68);
 };
 let mood=null,tilt=0,pitch=null;
 // A blade rests point down beside the leg and an axe stands head up; in work and in a fight the hands set the angle. Staffs, bows and instruments stay upright.
 const tipV=new T.Vector3(),sideV=new T.Vector3(),backV=new T.Vector3(),holdM=new T.Matrix4(),holdQ=new T.Quaternion();
 const aim=mode=>{if(!held)return;const {mesh,wrist,grip,pivot}=held,p=pitch??(mode==='walk'&&tool==='sword'?-.95:restPitch[tool]);model.getWorldQuaternion(qb);wrist.getWorldQuaternion(qa);
  if(p===undefined)tipV.set(0,tool==='sack'?-1:1,.04);else tipV.set(0,Math.sin(p),Math.cos(p));
  tipV.x+=tilt;tipV.normalize();sideV.set(1,0,0).addScaledVector(tipV,-tipV.x).normalize();backV.copy(sideV).cross(tipV).negate();tipV.negate();holdM.makeBasis(sideV,tipV,backV);
  holdQ.setFromRotationMatrix(holdM);mesh.quaternion.copy(qa).invert().multiply(qb).multiply(holdQ);
  mesh.position.set(0,-grip*mesh.scale.y,0).applyQuaternion(mesh.quaternion).negate().add(pivot);tilt=0;pitch=null;};
 const play=(mode,speed,dt,carry,feeling=null)=>{
  mood=feeling;
  clock+=dt;
  const name=mode==='walk'?(speed>70?'Run':'Walk'):mode==='fetch'?'Interact':mode==='greet'?'Wave':mode==='work'||tool!=='sword'?'Idle_Neutral':'Idle_Sword';
  if(name!==current){const next=action(name);next.enabled=true;next.reset();next.setEffectiveWeight(1);if(current)next.crossFadeFrom(actions.get(current),fade[name]??.3,false);current=name;}
  const a=actions.get(current);a.timeScale=mode==='walk'?Math.max(.5,Math.min(1.8,speed/(speed>70?75:34)/(p.h*.95))):1;
  if(pack)pack.visible=Boolean(carry);
  // The mixer only writes what changed, so each frame starts again from the pose of the clip.
  for(const [b,q] of turned)b.quaternion.copy(q);
  mixer.update(dt);
  for(const [b,q] of turned)q.copy(b.quaternion);
  bearing(mode);if(mode==='work')handle();aim(mode);
 };
 const dispose=()=>{mixer.stopAllAction();mixer.uncacheRoot(model);model.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.dispose();});};
 return {group,play,dispose};
}
