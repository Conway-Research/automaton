/**
 * Interactive Model Picker
 *
 * Presents a numbered list of available models and lets the user
 * pick one to set as the active inference model.
 *
 * Usage: automaton --pick-model
 */

import chalk from "chalk";
import { loadConfig, saveConfig, resolvePath } from "../config.js";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { discoverOllamaModels } from "../ollama/discover.js";
import type { ModelEntry } from "../types.js";
import { promptOptional, closePrompts } from "./prompts.js";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  conway: "Conway",
  ollama: "Ollama",
  other: "Other",
};

export async function runModelPicker(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(chalk.red("  Automaton is not configured. Run: automaton --setup"));
    return;
  }

  const dbPath = resolvePath(config.dbPath);
  const db = createDatabase(dbPath);

  // Seed static baseline + discover Ollama models
  const registry = new ModelRegistry(db.raw);
  registry.initialize();

  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl;
  if (ollamaBaseUrl) {
    console.log(chalk.dim(`  Checking Ollama at ${ollamaBaseUrl}...`));
    await discoverOllamaModels(ollamaBaseUrl, db.raw);
  }

  const models = registry.getAll().filter((m) => m.enabled);

  if (models.length === 0) {
    console.log(chalk.yellow("  No models available in registry."));
    db.close();
    closePrompts();
    return;
  }

  console.log(chalk.cyan("\n  Available Models\n"));
  printModelTable(models, config.inferenceModel);

  console.log("");
  const input = await promptOptional("Enter model number (or press Enter to cancel)");
  closePrompts();

  if (!input) {
    console.log(chalk.dim("  Cancelled."));
    db.close();
    return;
  }

  const idx = parseInt(input, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= models.length) {
    console.log(chalk.red(`  Invalid selection: "${input}"`));
    db.close();
    return;
  }

  const selected = models[idx];
  config.inferenceModel = selected.modelId;
  if (config.modelStrategy) {
    config.modelStrategy.inferenceModel = selected.modelId;
  }
  saveConfig(config);

  console.log(chalk.green(`\n  Active model set to: ${selected.modelId} (${selected.displayName})`));
  console.log(chalk.dim("  Restart the automaton for the change to take effect.\n"));

  db.close();
}

function printModelTable(models: ModelEntry[], currentModelId: string): void {
  const numWidth = String(models.length).length;

  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const num = String(i + 1).padStart(numWidth);
    const provider = (PROVIDER_LABEL[m.provider] || m.provider).padEnd(9);
    const cost = m.costPer1kInput === 0
      ? chalk.green("free     ")
      : chalk.dim(`$${(m.costPer1kInput / 100 / 1000 * 1_000_000).toFixed(2)}/M in`);
    const active = m.modelId === currentModelId ? chalk.green(" ◀ active") : "";
    const tools = m.supportsTools ? "" : chalk.dim(" (no tools)");

    console.log(
      `  ${chalk.white(num + ".")} ${chalk.cyan(m.modelId.padEnd(32))} ${chalk.dim(provider)} ${cost}${tools}${active}`,
    );
  }
}
