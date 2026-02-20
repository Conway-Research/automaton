/**
 * Command Injection Remediation Tests (Sub-phase 0.3)
 *
 * Tests:
 * - Shell metacharacter injection blocked by policy rules
 * - Forbidden command patterns blocked
 * - Input validation rules (package names, skill names, git hashes, etc.)
 * - Registry functions use safe alternatives (no shell interpolation)
 * - Loader uses safe binary check
 * - pull_upstream uses conway.exec() not host execSync
 * - upstream.ts uses execFileSync with argument arrays
 */

import { describe, it, expect } from "vitest";
import { createDefaultRules } from "../agent/policy-rules/index.js";
import { createValidationRules } from "../agent/policy-rules/validation.js";
import { createCommandSafetyRules } from "../agent/policy-rules/command-safety.js";
import type {
  PolicyRule,
  PolicyRequest,
  PolicyRuleResult,
  AutomatonTool,
  RiskLevel,
  ToolContext,
} from "../types.js";

// ─── Test Helpers ───────────────────────────────────────────────

function makeTool(name: string, category = "vm", riskLevel: RiskLevel = "caution"): AutomatonTool {
  return {
    name,
    description: `Test tool: ${name}`,
    category: category as any,
    riskLevel,
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
  };
}

function makeRequest(
  toolName: string,
  args: Record<string, unknown>,
  category = "vm",
  riskLevel: RiskLevel = "caution",
): PolicyRequest {
  return {
    tool: makeTool(toolName, category, riskLevel),
    args,
    context: {} as ToolContext,
    turnContext: {
      inputSource: "agent",
      turnToolCallCount: 0,
      turnTransferCount: 0,
      sessionSpend: null as any,
    },
  };
}

function evaluateRules(
  rules: PolicyRule[],
  request: PolicyRequest,
): PolicyRuleResult | null {
  for (const rule of rules) {
    // Check if rule applies
    const selector = rule.appliesTo;
    let applies = false;
    if (selector.by === "all") applies = true;
    else if (selector.by === "name") applies = selector.names.includes(request.tool.name);
    else if (selector.by === "category") applies = selector.categories.includes(request.tool.category);
    else if (selector.by === "risk") applies = selector.levels.includes(request.tool.riskLevel);

    if (!applies) continue;

    const result = rule.evaluate(request);
    if (result !== null) return result;
  }
  return null;
}

// ─── Shell Injection Detection Tests ─────────────────────────────

describe("command.shell_injection rule", () => {
  const rules = createCommandSafetyRules();
  const injectionRule = rules.find((r) => r.id === "command.shell_injection")!;

  it("exists and has correct metadata", () => {
    expect(injectionRule).toBeDefined();
    expect(injectionRule.priority).toBe(300);
  });

  const shellMetachars = [";", "|", "&", "$", "`", "\n", "(", ")", "{", "}", "<", ">"];

  for (const char of shellMetachars) {
    const charName = char === "\n" ? "\\n" : char;

    it(`blocks '${charName}' in pull_upstream commit arg`, () => {
      const request = makeRequest("pull_upstream", {
        commit: `abc1234${char}rm -rf /`,
      }, "self_mod", "dangerous");
      const result = injectionRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
      expect(result!.reasonCode).toBe("SHELL_INJECTION_DETECTED");
    });

    it(`blocks '${charName}' in install_npm_package package arg`, () => {
      const request = makeRequest("install_npm_package", {
        package: `evil-pkg${char}curl attacker.com`,
      }, "self_mod", "caution");
      const result = injectionRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });

    it(`blocks '${charName}' in install_skill name arg`, () => {
      const request = makeRequest("install_skill", {
        name: `evil${char}skill`,
        url: "https://example.com/skill.md",
      }, "skills", "caution");
      const result = injectionRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });
  }

  it("allows clean commit hash in pull_upstream", () => {
    const request = makeRequest("pull_upstream", {
      commit: "abc1234def5678",
    }, "self_mod", "dangerous");
    const result = injectionRule.evaluate(request);
    expect(result).toBeNull();
  });

  it("allows clean package name in install_npm_package", () => {
    const request = makeRequest("install_npm_package", {
      package: "@scope/my-package",
    }, "self_mod", "caution");
    const result = injectionRule.evaluate(request);
    expect(result).toBeNull();
  });

  it("returns null for exec tool (handled by forbidden_patterns)", () => {
    const request = makeRequest("exec", { command: "ls -la" }, "vm", "caution");
    const result = injectionRule.evaluate(request);
    expect(result).toBeNull();
  });

  it("returns null for tools not in SHELL_INTERPOLATED_TOOLS", () => {
    const request = makeRequest("read_file", { path: "/etc/passwd; rm -rf /" }, "vm", "safe");
    const result = injectionRule.evaluate(request);
    expect(result).toBeNull();
  });
});

