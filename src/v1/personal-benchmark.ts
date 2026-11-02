import fs from 'node:fs';
import {openSimulation,candidate,runToIdle} from './simulation.js';
import {PERSONAL_TEST_SETTINGS} from './personal-verification.js';

/** Same opportunities and costs across policies. No provider or live-policy activation. */
export async function benchmarkPersonalFocus() {
  const results=[];
  for(const scenario of ['alternating','failures-first','all-fail','all-succeed'] as const) {
    for(const maxActiveCases of [undefined,1,2]) {
      const sim=openSimulation(undefined,{...PERSONAL_TEST_SETTINGS,maxActiveCases});
      try {
        for(let i=0;i<8;i++)sim.runtime.discover(candidate(i,scenario==='all-succeed'||scenario==='alternating'&&i%2===0||scenario==='failures-first'&&i>=4));
        sim.runtime.control('start');await runToIdle(sim.runtime);
        const totals=sim.runtime.totals();
        if(totals.spentCents+totals.reservedCents>1000||totals.liquidCents<4000)throw new Error('Focus benchmark budget violation');
        results.push({scenario,maxActiveCases:maxActiveCases??'unlimited',...totals,
          completed:(sim.database.raw.prepare("SELECT COUNT(*) n FROM v1_cases WHERE stage='completed'").get() as {n:number}).n});
      }finally{sim.database.close();fs.rmSync(sim.directory,{recursive:true,force:true});}
    }
  }
  return {mode:'simulation-only',exchangeRate:'Synthetic 1 CHF = 1 USD, not a market quote',results,
    realProviderCalls:0,livePolicyChanged:false,limitation:'Four deterministic scenarios are not real demand or evidence of globally optimal allocation.'};
}
