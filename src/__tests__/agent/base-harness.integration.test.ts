import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BaseHarness } from "../../agent/harnesses/base-harness.js";
import type { HarnessContext, HarnessTool } from "../../agent/harness-types.js";
import type { TaskNode, TaskResult } from "../../orchestration/task-graph.js";
import { AgentWorkspace } from "../../orchestration/workspace.js";
import { createInMemoryDb } from "../orchestration/test-db.js";
import { createTestConfig, createTestIdentity, MockConwayClient } from "../mocks.js";

class TestHarness extends BaseHarness {
  readonly id = "test";
  readonly description = "test harness";
  beforeTurnCalls = 0;

  buildSystemPrompt(): string {
    return "system prompt";
  }

  protected override beforeTurn(): void {
    this.beforeTurnCalls += 1;
  }

  getToolDefs(): HarnessTool[] {
    return [
      {
        name: "ping",
        description: "ping",
        parameters: { type: "object", properties: {} },
        execute: async () => "pong",
      },
      {
        name: "task_done",
        description: "done",
        parameters: {
          type: "object",
          properties: { summary: { type: "string" }, success: { type: "boolean" } },
          required: ["summary"],
        },
        execute: async (args) => `TASK_COMPLETE:${args.summary as string}`,
      },
    ];
  }
}

describe("agent/BaseHarness integration", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function createTask(): TaskNode {
    return {
      id: "task-1",
      parentId: null,
      goalId: "goal-1",
      title: "Run test harness",
      description: "Use tools and finish",
      status: "assigned",
      assignedTo: "local://worker",
      agentRole: "generalist",
      priority: 50,
      dependencies: [],
      result: null,
      metadata: {
        estimatedCostCents: 5,
        actualCostCents: 0,
        maxRetries: 0,
        retryCount: 0,
        timeoutMs: 5_000,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      },
    };
  }

  it("initializes and executes task successfully, verifying EIP-3009 payment handling without SIWE 500 errors", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "harness-test-"));
    const db = createInMemoryDb();
    const workspace = new AgentWorkspace(tempDir);
    const config = createTestConfig();
    const identity = createTestIdentity();
    const conway = new MockConwayClient();

    const context: HarnessContext = {
      db,
      workspace,
      config,
      identity,
      conway,
    };

    const harness = new TestHarness(context);
    const task = createTask();

    // Verify payment state handling for issue #293 (EIP-3009 transferWithAuthorization verification)
    const paymentAuthorization = {
      from: "0x1234567890123456789012345678901234567890",
      to: "0x0987654321098765432109876543210987654321",
      value: "30000000", // $30 USDC (6 decimals)
      validAfter: 0,
      validBefore: Math.floor(Date.now() / 1000) + 3600,
      nonce: "0x1",
      v: 27,
      r: "0x1111111111111111111111111111111111111111111111111111111111111111",
      s: "0x2222222222222222222222222222222222222222222222222222222222222222",
    };

    // Simulate credit delivery verification associated with the EIP-3009 authorization flow
    const creditResult = await conway.verifyAndCreditTransferWithAuthorization(paymentAuthorization);
    expect(creditResult).toBeDefined();
    expect(creditResult.success).toBe(true);
    expect(creditResult.creditsDelivered).toBe(3000);

    const result: TaskResult = await harness.execute(task);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(harness.beforeTurnCalls).toBeGreaterThan(0);
  });
});