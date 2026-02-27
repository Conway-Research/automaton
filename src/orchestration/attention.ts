import type Database from "better-sqlite3";
import type { ChatMessage } from "../types.js";
import {
  getActiveGoals,
  getTasksByGoal,
  type GoalRow,
  type TaskGraphRow,
} from "../state/database.js";

const MAX_TODO_TOKENS = 2000;
const CHARS_PER_TOKEN_ESTIMATE = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function assignee(assignedTo: string | null): string {
  return assignedTo ?? "unassigned";
}

function formatTaskLine(task: TaskGraphRow): string {
  if (task.status === "completed") {
    return `- [x] ${task.title} (completed by ${assignee(task.assignedTo)})`;
  }

  if (task.status === "running") {
    return `- [~] ${task.title} (running — ${assignee(task.assignedTo)})`;
  }

  const status = task.status === "blocked" ? "blocked" : "pending";
  return `- [ ] ${task.title} (${status})`;
}

function formatGoalSection(goal: GoalRow, tasks: TaskGraphRow[]): string {
  const estimatedBudgetCents = tasks.reduce((sum, task) => sum + task.estimatedCostCents, 0);
  const actualSpentCents = tasks.reduce((sum, task) => sum + task.actualCostCents, 0);
  const budget = `${formatDollars(estimatedBudgetCents)} budget, ${formatDollars(actualSpentCents)} spent`;

  const lines = tasks.map(formatTaskLine);
  return [`## Goal: ${goal.title} [${budget}]`, ...lines].join("\n");
}

export function generateTodoMd(db: Database.Database): string {
  const activeGoals = getActiveGoals(db);
  if (activeGoals.length === 0) {
    return "";
  }

  const header = "# Active Goals";
  const sections = activeGoals.map((goal) => {
    const tasks = getTasksByGoal(db, goal.id);
    return formatGoalSection(goal, tasks);
  });

  let keptSections = sections;
  let todoMd = `${header}\n\n${keptSections.join("\n\n")}`;

  // Remove oldest goals first, preserving the most recent goal(s).
  while (estimateTokens(todoMd) > MAX_TODO_TOKENS && keptSections.length > 1) {
    keptSections = keptSections.slice(1);
    todoMd = `${header}\n\n${keptSections.join("\n\n")}`;
  }

  return todoMd;
}

export function injectTodoContext(messages: ChatMessage[], todoMd: string): ChatMessage[] {
  if (todoMd.trim().length === 0) {
    return messages;
  }

  const todoMessage: ChatMessage = {
    role: "system",
    content: `## Current Goals & Tasks\n\n${todoMd}`,
  };

  return [...messages, todoMessage];
}
