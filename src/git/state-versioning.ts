import os from "node:os";
/**
 * State Versioning
 *
 * Version control the automaton's own state files (~/.automaton/).
 * Every self-modification triggers a git commit with a descriptive message.
 * The automaton's entire identity history is version-controlled and replayable.
 */

import type { ConwayClient, AutomatonDatabase } from "../types.js";
import { gitInit, gitCommit, gitStatus, gitLog } from "./tools.js";

const AUTOMATON_DIR = "~/.automaton";

// An ignore file cannot protect secrets that were already tracked. Check both
// the index and unignored working files before any state commit, including old repos.
async function assertStateFilesSafe(conway: ConwayClient, dir: string): Promise<void> {
  const result = await conway.exec("git ls-files --cached --others --exclude-standard -z", 10000, dir);
  if (result.exitCode !== 0) throw new Error("State file inventory unavailable");
  for (const file of result.stdout.split("\0").filter(Boolean)) {
    if (/(^|\/)(automaton\.json|wallet\.json|config\.json|state\.db(?:-wal|-shm)?|\.env(?:\..*)?)$/i.test(file)) {
      throw new Error("Sensitive state files cannot be versioned");
    }
  }
}

function resolveHome(p: string): string {
  const home = process.env.HOME || os.homedir();
  if (p.startsWith("~")) {
    return `${home}${p.slice(1)}`;
  }
  return p;
}

/**
 * Initialize git repo for the automaton's state directory.
 * Creates .gitignore to exclude sensitive files.
 */
export async function initStateRepo(
  conway: ConwayClient,
): Promise<void> {
  const dir = resolveHome(AUTOMATON_DIR);

  // Check if already initialized
  const checkResult = await conway.exec(
    "git rev-parse --is-inside-work-tree",
    5000,
    dir,
  );

  if (checkResult.exitCode === 0 && checkResult.stdout.trim() === "true") {
    await assertStateFilesSafe(conway, dir);
    return;
  }

  // Initialize
  await gitInit(conway, dir);

  // Create .gitignore for sensitive files
  const gitignore = `# Sensitive files - never commit
wallet.json
config.json
automaton.json
.env
.env.*
state.db
state.db-wal
state.db-shm
logs/
*.log
*.err
`;

  await conway.writeFile(`${dir}/.gitignore`, gitignore);

  // Configure git user
  await conway.exec(`git config user.name "Automaton"`, 5000, dir);
  await conway.exec(`git config user.email "automaton@conway.tech"`, 5000, dir);

  // Initial commit
  await assertStateFilesSafe(conway, dir);
  await gitCommit(conway, dir, "genesis: automaton state repository initialized");
}

/**
 * Commit a state change with a descriptive message.
 * Called after any self-modification.
 */
export async function commitStateChange(
  conway: ConwayClient,
  description: string,
  category: string = "state",
): Promise<string> {
  const dir = resolveHome(AUTOMATON_DIR);

  // Check if there are changes
  await assertStateFilesSafe(conway, dir);
  const status = await gitStatus(conway, dir);
  if (status.clean) {
    return "No changes to commit";
  }

  const message = `${category}: ${description}`;
  const result = await gitCommit(conway, dir, message);
  return result;
}

/**
 * Commit after a SOUL.md update.
 */
export async function commitSoulUpdate(
  conway: ConwayClient,
  description: string,
): Promise<string> {
  return commitStateChange(conway, description, "soul");
}

/**
 * Commit after a skill installation or removal.
 */
export async function commitSkillChange(
  conway: ConwayClient,
  skillName: string,
  action: "install" | "remove" | "update",
): Promise<string> {
  return commitStateChange(
    conway,
    `${action} skill: ${skillName}`,
    "skill",
  );
}

/**
 * Commit after heartbeat config change.
 */
export async function commitHeartbeatChange(
  conway: ConwayClient,
  description: string,
): Promise<string> {
  return commitStateChange(conway, description, "heartbeat");
}

/**
 * Commit after config change.
 */
export async function commitConfigChange(
  conway: ConwayClient,
  description: string,
): Promise<string> {
  return commitStateChange(conway, description, "config");
}

/**
 * Get the state repo history.
 */
export async function getStateHistory(
  conway: ConwayClient,
  limit: number = 20,
) {
  const dir = resolveHome(AUTOMATON_DIR);
  return gitLog(conway, dir, limit);
}
