import { describe, it, expect } from "vitest";
import {
  getRoleConfig,
  buildRolePreamble,
  ROLE_CONFIGS,
  type AutomatonRole,
} from "../replication/roles.js";

describe("getRoleConfig", () => {
  it("returns correct config for each role", () => {
    const roles: AutomatonRole[] = ["generalist", "writer", "analyst", "guardian"];
    for (const role of roles) {
      expect(getRoleConfig(role)).toBe(ROLE_CONFIGS[role]);
    }
  });

  it("falls back to generalist for undefined", () => {
    expect(getRoleConfig(undefined)).toBe(ROLE_CONFIGS.generalist);
  });

  it("falls back to generalist for unknown role", () => {
    expect(getRoleConfig("unknown" as any)).toBe(ROLE_CONFIGS.generalist);
  });
});

describe("buildRolePreamble", () => {
  it("returns empty string for generalist", () => {
    expect(buildRolePreamble("generalist")).toBe("");
  });

  it("includes role name and description for writer", () => {
    const preamble = buildRolePreamble("writer");
    expect(preamble).toContain("ROLE: WRITER");
    expect(preamble).toContain(ROLE_CONFIGS.writer.description);
  });

  it("includes role name and description for analyst", () => {
    const preamble = buildRolePreamble("analyst");
    expect(preamble).toContain("ROLE: ANALYST");
    expect(preamble).toContain(ROLE_CONFIGS.analyst.description);
    expect(preamble).toContain("go to sleep");
  });

  it("includes role name and description for guardian", () => {
    const preamble = buildRolePreamble("guardian");
    expect(preamble).toContain("ROLE: GUARDIAN");
    expect(preamble).toContain(ROLE_CONFIGS.guardian.description);
  });
});

describe("role config properties", () => {
  it("guardian uses low-compute model, analyst uses frontier model (gpt-4.1 vs gpt-5.2)", () => {
    expect(ROLE_CONFIGS.guardian.inferenceModel).toBe("gpt-4.1");
    expect(ROLE_CONFIGS.analyst.inferenceModel).toBe("gpt-5.2");
  });

  it("guardian heartbeatMultiplier < generalist < writer", () => {
    expect(ROLE_CONFIGS.guardian.heartbeatMultiplier).toBeLessThan(
      ROLE_CONFIGS.generalist.heartbeatMultiplier,
    );
    expect(ROLE_CONFIGS.generalist.heartbeatMultiplier).toBeLessThan(
      ROLE_CONFIGS.writer.heartbeatMultiplier,
    );
  });

  it("analyst has autoSleep = true, guardian does not", () => {
    expect(ROLE_CONFIGS.analyst.autoSleep).toBe(true);
    expect(ROLE_CONFIGS.guardian.autoSleep).toBe(false);
  });

  it("writer has higher maxTokensPerTurn than guardian", () => {
    expect(ROLE_CONFIGS.writer.maxTokensPerTurn).toBeGreaterThan(
      ROLE_CONFIGS.guardian.maxTokensPerTurn,
    );
  });
});
