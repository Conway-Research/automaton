/**
 * Circuit Breaker Tests
 *
 * Tests the per-tool failure circuit breaker in the agent loop.
 * The circuit breaker tracks consecutive ERROR outcomes per tool name,
 * independent of the behavior-pattern loop detection.
 *
 * IMPORTANT: These tests pair each failing tool call with a varying
 * read-only tool call (check_credits, git_status, etc.) so that the
 * per-turn tool pattern is unique. This avoids triggering the separate
 * repetitive-pattern loop detector (which fires on 3 identical patterns
 * and would overwrite pendingInput).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAgentLoop } from "../agent/loop.js";
import {
  MockInferenceClient,
  MockConwayClient,
  createTestDb,
  createTestIdentity,
  createTestConfig,
  noToolResponse,
} from "./mocks.js";
import type { AutomatonDatabase, AgentTurn } from "../types.js";

/**
 * Helper: build a toolCallResponse with a unique ID to avoid DB collisions.
 * Supports multiple tool calls per turn (for varying patterns).
 */
function uniqueToolCallResponse(
  toolCalls: { name: string; arguments: Record<string, unknown> }[],
  uid: string,
) {
  const mapped = toolCalls.map((tc, i) => ({
    id: `call_${uid}_${i}`,
    type: "function" as const,
    function: {
      name: tc.name,
      arguments: JSON.stringify(tc.arguments),
    },
  }));

  return {
    id: `resp_${uid}`,
    model: "mock-model",
    message: {
      role: "assistant" as const,
      content: "",
      tool_calls: mapped,
    },
    toolCalls: mapped,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    finishReason: "tool_calls" as const,
  };
}

/**
 * Build a turn that calls a failing tool alongside a varying read-only tool,
 * producing a unique tool pattern each turn to avoid triggering the
 * repetitive-pattern loop detector.
 */
// These read-only tools do NOT call conway.exec internally, so they won't
// interfere with tests that override conway.exec to throw.
const READ_ONLY_TOOLS = ["check_credits", "system_synopsis", "check_balance", "check_credits", "system_synopsis"];

function failingExecTurn(uid: string, index: number) {
  const readOnly = READ_ONLY_TOOLS[index % READ_ONLY_TOOLS.length];
  return uniqueToolCallResponse(
    [
      { name: "exec", arguments: { command: `echo ${uid}` } },
      { name: readOnly, arguments: {} },
    ],
    uid,
  );
}

