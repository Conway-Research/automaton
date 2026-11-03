// Geometry of the 3D Middle-earth desktop: figures, halls with interiors, settlements and Barad-dûr.
// Pure drawing. No data from the server and no server access.
import * as T from './vendor/three.module.min.js';

export const HALL={half:115,height:58,offset:60};
export const crewPoint=m=>({x:m.x,z:(m.y-HALL.offset)*2.5});

// Collects simple solids and merges them into one mesh, so a whole district costs only a few draw calls.
const bladeOf=(out,h,thick)=>{const s=new T.Shape();s.moveTo(0,0);s.lineTo(out,0);s.lineTo(out*.62,h*.46);s.lineTo(out*.2,h*.82);s.lineTo(0,h);s.closePath();return new T.ExtrudeGeometry(s,{depth:thick,bevelEnabled:false}).translate(0,0,-thick/2).toNonIndexed();};
const unit={box:new T.BoxGeometry(1,1,1).toNonIndexed(),sphere:new T.SphereGeometry(1,14,10).toNonIndexed(),dome:new T.SphereGeometry(1,14,8,0,Math.PI*2,0,Math.PI/2).toNonIndexed()};
const cylinders=new Map();
const cylinder=(top,bottom,segments)=>{const key=`${top}|${bottom}|${segments}`;if(!cylinders.has(key))cylinders.set(key,new T.CylinderGeometry(top,bottom,1,segments).toNonIndexed());return cylinders.get(key);};
const helper=new T.Object3D(),tint=new T.Color();
// The colours that mean water: such surfaces run and fall instead of standing still.
const WATER=new Set(['#cfe2e8','#3f7f96']);
// Fire everywhere is the same living flame: a quad that faces the view and burns in the fragment program.
export const flameClock={value:0};
export const worldDay={value:1};
export function fireAt(kit,x,y,z,r,h){const p=new T.Vector3(x,y,z);if(kit.parent)p.applyMatrix4(kit.parent);(kit.fires??=[]).push([p.x,p.y+(kit.ground?kit.ground(p.x,p.z):0),p.z,r,h,kit.elven?1:0]);}
const flameMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,fog:false,uniforms:{time:flameClock,flameDay:worldDay,level:{value:1}},
 vertexShader:`attribute vec2 corner;attribute vec4 seed;uniform float time;varying vec2 vC;varying float vS;varying float vCool;void main(){vC=corner;vS=seed.z;vCool=seed.w;vec3 c=(modelMatrix*vec4(position,1.)).xyz;float s=length(modelMatrix[0].xyz);vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=normalize(vec3(0.,.8,0.)+vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1])*.55);gl_Position=projectionMatrix*viewMatrix*vec4(c+right*corner.x*seed.x*s+up*corner.y*seed.y*s,1.);}`,
 fragmentShader:`uniform float time;uniform float flameDay;uniform float level;varying vec2 vC;varying float vS;varying float vCool;float h21(vec2 p){p=fract(p*vec2(.1031,.103));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
 void main(){if(vS<0.){float d=length(vC),beat=.8+.2*sin(time*(6.+vS*-7.)+vS*53.)*sin(time*2.3-vS*31.);float halo=pow(max(0.,1.-d),2.4)*mix(.62,.14,flameDay)*beat*level;if(halo<.004)discard;gl_FragColor=vec4(mix(vec3(1.,.44,.12),vec3(.42,.68,1.),vCool),halo);
  #include <colorspace_fragment>
  return;}
  float y=vC.y,t=time+vS*17.;float x=vC.x+(vn(vec2(vC.x*2.+vS*9.,y*3.2-t*2.7))-.5)*.72*y;float n=vn(vec2(x*3.4+vS*5.,y*5.-t*3.4))*.65+vn(vec2(x*8.-vS,y*11.-t*5.))*.35;float w=mix(.66,.03,pow(y,.72));float body=smoothstep(1.,.3,abs(x)/w);float a=body*smoothstep(1.,.2,y+(n-.5)*.85)*smoothstep(0.,.05,y);float heat=a*(1.15-y*.75);vec3 c=mix(vec3(.85,.13,.015),vec3(1.7,.62,.06),smoothstep(.08,.5,heat));c=mix(c,vec3(2.4,1.85,.85),smoothstep(.5,.92,heat));vec3 e=mix(vec3(.08,.26,1.15),vec3(.42,.8,1.95),smoothstep(.08,.5,heat));e=mix(e,vec3(2.3,2.5,2.7),smoothstep(.46,.86,heat));c=mix(c,e,vCool);if(a<.01)discard;gl_FragColor=vec4(c*.62*level,a*.8*level);
  #include <colorspace_fragment>
 }`});
