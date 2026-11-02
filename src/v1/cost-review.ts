import { readBounded } from "./offline-input.js";
import Database from "better-sqlite3";
import { readBudgetPolicy } from "../inference/budget-policy.js";
import { pendingInferenceCost } from "../inference/reservations.js";
import {efficiencySnapshot} from '../inference/efficiency.js';
import { previewReconciliation, reconcileInferenceCost, type CostEvidence } from "../inference/reconciliation.js";

/** Read-only for arbitrary V15 DBs; writes are restricted to marked simulations. */
export function reviewCosts(options: { database: string; evidence?: string; source?: string; apply?: boolean }) {
  if (!!options.evidence !== !!options.source || (options.apply && !options.evidence)) throw new Error("Evidence and source are required together");
  const db = new Database(options.database, { readonly: !options.apply, fileMustExist: true });
  try {
    if (options.apply) {
      const marker = db.prepare("SELECT mode FROM v1_control WHERE id=1").get() as { mode: string } | undefined;
      if (marker?.mode !== "simulation") throw new Error("Writes allowed only in a marked simulation database");
      db.pragma("foreign_keys = ON"); db.pragma("synchronous = FULL");
    }
    const version = (db.prepare("SELECT MAX(version) n FROM schema_version").get() as { n: number }).n;
    if (version < 15) throw new Error("Cost review requires schema V15; this command never migrates databases");
    let result;
    if (options.evidence && options.source) {
      const evidence = JSON.parse(readBounded(options.evidence, 16384).toString("utf8")) as CostEvidence;
      const source = readBounded(options.source, 10 * 1024 * 1024);
      const plan = options.apply ? reconcileInferenceCost(db, evidence, source) : previewReconciliation(db, evidence, source);
      result = { applied: !!options.apply, duplicate: plan.duplicate, reservationId: plan.evidence.reservationId,
        costCents: plan.evidence.costCents, reservedCents: plan.reservedCents, halt: plan.halt,
        provenance: "operator-attested offline evidence; not provider-verified" };
    }
    return { policy: readBudgetPolicy(db) ?? null, pendingCents: pendingInferenceCost(db),
      pending: db.prepare("SELECT id,model,reserved_cents,created_at FROM inference_reservations WHERE status='pending' ORDER BY created_at LIMIT 100").all(),
      reconciliation: result ?? null,efficiency:efficiencySnapshot(db) };
  } finally { db.close(); }
}
