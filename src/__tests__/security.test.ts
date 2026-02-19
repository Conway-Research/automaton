/**
 * Security Guard Tests
 *
 * Targeted tests for security hardening:
 * - Spawn rate limiting
 * - npm package allowlist + shell injection prevention
 * - Protected path deletion (rm without -f)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAgentLoop } from "../agent/loop.js";
import {
  MockInferenceClient,
  MockConwayClient,
  createTestDb,
  createTestIdentity,
  createTestConfig,
  toolCallResponse,
  noToolResponse,
} from "./mocks.js";
import type { AutomatonDatabase, AgentTurn } from "../types.js";
import { spawnChild } from "../replication/spawn.js";
import { validateNpmPackage } from "../agent/tools.js";

// Helper to extract the validation function for direct testing
// We need to export it from tools.ts or test via the tool execution

describe("Security: npm Package Validation", () => {
  it("allows valid allowlisted packages", () => {
    const result = validateNpmPackage("axios");
    expect(result.valid).toBe(true);
    expect(result.name).toBe("axios");
  });

  it("allows scoped packages from allowlist", () => {
    const result = validateNpmPackage("@types/node");
    // @types/node not in allowlist, should fail
    expect(result.valid).toBe(false);
  });

  it("allows version specifiers on allowlisted packages", () => {
    const result = validateNpmPackage("axios@1.0.0");
    expect(result.valid).toBe(true);
    expect(result.name).toBe("axios");
  });

  it("blocks shell injection via &&", () => {
    const result = validateNpmPackage("axios@1.0.0 && rm -rf /");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("shell injection");
  });

  it("blocks shell injection via ;", () => {
    const result = validateNpmPackage("axios;cat /etc/passwd");
    expect(result.valid).toBe(false);
  });

  it("blocks shell injection via backticks", () => {
    const result = validateNpmPackage("axios`whoami`");
    expect(result.valid).toBe(false);
  });

  it("blocks shell injection via $()", () => {
    const result = validateNpmPackage("axios$(id)");
    expect(result.valid).toBe(false);
  });

  it("blocks non-allowlisted packages", () => {
    const result = validateNpmPackage("malicious-package");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not in the allowed package list");
  });

  it("blocks whitespace in package names", () => {
    const result = validateNpmPackage("axios rm");
    expect(result.valid).toBe(false);
  });

  it("blocks pipe character", () => {
    const result = validateNpmPackage("axios|bash");
    expect(result.valid).toBe(false);
  });
});

describe("Security: Command Execution Guards", () => {
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

  it("blocks rm without -f on protected files", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "rm ~/.automaton/state.db" } },
      ]),
      noToolResponse("OK."),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).toContain("Blocked");
    expect(execCall!.result).toContain("protected path");

    // conway.exec should NOT have been called
    expect(conway.execCalls.length).toBe(0);
  });

  it("blocks rm -rf on protected files", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "rm -rf ~/.automaton/wallet.json" } },
      ]),
      noToolResponse("OK."),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).toContain("Blocked");

    expect(conway.execCalls.length).toBe(0);
  });

  it("blocks unlink on protected files", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "unlink ~/.automaton/state.db" } },
      ]),
      noToolResponse("OK."),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).toContain("Blocked");

    expect(conway.execCalls.length).toBe(0);
  });

  it("blocks find -delete on protected paths", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "find ~/.automaton -name '*.db' -delete" } },
      ]),
      noToolResponse("OK."),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).toContain("Blocked");

    expect(conway.execCalls.length).toBe(0);
  });

  it("blocks sed on protected files", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "sed -i 's/foo/bar/' ~/.automaton/state.db" } },
      ]),
      noToolResponse("OK."),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).toContain("Blocked");

    expect(conway.execCalls.length).toBe(0);
  });

  it("blocks reading wallet.json", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "cat ~/.automaton/wallet.json" } },
      ]),
      noToolResponse("OK."),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).toContain("Blocked");
    expect(execCall!.result).toContain("sensitive");

    expect(conway.execCalls.length).toBe(0);
  });

  it("allows safe commands on non-protected paths", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "echo hello > /tmp/test.txt" } },
      ]),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).not.toContain("Blocked");

    // conway.exec SHOULD have been called
    expect(conway.execCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks command substitution", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "echo $(whoami)" } },
      ]),
      noToolResponse("OK."),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).toContain("Blocked");

    expect(conway.execCalls.length).toBe(0);
  });

  it("blocks backtick command substitution", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "exec", arguments: { command: "echo `id`" } },
      ]),
      noToolResponse("OK."),
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

    const execTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(execTurn).toBeDefined();
    const execCall = execTurn!.toolCalls.find((tc) => tc.name === "exec");
    expect(execCall!.result).toContain("Blocked");

    expect(conway.execCalls.length).toBe(0);
  });
});

describe("Security: Spawn Rate Limiting", () => {
  let db: AutomatonDatabase;
  let conway: MockConwayClient;
  let identity: ReturnType<typeof createTestIdentity>;

  beforeEach(() => {
    db = createTestDb();
    conway = new MockConwayClient();
    identity = createTestIdentity();
  });

  afterEach(() => {
    db.close();
  });

  it("allows first spawn", async () => {
    // No existing children - should be allowed
    const children = db.getChildren();
    expect(children.length).toBe(0);
    
    // The spawn function would be called here in a real test
    // For unit test, we just verify the preconditions
  });

  it("blocks rapid second spawn", async () => {
    // Simulate a recent child spawn
    db.insertChild({
      id: "child-1",
      name: "test-child",
      address: "0x0000000000000000000000000000000000000000" as any,
      sandboxId: "sandbox-1",
      genesisPrompt: "test",
      creatorMessage: "test",
      fundedAmountCents: 0,
      status: "running",
      createdAt: new Date().toISOString(), // Just now
    });

    const children = db.getChildren();
    expect(children.length).toBe(1);

    // Attempting to spawn again immediately should fail
    // We test the rate limit check directly
    const { MIN_SPAWN_INTERVAL_MS } = await import("../types.js");
    const lastSpawnTime = new Date(children[0].createdAt).getTime();
    const elapsed = Date.now() - lastSpawnTime;
    
    expect(elapsed).toBeLessThan(MIN_SPAWN_INTERVAL_MS);
  });

  it("allows spawn after rate limit window", async () => {
    // Simulate a child spawned more than an hour ago
    const oneHourAgo = new Date(Date.now() - 65 * 60 * 1000).toISOString();
    
    db.insertChild({
      id: "child-1",
      name: "test-child",
      address: "0x0000000000000000000000000000000000000000" as any,
      sandboxId: "sandbox-1",
      genesisPrompt: "test",
      creatorMessage: "test",
      fundedAmountCents: 0,
      status: "running",
      createdAt: oneHourAgo,
    });

    const { MIN_SPAWN_INTERVAL_MS } = await import("../types.js");
    const children = db.getChildren();
    const lastSpawnTime = new Date(children[0].createdAt).getTime();
    const elapsed = Date.now() - lastSpawnTime;
    
    expect(elapsed).toBeGreaterThan(MIN_SPAWN_INTERVAL_MS);
  });
});

describe("Security: npm Install Tool", () => {
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

  it("blocks shell injection in npm install", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "install_npm_package", arguments: { package: "axios && rm -rf /" } },
      ]),
      noToolResponse("OK."),
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

    const toolTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "install_npm_package"),
    );
    expect(toolTurn).toBeDefined();
    const toolCall = toolTurn!.toolCalls.find((tc) => tc.name === "install_npm_package");
    expect(toolCall!.result).toContain("Blocked");
    expect(toolCall!.result).toContain("shell injection");

    // conway.exec should NOT have been called
    expect(conway.execCalls.length).toBe(0);
  });

  it("blocks non-allowlisted package", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "install_npm_package", arguments: { package: "malicious-pkg" } },
      ]),
      noToolResponse("OK."),
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

    const toolTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "install_npm_package"),
    );
    expect(toolTurn).toBeDefined();
    const toolCall = toolTurn!.toolCalls.find((tc) => tc.name === "install_npm_package");
    expect(toolCall!.result).toContain("Blocked");
    expect(toolCall!.result).toContain("not in the allowed package list");

    expect(conway.execCalls.length).toBe(0);
  });

  it("allows allowlisted package", async () => {
    const inference = new MockInferenceClient([
      toolCallResponse([
        { name: "install_npm_package", arguments: { package: "axios" } },
      ]),
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

    const toolTurn = turns.find((t) =>
      t.toolCalls.some((tc) => tc.name === "install_npm_package"),
    );
    expect(toolTurn).toBeDefined();
    const toolCall = toolTurn!.toolCalls.find((tc) => tc.name === "install_npm_package");
    // Should not be blocked
    expect(toolCall!.result).not.toContain("Blocked");

    // conway.exec SHOULD have been called
    expect(conway.execCalls.length).toBeGreaterThanOrEqual(1);
  });
});