export function flameSheet(spots,material=flameMaterial){
 const pos=[],corner=[],seed=[],index=[];let n=0,s=0;
 for(const [x,y,z,r,h,cool=0] of spots){for(const [dx,dz,f,wide] of [[0,0,1,1.05],[.45,.25,.72,.8],[-.5,-.2,.64,.74]]){s=(s+.379)%1;for(const [a,b] of [[-1,0],[1,0],[1,1],[-1,1]]){pos.push(x+dx*r,y,z+dz*r);corner.push(a,b);seed.push(r*wide*1.25,h*f*1.25,s,cool);}index.push(n,n+1,n+2,n,n+2,n+3);n+=4;}
  // Each flame also lights the air around it: a soft halo, flickering with it.
  s=(s+.379)%1;const glow=Math.max(r*3.4,h*1.15);for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){pos.push(x,y+h*.36,z);corner.push(a,b);seed.push(glow,glow,-.01-s,cool);}index.push(n,n+1,n+2,n,n+2,n+3);n+=4;}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('corner',new T.Float32BufferAttribute(corner,2));geo.setAttribute('seed',new T.Float32BufferAttribute(seed,4));geo.setIndex(index);
 const m=new T.Mesh(geo,material);m.frustumCulled=false;m.renderOrder=3;return m;
}
export const nightFlames=()=>{const m=flameMaterial.clone();m.uniforms.time=flameClock;m.uniforms.flameDay=worldDay;return m;};
export class Kit{
 // A lamp is a real little flame, not a glowing ball.
 lamp(x,y,z,r=1.4){fireAt(this,x,y-r*.9,z,r*1.35,r*4.8);return this;}
 constructor(){this.pos=[];this.nor=[];this.col=[];}
 frameGround(){if(this.frameKey!==this.parent){const e=this.parent.elements;let m=this.ground(e[12],e[14]);for(const [u,w] of [[16,16],[-16,16],[16,-16],[-16,-16]])m=Math.min(m,this.ground(e[12]+u,e[14]+w));this.frameKey=this.parent;this.frameLift=m;}return this.frameLift;}
  local(x,z,ry,build){const previous=this.parent,m=new T.Matrix4().makeRotationY(ry).setPosition(x,0,z);this.parent=previous?previous.clone().multiply(m):m;if(this.lights)this.lights.parent=this.parent;build();this.parent=previous;if(this.lights)this.lights.parent=previous;return this;}
 // A pitched roof with its ridge along z.
 gable(x,y,z,w,d,h,color,ry=0){const shape=new T.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(0,h);shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false}).toNonIndexed();g.translate(0,0,-d/2);this.add(g,x,y,z,1,1,1,color,ry);return this;}
 // Weathered rock: a crumpled sphere, never the same twice.
 rock(x,y,z,sx,sy,sz,color,seed=1){const key='r'+(seed%5);if(!cylinders.has(key)){const g=new T.IcosahedronGeometry(1,3),p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=1+Math.sin(v.x*3.1+seed)*.13+Math.sin(v.y*4.7+seed*2)*.1+Math.sin(v.z*5.3+seed*3)*.1+Math.sin((v.x+v.y)*9+seed)*.05;v.multiplyScalar(n);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();cylinders.set(key,g.toNonIndexed());}return this.add(cylinders.get(key),x,y,z,sx,sy,sz,color,seed);}
 // A natural green hill: rolling and uneven, never a perfect dome.
 hill(x,y,z,r,sy,color,seed=1){const key='h'+(seed%3);if(!cylinders.has(key)){const g=new T.SphereGeometry(1,44,18,0,Math.PI*2,0,Math.PI/2),p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const a=Math.atan2(v.z,v.x),n=1+Math.sin(a*3+seed)*.05*(1-v.y)+Math.sin(a*7+seed*2)*.03+Math.sin(v.x*5+seed)*Math.cos(v.z*6)*.035;p.setXYZ(i,v.x*n,v.y*(1+Math.sin(v.x*4+v.z*3+seed)*.06),v.z*n);}g.computeVertexNormals();cylinders.set(key,g.toNonIndexed());}return this.add(cylinders.get(key),x,y,z,r,r*sy,r,color,seed);}
 // A great crag: hard edges, gullies and overhangs, for anything as large as a hillside.
 crag(x,y,z,sx,sy,sz,color,seed=1){const key='c'+(seed%4);if(!cylinders.has(key)){const g=new T.IcosahedronGeometry(1,16),p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);let n=1,a=.3,f=2.3;for(let o=0;o<5;o++){const q=Math.sin(v.x*f+seed+o*1.7)*Math.cos(v.y*f*1.13+seed*2)+Math.sin(v.z*f*.93+o)*Math.cos(v.x*f*.71+seed);n+=(.55-Math.abs(q))*a;a*=.55;f*=2.1;}v.multiplyScalar(Math.max(.45,n));p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();const sums=new Map(),normal=g.attributes.normal,keyOf=i=>`${Math.round(p.getX(i)*2e3)},${Math.round(p.getY(i)*2e3)},${Math.round(p.getZ(i)*2e3)}`;for(let i=0;i<p.count;i++){const q=keyOf(i),t=sums.get(q)??[0,0,0];t[0]+=normal.getX(i);t[1]+=normal.getY(i);t[2]+=normal.getZ(i);sums.set(q,t);}for(let i=0;i<p.count;i++){const t=sums.get(keyOf(i)),l=Math.hypot(t[0],t[1],t[2])||1;normal.setXYZ(i,t[0]/l,t[1]/l,t[2]/l);}cylinders.set(key,g);}return this.add(cylinders.get(key),x,y,z,sx,sy,sz,color,seed);}
 // A crown of many clumps of leaves, darker underneath, never a single ball.
 canopy(x,y,z,r,colors,seed=1,flat=.72){let s=seed*7919+13;const rnd=()=>(s=(s*16807)%2147483647)/2147483647,c=new T.Color(),hex={getHexString:()=>''};if(!cylinders.has('leaf')){const g=new T.IcosahedronGeometry(1,1),p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const m=1+Math.sin(v.x*5)*.14+Math.sin(v.y*6+1)*.14+Math.sin(v.z*7+2)*.12;g.attributes.normal.setXYZ(i,v.x,v.y,v.z);v.multiplyScalar(m);p.setXYZ(i,v.x,v.y,v.z);}cylinders.set('leaf',g.toNonIndexed());}const n=Math.max(16,Math.min(130,Math.round(r/.7)));for(let i=0;i<n;i++){const a=rnd()*6.283,u=rnd()*2-1,d=Math.pow(rnd(),.4),ring=Math.sqrt(1-u*u),px=Math.cos(a)*ring*d*r,py=u*d*r*flat,pz=Math.sin(a)*ring*d*r,size=r*(.1+rnd()*.11);c.set(colors[Math.floor(rnd()*colors.length)]).multiplyScalar(.62+.46*(u*.5+.5)+(rnd()-.5)*.14);this.add(cylinders.get('leaf'),x+px,y+py,z+pz,size*(.9+rnd()*.5),size*(.62+rnd()*.3),size*(.9+rnd()*.5),`#${c.getHexString()}`,rnd()*6.283);}return this;}
 // A smooth tapering limb through points [x,y,z,radius], for anything grown rather than built.
 limb(points,color,sides=10){
  const c=new T.Color(color),path=[],at=(i)=>points[Math.max(0,Math.min(points.length-1,i))];
  for(let i=0;i<points.length-1;i++)for(let n=0;n<(i===points.length-2?5:4);n++){const t=n/4,p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2),q=[];for(let d=0;d<4;d++)q[d]=.5*(2*p1[d]+(p2[d]-p0[d])*t+(2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*t*t+(3*p1[d]-p0[d]-3*p2[d]+p3[d])*t*t*t);q[3]=Math.max(.05,q[3]);path.push(q);}
  const rings=[],T0=new T.Vector3(),A=new T.Vector3(1,0,.3).normalize(),B=new T.Vector3(),o=new T.Vector3();
  path.forEach((p,i)=>{const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];T0.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();A.addScaledVector(T0,-A.dot(T0));if(A.lengthSq()<1e-5)A.set(0,0,1).addScaledVector(T0,-T0.z);A.normalize();B.crossVectors(T0,A);const ring=[];for(let j=0;j<=sides;j++){const w=j/sides*6.2832;o.copy(A).multiplyScalar(Math.cos(w)).addScaledVector(B,Math.sin(w));ring.push([p[0]+o.x*p[3],p[1]+o.y*p[3],p[2]+o.z*p[3],o.x,o.y,o.z]);}rings.push(ring);});
  const frame=this.parent,world=new T.Vector3(),turned=new T.Vector3(),turn=frame?new T.Matrix3().getNormalMatrix(frame):null,foot=frame?new T.Vector3(points[0][0],points[0][1],points[0][2]).applyMatrix4(frame):null,rise=this.ground?(frame?this.frameGround():this.ground(points[0][0],points[0][2])):0;const put=v=>{if(frame){world.set(v[0],v[1],v[2]).applyMatrix4(frame);turned.set(v[3],v[4],v[5]).applyMatrix3(turn).normalize();this.pos.push(world.x,world.y+rise,world.z);this.nor.push(turned.x,turned.y,turned.z);}else{this.pos.push(v[0],v[1]+rise,v[2]);this.nor.push(v[3],v[4],v[5]);}this.col.push(c.r,c.g,c.b);};
  const from=this.pos.length;for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++){const a=rings[i][j],b=rings[i][j+1],d=rings[i+1][j],e=rings[i+1][j+1];put(a);put(b);put(d);put(b);put(e);put(d);}
  this.note(from);return this;
 }
 cylinder(top,bottom,h,segments=10){const key=`g${top}|${bottom}|${h}|${segments}`;if(!cylinders.has(key))cylinders.set(key,new T.CylinderGeometry(top,bottom,h,segments).toNonIndexed());return cylinders.get(key);}
 icosa(r){const key='i'+r;if(!cylinders.has(key))cylinders.set(key,new T.IcosahedronGeometry(r,0).toNonIndexed());return cylinders.get(key);}
 octa(r){const key='o'+r;if(!cylinders.has(key))cylinders.set(key,new T.OctahedronGeometry(r,0).toNonIndexed());return cylinders.get(key);}
 torus(r,t){const key=`t${r}|${t}`;if(!cylinders.has(key))cylinders.set(key,new T.TorusGeometry(r,t,8,28).toNonIndexed());return cylinders.get(key);}
 cube(){return unit.box;}
 // A thick curved wall from angle a0 to a1, where angle 0 is north and angles grow clockwise.
 arc(radius,thick,a0,a1,y,h,color){const shape=new T.Shape(),steps=8;for(let i=0;i<=steps;i++){const a=a0+(a1-a0)*i/steps,px=Math.sin(a)*radius,py=Math.cos(a)*radius;i?shape.lineTo(px,py):shape.moveTo(px,py);}for(let i=steps;i>=0;i--){const a=a0+(a1-a0)*i/steps;shape.lineTo(Math.sin(a)*(radius-thick),Math.cos(a)*(radius-thick));}shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}).toNonIndexed();g.rotateX(-Math.PI/2);this.add(g,0,y,0,1,1,1,color);return this;}
 add(geometry,x,y,z,sx,sy,sz,color,ry=0,rx=0,rz=0){
  if(this.water&&WATER.has(color)){this.water.parent=this.parent;this.water.ground=this.ground;this.water.add(geometry,x,y,z,sx,sy,sz,color,ry,rx,rz);return this;}
  const from=this.pos.length;
  // No two solids ever share a plane, which is what makes surfaces flicker from afar.
  const hair=.03+((this.solids=(this.solids??0)+1)*7%11)*.012;
  helper.position.set(x,y,z);helper.scale.set(sx+hair,sy+hair,sz+hair);helper.rotation.set(rx,ry,rz);helper.updateMatrix();if(this.parent)helper.matrix.premultiply(this.parent);
  const p=geometry.attributes.position,n=geometry.attributes.normal,normalMatrix=new T.Matrix3().getNormalMatrix(helper.matrix),v=new T.Vector3();tint.set(color);
  // Whatever is built in one frame (a house, a smial) settles as one piece, to the lowest ground under it, so walls and roof stay together.
  // Loose small things standing on the land settle to their lowest corner, so none of them floats on a slope.
  const cx=helper.matrix.elements[12],cz=helper.matrix.elements[14];let lift=0;
  if(this.ground&&this.parent)lift=this.frameGround();
  else if(this.ground){lift=this.ground(cx,cz);if(y<2&&Math.max(sx,sz)<80){const a=sx/2,b=sz/2;for(const [u,w] of [[a,b],[-a,b],[a,-b],[-a,-b]])lift=Math.min(lift,this.ground(cx+u,cz+w));}}
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(helper.matrix);this.pos.push(v.x,v.y+lift,v.z);v.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();this.nor.push(v.x,v.y,v.z);this.col.push(tint.r,tint.g,tint.b);}
  this.note(from);return this;
 }
 // Remembers what stands on the ground, so that nothing else grows through it.
 note(from){if(!this.record)return;let x0=1e9,y0=1e9,z0=1e9,x1=-1e9,y1=-1e9,z1=-1e9;for(let i=from;i<this.pos.length;i+=3){x0=Math.min(x0,this.pos[i]);x1=Math.max(x1,this.pos[i]);y0=Math.min(y0,this.pos[i+1]);y1=Math.max(y1,this.pos[i+1]);z0=Math.min(z0,this.pos[i+2]);z1=Math.max(z1,this.pos[i+2]);}if(y0<12&&y1>3)this.record.push([x0,z0,x1,z1]);}
 box(x,y,z,w,h,d,color,ry=0){return this.add(unit.box,x,y+h/2,z,w,h,d,color,ry);}
 cyl(x,y,z,rTop,rBottom,h,color,segments=12){return this.add(cylinder(1,rBottom/(rTop||1),segments),x,y+h/2,z,rTop||1,h,rTop||1,color);}
 column(x,y,z,r,h,color,segments=12){return this.add(cylinder(1,1,segments),x,y+h/2,z,r,h,r,color);}
 cone(x,y,z,r,h,color,segments=12,ry=0){return this.add(cylinder(0,1,segments),x,y+h/2,z,r,h,r,color,ry);}
 ball(x,y,z,r,color,sy=1){return this.add(unit.sphere,x,y,z,r,r*sy,r,color);}
 dome(x,y,z,r,color,sy=1){return this.add(unit.dome,x,y,z,r,r*sy,r,color);}
 roof(x,y,z,w,d,h,color){return this.add(cylinder(0,1,4),x,y+h/2,z,w*.7071,h,d*.7071,color,Math.PI/4);}
 disc(x,y,z,r,thick,color){return this.add(cylinder(1,1,20),x,y,z,r,thick,r,color,0,Math.PI/2);}
 mesh(material){
  // Everything that is not a light source is slightly desaturated, so the world stays sober.
  if(material!==glowing){const c=new T.Color(),hsl={};for(let i=0;i<this.col.length;i+=3){c.setRGB(this.col[i],this.col[i+1],this.col[i+2]);c.getHSL(hsl);c.setHSL(hsl.h,hsl.s*.72,hsl.l*.94);this.col[i]=c.r;this.col[i+1]=c.g;this.col[i+2]=c.b;}}
  // Textures tile by real size on whichever axis a face looks along.
  const uv=new Array(this.pos.length/3*2);for(let i=0;i<this.pos.length/3;i+=3){const nx=Math.abs(this.nor[i*3]),ny=Math.abs(this.nor[i*3+1]),nz=Math.abs(this.nor[i*3+2]);for(let v=i;v<i+3;v++){const x=this.pos[v*3],y=this.pos[v*3+1],z=this.pos[v*3+2];const [a,b]=ny>=nx&&ny>=nz?[x,z]:nx>=nz?[z,y]:[x,y];uv[v*2]=a/46;uv[v*2+1]=b/46;}}
  const g=new T.BufferGeometry();g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('position',new T.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(this.nor,3));g.setAttribute('color',new T.Float32BufferAttribute(this.col,3));
  const m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;if(this.fires?.length&&!this.keepFires)m.add(flameSheet(this.fires));return m;
 }
}
export const solid=new T.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.04});
export const glowing=new T.MeshBasicMaterial({vertexColors:true});

