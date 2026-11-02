import { symlinkSync, linkSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GeneralHarness } from "../../agent/harnesses/general-harness.js";
import type { HarnessContext } from "../../agent/harness-types.js";
import type { ConwayClient } from "../../types.js";
import { AgentWorkspace } from "../../orchestration/workspace.js";
import { createInMemoryDb } from "./test-db.js";
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

describe("agent/general-harness security", () => {
  let db: ReturnType<typeof createInMemoryDb>;
  let testRoot: string;

  beforeEach(() => {
    db = createInMemoryDb();
    testRoot = mkdtempSync(path.join(process.cwd(), ".tmp-general-harness-"));
  });

  afterEach(() => {
    db.close();
    rmSync(testRoot, { recursive: true, force: true });
  });

  async function createHarness(conway: ConwayClient) {
    const harness = new GeneralHarness();
    const workspace = new AgentWorkspace("goal-test", path.join(testRoot, "workspace"));
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
      goalId: "goal-test",
    };

    await harness.initialize(
      {
        id: "task-1",
        parentId: null,
        goalId: "goal-test",
        title: "Read and write files safely",
        description: "Use file tools safely",
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

  it("rejects local write aliases before changing their targets", async () => {
    const original = path.join(testRoot, "original.txt");writeFileSync(original, "KEEP");
    const hard = path.join(testRoot, "hard.txt");linkSync(original, hard);
    const nested = path.join(testRoot, "target");mkdirSync(nested);
    const alias = path.join(testRoot, "alias");symlinkSync(nested, alias, process.platform === "win32" ? "junction" : "dir");
    let backendWrites = 0;
    const client = createConwayStub({isLocal: true, writeFile: async () => { backendWrites++; }});
    for (const target of [hard, path.join(alias,"new.txt")]) expect(await runTool(client,"write_file",{path:target,content:"OVERWRITE"})).toContain("Blocked");
    expect(readFileSync(original,"utf8")).toBe("KEEP");expect(existsSync(path.join(nested,"new.txt"))).toBe(false);expect(backendWrites).toBe(0);

  });

  async function runTool(
    conway: ConwayClient,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const harness = await createHarness(conway);
    const tool = harness.getToolDefs().find((entry) => entry.name === toolName);
    if (!tool) throw new Error(`missing tool: ${toolName}`);
    return tool.execute(args);
  }

  it("blocks sensitive file reads (wallet.json)", async () => {
    const out = await runTool(createConwayStub(), "read_file", { path: "wallet.json" });
    expect(out).toContain("Blocked: cannot read sensitive file");
  });

  it("blocks traversal reads outside the allowed edit root", async () => {
    const out = await runTool(createConwayStub(), "read_file", { path: "../../etc/passwd" });
    expect(out).toContain("Blocked: path");
    expect(out).toContain("outside workspace");
  });

  it("blocks absolute-path reads outside the allowed edit root", async () => {
    const out = await runTool(createConwayStub(), "read_file", { path: "/etc/passwd" });
    expect(out).toContain("Blocked: path");
  });

  it("blocks writes outside the allowed edit root", async () => {
    const out = await runTool(createConwayStub(), "write_file", {
      path: "../../tmp/pwned.txt",
      content: "x",
    });
    expect(out).toContain("Blocked: path");
  });

  it("blocks writes to protected files", async () => {
    const out = await runTool(createConwayStub(), "write_file", {
      path: "constitution.md",
      content: "tamper",
    });
    expect(out).toContain("Blocked: cannot write to protected file");
  });

  it("blocks forbidden shell commands", async () => {
    const out = await runTool(createConwayStub(), "exec", {
      command: "cat ~/.automaton/wallet.json",
    });
    expect(out).toContain("Blocked:");
  });

  it("allows normal read_file paths inside the allowed edit root", async () => {
    const filePath = path.join(testRoot, "notes.txt");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "hello", "utf8");

    const conway = createConwayStub({
      isLocal: true,
      readFile: async () => {
        throw new Error("force local fallback");
      },
    });

    const out = await runTool(conway, "read_file", { path: filePath });
    expect(out).toBe("hello");
  });

  it("allows normal write_file paths inside the allowed edit root", async () => {
    const filePath = path.join(testRoot, "out", "data.txt");
    const conway = createConwayStub({
      isLocal: true,
      writeFile: async () => {
        throw new Error("force local fallback");
      },
    });

    const out = await runTool(conway, "write_file", { path: filePath, content: "ok" });
    expect(out).toContain("Wrote 2 bytes");
    expect(readFileSync(filePath, "utf8")).toBe("ok");
  });
});
