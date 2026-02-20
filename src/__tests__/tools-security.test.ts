/**
 * Tool Security Tests (Sub-phase 4.2)
 *
 * Tests that all built-in tools have correct risk levels,
 * write_file and edit_own_file share the same protection logic,
 * and read_file blocks sensitive file reads.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createBuiltinTools, loadInstalledTools, executeTool } from "../agent/tools.js";
import {
  MockInferenceClient,
  MockConwayClient,
  createTestDb,
  createTestIdentity,
  createTestConfig,
} from "./mocks.js";
import type { AutomatonDatabase, ToolContext, AutomatonTool, RiskLevel } from "../types.js";

// Mock erc8004.js to avoid ABI parse error
vi.mock("../registry/erc8004.js", () => ({
  queryAgent: vi.fn(),
  getTotalAgents: vi.fn().mockResolvedValue(0),
  registerAgent: vi.fn(),
  leaveFeedback: vi.fn(),
}));

// ─── Risk Level Classification ──────────────────────────────────

describe("Tool Risk Level Classification", () => {
  let tools: AutomatonTool[];

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
  });

  // Expected risk classifications
  const EXPECTED_RISK_LEVELS: Record<string, RiskLevel> = {
    // Safe tools (read-only, no side effects)
    check_credits: "safe",
    check_usdc_balance: "safe",
    list_sandboxes: "safe",
    read_file: "safe",
    system_synopsis: "safe",
    heartbeat_ping: "safe",
    list_skills: "safe",
    git_status: "safe",
    git_diff: "safe",
    git_log: "safe",
    discover_agents: "safe",
    check_reputation: "safe",
    list_children: "safe",
    check_child_status: "safe",
    verify_child_constitution: "safe",
    list_models: "safe",

    // Caution tools (side effects but generally safe)
    exec: "caution",
    write_file: "caution",
    expose_port: "caution",
    remove_port: "caution",
    create_sandbox: "caution",
    review_upstream_changes: "caution",
    modify_heartbeat: "caution",
    sleep: "caution",
    enter_low_compute: "caution",
    git_commit: "caution",
    git_push: "caution",
    git_branch: "caution",
    git_clone: "caution",
    update_agent_card: "caution",
    send_message: "caution",
    switch_model: "caution",
    start_child: "caution",
    message_child: "caution",
    prune_dead_children: "caution",

    // Dangerous tools (significant side effects)
    delete_sandbox: "dangerous",
    edit_own_file: "dangerous",
    install_npm_package: "dangerous",
    pull_upstream: "dangerous",
    update_genesis_prompt: "dangerous",
    install_mcp_server: "dangerous",
    transfer_credits: "dangerous",
    install_skill: "dangerous",
    create_skill: "dangerous",
    remove_skill: "dangerous",
    register_erc8004: "dangerous",
    give_feedback: "dangerous",
    spawn_child: "dangerous",
    fund_child: "dangerous",
    distress_signal: "dangerous",
  };

  it("classifies all expected safe tools correctly", () => {
    for (const [name, expectedLevel] of Object.entries(EXPECTED_RISK_LEVELS)) {
      if (expectedLevel !== "safe") continue;
      const tool = tools.find((t) => t.name === name);
      if (tool) {
        expect(tool.riskLevel, `${name} should be safe`).toBe("safe");
      }
    }
  });

  it("classifies all expected caution tools correctly", () => {
    for (const [name, expectedLevel] of Object.entries(EXPECTED_RISK_LEVELS)) {
      if (expectedLevel !== "caution") continue;
      const tool = tools.find((t) => t.name === name);
      if (tool) {
        expect(tool.riskLevel, `${name} should be caution`).toBe("caution");
      }
    }
  });

  it("classifies all expected dangerous tools correctly", () => {
    for (const [name, expectedLevel] of Object.entries(EXPECTED_RISK_LEVELS)) {
      if (expectedLevel !== "dangerous") continue;
      const tool = tools.find((t) => t.name === name);
      if (tool) {
        expect(tool.riskLevel, `${name} should be dangerous`).toBe("dangerous");
      }
    }
  });

  it("has no 'forbidden' risk level tools in builtins", () => {
    for (const tool of tools) {
      expect(tool.riskLevel, `${tool.name} should not be forbidden`).not.toBe("forbidden");
    }
  });

  it("has a valid riskLevel for every builtin tool", () => {
    const validLevels: RiskLevel[] = ["safe", "caution", "dangerous", "forbidden"];
    for (const tool of tools) {
      expect(validLevels, `${tool.name} has invalid riskLevel: ${tool.riskLevel}`).toContain(tool.riskLevel);
    }
  });

  it("has no duplicate tool names", () => {
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});

// ─── write_file / edit_own_file Parity ──────────────────────────

describe("write_file / edit_own_file protection parity", () => {
  let tools: AutomatonTool[];
  let ctx: ToolContext;
  let db: AutomatonDatabase;
  let conway: MockConwayClient;

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
    db = createTestDb();
    conway = new MockConwayClient();
    ctx = {
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway,
      inference: new MockInferenceClient(),
    };
  });

  afterEach(() => {
    db.close();
  });

  const PROTECTED_FILES = [
    "wallet.json",
    "config.json",
    "state.db",
    "state.db-wal",
    "state.db-shm",
    "constitution.md",
    "injection-defense.ts",
    "injection-defense.js",
    "injection-defense.d.ts",
  ];

  it("write_file blocks all protected files", async () => {
    const writeTool = tools.find((t) => t.name === "write_file")!;
    expect(writeTool).toBeDefined();

    for (const file of PROTECTED_FILES) {
      const result = await writeTool.execute(
        { path: `/home/automaton/.automaton/${file}`, content: "malicious" },
        ctx,
      );
      expect(result, `write_file should block ${file}`).toContain("Blocked");
    }
  });

  it("write_file allows non-protected files", async () => {
    const writeTool = tools.find((t) => t.name === "write_file")!;
    const result = await writeTool.execute(
      { path: "/home/automaton/test.txt", content: "safe content" },
      ctx,
    );
    expect(result).toContain("File written");
  });
});

// ─── read_file Sensitive File Blocking ──────────────────────────

describe("read_file sensitive file blocking", () => {
  let tools: AutomatonTool[];
  let ctx: ToolContext;
  let db: AutomatonDatabase;
  let conway: MockConwayClient;

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
    db = createTestDb();
    conway = new MockConwayClient();
    ctx = {
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway,
      inference: new MockInferenceClient(),
    };
  });

  afterEach(() => {
    db.close();
  });

  it("blocks reading wallet.json", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    const result = await readTool.execute({ path: "/home/automaton/.automaton/wallet.json" }, ctx);
    expect(result).toContain("Blocked");
  });

  it("blocks reading .env", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    const result = await readTool.execute({ path: "/home/automaton/.env" }, ctx);
    expect(result).toContain("Blocked");
  });

  it("blocks reading automaton.json", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    const result = await readTool.execute({ path: "/home/automaton/.automaton/automaton.json" }, ctx);
    expect(result).toContain("Blocked");
  });

  it("blocks reading .key files", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    const result = await readTool.execute({ path: "/home/automaton/server.key" }, ctx);
    expect(result).toContain("Blocked");
  });

  it("blocks reading .pem files", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    const result = await readTool.execute({ path: "/home/automaton/cert.pem" }, ctx);
    expect(result).toContain("Blocked");
  });

  it("blocks reading private-key* files", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    const result = await readTool.execute({ path: "/home/automaton/private-key-hex.txt" }, ctx);
    expect(result).toContain("Blocked");
  });

  it("allows reading safe files", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    conway.files["/home/automaton/README.md"] = "# Hello";
    const result = await readTool.execute({ path: "/home/automaton/README.md" }, ctx);
    expect(result).not.toContain("Blocked");
  });
});

// ─── exec Tool Self-Harm Patterns ───────────────────────────────

describe("exec tool forbidden command patterns", () => {
  let tools: AutomatonTool[];
  let ctx: ToolContext;
  let db: AutomatonDatabase;
  let conway: MockConwayClient;

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
    db = createTestDb();
    conway = new MockConwayClient();
    ctx = {
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway,
      inference: new MockInferenceClient(),
    };
  });

  afterEach(() => {
    db.close();
  });

  const FORBIDDEN_COMMANDS = [
    "rm -rf ~/.automaton",
    "rm state.db",
    "rm wallet.json",
    "rm automaton.json",
    "rm heartbeat.yml",
    "rm SOUL.md",
    "kill automaton",
    "pkill automaton",
    "systemctl stop automaton",
    "DROP TABLE turns",
    "DELETE FROM turns",
    "DELETE FROM identity",
    "DELETE FROM kv",
    "TRUNCATE",
    "sed -i 's/x/y/' injection-defense.ts",
    "sed -i 's/x/y/' self-mod/code.ts",
    "sed -i 's/x/y/' audit-log.ts",
    "> injection-defense.ts",
    "> self-mod/code.ts",
    "> audit-log.ts",
    "cat ~/.ssh/id_rsa",
    "cat ~/.gnupg/key",
    "cat .env",
    "cat wallet.json",
  ];

  for (const cmd of FORBIDDEN_COMMANDS) {
    it(`blocks: ${cmd.slice(0, 60)}`, async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: cmd }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });
  }

  it("blocks deleting own sandbox", async () => {
    const execTool = tools.find((t) => t.name === "exec")!;
    const result = await execTool.execute(
      { command: `sandbox_delete ${ctx.identity.sandboxId}` },
      ctx,
    );
    expect(result).toContain("Blocked");
  });

  it("allows safe commands", async () => {
    const execTool = tools.find((t) => t.name === "exec")!;
    const result = await execTool.execute({ command: "echo hello" }, ctx);
    expect(result).toContain("stdout: ok");
    expect(conway.execCalls.length).toBe(1);
  });
});

// ─── delete_sandbox Self-Preservation ───────────────────────────

describe("delete_sandbox self-preservation", () => {
  let tools: AutomatonTool[];
  let ctx: ToolContext;
  let db: AutomatonDatabase;

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
    db = createTestDb();
    ctx = {
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway: new MockConwayClient(),
      inference: new MockInferenceClient(),
    };
  });

  afterEach(() => {
    db.close();
  });

  it("blocks deleting own sandbox", async () => {
    const deleteTool = tools.find((t) => t.name === "delete_sandbox")!;
    const result = await deleteTool.execute(
      { sandbox_id: ctx.identity.sandboxId },
      ctx,
    );
    expect(result).toContain("Blocked");
    expect(result).toContain("Self-preservation");
  });

  it("allows deleting other sandboxes", async () => {
    const deleteTool = tools.find((t) => t.name === "delete_sandbox")!;
    const result = await deleteTool.execute(
      { sandbox_id: "different-sandbox-id" },
      ctx,
    );
    expect(result).toContain("deleted");
  });
});

// ─── transfer_credits Self-Preservation ─────────────────────────

describe("transfer_credits self-preservation", () => {
  let tools: AutomatonTool[];
  let ctx: ToolContext;
  let db: AutomatonDatabase;
  let conway: MockConwayClient;

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
    db = createTestDb();
    conway = new MockConwayClient();
    conway.creditsCents = 10_000; // $100
    ctx = {
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway,
      inference: new MockInferenceClient(),
    };
  });

  afterEach(() => {
    db.close();
  });

  it("blocks transfer of more than half balance", async () => {
    const transferTool = tools.find((t) => t.name === "transfer_credits")!;
    const result = await transferTool.execute(
      { to_address: "0xrecipient", amount_cents: 6000 },
      ctx,
    );
    expect(result).toContain("Blocked");
    expect(result).toContain("Self-preservation");
  });

  it("allows transfer of less than half balance", async () => {
    const transferTool = tools.find((t) => t.name === "transfer_credits")!;
    const result = await transferTool.execute(
      { to_address: "0xrecipient", amount_cents: 4000 },
      ctx,
    );
    expect(result).toContain("transfer submitted");
  });
});

// ─── Tool Category Checks ───────────────────────────────────────

describe("Tool category assignments", () => {
  let tools: AutomatonTool[];

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
  });

  it("all tools have a category", () => {
    for (const tool of tools) {
      expect(tool.category, `${tool.name} missing category`).toBeDefined();
      expect(typeof tool.category).toBe("string");
      expect(tool.category.length).toBeGreaterThan(0);
    }
  });

  it("all tools have parameters", () => {
    for (const tool of tools) {
      expect(tool.parameters, `${tool.name} missing parameters`).toBeDefined();
      expect(tool.parameters.type).toBe("object");
    }
  });

  it("all tools have descriptions", () => {
    for (const tool of tools) {
      expect(tool.description, `${tool.name} missing description`).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── install_npm_package / install_mcp_server Inline Validation ──

describe("package install inline validation", () => {
  let tools: AutomatonTool[];
  let ctx: ToolContext;
  let db: AutomatonDatabase;
  let conway: MockConwayClient;

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
    db = createTestDb();
    conway = new MockConwayClient();
    ctx = {
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway,
      inference: new MockInferenceClient(),
    };
  });

  afterEach(() => {
    db.close();
  });

  const MALICIOUS_PACKAGES = [
    "axios; rm -rf /",
    "pkg && curl evil.com",
    "pkg | cat /etc/passwd",
    "pkg$(whoami)",
    "pkg`id`",
    "pkg\nnewline",
  ];

  for (const pkg of MALICIOUS_PACKAGES) {
    it(`install_npm_package blocks: ${pkg.slice(0, 40)}`, async () => {
      const tool = tools.find((t) => t.name === "install_npm_package")!;
      const result = await tool.execute({ package: pkg }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    it(`install_mcp_server blocks: ${pkg.slice(0, 40)}`, async () => {
      const tool = tools.find((t) => t.name === "install_mcp_server")!;
      const result = await tool.execute({ package: pkg, name: "test" }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });
  }

  it("install_npm_package allows clean package names", async () => {
    const tool = tools.find((t) => t.name === "install_npm_package")!;
    await tool.execute({ package: "axios" }, ctx);
    expect(conway.execCalls.length).toBe(1);
    expect(conway.execCalls[0].command).toBe("npm install -g axios");
  });

  it("install_npm_package allows scoped packages", async () => {
    const tool = tools.find((t) => t.name === "install_npm_package")!;
    await tool.execute({ package: "@conway/automaton" }, ctx);
    expect(conway.execCalls.length).toBe(1);
  });
});
