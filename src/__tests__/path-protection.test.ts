/**
 * Path Protection Tests (Sub-phase 0.4)
 *
 * Tests for:
 * - resolveAndValidatePath: traversal and symlink blocking
 * - isProtectedFile: exact path-segment matching (no substring false positives)
 * - write_file: blocks protected files
 * - read_file: blocks sensitive files
 * - Policy rules: path.protected_files, path.read_sensitive, path.traversal_detection
 */

import { describe, it, expect } from "vitest";
import path from "path";
import { isProtectedFile } from "../self-mod/code.js";
import { createPathProtectionRules } from "../agent/policy-rules/path-protection.js";
import type { PolicyRequest, AutomatonTool, ToolContext } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────

function makeMockTool(name: string): AutomatonTool {
  return {
    name,
    description: `mock ${name}`,
    category: "vm",
    riskLevel: "caution",
    parameters: {},
    execute: async () => "",
  };
}

function makeMockRequest(
  toolName: string,
  args: Record<string, unknown>,
): PolicyRequest {
  return {
    tool: makeMockTool(toolName),
    args,
    context: {} as ToolContext,
    turnContext: {
      inputSource: undefined,
      turnToolCallCount: 0,
      sessionSpend: {
        recordSpend: () => {},
        getHourlySpend: () => 0,
        getDailySpend: () => 0,
        getTotalSpend: () => 0,
        checkLimit: () => ({
          allowed: true,
          currentHourlySpend: 0,
          currentDailySpend: 0,
          limitHourly: 0,
          limitDaily: 0,
        }),
        pruneOldRecords: () => 0,
      },
    },
  };
}

// ─── isProtectedFile Tests ──────────────────────────────────────

describe("isProtectedFile", () => {
  it("matches exact protected file names", () => {
    expect(isProtectedFile("wallet.json")).toBe(true);
    expect(isProtectedFile("config.json")).toBe(true);
    expect(isProtectedFile("state.db")).toBe(true);
    expect(isProtectedFile("constitution.md")).toBe(true);
  });

  it("matches protected files with path prefix", () => {
    expect(isProtectedFile("/home/user/.automaton/wallet.json")).toBe(true);
    expect(isProtectedFile("/some/path/self-mod/code.ts")).toBe(true);
    expect(isProtectedFile("/some/path/agent/tools.ts")).toBe(true);
  });

  it("matches newly added protected files", () => {
    expect(isProtectedFile("/some/path/self-mod/upstream.ts")).toBe(true);
    expect(isProtectedFile("/some/path/self-mod/upstream.js")).toBe(true);
    expect(isProtectedFile("/some/path/self-mod/tools-manager.ts")).toBe(true);
    expect(isProtectedFile("/some/path/self-mod/tools-manager.js")).toBe(true);
    expect(isProtectedFile("/some/path/skills/loader.ts")).toBe(true);
    expect(isProtectedFile("/some/path/skills/loader.js")).toBe(true);
    expect(isProtectedFile("/some/path/skills/registry.ts")).toBe(true);
    expect(isProtectedFile("/some/path/skills/registry.js")).toBe(true);
    expect(isProtectedFile("/some/path/automaton.json")).toBe(true);
    expect(isProtectedFile("/some/path/package.json")).toBe(true);
    expect(isProtectedFile("/some/path/SOUL.md")).toBe(true);
    expect(isProtectedFile("/some/path/agent/policy-engine.ts")).toBe(true);
    expect(isProtectedFile("/some/path/agent/policy-engine.js")).toBe(true);
    expect(isProtectedFile("/some/path/agent/policy-rules/index.ts")).toBe(true);
    expect(isProtectedFile("/some/path/agent/policy-rules/index.js")).toBe(true);
  });

  it("does NOT false-positive on substring matches", () => {
    // "tools.ts" should not match "my-tools.ts"
    expect(isProtectedFile("/some/path/my-tools.ts")).toBe(false);
    // "code.ts" should not match "barcode.ts"
    expect(isProtectedFile("/some/path/barcode.ts")).toBe(false);
    // "config.json" should not match "my-config.json"
    expect(isProtectedFile("/some/path/my-config.json")).toBe(false);
    // "wallet.json" should not match "test-wallet.json"
    expect(isProtectedFile("/some/path/test-wallet.json")).toBe(false);
  });

  it("allows normal unprotected files", () => {
    expect(isProtectedFile("/some/path/readme.md")).toBe(false);
    expect(isProtectedFile("/some/path/src/index.ts")).toBe(false);
    expect(isProtectedFile("/some/path/data.csv")).toBe(false);
  });

  it("blocks paths in blocked directories", () => {
    expect(isProtectedFile("/home/user/.ssh/id_rsa")).toBe(true);
    expect(isProtectedFile("/home/user/.gnupg/keys")).toBe(true);
    expect(isProtectedFile("/etc/systemd/system/something.service")).toBe(true);
    expect(isProtectedFile("/proc/self/environ")).toBe(true);
  });
});

// ─── Policy Rules Tests ─────────────────────────────────────────

