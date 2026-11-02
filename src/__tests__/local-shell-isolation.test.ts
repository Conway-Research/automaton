import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execSync:vi.fn(()=>{throw Error('Unexpected shell execution');})}));
vi.mock('child_process',()=>({execSync:mocks.execSync}));
import {createConwayClient} from '../conway/client.js';
import {livePreflight} from '../v1/live-preflight.js';
import {isProtectedFile} from '../self-mod/code.js';

it.each(['',' ','undefined','null'])('refuses local shell execution without spawning or echoing command contents: %s',async sandboxId=>{
 const client=createConwayClient({apiUrl:'https://example.invalid',apiKey:'test-only',sandboxId});
 const result=await client.exec('echo PRIVATE_COMMAND_FIXTURE',1000);
 expect(result.exitCode).toBe(126);expect(result.stdout).toBe('');expect(result.stderr).toContain('isolated');
 expect(JSON.stringify(result)).not.toContain('PRIVATE_COMMAND_FIXTURE');expect(mocks.execSync).not.toHaveBeenCalled();
});

it('reports missing shell isolation independently of missing database configuration',()=>{
 const report=livePreflight({},{});
 expect(report.checks).toContainEqual(expect.objectContaining({id:'shell_isolation',status:'blocked'}));
 expect(report.liveReady).toBe(false);
 expect(isProtectedFile('src/conway/client.ts')).toBe(true);
 expect(isProtectedFile('dist/conway/client.js')).toBe(true);
});
