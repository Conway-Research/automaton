import { symlinkSync, linkSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodingHarness } from "../../agent/harnesses/coding-harness.js";
import type { HarnessContext } from "../../agent/harness-types.js";
import type { TaskResult } from "../../orchestration/task-graph.js";
import type { ConwayClient } from "../../types.js";
import { AgentWorkspace } from "../../orchestration/workspace.js";
import { createInMemoryDb } from "../orchestration/test-db.js";
import { createTestConfig, createTestIdentity } from "../mocks.js";

function createConwayStub(overrides?: Partial<ConwayClient>): ConwayClient {
  return {
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    writeFile: async () => undefined,
    readFile: async () => "",
    exposePort: async () => ({ port: 0, publicUrl: "", sandboxId: "" }),
    removePort: async () => undefined,
    createSandbox: async () => ({ id: "", status: "", region: "", vcpu: 0, memoryMb: 0, diskGb: 0, createdAt: "" }),
    deleteSandbox: async () => undefined,
    listSandboxes: async () => [],
    getCreditsBalance: async () => 0,
    getCreditsPricing: async () => [],
    transferCredits: async () => ({ id: "", fromAddress: "", toAddress: "", amountCents: 0, status: "completed", timestamp: "" }),
    registerAutomaton: async () => ({ automaton: {} }),
    searchDomains: async () => [],
    registerDomain: async () => ({ domain: "", status: "pending", registrationDate: "", expirationDate: "", nameservers: [] }),
    listDnsRecords: async () => [],
    addDnsRecord: async () => ({ id: "", type: "A", host: "", value: "", ttl: 300 }),
    deleteDnsRecord: async () => undefined,
    listModels: async () => [],
    createScopedClient: () => createConwayStub(),
    ...overrides,
  } as ConwayClient;
}

