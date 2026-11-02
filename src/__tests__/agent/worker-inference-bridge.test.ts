import { describe, expect, it, vi } from "vitest";
import { createWorkerInferenceBridge } from "../../agent/worker-inference-bridge.js";
import { InferenceAdmissionError } from "../../agent/harness-types.js";

describe("agent/worker-inference-bridge", () => {
  it('classifies a stored-policy exception before provider access as an admission failure',async()=>{
    const route=vi.fn().mockRejectedValue(new Error('Invalid stored shared budget policy; reconciliation required'));
    const chatDirect=vi.fn();
    const bridge=createWorkerInferenceBridge({route} as any,{chatDirect},'planner-session');
    await expect(bridge.chat({messages:[{role:'user',content:'plan'}]})).rejects.toBeInstanceOf(InferenceAdmissionError);
    expect(chatDirect).not.toHaveBeenCalled();
  });
  it("routes experiment, session and options through the central budget router", async () => {
    const chatDirect = vi.fn().mockResolvedValue({ content: "ok", usage: { inputTokens: 10, outputTokens: 5 } });
    const route = vi.fn(async (request, invoke) => {
      const response = await invoke(request.messages, {
        providerId: "openai", model: "test-model", maxTokens: request.maxTokens,
        toolChoice: request.toolChoice, responseFormat: request.responseFormat,
      });
      expect(response.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
      return { content: response.message.content, finishReason: "stop" };
    });
    const bridge = createWorkerInferenceBridge({ route } as any, { chatDirect }, "session");
    expect(await bridge.chat({ messages: [{ role: "user", content: "validate" }], experimentId: "experiment",
      survivalTier: "critical", maxTokens: 123, toolChoice: "required", responseFormat: { type: "json_object" } })).toMatchObject({ content: "ok" });
    expect(route.mock.calls[0][0]).toMatchObject({ sessionId: "session", experimentId: "experiment", tier: "critical", maxTokens: 123 });
    expect(chatDirect).toHaveBeenCalledWith(expect.objectContaining({ providerId: "openai", modelId: "test-model", maxTokens: 123, toolChoice: "required", responseFormat: { type: "json_object" } }));
  });

  it("defaults to low_compute and never calls the provider after a budget denial", async () => {
    const route = vi.fn().mockResolvedValue({ content: "Budget exceeded", finishReason: "budget_exceeded" });
    const chatDirect = vi.fn();
    const bridge = createWorkerInferenceBridge({ route } as any, { chatDirect }, "session");
    await expect(bridge.chat({ messages: [{ role: "user", content: "hello" }] })).rejects.toBeInstanceOf(InferenceAdmissionError);
    expect(route.mock.calls[0][0].tier).toBe("low_compute");
    expect(chatDirect).not.toHaveBeenCalled();
  });
});
