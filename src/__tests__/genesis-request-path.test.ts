import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getEncoding } from "js-tiktoken";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceRouter } from "../inference/router.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../inference/types.js";
import { pendingInferenceCost } from "../inference/reservations.js";
import { buildGenesisSection, inspectGenesisDelivery } from "../agent/genesis.js";
import { buildSystemPrompt } from "../agent/system-prompt.js";
import { buildContextMessages } from "../agent/context.js";
import { contextInputUpperBound, effectiveContextWindow } from "../inference/context-admission.js";
import { createInferenceClient } from "../conway/inference.js";
import { UnifiedInferenceClient } from "../inference/inference-client.js";
import type { ProviderRegistry } from "../inference/provider-registry.js";
import { createWorkerInferenceBridge } from "../agent/worker-inference-bridge.js";
import { createTestIdentity, createTestConfig } from "./mocks.js";
import { loadConfig } from "../config.js";
import type { ChatMessage } from "../types.js";

const fixture = vi.hoisted(() => ({ directory: "" }));
vi.mock("../identity/wallet.js", async importOriginal => ({
  ...await importOriginal<typeof import("../identity/wallet.js")>(),
  getAutomatonDir: () => fixture.directory,
}));

let directory: string, db: ReturnType<typeof createDatabase>;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "obolus-genesis-request-"));
  fixture.directory = directory;
  db = createDatabase(path.join(directory, "test.db"));
});
afterEach(() => { vi.unstubAllGlobals(); db.close(); fs.rmSync(directory, { recursive: true }); });

const headings = Array.from({ length: 57 }, (_, i) => `# ${i + 1}. UNIQUE_SECTION_${i + 1}\n`);
const synthetic = headings.join("Safe economic evidence.\n".repeat(25));
const longDirective = synthetic.padEnd(41380 - 12, " ") + "FINAL_REPEAT";
// Explicit opt-in local acceptance: read only Genesis, never use real credentials.
const currentPath = process.env.GENESIS_VERIFY_CONFIG;
const current = currentPath ? JSON.parse(fs.readFileSync(currentPath, "utf8")).genesisPrompt as string : longDirective;
const completion = () => ({ choices: [{ message: { role: "assistant", content: "offline" } }],
  usage: { prompt_tokens: 100, completion_tokens: 1, total_tokens: 101 } });

function prepare(directive: string) {
  fs.writeFileSync(path.join(directory, "automaton.json"), JSON.stringify(createTestConfig({
    genesisPrompt: directive, conwayApiKey: "offline-test-key",
  })));
  const config = loadConfig()!;
  expect(config.genesisPrompt === directive).toBe(true);
  const system = buildSystemPrompt({ config, identity: createTestIdentity(), db, tools: [],
    financial: { creditsCents: 1000, usdcBalance: 1, lastChecked: "offline" },
    state: "running", isFirstRun: false });
  const messages = buildContextMessages(system, [], { content: "offline verification", source: "founder" });
  const registry = new ModelRegistry(db.raw); registry.initialize();
  const router = new InferenceRouter(db.raw, registry,
    new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG, 1000), config.genesisPrompt);
  return { router, registry, messages };
}

