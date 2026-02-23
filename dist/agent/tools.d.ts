/**
 * Automaton Tool System
 *
 * Defines all tools the automaton can call, with self-preservation guards.
 * Tools are organized by category and exposed to the inference model.
 */
import type { AutomatonTool, ToolContext, InferenceToolDefinition, ToolCallResult, InputSource, SpendTrackerInterface } from "../types.js";
import type { PolicyEngine } from "./policy-engine.js";
export declare function createBuiltinTools(sandboxId: string): AutomatonTool[];
/**
 * Load installed tools from the database and return as AutomatonTool[].
 * Installed tools are dynamically added from the installed_tools table.
 */
export declare function loadInstalledTools(db: {
    getInstalledTools: () => {
        id: string;
        name: string;
        type: string;
        config?: Record<string, unknown>;
        installedAt: string;
        enabled: boolean;
    }[];
}): AutomatonTool[];
/**
 * Convert AutomatonTool list to OpenAI-compatible tool definitions.
 */
export declare function toolsToInferenceFormat(tools: AutomatonTool[]): InferenceToolDefinition[];
/**
 * Execute a tool call and return the result.
 * Optionally evaluates against the policy engine before execution.
 */
export declare function executeTool(toolName: string, args: Record<string, unknown>, tools: AutomatonTool[], context: ToolContext, policyEngine?: PolicyEngine, turnContext?: {
    inputSource: InputSource | undefined;
    turnToolCallCount: number;
    sessionSpend: SpendTrackerInterface;
}): Promise<ToolCallResult>;
//# sourceMappingURL=tools.d.ts.map