import { createHash } from "node:crypto";
import type { Database } from "better-sqlite3";
import { haltInferenceBudget } from "./budget-policy.js";
import { settleInferenceCost } from "./reservations.js";

/** Operator-attested offline evidence, not automatically verified provider data. */
export interface CostEvidence {
  reservationId: string; receiptId: string; model: string; provider: string;
  costCents: number; inputTokens: number; outputTokens: number;
  currency: "USD"; sourceSha256: string; operator: string; attested: true;
}
interface Reservation {
  id: string; session_id: string; experiment_id: string | null; model: string;
  reserved_cents: number; status: string;
}
interface Context { provider: string; turn_id: string | null; tier: string; task_type: string }
function canonical(e: CostEvidence): CostEvidence {
  if (!e || e.currency !== "USD" || e.attested !== true ||
      ![e.costCents, e.inputTokens, e.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0) ||
      ![e.reservationId, e.receiptId, e.model, e.provider, e.operator].every(s => typeof s === "string" && s.trim().length > 0 && s.length <= 200) ||
      !/^[a-f0-9]{64}$/.test(e.sourceSha256)) throw new Error("Invalid offline cost evidence");
  return { reservationId: e.reservationId, receiptId: e.receiptId, model: e.model, provider: e.provider,
    costCents: e.costCents, inputTokens: e.inputTokens, outputTokens: e.outputTokens,
    currency: "USD", sourceSha256: e.sourceSha256, operator: e.operator, attested: true };
}
export function previewReconciliation(db: Database, evidence: CostEvidence, source: Uint8Array) {
  const e = canonical(evidence);
  if (source.byteLength === 0 || source.byteLength > 10 * 1024 * 1024 ||
      createHash("sha256").update(source).digest("hex") !== e.sourceSha256) throw new Error("Evidence source hash mismatch or invalid size");
  const digest = createHash("sha256").update(JSON.stringify(e)).digest("hex");
  const existing = db.prepare("SELECT digest FROM inference_reconciliations WHERE reservation_id=? OR receipt_id=?")
    .all(e.reservationId, e.receiptId) as { digest: string }[];
  if (existing.length) {
    if (existing.length === 1 && existing[0].digest === digest) {
      const original = db.prepare("SELECT reserved_cents FROM inference_reservations WHERE id=?").get(e.reservationId) as { reserved_cents: number };
      return { evidence: e, digest, duplicate: true, reservedCents: original.reserved_cents, halt: e.costCents > original.reserved_cents };
    }
    throw new Error("Conflicting or reused cost receipt");
  }
  const r = db.prepare("SELECT * FROM inference_reservations WHERE id=?").get(e.reservationId) as Reservation | undefined;
  if (!r || r.status !== "pending" || r.model !== e.model) throw new Error("Reservation is not pending or model does not match");
  const context = db.prepare("SELECT * FROM inference_reservation_context WHERE reservation_id=?").get(r.id) as Context | undefined;
  const model = context ?? db.prepare("SELECT provider FROM model_registry WHERE model_id=?").get(e.model) as { provider: string } | undefined;
  if (!model || model.provider !== e.provider) throw new Error("Provider does not match registered model");
  return { evidence: e, digest, duplicate: false, reservedCents: r.reserved_cents, halt: e.costCents > r.reserved_cents };
}
/** Entire evidence, ledger entry, hold release and optional halt commit together. */
export function reconcileInferenceCost(db: Database, evidence: CostEvidence, source: Uint8Array) {
  return db.transaction(() => {
    const plan = previewReconciliation(db, evidence, source);
    if (plan.duplicate) return plan;
    const e = plan.evidence;
    const r = db.prepare("SELECT * FROM inference_reservations WHERE id=?").get(e.reservationId) as Reservation;
    const context = db.prepare("SELECT * FROM inference_reservation_context WHERE reservation_id=?").get(r.id) as Context | undefined;
    settleInferenceCost(db, r.id, () => {
      // Charge on reconciliation day: old missing invoices never create fresh
      // headroom in today's admission window. Original reservation is retained.
      db.prepare(`INSERT INTO inference_costs
        (id,session_id,experiment_id,model,provider,input_tokens,output_tokens,cost_cents,latency_ms,tier,task_type,cache_hit,turn_id)
        VALUES(?,?,?,?,?,?,?,?,0,?,?,0,?)`)
        .run(`reconcile:${r.id}`, r.session_id, r.experiment_id, e.model, e.provider, e.inputTokens, e.outputTokens, e.costCents,
          context?.tier ?? "reconciled", context?.task_type ?? "agent_turn", context?.turn_id ?? null);
      db.prepare(`INSERT INTO inference_reconciliations(reservation_id,receipt_id,digest,evidence,cost_cents)
        VALUES(?,?,?,?,?)`).run(r.id, e.receiptId, plan.digest, JSON.stringify(e), e.costCents);
      db.prepare("INSERT INTO inference_budget_audit(action,detail) VALUES('reconcile',?)")
        .run(JSON.stringify({ reservationId: r.id, receiptId: e.receiptId, costCents: e.costCents, sourceSha256: e.sourceSha256, operator: e.operator }));
      if (plan.halt) haltInferenceBudget(db, "Reconciled provider charge exceeded its reservation");
    },e.costCents);
    return plan;
  }).immediate();
}
