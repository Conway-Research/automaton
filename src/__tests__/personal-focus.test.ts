import {it,expect} from 'vitest';
import fs from 'node:fs';
import {openSimulation,candidate} from '../v1/simulation.js';
import {PERSONAL_TEST_SETTINGS} from '../v1/personal-verification.js';
import {benchmarkPersonalFocus} from '../v1/personal-benchmark.js';
it('holds the funded-case slot across connections, uncertain work and restart',()=>{
 let sim=openSimulation(undefined,{...PERSONAL_TEST_SETTINGS,maxActiveCases:1});
 let other:ReturnType<typeof openSimulation>|undefined;
 try {
  sim.runtime.discover(candidate(0));sim.runtime.discover(candidate(1));sim.runtime.control('start');
  const a=sim.runtime.claim('a')!;expect(a).not.toBeNull();
  other=openSimulation(sim.file,PERSONAL_TEST_SETTINGS,undefined,false);
  expect(other.runtime.claim('b')).toBeNull();
  other.database.close();other=undefined;
  const file=sim.file;sim.database.close();sim=openSimulation(file);
  expect(sim.runtime.settings.maxActiveCases).toBe(1);
  sim.runtime.control('resume');expect(sim.runtime.claim('b')).toBeNull();
  sim.runtime.control('pause');sim.runtime.reconcileSimulatedJobs();sim.runtime.control('resume');
  expect(sim.runtime.claim('c')?.case_id).toBe(a.case_id);
 }finally{other?.database.close();sim.database.close();fs.rmSync(sim.directory,{recursive:true,force:true});}
});
it('compares focus policies without increasing budget or activating live execution',async()=>{
 const report=await benchmarkPersonalFocus();expect(report.results).toHaveLength(12);
 expect(report.livePolicyChanged).toBe(false);
 for(const r of report.results){expect(r.spentCents+r.reservedCents).toBeLessThanOrEqual(1000);expect(r.liquidCents).toBeGreaterThanOrEqual(4000);}
 const alternating=report.results.filter(r=>r.scenario==='alternating');
 expect(alternating.find(r=>r.maxActiveCases===1)!.completed).toBeGreaterThan(alternating.find(r=>r.maxActiveCases==='unlimited')!.completed);
});
