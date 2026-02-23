/**
 * Resilient HTTP Client
 *
 * Shared HTTP client with timeouts, retries, jittered exponential backoff,
 * and circuit breaker for all outbound Conway API calls.
 *
 * Phase 1.3: Network Resilience (P1-8, P1-9)
 */
import type { HttpClientConfig } from "../types.js";
export declare class CircuitOpenError extends Error {
    readonly resetAt: number;
    constructor(resetAt: number);
}
export declare class ResilientHttpClient {
    private consecutiveFailures;
    private circuitOpenUntil;
    private readonly config;
    constructor(config?: Partial<HttpClientConfig>);
    request(url: string, options?: RequestInit & {
        timeout?: number;
        idempotencyKey?: string;
        retries?: number;
    }): Promise<Response>;
    private backoff;
    isCircuitOpen(): boolean;
    resetCircuit(): void;
    getConsecutiveFailures(): number;
}
//# sourceMappingURL=http-client.d.ts.map