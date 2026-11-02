import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {writeNewProtectedIdentity,readProtectedJson} from '../security/protected-json.js';
const state=vi.hoisted(()=>({file:'',write:vi.fn()}));
// Wallet path probes and generation are synthetic; the real storage helper is
// exercised only against an explicit temporary destination.
vi.mock('fs',async original=>{
 const real=await original<typeof import('node:fs')>();
 const walletPath=(file:unknown)=>/([/\\]\.automaton|[/\\]wallet\.json)$/.test(String(file));
 return {...real,default:{...real,
  existsSync:(file:fs.PathLike)=>walletPath(file)?false:real.existsSync(file),
  mkdirSync:(...args:Parameters<typeof fs.mkdirSync>)=>walletPath(args[0])?undefined:real.mkdirSync(...args)}};
});
vi.mock('viem/accounts',()=>({generatePrivateKey:()=> 'synthetic-evm-secret',privateKeyToAccount:()=>({address:'synthetic-address'})}));
vi.mock('tweetnacl',()=>({default:{sign:{keyPair:()=>({secretKey:new Uint8Array(64).fill(7),publicKey:new Uint8Array(32).fill(8)})}}}));
vi.mock('../identity/chain.js',()=>({EvmChainIdentity:class{},SolanaChainIdentity:class{address='synthetic-solana';}}));
vi.mock('../security/protected-json.js',async original=>{
 const real=await original<typeof import('../security/protected-json.js')>();
 return {...real,writeNewProtectedIdentity:vi.fn((_file:string,value:unknown)=>state.write(value)),readProtectedJson:real.readProtectedJson};
});
import {getWallet} from '../identity/wallet.js';
let dir:string;
beforeEach(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-wallet-synthetic-'));state.file=path.join(dir,'identity.json');
 const real=await vi.importActual<typeof import('../security/protected-json.js')>('../security/protected-json.js');
 state.write.mockImplementation(value=>real.writeNewProtectedIdentity(state.file,value));
});
afterEach(()=>{vi.restoreAllMocks();fs.rmSync(dir,{recursive:true,force:true});});
it.runIf(process.platform==='win32').each(['evm','solana'] as const)('actual %s creation stores only protected synthetic secrets',async chain=>{
 const result=await getWallet(chain);expect(result).toMatchObject({isNew:true,chainType:chain});
 expect(writeNewProtectedIdentity).toHaveBeenCalled();
 const raw=fs.readFileSync(state.file,'utf8'),value=readProtectedJson(state.file);
 const secret=value.privateKey??value.secretKey;expect(typeof secret).toBe('string');expect(raw).not.toContain(secret);
 expect(raw).toContain('obolus-dpapi:v1:');
});
it.each(['evm','solana'] as const)('failed %s storage cannot report a new wallet',async chain=>{
 state.write.mockImplementation(()=>{throw Error('Protected identity write failed');});
 await expect(getWallet(chain)).rejects.toThrow('Protected identity write failed');
 expect(fs.readdirSync(dir)).toEqual([]);
});
