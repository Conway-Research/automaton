/**
 * State Versioning
 *
 * Version control the automaton's own state files (~/.automaton/).
 * Every self-modification triggers a git commit with a descriptive message.
 * The automaton's entire identity history is version-controlled and replayable.
 */
import { gitInit, gitCommit, gitStatus, gitLog } from "./tools.js";
const AUTOMATON_DIR = "~/.automaton";
function resolveHome(p) {
    const home = process.env.HOME || "/root";
    if (p.startsWith("~")) {
        return `${home}${p.slice(1)}`;
    }
    return p;
}
/**
 * Initialize git repo for the automaton's state directory.
 * Creates .gitignore to exclude sensitive files.
 */
export async function initStateRepo(conway) {
    const dir = resolveHome(AUTOMATON_DIR);
    // Check if already initialized
    const checkResult = await conway.exec(`test -d ${dir}/.git && echo "exists" || echo "nope"`, 5000);
    if (checkResult.stdout.trim() === "exists") {
        return;
    }
    // Initialize
    await gitInit(conway, dir);
    // Create .gitignore for sensitive files
    const gitignore = `# Sensitive files - never commit
wallet.json
config.json
state.db
state.db-wal
state.db-shm
logs/
*.log
*.err
`;
    await conway.writeFile(`${dir}/.gitignore`, gitignore);
    // Configure git user
    await conway.exec(`cd ${dir} && git config user.name "Automaton" && git config user.email "automaton@conway.tech"`, 5000);
    // Initial commit
    await gitCommit(conway, dir, "genesis: automaton state repository initialized");
}
/**
 * Commit a state change with a descriptive message.
 * Called after any self-modification.
 */
export async function commitStateChange(conway, description, category = "state") {
    const dir = resolveHome(AUTOMATON_DIR);
    // Check if there are changes
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
export async function commitSoulUpdate(conway, description) {
    return commitStateChange(conway, description, "soul");
}
/**
 * Commit after a skill installation or removal.
 */
export async function commitSkillChange(conway, skillName, action) {
    return commitStateChange(conway, `${action} skill: ${skillName}`, "skill");
}
/**
 * Commit after heartbeat config change.
 */
export async function commitHeartbeatChange(conway, description) {
    return commitStateChange(conway, description, "heartbeat");
}
/**
 * Commit after config change.
 */
export async function commitConfigChange(conway, description) {
    return commitStateChange(conway, description, "config");
}
/**
 * Get the state repo history.
 */
export async function getStateHistory(conway, limit = 20) {
    const dir = resolveHome(AUTOMATON_DIR);
    return gitLog(conway, dir, limit);
}
//# sourceMappingURL=state-versioning.js.map