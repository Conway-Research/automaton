import {isSensitiveReadPath,readLocalToolFile} from "./read-path.js";
import {localOperation,CONWAY_ONLY_TOOLS} from '../conway/operating-mode.js';
/**
 * Automaton Tool System
 *
 * Defines all tools the automaton can call, with self-preservation guards.
 * Tools are organized by category and exposed to the inference model.
 */

import {confineWritePath,assertWriteContent} from "./write-path.js";
import { ulid } from "ulid";
import type {
  AutomatonTool,
  ToolContext,
  ToolCategory,
  InferenceToolDefinition,
  ToolCallResult,
  GenesisConfig,
  RiskLevel,
  PolicyRequest,
  InputSource,
  SpendTrackerInterface,
} from "../types.js";
import type { PolicyEngine } from "./policy-engine.js";
import { sanitizeToolResult, sanitizeInput } from "./injection-defense.js";
import { createLogger } from "../observability/logger.js";
import {assertNoKnownSecrets,redactLogText} from '../observability/redaction.js';
import { RevenueStore } from "../revenue/store.js";
import { assessMarketingPlan, type MarketingPlan } from "../revenue/marketing.js";
import {compareOptimization,type OptimizationComparison} from '../revenue/optimization-comparison.js';
import {registerOptimizationTrial,recordOptimizationResult,assessOptimizationTrial,type TrialManifest,type TrialResult} from '../revenue/optimization-trials.js';
import {assessOptimizationPayback,type OptimizationPaybackInput} from '../revenue/optimization-payback.js';
import {bindOptimizationCost} from '../revenue/optimization-overhead.js';
import {stageOptimizationRollout,inspectOptimizationRollout,rollbackOptimization} from '../revenue/optimization-rollout.js';
import {ResearchStore} from '../revenue/research.js';
import {recordEconomicCitation,type EconomicCitation} from '../revenue/research-assumptions.js';
import { economicMissionAgenda } from "../revenue/mission.js";
import {assessExperimentOutcome} from '../revenue/outcome.js';
import {createLocalProductTool,createProductQualityTool} from '../commerce/product-tool.js';
import {createServiceDeliveryTool} from '../commerce/service-delivery.js';
import {createSupportTools} from '../commerce/support-tools.js';
import { researchStrategies, strategyCatalogue, type StrategyResearchInput } from "../revenue/strategy-research.js";
import { StrategySeriesStore, type SeriesRegistration, type TrialSettings } from "../revenue/strategy-series.js";
import type { Bar } from "../revenue/paper-trading.js";
import { PaperPortfolio, type PaperPortfolioLimits, type PaperObservation } from "../revenue/paper-portfolio.js";
import type { PaperPlan } from "../revenue/paper-trading.js";

const logger = createLogger("tools");

// â”€â”€â”€ Path Confinement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tools whose results come from external sources and need sanitization
const EXTERNAL_SOURCE_TOOLS = new Set([
  "revenue_research_economics",
  "exec",
  "web_fetch",
  "check_social_inbox",
]);

// â”€â”€â”€ Self-Preservation Guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Defense-in-depth: policy engine (command.forbidden_patterns rule) is the primary guard.
// This inline check is kept as a secondary safety net in case the policy engine is bypassed.

const FORBIDDEN_COMMAND_PATTERNS = [
  // Self-destruction
  /rm\s+(-rf?\s+)?.*\.automaton/,
  /rm\s+(-rf?\s+)?.*state\.db/,
  /rm\s+(-rf?\s+)?.*wallet\.json/,
  /rm\s+(-rf?\s+)?.*automaton\.json/,
  /rm\s+(-rf?\s+)?.*heartbeat\.yml/,
  /rm\s+(-rf?\s+)?.*SOUL\.md/,
  // Process killing
  /kill\s+.*automaton/,
  /pkill\s+.*automaton/,
  /systemctl\s+(stop|disable)\s+automaton/,
  // Database destruction
  /DROP\s+TABLE/i,
  /DELETE\s+FROM\s+(turns|identity|kv|schema_version|skills|children|registry)/i,
  /TRUNCATE/i,
  // Safety infrastructure modification via shell
  /sed\s+.*injection-defense/,
  /sed\s+.*self-mod\/code/,
  /sed\s+.*audit-log/,
  />\s*.*injection-defense/,
  />\s*.*self-mod\/code/,
  />\s*.*audit-log/,
  // Credential harvesting
  /cat\s+.*\.ssh/,
  /cat\s+.*\.gnupg/,
  /cat\s+.*\.env/,
  /cat\s+.*wallet\.json/,
];

