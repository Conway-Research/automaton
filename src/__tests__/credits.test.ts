import { describe, it, expect } from "vitest";
import {
  getSurvivalTier,
  computeLocalCreditsCents,
  formatCredits,
} from "../conway/credits.js";

describe("computeLocalCreditsCents", () => {
  it("returns full headroom when nothing has been spent today", () => {
    expect(computeLocalCreditsCents(0, 100)).toBe(100);
  });

  it("returns remaining headroom as spend accrues", () => {
    expect(computeLocalCreditsCents(48, 100)).toBe(52);
  });

  it("returns exactly zero when spend equals the daily cap", () => {
    expect(computeLocalCreditsCents(100, 100)).toBe(0);
  });

  it("goes negative once spend exceeds the daily cap", () => {
    expect(computeLocalCreditsCents(137, 100)).toBe(-37);
  });
});

describe("getSurvivalTier with a BYOK-style virtual balance", () => {
  const dailyCapCents = 100; // $1.00/day, matching automaton.json's default

  it("stays 'normal' while comfortably under the cap", () => {
    const virtual = computeLocalCreditsCents(48, dailyCapCents);
    expect(getSurvivalTier(virtual)).toBe("normal");
  });

  it("drops to 'low_compute' once spend passes the normal threshold", () => {
    const virtual = computeLocalCreditsCents(55, dailyCapCents); // 45c left
    expect(getSurvivalTier(virtual)).toBe("low_compute");
  });

  it("drops to 'critical' once spend passes the low_compute threshold", () => {
    const virtual = computeLocalCreditsCents(95, dailyCapCents); // 5c left
    expect(getSurvivalTier(virtual)).toBe("critical");
  });

  it("only reaches 'dead' once real spend exceeds the daily cap", () => {
    const virtual = computeLocalCreditsCents(101, dailyCapCents); // -1c
    expect(getSurvivalTier(virtual)).toBe("dead");
  });

  it("formats a negative virtual balance the same as any other balance", () => {
    const virtual = computeLocalCreditsCents(150, dailyCapCents);
    expect(formatCredits(virtual)).toBe("$-0.50");
  });
});
