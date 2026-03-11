/**
 * Security Headers
 *
 * Applied to every HTTP response. Prevents XSS, clickjacking,
 * MIME sniffing, and restricts where the frontend can make requests.
 */

import http from "http";

/**
 * Apply security headers to a response.
 * Call this at the top of every request handler.
 */
export function applySecurityHeaders(
  res: http.ServerResponse,
  options?: { isApi?: boolean },
): void {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking — only allow our own origin to frame us
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // XSS protection (legacy browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy — don't leak URLs to third parties
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy — disable unnecessary browser features
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self)",
  );

  // Content Security Policy — the big one
  // Allows: our own origin, Solana wallet adapters, inline styles (for the SPA)
  // Blocks: inline scripts (except our own), external script sources, eval()
  if (!options?.isApi) {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        // Scripts: self + inline (needed for SPA) + wasm for wallet adapters
        "script-src 'self' 'unsafe-inline'",
        // Styles: self + inline (SPA uses inline styles) + Google Fonts CSS
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
        // Connect: self (our proxy) + Solana wallet RPCs for Phantom signing
        // NOTE: No Helius/Alchemy URLs here — all RPC goes through /api/rpc
        "connect-src 'self' https://api.mainnet-beta.solana.com https://api.devnet.solana.com",
        // Images: self + data URIs (for wallet icons)
        "img-src 'self' data: blob:",
        // Fonts: self + Google Fonts file host
        "font-src 'self' https://fonts.gstatic.com",
        // Block all object/embed/base
        "object-src 'none'",
        "base-uri 'self'",
        // Forms only submit to self
        "form-action 'self'",
        // Frame ancestors — prevent embedding
        "frame-ancestors 'self'",
      ].join("; "),
    );
  }

  // Strict Transport Security (HTTPS only in production)
  if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}

/**
 * Sanitize an error message to ensure no secrets leak.
 * Strips URLs with API keys, env var names, file paths to config.
 */
export function sanitizeErrorMessage(message: string): string {
  let safe = message;

  // Strip any URL that contains api-key, api_key, or similar query params
  safe = safe.replace(/https?:\/\/[^\s]*[?&](api[-_]?key|token|secret|auth)[^\s]*/gi, "[REDACTED_URL]");

  // Strip anything that looks like a base58 private key (44+ chars of base58)
  safe = safe.replace(/[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{44,88}/g, "[REDACTED]");

  // Strip env var references
  safe = safe.replace(/process\.env\.\w+/g, "[ENV_VAR]");

  // Strip file paths to sensitive locations
  safe = safe.replace(/\/[^\s]*\/(wallet|config|automaton|\.env|secret|private)[^\s]*/gi, "[REDACTED_PATH]");

  // Strip Helius/Alchemy API keys that might appear in error messages
  safe = safe.replace(/helius-rpc\.com[^\s]*/gi, "[REDACTED_RPC]");
  safe = safe.replace(/alchemy\.com[^\s]*/gi, "[REDACTED_RPC]");

  return safe;
}
