/**
 * Server-Side Solana RPC Proxy
 *
 * SECURITY CRITICAL: The frontend NEVER calls Solana RPC directly.
 * All RPC requests go through this proxy, which:
 *
 * 1. Strips the Helius/Alchemy API key from browser visibility
 * 2. Allowlists only safe read-only RPC methods
 * 3. Rate-limits per IP to prevent abuse
 * 4. Sanitizes all error messages (never leaks the upstream URL)
 * 5. Returns clean JSON — no headers, no URLs, no keys
 *
 * The AUTOMATON_RPC_URL env var contains the API key.
 * This file is the ONLY place that URL is ever used for browser-facing requests.
 */

import http from "http";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("rpc-proxy");

// ─── Allowed RPC Methods (read-only, no secrets) ─────────

const ALLOWED_RPC_METHODS = new Set([
  "getBalance",
  "getTokenAccountsByOwner",
  "getAccountInfo",
  "getLatestBlockhash",
  "getSlot",
  "getSignatureStatuses",
  "getTransaction",
  "getRecentPrioritizationFees",
]);

// ─── Rate Limiting ───────────────────────────────────────

interface RateBucket {
  count: number;
  windowStart: number;
}

const rateBuckets = new Map<string, RateBucket>();
const MAX_REQUESTS_PER_MINUTE = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  bucket.count++;
  return true;
}

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.windowStart < cutoff) rateBuckets.delete(ip);
  }
}, 300_000);

// ─── Proxy Handler ───────────────────────────────────────

/**
 * Returns the upstream RPC URL, resolved at call time from env.
 * NEVER cache this in a variable that could be inspected.
 */
function getUpstreamRpcUrl(): string {
  // Priority: AUTOMATON_RPC_URL > fallback to public devnet
  return process.env.AUTOMATON_RPC_URL || "https://api.devnet.solana.com";
}

/**
 * Handle an RPC proxy request.
 * Mount this at POST /api/rpc on your HTTP server.
 */
export async function handleRpcProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  // Only POST
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Rate limit by IP
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "unknown";

  if (!checkRateLimit(ip)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Rate limited. Try again in 60 seconds." }));
    return;
  }

  // Read body
  let body: string;
  try {
    body = await readBody(req, 10_000); // 10KB max for RPC requests
  } catch {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Request too large" }));
    return;
  }

  // Parse and validate the RPC request
  let rpcRequest: { jsonrpc: string; id: unknown; method: string; params: unknown[] };
  try {
    rpcRequest = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  // Validate structure
  if (
    rpcRequest.jsonrpc !== "2.0" ||
    typeof rpcRequest.method !== "string" ||
    !Array.isArray(rpcRequest.params)
  ) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON-RPC request" }));
    return;
  }

  // ALLOWLIST CHECK — block anything not explicitly permitted
  if (!ALLOWED_RPC_METHODS.has(rpcRequest.method)) {
    logger.warn(`Blocked RPC method: ${rpcRequest.method} from ${ip}`);
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "RPC method not allowed" }));
    return;
  }

  // Forward to upstream (with API key — browser never sees this URL)
  const upstreamUrl = getUpstreamRpcUrl();
  try {
    const upstreamResp = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcRequest.id,
        method: rpcRequest.method,
        params: rpcRequest.params,
      }),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    const upstreamData = await upstreamResp.text();

    // Return the RPC response — clean, no upstream URL leaked
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(upstreamData);
  } catch (err: any) {
    // SECURITY: Never include the upstream URL or error details in response
    logger.error("RPC proxy upstream error (details suppressed from client)");
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "RPC request failed" }));
  }
}

// ─── Helpers ─────────────────────────────────────────────

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
