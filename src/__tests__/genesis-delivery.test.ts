import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceRouter } from "../inference/router.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../inference/types.js";
import { pendingInferenceCost } from "../inference/reservations.js";
import { buildGenesisSection, withGenesis } from "../agent/genesis.js";
import { createWorkerInferenceBridge } from "../agent/worker-inference-bridge.js";
import { fitsModelContext } from "../inference/context-admission.js";

let dir: string, db: ReturnType<typeof createDatabase>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "obolus-genesis-"));
  db = createDatabase(path.join(dir, "test.db"));
});
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true }); });
const directive = Array.from({ length: 57 }, (_, index) =>
  `${index + 1}. PRINCIPLE\n${"Sustainable net economics. ".repeat(32)}`).join("\n") + "\nREPEAT.";
function router(genesis = directive) {
  const registry = new ModelRegistry(db.raw); registry.initialize();
  return new InferenceRouter(db.raw, registry,
    new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG, 1000), genesis);
}
describe("complete authoritative Genesis delivery", () => {
  it("delivers sections 55-57 and final bytes through the actual worker router", async () => {
    const chatDirect = vi.fn(async (request) => {
      const system = request.messages.filter((message: any) => message.role === "system").map((message: any) => message.content).join("\n");
      expect(system).toContain(directive);
      for (const section of [55, 56, 57]) expect(system).toContain(`${section}. PRINCIPLE`);
      return { content: "simulated", usage: { inputTokens: 12000, outputTokens: 1, totalTokens: 12001 }, cost: { inputCostCredits: 0, outputCostCredits: 0, totalCostCredits: 0 }, metadata: {providerId: "mock", modelId: "mock", tier: "fast" as const, latencyMs: 0, retries: 0, failedProviders: []} };
    });
    const bridge = createWorkerInferenceBridge(router(), { chatDirect }, "mock-session");
    await bridge.chat({ tier: "fast", messages: [{ role: "user", content: "evaluate" }], maxTokens: 100 });
    expect(chatDirect).toHaveBeenCalledTimes(1);
  });
  it("fails before spending/reservation if future Genesis growth exceeds context", async () => {
    const call = vi.fn();
    const result = await router("界".repeat(400000)).route({ messages: [], tier: "low_compute",
      taskType: "agent_turn", sessionId: "test", maxTokens: 100 }, call);
    expect(result.finishReason).toBe("budget_exceeded");
    expect(call).not.toHaveBeenCalled();
    expect(pendingInferenceCost(db.raw)).toBe(0);
  });
  it("deduplicates full system policy but never trusts user copies or partial markers", () => {
    const section = buildGenesisSection(directive);
    expect(withGenesis([{ role: "system", content: section }], directive)).toHaveLength(1);
    expect(withGenesis([{ role: "user", content: section }], directive)).toHaveLength(2);
    expect(withGenesis([{ role: "system", content: section.slice(0, 2000) }], directive)).toHaveLength(2);
  });
  it("accounts for tools, Unicode, framing and output capacity", () => {
    expect(fitsModelContext([{ role: "user", content: "short" }], [], 2000, 100)).toBe(true);
    expect(fitsModelContext([], [{ description: "界".repeat(1000) }], 2000, 100)).toBe(false);
    expect(fitsModelContext([], [], 2000, 2000)).toBe(false);
  });
});
