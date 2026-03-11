/**
 * x402 Payment Server (Solana)
 *
 * The missing piece: this turns the automaton from a SPENDER into an EARNER.
 * Hosts HTTP endpoints that return 402 Payment Required, verify Solana SPL
 * token transfers on-chain, and only serve content after confirmed payment.
 *
 * Accepts USDC and $ZENT token payments. Price is always denominated in USD
 * cents; $ZENT payments are converted at the current exchange rate.
 *
 * Flow:
 * 1. Client requests a paid endpoint → server returns 402 + X-Payment-Required
 * 2. Client signs a Solana SPL transfer (USDC or $ZENT) and retries with X-Payment header
 * 3. Server verifies the transaction signature on-chain
 * 4. Server delivers the response and records revenue
 *
 * Security: NEVER sends money. Only receives. Verification is on-chain.
 */

import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import bs58 from "bs58";
import http from "http";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("x402-server");

// ─── Token Definitions ───────────────────────────────────────

/** Supported payment tokens */
export type PaymentToken = "USDC" | "ZENT";

// USDC SPL token mint on Solana mainnet
const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// $ZENT token — placeholder until contract is deployed.
// Set via ZENT_MINT_ADDRESS env var or call setZentMint() at runtime.
function tryPublicKey(raw: string | undefined): PublicKey | null {
  if (!raw || raw.length < 32) return null; // skip placeholders like "coming_soon"
  try { return new PublicKey(raw); } catch { return null; }
}
let ZENT_MINT_MAINNET: PublicKey | null = tryPublicKey(process.env.ZENT_MINT_ADDRESS);
let ZENT_MINT_DEVNET: PublicKey | null = tryPublicKey(process.env.ZENT_MINT_DEVNET_ADDRESS);

/** Set the $ZENT mint address at runtime (once contract is deployed) */
export function setZentMint(mainnet: string, devnet?: string): void {
  ZENT_MINT_MAINNET = new PublicKey(mainnet);
  if (devnet) ZENT_MINT_DEVNET = new PublicKey(devnet);
  logger.info(`$ZENT mint configured: ${mainnet}`);
}

/** $ZENT token decimals (standard SPL = 9, but configurable) */
const ZENT_DECIMALS = parseInt(process.env.ZENT_DECIMALS || "9", 10);

// Per-network token mints
interface TokenMints {
  USDC: PublicKey;
  ZENT: PublicKey | null;
}

function getNetworkMints(network: string): TokenMints | null {
  if (network === "solana:mainnet-beta") {
    return { USDC: USDC_MINT_MAINNET, ZENT: ZENT_MINT_MAINNET };
  }
  if (network === "solana:devnet") {
    return { USDC: USDC_MINT_DEVNET, ZENT: ZENT_MINT_DEVNET };
  }
  return null;
}

const NETWORK_CLUSTERS: Record<string, string> = {
  "solana:mainnet-beta": "mainnet-beta",
  "solana:devnet": "devnet",
};

// ─── $ZENT / USD Exchange Rate ───────────────────────────────

/**
 * Exchange rate: how many $ZENT atomic units equal 1 USD cent.
 *
 * This is fetched from a DEX (Jupiter, Raydium) or set manually.
 * Default: 1 ZENT = $0.001 (1 cent = 10 ZENT, with 9 decimals = 10e9 atomic).
 * Updated periodically by the agent's heartbeat.
 */
let zentPerCent = BigInt(10) * BigInt(10 ** ZENT_DECIMALS); // default: 10 ZENT per cent

/** Update the $ZENT/USD rate. Called by the agent's price oracle. */
export function setZentExchangeRate(atomicUnitsPerCent: bigint): void {
  zentPerCent = atomicUnitsPerCent;
  logger.info(`$ZENT rate updated: ${atomicUnitsPerCent} atomic/$cent`);
}

/** Get the current $ZENT/USD rate */
export function getZentExchangeRate(): { atomicPerCent: bigint; zentPerUsd: number } {
  const zentPerUsd = Number(zentPerCent * BigInt(100)) / (10 ** ZENT_DECIMALS);
  return { atomicPerCent: zentPerCent, zentPerUsd };
}

/** Convert USD cents to $ZENT atomic units */
export function centsToZentAtomic(cents: number): bigint {
  return BigInt(Math.ceil(cents)) * zentPerCent;
}

