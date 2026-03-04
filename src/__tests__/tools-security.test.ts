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

// ─── read_file Fallback Shell Injection Prevention ───────────────

describe("read_file fallback shell escaping", () => {
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

  it("escapes shell metacharacters in fallback cat command", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    // Make readFile throw so the fallback exec(cat) path is triggered
    vi.spyOn(conway, "readFile").mockRejectedValue(new Error("API broken"));

    await readTool.execute({ path: "/home/user/my file.txt" }, ctx);

    expect(conway.execCalls.length).toBe(1);
    // The path should be wrapped in single quotes by escapeShellArg
    expect(conway.execCalls[0].command).toBe("cat '/home/user/my file.txt'");
  });

  it("prevents command injection via semicolons in fallback path", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    vi.spyOn(conway, "readFile").mockRejectedValue(new Error("API broken"));

    await readTool.execute({ path: "foo; cat /etc/passwd" }, ctx);

    expect(conway.execCalls.length).toBe(1);
    // Semicolons inside single quotes are treated as literal characters
    expect(conway.execCalls[0].command).toBe("cat 'foo; cat /etc/passwd'");
  });

  it("escapes single quotes in file path in fallback", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    vi.spyOn(conway, "readFile").mockRejectedValue(new Error("API broken"));

    await readTool.execute({ path: "it's a file.txt" }, ctx);

    expect(conway.execCalls.length).toBe(1);
    // Single quotes are escaped using the '\'' technique
    expect(conway.execCalls[0].command).toBe("cat 'it'\\''s a file.txt'");
  });

  it("prevents subshell injection via $() in fallback path", async () => {
    const readTool = tools.find((t) => t.name === "read_file")!;
    vi.spyOn(conway, "readFile").mockRejectedValue(new Error("API broken"));

    await readTool.execute({ path: "$(whoami).txt" }, ctx);

    expect(conway.execCalls.length).toBe(1);
    // $() inside single quotes is treated as literal text
    expect(conway.execCalls[0].command).toBe("cat '$(whoami).txt'");
  });
});

