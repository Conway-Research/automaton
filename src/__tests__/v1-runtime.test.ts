import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { openSimulation, candidate, runToIdle, paperDemo } from "../v1/simulation.js";
import { SimulationRuntime, DEFAULT_SETTINGS } from "../v1/runtime.js";
import { createDatabase } from "../state/database.js";

let sim: ReturnType<typeof openSimulation>;
beforeEach(() => { sim = openSimulation(); });
afterEach(() => { sim.database.close(); fs.rmSync(sim.directory, { recursive: true, force: true }); });
describe("V1 economic runtime - simulation only", () => {
  it("opens an import client without interrupting an active controller or its reservations", () => {
    sim.runtime.discover(candidate(0)); sim.runtime.control("start");
    const job = sim.runtime.claim("active-worker")!;
    const client = openSimulation(sim.file, DEFAULT_SETTINGS, undefined, false);
    try {
      expect(client.runtime.status).toBe("running");
      expect(client.runtime.totals().reservedCents).toBe(job.reserved_cents);
      expect(client.database.raw.prepare("SELECT status FROM v1_jobs WHERE id=?").get(job.id)).toEqual({ status: "running" });
      sim.runtime.settle(job.id, job.token!, sim.runtime.simulate(job));
    } finally { client.database.close(); }
  });
  it("can persist an explicitly new run without overwriting an existing directory", () => {
    const directory = sim.directory + "/persistent-run";
    const saved = openSimulation(undefined, DEFAULT_SETTINGS, directory);
    saved.runtime.discover(candidate(0)); saved.database.close();
    expect(() => openSimulation(undefined, DEFAULT_SETTINGS, directory)).toThrow();
    const resumed = openSimulation(saved.file);
    expect(resumed.runtime.snapshot().cases).toHaveLength(1); resumed.database.close();
  });
  it("completes the entire economic cycle, records criteria, lessons and net results", async () => {
    const id = sim.runtime.discover(candidate(0)); sim.runtime.control("start");
    expect(await runToIdle(sim.runtime)).toBe(7);
    expect(sim.runtime.totals()).toMatchObject({ spentCents: 280, revenueCents: 1200, reservedCents: 0, netCents: 920 });
    expect(sim.runtime.revenue.getOpportunity(id)?.status).toBe("completed");
    expect(sim.runtime.snapshot().cases[0]).toMatchObject({ stage: "completed", lesson: expect.stringContaining("error 120c") });
  });
  it("kills a failed validation before launch and monetization spend", async () => {
    const id = sim.runtime.discover(candidate(1, false)); sim.runtime.control("start");
    expect(await runToIdle(sim.runtime)).toBe(2);
    expect(sim.runtime.totals().spentCents).toBe(80);
    expect(sim.runtime.revenue.getOpportunity(id)?.status).toBe("kill");
  });
  it("claims each job once across two connections and includes pending costs in shared limits", () => {
    sim.database.close(); fs.rmSync(sim.directory, { recursive: true });
    sim = openSimulation(undefined, { ...DEFAULT_SETTINGS, spendLimitCents: 100 });
    sim.runtime.discover(candidate(1)); sim.runtime.discover(candidate(2)); sim.runtime.control("start");
    const other = createDatabase(sim.file);
    try {
      const worker = new SimulationRuntime(other.raw);
      const job = sim.runtime.claim("a")!;
      expect(worker.claim("b")).toBeNull();
      expect(worker.totals().reservedCents).toBe(100);
      sim.runtime.settle(job.id, job.token!, sim.runtime.simulate(job));
      expect(worker.totals()).toMatchObject({ spentCents: 40, reservedCents: 0 });
      expect(worker.claim("b")).toBeNull();
    } finally { other.close(); }
  });
  it("does not exceed the cash liquidity floor even with a large spend allowance", () => {
    sim.database.close(); fs.rmSync(sim.directory, { recursive: true });
    sim = openSimulation(undefined, { ...DEFAULT_SETTINGS, liquidityFloorCents: 99950 });
    sim.runtime.discover(candidate(1)); sim.runtime.control("start");
    expect(sim.runtime.claim("a")).toBeNull(); expect(sim.runtime.totals().spentCents).toBe(0);
  });
  it("enforces per-case lifetime capital limits", async () => {
    const id = sim.runtime.discover({ ...candidate(0), maxCostCents: 100 }); sim.runtime.control("start");
    expect(await runToIdle(sim.runtime)).toBe(1);
    expect(sim.runtime.revenue.getOpportunity(id)?.status).toBe("kill");
  });
  it("settles a duplicate receipt once and rejects conflicting reuse", () => {
    sim.runtime.discover(candidate(0)); sim.runtime.control("start");
    const job = sim.runtime.claim("a")!; const r = sim.runtime.simulate(job);
    sim.runtime.settle(job.id, job.token!, r); sim.runtime.settle(job.id, job.token!, r);
    expect(sim.runtime.totals().spentCents).toBe(40);
    expect(() => sim.runtime.settle(job.id, job.token!, { ...r, costCents: 41 })).toThrow("Conflicting");
  });
  it("rolls settlement back if the ledger fails", () => {
    sim.runtime.discover(candidate(0)); sim.runtime.control("start"); const job = sim.runtime.claim("a")!;
    sim.database.raw.exec("CREATE TRIGGER reject_sim_cost BEFORE INSERT ON economic_events BEGIN SELECT RAISE(ABORT,'disk failure'); END;");
    expect(() => sim.runtime.settle(job.id, job.token!, sim.runtime.simulate(job))).toThrow("disk failure");
    expect(sim.runtime.totals()).toMatchObject({ spentCents: 0, reservedCents: 100 });
  });
  it("recovers paused and keeps uncertain holds across restart until explicit reconciliation", async () => {
    sim.runtime.discover(candidate(0)); sim.runtime.control("start"); sim.runtime.claim("lost-worker");
    const file = sim.file; sim.database.close(); sim = openSimulation(file);
    expect(sim.runtime.status).toBe("paused"); expect(sim.runtime.totals().reservedCents).toBe(100);
    expect(sim.runtime.claim("new-worker")).toBeNull();
    expect(sim.runtime.reconcileSimulatedJobs()).toBe(1);
    expect(sim.runtime.reconcileSimulatedJobs()).toBe(0);
    sim.runtime.control("resume"); expect(await runToIdle(sim.runtime)).toBe(6);
  });
  it("latches emergency stop and rejects stale completions until reconciliation", () => {
    sim.runtime.discover(candidate(0)); sim.runtime.control("start"); const job = sim.runtime.claim("a")!;
    sim.runtime.control("emergency");
    expect(sim.runtime.claim("b")).toBeNull();
    expect(() => sim.runtime.control("resume")).toThrow();
    expect(() => sim.runtime.control("start")).toThrow();
    expect(() => sim.runtime.settle(job.id, job.token!, sim.runtime.simulate(job))).toThrow("reconciliation");
    sim.runtime.recover(); expect(sim.runtime.status).toBe("emergency");
    sim.runtime.reconcileSimulatedJobs(); sim.runtime.control("reset"); expect(sim.runtime.status).toBe("stopped");
  });
  it("pauses new work but can account for an already completed response", () => {
    sim.runtime.discover(candidate(0)); sim.runtime.control("start"); const job = sim.runtime.claim("a")!;
    sim.runtime.control("pause"); expect(sim.runtime.claim("b")).toBeNull();
    sim.runtime.settle(job.id, job.token!, sim.runtime.simulate(job)); expect(sim.runtime.totals().spentCents).toBe(40);
  });
  it("rejects real-world evidence and oversized outcomes in the simulation boundary", () => {
    expect(() => sim.runtime.discover({ ...candidate(0), source: "https://customer.example" })).toThrow();
    sim.runtime.discover(candidate(0)); sim.runtime.control("start"); const job = sim.runtime.claim("a")!;
    expect(() => sim.runtime.settle(job.id, job.token!, { ...sim.runtime.simulate(job), costCents: 101 })).toThrow("authorised");
    expect(sim.runtime.totals().reservedCents).toBe(100);
  });
  it("does not apply simulation migrations to an unmarked database on resume", () => {
    const file = sim.directory + "/unmarked.db"; const db = createDatabase(file); db.close();
    expect(() => openSimulation(file)).toThrow();
    const check = createDatabase(file);
    expect(check.raw.prepare("SELECT name FROM sqlite_master WHERE name='v1_control'").get()).toBeUndefined(); check.close();
  });
  it("persists paper positions/results separately from economic revenue", () => {
    const report = paperDemo(sim.runtime); paperDemo(sim.runtime);
    expect(report.mode).toBe("paper"); expect(sim.runtime.snapshot().paper).toHaveLength(1);
    expect(sim.runtime.totals().revenueCents).toBe(0);
  });
});
