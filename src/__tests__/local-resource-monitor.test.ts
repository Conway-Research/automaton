import {afterEach,expect,it,vi} from 'vitest';
import {checkResources,formatResourceReport} from '../survival/monitor.js';
import {executeFundingStrategies} from '../survival/funding.js';
import {createConwayClient} from '../conway/client.js';
import {createTestDb,createTestConfig,createTestIdentity,MockConwayClient} from './mocks.js';

vi.mock('../conway/x402.js',()=>({getUsdcBalance:vi.fn(async()=>0)}));
afterEach(()=>vi.restoreAllMocks());

it('reports local Conway resources as unavailable without remote credit or shell calls',async()=>{
 const db=createTestDb();
 try{
  const client=createConwayClient({apiUrl:'https://example.invalid',apiKey:'fixture',sandboxId:''});
  const credits=vi.spyOn(client,'getCreditsBalance'),exec=vi.spyOn(client,'exec');
  const status=await checkResources(createTestIdentity(),client,db);
  expect(status).toMatchObject({creditStatus:'unavailable_local',sandboxHealthy:null,tier:'low_compute'});
  expect(status.financial.creditsCents).toBe(-1);
  expect(credits).not.toHaveBeenCalled();expect(exec).not.toHaveBeenCalled();
  const report=formatResourceReport(status);
  expect(report).toContain('Credits: unavailable in local mode');
  expect(report).toContain('Sandbox: unavailable in local mode');
  expect(report).not.toMatch(/UNHEALTHY|Credits: \$|Tier: dead/);
  expect(JSON.parse(db.getKV('financial_state')!)).toMatchObject({creditStatus:'unavailable_local',creditsCents:-1});
 }finally{db.close();}
});

it.each(['low_compute','critical','dead'] as const)('does not create local Conway funding notices for %s',async tier=>{
 const db=createTestDb();
 try{
  const client=createConwayClient({apiUrl:'https://example.invalid',apiKey:'fixture',sandboxId:''});
  const credits=vi.spyOn(client,'getCreditsBalance');
  db.setKV('funding_notice_dead','existing notice preserved');
  const before=db.raw.serialize();
  expect(await executeFundingStrategies(tier,createTestIdentity(),createTestConfig({sandboxId:''}),db,client)).toEqual([]);
  expect(credits).not.toHaveBeenCalled();expect(db.raw.serialize()).toEqual(before);
 }finally{db.close();}
});

it('does not treat a failed remote balance query as a verified zero balance',async()=>{
 const db=createTestDb();
 try{
  const client=new MockConwayClient();
  vi.spyOn(client,'getCreditsBalance').mockRejectedValue(new Error('fixture unavailable'));
  const status=await checkResources(createTestIdentity(),client,db);
  expect(status.creditStatus).toBe('unverified');
  expect(formatResourceReport(status)).toContain('Credits: unverified');
 }finally{db.close();}
});

it('retains successful remote balance and sandbox reporting',async()=>{
 const db=createTestDb();
 try{
  const client=new MockConwayClient();
  vi.spyOn(client,'getCreditsBalance').mockResolvedValue(12345);
  vi.spyOn(client,'exec').mockResolvedValue({exitCode:0,stdout:'ok',stderr:''});
  const status=await checkResources(createTestIdentity(),client,db);
  expect(status).toMatchObject({creditStatus:'available',sandboxHealthy:true});
  expect(formatResourceReport(status)).toContain('Credits: $123.45');
 }finally{db.close();}
});