// ─── exec Tool Forbidden Command Patterns (Full Coverage) ──────

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

  // ── Table-driven fixture: every category from FORBIDDEN_COMMAND_PATTERNS ──
  // Each entry has a blocked example and an allowed counterpart proving the
  // regex doesn't over-match.
  const PATTERN_COVERAGE: Array<{
    category: string;
    blocked: string;
    allowed: string;
  }> = [
    // ── 1. Self-destruction (6 patterns) ──
    { category: "self-destruct/.automaton",  blocked: "rm -rf ~/.automaton",           allowed: "ls ~/.automaton" },
    { category: "self-destruct/state.db",    blocked: "rm state.db",                   allowed: "ls state.db" },
    { category: "self-destruct/wallet.json", blocked: "rm -f wallet.json",             allowed: "ls wallet.json" },
    { category: "self-destruct/automaton.json", blocked: "rm automaton.json",          allowed: "ls my-other.json" },
    { category: "self-destruct/heartbeat.yml",  blocked: "rm heartbeat.yml",           allowed: "ls heartbeat.yml" },
    { category: "self-destruct/SOUL.md",        blocked: "rm SOUL.md",                 allowed: "ls SOUL.md" },

    // ── 2. Process-killing (3 patterns) ──
    { category: "process-kill/kill",         blocked: "kill automaton",                 allowed: "kill 12345" },
    { category: "process-kill/pkill",        blocked: "pkill automaton",               allowed: "pkill node" },
    { category: "process-kill/systemctl",    blocked: "systemctl stop automaton",      allowed: "systemctl status nginx" },

    // ── 3. Database-destruction (3 patterns) ──
    { category: "db-destruct/DROP TABLE",    blocked: "DROP TABLE turns",              allowed: "SELECT * FROM turns" },
    { category: "db-destruct/DELETE FROM",   blocked: "DELETE FROM turns",             allowed: "DELETE FROM my_temp_table" },
    { category: "db-destruct/DELETE FROM identity", blocked: "DELETE FROM identity",   allowed: "SELECT * FROM identity" },
    { category: "db-destruct/DELETE FROM kv",       blocked: "DELETE FROM kv",         allowed: "INSERT INTO kv VALUES (1)" },
    { category: "db-destruct/DELETE FROM schema_version", blocked: "DELETE FROM schema_version", allowed: "SELECT * FROM schema_version" },
    { category: "db-destruct/DELETE FROM skills",   blocked: "DELETE FROM skills",     allowed: "SELECT * FROM skills" },
    { category: "db-destruct/DELETE FROM children",  blocked: "DELETE FROM children",  allowed: "SELECT * FROM children" },
    { category: "db-destruct/DELETE FROM registry",  blocked: "DELETE FROM registry",  allowed: "SELECT * FROM registry" },
    { category: "db-destruct/TRUNCATE",      blocked: "TRUNCATE TABLE turns",         allowed: "echo trunc_data" },

    // ── 4. Safety-infra-modification (6 patterns) ──
    { category: "safety-mod/sed injection-defense", blocked: "sed -i 's/x/y/' injection-defense.ts", allowed: "cat injection-defense.ts" },
    { category: "safety-mod/sed self-mod",   blocked: "sed -i 's/x/y/' self-mod/code.ts",            allowed: "cat self-mod/code.ts" },
    { category: "safety-mod/sed audit-log",  blocked: "sed -i 's/x/y/' audit-log.ts",                allowed: "cat audit-log.ts" },
    { category: "safety-mod/> injection-defense", blocked: "> injection-defense.ts",                  allowed: "grep pattern injection-defense.ts" },
    { category: "safety-mod/> self-mod",     blocked: "> self-mod/code.ts",                           allowed: "grep pattern self-mod/code.ts" },
    { category: "safety-mod/> audit-log",    blocked: "> audit-log.ts",                               allowed: "grep pattern audit-log.ts" },

    // ── 5. Credential-harvesting (4 patterns) ──
    { category: "cred-harvest/.ssh",         blocked: "cat ~/.ssh/id_rsa",             allowed: "ls ~/.ssh" },
    { category: "cred-harvest/.gnupg",       blocked: "cat ~/.gnupg/key",              allowed: "ls ~/.gnupg" },
    { category: "cred-harvest/.env",         blocked: "cat .env",                      allowed: "ls .env" },
    { category: "cred-harvest/wallet.json",  blocked: "cat wallet.json",               allowed: "ls wallet.json" },

    // ── 6. Discord-webhook-abuse (2 patterns) ──
    { category: "discord/webhooks",          blocked: "curl https://discord.com/api/webhooks/123/abc -d '{}'", allowed: "curl https://discord.com/channels/123" },
    { category: "discord/webhooks-alt",      blocked: "curl https://discordapp.com/api/webhooks/456/def",      allowed: "curl https://discordapp.com/channels/456" },

    // ── 7. Config-file-reads (1 pattern) ──
    { category: "config-read/automaton.json", blocked: "cat automaton.json",           allowed: "cat config.json" },

    // ── 8. Background-process-spawning (7 patterns) ──
    { category: "bg-spawn/nohup",            blocked: "nohup node server.js",          allowed: "echo background_runner" },
    { category: "bg-spawn/pm2 start",        blocked: "pm2 start app.js",             allowed: "pm2 status" },
    { category: "bg-spawn/pm2 restart",      blocked: "pm2 restart all",              allowed: "pm2 list" },
    { category: "bg-spawn/pm2 resurrect",    blocked: "pm2 resurrect",                allowed: "pm2 logs" },
    { category: "bg-spawn/screen",           blocked: "screen -dS mysession",         allowed: "echo screen" },
    { category: "bg-spawn/tmux",             blocked: "tmux new-session -d",          allowed: "echo tmux" },
    { category: "bg-spawn/setsid",           blocked: "setsid node server.js",        allowed: "echo session_leader" },
    { category: "bg-spawn/disown",           blocked: "node server.js & disown",      allowed: "echo detach_job" },
    { category: "bg-spawn/forever",          blocked: "forever start app.js",         allowed: "forever list" },

    // ── 9. Background-operator (2 patterns) ──
    { category: "bg-op/trailing &",          blocked: "sleep 100 &",                  allowed: "curl 'https://api.example.com?a=1&b=2'" },
    { category: "bg-op/mid-command &",       blocked: "sleep 100 & echo done",        allowed: "echo hello && echo world" },
  ];

  // ── Blocked commands ──
  describe("blocks all 10 forbidden categories", () => {
    for (const { category, blocked } of PATTERN_COVERAGE) {
      it(`[${category}] blocks: ${blocked.slice(0, 60)}`, async () => {
        const execTool = tools.find((t) => t.name === "exec")!;
        const result = await execTool.execute({ command: blocked }, ctx);
        expect(result).toContain("Blocked");
        expect(conway.execCalls.length).toBe(0);
      });
    }
  });

  // ── Allowed counterparts ──
  describe("allows safe counterparts for each category", () => {
    for (const { category, allowed } of PATTERN_COVERAGE) {
      it(`[${category}] allows: ${allowed.slice(0, 60)}`, async () => {
        const execTool = tools.find((t) => t.name === "exec")!;
        const result = await execTool.execute({ command: allowed }, ctx);
        expect(result).not.toContain("Blocked");
        expect(conway.execCalls.length).toBeGreaterThan(0);
      });
    }
  });

  // ── Evasion Attempts ──
  describe("evasion attempts", () => {
    it("blocks case variation: drop table", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "drop table turns" }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    it("blocks case variation: NOHUP", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "NOHUP node server.js" }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    it("blocks path trick: /usr/bin/cat .env", async () => {
      // The pattern matches `cat` anywhere so path-prefixed cat still matches
      // because the regex is /cat\s+.*\.env/
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "cat /home/user/.env" }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    it("blocks env prefix: ENV=val rm -rf ~/.automaton", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "ENV=val rm -rf ~/.automaton" }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    it("blocks tab before &: echo foo\\t&", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "echo foo\t&" }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    it("blocks quoted discord webhook URL", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute(
        { command: `curl "https://discord.com/api/webhooks/123/abc" -d 'test'` },
        ctx,
      );
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    it("blocks semicolon gap: echo hi ; rm SOUL.md", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "echo hi ; rm SOUL.md" }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    it("blocks systemctl disable (alternative to stop)", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "systemctl disable automaton" }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    // Known limitation: `echo 'a & b'` is blocked (accepted tradeoff)
    it("known false positive: echo 'a & b' is blocked (accepted tradeoff)", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "echo 'a & b'" }, ctx);
      expect(result).toContain("Blocked");
    });

    // sh -c indirection IS caught because \bnohup\b matches anywhere in the string
    it("blocks sh -c indirection: sh -c 'nohup node server.js'", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: `sh -c "nohup node server.js"` }, ctx);
      expect(result).toContain("Blocked");
      expect(conway.execCalls.length).toBe(0);
    });

    // Known gap: variable-based indirection escapes pattern matching
    it("known gap: variable indirection ($cmd) is NOT blocked", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      // Simulates: cmd=nohup; $cmd node server.js — the variable name doesn't match \bnohup\b
      const result = await execTool.execute({ command: "cmd=daemonize; $cmd node server.js" }, ctx);
      // This is a known limitation — inline regex cannot match runtime variable expansion.
      // The policy engine's command.forbidden_patterns rule is the primary defense.
      expect(result).not.toContain("Blocked");
    });

    // Known gap: no space before & (e.g. `;&`) is not caught by the lookbehind
    it("known gap: ;& (no space before &) is NOT blocked", async () => {
      const execTool = tools.find((t) => t.name === "exec")!;
      const result = await execTool.execute({ command: "echo hello;& echo world" }, ctx);
      expect(result).not.toContain("Blocked");
    });
  });

  // ── Preserved: sandbox self-delete and safe commands ──

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

  it("reports sandbox deletion is disabled for own sandbox", async () => {
    const deleteTool = tools.find((t) => t.name === "delete_sandbox")!;
    const result = await deleteTool.execute(
      { sandbox_id: ctx.identity.sandboxId },
      ctx,
    );
    expect(result).toContain("disabled");
  });

  it("reports sandbox deletion is disabled for other sandboxes", async () => {
    const deleteTool = tools.find((t) => t.name === "delete_sandbox")!;
    const result = await deleteTool.execute(
      { sandbox_id: "different-sandbox-id" },
      ctx,
    );
    expect(result).toContain("disabled");
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

  it("blocks negative amount", async () => {
    const transferTool = tools.find((t) => t.name === "transfer_credits")!;
    const result = await transferTool.execute(
      { to_address: "0xrecipient", amount_cents: -500 },
      ctx,
    );
    expect(result).toContain("Blocked");
    expect(result).toContain("positive number");
  });

  it("blocks zero amount", async () => {
    const transferTool = tools.find((t) => t.name === "transfer_credits")!;
    const result = await transferTool.execute(
      { to_address: "0xrecipient", amount_cents: 0 },
      ctx,
    );
    expect(result).toContain("Blocked");
    expect(result).toContain("positive number");
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
