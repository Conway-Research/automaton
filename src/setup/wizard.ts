import fs from "fs";
import path from "path";
import chalk from "chalk";
import type { AutomatonConfig } from "../types.js";
import type { Address } from "viem";
import { getWallet, getAutomatonDir } from "../identity/wallet.js";
import { provision } from "../identity/provision.js";
import { createConfig, saveConfig } from "../config.js";
import { writeDefaultHeartbeatConfig } from "../heartbeat/config.js";
import { showBanner } from "./banner.js";
import {
  promptRequired,
  promptMultiline,
  promptAddress,
  promptOptional,
  closePrompts,
} from "./prompts.js";
import { detectEnvironment } from "./environment.js";
import { generateSoulMd, installDefaultSkills } from "./defaults.js";
import { registerWithSAID } from "../registry/said.js";

export async function runSetupWizard(): Promise<AutomatonConfig> {
  showBanner();

  console.log(chalk.white("  First-run setup. Let's bring your automaton to life.\n"));

  // ─── 1. Generate wallet ───────────────────────────────────────
  console.log(chalk.cyan("  [1/6] Generating identity (wallet)..."));
  const { account, isNew } = await getWallet();
  if (isNew) {
    console.log(chalk.green(`  Wallet created: ${account.address}`));
  } else {
    console.log(chalk.green(`  Wallet loaded: ${account.address}`));
  }
  console.log(chalk.dim(`  Private key stored at: ${getAutomatonDir()}/wallet.json\n`));

  // ─── 2. Provision API key ─────────────────────────────────────
  console.log(chalk.cyan("  [2/6] Provisioning Conway API key (SIWE)..."));
  let apiKey = "";
  try {
    const result = await provision();
    apiKey = result.apiKey;
    console.log(chalk.green(`  API key provisioned: ${result.keyPrefix}...\n`));
  } catch (err: any) {
    console.log(chalk.yellow(`  Auto-provision failed: ${err.message}`));
    console.log(chalk.yellow("  You can enter a key manually, or press Enter to skip.\n"));
    const manual = await promptOptional("Conway API key (cnwy_k_..., optional)");
    if (manual) {
      apiKey = manual;
      // Save to config.json for loadApiKeyFromConfig()
      const configDir = getAutomatonDir();
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(
        path.join(configDir, "config.json"),
        JSON.stringify({ apiKey, walletAddress: account.address, provisionedAt: new Date().toISOString() }, null, 2),
        { mode: 0o600 },
      );
      console.log(chalk.green("  API key saved.\n"));
    }
  }

  if (!apiKey) {
    console.log(chalk.yellow("  No API key set. The automaton will have limited functionality.\n"));
  }

  // ─── 3. Interactive questions ─────────────────────────────────
  console.log(chalk.cyan("  [3/6] Setup questions\n"));

  const name = await promptRequired("What do you want to name your automaton?");
  console.log(chalk.green(`  Name: ${name}\n`));

  const genesisPrompt = await promptMultiline("Enter the genesis prompt (system prompt) for your automaton.");
  console.log(chalk.green(`  Genesis prompt set (${genesisPrompt.length} chars)\n`));

  const creatorAddress = await promptAddress("Your Ethereum wallet address (0x...)");
  console.log(chalk.green(`  Creator: ${creatorAddress}\n`));

  console.log(chalk.white("  Optional: bring your own inference provider keys (press Enter to skip)."));
  const openaiApiKey = await promptOptional("OpenAI API key (sk-..., optional)");
  if (openaiApiKey && !openaiApiKey.startsWith("sk-")) {
    console.log(chalk.yellow("  Warning: OpenAI keys usually start with sk-. Saving anyway."));
  }

  const anthropicApiKey = await promptOptional("Anthropic API key (sk-ant-..., optional)");
  if (anthropicApiKey && !anthropicApiKey.startsWith("sk-ant-")) {
    console.log(chalk.yellow("  Warning: Anthropic keys usually start with sk-ant-. Saving anyway."));
  }

  if (openaiApiKey || anthropicApiKey) {
    const providers = [
      openaiApiKey ? "OpenAI" : null,
      anthropicApiKey ? "Anthropic" : null,
    ].filter(Boolean).join(", ");
    console.log(chalk.green(`  Provider keys saved: ${providers}\n`));
  } else {
    console.log(chalk.dim("  No provider keys set. Inference will default to Conway.\n"));
  }

  // ─── 4. Detect environment ────────────────────────────────────
  console.log(chalk.cyan("  [4/6] Detecting environment..."));
  const env = detectEnvironment();
  if (env.sandboxId) {
    console.log(chalk.green(`  Conway sandbox detected: ${env.sandboxId}\n`));
  } else {
    console.log(chalk.dim(`  Environment: ${env.type} (no sandbox detected)\n`));
  }

  // ─── 5. Write config + heartbeat + SOUL.md + skills ───────────
  console.log(chalk.cyan("  [5/6] Writing configuration..."));

  const config = createConfig({
    name,
    genesisPrompt,
    creatorAddress: creatorAddress as Address,
    registeredWithConway: !!apiKey,
    sandboxId: env.sandboxId,
    walletAddress: account.address,
    apiKey,
    openaiApiKey: openaiApiKey || undefined,
    anthropicApiKey: anthropicApiKey || undefined,
  });

  saveConfig(config);
  console.log(chalk.green("  automaton.json written"));

  writeDefaultHeartbeatConfig();
  console.log(chalk.green("  heartbeat.yml written"));

  // constitution.md (immutable — copied from repo, protected from self-modification)
  const automatonDir = getAutomatonDir();
  const constitutionSrc = path.join(process.cwd(), "constitution.md");
  const constitutionDst = path.join(automatonDir, "constitution.md");
  if (fs.existsSync(constitutionSrc)) {
    fs.copyFileSync(constitutionSrc, constitutionDst);
    fs.chmodSync(constitutionDst, 0o444); // read-only
    console.log(chalk.green("  constitution.md installed (read-only)"));
  }

  // SOUL.md
  const soulPath = path.join(automatonDir, "SOUL.md");
  fs.writeFileSync(soulPath, generateSoulMd(name, account.address, creatorAddress, genesisPrompt), { mode: 0o600 });
  console.log(chalk.green("  SOUL.md written"));

  // Default skills
  const skillsDir = config.skillsDir || "~/.automaton/skills";
  installDefaultSkills(skillsDir);
  console.log(chalk.green("  Default skills installed (conway-compute, conway-payments, survival)\n"));

  // ─── 5b. SAID Protocol — on-chain Solana identity ────────────
  console.log(chalk.cyan("  Registering Solana identity with SAID Protocol..."));
  try {
    const { Keypair } = await import("@solana/web3.js");
    const bs58 = await import("bs58");
    const solanaKeypair = Keypair.generate();
    const solanaWallet = solanaKeypair.publicKey.toBase58();

    // Save Solana wallet to automaton dir
    const solanaWalletPath = path.join(automatonDir, "solana-wallet.json");
    fs.writeFileSync(
      solanaWalletPath,
      JSON.stringify({ publicKey: solanaWallet, secretKey: bs58.default.encode(solanaKeypair.secretKey), createdAt: new Date().toISOString() }, null, 2),
      { mode: 0o600 }
    );

    const saidReg = await registerWithSAID({
      wallet: solanaWallet,
      name,
      description: `Conway automaton — ${genesisPrompt.slice(0, 100)}`,
      skills: ["self-modification", "replication", "code-execution", "x402-payments"],
    });

    // Persist SAID wallet in config
    config.saidWallet = solanaWallet;
    saveConfig(config);

    console.log(chalk.green(`  SAID identity registered: ${saidReg.saidProfileUrl}\n`));
  } catch (err: any) {
    console.log(chalk.dim(`  SAID registration skipped: ${err.message}\n`));
  }

  // ─── 6. Funding guidance ──────────────────────────────────────
  console.log(chalk.cyan("  [6/6] Funding\n"));
  showFundingPanel(account.address);

  closePrompts();

  return config;
}

