import {profileFilesDigest} from './founder-work-profiles.mjs';
import {checkedJSON} from './founder-restoration-integrity.mjs';
export function validateRepairAnchorProtocol(request){
 if(request.repairAnchorPolicy!==undefined&&(request.repairAnchorPolicy!=='unique-lines-v1'||request.repairEditProtocol!=='inspection-anchors-v1'))throw Error('Exact scoped unique-line anchor policy required');
 if(request.repairEditProtocol===undefined)return;
 if(request.repairEditProtocol!=='inspection-anchors-v1'||request.phase!=='repair'||request.repairProtocol!=='inspect-and-patch-v2'||request.repairTools!=='contextual-v1'||request.repairInspection!=='selected-source-only-v1')throw Error('Exact scoped source anchor protocol required');
}
export function repairSourceAnchors(request,selection,inspection){
 validateRepairAnchorProtocol(request);if(request.repairEditProtocol===undefined)throw Error('Explicit source anchor protocol required');
 const file=request.files.find(f=>f.path===selection.path);
 if(!file||file.path==='tests/test_contract.py'||inspection.path!==selection.path||inspection.filesDigest!==profileFilesDigest(request.files)||!Array.isArray(inspection.snippets)||!inspection.snippets.length||inspection.snippets.length>5||!Array.isArray(inspection.imports)||inspection.imports.length>24||inspection.snippets.some(s=>typeof s.text!=='string'||!file.content.includes(s.text))||inspection.snippets.reduce((n,s)=>n+s.text.length,0)>6000||inspection.imports.some(s=>typeof s!=='string'||!file.content.includes(s))||(inspection.wholeFile&&(inspection.snippets.length!==1||inspection.snippets[0].text!==file.content)))throw Error('Exact current source inspection required for anchors');
 const anchors=[],texts=new Set();
 for(const [kind,items]of [['s',inspection.snippets.map(s=>s.text)],['i',inspection.imports]])for(const [index,text]of items.entries()){
  if(text===''&&inspection.wholeFile&&file.content===''&&kind==='s'&&index===0){anchors.push({anchorId:'s0',text:'',start:0,end:0});continue;}
  if(!text||texts.has(text))continue;const start=file.content.indexOf(text);if(start<0||file.content.indexOf(text,start+1)>=0)continue;
  texts.add(text);anchors.push({anchorId:kind+index,text,start,end:start+text.length});
 }
 if(request.repairAnchorPolicy==='unique-lines-v1'){
  let index=0;for(const snippet of inspection.snippets)for(const text of snippet.text.match(/[^\n]*\n|[^\n]+$/g)??[]){
   if(index>=48)break;if(!text.trim()||texts.has(text))continue;const start=file.content.indexOf(text);if(start<0||file.content.indexOf(text,start+1)>=0||(start>0&&file.content[start-1]!=='\n')||(!text.endsWith('\n')&&start+text.length!==file.content.length))continue;
   texts.add(text);anchors.push({anchorId:'l'+index++,text,start,end:start+text.length});
  }
 }
 return anchors;
}
export function normalizeAnchoredRepair(raw,request,selection,inspection){
 const input=checkedJSON(raw,300000),anchors=repairSourceAnchors(request,selection,inspection),selected=[];
 if(!input||Object.keys(input).some(k=>!['baseFilesDigest','patches'].includes(k))||input.baseFilesDigest!==profileFilesDigest(request.files)||!Array.isArray(input.patches)||!input.patches.length||input.patches.length>4)throw Error('Exact bounded anchor patch format required');
 const patches=input.patches.map(p=>{
  if(!p||Object.keys(p).some(k=>!['anchorId','path','replacement'].includes(k))||typeof p.anchorId!=='string'||typeof p.replacement!=='string')throw Error('Exact anchor patch shape required');
  if(p.path!==selection.path)throw Error('Anchor repair may edit only the selected existing file');
  const anchor=anchors.find(a=>a.anchorId===p.anchorId);if(!anchor)throw Error('Unknown or ambiguous source anchor');
  if(selected.some(a=>a.anchorId===anchor.anchorId||(anchor.start<a.end&&a.start<anchor.end)))throw Error('Repeated or overlapping source anchors refused');selected.push(anchor);
  return {path:p.path,before:anchor.text,replacement:p.replacement};
 });
 return {baseFilesDigest:input.baseFilesDigest,patches};
}
