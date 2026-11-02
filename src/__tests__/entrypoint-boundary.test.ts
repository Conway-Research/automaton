import {it,expect,vi,afterEach} from 'vitest';
const m=vi.hoisted(()=>({wallet:vi.fn(),config:vi.fn(),db:vi.fn(),loop:vi.fn(),log:vi.fn()}));
vi.mock('../identity/wallet.js',()=>({getWallet:m.wallet,getAutomatonDir:()=>'/synthetic'}));
vi.mock('../config.js',()=>({loadConfig:m.config,resolvePath:(s:string)=>s}));
vi.mock('../state/database.js',async original=>({...await original<object>(),createDatabase:m.db}));
vi.mock('../agent/loop.js',()=>({runAgentLoop:m.loop}));
vi.mock('../observability/logger.js',async original=>({...await original<object>(),createLogger:()=>({info:m.log,error:m.log,warn:m.log,debug:m.log})}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('default entrypoint only prints usage and never initializes wallet, database or agent',async()=>{const saved=process.argv;process.argv=['node','synthetic'];try{await import('../index.js');await Promise.resolve();expect(m.log).toHaveBeenCalled();expect(m.wallet).not.toHaveBeenCalled();expect(m.config).not.toHaveBeenCalled();expect(m.db).not.toHaveBeenCalled();expect(m.loop).not.toHaveBeenCalled();}finally{process.argv=saved;}});
