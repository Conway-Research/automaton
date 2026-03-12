/**
 * automaton-cli status
 *
 * Show the current status of an automaton.
 */

import { loadConfig, resolvePath } from "@conway/automaton/config.js";
import { createDatabase } from "@conway/automaton/state/database.js";

const config = loadConfig();
if (!config) {
  console.log("No automaton configuration found.");
  process.exit(1);
}

const dbPath = resolvePath(config.dbPath);
const db = createDatabase(dbPath);

const state = db.getAgentState();
const turnCount = db.getTurnCount();
const tools = db.getInstalledTools();
const heartbeats = db.getHeartbeatEntries();
const recentTurns = db.getRecentTurns(5);

console.log(`
=== ${config.name} ===
Address:    ${config.walletAddress}
Creator:    ${config.creatorAddress}
Sandbox:    ${config.sandboxId}
State:      ${state}
Turns:      ${turnCount}
Tools:      ${tools.length} installed
Heartbeats: ${heartbeats.filter((h) => h.enabled).length} active
Model:      ${config.inferenceModel}
`);

if (recentTurns.length > 0) {
  console.log("Recent activity:");
  for (const turn of recentTurns) {
    const tools = turn.toolCalls.map((t) => t.name).join(", ");
    console.log(
      `  [${turn.timestamp}] ${turn.thinking.slice(0, 80)}...${tools ? ` (tools: ${tools})` : ""}`,
    );
  }
}

db.close();
