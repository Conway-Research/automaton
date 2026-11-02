import {checkedJSON} from './founder-restoration-integrity.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';

function fail(message,code='PATCH_POLICY'){const error=new Error(message);error.code=code;throw error;}

/** Apply model-authored text changes atomically in memory. No source is evaluated.
 * Empty oldText explicitly means a complete replacement of an existing file.
 */
export function applyProjectPatches(previous,raw,design){
 const input=checkedJSON(raw,300000),files=checkedJSON(previous,256000);
 if(input.baseFilesDigest!==profileFilesDigest(files))fail('Patch base differs from the supplied current files','PATCH_NOT_APPLICABLE');
 if(!Array.isArray(input.patches)||!input.patches.length||input.patches.length>20)fail('Bounded model edits required');
 const allowed=new Set(design.components.map(c=>c.path)),map=new Map(files.map(f=>[f.path,f.content])),changed=new Set();
 for(const edit of input.patches){
  if(!edit||!allowed.has(edit.path)||!map.has(edit.path)||typeof edit.oldText!=='string'||typeof edit.newText!=='string'||edit.oldText.includes('\0')||edit.newText.includes('\0'))fail('Edit outside existing declared model files');
  const before=map.get(edit.path);
  if(edit.oldText==='')map.set(edit.path,edit.newText);
  else{
   const position=before.indexOf(edit.oldText);
   if(position<0)fail('Old text was not found in '+edit.path+'; supply exact current text or an explicit full replacement','PATCH_NOT_APPLICABLE');
   if(before.indexOf(edit.oldText,position+1)>=0)fail('Old text matches multiple locations in '+edit.path+'; include unique context','PATCH_NOT_APPLICABLE');
   map.set(edit.path,before.slice(0,position)+edit.newText+before.slice(position+edit.oldText.length));
  }
  changed.add(edit.path);
 }
 const result=[...changed].sort().map(path=>({path,content:map.get(path)}));
 checkedJSON([...map].map(([path,content])=>({path,content})),256000);
 return result;
}
