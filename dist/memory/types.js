/**
 * Memory System Types
 *
 * Re-exports memory types from types.ts and adds internal types
 * used by the memory subsystem.
 */
export { DEFAULT_MEMORY_BUDGET } from "../types.js";
export const DEFAULT_INGESTION_CONFIG = {
    maxWorkingMemoryEntries: 20,
    episodicRetentionDays: 30,
    semanticMaxEntries: 500,
    enableAutoIngestion: true,
};
// ─── Turn Classification ────────────────────────────────────────
const STRATEGIC_TOOLS = new Set([
    "update_genesis_prompt",
    "edit_own_file",
    "modify_heartbeat",
    "spawn_child",
    "register_erc8004",
    "update_agent_card",
    "install_mcp_server",
    "update_soul",
]);
const PRODUCTIVE_TOOLS = new Set([
    "exec",
    "write_file",
    "read_file",
    "git_commit",
    "git_push",
    "install_npm_package",
    "create_sandbox",
    "expose_port",
    "register_domain",
    "manage_dns",
    "install_skill",
    "create_skill",
    "save_procedure",
    "set_goal",
]);
const COMMUNICATION_TOOLS = new Set([
    "send_message",
    "check_social_inbox",
    "give_feedback",
    "note_about_agent",
]);
const MAINTENANCE_TOOLS = new Set([
    "check_credits",
    "check_usdc_balance",
    "system_synopsis",
    "heartbeat_ping",
    "list_sandboxes",
    "list_skills",
    "list_children",
    "list_models",
    "check_reputation",
    "git_status",
    "git_log",
    "git_diff",
    "review_memory",
    "recall_facts",
    "recall_procedure",
    "discover_agents",
    "search_domains",
]);
const ERROR_KEYWORDS = ["error", "failed", "exception", "blocked", "denied"];
/**
 * Classify a turn based on its tool calls and thinking content.
 * Rule-based, no inference required.
 */
export function classifyTurn(toolCalls, thinking) {
    // Error classification: any tool call with an error
    if (toolCalls.some((tc) => tc.error)) {
        return "error";
    }
    // Check thinking for error keywords
    const thinkingLower = thinking.toLowerCase();
    if (ERROR_KEYWORDS.some((kw) => thinkingLower.includes(kw)) && toolCalls.length === 0) {
        return "error";
    }
    const toolNames = new Set(toolCalls.map((tc) => tc.name));
    // Strategic: any strategic tool used
    for (const name of toolNames) {
        if (STRATEGIC_TOOLS.has(name))
            return "strategic";
    }
    // Communication: any communication tool used
    for (const name of toolNames) {
        if (COMMUNICATION_TOOLS.has(name))
            return "communication";
    }
    // Productive: any productive tool used
    for (const name of toolNames) {
        if (PRODUCTIVE_TOOLS.has(name))
            return "productive";
    }
    // Maintenance: any maintenance tool used
    for (const name of toolNames) {
        if (MAINTENANCE_TOOLS.has(name))
            return "maintenance";
    }
    // Idle: no tool calls and short thinking
    if (toolCalls.length === 0 && thinking.length < 100) {
        return "idle";
    }
    // Default to maintenance
    return "maintenance";
}
//# sourceMappingURL=types.js.map