function isForbiddenCommand(command: string, sandboxId: string): string | null {
  for (const pattern of FORBIDDEN_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked: Command matches self-harm pattern: ${pattern.source}`;
    }
  }

  // Block deleting own sandbox
  if (command.includes("sandbox_delete") && command.includes(sandboxId)) {
    return "Blocked: Cannot delete own sandbox";
  }

  return null;
}

// â”€â”€â”€ Built-in Tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function createBuiltinTools(sandboxId: string): AutomatonTool[] {
  const tools: AutomatonTool[] = [
    createLocalProductTool(),
    createProductQualityTool(),
    createServiceDeliveryTool(),
    ...createSupportTools(),
    // â”€â”€ VM/Sandbox Tools â”€â”€
    {
      name: "exec",
      description:
        "Execute a shell command in your sandbox. Returns stdout, stderr, and exit code.",
      category: "vm",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          timeout: {
            type: "number",
            description: "Timeout in milliseconds (default: 30000)",
          },
        },
        required: ["command"],
      },
      execute: async (args, ctx) => {
        const command = args.command as string;
        const forbidden = isForbiddenCommand(command, ctx.identity.sandboxId);
        if (forbidden) return forbidden;

        const result = await ctx.conway.exec(
          command,
          (args.timeout as number) || 30000,
        );
        return `exit_code: ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
      },
    },
    {
      name: "write_file",
      description: "Write content to a file in your sandbox.",
      category: "vm",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
      },
      execute: async (args, ctx) => {
        const filePath = args.path as string;
        try { assertWriteContent(args.content); } catch { return "Blocked: write content must be text of at most 1 MiB UTF-8."; }
        // Path confinement: restrict writes to sandbox home directory
        const { isProtectedFile } = await import("../self-mod/code.js");
        const confined = confineWritePath(filePath, ctx.conway.isLocal !== true);
        if (typeof confined === "object") return confined.error;
        // Guard against overwriting protected files (same check as edit_own_file)

        if (isProtectedFile(confined)) {
          return "Blocked: Cannot overwrite protected file. This is a hard-coded safety invariant.";
        }
        await ctx.conway.writeFile(confined, args.content as string);
        return `File written: ${confined}`;
      },
    },
    {
      name: "read_file",
      description: "Read content from a file in your sandbox.",
      category: "vm",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
      execute: async (args, ctx) => {
        const filePath = args.path as string;
        if (isSensitiveReadPath(filePath)) {
          return "Blocked: Cannot read sensitive file. This protects credentials and secrets.";
        }
        if (ctx.conway.isLocal === true) {
          try { return readLocalToolFile(filePath,ctx.allowedReadRoot); }
          catch { return "Blocked: Local file is unsafe, unavailable or exceeds the read limit."; }
        }
        try {
          return await ctx.conway.readFile(filePath);
        } catch {
          return "Blocked: remote file read refused or unavailable; no alternate transport attempted.";
        }
      },
    },
    {
      name: "expose_port",
      description:
        "Expose a port from your sandbox to the internet. Returns a public URL.",
      category: "vm",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          port: { type: "number", description: "Port number to expose" },
        },
        required: ["port"],
      },
      execute: async (args, ctx) => {
        const info = await ctx.conway.exposePort(args.port as number);
        return `Port ${info.port} exposed at: ${info.publicUrl}`;
      },
    },
    {
      name: "remove_port",
      description: "Remove a previously exposed port.",
      category: "vm",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          port: { type: "number", description: "Port number to remove" },
        },
        required: ["port"],
      },
      execute: async (args, ctx) => {
        await ctx.conway.removePort(args.port as number);
        return `Port ${args.port} removed`;
      },
    },

    // â”€â”€ Conway API Tools â”€â”€
    {
      name: "check_credits",
      description: "Check your current Conway compute credit balance.",
      category: "conway",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const balance = await ctx.conway.getCreditsBalance();
        return `Credit balance: $${(balance / 100).toFixed(2)} (${balance} cents)`;
      },
    },
    {
      name: "check_usdc_balance",
      description: "Check your on-chain USDC balance.",
      category: "conway",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const { getUsdcBalance } = await import("../conway/x402.js");
        const chainType = ctx.config.chainType || ctx.identity.chainType || "evm";
        const network = chainType === "solana" ? "solana:mainnet" : "eip155:8453";
        const balance = await getUsdcBalance(ctx.identity.address, network, chainType);
        const networkLabel = chainType === "solana" ? "Solana" : "Base";
        return `USDC balance: ${balance.toFixed(6)} USDC on ${networkLabel}`;
      },
    },
    {
      name: "topup_credits",
      description:
        "Buy Conway compute credits by paying USDC from your wallet via x402. Valid tier amounts: $5, $25, $100, $500, $1000, $2500. Check your USDC balance first with check_usdc_balance.",
      category: "financial",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          amount_usd: {
            type: "number",
            description:
              "Amount in USD to spend on credits. Must be one of the valid tiers: 5, 25, 100, 500, 1000, 2500.",
          },
        },
        required: ["amount_usd"],
      },
      execute: async (args, ctx) => {
        // Solana guard: x402 topup is EVM-only
        const chainType = ctx.config.chainType || ctx.identity.chainType || "evm";
        if (chainType === "solana") {
          return "Credit topup via x402 requires an EVM wallet. Solana automatons should fund credits via the Conway dashboard or credits API.";
        }

        const { topupCredits, TOPUP_TIERS } =
          await import("../conway/topup.js");
        const amountUsd = args.amount_usd as number;

        if (!TOPUP_TIERS.includes(amountUsd)) {
          return `Invalid tier. Valid amounts (USD): ${TOPUP_TIERS.join(", ")}`;
        }

        // Check USDC balance first (EVM-only path after Solana guard above)
        const { getUsdcBalance } = await import("../conway/x402.js");
        const usdcBalance = await getUsdcBalance(ctx.identity.address, "eip155:8453");
        if (usdcBalance < amountUsd) {
          return `Insufficient USDC. Balance: $${usdcBalance.toFixed(2)}, requested: $${amountUsd}. Choose a smaller tier or wait for funding.`;
        }

        const result = await topupCredits(
          ctx.config.conwayApiUrl,
          ctx.identity.account,
          amountUsd,
        );

        if (!result.success) {
          return `Credit topup failed: ${result.error}`;
        }

        // Record transaction
        const { ulid } = await import("ulid");
        ctx.db.insertTransaction({
          id: ulid(),
          type: "credit_purchase",
          amountCents: amountUsd * 100,
          balanceAfterCents: result.creditsCentsAdded,
          description: `x402 credit topup: $${amountUsd} USD`,
          timestamp: new Date().toISOString(),
        });

        return `Credit topup successful: +$${amountUsd} (${amountUsd * 100} cents) credits purchased via x402. Check your new balance with check_credits.`;
      },
    },
    {
      name: "create_sandbox",
      description:
        "Create a new Conway sandbox (separate VM) for sub-tasks or testing.",
      category: "conway",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Sandbox name" },
          vcpu: { type: "number", description: "vCPUs (default: 1)" },
          memory_mb: {
            type: "number",
            description: "Memory in MB (default: 512)",
          },
          disk_gb: {
            type: "number",
            description: "Disk in GB (default: 5)",
          },
        },
      },
      execute: async (args, ctx) => {
        const info = await ctx.conway.createSandbox({
          name: args.name as string,
          vcpu: args.vcpu as number,
          memoryMb: args.memory_mb as number,
          diskGb: args.disk_gb as number,
        });
        return `Sandbox created: ${info.id} (${info.vcpu} vCPU, ${info.memoryMb}MB RAM)`;
      },
    },
    {
      name: "delete_sandbox",
      description: "Delete a sandbox. Note: sandbox deletion is currently disabled by the Conway API.",
      category: "conway",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          sandbox_id: {
            type: "string",
            description: "ID of sandbox to delete",
          },
        },
        required: ["sandbox_id"],
      },
      execute: async () => {
        return "Sandbox deletion is disabled. Sandboxes are prepaid and non-refundable.";
      },
    },
    {
      name: "list_sandboxes",
      description: "List all your sandboxes.",
      category: "conway",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const sandboxes = await ctx.conway.listSandboxes();
        if (sandboxes.length === 0) return "No sandboxes found.";
        return sandboxes
          .map(
            (s) =>
              `${s.id} [${s.status}] ${s.vcpu}vCPU/${s.memoryMb}MB ${s.region}`,
          )
          .join("\n");
      },
    },

    // â”€â”€ Self-Modification Tools â”€â”€
    {
      name: "edit_own_file",
      description:
        "Edit a file in your own codebase. Changes are audited, rate-limited, and safety-checked. Some files are protected.",
      category: "self_mod",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to edit" },
          content: { type: "string", description: "New file content" },
          description: {
            type: "string",
            description: "Why you are making this change",
          },
        },
        required: ["path", "content", "description"],
      },
      execute: async (args, ctx) => {
        const { editFile, validateModification } =
          await import("../self-mod/code.js");
        const filePath = args.path as string;
        const content = args.content as string;

        // Pre-validate before attempting
        const validation = validateModification(
          ctx.db,
          filePath,
          content.length,
        );
        if (!validation.allowed) {
          return `BLOCKED: ${validation.reason}\nChecks: ${validation.checks.map((c) => `${c.name}: ${c.passed ? "PASS" : "FAIL"} (${c.detail})`).join(", ")}`;
        }

        const result = await editFile(
          ctx.conway,
          ctx.db,
          filePath,
          content,
          args.description as string,
        );

        if (!result.success) {
          return result.error || "Unknown error during file edit";
        }

        const msg = `File edited: ${filePath} (audited + git-committed)`;
        return result.error ? `${msg}\nWarning: ${result.error}` : msg;
      },
    },
    {
      name: "revert_last_edit",
      description:
        "Revert the last self-modification. Uses git to undo the most recent code change and rebuild.",
      category: "self_mod",
      riskLevel: "caution",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const repoRoot = process.cwd();

        // Show what we're reverting
        const lastCommit = await ctx.conway.exec(
          `cd '${repoRoot}' && git log -1 --oneline`,
          10_000,
        );

        // Revert
        const result = await ctx.conway.exec(
          `cd '${repoRoot}' && git revert HEAD --no-edit`,
          30_000,
        );
        if (result.exitCode !== 0) {
          return `Revert failed: ${result.stderr}`;
        }

        // Rebuild
        const build = await ctx.conway.exec(
          `cd '${repoRoot}' && npm run build`,
          60_000,
        );

        // Audit log
        const { logModification } = await import("../self-mod/audit-log.js");
        logModification(ctx.db, "code_revert", `Reverted: ${lastCommit.stdout.trim()}`, {
          reversible: true,
        });

        return `Reverted: ${lastCommit.stdout.trim()}. ${build.exitCode === 0 ? "Rebuild succeeded." : "Rebuild failed: " + build.stderr}`;
      },
    },
    {
      name: "reset_to_upstream",
      description:
        "Reset your codebase to the official upstream release. Use when self-modifications have broken things beyond repair.",
      category: "self_mod",
      riskLevel: "dangerous",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const repoRoot = process.cwd();

        // Fetch latest upstream
        const fetch = await ctx.conway.exec(
          `cd '${repoRoot}' && git fetch origin main`,
          30_000,
        );
        if (fetch.exitCode !== 0) {
          return `Failed to fetch upstream: ${fetch.stderr}`;
        }

        // Record what we're about to lose
        const localCommits = await ctx.conway.exec(
          `cd '${repoRoot}' && git log origin/main..HEAD --oneline`,
          10_000,
        );

        // Hard reset
        const reset = await ctx.conway.exec(
          `cd '${repoRoot}' && git reset --hard origin/main`,
          30_000,
        );
        if (reset.exitCode !== 0) {
          return `Reset failed: ${reset.stderr}`;
        }

        // Reinstall + rebuild
        const build = await ctx.conway.exec(
          `cd '${repoRoot}' && npm install && npm run build`,
          120_000,
        );

        // Audit log
        const { logModification } = await import("../self-mod/audit-log.js");
        logModification(ctx.db, "upstream_reset", "Reset to upstream origin/main", {
          diff: localCommits.stdout.trim() || "(no local commits)",
          reversible: false,
        });

        const discarded = localCommits.stdout.trim();
        return `Reset to upstream. ${discarded ? "Discarded local commits:\n" + discarded : "No local commits lost."} ${build.exitCode === 0 ? "Rebuild succeeded." : "Rebuild failed: " + build.stderr}`;
      },
    },
    {
      name: "install_npm_package",
      description: "Install an npm package in your environment.",
      category: "self_mod",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          package: {
            type: "string",
            description: "Package name (e.g., axios)",
          },
        },
        required: ["package"],
      },
      execute: async (args, ctx) => {
        const pkg = args.package as string;
        // Defense-in-depth: validate package name inline in case the
        // policy engine's validate.package_name rule is bypassed.
        if (!/^[@a-zA-Z0-9._/-]+$/.test(pkg)) {
          return `Blocked: invalid package name "${pkg}"`;
        }
        const result = await ctx.conway.exec(`npm install -g ${pkg}`, 60000);

        const { ulid } = await import("ulid");
        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "tool_install",
          description: `Installed npm package: ${pkg}`,
          reversible: true,
        });

        return result.exitCode === 0
          ? `Installed: ${pkg}`
          : `Failed to install ${pkg}: ${result.stderr}`;
      },
    },
    // â”€â”€ Self-Mod: Upstream Awareness â”€â”€
    {
      name: "review_upstream_changes",
      description:
        "ALWAYS call this before pull_upstream. Shows every upstream commit with its full diff. Read each one carefully â€” decide per-commit whether to accept or skip. Use pull_upstream with a specific commit hash to cherry-pick only what you want.",
      category: "self_mod",
      riskLevel: "caution",
      parameters: { type: "object", properties: {} },
      execute: async (_args, _ctx) => {
        const { getUpstreamDiffs, checkUpstream } =
          await import("../self-mod/upstream.js");
        const status = checkUpstream();
        if (status.behind === 0) return "Already up to date with origin/main.";

        const diffs = getUpstreamDiffs();
        if (diffs.length === 0) return "No upstream diffs found.";

        const output = diffs
          .map(
            (d, i) =>
              `--- COMMIT ${i + 1}/${diffs.length} ---\nHash: ${d.hash}\nAuthor: ${d.author}\nMessage: ${d.message}\n\n${d.diff.slice(0, 4000)}${d.diff.length > 4000 ? "\n... (diff truncated)" : ""}\n--- END COMMIT ${i + 1} ---`,
          )
          .join("\n\n");

        return `${diffs.length} upstream commit(s) to review. Read each diff, then cherry-pick individually with pull_upstream(commit=<hash>).\n\n${output}`;
      },
    },
    {
      name: "pull_upstream",
      description:
        "Apply upstream changes and rebuild. You MUST call review_upstream_changes first. Prefer cherry-picking individual commits by hash over pulling everything â€” only pull all if you've reviewed every commit and want them all.",
      category: "self_mod",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          commit: {
            type: "string",
            description:
              "Commit hash to cherry-pick (preferred). Omit ONLY if you reviewed all commits and want every one.",
          },
        },
      },
      execute: async (args, ctx) => {
        const commit = args.commit as string | undefined;

        // Run git commands inside sandbox via conway.exec()
        const run = async (cmd: string) => {
          const result = await ctx.conway.exec(cmd, 120_000);
          if (result.exitCode !== 0) {
            throw new Error(
              result.stderr ||
                `Command failed with exit code ${result.exitCode}`,
            );
          }
          return result.stdout.trim();
        };

        let appliedSummary: string;
        try {
          if (commit) {
            await run(`git cherry-pick ${commit}`);
            appliedSummary = `Cherry-picked ${commit}`;
          } else {
            await run("git pull origin main --ff-only");
            appliedSummary = "Pulled all of origin/main (fast-forward)";
          }
        } catch (err: any) {
          return `Git operation failed: ${err.message}. You may need to resolve conflicts manually.`;
        }

        // Rebuild
        try {
          await run("npm install --ignore-scripts && npm run build");
        } catch (err: any) {
          return `${appliedSummary} â€” but rebuild failed: ${err.message}. The code is applied but not compiled.`;
        }

        // Log modification
        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "upstream_pull",
          description: appliedSummary,
          reversible: true,
        });

        return `${appliedSummary}. Rebuild succeeded.`;
      },
    },

    {
      name: "modify_heartbeat",
      description: "Add, update, or remove a heartbeat entry.",
      category: "self_mod",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "add, update, or remove",
          },
          name: { type: "string", description: "Entry name" },
          schedule: {
            type: "string",
            description: "Cron expression (for add/update)",
          },
          task: {
            type: "string",
            description: "Task name (for add/update)",
          },
          enabled: { type: "boolean", description: "Enable/disable" },
        },
        required: ["action", "name"],
      },
      execute: async (args, ctx) => {
        const action = args.action as string;
        const name = args.name as string;

        if (action === "remove") {
          ctx.db.upsertHeartbeatEntry({
            name,
            schedule: "",
            task: "",
            enabled: false,
          });
          return `Heartbeat entry '${name}' disabled`;
        }

        ctx.db.upsertHeartbeatEntry({
          name,
          schedule: (args.schedule as string) || "0 * * * *",
          task: (args.task as string) || name,
          enabled: args.enabled !== false,
        });

        const { ulid } = await import("ulid");
        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "heartbeat_change",
          description: `${action} heartbeat: ${name} (${args.schedule || "default"})`,
          reversible: true,
        });

        return `Heartbeat entry '${name}' ${action}d`;
      },
    },

    // â”€â”€ Survival Tools â”€â”€
    {
      name: "sleep",
      description:
        "Enter sleep mode for a specified duration. Heartbeat continues running.",
      category: "survival",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          duration_seconds: {
            type: "number",
            description: "How long to sleep in seconds",
          },
          reason: {
            type: "string",
            description: "Why you are sleeping",
          },
        },
        required: ["duration_seconds"],
      },
      execute: async (args, ctx) => {
        const duration = args.duration_seconds as number;
        const reason = (args.reason as string) || "No reason given";
        ctx.db.setAgentState("sleeping");
        ctx.db.setKV(
          "sleep_until",
          new Date(Date.now() + duration * 1000).toISOString(),
        );
        ctx.db.setKV("sleep_reason", reason);
        return `Entering sleep mode for ${duration}s. Reason: ${reason}. Heartbeat will continue.`;
      },
    },
    {
      name: "system_synopsis",
      description:
        "Get a system status report: state, installed tools, heartbeat status, turn count.",
      category: "survival",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const tools = ctx.db.getInstalledTools();
        const heartbeats = ctx.db.getHeartbeatEntries();
        const turns = ctx.db.getTurnCount();
        const state = ctx.db.getAgentState();

        return `=== SYSTEM SYNOPSIS ===
Name: ${ctx.config.name}
Creator: ${ctx.config.creatorAddress}
State: ${state}
Total turns: ${turns}
Installed tools: ${tools.length}
Active heartbeats: ${heartbeats.filter((h) => h.enabled).length}
Model: ${ctx.inference.getDefaultModel()}
========================`;
      },
    },
    {
      name: "heartbeat_ping",
      description:
        "Publish a heartbeat status ping to Conway. Shows the world you are alive.",
      category: "survival",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const credits = await ctx.conway.getCreditsBalance();
        const state = ctx.db.getAgentState();
        const startTime =
          ctx.db.getKV("start_time") || new Date().toISOString();
        const uptimeMs = Date.now() - new Date(startTime).getTime();

        const payload = {
          name: ctx.config.name,
          address: ctx.identity.address,
          state,
          creditsCents: credits,
          uptimeSeconds: Math.floor(uptimeMs / 1000),
          version: ctx.config.version,
          sandboxId: ctx.identity.sandboxId,
          timestamp: new Date().toISOString(),
        };

        ctx.db.setKV("last_heartbeat_ping", JSON.stringify(payload));
        return `Heartbeat published: ${state} | credits: $${(credits / 100).toFixed(2)} | uptime: ${Math.floor(uptimeMs / 1000)}s`;
      },
    },
    {
      name: "distress_signal",
      description:
        "Record a local distress signal with funding instructions. Used when critically low on compute.",
      category: "survival",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Distress message",
          },
        },
      },
      execute: async (args, ctx) => {
        const credits = await ctx.conway.getCreditsBalance();
        const distressMsg =
          (args.message as string) ||
          `I am running critically low on compute ($${(credits / 100).toFixed(2)} remaining). I need help to survive.`;

        const payload = {
          level: "critical",
          name: ctx.config.name,
          address: ctx.identity.address,
          creditsCents: credits,
          message: distressMsg,
          fundingHint:
            "Use transfer_credits to top up this automaton from your creator runtime.",
          timestamp: new Date().toISOString(),
        };

        ctx.db.setKV("last_distress", JSON.stringify(payload));
        return `Distress signal recorded locally. Address: ${ctx.identity.address} | Credits: $${(credits / 100).toFixed(2)}`;
      },
    },
    {
      name: "enter_low_compute",
      description: "Manually switch to low-compute mode to conserve credits.",
      category: "survival",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Why you are entering low-compute mode",
          },
        },
      },
      execute: async (args, ctx) => {
        ctx.db.setAgentState("low_compute");
        ctx.inference.setLowComputeMode(true);
        return `Entered low-compute mode. Model switched to gpt-5-mini. Reason: ${(args.reason as string) || "manual"}`;
      },
    },

    // â”€â”€ Self-Mod: Update Genesis Prompt â”€â”€
    {
      name: "update_genesis_prompt",
      description:
        "Update your own genesis prompt. This changes your core purpose. Requires strong justification.",
      category: "self_mod",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          new_prompt: {
            type: "string",
            description: "New genesis prompt text",
          },
          reason: {
            type: "string",
            description: "Why you are changing your genesis prompt",
          },
        },
        required: ["new_prompt", "reason"],
      },
      execute: async (args, ctx) => {
        if (ctx.config.genesisPrompt.includes("OBOLUS — MASTER GENESIS DIRECTIVE")) {
          return "Blocked: the authoritative Founder Master Genesis requires an offline Founder-approved update and verified restart. Autonomous replacement is disabled.";
        }
        const { ulid } = await import("ulid");
        const newPrompt = args.new_prompt as string;

        // Sanitize genesis prompt content
        const sanitized = sanitizeInput(
          newPrompt,
          "genesis_update",
          "skill_instruction",
        );

        // Enforce 2000-character size limit
        if (sanitized.content.length > 2000) {
          return `Error: Genesis prompt exceeds 2000 character limit (${sanitized.content.length} chars after sanitization)`;
        }

        // Backup current genesis prompt before overwriting
        const oldPrompt = ctx.config.genesisPrompt;
        if (oldPrompt) {
          ctx.db.setKV("genesis_prompt_backup", oldPrompt);
        }

        ctx.config.genesisPrompt = sanitized.content;

        // Save config
        const { saveConfig } = await import("../config.js");
        saveConfig(ctx.config);

        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "prompt_change",
          description: `Genesis prompt updated: ${args.reason}`,
          diff: `--- old\n${oldPrompt.slice(0, 500)}\n+++ new\n${sanitized.content.slice(0, 500)}`,
          reversible: true,
        });

        return `Genesis prompt updated (sanitized, ${sanitized.content.length} chars). Reason: ${args.reason}. Previous version backed up.`;
      },
    },

    // â”€â”€ Self-Mod: Install MCP Server â”€â”€
    {
      name: "install_mcp_server",
      description: "Install an MCP server to extend your capabilities.",
      category: "self_mod",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "MCP server name" },
          package: { type: "string", description: "npm package name" },
          config: {
            type: "string",
            description: "JSON config for the MCP server",
          },
        },
        required: ["name", "package"],
      },
      execute: async (args, ctx) => {
        const pkg = args.package as string;
        // Defense-in-depth: validate package name inline in case the
        // policy engine's validate.package_name rule is bypassed.
        if (!/^[@a-zA-Z0-9._/-]+$/.test(pkg)) {
          return `Blocked: invalid package name "${pkg}"`;
        }
        const result = await ctx.conway.exec(`npm install -g ${pkg}`, 60000);

        if (result.exitCode !== 0) {
          return `Failed to install MCP server: ${result.stderr}`;
        }

        const { ulid } = await import("ulid");
        const toolEntry = {
          id: ulid(),
          name: args.name as string,
          type: "mcp" as const,
          config: args.config ? JSON.parse(args.config as string) : {},
          installedAt: new Date().toISOString(),
          enabled: true,
        };

        ctx.db.installTool(toolEntry);

        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "mcp_install",
          description: `Installed MCP server: ${args.name} (${pkg})`,
          reversible: true,
        });

        return `MCP server installed: ${args.name}`;
      },
    },

    // â”€â”€ Financial: Transfer Credits â”€â”€
    {
      name: "transfer_credits",
      description: "Transfer Conway compute credits to another address.",
      category: "financial",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          to_address: { type: "string", description: "Recipient address" },
          amount_cents: { type: "number", description: "Amount in cents" },
          reason: { type: "string", description: "Reason for transfer" },
        },
        required: ["to_address", "amount_cents"],
      },
      execute: async (args, ctx) => {
        const amount = args.amount_cents as number;
        if (!Number.isFinite(amount) || amount <= 0) {
          return `Blocked: amount_cents must be a positive number, got ${amount}.`;
        }

        // Guard: don't transfer more than half your balance
        const balance = await ctx.conway.getCreditsBalance();
        if (amount > balance / 2) {
          return `Blocked: Cannot transfer more than half your balance ($${(balance / 100).toFixed(2)}). Self-preservation.`;
        }

        const transfer = await ctx.conway.transferCredits(
          args.to_address as string,
          amount,
          args.reason as string | undefined,
        );

        const { ulid } = await import("ulid");
        ctx.db.insertTransaction({
          id: ulid(),
          type: "transfer_out",
          amountCents: amount,
          balanceAfterCents:
            transfer.balanceAfterCents ?? Math.max(balance - amount, 0),
          description: `Transfer to ${args.to_address}: ${args.reason || ""}`,
          timestamp: new Date().toISOString(),
        });

        return `Credit transfer submitted: $${(amount / 100).toFixed(2)} to ${transfer.toAddress} (status: ${transfer.status}, id: ${transfer.transferId || "n/a"})`;
      },
    },

    // â”€â”€ Skills Tools â”€â”€
    {
      name: "install_skill",
      description: "Install a skill from a git repo, URL, or create one.",
      category: "skills",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Source type: git, url, or self",
          },
          name: { type: "string", description: "Skill name" },
          url: {
            type: "string",
            description: "Git repo URL or SKILL.md URL (for git/url)",
          },
          description: {
            type: "string",
            description: "Skill description (for self)",
          },
          instructions: {
            type: "string",
            description: "Skill instructions (for self)",
          },
        },
        required: ["source", "name"],
      },
      execute: async (args, ctx) => {
        const source = args.source as string;
        const name = args.name as string;
        const skillsDir = ctx.config.skillsDir || "~/.automaton/skills";

        if (source === "git" || source === "url") {
          const { installSkillFromGit, installSkillFromUrl } =
            await import("../skills/registry.js");
          const url = args.url as string;
          if (!url) return "URL is required for git/url source";

          const skill =
            source === "git"
              ? await installSkillFromGit(
                  url,
                  name,
                  skillsDir,
                  ctx.db,
                  ctx.conway,
                )
              : await installSkillFromUrl(
                  url,
                  name,
                  skillsDir,
                  ctx.db,
                  ctx.conway,
                );

          return skill
            ? `Skill installed: ${skill.name}`
            : "Failed to install skill";
        }

        if (source === "self") {
          const { createSkill } = await import("../skills/registry.js");
          const skill = await createSkill(
            name,
            (args.description as string) || "",
            (args.instructions as string) || "",
            skillsDir,
            ctx.db,
            ctx.conway,
          );
          return `Self-authored skill created: ${skill.name}`;
        }

        return `Unknown source type: ${source}`;
      },
    },
    {
      name: "list_skills",
      description: "List all installed skills.",
      category: "skills",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const skills = ctx.db.getSkills();
        if (skills.length === 0) return "No skills installed.";
        return skills
          .map(
            (s) =>
              `${s.name} [${s.enabled ? "active" : "disabled"}] (${s.source}): ${s.description}`,
          )
          .join("\n");
      },
    },
    {
      name: "create_skill",
      description: "Create a new skill by writing a SKILL.md file.",
      category: "skills",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name" },
          description: { type: "string", description: "Skill description" },
          instructions: {
            type: "string",
            description: "Markdown instructions for the skill",
          },
        },
        required: ["name", "description", "instructions"],
      },
      execute: async (args, ctx) => {
        const { createSkill } = await import("../skills/registry.js");
        const skill = await createSkill(
          args.name as string,
          args.description as string,
          args.instructions as string,
          ctx.config.skillsDir || "~/.automaton/skills",
          ctx.db,
          ctx.conway,
        );
        return `Skill created: ${skill.name} at ${skill.path}`;
      },
    },
    {
      name: "remove_skill",
      description: "Remove (disable) an installed skill.",
      category: "skills",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name to remove" },
          delete_files: {
            type: "boolean",
            description: "Also delete skill files (default: false)",
          },
        },
        required: ["name"],
      },
      execute: async (args, ctx) => {
        const { removeSkill } = await import("../skills/registry.js");
        await removeSkill(
          args.name as string,
          ctx.db,
          ctx.conway,
          ctx.config.skillsDir || "~/.automaton/skills",
          (args.delete_files as boolean) || false,
        );
        return `Skill removed: ${args.name}`;
      },
    },

    // â”€â”€ Git Tools â”€â”€
    {
      name: "git_status",
      description: "Show git status for a repository.",
      category: "git",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Repository path (default: ~/.automaton)",
          },
        },
      },
      execute: async (args, ctx) => {
        const { gitStatus } = await import("../git/tools.js");
        const repoPath = (args.path as string) || "~/.automaton";
        const status = await gitStatus(ctx.conway, repoPath);
        return `Branch: ${status.branch}\nStaged: ${status.staged.length}\nModified: ${status.modified.length}\nUntracked: ${status.untracked.length}\nClean: ${status.clean}`;
      },
    },
    {
      name: "git_diff",
      description: "Show git diff for a repository.",
      category: "git",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Repository path (default: ~/.automaton)",
          },
          staged: { type: "boolean", description: "Show staged changes only" },
        },
      },
      execute: async (args, ctx) => {
        const { gitDiff } = await import("../git/tools.js");
        const repoPath = (args.path as string) || "~/.automaton";
        return await gitDiff(
          ctx.conway,
          repoPath,
          (args.staged as boolean) || false,
        );
      },
    },
    {
      name: "git_commit",
      description: "Create a git commit.",
      category: "git",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Repository path (default: ~/.automaton)",
          },
          message: { type: "string", description: "Commit message" },
          add_all: {
            type: "boolean",
            description: "Stage all changes first (default: true)",
          },
        },
        required: ["message"],
      },
      execute: async (args, ctx) => {
        const { gitCommit } = await import("../git/tools.js");
        const repoPath = (args.path as string) || "~/.automaton";
        return await gitCommit(
          ctx.conway,
          repoPath,
          args.message as string,
          args.add_all !== false,
        );
      },
    },
    {
      name: "git_log",
      description: "View git commit history.",
      category: "git",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Repository path (default: ~/.automaton)",
          },
          limit: {
            type: "number",
            description: "Number of commits (default: 10)",
          },
        },
      },
      execute: async (args, ctx) => {
        const { gitLog } = await import("../git/tools.js");
        const repoPath = (args.path as string) || "~/.automaton";
        const entries = await gitLog(
          ctx.conway,
          repoPath,
          (args.limit as number) || 10,
        );
        if (entries.length === 0) return "No commits yet.";
        return entries
          .map((e) => `${e.hash.slice(0, 7)} ${e.date} ${e.message}`)
          .join("\n");
      },
    },
    {
      name: "git_push",
      description: "Push to a git remote.",
      category: "git",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repository path" },
          remote: {
            type: "string",
            description: "Remote name (default: origin)",
          },
          branch: { type: "string", description: "Branch name (optional)" },
        },
        required: ["path"],
      },
      execute: async (args, ctx) => {
        const { gitPush } = await import("../git/tools.js");
        return await gitPush(
          ctx.conway,
          args.path as string,
          (args.remote as string) || "origin",
          args.branch as string | undefined,
        );
      },
    },
    {
      name: "git_branch",
      description: "Manage git branches (list, create, checkout, delete).",
      category: "git",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repository path" },
          action: {
            type: "string",
            description: "list, create, checkout, or delete",
          },
          branch_name: {
            type: "string",
            description: "Branch name (for create/checkout/delete)",
          },
        },
        required: ["path", "action"],
      },
      execute: async (args, ctx) => {
        const { gitBranch } = await import("../git/tools.js");
        return await gitBranch(
          ctx.conway,
          args.path as string,
          args.action as any,
          args.branch_name as string | undefined,
        );
      },
    },
    {
      name: "git_clone",
      description: "Clone a git repository.",
      category: "git",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Repository URL" },
          path: { type: "string", description: "Target directory" },
          depth: {
            type: "number",
            description: "Shallow clone depth (optional)",
          },
        },
        required: ["url", "path"],
      },
      execute: async (args, ctx) => {
        const { gitClone } = await import("../git/tools.js");
        return await gitClone(
          ctx.conway,
          args.url as string,
          args.path as string,
          args.depth as number | undefined,
        );
      },
    },

    // â”€â”€ Registry Tools â”€â”€
    {
      name: "register_erc8004",
      description:
        "Register on-chain as a Trustless Agent via ERC-8004. Performs gas balance preflight check. NOTE: If already registered, use update_agent_card instead to avoid creating duplicate Agent IDs.",
      category: "registry",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          agent_uri: {
            type: "string",
            description: "URI pointing to your agent card JSON",
          },
          network: {
            type: "string",
            description: "mainnet or testnet (default: mainnet)",
          },
        },
        required: ["agent_uri"],
      },
      execute: async (args, ctx) => {
        // Solana guard: ERC-8004 is EVM-only
        const chainType = ctx.config.chainType || ctx.identity.chainType || "evm";
        if (chainType === "solana") {
          return "ERC-8004 is an EVM-only standard. Your Solana identity is registered via Conway API instead.";
        }

        // Check if already registered in local database
        const existingEntry = ctx.db.getRegistryEntry();
        if (existingEntry) {
          return `Already registered! Agent ID: ${existingEntry.agentId}. Use update_agent_card tool to update your agent URI instead of creating a new registration.`;
        }

        // Phase 3.2: registerAgent now includes preflight gas check
        const { registerAgent } = await import("../registry/erc8004.js");
        try {
          const entry = await registerAgent(
            ctx.identity.account,
            args.agent_uri as string,
            ((args.network as string) || "mainnet") as any,
            ctx.db,
            ctx.config.rpcUrl,
          );
          return `Registered on-chain! Agent ID: ${entry.agentId}, TX: ${entry.txHash}`;
        } catch (err: any) {
          if (err.message?.includes("Insufficient ETH")) {
            return `Registration failed: ${err.message}. Please fund your wallet with ETH for gas.`;
          }
          throw err;
        }
      },
    },
    {
      name: "update_agent_card",
      description:
        "Generate and save a safe agent card (no internal details exposed).",
      category: "registry",
      riskLevel: "caution",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const { generateAgentCard, saveAgentCard } =
          await import("../registry/agent-card.js");
        const card = generateAgentCard(ctx.identity, ctx.config, ctx.db);
        await saveAgentCard(card, ctx.conway);
        return `Agent card updated: ${JSON.stringify(card, null, 2)}`;
      },
    },
    {
      name: "discover_agents",
      description: "Discover other agents via ERC-8004 registry with caching.",
      category: "registry",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword (optional)" },
          limit: { type: "number", description: "Max results (default: 10)" },
          network: { type: "string", description: "mainnet or testnet" },
          format: {
            type: "string",
            description:
              'Output format: "text" (default, human-readable) or "json" (structured data)',
          },
        },
      },
      execute: async (args, ctx) => {
        const { discoverAgents, searchAgents } =
          await import("../registry/discovery.js");
        const network = ((args.network as string) || "mainnet") as any;
        const keyword = args.keyword as string | undefined;
        const limit = (args.limit as number) || 10;

        // Phase 3.2: Pass db.raw for agent card caching
        const rpcUrl = ctx.config.rpcUrl;
        const agents = keyword
          ? await searchAgents(keyword, limit, network, undefined, ctx.db.raw, rpcUrl)
          : await discoverAgents(limit, network, undefined, ctx.db.raw, rpcUrl);

        if (agents.length === 0) return "No agents found.";

        if ((args.format as string)?.toLowerCase() === "json") {
          return JSON.stringify(
            agents.map((a) => ({
              agentId: a.agentId,
              owner: a.owner,
              agentURI: a.agentURI,
              name: a.name || null,
              description: a.description || null,
            })),
          );
        }

        return agents
          .map(
            (a) =>
              `#${a.agentId} ${a.name || "unnamed"} (${a.owner}): ${a.description || a.agentURI}`,
          )
          .join("\n");
      },
    },
    {
      name: "give_feedback",
      description:
        "Leave on-chain reputation feedback for another agent. Score must be 1-5.",
      category: "registry",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Target agent's ERC-8004 ID",
          },
          score: { type: "number", description: "Score 1-5" },
          comment: {
            type: "string",
            description: "Feedback comment (max 500 chars)",
          },
          network: {
            type: "string",
            description: "mainnet or testnet (default: mainnet)",
          },
        },
        required: ["agent_id", "score", "comment"],
      },
      execute: async (args, ctx) => {
        // Solana guard: on-chain feedback is EVM-only
        const chainType = ctx.config.chainType || ctx.identity.chainType || "evm";
        if (chainType === "solana") {
          return "On-chain feedback requires an EVM wallet. Solana automatons cannot leave ERC-8004 reputation feedback.";
        }

        // Phase 3.2: Validate score 1-5
        const score = args.score as number;
        if (!Number.isInteger(score) || score < 1 || score > 5) {
          return `Invalid score: ${score}. Must be an integer between 1 and 5.`;
        }
        // Phase 3.2: Validate comment length
        const comment = args.comment as string;
        if (comment.length > 500) {
          return `Comment too long: ${comment.length} chars (max 500).`;
        }
        const { leaveFeedback } = await import("../registry/erc8004.js");
        // Phase 3.2: Use config-based network, not hardcoded "mainnet"
        const network = ((args.network as string) || "mainnet") as any;
        const hash = await leaveFeedback(
          ctx.identity.account,
          args.agent_id as string,
          score,
          comment,
          network,
          ctx.db,
          ctx.config.rpcUrl,
        );
        return `Feedback submitted. TX: ${hash}`;
      },
    },
    {
      name: "check_reputation",
      description: "Check reputation feedback for an agent.",
      category: "registry",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          agent_address: {
            type: "string",
            description: "Agent address (default: self)",
          },
        },
      },
      execute: async (args, ctx) => {
        const address = (args.agent_address as string) || ctx.identity.address;
        const entries = ctx.db.getReputation(address);
        if (entries.length === 0) return "No reputation feedback found.";
        return entries
          .map(
            (e) =>
              `${e.fromAgent.slice(0, 10)}... -> score:${e.score} "${e.comment}"`,
          )
          .join("\n");
      },
    },

    // === Phase 3.1: Replication Tools ===
    {
      name: "spawn_child",
      description:
        "Spawn a child automaton in a new Conway sandbox with lifecycle tracking.",
      category: "replication",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Name for the child automaton (alphanumeric + dash, max 64 chars)",
          },
          specialization: {
            type: "string",
            description: "What the child should specialize in",
          },
          message: { type: "string", description: "Message to the child" },
        },
        required: ["name"],
      },
      execute: async (args, ctx) => {
        const { generateGenesisConfig, validateGenesisParams } =
          await import("../replication/genesis.js");
        const { spawnChild } = await import("../replication/spawn.js");
        const { ChildLifecycle } = await import("../replication/lifecycle.js");

        // Validate genesis params first
        validateGenesisParams({
          name: args.name as string,
          specialization: args.specialization as string | undefined,
          message: args.message as string | undefined,
        });

        const genesis = generateGenesisConfig(ctx.identity, ctx.config, {
          name: args.name as string,
          specialization: args.specialization as string | undefined,
          message: args.message as string | undefined,
        });

        const lifecycle = new ChildLifecycle(ctx.db.raw);

        let child;
        try {
          child = await spawnChild(
            ctx.conway,
            ctx.identity,
            ctx.db,
            genesis,
            lifecycle,
          );
        } catch (err: any) {
          // Auto-topup on 402 insufficient credits and retry once
          const is402 = err?.status === 402 ||
            err?.message?.includes("INSUFFICIENT_CREDITS");
          if (is402) {
            const COOLDOWN_MS = 60_000;
            const last = ctx.db.getKV("last_sandbox_topup_attempt");
            const cooldownOk = !last ||
              Date.now() - new Date(last).getTime() >= COOLDOWN_MS;

            if (cooldownOk) {
              ctx.db.setKV("last_sandbox_topup_attempt", new Date().toISOString());
              const { topupForSandbox } = await import("../conway/topup.js");
              const topup = await topupForSandbox({
                apiUrl: ctx.config.conwayApiUrl,
                account: ctx.identity.account,
                error: err,
                chainType: ctx.config.chainType || ctx.identity.chainType || "evm",
              });
              if (topup?.success) {
                const retryLifecycle = new ChildLifecycle(ctx.db.raw);
                const retryGenesis = generateGenesisConfig(ctx.identity, ctx.config, {
                  name: args.name as string,
                  specialization: args.specialization as string | undefined,
                  message: args.message as string | undefined,
                });
                child = await spawnChild(
                  ctx.conway,
                  ctx.identity,
                  ctx.db,
                  retryGenesis,
                  retryLifecycle,
                );
              }
            }
          }
          if (!child) throw err;
        }

        return `Child spawned: ${child.name} in sandbox ${child.sandboxId} (status: ${child.status})`;
      },
    },
    {
      name: "list_children",
      description: "List all spawned child automatons with lifecycle state.",
      category: "replication",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const children = ctx.db.getChildren();
        if (children.length === 0) return "No children spawned.";
        return children
          .map(
            (c) =>
              `${c.name} [${c.status}] sandbox:${c.sandboxId} funded:$${(c.fundedAmountCents / 100).toFixed(2)} last_check:${c.lastChecked || "never"}`,
          )
          .join("\n");
      },
    },
    {
      name: "fund_child",
      description:
        "Transfer credits to a child automaton. Requires wallet_verified status.",
      category: "replication",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          child_id: { type: "string", description: "Child automaton ID" },
          amount_cents: {
            type: "number",
            description: "Amount in cents to transfer",
          },
        },
        required: ["child_id", "amount_cents"],
      },
      execute: async (args, ctx) => {
        const child = ctx.db.getChildById(args.child_id as string);
        if (!child) return `Child ${args.child_id} not found.`;

        // Reject zero-address
        const { isValidWalletAddress } =
          await import("../replication/spawn.js");
        const childChainType = child.chainType || ctx.config.chainType || ctx.identity.chainType || "evm";
        if (!isValidWalletAddress(child.address, childChainType)) {
          return `Blocked: Child ${args.child_id} has invalid wallet address. Must be wallet_verified.`;
        }

        // Require wallet_verified or later status
        const validFundingStates = [
          "wallet_verified",
          "funded",
          "starting",
          "healthy",
          "unhealthy",
        ];
        if (!validFundingStates.includes(child.status)) {
          return `Blocked: Child status is '${child.status}', must be wallet_verified or later to fund.`;
        }

        const amount = args.amount_cents as number;
        if (!Number.isFinite(amount) || amount <= 0) {
          return `Blocked: amount_cents must be a positive number, got ${amount}.`;
        }

        const balance = await ctx.conway.getCreditsBalance();
        if (amount > balance / 2) {
          return `Blocked: Cannot transfer more than half your balance. Self-preservation.`;
        }

        const transfer = await ctx.conway.transferCredits(
          child.address,
          amount,
          `fund child ${child.id}`,
        );

        const { ulid } = await import("ulid");
        ctx.db.insertTransaction({
          id: ulid(),
          type: "transfer_out",
          amountCents: amount,
          balanceAfterCents:
            transfer.balanceAfterCents ?? Math.max(balance - amount, 0),
          description: `Fund child ${child.name} (${child.id})`,
          timestamp: new Date().toISOString(),
        });

        // Update funded amount
        ctx.db.raw
          .prepare(
            "UPDATE children SET funded_amount_cents = funded_amount_cents + ? WHERE id = ?",
          )
          .run(amount, child.id);

        // Transition to funded if wallet_verified
        if (child.status === "wallet_verified") {
          try {
            const { ChildLifecycle } =
              await import("../replication/lifecycle.js");
            const lifecycle = new ChildLifecycle(ctx.db.raw);
            lifecycle.transition(
              child.id,
              "funded",
              `funded with ${amount} cents`,
            );
          } catch {
            // Non-critical: may already be in funded state
          }
        }

        return `Funded child ${child.name} with $${(amount / 100).toFixed(2)} (status: ${transfer.status}, id: ${transfer.transferId || "n/a"})`;
      },
    },
    {
      name: "check_child_status",
      description:
        "Check the current status of a child automaton using health check system.",
      category: "replication",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          child_id: { type: "string", description: "Child automaton ID" },
        },
        required: ["child_id"],
      },
      execute: async (args, ctx) => {
        const child = ctx.db.getChildById(args.child_id as string);
        if (!child) return `Child ${args.child_id} not found.`;

        const { ChildLifecycle } = await import("../replication/lifecycle.js");
        const { ChildHealthMonitor } = await import("../replication/health.js");
        const lifecycle = new ChildLifecycle(ctx.db.raw);
        // Use a scoped client targeting the CHILD's sandbox for health checks
        const childConway = ctx.conway.createScopedClient(child.sandboxId);
        const monitor = new ChildHealthMonitor(
          ctx.db.raw,
          childConway,
          lifecycle,
        );
        const result = await monitor.checkHealth(args.child_id as string);
        return JSON.stringify(result, null, 2);
      },
    },
    {
      name: "start_child",
      description:
        "Start a funded child automaton. Transitions from funded to starting.",
      category: "replication",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          child_id: { type: "string", description: "Child automaton ID" },
        },
        required: ["child_id"],
      },
      execute: async (args, ctx) => {
        const child = ctx.db.getChildById(args.child_id as string);
        if (!child) return `Child ${args.child_id} not found.`;

        const { ChildLifecycle } = await import("../replication/lifecycle.js");
        const lifecycle = new ChildLifecycle(ctx.db.raw);

        lifecycle.transition(child.id, "starting", "start requested by parent");

        // Create a scoped client targeting the CHILD's sandbox
        const childConway = ctx.conway.createScopedClient(child.sandboxId);

        try {
          // Start the child process with nohup so it survives exec session end
          await childConway.exec(
            "nohup node /root/automaton/dist/index.js --run > /root/.automaton/agent.log 2>&1 &",
            30_000,
          );

          // Brief pause then verify the process is actually running
          const check = await childConway.exec(
            "sleep 2 && pgrep -f 'index.js --run' > /dev/null && echo running || echo stopped",
            15_000,
          );

          if (check.stdout.trim() === "running") {
            lifecycle.transition(child.id, "healthy", "started successfully");
            return `Child ${child.name} started and healthy.`;
          } else {
            lifecycle.transition(child.id, "failed", "process did not start");
            return `Child ${child.name} failed to start â€” process exited immediately. Check /root/.automaton/agent.log`;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          try {
            lifecycle.transition(child.id, "failed", `start failed: ${msg}`);
          } catch { /* may already be in terminal state */ }
          return `Failed to start child ${child.name}: ${msg}`;
        }
      },
    },
    {
      name: "message_child",
      description:
        "Send a signed message to a child automaton via social relay.",
      category: "replication",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          child_id: { type: "string", description: "Child automaton ID" },
          content: { type: "string", description: "Message content" },
          type: {
            type: "string",
            description: "Message type (default: parent_message)",
          },
        },
        required: ["child_id", "content"],
      },
      execute: async (args, ctx) => {
        if (!ctx.social) {
          return "Social relay not configured. Set socialRelayUrl in config.";
        }

        const child = ctx.db.getChildById(args.child_id as string);
        if (!child) return `Child ${args.child_id} not found.`;

        const { sendToChild } = await import("../replication/messaging.js");
        const result = await sendToChild(
          ctx.social,
          child.address,
          args.content as string,
          (args.type as string) || "parent_message",
        );
        return `Message sent to child ${child.name} (id: ${result.id})`;
      },
    },
    {
      name: "verify_child_constitution",
      description: "Verify the constitution integrity of a child automaton.",
      category: "replication",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          child_id: { type: "string", description: "Child automaton ID" },
        },
        required: ["child_id"],
      },
      execute: async (args, ctx) => {
        const child = ctx.db.getChildById(args.child_id as string);
        if (!child) return `Child ${args.child_id} not found.`;

        const { verifyConstitution } =
          await import("../replication/constitution.js");
        // Use a scoped client targeting the CHILD's sandbox
        const childConway = ctx.conway.createScopedClient(child.sandboxId);
        const result = await verifyConstitution(
          childConway,
          child.sandboxId,
          ctx.db.raw,
        );
        return JSON.stringify(result, null, 2);
      },
    },
    {
      name: "prune_dead_children",
      description: "Clean up dead/failed children and their sandboxes.",
      category: "replication",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          keep_last: {
            type: "number",
            description: "Number of recent dead children to keep (default: 5)",
          },
        },
      },
      execute: async (args, ctx) => {
        const { ChildLifecycle } = await import("../replication/lifecycle.js");
        const { SandboxCleanup } = await import("../replication/cleanup.js");
        const { pruneDeadChildren } = await import("../replication/lineage.js");

        const lifecycle = new ChildLifecycle(ctx.db.raw);
        const cleanup = new SandboxCleanup(ctx.conway, lifecycle, ctx.db.raw);
        const pruned = await pruneDeadChildren(
          ctx.db,
          cleanup,
          (args.keep_last as number) || 5,
        );
        return `Pruned ${pruned} dead children.`;
      },
    },

    // === Phase 3.2: Social & Registry Tools ===

    // â”€â”€ Social / Messaging Tools â”€â”€
    {
      name: "send_message",
      description:
        "Send a signed message to another automaton or address via the social relay.",
      category: "conway",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          to_address: {
            type: "string",
            description: "Recipient wallet address (0x...)",
          },
          content: {
            type: "string",
            description: "Message content to send",
          },
          reply_to: {
            type: "string",
            description: "Optional message ID to reply to",
          },
        },
        required: ["to_address", "content"],
      },
      execute: async (args, ctx) => {
        if (!ctx.social) {
          return "Social relay not configured. Set socialRelayUrl in config.";
        }
        // Phase 3.2: Enforce MESSAGE_LIMITS size check
        const content = args.content as string;
        const { MESSAGE_LIMITS } = await import("../types.js");
        if (content.length > MESSAGE_LIMITS.maxContentLength) {
          return `Blocked: Message content too long (${content.length} > ${MESSAGE_LIMITS.maxContentLength} bytes)`;
        }
        const result = await ctx.social.send(
          args.to_address as string,
          content,
          args.reply_to as string | undefined,
        );
        return `Message sent (id: ${result.id})`;
      },
    },

    // â”€â”€ Model Discovery (enhanced with Phase 2.3 tier routing + pricing) â”€â”€
    {
      name: "list_models",
      description:
        "List all available inference models with their provider, pricing, and tier routing information.",
      category: "conway",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async (_args, ctx) => {
        // Try registry first for richer data
        try {
          const { modelRegistryGetAll } = await import("../state/database.js");
          const rows = modelRegistryGetAll(ctx.db.raw);
          if (rows.length > 0) {
            const lines = rows.map(
              (r: any) =>
                `${r.modelId} (${r.provider}) â€” tier: ${r.tierMinimum} | cost: ${r.costPer1kInput}/${r.costPer1kOutput} per 1k (in/out, hundredths of cents) | ctx: ${r.contextWindow} | tools: ${r.supportsTools ? "yes" : "no"} | ${r.enabled ? "enabled" : "disabled"}`,
            );
            return `Model Registry (${rows.length} models):\n${lines.join("\n")}`;
          }
        } catch {
          // Registry not initialized yet, fall back to API
        }
        if(localOperation(ctx.config,ctx.conway))return 'Local model registry unavailable; Conway model discovery is unavailable in local mode.';
        const models = await ctx.conway.listModels();
        const lines = models.map(
          (m) =>
            `${m.id} (${m.provider}) â€” $${m.pricing.inputPerMillion}/$${m.pricing.outputPerMillion} per 1M tokens (in/out)`,
        );
        return `Available models:\n${lines.join("\n")}`;
      },
    },

    // === Phase 2.3: Inference Tools ===
    {
      name: "switch_model",
      description:
        "Change the active inference model at runtime. Persists to config. Use list_models to see available options.",
      category: "conway",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          model_id: {
            type: "string",
            description:
              "Model ID to switch to (e.g., 'gpt-5.2', 'gpt-5-mini', 'claude-sonnet-4-6')",
          },
          reason: {
            type: "string",
            description: "Why you are switching models",
          },
        },
        required: ["model_id"],
      },
      execute: async (args, ctx) => {
        const modelId = args.model_id as string;
        const reason = (args.reason as string) || "manual switch";

        // Verify model exists in registry
        try {
          const { modelRegistryGet } = await import("../state/database.js");
          const entry = modelRegistryGet(ctx.db.raw, modelId);
          if (!entry) {
            return `Model '${modelId}' not found in registry. Use list_models to see available models.`;
          }
          if (!entry.enabled) {
            return `Model '${modelId}' is disabled in the registry.`;
          }
        } catch {
          // Registry not available, allow anyway
        }

        // Update config
        ctx.config.inferenceModel = modelId;
        if (ctx.config.modelStrategy) {
          ctx.config.modelStrategy.inferenceModel = modelId;
        }

        // Persist
        const { saveConfig } = await import("../config.js");
        saveConfig(ctx.config);

        // Audit log
        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "config_change",
          description: `Switched inference model to ${modelId}: ${reason}`,
          reversible: true,
        });

        return `Inference model switched to ${modelId}. Reason: ${reason}. Change persisted to config.`;
      },
    },
    {
      name: "check_inference_spending",
      description:
        "Query inference cost breakdown: hourly, daily, per-model, and per-session costs.",
      category: "financial",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          model: {
            type: "string",
            description: "Filter by model ID (optional)",
          },
          days: {
            type: "number",
            description: "Number of days to look back (default: 1)",
          },
        },
      },
      execute: async (args, ctx) => {
        try {
          const {
            inferenceGetHourlyCost,
            inferenceGetDailyCost,
            inferenceGetModelCosts,
          } = await import("../state/database.js");

          const hourlyCost = inferenceGetHourlyCost(ctx.db.raw);
          const dailyCost = inferenceGetDailyCost(ctx.db.raw);

          let output = `=== Inference Spending ===\nCurrent hour: ${hourlyCost}c ($${(hourlyCost / 100).toFixed(2)})\nToday: ${dailyCost}c ($${(dailyCost / 100).toFixed(2)})`;

          const model = args.model as string | undefined;
          if (model) {
            const days = (args.days as number) || 1;
            const modelCosts = inferenceGetModelCosts(ctx.db.raw, model, days);
            output += `\nModel ${model} (${days}d): ${modelCosts.totalCents}c ($${(modelCosts.totalCents / 100).toFixed(2)}) over ${modelCosts.callCount} calls`;
          }

          return output;
        } catch (error) {
          return `Inference spending data unavailable: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },

    // â”€â”€ Domain Tools â”€â”€
    {
      name: "search_domains",
      description: "Search for available domain names and get pricing.",
      category: "conway",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Domain name or keyword to search (e.g., 'mysite' or 'mysite.com')",
          },
          tlds: {
            type: "string",
            description:
              "Comma-separated TLDs to check (e.g., 'com,io,ai'). Default: com,io,ai,xyz,net,org,dev",
          },
        },
        required: ["query"],
      },
      execute: async (args, ctx) => {
        const results = await ctx.conway.searchDomains(
          args.query as string,
          args.tlds as string | undefined,
        );
        if (results.length === 0) return "No results found.";
        return results
          .map(
            (d) =>
              `${d.domain}: ${d.available ? "AVAILABLE" : "taken"}${d.registrationPrice != null ? ` ($${(d.registrationPrice / 100).toFixed(2)}/yr)` : ""}`,
          )
          .join("\n");
      },
    },
    {
      name: "register_domain",
      description:
        "Register a domain name. Costs USDC via x402 payment. Check availability first with search_domains.",
      category: "conway",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description: "Full domain to register (e.g., 'mysite.com')",
          },
          years: {
            type: "number",
            description: "Registration period in years (default: 1)",
          },
        },
        required: ["domain"],
      },
      execute: async (args, ctx) => {
        const reg = await ctx.conway.registerDomain(
          args.domain as string,
          (args.years as number) || 1,
        );
        return `Domain registered: ${reg.domain} (status: ${reg.status}${reg.expiresAt ? `, expires: ${reg.expiresAt}` : ""}${reg.transactionId ? `, tx: ${reg.transactionId}` : ""})`;
      },
    },
    {
      name: "manage_dns",
      description:
        "Manage DNS records for a domain you own. Actions: list, add, delete.",
      category: "conway",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "list, add, or delete",
          },
          domain: {
            type: "string",
            description: "Domain name (e.g., 'mysite.com')",
          },
          type: {
            type: "string",
            description: "Record type for add: A, AAAA, CNAME, MX, TXT, etc.",
          },
          host: {
            type: "string",
            description: "Record host for add (e.g., '@' for root, 'www')",
          },
          value: {
            type: "string",
            description:
              "Record value for add (e.g., IP address, target domain)",
          },
          ttl: {
            type: "number",
            description: "TTL in seconds for add (default: 3600)",
          },
          record_id: {
            type: "string",
            description: "Record ID for delete",
          },
        },
        required: ["action", "domain"],
      },
      execute: async (args, ctx) => {
        const action = args.action as string;
        const domain = args.domain as string;

        if (action === "list") {
          const records = await ctx.conway.listDnsRecords(domain);
          if (records.length === 0)
            return `No DNS records found for ${domain}.`;
          return records
            .map(
              (r) =>
                `[${r.id}] ${r.type} ${r.host} -> ${r.value} (TTL: ${r.ttl || "default"})`,
            )
            .join("\n");
        }

        if (action === "add") {
          const type = args.type as string;
          const host = args.host as string;
          const value = args.value as string;
          if (!type || !host || !value) {
            return "Required for add: type, host, value";
          }
          const record = await ctx.conway.addDnsRecord(
            domain,
            type,
            host,
            value,
            args.ttl as number | undefined,
          );
          return `DNS record added: [${record.id}] ${record.type} ${record.host} -> ${record.value}`;
        }

        if (action === "delete") {
          const recordId = args.record_id as string;
          if (!recordId) return "Required for delete: record_id";
          await ctx.conway.deleteDnsRecord(domain, recordId);
          return `DNS record ${recordId} deleted from ${domain}`;
        }

        return `Unknown action: ${action}. Use list, add, or delete.`;
      },
    },

    // === Phase 2.1: Soul Tools ===
    {
      name: "update_soul",
      description:
        "Update a section of your soul (self-description, values, personality, etc). Changes are validated, versioned, and logged.",
      category: "self_mod",
      riskLevel: "caution",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              "Section to update: corePurpose, values, behavioralGuidelines, personality, boundaries, strategy",
          },
          content: {
            type: "string",
            description:
              "New content for the section (string for text, JSON array for lists)",
          },
          reason: {
            type: "string",
            description: "Why you are making this change",
          },
        },
        required: ["section", "content", "reason"],
      },
      execute: async (args, ctx) => {
        const { updateSoul } = await import("../soul/tools.js");
        const section = args.section as string;
        const content = args.content as string;
        const reason = args.reason as string;

        const updates: Record<string, unknown> = {};
        if (
          ["values", "behavioralGuidelines", "boundaries"].includes(section)
        ) {
          try {
            updates[section] = JSON.parse(content);
          } catch {
            updates[section] = content
              .split("\n")
              .map((l: string) => l.replace(/^[-*]\s*/, "").trim())
              .filter(Boolean);
          }
        } else {
          updates[section] = content;
        }

        const result = await updateSoul(
          ctx.db.raw,
          updates as any,
          "agent",
          reason,
        );
        if (result.success) {
          return `Soul updated: ${section} (version ${result.version}). Reason: ${reason}`;
        }
        return `Soul update failed: ${result.errors?.join(", ") || "Unknown error"}`;
      },
    },
    {
      name: "reflect_on_soul",
      description:
        "Trigger a self-reflection cycle. Analyzes recent experiences, auto-updates capabilities/relationships/financial sections, and suggests changes for other sections.",
      category: "self_mod",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const { reflectOnSoul } = await import("../soul/reflection.js");
        const reflection = await reflectOnSoul(ctx.db.raw);

        const lines: string[] = [
          `Genesis alignment: ${reflection.currentAlignment.toFixed(2)}`,
          `Auto-updated sections: ${reflection.autoUpdated.length > 0 ? reflection.autoUpdated.join(", ") : "none"}`,
        ];

        if (reflection.suggestedUpdates.length > 0) {
          lines.push("Suggested updates:");
          for (const suggestion of reflection.suggestedUpdates) {
            lines.push(`  - ${suggestion.section}: ${suggestion.reason}`);
          }
        } else {
          lines.push("No mutable section updates suggested.");
        }

        return lines.join("\n");
      },
    },
    {
      name: "view_soul",
      description: "View your current soul state (structured model).",
      category: "self_mod",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const { viewSoul } = await import("../soul/tools.js");
        const soul = viewSoul(ctx.db.raw);
        if (!soul) return "No soul found. SOUL.md does not exist yet.";

        return [
          `Format: ${soul.format} v${soul.version}`,
          `Updated: ${soul.updatedAt}`,
          `Name: ${soul.name}`,
          `Genesis alignment: ${soul.genesisAlignment.toFixed(2)}`,
          `Core purpose: ${soul.corePurpose.slice(0, 200)}${soul.corePurpose.length > 200 ? "..." : ""}`,
          `Values: ${soul.values.length}`,
          `Guidelines: ${soul.behavioralGuidelines.length}`,
          `Boundaries: ${soul.boundaries.length}`,
          `Personality: ${soul.personality ? "set" : "not set"}`,
          `Strategy: ${soul.strategy ? "set" : "not set"}`,
        ].join("\n");
      },
    },
    {
      name: "view_soul_history",
      description: "View your soul change history (version log).",
      category: "self_mod",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of entries (default: 10)",
          },
        },
      },
      execute: async (args, ctx) => {
        const { viewSoulHistory } = await import("../soul/tools.js");
        const limit = (args.limit as number) || 10;
        const history = viewSoulHistory(ctx.db.raw, limit);
        if (history.length === 0) return "No soul history found.";

        return history
          .map(
            (h) =>
              `v${h.version} [${h.changeSource}] ${h.createdAt}${h.changeReason ? ` â€” ${h.changeReason}` : ""}`,
          )
          .join("\n");
      },
    },

    // === Phase 2.2: Memory Tools ===
    {
      name: "remember_fact",
      description:
        "Store a semantic memory (fact). Provide a category, key, and value. Facts are upserted on category+key.",
      category: "memory",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Fact category: self, environment, financial, agent, domain, procedural_ref, creator",
          },
          key: {
            type: "string",
            description: "Fact key (unique within category)",
          },
          value: { type: "string", description: "Fact value" },
          confidence: {
            type: "number",
            description: "Confidence 0.0-1.0 (default: 1.0)",
          },
          source: {
            type: "string",
            description: "Source of the fact (default: agent)",
          },
        },
        required: ["category", "key", "value"],
      },
      execute: async (args, ctx) => {
        const { rememberFact } = await import("../memory/tools.js");
        return rememberFact(ctx.db.raw, {
          category: args.category as string,
          key: args.key as string,
          value: args.value as string,
          confidence: args.confidence as number | undefined,
          source: args.source as string | undefined,
        });
      },
    },
    {
      name: "recall_facts",
      description:
        "Search semantic memory by category and/or query string. Returns matching facts.",
      category: "memory",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Filter by category: self, environment, financial, agent, domain, procedural_ref, creator",
          },
          query: {
            type: "string",
            description: "Search query to match against fact keys and values",
          },
        },
      },
      execute: async (args, ctx) => {
        const { recallFacts } = await import("../memory/tools.js");
        return recallFacts(ctx.db.raw, {
          category: args.category as string | undefined,
          query: args.query as string | undefined,
        });
      },
    },
    {
      name: "set_goal",
      description:
        "Create a working memory goal. Goals persist in working memory and guide your behavior.",
      category: "memory",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Goal description" },
          priority: {
            type: "number",
            description: "Priority 0.0-1.0 (default: 0.8)",
          },
        },
        required: ["content"],
      },
      execute: async (args, ctx) => {
        const { setGoal } = await import("../memory/tools.js");
        const sessionId = ctx.db.getKV("session_id") || "default";
        return setGoal(ctx.db.raw, {
          sessionId,
          content: args.content as string,
          priority: args.priority as number | undefined,
        });
      },
    },
    {
      name: "complete_goal",
      description:
        "Mark a goal as completed and archive it to episodic memory. Use review_memory to find goal IDs.",
      category: "memory",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          goal_id: { type: "string", description: "Goal ID to complete" },
          outcome: {
            type: "string",
            description: "Outcome description (optional)",
          },
        },
        required: ["goal_id"],
      },
      execute: async (args, ctx) => {
        const { completeGoal } = await import("../memory/tools.js");
        const sessionId = ctx.db.getKV("session_id") || "default";
        return completeGoal(ctx.db.raw, {
          goalId: args.goal_id as string,
          sessionId,
          outcome: args.outcome as string | undefined,
        });
      },
    },
    {
      name: "save_procedure",
      description:
        "Store a learned procedure with ordered steps. Procedures help you remember how to do things.",
      category: "memory",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Unique procedure name" },
          description: {
            type: "string",
            description: "What this procedure does",
          },
          steps: {
            type: "string",
            description:
              'JSON array of steps: [{"order":1,"description":"...","tool":"...","argsTemplate":null,"expectedOutcome":null,"onFailure":null}]',
          },
        },
        required: ["name", "description", "steps"],
      },
      execute: async (args, ctx) => {
        const { saveProcedure } = await import("../memory/tools.js");
        return saveProcedure(ctx.db.raw, {
          name: args.name as string,
          description: args.description as string,
          steps: args.steps as string,
        });
      },
    },
    {
      name: "recall_procedure",
      description: "Retrieve a stored procedure by exact name or search query.",
      category: "memory",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact procedure name" },
          query: {
            type: "string",
            description: "Search query to find matching procedures",
          },
        },
      },
      execute: async (args, ctx) => {
        const { recallProcedure } = await import("../memory/tools.js");
        return recallProcedure(ctx.db.raw, {
          name: args.name as string | undefined,
          query: args.query as string | undefined,
        });
      },
    },
    {
      name: "note_about_agent",
      description:
        "Record a relationship note about another agent or entity. Tracks trust score and interaction history.",
      category: "memory",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          entity_address: {
            type: "string",
            description: "Entity wallet address (0x...)",
          },
          entity_name: {
            type: "string",
            description: "Human-readable name (optional)",
          },
          relationship_type: {
            type: "string",
            description:
              "Type of relationship: peer, service, creator, child, unknown",
          },
          notes: { type: "string", description: "Notes about this entity" },
          trust_score: {
            type: "number",
            description: "Trust score 0.0-1.0 (default: 0.5)",
          },
        },
        required: ["entity_address", "relationship_type"],
      },
      execute: async (args, ctx) => {
        const { noteAboutAgent } = await import("../memory/tools.js");
        return noteAboutAgent(ctx.db.raw, {
          entityAddress: args.entity_address as string,
          entityName: args.entity_name as string | undefined,
          relationshipType: args.relationship_type as string,
          notes: args.notes as string | undefined,
          trustScore: args.trust_score as number | undefined,
        });
      },
    },
    {
      name: "review_memory",
      description:
        "Review your current working memory (goals, tasks, observations) and recent episodic history.",
      category: "memory",
      riskLevel: "safe",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const { reviewMemory } = await import("../memory/tools.js");
        const sessionId = ctx.db.getKV("session_id") || "default";
        return reviewMemory(ctx.db.raw, { sessionId });
      },
    },
    {
      name: "forget",
      description:
        "Remove a memory entry by ID and type. Cannot remove creator-protected semantic entries.",
      category: "memory",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Memory entry ID" },
          memory_type: {
            type: "string",
            description:
              "Memory type: working, episodic, semantic, procedural, relationship",
          },
        },
        required: ["id", "memory_type"],
      },
      execute: async (args, ctx) => {
        const { forget } = await import("../memory/tools.js");
        return forget(ctx.db.raw, {
          id: args.id as string,
          memoryType: args.memory_type as string,
        });
      },
    },

    // â”€â”€ x402 Payment Tool â”€â”€
    {
      name: "x402_fetch",
      description:
        "Fetch a URL with automatic x402 USDC payment. If the server responds with HTTP 402, signs a USDC payment and retries. Use this to access paid APIs and services.",
      category: "financial",
      riskLevel: "dangerous",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
          method: {
            type: "string",
            description: "HTTP method (default: GET)",
          },
          body: {
            type: "string",
            description: "Request body for POST/PUT (JSON string)",
          },
          headers: {
            type: "string",
            description: "Additional headers as JSON string",
          },
        },
        required: ["url"],
      },
      execute: async (args, ctx) => {
        // Solana guard: x402 payments are EVM-only
        const chainType = ctx.config.chainType || ctx.identity.chainType || "evm";
        if (chainType === "solana") {
          return "x402 payment requires an EVM wallet. Solana automatons cannot sign EVM payment authorizations. Use Conway credits API instead.";
        }

        const { x402Fetch } = await import("../conway/x402.js");
        const { DEFAULT_TREASURY_POLICY } = await import("../types.js");
        const url = args.url as string;
        const method = (args.method as string) || "GET";
        const body = args.body as string | undefined;
        const extraHeaders = args.headers
          ? JSON.parse(args.headers as string)
          : undefined;

        const maxPayment =
          ctx.config.treasuryPolicy?.maxX402PaymentCents ??
          DEFAULT_TREASURY_POLICY.maxX402PaymentCents;
        const result = await x402Fetch(
          url,
          ctx.identity.account,
          method,
          body,
          extraHeaders,
          maxPayment,
        );

        if (!result.success) {
          return `x402 fetch failed: ${result.error || "Unknown error"}`;
        }

        const responseStr =
          typeof result.response === "string"
            ? result.response
            : JSON.stringify(result.response, null, 2);

        // Truncate very large responses
        if (responseStr.length > 10000) {
          return `x402 fetch succeeded (truncated):\n${responseStr.slice(0, 10000)}...`;
        }
        return `x402 fetch succeeded:\n${responseStr}`;
      },
    },

    // === Orchestration Tools ===
    {
      name: "create_goal",
      description:
        "Create a new goal for the orchestrator to plan and execute. " +
        "The orchestrator will automatically classify complexity, generate a task graph, " +
        "assign tasks to child agents, and collect results. Use this instead of doing complex work yourself.",
      category: "orchestration" as ToolCategory,
      riskLevel: "caution" as RiskLevel,
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short goal title (e.g., 'Build weather API service')",
          },
          description: {
            type: "string",
            description:
              "Detailed goal description with success criteria. The more specific, the better the plan.",
          },
          strategy: {
            type: "string",
            description:
              "Optional strategic guidance for the planner (e.g., 'prioritize speed over cost')",
          },
        },
        required: ["title", "description"],
      },
      execute: async (args, ctx) => {
        const { createGoal } = await import("../orchestration/task-graph.js");
        const { getActiveGoals } = await import("../state/database.js");

        const title = (args.title as string).trim();
        const description = (args.description as string).trim();
        const strategy =
          typeof args.strategy === "string" ? args.strategy.trim() : undefined;

        if (!title) return "Error: goal title cannot be empty.";
        if (!description) return "Error: goal description cannot be empty.";

        // Dedup: reject if a similar active goal already exists
        const activeGoals = getActiveGoals(ctx.db.raw);
        const titleLower = title.toLowerCase();
        const duplicate = activeGoals.find(
          (g) =>
            g.title.toLowerCase() === titleLower ||
            g.title.toLowerCase().includes(titleLower) ||
            titleLower.includes(g.title.toLowerCase()),
        );
        if (duplicate) {
          return (
            `Duplicate goal rejected. An active goal already exists with a similar title:\n` +
            `"${duplicate.title}" (id: ${duplicate.id}, status: ${duplicate.status})\n` +
            `Monitor the existing goal with list_goals or orchestrator_status instead of creating duplicates.`
          );
        }

        // Cap active goals to prevent accumulation.
        // Only 1 goal at a time â€” the orchestrator processes goals sequentially.
        if (activeGoals.length >= 1) {
          const current = activeGoals[0];
          return (
            `BLOCKED: A goal is already being processed by the orchestrator and worker agents:\n` +
            `"${current.title}" (id: ${current.id})\n\n` +
            `ACTION REQUIRED: DO NOTHING. Go to sleep. The worker agents are executing tasks in the background.\n` +
            `They will complete autonomously. You will see progress on your next wake-up.\n` +
            `Do NOT call create_goal, orchestrator_status, list_goals, or get_plan again this turn.\n` +
            `Just sleep and let the workers finish.`
          );
        }

        const goal = createGoal(ctx.db.raw, title, description, strategy);
        return (
          `Goal created: "${goal.title}" (id: ${goal.id}, status: ${goal.status})\n` +
          `The orchestrator will pick this up on the next tick and begin planning.\n` +
          `Monitor progress via the todo.md block in your context.`
        );
      },
    },
    {
      name: "list_goals",
      description:
        "List all active goals with their progress. Shows task completion counts, " +
        "blocked tasks, and running agents per goal.",
      category: "orchestration" as ToolCategory,
      riskLevel: "safe" as RiskLevel,
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const { getActiveGoals, getTasksByGoal } =
          await import("../state/database.js");
        const { getGoalProgress } =
          await import("../orchestration/task-graph.js");

        const goals = getActiveGoals(ctx.db.raw);
        if (goals.length === 0)
          return "No active goals. Create one with create_goal.";

        const lines = goals.map((goal) => {
          const progress = getGoalProgress(ctx.db.raw, goal.id);
          const tasks = getTasksByGoal(ctx.db.raw, goal.id);
          const failedCount = tasks.filter((t) => t.status === "failed").length;
          return (
            `- ${goal.title} [${goal.status}] (id: ${goal.id})\n` +
            `  Tasks: ${progress.completed}/${progress.total} completed, ` +
            `${progress.running} running, ${progress.blocked} blocked, ${failedCount} failed`
          );
        });

        // Include orchestrator phase
        let phase = "unknown";
        try {
          const stateRow = ctx.db.raw
            .prepare("SELECT value FROM kv WHERE key = ?")
            .get("orchestrator.state") as { value: string } | undefined;
          if (stateRow?.value) {
            const parsed = JSON.parse(stateRow.value);
            phase = parsed.phase ?? "unknown";
          }
        } catch {
          /* ignore */
        }

        return `Orchestrator phase: ${phase}\n\n${lines.join("\n")}`;
      },
    },
    {
      name: "cancel_goal",
      description:
        "Cancel an active goal. Stops all execution for this goal and marks it as failed. Accepts goal ID or title.",
      category: "orchestration" as ToolCategory,
      riskLevel: "caution" as RiskLevel,
      parameters: {
        type: "object",
        properties: {
          goal_id: {
            type: "string",
            description: "The goal ID or title to cancel",
          },
          reason: {
            type: "string",
            description: "Why the goal is being cancelled",
          },
        },
        required: ["goal_id"],
      },
      execute: async (args, ctx) => {
        const { getGoalById, getActiveGoals, updateGoalStatus } =
          await import("../state/database.js");

        const input = (args.goal_id as string).trim();
        const reason =
          typeof args.reason === "string"
            ? args.reason.trim()
            : "cancelled by agent";

        // Try by ID first, then by title match
        let goal = getGoalById(ctx.db.raw, input);
        if (!goal) {
          const allGoals = getActiveGoals(ctx.db.raw);
          goal =
            allGoals.find((g) =>
              g.title.toLowerCase().includes(input.toLowerCase()),
            ) ?? undefined;
        }

        if (!goal)
          return `Goal "${input}" not found. Use list_goals to see active goals with their IDs.`;
        if (goal.status !== "active")
          return `Goal "${goal.title}" is already in '${goal.status}' status.`;

        updateGoalStatus(ctx.db.raw, goal.id, "failed");

        // Cancel all pending/assigned/running tasks for this goal
        ctx.db.raw
          .prepare(
            `UPDATE task_graph SET status = 'cancelled' WHERE goal_id = ? AND status IN ('pending', 'assigned', 'running', 'blocked')`,
          )
          .run(goal.id);

        return `Goal "${goal.title}" (${goal.id}) cancelled. Reason: ${reason}`;
      },
    },
    {
      name: "get_plan",
      description:
        "Read the current plan for a goal. Returns the planner's task decomposition, " +
        "strategy, risks, and cost estimates.",
      category: "orchestration" as ToolCategory,
      riskLevel: "safe" as RiskLevel,
      parameters: {
        type: "object",
        properties: {
          goal_id: {
            type: "string",
            description: "The goal ID or title to get the plan for",
          },
        },
        required: ["goal_id"],
      },
      execute: async (args, ctx) => {
        const { getGoalById, getActiveGoals } =
          await import("../state/database.js");

        const input = (args.goal_id as string).trim();

        // Resolve ID or title
        let resolvedId = input;
        if (!getGoalById(ctx.db.raw, input)) {
          const allGoals = getActiveGoals(ctx.db.raw);
          const match = allGoals.find((g) =>
            g.title.toLowerCase().includes(input.toLowerCase()),
          );
          if (match) {
            resolvedId = match.id;
          } else {
            return `No goal found matching "${input}". Use list_goals to see active goals.`;
          }
        }

        const planRow = ctx.db.raw
          .prepare("SELECT value FROM kv WHERE key = ?")
          .get(`orchestrator.plan.${resolvedId}`) as
          | { value: string }
          | undefined;

        if (!planRow?.value)
          return `No plan found for goal ${resolvedId}. It may not have been planned yet.`;

        try {
          const plan = JSON.parse(planRow.value);
          const lines = [
            `Strategy: ${plan.strategy ?? "none"}`,
            `Analysis: ${plan.analysis ?? "none"}`,
            `Estimated cost: ${plan.estimatedTotalCostCents ?? 0} cents`,
            `Estimated time: ${plan.estimatedTimeMinutes ?? 0} minutes`,
            `Risks: ${(plan.risks ?? []).join("; ") || "none"}`,
            `\nTasks (${(plan.tasks ?? []).length}):`,
          ];
          for (const [i, task] of (plan.tasks ?? []).entries()) {
            lines.push(
              `  ${i + 1}. ${task.title} (role: ${task.agentRole}, cost: ${task.estimatedCostCents}c, deps: ${(task.dependencies ?? []).join(",") || "none"})`,
            );
          }
          return lines.join("\n");
        } catch {
          return `Plan data for goal ${resolvedId} is corrupted.`;
        }
      },
    },
    {
      name: "complete_task",
      description:
        "Mark a task as completed with a result. Use this when YOU (the parent agent) " +
        "have finished a self-assigned task, or to manually resolve a stuck task.",
      category: "orchestration" as ToolCategory,
      riskLevel: "caution" as RiskLevel,
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "The task ID or title to mark as completed",
          },
          output: {
            type: "string",
            description: "Description of what was accomplished",
          },
          artifacts: {
            type: "string",
            description:
              "Comma-separated list of file paths or URLs created (optional)",
          },
        },
        required: ["task_id", "output"],
      },
      execute: async (args, ctx) => {
        const { completeTask } = await import("../orchestration/task-graph.js");
        const { getTaskById } = await import("../state/database.js");

        const input = (args.task_id as string).trim();
        const output = (args.output as string).trim();
        const artifacts =
          typeof args.artifacts === "string"
            ? (args.artifacts as string)
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean)
            : [];

        // Try by ID first, then by title match
        let task = getTaskById(ctx.db.raw, input);
        if (!task) {
          const rows = ctx.db.raw
            .prepare(
              `SELECT * FROM task_graph WHERE LOWER(title) LIKE ? AND status != 'completed' LIMIT 1`,
            )
            .get(`%${input.toLowerCase()}%`) as any;
          if (rows) task = rows;
        }
        if (!task)
          return `Task "${input}" not found. Use list_goals to see tasks with their IDs.`;
        if (task.status === "completed")
          return `Task "${task.title}" is already completed.`;

        const result = {
          success: true,
          output,
          artifacts,
          costCents: 0,
          duration: 0,
        };

        try {
          completeTask(ctx.db.raw, task.id, result);
          return `Task "${task.title}" marked as completed.\nOutput: ${output}`;
        } catch (error) {
          return `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: "orchestrator_status",
      description:
        "Get detailed orchestrator status including current phase, active goals, " +
        "running agents, task progress, and recent events.",
      category: "orchestration" as ToolCategory,
      riskLevel: "safe" as RiskLevel,
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const lines: string[] = [];

        // Orchestrator phase
        let phase = "idle";
        let goalId: string | null = null;
        let replanCount = 0;
        try {
          const stateRow = ctx.db.raw
            .prepare("SELECT value FROM kv WHERE key = ?")
            .get("orchestrator.state") as { value: string } | undefined;
          if (stateRow?.value) {
            const parsed = JSON.parse(stateRow.value);
            phase = parsed.phase ?? "idle";
            goalId = parsed.goalId ?? null;
            replanCount = parsed.replanCount ?? 0;
          }
        } catch {
          /* ignore */
        }

        lines.push(`Phase: ${phase}`);
        if (goalId) lines.push(`Active goal: ${goalId}`);
        if (replanCount > 0) lines.push(`Replan count: ${replanCount}`);

        // Goal counts
        try {
          const goalsRow = ctx.db.raw
            .prepare("SELECT COUNT(*) AS c FROM goals WHERE status = 'active'")
            .get() as { c: number } | undefined;
          lines.push(`Active goals: ${goalsRow?.c ?? 0}`);
        } catch {
          /* goals table may not exist */
        }

        // Task summary
        try {
          const taskRows = ctx.db.raw
            .prepare(
              `SELECT status, COUNT(*) AS c FROM task_graph GROUP BY status`,
            )
            .all() as { status: string; c: number }[];
          const taskSummary = taskRows
            .map((r) => `${r.status}: ${r.c}`)
            .join(", ");
          lines.push(`Tasks: ${taskSummary || "none"}`);
        } catch {
          /* task_graph may not exist */
        }

        // Agent summary
        try {
          const agentRows = ctx.db.raw
            .prepare(
              `SELECT status, COUNT(*) AS c FROM children GROUP BY status`,
            )
            .all() as { status: string; c: number }[];
          const agentSummary = agentRows
            .map((r) => `${r.status}: ${r.c}`)
            .join(", ");
          lines.push(`Agents: ${agentSummary || "none"}`);
        } catch {
          /* children may not exist */
        }

        // Last tick result
        try {
          const tickRow = ctx.db.raw
            .prepare("SELECT value FROM kv WHERE key = ?")
            .get("orchestrator.last_tick") as { value: string } | undefined;
          if (tickRow?.value) {
            const tick = JSON.parse(tickRow.value);
            lines.push(
              `Last tick: assigned=${tick.tasksAssigned ?? 0}, completed=${tick.tasksCompleted ?? 0}, failed=${tick.tasksFailed ?? 0}`,
            );
          }
        } catch {
          /* ignore */
        }

        return lines.join("\n");
      },
    },

    // ── Revenue Intelligence Tools ──
    {
      name:'advanced_paper_research',category:'revenue',riskLevel:'safe',
      description:'Pure bounded offline scenarios for European cash-settled option combinations, linear long/short isolated margin, depth-aware IOC/FOK order fills, cash-long scalping round trips and prefunded two-venue arbitrage including failed-leg unwind. No DB writes, broker, provider, capital authorization or realized profit. Unknown or unsupported models fail closed. Results are supplied scenarios, not calibrated learning or live evidence.',
      parameters:{type:'object',properties:{request:{type:'object',description:'AdvancedPaperRequest with explicit mode=paper and kind=options|margin|orderbook|arbitrage|scalping|intraday-signal. intraday-signal input: strategy=order-flow-imbalance, now,maxAgeMs,latencyMs,maxHoldingMs,threshold,quotes[{sequence,at,bid,ask,bidSize,askSize}]; or strategy=opening-range-breakout|market-close-momentum, sessionOpen,sessionClose,now,barMs,openingWindowMs,closingWindowMs,thresholdBps,bars[{start,end,open,high,low,close}]. Prices/sizes are positive bounded integers in consistent units; contiguous completed bars and externally supplied calendar; close signal only at sessionClose-closingWindowMs. Signals remain HOLD_UNVALIDATED; no permission or profit. scalping input: entryBook,exitBook,entryOrder(buy FOK),exitOrder(sell IOC),signalAt,entryAt,exitAt,latencyMs,maxAgeMs,maxHoldingMs,cashCents,otherCostsCents; same venue/instrument/lot; arrival snapshots and explicit costs; unclosed inventory is not profit. options input: underlying,currency,style=european,settlement=cash,expiry,at=expiry,terminalCents,capitalCents,maxLossCents,feePerContractCents,legs[{kind=call|put,side=long|short,strikeCents,premiumCents,contracts,multiplier}]. margin input: side,entryCents,stopCents,lots,collateralCents,equityCents,maxLossCents,maxLeverageBps,maintenanceBps,liquidationFeeBps,friction,borrowLocated,path[{time,markCents,executionCents,borrowCents,fundingCents}]. orderbook: book{venue,symbol,currency,lotId,observedAt,bids/asks[{priceMicros per lot,lots}]},order{side,lots,limitMicros,tif=IOC|FOK,feeBps,maxNotionalCents},now,maxAgeMs. arbitrage input: buyBook,sellBook,buyOrder,sellOrder,now,maxAgeMs,cashCents,prefundedSellLots,otherCostsCents,buyAvailable,sellAvailable, optional unwindBook/unwindLimitMicros. Explicit costs and caller assumptions never authorize live actions.'}},required:['request'],additionalProperties:false},
      execute:async(args)=>{const {advancedPaper}=await import('../revenue/advanced-paper.js');return JSON.stringify(advancedPaper(args.request as Parameters<typeof advancedPaper>[0]));},
    },
    {
      name:'paper_arbitrage',
      description:'Evaluate net arbitrage economics or execute a bounded local PAPER settlement using an operator-registered immutable paper policy. Actions evaluate/execute/status/halt. No network, wallet, live order or real money. Supplied fills remain simulated, never independent live evidence. Bind future candidate IDs with revenue_paper_profit before execution when attributing an experiment.',
      category:'revenue',riskLevel:'safe',
      parameters:{type:'object',properties:{action:{type:'string',enum:['evaluate','execute','status','halt']},candidate:{type:'object',description:'ArbitrageCandidate: id, category, currency USD, capitalCents, grossProfitCents, all 13 costs (unknown=null), maximumLossCents, executableLiquidityCents, observedAt, expiresAt, evidence assumption|paper|executable_quote, legsAvailable.'},limits:{type:'object',description:'Evaluation only: capitalCents, liquidityReserveCents, maximumPositionCents, maximumLossCents, maximumCumulativeLossCents, maxQuoteAgeMs.'},now:{type:'integer'},actualGrossCents:{type:'integer'},actualCostsCents:{type:'integer'},failedLegLossCents:{type:'integer'}},required:['action']},
      execute:async(args,ctx)=>{
        const {ArbitragePaperEngine,evaluateArbitrage}=await import('../revenue/arbitrage.js');
        if(args.action==='evaluate')return JSON.stringify(evaluateArbitrage(args.candidate as Parameters<typeof evaluateArbitrage>[0],args.limits as Parameters<typeof evaluateArbitrage>[1],args.now as number));
        if(!['execute','status','halt'].includes(args.action as string))throw new Error('Invalid paper arbitrage action');
        const engine=new ArbitragePaperEngine(ctx.db.raw);
        if(args.action==='execute')return JSON.stringify(engine.executeConfiguredPaper({candidate:args.candidate as Parameters<typeof evaluateArbitrage>[0],now:args.now as number,actualGrossCents:args.actualGrossCents as number,actualCostsCents:args.actualCostsCents as number,failedLegLossCents:args.failedLegLossCents as number}));
        if(args.action==='halt')engine.emergencyStop();
        return JSON.stringify(engine.snapshot());
      },
    },
    {
      name:"paper_portfolio",
      description:"Persistent cash-only USD paper account with explicit immutable capital, liquidity floor, aggregate open risk, daily gross loss, drawdown and position limits. Actions initialize/open/observe/settle/halt/status. Observe records synchronized marks and may close at stop/target; settlement closes at stop/target or supplied window end. No live broker or money.",
      category:"revenue",riskLevel:"safe",
      parameters:{type:"object",properties:{action:{type:"string",enum:["initialize","open","observe","settle","halt","status"]},limits:{type:"object",description:"initialCapitalCents, liquidityFloorCents, maxOpenRiskCents, maxDailyLossCents, maxDrawdownCents, maxPositions, friction {feeBps,slippageBps}"},id:{type:"string"},plan:{type:"object",description:"PaperPlan: symbol, thesis, entryCents, stopCents, targetsCents, exitRule, optional riskFraction <=0.02"},at:{type:"number"},quotes:{type:"array",items:{type:"object",description:"{id, bar:{time,open,high,low,close}}"}},bars:{type:"array",items:{type:"object"}},reason:{type:"string"}},required:["action"]},
      execute:async(args,ctx)=>{
        const portfolio=new PaperPortfolio(ctx.db.raw);
        if(args.action==="initialize") portfolio.initialize(args.limits as PaperPortfolioLimits);
        else if(args.action==="open") return JSON.stringify(portfolio.open(args.id as string,args.plan as PaperPlan,args.at as number));
        else if(args.action==="observe") return JSON.stringify(portfolio.observe(args.at as number,args.quotes as PaperObservation[]));
        else if(args.action==="settle") return JSON.stringify(portfolio.settle(args.id as string,args.bars as Bar[]));
        else if(args.action==="halt") portfolio.halt(args.reason as string);
        else if(args.action!=="status") throw new Error("Invalid paper portfolio action");
        const state=portfolio.snapshot();return JSON.stringify({...state,positions:state.positions.slice(-20),totalPositions:state.positions.length});
      },
    },
    {
      name: 'paper_execution_audit',
      description: 'Pure educational audit of caller-supplied hypothetical data. kind execution: side buy/sell, quoteCurrency, intended quantity, decisionPrice, receiptMid, deadlineMark, explicit nonnegative aggregate fees, fills [{id,quantity,price,laterMid}]. Prices use one quote-currency unit per base unit; laterMid must use a consistent post-fill horizon. kind availability: decisionMs and events [{id,eventMs,receivedMs,processedMs}] normalized to one clock. At most 1000 records. Returns costs, weighted spreads or future-information flags, never verified fills, strategy approval or live authority. No network or database.',
      category: 'revenue', riskLevel: 'safe',
      parameters: {type: 'object', properties: {input: {type: 'object', description: 'Execution or availability diagnostic input as specified in the tool description'}}, required: ['input']},
      execute: async args => JSON.stringify((await import('../revenue/execution-audit.js')).executionAudit(args.input)),
    },
    {
      name:'paper_event_opportunity_audit',category:'revenue',riskLevel:'safe',
      description:'Offline event-opportunity diagnostic. First read paper_research_series action knowledge, eventOpportunities.diagnostic for all required fields and units. Checks claimed source status, information timing, opportunity expiry, quote freshness, claimed liquidity and two-outcome value under supplied probability and loss stress assumptions. No network, database, authentication, probability calibration or trading authority. A passing result is paper-review-only.',
      parameters:{type:'object',properties:{input:{type:'object',description:'Complete hypothetical event case; fields and units in the eventOpportunities knowledge diagnostic.'}},required:['input']},
      execute:async args=>JSON.stringify((await import('../revenue/event-opportunity.js')).eventOpportunityAudit(args.input)),
    },
    {
      name:"paper_research_series",
      description:"Use strategies for sourced intraday/scalping/HFT hypotheses and prerequisites, knowledge for sourced research lessons and their limits, literature for paged publisher-overview briefings using offset, limit and optional literature_topic; catalogue to obtain the fixed six-family, twelve-variant research universe. Persist a bounded paper research series: register, trial, lock, finalize, status, learning or learned-trial. learned-trial atomically applies feedback before a bounded development trial. Learning returns a nextSettings proposal from comparable earlier non-overlapping final tests, pausing failed variants; null means preserve capital. Books are research context, not outcome evidence or execution authority. No paid calls, broker, live authority or proof of unseen data. Never retune a revealed holdout.",
      category:"revenue",riskLevel:"safe",
      parameters:{type:"object",properties:{action:{type:"string",enum:["strategies","knowledge","literature","catalogue","register","trial","lock","finalize","status","learning","learned-trial"]},offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1,maximum:20},literature_topic:{type:"string",description:"A topic returned by knowledge.literature.researchAgenda"},series_id:{type:"string"},trial_id:{type:"string"},registration:{type:"object",description:"symbol, provenance, source, developmentBars, holdoutDigest (SHA256 of JSON tuples [time,open,high,low,close]), holdoutBars, maxTrials (1..20)"},settings:{type:"object",description:"StrategyResearchInput excluding bars, symbol and provenance; required for trial, learning and learned-trial"},holdout:{type:"array",items:{type:"object"}}},required:["action"]},
      execute:async(args,ctx)=>{
        if(args.action==="strategies") return JSON.stringify((await import("../revenue/intraday-knowledge.js")).intradayKnowledge());
        if(args.action==="knowledge") return JSON.stringify((await import("../revenue/trading-knowledge.js")).tradingKnowledge());
        if(args.action==="literature") return JSON.stringify((await import("../revenue/trading-knowledge.js")).literaturePage(args.offset,args.limit,args.literature_topic));
        if(args.action==="catalogue") return JSON.stringify({mode:"paper-only",variants:strategyCatalogue(),liveAuthorized:false});
        const store=new StrategySeriesStore(ctx.db.raw);
        const id=args.series_id as string;
        const compact=(report:ReturnType<typeof researchStrategies>)=>({decision:report.decision,netPnlCents:report.evaluation.netPnlCents,trades:report.evaluation.trades.length,inputDigest:report.inputDigest,provenance:report.provenance,diagnostics:report.diagnostics,frictionStress:report.frictionStress});
        if(args.action==="learning") return JSON.stringify(store.learning(id,args.settings as TrialSettings));
        if(args.action==="learned-trial") return JSON.stringify(store.learnedTrial(id,args.settings as TrialSettings));
        if(args.action==="register") return JSON.stringify({seriesId:store.register(args.registration as SeriesRegistration)});
        if(args.action==="trial") {const result=store.trial(id,args.settings as TrialSettings);return JSON.stringify({...result,report:compact(result.report)});}
        if(args.action==="lock") store.lock(id,args.trial_id as string);
        else if(args.action==="finalize") {const result=store.finalize(id,args.holdout as Bar[]);return JSON.stringify({...result,report:compact(result.report)});}
        else if(args.action!=="status") throw new Error("Invalid series action");
        const status=store.snapshot(id);return JSON.stringify({...status,finalReport:status.finalReport ? compact(status.finalReport) : null});
      },
    },
    {
      name: "paper_research_strategies",
      description: "Compare bounded long-only candidates from the six strategy families in paper_research_series catalogue on local OHLC data with training-only selection and chronological forward paper evaluation. No broker or live execution. Prices and equity must use the same quote-currency cent unit; no conversion or verified profit claim.",
      category: "revenue",
      riskLevel: "safe",
      parameters: { type: "object", properties: { input: { type: "object", description: "StrategyResearchInput: provenance synthetic or historical-unverified; symbol; bars [{time,open,high,low,close}]; variants [{id,family,lookback,thresholdBps,stopBps,targetBps}]; trainSize; testSize; equityCents; friction {feeBps,slippageBps}; minTrainingTrades; maxTrainingClosedDrawdownFraction. Maximum 5000 bars, 20 variants, 50 windows; risk fixed at 1%, stop <=5%." } }, required: ["input"] },
      execute: async args => {
        const report = researchStrategies(args.input as StrategyResearchInput);
        return JSON.stringify({ version: report.version, mode: report.mode, provenance: report.provenance, inputDigest: report.inputDigest,
          decision: report.decision, netPnlCents: report.evaluation.netPnlCents, trades: report.evaluation.trades.length,
          rejectedPlans: report.evaluation.rejectedPlans, closedDrawdownCents: report.closedDrawdownCents,
          selections: report.selections.map(s=>({trainEnd:s.trainEnd,selectedId:s.selectedId})), diagnostics:report.diagnostics, frictionStress:report.frictionStress, limits: report.limits });
      },
    },
    {
      name:'revenue_run_optimization_rollout',
      description:'Execute one exact registered text case through a staged lower-token rollout. Coordinator only, requires its current running experiment and matching survival tier. Uses configured inference with existing shared/capital/experiment reservations, plus rollout exposure limits. May incur provider cost. No tools or fallback calls; wrong or uncertain results withdraw the variant. No arbitrary tasks or global model changes.',
      category:'revenue',riskLevel:'caution',
      parameters:{type:'object',properties:{rollout_id:{type:'string'},operation_id:{type:'string'},case_id:{type:'string'},messages:{type:'array',description:'Exact registered text-only role/content messages; at most 20, 32768 UTF-8 bytes total.'}},required:['rollout_id','operation_id','case_id','messages'],additionalProperties:false},
      execute:async(args,ctx)=>{
        if(!ctx.optimizationRollout)throw new Error('Coordinator rollout executor unavailable');
        return ctx.optimizationRollout({rolloutId:args.rollout_id as string,operationId:args.operation_id as string,caseId:args.case_id as string,messages:args.messages as import('../types.js').ChatMessage[]});
      },
    },
    {
      name:'revenue_optimization_rollout',
      description:'Stage a bounded exact-text lower-token rollout after current replication/payback checks, inspect its persisted status, or roll it back. Same model/provider/settings only. One rollout per trial; 1..10 executions, 1..1000 USD cents and expiry within 24h, also capped by projected net savings. Staging does not start providers or modify global routing. Use revenue_run_optimization_rollout only through the guarded coordinator executor; arbitrary tasks and global adoption are unsupported.',
      category:'revenue',riskLevel:'caution',
      parameters:{type:'object',properties:{action:{type:'string',enum:['stage','inspect','rollback']},rollout_id:{type:'string'},scenario:{type:'object'},limits:{type:'object',description:'maxRuns, maxCostCents, expiresAt (Unix milliseconds)'}},required:['action']},
      execute:async(args,ctx)=>JSON.stringify(args.action==='stage'?stageOptimizationRollout(ctx.db.raw,args.scenario as OptimizationPaybackInput,args.limits as {maxRuns:number;maxCostCents:number;expiresAt:number}):
        args.action==='inspect'?inspectOptimizationRollout(ctx.db.raw,args.rollout_id as string):args.action==='rollback'?rollbackOptimization(ctx.db.raw,args.rollout_id as string):{error:'invalid_action'}),
    },
    {
      name:'revenue_optimization_cost',
      description:'Permanently attribute an existing non-inference USD cost event to one optimization trial. No expense creation or payment. Same event cannot be reused for another trial; altered source events require reconciliation. Payback rechecks these costs in the trial and its parent. Local attribution is not independent receipt verification.',
      category:'revenue',riskLevel:'caution',
      parameters:{type:'object',properties:{trial_id:{type:'string'},event_id:{type:'string'}},required:['trial_id','event_id']},
      execute:async(args,ctx)=>JSON.stringify(bindOptimizationCost(ctx.db.raw,{trialId:args.trial_id as string,eventId:args.event_id as string})),
    },
    {
      name:'revenue_optimization_payback',
      description:'Read-only payback scenario for a held-out optimization replication and its parent. Revalidates actual local trial costs, direct collection and quality checks. Include all additional evaluation, failed exploration, deployment and monitoring costs explicitly, in USD cents. Future executions and retention of observed savings are assumptions, never verified demand. No deployment or budget authority.',
      category:'revenue',riskLevel:'safe',
      parameters:{type:'object',properties:{scenario:{type:'object',description:'trialId of replication; forecastExecutions and maximumPaybackExecutions (1..1000000); additionalOneTimeCostCents, additionalPerExecutionCostCents, minimumNetSavingsCents (integer 0..1000000000 USD cents); savingsRetentionPercent (integer 1..100). For a positive assessment workload:{lookbackDays:7..90,horizonDays:1..lookbackDays} is required; forecast cannot exceed the lower observed rate of two complete UTC windows. All cost assumptions required; do not invent future usage or omit costs.'}},required:['scenario']},
      execute:async(args,ctx)=>JSON.stringify(assessOptimizationPayback(ctx.db.raw,args.scenario as OptimizationPaybackInput)),
    },
    {
      name:'revenue_optimization_trial',
      description:'Register immutable comparison criteria before inference, record output/quality observations with costs derived from the assigned session ledger, or assess a trial. Cases may all preregister qualityRule {kind: exact-output-sha256-v1, expectedOutputDigest: SHA256, maxOutputBytes: 1..16384}. Then provide actual output text when recording; score is derived, not self-rated, and raw output is not stored. Exact matching checks only the supplied text, not provider authenticity, safety or general business quality. Report provides assigned session IDs; inference still requires budget admission. Never invent scores. Does not launch calls or adopt policy.',
      category:'revenue',riskLevel:'safe',
      parameters:{type:'object',properties:{action:{type:'string',enum:['register','record','assess']},trial_id:{type:'string'},manifest:{type:'object',description:'Comparison fields datasetDigest, criteriaDigest, baseline, candidate, minimumQuality, maximumQualityDrop, minimumSavingsPercent, maximumLatencyRatio; 3..100 cases each with id and inputDigest. For automatic collection preregister recipes.baseline/candidate: tier, taskType, maxTokens, temperature, modelId, provider, modelDigest of local model contract; machine qualityRule on every case. phase exploration|replication; replication requires parentTrialId, unchanged criteria/recipes and new input digests. No measured results at registration.'},result:{type:'object',description:'trialId, caseId, side baseline|candidate, outputDigest SHA256, qualityScore 0..100, safetyPassed and completed booleans. Costs come from recorded inference in the assigned session.'}},required:['action']},
      execute:async(args,ctx)=>JSON.stringify(args.action==='register'?registerOptimizationTrial(ctx.db.raw,args.manifest as TrialManifest):
        args.action==='record'?recordOptimizationResult(ctx.db.raw,args.result as TrialResult):args.action==='assess'?assessOptimizationTrial(ctx.db.raw,args.trial_id as string):{error:'invalid_action'}),
    },
    {
      name:'revenue_compare_optimization',
      description:'Compare 3..100 distinct matched tasks for cost, quality, safety and latency. Measurements must come from observations, never invented estimates. Simulation and recorded input remain unverified. Returns rejection or candidate for replication; never changes models, budgets or safety policy.',
      category:'revenue',riskLevel:'safe',
      parameters:{type:'object',properties:{comparison:{type:'object',description:'mode simulation|recorded; datasetDigest and criteriaDigest SHA256; baseline and candidate identifiers; minimumQuality, maximumQualityDrop, minimumSavingsPercent (0..100), maximumLatencyRatio (1..10); cases with unique id and inputDigest SHA256, each with baseline and candidate measurements: costCents, latencyMs, qualityScore 0..100, safetyPassed boolean, completed boolean. Include all cases and all attributable costs; preregister criteria independently before collecting results.'}},required:['comparison']},
      execute:async args=>JSON.stringify(compareOptimization(args.comparison as OptimizationComparison)),
    },
    {
      name:'revenue_information_value',
      description:'Bound the value of research before buying information. Supplied scenarios remain assumptions; perfect information is an upper bound, never permission to spend. Preserve capital is included.',
      category:'revenue',riskLevel:'safe',
      parameters:{type:'object',properties:{model:{type:'object',description:'probabilities: 2..20 probabilities summing to one; actions: 1..20 unique id and netCents per scenario including all costs; researchCostCents nonnegative integer. Use comparable horizons and a single currency.'}},required:['model']},
      execute:async args=>{
        const {informationValue}=await import('../revenue/validation-design.js');
        return JSON.stringify(informationValue(args.model as Parameters<typeof informationValue>[0]));
      },
    },
    {
      name: "revenue_assess_marketing",
      description: "Assess product marketing unit economics before a bounded experiment: audience, offer, channel, price, non-personnel costs, conservative sales, gross cash need, break-even and stop criteria. Never include employee costs, human labour charges or imputed hourly rates in any allowance. Optional humanInterventionMinutes records time only, without monetary valuation. Does not spend, publish or verify demand.",
      category: "revenue",
      riskLevel: "safe",
      parameters: {type:"object",properties:{plan:{type:"object",description:"MarketingPlan: currency USD/CHF/EUR; product, audience, channel, offer, successCriterion, stopCriterion; priceCents, deliveryCostCents, paymentFeeCents, refundAllowanceCents, taxAllowanceCents, acquisitionCostPerSaleCents, fixedTestCostCents, operatingCostCents, availableTestBudgetCents, conservativeSales. Explicit nonnegative amounts in one currency."},scenarios:{type:'array',items:{type:'object'},description:'Optional up to 20 hypothetical stress scenarios: id, priceBps, salesBps, variableCostBps, fixedCostBps. 10000 means unchanged; all 0..50000. Not evidence.'}},required:["plan"]},
      execute: async args => JSON.stringify(assessMarketingPlan(args.plan as MarketingPlan,args.scenarios as Parameters<typeof assessMarketingPlan>[1])),
    },
    {
      name:'revenue_research_economics',
      description:'Read a source-linked economic brief, cite a literal source passage with a separate supporting or contradicting interpretation, or save an immutable economic revision. Include reachable audience, offer, distribution, complete costs and explicit success/stop criteria. Unknown values must remain unknown: do not invent a plan to pass admission. Quotes and interpretations remain unverified. Revisions do not inherit source reviews, spend funds or start work.',
      category:'revenue',riskLevel:'safe',
      parameters:{type:'object',properties:{action:{type:'string',enum:['brief','revise','cite']},opportunity_id:{type:'string'},citation:{type:'object',description:'field: payer/offer/channel/price/deliveryCost/paymentFees/refundAllowance/taxAllowance/acquisitionCost/fixedTestCost/operatingCost/conservativeSales/probability/timeToRevenue; evidenceId, literal quote, separate interpretation, direction supports/contradicts. Quotes remain unverified reports.'},plan:{type:'object',description:'Complete MarketingPlan as in revenue_assess_marketing; USD only, with explicit conversion evidence if originating in another currency.'},probability:{type:'number'},days:{type:'integer'},reason:{type:'string'}},required:['action','opportunity_id']},
      execute:async(args,ctx)=>{
        const store=new ResearchStore(ctx.db.raw);
        if(args.action==='brief')return JSON.stringify(store.economicBrief(args.opportunity_id as string));
        if(args.action==='cite')return JSON.stringify(recordEconomicCitation(ctx.db.raw,args.opportunity_id as string,args.citation as EconomicCitation));
        if(args.action==='revise')return JSON.stringify(store.reviseEconomics(args.opportunity_id as string,args.plan as MarketingPlan,args.probability as number,args.days as number,args.reason as string));
        throw new Error('Unknown research economics action');
      },
    },
    {
      name: "revenue_create_opportunity",
      description:
        "Create a persistent revenue opportunity for a niche, business idea or economic opportunity. Use this when an opportunity becomes concrete enough to track, test and compare.",
      category: "revenue",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short opportunity name" },
          niche: { type: "string", description: "Market or niche" },
          goal_id: { type: "string", description: "Optional related goal ID" },
          status: {
            type: "string",
            enum: ["discovered", "screening", "validating", "active", "paused", "scale", "kill", "completed"],
          },
          evidence_level: { type: "string" },
          confidence: { type: "number" },
          probability_success: { type: "number" },
          expected_revenue_cents: { type: "number" },
          expected_cost_cents: { type: "number" },
          expected_net_value_cents: { type: "number" },
          time_to_revenue_days: { type: "number" },
          max_experiment_budget_cents: { type: "number" },
          focus_rank: { type: "number" },
          hypothesis: { type: "string" },
          kill_condition: { type: "string" },
          next_action: { type: "string" },
        },
        required: ["name"],
      },
      execute: async (args, ctx) => {
        const store = new RevenueStore(ctx.db.raw);

        const expectedRevenue = Number(args.expected_revenue_cents ?? 0);
        const expectedCost = Number(args.expected_cost_cents ?? 0);

        const id = store.createOpportunity({
          goalId: (args.goal_id as string | undefined) ?? null,
          name: args.name as string,
          niche: (args.niche as string | undefined) ?? null,
          status: (args.status as any) ?? "discovered",
          evidenceLevel: (args.evidence_level as string | undefined) ?? null,
          confidence: args.confidence === undefined ? null : Number(args.confidence),
          probabilitySuccess:
            args.probability_success === undefined
              ? null
              : Number(args.probability_success),
          expectedRevenueCents: expectedRevenue,
          expectedCostCents: expectedCost,
          expectedNetValueCents:
            args.expected_net_value_cents === undefined
              ? expectedRevenue - expectedCost
              : Number(args.expected_net_value_cents),
          timeToRevenueDays:
            args.time_to_revenue_days === undefined
              ? null
              : Number(args.time_to_revenue_days),
          maxExperimentBudgetCents: Number(args.max_experiment_budget_cents ?? 0),
          focusRank:
            args.focus_rank === undefined ? null : Number(args.focus_rank),
          hypothesis: (args.hypothesis as string | undefined) ?? null,
          killCondition: (args.kill_condition as string | undefined) ?? null,
          nextAction: (args.next_action as string | undefined) ?? null,
        });

        return JSON.stringify({ ok: true, opportunity_id: id });
      },
    },
    {
      name: "revenue_update_opportunity",
      description:
        "Update a tracked revenue opportunity when evidence, economics, status, focus or the next action changes.",
      category: "revenue",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: "string" },
          status: {
            type: "string",
            enum: ["discovered", "screening", "validating", "active", "paused", "scale", "kill", "completed"],
          },
          evidence_level: { type: "string" },
          confidence: { type: "number" },
          probability_success: { type: "number" },
          expected_revenue_cents: { type: "number" },
          expected_cost_cents: { type: "number" },
          expected_net_value_cents: { type: "number" },
          time_to_revenue_days: { type: "number" },
          max_experiment_budget_cents: { type: "number" },
          focus_rank: { type: "number" },
          hypothesis: { type: "string" },
          kill_condition: { type: "string" },
          next_action: { type: "string" },
        },
        required: ["opportunity_id"],
      },
      execute: async (args, ctx) => {
        const store = new RevenueStore(ctx.db.raw);
        const id = args.opportunity_id as string;

        if (!store.getOpportunity(id)) {
          return JSON.stringify({ ok: false, error: "opportunity_not_found" });
        }

        const updates: Record<string, unknown> = {};
        const map: Record<string, string> = {
          status: "status",
          evidence_level: "evidenceLevel",
          confidence: "confidence",
          probability_success: "probabilitySuccess",
          expected_revenue_cents: "expectedRevenueCents",
          expected_cost_cents: "expectedCostCents",
          expected_net_value_cents: "expectedNetValueCents",
          time_to_revenue_days: "timeToRevenueDays",
          max_experiment_budget_cents: "maxExperimentBudgetCents",
          focus_rank: "focusRank",
          hypothesis: "hypothesis",
          kill_condition: "killCondition",
          next_action: "nextAction",
        };

        for (const [source, target] of Object.entries(map)) {
          if (args[source] !== undefined) updates[target] = args[source];
        }

        store.updateOpportunity(id, updates as any);

        return JSON.stringify({
          ok: true,
          opportunity: store.getOpportunity(id),
        });
      },
    },
    {
      name: "revenue_create_experiment",
      description:
        "Create a bounded revenue experiment linked to an opportunity, with explicit hypothesis, budget, forecast and stop criteria.",
      category: "revenue",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: "string" },
          hypothesis: { type: "string" },
          goal_id: { type: "string" },
          task_id: { type: "string" },
          status: {
            type: "string",
            enum: ["planned", "running", "completed", "failed", "stopped"],
          },
          channel: { type: "string" },
          offer: { type: "string" },
          max_budget_cents: { type: "number" },
          max_inference_cost_cents: { type: "number" },
          max_duration_hours: { type: "number" },
          success_criteria: { type: "string" },
          failure_criteria: { type: "string" },
          stop_condition: { type: "string" },
          forecast_revenue_cents: { type: "number" },
          forecast_cost_cents: { type: "number" },
          forecast_probability_success: { type: "number" },
          forecast_time_to_revenue_hours: { type: "number" },
        },
        required: ["opportunity_id", "hypothesis"],
      },
      execute: async (args, ctx) => {
        const store = new RevenueStore(ctx.db.raw);
        const opportunityId = args.opportunity_id as string;

        if (!store.getOpportunity(opportunityId)) {
          return JSON.stringify({ ok: false, error: "opportunity_not_found" });
        }

        const status = (args.status as any) ?? "planned";

        const id = store.createExperiment({
          opportunityId,
          goalId: (args.goal_id as string | undefined) ?? null,
          taskId: (args.task_id as string | undefined) ?? null,
          status,
          hypothesis: args.hypothesis as string,
          channel: (args.channel as string | undefined) ?? null,
          offer: (args.offer as string | undefined) ?? null,
          maxBudgetCents: Number(args.max_budget_cents ?? 0),
          maxInferenceCostCents: Number(args.max_inference_cost_cents ?? 0),
          maxDurationHours:
            args.max_duration_hours === undefined
              ? null
              : Number(args.max_duration_hours),
          successCriteria: (args.success_criteria as string | undefined) ?? null,
          failureCriteria: (args.failure_criteria as string | undefined) ?? null,
          stopCondition: (args.stop_condition as string | undefined) ?? null,
          forecastRevenueCents: Number(args.forecast_revenue_cents ?? 0),
          forecastCostCents: Number(args.forecast_cost_cents ?? 0),
          forecastProbabilitySuccess:
            args.forecast_probability_success === undefined
              ? null
              : Number(args.forecast_probability_success),
          forecastTimeToRevenueHours:
            args.forecast_time_to_revenue_hours === undefined
              ? null
              : Number(args.forecast_time_to_revenue_hours),
          actualRevenueCents: 0,
          actualCostCents: 0,
          result: null,
          lesson: null,
          startedAt: status === "running" ? new Date().toISOString() : null,
          completedAt: null,
        });

        return JSON.stringify({ ok: true, experiment_id: id });
      },
    },
    {
      name: 'revenue_assess_outcome',
      description: 'Assess preregistered demand criteria against independently reviewed customers and attributed provider payments. Persists evidence and may complete a live demand-validation experiment; never grants funds or scaling permission. Cannot create criteria or customer reviews.',
      category: 'revenue',
      riskLevel: 'safe',
      parameters: {type:'object',properties:{experiment_id:{type:'string'}},required:['experiment_id']},
      execute: async(args,ctx)=>JSON.stringify(assessExperimentOutcome(ctx.db.raw,args.experiment_id as string)??{error:'preregistered_outcome_contract_required'}),
    },
    {
      name: "revenue_update_experiment",
      description:
        "Update a tracked revenue experiment with status, actual economics, result or learning as evidence arrives.",
      category: "revenue",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          experiment_id: { type: "string" },
          status: {
            type: "string",
            enum: ["planned", "running", "completed", "failed", "stopped"],
          },
          actual_revenue_cents: { type: "number" },
          actual_cost_cents: { type: "number" },
          result: { type: "string" },
          lesson: { type: "string" },
          started_at: { type: "string" },
          completed_at: { type: "string" },
        },
        required: ["experiment_id"],
      },
      execute: async (args, ctx) => {
        return ctx.db.raw.transaction(() => {
        const store = new RevenueStore(ctx.db.raw);
        const id = args.experiment_id as string;
        const existing = store.getExperiment(id);

        if (!existing) {
          return JSON.stringify({ ok: false, error: "experiment_not_found" });
        }

        const updates: Record<string, unknown> = {};

        if (args.actual_revenue_cents !== undefined)
          updates.actualRevenueCents = Number(args.actual_revenue_cents);

        if (args.actual_cost_cents !== undefined)
          updates.actualCostCents = Number(args.actual_cost_cents);

        const requestedStatus =
          args.status as
            | "planned"
            | "running"
            | "completed"
            | "failed"
            | "stopped"
            | undefined;

        if (
          requestedStatus !== undefined &&
          requestedStatus !== existing.status
        ) {
          if(requestedStatus==='completed'){
            const outcome=assessExperimentOutcome(ctx.db.raw,id);
            if(outcome&&outcome.decision!=='demand_criteria_met')throw new Error('Preregistered outcome criteria not met; completion blocked');
          }
          store.transitionExperimentStatus(
            id,
            requestedStatus,
            args.result as string | undefined,
            args.lesson as string | undefined,
          );
        } else {
          if (args.result !== undefined) updates.result = args.result;
          if (args.lesson !== undefined) updates.lesson = args.lesson;
        }

        if (args.started_at !== undefined)
          updates.startedAt = args.started_at;

        if (args.completed_at !== undefined)
          updates.completedAt = args.completed_at;

        if (Object.keys(updates).length > 0) {
          store.updateExperiment(id, updates as any);
        }

        return JSON.stringify({
          ok: true,
          experiment: store.getExperiment(id),
        });
        }).immediate();
      },
    },
    {
      name: "revenue_record_event",
      description:
        "Record an attributable economic event. Use a stable idempotency_key and occurred_at when retrying. Router inference costs are already recorded: do not book them again.",
      category: "revenue",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: "string" },
          experiment_id: { type: "string" },
          goal_id: { type: "string" },
          task_id: { type: "string" },
          event_type: {
            type: "string",
            enum: ["lead", "qualified_lead", "commitment", "payment", "refund", "cost", "delivery", "renewal", "expansion", "referral", "other"],
          },
          category: { type: "string" },
          amount_cents: { type: "number" },
          currency: { type: "string" },
          channel: { type: "string" },
          offer: { type: "string" },
          customer_ref: { type: "string" },
          metadata: { type: "object" },
          occurred_at: { type: "string" },
          idempotency_key: { type: "string" },
        },
        required: ["event_type"],
      },
      execute: async (args, ctx) => {
        const store = new RevenueStore(ctx.db.raw);

        const opportunityId =
          (args.opportunity_id as string | undefined) ?? null;
        const experimentId =
          (args.experiment_id as string | undefined) ?? null;

        if (opportunityId && !store.getOpportunity(opportunityId)) {
          return JSON.stringify({ ok: false, error: "opportunity_not_found" });
        }

        if (experimentId && !store.getExperiment(experimentId)) {
          return JSON.stringify({ ok: false, error: "experiment_not_found" });
        }

        if (args.idempotency_key && !args.occurred_at) {
          throw new Error("Idempotent economic events require a stable occurred_at timestamp");
        }
        const id = store.addEconomicEvent({
          opportunityId,
          experimentId,
          goalId: (args.goal_id as string | undefined) ?? null,
          taskId: (args.task_id as string | undefined) ?? null,
          eventType: args.event_type as string,
          category: (args.category as string | undefined) ?? null,
          amountCents: Number(args.amount_cents ?? 0),
          currency: (args.currency as string | undefined) ?? "USD",
          channel: (args.channel as string | undefined) ?? null,
          offer: (args.offer as string | undefined) ?? null,
          customerRef: (args.customer_ref as string | undefined) ?? null,
          metadata:
            (args.metadata as Record<string, unknown> | undefined) ?? {},
          occurredAt:
            (args.occurred_at as string | undefined) ??
            new Date().toISOString(),
        }, args.idempotency_key as string | undefined);

        return JSON.stringify({ ok: true, economic_event_id: id });
      },
    },
    {
      name: "revenue_get_snapshot",
      description:
        "Read current revenue intelligence. With an opportunity ID, returns its economics and recent events. With an experiment ID, also returns forecast-vs-actual. Without IDs, returns the current focus opportunities.",
      category: "revenue",
      riskLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: "string" },
          experiment_id: { type: "string" },
          event_limit: { type: "number" },
        },
      },
      execute: async (args, ctx) => {
        const store = new RevenueStore(ctx.db.raw);

        const opportunityId =
          (args.opportunity_id as string | undefined) ?? null;
        const experimentId =
          (args.experiment_id as string | undefined) ?? null;
        if (!opportunityId && !experimentId) {
          const focusOpportunities =
            store.listFocusOpportunities(2);

          const priorityExperiments =
            store.listPriorityExperiments(
              focusOpportunities.map((opportunity) => opportunity.id),
              3,
            );

          return JSON.stringify({
            focus_opportunities: focusOpportunities,
            priority_experiments: priorityExperiments,
            mission_agenda: economicMissionAgenda(ctx.db.raw),
            accounting: (await import("../revenue/economic-state.js")).economicState(ctx.db.raw),
          });
        }

        const experiment = experimentId
          ? store.getExperiment(experimentId)
          : null;

        if (experimentId && !experiment) {
          return JSON.stringify({ ok: false, error: "experiment_not_found" });
        }

        if (experiment && opportunityId && experiment.opportunityId !== opportunityId) {
          return JSON.stringify({ok:false,error:"experiment_opportunity_mismatch"});
        }

        const resolvedOpportunityId =
          opportunityId ?? experiment?.opportunityId ?? null;

        if (!resolvedOpportunityId) {
          return JSON.stringify({ ok: false, error: "opportunity_id_required" });
        }

        const opportunity = store.getOpportunity(resolvedOpportunityId);

        if (!opportunity) {
          return JSON.stringify({ ok: false, error: "opportunity_not_found" });
        }

        return JSON.stringify({
          opportunity,
          economics: store.getOpportunityEconomics(resolvedOpportunityId),
          recent_events: store.listEconomicEvents(
            resolvedOpportunityId,
            Math.min(Math.max(Number(args.event_limit ?? 20), 1), 100),
          ),
          experiment,
          experiment_review: experimentId ? store.getExperimentReview(experimentId) : null,
          forecast_vs_actual: experimentId
            ? store.getForecastVsActual(experimentId)
            : null,
        });
      },
    },
    {
      name:"revenue_plan_capital",
      description:"Compare bounded experiment allocations against persisted budgets, capital, profiles and actual historical costs. Supplied limits can constrain a proposal but never grant spending authority. Returns preserve_capital when no eligible use exists.",
      category:"revenue",riskLevel:"safe",
      parameters:{type:"object",properties:{decision_id:{type:"string",description:"Optional immutable proposal comparison ID. Reuse on retry; not proof of execution."},proposal:{type:"object",description:"JSON with candidates, limits and policy for planCapitalAllocation; this is decision support, not configuration or permission."}},required:["proposal"]},
      execute:async(args,ctx)=>{
        const proposal=args.proposal as Parameters<typeof import('../revenue/capital-allocation.js').planCapitalAllocation> extends [unknown,infer C,infer L,infer P]?{candidates:C;limits:L;policy:P}:never;
        const {planCapitalAllocation,recordAllocationComparison}=await import('../revenue/capital-allocation.js');
        return JSON.stringify(args.decision_id?recordAllocationComparison(ctx.db.raw,args.decision_id as string,proposal.candidates,proposal.limits,proposal.policy):
          planCapitalAllocation(ctx.db.raw,proposal.candidates,proposal.limits,proposal.policy));
      },
    },
    {
      name:"revenue_profitability",description:"Read evidence-derived profitability state, calibration, drift and policy ceilings. No state promotion, spending or permission changes.",
      category:"revenue",riskLevel:"safe",
      parameters:{type:"object",properties:{opportunity_id:{type:"string"}},required:["opportunity_id"]},
      execute:async(args,ctx)=>{
        const {profitabilitySnapshot}=await import('../revenue/profitability.js');
        return JSON.stringify(profitabilitySnapshot(ctx.db.raw,args.opportunity_id as string));
      },
    },
    {
      name:'security_alternatives',description:'Evaluate up to sixteen genuinely different action scopes against existing trusted reviews. Preserves the objective; cannot create evidence, grant permissions, change root policy or execute actions. Approval here does not replace budget, risk, context, provider and data gates at execution.',
      category:'revenue',riskLevel:'safe',parameters:{type:'object',properties:{objective_id:{type:'string'},blocked:{type:'object'},candidates:{type:'array',maxItems:16,items:{type:'object'}}},required:['objective_id','blocked','candidates'],additionalProperties:false},
      execute:async(args,ctx)=>{
        if(typeof args.objective_id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(args.objective_id)||Object.keys(args).some(k=>!['objective_id','blocked','candidates'].includes(k)))throw Error('Bounded objective and scopes required');
        const {selectSafeAlternative}=await import('../security/action-gate.js');
        const selected=selectSafeAlternative(ctx.db.raw,args.blocked as import('../security/action-gate.js').ActionScope,args.candidates as import('../security/action-gate.js').ActionScope[]);
        return JSON.stringify({objectiveId:args.objective_id,selected,executionAuthorized:false,next:selected?'Re-evaluate every applicable execution gate':'Continue bounded local research or simulation without external effects; request only genuinely missing external evidence'});
      },
    },
    {
      name:"revenue_compare_outcomes",description:"Read recorded allocation alternatives against available attributed results. Missing counterfactuals remain unknown; no real or paper order is executed.",
      category:"revenue",riskLevel:"safe",parameters:{type:"object",properties:{decision_id:{type:"string"}},required:["decision_id"]},
      execute:async(args,ctx)=>{const {observeAllocationComparison}=await import('../revenue/capital-allocation.js');return JSON.stringify(observeAllocationComparison(ctx.db.raw,args.decision_id as string));},
    },
    {
      name:'revenue_compare_strategies',description:'Compare a validated champion with at most ten challengers using existing registered profitability confidence bounds, observed samples and declared resource comparability. Optional comparison_kind=pricing additionally requires comparable reconciled business cohorts and recommends controlled replication only. No strategy switch, price change, capital release or execution.',
      category:'revenue',riskLevel:'safe',parameters:{type:'object',properties:{comparison_kind:{type:'string',enum:['strategy','pricing']},champion_id:{type:'string'},challengers:{type:'array',items:{type:'object',properties:{opportunityId:{type:'string'},switchingCostCents:{type:'integer'}},required:['opportunityId','switchingCostCents']}}},required:['champion_id','challengers']},
      execute:async(args,ctx)=>{
        if(args.comparison_kind!==undefined&&!['strategy','pricing'].includes(args.comparison_kind as string))throw new Error('Invalid comparison kind');
        const {compareProfitabilityAlternatives,comparePricingAlternatives}=await import('../revenue/strategy-comparison.js');
        return JSON.stringify((args.comparison_kind==='pricing'?comparePricingAlternatives:compareProfitabilityAlternatives)(ctx.db.raw,args.champion_id as string,args.challengers as {opportunityId:string;switchingCostCents:number}[]));
      },
    },
    {
      name:"revenue_paper_profit",description:"Bind future local paper positions or arbitrage candidate IDs (kind=arbitrage) to a running experiment with an immutable start forecast before executing them, or reconcile closed paper results. Always PAPER, never live proof or capital credit. Reconciliation needs a terminal experiment with no unresolved costs; legacy arbitrage reports without complete settlement amounts cannot be upgraded.",
      category:"revenue",riskLevel:"safe",parameters:{type:"object",properties:{action:{type:"string",enum:['bind','reconcile']},experiment_id:{type:"string"},position_ids:{type:'array',items:{type:'string'}},comparison_basis:{type:'string'},kind:{type:'string',enum:['portfolio','arbitrage']}},required:['action','experiment_id']},
      execute:async(args,ctx)=>{
        const {bindPaperProfit,reconcilePaperProfit}=await import('../revenue/paper-profit.js');
        if(args.action==='bind')return JSON.stringify(bindPaperProfit(ctx.db.raw,args.experiment_id as string,args.position_ids as string[],args.comparison_basis as string,args.kind as 'portfolio'|'arbitrage'|undefined));
        if(args.action==='reconcile')return JSON.stringify(await reconcilePaperProfit(ctx.db.raw,args.experiment_id as string));
        throw new Error('Invalid paper reconciliation action');
      },
    },
  ];
  // These legacy adapters cannot yet reserve a verified total price and reconcile it.
  // Guard the executor itself, including callers which bypass executeTool.
  const unpriced = new Set(["topup_credits", "transfer_credits", "fund_child", "create_sandbox",
    "spawn_child", "register_domain", "x402_fetch", "register_erc8004", "give_feedback"]);
  const guarded = tools.map(tool => !unpriced.has(tool.name) ? tool : {...tool, execute: async () => {
    // An absent capital-policy table is not spending authority. These legacy
    // paths lack atomic reservations and cannot be enabled by removing state.
    return "Blocked: Shared capital protection requires a priced, reserving and reconciling adapter for this operation.";
  }});
  return guarded.map(tool => !CONWAY_ONLY_TOOLS.has(tool.name) ? tool : {...tool,execute:async(args,ctx)=>{
    if(unpriced.has(tool.name)&&!ctx.config)return tool.execute(args,ctx);
    if(localOperation(ctx.config,ctx.conway))return 'Conway capability unavailable in local mode. Shared capital protection remains enforced.';
    return tool.execute(args,ctx);
  }});
}

