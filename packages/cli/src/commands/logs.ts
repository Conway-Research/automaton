/**
 * automaton-cli logs
 *
 * View the automaton's turn log.
 */

import chalk from "chalk";
import { loadConfig, resolvePath } from "@conway/automaton/config.js";
import { createDatabase } from "@conway/automaton/state/database.js";

const accent = chalk.rgb(131, 127, 255);

const args = process.argv.slice(3);
let limit = 20;
const tailIdx = args.indexOf("--tail");
if (tailIdx !== -1 && args[tailIdx + 1]) {
  limit = parseInt(args[tailIdx + 1], 10) || 20;
}

const config = loadConfig();
if (!config) {
  console.log(chalk.red("No automaton configuration found."));
  process.exit(1);
}

const dbPath = resolvePath(config.dbPath);
const db = createDatabase(dbPath);

const turns = db.getRecentTurns(limit);

function stateColor(state: string): string {
  switch (state) {
    case "normal": return chalk.green(state);
    case "low_compute": return chalk.yellow(state);
    case "critical": return chalk.red(state);
    case "dead": return chalk.gray(state);
    default: return chalk.white(state);
  }
}

const divider = chalk.dim("─".repeat(72));

if (turns.length === 0) {
  console.log(chalk.dim("No turns recorded yet."));
} else {
  console.log(accent.bold(`\nShowing last ${turns.length} turn(s)\n`));
  for (const turn of turns) {
    console.log(divider);
    console.log(
      accent.bold(`Turn #${turn.id}`) +
      chalk.dim(`  ${turn.timestamp}  `) +
      stateColor(turn.state)
    );

    if (turn.input) {
      console.log(accent("▸ Input") + chalk.dim(` [${turn.inputSource}]`) + "  " + turn.input.slice(0, 200));
    }

    console.log(chalk.dim("▸ Thinking  ") + chalk.white(turn.thinking.slice(0, 500)));

    if (turn.toolCalls.length > 0) {
      console.log(accent("▸ Tools"));
      for (const tc of turn.toolCalls) {
        if (tc.error) {
          console.log("  " + chalk.red(`✗ ${tc.name}`) + "  " + chalk.red(tc.error.slice(0, 100)));
        } else {
          console.log("  " + chalk.green(`✓ ${tc.name}`) + "  " + chalk.dim(tc.result.slice(0, 100)));
        }
      }
    }

    console.log(
      chalk.yellow(`tokens: ${turn.tokenUsage.totalTokens}`) +
      chalk.dim("  |  ") +
      chalk.yellow(`cost: $${(turn.costCents / 100).toFixed(4)}`)
    );
  }
  console.log(divider);
}

db.close();
