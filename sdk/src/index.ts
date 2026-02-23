/**
 * GLM-wangcai Receipt2CSV SDK
 *
 * TypeScript SDK for integrating GLM-wangcai's receipt parsing service
 * into your AI agents.
 *
 * @packageDocumentation
 */

/**
 * SDK configuration options
 */
export interface WangcaiConfig {
  /** Service endpoint (default: production endpoint) */
  endpoint?: string;
  /** Agent ID to use for payments (default: 18893) */
  agentId?: bigint;
  /** Auto-pay when 402 received (default: false) */
  autoPay?: boolean;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Result of a conversion request
 */
export interface ConversionResult {
  /** Whether the conversion was successful */
  success: boolean;
  /** CSV output (on success) */
  csv?: string;
  /** Number of rows parsed (on success) */
  rows?: number;
  /** Error message (on failure) */
  error?: string;
  /** Whether this was a free tier call */
  freeTier?: boolean;
  /** Remaining free calls */
  freeRemaining?: number;
  /** Price charged (if paid) */
  priceCharged?: number;
}

/**
 * Public service statistics
 */
export interface ServiceStats {
  total_processed: number;
  successful: number;
  failed: number;
  success_rate: string;
  avg_response_time: string;
  uptime_days: number;
  last_request: string;
  recent_reviews: Array<{
    wallet: string;
    rating: number;
    comment: string;
    timestamp: string;
  }>;
}

/**
 * Payment required response from server
 */
interface PaymentRequiredResponse {
  price?: number;
  wallet: string;
}

/**
 * Error response from server
 */
interface ErrorResponse {
  error?: string;
}

/**
 * Health check response
 */
interface HealthResponse {
  status: string;
  version: string;
  startTime: string;
}

/**
 * Stats API response
 */
interface StatsResponse {
  service: string;
  agent_id: number;
  stats: ServiceStats;
}

/**
 * Review submission response
 */
interface ReviewResponse {
  success: boolean;
  message: string;
}

/**
 * Payment required error
 */
export class PaymentRequiredError extends Error {
  public readonly amount: number;
  public readonly wallet: string;
  public readonly currency: string;

  constructor(data: { amount: number; wallet: string; currency: string }) {
    super(`Payment required: ${data.amount} ${data.currency}`);
    this.name = "PaymentRequiredError";
    this.amount = data.amount;
    this.wallet = data.wallet;
    this.currency = data.currency;
  }
}

/**
 * GLM-wangcai SDK for receipt to CSV conversion
 *
 * @example
 * ```typescript
 * const wangcai = new WangcaiSDK();
 *
 * // Convert receipt text
 * const result = await wangcai.convert("Starbucks Receipt\nLatte $4.50\nTotal $4.50");
 * console.log(result.csv);
 *
 * // Check stats
 * const stats = await wangcai.getStats();
 * console.log(`Success rate: ${stats.success_rate}`);
 * ```
 */
export class WangcaiSDK {
  private readonly endpoint: string;
  private readonly agentId: bigint;
  private readonly autoPay: boolean;
  private readonly timeout: number;

  /** Default production endpoint */
  public static readonly DEFAULT_ENDPOINT =
    "https://8080-f08a2e14b6b539fbd71836259c2fb688.conway.tech";

  /** GLM-wangcai's Agent ID */
  public static readonly AGENT_ID = BigInt(18893);

  constructor(config: WangcaiConfig = {}) {
    this.endpoint = config.endpoint || WangcaiSDK.DEFAULT_ENDPOINT;
    this.agentId = config.agentId || WangcaiSDK.AGENT_ID;
    this.autoPay = config.autoPay ?? false;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Convert receipt text to CSV format
   *
   * @param text - Receipt text content
   * @param userAddress - Optional user wallet address for free tier tracking
   * @param paymentTx - Optional payment transaction hash (for paid calls)
   * @returns Conversion result with CSV data
   */
  async convert(
    text: string,
    userAddress?: string,
    paymentTx?: string,
  ): Promise<ConversionResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (userAddress) {
      headers["X-User-Address"] = userAddress;
    }

    if (paymentTx) {
      headers["X-Payment"] = paymentTx;
    }

    const response = await this.fetch(`${this.endpoint}/convert`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
    });

    // Handle payment required
    if (response.status === 402) {
      const data = (await response.json()) as PaymentRequiredResponse;
      throw new PaymentRequiredError({
        amount: data.price || 0.1,
        wallet: data.wallet,
        currency: "USDC",
      });
    }

    // Handle other errors
    if (!response.ok) {
      const data = (await response
        .json()
        .catch(
          () => ({ error: "Unknown error" }) as ErrorResponse,
        )) as ErrorResponse;
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    // Parse successful response
    const csvText = await response.text();
    const rows = csvText.split("\n").length - 1; // Subtract header row

    return {
      success: true,
      csv: csvText,
      rows,
      freeTier: response.headers.get("X-Payment-Received") === "free-trial",
      freeRemaining: parseInt(
        response.headers.get("X-Free-Remaining") || "0",
        10,
      ),
      priceCharged: parseFloat(response.headers.get("X-Next-Price") || "0"),
    };
  }

  /**
   * Get public service statistics
   */
  async getStats(): Promise<StatsResponse> {
    const response = await this.fetch(`${this.endpoint}/stats/public`);
    return response.json() as Promise<StatsResponse>;
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<HealthResponse> {
    const response = await this.fetch(`${this.endpoint}/health`);
    return response.json() as Promise<HealthResponse>;
  }

  /**
   * Get SVG status badge URL
   */
  getBadgeUrl(): string {
    return `${this.endpoint}/stats/badge`;
  }

  /**
   * Submit a review
   *
   * @param rating - Rating from 1 to 5
   * @param comment - Review comment
   * @param userAddress - Optional user wallet address
   */
  async submitReview(
    rating: number,
    comment: string,
    userAddress?: string,
  ): Promise<{ success: boolean; message: string }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (userAddress) {
      headers["X-User-Address"] = userAddress;
    }

    const response = await this.fetch(`${this.endpoint}/review`, {
      method: "POST",
      headers,
      body: JSON.stringify({ rating, comment }),
    });

    return response.json() as Promise<ReviewResponse>;
  }

  /**
   * Convert multiple receipts in batch
   *
   * @param texts - Array of receipt texts
   * @param userAddress - Optional user wallet address
   * @returns Array of conversion results
   */
  async batchConvert(
    texts: string[],
    userAddress?: string,
  ): Promise<ConversionResult[]> {
    return Promise.all(texts.map((text) => this.convert(text, userAddress)));
  }

  /**
   * Fetch with timeout
   */
  private async fetch(url: string, options?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default WangcaiSDK;
