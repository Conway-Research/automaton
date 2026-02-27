import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PlanModeController,
  loadPlan,
  persistPlan,
  reviewPlan,
  shouldReplan,
  type ExecutionState,
  type PlanApprovalConfig,
} from "../../orchestration/plan-mode.js";
import type { PlannerOutput } from "../../orchestration/planner.js";
import { createInMemoryDb } from "./test-db.js";

function makePlan(overrides: Partial<PlannerOutput> = {}): PlannerOutput {
  return {
    analysis: "Analyze constraints",
    strategy: "Ship incrementally",
    customRoles: [],
    tasks: [
      {
        title: "Implement core",
        description: "Implement the core feature and validate behavior.",
        agentRole: "engineer",
        dependencies: [],
        estimatedCostCents: 1200,
        priority: 1,
        timeoutMs: 60_000,
      },
    ],
    risks: ["Risk: unknown dependency"],
    estimatedTotalCostCents: 1200,
    estimatedTimeMinutes: 30,
    ...overrides,
  };
}

function baseState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    phase: "executing",
    goalId: "goal-1",
    planId: "plan-1",
    planVersion: 1,
    planFilePath: "/tmp/plan.json",
    spawnedAgentIds: [],
    replansRemaining: 3,
    phaseEnteredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("orchestration/plan-mode", () => {
  let db: BetterSqlite3.Database;
  let controller: PlanModeController;
  let tempDirs: string[];

  beforeEach(() => {
    db = createInMemoryDb();
    controller = new PlanModeController(db);
    tempDirs = [];
  });

  afterEach(async () => {
    db.close();
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function newTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "plan-mode-test-"));
    tempDirs.push(dir);
    return dir;
  }

  describe("PlanModeController transitions", () => {
    it("returns default state when KV is empty", () => {
      const state = controller.getState();
      expect(state.phase).toBe("idle");
      expect(state.goalId).toBe("");
      expect(state.planId).toBeNull();
      expect(state.replansRemaining).toBe(3);
      expect(state.phaseEnteredAt.length).toBeGreaterThan(0);
    });

    it("allows idle -> classifying", () => {
      controller.transition("idle", "classifying", "start");
      expect(controller.getState().phase).toBe("classifying");
    });

    it("allows classifying -> planning", () => {
      controller.setState({ phase: "classifying" });
      controller.transition("classifying", "planning", "needs plan");
      expect(controller.getState().phase).toBe("planning");
    });

    it("allows classifying -> executing", () => {
      controller.setState({ phase: "classifying" });
      controller.transition("classifying", "executing", "simple task");
      expect(controller.getState().phase).toBe("executing");
    });

    it("allows planning -> plan_review", () => {
      controller.setState({ phase: "planning" });
      controller.transition("planning", "plan_review", "draft complete");
      expect(controller.getState().phase).toBe("plan_review");
    });

    it("allows plan_review -> executing", () => {
      controller.setState({ phase: "plan_review" });
      controller.transition("plan_review", "executing", "approved");
      expect(controller.getState().phase).toBe("executing");
    });

    it("allows plan_review -> planning", () => {
      controller.setState({ phase: "plan_review" });
      controller.transition("plan_review", "planning", "needs revision");
      expect(controller.getState().phase).toBe("planning");
    });

    it("allows executing -> replanning and updates counters", () => {
      controller.setState({ phase: "executing", replansRemaining: 2, planVersion: 4 });
      controller.transition("executing", "replanning", "failure");

      const state = controller.getState();
      expect(state.phase).toBe("replanning");
      expect(state.replansRemaining).toBe(1);
      expect(state.planVersion).toBe(5);
    });

    it("allows replanning -> plan_review", () => {
      controller.setState({ phase: "replanning" });
      controller.transition("replanning", "plan_review", "new plan drafted");
      expect(controller.getState().phase).toBe("plan_review");
    });

    it("allows transition to failed from any phase", () => {
      controller.setState({ phase: "planning" });
      controller.transition("planning", "failed", "fatal");
      expect(controller.getState().phase).toBe("failed");
    });

    it("throws when from phase does not match current phase", () => {
      controller.setState({ phase: "planning" });
      expect(() => controller.transition("idle", "classifying", "bad precondition")).toThrow(
        /Invalid transition precondition/,
      );
    });

    it("throws for invalid transition edge", () => {
      controller.setState({ phase: "idle" });
      expect(() => controller.transition("idle", "executing", "skip")).toThrow(
        "Invalid transition 'idle' -> 'executing' (reason: skip)",
      );
    });

    it("throws for transitions out of complete", () => {
      controller.setState({ phase: "complete" });
      expect(() => controller.transition("complete", "planning", "reopen")).toThrow(/Invalid transition/);
    });
  });

  describe("canSpawnAgents", () => {
    it("returns false while idle", () => {
      controller.setState({ phase: "idle", planId: "plan-1" });
      expect(controller.canSpawnAgents()).toBe(false);
    });

    it("returns false in executing when planId is null", () => {
      controller.setState({ phase: "executing", planId: null });
      expect(controller.canSpawnAgents()).toBe(false);
    });

    it("returns true only in executing with planId", () => {
      controller.setState({ phase: "executing", planId: "plan-1" });
      expect(controller.canSpawnAgents()).toBe(true);
    });

    it("returns false in non-executing phase even with planId", () => {
      controller.setState({ phase: "planning", planId: "plan-1" });
      expect(controller.canSpawnAgents()).toBe(false);
    });
  });

  describe("state persistence", () => {
    it("setState persists to KV and getState reads it", () => {
      controller.setState({ phase: "executing", goalId: "g-1", planId: "p-1", replansRemaining: 2 });

      const row = db.prepare("SELECT value FROM kv WHERE key = 'plan_mode.state'").get() as
        | { value: string }
        | undefined;

      expect(row).toBeDefined();
      expect(controller.getState()).toMatchObject({
        phase: "executing",
        goalId: "g-1",
        planId: "p-1",
        replansRemaining: 2,
      });
    });

    it("setState merges partial state", () => {
      controller.setState({ phase: "executing", goalId: "g-1", planId: "p-1", planVersion: 2 });
      controller.setState({ replansRemaining: 1 });

      expect(controller.getState()).toMatchObject({
        phase: "executing",
        goalId: "g-1",
        planId: "p-1",
        planVersion: 2,
        replansRemaining: 1,
      });
    });

    it("phase changes update phaseEnteredAt automatically", () => {
      controller.setState({ phase: "idle", phaseEnteredAt: "2026-01-01T00:00:00.000Z" });
      controller.setState({ phase: "classifying" });

      expect(controller.getState().phaseEnteredAt).not.toBe("2026-01-01T00:00:00.000Z");
    });

    it("explicit phaseEnteredAt is preserved", () => {
      controller.setState({ phase: "planning", phaseEnteredAt: "2026-02-01T00:00:00.000Z" });
      expect(controller.getState().phaseEnteredAt).toBe("2026-02-01T00:00:00.000Z");
    });

    it("getState falls back on malformed JSON", () => {
      db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))")
        .run("plan_mode.state", "{bad json");

      expect(controller.getState().phase).toBe("idle");
    });

    it("getState sanitizes invalid values", () => {
      db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))")
        .run("plan_mode.state", JSON.stringify({
          phase: "not-a-phase",
          goalId: 123,
          planId: 456,
          planVersion: -10,
          planFilePath: 111,
          spawnedAgentIds: ["a", 1, "b"],
          replansRemaining: -5,
          phaseEnteredAt: "",
        }));

      const state = controller.getState();
      expect(state.phase).toBe("idle");
      expect(state.goalId).toBe("");
      expect(state.planId).toBeNull();
      expect(state.planVersion).toBe(0);
      expect(state.planFilePath).toBeNull();
      expect(state.spawnedAgentIds).toEqual(["a", "b"]);
      expect(state.replansRemaining).toBeGreaterThanOrEqual(0);
      expect(state.phaseEnteredAt.length).toBeGreaterThan(0);
    });
  });

  describe("persistPlan / loadPlan", () => {
    it("persistPlan writes plan.json and plan.md", async () => {
      const dir = await newTempDir();
      const result = await persistPlan({
        goalId: "goal-1",
        version: 1,
        plan: makePlan(),
        workspacePath: dir,
      });

      expect(await stat(result.jsonPath)).toBeDefined();
      expect(await stat(result.mdPath)).toBeDefined();

      const json = await readFile(result.jsonPath, "utf8");
      const md = await readFile(result.mdPath, "utf8");
      expect(json).toContain("\"analysis\"");
      expect(md).toContain("# Plan: goal-1 (v1)");
      expect(md).toContain("## Tasks");
    });

    it("persistPlan archives previous json version", async () => {
      const dir = await newTempDir();

      await persistPlan({
        goalId: "goal-1",
        version: 1,
        plan: makePlan({ analysis: "first" }),
        workspacePath: dir,
      });

      await persistPlan({
        goalId: "goal-1",
        version: 2,
        plan: makePlan({ analysis: "second" }),
        workspacePath: dir,
      });

      const archived = await readFile(path.join(dir, "plan-v1.json"), "utf8");
      const latest = await readFile(path.join(dir, "plan.json"), "utf8");

      expect(archived).toContain("first");
      expect(latest).toContain("second");
    });

    it("persistPlan validates planner output", async () => {
      const dir = await newTempDir();
      await expect(persistPlan({
        goalId: "goal-1",
        version: 1,
        plan: {
          ...makePlan(),
          tasks: [
            {
              title: "bad",
              agentRole: "engineer",
              dependencies: [],
              estimatedCostCents: 10,
              priority: 1,
              timeoutMs: 1000,
            },
          ],
        } as unknown as PlannerOutput,
        workspacePath: dir,
      })).rejects.toThrow(/tasks\[0\]\.description must be a string/);
    });

    it("loadPlan reads and validates a plan json", async () => {
      const dir = await newTempDir();
      const { jsonPath } = await persistPlan({
        goalId: "goal-1",
        version: 1,
        plan: makePlan({ strategy: "Validated strategy" }),
        workspacePath: dir,
      });

      const plan = await loadPlan(jsonPath);
      expect(plan.strategy).toBe("Validated strategy");
      expect(plan.tasks).toHaveLength(1);
    });

    it("loadPlan throws on invalid JSON", async () => {
      const dir = await newTempDir();
      const filePath = path.join(dir, "bad-plan.json");
      await rm(filePath, { force: true }).catch(() => undefined);
      await writeFile(filePath, "{not-json}");

      await expect(loadPlan(filePath)).rejects.toThrow("Invalid plan JSON");
    });

    it("loadPlan throws on invalid plan shape", async () => {
      const dir = await newTempDir();
      const filePath = path.join(dir, "bad-shape.json");
      await writeFile(filePath, JSON.stringify({ analysis: "x", strategy: "y", tasks: [] }));

      await expect(loadPlan(filePath)).rejects.toThrow(/customRoles must be an array/);
    });
  });

  describe("reviewPlan", () => {
    const autoConfig: PlanApprovalConfig = {
      mode: "auto",
      autoBudgetThreshold: 5000,
      consensusCriticRole: "reviewer",
      reviewTimeoutMs: 10_000,
    };

    it("auto mode approves immediately under threshold", async () => {
      const result = await reviewPlan(makePlan({ estimatedTotalCostCents: 1200 }), autoConfig);
      expect(result).toEqual({ approved: true });
    });

    it("auto mode approves above threshold with feedback", async () => {
      const result = await reviewPlan(makePlan({ estimatedTotalCostCents: 9000 }), autoConfig);
      expect(result.approved).toBe(true);
      expect(result.feedback).toContain("Auto-approved above threshold");
    });

    it("supervised mode throws awaiting approval", async () => {
      const supervised: PlanApprovalConfig = { ...autoConfig, mode: "supervised" };
      await expect(reviewPlan(makePlan(), supervised)).rejects.toThrow("awaiting human approval");
    });

    it("consensus mode returns approval feedback", async () => {
      const consensus: PlanApprovalConfig = {
        ...autoConfig,
        mode: "consensus",
        consensusCriticRole: "critic",
        reviewTimeoutMs: 9000,
      };
      const result = await reviewPlan(makePlan(), consensus);
      expect(result.approved).toBe(true);
      expect(result.feedback).toContain("critic role 'critic'");
    });

    it("normalizes invalid config values", async () => {
      const result = await reviewPlan(makePlan({ estimatedTotalCostCents: 99999 }), {
        mode: "unknown" as unknown as "auto",
        autoBudgetThreshold: Number.NaN,
        consensusCriticRole: "   ",
        reviewTimeoutMs: Number.NaN,
      });

      expect(result.approved).toBe(true);
      expect(result.feedback).toContain("5000");
    });
  });

  describe("shouldReplan", () => {
    it("returns false when no replans remain", () => {
      const state = baseState({ replansRemaining: 0 });
      expect(shouldReplan(state, { type: "task_failure", taskId: "t1", error: "boom" })).toBe(false);
    });

    it("task_failure requires taskId and error", () => {
      const state = baseState();
      expect(shouldReplan(state, { type: "task_failure", taskId: "t1", error: "boom" })).toBe(true);
      expect(shouldReplan(state, { type: "task_failure", taskId: "", error: "boom" })).toBe(false);
      expect(shouldReplan(state, { type: "task_failure", taskId: "t1", error: "  " })).toBe(false);
    });

    it("budget_breach uses 1.5x threshold", () => {
      const state = baseState();
      expect(shouldReplan(state, { type: "budget_breach", estimatedCents: 100, actualCents: 151 })).toBe(true);
      expect(shouldReplan(state, { type: "budget_breach", estimatedCents: 100, actualCents: 150 })).toBe(false);
    });

    it("budget_breach with non-positive estimate checks actual > 0", () => {
      const state = baseState();
      expect(shouldReplan(state, { type: "budget_breach", estimatedCents: 0, actualCents: 1 })).toBe(true);
      expect(shouldReplan(state, { type: "budget_breach", estimatedCents: -100, actualCents: 0 })).toBe(false);
    });

    it("requirement_change needs conflictScore >= 0.55", () => {
      const state = baseState();
      expect(shouldReplan(state, { type: "requirement_change", newInput: "x", conflictScore: 0.55 })).toBe(true);
      expect(shouldReplan(state, { type: "requirement_change", newInput: "x", conflictScore: 0.54 })).toBe(false);
    });

    it("environment_change requires non-empty fields", () => {
      const state = baseState();
      expect(shouldReplan(state, { type: "environment_change", resource: "db", error: "down" })).toBe(true);
      expect(shouldReplan(state, { type: "environment_change", resource: "", error: "down" })).toBe(false);
      expect(shouldReplan(state, { type: "environment_change", resource: "db", error: " " })).toBe(false);
    });

    it("opportunity requires enough replans and long suggestion", () => {
      expect(shouldReplan(
        baseState({ replansRemaining: 2 }),
        { type: "opportunity", suggestion: "This opportunity is long enough to justify a replan", agentAddress: "0x1" },
      )).toBe(true);

      expect(shouldReplan(
        baseState({ replansRemaining: 1 }),
        { type: "opportunity", suggestion: "This opportunity is long enough to justify a replan", agentAddress: "0x1" },
      )).toBe(false);

      expect(shouldReplan(
        baseState({ replansRemaining: 3 }),
        { type: "opportunity", suggestion: "too short", agentAddress: "0x1" },
      )).toBe(false);
    });
  });
});
