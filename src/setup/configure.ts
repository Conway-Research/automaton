/**
 * Interactive Configuration Editor
 *
 * Menu-driven editor for all config sections. Complements --setup
 * (first-run) and --pick-model (model selection only) by letting
 * users update individual settings without re-running the full wizard.
 *
 * Usage: automaton --configure
 */

import readline from "readline";
import chalk from "chalk";
import { loadConfig, saveConfig, resolvePath } from "../config.js";
import { DEFAULT_TREASURY_POLICY, DEFAULT_MODEL_STRATEGY_CONFIG } from "../types.js";
import type { AutomatonConfig, ModelStrategyConfig, TreasuryPolicy, ModelEntry } from "../types.js";
import { closePrompts } from "./prompts.js";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";

// ─── Readline helpers ─────────────────────────────────────────────

let rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => getRL().question(prompt, (a) => resolve(a.trim())));
}

/** Prompt for an optional string. Enter = keep current. "-" = clear. */
async function askString(
  label: string,
  current: string | undefined,
  required = false,
): Promise<string | undefined> {
  const display = current ? maskSecret(current) : chalk.dim("(not set)");
  const hint = required
    ? chalk.dim(" (Enter to keep)")
    : chalk.dim(" (Enter to keep, - to clear)");
  const raw = await ask(`  ${chalk.white("→")} ${label} ${chalk.dim("[" + display + "]")}${hint}: `);

  if (raw === "") return current;
  if (!required && raw === "-") return undefined;
  return raw;
}

/** Prompt for a required string. Enter = keep current. */
async function askRequiredString(label: string, current: string): Promise<string> {
  const result = await askString(label, current, true);
  return result ?? current;
}

/** Prompt for a number. Enter = keep current. */
async function askNumber(label: string, current: number): Promise<number> {
  const raw = await ask(
    `  ${chalk.white("→")} ${label} ${chalk.dim("[" + current + "]")}${chalk.dim(" (Enter to keep)")}: `,
  );
  if (raw === "") return current;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0) {
    console.log(chalk.yellow(`  Invalid number, keeping ${current}`));
    return current;
  }
  return n;
}

/** Prompt for a boolean. Enter = keep current. */
async function askBool(label: string, current: boolean): Promise<boolean> {
  const display = current ? chalk.green("yes") : chalk.dim("no");
  const raw = await ask(
    `  ${chalk.white("→")} ${label} ${chalk.dim("[")}${display}${chalk.dim("]")}${chalk.dim(" (y/n, Enter to keep)")}: `,
  );
  if (raw === "") return current;
  if (raw === "y" || raw === "yes" || raw === "1" || raw === "true") return true;
  if (raw === "n" || raw === "no" || raw === "0" || raw === "false") return false;
  console.log(chalk.yellow("  Invalid input, keeping current value"));
  return current;
}

/** Prompt for a choice from a fixed set. */
async function askChoice<T extends string>(
  label: string,
  options: T[],
  current: T,
): Promise<T> {
  const display = options.map((o) => (o === current ? chalk.green(o) : chalk.dim(o))).join(" | ");
  const raw = await ask(`  ${chalk.white("→")} ${label} [${display}]${chalk.dim(" (Enter to keep)")}: `);
  if (raw === "") return current;
  if ((options as string[]).includes(raw)) return raw as T;
  console.log(chalk.yellow(`  Invalid choice, keeping "${current}"`));
  return current;
}

// ─── Model picker ─────────────────────────────────────────────────

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  conway: "Conway",
  ollama: "Ollama",
  other: "Other",
};

function printModelTable(models: ModelEntry[], currentModelId: string): void {
  const numWidth = String(models.length).length;
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const num = String(i + 1).padStart(numWidth);
    const provider = (PROVIDER_LABEL[m.provider] || m.provider).padEnd(9);
    const cost =
      m.costPer1kInput === 0
        ? chalk.green("free     ")
        : chalk.dim(`$${((m.costPer1kInput / 100 / 1000) * 1_000_000).toFixed(2)}/M in`);
    const active = m.modelId === currentModelId ? chalk.green(" ◀ active") : "";
    const tools = m.supportsTools ? "" : chalk.dim(" (no tools)");
    console.log(
      `  ${chalk.white(num + ".")} ${chalk.cyan(m.modelId.padEnd(36))} ${chalk.dim(provider)} ${cost}${tools}${active}`,
    );
  }
}

