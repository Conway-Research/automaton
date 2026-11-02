import fs from 'node:fs';
import {openSimulation,candidate,runToIdle} from './simulation.js';
import {type Settings} from './runtime.js';

/** Test fixture policy only, never a live spending authorization. */
export const PERSONAL_TEST_SETTINGS:Settings={capitalCents:5000,liquidityFloorCents:4000,spendLimitCents:1000,perTaskCents:100,workers:2};
export async function verifyPersonalCycle() {
  let sim=openSimulation(undefined,PERSONAL_TEST_SETTINGS);
  const directory=sim.directory;
  let second:ReturnType<typeof openSimulation>|undefined;
  try {
    for(let i=0;i<8;i++)sim.runtime.discover(candidate(i,i%2===0));
    sim.runtime.control('start');
    second=openSimulation(sim.file,PERSONAL_TEST_SETTINGS,undefined,false);
    const a=sim.runtime.claim('worker-a'),b=second.runtime.claim('worker-b');
    if(!a||!b||a.id===b.id||sim.runtime.totals().reservedCents!==200||second.runtime.claim('worker-c')!==null)throw new Error('Personal worker admission failed');
    second.database.close();second=undefined;
    const file=sim.file;sim.database.close();sim=openSimulation(file);
    if(sim.runtime.status!=='paused'||sim.runtime.totals().reservedCents!==200)throw new Error('Personal restart lost reservations');
    const recovered=sim.runtime.reconcileSimulatedJobs();sim.runtime.control('resume');
    await runToIdle(sim.runtime);
    const totals=sim.runtime.totals();
    if(totals.spentCents+totals.reservedCents>1000||totals.liquidCents<4000)throw new Error('Personal capital invariant violated');
    const currencies=sim.database.raw.prepare('SELECT DISTINCT currency FROM economic_events').all() as {currency:string}[];
    if(currencies.length!==1||currencies[0].currency!=='USD')throw new Error('Personal currency mismatch');
    return {mode:'simulation-only',currency:'USD',startingCapitalChfCents:5000,
      exchangeRate:{chfPerUsd:1,source:'synthetic fixture, NOT a market quote'},settings:sim.runtime.settings,
      totals,recoveredJobs:recovered,connections:2,
      completed:(sim.database.raw.prepare("SELECT COUNT(*) n FROM v1_cases WHERE stage='completed'").get() as {n:number}).n,
      stopped:(sim.database.raw.prepare("SELECT COUNT(*) n FROM v1_cases WHERE stage='stopped'").get() as {n:number}).n,
      pending:(sim.database.raw.prepare("SELECT COUNT(*) n FROM v1_jobs WHERE status='pending'").get() as {n:number}).n,
      realProviderCalls:0,realOrders:0,limitation:'USD ledger with explicitly synthetic 1:1 CHF conversion; no real demand, payout verification, live authorization or profit probability. Reserve and exchange rate are test assumptions, not production settings.'};
  }finally{second?.database.close();sim.database.close();fs.rmSync(directory,{recursive:true,force:true});}
}
