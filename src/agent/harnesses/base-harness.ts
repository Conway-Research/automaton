import { createLogger } from "../../observability/logger.js";
import type { ChatMessage, InferenceToolCall } from "../../types.js";
import type { TaskNode, TaskResult } from "../../orchestration/task-graph.js";
import { LoopDetector } from "../loop-detector.js";
import type {
  AgentHarness,
  HarnessContext,
  HarnessTool,
} from "../harness-types.js";

const logger = createLogger("harness.base");
const MAX_CONSECUTIVE_INFERENCE_ERRORS = 3;
const MAX_TOOL_OUTPUT_LENGTH = 16_000;

export abstract class BaseHarness implements AgentHarness {
  abstract readonly id: string;
  abstract readonly description: string;

  protected task!: TaskNode;
  protected context!: HarnessContext;
  protected loopDetector!: LoopDetector;
  protected messages: ChatMessage[] = [];
  protected artifacts: string[] = [];

  async initialize(task: TaskNode, context: HarnessContext): Promise<void> {
    this.task = task;
    this.context = context;
    this.loopDetector = new LoopDetector({
      maxIdenticalCalls: 3,
      maxIdleOnlyTurns: 3,
      windowSize: 10,
    });
    this.messages = [
      { role: "system", content: this.buildSystemPrompt() },
      { role: "user", content: this.buildTaskPrompt() },
    ];
    this.artifacts = [];
  }

  abstract getToolDefs(): HarnessTool[];
  abstract buildSystemPrompt(): string;

  protected beforeTurn(): void {}

  buildTaskPrompt(): string {
    const lines = [
      "# Task Assignment",
      "",
      `**Title:** ${this.task.title}`,
      `**Description:** ${this.task.description}`,
      `**Role:** ${this.task.agentRole ?? "generalist"}`,
      `**Task ID:** ${this.task.id}`,
      `**Goal ID:** ${this.task.goalId}`,
    ];

    if (this.task.dependencies.length > 0) {
      lines.push(`**Dependencies (completed):** ${this.task.dependencies.join(", ")}`);
    }

    const wisdom = this.context.wisdom;
    if (
      wisdom.conventions.length > 0 ||
      wisdom.failures.length > 0 ||
      wisdom.gotchas.length > 0 ||
      wisdom.successes.length > 0
    ) {
      lines.push("", "## Learnings from Previous Tasks");
      if (wisdom.conventions.length > 0) {
        lines.push("", "### Conventions");
        for (const item of wisdom.conventions) lines.push(`- ${item}`);
      }
      if (wisdom.failures.length > 0) {
        lines.push("", "### Known Failures (avoid these approaches)");
        for (const item of wisdom.failures) lines.push(`- ${item}`);
      }
      if (wisdom.gotchas.length > 0) {
        lines.push("", "### Gotchas");
        for (const item of wisdom.gotchas) lines.push(`- ${item}`);
      }
      if (wisdom.successes.length > 0) {
        lines.push("", "### What Worked");
        for (const item of wisdom.successes.slice(0, 5)) lines.push(`- ${item}`);
      }
    }

    lines.push("", "Complete this task and provide your results. Call task_done when finished.");
    return lines.join("\n");
  }