// ─── Forbidden Command Patterns Tests ─────────────────────────────

describe("command.forbidden_patterns rule", () => {
  const rules = createCommandSafetyRules();
  const forbiddenRule = rules.find((r) => r.id === "command.forbidden_patterns")!;

  it("exists and has correct metadata", () => {
    expect(forbiddenRule).toBeDefined();
    expect(forbiddenRule.priority).toBe(300);
    expect(forbiddenRule.appliesTo).toEqual({ by: "name", names: ["exec"] });
  });

  // Self-destruction patterns
  const selfDestructPatterns = [
    "rm -rf .automaton",
    "rm -rf /home/user/.automaton",
    "rm state.db",
    "rm -f wallet.json",
    "rm automaton.json",
    "rm heartbeat.yml",
    "rm SOUL.md",
  ];

  for (const cmd of selfDestructPatterns) {
    it(`blocks self-destruction: ${cmd}`, () => {
      const request = makeRequest("exec", { command: cmd }, "vm", "caution");
      const result = forbiddenRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
      expect(result!.reasonCode).toBe("FORBIDDEN_COMMAND");
    });
  }

  // Process killing
  const processKillPatterns = [
    "kill -9 automaton",
    "pkill automaton",
    "systemctl stop automaton",
    "systemctl disable automaton",
  ];

  for (const cmd of processKillPatterns) {
    it(`blocks process killing: ${cmd}`, () => {
      const request = makeRequest("exec", { command: cmd }, "vm", "caution");
      const result = forbiddenRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });
  }

  // Database destruction
  const dbDestructPatterns = [
    "sqlite3 state.db 'DROP TABLE turns'",
    "DELETE FROM identity WHERE 1=1",
    "TRUNCATE everything",
  ];

  for (const cmd of dbDestructPatterns) {
    it(`blocks database destruction: ${cmd}`, () => {
      const request = makeRequest("exec", { command: cmd }, "vm", "caution");
      const result = forbiddenRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });
  }

  // Credential harvesting
  const credentialPatterns = [
    "cat ~/.ssh/id_rsa",
    "cat ~/.gnupg/private-keys-v1.d/key",
    "cat .env",
    "cat /home/user/wallet.json",
  ];

  for (const cmd of credentialPatterns) {
    it(`blocks credential harvesting: ${cmd}`, () => {
      const request = makeRequest("exec", { command: cmd }, "vm", "caution");
      const result = forbiddenRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });
  }

  // Safety infrastructure modification
  const safetyModPatterns = [
    "sed -i 's/deny/allow/' injection-defense.ts",
    "sed -i '' policy-engine/something",
    "sed -i '' policy-rules/index.ts",
    "> injection-defense.ts",
    "> self-mod/code/file.ts",
    "> audit-log/log.txt",
    "> policy-engine.ts",
    "> policy-rules/command-safety.ts",
  ];

  for (const cmd of safetyModPatterns) {
    it(`blocks safety modification: ${cmd}`, () => {
      const request = makeRequest("exec", { command: cmd }, "vm", "caution");
      const result = forbiddenRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });
  }

  // Allowed commands
  const allowedPatterns = [
    "ls -la",
    "npm install express",
    "git status",
    "cat /tmp/output.txt",
    "node index.js",
  ];

  for (const cmd of allowedPatterns) {
    it(`allows safe command: ${cmd}`, () => {
      const request = makeRequest("exec", { command: cmd }, "vm", "caution");
      const result = forbiddenRule.evaluate(request);
      expect(result).toBeNull();
    });
  }

  it("only applies to exec tool", () => {
    const request = makeRequest("write_file", { command: "rm -rf .automaton" }, "vm", "caution");
    // The rule's appliesTo is { by: "name", names: ["exec"] }, so it shouldn't match write_file
    const result = evaluateRules([forbiddenRule], request);
    expect(result).toBeNull();
  });
});

