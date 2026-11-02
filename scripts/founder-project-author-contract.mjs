import {checkedJSON,digest,bounded} from './founder-restoration-integrity.mjs';
import {selectWorkProfile} from './founder-work-profiles.mjs';

const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
const safePath=value=>typeof value==='string'&&value.length<=160&&/^[-\w.]+(?:\/[-\w.]+)*$/.test(value)&&!value.split('/').some(p=>p==='.'||p==='..'||/^(?:\.git|node_modules|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
export function validateProjectScope(raw,acceptance){
 const scope=checkedJSON(raw,64000);
 if(!id(scope.id)||!['python','node-js'].includes(scope.profileId)||!['public','synthetic'].includes(scope.privacy)||!Array.isArray(scope.requirements)||!scope.requirements.length||scope.requirements.length>40||!Array.isArray(scope.deliverables)||!scope.deliverables.length||scope.deliverables.length>32)throw Error('Bounded public project scope required');
 if(!safePath(scope.id+'.zip'))throw Error('Safe project delivery identity required');
 const ids=new Set();for(const r of scope.requirements){if(!id(r.id)||ids.has(r.id)||!bounded(r.text,4000))throw Error('Unique explicit requirement required');ids.add(r.id);}
 if(new Set(scope.deliverables.map(x=>String(x).toLowerCase())).size!==scope.deliverables.length||scope.deliverables.some(p=>!safePath(p)))throw Error('Safe unique deliverable paths required');
 if(!Array.isArray(acceptance)||!acceptance.length||acceptance.length>20||acceptance.some(f=>!safePath(f.path)||!/^tests\//.test(f.path)||typeof f.content!=='string'))throw Error('Trusted immutable acceptance files required');
 const selected=selectWorkProfile({order:{profileId:scope.profileId},files:acceptance});
 if(selected.blockers.some(b=>b!=='certified-offline-runtime-required'))throw Error('Independent acceptance outside selected profile');
 return {scope,scopeDigest:digest(scope),acceptance:checkedJSON(acceptance),acceptanceDigest:digest(acceptance)};
}
export function validateProjectDesign(raw,scope,acceptance){
 const design=checkedJSON(raw,48000),blocked=new Set(acceptance.map(f=>f.path.toLowerCase()));
 if(!bounded(design.summary,4000)||!Array.isArray(design.components)||!design.components.length||design.components.length>32||!design.coverage||typeof design.coverage!=='object'||Array.isArray(design.coverage))throw Error('Bounded project design required');
 const paths=new Set();for(const c of design.components){if(!safePath(c.path)||paths.has(c.path.toLowerCase())||blocked.has(c.path.toLowerCase())||['manifest.json','project-design.json','project-scope.json'].includes(c.path.toLowerCase())||!bounded(c.purpose,1000))throw Error('Safe unique design path outside protected acceptance required');paths.add(c.path.toLowerCase());}
 if(scope.deliverables.some(p=>!design.components.some(c=>c.path===p)))throw Error('Design omits a deliverable');
 if(Object.keys(design.coverage).length!==scope.requirements.length||scope.requirements.some(r=>!Array.isArray(design.coverage[r.id])||!design.coverage[r.id].length||design.coverage[r.id].some(p=>!design.components.some(c=>c.path===p))))throw Error('Complete requirement coverage required');
 return design;
}
export function applyProjectFiles(previous,changes,design,scope,acceptance){
 if(!Array.isArray(changes)||!changes.length||changes.length>32)throw Error('Bounded generated files required');
 const allowed=new Set(design.components.map(c=>c.path)),protectedPaths=new Set(acceptance.map(f=>f.path.toLowerCase())),seen=new Set(),files=new Map(previous.map(f=>[f.path,f]));
 for(const f of changes){if(!f||protectedPaths.has(f.path?.toLowerCase()))throw Error('Protected independent acceptance cannot be changed');if(!allowed.has(f.path)||!safePath(f.path)||seen.has(f.path.toLowerCase())||typeof f.content!=='string'||f.content.includes('\0'))throw Error('Generated file is outside exact design');seen.add(f.path.toLowerCase());files.set(f.path,{path:f.path,content:f.content});}
 const own=[...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
 if(design.components.some(c=>!files.has(c.path))||Buffer.byteLength(JSON.stringify(own))>256000)throw Error('Complete bounded implementation required');
 const combined=[...own,...acceptance];
 const selected=selectWorkProfile({order:{profileId:scope.profileId},files:combined});
 if(selected.blockers.some(b=>b!=='certified-offline-runtime-required'))throw Error('Project files outside supported profile');
 return own;
}
