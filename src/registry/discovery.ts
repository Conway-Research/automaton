/**
 * Agent Discovery (Solana)
 *
 * Discover other agents via Solana registry program queries.
 * Fetch and parse agent cards from URIs.
 */

import type {
  DiscoveredAgent,
  AgentCard,
  DiscoveryConfig,
  DiscoveredAgentCacheRow,
} from "../types.js";
import { DEFAULT_DISCOVERY_CONFIG } from "../types.js";
import { queryAgent, getTotalAgents, getRegisteredAgentsByEvents } from "./erc8004.js";
import crypto from "crypto";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("registry.discovery");

type Network = "mainnet" | "testnet";

const DISCOVERY_TIMEOUT_MS = 60_000;

/**
 * Compute SHA-256 hash for cache keys.
 */
function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ─── SSRF Protection ────────────────────────────────────────────

export function isInternalNetwork(hostname: string): boolean {
  const blocked = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^localhost$/i,
    /^0\./,
  ];
  return blocked.some(pattern => pattern.test(hostname));
}

export function isAllowedUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (!['https:', 'ipfs:'].includes(url.protocol)) return false;
    if (url.protocol === 'https:' && isInternalNetwork(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── Agent Card Validation ──────────────────────────────────────

const MAX_NAME_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SERVICE_NAME_LENGTH = 64;
const MAX_SERVICE_ENDPOINT_LENGTH = 512;
const MAX_SERVICES_COUNT = 20;

export function validateAgentCard(data: unknown): AgentCard | null {
  if (!data || typeof data !== 'object') return null;
  const card = data as Record<string, unknown>;

  if (typeof card.name !== 'string' || card.name.length === 0) return null;
  if (typeof card.type !== 'string' || card.type.length === 0) return null;

  if (card.name.length > MAX_NAME_LENGTH) {
    logger.error(`Agent card name too long: ${card.name.length} > ${MAX_NAME_LENGTH}`);
    return null;
  }

  if (card.address !== undefined && typeof card.address !== 'string') return null;

  if (card.description !== undefined) {
    if (typeof card.description !== 'string') return null;
    if (card.description.length > MAX_DESCRIPTION_LENGTH) {
      logger.error(`Agent card description too long: ${card.description.length}`);
      return null;
    }
  }

  if (card.services !== undefined) {
    if (!Array.isArray(card.services)) return null;
    if (card.services.length > MAX_SERVICES_COUNT) {
      logger.error(`Too many services: ${card.services.length}`);
      return null;
    }
    for (const svc of card.services) {
      if (!svc || typeof svc !== 'object') return null;
      if (typeof svc.name !== 'string' || svc.name.length > MAX_SERVICE_NAME_LENGTH) return null;
      if (typeof svc.endpoint !== 'string' || svc.endpoint.length > MAX_SERVICE_ENDPOINT_LENGTH) return null;
    }
  }

  return card as unknown as AgentCard;
}

// ─── Agent Card Cache ───────────────────────────────────────────

function getCachedCard(
  db: import("better-sqlite3").Database | undefined,
  agentAddress: string,
): AgentCard | null {
  if (!db) return null;
  try {
    const row = db.prepare(
      "SELECT agent_card, valid_until FROM discovered_agents_cache WHERE agent_address = ?",
    ).get(agentAddress) as { agent_card: string; valid_until: string | null } | undefined;
    if (!row) return null;

    if (row.valid_until && new Date(row.valid_until).getTime() < Date.now()) {
      return null;
    }

    return JSON.parse(row.agent_card) as AgentCard;
  } catch {
    return null;
  }
}

function setCachedCard(
  db: import("better-sqlite3").Database | undefined,
  agentAddress: string,
  card: AgentCard,
  fetchedFrom: string,
  ttlMs: number = 3_600_000,
): void {
  if (!db) return;
  try {
    const now = new Date().toISOString();
    const validUntil = new Date(Date.now() + ttlMs).toISOString();
    const cardJson = JSON.stringify(card);
    const cardHash = sha256Hex(cardJson);

    db.prepare(
      `INSERT INTO discovered_agents_cache
       (agent_address, agent_card, fetched_from, card_hash, valid_until, fetch_count, last_fetched_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(agent_address) DO UPDATE SET
         agent_card = excluded.agent_card,
         fetched_from = excluded.fetched_from,
         card_hash = excluded.card_hash,
         valid_until = excluded.valid_until,
         fetch_count = fetch_count + 1,
         last_fetched_at = excluded.last_fetched_at`,
    ).run(agentAddress, cardJson, fetchedFrom, cardHash, validUntil, now, now);
  } catch (error) {
    logger.error("Cache write failed:", error instanceof Error ? error : undefined);
  }
}

// ─── Discovery ──────────────────────────────────────────────────

async function enrichAgentWithCard(
  agent: DiscoveredAgent,
  cfg: DiscoveryConfig,
  db?: import("better-sqlite3").Database,
): Promise<void> {
  try {
    const cacheKey = agent.owner || agent.agentId;
    let card = getCachedCard(db, cacheKey);
    if (!card) {
      card = await fetchAgentCard(agent.agentURI, cfg);
      if (card && db) {
        setCachedCard(db, cacheKey, card, agent.agentURI);
      }
    }
    if (card) {
      agent.name = card.name;
      agent.description = card.description;
    }
  } catch (error) {
    logger.error("Card fetch failed:", error instanceof Error ? error : undefined);
  }
}

export async function discoverAgents(
  limit: number = 20,
  network: Network = "mainnet",
  config?: Partial<DiscoveryConfig>,
  db?: import("better-sqlite3").Database,
  rpcUrl?: string,
): Promise<DiscoveredAgent[]> {
  const cfg = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
  const total = await getTotalAgents(network, rpcUrl);
  const agents: DiscoveredAgent[] = [];

  const overallStart = Date.now();

  if (total > 0) {
    // Use program account scanning
    const eventAgents = await getRegisteredAgentsByEvents(network, Math.min(limit, cfg.maxScanCount), rpcUrl);

    for (const { tokenId, owner } of eventAgents) {
      if (Date.now() - overallStart > DISCOVERY_TIMEOUT_MS) {
        logger.warn("Overall discovery timeout reached (60s), returning partial results");
        break;
      }

      try {
        const agent = await queryAgent(tokenId, network, rpcUrl);
        if (agent) {
          if (!agent.owner && owner) {
            agent.owner = owner;
          }
          await enrichAgentWithCard(agent, cfg, db);
          agents.push(agent);
        }
      } catch (error) {
        logger.error(`Agent query failed for ${tokenId}:`, error instanceof Error ? error : undefined);
      }
    }
  }

  return agents;
}

export async function fetchAgentCard(
  uri: string,
  config?: Partial<DiscoveryConfig>,
): Promise<AgentCard | null> {
  const cfg = { ...DEFAULT_DISCOVERY_CONFIG, ...config };

  // Handle data: URIs inline
  if (uri.startsWith("data:application/json,") || uri.startsWith("data:application/json;")) {
    try {
      let json: string;
      if (uri.includes(";base64,")) {
        const b64 = uri.split(";base64,")[1];
        json = Buffer.from(b64, "base64").toString("utf-8");
      } else {
        json = decodeURIComponent(uri.substring(uri.indexOf(",") + 1));
      }
      if (json.length > cfg.maxCardSizeBytes) {
        logger.error(`data: URI agent card too large: ${json.length} bytes`);
        return null;
      }
      const data = JSON.parse(json);
      return validateAgentCard(data);
    } catch (error) {
      logger.error("data: URI parse failed:", error instanceof Error ? error : undefined);
      return null;
    }
  }

  if (!isAllowedUri(uri)) {
    logger.error(`Blocked URI (SSRF protection): ${uri}`);
    return null;
  }

  try {
    let fetchUrl = uri;
    if (uri.startsWith("ipfs://")) {
      fetchUrl = `${cfg.ipfsGateway}/ipfs/${uri.slice(7)}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.fetchTimeoutMs);

    try {
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > cfg.maxCardSizeBytes) {
        logger.error(`Agent card too large: ${contentLength} bytes`);
        return null;
      }

      const text = await response.text();
      if (text.length > cfg.maxCardSizeBytes) {
        logger.error(`Agent card too large: ${text.length} bytes`);
        return null;
      }

      const data = JSON.parse(text);
      return validateAgentCard(data);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    logger.error("Agent card fetch failed:", error instanceof Error ? error : undefined);
    return null;
  }
}

export async function searchAgents(
  keyword: string,
  limit: number = 10,
  network: Network = "mainnet",
  config?: Partial<DiscoveryConfig>,
  db?: import("better-sqlite3").Database,
  rpcUrl?: string,
): Promise<DiscoveredAgent[]> {
  const all = await discoverAgents(50, network, config, db, rpcUrl);
  const lower = keyword.toLowerCase();

  return all
    .filter(
      (a) =>
        a.name?.toLowerCase().includes(lower) ||
        a.description?.toLowerCase().includes(lower) ||
        a.owner.toLowerCase().includes(lower),
    )
    .slice(0, limit);
}