function verifyPayload(messages: ChatMessage[], directive: string) {
  const system = messages.filter(message => message.role === "system").map(message => message.content).join("\n");
  expect(inspectGenesisDelivery(messages, directive).complete).toBe(true);
  expect(system.includes(directive)).toBe(true);
  if (!directive) return;
  for (const offset of [0, Math.floor(directive.length / 2), Math.max(0, directive.length - 80)]) {
    expect(system.includes(directive.slice(offset, offset + 80))).toBe(true);
  }
  const sections = [...directive.matchAll(/^# (\d+)\..*$/gm)].map(match => match[0]);
  let previous = -1;
  for (const section of sections) {
    const index = system.indexOf(section, previous + 1);
    expect(index).toBeGreaterThan(previous);
    previous = index;
  }
  if (sections.length) expect(sections).toHaveLength(57);
}

describe("Genesis through configuration, runtime and final provider request", () => {
  it.each(["ordinary purpose", "START\n" + "Validate safely. ".repeat(200) + "\nEND", "", longDirective])(
    "preserves a complete directive through the HTTP adapter (case %#)", async directive => {
      const { router, messages } = prepare(directive);
      const fetch = vi.fn(async (_url, init) => {
        verifyPayload(JSON.parse(init.body).messages, directive);
        return new Response(JSON.stringify(completion()));
      });
      vi.stubGlobal("fetch", fetch);
      const client = createInferenceClient({ apiUrl: "https://invalid.example", apiKey: "offline-test-key",
        openaiApiKey: "offline-test-key", defaultModel: "gpt-5-mini", maxTokens: 100 });
      const result = await router.route({ messages, tier: "low_compute", taskType: "agent_turn", sessionId: "offline", maxTokens: 100 }, client.chat);
      expect(result.finishReason).toBe("stop");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

  it("preserves all 57 sections through the worker and actual SDK request builder", async () => {
    const { router, messages } = prepare(current);
    const create = vi.fn(async (payload: { messages: ChatMessage[] }) => {
      verifyPayload(payload.messages, current);
      return completion();
    });
    const registry = { enableProvider: vi.fn(), getModel: (providerId: string, modelId: string) => ({
      provider: { id: providerId },
      model: { id: modelId, tier: "fast", costPerInputToken: 0, costPerOutputToken: 0 },
      client: { chat: { completions: { create } } },
    }) } as unknown as ProviderRegistry;
    const bridge = createWorkerInferenceBridge(router, new UnifiedInferenceClient(registry), "offline");
    await bridge.chat({ tier: "fast", messages, maxTokens: 100 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(["normal", "low_compute"] as const)("verifies the current directive at the serialized HTTP boundary (%s)", async tier => {
    const { router, messages } = prepare(current);
    const fetch = vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body);
      verifyPayload(payload.messages, current);
      if (currentPath) {
        const report = { source: "explicit-read-only-config", model: payload.model, characters: current.length,
          o200kBaseTokens: getEncoding("o200k_base").encode(current, [], []).length,
          sections: [...current.matchAll(/^# (\d+)\./gm)].length,
          beginningMiddleEnd: true, ordered: true, mockedHttp: true,
          ...inspectGenesisDelivery(payload.messages, current) };
        fs.writeFileSync(`artifacts/genesis-delivery/current-request-${tier}.json`, JSON.stringify(report, null, 2));
      }
      return new Response(JSON.stringify(completion()));
    });
    vi.stubGlobal("fetch", fetch);
    const client = createInferenceClient({ apiUrl: "https://invalid.example", apiKey: "offline-test-key",
      openaiApiKey: "offline-test-key", defaultModel: "gpt-5-mini", maxTokens: 100 });
    await router.route({ messages, tier, taskType: "agent_turn", sessionId: "offline", maxTokens: 100 }, client.chat);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1])("admits exactly the conservative context boundary, rejects one token less (%i)", async delta => {
    const { router, registry, messages } = prepare("BOUNDARY PURPOSE");
    const model = registry.getAll().find(entry => entry.modelId === "gpt-5-mini")!;
    registry.upsert({ ...model, contextWindow: contextInputUpperBound(messages, []) + 100 + delta });
    const provider = vi.fn(async () => ({ content: "offline", usage: { promptTokens: 1, completionTokens: 1 } }));
    const result = await router.route({ messages, tier: "low_compute", taskType: "agent_turn", sessionId: "offline", maxTokens: 100 }, provider);
    expect(provider).toHaveBeenCalledTimes(delta === 0 ? 1 : 0);
    expect(result.finishReason === "budget_exceeded").toBe(delta < 0);
    expect(pendingInferenceCost(db.raw)).toBe(0);
  });

  it("caps stale registry limits at the documented provider ceiling", async () => {
    expect(effectiveContextWindow("gpt-5-mini", 1047576)).toBe(400000);
    expect(effectiveContextWindow("gpt-5.2", 1047576)).toBe(400000);
    expect(effectiveContextWindow("gpt-5-mini", 20000)).toBe(20000);
    const { router, messages } = prepare("x".repeat(400000));
    const call = vi.fn();
    const result = await router.route({ messages, tier: "low_compute", taskType: "agent_turn", sessionId: "offline", maxTokens: 100 }, call);
    expect(result.finishReason).toBe("budget_exceeded");
    expect(call).not.toHaveBeenCalled();
    expect(pendingInferenceCost(db.raw)).toBe(0);
  });

  it("diagnoses sanitization and missing sections without logging their contents", () => {
    const directive = "PRIVATE_MARKER <|im_start|>";
    const section = buildGenesisSection(directive);
    const diagnostic = inspectGenesisDelivery([{ role: "system", content: section }], directive);
    expect(diagnostic.sanitizationChanged).toBe(true);
    expect(diagnostic.complete).toBe(true);
    expect(diagnostic.truncated).toBe(false);
    expect(JSON.stringify(diagnostic)).not.toContain("PRIVATE_MARKER");
    expect(inspectGenesisDelivery([], directive).reason).toBe("complete_section_missing");
    expect(inspectGenesisDelivery([], "").reason).toBe("empty_directive");
  });
});