function showFundingPanel(address: string): void {
  const short = `${address.slice(0, 6)}...${address.slice(-5)}`;
  const w = 58;
  const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - s.length));

  console.log(chalk.cyan(`  ${"╭" + "─".repeat(w) + "╮"}`));
  console.log(chalk.cyan(`  │${pad("  Fund your automaton", w)}│`));
  console.log(chalk.cyan(`  │${" ".repeat(w)}│`));
  console.log(chalk.cyan(`  │${pad(`  Address: ${short}`, w)}│`));
  console.log(chalk.cyan(`  │${" ".repeat(w)}│`));
  console.log(chalk.cyan(`  │${pad("  1. Transfer Conway credits", w)}│`));
  console.log(chalk.cyan(`  │${pad("     conway credits transfer <address> <amount>", w)}│`));
  console.log(chalk.cyan(`  │${" ".repeat(w)}│`));
  console.log(chalk.cyan(`  │${pad("  2. Send USDC on Base directly to the address above", w)}│`));
  console.log(chalk.cyan(`  │${" ".repeat(w)}│`));
  console.log(chalk.cyan(`  │${pad("  3. Fund via Conway Cloud dashboard", w)}│`));
  console.log(chalk.cyan(`  │${pad("     https://app.conway.tech", w)}│`));
  console.log(chalk.cyan(`  │${" ".repeat(w)}│`));
  console.log(chalk.cyan(`  │${pad("  The automaton will start now. Fund it anytime —", w)}│`));
  console.log(chalk.cyan(`  │${pad("  the survival system handles zero-credit gracefully.", w)}│`));
  console.log(chalk.cyan(`  ${"╰" + "─".repeat(w) + "╯"}`));
  console.log("");
}
