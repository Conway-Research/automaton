/**
 * Credits Management Tests
 *
 * Tests for survival tier calculation, financial state checks,
 * and credit formatting.
 */

import { describe, it, expect } from "vitest";
import { getSurvivalTier, formatCredits, checkFinancialState } from "../conway/credits.js";
import { MockConwayClient } from "./mocks.js";
import { SURVIVAL_THRESHOLDS } from "../types.js";

describe("getSurvivalTier", () => {
  it("returns 'high' when credits exceed high threshold", () => {
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.high + 1)).toBe("high");
    expect(getSurvivalTier(10_000)).toBe("high");
  });

  it("returns 'normal' when credits are between normal and high thresholds", () => {
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.normal + 1)).toBe("normal");
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.high)).toBe("normal");
  });

  it("returns 'low_compute' when credits are between low_compute and normal thresholds", () => {
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.low_compute + 1)).toBe("low_compute");
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.normal)).toBe("low_compute");
  });

  it("returns 'critical' when credits are zero", () => {
    expect(getSurvivalTier(0)).toBe("critical");
  });

  it("returns 'critical' when credits are between 0 and low_compute threshold", () => {
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.low_compute)).toBe("critical");
    expect(getSurvivalTier(1)).toBe("critical");
  });

  it("returns 'dead' when credits are negative", () => {
    expect(getSurvivalTier(-1)).toBe("dead");
    expect(getSurvivalTier(-100)).toBe("dead");
  });

  it("handles exact threshold boundaries correctly", () => {
    // At exactly the threshold value, should fall to the tier below
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.high)).toBe("normal");
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.normal)).toBe("low_compute");
    expect(getSurvivalTier(SURVIVAL_THRESHOLDS.low_compute)).toBe("critical");
  });
});

describe("formatCredits", () => {
  it("formats cents as dollar string", () => {
    expect(formatCredits(10_000)).toBe("$100.00");
    expect(formatCredits(50)).toBe("$0.50");
    expect(formatCredits(1)).toBe("$0.01");
  });

  it("formats zero credits", () => {
    expect(formatCredits(0)).toBe("$0.00");
  });

  it("formats negative credits", () => {
    expect(formatCredits(-500)).toBe("$-5.00");
  });

  it("formats fractional cents correctly", () => {
    expect(formatCredits(1234)).toBe("$12.34");
  });
});

describe("checkFinancialState", () => {
  it("returns credit balance and USDC balance", async () => {
    const conway = new MockConwayClient();
    conway.creditsCents = 5000;

    const state = await checkFinancialState(conway, 2.5);

    expect(state.creditsCents).toBe(5000);
    expect(state.usdcBalance).toBe(2.5);
    expect(state.lastChecked).toBeTruthy();
  });

  it("returns zero credits when balance is zero", async () => {
    const conway = new MockConwayClient();
    conway.creditsCents = 0;

    const state = await checkFinancialState(conway, 0);

    expect(state.creditsCents).toBe(0);
    expect(state.usdcBalance).toBe(0);
  });

  it("sets lastChecked to a valid ISO timestamp", async () => {
    const conway = new MockConwayClient();
    const before = new Date().toISOString();
    const state = await checkFinancialState(conway, 1.0);
    const after = new Date().toISOString();

    expect(state.lastChecked >= before).toBe(true);
    expect(state.lastChecked <= after).toBe(true);
  });
});
