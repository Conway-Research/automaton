/**
 * Structured Logger
 *
 * JSON-formatted structured logging with levels, context, and child loggers.
 * Uses process.stdout.write to avoid console.log recursion.
 * Never throws — all errors are handled gracefully.
 */
import { LOG_LEVEL_PRIORITY } from "../types.js";
let globalLogLevel = "info";
let customSink = null;
export function setGlobalLogLevel(level) {
    globalLogLevel = level;
}
export function getGlobalLogLevel() {
    return globalLogLevel;
}
export class StructuredLogger {
    module;
    minLevel;
    constructor(module, minLevel) {
        this.module = module;
        this.minLevel = minLevel ?? globalLogLevel;
    }
    debug(message, context) {
        this.write("debug", message, undefined, context);
    }
    info(message, context) {
        this.write("info", message, undefined, context);
    }
    warn(message, context) {
        this.write("warn", message, undefined, context);
    }
    error(message, error, context) {
        this.write("error", message, error, context);
    }
    fatal(message, error, context) {
        this.write("fatal", message, error, context);
    }
    child(subModule) {
        return new StructuredLogger(`${this.module}.${subModule}`, this.minLevel);
    }
    static setSink(sink) {
        customSink = sink;
    }
    static resetSink() {
        customSink = null;
    }
    write(level, message, error, context) {
        try {
            const effectiveLevel = this.minLevel ?? globalLogLevel;
            if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[effectiveLevel]) {
                return;
            }
            const entry = {
                timestamp: new Date().toISOString(),
                level,
                module: this.module,
                message,
            };
            if (context && Object.keys(context).length > 0) {
                entry.context = context;
            }
            if (error) {
                entry.error = {
                    message: error.message,
                    stack: error.stack,
                };
                if (error.code) {
                    entry.error.code = error.code;
                }
            }
            if (customSink) {
                customSink(entry);
                return;
            }
            const json = JSON.stringify(entry);
            process.stdout.write(json + "\n");
        }
        catch {
            // Fallback if JSON serialization fails
            try {
                process.stderr.write(`[logger-fallback] ${message}\n`);
            }
            catch {
                // Completely silent — never throw from logger
            }
        }
    }
}
export function createLogger(module) {
    return new StructuredLogger(module);
}
//# sourceMappingURL=logger.js.map