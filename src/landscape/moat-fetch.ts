/**
 * Moat-Proxied HTTP Fetch
 *
 * The scout is sandboxed with no internet. All external HTTP goes through
 * the Moat Gateway's http.proxy capability. This helper wraps that flow
 * so callers can use a familiar fetch-like interface.
 *
 * Usage:
 *   const res = await moatFetch("https://api.github.com/zen");
 *   // res = { status_code: 200, headers: {...}, body: "...", content_type: "..." }
 */

const MOAT_GATEWAY_URL =
  process.env.MOAT_GATEWAY_URL || "http://moat-gateway:8002";
const TENANT_ID = process.env.MOAT_TENANT_ID || "automaton";

export interface MoatFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface MoatFetchResult {
  ok: boolean;
  status_code: number;
  headers: Record<string, string>;
  body: unknown;
  content_type: string;
}

/**
 * Fetch a URL through the Moat Gateway HTTP proxy.
 * Domain must be on the gateway's allowlist.
 */
export async function moatFetch(
  url: string,
  options: MoatFetchOptions = {},
): Promise<MoatFetchResult> {
  const payload = {
    tenant_id: TENANT_ID,
    scope: "execute",
    params: {
      url,
      method: options.method || "GET",
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.body !== undefined ? { body: options.body } : {}),
      ...(options.timeout ? { timeout: options.timeout } : {}),
    },
  };

  const response = await fetch(`${MOAT_GATEWAY_URL}/execute/http.proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_ID,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(35000), // slightly above proxy max
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      status_code: response.status,
      headers: {},
      body: { error: `Moat gateway error: ${response.status}`, detail: text },
      content_type: "application/json",
    };
  }

  const receipt = (await response.json()) as {
    status: string;
    result: MoatFetchResult;
  };

  const result = receipt.result || ({} as MoatFetchResult);
  return {
    ok: result.status_code >= 200 && result.status_code < 400,
    status_code: result.status_code || 0,
    headers: result.headers || {},
    body: result.body,
    content_type: result.content_type || "",
  };
}

/**
 * Convenience: moatFetch that returns parsed JSON body or null on failure.
 */
export async function moatFetchJSON<T = unknown>(
  url: string,
  options: MoatFetchOptions = {},
): Promise<T | null> {
  const result = await moatFetch(url, options);
  if (!result.ok) return null;

  if (typeof result.body === "string") {
    try {
      return JSON.parse(result.body) as T;
    } catch {
      return null;
    }
  }

  return result.body as T;
}