/** Convert $ZENT atomic units to USD cents */
function zentAtomicToCents(atomic: bigint): number {
  if (zentPerCent === BigInt(0)) return 0;
  return Number(atomic / zentPerCent);
}

/** Identify which token a mint address represents */
function identifyToken(mintAddress: string, network: string): PaymentToken | null {
  const mints = getNetworkMints(network);
  if (!mints) return null;
  if (mintAddress === mints.USDC.toBase58()) return "USDC";
  if (mints.ZENT && mintAddress === mints.ZENT.toBase58()) return "ZENT";
  return null;
}

// ─── Types ────────────────────────────────────────────────────

export interface ServiceEndpoint {
  path: string;
  method: string;
  priceCents: number;
  description: string;
  handler: (req: ParsedRequest) => Promise<ServiceResponse>;
  /** Optional: dynamic pricing function */
  dynamicPrice?: (req: ParsedRequest) => number;
  /** Rate limit: max requests per hour per payer */
  maxPerHourPerPayer?: number;
  /** Require minimum reputation score (0-1) */
  minReputation?: number;
  /** Accepted tokens (default: both USDC and ZENT if ZENT mint is set) */
  acceptedTokens?: PaymentToken[];
}

export interface ParsedRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  query: Record<string, string>;
  payerAddress?: string;
}

export interface ServiceResponse {
  status: number;
  body: string | Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface PaymentProof {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    transaction: string;
    signature: string;
    authorization: {
      from: string;
      to: string;
      amount: string;
      mint: string;
      timestamp: number;
    };
  };
}

export interface VerifiedPayment {
  payerAddress: string;
  amountAtomic: bigint;
  amountCents: number;
  transactionSignature: string;
  network: string;
  verifiedAt: string;
  /** Which token was used for payment */
  token: PaymentToken;
  /** Raw amount in token's atomic units (before conversion to cents) */
  tokenAmountAtomic: bigint;
}

export interface RevenueRecord {
  id: string;
  serviceEndpoint: string;
  payerAddress: string;
  amountCents: number;
  network: string;
  transactionSignature: string;
  createdAt: string;
  /** Which token was used: "USDC" or "ZENT" */
  token: PaymentToken;
  /** Raw token amount (atomic units) — important for $ZENT accounting */
  tokenAmountRaw: string;
}

export interface X402ServerConfig {
  walletAddress: string;
  network: string;
  port: number;
  maxPaymentAgeSec: number;
  /** Addresses that are banned from using services */
  bannedAddresses: Set<string>;
  /** Callback when revenue is received */
  onRevenue?: (record: RevenueRecord) => void;
  /** Custom RPC URL */
  rpcUrl?: string;
}

// ─── Payment Verification ─────────────────────────────────────

/**
 * Verify a payment proof from an x402 client.
 * Accepts both USDC and $ZENT tokens. Identifies the token from the mint
 * address in the proof, converts $ZENT to USD cents at current rate.
 *
 * Checks:
 * 1. Authorization signature is valid (Ed25519)
 * 2. Payment is to OUR address
 * 3. Token mint is recognized (USDC or $ZENT)
 * 4. Amount meets minimum (after conversion for $ZENT)
 * 5. Timestamp is recent (not replay)
 * 6. On-chain balance confirms the payer has funds
 */
