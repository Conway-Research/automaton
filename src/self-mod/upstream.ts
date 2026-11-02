/**
 * Upstream Awareness
 *
 * Helpers for the automaton to know its own git origin,
 * detect new upstream commits, and review diffs.
 * All git commands use execFileSync with argument arrays to prevent injection.
 */

import { execFileSync } from "child_process";
import {gitMaintenanceEnvironment,maintenanceExecutable} from './process-environment.js';

const REPO_ROOT = process.cwd();

/**
 * Run a git command using execFileSync with argument array (no shell interpolation).
 */
function git(args: string[]): string {
  try {return execFileSync(maintenanceExecutable("git"), args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    timeout: 15_000,
    maxBuffer: 1_048_576,
    windowsHide: true,
    env: gitMaintenanceEnvironment(),
  }).trim();} catch {throw new Error('Upstream Git operation failed; process details withheld.');}
}

/**
 * Return origin URL (credentials stripped), current branch, and HEAD info.
 */
export function getRepoInfo(): {
  originUrl: string;
  branch: string;
  headHash: string;
  headMessage: string;
} {
  const rawUrl = git(["config", "--get", "remote.origin.url"]);
  // Strip embedded credentials (https://user:token@host/... -> https://host/...)
  const originUrl = rawUrl.replace(/\/\/[^@]+@/, "//").split(/[?#]/)[0];
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const headLine = git(["log", "-1", "--format=%h %s"]);
  const [headHash, ...rest] = headLine.split(" ");
  return { originUrl, branch, headHash, headMessage: rest.join(" ") };
}

/**
 * Fetch origin and report how many commits we're behind.
 */
export function checkUpstream(): {
  behind: number;
  commits: { hash: string; message: string }[];
} {
  git(["fetch", "origin", "main", "--quiet"]);
  const log = git(["log", "HEAD..origin/main", "--oneline"]);
  if (!log) return { behind: 0, commits: [] };
  const commits = log.split("\n").map((line) => {
    const [hash, ...rest] = line.split(" ");
    return { hash, message: rest.join(" ") };
  });
  return { behind: commits.length, commits };
}

/**
 * Return per-commit diffs for every commit ahead of HEAD on origin/main.
 */
export function getUpstreamDiffs(): {
  hash: string;
  message: string;
  author: string;
  diff: string;
}[] {
  const log = git(["log", "HEAD..origin/main", "--format=%H %an|||%s"]);
  if (!log) return [];

  return log.split("\n").map((line) => {
    const [hashAndAuthor, message] = line.split("|||");
    const parts = hashAndAuthor.split(" ");
    const hash = parts[0];
    const author = parts.slice(1).join(" ");
    let diff: string;
    try {
      diff = git(["diff", "--no-ext-diff", "--no-textconv", `${hash}~1..${hash}`]);
    } catch {
      // First commit in the range may not have a parent
      diff = git(["show", "--no-ext-diff", "--no-textconv", hash, "--format=", "--stat"]);
    }
    return { hash: hash.slice(0, 12), message, author, diff };
  });
}
