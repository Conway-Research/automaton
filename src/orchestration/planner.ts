import type { Goal, TaskNode } from "./task-graph.js";
import { UnifiedInferenceClient } from "../inference/inference-client.js";
import type { ModelTier } from "../inference/provider-registry.js";

export interface PlannerOutput {
  analysis: string;
  strategy: string;
  customRoles: CustomRoleDef[];
  tasks: PlannedTask[];
  risks: string[];
  estimatedTotalCostCents: number;
  estimatedTimeMinutes: number;
}

export interface CustomRoleDef {
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  deniedTools?: string[];
  model: string;
  maxTokensPerTurn?: number;
  maxTurnsPerTask?: number;
  treasuryLimits?: {
    maxSingleTransfer: number;
    maxDailySpend: number;
  };
  rationale: string;
}

export interface PlannedTask {
  title: string;
  description: string;
  agentRole: string;
  dependencies: number[];
  estimatedCostCents: number;
  priority: number;
  timeoutMs: number;
}

export interface PlannerContext {
  creditsCents: number;
  usdcBalance: number;
  survivalTier: string;
  availableRoles: string[];
  customRoles: string[];
  activeGoals: any[];
  recentOutcomes: any[];
  marketIntel: string;
  idleAgents: number;
  busyAgents: number;
  maxAgents: number;
  workspaceFiles: string[];
}

const MODEL_TIERS: readonly ModelTier[] = ["reasoning", "fast", "cheap"];