// ---- Figures ----
export const peoples={
 ranger:{h:.95,body:'#3e5a35',legs:'#3b3122',skin:'#d6ab84',hair:'#3a2717'},uruk:{h:1.12,body:'#2d2a26',legs:'#211d18',skin:'#59684a',hair:'#17140f'},orc:{h:.84,body:'#4a3a26',legs:'#2c2419',skin:'#73804e',hair:'#1b1711'},
 noldor:{h:1.08,body:'#2f638a',legs:'#1b3148',skin:'#ecd0b2',hair:'#1c1815',robe:true},galadhrim:{h:1.1,body:'#e8e8d2',legs:'#a9ae8a',skin:'#f1dcc2',hair:'#ecd98f',robe:true},numenorean:{h:1.15,body:'#274887',legs:'#14233f',skin:'#dcb793',hair:'#20181a',robe:true},
 dwarf:{h:.74,w:1.25,body:'#8a4a24',legs:'#3f2a18',skin:'#d9a97f',hair:'#b5622c'},gondor:{h:1.02,body:'#20222c',legs:'#16171e',skin:'#d9b18e',hair:'#2d2118'},hobbit:{h:.62,body:'#a97f36',legs:'#5a4a2a',skin:'#e6bd95',hair:'#6f4520'},
 dale:{h:.98,body:'#8f4a2d',legs:'#3a2a20',skin:'#d9b08c',hair:'#5b3a1e'},rohirrim:{h:1,body:'#3f6f42',legs:'#3a3222',skin:'#dfb893',hair:'#d9b65a'},wizard:{h:1.1,body:'#7f838c',legs:'#6c7079',skin:'#dcb897',hair:'#e6e6df',robe:true},
 whitewizard:{h:1.1,body:'#f1f1ea',legs:'#c9c9c2',skin:'#dcb897',hair:'#f7f7f2',robe:true},silvan:{h:1.08,body:'#3f5a2a',legs:'#2a3a1e',skin:'#ecd0b2',hair:'#a5642a',robe:true},nazgul:{h:1.16,body:'#0b0b0f',legs:'#08080c',skin:'#040406',hair:'#050507',robe:true},gollum:{h:.56,w:.72,body:'#8d8a6a',legs:'#a5a07a',skin:'#b5b08a',hair:'#3a3a2c'},
};
function toolInto(k,tool){
 // Near the hand at the top, the working end further down; a figure's hand turns the tool upright.
 const steel='#b6bcc3',wood='#6a4a22';
 if(tool==='hammer'){k.column(0,-17,0,.7,15,wood);k.box(0,-19.4,0,6.6,4.4,3.4,'#7c8086');k.box(3.2,-19,0,.6,3.6,3,steel);k.box(-3.8,-19,0,.6,3.6,3,steel);}
 else if(tool==='pick'){k.column(0,-21,0,.7,19,wood);k.limb([[-9,-23,0,.2],[-5,-21,0,.8],[0,-20.2,0,1.2],[5,-21,0,.8],[9,-23,0,.2]],steel,6);}
 else if(tool==='axe'){k.column(0,-27,0,.8,25,wood);for(const s of [-1,1]){k.limb([[s*.8,-25,0,.7],[s*3,-25,0,.5],[s*6,-25,0,.3]],'#7c8086',4);k.box(s*5.4,-29,0,1,8.4,.4,steel);k.box(s*3.2,-27.6,0,3.6,5.2,.5,steel);}k.limb([[0,-27,0,.8],[0,-30,0,.1]],steel,5);}
 else if(tool==='staff'){k.limb([[.1,-44,0,.75],[-.3,-34,.2,.6],[.3,-22,-.2,.66],[0,-10,.2,.7],[-.2,3,0,.55]],'#5a3f22',7);for(const [a,b] of [[-1.6,-1.6],[1.5,-1],[0,-2.2]])k.limb([[0,-44,0,.5],[a,-46,b*.4,.32],[a*.7,-49,b*.5,.1]],'#4a3320',4);k.ball(0,-46.4,0,1.3,'#d8ecff');}
 else if(tool==='blackstaff'){k.limb([[0,-44,0,.7],[0,-20,0,.65],[0,3,0,.55]],'#17181c',7);for(const s of [-1,1])k.limb([[0,-44,0,.5],[s*2,-48,0,.34],[s*1.2,-52,0,.08]],'#17181c',5);k.ball(0,-49.4,0,1.5,'#f4f8ff');}
 else if(tool==='sword'){k.column(0,-4.6,0,.42,3.4,'#3a2a18');k.ball(0,-1,0,.75,'#c9c9c0');k.box(0,-5.2,0,6,.8,1.1,'#a8a8a0');k.box(0,-23,0,1.4,18,.36,'#c5cbd2');k.limb([[0,-23,0,.6],[0,-26.4,0,.04]],'#c5cbd2',4);}
 else if(tool==='chisel'){k.column(0,-4.4,0,.5,3,wood);k.box(0,-10.6,0,1,6.4,.7,steel);k.box(0,-11.4,0,1.6,1,.3,'#e4e8ec');}
 else if(tool==='bow'){/* The hand closes round the middle of the stave; its belly faces the target and the string runs on the archer's side. */k.limb([[0,-1,3.2,.26],[0,-5,1.4,.42],[0,-11,.2,.56],[0,-16,0,.78],[0,-21,.2,.56],[0,-27,1.4,.42],[0,-31,3.2,.26]],'#5a3a1c',6);k.box(0,-31,3.2,.12,30,.12,'#ece9de');}
 else if(tool==='quill'){k.box(0,-11,0,.28,8,1.8,'#f4efe2');k.box(0,-4,0,.22,3.6,.22,'#2a2018');}
 else if(tool==='coin'){k.column(0,-3,0,1.7,.55,'#e4b24a');k.column(0,-3.6,.5,1.5,.55,'#d8a23a');}
 else if(tool==='book'){k.box(0,-5.6,0,7,1.5,5.6,'#5e2c1a');k.box(0,-4.3,0,6.4,.5,5,'#efe4c8');}
 else if(tool==='compass'){k.column(0,-3.6,0,2.5,.8,'#c9962d');k.column(0,-2.9,0,2,.14,'#efe4c8');k.box(0,-2.8,0,.3,.14,3.2,'#d4380f');}
 else if(tool==='sack'){k.column(0,-4,0,.7,2.4,'#6a5a3a');k.limb([[0,-5.6,0,1.1],[0,-9,0,3.4],[.3,-13,.2,4.2],[0,-17,0,3.2],[0,-19,0,.4]],'#9a8458',9);}
 else if(tool==='ladle'){k.limb([[0,-4,0,1],[0,-7,0,1.7],[0,-11,0,2.1],[0,-14,0,1.2],[0,-15,0,1.5]],'#d8d8d0',10);k.limb([[1.6,-6,0,.3],[3.2,-9,0,.3],[1.8,-13,0,.3]],'#d8d8d0',5);}
 else if(tool==='seal'){k.column(0,-5,0,.7,3,wood);k.ball(0,-2,0,1,wood);k.column(0,-6.4,0,1.6,1.5,'#b8954f');}
 else if(tool==='scale'){k.column(0,-14,0,.32,12,'#b8954f');k.box(0,-14.4,0,11,.5,.5,'#b8954f');for(const s of [-1,1]){k.column(s*5.2,-19,0,.1,4.6,'#6a5a3a');k.column(s*5.2,-19.4,0,2,.4,'#c9a23c');}}
 else if(tool==='letter'){k.box(0,-4,0,5.4,.5,3.6,'#efe4c8');k.ball(0,-3.4,0,.55,'#8f2a1a');}
 else{k.box(0,-4.6,0,5,.5,6.6,'#efe4c8');for(const s of [-1,1])k.limb([[0,-4.2,s*3.4-2.4,.75],[0,-4.2,s*3.4+2.4,.75]],'#d8cfae',6);}
}
const figureMaterial=solid;
// Feet at the origin, about 30 units tall. Legs and the working arm are separate, so they can move.
export function makeFigure(people,tool='scroll'){
 const p=peoples[people]??peoples.gondor,w=(p.w??1)*.86,root=new T.Group(),body=new T.Group();root.add(body);root.userData.body=body;body.scale.setScalar(p.h*1.25);
 const k=new Kit();
 if(p.robe)k.cyl(0,3,0,3.4,5.6,17,p.body);else k.box(0,10,0,7.6*w,10.5,4.6*w,p.body);
 k.column(-4.4*w,18.5,0,1.3,1,p.body);k.ball(-4.4*w,19,0,1.7,p.body);k.column(-4.5*w,10.5,0,1.15,8,p.body);k.ball(-4.5*w,10,0,1.3,p.skin);
 k.column(0,20,0,1.4,2,p.skin);k.ball(0,24.5,0,3.5,p.skin);
 if(people==='dwarf'){k.cone(0,12,2.2,3,10,p.hair,8);k.add(unit.box,0,17,2.2,4.4,5,1.6,p.hair);k.dome(0,25.6,0,3.8,'#8d9096');k.column(0,25.2,0,3.9,.8,'#c9962d');k.box(-4,11,2.4,8*w,1.6,.6,'#2a2015');}
 else if(people==='wizard'||people==='whitewizard'){k.add(cylinder(1,0,8),0,18.6,2.6,2.6,7,1.2,p.hair);k.column(0,27,0,6,.5,p.body);k.cone(0,27.4,0,3.6,11,p.body,10);}
 else if(people==='hobbit'){for(const [a,b,c] of [[-2.4,27.2,0],[0,28,.8],[2.4,27.2,0],[-3,25.6,-1],[3,25.6,-1],[0,27,-2]])k.ball(a,b,c,1.7,p.hair);k.box(0,10,2.5,6,8,.5,'#8f3b24');}
 else if(people==='uruk'){k.dome(0,25.4,0,3.8,'#44464a');k.ball(0,28.6,2,.8,'#f4f4ee');k.box(0,14,2.5,3,3,.5,'#f4f4ee');k.cone(-1.7,22,3,.45,2,'#f1ecd9',6);k.cone(1.7,22,3,.45,2,'#f1ecd9',6);}
 else if(people==='orc'){k.cone(-4.5,24,0,1.1,4,p.skin,6);k.cone(4.5,24,0,1.1,4,p.skin,6);k.cone(0,27,0,2.2,3.4,p.hair,6);k.cone(-1.7,22,3,.4,2,'#f1ecd9',6);k.cone(1.7,22,3,.4,2,'#f1ecd9',6);}
 else if(people==='gondor'||people==='numenorean'){k.dome(0,25.4,0,3.8,'#c9ced4');k.add(unit.box,-3.8,28,0,.5,4,2,'#eef0f2',0,0,.4);k.add(unit.box,3.8,28,0,.5,4,2,'#eef0f2',0,0,-.4);k.box(0,14,2.5,1,6,.4,'#eef0f2');k.box(0,16,2.5,4,.8,.4,'#eef0f2');}
 else if(people==='nazgul'){k.dome(0,23.5,-.3,4.3,'#07070a',1.3);k.cone(0,28,-1,3.2,5,'#07070a',8);k.ball(0,23,2.5,2.4,'#020203');}
 else if(people==='gollum'){k.ball(1.4,25,3,1.2,'#dfeef5');k.ball(-1.4,25,3,1.2,'#dfeef5');k.ball(1.4,25,4,.5,'#17120d');k.ball(-1.4,25,4,.5,'#17120d');}
 else if(people==='noldor'||people==='galadhrim'||people==='rohirrim'||people==='silvan'){k.dome(0,26.4,-.5,3.6,p.hair);k.ball(0,24.2,1.7,2.7,p.skin);k.box(0,16,-2.8,6.4,9,1.2,p.hair);k.cone(-3.8,24.6,0,.7,2.8,p.skin,6);k.cone(3.8,24.6,0,.7,2.8,p.skin,6);if(people==='rohirrim')k.box(0,10,2.5,7.8,1.2,.5,'#d9a93c');}
 else if(people==='ranger'){k.dome(0,25.2,0,3.9,'#2c4427');k.box(0,10,-2.8,7.4,11,1,'#2c4427');}
 else if(people==='dale'){k.dome(0,25.4,0,3.7,p.hair);k.column(0,27,0,4.6,.8,'#3c2a1a');k.add(unit.box,0,21.6,2.4,4,3,1.4,p.hair);}
 else k.dome(0,25.4,0,3.8,p.hair);
 // Heads shrink to human proportions; hats and helmets go with them.
 for(let i=1;i<k.pos.length;i+=3)if(k.pos[i]>20.3){k.pos[i-1]*=.74;k.pos[i+1]*=.74;k.pos[i]=20.3+(k.pos[i]-20.3)*.74;}
 const torso=k.mesh(figureMaterial);body.add(torso);
 const leg=side=>{const pivot=new T.Group();pivot.position.set(side*1.9*w,10,0);const m=new Kit();m.column(0,-10,0,1.5,10,p.legs);m.box(0,-10,1,3,1.6,5,people==='hobbit'||people==='gollum'?p.skin:'#2a2017');pivot.add(m.mesh(figureMaterial));body.add(pivot);return pivot;};
 const legs=[leg(-1),leg(1)];
 const arm=new T.Group();arm.position.set(4.6*w,19,0);{const a=new Kit();a.column(0,-9,0,1.2,9,p.body);a.ball(0,-10,0,1.4,p.skin);const hold=new Kit();hold.pos.length=0;a.pos.push(...toolPositions(tool).pos);a.nor.push(...toolPositions(tool).nor);a.col.push(...toolPositions(tool).col);arm.add(a.mesh(figureMaterial));}body.add(arm);
 const parcel=new Kit();parcel.box(0,14,-4.4,8,8,4,'#a07f4c');parcel.box(0,17.6,-4.4,8.2,.6,4.2,'#3a2c10');const pack=parcel.mesh(figureMaterial);pack.visible=false;body.add(pack);
 const pose=(phase,swing,carry)=>{legs[0].rotation.x=Math.sin(phase)*.55;legs[1].rotation.x=-Math.sin(phase)*.55;arm.rotation.x=swing;pack.visible=Boolean(carry);};
 root.userData.pose=pose;
 return root;
}
export function toolPositions(tool){const k=new Kit();toolInto(k,tool);for(let i=1;i<k.pos.length;i+=3)k.pos[i]-=10;return k;}

