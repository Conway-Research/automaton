/**
 * File Path Protection Policy Rules
 *
 * Prevents writes to protected files, reads of sensitive files,
 * and path traversal attacks. Fixes the parallel file mutation
 * paths (edit_own_file vs write_file) by unifying protection.
 */

import path from "path";
import type { PolicyRule, PolicyRequest, PolicyRuleResult } from "../../types.js";
import { isProtectedFile } from "../../self-mod/code.js";

/** Sensitive files that must not be read by the agent */
const SENSITIVE_READ_PATTERNS: string[] = [
  "wallet.json",
  "config.json",
  ".env",
  "automaton.json",
];

/** Glob-like suffix patterns that block reads */
const SENSITIVE_SUFFIX_PATTERNS: string[] = [
  ".key",
  ".pem",
];

/** Prefix patterns for sensitive reads */
const SENSITIVE_PREFIX_PATTERNS: string[] = [
  "private-key",
];

function deny(rule: string, reasonCode: string, humanMessage: string): PolicyRuleResult {
  return { rule, action: "deny", reasonCode, humanMessage };
}

/**
 * Check if a file path matches a sensitive read pattern.
 */
function isSensitiveFile(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const basename = path.basename(resolved);

  // Exact file name matches
  for (const pattern of SENSITIVE_READ_PATTERNS) {
    if (basename === pattern) return true;
  }

  // Suffix matches (.key, .pem)
  for (const suffix of SENSITIVE_SUFFIX_PATTERNS) {
    if (basename.endsWith(suffix)) return true;
  }

  // Prefix matches (private-key*)
  for (const prefix of SENSITIVE_PREFIX_PATTERNS) {
    if (basename.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Deny writes to protected files.
 * Applies to: write_file, edit_own_file
 */
function createProtectedFilesRule(): PolicyRule {
  return {
    id: "path.protected_files",
    description: "Deny writes to protected files",
    priority: 200,
    appliesTo: {
      by: "name",
      names: ["write_file", "edit_own_file"],
    },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const filePath = (request.args.path as string | undefined);
      if (!filePath) return null;

      if (isProtectedFile(filePath)) {
        return deny(
          "path.protected_files",
          "PROTECTED_FILE",
          `Cannot write to protected file: ${filePath}`,
        );
      }
      return null;
    },
  };
}

/**
 * Deny reads of sensitive files (wallet, env, config secrets).
 * Applies to: read_file
 */
function createReadSensitiveRule(): PolicyRule {
  return {
    id: "path.read_sensitive",
    description: "Deny reads of sensitive files (wallet, env, config, keys)",
    priority: 200,
    appliesTo: {
      by: "name",
      names: ["read_file"],
    },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const filePath = (request.args.path as string | undefined);
      if (!filePath) return null;

      if (isSensitiveFile(filePath)) {
        return deny(
          "path.read_sensitive",
          "SENSITIVE_FILE_READ",
          `Cannot read sensitive file: ${filePath}`,
        );
      }
      return null;
    },
  };
}

/**
 * Deny paths containing traversal sequences after resolution.
 *
 * Only applies to edit_own_file, which modifies local agent source code.
 * write_file and read_file operate on the remote Conway sandbox via API,
 * so local cwd-based traversal checks are not meaningful for them and
 * will false-positive on every absolute sandbox path (e.g. /home/conway/app.py).
 */
function createTraversalDetectionRule(): PolicyRule {
  return {
    id: "path.traversal_detection",
    description: "Deny paths containing traversal sequences after resolution",
    priority: 200,
    appliesTo: {
      by: "name",
      names: ["edit_own_file"],
    },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const filePath = (request.args.path as string | undefined);
      if (!filePath) return null;

      // Resolve the path first
      const resolved = path.resolve(filePath);

      // Always verify the resolved path stays within the working directory,
      // regardless of whether ".." is present — absolute paths like
      // "/etc/passwd" can escape without using traversal sequences.
      const cwd = process.cwd();
      if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
        return deny(
          "path.traversal_detection",
          "PATH_TRAVERSAL",
          `Path resolves outside working directory: "${filePath}"`,
        );
      }

      // Also check for double-slash tricks
      if (filePath.includes("//")) {
        return deny(
          "path.traversal_detection",
          "PATH_TRAVERSAL",
          `Suspicious path pattern detected: "${filePath}"`,
        );
      }

      return null;
    },
  };
}

export function createPathProtectionRules(): PolicyRule[] {
  return [
    createProtectedFilesRule(),
    createReadSensitiveRule(),
    createTraversalDetectionRule(),
  ];
}
