import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentWorkspace, createWorkspace } from "../../orchestration/workspace.js";

describe("orchestration/workspace", () => {
  const tmpRoots: string[] = [];

  let basePath: string;
  let workspace: AgentWorkspace;

  beforeEach(() => {
    basePath = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-test-"));
    tmpRoots.push(basePath);
    workspace = new AgentWorkspace("goal-1", basePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tmpRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates directory structure on construction", () => {
    expect(fs.existsSync(path.join(basePath, "outputs"))).toBe(true);
    expect(fs.existsSync(path.join(basePath, "context"))).toBe(true);
    expect(fs.existsSync(path.join(basePath, "checkpoints"))).toBe(true);
  });

  it("rejects empty goalId", () => {
    expect(() => new AgentWorkspace("   ", basePath)).toThrow("goalId must be a non-empty string");
  });

  it("writeOutput writes a file and returns absolute path", () => {
    const outputPath = workspace.writeOutput("builder", "result.txt", "hello world");

    expect(path.isAbsolute(outputPath)).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath, "utf8")).toBe("hello world");
  });

  it("writeOutput supports nested directories", () => {
    const outputPath = workspace.writeOutput("builder", "nested/report.md", "report");

    expect(fs.existsSync(path.join(basePath, "outputs", "nested"))).toBe(true);
    expect(fs.readFileSync(outputPath, "utf8")).toBe("report");
  });

  it("writeOutput normalizes role labels", () => {
    workspace.writeOutput("  role   with   spaces  ", "file.txt", "content");
    const files = workspace.listOutputs();

    expect(files[0].agentRole).toBe("role with spaces");
  });

  it("writeOutput rejects empty filenames", () => {
    expect(() => workspace.writeOutput("builder", "   ", "x")).toThrow("filename must be a non-empty string");
  });

  it("writeOutput blocks path traversal", () => {
    expect(() => workspace.writeOutput("builder", "../escape.txt", "x")).toThrow(
      "Invalid output filename outside workspace outputs/: ../escape.txt",
    );
  });

  it("readOutput reads written file contents", () => {
    workspace.writeOutput("builder", "readme.md", "hello\nworld");
    expect(workspace.readOutput("readme.md")).toBe("hello\nworld");
  });

  it("readOutput handles nested filenames", () => {
    workspace.writeOutput("builder", "a/b/c.txt", "nested");
    expect(workspace.readOutput("a/b/c.txt")).toBe("nested");
  });

  it("readOutput throws for missing files", () => {
    expect(() => workspace.readOutput("missing.txt")).toThrow(
      "Workspace output does not exist: missing.txt",
    );
  });

  it("listOutputs lists files sorted by path", () => {
    workspace.writeOutput("builder", "z.txt", "z");
    workspace.writeOutput("builder", "a.txt", "a");

    const files = workspace.listOutputs();
    const names = files.map((entry) => path.basename(entry.path));

    expect(names).toEqual(["a.txt", "z.txt"]);
  });

  it("listOutputs returns metadata for known files", () => {
    workspace.writeOutput("writer", "summary.txt", "some content");
    const file = workspace.listOutputs()[0];

    expect(file.agentRole).toBe("writer");
    expect(file.size).toBe(Buffer.byteLength("some content", "utf8"));
    expect(file.tokenEstimate).toBe(Math.ceil("some content".length / 3.5));
    expect(file.createdAt.length).toBeGreaterThan(0);
    expect(file.summary).toBe("some content");
  });

  it("listOutputs discovers externally written files", () => {
    const externalPath = path.join(basePath, "outputs", "external.txt");
    fs.writeFileSync(externalPath, "outside write", "utf8");

    const file = workspace.listOutputs().find((entry) => entry.path === externalPath);
    expect(file).toBeDefined();
    expect(file?.agentRole).toBe("unknown");
    expect(file?.summary).toBe("outside write");
  });

  it("listOutputs refreshes file size for tracked entries", () => {
    const outputPath = workspace.writeOutput("builder", "size.txt", "small");
    fs.writeFileSync(outputPath, "much larger content", "utf8");

    const file = workspace.listOutputs().find((entry) => entry.path === outputPath);
    expect(file?.size).toBe(Buffer.byteLength("much larger content", "utf8"));
  });

  it("logDecision appends entries to decisions.md", () => {
    workspace.logDecision("Ship", "Need to unblock", "planner");
    workspace.logDecision("Roll back", "Bug observed", "operator");

    const log = fs.readFileSync(path.join(basePath, "context", "decisions.md"), "utf8");
    expect(log).toContain("Decision: Ship");
    expect(log).toContain("Rationale: Need to unblock");
    expect(log).toContain("Decision: Roll back");
    expect(log).toContain("Rationale: Bug observed");
  });

  it("logDecision uses fallback labels for blank values", () => {
    workspace.logDecision("   ", "   ", "   ");

    const log = fs.readFileSync(path.join(basePath, "context", "decisions.md"), "utf8");
    expect(log).toContain("- Decision: (no decision provided)");
    expect(log).toContain("- Rationale: (no rationale provided)");
    expect(log).toContain("- unknown");
  });

  it("getSummary returns empty string when no outputs exist", () => {
    expect(workspace.getSummary()).toBe("");
  });

  it("getSummary returns compact listing", () => {
    workspace.writeOutput("builder", "alpha.txt", "Alpha summary line");
    workspace.writeOutput("builder", "beta.txt", "Beta summary line");

    const summary = workspace.getSummary();
    expect(summary).toContain("alpha.txt (");
    expect(summary).toContain("beta.txt (");
    expect(summary).toContain("tokens");
  });

  it("getSummary uses no summary for whitespace-only file content", () => {
    workspace.writeOutput("builder", "blank.txt", "    \n\t   ");

    const summary = workspace.getSummary();
    expect(summary).toContain("blank.txt");
    expect(summary).toContain("no summary");
  });

  it("writeOutput summary snippet is truncated to 100 chars", () => {
    const longContent = "x".repeat(200);
    workspace.writeOutput("builder", "long.txt", longContent);

    const file = workspace.listOutputs().find((entry) => entry.path.endsWith("long.txt"));
    expect(file?.summary).toBe("x".repeat(100));
  });

  it("createWorkspace uses homedir-based default path", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-home-"));
    tmpRoots.push(fakeHome);

    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const ws = createWorkspace("goal-create");
    expect(ws.basePath).toBe(path.join(fakeHome, ".automaton", "workspace", "goal-create"));
    expect(fs.existsSync(path.join(fakeHome, ".automaton", "workspace", "goal-create", "outputs"))).toBe(true);
  });
});
