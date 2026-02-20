/**
 * Resilient HTTP Client
 *
 * Shared HTTP client with timeouts, retries, jittered exponential backoff,
 * and circuit breaker for all outbound Conway API calls.
 *
 * Phase 1.3: Network Resilience (P1-8, P1-9)
 */

import type { HttpClientConfig } from "../types.js";
import { DEFAULT_HTTP_CLIENT_CONFIG } from "../types.js";

export class CircuitOpenError extends Error {
  constructor(public readonly resetAt: number) {
    super(
      `Circuit breaker is open until ${new Date(resetAt).toISOString()}`,
    );
    this.name = "CircuitOpenError";
  }
}

export class ResilientHttpClient {
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private readonly config: HttpClientConfig;
  private readonly persistKey: string | undefined;
  private kvStore: { getKV(key: string): string | undefined; setKV(key: string, value: string): void } | undefined;

  constructor(config?: Partial<HttpClientConfig> & {
    persistKey?: string;
    kvStore?: { getKV(key: string): string | undefined; setKV(key: string, value: string): void };
  }) {
    this.config = { ...DEFAULT_HTTP_CLIENT_CONFIG, ...config };
    this.persistKey = config?.persistKey;
    this.kvStore = config?.kvStore;

    // Restore persisted circuit breaker state
    if (this.persistKey && this.kvStore) {
      try {
        const persisted = this.kvStore.getKV(`circuit:${this.persistKey}`);
        if (persisted) {
          const openUntil = parseInt(persisted, 10);
          if (!isNaN(openUntil) && openUntil > Date.now()) {
            this.circuitOpenUntil = openUntil;
            this.consecutiveFailures = this.config.circuitBreakerThreshold;
          }
        }
      } catch {
        // Ignore — starting fresh is fine
      }
    }
  }

  async request(
    url: string,
    options?: RequestInit & {
      timeout?: number;
      idempotencyKey?: string;
      retries?: number;
    },
  ): Promise<Response> {
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
            this.persistCircuitState();
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
      } catch (error) {
        clearTimeout(timer);
        this.consecutiveFailures++;
        if (
          this.consecutiveFailures >= this.config.circuitBreakerThreshold
        ) {
          this.circuitOpenUntil =
            Date.now() + this.config.circuitBreakerResetMs;
          this.persistCircuitState();
        }
        if (attempt === maxRetries) throw error;
        await this.backoff(attempt);
      }
    }

    throw new Error("Unreachable");
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = Math.min(
      this.config.backoffBase *
        Math.pow(2, attempt) *
        (0.5 + Math.random()),
      this.config.backoffMax,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  isCircuitOpen(): boolean {
    return Date.now() < this.circuitOpenUntil;
  }

  resetCircuit(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
    this.persistCircuitState();
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  private persistCircuitState(): void {
    if (!this.persistKey || !this.kvStore) return;
    try {
      this.kvStore.setKV(
        `circuit:${this.persistKey}`,
        String(this.circuitOpenUntil),
      );
    } catch {
      // Persistence is best-effort; never block requests
    }
  }
}