// ---- Workstations ----
// The worker stands at (x,z) and faces +x, so every bench is long along z and its near edge lies just in front of them.
const WOOD='#6a4a26',DARK='#3f2c18',IRON='#3a3c40',STEEL='#8d9096',BRASS='#c9962d',PAPER='#d8cfae',WAX='#8f2a1a';
function bench(k,o,z,len=26,depth=13,top=WOOD,leg=DARK){
 k.box(o,11.4,z,depth,1.6,len,top);k.box(o,9.6,z,depth-2,1.8,len-3,leg);
 for(const a of [-1,1])for(const b of [-1,1])k.box(o+a*(depth/2-1.4),0,z+b*(len/2-1.8),1.6,9.8,1.6,leg);
 k.box(o,3.4,z,1.2,1.2,len-5,leg);for(const b of [-1,1])k.box(o,3.4,z+b*(len/2-1.8),depth-3,1.2,1.2,leg);
 return 13;
}
const flame=(k,g,x,y,z,r=.9)=>{k.column(x,y,z,r*.55,2.8,'#d8cfae',6);g.lamp(x,y+3.5,z,r*.62);};
const candleOn=(k,g,x,y,z)=>{k.column(x,y,z,1.8,.4,BRASS,10);flame(k,g,x,y+.4,z);};
const sheet=(k,x,y,z,w=5,d=7,ry=.1,color=PAPER)=>k.box(x,y,z,w,.2,d,color,ry);
const lines=(k,x,y,z,w,n=4)=>{for(let i=0;i<n;i++)k.box(x+(i-(n-1)/2)*1,y,z,.25,.06,w-(i%2)*1.2,'#3a3226');};
const inkwell=(k,x,y,z)=>{k.column(x,y,z,1,1.3,'#1b1a22',8);k.column(x,y+1.3,z,.6,.4,BRASS,8);};
const feather=(k,x,y,z)=>{k.limb([[x,y+.7,z,.1],[x-1,y+3.4,z+.7,.55],[x-1.8,y+6,z+1.3,.5],[x-2.2,y+8,z+1.8,.08]],'#ece6d2',5);};
const openBook=(k,x,y,z,cover='#5e2a20',ry=0)=>{k.local(x,z,ry,()=>{k.box(0,y,0,8.6,.5,12.4,cover);for(const a of [-1,1])k.add(k.cube(),a*2.1,y+.8,0,4.1,.7,11.6,PAPER,0,0,a*.09);lines(k,-2.1,y+1.25,0,8);lines(k,2.1,y+1.25,0,8);});};
const bookPile=(k,x,y,z,n=3)=>{for(let i=0;i<n;i++)k.box(x+(i%2)*.5,y+i*1.3,z-(i%2)*.4,7-(i%3),1.3,9-(i%2),['#5e2a20','#27465e','#37562f','#6f5a22'][i%4],i*.22);};
const rolled=(k,x,y,z,len=8,ry=0,color=PAPER)=>{k.add(k.cylinder(1,1,1,8),x,y+.9,z,.9,len,.9,color,ry,Math.PI/2);for(const a of [-1,1])k.add(k.cylinder(1,1,1,8),x+Math.sin(ry)*a*len*.5,y+.9,z+Math.cos(ry)*a*len*.5,1.1,.5,1.1,'#7a6a4a',ry,Math.PI/2);};
const barrelAt=(k,x,z,h=13,r=5)=>{k.cyl(x,h*.5,z,r*.84,r,h*.5,'#55391c',12);k.cyl(x,0,z,r,r*.84,h*.5,'#55391c',12);for(const f of [.16,.78])k.column(x,h*f,z,r*1.01*(f<.5?.92:.92),.7,'#26211a',12);k.column(x,h,z,r*.8,.25,WOOD,12);};
const crateAt=(k,x,y,z,sz=10,ry=0)=>{k.box(x,y,z,sz,sz,sz,'#6a4a26',ry);k.box(x,y+sz-1,z,sz+.3,1,sz+.3,DARK,ry);k.box(x,y,z,sz+.3,1,sz+.3,DARK,ry);k.box(x,y,z,1,sz,sz+.3,DARK,ry);};
const sackAt=(k,x,y,z,r=5,color='#a07f4c')=>{k.limb([[x,y+r*.1,z,r*.7],[x,y+r*.8,z,r],[x,y+r*1.6,z,r*.72],[x,y+r*2.1,z,r*.22],[x,y+r*2.5,z,r*.3]],color,10);k.column(x,y+r*2.1,z,r*.26,.5,'#3a2c10',6);};
export function stationInto(k,tool,x,z,g=k){
 const o=x+15;
 if(tool==='hammer'){
  // Anvil on its block, coals and bellows beside it, the quenching tub and the tongs.
  k.cyl(o,0,z,6.4,7.4,8,'#4a3219',10);k.box(o,8,z,4,3.6,8,IRON);k.box(o,11.6,z,6,2.4,12,'#2f3134');k.limb([[o,12.8,z+6,1.5],[o,12.9,z+9,1],[o,13.2,z+12,.15]],'#2f3134',8);g.box(o,14.1,z-1,1.1,.6,6,'#ff9a3a');
  k.column(o+2,0,z+17,6.6,6,'#26241f',12);k.column(o+2,6,z+17,7,.8,IRON,12);g.column(o+2,6.3,z+17,5.4,.7,'#ff6a1a',12);g.ball(o+1,7.6,z+18,1.8,'#ffc23a',.5);g.ball(o+4,7.5,z+15.5,1.5,'#ffb23a',.5);
  k.limb([[o+8,9,z+22,1],[o+9,9,z+24,5],[o+9.5,9,z+27,5.4],[o+10,9,z+30,1.2]],'#55391c',10);
  k.column(o+2,0,z-17,6,7,'#55391c',12);k.column(o+2,7,z-17,5.2,.2,'#27465e',12);
  for(const a of [-1,1])k.box(o+7,10,z-5+a*1.6,.5,.5,14,IRON,a*.05);
 }else if(tool==='pick'){
  // Heap of broken ore with veins of gold, and the handcart that takes it away.
  k.rock(o,4,z,11,8,11,'#55524a',3);k.rock(o+6,3,z+7,7,5,7,'#4c4a44',1);k.rock(o+3,10,z-3,5,4,5,'#605d55',2);k.rock(o-4,2,z+9,3.4,2.6,3.4,'#66625a',4);k.rock(o-5,2,z-8,3,2.4,3,'#5a564e',5);
  for(const [a,b,c] of [[-4,9,7],[5,8,8],[0,13,4],[7,6,-3],[-6,6,-6]])g.ball(o+a,b,z+c,.75,'#e4b24a');
  k.local(o+4,z-17,0,()=>{k.box(0,5,0,12,5,15,'#3f2c18');k.box(0,4,0,12.6,1,15.6,IRON);k.rock(0,10,0,5,3,6,'#66625a',1);for(const a of [-1,1])k.add(k.torus(3.4,.5),a*6.8,3.4,0,1,1,1,IRON,Math.PI/2);});
  k.limb([[o-8,0,z-8,.55],[o-7,10,z-9,.55],[o-6,19,z-10,.55]],WOOD,6);k.box(o-6,18,z-10,.9,1.2,11,STEEL);
 }else if(tool==='sack'){
  // Stacked sacks, crates and a coil of rope: the stock waiting to be carried.
  sackAt(k,o-1,0,z-3,5.4);sackAt(k,o+6,0,z+3,4.8,'#8f7040');sackAt(k,o+1,0,z+9,5,'#97794a');sackAt(k,o+3.5,9.5,z+2,3.8,'#a58a54');
  crateAt(k,o+4,0,z-14,12,.15);crateAt(k,o+4.6,12,z-14.6,8,.5);k.add(k.torus(3.4,.8),o-3,1,z-13,1,1,1,'#8a7446',0,Math.PI/2);k.add(k.torus(2.8,.8),o-3,2.4,z-13,1,1,1,'#8a7446',0,Math.PI/2);
  k.box(o-2,0,z+18,8,.9,12,WOOD);sheet(k,o-2,.95,z+18,5,7,.2);
 }else if(tool==='letter'){
  // Post table in front of a rack of pigeon-holes.
  const y=bench(k,o,z,28,12);k.box(o+8.5,0,z,5,31,28,'#55391c');for(let r=0;r<4;r++)for(let c=0;c<6;c++){k.box(o+5.8,6+r*6.2,z-11+c*4.4,.5,5,3.7,'#20160c');if((r*5+c*3)%3)k.box(o+5.6,6.8+r*6.2,z-11+c*4.4,.3,3,3,PAPER);}
  for(let i=0;i<4;i++)sheet(k,o-2+(i%2),y+i*.22,z-6,6,4.4,i*.12,'#e4dcc4');k.column(o-1,y+.7,z-6,.8,.2,WAX,8);bookPile(k,o+1,y,z+7,2);sheet(k,o-2,y,z+1,5,6.4,-.1);feather(k,o+2,y,z+1);inkwell(k,o+3,y,z-1);
 }else if(tool==='bow'){
  // A straw butt on its stand with arrows in it, and a quiver leaning on a post.
  for(const a of [-1,1])k.limb([[o+6,0,z+a*7,.8],[o+4,10,z+a*3,.7],[o+3,17,z,.6]],WOOD,6);k.limb([[o+11,0,z,.8],[o+7,9,z,.7],[o+3,17,z,.6]],WOOD,6);
  const f=(r,d,c,y=14)=>k.add(k.cylinder(1,1,1,20),o+d,y,z,r,1,r,c,0,0,Math.PI/2);f(9,3.6,'#b89a5a');f(7.6,2.9,'#e8dfc4');f(5,2.7,'#27465e');f(2.6,2.5,'#8f2a1a');
  for(const [a,b,c] of [[1,16,.14],[-3,12,-.1],[3,11,.2]]){k.add(k.cylinder(.16,.16,1,5),o-3,b,z+a,1,9,1,'#6a4a22',0,0,Math.PI/2+c);k.box(o-7.4,b+c*-4.4-.4,z+a,1.4,.8,.2,'#d8d8d0');}
  k.column(o-1,0,z-13,.8,18,WOOD,6);k.limb([[o+.8,2,z-13,1.5],[o+.8,10,z-13,1.9],[o+.8,14,z-13,2]],'#5e4322',8);for(let i=0;i<5;i++)k.box(o+.2+(i%2),14,z-14+i*.5,.2,5,.2,'#6a4a22');
 }else if(tool==='staff'){
  // The star plinth of the wise: stone steps, a slender pillar and a burning crystal in its claws.
  k.column(o,0,z,9.6,1.8,'#a9a692',16);k.column(o,1.8,z,7.4,1.8,'#c9c5b6',16);k.cyl(o,3.6,z,2.4,4.4,11,'#e7e3d2',12);k.cyl(o,14.6,z,4.2,2.4,2,'#c9c5b6',12);for(let i=0;i<4;i++){const a=i*1.57+.78;k.limb([[o+Math.cos(a)*3.4,16.5,z+Math.sin(a)*3.4,.5],[o+Math.cos(a)*4,19,z+Math.sin(a)*4,.34],[o+Math.cos(a)*2.6,22,z+Math.sin(a)*2.6,.08]],BRASS,5);}
  g.add(k.octa(3),o,20,z,1,1.4,1,'#8ce0ff',.4);g.ball(o,20,z,1.3,'#e8f8ff');
  for(let i=0;i<8;i++){const a=i*.785;k.box(o+Math.cos(a)*8.6,1.86,z+Math.sin(a)*8.6,1.6,.1,.5,BRASS,-a);}
 }else if(tool==='ladle'){
  // Carved basin on a stem, with a silver ewer on the step: a mirror of still water.
  k.column(o,0,z,8,1.4,'#c9c9b8',16);k.cyl(o,1.4,z,3,5,8,'#d8d4c2',14);k.cyl(o,9.4,z,9.8,3.6,3,'#d8d4c2',20);k.column(o,12.4,z,10.2,.7,'#e7e3d2',20);g.column(o,12.8,z,8.8,.3,'#7cd0ea',20);g.column(o,13.05,z,5,.1,'#d7f4ff',16);
  for(let i=0;i<10;i++){const a=i*.628;k.box(o+Math.cos(a)*7.4,4.6,z+Math.sin(a)*7.4,.5,3.4,1.2,'#b5b7a6',-a);}
  k.limb([[o-6,1.4,z+12,1.5],[o-6,3,z+12,2.2],[o-6,6,z+12,1.2],[o-6,8,z+12,1.5]],'#c9ced4',10);k.add(k.torus(1.7,.25),o-3.9,5,z+12,1,1,1,'#c9ced4');
 }else if(tool==='sword'){
  // Weapon rack with blades held upright, shields and a whetstone.
  for(const a of [-1,1])k.box(o+4,0,z+a*13,2,24,2,DARK);k.box(o+4,5,z,1.4,1.6,28,WOOD);k.box(o+4,22,z,2,1.8,28,WOOD);
  for(let i=0;i<5;i++){const c=z-10+i*5;k.box(o+3,5,c,.35,17,1.1,'#c5cbd2');k.box(o+3,22.5,c,.8,.8,3.8,BRASS);k.box(o+3,23.3,c,.7,3.6,.7,'#3a2a18');k.ball(o+3,27.2,c,.7,BRASS);}
  k.add(k.cylinder(1,1,1,16),o+1,8,z-19,6,.8,6,'#2c2e38',0,.15,Math.PI/2);k.ball(o+.4,8,z-19,1.5,'#c9ced4',.5);
  k.cyl(o,0,z+19,3.4,4.6,8,WOOD,8);k.add(k.cylinder(3,3,2,14),o,10,z+19,1,1,1,'#7c7f84',0,Math.PI/2);
 }else if(tool==='scale'){
  // Testing table: a great brass balance, its weights and the report beside it.
  const y=bench(k,o,z,28,13,'#d8d4c2','#a7a496');k.column(o,y,z,3.4,.8,BRASS,12);k.column(o,y+.8,z,.6,13,BRASS,8);k.ball(o,y+14,z,1,BRASS);k.add(k.cube(),o,y+14,z,.7,.7,20,BRASS,0,.07,0);
  for(const [a,dy] of [[-9.6,-.7],[9.6,.7]]){k.column(o,y+6+dy,z+a,3.6,.3,BRASS,12);for(let i=0;i<3;i++){const t=i*2.09;k.add(k.cube(),o+Math.cos(t)*1.7,y+10+dy,z+a+Math.sin(t)*1.7,.14,8,.14,'#8a6a24');}}
  k.ball(o,y+7.2-.7,z-9.6,1.2,'#7a1a12');for(let i=0;i<3;i++)k.column(o+2,y+6.6+.7+i*.5,z+9.6,1.5-i*.3,.5,'#54565a',8);
  for(let i=0;i<4;i++)k.column(o+3.6,y,z-3+i*2.5,.6+i*.15,.5+i*.3,'#54565a',8);sheet(k,o-3,y,z+1,5,7,.05);lines(k,o-3,y+.25,z+1,6);
 }else if(tool==='coin'){
  // Counting table: stacks of coin, an open coffer, the ledger and a candle to work by.
  const y=bench(k,o,z,30,14);for(const [a,b,n] of [[-3,-11,6],[1,-11,4],[-1,-8,8],[3,-7,3],[-4,-6,5]])for(let i=0;i<n;i++)k.column(o+a,y+i*.42,z+b,1.5,.4,i%3?'#d0a03a':'#e0b84e',8);
  k.local(o+3,z+9,0,()=>{k.box(0,y,0,9,4.4,11,'#55351a');for(const a of [-4,4])k.box(0,y,a,9.2,4.6,.8,'#7a6a4a');k.box(0,y+3.9,0,8,.5,10,'#c9962d');for(let i=0;i<9;i++)k.column(-3+(i%3)*3,y+4.3,-3.4+Math.floor(i/3)*3.4,1.3,.3,'#ffdc7a',8);k.add(k.cube(),4.8,y+7.6,0,1,7,11,'#603c1e',0,0,-.32);});
  openBook(k,o-3,y,z+1,'#3a2a1c');candleOn(k,g,o+4,y,z-2);k.limb([[o-1,y+.6,z+5,.2],[o-3,y+1,z+7,.1]],'#26211a',4);
  barrelAt(k,o+1,z-22,12,4.6);
 }else if(tool==='seal'){
  // The seal of approval: sealed documents, wax over a flame, the signet on its block.
  const y=bench(k,o,z,28,14,'#55391c','#26211a');k.box(o,y,z,10,.2,20,'#15161d');sheet(k,o-1,y+.2,z-3,6,8,.05,'#efe9d6');lines(k,o-1,y+.45,z-3,7);k.column(o-1,y+.4,z-.4,1.4,.25,WAX,10);
  k.box(o+3,y+.2,z+7,5,2,5,'#3a2a1c');k.column(o+3,y+2.2,z+7,1.4,.5,BRASS,10);k.limb([[o+3,y+2.7,z+7,.5],[o+3,y+4.6,z+7,.42],[o+3,y+5.6,z+7,.8]],'#c9962d',6);
  k.column(o+3,y,z-9,1.8,.4,'#26211a',8);for(const a of [-1,1])k.box(o+3+a*1.2,y+.4,z-9,.2,3,.2,'#26211a');k.column(o+3,y+3.4,z-9,1.4,.7,IRON,8);g.lamp(o+3,y+1.6,z-9,.7);k.limb([[o+4.5,y+4.5,z-9,.3],[o+7,y+6,z-9,.2]],'#3a2a18',4);
  for(let i=0;i<3;i++){rolled(k,o-4,y+i*.9,z+9+i*1.5,9,.05,'#efe9d6');k.column(o-4,y+1+i*.9,z+9+i*1.5,.9,.2,WAX,8);}candleOn(k,g,o+4,y,z+1);
 }else if(tool==='compass'){
  // The map table: a chart held down at its corners, routes in ink, dividers and pins.
  const y=bench(k,o,z,32,18,'#55391c');k.box(o,y,z,15,.25,28,'#c9b98c');k.box(o,y-.05,z,15.8,.2,28.8,'#7a6a4a');
  for(const [a,b,c] of [[-3,-6,.4],[2,1,-.5],[-1,7,.7],[4,-8,.1]])k.box(o+a,y+.28,z+b,.3,.05,8,'#4f7f9b',c);for(const [a,b,c] of [[-5,-9,'#b52d12'],[3,3,'#b52d12'],[-2,9,'#27465e'],[5,-3,'#2f6a3a']]){k.column(o+a,y+.28,z+b,.12,1.8,'#26211a',4);k.ball(o+a,y+2.2,z+b,.55,c);}
  for(const [a,b] of [[-6.6,-13],[6.6,-13],[-6.6,13],[6.6,13]])k.column(o+a,y+.28,z+b,1.1,1,'#54565a',8);
  k.add(k.cube(),o+1,y+.5,z-4,.28,.28,8,BRASS,.4,0,0);k.add(k.cube(),o-.8,y+.5,z-4,.28,.28,8,BRASS,-.4,0,0);k.column(o+6,y,z+9,1.3,3.6,'#3a3226',8);g.lamp(o+6,y+5,z+9,.9);k.cone(o+6,y+5.8,z+9,1.5,1.2,'#26211a',8);
 }else if(tool==='book'){
  // A carved lectern with an open book, more volumes beside it and a candle.
  k.column(o,0,z,5.4,1.2,DARK,10);k.cyl(o,1.2,z,1.4,2.4,12,WOOD,8);k.add(k.cube(),o,15.6,z,10,1,14,DARK,0,0,.38);k.local(o-.4,z,0,()=>{for(const a of [-1,1])k.add(k.cube(),0,16.9,a*3,8,.7,5.6,PAPER,0,a*.06,.38);});k.add(k.cube(),o+3.8,14,z,.8,1.6,13,DARK,0,0,.38);
  for(const a of [-1,1])for(let i=0;i<4;i++)k.add(k.cube(),o+(i-1.5)*1.4,16.9+(1.5-i)*.56+.42,z+a*3,.2,.06,4.8,'#3a3226',0,0,.38);
  crateAt(k,o+2,0,z+14,9);bookPile(k,o+2,9,z+14,4);bookPile(k,o+2,0,z-14,5);k.column(o+2,0,z-22,3,.6,DARK,8);k.column(o+2,.6,z-22,.6,18,BRASS,6);k.column(o+2,18.6,z-22,1.8,.3,BRASS,8);flame(k,g,o+2,18.9,z-22);
 }else if(tool==='chisel'){
  // Workbench: a blank in the vice, tools on the wall board, shavings on the floor.
  const y=bench(k,o,z,30,13,'#7a5a30');k.box(o+8,0,z,2,27,30,DARK);
  for(let i=0;i<6;i++){const c=z-12+i*5;k.box(o+6.8,17,c,.4,6+(i%3)*1.6,.9,i%2?STEEL:WOOD);k.box(o+6.8,22+(i%3),c,.6,2.4,1.5,i%2?WOOD:STEEL);}
  k.box(o-1,y,z-8,4,3.4,2.4,IRON);k.box(o-1,y+.8,z-5.4,3,1.8,3.2,IRON);k.box(o-1,y+1,z-1,8,5,6,'#8d8775',.08);k.box(o-1,y+6,z-1,6,.5,4,'#a59f8d',.08);
  k.limb([[o-3,y+.5,z+7,.4],[o+1,y+.5,z+9,.4]],WOOD,5);k.box(o+2,y+.2,z+9.6,2.4,.5,.9,STEEL,.45);
  for(let i=0;i<9;i++){const a=i*2.4,r=3+(i%3)*2.6;k.box(o-9+Math.cos(a)*r,.05,z+Math.sin(a)*r,1.4,.15,.7,'#8d8775',a);}
 }else if(tool==='quill'){
  // A sloped writing desk: inkwell, quill, a page half written and finished pages drying.
  for(const a of [-1,1])k.box(o,0,z+a*10,10,12,1.6,DARK);k.box(o+3,5,z,1.2,1.2,20,DARK);k.add(k.cube(),o,14,z,14,1.4,25,WOOD,0,0,.22);k.add(k.cube(),o+.4,15,z-1,8,.2,11,PAPER,0,0,.22);
  for(let i=0;i<5;i++)k.add(k.cube(),o+(i-2)*1.3,15.2+(2-i)*.3,z-1,.24,.05,9,'#3a3226',0,0,.22);k.box(o-6,12.8,z,1.1,1.2,24,DARK);k.box(o+5.4,16,z,5,.7,25,DARK);inkwell(k,o+5.4,16.7,z+8);feather(k,o+5.4,16.7,z+8);bookPile(k,o+5.4,16.7,z-8,2);
  for(let i=0;i<3;i++){k.column(o+11,0,z-9+i*9,.35,16,DARK,5);}k.box(o+11,16,z,.5,.5,20,'#7a6a4a');for(let i=0;i<4;i++)k.box(o+11,12,z-7+i*4.6,.15,4,3.6,'#e4dcc4');
 }else{
  // The file desk: rolled records in their rack, one spread out and held open.
  const y=bench(k,o,z,28,13);k.box(o+7,0,z,1.6,26,28,DARK);for(let r=0;r<3;r++){k.box(o+5.4,13+r*4.6,z,3,.6,28,DARK);for(let i=0;i<7;i++)rolled(k,o+5.4,13.6+r*4.6,z-10.5+i*3.4,3.4,Math.PI/2,i%3?PAPER:'#c9b98c');}
  sheet(k,o-1.6,y,z+1,7,12,.03,'#e4dcc4');lines(k,o-1.6,y+.25,z+1,10,5);for(const a of [-5,6])k.column(o-1.6,y+.2,z+a,1,1,'#54565a',8);rolled(k,o+1.6,y,z-9.5,7,.1);rolled(k,o-2.4,y,z-10,7,-.1,'#c9b98c');candleOn(k,g,o-3,y,z+11);
 }
}

