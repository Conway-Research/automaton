/**
 * Pretty log sink
 *
 * Human-readable terminal output for --run mode.
 * Replaces raw JSON stdout with colored, structured log lines.
 * Register via: StructuredLogger.setSink(prettySink)
 */

import chalk from "chalk";
import type { LogEntry } from "../types.js";

const accent = chalk.rgb(131, 127, 255);

// Map bracket prefixes in loop messages to styles
const PREFIX_STYLES: Array<[RegExp, (label: string, rest: string) => string]> = [
  [/^\[WAKE UP\]/, (l, r) => accent.bold(l) + " " + chalk.white(r)],
  [/^\[SLEEP\]/, (l, r) => chalk.blue.dim(l) + " " + chalk.dim(r)],
  [/^\[THINK\]/, (l, r) => accent.dim(l) + " " + chalk.dim(r)],
  [/^\[THOUGHT\]/, (l, r) => chalk.dim(l) + " " + chalk.white(r)],
  [/^\[TOOL\]/, (l, r) => chalk.magenta(l) + " " + chalk.white(r)],
  [/^\[TOOL RESULT\]/, (l, r) => {
    const isError = r.startsWith("ERROR:") || r.includes(": ERROR:");
    return (isError ? chalk.red(l) : chalk.green(l)) + " " + (isError ? chalk.red(r) : chalk.dim(r));
  }],
  [/^\[CRITICAL\]/, (l, r) => chalk.red.bold(l) + " " + chalk.red(r)],
  [/^\[FATAL\]/, (l, r) => chalk.red.bold(l) + " " + chalk.red(r)],
  [/^\[ERROR\]/, (l, r) => chalk.red(l) + " " + chalk.red(r)],
  [/^\[LOOP\]/, (l, r) => chalk.yellow(l) + " " + chalk.yellow(r)],
  [/^\[LOOP END\]/, (l, r) => accent(l) + " " + chalk.dim(r)],
  [/^\[IDLE\]/, (l, r) => chalk.dim(l) + " " + chalk.dim(r)],
  [/^\[ORCHESTRATOR\]/, (l, r) => chalk.cyan(l) + " " + chalk.white(r)],
  [/^\[AUTO-TOPUP\]/, (l, r) => chalk.green.bold(l) + " " + chalk.green(r)],
  [/^\[CYCLE LIMIT\]/, (l, r) => chalk.yellow(l) + " " + chalk.dim(r)],
  [/^\[API_UNREACHABLE\]/, (l, r) => chalk.yellow(l) + " " + chalk.dim(r)],
  [/^\[INBOX\]/, (l, r) => chalk.dim(l) + " " + chalk.dim(r)],
];

const LEVEL_STYLES: Record<string, (s: string) => string> = {
  debug: chalk.gray,
  info: chalk.white,
  warn: chalk.yellow,
  error: chalk.red,
  fatal: chalk.red.bold,
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return chalk.dim(`${hh}:${mm}:${ss}`);
}

function formatMessage(message: string): string {
  const bracketMatch = message.match(/^(\[[A-Z][A-Z _-]*\])(.*)/s);
  if (bracketMatch) {
    const label = bracketMatch[1];
    const rest = bracketMatch[2].trim();
    for (const [pattern, style] of PREFIX_STYLES) {
      if (pattern.test(label)) {
        return style(label, rest);
      }
    }
    return accent(label) + " " + rest;
  }
  return chalk.white(message);
}

export function prettySink(entry: LogEntry): void {
  try {
    const time = formatTime(entry.timestamp);
    const levelFn = LEVEL_STYLES[entry.level] ?? chalk.white;
    const level = levelFn(entry.level.toUpperCase().padEnd(5));
    const mod = chalk.dim(entry.module.padEnd(12));
    const msg = formatMessage(entry.message);

    let line = `${time} ${level} ${mod} ${msg}`;

    if (entry.error) {
      line += "\n" + chalk.red("  " + entry.error.message);
    }

    process.stdout.write(line + "\n");
  } catch {
    process.stdout.write(entry.message + "\n");
  }
}
