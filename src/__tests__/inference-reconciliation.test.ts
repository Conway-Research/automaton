import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { pendingInferenceCost, reserveInferenceCost } from "../inference/reservations.js";
import { readBudgetPolicy } from "../inference/budget-policy.js";
import { previewReconciliation, reconcileInferenceCost, type CostEvidence } from "../inference/reconciliation.js";

let dir: string, db: ReturnType<typeof createDatabase>, second: ReturnType<typeof createDatabase>, evidence: CostEvidence;
const source = Buffer.from("SYNTHETIC offline receipt, no real charge");
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aureus-reconcile-"));
  db = createDatabase(path.join(dir, "test.db")); second = createDatabase(path.join(dir, "test.db"));
  new ModelRegistry(db.raw).initialize();
  const id = db.raw.transaction(() => reserveInferenceCost(db.raw, "s", undefined, "gpt-5-mini", 5)).immediate();
  evidence = { reservationId: id, receiptId: "mock-invoice-1", model: "gpt-5-mini", provider: "openai", costCents: 3,
    inputTokens: 10, outputTokens: 10, currency: "USD", sourceSha256: createHash("sha256").update(source).digest("hex"), operator: "test", attested: true };
});
afterEach(() => { db.close(); second.close(); fs.rmSync(dir, { recursive: true, force: true }); });
describe("offline operator-attested inference reconciliation", () => {
  it("previews without mutation then books exactly once across two connections", () => {
    expect(previewReconciliation(db.raw, evidence, source).reservedCents).toBe(5);
    expect(pendingInferenceCost(db.raw)).toBe(5);
    expect(reconcileInferenceCost(db.raw, evidence, source).duplicate).toBe(false);
    expect(reconcileInferenceCost(second.raw, evidence, source).duplicate).toBe(true);
    expect(pendingInferenceCost(second.raw)).toBe(0);
    expect(db.raw.prepare("SELECT SUM(cost_cents) n FROM inference_costs").get()).toEqual({ n: 3 });
  });
  it("rejects changed or reused receipts and mismatched source hashes", () => {
    expect(() => reconcileInferenceCost(db.raw, evidence, Buffer.from("changed"))).toThrow(/hash/);
    reconcileInferenceCost(db.raw, evidence, source);
    expect(() => reconcileInferenceCost(second.raw, { ...evidence, costCents: 4 }, source)).toThrow(/Conflicting/);
    const other = db.raw.transaction(() => reserveInferenceCost(db.raw, "s", undefined, "gpt-5-mini", 5)).immediate();
    expect(() => reconcileInferenceCost(db.raw, { ...evidence, reservationId: other }, source)).toThrow(/reused/);
    expect(pendingInferenceCost(db.raw)).toBe(5);
  });
  it("rolls back evidence and release when ledger insertion fails", () => {
    db.raw.exec("CREATE TRIGGER reject_reconcile BEFORE INSERT ON inference_costs BEGIN SELECT RAISE(ABORT,'test'); END");
    expect(() => reconcileInferenceCost(db.raw, evidence, source)).toThrow();
    expect(pendingInferenceCost(second.raw)).toBe(5);
    expect(db.raw.prepare("SELECT COUNT(*) n FROM inference_reconciliations").get()).toEqual({ n: 0 });
  });
  it("books above-reservation charges honestly and latches a shared halt", () => {
    expect(reconcileInferenceCost(db.raw, { ...evidence, costCents: 9 }, source).halt).toBe(true);
    expect(readBudgetPolicy(second.raw)?.halted).toBe(1);
    expect(reconcileInferenceCost(second.raw, { ...evidence, costCents: 9 }, source)).toMatchObject({ duplicate: true, halt: true, reservedCents: 5 });
    expect(db.raw.prepare("SELECT SUM(cost_cents) n FROM inference_costs").get()).toEqual({ n: 9 });
  });
  it("releases confirmed zero charges without fabricating a payment", () => {
    reconcileInferenceCost(db.raw, { ...evidence, costCents: 0, inputTokens: 0, outputTokens: 0 }, source);
    expect(pendingInferenceCost(db.raw)).toBe(0);
    expect(db.raw.prepare("SELECT SUM(cost_cents) n FROM inference_costs").get()).toEqual({ n: 0 });
  });
  it("uses persisted provider and task attribution even if the model registry changes", () => {
    db.raw.prepare(`INSERT INTO inference_reservation_context(reservation_id,provider,turn_id,tier,task_type)
      VALUES(?,'openai','turn-original','low_compute','planning')`).run(evidence.reservationId);
    db.raw.prepare("UPDATE model_registry SET provider='anthropic' WHERE model_id='gpt-5-mini'").run();
    reconcileInferenceCost(db.raw, evidence, source);
    expect(db.raw.prepare("SELECT provider,turn_id,tier,task_type FROM inference_costs").get()).toEqual({
      provider: "openai", turn_id: "turn-original", tier: "low_compute", task_type: "planning" });
  });
  it.each([{ currency: "EUR" }, { attested: false }, { costCents: -1 }, { provider: "anthropic" }, { model: "unknown" }])("rejects invalid evidence %j", override => {
    expect(() => reconcileInferenceCost(db.raw, { ...evidence, ...override } as CostEvidence, source)).toThrow();
    expect(pendingInferenceCost(db.raw)).toBe(5);
  });
});