// ---- Halls ----

// Everything belonging to one district. Walls and roof lift away separately; close details appear only near the camera.
const ELVEN=new Set(['library','lorien']);
export function buildDistrict(id,crew,art){
 const group=new T.Group(),inside=new Kit(),light=new Kit(),out=new Kit(),near=new Kit(),nearLight=new Kit(),fx={smoke:[],embers:[],spray:[],leaves:[]};
 light.keepFires=nearLight.keepFires=true;light.elven=nearLight.elven=ELVEN.has(id);
 inside.lights=light;art.interiors[id](inside,light);inside.lights=null;
 for(const m of crew){const q=crewPoint(m);stationInto(inside,m.tool,q.x,q.z,light);}
 const grid=art.walkGrid(inside.pos,(x,z)=>art.floor(id,x,z)),flowing=new Kit();
 out.ground=near.ground=nearLight.ground=light.ground=art.ground;out.water=near.water=nearLight.water=light.water=flowing;
 art.footing(id,out);
 out.lights=light;art.landmarks[id](out,light,fx);out.lights=null;
 near.lights=nearLight;art.closeDetails[id](near,nearLight);near.lights=null;
 const lit=k=>{const m=k.mesh(glowing);m.castShadow=false;m.receiveShadow=false;return m;};const roomGlow=glowing.clone();art.cutaway(roomGlow);
 const mats=art.materials[id];const interior=inside.mesh(mats.inside);group.add(interior);const glow=light.pos.length?lit(light):null;if(glow){glow.material=roomGlow;group.add(glow);}const outside=out.mesh(mats.outside);group.add(outside);
 const closeMesh=new T.Group();closeMesh.add(near.mesh(mats.outside));if(nearLight.pos.length)closeMesh.add(lit(nearLight));group.add(closeMesh);
 const wallKit=(build,base=mats.wall)=>{const k=new Kit();build(k);const material=base.clone();material.onBeforeCompile=base.onBeforeCompile;material.customProgramCacheKey=base.customProgramCacheKey;material.transparent=true;material.alphaTest=.02;const m=k.mesh(material);group.add(m);return m;};
 const walls=art.buildWalls(id,build=>wallKit(build)).map(w=>({mesh:w.mesh,normal:new T.Vector3(w.normal[0],0,w.normal[1])}));
 const portal=new Kit();portal.keepFires=true;portal.elven=light.elven;const roof=wallKit(k=>{k.lights=portal;art.roofs[id](k,portal);k.lights=null;},mats.roof),portalGlow=glowing.clone();portalGlow.transparent=true;art.cutaway(portalGlow);const portalMesh=portal.pos.length?portal.mesh(portalGlow):null;if(portalMesh){portalMesh.castShadow=false;portalMesh.receiveShadow=false;roof.add(portalMesh);}
 out.water=near.water=nearLight.water=light.water=null;if(flowing.pos.length){const m=flowing.mesh(art.flow());m.castShadow=false;m.receiveShadow=false;group.add(m);}
 const props=new T.Group();props.visible=false;group.add(props);
 {const spots=[...(light.fires??[]),...(nearLight.fires??[]),...(portal.fires??[])];if(spots.length)group.add(flameSheet(spots));}
 return {grid,group,walls,roof,portalGlow:portalMesh?portalGlow:null,closeMesh,props,outside,interior,glow,fx};
}

