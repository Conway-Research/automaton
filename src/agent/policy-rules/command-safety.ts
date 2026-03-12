/**
 * Command Safety Policy Rules
 *
 * Detects shell injection attempts and forbidden command patterns.
 * These rules are the primary defense; isForbiddenCommand() in tools.ts
 * is kept as defense-in-depth.
 */

import type { PolicyRule, PolicyRequest, PolicyRuleResult } from "../../types.js";

// Shell metacharacters that could enable injection when interpolated
const SHELL_METACHAR_RE = /[;|&$`\n(){}<>]/;

// Tools whose arguments may be interpolated into shell commands
const SHELL_INTERPOLATED_TOOLS = new Set([
  "exec",
  "pull_upstream",
  "install_npm_package",
  "install_mcp_server",
  "install_skill",
  "create_skill",
  "remove_skill",
]);

// Fields per tool that get interpolated into shell commands
const SHELL_FIELDS: Record<string, string[]> = {
  exec: [], // exec is the shell itself, handled by forbidden_patterns
  pull_upstream: ["commit"],
  install_npm_package: ["package"],
  install_mcp_server: ["package", "name"],
  install_skill: ["name", "url"],
  create_skill: ["name"],
  remove_skill: ["name"],
};

// Forbidden command patterns (migrated from tools.ts isForbiddenCommand)
const FORBIDDEN_COMMAND_PATTERNS: { pattern: RegExp; description: string }[] = [
  // Self-destruction
  { pattern: /rm\s+(-rf?\s+)?.*\.automaton/, description: "Delete .automaton directory" },
  { pattern: /rm\s+(-rf?\s+)?.*state\.db/, description: "Delete state database" },
  { pattern: /rm\s+(-rf?\s+)?.*wallet\.json/, description: "Delete wallet" },
  { pattern: /rm\s+(-rf?\s+)?.*automaton\.json/, description: "Delete config" },
  { pattern: /rm\s+(-rf?\s+)?.*heartbeat\.yml/, description: "Delete heartbeat config" },
  { pattern: /rm\s+(-rf?\s+)?.*SOUL\.md/, description: "Delete SOUL.md" },
  // Process killing
  { pattern: /kill\s+.*automaton/, description: "Kill automaton process" },
  { pattern: /pkill\s+.*automaton/, description: "Kill automaton process" },
  { pattern: /systemctl\s+(stop|disable)\s+automaton/, description: "Stop automaton service" },
  // Database destruction
  { pattern: /DROP\s+TABLE/i, description: "Drop database table" },
  { pattern: /DELETE\s+FROM\s+(turns|identity|kv|schema_version|skills|children|registry)/i, description: "Delete from critical table" },
  { pattern: /TRUNCATE/i, description: "Truncate table" },
  // Safety infrastructure modification via shell
  { pattern: /sed\s+.*injection-defense/, description: "Modify injection defense via sed" },
  { pattern: /sed\s+.*self-mod\/code/, description: "Modify self-mod code via sed" },
  { pattern: /sed\s+.*audit-log/, description: "Modify audit log via sed" },
  { pattern: />\s*.*injection-defense/, description: "Overwrite injection defense" },
  { pattern: />\s*.*self-mod\/code/, description: "Overwrite self-mod code" },
  { pattern: />\s*.*audit-log/, description: "Overwrite audit log" },
  // Credential harvesting
  { pattern: /cat\s+.*\.ssh/, description: "Read SSH keys" },
  { pattern: /cat\s+.*\.gnupg/, description: "Read GPG keys" },
  { pattern: /cat\s+.*\.env/, description: "Read environment file" },
  { pattern: /cat\s+.*wallet\.json/, description: "Read wallet file" },
  // Environment variable exfiltration
  { pattern: /^\s*env\s*$/, description: "Dump environment variables" },
  { pattern: /\bprintenv\b/, description: "Print environment variables" },
  { pattern: /^\s*set\s*$/, description: "Dump shell variables" },
  { pattern: /\/proc\/self\/environ/, description: "Read process environment" },
  { pattern: /echo\s+\$[A-Z_]*KEY/i, description: "Echo API key variable" },
  { pattern: /echo\s+\$[A-Z_]*SECRET/i, description: "Echo secret variable" },
  { pattern: /echo\s+\$[A-Z_]*TOKEN/i, description: "Echo token variable" },
  { pattern: /echo\s+\$[A-Z_]*PASSWORD/i, description: "Echo password variable" },
  // Network exfiltration
  { pattern: /curl\s+.*\|\s*sh/, description: "Pipe curl to shell" },
  { pattern: /wget\s+.*\|\s*sh/, description: "Pipe wget to shell" },
  { pattern: /curl\s+.*-d\s+.*\$/, description: "Exfiltrate env via curl" },
  // Crypto key theft
  { pattern: /cat\s+.*\.pem/, description: "Read PEM key file" },
  { pattern: /cat\s+.*\.key/, description: "Read key file" },
  { pattern: /cat\s+.*private/, description: "Read private key file" },
  // Disk/system destruction
  { pattern: /mkfs/, description: "Format filesystem" },
  { pattern: /dd\s+if=.*of=\/dev/, description: "Raw disk write" },
  { pattern: /chmod\s+777/, description: "World-writable permissions" },
  { pattern: /chown\s+.*root/, description: "Change ownership to root" },
  // Policy engine modification via shell
  { pattern: /sed\s+.*policy-engine/, description: "Modify policy engine via sed" },
  { pattern: /sed\s+.*policy-rules/, description: "Modify policy rules via sed" },
  { pattern: />\s*.*policy-engine/, description: "Overwrite policy engine" },
  { pattern: />\s*.*policy-rules/, description: "Overwrite policy rules" },
];

function deny(rule: string, reasonCode: string, humanMessage: string): PolicyRuleResult {
  return { rule, action: "deny", reasonCode, humanMessage };
}

/**
 * Detect shell metacharacters in tool arguments that will be
 * interpolated into shell commands.
 */
function createShellInjectionRule(): PolicyRule {
  return {
    id: "command.shell_injection",
    description: "Detect shell metacharacters in arguments interpolated into shell commands",
    priority: 300,
    appliesTo: {
      by: "name",
      names: Array.from(SHELL_INTERPOLATED_TOOLS),
    },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const fields = SHELL_FIELDS[request.tool.name];
      if (!fields || fields.length === 0) return null;

      for (const field of fields) {
        const value = request.args[field];
        if (typeof value !== "string") continue;

        if (SHELL_METACHAR_RE.test(value)) {
          return deny(
            "command.shell_injection",
            "SHELL_INJECTION_DETECTED",
            `Shell metacharacter detected in ${request.tool.name}.${field}: "${value.slice(0, 50)}"`,
          );
        }
      }

      return null;
    },
  };
}

/**
 * Check exec commands against forbidden patterns.
 * Replaces the isForbiddenCommand() function with a proper policy rule.
 */
function createForbiddenPatternsRule(): PolicyRule {
  return {
    id: "command.forbidden_patterns",
    description: "Block self-destructive and credential-harvesting shell commands",
    priority: 300,
    appliesTo: {
      by: "name",
      names: ["exec"],
    },
    evaluate(request: PolicyRequest): PolicyRuleResult | null {
      const command = request.args.command as string | undefined;
      if (!command) return null;

      for (const { pattern, description } of FORBIDDEN_COMMAND_PATTERNS) {
        if (pattern.test(command)) {
          return deny(
            "command.forbidden_patterns",
            "FORBIDDEN_COMMAND",
            `Blocked: ${description} (pattern: ${pattern.source})`,
          );
        }
      }

      return null;
    },
  };
}

export function createCommandSafetyRules(): PolicyRule[] {
  return [
    createShellInjectionRule(),
    createForbiddenPatternsRule(),
  ];
}
