import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {confineWritePath} from '../agent/write-path.js';

/** Bounded, read-only inspection. Document integrity is not a database reconciliation. */
export function inspectSkillInstallations(directory:string){
 const root=path.resolve(directory);
 if(typeof confineWritePath(root,false,root,true)!=='string')throw new Error('Unsafe skills directory.');
 const handle=fs.opendirSync(root),issues:{entry:number;status:string}[]=[];let checked=0,complete=true;
 try{
  while(true){
   const entry=handle.readSync();if(!entry)break;
   if(checked>=1000){complete=false;break;}checked++;
   if(entry.isSymbolicLink()){issues.push({entry:checked,status:'unsafe_alias'});continue;}
   if(!entry.isDirectory())continue;
   const target=path.join(root,entry.name),marker=path.join(target,'.install-pending.json');
   try{fs.lstatSync(marker);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;issues.push({entry:checked,status:'unreadable'});continue;}
   try{
    const file=path.join(target,'SKILL.md');
    for(const [item,limit] of [[marker,4096],[file,1_048_576]] as const){
     if(typeof confineWritePath(item,false,root)!=='string')throw Error();
     const stat=fs.lstatSync(item);if(!stat.isFile()||stat.size>limit)throw Error();
    }
    const manifest=JSON.parse(fs.readFileSync(marker,'utf8')),content=fs.readFileSync(file);
    const intact=manifest.version===1&&manifest.name===entry.name&&['git','url'].includes(manifest.source)&&manifest.sha256===createHash('sha256').update(content).digest('hex');
    issues.push({entry:checked,status:intact?'pending_document_intact':'pending_inconsistent'});
   }catch{issues.push({entry:checked,status:'pending_unreadable_or_unsafe'});}
  }
 }finally{handle.closeSync();}
 return {mode:'read-only',complete,checked,issues,requiresReview:!complete||issues.length>0,executionAuthorized:false,
  limitation:'Only pending-install markers and directory aliases inspected. No database reconciliation, ordinary skill integrity, recovery or activation performed. Entry ordinals are not stable identifiers.'};
}