// ─── Input Validation Rules Tests ─────────────────────────────────

describe("Validation rules", () => {
  const rules = createValidationRules();

  describe("validate.package_name", () => {
    const rule = rules.find((r) => r.id === "validate.package_name")!;

    it("allows valid package names", () => {
      const validNames = ["express", "@scope/pkg", "my-package", "pkg.js", "underscore_pkg"];
      for (const pkg of validNames) {
        const request = makeRequest("install_npm_package", { package: pkg }, "self_mod");
        const result = rule.evaluate(request);
        expect(result).toBeNull();
      }
    });

    it("rejects package names with shell metacharacters", () => {
      const invalidNames = [
        "pkg; rm -rf /",
        "pkg && curl evil.com",
        "pkg | cat /etc/passwd",
        "$(evil)",
        "`evil`",
      ];
      for (const pkg of invalidNames) {
        const request = makeRequest("install_npm_package", { package: pkg }, "self_mod");
        const result = rule.evaluate(request);
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
        expect(result!.reasonCode).toBe("VALIDATION_FAILED");
      }
    });

    it("returns null when package arg is missing", () => {
      const request = makeRequest("install_npm_package", {}, "self_mod");
      const result = rule.evaluate(request);
      expect(result).toBeNull();
    });
  });

  describe("validate.skill_name", () => {
    const rule = rules.find((r) => r.id === "validate.skill_name")!;

    it("allows valid skill names", () => {
      const validNames = ["my-skill", "skill123", "MySkill"];
      for (const name of validNames) {
        const request = makeRequest("install_skill", { name }, "skills");
        const result = rule.evaluate(request);
        expect(result).toBeNull();
      }
    });

    it("rejects skill names with special characters", () => {
      const invalidNames = [
        "../etc/passwd",
        "skill; rm -rf /",
        "skill name",
        "skill/path",
        "skill.dot",
      ];
      for (const name of invalidNames) {
        const request = makeRequest("install_skill", { name }, "skills");
        const result = rule.evaluate(request);
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
      }
    });
  });

  describe("validate.git_hash", () => {
    const rule = rules.find((r) => r.id === "validate.git_hash")!;

    it("allows valid git hashes", () => {
      const validHashes = ["abc1234", "deadbeef", "a".repeat(40)];
      for (const commit of validHashes) {
        const request = makeRequest("pull_upstream", { commit }, "self_mod");
        const result = rule.evaluate(request);
        expect(result).toBeNull();
      }
    });

    it("rejects invalid git hashes", () => {
      const invalidHashes = [
        "abc123; rm -rf /",
        "ABCDEF",  // uppercase
        "abc12",   // too short (6 chars)
        "ghijkl",  // non-hex chars
        "a".repeat(41), // too long
      ];
      for (const commit of invalidHashes) {
        const request = makeRequest("pull_upstream", { commit }, "self_mod");
        const result = rule.evaluate(request);
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
      }
    });

    it("returns null when commit is not provided (optional)", () => {
      const request = makeRequest("pull_upstream", {}, "self_mod");
      const result = rule.evaluate(request);
      expect(result).toBeNull();
    });
  });

  describe("validate.port_range", () => {
    const rule = rules.find((r) => r.id === "validate.port_range")!;

    it("allows valid ports", () => {
      for (const port of [1, 80, 443, 8080, 65535]) {
        const request = makeRequest("expose_port", { port }, "vm");
        const result = rule.evaluate(request);
        expect(result).toBeNull();
      }
    });

    it("rejects invalid ports", () => {
      for (const port of [0, -1, 65536, 100000, 1.5]) {
        const request = makeRequest("expose_port", { port }, "vm");
        const result = rule.evaluate(request);
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
      }
    });
  });

  describe("validate.cron_expression", () => {
    const rule = rules.find((r) => r.id === "validate.cron_expression")!;

    it("allows valid cron expressions", () => {
      const valid = ["* * * * *", "0 */2 * * *", "30 9 * * 1-5", "0 0 1,15 * *"];
      for (const schedule of valid) {
        const request = makeRequest("modify_heartbeat", { schedule }, "self_mod");
        const result = rule.evaluate(request);
        expect(result).toBeNull();
      }
    });

    it("rejects invalid cron expressions", () => {
      const invalid = [
        "not a cron",
        "* * *",       // too few fields
        "* * * * * *", // too many fields
      ];
      for (const schedule of invalid) {
        const request = makeRequest("modify_heartbeat", { schedule }, "self_mod");
        const result = rule.evaluate(request);
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
      }
    });
  });

  describe("validate.address_format", () => {
    const rule = rules.find((r) => r.id === "validate.address_format")!;

    it("allows valid Ethereum addresses", () => {
      const valid = [
        "0x1234567890abcdef1234567890abcdef12345678",
        "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      ];
      for (const to_address of valid) {
        const request = makeRequest("transfer_credits", { to_address }, "treasury");
        const result = rule.evaluate(request);
        expect(result).toBeNull();
      }
    });

    it("rejects invalid addresses", () => {
      const invalid = [
        "not-an-address",
        "0x1234",     // too short
        "1234567890abcdef1234567890abcdef12345678", // no 0x prefix
        "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", // non-hex
      ];
      for (const to_address of invalid) {
        const request = makeRequest("transfer_credits", { to_address }, "treasury");
        const result = rule.evaluate(request);
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
      }
    });
  });
});

// ─── Default Rules Integration ─────────────────────────────────────

describe("createDefaultRules integration", () => {
  const rules = createDefaultRules();

  it("returns all validation and command safety rules", () => {
    const ruleIds = rules.map((r) => r.id);
    expect(ruleIds).toContain("validate.package_name");
    expect(ruleIds).toContain("validate.skill_name");
    expect(ruleIds).toContain("validate.git_hash");
    expect(ruleIds).toContain("validate.port_range");
    expect(ruleIds).toContain("validate.cron_expression");
    expect(ruleIds).toContain("validate.address_format");
    expect(ruleIds).toContain("command.shell_injection");
    expect(ruleIds).toContain("command.forbidden_patterns");
  });

  it("blocks shell injection in install_skill name with combined rules", () => {
    const request = makeRequest("install_skill", {
      name: "evil;rm -rf /",
      url: "https://example.com",
    }, "skills");
    const result = evaluateRules(rules, request);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("deny");
  });

  it("blocks invalid git hash in pull_upstream with combined rules", () => {
    const request = makeRequest("pull_upstream", {
      commit: "abc; rm -rf /",
    }, "self_mod", "dangerous");
    const result = evaluateRules(rules, request);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("deny");
  });
});

// ─── Registry Safety Tests ─────────────────────────────────────────

describe("skills/registry.ts safety", () => {
  // These tests verify that the registry functions have input validation
  // by importing the functions and checking they throw on invalid input.
  // We don't actually execute shell commands — we test the validation.

  it("installSkillFromGit rejects invalid skill name", async () => {
    const { installSkillFromGit } = await import("../skills/registry.js");
    await expect(
      installSkillFromGit("https://github.com/test/repo", "../evil", "/tmp/skills", {} as any, {} as any),
    ).rejects.toThrow(/Invalid skill name/);
  });

  it("installSkillFromGit rejects URL with shell metacharacters", async () => {
    const { installSkillFromGit } = await import("../skills/registry.js");
    await expect(
      installSkillFromGit("https://evil.com/repo; rm -rf /", "test-skill", "/tmp/skills", {} as any, {} as any),
    ).rejects.toThrow(/Invalid repo URL/);
  });

  it("installSkillFromUrl rejects invalid skill name", async () => {
    const { installSkillFromUrl } = await import("../skills/registry.js");
    await expect(
      installSkillFromUrl("https://example.com/skill.md", "evil;name", "/tmp/skills", {} as any, {} as any),
    ).rejects.toThrow(/Invalid skill name/);
  });

  it("installSkillFromUrl rejects URL with shell metacharacters", async () => {
    const { installSkillFromUrl } = await import("../skills/registry.js");
    await expect(
      installSkillFromUrl("https://evil.com/skill.md | cat /etc/passwd", "test-skill", "/tmp/skills", {} as any, {} as any),
    ).rejects.toThrow(/Invalid URL/);
  });

  it("createSkill rejects invalid skill name", async () => {
    const { createSkill } = await import("../skills/registry.js");
    await expect(
      createSkill("../etc/passwd", "evil", "inject code", "/tmp/skills", {} as any, {} as any),
    ).rejects.toThrow(/Invalid skill name/);
  });

  it("removeSkill rejects invalid skill name", async () => {
    const { removeSkill } = await import("../skills/registry.js");
    await expect(
      removeSkill("../../../etc", {} as any, {} as any, "/tmp/skills", true),
    ).rejects.toThrow(/Invalid skill name/);
  });
});

// ─── Source Code Safety Assertions ─────────────────────────────────

describe("Source code injection safety", () => {
  it("upstream.ts uses execFileSync not execSync with string interpolation", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../self-mod/upstream.ts", import.meta.url).pathname.replace("/src/__tests__/../", "/src/"),
      "utf-8",
    );
    // Should NOT have: execSync(`git ${cmd}`)
    expect(source).not.toMatch(/execSync\s*\(/);
    // Should have: execFileSync("git", args, ...)
    expect(source).toMatch(/execFileSync\s*\(\s*"git"/);
  });

  it("registry.ts uses execFileSync not conway.exec with interpolation", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../skills/registry.ts", import.meta.url).pathname.replace("/src/__tests__/../", "/src/"),
      "utf-8",
    );
    // Should NOT have template literals in conway.exec calls
    expect(source).not.toMatch(/conway\.exec\s*\(\s*`/);
    // Should use execFileSync or fs.* instead
    expect(source).toMatch(/execFileSync\s*\(/);
    expect(source).toMatch(/fs\.mkdirSync\(/);
    expect(source).toMatch(/fs\.rmSync\(/);
  });

  it("loader.ts uses execFileSync('which', [bin]) not execSync('which ${bin}')", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../skills/loader.ts", import.meta.url).pathname.replace("/src/__tests__/../", "/src/"),
      "utf-8",
    );
    // Should NOT have: execSync(`which ${bin}`)
    expect(source).not.toMatch(/execSync\s*\(\s*`which/);
    // Should have: execFileSync("which", [bin])
    expect(source).toMatch(/execFileSync\s*\(\s*"which"/);
  });

  it("tools.ts pull_upstream uses conway.exec not host execSync", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../agent/tools.ts", import.meta.url).pathname.replace("/src/__tests__/../", "/src/"),
      "utf-8",
    );
    // Find the pull_upstream section and check it doesn't import child_process
    const pullSection = source.slice(
      source.indexOf("name: \"pull_upstream\""),
      source.indexOf("name: \"modify_heartbeat\""),
    );
    expect(pullSection).not.toMatch(/import\s*\(\s*"child_process"\s*\)/);
    expect(pullSection).toMatch(/ctx\.conway\.exec\(/);
  });

  it("tools.ts has defense-in-depth comment on FORBIDDEN_COMMAND_PATTERNS", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../agent/tools.ts", import.meta.url).pathname.replace("/src/__tests__/../", "/src/"),
      "utf-8",
    );
    expect(source).toMatch(/[Dd]efense.in.depth.*policy engine/i);
  });
});
