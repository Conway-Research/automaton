/**
 * Git Tools
 *
 * Built-in git operations for the automaton.
 * Used for both state versioning and code development.
 */

import type { ConwayClient, GitStatus, GitLogEntry } from "../types.js";

function usesWindowsShell(conway: ConwayClient): boolean {
  return conway.isLocal === true && process.platform === "win32";
}

/**
 * Get git status for a repository.
 */
export async function gitStatus(
  conway: ConwayClient,
  repoPath: string,
): Promise<GitStatus> {
  const result = await conway.exec(
    `git status --porcelain -b`,
    10000,
    repoPath,
  );

  if (result.exitCode !== 0) throw new Error("Git status failed");
  const lines = result.stdout.split("\n").filter(Boolean);
  let branch = "unknown";
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      branch = line.slice(3).split("...")[0];
      continue;
    }

    const statusCode = line.slice(0, 2);
    const file = line.slice(3);

    if (statusCode[0] !== " " && statusCode[0] !== "?") {
      staged.push(file);
    }
    if (statusCode[1] === "M" || statusCode[1] === "D") {
      modified.push(file);
    }
    if (statusCode === "??") {
      untracked.push(file);
    }
  }

  return {
    branch,
    staged,
    modified,
    untracked,
    clean:
      staged.length === 0 && modified.length === 0 && untracked.length === 0,
  };
}

/**
 * Get git diff output.
 */
export async function gitDiff(
  conway: ConwayClient,
  repoPath: string,
  staged: boolean = false,
): Promise<string> {
  const flag = staged ? "--cached" : "";
  const result = await conway.exec(
    `git diff ${flag}`,
    10000,
    repoPath,
  );
  return result.stdout || "(no changes)";
}

/**
 * Create a git commit.
 */
export async function gitCommit(
  conway: ConwayClient,
  repoPath: string,
  message: string,
  addAll: boolean = true,
): Promise<string> {
  if (addAll) {
    const staged = await conway.exec(`git add -A`, 10000, repoPath);
    if (staged.exitCode !== 0) throw new Error("Git staging failed");
  }

  const result = await conway.exec(
    `git commit -m ${escapeShellArg(message, usesWindowsShell(conway))} --allow-empty`,
    10000,
    repoPath,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Git commit failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

/**
 * Get git log.
 */
export async function gitLog(
  conway: ConwayClient,
  repoPath: string,
  limit: number = 10,
): Promise<GitLogEntry[]> {
  const safeLimit = Math.max(1, Math.floor(Number(limit))) || 10;
  const result = await conway.exec(
    `git log --format="%H|%s|%an|%ai" -n ${safeLimit}`,
    10000,
    repoPath,
  );

  if (!result.stdout.trim()) return [];

  return result.stdout
    .trim()
    .split("\n")
    .map((line) => {
      const [hash, message, author, date] = line.split("|");
      return { hash, message, author, date };
    });
}

/**
 * Push to remote.
 */
export async function gitPush(
  conway: ConwayClient,
  repoPath: string,
  remote: string = "origin",
  branch?: string,
): Promise<string> {
  const branchArg = branch ? ` ${escapeShellArg(branch, usesWindowsShell(conway))}` : "";
  const result = await conway.exec(
    `git push ${escapeShellArg(remote, usesWindowsShell(conway))}${branchArg}`,
    30000,
    repoPath,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Git push failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout || "Push successful";
}

/**
 * Manage branches.
 */
export async function gitBranch(
  conway: ConwayClient,
  repoPath: string,
  action: "list" | "create" | "checkout" | "delete",
  branchName?: string,
): Promise<string> {
  let cmd: string;

  switch (action) {
    case "list":
      cmd = `git branch -a`;
      break;
    case "create":
      if (!branchName) throw new Error("Branch name required");
      cmd = `git checkout -b ${escapeShellArg(branchName, usesWindowsShell(conway))}`;
      break;
    case "checkout":
      if (!branchName) throw new Error("Branch name required");
      cmd = `git checkout ${escapeShellArg(branchName, usesWindowsShell(conway))}`;
      break;
    case "delete":
      if (!branchName) throw new Error("Branch name required");
      cmd = `git branch -d ${escapeShellArg(branchName, usesWindowsShell(conway))}`;
      break;
    default:
      throw new Error(`Unknown branch action: ${action}`);
  }

  const result = await conway.exec(cmd, 10000, repoPath);
  return result.stdout || result.stderr || "Done";
}

/**
 * Clone a repository.
 */
export async function gitClone(
  conway: ConwayClient,
  url: string,
  targetPath: string,
  depth?: number,
): Promise<string> {
  const depthArg = depth
    ? ` --depth ${Math.max(1, Math.floor(Number(depth)))}`
    : "";
  const result = await conway.exec(
    `git clone${depthArg} ${escapeShellArg(url, usesWindowsShell(conway))} ${escapeShellArg(targetPath, usesWindowsShell(conway))}`,
    120000,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Git clone failed: ${result.stderr || result.stdout}`);
  }

  return `Cloned ${url} to ${targetPath}`;
}

/**
 * Initialize a git repository.
 */
export async function gitInit(
  conway: ConwayClient,
  repoPath: string,
): Promise<string> {
  const result = await conway.exec(
    `git init`,
    10000,
    repoPath,
  );
  if (result.exitCode !== 0) throw new Error("Git initialization failed");
  return result.stdout || "Git initialized";
}

function escapeShellArg(arg: string, windows: boolean = false): string {
  if (windows) {
    return '"' + arg.replace(/"/g, '\\"') + '"';
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