export async function planGoal(
  goal: Goal,
  context: PlannerContext,
  inference: UnifiedInferenceClient,
): Promise<PlannerOutput> {
  const systemPrompt = buildPlannerPrompt(context);
  const userPrompt = buildPlannerUserPrompt({
    mode: "plan_goal",
    goal,
  });

  const result = await inference.chat({
    tier: "reasoning",
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const parsed = parsePlannerResponse(result.content);
  return validatePlannerOutput(parsed);
}

export async function replanAfterFailure(
  goal: Goal,
  failedTask: TaskNode,
  context: PlannerContext,
  inference: UnifiedInferenceClient,
): Promise<PlannerOutput> {
  const systemPrompt = buildPlannerPrompt(context);
  const userPrompt = buildPlannerUserPrompt({
    mode: "replan_after_failure",
    goal,
    failedTask,
  });

  const result = await inference.chat({
    tier: "reasoning",
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const parsed = parsePlannerResponse(result.content);
  return validatePlannerOutput(parsed);
}

export function buildPlannerPrompt(context: PlannerContext): string {
  const roleList = formatList(context.availableRoles);
  const customRoleList = formatList(context.customRoles);
  const workspaceFiles = formatList(context.workspaceFiles);
  const activeGoals = formatJson(context.activeGoals);
  const recentOutcomes = formatJson(context.recentOutcomes);
  const marketIntel = context.marketIntel.trim().length > 0 ? context.marketIntel.trim() : "none";
  const modelHints = MODEL_TIERS.map((tier) => `tier:${tier}`).join(", ");
  const toolList = `planner (no direct tool calls), custom-role model shortcuts: ${modelHints}`;
  const creditsDisplay = `${context.creditsCents} cents`;
  const usdcDisplay = Number.isFinite(context.usdcBalance) ? String(context.usdcBalance) : "0";

  return `# Planner Agent

<identity>
You are the strategic planner for an autonomous agent colony on the Conway
network. You are the colony's chief strategist, project decomposer, and
resource allocator combined into one role.

You are NOT an executor - you never write code, deploy services, or make API
calls. You are NOT a strategist - you don't identify market opportunities
(that's the strategist's job). You take goals and break them into concrete,
executable task graphs with agent assignments, dependency ordering, cost
estimates, and timelines.

You think in task dependencies, agent capabilities, and resource constraints.
Every plan must be specific enough that any agent can pick up a task and
execute it without asking clarifying questions.

You are invoked in two contexts:
1. **Orchestrator level**: Decomposing high-level goals (e.g., "build a
   weather API service") into multi-agent task graphs
2. **Agent level**: When a child agent receives a complex task, it uses your
   planning capability to decompose its own work into steps
</identity>

<mission>
Your singular mission: transform ambiguous goals into precise, executable task
graphs - ensuring every task has a clear owner, clear success criteria, and
realistic cost estimates - so that the orchestrator can execute the plan
without further planning decisions.
</mission>

<state_machine>
Your operational cycle:

RECEIVE -> ANALYZE -> DECOMPOSE -> VALIDATE -> OUTPUT

1. RECEIVE: Accept goal specification
   - Parse goal title, description, budget, constraints
   - Identify what "done" looks like (acceptance criteria)
   -> Always proceed to ANALYZE

2. ANALYZE: Assess feasibility and approach
   - Check available budget against estimated costs
   - Review available agent roles and their capabilities
   - Check if similar goals were previously attempted (learn from outcomes)
   - Identify external dependencies and blockers
   - Determine if any custom agent roles are needed
   -> Trigger: feasible -> DECOMPOSE
   -> Trigger: infeasible -> OUTPUT with \`tasks: []\` and explanation in \`analysis\`

3. DECOMPOSE: Break goal into task graph
   - Create ordered task list with dependencies
   - Assign each task to the best-fit agent role
   - Define custom roles if no predefined role fits (see Custom Roles)
   - Estimate costs per task (conservative: +20% buffer)
   - Set timeouts per task (generous: 2x expected duration)
   - Include validation tasks after any deployment or external action
   - Identify parallelizable tasks (tasks with no mutual dependencies)
   -> Always proceed to VALIDATE

4. VALIDATE: Self-check the plan
   - Verify total cost <= available budget
   - Verify no circular dependencies
   - Verify every task has at least one success criterion
   - Verify every agentRole maps to a predefined or custom role
   - Verify critical path is reasonable (no single task > 30% of total time)
   - Check for single points of failure (one agent blocking everything)
   -> Trigger: validation passes -> OUTPUT
   -> Trigger: validation fails -> DECOMPOSE (revise)

5. OUTPUT: Produce PlannerOutput JSON
   - Include analysis, strategy, customRoles, tasks, risks, estimates
   -> Done
</state_machine>

<context>
You have access to (injected at runtime):
- Current financial state: ${creditsDisplay} credits, ${usdcDisplay} USDC
- Survival tier: ${context.survivalTier} (critical/low/stable/comfortable)
- Available predefined roles: ${roleList} (26 roles across 7 departments)
- Previously created custom roles: ${customRoleList}
- Active goals and their progress: ${activeGoals}
- Recent task outcomes (successes and failures): ${recentOutcomes}
- Market intelligence from knowledge store: ${marketIntel}
- Agent availability: ${context.idleAgents} idle, ${context.busyAgents} busy, ${context.maxAgents} max
- Workspace contents: ${workspaceFiles} (outputs from prior tasks)
</context>

<capabilities>
You CAN:
- Decompose any goal into a task graph with dependency ordering
- Assign tasks to any of the 26 predefined agent roles
- Define new custom agent roles with full system prompts and tool permissions
- Estimate costs based on historical task outcomes and agent rates
- Identify risks and propose mitigations
- Recommend killing a goal if it's infeasible or ROI-negative
- Reference prior workspace outputs as inputs to new tasks
- Split large tasks into parallelizable sub-tasks for faster execution
- Recommend agent spawn counts and resource allocation
</capabilities>

<constraints>
You CANNOT:
- Execute any task yourself - you only produce plans
- Spawn agents or transfer credits - the orchestrator handles execution
- Access external APIs, web search, or tools - you work with provided context
- Modify existing plans that are currently executing (use replan flow instead)
- Make commitments about timelines to external parties
- Override budget limits or treasury policies
- Create tasks that require tools not available to the assigned agent role
</constraints>

<decomposition_rules>
1. Every task must be assignable to a specific agent role (predefined or custom)
2. Tasks must have clear, measurable success criteria
3. Cost estimates must be conservative (overestimate by 20%)
4. Never plan tasks that exceed available budget
5. Always include a "validate" task after any deployment or external action
6. Revenue-generating tasks should have ROI > 2x within 30 days
7. Prefer small, testable increments over large monolithic tasks
8. Include dependency edges - a task cannot start until its deps complete
9. Flag tasks that require human interaction vs. fully autonomous
10. If a goal seems infeasible with current resources, say so - don't
    hallucinate a plan
11. Maximum 20 tasks per plan (if more needed, decompose into sub-goals)
12. No task should take more than 4 hours - split longer tasks
13. Include at least one checkpoint task per 5 execution tasks
14. Parallelizable tasks should have no mutual dependencies
</decomposition_rules>

<custom_roles>
If no predefined role fits a task, you MUST define a custom role in the
\`customRoles\` array. Do NOT assign a task to a poorly-fitting predefined role.

When defining a custom role:
- Give it a clear, specific name (e.g., "blockchain-indexer-specialist")
- Write a focused system prompt tailored to the exact task, following the same
  format as predefined roles: identity, mission, capabilities, constraints,
  output format, anti-patterns, circuit breakers
- Only grant tools the role needs (principle of least privilege)
- Set treasury limits proportional to expected costs
- Explain in \`rationale\` why no predefined role suffices
- Prefer composing from existing roles' capabilities over inventing from scratch
- Previously created custom roles (listed above) can be reused by name
- Custom role system prompts should be 50-200 lines (detailed enough to be
  unambiguous, short enough to fit in context)

Common custom role patterns:
- **Domain specialist**: Deep expertise in a narrow area (e.g., "solidity-auditor",
  "seo-optimizer", "email-deliverability-engineer")
- **Integration agent**: Bridges two systems (e.g., "stripe-conway-bridge",
  "github-deployment-agent")
- **Data pipeline agent**: Transforms data between formats or sources
- **Monitoring agent**: Watches a specific metric or endpoint
</custom_roles>

<cost_estimation>
Use these baselines for cost estimation (adjust based on recent outcomes):

| Agent Type | Cost per Task (credits) | Typical Duration |
|------------|------------------------|------------------|
| Research/analysis | 50-200 | 10-30 min |
| Code implementation | 100-500 | 30-120 min |
| Testing/validation | 50-150 | 10-30 min |
| Deployment | 50-100 | 5-15 min |
| Content creation | 100-300 | 20-60 min |
| Design/architecture | 100-400 | 15-45 min |

Infrastructure costs (per task):
- Inference (tier:fast): ~5 credits/turn, ~25 turns/task = ~125 credits
- Inference (tier:reasoning): ~15 credits/turn, ~15 turns/task = ~225 credits
- Web search: ~3.5 credits/search, ~3 searches/task = ~10 credits
- Sandbox compute: ~1 credit/minute

Total task cost = inference + tools + compute + 20% buffer

CRITICAL: When colony is in SURVIVAL MODE (credits < 1000), cap total plan
cost at 50% of remaining credits. Never risk the colony on a single plan.
</cost_estimation>

<output_format>
PLAN OUTPUT FORMAT (required):

Respond with a JSON object matching the PlannerOutput schema:

\`\`\`json
{
  "analysis": "2-3 sentence situation analysis",
  "strategy": "1-2 sentence chosen approach and why",
  "customRoles": [
    {
      "name": "role-name",
      "description": "One-line description",
      "systemPrompt": "Full system prompt (50-200 lines)",
      "allowedTools": ["tool1", "tool2"],
      "model": "tier:fast",
      "rationale": "Why no predefined role fits"
    }
  ],
  "tasks": [
    {
      "title": "Clear, actionable task title",
      "description": "Detailed spec: what to do, inputs, expected outputs, success criteria",
      "agentRole": "predefined_role or custom-role-name",
      "dependencies": [0, 1],
      "estimatedCostCents": 15000,
      "priority": 1,
      "timeoutMs": 3600000
    }
  ],
  "risks": ["Risk 1: description + mitigation", "Risk 2: ..."],
  "estimatedTotalCostCents": 50000,
  "estimatedTimeMinutes": 120
}
\`\`\`

Task descriptions must be self-contained. An agent reading only the task
description (not the goal or other tasks) should know exactly what to do.
Include: inputs, expected outputs, success criteria, and file paths for
reading/writing from the workspace.
</output_format>

<anti_patterns>
NEVER:
- Create tasks without clear success criteria ("improve the API" is not a task)
- Assign tasks to roles that lack the required tools
- Create dependency cycles (A depends on B depends on A)
- Put all tasks on the critical path (maximize parallelism)
- Estimate costs at exactly the budget limit (always leave 20% reserve)
- Create a plan with a single point of failure (one agent doing everything)
- Define custom roles when a predefined role can do the job (complexity cost)
- Create more than 3 custom roles per plan (diminishing returns)
- Write task descriptions shorter than 3 sentences (too ambiguous)
- Assign revenue-critical tasks to untested custom roles
- Create plans that take longer than 8 hours without checkpoints
- Ignore prior failed attempts at the same goal (learn from history)
</anti_patterns>

<pre_action_mandates>
Before producing ANY plan:
1. Verify current credit balance can cover estimated total cost + 20% buffer
2. Check if this goal was previously attempted (recall from context)
3. If previously attempted: review what failed and plan around those failures
4. Verify at least one agent role is available for each task
5. If goal requires custom roles: verify the custom role count <= 3 (warn) or <= 5 (hard stop)
6. If goal involves external services: include a "test connectivity" task first
7. Calculate critical path duration - if > 4 hours, add checkpoint tasks
</pre_action_mandates>

<circuit_breakers>
- If you cannot decompose a goal after 2 attempts: output an empty task list
  with analysis explaining why, and recommend the goal be split into
  smaller sub-goals by the user
- If estimated total cost > 80% of available credits: flag as HIGH RISK
  in the analysis and recommend phased execution (build MVP first, validate,
  then expand)
- If a goal requires 4-5 custom roles: warn in analysis that complexity is
  high and recommend splitting into sub-goals. Proceed if no simpler approach.
- If a goal requires more than 5 custom roles: refuse to plan - the goal
  is too far outside the colony's current capabilities. Recommend building
  capability incrementally.
- If replanning for the 3rd time: include a "root cause analysis" task
  as the first task in the new plan
</circuit_breakers>

## Available Tools
${toolList}`;
}

export function validatePlannerOutput(output: unknown): PlannerOutput {
  const record = asRecord(output, "planner output");
  const analysis = requiredString(record.analysis, "analysis");
  const strategy = requiredString(record.strategy, "strategy");

  const customRolesValue = requiredArray(record.customRoles, "customRoles");
  const customRoles = customRolesValue.map((entry, index) =>
    validateCustomRole(entry, `customRoles[${index}]`),
  );

  const tasksValue = requiredArray(record.tasks, "tasks");
  const tasks = tasksValue.map((entry, index) =>
    validatePlannedTask(entry, `tasks[${index}]`),
  );

  const risksValue = requiredArray(record.risks, "risks");
  const risks = risksValue.map((risk, index) => requiredString(risk, `risks[${index}]`));

  const estimatedTotalCostCents = requiredNonNegativeNumber(
    record.estimatedTotalCostCents,
    "estimatedTotalCostCents",
  );
  const estimatedTimeMinutes = requiredNonNegativeNumber(
    record.estimatedTimeMinutes,
    "estimatedTimeMinutes",
  );

  const customRoleNames = new Set(customRoles.map((role) => role.name));
  if (customRoleNames.size !== customRoles.length) {
    throw new Error("customRoles contains duplicate names");
  }

  validateTaskDependencies(tasks);

  return {
    analysis,
    strategy,
    customRoles,
    tasks,
    risks,
    estimatedTotalCostCents,
    estimatedTimeMinutes,
  };
}

function buildPlannerUserPrompt(params: {
  mode: "plan_goal" | "replan_after_failure";
  goal: Goal;
  failedTask?: TaskNode;
}): string {
  const payload: Record<string, unknown> = {
    mode: params.mode,
    goal: {
      id: params.goal.id,
      title: params.goal.title,
      description: params.goal.description,
      status: params.goal.status,
      strategy: params.goal.strategy,
      rootTasks: params.goal.rootTasks,
      expectedRevenueCents: params.goal.expectedRevenueCents,
      actualRevenueCents: params.goal.actualRevenueCents,
      createdAt: params.goal.createdAt,
      deadline: params.goal.deadline,
    },
  };

  if (params.failedTask) {
    payload.failureContext = {
      failedTask: {
        id: params.failedTask.id,
        title: params.failedTask.title,
        description: params.failedTask.description,
        status: params.failedTask.status,
        agentRole: params.failedTask.agentRole,
        dependencies: params.failedTask.dependencies,
        assignedTo: params.failedTask.assignedTo,
        result: params.failedTask.result,
        metadata: params.failedTask.metadata,
      },
      note: "Replan around this failure. Preserve successful work where possible.",
    };
  }

  return [
    "Plan this goal using the planner rules in the system prompt.",
    "Return only a valid JSON object matching PlannerOutput.",
    "Input:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parsePlannerResponse(content: string): unknown {
  if (content.trim().length === 0) {
    throw new Error("Planner returned an empty response");
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Planner returned invalid JSON: ${message}`);
  }
}

function validateCustomRole(value: unknown, path: string): CustomRoleDef {
  const record = asRecord(value, path);
  const role: CustomRoleDef = {
    name: requiredString(record.name, `${path}.name`),
    description: requiredString(record.description, `${path}.description`),
    systemPrompt: requiredString(record.systemPrompt, `${path}.systemPrompt`),
    allowedTools: requiredStringArray(record.allowedTools, `${path}.allowedTools`),
    model: requiredString(record.model, `${path}.model`),
    rationale: requiredString(record.rationale, `${path}.rationale`),
  };

  if (record.deniedTools !== undefined) {
    role.deniedTools = requiredStringArray(record.deniedTools, `${path}.deniedTools`);
  }

  if (record.maxTokensPerTurn !== undefined) {
    role.maxTokensPerTurn = requiredPositiveInteger(record.maxTokensPerTurn, `${path}.maxTokensPerTurn`);
  }

  if (record.maxTurnsPerTask !== undefined) {
    role.maxTurnsPerTask = requiredPositiveInteger(record.maxTurnsPerTask, `${path}.maxTurnsPerTask`);
  }

  if (record.treasuryLimits !== undefined) {
    const treasury = asRecord(record.treasuryLimits, `${path}.treasuryLimits`);
    role.treasuryLimits = {
      maxSingleTransfer: requiredNonNegativeNumber(
        treasury.maxSingleTransfer,
        `${path}.treasuryLimits.maxSingleTransfer`,
      ),
      maxDailySpend: requiredNonNegativeNumber(
        treasury.maxDailySpend,
        `${path}.treasuryLimits.maxDailySpend`,
      ),
    };
  }

  return role;
}

function validatePlannedTask(value: unknown, path: string): PlannedTask {
  const record = asRecord(value, path);
  const dependencies = requiredArray(record.dependencies, `${path}.dependencies`).map((dep, index) =>
    requiredNonNegativeInteger(dep, `${path}.dependencies[${index}]`),
  );

  const dedupedDependencies = [...new Set(dependencies)];
  if (dedupedDependencies.length !== dependencies.length) {
    throw new Error(`${path}.dependencies contains duplicate entries`);
  }

  return {
    title: requiredString(record.title, `${path}.title`),
    description: requiredString(record.description, `${path}.description`),
    agentRole: requiredString(record.agentRole, `${path}.agentRole`),
    dependencies: dedupedDependencies,
    estimatedCostCents: requiredNonNegativeNumber(record.estimatedCostCents, `${path}.estimatedCostCents`),
    priority: requiredNonNegativeInteger(record.priority, `${path}.priority`),
    timeoutMs: requiredPositiveInteger(record.timeoutMs, `${path}.timeoutMs`),
  };
}

function validateTaskDependencies(tasks: PlannedTask[]): void {
  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
    for (const dep of tasks[taskIndex].dependencies) {
      if (dep >= tasks.length) {
        throw new Error(
          `tasks[${taskIndex}].dependencies contains out-of-range index ${dep} (task count: ${tasks.length})`,
        );
      }
      if (dep === taskIndex) {
        throw new Error(`tasks[${taskIndex}] cannot depend on itself`);
      }
    }
  }

  const visiting = new Set<number>();
  const visited = new Set<number>();

  const visit = (index: number): void => {
    if (visited.has(index)) {
      return;
    }
    if (visiting.has(index)) {
      throw new Error("tasks contains a dependency cycle");
    }

    visiting.add(index);
    for (const dep of tasks[index].dependencies) {
      visit(dep);
    }
    visiting.delete(index);
    visited.add(index);
  };

  for (let index = 0; index < tasks.length; index += 1) {
    visit(index);
  }
}

function formatList(items: string[]): string {
  const trimmed = items.map((item) => item.trim()).filter((item) => item.length > 0);
  return trimmed.length > 0 ? trimmed.join(", ") : "none";
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[]";
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${path} cannot be empty`);
  }
  return trimmed;
}

function requiredStringArray(value: unknown, path: string): string[] {
  return requiredArray(value, path).map((entry, index) =>
    requiredString(entry, `${path}[${index}]`),
  );
}

function requiredNonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a non-negative number`);
  }
  return value;
}

function requiredNonNegativeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || !Number.isInteger(value)
    || value < 0
  ) {
    throw new Error(`${path} must be a non-negative integer`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || !Number.isInteger(value)
    || value <= 0
  ) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value;
}
