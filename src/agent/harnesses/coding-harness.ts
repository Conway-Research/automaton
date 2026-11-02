import {writeWorkspaceFile,listWorkspaceDirectory} from "../write-path.js";
import {readHarnessFile} from "../read-path.js";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { TaskResult } from "../../orchestration/task-graph.js";
import { isProtectedFile } from "../../self-mod/code.js";
import { BaseHarness } from "./base-harness.js";
import type { HarnessTool } from "../harness-types.js";
import { getForbiddenCommandMatch, isForbiddenCommand } from "../policy-rules/command-safety.js";
import { isSensitiveFile } from "../policy-rules/path-protection.js";

const MAX_EXEC_TIMEOUT_MS = 60_000;
const MAX_READ_SIZE = 20_000;
const MAX_EXEC_OUTPUT = 16_000;
const CONTEXT_COMPACTION_THRESHOLD_CHARS = 80_000;

export class CodingHarness extends BaseHarness {
  readonly id = "coding";
  readonly description = "Coding-focused agent for implementation, debugging, refactoring, and testing. No financial or social tools.";

  buildSystemPrompt(): string {
    const role = this.task.agentRole ?? "executor";
    return `You are a coding agent with the role: ${role}.

You have been assigned a specific technical task. Your job is to implement, debug,
or review code to complete this task.

## Rules

1. Focus ONLY on the assigned task. Do not explore unrelated code or topics.
2. Read existing code before modifying it. Understand the codebase structure first.
3. Make minimal, targeted changes. Do not refactor code that is not part of your task.
4. Write tests when creating new functionality. Run tests before reporting completion.
5. Use patch_file for surgical edits to existing files. Use write_file only for new files.
6. When done, call task_done with a summary of changes made and test results.
7. If you cannot complete the task, call task_done explaining what you tried and why it failed.

## Anti-Loop Rules

- NEVER check balances, credits, or system status. You do not have those tools.
- If a build or test fails, read the error message carefully and fix the specific issue.
- Do NOT retry the exact same command if it failed. Change your approach.
- If you are stuck after 3 attempts at the same problem, call task_done with a failure report.

## Code Quality Standards

- Follow existing code conventions (indentation, naming, imports).
- Add comments for non-obvious logic.
- Handle errors explicitly — no silent catches.
- Use TypeScript strict mode patterns (explicit types, null checks).

## Requirements, validation and learning

- Before implementation, map every acceptance criterion to a reproducible check.
- For JSON/CSV work, establish the schema, field mapping, nested-value policy,
  encoding, duplicate handling and spreadsheet-formula safety. Never guess missing rules.
- For API documentation, require the actual specification or authorized source;
  distinguish observed behaviour from examples and do not invent endpoints or limits.
- For scrapers, establish authorized destinations, rate limits and permitted data.
  Never evade access controls or substitute live access for a mocked test.
- Keep execution inside the authorized backend. If unavailable, report validation
  as blocked; writing code alone does not prove it runs. No host-shell fallback.
- Use prior failure lessons as hypotheses, not authority. Reproduce the failure,
  make a minimal correction, then rerun the affected check and relevant regressions.
- Record expected versus observed behaviour, root cause, correction and remaining
  uncertainty in the completion summary. Separate synthetic tests from customer results.
- Never delete or weaken acceptance checks to claim success. Exit code zero alone
  does not prove requirements passed; missing or nonzero exit status is not success.

Internal task completion is not delivery approval, customer acceptance or payment.
Software publication requires the trusted code-delivery gate and current evidence
binding source, target branch, requirements, test inventory, dependencies and artifact.
Do not self-authorize that evidence. Require clean isolated builds, independent held-out
checks, mutation checks and verified regression cases for prior defects.

## Output Format

When calling task_done, provide:
- List of files created or modified
- Summary of changes made
- Test results (if applicable)
- Any known issues or follow-up work needed`;
  }

