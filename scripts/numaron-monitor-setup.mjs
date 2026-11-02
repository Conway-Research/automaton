import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {openMonitorCoordination,openMonitorState,atomicJSON} from './numaron-monitor.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function validateMonitorHandoff(automation,proof){
 const status=automation.match(/^status\s*=\s*"([^"]+)"/m)?.[1],target=automation.match(/^target_thread_id\s*=\s*"([^"]+)"/m)?.[1];
 if(status!=='PAUSED'||proof.status!=='completed'||proof.noActiveOrderRuns!==true||proof.threadId!==target||typeof proof.completion!=='string')throw Error('Codex handoff not complete; local monitor remains disabled');return true;
}
export function prepareMonitor({base=root,proofFile,automationFile=path.join(os.homedir(),'.codex/automations/obolus-auftr-ge-berwachen/automation.toml')}){
 const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));validateMonitorHandoff(fs.readFileSync(automationFile,'utf8'),proof);
 const completion=JSON.parse(fs.readFileSync(path.join(base,proof.completion),'utf8')),lastDirectory=path.dirname(path.join(base,proof.completion)),register=JSON.parse(fs.readFileSync(path.join(lastDirectory,'source-register.json'),'utf8'));
 const discoveryNextPage=register.github?.filteredLabelBountyCreated?.nextPage;if(!Number.isSafeInteger(discoveryNextPage))throw Error('Latest cursor unavailable');
 const dir=path.join(base,'artifacts/numaron-local-monitor');fs.mkdirSync(dir,{recursive:true,mode:0o700});const configFile=path.join(dir,'config.json');
 if(fs.existsSync(configFile))throw Error('Monitor already configured; preserve current cursor');
 const historical=JSON.parse(fs.readFileSync(path.join(base,'artifacts/order-monitor-20261017-1253/github.json'),'utf8'));
 const tracked=historical.map(({repo,n,type})=>({repo,n,type}));
 const config={schema:'numaron-local-monitor-v1',intervalMs:600000,discoveryNextPage,rewardAINextPage:register.github?.rewardAINextPage??21,unfilteredNextPage:register.github?.unfilteredNextPage??24,tracked,sourceRegister:path.relative(base,path.join(lastDirectory,'source-register.json')).replaceAll('\\','/'),submissionMode:'disabled; existing controller remains sole protected execution path',usesExistingApiRuntime:true};
 const state=openMonitorState(path.join(dir,'sources.db')),coordination=openMonitorCoordination(path.join(dir,'coordination.db'));
 try{
  if(coordination.snapshot().owner!=='disabled')throw Error('Monitor ownership already assigned');
  const checked=Date.parse(register.github.checkedAt);state.save('github-discovery',{cursor:discoveryNextPage,checkedAt:checked,nextAt:checked+600000,status:'imported-last-success',evidence:path.join(lastDirectory,'github-read.json')});
  for(const t of tracked){const id='github-'+t.repo.replace('/','-')+'-'+t.n;state.save(id,{checkedAt:null,nextAt:0,status:'not-checked'});}
  const ugig=register.ugig?.lastSuccessful;state.save('ugig',{checkedAt:Date.parse(ugig?.checkedAt??ugig?.observedAtApprox??ugig?.recordedAt)||null,nextAt:0,status:'access-required',evidence:path.join(lastDirectory,'ugig-browser.json')});
  state.save('guru',{checkedAt:Date.parse(register.guru?.checkedAt)||null,nextAt:0,status:'access-required'});
  atomicJSON(configFile,config);atomicJSON(path.join(dir,'handoff.json'),{at:new Date().toISOString(),proof,prior:proof.completion,latestGitHubNextPage:discoveryNextPage,existingRuntimeUnmodified:true});
  // Re-read immediately before ownership transfer. No monitor process is started here.
  validateMonitorHandoff(fs.readFileSync(automationFile,'utf8'),proof);coordination.setOwner('local',path.relative(base,proofFile).replaceAll('\\','/'));
  atomicJSON(path.join(dir,'schedule.json'),{nextAt:Math.max(Date.now(),Date.parse(completion.at)+600000)});
 }finally{state.close();coordination.close();}
 return {directory:dir,discoveryNextPage,owner:'local'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--activate'&&process.argv.length===4)console.log(JSON.stringify(prepareMonitor({proofFile:path.resolve(process.argv[3])})));
 else if(process.argv[2]==='--status'&&process.argv.length===3){const c=openMonitorCoordination(path.join(root,'artifacts/numaron-local-monitor/coordination.db'));try{console.log(JSON.stringify(c.snapshot()));}finally{c.close();}}
 else throw Error('Use --activate <verified-handoff.json> or --status');
}