async function pickFromList(
  label: string,
  current: string,
  models: ModelEntry[],
): Promise<string> {
  if (models.length === 0) {
    return askRequiredString(label, current);
  }
  console.log(chalk.cyan(`\n  ── Select ${label} ──\n`));
  printModelTable(models, current);
  console.log("");
  const raw = await ask(
    `  ${chalk.white("→")} Enter number ${chalk.dim("(Enter to keep " + current + ")")}: `,
  );
  if (raw === "") return current;
  const idx = parseInt(raw, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= models.length) {
    console.log(chalk.yellow(`  Invalid, keeping "${current}"`));
    return current;
  }
  return models[idx].modelId;
}

// ─── Display helpers ──────────────────────────────────────────────

/** Mask secrets: show first 8 chars + "***" + last 4 chars. */
function maskSecret(s: string | undefined): string {
  if (!s) return chalk.dim("(not set)");
  if (s.length <= 12) return s.slice(0, 4) + "***";
  return s.slice(0, 8) + "***" + s.slice(-4);
}

function dim(v: string | number | boolean | undefined): string {
  if (v === undefined || v === null || v === "") return chalk.dim("(not set)");
  return chalk.dim(String(v));
}

function val(v: string | number | boolean | undefined): string {
  if (v === undefined || v === null || v === "") return chalk.dim("(not set)");
  if (typeof v === "boolean") return v ? chalk.green("yes") : chalk.red("no");
  return chalk.white(String(v));
}

// ─── Main menu ────────────────────────────────────────────────────

function printMainMenu(config: AutomatonConfig): void {
  const providers = [
    config.openaiApiKey ? "OpenAI" : null,
    config.anthropicApiKey ? "Anthropic" : null,
    config.ollamaBaseUrl ? "Ollama" : null,
    "Conway",
  ].filter(Boolean).join(", ");

  const strategy = config.modelStrategy ?? DEFAULT_MODEL_STRATEGY_CONFIG;

  console.log(chalk.cyan("  ┌────────────────────────────────────────────┐"));
  console.log(chalk.cyan("  │  Configure Automaton                        │"));
  console.log(chalk.cyan("  └────────────────────────────────────────────┘"));
  console.log("");
  console.log(`  ${chalk.white("1.")} Inference Providers   ${dim(providers)}`);
  console.log(`  ${chalk.white("2.")} Model Strategy        ${dim(config.inferenceModel)} / ${dim(strategy.maxTokensPerTurn + " tokens")}`);
  console.log(`  ${chalk.white("3.")} Treasury Policy       ${dim("max transfer: " + (config.treasuryPolicy?.maxSingleTransferCents ?? DEFAULT_TREASURY_POLICY.maxSingleTransferCents) + "¢")}`);
  console.log(`  ${chalk.white("4.")} General               ${dim(config.name)} / ${dim(config.logLevel)}`);
  console.log("");
  console.log(chalk.dim("  q  Quit"));
  console.log("");
}

// ─── Section: Inference Providers ────────────────────────────────

async function configureProviders(config: AutomatonConfig): Promise<void> {
  console.log(chalk.cyan("\n  ── Inference Providers ─────────────────────────\n"));
  console.log(chalk.dim("  Press Enter to keep the current value. Type - to clear an optional field.\n"));

  config.conwayApiKey = await askRequiredString(
    "Conway API key",
    config.conwayApiKey,
  );

  config.openaiApiKey = await askString("OpenAI API key  (sk-...)", config.openaiApiKey) || undefined;
  config.anthropicApiKey = await askString("Anthropic API key  (sk-ant-...)", config.anthropicApiKey) || undefined;
  config.ollamaBaseUrl = await askString("Ollama base URL  (http://localhost:11434)", config.ollamaBaseUrl) || undefined;

  console.log("");
}

// ─── Section: Model Strategy ──────────────────────────────────────