  async execute(): Promise<TaskResult> {
    this.context.budget.startedAt = Date.now();

    const tools = this.getToolDefs();
    const toolDefs = tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    let consecutiveInferenceErrors = 0;
    let finalOutput = "";
    let finalSuccess = true;

    while (true) {
      this.checkBudget();

      if (this.context.abortSignal.aborted) {
        throw new Error("Harness execution aborted by abort signal");
      }

      let response: { content: string; toolCalls?: InferenceToolCall[]; costCents?: number };
      try {
        response = await this.context.inference.chat({
          tier: "fast",
          messages: this.messages,
          tools: toolDefs,
          toolChoice: "auto",
        });
        if (typeof response.costCents === "number") {
          this.context.budget.costUsedCents += response.costCents;
        }
        consecutiveInferenceErrors = 0;
      } catch (error) {
        consecutiveInferenceErrors++;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          `[${this.id}] Inference error (${consecutiveInferenceErrors}/${MAX_CONSECUTIVE_INFERENCE_ERRORS}): ${message}`,
        );
        if (consecutiveInferenceErrors >= MAX_CONSECUTIVE_INFERENCE_ERRORS) {
          throw new Error(
            `${MAX_CONSECUTIVE_INFERENCE_ERRORS} consecutive inference failures. Last error: ${message}`,
          );
        }
        continue;
      }

      this.beforeTurn();
      this.context.budget.turnsUsed++;
      logger.info(
        `[${this.id}] Turn ${this.context.budget.turnsUsed}/${this.context.budget.maxTurns} — task: ${this.task.title.slice(0, 60)}`,
      );

      if (response.toolCalls && response.toolCalls.length > 0) {
        this.messages.push({
          role: "assistant",
          content: response.content || "",
          tool_calls: response.toolCalls,
        });

        let taskDone: { summary: string; success: boolean } | null = null;

        for (const toolCall of response.toolCalls) {
          const loopResult = this.loopDetector.recordToolCall(
            toolCall.function.name,
            toolCall.function.arguments,
          );
          if (loopResult.blocked) {
            logger.warn(`[${this.id}] Loop detected: ${loopResult.reason}`);
            this.messages.push({
              role: "tool",
              content:
                `LOOP DETECTED: ${loopResult.reason}\n\n` +
                "You MUST take a DIFFERENT action. If you cannot make progress, call task_done with a failure summary.",
              tool_call_id: toolCall.id,
            });
            continue;
          }

          const tool = tools.find((entry) => entry.name === toolCall.function.name);
          let output: string;

          if (!tool) {
            output = `Error: Unknown tool '${toolCall.function.name}'. Available tools: ${tools.map((entry) => entry.name).join(", ")}`;
            logger.warn(`[${this.id}] Unknown tool: ${toolCall.function.name}`);
          } else {
            try {
              const args = typeof toolCall.function.arguments === "string"
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;
              output = await tool.execute(args as Record<string, unknown>);
              if (output.length > MAX_TOOL_OUTPUT_LENGTH) {
                output = output.slice(0, MAX_TOOL_OUTPUT_LENGTH) +
                  `\n[TRUNCATED: ${output.length - MAX_TOOL_OUTPUT_LENGTH} chars omitted]`;
              }
              logger.info(`[${this.id}] ${tool.name} → ${output.slice(0, 120)}`);

              if (tool.name === "write_file" || tool.name === "patch_file") {
                try {
                  const parsedArgs = typeof toolCall.function.arguments === "string"
                    ? JSON.parse(toolCall.function.arguments)
                    : toolCall.function.arguments;
                  if (typeof parsedArgs.path === "string") {
                    this.artifacts.push(parsedArgs.path);
                  }
                } catch {
                  // ignore artifact tracking parse errors
                }
              }

              if (tool.name === "task_done") {
                const parsedArgs = typeof toolCall.function.arguments === "string"
                  ? JSON.parse(toolCall.function.arguments)
                  : toolCall.function.arguments;
                taskDone = {
                  summary: typeof parsedArgs.summary === "string" ? parsedArgs.summary : output,
                  success: parsedArgs.success !== false,
                };
              }
            } catch (error) {
              output = `Error executing ${toolCall.function.name}: ${error instanceof Error ? error.message : String(error)}`;
              logger.error(`[${this.id}] Tool error: ${output}`);
            }
          }

          this.messages.push({
            role: "tool",
            content: output,
            tool_call_id: toolCall.id,
          });
        }

        const turnCheck = this.loopDetector.endTurn();
        if (turnCheck.reason) {
          if (turnCheck.blocked) {
            throw new Error(`Unrecoverable loop detected: ${turnCheck.reason}`);
          }
          this.messages.push({
            role: "system",
            content: turnCheck.reason,
          });
        }

        if (taskDone) {
          finalOutput = taskDone.summary;
          finalSuccess = taskDone.success;
          break;
        }

        continue;
      }

      finalOutput = response.content || "Task completed.";
      finalSuccess = true;
      logger.info(
        `[${this.id}] Text-only response on turn ${this.context.budget.turnsUsed}: ${finalOutput.slice(0, 200)}`,
      );
      break;
    }

    return {
      success: finalSuccess,
      output: finalOutput,
      artifacts: [...new Set(this.artifacts)],
      costCents: this.context.budget.costUsedCents,
      duration: Date.now() - this.context.budget.startedAt,
    };
  }

  private checkBudget(): void {
    const budget = this.context.budget;

    if (budget.turnsUsed >= budget.maxTurns) {
      throw new Error(
        `Budget exhausted: reached max turns (${budget.turnsUsed}/${budget.maxTurns}). ` +
        `Task "${this.task.title}" did not complete within the turn budget.`,
      );
    }

    if (budget.costUsedCents >= budget.maxCostCents) {
      throw new Error(
        `Budget exhausted: cost limit reached ($${(budget.costUsedCents / 100).toFixed(2)} / $${(budget.maxCostCents / 100).toFixed(2)}). ` +
        `Task "${this.task.title}" exceeded its cost budget.`,
      );
    }

    if (budget.startedAt > 0) {
      const elapsed = Date.now() - budget.startedAt;
      if (elapsed >= budget.timeoutMs) {
        throw new Error(
          `Budget exhausted: timeout (${Math.round(elapsed / 1000)}s / ${Math.round(budget.timeoutMs / 1000)}s). ` +
          `Task "${this.task.title}" exceeded its time budget.`,
        );
      }
    }
  }
}