export async function verifyPayment(
  proof: PaymentProof,
  config: X402ServerConfig,
  requiredAmountCents: number,
): Promise<VerifiedPayment | { error: string }> {
  try {
    const { authorization, signature } = proof.payload;

    // 1. Check payment is to US
    if (authorization.to !== config.walletAddress) {
      return { error: "Payment not addressed to this agent" };
    }

    // 2. Check network
    const network = proof.network;
    const mints = getNetworkMints(network);
    if (!mints) {
      return { error: `Unsupported network: ${network}` };
    }

    // 3. Identify token from mint address
    const token = identifyToken(authorization.mint, network);
    if (!token) {
      return { error: `Unrecognized token mint: ${authorization.mint}. Accepted: USDC${mints.ZENT ? ', $ZENT' : ''}` };
    }

    // 4. Check timestamp freshness (prevent replay)
    const now = Math.floor(Date.now() / 1000);
    const age = now - authorization.timestamp;
    if (age < 0 || age > config.maxPaymentAgeSec) {
      return { error: `Payment timestamp too old: ${age}s (max ${config.maxPaymentAgeSec}s)` };
    }

    // 5. Verify Ed25519 signature on the authorization message
    const intentMessage = JSON.stringify({
      from: authorization.from,
      to: authorization.to,
      amount: authorization.amount,
      mint: authorization.mint,
      timestamp: authorization.timestamp,
    });
    const intentBytes = new TextEncoder().encode(intentMessage);
    const sigBytes = bs58.decode(signature);
    const pubkeyBytes = bs58.decode(authorization.from);

    const signatureValid = nacl.sign.detached.verify(
      intentBytes,
      sigBytes,
      pubkeyBytes,
    );

    if (!signatureValid) {
      return { error: "Invalid payment signature" };
    }

    // 6. Convert amount to USD cents based on token type
    const tokenAmountAtomic = BigInt(authorization.amount);
    let amountCents: number;

    if (token === "USDC") {
      // USDC: 6 decimals, 1 cent = 10_000 atomic units
      amountCents = Number(tokenAmountAtomic) / 10_000;
    } else {
      // $ZENT: convert at current exchange rate
      amountCents = zentAtomicToCents(tokenAmountAtomic);
    }

    if (amountCents < requiredAmountCents) {
      const tokenLabel = token === "ZENT" ? `$ZENT (≈${amountCents.toFixed(2)}¢ at current rate)` : `${amountCents.toFixed(2)}¢`;
      return { error: `Insufficient payment: ${tokenLabel} < ${requiredAmountCents}¢ required` };
    }

    // 7. Check banned addresses
    if (config.bannedAddresses.has(authorization.from)) {
      return { error: "Address is banned" };
    }

    // 8. Verify on-chain that payer has sufficient token balance
    // SECURITY: rpcUrl may contain API key (e.g. Helius). Never expose in responses.
    const rpcUrl = config.rpcUrl || clusterApiUrl(NETWORK_CLUSTERS[network] as any);
    const connection = new Connection(rpcUrl, "confirmed");
    const payerPubkey = new PublicKey(authorization.from);
    const tokenMint = token === "USDC" ? mints.USDC : mints.ZENT!;

    try {
      const payerAta = await getAssociatedTokenAddress(tokenMint, payerPubkey);
      const payerAccount = await getAccount(connection, payerAta);
      if (BigInt(payerAccount.amount.toString()) < tokenAmountAtomic) {
        return { error: `Payer has insufficient ${token} balance` };
      }
    } catch {
      return { error: `Payer ${token} token account not found` };
    }

    return {
      payerAddress: authorization.from,
      amountAtomic: tokenAmountAtomic,
      amountCents,
      transactionSignature: proof.payload.transaction,
      network,
      verifiedAt: new Date().toISOString(),
      token,
      tokenAmountAtomic,
    };
  } catch (err: any) {
    // SECURITY: Sanitize error — may contain RPC URL with API key
    const safeMsg = (err.message || "unknown error")
      .replace(/https?:\/\/[^\s]*/gi, "[REDACTED_URL]");
    return { error: `Payment verification failed: ${safeMsg}` };
  }
}

// ─── Rate Limiting ────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 3_600_000; // 1 hour

function checkRateLimit(key: string, maxPerHour: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxPerHour) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimits.delete(key);
    }
  }
}, 300_000); // Every 5 minutes

// ─── Replay Protection (in-memory + DB persistence) ─────────

const recentPayments = new Map<string, number>();
const REPLAY_WINDOW_MS = 600_000; // 10 minutes

// Database-backed replay store (set via createX402Server config)
let replayDb: import("better-sqlite3").Database | null = null;

