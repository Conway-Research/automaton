/**
 * Structured Logger
 *
 * JSON-formatted structured logging with levels, context, and child loggers.
 * Uses process.stdout.write to avoid console.log recursion.
 * Never throws — all errors are handled gracefully.
 */

import type { LogLevel, LogEntry } from "../types.js";
import { LOG_LEVEL_PRIORITY } from "../types.js";

let globalLogLevel: LogLevel = "info";
let customSink: ((entry: LogEntry) => void) | null = null;

// Sensitive keys that must NEVER appear in log context objects.
// These are stripped recursively before serialization.
const SENSITIVE_KEYS = new Set([
  "secretkey", "secret_key", "privatekey", "private_key",
  "apikey", "api_key", "apitoken", "api_token",
  "password", "passwd", "credential", "credentials",
  "authorization", "bearer", "token", "access_token",
  "keypair", "signer", "mnemonic", "seed",
]);

/**
 * Deep-scrub sensitive fields from a context object.
 * Returns a new object safe for logging.
 */
function sanitizeContext(
  obj: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > 4) return { "[truncated]": "depth limit" };
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase().replace(/[-_]/g, "");
    if (SENSITIVE_KEYS.has(lower)) {
      safe[key] = "[REDACTED]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      safe[key] = sanitizeContext(value as Record<string, unknown>, depth + 1);
    } else if (typeof value === "string" && value.length > 40) {
      // Redact long base58-like strings (likely keys)
      if (/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{44,}$/.test(value)) {
        safe[key] = `[REDACTED:${value.slice(0, 4)}...${value.length}chars]`;
        continue;
      }
      safe[key] = value;
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

export function setGlobalLogLevel(level: LogLevel): void {
  globalLogLevel = level;
}

export function getGlobalLogLevel(): LogLevel {
  return globalLogLevel;
}

export class StructuredLogger {
  private module: string;
  private minLevel: LogLevel;

  constructor(module: string, minLevel?: LogLevel) {
    this.module = module;
    this.minLevel = minLevel ?? globalLogLevel;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, undefined, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, undefined, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, undefined, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.write("error", message, error, context);
  }

  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.write("fatal", message, error, context);
  }

  child(subModule: string): StructuredLogger {
    return new StructuredLogger(`${this.module}.${subModule}`, this.minLevel);
  }

  static setSink(sink: (entry: LogEntry) => void): void {
    customSink = sink;
  }

  static resetSink(): void {
    customSink = null;
  }

  private write(
    level: LogLevel,
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    try {
      const effectiveLevel = this.minLevel ?? globalLogLevel;
      if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[effectiveLevel]) {
        return;
      }

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        module: this.module,
        message,
      };

      if (context && Object.keys(context).length > 0) {
        entry.context = sanitizeContext(context);
      }

      if (error) {
        // Sanitize error messages — may contain RPC URLs with API keys
        let safeMessage = error.message;
        if (safeMessage) {
          safeMessage = safeMessage.replace(/https?:\/\/[^\s]*[?&](api[-_]?key|token|secret|auth)[^\s]*/gi, "[REDACTED_URL]");
          safeMessage = safeMessage.replace(/[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{44,88}/g, "[REDACTED]");
        }
        entry.error = {
          message: safeMessage,
          stack: error.stack,
        };
        if ((error as any).code) {
          entry.error.code = (error as any).code;
        }
      }

      if (customSink) {
        customSink(entry);
        return;
      }

      const json = JSON.stringify(entry);
      process.stdout.write(json + "\n");
    } catch {
      // Fallback if JSON serialization fails
      try {
        process.stderr.write(`[logger-fallback] ${message}\n`);
      } catch {
        // Completely silent — never throw from logger
      }
    }
  }
}

export function createLogger(module: string): StructuredLogger {
  return new StructuredLogger(module);
}
