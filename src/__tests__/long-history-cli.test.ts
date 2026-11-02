import {it,expect} from 'vitest';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {executeHistoryCommand} from '../../scripts/numaron-long-history.mjs';
it('validates CLI commands and leaves restricted imports blocked',async()=>{
 const d=mkdtempSync(join(tmpdir(),'history-cli-'));try{await expect(executeHistoryCommand(['execute-code'],{directory:d})).rejects.toThrow();await expect(executeHistoryCommand(['import','--source','jst'],{directory:d})).rejects.toThrow(/Nutzungsrechte|allowed/);const result=await executeHistoryCommand(['status'],{directory:d});expect(result.counts.datasets).toBe(0);expect(result.status).toBe('paused');expect(JSON.stringify(result)).not.toMatch(/sk-proj|password|accountIdentity/);}finally{rmSync(d,{recursive:true,force:true});}
});