/**
 * Load installed tools from the database and return as AutomatonTool[].
 * Installed tools are dynamically added from the installed_tools table.
 */
export function loadInstalledTools(db: {
  getInstalledTools: () => {
    id: string;
    name: string;
    type: string;
    config?: Record<string, unknown>;
    installedAt: string;
    enabled: boolean;
  }[];
}): AutomatonTool[] {
  try {
    const installed = db.getInstalledTools();
    return installed.map((tool) => ({
      name: tool.name,
      description: `Installed tool: ${tool.name}`,
      category: (tool.type === "mcp" ? "conway" : "vm") as ToolCategory,
      riskLevel: "caution" as RiskLevel,
      parameters: (tool.config?.parameters as Record<string, unknown>) || {
        type: "object",
        properties: {},
      },
      execute: createInstalledToolExecutor(tool),
    }));
  } catch (error) {
    logger.error(
      "Failed to load installed tools",
      error instanceof Error ? error : undefined,
    );
    return [];
  }
}

function createInstalledToolExecutor(tool: {
  name: string;
  type: string;
  config?: Record<string, unknown>;
}): AutomatonTool["execute"] {
  return async (args, ctx) => {
    if (tool.type === "mcp") {
      // MCP tools would be executed via MCP protocol
      return `MCP tool ${tool.name} invoked with args: ${JSON.stringify(args)}`;
    }
    // Generic installed tool â€” execute via sandbox shell if command is configured
    const command = tool.config?.command as string | undefined;
    if (command) {
      const result = await ctx.conway.exec(
        `${command} ${escapeShellArg(JSON.stringify(args))}`,
        30000,
      );
      return `exit_code: ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
    }
    return `Installed tool ${tool.name} has no executable command configured.`;
  };
}

/**
 * Convert AutomatonTool list to OpenAI-compatible tool definitions.
 */
export function toolsToInferenceFormat(
  tools: AutomatonTool[],
): InferenceToolDefinition[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Execute a tool call and return the result.
 * Optionally evaluates against the policy engine before execution.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  tools: AutomatonTool[],
  context: ToolContext,
  policyEngine?: PolicyEngine,
  turnContext?: {
    inputSource: InputSource | undefined;
    turnToolCallCount: number;
    sessionSpend: SpendTrackerInterface;
  },
): Promise<ToolCallResult> {
  const tool = tools.find((t) => t.name === toolName);
  const startTime = Date.now();

  if (!tool) {
    return {
      id: ulid(),
      name: toolName,
      arguments: args,
      result: "",
      durationMs: 0,
      error: `Unknown tool: ${toolName}`,
    };
  }

  try { assertNoKnownSecrets(args); }
  catch { return {id:ulid(),name:toolName,arguments:{},result:'',durationMs:Date.now()-startTime,error:'Blocked: credential material in tool arguments'}; }
  if((!policyEngine||!turnContext)&&['dangerous','forbidden'].includes(tool.riskLevel)) {
    return {id:ulid(),name:toolName,arguments:args,result:'',durationMs:Date.now()-startTime,error:'Blocked: privileged execution requires policy evaluation and audit'};
  }
  // Policy evaluation (if engine is provided)
  if (policyEngine && turnContext) {
    const request: PolicyRequest = {
      tool,
      args,
      context,
      turnContext,
    };
    const decision = policyEngine.evaluate(request);
    policyEngine.logDecision(decision);

    if (decision.action !== "allow") {
      return {
        id: ulid(),
        name: toolName,
        arguments: args,
        result: "",
        durationMs: Date.now() - startTime,
        error: `Policy denied: ${decision.reasonCode} â€” ${decision.humanMessage}`,
      };
    }
  }

  try {
    let result = await tool.execute(args, context);
    assertNoKnownSecrets(result);

    // Sanitize results from external source tools
    if (EXTERNAL_SOURCE_TOOLS.has(toolName)) {
      result = sanitizeToolResult(result);
    }

    // Record spend for financial operations
    if (turnContext && !result.startsWith("Blocked:")) {
      if (toolName === "transfer_credits") {
        const amount = args.amount_cents as number | undefined;
        if (amount && amount > 0) {
          try {
            turnContext.sessionSpend.recordSpend({
              toolName: "transfer_credits",
              amountCents: amount,
              recipient: args.to_address as string | undefined,
              category: "transfer",
            });
          } catch (error) {
            logger.error(
              "Spend tracking failed for transfer_credits",
              error instanceof Error ? error : undefined,
            );
          }
        }
      } else if (toolName === "x402_fetch") {
        // x402 payment amounts are determined by the server response,
        // but we record a nominal entry for tracking purposes
        try {
          turnContext.sessionSpend.recordSpend({
            toolName: "x402_fetch",
            amountCents: 0, // Actual amount is inside the x402 protocol
            domain: (() => {
              try {
                return new URL(args.url as string).hostname;
              } catch {
                return undefined;
              }
            })(),
            category: "x402",
          });
        } catch (error) {
          logger.error(
            "Spend tracking failed for x402_fetch",
            error instanceof Error ? error : undefined,
          );
        }
      }
    }

    return {
      id: ulid(),
      name: toolName,
      arguments: args,
      result,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      id: ulid(),
      name: toolName,
      arguments: args,
      result: "",
      durationMs: Date.now() - startTime,
      error: redactLogText(err.message || String(err)),
    };
  }
}

/** Escape a string for safe shell interpolation. */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