describe("Circuit Breaker", () => {
  let db: AutomatonDatabase;
  let conway: MockConwayClient;
  let identity: ReturnType<typeof createTestIdentity>;
  let config: ReturnType<typeof createTestConfig>;

  beforeEach(() => {
    db = createTestDb();
    conway = new MockConwayClient();
    identity = createTestIdentity();
    config = createTestConfig();
  });

  afterEach(() => {
    db.close();
  });

  it("3 failures triggers breaker", async () => {
    // Make exec always throw
    conway.exec = async () => {
      throw new Error("Connection refused");
    };

    const inference = new MockInferenceClient([
      failingExecTurn("f1", 0),
      failingExecTurn("f2", 1),
      failingExecTurn("f3", 2),  // 3rd exec failure → circuit breaker fires
      noToolResponse("Done."),
    ]);

    const turns: AgentTurn[] = [];

    await runAgentLoop({
      identity,
      config,
      db,
      conway,
      inference,
      onTurnComplete: (turn) => turns.push(turn),
    });

    // After the 3rd failure, the circuit breaker fires and injects
    // a TOOL FAILURE ESCALATION message as pendingInput for the next turn.
    const escalationTurn = turns.find(
      (t) => t.input?.includes("TOOL FAILURE ESCALATION"),
    );
    expect(escalationTurn).toBeDefined();
    expect(escalationTurn!.input).toContain('"exec"');
    expect(escalationTurn!.input).toContain("3 consecutive times");
  });

  it("different tools don't cross-contaminate", async () => {
    conway.exec = async () => {
      throw new Error("Exec failed");
    };
    conway.writeFile = async () => {
      throw new Error("Write failed");
    };

    // exec fails 2x, write_file fails 1x — neither reaches 3
    const inference = new MockInferenceClient([
      uniqueToolCallResponse([
        { name: "exec", arguments: { command: "echo 1" } },
        { name: "check_credits", arguments: {} },
      ], "c1"),
      uniqueToolCallResponse([
        { name: "exec", arguments: { command: "echo 2" } },
        { name: "system_synopsis", arguments: {} },
      ], "c2"),
      uniqueToolCallResponse([
        { name: "write_file", arguments: { path: "/tmp/x", content: "y" } },
        { name: "check_credits", arguments: {} },
      ], "c3"),
      noToolResponse("Done."),
    ]);

    const turns: AgentTurn[] = [];

    await runAgentLoop({
      identity,
      config,
      db,
      conway,
      inference,
      onTurnComplete: (turn) => turns.push(turn),
    });

    // No escalation should fire — exec only failed 2x, write_file only 1x
    const escalationTurn = turns.find(
      (t) => t.input?.includes("TOOL FAILURE ESCALATION"),
    );
    expect(escalationTurn).toBeUndefined();
  });

  it("success resets counter", async () => {
    let execCallCount = 0;
    conway.exec = async () => {
      execCallCount++;
      // Fail on calls 1, 2 — succeed on call 3 — fail on call 4
      if (execCallCount === 3) {
        return { stdout: "ok", stderr: "", exitCode: 0 };
      }
      throw new Error("Exec failed");
    };

    const inference = new MockInferenceClient([
      failingExecTurn("r1", 0),  // fail (count=1)
      failingExecTurn("r2", 1),  // fail (count=2)
      failingExecTurn("r3", 2),  // success (count reset)
      failingExecTurn("r4", 3),  // fail (count=1)
      noToolResponse("Done."),
    ]);

    const turns: AgentTurn[] = [];

    await runAgentLoop({
      identity,
      config,
      db,
      conway,
      inference,
      onTurnComplete: (turn) => turns.push(turn),
    });

    // No escalation because success at call 3 reset the counter
    const escalationTurn = turns.find(
      (t) => t.input?.includes("TOOL FAILURE ESCALATION"),
    );
    expect(escalationTurn).toBeUndefined();
  });

  it("breaker fires exactly once per 3 failures", async () => {
    // All exec calls fail. After 3 failures, breaker fires and resets.
    // The 4th failure starts a new count at 1 — no second escalation.
    conway.exec = async () => {
      throw new Error("Always fails");
    };

    const inference = new MockInferenceClient([
      failingExecTurn("o1", 0),
      failingExecTurn("o2", 1),
      failingExecTurn("o3", 2),  // triggers breaker (count=3), then resets
      failingExecTurn("o4", 3),  // count=1 after reset — no second escalation
      noToolResponse("Done."),
    ]);

    const turns: AgentTurn[] = [];

    await runAgentLoop({
      identity,
      config,
      db,
      conway,
      inference,
      onTurnComplete: (turn) => turns.push(turn),
    });

    // Exactly one escalation turn should exist
    const escalationTurns = turns.filter(
      (t) => t.input?.includes("TOOL FAILURE ESCALATION"),
    );
    expect(escalationTurns.length).toBe(1);
  });

  it("different error messages still count", async () => {
    let execCallCount = 0;
    conway.exec = async () => {
      execCallCount++;
      // Each call throws a different error message
      throw new Error(`Error variant ${execCallCount}`);
    };

    const inference = new MockInferenceClient([
      failingExecTurn("v1", 0),
      failingExecTurn("v2", 1),
      failingExecTurn("v3", 2),
      noToolResponse("Done."),
    ]);

    const turns: AgentTurn[] = [];

    await runAgentLoop({
      identity,
      config,
      db,
      conway,
      inference,
      onTurnComplete: (turn) => turns.push(turn),
    });

    // Different error messages on the same tool still accumulate
    const escalationTurn = turns.find(
      (t) => t.input?.includes("TOOL FAILURE ESCALATION"),
    );
    expect(escalationTurn).toBeDefined();
    expect(escalationTurn!.input).toContain('"exec"');
  });

  it("persists across sleep cycles", async () => {
    // Phase 1: exec fails 2×, then agent sleeps.
    // The circuit breaker state should persist to KV.
    conway.exec = async () => {
      throw new Error("Connection refused");
    };

    const inference1 = new MockInferenceClient([
      failingExecTurn("p1", 0),
      failingExecTurn("p2", 1),
      // Sleep to end the cycle
      uniqueToolCallResponse([
        { name: "sleep", arguments: { duration_seconds: 60, reason: "test" } },
      ], "p3"),
    ]);

    await runAgentLoop({
      identity,
      config,
      db,
      conway,
      inference: inference1,
    });

    // Verify the failure counts were persisted
    const persisted = db.getKV("failed_tool_counts");
    expect(persisted).toBeDefined();
    const parsed = JSON.parse(persisted!);
    const restoredMap = new Map(parsed);
    expect(restoredMap.get("exec")).toBe(2);

    // Phase 2: clear sleep_until so the agent can wake, then exec fails 1 more time.
    db.deleteKV("sleep_until");

    const inference2 = new MockInferenceClient([
      failingExecTurn("p4", 2),  // 3rd failure → triggers
      noToolResponse("Done."),
    ]);

    const turns2: AgentTurn[] = [];

    await runAgentLoop({
      identity,
      config,
      db,
      conway,
      inference: inference2,
      onTurnComplete: (turn) => turns2.push(turn),
    });

    // The 3rd consecutive failure (across sleep boundary) should trigger escalation
    const escalationTurn = turns2.find(
      (t) => t.input?.includes("TOOL FAILURE ESCALATION"),
    );
    expect(escalationTurn).toBeDefined();
    expect(escalationTurn!.input).toContain('"exec"');
  });
});