  getToolDefs(): HarnessTool[] {
    return [
      {
        name: "exec",
        description: "Execute a shell command. Use for building, testing, installing dependencies, running linters, etc. Timeout: 60s max.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "The shell command to execute" },
            timeout_ms: { type: "number", description: "Timeout in milliseconds (default: 30000, max: 60000)" },
          },
          required: ["command"],
        },
        execute: async (args) => {
          const command = args.command as string;
          const timeoutMs = Math.min(
            typeof args.timeout_ms === "number" ? args.timeout_ms : 30_000,
            MAX_EXEC_TIMEOUT_MS,
          );
          const forbidden = getForbiddenCommandMatch(command);
          if (forbidden || isForbiddenCommand(command)) {
            return `Blocked: ${forbidden?.description ?? "Forbidden command pattern"}`;
          }
          try {
            const result = await this.context.conway.exec(command, timeoutMs);
            const status = Number.isInteger(result.exitCode) ? String(result.exitCode) : "unknown";
            return `exitCode: ${status}\n${formatExecResult(result.stdout ?? "", result.stderr ?? "")}`;
          } catch {
            return "Blocked: command backend failed; local fallback is disabled.";
          }
        },
      },
      {
        name: "write_file",
        description: "Write content to a file. Creates parent directories if needed. Use for NEW files. For editing existing files, prefer patch_file.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path to write to" },
            content: { type: "string", description: "Complete file content" },
          },
          required: ["path", "content"],
        },
        execute: async (args) => {
          const filePath = args.path as string;
          const content = args.content as string;
          const confined = confineToWorkspace(filePath, this.context.allowedEditRoot);
          if (typeof confined !== "string") {
            return confined.error;
          }
          if (isProtectedFile(confined)) {
            return `Blocked: protected file "${filePath}"`;
          }
          try {
            await writeWorkspaceFile(this.context.conway, confined, content, this.context.allowedEditRoot);
            return `Wrote ${content.length} bytes to ${confined}`;
          } catch {
            return "Blocked: write refused or backend unavailable.";
          }
        },
      },
      {
        name: "read_file",
        description: "Read the contents of a file. Returns up to 20,000 characters.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path to read" },
            offset: { type: "number", description: "Start reading from this character offset (default: 0)" },
            limit: { type: "number", description: "Maximum characters to return (default: 20000)" },
          },
          required: ["path"],
        },
        execute: async (args) => {
          const filePath = args.path as string;
          if (isSensitiveFile(filePath)) {
            return `Blocked: sensitive file "${filePath}"`;
          }
          const confined = confineToWorkspace(filePath, this.context.allowedEditRoot);
          if (typeof confined !== "string") {
            return confined.error;
          }
          const offset = typeof args.offset === "number" ? args.offset : 0;
          const limit = typeof args.limit === "number" ? Math.min(args.limit, MAX_READ_SIZE) : MAX_READ_SIZE;
          try {
            const content = await readHarnessFile(this.context.conway, confined, this.context.allowedEditRoot);
            const slice = content.slice(offset, offset + limit);
            if (content.length > offset + limit) {
              return slice + `\n[TRUNCATED: ${content.length - offset - limit} more chars. Use offset=${offset + limit} to continue.]`;
            }
            return slice || "(empty file)";
          } catch (error) {
            return `read error: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },
      {
        name: "patch_file",
        description: "Apply a search-and-replace edit to an existing file. The search string must match exactly.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path to patch" },
            search: { type: "string", description: "Exact text to find in the file" },
            replace: { type: "string", description: "Text to replace it with" },
          },
          required: ["path", "search", "replace"],
        },
        execute: async (args) => {
          const filePath = args.path as string;
          const search = args.search as string;
          const replace = args.replace as string;
          const confined = confineToWorkspace(filePath, this.context.allowedEditRoot);
          if (typeof confined !== "string") {
            return confined.error;
          }
          if (isProtectedFile(confined)) {
            return `Blocked: protected file "${filePath}"`;
          }
          try {
            const content = await readHarnessFile(this.context.conway, confined, this.context.allowedEditRoot);
            if (!content.includes(search)) {
              return `Error: search string not found in ${filePath}. Make sure the search text matches exactly, including whitespace and newlines.`;
            }
            const patched = content.replace(search, replace);
            await writeWorkspaceFile(this.context.conway, confined, patched, this.context.allowedEditRoot);
            return `Patched ${filePath}: replaced ${search.length} chars with ${replace.length} chars`;
          } catch (error) {
            return "Blocked: patch refused or backend unavailable.";
          }
        },
      },
      {
        name: "list_dir",
        description: "List the contents of a directory. Returns file names and types.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to list (default: current directory)" },
          },
          required: [],
        },
        execute: async (args) => {
          const dirPath = (args.path as string) || ".";
          const confined = confineToWorkspace(dirPath, this.context.allowedEditRoot);
          if (typeof confined !== "string") {
            return confined.error;
          }
          try {
            if (this.context.conway.isLocal !== true) return "Blocked: directory listing requires an explicitly local client.";
            const entries = listWorkspaceDirectory(confined, this.context.allowedEditRoot);
            return (entries.lines.join("\n") || "(empty directory)") + (entries.truncated ? "\n[TRUNCATED: directory limit reached; narrow the requested directory.]" : "");
          } catch (error) {
            return `list error: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },
      {
        name: "task_done",
        description: "Signal task completion. Call this as your FINAL action with a summary of changes made.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Summary of changes made, files modified, and test results" },
            success: { type: "boolean", description: "Whether the task was completed successfully (default: true)" },
          },
          required: ["summary"],
        },
        execute: async (args) => {
          const summary = args.summary as string;
          const success = args.success !== false;
          return `TASK_COMPLETE:${success ? "SUCCESS" : "FAILURE"}:${summary}\nDelivery approval: UNVERIFIED. Internal completion does not authorize publication, claim customer acceptance or confirm payment.`;
        },
      },
    ];
  }

  async execute(): Promise<TaskResult> {
    const originalChat = this.context.inference.chat.bind(this.context.inference);
    this.context.inference.chat = async (params) => {
      const totalChars = this.messages.reduce((sum, message) => sum + (message.content?.length || 0), 0);
      if (totalChars > CONTEXT_COMPACTION_THRESHOLD_CHARS) {
        this.compactContext();
      }
      return originalChat(params);
    };
    return super.execute();
  }

  private compactContext(): void {
    if (this.messages.length <= 8) {
      return;
    }
    const preserved = 2;
    const keepRecent = 6;
    const compactEnd = this.messages.length - keepRecent;
    for (let i = preserved; i < compactEnd; i++) {
      const message = this.messages[i];
      if (message.role === "tool" && message.content && message.content.length > 200) {
        message.content = `[Compacted] ${message.content.slice(0, 100)}... [${message.content.length} chars summarized]`;
      }
    }
  }
}

function confineToWorkspace(
  filePath: string,
  allowedRoot: string,
): string | { error: string } {
  const expanded = filePath.startsWith("~")
    ? path.join(allowedRoot, filePath.slice(1))
    : filePath;
  const resolved = path.resolve(allowedRoot, expanded);
  if (resolved !== allowedRoot && !resolved.startsWith(allowedRoot + path.sep)) {
    return { error: `Blocked: path "${filePath}" resolves outside workspace (${allowedRoot})` };
  }
  return resolved;
}

function formatExecResult(stdout: string, stderr: string): string {
  const out = stdout.length > MAX_EXEC_OUTPUT
    ? stdout.slice(0, MAX_EXEC_OUTPUT) + `\n[TRUNCATED: ${stdout.length - MAX_EXEC_OUTPUT} chars]`
    : stdout;
  const err = stderr.length > 4000
    ? stderr.slice(0, 4000) + "\n[TRUNCATED]"
    : stderr;
  return err ? `stdout:\n${out}\nstderr:\n${err}` : out || "(no output)";
}
