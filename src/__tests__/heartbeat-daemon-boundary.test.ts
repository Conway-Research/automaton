import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {HeartbeatDaemonOptions} from '../heartbeat/daemon.js';
const m=vi.hoisted(()=>({tick:vi.fn(async()=>{}),execute:vi.fn(),seed:vi.fn()}));
vi.mock('../heartbeat/scheduler.js',()=>({DurableScheduler:class {tick=m.tick;executeTask=m.execute;}}));
vi.mock('../heartbeat/tasks.js',()=>({BUILTIN_TASKS:{}}));
vi.mock('../heartbeat/tick-context.js',()=>({buildTickContext:vi.fn(()=>({}))}));
vi.mock('../state/database.js',()=>({upsertHeartbeatSchedule:m.seed}));
import {createHeartbeatDaemon} from '../heartbeat/daemon.js';
function options(interval=100){return {identity:{address:'synthetic'},heartbeatConfig:{entries:[],defaultIntervalMs:interval},db:{},rawDb:{},config:{},conway:{}} as unknown as HeartbeatDaemonOptions;}
beforeEach(()=>{vi.useFakeTimers();m.tick.mockReset().mockResolvedValue(undefined);m.seed.mockClear();});
afterEach(()=>vi.useRealTimers());
it.each([0,-1,NaN,Infinity,1.5,2147483648])('rejects invalid interval %s before state writes',v=>{expect(()=>createHeartbeatDaemon(options(v))).toThrow('interval');expect(m.seed).not.toHaveBeenCalled();});
it('does not resurrect a timer chain after stop/restart during a tick',async()=>{
 const d=createHeartbeatDaemon(options());d.start();await vi.advanceTimersByTimeAsync(0);
 let release!:()=>void;m.tick.mockImplementationOnce(()=>new Promise<void>(r=>{release=r;}));
 vi.advanceTimersByTime(100);expect(m.tick).toHaveBeenCalledTimes(2);
 d.stop();d.start();d.start();release();await Promise.resolve();await Promise.resolve();
 expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(100);expect(m.tick).toHaveBeenCalledTimes(4);
 d.stop();expect(d.isRunning()).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('force run delegates only the named task',async()=>{const d=createHeartbeatDaemon(options());await d.forceRun('fixture');expect(m.execute).toHaveBeenCalledWith('fixture',{});});
