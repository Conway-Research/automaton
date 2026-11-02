import fs from 'node:fs';
import path from 'node:path';

/** Presence check only, never executes a discovered file or grants execution permission. */
export function hasRequiredBinary(name:string):boolean{
 if(!/^[a-zA-Z0-9._-]+$/.test(name)||name==='.'||name==='..')return false;
 const windows=process.platform==='win32';
 const extensions=windows?(process.env.PATHEXT||'.COM;.EXE;.BAT;.CMD').split(';').filter(x=>/^\.[a-z0-9]{1,10}$/i.test(x)):[''];
 if(windows&&path.extname(name)&&!extensions.some(ext=>ext.toLowerCase()===path.extname(name).toLowerCase()))return false;
 const names=windows?(path.extname(name)?[name]:extensions.map(ext=>name+ext)):[name];
 const directories=(process.env.PATH||'').split(path.delimiter);
 if(directories.length>256||extensions.length>32)return false;
 for(const raw of directories){
  const directory=raw.replace(/^"(.*)"$/,'$1');
  // Never implicitly inspect the current directory via empty or relative PATH entries.
  if(!path.isAbsolute(directory))continue;
  for(const candidate of names){
   const file=path.join(directory,candidate);
   try{if(!fs.statSync(file).isFile())continue;fs.accessSync(file,windows?fs.constants.F_OK:fs.constants.X_OK);return true;}catch{}
  }
 }
 return false;
}