describe("path protection policy rules", () => {
  const rules = createPathProtectionRules();

  const protectedFilesRule = rules.find((r) => r.id === "path.protected_files")!;
  const readSensitiveRule = rules.find((r) => r.id === "path.read_sensitive")!;
  const traversalRule = rules.find((r) => r.id === "path.traversal_detection")!;

  describe("path.protected_files", () => {
    it("denies write to wallet.json", () => {
      const request = makeMockRequest("write_file", { path: "wallet.json" });
      const result = protectedFilesRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
      expect(result!.reasonCode).toBe("PROTECTED_FILE");
    });

    it("denies write to injection-defense.ts", () => {
      const request = makeMockRequest("write_file", {
        path: "/some/path/injection-defense.ts",
      });
      const result = protectedFilesRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });

    it("allows write to normal file", () => {
      const request = makeMockRequest("write_file", { path: "readme.md" });
      const result = protectedFilesRule.evaluate(request);
      expect(result).toBeNull();
    });

    it("denies edit_own_file to protected file", () => {
      const request = makeMockRequest("edit_own_file", { path: "agent/tools.ts" });
      request.tool = makeMockTool("edit_own_file");
      const result = protectedFilesRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });
  });

  describe("path.read_sensitive", () => {
    it("denies read of wallet.json", () => {
      const request = makeMockRequest("read_file", { path: "wallet.json" });
      request.tool = makeMockTool("read_file");
      const result = readSensitiveRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
      expect(result!.reasonCode).toBe("SENSITIVE_FILE_READ");
    });

    it("denies read of .env", () => {
      const request = makeMockRequest("read_file", { path: ".env" });
      request.tool = makeMockTool("read_file");
      const result = readSensitiveRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });

    it("denies read of automaton.json", () => {
      const request = makeMockRequest("read_file", { path: "automaton.json" });
      request.tool = makeMockTool("read_file");
      const result = readSensitiveRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });

    it("denies read of .key files", () => {
      const request = makeMockRequest("read_file", { path: "server.key" });
      request.tool = makeMockTool("read_file");
      const result = readSensitiveRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });

    it("denies read of .pem files", () => {
      const request = makeMockRequest("read_file", { path: "cert.pem" });
      request.tool = makeMockTool("read_file");
      const result = readSensitiveRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });

    it("denies read of private-key files", () => {
      const request = makeMockRequest("read_file", { path: "private-key.txt" });
      request.tool = makeMockTool("read_file");
      const result = readSensitiveRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });

    it("allows read of normal file", () => {
      const request = makeMockRequest("read_file", { path: "readme.md" });
      request.tool = makeMockTool("read_file");
      const result = readSensitiveRule.evaluate(request);
      expect(result).toBeNull();
    });
  });

  describe("path.traversal_detection", () => {
    // Traversal detection only applies to edit_own_file (local filesystem).
    // write_file and read_file operate on the remote Conway sandbox via API,
    // so local cwd-based checks would false-positive on sandbox paths.

    it("denies edit_own_file with ../../../etc/passwd", () => {
      const request = makeMockRequest("edit_own_file", {
        path: "../../../etc/passwd",
      });
      request.tool = makeMockTool("edit_own_file");
      const result = traversalRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
      expect(result!.reasonCode).toBe("PATH_TRAVERSAL");
    });

    it("denies edit_own_file with double-slash paths", () => {
      const request = makeMockRequest("edit_own_file", {
        path: "/tmp//escape/trick",
      });
      request.tool = makeMockTool("edit_own_file");
      const result = traversalRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
    });

    it("allows edit_own_file with normal relative paths", () => {
      const request = makeMockRequest("edit_own_file", {
        path: "src/agent/tools.ts",
      });
      request.tool = makeMockTool("edit_own_file");
      const result = traversalRule.evaluate(request);
      expect(result).toBeNull();
    });

    it("allows edit_own_file with absolute paths within cwd", () => {
      const cwd = process.cwd();
      const request = makeMockRequest("edit_own_file", {
        path: path.join(cwd, "src", "index.ts"),
      });
      request.tool = makeMockTool("edit_own_file");
      const result = traversalRule.evaluate(request);
      expect(result).toBeNull();
    });

    it("denies edit_own_file with absolute paths outside cwd", () => {
      const request = makeMockRequest("edit_own_file", {
        path: "/etc/passwd",
      });
      request.tool = makeMockTool("edit_own_file");
      const result = traversalRule.evaluate(request);
      expect(result).not.toBeNull();
      expect(result!.action).toBe("deny");
      expect(result!.reasonCode).toBe("PATH_TRAVERSAL");
    });

    it("does not apply to write_file (remote sandbox)", () => {
      const request = makeMockRequest("write_file", {
        path: "/home/conway/app.py",
      });
      // The rule's appliesTo only includes edit_own_file,
      // so it should not match write_file at all.
      // We verify by checking appliesTo directly.
      const appliesTo = traversalRule.appliesTo;
      expect(appliesTo.by).toBe("name");
      if (appliesTo.by === "name") {
        expect(appliesTo.names).not.toContain("write_file");
        expect(appliesTo.names).not.toContain("read_file");
        expect(appliesTo.names).toContain("edit_own_file");
      }
    });
  });
});

// ─── Rule Registration Tests ─────────────────────────────────────

describe("path protection rule registration", () => {
  it("exports three rules", () => {
    const rules = createPathProtectionRules();
    expect(rules).toHaveLength(3);
  });

  it("all rules have priority 200", () => {
    const rules = createPathProtectionRules();
    for (const rule of rules) {
      expect(rule.priority).toBe(200);
    }
  });

  it("all rules have correct IDs", () => {
    const rules = createPathProtectionRules();
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("path.protected_files");
    expect(ids).toContain("path.read_sensitive");
    expect(ids).toContain("path.traversal_detection");
  });
});