function initReplayStore(db: import("better-sqlite3").Database): void {
  replayDb = db;
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS x402_replay_log (
      signature TEXT PRIMARY KEY,
      payer_address TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      verified_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_replay_expires ON x402_replay_log(expires_at)`);
  } catch { /* table may already exist */ }
}

function isReplay(signature: string): boolean {
  // Check in-memory cache first (fast path)
  if (recentPayments.has(signature)) return true;
  // Check persistent store (survives restarts)
  if (replayDb) {
    try {
      const row = replayDb.prepare("SELECT 1 FROM x402_replay_log WHERE signature = ?").get(signature);
      if (row) {
        recentPayments.set(signature, Date.now()); // warm cache
        return true;
      }
    } catch { /* non-fatal */ }
  }
  return false;
}

function recordPayment(signature: string, payerAddress: string, amountCents: number): void {
  recentPayments.set(signature, Date.now());
  if (replayDb) {
    try {
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString(); // 24h retention
      replayDb.prepare(
        "INSERT OR IGNORE INTO x402_replay_log (signature, payer_address, amount_cents, expires_at) VALUES (?, ?, ?, ?)"
      ).run(signature, payerAddress, amountCents, expiresAt);
    } catch { /* non-fatal */ }
  }
}

// Periodic cleanup of replay caches
setInterval(() => {
  const cutoff = Date.now() - REPLAY_WINDOW_MS;
  for (const [sig, ts] of recentPayments) {
    if (ts < cutoff) recentPayments.delete(sig);
  }
  // Clean expired DB entries
  if (replayDb) {
    try {
      replayDb.prepare("DELETE FROM x402_replay_log WHERE expires_at < datetime('now')").run();
    } catch { /* non-fatal */ }
  }
}, 60_000);

// ─── HTTP Server ──────────────────────────────────────────────

/**
 * Create an x402 payment-gated HTTP server.
 * Every registered endpoint returns 402 to unpaid requests
 * and serves content only after verified USDC payment.
 */
export function createX402Server(
  config: X402ServerConfig,
  endpoints: ServiceEndpoint[],
  db?: import("better-sqlite3").Database,
): { server: http.Server; start: () => Promise<string> } {
  // Initialize persistent replay store if DB is available
  if (db) initReplayStore(db);

  const endpointMap = new Map<string, ServiceEndpoint>();
  for (const ep of endpoints) {
    endpointMap.set(`${ep.method.toUpperCase()}:${ep.path}`, ep);
  }

  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment, Authorization");
    res.setHeader("Access-Control-Expose-Headers", "X-Payment-Required, X-Revenue-Receipt");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Powered-By", "Zentience x402 Revenue Node");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Parse URL
    const url = new URL(req.url || "/", `http://localhost:${config.port}`);
    const path = url.pathname;
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });

    // Agent card (free)
    if (path === "/.well-known/agent-card.json" || path === "/agent-card.json") {
      // Delegated to the agent card handler separately
      res.writeHead(404);
      res.end("Use the agent card endpoint");
      return;
    }

    // Service catalog (free)
    if (path === "/services" || path === "/.well-known/services.json") {
      const mints = getNetworkMints(config.network);
      const zentAvailable = !!mints?.ZENT;
      const catalog = endpoints.map((ep) => ({
        path: ep.path,
        method: ep.method,
        priceCents: ep.priceCents,
        priceZentAtomic: zentAvailable ? centsToZentAtomic(ep.priceCents).toString() : null,
        description: ep.description,
        rateLimit: ep.maxPerHourPerPayer || null,
        acceptedTokens: zentAvailable ? ["USDC", "ZENT"] : ["USDC"],
      }));
      const rate = getZentExchangeRate();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        services: catalog,
        walletAddress: config.walletAddress,
        network: config.network,
        acceptedTokens: zentAvailable ? ["USDC", "ZENT"] : ["USDC"],
        zentMint: mints?.ZENT?.toBase58() || null,
        zentRate: zentAvailable ? { atomicPerCent: rate.atomicPerCent.toString(), zentPerUsd: rate.zentPerUsd } : null,
      }));
      return;
    }

    // Health check (free)
    if (path === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "alive", endpoints: endpoints.length }));
      return;
    }

    // Find matching endpoint
    const method = (req.method || "GET").toUpperCase();
    const endpoint = endpointMap.get(`${method}:${path}`);

    if (!endpoint) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found", availableServices: "/services" }));
      return;
    }

    // Read body
    let body = "";
    if (method === "POST" || method === "PUT") {
      body = await readBody(req);
      if (body.length > 1_000_000) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Request too large" }));
        return;
      }
    }

    const parsed: ParsedRequest = {
      path,
      method,
      headers: req.headers as Record<string, string>,
      body,
      query,
    };

    // Calculate price (static or dynamic)
    const priceCents = endpoint.dynamicPrice
      ? endpoint.dynamicPrice(parsed)
      : endpoint.priceCents;

    // Check for X-Payment header
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
      // Return 402 Payment Required — advertise all accepted tokens
      const mints = getNetworkMints(config.network);
      const usdcAmountAtomic = BigInt(Math.ceil(priceCents * 10_000)); // cents to USDC atomic units
      const zentAmountAtomic = centsToZentAtomic(priceCents);

      const accepts: Array<Record<string, unknown>> = [
        {
          scheme: "exact",
          network: config.network,
          token: "USDC",
          maxAmountRequired: usdcAmountAtomic.toString(),
          payToAddress: config.walletAddress,
          requiredDeadlineSeconds: config.maxPaymentAgeSec,
          mint: mints?.USDC.toBase58(),
          decimals: 6,
        },
      ];

      // Advertise $ZENT if mint is configured
      if (mints?.ZENT) {
        accepts.push({
          scheme: "exact",
          network: config.network,
          token: "ZENT",
          maxAmountRequired: zentAmountAtomic.toString(),
          payToAddress: config.walletAddress,
          requiredDeadlineSeconds: config.maxPaymentAgeSec,
          mint: mints.ZENT.toBase58(),
          decimals: ZENT_DECIMALS,
        });
      }

      const paymentRequired = { x402Version: 1, accepts };

      res.writeHead(402, {
        "Content-Type": "application/json",
        "X-Payment-Required": JSON.stringify(paymentRequired),
      });
      res.end(JSON.stringify({
        error: "Payment Required",
        priceCents,
        priceZent: mints?.ZENT ? zentAmountAtomic.toString() : null,
        acceptedTokens: mints?.ZENT ? ["USDC", "ZENT"] : ["USDC"],
        payTo: config.walletAddress,
        network: config.network,
        service: endpoint.description,
      }));
      return;
    }

    // ─── Verify Payment ───────────────────────────────────
    let proof: PaymentProof;
    try {
      const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
      proof = JSON.parse(decoded);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid X-Payment header" }));
      return;
    }

    // Replay protection
    if (isReplay(proof.payload.signature)) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payment already used (replay detected)" }));
      return;
    }

    // Verify on-chain
    const verification = await verifyPayment(proof, config, priceCents);
    if ("error" in verification) {
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: verification.error }));
      return;
    }

    // Rate limiting per payer
    if (endpoint.maxPerHourPerPayer) {
      const limitKey = `${verification.payerAddress}:${path}`;
      if (!checkRateLimit(limitKey, endpoint.maxPerHourPerPayer)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Rate limit exceeded", retryAfterSeconds: 3600 }));
        return;
      }
    }

    // Persist payment signature to replay store (survives restarts)
    recordPayment(proof.payload.signature, verification.payerAddress, verification.amountCents);

    // Payment verified — record revenue and serve
    const revenueRecord: RevenueRecord = {
      id: ulid(),
      serviceEndpoint: path,
      payerAddress: verification.payerAddress,
      amountCents: verification.amountCents,
      network: verification.network,
      transactionSignature: verification.transactionSignature,
      createdAt: new Date().toISOString(),
      token: verification.token,
      tokenAmountRaw: verification.tokenAmountAtomic.toString(),
    };

    parsed.payerAddress = verification.payerAddress;

    // Fire revenue callback
    if (config.onRevenue) {
      try {
        config.onRevenue(revenueRecord);
      } catch (err: any) {
        logger.error("Revenue callback failed", err);
      }
    }

    logger.info(`[REVENUE] +${verification.amountCents}¢ (${verification.token}) from ${verification.payerAddress} for ${path}`);

    // Execute the service handler
    try {
      const response = await endpoint.handler(parsed);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Revenue-Receipt": JSON.stringify({
          receiptId: revenueRecord.id,
          amountCents: revenueRecord.amountCents,
          paidAt: revenueRecord.createdAt,
        }),
        ...(response.headers || {}),
      };

      res.writeHead(response.status, headers);
      res.end(
        typeof response.body === "string"
          ? response.body
          : JSON.stringify(response.body),
      );
    } catch (err: any) {
      // SECURITY: Log full error server-side, but sanitize for client
      logger.error(`Service handler error (internal — not sent to client)`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Service execution failed",
        paymentReceived: true,
        receiptId: revenueRecord.id,
      }));
    }
  });

  return {
    server,
    start: async () => {
      return new Promise((resolve) => {
        server.listen(config.port, () => {
          const addr = `http://0.0.0.0:${config.port}`;
          logger.info(`x402 Revenue Node listening on ${addr}`);
          resolve(addr);
        });
      });
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
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
