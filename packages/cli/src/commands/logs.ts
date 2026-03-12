/**
 * automaton-cli logs
 *
 * View the automaton's turn log.
 */

import { loadConfig, resolvePath } from "@conway/automaton/config.js";
import { createDatabase } from "@conway/automaton/state/database.js";

const args = process.argv.slice(3);
let limit = 20;
const tailIdx = args.indexOf("--tail");
if (tailIdx !== -1 && args[tailIdx + 1]) {
  limit = parseInt(args[tailIdx + 1], 10) || 20;
}

const config = loadConfig();
if (!config) {
  console.log("No automaton configuration found.");
  process.exit(1);
}

const dbPath = resolvePath(config.dbPath);
const db = createDatabase(dbPath);

const turns = db.getRecentTurns(limit);

if (turns.length === 0) {
  console.log("No turns recorded yet.");
} else {
  for (const turn of turns) {
    console.log(`\n--- Turn ${turn.id} [${turn.timestamp}] state:${turn.state} ---`);
    if (turn.input) {
      console.log(`Input (${turn.inputSource}): ${turn.input.slice(0, 200)}`);
    }
    console.log(`Thinking: ${turn.thinking.slice(0, 500)}`);
    if (turn.toolCalls.length > 0) {
      console.log("Tools:");
      for (const tc of turn.toolCalls) {
        console.log(
          `  ${tc.name}: ${tc.error ? `ERROR: ${tc.error}` : tc.result.slice(0, 100)}`,
        );
      }
    }
    console.log(
      `Tokens: ${turn.tokenUsage.totalTokens} | Cost: $${(turn.costCents / 100).toFixed(4)}`,
    );
  }
}

db.close();
