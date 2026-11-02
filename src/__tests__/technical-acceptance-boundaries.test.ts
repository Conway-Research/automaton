import {expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openSimulation,candidate} from '../v1/simulation.js';
import {STAGES,type Job} from '../v1/runtime.js';
import {createDatabase} from '../state/database.js';
import {livePreflight} from '../v1/live-preflight.js';
import {containSecurityIncident} from '../security/action-gate.js';

it('reports a persistent security halt read-only, including after restart, without resetting it or granting live acceptance',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-preflight-halt-')),file=path.join(dir,'fixture.db');
  let db=createDatabase(file);
  try{
    expect(livePreflight({agentFile:file},{}).checks).toContainEqual(expect.objectContaining({id:'security_stop',status:'pass'}));
    expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_security_halt'").get()).toBeUndefined();
    containSecurityIncident(db.raw);
    for(let attempt=0;attempt<2;attempt++){
      const before=db.raw.serialize();
      const report=livePreflight({agentFile:file},{});
      expect(report.checks).toContainEqual(expect.objectContaining({id:'security_stop',status:'blocked'}));
      expect(report.liveReady).toBe(false);
      expect(db.raw.serialize()).toEqual(before);
      db.close();db=createDatabase(file);
    }
    expect(db.raw.prepare('SELECT * FROM obolus_security_halt').all()).toEqual([{id:1}]);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

// These are controlled transaction-fault/restart tests of the simulation state
// machine, not process-kill, power-loss, provider or production acceptance tests.
for(const boundary of ['claimed','settlement-audit','settled','emergency'] as const){
  it.each(STAGES)(`preserves accounting and admission through ${boundary} at %s`,stage=>{
    let sim=openSimulation();
    const directory=sim.directory,file=sim.file;
    try{
      sim.runtime.discover(candidate(0));sim.runtime.control('start');
      let job:Job;
      for(;;){
        job=sim.runtime.claim('fixture-worker')!;expect(job).not.toBeNull();
        if(job.stage===stage)break;
        sim.runtime.settle(job.id,job.token!,sim.runtime.simulate(job));
      }
      const receipt=sim.runtime.simulate(job),before=sim.runtime.totals();
      if(boundary==='settlement-audit'){
        sim.database.raw.exec("CREATE TRIGGER fixture_abort BEFORE INSERT ON v1_audit WHEN NEW.action='settle' BEGIN SELECT RAISE(ABORT,'fixture interrupted commit'); END");
        expect(()=>sim.runtime.settle(job.id,job.token!,receipt)).toThrow('fixture interrupted commit');
        expect(sim.runtime.totals()).toEqual(before);
        expect(sim.database.raw.prepare("SELECT COUNT(*) n FROM economic_events WHERE experiment_id=?").get(job.experiment_id)).toEqual({n:0});
        sim.database.raw.exec('DROP TRIGGER fixture_abort');
      }
      if(boundary==='settled')sim.runtime.settle(job.id,job.token!,receipt);
      if(boundary==='emergency')sim.runtime.control('emergency');
      sim.database.close();sim=openSimulation(file);
      expect(sim.runtime.status).toBe(boundary==='emergency'?'emergency':'paused');
      expect(sim.runtime.claim('replacement')).toBeNull();
      expect(sim.runtime.totals().reservedCents).toBe(boundary==='settled'?0:job.reserved_cents);
      if(boundary!=='settled'){
        expect(()=>sim.runtime.settle(job.id,job.token!,receipt)).toThrow('reconciliation');
        expect(sim.runtime.reconcileSimulatedJobs()).toBe(1);
      }
      expect(sim.runtime.reconcileSimulatedJobs()).toBe(0);
      const settled=sim.runtime.totals();
      sim.runtime.settle(job.id,job.token!,receipt);
      expect(()=>sim.runtime.settle(job.id,job.token!,{...receipt,costCents:receipt.costCents+1})).toThrow('Conflicting');
      expect(sim.runtime.totals()).toEqual(settled);
      expect(settled.spentCents).toBe(before.spentCents+receipt.costCents);
      expect(settled.revenueCents).toBe(before.revenueCents+receipt.revenueCents);
      expect(sim.runtime.revenue.getExperiment(job.experiment_id)?.lesson).toContain('synthetic');
      expect(sim.runtime.snapshot().approvals).toMatchObject({liveExecution:'disabled',paidProviders:'disabled',shell:'disabled'});
      if(boundary==='emergency'){
        expect(()=>sim.runtime.control('resume')).toThrow();
        sim.runtime.control('reset');expect(sim.runtime.status).toBe('stopped');
      }
    }finally{sim.database.close();fs.rmSync(directory,{recursive:true,force:true});}
  });
}
