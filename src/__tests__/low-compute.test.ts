import { describe, it, expect, vi } from "vitest";
import {
  canRunInference,
  getModelForTier,
  applyTierRestrictions,
} from "../survival/low-compute.js";
import { createInferenceClient } from "../conway/inference.js";
import type { SurvivalTier } from "../types.js";

describe("canRunInference", () => {
  it("allows inference for 'high' tier", () => {
    expect(canRunInference("high")).toBe(true);
  });

  it("allows inference for 'normal' tier", () => {
    expect(canRunInference("normal")).toBe(true);
  });

  it("allows inference for 'low_compute' tier", () => {
    expect(canRunInference("low_compute")).toBe(true);
  });

  it("allows inference for 'critical' tier", () => {
    expect(canRunInference("critical")).toBe(true);
  });

  it("denies inference for 'dead' tier", () => {
    expect(canRunInference("dead")).toBe(false);
  });
});

describe("getModelForTier", () => {
  const defaultModel = "gpt-5.2";

  it("returns default model for 'high' tier", () => {
    expect(getModelForTier("high", defaultModel)).toBe(defaultModel);
  });

  it("returns default model for 'normal' tier", () => {
    expect(getModelForTier("normal", defaultModel)).toBe(defaultModel);
  });

  it("returns gpt-5-mini for 'low_compute' tier", () => {
    expect(getModelForTier("low_compute", defaultModel)).toBe("gpt-5-mini");
  });

  it("returns gpt-5-mini for 'critical' tier", () => {
    expect(getModelForTier("critical", defaultModel)).toBe("gpt-5-mini");
  });

  it("returns gpt-5-mini for 'dead' tier", () => {
    expect(getModelForTier("dead", defaultModel)).toBe("gpt-5-mini");
  });

  it("returns the default model for 'normal' tier with custom default", () => {
    expect(getModelForTier("normal", "gpt-5.2")).toBe("gpt-5.2");
  });

  it("returns a value for every tier", () => {
    const tiers: SurvivalTier[] = ["high", "normal", "low_compute", "critical", "dead"];
    for (const tier of tiers) {
      const model = getModelForTier(tier, defaultModel);
      expect(model).toBeTruthy();
    }
  });
});

describe("applyTierRestrictions", () => {
  function makeMocks() {
    return {
      inference: { setLowComputeMode: vi.fn() },
      db: {
        setKV: vi.fn(),
        getKV: vi.fn(),
        raw: {} as any,
        insertTurn: vi.fn(),
        updateTurn: vi.fn(),
        getTurnsBySession: vi.fn(),
        insertToolCall: vi.fn(),
        getToolCallsByTurn: vi.fn(),
        getChildById: vi.fn(),
        getChildren: vi.fn(),
        insertChild: vi.fn(),
        updateChild: vi.fn(),
        deleteChild: vi.fn(),
        close: vi.fn(),
      },
    };
  }

  it("sets low compute mode off for 'high' tier", () => {
    const { inference, db } = makeMocks();
    applyTierRestrictions("high", inference as any, db as any);
    expect(inference.setLowComputeMode).toHaveBeenCalledWith(false);
    expect(db.setKV).toHaveBeenCalledWith("current_tier", "high");
  });

  it("sets low compute mode off for 'normal' tier", () => {
    const { inference, db } = makeMocks();
    applyTierRestrictions("normal", inference as any, db as any);
    expect(inference.setLowComputeMode).toHaveBeenCalledWith(false);
  });

  it("sets low compute mode on for 'low_compute' tier", () => {
    const { inference, db } = makeMocks();
    applyTierRestrictions("low_compute", inference as any, db as any);
    expect(inference.setLowComputeMode).toHaveBeenCalledWith(true);
  });

  it("sets low compute mode on for 'critical' tier", () => {
    const { inference, db } = makeMocks();
    applyTierRestrictions("critical", inference as any, db as any);
    expect(inference.setLowComputeMode).toHaveBeenCalledWith(true);
  });

  it("sets low compute mode on for 'dead' tier", () => {
    const { inference, db } = makeMocks();
    applyTierRestrictions("dead", inference as any, db as any);
    expect(inference.setLowComputeMode).toHaveBeenCalledWith(true);
  });
});

describe("createInferenceClient setLowComputeMode", () => {
  const baseOptions = {
    apiUrl: "https://api.conway.tech",
    apiKey: "test-key",
    defaultModel: "gpt-5.2",
    maxTokens: 4096,
  };

  it("uses lowComputeModel when provided", () => {
    const client = createInferenceClient({
      ...baseOptions,
      lowComputeModel: "gpt-5-mini",
    });
    client.setLowComputeMode(true);
    expect(client.getDefaultModel()).toBe("gpt-5-mini");
  });

  it("falls back to gpt-5-mini when no lowComputeModel is provided", () => {
    const client = createInferenceClient(baseOptions);
    client.setLowComputeMode(true);
    expect(client.getDefaultModel()).toBe("gpt-5-mini");
  });

  it("restores defaultModel when low compute mode is disabled", () => {
    const client = createInferenceClient({
      ...baseOptions,
      lowComputeModel: "gpt-5-mini",
    });
    client.setLowComputeMode(true);
    expect(client.getDefaultModel()).toBe("gpt-5-mini");
    client.setLowComputeMode(false);
    expect(client.getDefaultModel()).toBe("gpt-5.2");
  });
});
