import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createConwayClient} from '../conway/client.js';
import {createInferenceClient} from '../conway/inference.js';
import {operatingMode,conwayStartupStep,CONWAY_ONLY_TOOLS} from '../conway/operating-mode.js';
import {BUILTIN_TASKS} from '../heartbeat/tasks.js';
import {buildTickContext} from '../heartbeat/tick-context.js';
import {createBuiltinTools} from '../agent/tools.js';
import {createTestDb,createTestConfig,createTestIdentity,MockInferenceClient} from './mocks.js';
import type {ToolContext,HeartbeatLegacyContext} from '../types.js';
import {SimpleFundingProtocol,SimpleAgentTracker} from '../orchestration/simple-tracker.js';
import {Orchestrator} from '../orchestration/orchestrator.js';

const options={apiUrl:'https://api.conway.tech',apiKey:'fixture-conway-token',sandboxId:''};
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('Conway-free local infrastructure',()=>{
 it('selects a local worker instead of persisted remote children without touching remote capital',async()=>{
  const db=createTestDb();
  try{
   const tracker=new SimpleAgentTracker(db);
   tracker.register({address:'0x1234567890abcdef1234567890abcdef12345678',name:'remote',role:'generalist',sandboxId:'remote'});
   const client=createConwayClient(options),funding=new SimpleFundingProtocol(client,createTestIdentity(),db);
   const before=db.raw.serialize();
   expect(await funding.fundChild('0x1234567890abcdef1234567890abcdef12345678',1,{operationId:'op_fixture',experimentId:'fixture'})).toEqual({success:false});
   expect(db.raw.serialize()).toEqual(before);
   const spawn=vi.fn(async()=>({address:'local://fixture',name:'local',sandboxId:'local'}));
   const orchestrator=new Orchestrator({db:db.raw,agentTracker:tracker,funding,messaging:{} as any,inference:{} as any,identity:createTestIdentity(),config:{spawnAgent:spawn},isAgentEligible:address=>address.startsWith('local://')});
   expect(await orchestrator.matchTaskToAgent({id:'fixture',agentRole:'generalist'} as any)).toMatchObject({agentAddress:'local://fixture',spawned:true});
   expect(spawn).toHaveBeenCalledOnce();
   expect(db.getChildren().find(c=>c.sandboxId==='remote')?.status).toBe('running');
  }finally{db.close();}
 });
 it.each(['',' ','undefined','null'])('selects local for absent sandbox %j regardless of credentials',sandboxId=>{
  expect(operatingMode({...options,sandboxId})).toBe('local');
 });
 it('requires valid explicit mode and preserves remote selection',()=>{
  expect(operatingMode({sandboxId:'remote'})).toBe('conway');
  expect(operatingMode({sandboxId:'remote',operatingMode:'local'})).toBe('local');
  expect(()=>operatingMode({sandboxId:'',operatingMode:'invalid' as any})).toThrow('Invalid operating mode');
 });
 it('does not invoke remote startup callbacks in local mode',async()=>{
  const registration=vi.fn(),topup=vi.fn(),stateRepo=vi.fn();
  for(const action of [registration,topup,stateRepo]){
   await conwayStartupStep(operatingMode(options),action);
   expect(action).not.toHaveBeenCalled();
  }
  await conwayStartupStep('conway',registration);
  expect(registration).toHaveBeenCalledOnce();
 });
 it('blocks remote capabilities before fetch, authorization or signing',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch'),authorize=vi.fn(),sign=vi.fn();
  const client=createConwayClient({...options,authorizeMutation:authorize});
  const calls=[()=>client.getCreditsBalance(),()=>client.getCreditsPricing(),()=>client.listModels(),
   ()=>client.listSandboxes(),()=>client.createSandbox({} as any),()=>client.deleteSandbox('remote'),
   ()=>client.transferCredits('fixture',1),()=>client.searchDomains('example.test'),
   ()=>client.registerDomain('example.test',1),()=>client.listDnsRecords('example.test'),
   ()=>client.addDnsRecord('example.test','TXT','@','fixture'),()=>client.deleteDnsRecord('example.test','record'),
   ()=>client.registerAutomaton({automatonId:'fixture',automatonAddress:'fixture',creatorAddress:'fixture',name:'fixture',account:{signMessage:sign} as any})];
  for(const call of calls)await expect(call()).rejects.toMatchObject({code:'CONWAY_UNAVAILABLE_LOCAL'});
  expect(()=>client.createScopedClient!('remote')).toThrow('unavailable in local mode');
  expect(fetch).not.toHaveBeenCalled();expect(authorize).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
 });
 it('keeps local file access and does not enable local shell execution',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-local-mode-'));
  try{
   const client=createConwayClient(options),file=path.join(dir,'fixture.txt');
   await client.writeFile(file,'fixture');expect(await client.readFile(file)).toBe('fixture');
   expect(await client.exec('echo forbidden')).toMatchObject({exitCode:126});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
 it('ignores stale Conway credentials in ticks and avoids topup, death, remote health and relay checks',async()=>{
  const db=createTestDb();
  try{
   vi.stubEnv('CONWAY_API_KEY','fixture-old-token');
   const client=createConwayClient(options),credits=vi.spyOn(client,'getCreditsBalance');
   const ctx:HeartbeatLegacyContext={db,conway:client,config:createTestConfig({sandboxId:''}),identity:createTestIdentity()};
   const tick=await buildTickContext(db.raw,client,{entries:[],defaultIntervalMs:60000,lowComputeMultiplier:4});
   expect(tick.creditBalance).toBe(-1);expect(credits).not.toHaveBeenCalled();
   db.setKV('zero_credits_since','2000-01-01T00:00:00Z');
   const state=db.getAgentState();
   for(const name of ['check_credits','check_social_inbox','refresh_models','check_child_health','prune_dead_children','health_check','colony_health_check','colony_financial_report','dead_agent_cleanup']){
    expect(await BUILTIN_TASKS[name]({...tick,creditBalance:0,usdcBalance:10,survivalTier:'critical'},ctx)).toMatchObject({shouldWake:false,message:expect.stringContaining('unavailable in local mode')});
   }
   expect(await BUILTIN_TASKS.check_usdc_balance({...tick,creditBalance:0,usdcBalance:10,survivalTier:'critical'},ctx)).toMatchObject({shouldWake:false});
   expect(await BUILTIN_TASKS.heartbeat_ping({...tick,survivalTier:'critical'},ctx)).toMatchObject({shouldWake:false});
   expect(JSON.parse(db.getKV('last_heartbeat_ping')!)).toMatchObject({creditsCents:null,creditStatus:'unavailable_local'});
   expect(JSON.parse(db.getKV('last_credit_check')!)).toMatchObject({credits:null,status:'unavailable_local'});
   expect(db.getKV('last_auto_topup_attempt')).toBeUndefined();expect(db.getAgentState()).toBe(state);
   expect((await BUILTIN_TASKS.report_metrics(tick,ctx)).shouldWake).toBe(false);
  }finally{db.close();}
 });
 it('guards direct tool execution and keeps the local model catalog independent',async()=>{
  const db=createTestDb();
  try{
   const client=createConwayClient(options),models=vi.spyOn(client,'listModels');
   const ctx:ToolContext={db,conway:client,config:createTestConfig({sandboxId:''}),identity:createTestIdentity(),inference:new MockInferenceClient()};
   const tools=createBuiltinTools('');
   for(const name of CONWAY_ONLY_TOOLS){
    const tool=tools.find(t=>t.name===name);expect(tool,name).toBeDefined();
    expect(await tool!.execute({},ctx)).toContain('unavailable in local mode');
   }
   await tools.find(t=>t.name==='list_models')!.execute({},ctx);
   expect(models).not.toHaveBeenCalled();
  }finally{db.close();}
 });
 it('fails closed for Conway inference without a request',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch');
  const inference=createInferenceClient({...options,defaultModel:'unknown',maxTokens:32,allowConway:false});
  await expect(inference.chat([{role:'user',content:'fixture'}])).rejects.toThrow('Conway inference unavailable');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('routes direct OpenAI inference to OpenAI using only a mocked response',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({id:'fixture',model:'gpt-5-mini',choices:[{message:{role:'assistant',content:'fixture'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}),{status:200,headers:{'content-type':'application/json'}}));
  const inference=createInferenceClient({...options,defaultModel:'gpt-5-mini',maxTokens:32,openaiApiKey:'fixture-direct-token',allowConway:false});
  await inference.chat([{role:'user',content:'fixture'}]);
  expect(fetch).toHaveBeenCalledOnce();expect(String(fetch.mock.calls[0][0])).toBe('https://api.openai.com/v1/chat/completions');
 });
});
