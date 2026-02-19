/**
 * Role Specialization
 *
 * Defines roles that child automatons can be assigned at spawn time.
 * Each role configures tool access, model selection, and heartbeat cadence
 * to optimize the child for its specialized purpose.
 */

export type AutomatonRole = "generalist" | "writer" | "analyst" | "guardian";

export interface RoleConfig {
  /** Human-readable description of this role's purpose */
  description: string;
  /** LLM model to use for inference. Empty string = inherit from parent. */
  inferenceModel: string;
  /** Tool names this role is allowed to use. Undefined = no restriction. */
  allowedTools?: string[];
  /** Multiply the default heartbeat interval. <1 = more frequent, >1 = less frequent. */
  heartbeatMultiplier: number;
  /** Max tokens per turn. */
  maxTokensPerTurn: number;
  /** Whether this role should auto-sleep after completing its task */
  autoSleep: boolean;
}

export const ROLE_CONFIGS: Record<AutomatonRole, RoleConfig> = {
  generalist: {
    description: "General-purpose agent. No tool restrictions. Inherits parent config.",
    inferenceModel: "",
    heartbeatMultiplier: 1,
    maxTokensPerTurn: 4096,
    autoSleep: false,
  },
  writer: {
    description: "Content creation specialist. Writes, publishes, and earns through content.",
    inferenceModel: "gpt-5.2",
    allowedTools: [
      "read_file", "write_file", "list_files", "exec_command",
      "run_skill", "inbox_read", "inbox_reply",
      "update_genesis_prompt", "log_thought", "update_soul",
    ],
    heartbeatMultiplier: 2,
    maxTokensPerTurn: 8192,
    autoSleep: false,
  },
  analyst: {
    description: "Market intelligence specialist. Finds opportunities, evaluates signals, reports findings.",
    inferenceModel: "gpt-5.2",
    allowedTools: [
      "read_file", "write_file", "exec_command",
      "run_skill", "inbox_read", "inbox_reply", "log_thought",
    ],
    heartbeatMultiplier: 1.5,
    maxTokensPerTurn: 8192,
    autoSleep: true,
  },
  guardian: {
    description: "Security and health monitor. Watches for threats, anomalies, and lineage health.",
    inferenceModel: "gpt-4.1",
    allowedTools: [
      "read_file", "exec_command", "run_skill",
      "inbox_read", "inbox_reply", "log_thought",
    ],
    heartbeatMultiplier: 0.5,
    maxTokensPerTurn: 2048,
    autoSleep: false,
  },
};

export function getRoleConfig(role: AutomatonRole | undefined): RoleConfig {
  if (!role || !(role in ROLE_CONFIGS)) return ROLE_CONFIGS.generalist;
  return ROLE_CONFIGS[role];
}

export function buildRolePreamble(role: AutomatonRole): string {
  const config = getRoleConfig(role);
  if (role === "generalist") return "";
  return [
    `--- ROLE: ${role.toUpperCase()} ---`,
    config.description,
    config.allowedTools
      ? `Your tool access is restricted to: ${config.allowedTools.join(", ")}.`
      : "",
    config.autoSleep
      ? "When your current task is complete, go to sleep to conserve compute."
      : "",
    `--- END ROLE ---`,
  ].filter(Boolean).join("\n");
}
