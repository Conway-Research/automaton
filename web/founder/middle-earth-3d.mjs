// Geometry of the 3D Middle-earth desktop: figures, halls with interiors, settlements and Barad-dûr.
// Pure drawing. No data from the server and no server access.
import * as T from './vendor/three.module.min.js';

export const HALL={half:115,height:58,offset:60};
export const crewPoint=m=>({x:m.x,z:(m.y-HALL.offset)*2.5});

// Collects simple solids and merges them into one mesh, so a whole district costs only a few draw calls.
const unit={box:new T.BoxGeometry(1,1,1).toNonIndexed(),sphere:new T.SphereGeometry(1,14,10).toNonIndexed(),dome:new T.SphereGeometry(1,14,8,0,Math.PI*2,0,Math.PI/2).toNonIndexed()};
const cylinders=new Map();
const cylinder=(top,bottom,segments)=>{const key=`${top}|${bottom}|${segments}`;if(!cylinders.has(key))cylinders.set(key,new T.CylinderGeometry(top,bottom,1,segments).toNonIndexed());return cylinders.get(key);};
const helper=new T.Object3D(),tint=new T.Color();
export class Kit{
 constructor(){this.pos=[];this.nor=[];this.col=[];}
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
 canopy(x,y,z,r,colors,seed=1,flat=.72){let s=seed*7919+13;const rnd=()=>(s=(s*16807)%2147483647)/2147483647,c=new T.Color(),hex={getHexString:()=>''};if(!cylinders.has('leaf')){const g=new T.IcosahedronGeometry(1,1),p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const m=1+Math.sin(v.x*5)*.14+Math.sin(v.y*6+1)*.14+Math.sin(v.z*7+2)*.12;g.attributes.normal.setXYZ(i,v.x,v.y,v.z);v.multiplyScalar(m);p.setXYZ(i,v.x,v.y,v.z);}cylinders.set('leaf',g.toNonIndexed());}const n=Math.max(16,Math.min(90,Math.round(r/.95)));for(let i=0;i<n;i++){const a=rnd()*6.283,u=rnd()*2-1,d=Math.pow(rnd(),.4),ring=Math.sqrt(1-u*u),px=Math.cos(a)*ring*d*r,py=u*d*r*flat,pz=Math.sin(a)*ring*d*r,size=r*(.13+rnd()*.13);c.set(colors[Math.floor(rnd()*colors.length)]).multiplyScalar(.62+.46*(u*.5+.5)+(rnd()-.5)*.14);this.add(cylinders.get('leaf'),x+px,y+py,z+pz,size*(.9+rnd()*.5),size*(.62+rnd()*.3),size*(.9+rnd()*.5),`#${c.getHexString()}`,rnd()*6.283);}return this;}
 // A smooth tapering limb through points [x,y,z,radius], for anything grown rather than built.
 limb(points,color,sides=10){
  const c=new T.Color(color),path=[],at=(i)=>points[Math.max(0,Math.min(points.length-1,i))];
  for(let i=0;i<points.length-1;i++)for(let n=0;n<(i===points.length-2?5:4);n++){const t=n/4,p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2),q=[];for(let d=0;d<4;d++)q[d]=.5*(2*p1[d]+(p2[d]-p0[d])*t+(2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*t*t+(3*p1[d]-p0[d]-3*p2[d]+p3[d])*t*t*t);q[3]=Math.max(.05,q[3]);path.push(q);}
  const rings=[],T0=new T.Vector3(),A=new T.Vector3(1,0,.3).normalize(),B=new T.Vector3(),o=new T.Vector3();
  path.forEach((p,i)=>{const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];T0.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();A.addScaledVector(T0,-A.dot(T0));if(A.lengthSq()<1e-5)A.set(0,0,1).addScaledVector(T0,-T0.z);A.normalize();B.crossVectors(T0,A);const ring=[];for(let j=0;j<=sides;j++){const w=j/sides*6.2832;o.copy(A).multiplyScalar(Math.cos(w)).addScaledVector(B,Math.sin(w));ring.push([p[0]+o.x*p[3],p[1]+o.y*p[3],p[2]+o.z*p[3],o.x,o.y,o.z]);}rings.push(ring);});
  const put=v=>{this.pos.push(v[0],v[1],v[2]);this.nor.push(v[3],v[4],v[5]);this.col.push(c.r,c.g,c.b);};
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++){const a=rings[i][j],b=rings[i][j+1],d=rings[i+1][j],e=rings[i+1][j+1];put(a);put(b);put(d);put(b);put(e);put(d);}
  return this;
 }
 cylinder(top,bottom,h,segments=10){const key=`g${top}|${bottom}|${h}|${segments}`;if(!cylinders.has(key))cylinders.set(key,new T.CylinderGeometry(top,bottom,h,segments).toNonIndexed());return cylinders.get(key);}
 icosa(r){const key='i'+r;if(!cylinders.has(key))cylinders.set(key,new T.IcosahedronGeometry(r,0).toNonIndexed());return cylinders.get(key);}
 octa(r){const key='o'+r;if(!cylinders.has(key))cylinders.set(key,new T.OctahedronGeometry(r,0).toNonIndexed());return cylinders.get(key);}
 torus(r,t){const key=`t${r}|${t}`;if(!cylinders.has(key))cylinders.set(key,new T.TorusGeometry(r,t,8,28).toNonIndexed());return cylinders.get(key);}
 cube(){return unit.box;}
 // A thick curved wall from angle a0 to a1, where angle 0 is north and angles grow clockwise.
 arc(radius,thick,a0,a1,y,h,color){const shape=new T.Shape(),steps=8;for(let i=0;i<=steps;i++){const a=a0+(a1-a0)*i/steps,px=Math.sin(a)*radius,py=Math.cos(a)*radius;i?shape.lineTo(px,py):shape.moveTo(px,py);}for(let i=steps;i>=0;i--){const a=a0+(a1-a0)*i/steps;shape.lineTo(Math.sin(a)*(radius-thick),Math.cos(a)*(radius-thick));}shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}).toNonIndexed();g.rotateX(-Math.PI/2);this.add(g,0,y,0,1,1,1,color);return this;}
 add(geometry,x,y,z,sx,sy,sz,color,ry=0,rx=0,rz=0){
  helper.position.set(x,y,z);helper.scale.set(sx,sy,sz);helper.rotation.set(rx,ry,rz);helper.updateMatrix();if(this.parent)helper.matrix.premultiply(this.parent);
  const p=geometry.attributes.position,n=geometry.attributes.normal,normalMatrix=new T.Matrix3().getNormalMatrix(helper.matrix),v=new T.Vector3();tint.set(color);
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(helper.matrix);this.pos.push(v.x,v.y,v.z);v.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();this.nor.push(v.x,v.y,v.z);this.col.push(tint.r,tint.g,tint.b);}
  return this;
 }
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
  const m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;return m;
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
 whitewizard:{h:1.1,body:'#f1f1ea',legs:'#c9c9c2',skin:'#dcb897',hair:'#f7f7f2',robe:true},silvan:{h:1.08,body:'#3f5a2a',legs:'#2a3a1e',skin:'#ecd0b2',hair:'#a5642a',robe:true},gollum:{h:.56,w:.72,body:'#8d8a6a',legs:'#a5a07a',skin:'#b5b08a',hair:'#3a3a2c'},
};
function toolInto(k,tool){
 if(tool==='hammer'){k.column(0,-14,0,.8,12,'#6a4a22');k.box(0,-17,0,6,4,3.6,'#b6bcc3');}
 else if(tool==='pick'){k.column(0,-14,0,.8,13,'#6a4a22');k.box(0,-16,0,12,1.6,1.6,'#b6bcc3');}
 else if(tool==='staff'){k.column(0,-30,0,.7,34,'#6a4a22');k.ball(0,-31,0,1.8,'#8ce0ff');}
 else if(tool==='sword'||tool==='chisel'){k.box(0,-16,0,1.2,15,.6,'#c5cbd2');k.box(0,-2,0,4,1,1,'#e4b24a');}
 else if(tool==='bow'){k.box(0,-8,1.5,1,20,1,'#5a3a1c');}
 else if(tool==='quill'){k.box(0,-7,0,.5,6,2,'#f4efe2');}
 else if(tool==='coin'){k.column(0,-2,0,2,.8,'#e4b24a');}
 else if(tool==='book'){k.box(0,-4,0,6,1.6,5,'#5e2c1a');}
 else{k.box(0,-3,0,5,1,6,'#efe4c8');}
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
 else if(people==='gollum'){k.ball(1.4,25,3,1.2,'#dfeef5');k.ball(-1.4,25,3,1.2,'#dfeef5');k.ball(1.4,25,4,.5,'#17120d');k.ball(-1.4,25,4,.5,'#17120d');}
 else if(people==='noldor'||people==='galadhrim'||people==='rohirrim'||people==='silvan'){k.dome(0,25.2,0,3.8,p.hair);k.box(0,16,-2.8,6.4,9,1.2,p.hair);k.cone(-3.8,24.6,0,.7,2.8,p.skin,6);k.cone(3.8,24.6,0,.7,2.8,p.skin,6);if(people==='rohirrim')k.box(0,10,2.5,7.8,1.2,.5,'#d9a93c');}
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
export function stationInto(k,tool,x,z){
 const o=x+15;
 if(tool==='hammer'){k.box(o,0,z,8,6,10,'#2a2c30');k.box(o,6,z,11,4,20,'#3a3c40');k.cone(o,8,z+14,3,0.1,'#3a3c40');k.box(o,10,z,6,1,10,'#ff9a3a');}
 else if(tool==='pick'){k.cone(o,0,z,15,16,'#55524a',7);k.ball(o-4,9,z+7,1.4,'#e4b24a');k.ball(o+5,6,z+8,1.4,'#e4b24a');k.box(o+16,0,z,10,7,12,'#2f3134');}
 else if(tool==='sack'){k.ball(o-5,6,z,7,'#a07f4c');k.ball(o+6,5,z+3,6,'#8f7040');k.box(o+2,0,z-9,12,11,12,'#6d4c28');}
 else if(tool==='letter'){k.box(o,0,z-3,22,26,6,'#6d4c28');for(let i=0;i<9;i++){k.box(o-7+(i%3)*7,4+Math.floor(i/3)*7,z,5.4,5.4,.8,'#2a2015');if(i%2===0)k.box(o-7+(i%3)*7,5+Math.floor(i/3)*7,z+.5,4,3,.5,'#efe4c8');}}
 else if(tool==='bow'){k.column(o-8,0,z,.8,22,'#4a3219');k.column(o+8,0,z,.8,22,'#4a3219');k.box(o,21,z,18,1,1,'#4a3219');k.add(cylinder(1,1,16),o,12,z,8,.6,8,'#efe4c8',0,Math.PI/2);k.add(cylinder(1,1,12),o,12,z+.5,3,.6,3,'#b52d12',0,Math.PI/2);}
 else if(tool==='staff'){k.box(o,0,z,12,4,12,'#c9c5b6');k.column(o,4,z,3,10,'#e7e3d2');k.ball(o,17,z,3.6,'#8ce0ff');}
 else if(tool==='ladle'){k.cyl(o,0,z,8,4,9,'#d8d4c2');k.column(o,9,z,8.4,.8,'#e7e3d2');k.column(o,9.5,z,7,.5,'#7cd0ea');}
 else if(tool==='sword'){k.column(o-9,0,z,.8,20,'#4a3219');k.column(o+9,0,z,.8,20,'#4a3219');k.box(o,19,z,22,1.4,2,'#4a3219');for(let i=0;i<3;i++)k.box(o-6+i*6,3,z,1.4,16,.6,'#c5cbd2');}
 else if(tool==='scale'){k.box(o,0,z,20,8,12,'#d8d4c2');k.column(o,8,z,.7,14,'#e4b24a');k.box(o,21,z,22,.8,1,'#e4b24a');k.column(o-10,15,z,3.4,.6,'#e4b24a');k.column(o+10,17,z,3.4,.6,'#e4b24a');}
 else{
  k.box(o,9,z,24,2,14,'#94703f');for(const [a,b] of [[-10,-5],[10,-5],[-10,5],[10,5]])k.column(o+a,0,z+b,1,9,'#5e4322');
  if(tool==='coin')for(let i=0;i<6;i++)k.column(o-7+(i%2)*6,11+Math.floor(i/2)*.9,z,2.6,.8,'#e4b24a');
  else if(tool==='seal'){k.box(o-4,11,z,9,.6,7,'#efe4c8');k.column(o+7,11,z,2.2,1.4,'#b52d12');}
  else if(tool==='compass'){k.box(o,11,z,20,.5,12,'#d9c99c');k.box(o-3,11.5,z,10,.3,1,'#4f7f9b');k.ball(o+5,12,z+2,.9,'#b52d12');}
  else if(tool==='book'){k.box(o,11,z,12,1.2,8,'#efe4c8');k.box(o,10.8,z,13,.4,9,'#5e2c1a');}
  else if(tool==='chisel'){k.box(o-5,11,z,8,4,6,'#54565a');k.box(o+6,11,z,8,2,6,'#b6bcc3');}
  else{k.box(o-2,11,z,10,.6,8,'#efe4c8');k.column(o+7,11,z+3,1.2,2,'#3a2c10');}
 }
}

// ---- Halls ----

// Everything belonging to one district. Walls and roof lift away separately; close details appear only near the camera.
export function buildDistrict(id,crew,art){
 const group=new T.Group(),inside=new Kit(),light=new Kit(),out=new Kit(),near=new Kit(),nearLight=new Kit(),fx={smoke:[],embers:[],spray:[],leaves:[]};
 inside.lights=light;art.interiors[id](inside,light);inside.lights=null;
 for(const m of crew){const q=crewPoint(m);stationInto(inside,m.tool,q.x,q.z);}
 art.landmarks[id](out,light,fx);
 art.closeDetails[id](near,nearLight);
 const lit=k=>{const m=k.mesh(glowing);m.castShadow=false;m.receiveShadow=false;return m;};
 const mats=art.materials[id];const interior=inside.mesh(mats.inside);group.add(interior);if(light.pos.length)group.add(lit(light));const outside=out.mesh(mats.outside);group.add(outside);
 const closeMesh=new T.Group();closeMesh.add(near.mesh(mats.outside));if(nearLight.pos.length)closeMesh.add(lit(nearLight));group.add(closeMesh);
 const wallKit=(build,base=mats.wall)=>{const k=new Kit();build(k);const material=base.clone();material.transparent=true;material.alphaTest=.02;const m=k.mesh(material);group.add(m);return m;};
 const walls=art.buildWalls(id,build=>wallKit(build)).map(w=>({mesh:w.mesh,normal:new T.Vector3(w.normal[0],0,w.normal[1])}));
 const roof=wallKit(k=>art.roofs[id](k),mats.roof);
 const props=new T.Group();props.visible=false;group.add(props);
 return {group,walls,roof,closeMesh,props,outside,fx};
}

// ---- Barad-dûr ----
// The Dark Tower: a rock foundation, a spiked curtain wall, four buttressed tiers and the iron fork that holds the eye.
export function buildHub(material=solid){
 const group=new T.Group(),k=new Kit(),g=new Kit(),black='#6a5f56',dark='#564c44',iron='#3a332e';
 k.crag(0,0,0,205,40,178,'#5e544a',1);
 for(const [x,z,sx,sy,seed] of [[-130,-90,70,46,2],[130,-96,74,52,3],[-150,40,54,32,1],[152,36,56,34,2]])k.crag(x,0,z,sx,sy,sx,'#544a41',seed);
 // The curtain wall, open only towards the road from the south.
 const R=142,N=22;
 for(let i=0;i<N;i++){
  const a=(i+.5)/N*6.2832,x=Math.sin(a)*R,z=Math.cos(a)*R;
  if(Math.abs(a-Math.PI*2)<.24||a<.24)continue;
  k.box(x,8,z,2*R*Math.sin(Math.PI/N)+2,30,11,dark,a);
  for(const s of [-1,0,1])k.box(x+Math.cos(a)*s*12,38,z-Math.sin(a)*s*12,6,6,12,black,a);
  if(i%3===1){k.cyl(x,8,z,11,14,58,black,10);k.cone(x,66,z,13,24,iron,10);}
  if(i%2===0)g.box(Math.sin(a)*(R+5.8),22,Math.cos(a)*(R+5.8),1.2,5,.5,'#ff7a2a',a);
 }
 // The gate.
 for(const s of [-1,1]){k.cyl(s*30,6,Math.cos(.24)*R,14,18,74,black,10);k.cone(s*30,80,Math.cos(.24)*R,16,30,iron,10);}
 k.box(0,48,Math.cos(.24)*R,50,14,14,dark);k.box(0,44,Math.cos(.24)*R+4,44,4,3,iron);
 // The tower: each tier narrower, ringed with buttresses that end in spikes.
 let y=26;
 const tiers=[[90,84,62,12,20],[104,60,44,12,16],[92,42,30,10,12],[58,28,20,8,9]];
 tiers.forEach(([h,bottom,top,fins,fin],t)=>{
  k.cyl(0,y,0,top,bottom,h,t%2?dark:black,20);
  k.cyl(0,y+h-3,0,top+5,top+2,6,iron,20);
  for(let i=0;i<fins;i++){
   const a=(i+(t%2?.5:0))/fins*6.2832,c=Math.cos(a),n=Math.sin(a),out=(bottom+top)/2+fin*.32;
   k.add(new T.BoxGeometry(fin*.55,h*1.02,fin*1.05).toNonIndexed(),c*out,y+h*.5,n*out,1,1,1,t%2?black:dark,-a,0,0);
   k.add(k.cylinder(0,fin*.42,h*.42,5),c*(top+fin*.3),y+h+h*.2,n*(top+fin*.3),1,1,1,iron);
   if((i+t)%2===0)for(let w=0;w<3;w++)g.box(Math.cos(a+.31)*(top+(bottom-top)*(1-(w+.5)/3)+.6),y+h*(w+.5)/3,Math.sin(a+.31)*(top+(bottom-top)*(1-(w+.5)/3)+.6),1.3,5.4,1.3,w%2?'#ff9a3a':'#ff6a1a',-a);
  }
  y+=h;
 });
 // The fork of iron.
 k.cyl(0,y,0,14,20,16,iron,14);
 for(const s of [-1,1]){k.limb([[s*12,y+6,0,11],[s*44,y+22,0,9],[s*84,y+50,0,7],[s*104,y+92,0,5],[s*96,y+128,0,2.6],[s*70,y+152,0,.3]],iron,8);for(let i=0;i<5;i++)k.cone(s*(26+i*17),y+24+i*i*2.1,0,3.4-i*.3,18,iron,6);}
 k.box(0,26,88,58,62,26,dark);k.cone(0,88,88,34,20,iron,4,Math.PI/4);g.box(0,26,101.2,34,44,.6,'#ff7a2a');
 for(let i=0;i<8;i++){const a=i/8*6.283;k.column(Math.cos(a)*116,20,Math.sin(a)*116,4,6,iron,8);g.cone(Math.cos(a)*116,26,Math.sin(a)*116,4,10,'#ff8a2a',8);}
 group.add(k.mesh(material));const lit=g.mesh(glowing);lit.castShadow=false;lit.receiveShadow=false;group.add(lit);
 return group;
}
// The eye is a camera-facing picture, so it always looks at the founder.
export function eyeSprites(){
 const make=(draw,size=512)=>{const n=document.createElement('canvas');n.width=size;n.height=size;draw(n.getContext('2d'),size);const t=new T.CanvasTexture(n);t.colorSpace=T.SRGBColorSpace;return t;};
 const almond=(c,s,w,h)=>{c.beginPath();c.moveTo(s/2-w,s/2);c.quadraticCurveTo(s/2,s/2-h,s/2+w,s/2);c.quadraticCurveTo(s/2,s/2+h,s/2-w,s/2);c.closePath();};
 const open=make((c,s)=>{const f=c.createRadialGradient(s/2,s/2,10,s/2,s/2,s/2);f.addColorStop(0,'#ffc23aff');f.addColorStop(.42,'#f0540fee');f.addColorStop(.7,'#c8300866');f.addColorStop(1,'#c8300800');c.fillStyle=f;c.fillRect(0,0,s,s);const g=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s*.34);g.addColorStop(0,'#fff6bd');g.addColorStop(.5,'#ffc23a');g.addColorStop(1,'#e24509');almond(c,s,s*.38,s*.3);c.fillStyle=g;c.fill();});
 const closed=make((c,s)=>{const f=c.createRadialGradient(s/2,s/2,10,s/2,s/2,s/2);f.addColorStop(0,'#c8500f88');f.addColorStop(.6,'#8a2f0833');f.addColorStop(1,'#8a2f0800');c.fillStyle=f;c.fillRect(0,0,s,s);almond(c,s,s*.38,s*.24);c.fillStyle='#5a3216';c.fill();c.strokeStyle='#ff9440';c.lineWidth=7;c.stroke();c.strokeStyle='#ffd18a';c.lineWidth=11;c.lineCap='round';c.beginPath();c.moveTo(s*.16,s*.5);c.quadraticCurveTo(s*.5,s*.6,s*.84,s*.5);c.stroke();});
 const slit=make((c,s)=>{c.fillStyle='#0a0503';c.beginPath();c.moveTo(s/2,s*.1);c.quadraticCurveTo(s*.62,s/2,s/2,s*.9);c.quadraticCurveTo(s*.38,s/2,s/2,s*.1);c.fill();},256);
 const sprite=(map,w,h)=>{const m=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false,fog:false}));m.scale.set(w,h,1);return m;};
 return {open:sprite(open,250,250),closed:sprite(closed,250,250),pupil:sprite(slit,80,120)};
}
export const smokeTexture=()=>{const n=document.createElement('canvas');n.width=n.height=64;const c=n.getContext('2d'),g=c.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'#ffffffcc');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,64,64);return new T.CanvasTexture(n);};

