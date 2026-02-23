/**
 * Resilient HTTP Client
 *
 * Shared HTTP client with timeouts, retries, jittered exponential backoff,
 * and circuit breaker for all outbound Conway API calls.
 *
 * Phase 1.3: Network Resilience (P1-8, P1-9)
 */
import { DEFAULT_HTTP_CLIENT_CONFIG } from "../types.js";
export class CircuitOpenError extends Error {
    resetAt;
    constructor(resetAt) {
        super(`Circuit breaker is open until ${new Date(resetAt).toISOString()}`);
        this.resetAt = resetAt;
        this.name = "CircuitOpenError";
    }
}
export class ResilientHttpClient {
    consecutiveFailures = 0;
    circuitOpenUntil = 0;
    config;
    constructor(config) {
        this.config = { ...DEFAULT_HTTP_CLIENT_CONFIG, ...config };
    }
    async request(url, options) {
        if (this.isCircuitOpen()) {
            throw new CircuitOpenError(this.circuitOpenUntil);
        }
        const opts = options ?? {};
        const timeout = opts.timeout ?? this.config.baseTimeout;
        const maxRetries = opts.retries ?? this.config.maxRetries;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, {
                    ...opts,
                    signal: controller.signal,
                    headers: {
                        ...opts.headers,
                        ...(opts.idempotencyKey
                            ? { "Idempotency-Key": opts.idempotencyKey }
                            : {}),
                    },
                });
                clearTimeout(timer);
                // Count retryable HTTP errors toward circuit breaker, regardless of
                // whether we will actually retry. A server consistently returning 502
                // should eventually trip the circuit breaker.
                if (this.config.retryableStatuses.includes(response.status)) {
                    this.consecutiveFailures++;
                    if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
                        this.circuitOpenUntil = Date.now() + this.config.circuitBreakerResetMs;
                    }
                    if (attempt < maxRetries) {
                        await this.backoff(attempt);
                        continue;
                    }
                    return response;
                }
                // Only reset failure counter on truly successful responses
                this.consecutiveFailures = 0;
                return response;
            }
            catch (error) {
                clearTimeout(timer);
                this.consecutiveFailures++;
                if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
                    this.circuitOpenUntil =
                        Date.now() + this.config.circuitBreakerResetMs;
                }
                if (attempt === maxRetries)
                    throw error;
                await this.backoff(attempt);
            }
        }
        throw new Error("Unreachable");
    }
    async backoff(attempt) {
        const delay = Math.min(this.config.backoffBase *
            Math.pow(2, attempt) *
            (0.5 + Math.random()), this.config.backoffMax);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    isCircuitOpen() {
        return Date.now() < this.circuitOpenUntil;
    }
    resetCircuit() {
        this.consecutiveFailures = 0;
        this.circuitOpenUntil = 0;
    }
    getConsecutiveFailures() {
        return this.consecutiveFailures;
    }
}
//# sourceMappingURL=http-client.js.map