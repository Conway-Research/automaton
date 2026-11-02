import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceRouter } from "../inference/router.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../inference/types.js";
import { createInferenceClient } from "../conway/inference.js";
import { pendingInferenceCost } from "../inference/reservations.js";

let dir: string;
let db: ReturnType<typeof createDatabase>;
let observer: ReturnType<typeof createDatabase>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aureus-adapter-"));
  db = createDatabase(path.join(dir, "test.db"));
  observer = createDatabase(path.join(dir, "test.db"));
});
afterEach(() => { vi.unstubAllGlobals(); db.close(); observer.close(); fs.rmSync(dir, { recursive: true }); });
const req = { messages: [{ role: "user" as const, content: "test" }], tier: "low_compute" as const,
  taskType: "agent_turn" as const, sessionId: "test", maxTokens: 100 };
function setup() {
  const registry = new ModelRegistry(db.raw); registry.initialize();
  const router = new InferenceRouter(db.raw, registry, new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG, 1000));
  const client = createInferenceClient({ apiUrl: "https://invalid.example", apiKey: "test-only",
    openaiApiKey: "test-only", defaultModel: "gpt-5-mini", maxTokens: 100 });
  return { router, client };
}
describe("router through legacy HTTP adapter (offline)", () => {
  it("keeps its hold and makes exactly one request after a retryable failure", async () => {
    const fetch = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const { router, client } = setup();
    await expect(router.route(req, client.chat)).rejects.toThrow("503");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(pendingInferenceCost(observer.raw)).toBeGreaterThan(0);
  });
  it("preserves unknown usage instead of settling zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }))));
    const { router, client } = setup();
    await expect(router.route(req, client.chat)).rejects.toThrow("billable usage");
    expect(pendingInferenceCost(observer.raw)).toBeGreaterThan(0);
  });
  it("settles reported cost once and forwards the output limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      expect(JSON.parse(init.body).max_completion_tokens).toBe(100);
      expect(pendingInferenceCost(observer.raw)).toBeGreaterThan(0);
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok", role: "assistant" } }],
        usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }));
    }));
    const { router, client } = setup();
    expect((await router.route(req, client.chat)).costCents).toBe(1);
    expect(pendingInferenceCost(observer.raw)).toBe(0);
    expect(new InferenceBudgetTracker(observer.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getDailyCost()).toBe(1);
  });
  it("forwards external cancellation and does not retry it", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    vi.stubGlobal("fetch", fetch);
    const { client } = setup();
    const call = client.chat(req.messages, { singleAttempt: true, signal: controller.signal });
    controller.abort();
    await expect(call).rejects.toThrow("aborted");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
