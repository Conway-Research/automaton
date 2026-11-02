import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Native V8 generated-function coverage, not source-mapped line/branch coverage.
export function summarizeNativeCoverage(root, directory) {
  const observed=new Map(), sourceFiles=[];
  const walk=folder=>{for(const item of fs.readdirSync(folder,{withFileTypes:true})){
    if(item.isSymbolicLink())throw Error('Unexpected source link');
    const file=path.join(folder,item.name);
    if(item.isDirectory()){if(item.name!=='__tests__')walk(file);}
    else if(item.name.endsWith('.ts'))sourceFiles.push(path.relative(root,file).replaceAll('\\','/'));
  }};
  walk(path.join(root,'src'));
  let rawFiles=0,workerReports=0;
  const incompleteProcessReports=[];
  for(const name of fs.readdirSync(directory)){
    if(!name.endsWith('.json'))continue;
    rawFiles++;
    let raw;
    try{raw=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));}
    catch{
      // Deliberate process-termination tests can leave exit-only V8 reports
      // incomplete. Preserve this measurement gap; never ignore a test worker.
      if(name.startsWith('worker-'))throw Error('Incomplete test-worker coverage');
      incompleteProcessReports.push(name);continue;
    }
    if(name.startsWith('worker-'))workerReports++;
    for(const script of raw.result??[]){
      let file;try{file=script.url.startsWith('file:')?fileURLToPath(script.url):script.url;}catch{continue;}
      const relative=path.relative(root,file).replaceAll('\\','/');
      if(!sourceFiles.includes(relative))continue;
      let functions=observed.get(relative);if(!functions){functions=new Map();observed.set(relative,functions);}
      for(const fn of script.functions){
        const range=fn.ranges[0];if(!range)continue;
        const key=`${fn.functionName}:${range.startOffset}:${range.endOffset}`;
        functions.set(key,(functions.get(key)??false)||range.count>0);
      }
    }
  }
  const files=[...observed].sort(([a],[b])=>a.localeCompare(b)).map(([file,functions])=>({file,
    observedFunctions:functions.size,executedFunctions:[...functions.values()].filter(Boolean).length}));
  const total=files.reduce((sum,file)=>sum+file.observedFunctions,0),hit=files.reduce((sum,file)=>sum+file.executedFunctions,0);
  return {metric:'Native V8 observed generated-function coverage',rawFiles,workerReports,incompleteProcessReports,sourceFiles:sourceFiles.length,
    observedSourceFiles:files.length,unobservedSourceFiles:sourceFiles.filter(file=>!observed.has(file)),
    observedFunctions:total,executedFunctions:hit,observedFunctionPercent:total?100*hit/total:null,files,
    limitation:'Includes transformation/module wrappers. Unloaded files have unknown function coverage. Not source-mapped line, branch or complete semantic coverage; not proof of security.'};
}
