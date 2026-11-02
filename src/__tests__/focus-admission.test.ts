import {it,expect} from 'vitest';
import fs from 'node:fs';
import {openSimulation,candidate} from '../v1/simulation.js';
import {configureFocusAdmission,releaseFocusSlot} from '../revenue/focus-admission.js';
it('atomically gates real experiment starts across connections and retains slots after terminal labels and restart',()=>{
 const sim=openSimulation();let second:ReturnType<typeof openSimulation>|undefined;
 try {
  sim.runtime.discover(candidate(0));sim.runtime.discover(candidate(1));
  const rows=sim.database.raw.prepare('SELECT id,opportunity_id FROM revenue_experiments ORDER BY id').all() as {id:string;opportunity_id:string}[];
  configureFocusAdmission(sim.database.raw,1);
  second=openSimulation(sim.file,undefined,undefined,false);
  sim.runtime.revenue.transitionExperimentStatus(rows[0].id,'running');
  expect(()=>releaseFocusSlot(sim.database.raw,rows[0].opportunity_id,'reviewed')).toThrow('Open experiments');
  expect(()=>second!.runtime.revenue.transitionExperimentStatus(rows[1].id,'running')).toThrow('focus capacity');
  expect(second.runtime.revenue.getExperiment(rows[1].id)?.status).toBe('planned');
  expect(second.runtime.revenue.getExperimentBaseline(rows[1].id)).toBeNull();
  sim.runtime.revenue.transitionExperimentStatus(rows[0].id,'stopped');
  expect(()=>second!.runtime.revenue.transitionExperimentStatus(rows[1].id,'running')).toThrow('focus capacity');
  second.database.close();second=undefined;
  const reopened=openSimulation(sim.file,undefined,undefined,false);
  try{expect(()=>reopened.runtime.revenue.updateExperiment(rows[1].id,{status:'running'})).toThrow('focus capacity');}finally{reopened.database.close();}
  expect(()=>sim.database.raw.prepare("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis) VALUES('direct',?,'running','test')").run(rows[1].opportunity_id)).toThrow('focus capacity');
  expect(releaseFocusSlot(sim.database.raw,rows[0].opportunity_id,'No outstanding obligations in fixture').released).toBe(true);
  sim.runtime.revenue.transitionExperimentStatus(rows[1].id,'running');
 }finally{second?.database.close();sim.database.close();fs.rmSync(sim.directory,{recursive:true,force:true});}
});