// ---- Barad-dûr ----
// The Dark Tower: a rock foundation, a spiked curtain wall, four buttressed tiers and the iron fork that holds the eye.
export function buildHub(material=solid,shellMaterial=material,shellGlow=glowing){
 const group=new T.Group(),k=new Kit(),g=new Kit(),shell=new Kit(),shellLit=new Kit(),black='#6a5f56',dark='#564c44',iron='#3a332e';
 k.crag(0,0,-26,205,40,150,'#5e544a',1);k.add(unit.box,0,4.2,173,32,1.4,68,'#3a332e',0,.125);for(const s of [-1,1])k.add(unit.box,s*15.5,5.4,173,1.6,3,68,'#26211e',0,.125);
 for(const [x,z,sx,sy,seed] of [[-130,-90,70,46,2],[130,-96,74,52,3],[-150,40,54,32,1],[152,36,56,34,2]])k.crag(x,0,z,sx,sy,sx,'#544a41',seed);
 // The curtain wall, open only towards the road from the south.
 const R=142,N=22;
 for(let i=0;i<N;i++){
  const a=(i+.5)/N*6.2832,x=Math.sin(a)*R,z=Math.cos(a)*R;
  if(Math.abs(a-Math.PI*2)<.24||a<.24)continue;
  k.box(x,8,z,2*R*Math.sin(Math.PI/N)+2,30,11,dark,a);
  for(const s of [-1,0,1])k.box(x+Math.cos(a)*s*12,38,z-Math.sin(a)*s*12,6,6,12,black,a);
  if(i%3===1){k.cyl(x,8,z,9,13,62,black,10);k.cyl(x,70,z,12,9,6,dark,10);for(let c=0;c<8;c++){const t=c/8*6.2832;k.cone(x+Math.cos(t)*11,76,z+Math.sin(t)*11,1.6,6+(c%2)*7,iron,4);}k.cone(x,76,z,5,20,iron,6);}
  if(i%2===0)g.box(Math.sin(a)*(R+5.8),22,Math.cos(a)*(R+5.8),1.2,5,.5,'#ff7a2a',a);
 }
 // The gate.
 for(const s of [-1,1]){const gz=Math.cos(.24)*R;k.cyl(s*30,6,gz,11,17,80,black,10);k.cyl(s*30,86,gz,14,11,7,dark,10);for(let c=0;c<8;c++){const t=c/8*6.2832;k.cone(s*30+Math.cos(t)*13,93,gz+Math.sin(t)*13,1.8,7+(c%2)*9,iron,4);}k.cone(s*30,93,gz,6,26,iron,6);}
 k.box(0,48,Math.cos(.24)*R,50,14,14,dark);k.box(0,44,Math.cos(.24)*R+4,44,4,3,iron);
 // The tower as in the film: a broad fortress of thin gothic piers at the foot, rock clinging to it, then one tall slim shaft of ribs and collars, widening at the head into two smooth prongs that hold the Eye.
 const edge='#857a6f',pale='#6f655c';const pier=(y,h,r0,r1,ribs,shade,turn=0)=>{ribs=Math.round(ribs*1.7);shell.cyl(0,y,0,r1,r0,h,'#2f2a26',24);const wide0=r0*6.2832/ribs;for(let i=0;i<ribs;i++){const a=(i+turn)/ribs*6.2832,c=Math.cos(a),n=Math.sin(a),big=i%3===0,r=(r0+r1)/2,tall=h*(big?1.05:.46+((i*7)%6)*.1),wide=big?wide0*.62:wide0*.42,out=r0-r1+(big?6:3.4);shell.box(c*r,y,n*r,out,tall,wide,big?shade:[iron,pale,black][i%3],-a);if(big){shell.box(c*(r+out*.5),y,n*(r+out*.5),.8,tall,wide*.34,edge,-a);shell.cone(c*(r+1),y+tall,n*(r+1),wide*.62,8+(i%2)*6,iron,4);for(const f of [.33,.66])shell.box(c*(r+out*.42),y+h*f,n*(r+out*.42),1.8,1.4,wide*1.1,edge,-a);}else shell.cone(c*r,y+tall,n*r,wide*.6,4+(i%4)*2.4,iron,4);if(i%4===1)for(const f of [.3,.68]){const q=r0+(r1-r0)*f+1.2,b=a+3.1416/ribs;shellLit.box(Math.cos(b)*q,y+h*f,Math.sin(b)*q,.9,4.6,.9,f<.5?'#ff6a1a':'#ff9a3a',-b);}}};
 const collar=(y,r,n)=>{shell.cyl(0,y-3,0,r+5,r,4,iron,24);shell.column(0,y+1,0,r+5.4,1.5,pale,24);for(let i=0;i<n;i++){const a=i/n*6.2832,c=Math.cos(a),q=Math.sin(a),o=r+4.4;shell.cone(c*o,y+2.5,q*o,1.3,3.5+(i%3)*3,iron,4);shell.add(k.cylinder(1.1,0,4+(i%2)*4,4),c*o,y-5,q*o,1,1,1,iron);}};
 // The fortress: two stages of piers behind the curtain wall.
 pier(26,84,106,92,46,black);collar(110,92,40);pier(110,70,88,72,40,dark,.5);collar(180,72,34);pier(180,52,68,47,30,black);
 // The rock of Gorgoroth climbs its flanks, highest at the front on the west side.
 const stone='#403a35';for(const [x,y,z,sx,sy,sz,seed] of [[-34,196,48,40,92,28,1],[-66,142,34,42,66,40,3],[52,160,40,36,54,32,2],[74,104,8,38,48,44,1],[-20,250,34,20,44,16,2],[-82,92,-30,34,48,44,2]])shell.crag(x,y,z,sx,sy,sz,stone,seed);
 // The two thin towers with iron crowns that stand either side of the shaft.
 for(const s of [-1,1]){const x=s*98,z=-16;shell.cyl(x,26,z,8,12,216,black,10);for(const y of [96,160,206])shell.column(x,y,z,11-(y-96)*.02,1.6,iron,10);shell.cyl(x,242,z,12,8.4,12,dark,10);shell.column(x,254,z,12.6,1.5,iron,10);for(let i=0;i<8;i++){const a=i/8*6.2832;shell.cone(x+Math.cos(a)*11,255,z+Math.sin(a)*11,1.8,7+(i%2)*9,iron,4);}shell.cone(x,254,z,6,26,iron,6);for(const y of [120,180])shellLit.box(x,y,z+11,1,5,1,'#ff7a2a');}
 // The shaft, nearly straight, in five storeys.
 pier(232,80,47,42.5,28,dark);collar(312,42.5,28);pier(312,84,42,38,26,black,.5);collar(396,38,26);pier(396,62,37.5,35,24,dark);collar(458,35,24);pier(458,48,34.5,32,22,black,.5);collar(506,32,22);
 // The head flares out in curved ribs like organ pipes.
 shell.cyl(0,506,0,39,31.5,50,dark,20);for(let i=0;i<22;i++){const a=i/22*6.2832,c=Math.cos(a),n=Math.sin(a);shell.limb([[c*32,508,n*32,1.5],[c*36,530,n*36,1.4],[c*40.5,552,n*40.5,1],[c*43,562,n*43,.3]],i%2?iron:black,4);}
 shell.column(0,556,0,41,3,iron,22);for(let i=0;i<22;i++){const a=(i+.5)/22*6.2832;shell.cone(Math.cos(a)*40,559,Math.sin(a)*40,1.6,5+(i%3)*5,iron,4);}
 // Spires at the shoulders of the head, then the prongs: pale, smooth, bending out and back towards the Eye.
 k.cyl(0,558,0,17,27,10,iron,14);
 for(const s of [-1,1]){for(const [z,top,o] of [[0,590,42],[-15,580,38],[15,580,38]])k.limb([[s*o,556,z,3.2],[s*(o+1),570,z,2],[s*(o+2),top-8,z,.9],[s*(o+2.4),top,z,.12]],iron,5);
  k.limb([[s*15,556,0,10],[s*20,574,0,8.6],[s*28,596,0,5.8],[s*31,616,0,3],[s*29,632,0,.4]],'#8b8682',14);
  }
 k.box(0,26,92,44,70,26,dark);for(const s of [-1,0,1])k.cone(s*16,96,104,3.4,s?20:30,iron,4);for(let i=0;i<9;i++)k.box(-20+i*5,26,105.2,1.8,62+(i%2)*6,1.8,i%2?iron:black);g.box(0,26,105.6,11,20,.6,'#ff4a12');g.box(0,26,105.9,6,12,.4,'#ffa23a');
 for(let i=0;i<8;i++){const a=i/8*6.283;k.column(Math.cos(a)*116,20,Math.sin(a)*116,4,6,iron,8);g.cone(Math.cos(a)*116,26,Math.sin(a)*116,4,10,'#ff8a2a',8);}
 group.add(k.mesh(material));const lit=g.mesh(glowing);lit.castShadow=false;lit.receiveShadow=false;group.add(lit);
 group.add(shell.mesh(shellMaterial));const shellGlowing=shellLit.mesh(shellGlow);shellGlowing.castShadow=false;shellGlowing.receiveShadow=false;group.add(shellGlowing);
 return group;
}
// The eye is a camera-facing picture, so it always looks at the founder.
export function eyeSprites(){
 const make=(draw,size=1024)=>{const n=document.createElement('canvas');n.width=size;n.height=size;draw(n.getContext('2d'),size);const t=new T.CanvasTexture(n);t.colorSpace=T.SRGBColorSpace;return t;};
 const almond=(c,s,w,h)=>{c.beginPath();c.moveTo(s/2-w,s/2);c.quadraticCurveTo(s/2,s/2-h,s/2+w,s/2);c.quadraticCurveTo(s/2,s/2+h,s/2-w,s/2);c.closePath();};
 // Tongues of fire licking outward from the rim of the eye; fixed seed, so the eye is the same on every load.
 const tongues=(c,s,count,seed,reach,tones)=>{let q=seed;const rnd=()=>(q=(q*16807)%2147483647)/2147483647;c.globalCompositeOperation='lighter';c.lineCap='round';for(let i=0;i<count;i++){const a=rnd()*6.2832,rimX=Math.cos(a)*s*.33,rimY=Math.sin(a)*s*.33*(.42+.3*Math.abs(Math.cos(a))),len=s*reach*(.25+rnd()*rnd()*1.1)*(1-.45*Math.abs(Math.sin(a))),bend=(rnd()-.5)*s*.09,x0=s/2+rimX,y0=s/2+rimY,x1=x0+Math.cos(a)*len,y1=y0+Math.sin(a)*len-len*.18,g=c.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,tones[Math.floor(rnd()*tones.length)]);g.addColorStop(1,'#a0200000');c.strokeStyle=g;c.lineWidth=2+rnd()*s*.012;c.beginPath();c.moveTo(x0,y0);c.quadraticCurveTo((x0+x1)/2+bend,(y0+y1)/2-bend,x1,y1);c.stroke();}c.globalCompositeOperation='source-over';};
 const closed=make((c,s)=>{
  const f=c.createRadialGradient(s/2,s/2,s*.08,s/2,s/2,s/2);f.addColorStop(0,'#b0400c77');f.addColorStop(.55,'#70200622');f.addColorStop(1,'#70200600');c.fillStyle=f;c.fillRect(0,0,s,s);
  tongues(c,s,150,881,.12,['#d0601a88','#a0360c77']);
  // Two heavy lids of cooled slag; only the seam and its cracks still glow.
  almond(c,s,s*.34,s*.22);const g=c.createLinearGradient(0,s*.28,0,s*.72);g.addColorStop(0,'#38231a');g.addColorStop(.5,'#180d09');g.addColorStop(1,'#2e1c14');c.fillStyle=g;c.fill();c.strokeStyle='#120806';c.lineWidth=s*.012;c.stroke();
  c.save();almond(c,s,s*.34,s*.22);c.clip();let q=311;const rnd=()=>(q=(q*16807)%2147483647)/2147483647;for(let i=0;i<46;i++){let x=s*(.2+rnd()*.6),y=s/2+(rnd()-.5)*s*.3;c.strokeStyle=i%3?'#ff7a2055':'#ffb04a77';c.lineWidth=1+rnd()*2.2;c.beginPath();c.moveTo(x,y);for(let k=0;k<5;k++){x+=(rnd()-.5)*s*.05;y+=(rnd()-.5)*s*.035;c.lineTo(x,y);}c.stroke();}c.restore();
  c.lineCap='round';c.strokeStyle='#ff5a14';c.lineWidth=s*.022;c.beginPath();c.moveTo(s*.17,s*.5);c.quadraticCurveTo(s*.5,s*.54,s*.83,s*.5);c.stroke();c.strokeStyle='#ffd27a';c.lineWidth=s*.007;c.stroke();
 });
 // Awake it is living fire: a pointed almond of molten fibres streaming away from a thin black slit, its edge torn into flames.
 const fire=new T.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{time:{value:0},look:{value:0}},vertexShader:`varying vec2 vP;void main(){vP=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vP;uniform float time;uniform float look;
  float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+vec3(11.);a*=.5;}return s;}
  void main(){
   vec2 p=vP;
   float rho=(abs(p.y)+sqrt(p.y*p.y+1.44*p.x*p.x))/.72;
   vec2 dir=normalize(p+vec2(1e-4));
   vec3 q=vec3(dir*2.3,rho*1.7-time*.26);
   float flow=fbm(q+fbm(q*1.7+3.)*.9);
   float vein=1.-abs(2.*fbm(vec3(dir*8.5,rho*1.2-time*.18))-1.);
   float crack=1.-abs(2.*fbm(vec3(dir*19.,rho*2.6-time*.3)+flow)-1.);
   float heat=mix(.84,.4,smoothstep(0.,1.05,rho))*(.42+.95*flow)+.26*pow(crack,7.)-(1.-pow(vein,1.6))*.36;
   float reach=1.03+.62*pow(fbm(vec3(dir*5.5,rho*2.2-time*.8)),1.5)*(.6+.4*abs(dir.x));
   float alpha=1.-smoothstep(reach-.3,reach,rho);
   heat*=1.-.72*smoothstep(.86,reach+.1,rho);
   float sx=p.x-look+sin(p.y*22.+time*1.4)*.004,ky=clamp(abs(p.y)/.31,0.,1.),gap=abs(sx)-.036*(1.-ky*ky);
   heat+=.5*exp(-max(gap,0.)/.035)*(1.-smoothstep(.22,.44,abs(p.y)));
   vec3 c=mix(vec3(.05,0.,0.),vec3(.62,.04,0.),smoothstep(.08,.34,heat));
   c=mix(c,vec3(1.15,.26,.015),smoothstep(.32,.58,heat));c=mix(c,vec3(1.55,.72,.08),smoothstep(.58,.84,heat));c=mix(c,vec3(1.9,1.3,.45),smoothstep(.86,1.15,heat));
   c=mix(c,vec3(.012,.004,.002),(1.-smoothstep(-.005,.009,gap))*step(abs(p.y),.31));
   gl_FragColor=vec4(c,alpha);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const open=new T.Mesh(new T.PlaneGeometry(1,1),fire);open.scale.set(215,215,1);
 const shut=new T.Sprite(new T.SpriteMaterial({map:closed,transparent:true,depthWrite:false,fog:false}));shut.scale.set(185,185,1);
 return {open,fire,closed:shut};
}
export const smokeTexture=()=>{const n=document.createElement('canvas');n.width=n.height=64;const c=n.getContext('2d'),g=c.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'#ffffffcc');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,64,64);return new T.CanvasTexture(n);};

// Instanced forest with natural crowns. Every tree differs a little in colour and turn.
function crown(radius,seed,lumps=3,detail=1){
 // A few overlapping clumps with soft shading, so the sun models masses of leaves.
 const lump=new T.IcosahedronGeometry(1,detail),source=lump.attributes.position,out=[],normals=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),n=new T.Vector3();
 for(let l=0;l<lumps;l++){
  const angle=l*2.399+seed,reach=l?radius*.56:0,size=radius*(l?.6:.74),ox=Math.cos(angle)*reach,oz=Math.sin(angle)*reach,oy=(l?(l%2?-.16:.2):.12)*radius;
  const at=(i,v)=>{v.fromBufferAttribute(source,i);const w=1+Math.sin(v.x*4.3+seed+l)*.13+Math.sin(v.y*5.1+seed*2)*.11+Math.sin(v.z*4.7+seed*3+l)*.13+Math.sin(v.x*11+seed)*Math.sin(v.y*13+l)*Math.sin(v.z*12)*.16;v.multiplyScalar(size*w);v.y*=.84;v.x+=ox;v.y+=oy;v.z+=oz;};
  for(let i=0;i<source.count;i+=3){at(i,a);at(i+1,b);at(i+2,c);out.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);for(let q=0;q<3;q++){n.fromBufferAttribute(source,i+q).normalize();normals.push(n.x,n.y,n.z);}}
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(out,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));return g;
}
function tier(radius,height,seed){
 const g=new T.ConeGeometry(radius,height,9,2),p=g.attributes.position,v=new T.Vector3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const ring=Math.hypot(v.x,v.z);if(ring>radius*.15){const angle=Math.atan2(v.z,v.x),n=1+Math.sin(angle*7+seed)*.15+Math.sin(angle*17+seed*2)*.09;v.x*=n;v.z*=n;if(v.y<-height*.3)v.y-=Math.abs(Math.sin(angle*7+seed))*height*.16;}p.setXYZ(i,v.x,v.y,v.z);}
 g.computeVertexNormals();return g;
}
// Wind in the crowns and light and shade across the leaves. Trunks stay still at their foot.
export const forestTime={value:0};
// How much day there is, 0 at night and 1 by day: whatever shines by itself by day goes dark with it.
function foliage(radius){
 const m=new T.MeshLambertMaterial({color:new T.Color(1.6,1.6,1.6)});
 m.onBeforeCompile=shader=>{
  shader.uniforms.forestTime=forestTime;shader.uniforms.leafSize={value:radius};shader.uniforms.worldDay=worldDay;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float forestTime;varying vec3 vLeaf;').replace('#include <begin_vertex>',`#include <begin_vertex>
   vLeaf=position;
   #ifdef USE_INSTANCING
   {float seed=instanceMatrix[3].x*.031+instanceMatrix[3].z*.043;transformed.x+=sin(forestTime*1.15+seed)*.55+sin(forestTime*2.9+seed+position.y*.3)*.2;transformed.z+=cos(forestTime*.93+seed)*.42;}
   #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vLeaf;uniform float leafSize;uniform float worldDay;').replace('#include <color_fragment>',`#include <color_fragment>
   {float low=smoothstep(-leafSize,leafSize*.8,vLeaf.y);float dapple=sin(vLeaf.x*1.7+vLeaf.y*2.3)*sin(vLeaf.z*1.9-vLeaf.y*1.3)*sin(vLeaf.x*.6+vLeaf.z*.8);diffuseColor.rgb*=(.5+.72*low)*(.96+dapple*.12);}`).replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*.2*worldDay;');
 };
 return m;
}
// Crowns of painted leaves: tiers of boughs, so light falls through their edges. Every kind of tree has its own leaf and shape.
const leafKinds={
 gold:{picture:'gold',r:23,tiers:[[-.42,.92,34],[-.1,1,46],[.2,.78,36],[.46,.48,20]],size:[.27,.24],tilt:[.25,1.05]},
 oak:{picture:'oak',r:22,tiers:[[-.35,.9,18],[0,1,24],[.35,.75,16],[.6,.4,8]],size:[.3,.22],tilt:[.25,1.05]},
 birch:{picture:'birch',r:13,tiers:[[-.6,.8,10],[-.1,1,16],[.5,.7,12],[.9,.35,6]],size:[.32,.22],tilt:[.5,1]},
 dark:{picture:'dark',r:30,tiers:[[-.4,.95,24],[-.08,1,30],[.24,.75,20],[.5,.42,10]],size:[.3,.24],tilt:[.2,.9]},
 pine:{picture:'pine',r:20,tiers:[[-1.15,.82,16],[-.7,.66,15],[-.25,.5,13],[.2,.36,11],[.65,.22,8],[1.05,.1,4]],size:[.2,.13],tilt:[.8,.6]},
 bush:{picture:'oak',r:8,tiers:[[-.2,1,9],[.3,.7,6]],size:[.42,.25],tilt:[.3,1]},
 darkbush:{picture:'dark',r:8,tiers:[[-.2,1,9],[.3,.7,6]],size:[.42,.25],tilt:[.3,1]},
 goldbush:{picture:'gold',r:8,tiers:[[-.2,1,9],[.3,.7,6]],size:[.42,.25],tilt:[.3,1]},
};
const leafPaints={
 gold:{tones:['#bcaa52','#cbb962','#d9ca74','#ac9d4e','#e3d68a','#b0a75c','#9a8e4c'],vein:'#7c6e3a',len:[11,13],wide:.36,count:620,fill:[172,152,84]},
 oak:{tones:['#3f5f30','#4c6e36','#355428','#5a7a3c','#2d4a26','#63803f'],vein:'#26401f',len:[9,10],wide:.5,count:800,fill:[60,90,45]},
 birch:{tones:['#6f8f48','#7f9c50','#5f7f40','#8fa858','#54723a'],vein:'#3f5a2a',len:[7,7],wide:.5,count:1000,fill:[105,135,70]},
 dark:{tones:['#1c3a26','#22442c','#173220','#2a4e30','#2f5433'],vein:'#102418',len:[11,12],wide:.42,count:700,fill:[30,60,40]},
 pine:{tones:['#17361f','#1d4026','#14301c','#24492b','#2b5230'],vein:'#14301c',len:[16,14],wide:.09,count:1100,fill:[25,55,35]},
};
const leafPictures=new Map();
function leafPicture(name){
 if(leafPictures.has(name))return leafPictures.get(name);
 const paint=leafPaints[name],N=512,n=document.createElement('canvas');n.width=n.height=N;const c=n.getContext('2d');let s=7321+name.length*97;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
 for(let i=0;i<paint.count;i++){
  const a=rnd()*6.283,d=Math.sqrt(rnd())*N*.47,x=N/2+Math.cos(a)*d,y=N/2+Math.sin(a)*d,len=paint.len[0]+rnd()*paint.len[1],wide=len*paint.wide;
  c.save();c.translate(x,y);c.rotate(rnd()*6.283);c.fillStyle=paint.tones[Math.floor(rnd()*paint.tones.length)];c.beginPath();c.moveTo(-len,0);c.quadraticCurveTo(0,-wide,len,0);c.quadraticCurveTo(0,wide,-len,0);c.fill();c.strokeStyle=paint.vein;c.lineWidth=.7;c.beginPath();c.moveTo(-len,0);c.lineTo(len,0);c.stroke();c.restore();
 }
 // See-through pixels keep the colour of the leaves, so the edges do not turn dark in the distance.
 const px=c.getImageData(0,0,N,N).data;for(let i=0;i<px.length;i+=4)if(px[i+3]===0){px[i]=paint.fill[0];px[i+1]=paint.fill[1];px[i+2]=paint.fill[2];}
 const t=new T.DataTexture(px,N,N,T.RGBAFormat);t.colorSpace=T.SRGBColorSpace;t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.anisotropy=16;t.needsUpdate=true;leafPictures.set(name,t);return t;
}
function leafyCrown(kind,seed=4){
 const spec=leafKinds[kind],R=spec.r;let s=seed*4099+17;const rnd=()=>(s=(s*16807)%2147483647)/2147483647,pos=[],nor=[],uv=[],index=[],right=new T.Vector3(),along=new T.Vector3(),face=new T.Vector3(),centre=new T.Vector3(),soft=new T.Vector3(),up=new T.Vector3(0,1,0);
 for(const [height,reach,count] of spec.tiers)for(let i=0;i<count;i++){
  const a=rnd()*6.283,d=Math.sqrt(rnd())*reach*R,edge=d/(reach*R);centre.set(Math.cos(a)*d,(height+(rnd()-.5)*.2-edge*edge*.13)*R,Math.sin(a)*d);
  const size=R*(spec.size[0]+rnd()*spec.size[1]),turn=kind==='pine'?a:rnd()*6.283,tilt=spec.tilt[0]+rnd()*spec.tilt[1];face.set(Math.cos(turn)*Math.sin(tilt),Math.cos(tilt),Math.sin(turn)*Math.sin(tilt));right.crossVectors(up,face).normalize();along.crossVectors(face,right);
  soft.copy(centre).setY(centre.y+R*.35).normalize().lerp(face,.25).normalize();const base=pos.length/3;
  for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){pos.push(centre.x+right.x*u*size+along.x*v*size,centre.y+right.y*u*size+along.y*v*size,centre.z+right.z*u*size+along.z*v*size);nor.push(soft.x,soft.y,soft.z);uv.push(u*.5+.5,v*.5+.5);}
  index.push(base,base+1,base+2,base,base+2,base+3);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.userData.leaves=kind;return g;
}
function leafCards(kind){
 const spec=leafKinds[kind],m=new T.MeshLambertMaterial({map:leafPicture(spec.picture),color:new T.Color(1.75,1.75,1.75),alphaTest:.34,alphaToCoverage:true,side:T.DoubleSide});
 m.onBeforeCompile=shader=>{
  shader.uniforms.forestTime=forestTime;shader.uniforms.leafR={value:spec.r};shader.uniforms.worldDay=worldDay;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float forestTime;varying float vTier;varying float vCardAway;').replace('#include <project_vertex>','#include <project_vertex>\nvCardAway=length(mvPosition.xyz);').replace('#include <begin_vertex>',`#include <begin_vertex>
   vTier=position.y;
   #ifdef USE_INSTANCING
   {float seed=instanceMatrix[3].x*.031+instanceMatrix[3].z*.043+position.x*.09;transformed.x+=sin(forestTime*1.2+seed)*.6;transformed.y+=sin(forestTime*1.7+seed*1.3)*.28;transformed.z+=cos(forestTime+seed)*.48;}
   #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vTier;varying float vCardAway;uniform float leafR;uniform float worldDay;').replace('#include <alphatest_fragment>',`{vec2 big=vec2(length(dFdx(vMapUv)),length(dFdy(vMapUv)))*512.;float lod=max(0.,log2(max(big.x,big.y)));diffuseColor.a*=1.+lod*.62;}
   #include <alphatest_fragment>`).replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);').replace('#include <color_fragment>',`#include <color_fragment>
   diffuseColor.rgb*=mix(.56,1.08,smoothstep(-.5*leafR,.5*leafR,vTier));`).replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*.2*worldDay;');
 };
 return m;
}
const leafShadow=kind=>new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:leafPicture(leafKinds[kind].picture),alphaTest:.34,side:T.DoubleSide});
// Crowns standing on great trees of a district: [x,y,z,radius] in its own space.
export function leafCrowns(kind,list){
 const material=clearView(leafCards(kind),'leaf'),mesh=new T.InstancedMesh(leafyCrown(kind,5),material,list.length),m=new T.Matrix4(),q=new T.Quaternion(),up=new T.Vector3(0,1,0);
 list.forEach(([x,y,z,r],i)=>{q.setFromAxisAngle(up,x*.13+z*.07);const k=r/leafKinds[kind].r;m.compose(new T.Vector3(x,y,z),q,new T.Vector3(k,k*.82,k));mesh.setMatrixAt(i,m);});
 mesh.castShadow=kind==='gold';mesh.customDepthMaterial=leafShadow(kind);mesh.frustumCulled=false;return mesh;
}
// Whatever grows between the camera and the place being looked at gives way, so a tree never stands in front of it.
export const viewClear={a:{value:new T.Vector2()},b:{value:new T.Vector2(0,1)},r:{value:0}};
function clearView(m,tag){
 const before=m.onBeforeCompile;
 m.onBeforeCompile=function(s,renderer){
  before?.call(this,s,renderer);Object.assign(s.uniforms,{clearA:viewClear.a,clearB:viewClear.b,clearR:viewClear.r});
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vClearP;').replace('#include <project_vertex>','#include <project_vertex>\n#ifdef USE_INSTANCING\nvClearP=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xz;\n#else\nvClearP=(modelMatrix*vec4(transformed,1.)).xz;\n#endif');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vClearP;uniform vec2 clearA;uniform vec2 clearB;uniform float clearR;').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(clearR>0.){vec2 ab=clearB-clearA;float t=clamp(dot(vClearP-clearA,ab)/dot(ab,ab),0.,1.);if(distance(vClearP,clearA+ab*t)<clearR*smoothstep(.2,.5,t))discard;}');
 };
 m.customProgramCacheKey=()=>`clear|${tag}`;
 return m;
}
const limbInto=(pieces)=>{const out=[],normals=[];for(const [len,r,tilt,turn,y] of pieces){const g=new T.CylinderGeometry(r*.3,r,len,5).toNonIndexed();g.translate(0,len/2,0);g.rotateZ(tilt);g.rotateY(turn);g.translate(0,y,0);out.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);}const merged=new T.BufferGeometry();merged.setAttribute('position',new T.Float32BufferAttribute(out,3));merged.setAttribute('normal',new T.Float32BufferAttribute(normals,3));return merged;};
export function buildForest(trees,groundAt){
 const group=new T.Group(),byKind=new Map();
 for(const t of trees){if(!byKind.has(t.kind))byKind.set(t.kind,[]);byKind.get(t.kind).push(t);}
 const shapes={
  pine:[[new T.CylinderGeometry(1,3,44,7),'#3a2a1c',22],[new T.ConeGeometry(10,54,7),'#10261a',38],[leafyCrown('pine',1),'#ffffff',40]],
  oak:[[new T.CylinderGeometry(2,4.2,24,7),'#3a2a1a',12],[limbInto([[17,1.8,.8,0,0],[15,1.6,.9,2.1,0],[16,1.7,.75,4.2,0],[12,1.2,.35,1,4]]),'#3a2a1a',20],[crown(12,1),'#20351b',36],[leafyCrown('oak',2),'#ffffff',38]],
  mallorn:[[new T.CylinderGeometry(2,6.4,70,9),'#adb9c6',35],[limbInto([[26,2.4,1,.4,0],[24,2.2,1.05,2.5,0],[25,2.3,.95,4.6,0],[18,1.6,.5,1.5,8]]),'#adb9c6',48],[crown(15,4),'#8e7e40',74],[leafyCrown('gold',4),'#ffffff',80]],
  dead:[[new T.CylinderGeometry(.7,3,30,6),'#1a1510',15],[limbInto([[13,1,.8,.6,0],[11,.9,1,2.6,2],[12,.9,.7,4.4,-4],[9,.6,.3,1.4,4]]),'#1a1510',26]],
  dark:[[new T.CylinderGeometry(2.6,6.2,42,8),'#1d1712',21],[limbInto([[22,2.4,1.1,0,0],[20,2.2,1.2,2.1,0],[21,2.3,1,4.2,0]]),'#1d1712',30],[crown(17,7),'#0f2419',54],[leafyCrown('dark',3),'#ffffff',58]],
  birch:[[new T.CylinderGeometry(.9,1.8,32,7),'#c2c0b4',16],[crown(6,10),'#3f5a2a',36],[leafyCrown('birch',6),'#ffffff',38]],
  bush:[[crown(4,13,1,1),'#26401f',4],[leafyCrown('bush',7),'#ffffff',6]],darkbush:[[crown(4,15,1,1),'#102418',4],[leafyCrown('darkbush',8),'#ffffff',6]],goldbush:[[crown(4,17,1,1),'#6a5a24',4],[leafyCrown('goldbush',9),'#ffffff',6]],
  stone:[[(()=>{const g=new T.IcosahedronGeometry(5,1),p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);v.multiplyScalar(1+Math.sin(v.x*.9)*.2+Math.sin(v.y*1.3+1)*.16+Math.sin(v.z*1.1+2)*.18);v.y*=.62;p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();return g;})(),'#4c4a44',1.4]],
  log:[[new T.CylinderGeometry(1.8,2.4,26,7).rotateZ(1.53),'#33271a',2],[new T.CylinderGeometry(2.7,2.7,1,7),'#33271a',.5]],
 };
 const m=new T.Matrix4(),q=new T.Quaternion(),up=new T.Vector3(0,1,0),tint=new T.Color();
 for(const [kind,list] of byKind)for(const [geometry,color,y] of shapes[kind]){
  geometry.computeBoundingSphere();const isLeaf=!/#(3a2a|3a2a1a|1a15|1d17|b9bb|9fa1|c2c0|3327|4c4a)/.test(color);const mesh=new T.InstancedMesh(geometry,geometry.userData.leaves?clearView(leafCards(geometry.userData.leaves),'leaf'):isLeaf?clearView(foliage(geometry.boundingSphere.radius),'foliage'):clearView(new T.MeshStandardMaterial({color:'#ffffff',roughness:.92}),'plain'),list.length);mesh.castShadow=!/bush|log|stone/.test(kind)&&(!geometry.userData.leaves||kind==='mallorn');mesh.receiveShadow=!isLeaf;if(geometry.userData.leaves)mesh.customDepthMaterial=leafShadow(geometry.userData.leaves);
  list.forEach((t,i)=>{const tall=t.s*(.88+((t.tone??1)-.82)*.8);q.setFromAxisAngle(up,t.x*.37);m.compose(new T.Vector3(t.x,groundAt(t.x,t.y)+y*tall,t.y),q,new T.Vector3(t.s,tall,t.s));mesh.setMatrixAt(i,m);tint.set(color).multiplyScalar(t.tone??1);tint.offsetHSL((Math.sin(t.x*.021+t.y*.017)+Math.sin(t.x*.13))*.008,(Math.sin(t.y*.031))*.05,0);mesh.setColorAt(i,tint);});
  mesh.frustumCulled=false;group.add(mesh);
 }
 return group;
}
export {T as THREE};
