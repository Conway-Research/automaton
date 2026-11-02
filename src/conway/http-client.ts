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

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertSecureUrl(
  url: string,
  allowHttpOnLoopback: boolean,
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL for outbound request");
  }

  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("Outbound URL credentials and fragments are forbidden");
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol === "https:") {
    return;
  }

  const host = parsed.hostname.toLowerCase();
  if (protocol === "http:" && allowHttpOnLoopback && LOOPBACK_HOSTS.has(host)) {
    return;
  }

  throw new Error(
    "HTTPS required: refusing insecure outbound URL. " +
      "For local development, only loopback HTTP (localhost/127.0.0.1/::1) can be explicitly enabled.",
  );
}

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

  constructor(config?: Partial<HttpClientConfig>) {
    this.config = { ...DEFAULT_HTTP_CLIENT_CONFIG, ...config };
  }

  async request(
    url: string,
    options?: RequestInit & {
      timeout?: number;
      idempotencyKey?: string;
      retries?: number;
    },
  ): Promise<Response> {
    assertSecureUrl(url, this.config.allowHttpOnLoopback);

    if (this.isCircuitOpen()) {
      throw new CircuitOpenError(this.circuitOpenUntil);
    }

    const opts = options ?? {};
    const timeout = opts.timeout ?? this.config.baseTimeout;
    const maxRetries = opts.retries ?? this.config.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      opts.signal?.throwIfAborted();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...opts,
          // A trusted endpoint must not redirect authenticated traffic to a
          // different destination (including a local/metadata service).
          redirect: "error",
          signal: opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal,
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
      } catch (error) {
        clearTimeout(timer);
        if (opts.signal?.aborted) throw error;
        this.consecutiveFailures++;
        if (
          this.consecutiveFailures >= this.config.circuitBreakerThreshold
        ) {
          this.circuitOpenUntil =
            Date.now() + this.config.circuitBreakerResetMs;
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
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
}
