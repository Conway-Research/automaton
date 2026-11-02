import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { openSimulation, candidate, runToIdle } from "./simulation.js";
import { DEFAULT_SETTINGS, type Job, type Settings } from "./runtime.js";

function invariant(sim: ReturnType<typeof openSimulation>): void {
  const t = sim.runtime.totals(), s = sim.runtime.settings;
  if (t.spentCents + t.reservedCents > s.spendLimitCents || t.liquidCents < s.liquidityFloorCents) throw new Error("Simulation budget invariant violated");
  const rows = sim.database.raw.prepare("SELECT receipt FROM v1_jobs WHERE status='done'").all() as { receipt: string }[];
  const cost = rows.reduce((n, row) => n + JSON.parse(row.receipt).costCents, 0);
  if (cost !== t.spentCents) throw new Error("Receipt/ledger mismatch");
}
export async function soakSimulation(days = 90, paceMs = 0) {
  if (!Number.isInteger(days) || days < 1 || days > 120) throw new Error("Soak horizon must be 1..120 simulated days");
  if (!Number.isInteger(paceMs) || paceMs < 0 || paceMs > 5000) throw new Error("Invalid soak pacing");
  const start = performance.now();
  let sim = openSimulation(undefined, { ...DEFAULT_SETTINGS, capitalCents: 1000000, liquidityFloorCents: 500000, spendLimitCents: 200000, workers: 4 });
  const originalFile = sim.file;
  let restarts = 0, emergencyStops = 0, duplicateReceipts = 0, uncertainResponses = 0;
  try {
    for (let day = 0; day < days; day++) {
      for (let n = 0; n < 3; n++) sim.runtime.discover(candidate(day * 3 + n, (day * 3 + n) % 4 !== 3));
      if (sim.runtime.status === "stopped") sim.runtime.control("start");
      else if (sim.runtime.status === "paused") sim.runtime.control("resume");
      if (day % 7 === 0) {
        sim.runtime.claim("interrupted-worker");
        const held = sim.runtime.totals().reservedCents;
        sim.database.close(); sim = openSimulation(originalFile); restarts++;
        if (sim.runtime.status !== "paused" || sim.runtime.totals().reservedCents !== held) throw new Error("Restart did not preserve state");
        uncertainResponses += sim.runtime.reconcileSimulatedJobs(); sim.runtime.control("resume");
      }
      if (day % 11 === 0) {
        sim.runtime.claim("emergency-worker"); sim.runtime.control("emergency"); emergencyStops++;
        if (sim.runtime.claim("forbidden") !== null) throw new Error("Emergency admitted work");
        uncertainResponses += sim.runtime.reconcileSimulatedJobs(); sim.runtime.control("reset"); sim.runtime.control("start");
      }
      const duplicate = sim.runtime.claim("duplicate-delivery");
      if (duplicate) {
        const receipt = sim.runtime.simulate(duplicate); sim.runtime.settle(duplicate.id, duplicate.token!, receipt);
        sim.runtime.settle(duplicate.id, duplicate.token!, receipt); duplicateReceipts++;
      }
      await runToIdle(sim.runtime); invariant(sim);
      sim.runtime.control("pause");
      if (paceMs) await new Promise(resolve => setTimeout(resolve, paceMs));
    }
    const report = { mode: "simulation", simulatedDays: days, paceMs, wallTimeMs: Math.round(performance.now() - start),
      cases: (sim.database.raw.prepare("SELECT count(*) n FROM v1_cases").get() as { n: number }).n,
      jobs: (sim.database.raw.prepare("SELECT count(*) n FROM v1_jobs").get() as { n: number }).n,
      completed: (sim.database.raw.prepare("SELECT count(*) n FROM v1_cases WHERE stage='completed'").get() as { n: number }).n,
      killed: (sim.database.raw.prepare("SELECT count(*) n FROM v1_cases WHERE stage='stopped'").get() as { n: number }).n,
      restarts, emergencyStops, uncertainResponses, duplicateReceipts, totals: sim.runtime.totals(),
      databaseBytes: fs.statSync(sim.file).size, heapUsedBytes: process.memoryUsage().heapUsed,
      database: sim.file, realProviderCalls: 0, realOrders: 0, budgetViolations: 0,
      limitation: `Accelerated synthetic workload, not ${days} days of wall-clock operation or evidence of real profit` };
    return report;
  } finally { sim.database.close(); }
}

export async function benchmarkSimulation() {
  const results = [];
  for (const workers of [1, 2, 4]) {
    for (const perTaskCents of [50, 100, 200]) {
      const settings: Settings = { ...DEFAULT_SETTINGS, workers, perTaskCents, spendLimitCents: 2000 };
      const sim = openSimulation(undefined, settings); const start = performance.now();
      let peakReserved = 0; let executed = 0;
      try {
        for (let i = 0; i < 8; i++) sim.runtime.discover(candidate(i, i % 4 !== 3));
        sim.runtime.control("start");
        for (let round = 0; round < 100; round++) {
          const jobs: Job[] = [];
          for (let w = 0; w < workers; w++) { const job = sim.runtime.claim(`w${w}`); if (job) jobs.push(job); }
          peakReserved = Math.max(peakReserved, sim.runtime.totals().reservedCents);
          if (!jobs.length) break;
          await Promise.all(jobs.map(async job => { await Promise.resolve(); sim.runtime.settle(job.id, job.token!, sim.runtime.simulate(job)); }));
          executed += jobs.length; invariant(sim);
        }
        results.push({ workers, perTaskCents, executed, peakReservedCents: peakReserved,
          elapsedMs: Math.round(performance.now() - start), ...sim.runtime.totals(), database: sim.file });
      } finally { sim.database.close(); }
    }
  }
  return { mode: "simulation", results, adoptedChanges: [],
    interpretation: "Measures local orchestration overhead and capital binding only. No real model-quality, provider-latency or profit comparison; no automatic tuning from these fixtures." };
}
