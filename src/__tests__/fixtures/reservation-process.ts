// Executed only by the process-concurrency tests against their temporary DB.
import { createDatabase } from "../../state/database.js";
import { ModelRegistry } from "../../inference/registry.js";
import { InferenceBudgetTracker } from "../../inference/budget.js";
import { InferenceRouter } from "../../inference/router.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../../inference/types.js";

globalThis.fetch = async () => { throw new Error("Network forbidden in reservation fixture"); };
const [file, mode, limit] = process.argv.slice(2);
const db = createDatabase(file);
const router = new InferenceRouter(db.raw, new ModelRegistry(db.raw),
  new InferenceBudgetTracker(db.raw, { ...DEFAULT_MODEL_STRATEGY_CONFIG,
    hourlyBudgetCents: 1000, sessionBudgetCents: 1000 }, Number(limit)));
process.send!({ type: "ready" });
process.once("message", async () => {
  let admitted = 0;
  let denied = 0;
  try {
    for (let i = 0; i < 50; i++) {
      const result = await router.route({ messages: [{ role: "user", content: "offline" }],
        tier: "low_compute", taskType: "agent_turn", sessionId: `process-${process.pid}`, maxTokens: 100 }, async () => {
        admitted++;
        if (mode === "crash") {
          process.send!({ type: "reserved" });
          return new Promise(() => {});
        }
        // Interleave provider waits with other processes' admission transactions.
        await new Promise(resolve => setTimeout(resolve, 2));
        return { message: { content: "mock" }, usage: { promptTokens: 1, completionTokens: 1 } };
      });
      if (result.finishReason === "budget_exceeded") denied++;
      else if (result.finishReason === "error") throw new Error("Unexpected router error");
    }
    db.close();
    process.send!({ type: "done", admitted, denied }, () => process.disconnect());
  } catch {
    // Never forward arbitrary error payloads or inherited environment data.
    db.close();
    process.send!({ type: "failed" }, () => { process.exitCode = 1; process.disconnect(); });
  }
});
