import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { reserveInferenceCost, pendingInferenceCost } from "../inference/reservations.js";
import { SimulationRuntime } from "../v1/runtime.js";
import { reviewCosts } from "../v1/cost-review.js";

let dir: string, file: string, evidence: string, source: string, db: ReturnType<typeof createDatabase>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aureus-cost-review-")); file = path.join(dir, "test.db");
  db = createDatabase(file); new ModelRegistry(db.raw).initialize();
  const id = db.raw.transaction(() => reserveInferenceCost(db.raw, "test", undefined, "gpt-5-mini", 5)).immediate();
  source = path.join(dir, "mock.txt"); fs.writeFileSync(source, "synthetic receipt");
  evidence = path.join(dir, "evidence.json"); fs.writeFileSync(evidence, JSON.stringify({ reservationId: id, receiptId: "mock",
    model: "gpt-5-mini", provider: "openai", costCents: 2, inputTokens: 10, outputTokens: 10, currency: "USD",
    sourceSha256: createHash("sha256").update(fs.readFileSync(source)).digest("hex"), operator: "test", attested: true }));
});
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
it("previews an unmarked test DB without writing or releasing reservations", () => {
  const result = reviewCosts({ database: file, evidence, source });
  expect(result.reconciliation?.applied).toBe(false);
  expect(pendingInferenceCost(db.raw)).toBe(5);
  expect(db.raw.prepare("SELECT COUNT(*) n FROM inference_reconciliations").get()).toEqual({ n: 0 });
});
it("refuses writes to an unmarked database", () => {
  expect(() => reviewCosts({ database: file, evidence, source, apply: true })).toThrow();
  expect(pendingInferenceCost(db.raw)).toBe(5);
});
it("applies evidence once in an explicitly marked simulation", () => {
  new SimulationRuntime(db.raw);
  expect(reviewCosts({ database: file, evidence, source, apply: true }).pendingCents).toBe(0);
  expect(reviewCosts({ database: file, evidence, source, apply: true }).reconciliation?.duplicate).toBe(true);
});
it("rejects incomplete input before touching a database", () => {
  expect(() => reviewCosts({ database: "does-not-exist.db", evidence })).toThrow(/together/);
});
