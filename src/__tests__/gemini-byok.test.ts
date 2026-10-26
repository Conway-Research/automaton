import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInferenceClient } from "../conway/inference.js";
import { InferenceRouter } from "../inference/router.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { createConfig } from "../config.js";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { MIGRATION_V6 } from "../state/schema.js";

describe("Gemini BYOK Integration", () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MIGRATION_V6);
  });

  afterEach(() => {
    db.close();
  });

  it("createConfig correctly populates geminiApiKey", () => {
    const config = createConfig({
      name: "test-automaton",
      geminiApiKey: "AIzaSyTestKey123",
    });
    expect(config.geminiApiKey).toBe("AIzaSyTestKey123");
  });

  it("InferenceRouter selects synthesized gemini model when configured", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    const budget = new InferenceBudgetTracker(db, {
      inferenceModel: "gemini-2.5-flash",
    });
    const router = new InferenceRouter(db, registry, budget);

    const normalTurn = router.selectModel("normal", "agent_turn");
    expect(normalTurn).not.toBeNull();
    expect(normalTurn!.modelId).toBe("gemini-2.5-flash");
    expect(normalTurn!.provider).toBe("gemini");
    expect(normalTurn!.costPer1kInput).toBe(0);

    const lowCompute = router.selectModel("low_compute", "agent_turn");
    expect(lowCompute).not.toBeNull();
    expect(lowCompute!.modelId).toBe("gemini-2.5-flash");

    const criticalTriage = router.selectModel("critical", "heartbeat_triage");
    expect(criticalTriage).not.toBeNull();
    expect(criticalTriage!.modelId).toBe("gemini-2.5-flash");

    const criticalSummarization = router.selectModel("critical", "summarization");
    expect(criticalSummarization).toBeNull();

    const deadTurn = router.selectModel("dead", "agent_turn");
    expect(deadTurn).toBeNull();
  });

  it("InferenceClient routes requests to Google OpenAI-compatible endpoint for Gemini", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "chatcmpl-test",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello from Gemini" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const client = createInferenceClient({
        apiUrl: "https://api.conway.example.com",
        apiKey: "conway-key",
        geminiApiKey: "AIzaFakeGeminiKey",
      });

      const response = await client.chat(
        [{ role: "user", content: "hi" }],
        { model: "gemini-2.5-flash", maxTokens: 1000 }
      );

      expect(response.message.content).toBe("Hello from Gemini");
      expect(fetchMock).toHaveBeenCalled();

      const [calledUrl, requestOpts] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
      expect(requestOpts.method).toBe("POST");
      expect(requestOpts.headers.Authorization).toBe("Bearer AIzaFakeGeminiKey");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
