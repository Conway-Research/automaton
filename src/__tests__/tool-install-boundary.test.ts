import {it,expect,vi} from 'vitest';
import type {ConwayClient,AutomatonDatabase} from '../types.js';
import {installMcpServer,installNpmPackage} from '../self-mod/tools-manager.js';
it.each(['--force','../local','/absolute','@scope/../../x','https://example.test/pkg'])('rejects non-registry package %s before execution',async name=>{
 const exec=vi.fn(),installTool=vi.fn();
 expect((await installNpmPackage({exec} as unknown as ConwayClient,{installTool} as unknown as AutomatonDatabase,name)).success).toBe(false);
 expect(exec).not.toHaveBeenCalled();expect(installTool).not.toHaveBeenCalled();
});
it.each(['API_KEY','ACCESS_TOKEN','PASSWORD'])('does not store raw %s environment in MCP configuration',async key=>{
 const installTool=vi.fn(),insertModification=vi.fn();
 const result=await installMcpServer({} as ConwayClient,{installTool,insertModification} as unknown as AutomatonDatabase,'fixture','node',[],{[key]:'synthetic-value'});
 expect(result.success).toBe(false);expect(installTool).not.toHaveBeenCalled();expect(insertModification).not.toHaveBeenCalled();
});
it('preserves credential-free MCP setup and scoped registry packages without actual installation',async()=>{
 const exec=vi.fn(async()=>({exitCode:0,stdout:'',stderr:''})),installTool=vi.fn(),insertModification=vi.fn();
 const client={exec} as unknown as ConwayClient,db={installTool,insertModification} as unknown as AutomatonDatabase;
 expect((await installMcpServer(client,db,'fixture','node',['server.js'],{MODE:'offline'})).success).toBe(true);
 expect((await installNpmPackage(client,db,'@scope/example')).success).toBe(true);
 expect(exec).toHaveBeenCalledTimes(1);expect(installTool).toHaveBeenCalledTimes(2);
});
