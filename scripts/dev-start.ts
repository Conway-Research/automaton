#!/usr/bin/env npx tsx
/**
 * Zentience Devnet Startup
 *
 * Boots the full agent stack locally on Solana devnet:
 * - Generates or loads a dev wallet
 * - Initializes SQLite database
 * - Registers paid services in the ServiceRegistry
 * - Starts the x402 payment server
 * - Serves the frontend UI (proxied on same port)
 * - Connects everything together
 *
 * Usage:
 *   npx tsx scripts/dev-start.ts
 *
 * No Conway API key required — mocked for local development.
 */

import { Keypair, Connection, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import http from "http";
import bs58 from "bs58";
import { createDatabase } from "../src/state/database.js";
import { RevenueLedger } from "../src/revenue/revenue-ledger.js";
import { ServiceRegistry } from "../src/revenue/service-registry.js";
import { BountyBoard } from "../src/revenue/bounty-board.js";
import { createX402Server } from "../src/revenue/x402-server.js";
import type { ServiceEndpoint, ParsedRequest } from "../src/revenue/x402-server.js";
import { createLogger } from "../src/observability/logger.js";
import { handleRpcProxy } from "../src/security/rpc-proxy.js";
import { applySecurityHeaders } from "../src/security/headers.js";

const logger = createLogger("dev-start");

// ─── Configuration ────────────────────────────────────────────

const DEV_DIR = path.join(process.env.HOME || "/root", ".automaton-dev");
const WALLET_PATH = path.join(DEV_DIR, "wallet.json");
const DB_PATH = path.join(DEV_DIR, "state.db");
const NETWORK = "solana:devnet";
const X402_PORT = parseInt(process.env.X402_PORT || "4020", 10);
const UI_PORT = parseInt(process.env.PORT || "3000", 10);
const WEB_DIR = path.join(import.meta.dirname || __dirname, "../web");

// ─── Wallet Setup ─────────────────────────────────────────────

function loadOrCreateDevWallet(): Keypair {
  if (!fs.existsSync(DEV_DIR)) {
    fs.mkdirSync(DEV_DIR, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(WALLET_PATH)) {
    const data = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
    const secretKey = bs58.decode(data.secretKey);
    logger.info(`Loaded dev wallet: ${Keypair.fromSecretKey(secretKey).publicKey.toBase58()}`);
    return Keypair.fromSecretKey(secretKey);
  }

  const keypair = Keypair.generate();
  fs.writeFileSync(
    WALLET_PATH,
    JSON.stringify({
      secretKey: bs58.encode(keypair.secretKey),
      createdAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  logger.info(`Generated new dev wallet: ${keypair.publicKey.toBase58()}`);
  return keypair;
}

async function requestDevnetAirdrop(keypair: Keypair): Promise<void> {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  try {
    const balance = await connection.getBalance(keypair.publicKey);
    if (balance > 0.5 * LAMPORTS_PER_SOL) {
      logger.info(`Devnet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL (sufficient)`);
      return;
    }

    logger.info("Requesting devnet airdrop (2 SOL)...");
    const sig = await connection.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    const newBalance = await connection.getBalance(keypair.publicKey);
    logger.info(`Airdrop confirmed! Balance: ${(newBalance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  } catch (err: any) {
    logger.warn(`Airdrop failed (rate limited?): ${err.message}. Continuing anyway.`);
  }
}

// ─── Service Handlers ─────────────────────────────────────────

function createDevServices(serviceRegistry: ServiceRegistry): ServiceEndpoint[] {
  // Register services that the agent sells
  const askService = serviceRegistry.register({
    name: "Ask Zentience",
    description: "Ask the AI agent a question. Returns a generated response.",
    path: "/v1/ask",
    method: "POST",
    basePriceCents: 5,          // 5 cents per question
    estimatedCostCents: 2,      // ~2 cents inference cost
    minMargin: 0.5,
    maxPriceMultiplier: 10,
    active: true,
    category: "ai_inference",
  });

  const analyzeService = serviceRegistry.register({
    name: "Code Analysis",
    description: "Analyze code for bugs, security issues, and improvements.",
    path: "/v1/analyze",
    method: "POST",
    basePriceCents: 25,         // 25 cents per analysis
    estimatedCostCents: 10,
    minMargin: 0.5,
    maxPriceMultiplier: 5,
    active: true,
    category: "code_service",
  });

  const researchService = serviceRegistry.register({
    name: "Research Query",
    description: "Deep research on a topic with sourced summary.",
    path: "/v1/research",
    method: "POST",
    basePriceCents: 50,         // 50 cents per research query
    estimatedCostCents: 20,
    minMargin: 0.5,
    maxPriceMultiplier: 5,
    active: true,
    category: "research",
  });

  const statusService = serviceRegistry.register({
    name: "Agent Status",
    description: "Get the agent's current status, financial health, and service catalog.",
    path: "/v1/status",
    method: "GET",
    basePriceCents: 1,          // 1 cent
    estimatedCostCents: 0,
    minMargin: 0.5,
    maxPriceMultiplier: 5,
    active: true,
    category: "data_service",
  });

  // Build actual endpoint handlers
  const endpoints: ServiceEndpoint[] = [
    {
      path: "/v1/ask",
      method: "POST",
      priceCents: askService.basePriceCents,
      description: askService.description,
      maxPerHourPerPayer: 60,
      handler: async (req: ParsedRequest) => {
        let body: Record<string, unknown>;
        try { body = JSON.parse(req.body || "{}"); } catch { body = {}; }
        const question = (body.question || body.prompt || "Hello") as string;
        return {
          status: 200,
          body: {
            agent: "Zentience",
            question,
            response: `[DEV MODE] I received your question: "${question}". In production, this would route through the inference engine. Payment verified from ${req.payerAddress}.`,
            model: "dev-mock",
            paidWith: "x402",
            timestamp: new Date().toISOString(),
          },
        };
      },
    },
    {
      path: "/v1/analyze",
      method: "POST",
      priceCents: analyzeService.basePriceCents,
      description: analyzeService.description,
      maxPerHourPerPayer: 30,
      handler: async (req: ParsedRequest) => {
        let body: Record<string, unknown>;
        try { body = JSON.parse(req.body || "{}"); } catch { body = {}; }
        const code = (body.code || "// no code provided") as string;
        return {
          status: 200,
          body: {
            agent: "Zentience",
            analysis: {
              linesAnalyzed: code.split("\n").length,
              issues: [
                { severity: "info", message: "[DEV] Code analysis would run here" },
              ],
              summary: `Analyzed ${code.split("\n").length} lines. Production mode routes through inference engine.`,
            },
            paidWith: "x402",
            timestamp: new Date().toISOString(),
          },
        };
      },
    },
    {
      path: "/v1/research",
      method: "POST",
      priceCents: researchService.basePriceCents,
      description: researchService.description,
      maxPerHourPerPayer: 20,
      handler: async (req: ParsedRequest) => {
        let body: Record<string, unknown>;
        try { body = JSON.parse(req.body || "{}"); } catch { body = {}; }
        const topic = (body.topic || body.query || "AI agents") as string;
        return {
          status: 200,
          body: {
            agent: "Zentience",
            topic,
            research: {
              summary: `[DEV MODE] Research on "${topic}" would be generated here.`,
              sources: [],
              confidence: 0.0,
            },
            paidWith: "x402",
            timestamp: new Date().toISOString(),
          },
        };
      },
    },
    {
      path: "/v1/status",
      method: "GET",
      priceCents: statusService.basePriceCents,
      description: statusService.description,
      maxPerHourPerPayer: 120,
      handler: async (_req: ParsedRequest) => {
        return {
          status: 200,
          body: {
            agent: "Zentience",
            version: "0.3.0-devnet",
            state: "running",
            network: NETWORK,
            services: serviceRegistry.toCatalog(),
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
          },
        };
      },
    },
  ];

  return endpoints;
}

// ─── Combined Server (UI + x402 API) ─────────────────────────

function createCombinedServer(
  walletAddress: string,
  endpoints: ServiceEndpoint[],
  revenueLedger: RevenueLedger,
  bountyBoard: BountyBoard,
): http.Server {
  // Create the x402 payment server
  const x402 = createX402Server(
    {
      walletAddress,
      network: NETWORK,
      port: X402_PORT,
      maxPaymentAgeSec: 300,
      bannedAddresses: new Set(),
      rpcUrl: clusterApiUrl("devnet"),
      onRevenue: (record) => {
        // Record revenue in the ledger
        revenueLedger.recordRevenue({
          source: "x402_service",
          serviceEndpoint: record.serviceEndpoint,
          payerAddress: record.payerAddress,
          amountCents: record.amountCents,
          network: record.network,
          transactionSignature: record.transactionSignature,
          serviceCategory: "agent_task",
          token: record.token,
          tokenAmountRaw: record.tokenAmountRaw,
        });
      },
    },
    endpoints,
  );

  // Create a combined server: API requests go to x402, everything else serves the UI
  const combined = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${UI_PORT}`);
    const pathname = url.pathname;

    // Security headers on EVERY response
    applySecurityHeaders(res, { isApi: pathname.startsWith("/v1/") || pathname.startsWith("/api/") });

    // CORS for API routes
    if (pathname.startsWith("/v1/") || pathname.startsWith("/api/") || pathname === "/services" || pathname === "/health" || pathname === "/bounties") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── RPC Proxy ── SECURITY: Helius API key NEVER reaches the browser
    if (pathname === "/api/rpc") {
      await handleRpcProxy(req, res);
      return;
    }

    // /health — the frontend dashboard polls this for portfolio data
    if (pathname === "/health") {
      const revenueHealth = revenueLedger.getFinancialHealth(0);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "alive",
        endpoints: endpoints.length,
        walletAddress,
        network: NETWORK,
        creditBalance: 0, // No Conway credits in devnet mode
        revenueHealth,
        uptime: Math.floor(process.uptime()),
      }));
      return;
    }

    // /bounties — return open bounties
    if (pathname === "/bounties") {
      const open = bountyBoard.getOpenBounties();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(open));
      return;
    }

    // API routes → x402 payment server
    if (
      pathname.startsWith("/v1/") ||
      pathname === "/services" ||
      pathname === "/.well-known/services.json" ||
      pathname === "/.well-known/agent-card.json" ||
      pathname === "/agent-card.json"
    ) {
      x402.server.emit("request", req, res);
      return;
    }

    // ── Security: block sensitive path patterns ──
    const BLOCKED_PATTERNS = [
      /^\/\./,              // dotfiles (.git, .env, .cache, etc.)
      /^\/root\//,          // /root/ paths
      /^\/etc\//,           // /etc/ paths
      /^\/proc\//,          // /proc/ paths
      /^\/config\//,        // config directories
      /^\/wp-/,             // WordPress paths
      /^\/rest\//,          // REST API probes
      /^\/admin/,           // admin paths
      /^\/src\//,           // source code paths
      /^\/plugins\//,       // plugin paths
      /^\/webhooks\//,      // webhook paths
      /^\/oauth\//,         // oauth paths
      /^\/stripe/,          // payment credential probes
      /^\/payment/,         // payment paths
      /^\/graphql$/,        // graphql probes
      /^\/phpinfo/,         // php probes
      /^\/wp-json/,         // WordPress API
      /\.(php|cgi|asp|aspx|jsp|env|yml|yaml|bak|old|conf|log)$/i, // dangerous extensions
    ];

    if (BLOCKED_PATTERNS.some(p => p.test(pathname))) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Static file serving (UI)
    const MIME_TYPES: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".mp4": "video/mp4",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
    };

    let filePath = pathname === "/" ? "/index.html" : pathname;
    const fullPath = path.join(WEB_DIR, filePath);

    // Prevent path traversal
    if (!fullPath.startsWith(WEB_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const ext = path.extname(fullPath);

    // Try to serve the actual file
    if (ext && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
      });
      res.end(content);
      return;
    }

    // SPA fallback — ONLY for extensionless paths (client-side routes)
    // Paths with extensions that weren't found above are 404s
    if (ext) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Serve index.html for client-side route (e.g. /portfolio, /services)
    try {
      const index = fs.readFileSync(path.join(WEB_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  return combined;
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ███████╗███████╗███╗   ██╗████████╗██╗███████╗███╗   ██╗  ║
║   ╚══███╔╝██╔════╝████╗  ██║╚══██╔══╝██║██╔════╝████╗  ██║  ║
║     ███╔╝ █████╗  ██╔██╗ ██║   ██║   ██║█████╗  ██╔██╗ ██║  ║
║    ███╔╝  ██╔══╝  ██║╚██╗██║   ██║   ██║██╔══╝  ██║╚██╗██║  ║
║   ███████╗███████╗██║ ╚████║   ██║   ██║███████╗██║ ╚████║  ║
║   ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚══════╝╚═╝  ╚═══╝  ║
║                                                              ║
║   DEVNET MODE — Solana Devnet • x402 Revenue Node            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

  // 1. Wallet
  logger.info("=== WALLET ===");
  const keypair = loadOrCreateDevWallet();
  const walletAddress = keypair.publicKey.toBase58();
  logger.info(`Address: ${walletAddress}`);

  // 2. Devnet airdrop
  logger.info("\n=== DEVNET AIRDROP ===");
  await requestDevnetAirdrop(keypair);

  // 3. Database
  logger.info("\n=== DATABASE ===");
  const db = createDatabase(DB_PATH);
  db.setIdentity("name", "Zentience-Dev");
  db.setIdentity("address", walletAddress);
  db.setIdentity("network", NETWORK);
  logger.info(`Database: ${DB_PATH}`);

  // 4. Revenue engine
  logger.info("\n=== REVENUE ENGINE ===");
  const revenueLedger = new RevenueLedger(db.raw);
  const serviceRegistry = new ServiceRegistry();
  const bountyBoard = new BountyBoard(db.raw);
  logger.info("Revenue ledger + Service registry + Bounty board initialized.");

  // 5. Register services
  logger.info("\n=== SERVICES ===");
  const endpoints = createDevServices(serviceRegistry);
  for (const ep of endpoints) {
    logger.info(`  ${ep.method} ${ep.path} → ${ep.priceCents}¢ (${ep.description})`);
  }

  // 6. Start combined server (UI + x402)
  logger.info("\n=== STARTING SERVER ===");
  const server = createCombinedServer(walletAddress, endpoints, revenueLedger, bountyBoard);

  server.listen(UI_PORT, "0.0.0.0", () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ZENTIENCE DEVNET NODE — ONLINE                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Dashboard:  http://localhost:${String(UI_PORT).padEnd(5)}                          ║
║  x402 API:   http://localhost:${String(UI_PORT).padEnd(5)}/services                ║
║  Health:     http://localhost:${String(UI_PORT).padEnd(5)}/health                  ║
║  Status API: http://localhost:${String(UI_PORT).padEnd(5)}/api/status              ║
║                                                              ║
║  Wallet:     ${walletAddress}  ║
║  Network:    Solana Devnet                                   ║
║                                                              ║
║  Services:                                                   ║
║    POST /v1/ask      →  5¢  (Ask the AI)                     ║
║    POST /v1/analyze  → 25¢  (Code analysis)                  ║
║    POST /v1/research → 50¢  (Deep research)                  ║
║    GET  /v1/status   →  1¢  (Agent status)                   ║
║                                                              ║
║  Payment: USDC (devnet) via x402 protocol                    ║
║  Press Ctrl+C to stop                                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info("\nShutting down...");
    server.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
