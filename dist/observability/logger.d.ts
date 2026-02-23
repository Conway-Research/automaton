/**
 * Structured Logger
 *
 * JSON-formatted structured logging with levels, context, and child loggers.
 * Uses process.stdout.write to avoid console.log recursion.
 * Never throws — all errors are handled gracefully.
 */
import type { LogLevel, LogEntry } from "../types.js";
export declare function setGlobalLogLevel(level: LogLevel): void;
export declare function getGlobalLogLevel(): LogLevel;
export declare class StructuredLogger {
    private module;
    private minLevel;
    constructor(module: string, minLevel?: LogLevel);
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, error?: Error, context?: Record<string, unknown>): void;
    fatal(message: string, error?: Error, context?: Record<string, unknown>): void;
    child(subModule: string): StructuredLogger;
    static setSink(sink: (entry: LogEntry) => void): void;
    static resetSink(): void;
    private write;
}
export declare function createLogger(module: string): StructuredLogger;
//# sourceMappingURL=logger.d.ts.map