async function configureModelStrategy(config: AutomatonConfig): Promise<void> {
  console.log(chalk.cyan("\n  ── Model Strategy ──────────────────────────────\n"));

  // Load available models from registry + Ollama
  const dbPath = resolvePath(config.dbPath);
  const db = createDatabase(dbPath);
  const registry = new ModelRegistry(db.raw);
  registry.initialize();

  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl;
  if (ollamaBaseUrl) {
    console.log(chalk.dim(`  Checking Ollama at ${ollamaBaseUrl}...`));
    const { discoverOllamaModels } = await import("../ollama/discover.js");
    await discoverOllamaModels(ollamaBaseUrl, db.raw);
  }

  const models = registry.getAll().filter((m) => m.enabled);
  db.close();

  const s: ModelStrategyConfig = {
    ...DEFAULT_MODEL_STRATEGY_CONFIG,
    ...(config.modelStrategy ?? {}),
  };

  config.inferenceModel = await pickFromList("Active model", config.inferenceModel, models);
  s.inferenceModel = config.inferenceModel;
  s.lowComputeModel = await pickFromList("Low-compute fallback", s.lowComputeModel, models);
  s.criticalModel = await pickFromList("Critical fallback", s.criticalModel, models);


  const maxTokens = await askNumber("Max tokens per turn", s.maxTokensPerTurn);
  s.maxTokensPerTurn = maxTokens;
  config.maxTokensPerTurn = maxTokens;

  s.hourlyBudgetCents = await askNumber(
    "Hourly inference budget (cents, 0 = unlimited)",
    s.hourlyBudgetCents,
  );
  s.sessionBudgetCents = await askNumber(
    "Session inference budget (cents, 0 = unlimited)",
    s.sessionBudgetCents,
  );
  s.perCallCeilingCents = await askNumber(
    "Per-call ceiling (cents, 0 = unlimited)",
    s.perCallCeilingCents,
  );
  s.enableModelFallback = await askBool("Enable model fallback", s.enableModelFallback);

  config.modelStrategy = s;
  console.log("");
}

// ─── Section: Treasury Policy ─────────────────────────────────────

async function configureTreasury(config: AutomatonConfig): Promise<void> {
  console.log(chalk.cyan("\n  ── Treasury Policy ─────────────────────────────\n"));
  console.log(chalk.dim("  All values are in cents (100 cents = $1.00).\n"));

  const t: TreasuryPolicy = {
    ...DEFAULT_TREASURY_POLICY,
    ...(config.treasuryPolicy ?? {}),
  };

  t.maxSingleTransferCents = await askNumber("Max single transfer", t.maxSingleTransferCents);
  t.maxHourlyTransferCents = await askNumber("Max hourly transfers", t.maxHourlyTransferCents);
  t.maxDailyTransferCents = await askNumber("Max daily transfers", t.maxDailyTransferCents);
  t.minimumReserveCents = await askNumber("Minimum reserve", t.minimumReserveCents);
  t.maxX402PaymentCents = await askNumber("Max x402 payment", t.maxX402PaymentCents);
  t.maxInferenceDailyCents = await askNumber("Max daily inference spend", t.maxInferenceDailyCents);
  t.requireConfirmationAboveCents = await askNumber(
    "Require confirmation above",
    t.requireConfirmationAboveCents,
  );

  config.treasuryPolicy = t;
  console.log("");
}

// ─── Section: General ─────────────────────────────────────────────

async function configureGeneral(config: AutomatonConfig): Promise<void> {
  console.log(chalk.cyan("\n  ── General ─────────────────────────────────────\n"));

  config.name = await askRequiredString("Agent name", config.name);
  config.logLevel = await askChoice(
    "Log level",
    ["debug", "info", "warn", "error"] as const,
    config.logLevel,
  );
  config.maxChildren = await askNumber("Max child automatons", config.maxChildren);
  config.socialRelayUrl = (await askString("Social relay URL", config.socialRelayUrl)) || undefined;

  console.log("");
}

// ─── Entry point ──────────────────────────────────────────────────

export async function runConfigure(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(chalk.red("  Automaton is not configured. Run: automaton --setup\n"));
    return;
  }

  let running = true;
  while (running) {
    printMainMenu(config);

    const choice = await ask(`  ${chalk.white("→")} Choice: `);

    switch (choice) {
      case "1":
        await configureProviders(config);
        saveConfig(config);
        console.log(chalk.green("  ✓ Providers saved.\n"));
        break;
      case "2":
        await configureModelStrategy(config);
        saveConfig(config);
        console.log(chalk.green("  ✓ Model strategy saved.\n"));
        break;
      case "3":
        await configureTreasury(config);
        saveConfig(config);
        console.log(chalk.green("  ✓ Treasury policy saved.\n"));
        break;
      case "4":
        await configureGeneral(config);
        saveConfig(config);
        console.log(chalk.green("  ✓ General settings saved.\n"));
        break;
      case "q":
      case "":
        running = false;
        break;
      default:
        console.log(chalk.yellow(`  Unknown option: "${choice}". Enter 1-4 or q.\n`));
    }
  }

  if (rl) { rl.close(); rl = null; }
  closePrompts();
  console.log(chalk.dim("  Done. Restart the automaton to apply changes.\n"));
}
