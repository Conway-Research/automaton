import {it,expect,vi,afterEach} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRuntimeBundle,validateRuntimeBundle,installRuntimeBundle,selectedRuntimeBundle} from "../replication/runtime-bundle.js";
import {ChildLifecycle} from "../replication/lifecycle.js";
import {MockConwayClient,createTestDb,createTestIdentity,createTestConfig} from "./mocks.js";
import {spawnChild} from "../replication/spawn.js";
import {generateGenesisConfig} from "../replication/genesis.js";
const bundle=()=>createRuntimeBundle(process.cwd());
afterEach(()=>vi.unstubAllEnvs());
it("packages the local patched runtime without wallets, backups or tests",()=>{
  const result=bundle();expect(()=>validateRuntimeBundle(result)).not.toThrow();
  expect(result.files.some(file=>file.path==="src/replication/bootstrap.ts")).toBe(true);
  expect(result.files.some(file=>/backup|__tests__|wallet\.json|automaton\.json|node_modules|artifacts/.test(file.path))).toBe(false);
  expect(bundle().sha256).toBe(result.sha256);
});
it.each([false,true])("uses an operator-pinned release through the unchanged spawn call (lifecycle=%s)",async tracked=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"obolus-release-"));
  const release=bundle(),file=path.join(directory,"release.json"),client=new MockConwayClient(),db=createTestDb();
  fs.writeFileSync(file,JSON.stringify(release));
  vi.stubEnv("OBOLUS_CHILD_RUNTIME_BUNDLE",file);vi.stubEnv("OBOLUS_CHILD_RUNTIME_SHA256",release.sha256);
  const exec=vi.spyOn(client,"exec").mockImplementation(async command=>({stdout:command.includes("--init")?"0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef":"",stderr:"",exitCode:0}));
  try{
    await spawnChild(client,createTestIdentity(),db,generateGenesisConfig(createTestIdentity(),createTestConfig(),{name:"pinned-child"}),tracked?new ChildLifecycle(db.raw):undefined);
    expect(exec.mock.calls.some(([command])=>command.includes("git clone"))).toBe(false);
    expect(client.files["/root/automaton/src/replication/bootstrap.ts"]).toContain("verifyChildGenesisConfiguration");
  }finally{db.close();fs.rmSync(directory,{recursive:true});}
});
it("rejects absent, relative, malformed or modified selections without upstream fallback",async()=>{
  expect(selectedRuntimeBundle({})).toBeUndefined();
  expect(()=>selectedRuntimeBundle({OBOLUS_CHILD_RUNTIME_BUNDLE:"relative.json"})).toThrow("selection");
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"obolus-release-")),file=path.join(directory,"release.json");
  const release=bundle(),client=new MockConwayClient(),db=createTestDb();
  const provision=vi.spyOn(client,"createSandbox");
  try{
    fs.writeFileSync(file,JSON.stringify(release));
    vi.stubEnv("OBOLUS_CHILD_RUNTIME_BUNDLE",file);vi.stubEnv("OBOLUS_CHILD_RUNTIME_SHA256","0".repeat(64));
    await expect(spawnChild(client,createTestIdentity(),db,generateGenesisConfig(createTestIdentity(),createTestConfig(),{name:"invalid-child"}))).rejects.toThrow("provisioning denied");
    expect(provision).not.toHaveBeenCalled();expect(client.execCalls).toHaveLength(0);
    fs.writeFileSync(file,"not json");
    expect(()=>selectedRuntimeBundle({OBOLUS_CHILD_RUNTIME_BUNDLE:file,OBOLUS_CHILD_RUNTIME_SHA256:release.sha256})).toThrow("provisioning denied");
  }finally{db.close();fs.rmSync(directory,{recursive:true});}
});
it("rejects tampering and traversal before remote I/O",async()=>{
  const result=bundle(),client=new MockConwayClient();result.files[0].content+="modified";
  await expect(installRuntimeBundle(client,result)).rejects.toThrow("corrupt");expect(client.execCalls).toHaveLength(0);
  result.files[0].path="src/../../wallet.json";expect(()=>validateRuntimeBundle(result)).toThrow("Unsafe");
});
it("verifies remote file contents and refuses overlay or failed builds",async()=>{
  const client=new MockConwayClient();vi.spyOn(client,"exec").mockResolvedValue({stdout:"",stderr:"",exitCode:1});
  await expect(installRuntimeBundle(client,bundle())).rejects.toThrow("fresh");
  vi.spyOn(client,"exec").mockResolvedValue({stdout:"",stderr:"",exitCode:0});vi.spyOn(client,"readFile").mockResolvedValue("corrupt");
  await expect(installRuntimeBundle(client,bundle())).rejects.toThrow("integrity");
});
it("rejects a failed frozen installation or build after verified transfer",async()=>{
  const client=new MockConwayClient();
  vi.spyOn(client,"exec").mockImplementation(async command=>({stdout:"",stderr:"",exitCode:command.includes("--frozen-lockfile")?1:0}));
  await expect(installRuntimeBundle(client,bundle())).rejects.toThrow("installation failed");
});
it("uses the local bundle in the actual spawn path without cloning upstream",async()=>{
  const client=new MockConwayClient(),db=createTestDb(),identity=createTestIdentity();
  const exec=vi.spyOn(client,"exec").mockImplementation(async command=>({stdout:command.includes("--init")?"0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef":"",stderr:"",exitCode:0}));
  try{
    await spawnChild(client,identity,db,generateGenesisConfig(identity,createTestConfig(),{name:"bundle-child"}),undefined,bundle());
    expect(exec.mock.calls.some(([command])=>command.includes("git clone"))).toBe(false);
    expect(exec.mock.calls.some(([command])=>command.includes("--frozen-lockfile"))).toBe(true);
    expect(client.files["/root/automaton/src/replication/bootstrap.ts"]).toContain("verifyChildGenesisConfiguration");
  }finally{db.close();}
});
