import {it,expect,vi} from 'vitest';
import type {ConwayClient} from '../types.js';
import {gitStatus,gitInit,gitCommit} from '../git/tools.js';
import {initStateRepo,commitStateChange} from '../git/state-versioning.js';
const response=(stdout='',exitCode=0)=>({stdout,stderr:'',exitCode});
it.each(['status','init','commit'])('fails closed on failed git %s',async operation=>{
 const exec=vi.fn(async()=>response('',1));const client={exec} as unknown as ConwayClient;
 await expect(operation==='status'?gitStatus(client,'synthetic'):operation==='init'?gitInit(client,'synthetic'):gitCommit(client,'synthetic','test')).rejects.toThrow();
 expect(exec).toHaveBeenCalledTimes(1);
});
it.each(['automaton.json','wallet.json','nested/.env.local','state.db-wal'])('blocks sensitive indexed/unignored file %s before staging',async file=>{
 const exec=vi.fn(async()=>response(file+'\0'));const client={exec} as unknown as ConwayClient;
 await expect(commitStateChange(client,'synthetic')).rejects.toThrow('Sensitive');
 expect(exec).toHaveBeenCalledTimes(1);
});
it('does not skip sensitive-file checks for an existing state repository',async()=>{
 const exec=vi.fn(async(command:string)=>response(command.includes('rev-parse')?'true':'automaton.json\0'));
 await expect(initStateRepo({exec} as unknown as ConwayClient)).rejects.toThrow('Sensitive');
 expect(exec).toHaveBeenCalledTimes(2);
});
it('blocks a commit if the file inventory fails',async()=>{
 const exec=vi.fn(async()=>response('',1));
 await expect(commitStateChange({exec} as unknown as ConwayClient,'test')).rejects.toThrow('inventory');
 expect(exec).toHaveBeenCalledTimes(1);
});
it('ignores active config on initialization and still permits non-sensitive state commits',async()=>{
 const exec=vi.fn(async(command:string)=>response(command.includes('ls-files')?'SOUL.md\0':command.includes('status')?' M SOUL.md':'',command.includes('rev-parse')?1:0));
 const writeFile=vi.fn(async(_path:string,_content:string)=>{});const client={exec,writeFile} as unknown as ConwayClient;
 await initStateRepo(client);
 expect(writeFile.mock.calls[0]?.[1]).toContain('automaton.json\n');
 await expect(commitStateChange(client,'synthetic')).resolves.toBe('');
});