describe("agent/CodingHarness confinement", () => {
  let db: ReturnType<typeof createInMemoryDb>;
  let testRoot: string;

  beforeEach(() => {
    db = createInMemoryDb();
    testRoot = mkdtempSync(path.join(os.tmpdir(), "coding-harness-"));
  });

  afterEach(() => {
    db.close();
    rmSync(testRoot, { recursive: true, force: true });
  });

  async function createHarness(conway: ConwayClient) {
    const harness = new CodingHarness();
    const workspace = new AgentWorkspace("goal-coding", path.join(testRoot, "workspace"));
    const context: HarnessContext = {
      workspaceRoot: workspace.basePath,
      allowedEditRoot: testRoot,
      workspace,
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway,
      inference: { chat: async () => ({ content: "done" }) },
      budget: {
        maxTurns: 5,
        maxCostCents: 50,
        timeoutMs: 5_000,
        turnsUsed: 0,
        costUsedCents: 0,
        startedAt: 0,
      },
      wisdom: { conventions: [], successes: [], failures: [], gotchas: [] },
      abortSignal: new AbortController().signal,
      goalId: "goal-coding",
    };

    await harness.initialize(
      {
        id: "task-coding-1",
        parentId: null,
        goalId: "goal-coding",
        title: "Apply a scoped code edit",
        description: "Only edit files inside the allowed edit root",
        status: "assigned",
        assignedTo: "local://worker",
        agentRole: "executor",
        priority: 50,
        dependencies: [],
        result: null as TaskResult | null,
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
      },
      context,
    );

    return harness;
  }

  it("never reads local files after a remote read failure", async () => {
    const filePath = path.join(testRoot, "remote-unavailable.txt");
    writeFileSync(filePath, "LOCAL_ONLY_FIXTURE");
    const client = createConwayStub({isLocal: false, readFile: async () => { throw new Error("Remote denied"); }});
    const result = await runTool(client, "read_file", {path: filePath});
    expect(result).not.toContain("LOCAL_ONLY_FIXTURE");
    expect(result).toMatch(/Blocked|read error/);
  });

  it("preserves silent backend failures and unknown exit status", async () => {
    for (const exitCode of [0, 1, 137, undefined, Number.NaN]) {
      const client = createConwayStub({exec: async () => ({stdout: "", stderr: "", exitCode}) as Awaited<ReturnType<ConwayClient["exec"]>>});
      const result = await runTool(client, "exec", {command: "node --version"});
      expect(result).toBe(`exitCode: ${Number.isInteger(exitCode) ? exitCode : "unknown"}\n(no output)`);
    }
  });

  it("keeps failure status visible before truncated backend output", async () => {
    const client = createConwayStub({exec: async () => ({stdout: "x".repeat(20_000), stderr: "", exitCode: 1})});
    const result = await runTool(client, "exec", {command: "node --version"});
    expect(result.startsWith("exitCode: 1\n")).toBe(true);
    expect(result).toContain("TRUNCATED");
  });

  it("does not execute a shell fallback after backend failure", async () => {
    for (const isLocal of [true, false]) {
      const client = createConwayStub({isLocal, exec: async () => { throw new Error("Backend denied"); }});
      const result = await runTool(client, "exec", {command: "echo LOCAL_SHELL_SENTINEL"});
      expect(result).toContain("Blocked");
      expect(result).not.toContain("LOCAL_SHELL_SENTINEL");
    }
  });

  it("never creates or changes local files after remote write failure", async () => {
    const existing = path.join(testRoot, "existing.txt"), missing = path.join(testRoot, "new-folder", "new.txt");
    writeFileSync(existing, "LOCAL_ORIGINAL");
    for (const isLocal of [false, undefined]) {
      const client = createConwayStub({isLocal, writeFile: async () => { throw new Error("Remote denied"); }});
      for (const target of [existing, missing]) expect(await runTool(client, "write_file", {path: target, content: "REPLACEMENT"})).toContain("Blocked");
    }
    expect(readFileSync(existing, "utf8")).toBe("LOCAL_ORIGINAL");
    expect(existsSync(path.dirname(missing))).toBe(false);
  });

  it("keeps remote patch failures and remote directory listing off the controller filesystem", async () => {
    const target = path.join(testRoot, "private-controller-fixture.txt");writeFileSync(target, "LOCAL_ORIGINAL");
    for (const isLocal of [false, undefined]) {
      const client = createConwayStub({isLocal, readFile: async () => "REMOTE_BEFORE", writeFile: async () => { throw new Error("Remote denied"); }});
      expect(await runTool(client, "patch_file", {path: target, search: "BEFORE", replace: "AFTER"})).toContain("Blocked");
      const listing = await runTool(client, "list_dir", {path: testRoot});expect(listing).toContain("Blocked");expect(listing).not.toContain("private-controller-fixture");
    }
    expect(readFileSync(target, "utf8")).toBe("LOCAL_ORIGINAL");
    expect(await runTool(createConwayStub({isLocal:true}), "list_dir", {path:testRoot})).toContain("private-controller-fixture.txt");
  });

  it("rejects local write aliases before changing their targets", async () => {
    const original = path.join(testRoot, "original.txt");writeFileSync(original, "KEEP");
    const hard = path.join(testRoot, "hard.txt");linkSync(original, hard);
    const nested = path.join(testRoot, "target");mkdirSync(nested);
    const alias = path.join(testRoot, "alias");symlinkSync(nested, alias, process.platform === "win32" ? "junction" : "dir");
    let backendWrites = 0;
    const client = createConwayStub({isLocal: true, writeFile: async () => { backendWrites++; }});
    for (const target of [hard, path.join(alias,"new.txt")]) expect(await runTool(client,"write_file",{path:target,content:"OVERWRITE"})).toContain("Blocked");
    expect(readFileSync(original,"utf8")).toBe("KEEP");expect(existsSync(path.join(nested,"new.txt"))).toBe(false);expect(backendWrites).toBe(0);
    expect(await runTool(client,"list_dir",{path:alias})).toContain("Blocked");
    expect(await runTool(client,"patch_file",{path:hard,search:"KEEP",replace:"BAD"})).toContain("Blocked");
  });

  async function runTool(conway: ConwayClient, toolName: string, args: Record<string, unknown>): Promise<string> {
    const harness = await createHarness(conway);
    const tool = harness.getToolDefs().find((entry) => entry.name === toolName);
    if (!tool) throw new Error(`missing tool: ${toolName}`);
    return tool.execute(args);
  }

  it("blocks patch_file traversal outside the allowed edit root", async () => {
    const outsideFile = path.join(testRoot, "..", "outside.ts");
    const out = await runTool(createConwayStub(), "patch_file", {
      path: outsideFile,
      search: "before",
      replace: "after",
    });

    expect(out).toContain("Blocked: path");
    expect(out).toContain("outside workspace");
  });

  it("blocks list_dir traversal outside the allowed edit root", async () => {
    const out = await runTool(createConwayStub(), "list_dir", { path: "../../etc" });
    expect(out).toContain("Blocked: path");
    expect(out).toContain("outside workspace");
  });

  it("allows patch_file inside the allowed edit root via local fallback", async () => {
    const filePath = path.join(testRoot, "src", "example.ts");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "const value = 'before';\n", "utf8");

    const conway = createConwayStub({
      isLocal: true,
      readFile: async () => {
        throw new Error("force local fallback");
      },
      writeFile: async () => {
        throw new Error("force local fallback");
      },
    });

    const out = await runTool(conway, "patch_file", {
      path: filePath,
      search: "'before'",
      replace: "'after'",
    });

    expect(out).toContain("Patched");
    expect(readFileSync(filePath, "utf8")).toContain("'after'");
  });
});