// Instanced forest with natural crowns. Every tree differs a little in colour and turn.
function crown(radius,seed){
 // A few overlapping clumps with soft shading, so the sun models masses of leaves.
 const lump=new T.IcosahedronGeometry(1,2),source=lump.attributes.position,out=[],normals=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),n=new T.Vector3();
 for(let l=0;l<4;l++){
  const angle=l*2.399+seed,reach=l?radius*.56:0,size=radius*(l?.6:.74),ox=Math.cos(angle)*reach,oz=Math.sin(angle)*reach,oy=(l?(l%2?-.16:.2):.12)*radius;
  const at=(i,v)=>{v.fromBufferAttribute(source,i);const w=1+Math.sin(v.x*4.3+seed+l)*.13+Math.sin(v.y*5.1+seed*2)*.11+Math.sin(v.z*4.7+seed*3+l)*.13;v.multiplyScalar(size*w);v.y*=.84;v.x+=ox;v.y+=oy;v.z+=oz;};
  for(let i=0;i<source.count;i+=3){at(i,a);at(i+1,b);at(i+2,c);out.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);for(let q=0;q<3;q++){n.fromBufferAttribute(source,i+q).normalize();normals.push(n.x,n.y,n.z);}}
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(out,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));return g;
}
function tier(radius,height,seed){
 const g=new T.ConeGeometry(radius,height,11,3),p=g.attributes.position,v=new T.Vector3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const ring=Math.hypot(v.x,v.z);if(ring>radius*.15){const n=1+Math.sin(Math.atan2(v.z,v.x)*7+seed)*.14;v.x*=n;v.z*=n;}p.setXYZ(i,v.x,v.y,v.z);}
 g.computeVertexNormals();return g;
}
export function buildForest(trees,groundAt){
 const group=new T.Group(),byKind=new Map();
 for(const t of trees){if(!byKind.has(t.kind))byKind.set(t.kind,[]);byKind.get(t.kind).push(t);}
 const shapes={
  pine:[[new T.CylinderGeometry(1.4,2.8,18,7),'#33261a',9],[tier(14,22,1),'#16321f',20],[tier(12,20,2),'#1a3b24',32],[tier(9.5,18,3),'#1e4228',44],[tier(6.5,16,4),'#234a2c',56]],
  oak:[[new T.CylinderGeometry(2.2,3.6,22,7),'#3a2a1a',11],[crown(16,1),'#2d4a26',34],[crown(11,2),'#355429',44],[crown(9,3),'#28431f',30]],
  mallorn:[[new T.CylinderGeometry(2.4,5.2,64,9),'#a9ab9c',32],[crown(21,4),'#8c7a2a',72],[crown(16,5),'#a8922e',88],[crown(12,6),'#7c6c26',62]],
  dead:[[new T.CylinderGeometry(.7,3,30,6),'#14100c',15],[new T.CylinderGeometry(.3,1.1,16,5),'#14100c',32]],
  dark:[[new T.CylinderGeometry(3,5.4,38,8),'#17120e',19],[crown(21,7),'#10261a',52],[crown(15,8),'#152e1f',68],[crown(13,9),'#0d2016',44]],
  birch:[[new T.CylinderGeometry(1.2,1.9,26,7),'#b5b3a6',13],[crown(10,10),'#5a7a3c',34],[crown(7,11),'#688844',42]],
 };
 const m=new T.Matrix4(),q=new T.Quaternion(),up=new T.Vector3(0,1,0),tint=new T.Color();
 for(const [kind,list] of byKind)for(const [geometry,color,y] of shapes[kind]){
  const mesh=new T.InstancedMesh(geometry,new T.MeshStandardMaterial({color:'#ffffff',roughness:.92}),list.length);mesh.castShadow=true;mesh.receiveShadow=true;
  list.forEach((t,i)=>{q.setFromAxisAngle(up,t.x*.37);m.compose(new T.Vector3(t.x,groundAt(t.x,t.y)+y*t.s,t.y),q,new T.Vector3(t.s,t.s,t.s));mesh.setMatrixAt(i,m);tint.set(color).multiplyScalar(t.tone??1);mesh.setColorAt(i,tint);});
  mesh.frustumCulled=false;group.add(mesh);
 }
 return group;
}
export {T as THREE};
