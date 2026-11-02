import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const state=vi.hoisted(()=>({dir:''}));
vi.mock('../identity/wallet.js',()=>({getAutomatonDir:()=>state.dir}));
vi.mock('../identity/provision.js',()=>({loadApiKeyFromConfig:()=>null}));
import {loadConfig} from '../config.js';
beforeEach(()=>{state.dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-config-load-'));});
afterEach(()=>{fs.rmSync(state.dir,{recursive:true,force:true});});
it('returns missing only when no configuration exists',()=>{
 expect(loadConfig()).toBeNull();
 expect(fs.readdirSync(state.dir)).toEqual([]);
});
it.each([
 ['malformed','{"openaiApiKey":"synthetic-private-7262"'],
 ['null','null'],
 ['array','[]'],
 ['primitive','42'],
 ['unsupported encryption',JSON.stringify({openaiApiKey:'obolus-dpapi:v99:synthetic'})],
 ['damaged encryption',JSON.stringify({openaiApiKey:'obolus-dpapi:v1:INVALID'})],
])('aborts for %s rather than reporting a first-run configuration',(_label,contents)=>{
 const file=path.join(state.dir,'automaton.json');fs.writeFileSync(file,contents);
 expect(()=>loadConfig()).toThrow('Existing configuration could not be safely loaded');
 expect(fs.readFileSync(file,'utf8')).toBe(contents);
 expect(fs.readdirSync(state.dir)).toEqual(['automaton.json']);
});
it('preserves valid legacy configuration behavior',()=>{
 fs.writeFileSync(path.join(state.dir,'automaton.json'),JSON.stringify({name:'fixture',genesisPrompt:'unchanged'}));
 expect(loadConfig()?.name).toBe('fixture');
 expect(loadConfig()?.genesisPrompt).toBe('unchanged');
});
it.each([
 {maxSingleTransferCents:'unlimited'}, {maxSingleTransferCents:-1},
 {minimumReserveCents:null}, {maxInferenceDailyCents:0.5},
 {maxTransfersPerTurn:true}, {maxDailyTransferCents:Number.MAX_SAFE_INTEGER+1},
 {x402AllowedDomains:'conway.tech'}, {x402AllowedDomains:[null]},
 {x402AllowedDomains:['https://conway.tech']},
 null, [], 'invalid',
])('rejects malformed treasury policy without fallback or rewriting: %j',treasuryPolicy=>{
 const file=path.join(state.dir,'automaton.json'),content=JSON.stringify({name:'fixture',treasuryPolicy});
 fs.writeFileSync(file,content);
 expect(()=>loadConfig()).toThrow('Existing configuration could not be safely loaded');
 expect(fs.readFileSync(file,'utf8')).toBe(content);
});
it('preserves explicit zero limits and disabled domain access',()=>{
 fs.writeFileSync(path.join(state.dir,'automaton.json'),JSON.stringify({treasuryPolicy:{maxSingleTransferCents:0,x402AllowedDomains:[]}}));
 expect(loadConfig()?.treasuryPolicy).toMatchObject({maxSingleTransferCents:0,x402AllowedDomains:[]});
});
