import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("refuses to read the host file after a remote sandbox failure", async () => {
    const filePath = path.join(testRoot, "notes.txt");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "hello", "utf8");

    const conway = createConwayStub({
      readFile: async () => {
        throw new Error("force local fallback");
      },
    });

    const out = await runTool(conway, "read_file", { path: filePath });
    expect(out).toContain("read error: force local fallback");
    expect(readFileSync(filePath, "utf8")).toBe("hello");
  });

  it("refuses to write the host file after a remote sandbox failure", async () => {
    const filePath = path.join(testRoot, "out", "data.txt");
    const conway = createConwayStub({
      writeFile: async () => {
        throw new Error("force local fallback");
      },
    });

    const out = await runTool(conway, "write_file", { path: filePath, content: "ok" });
    expect(out).toContain("write error: force local fallback");
    expect(() => readFileSync(filePath, "utf8")).toThrow();
  });
});
