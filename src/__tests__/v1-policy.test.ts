import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs";
import { openSimulation } from "../v1/simulation.js";
import { activatePolicy, currentPolicy, DEFAULT_POLICY, rollbackPolicy } from "../v1/policy.js";
let sim: ReturnType<typeof openSimulation>;
beforeEach(() => { sim = openSimulation(); });
afterEach(() => { sim.database.close(); fs.rmSync(sim.directory, { recursive: true }); });
it("isolates validation, versions a measured synthetic improvement and can roll it back", async () => {
  const id = await activatePolicy(sim.database.raw, { ...DEFAULT_POLICY, evidenceWeight: 2 });
  expect(id).toBe(2); expect(currentPolicy(sim.database.raw).evidenceWeight).toBe(2);
  const version = sim.database.raw.prepare("SELECT validation FROM v1_policy_versions WHERE id=?").get(id) as { validation: string };
  expect(JSON.parse(version.validation).candidateOos).toBeGreaterThan(JSON.parse(version.validation).baselineOos);
  rollbackPolicy(sim.database.raw, 1); expect(currentPolicy(sim.database.raw)).toEqual(DEFAULT_POLICY);
});
it("cannot alter safety fields or activate unproven changes", async () => {
  await expect(activatePolicy(sim.database.raw, { ...DEFAULT_POLICY, spendLimitCents: 999999 } as any)).rejects.toThrow("safety");
  await expect(activatePolicy(sim.database.raw, DEFAULT_POLICY)).rejects.toThrow("No measured");
  expect(currentPolicy(sim.database.raw)).toEqual(DEFAULT_POLICY);
});
it("rejects tampered rollback records", async () => {
  await activatePolicy(sim.database.raw, { ...DEFAULT_POLICY, evidenceWeight: 2 });
  sim.database.raw.prepare("UPDATE v1_policy_versions SET payload='{}' WHERE id=1").run();
  expect(() => rollbackPolicy(sim.database.raw, 1)).toThrow("corrupted");
  expect(currentPolicy(sim.database.raw).evidenceWeight).toBe(2);
});
